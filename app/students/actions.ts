"use server";



import { createClient } from "@/lib/supabase/server";

import { revalidatePath } from "next/cache";

import { incrementStudentBalance } from "@/lib/student-balance";

import { roundHours } from "@/lib/utils";

import { DEFAULT_CURRENCY, normalizeCurrency, type Currency } from "@/lib/currency";
import { insertTransaction } from "@/lib/transaction-write";
import { isIncomeSource } from "@/lib/income-source";







// 1. 创建学员 (Create)

export async function createStudent(prevState: any, formData: FormData) {

  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();

  if (!user) return { error: "用户未登录" };

  

  const name = formData.get("name") as string;

  const studentCode = formData.get("studentId") as string; 

  const subject = formData.get("subject") as string;

  const teacher = formData.get("teacher") as string;

  const businessId = formData.get("businessId") as string;

  const level = (formData.get("level") as string) || "Year 11"; 

  const hourlyRate = Number(formData.get("hourlyRate")) || 70;

  const initialBalance = Number(formData.get("balance")) || 0;

  if (!Number.isFinite(initialBalance) || initialBalance < 0) {
    return { error: "初始课时必须是有效的非负数" };
  }

  const paymentType = (formData.get("paymentType") as string) || "monthly";

  const currency = normalizeCurrency(formData.get("currency") as string);
  const rawIncomeSource = formData.get("incomeSource") as string;
  const incomeSource = isIncomeSource(rawIncomeSource) ? rawIncomeSource : null;



  if (!name || !businessId) return { error: "姓名必填" };



  // 插入学员

  const { data: newStudent, error: studentError } = await supabase.from("students").insert({

    name,

    student_code: studentCode, 

    subject,

    teacher,

    level, 

    hourly_rate: hourlyRate,

    balance: 0,

    payment_type: paymentType,

    currency,
    income_source: incomeSource,

    business_unit_id: businessId,

  }).select().single();



  if (studentError) return { error: studentError.message };



  // 初始课时与流水必须成对成功；任一步失败都回滚，避免新学员一开始就出现账实不符。
  if (initialBalance > 0 && newStudent?.id) {
    const balanceRes = await incrementStudentBalance(supabase, newStudent.id, initialBalance);
    if (balanceRes.error) {
      await supabase.from("students").delete().eq("id", newStudent.id);
      return { error: `初始课时写入失败：${balanceRes.error}` };
    }

    const amount = initialBalance * hourlyRate;
    const txRes = await insertTransaction(supabase, {
      type: "income",
      amount,
      category: "Tuition",
      description: `初始充值: [${studentCode || '无学号'}] ${name} (+${initialBalance}课时)`,
      transaction_date: new Date().toISOString(),
      business_unit_id: businessId,
      created_by: user.id,
      student_id: newStudent.id,
      quantity: initialBalance,
      currency,
      income_source: incomeSource,
    });

    if (txRes.error) {
      await incrementStudentBalance(supabase, newStudent.id, -initialBalance);
      await supabase.from("students").delete().eq("id", newStudent.id);
      return { error: `初始充值流水写入失败，已回滚学员创建：${txRes.error}` };
    }
  }



  revalidatePath("/students");

  revalidatePath("/");

  return { success: true };

}





// 2. 更新学员 (Update) — 支持管理员 targetBalance 强行校正

