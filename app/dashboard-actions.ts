"use server";

import { createClient } from "@/lib/supabase/server";
import { isPaymentAlert, isPrepaid } from "@/lib/student-payment";
import { emptyDualTotals, normalizeCurrency } from "@/lib/currency";
import { getNzMonthBounds } from "@/lib/timezone";

function scopeFilter(businessId: string) {
  return businessId === "tangent" ? ["cus", "sine"] : [businessId || "cus"];
}

/**
 * 首页 KPI：只做本月现金 / Realized / 预收负债 / 课时提醒。
 * 不再夹带日历大查询，确保工作台核心指标先快速返回。
 */
export async function getDashboardStats(businessId: string) {
  const resolvedBusinessId = businessId || "cus";
  const supabase = await createClient();
  const { startIso, endIso, startDate, nextMonthStart } = getNzMonthBounds(0);
  const units = scopeFilter(resolvedBusinessId);

  let txQuery = supabase
    .from("transactions")
    .select("type,amount,currency,transaction_date,business_unit_id")
    .gte("transaction_date", startDate)
    .lt("transaction_date", nextMonthStart);

  let completedQuery = supabase
    .from("bookings")
    .select("start_time,duration,actual_rate,business_unit_id,student_id")
    .eq("status", "completed")
    .gte("start_time", startIso)
    .lt("start_time", endIso);

  let studentsQuery = supabase
    .from("students")
    .select("id,name,balance,hourly_rate,payment_type,currency,business_unit_id");

  if (resolvedBusinessId === "tangent") {
    txQuery = txQuery.in("business_unit_id", units);
    completedQuery = completedQuery.in("business_unit_id", units);
    studentsQuery = studentsQuery.in("business_unit_id", units);
  } else {
    txQuery = txQuery.eq("business_unit_id", resolvedBusinessId);
    completedQuery = completedQuery.eq("business_unit_id", resolvedBusinessId);
    studentsQuery = studentsQuery.eq("business_unit_id", resolvedBusinessId);
  }

  const [transactionsRes, completedRes, studentsRes] = await Promise.all([
    txQuery,
    completedQuery,
    studentsQuery,
  ]);

  if (transactionsRes.error) {
    console.error("[getDashboardStats] transactions error:", transactionsRes.error.message);
  }
  if (completedRes.error) {
    console.error("[getDashboardStats] completed bookings error:", completedRes.error.message);
  }
  if (studentsRes.error) {
    console.error("[getDashboardStats] students error:", studentsRes.error.message);
  }

  let cashIncome = 0;
  let cashExpense = 0;
  let cashIncomeRmb = 0;
  let cashExpenseRmb = 0;

  for (const tx of transactionsRes.data || []) {
    const amount = Number(tx.amount || 0);
    const currency = normalizeCurrency(tx.currency);

    if (currency === "RMB") {
      if (tx.type === "income") cashIncomeRmb += amount;
      else if (tx.type === "expense") cashExpenseRmb += Math.abs(amount);
    } else {
      if (tx.type === "income") cashIncome += amount;
      else if (tx.type === "expense") cashExpense += Math.abs(amount);
    }
  }

  const students = studentsRes.data || [];
  const studentsById = new Map(students.map((student: any) => [student.id, student]));

  let realizedRevenue = 0;
  let realizedRevenueRmb = 0;

  for (const booking of completedRes.data || []) {
    const student: any = booking.student_id ? studentsById.get(booking.student_id) : null;
    const rate = Number(booking.actual_rate ?? student?.hourly_rate ?? 70);
    const value = Number(booking.duration || 0) * rate;
    const currency = normalizeCurrency(student?.currency);

    if (currency === "RMB") realizedRevenueRmb += value;
    else realizedRevenue += value;
  }

  let unearnedRevenue = 0;
  let unearnedRevenueRmb = 0;
  const lowBalanceStudents: any[] = [];

  for (const student of students) {
    const balance = Number(student.balance || 0);
    const rate = Number(student.hourly_rate || 0);

    if (isPrepaid(student.payment_type) && balance > 0) {
      const value = balance * rate;
      if (normalizeCurrency(student.currency) === "RMB") unearnedRevenueRmb += value;
      else unearnedRevenue += value;
    }

    if (
      isPaymentAlert(
        balance,
        student.payment_type,
        { businessUnitId: student.business_unit_id },
        0
      )
    ) {
      lowBalanceStudents.push({ ...student, scheduledHours: 0 });
    }
  }

  const byCurrency = emptyDualTotals();
  byCurrency.NZD.income = cashIncome;
  byCurrency.NZD.expense = cashExpense;
  byCurrency.NZD.net = cashIncome - cashExpense;
  byCurrency.RMB.income = cashIncomeRmb;
  byCurrency.RMB.expense = cashExpenseRmb;
  byCurrency.RMB.net = cashIncomeRmb - cashExpenseRmb;

  return {
    cashIncome,
    cashExpense,
    netCashFlow: cashIncome - cashExpense,
    cashIncomeRmb,
    cashExpenseRmb,
    netCashFlowRmb: cashIncomeRmb - cashExpenseRmb,
    byCurrency,
    realizedRevenue,
    realizedRevenueRmb,
    unearnedRevenue,
    unearnedRevenueRmb,
    lowBalanceStudents,
    monthRange: { startIso, endIso, startDate, nextMonthStart },
    businessUnitId: resolvedBusinessId,
  };
}

