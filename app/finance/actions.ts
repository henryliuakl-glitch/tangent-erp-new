"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { incrementStudentBalance } from "@/lib/student-balance";
import { startOfWeek, endOfWeek, format, eachDayOfInterval } from "date-fns";
import { formatInTimeZone } from "date-fns-tz";
import { aggregateByCurrency, DEFAULT_CURRENCY, normalizeCurrency } from "@/lib/currency";
import { getNzMonthBounds, getTodayInNZ, nzStartOfDayUtc, nzEndOfDayUtc, TZ_NZ } from "@/lib/timezone";
import { insertTransaction, updateTransactionRow } from "@/lib/transaction-write";
import { isPendingReimbursementTx } from "@/lib/reimbursement";
import { isDrivingSchoolBusiness } from "@/lib/business";
import { isIncomeSource } from "@/lib/income-source";

/** 流水/时间戳 → NZ 日历日 YYYY-MM-DD */
function toNzCalendarDay(value: string | null | undefined): string {
  if (!value) return "";
  const raw = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return raw.slice(0, 10);
  return formatInTimeZone(d, TZ_NZ, "yyyy-MM-dd");
}

// 1. 创建流水
export async function createTransaction(prevState: any, formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "未登录" };

  const type = formData.get("type");
  const amount = formData.get("amount");
  const category = formData.get("category");
  const description = formData.get("description");
  const date = formData.get("date") as string;
  const businessId = formData.get("businessId");
  const proofUrl = formData.get("proofUrl") as string;
  const currency = normalizeCurrency(formData.get("currency") as string);
  const rawIncomeSource = formData.get("incomeSource") as string;
  const incomeSource = isIncomeSource(rawIncomeSource) ? rawIncomeSource : null;
  
  const studentId = formData.get("studentId") as string;
  const hoursToAdd = Number(formData.get("hoursToAdd"));

  if (hoursToAdd < 0 || !Number.isFinite(hoursToAdd)) {
    return { error: "课时必须是有效的非负数" };
  }

  const txResult = await insertTransaction(supabase, {
    type,
    amount: Number(amount),
    category,
    description,
    transaction_date: date,
    business_unit_id: businessId,
    proof_img_url: proofUrl || null,
    created_by: user.id,
    student_id: studentId || null,
    quantity: hoursToAdd > 0 ? hoursToAdd : null,
    currency,
    income_source: type === "income" ? incomeSource : null,
  });

  if (txResult.error) return { error: txResult.error };

  if (studentId && hoursToAdd > 0 && type === "income" && !isDrivingSchoolBusiness(String(businessId || ""))) {
    const balanceRes = await incrementStudentBalance(supabase, studentId, hoursToAdd);
    if (balanceRes.error) {
      if (txResult.id) {
        await supabase.from("transactions").delete().eq("id", txResult.id);
      }
      return { error: `课时更新失败，流水已回滚：${balanceRes.error}` };
    }
  }

  revalidatePath("/finance");
  revalidatePath("/");
  revalidatePath("/students");
  return { success: true };
}

// 2. 删除流水 (带回滚逻辑)
export async function deleteTransaction(id: string) {
  const supabase = await createClient();

  const { data: tx, error: fetchError } = await supabase
    .from("transactions")
    .select("id, student_id, quantity, type, category, description, business_unit_id")
    .eq("id", id)
    .single();

  if (fetchError || !tx) return { error: "流水不存在" };

  const quantity = Number(tx.quantity);
  const isDriving = isDrivingSchoolBusiness(tx.business_unit_id);
  let balanceEffect = 0;

  if (!isDriving && tx.student_id && Number.isFinite(quantity) && quantity !== 0 && tx.category === "Tuition") {
    if (tx.type === "income") {
      balanceEffect = Math.abs(quantity);
    } else if (tx.type === "expense" && String(tx.description || "").includes("[退课退款]")) {
      balanceEffect = -Math.abs(quantity);
    } else if (tx.type === "adjustment") {
      balanceEffect = quantity;
    }
  }

  // 先回滚这条流水曾经对课时造成的影响；若删除失败，再把课时补回原状。
  if (balanceEffect !== 0 && tx.student_id) {
    const balanceRes = await incrementStudentBalance(supabase, tx.student_id, -balanceEffect);
    if (balanceRes.error) return { error: balanceRes.error };
  }

  const { error } = await supabase.from("transactions").delete().eq("id", id);

  if (error) {
    if (balanceEffect !== 0 && tx.student_id) {
      const compensate = await incrementStudentBalance(supabase, tx.student_id, balanceEffect);
      if (compensate.error) {
        return { error: `删除流水失败，且课时补偿失败，请立即人工核对：${error.message}; ${compensate.error}` };
      }
    }
    return { error: error.message };
  }

  revalidatePath("/finance");
  revalidatePath("/students");
  revalidatePath("/");
  return { success: true };
}