export async function updateStudent(id: string, data: {

  name?: string;

  studentCode?: string;

  subject?: string;

  teacher?: string;

  level?: string;

  hourlyRate?: number;

  targetBalance?: number;

  paymentType?: string;

  currency?: Currency | string;
  incomeSource?: string | null;

}) {

  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();

  if (!user) return { error: "用户未登录" };



  const { data: current, error: fetchError } = await supabase

    .from("students")

    .select("balance, name, student_code, business_unit_id")

    .eq("id", id)

    .single();



  if (fetchError || !current) return { error: "找不到学员" };



  const currentBalance = Number(current.balance);



  if (data.targetBalance !== undefined && data.targetBalance !== null) {

    if (!Number.isFinite(Number(data.targetBalance))) {
      return { error: "目标课时必须是有效数字" };
    }

    const targetBalance = roundHours(Number(data.targetBalance));

    const diff = roundHours(targetBalance - currentBalance);



    if (diff !== 0) {

      const balanceRes = await incrementStudentBalance(supabase, id, diff);

      if (balanceRes.error) return { error: balanceRes.error };



      const txRes = await insertTransaction(supabase, {
        type: "adjustment",
        amount: 0,
        category: "Tuition",
        description: `[系统调账] 管理员手动校正总课时：由 ${currentBalance} 修正为 ${targetBalance}，差额 ${diff} 课时`,
        transaction_date: new Date().toISOString(),
        business_unit_id: current.business_unit_id,
        created_by: user.id,
        student_id: id,
        quantity: diff,
        currency: DEFAULT_CURRENCY,
      });

      if (txRes.error) {
        const compensate = await incrementStudentBalance(supabase, id, -diff);
        if (compensate.error) {
          return { error: `调账流水失败且课时补偿失败，请立即人工核对：${txRes.error}; ${compensate.error}` };
        }
        return { error: `调账流水写入失败，课时已回滚：${txRes.error}` };
      }

    }

  }



  const { error } = await supabase

    .from("students")

    .update({

      name: data.name,

      student_code: data.studentCode,

      subject: data.subject,

      teacher: data.teacher,

      level: data.level,

      hourly_rate: data.hourlyRate,

      ...(data.paymentType !== undefined ? { payment_type: data.paymentType } : {}),

      ...(data.currency !== undefined ? { currency: normalizeCurrency(data.currency) } : {}),
      ...(data.incomeSource !== undefined
        ? { income_source: isIncomeSource(data.incomeSource) ? data.incomeSource : null }
        : {}),

    })

    .eq("id", id);



  if (error) return { error: error.message };



  revalidatePath("/students");

  revalidatePath(`/students/${id}`);

  revalidatePath("/finance");

  revalidatePath("/");

  return { success: true };

}



// 3. 删除学员 (Delete) — 先解除关联，避免外键约束失败

export async function deleteStudent(studentId: string) {

  const supabase = await createClient();

  // A. 清理排课：优先删除未完成；已完成课解除关联以保留课表痕迹（若列非空则整表删除该学员排课）
  const { error: openBookingErr } = await supabase
    .from("bookings")
    .delete()
    .eq("student_id", studentId)
    .neq("status", "completed");

  if (openBookingErr) return { error: openBookingErr.message };

  const { error: completedNullErr } = await supabase
    .from("bookings")
    .update({ student_id: null })
    .eq("student_id", studentId);

  if (completedNullErr) {
    // student_id 若为 NOT NULL，则删除剩余排课
    const { error: restDelErr } = await supabase
      .from("bookings")
      .delete()
      .eq("student_id", studentId);
    if (restDelErr) return { error: restDelErr.message };
  }

  // B. 保留财务历史：仅解除 transactions.student_id
  const { error: txErr } = await supabase
    .from("transactions")
    .update({ student_id: null })
    .eq("student_id", studentId);

  if (txErr) return { error: txErr.message };

  // C. 删除学员本体
  const { error } = await supabase.from("students").delete().eq("id", studentId);

  if (error) return { error: error.message };

  revalidatePath("/students");
  revalidatePath("/bookings");
  revalidatePath("/finance");
  revalidatePath("/");

  return { success: true };

}



// 4. 学员充值 (Top Up) — currency 仅影响对应流水轨道，课时余额与币种无关