/**
 * 首页日历 / 接下来：复用 Schedule 已验证稳定的数据读取方式。
 * 先取当前实体 bookings，再独立取 students，最后按 student_id 合并。
 * 首页只在返回前裁剪到近期窗口，避免与 /bookings 维护两套不同的数据库过滤逻辑。
 */
export async function getDashboardCalendar(businessId: string) {
  const resolvedBusinessId = businessId || "cus";
  const supabase = await createClient();
  const units = scopeFilter(resolvedBusinessId);

  // Tangent 聚合后 bookings 已超过 PostgREST 单次常见 1000 行上限。
  // 必须分页读取，否则按 start_time 升序时会只拿到较早历史，导致当前/未来课程在 Tangent 日历中消失。
  const allBookings: any[] = [];
  const pageSize = 1000;
  let from = 0;

  while (true) {
    let bookingsQuery = supabase
      .from("bookings")
      .select("id,student_id,start_time,end_time,duration,status,location,subject,teacher,actual_rate,metadata,business_unit_id")
      .order("start_time", { ascending: true })
      .range(from, from + pageSize - 1);

    if (resolvedBusinessId === "tangent") {
      bookingsQuery = bookingsQuery.in("business_unit_id", units);
    } else {
      bookingsQuery = bookingsQuery.eq("business_unit_id", resolvedBusinessId);
    }

    const { data: page, error: bookingsError } = await bookingsQuery;
    if (bookingsError) {
      console.error("[getDashboardCalendar] bookings error:", bookingsError.message);
      return { bookings: [], error: bookingsError.message };
    }

    const rows = page || [];
    allBookings.push(...rows);

    if (rows.length < pageSize) break;
    from += pageSize;
  }

  const now = Date.now();
  const windowStart = now - 45 * 24 * 60 * 60 * 1000;
  const windowEnd = now + 120 * 24 * 60 * 60 * 1000;

  const rawBookings = allBookings.filter((booking: any) => {
    if (booking.status === "cancelled") return false;
    const ts = new Date(booking.start_time).getTime();
    return Number.isFinite(ts) && ts >= windowStart && ts < windowEnd;
  });

  const studentIds = Array.from(
    new Set((rawBookings || []).map((b: any) => b.student_id).filter(Boolean))
  ) as string[];

  let students: any[] = [];
  let studentsError: any = null;

  if (studentIds.length) {
    const primary = await supabase
      .from("students")
      .select("id,name,student_code,teacher,subject,balance,payment_type,currency,level,hourly_rate,income_source,business_unit_id")
      .in("id", studentIds);

    students = primary.data || [];
    studentsError = primary.error;

    if (
      studentsError &&
      /income_source|schema cache|column/i.test(studentsError.message || "")
    ) {
      const fallback = await supabase
        .from("students")
        .select("id,name,student_code,teacher,subject,balance,payment_type,currency,level,hourly_rate,business_unit_id")
        .in("id", studentIds);

      students = (fallback.data || []).map((student: any) => ({
        ...student,
        income_source: null,
      }));
      studentsError = fallback.error;
    }
  }

  if (studentsError) {
    console.error("[getDashboardCalendar] students error:", studentsError.message);
  }

  const studentsById = new Map(
    students.map((student: any) => [student.id, student])
  );

  return {
    bookings: rawBookings.map((booking: any) => ({
      ...booking,
      student: booking.student_id ? studentsById.get(booking.student_id) || null : null,
    })),
    error: studentsError?.message || null,
  };
}