// 3. 编辑流水
export async function updateTransaction(
  id: string, 
  data: { amount: number; category: string; description: string; date: string; type: string; currency?: string }
) {
  const supabase = await createClient();
  
  const { error } = await updateTransactionRow(supabase, id, {
    amount: data.amount,
    category: data.category,
    description: data.description,
    transaction_date: data.date,
    type: data.type,
    ...(data.currency ? { currency: normalizeCurrency(data.currency) } : {}),
  });

  if (error) return { error };
  revalidatePath("/finance");
  revalidatePath("/");
  return { success: true };
}

// 4. 获取概览 — 双币种独立汇总；「本月」与 Dashboard 共用 NZT 月界
export async function getFinanceStats(businessId: string, range: string) {
  const supabase = await createClient();
  const now = new Date();
  let startStr: string;
  let endStr: string;
  let startDate: Date;
  let endDate: Date;

  switch (range) {
    case "week": {
      startDate = startOfWeek(now, { weekStartsOn: 1 });
      endDate = endOfWeek(now, { weekStartsOn: 1 });
      startStr = startDate.toISOString();
      endStr = endDate.toISOString();
      break;
    }
    case "month": {
      const bounds = getNzMonthBounds(0);
      // 半开区间 [月初, 下月1日)：兼容 DATE 与 timestamptz 两种存法
      startStr = bounds.startDate;
      endStr = bounds.nextMonthStart;
      startDate = new Date(bounds.startIso);
      endDate = new Date(bounds.endIso);
      break;
    }
    case "prev_month": {
      const bounds = getNzMonthBounds(-1);
      startStr = bounds.startDate;
      endStr = bounds.nextMonthStart;
      startDate = new Date(bounds.startIso);
      endDate = new Date(bounds.endIso);
      break;
    }
    case "3months": {
      const endBounds = getNzMonthBounds(0);
      const startBounds = getNzMonthBounds(-2);
      startStr = startBounds.startDate;
      endStr = endBounds.nextMonthStart;
      startDate = new Date(startBounds.startIso);
      endDate = new Date(endBounds.endIso);
      break;
    }
    case "year": {
      const todayNz = getTodayInNZ();
      const y = Number(todayNz.slice(0, 4));
      startStr = `${y}-01-01`;
      endStr = `${y + 1}-01-01`;
      startDate = nzStartOfDayUtc(`${y}-01-01`);
      endDate = nzEndOfDayUtc(`${y}-12-31`);
      break;
    }
    default: {
      const bounds = getNzMonthBounds(0);
      startStr = bounds.startDate;
      endStr = bounds.nextMonthStart;
      startDate = new Date(bounds.startIso);
      endDate = new Date(bounds.endIso);
    }
  }

  // 流水查询：按 business_unit_id 隔离；月界用半开区间，兼容 DATE / timestamptz
  // select *：避免因 currency 等列尚未迁移导致整查询失败 → 空数组 → 净现金流 $0
  let txQuery = supabase
    .from("transactions")
    .select("*")
    .eq("business_unit_id", businessId)
    .order("transaction_date", { ascending: false });

  txQuery =
    range === "week"
      ? txQuery.gte("transaction_date", startStr).lte("transaction_date", endStr)
      : txQuery.gte("transaction_date", startStr).lt("transaction_date", endStr);

  const bookingStartIso = range === "week" ? startStr : startDate.toISOString();
  const bookingEndIso = range === "week" ? endStr : endDate.toISOString();

  const [transactionsRes, bookingsPrimary, pendingRes] = await Promise.all([
    txQuery,
    supabase
      .from("bookings")
      .select(`start_time, duration, actual_rate, student:students(hourly_rate, currency)`)
      .eq("business_unit_id", businessId)
      .eq("status", "completed")
      .gte("start_time", bookingStartIso)
      .lte("start_time", bookingEndIso),
    supabase
      .from("transactions")
      .select("amount, currency, description")
      .eq("business_unit_id", businessId)
      .ilike("description", "%[报销待打款]%"),
  ]);

  let bookings: any[] = bookingsPrimary.data || [];

  // 若显式关联 currency 失败，回退不带 student.currency
  if (bookingsPrimary.error) {
    console.error("[getFinanceStats] bookings error, retry without currency:", bookingsPrimary.error.message);
    const bookingsFallback = await supabase
      .from("bookings")
      .select(`start_time, duration, actual_rate, student:students(hourly_rate)`)
      .eq("business_unit_id", businessId)
      .eq("status", "completed")
      .gte("start_time", bookingStartIso)
      .lte("start_time", bookingEndIso);
    bookings = bookingsFallback.data || [];
  }

  if (transactionsRes.error) {
    console.error("[getFinanceStats] transactions error:", transactionsRes.error.message, {
      businessId,
      range,
      startStr,
      endStr,
    });
  }

  // 再按 NZ 日历日收紧，防止 DATE/timestamptz 边界漏数或串月
  const monthStartDay =
    range === "week" ? "" : formatInTimeZone(startDate, TZ_NZ, "yyyy-MM-dd");
  const monthEndDay =
    range === "week" ? "" : formatInTimeZone(endDate, TZ_NZ, "yyyy-MM-dd");

  let transactions = transactionsRes.data || [];
  if (monthStartDay && monthEndDay) {
    transactions = transactions.filter((t) => {
      const day = toNzCalendarDay(t.transaction_date);
      return day >= monthStartDay && day <= monthEndDay;
    });
  }

  const pendingReimburse = (pendingRes.data || []).filter((t) =>
    isPendingReimbursementTx(t.description)
  );
  transactions = transactions.filter((t) => !isPendingReimbursementTx(t.description));
  const pendingReimburseByCurrency = aggregateByCurrency(
    pendingReimburse.map((t) => ({ ...t, type: "expense" }))
  );
  
  const byCurrency = aggregateByCurrency(transactions);
  const income = byCurrency.NZD.income;
  const expense = byCurrency.NZD.expense;
  let realized = 0;
  let realizedRmb = 0;

  bookings.forEach((b: any) => {
    const rate = Number(b.actual_rate ?? b.student?.hourly_rate ?? 70);
    const value = Number(b.duration) * rate;
    if (normalizeCurrency(b.student?.currency) === "RMB") realizedRmb += value;
    else realized += value;
  });

  const daysInterval = eachDayOfInterval({ start: startDate, end: endDate });
  const chartData = daysInterval.map(day => {
    const dateStr = format(day, 'yyyy-MM-dd');
    let dailyIncome = 0;
    let dailyExpense = 0;
    let dailyRealized = 0;
    let dailyIncomeRmb = 0;
    let dailyExpenseRmb = 0;

    transactions.forEach(t => {
      if (String(t.transaction_date).startsWith(dateStr)) {
        const cur = normalizeCurrency(t.currency);
        const amt = Number(t.amount);
        if (cur === "RMB") {
          if (t.type === 'income') dailyIncomeRmb += amt;
          else if (t.type === 'expense') dailyExpenseRmb += Math.abs(amt);
        } else {
          if (t.type === 'income') dailyIncome += amt;
          else if (t.type === 'expense') dailyExpense += Math.abs(amt);
        }
      }
    });

    bookings.forEach((b: any) => {
      if (String(b.start_time).startsWith(dateStr)) {
        const rate = Number(b.actual_rate ?? b.student?.hourly_rate ?? 70);
        dailyRealized += Number(b.duration) * rate;
      }
    });

    return {
      date: format(day, ['year', '3months'].includes(range) ? 'MM-dd' : 'dd'),
      fullDate: dateStr,
      income: dailyIncome,
      expense: dailyExpense,
      incomeRmb: dailyIncomeRmb,
      expenseRmb: dailyExpenseRmb,
      realized: dailyRealized,
      net: dailyIncome - dailyExpense,
      netRmb: dailyIncomeRmb - dailyExpenseRmb,
    };
  });

  return {
    income,
    expense,
    net: income - expense,
    realized,
    realizedRmb,
    byCurrency,
    transactions,
    chartData,
    defaultCurrency: DEFAULT_CURRENCY,
    pendingReimburseCount: pendingReimburse.length,
    pendingReimburseNzd: pendingReimburseByCurrency.NZD.expense,
    pendingReimburseRmb: pendingReimburseByCurrency.RMB.expense,
  };
}