export async function topUpStudent(
  studentId: string,
  hoursToAdd: number,
  currency?: Currency | string
) {

  const supabase = await createClient();

  if (!Number.isFinite(hoursToAdd) || hoursToAdd <= 0) {
    return { error: "充值课时必须大于 0" };
  }

  const { data: { user } } = await supabase.auth.getUser();

  if (!user) return { error: "用户未登录" };



  const { data: student, error: fetchError } = await supabase

    .from("students")

    .select("name, student_code, balance, hourly_rate, business_unit_id, currency, income_source")

    .eq("id", studentId)

    .single();



  if (fetchError || !student) return { error: "找不到学员" };

  const txCurrency = normalizeCurrency(currency ?? student.currency ?? DEFAULT_CURRENCY);



  const balanceRes = await incrementStudentBalance(supabase, studentId, hoursToAdd);

  if (balanceRes.error) return { error: balanceRes.error };



  if (hoursToAdd > 0) {

    const incomeAmount = hoursToAdd * (student.hourly_rate || 70);

    const desc = `学员充值: [${student.student_code || '无学号'}] ${student.name} (+${hoursToAdd}课时)`;

    const txRes = await insertTransaction(supabase, {
      type: "income",
      amount: incomeAmount,
      category: "Tuition",
      description: desc,
      transaction_date: new Date().toISOString(),
      business_unit_id: student.business_unit_id,
      created_by: user.id,
      student_id: studentId,
      quantity: hoursToAdd,
      currency: txCurrency,
      income_source: isIncomeSource(student.income_source) ? student.income_source : null,
    });

    if (txRes.error) {
      const compensate = await incrementStudentBalance(supabase, studentId, -hoursToAdd);
      if (compensate.error) {
        return { error: `充值流水失败且课时补偿失败，请立即人工核对：${txRes.error}; ${compensate.error}` };
      }
      return { error: `充值流水写入失败，课时已回滚：${txRes.error}` };
    }

  }



  revalidatePath(`/students/${studentId}`);

  revalidatePath("/students");

  revalidatePath("/");

  return { success: true };

}



// 5. 退课退款 (Refund)

export async function refundStudent(studentId: string, hoursToSubtract: number) {

  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();

  if (!user) return { error: "用户未登录" };



  if (!hoursToSubtract || hoursToSubtract <= 0) {

    return { error: "退课课时必须大于 0" };

  }



  const { data: student, error: fetchError } = await supabase

    .from("students")

    .select("name, student_code, balance, hourly_rate, business_unit_id, currency")

    .eq("id", studentId)

    .single();



  if (fetchError || !student) return { error: "找不到学员" };



  if (Number(student.balance) < hoursToSubtract) {

    return { error: `余额不足，当前剩余 ${student.balance} 课时` };

  }



  const balanceRes = await incrementStudentBalance(supabase, studentId, -hoursToSubtract);

  if (balanceRes.error) return { error: balanceRes.error };



  const hourlyRate = student.hourly_rate || 70;

  const refundAmount = hoursToSubtract * hourlyRate;



  const txRes = await insertTransaction(supabase, {
    type: "expense",
    amount: refundAmount,
    category: "Tuition",
    description: `[退课退款] 扣除学员 ${student.name} ${hoursToSubtract} 课时`,
    transaction_date: new Date().toISOString(),
    business_unit_id: student.business_unit_id,
    created_by: user.id,
    student_id: studentId,
    quantity: hoursToSubtract,
    currency: normalizeCurrency(student.currency),
  });

  if (txRes.error) {
    const compensate = await incrementStudentBalance(supabase, studentId, hoursToSubtract);
    if (compensate.error) {
      return { error: `退款流水失败且课时补偿失败，请立即人工核对：${txRes.error}; ${compensate.error}` };
    }
    return { error: `退款流水写入失败，课时已回滚：${txRes.error}` };
  }



  revalidatePath(`/students/${studentId}`);

  revalidatePath("/students");

  revalidatePath("/finance");

  revalidatePath("/");

  return { success: true };

}



// 6. 获取单个学员的完整历史 (消费 & 充值)

export async function getStudentHistory(studentId: string) {

  const supabase = await createClient();



  const { data: bookings } = await supabase

    .from("bookings")

    .select("*")

    .eq("student_id", studentId)

    .order("start_time", { ascending: false });



  const { data: transactions } = await supabase

    .from("transactions")

    .select("*")

    .eq("student_id", studentId)

    .order("transaction_date", { ascending: false });



  return { bookings, transactions };

}

