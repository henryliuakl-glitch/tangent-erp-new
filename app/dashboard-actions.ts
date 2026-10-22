"use server";

import { createClient } from "@/lib/supabase/server";
import { isPaymentAlert } from "@/lib/student-payment";
import { emptyDualTotals, normalizeCurrency } from "@/lib/currency";
import { getNzMonthBounds } from "@/lib/timezone";

/**
 * Dashboard 本月统计
 * 净现金流 / 消课产值：直接复用 getFinanceStats("month")，与财务驾驶舱 1:1 对齐
 * 资金池：学员 balance > 0 × hourly_rate（按 currency 分轨）
 */
export async function getDashboardStats(businessId: string) {
  const resolvedBusinessId = businessId || "cus";
  const supabase = await createClient();
  const { startIso, endIso, startDate, nextMonthStart } = getNzMonthBounds(0);

  const unitFilter =
    resolvedBusinessId === "tangent"
      ? ["cus", "sine"]
      : [resolvedBusinessId];

  const calendarStart = new Date(Date.now() - 62 * 24 * 60 * 60 * 1000).toISOString();
  const calendarEnd = new Date(Date.now() + 370 * 24 * 60 * 60 * 1000).toISOString();

  const txBase = supabase
    .from("transactions")
    .select("type,amount,currency,transaction_date,business_unit_id,category")
    .gte("transaction_date", startDate)
    .lt("transaction_date", nextMonthStart);

  const completedBase = supabase
    .from("bookings")
    .select(`
      start_time, duration, actual_rate, business_unit_id,
      student:students(hourly_rate, currency)
    `)
    .eq("status", "completed")
    .gte("start_time", startIso)
    .lt("start_time", endIso);

  const calendarBase = supabase
    .from("bookings")
    .select(`
      id, start_time, end_time, duration, status, location, subject, teacher,
      actual_rate, metadata, student_id, business_unit_id,
      student:students (
        id, name, student_code, teacher, subject, balance,
        payment_type, currency, level, hourly_rate
      )
    `)
    .neq("status", "cancelled")
    .gte("start_time", calendarStart)
    .lt("start_time", calendarEnd);

  const studentsBase = supabase
    .from("students")
    .select("balance,hourly_rate,name,id,payment_type,currency,business_unit_id")
    .order("name");

  const txQuery =
    resolvedBusinessId === "tangent"
      ? txBase.in("business_unit_id", unitFilter)
      : txBase.eq("business_unit_id", resolvedBusinessId);

  const completedQuery =
    resolvedBusinessId === "tangent"
      ? completedBase.in("business_unit_id", unitFilter)
      : completedBase.eq("business_unit_id", resolvedBusinessId);

  const calendarQuery =
    resolvedBusinessId === "tangent"
      ? calendarBase.in("business_unit_id", unitFilter)
      : calendarBase.eq("business_unit_id", resolvedBusinessId);

  const studentsQuery =
    resolvedBusinessId === "tangent"
      ? studentsBase.in("business_unit_id", unitFilter)
      : studentsBase.eq("business_unit_id", resolvedBusinessId);

  // Dashboard only needs compact current-month totals + calendar/student data.
  // Run every independent query in parallel so switching entities does not wait
  // for Finance's full chart/source/reimbursement pipeline.
  const [
    transactionsRes,
    completedRes,
    calendarRes,
    studentsRes,
  ] = await Promise.all([
    txQuery,
    completedQuery,
    calendarQuery,
    studentsQuery,
  ]);

  if (transactionsRes.error) {
    console.error("[getDashboardStats] transactions error:", transactionsRes.error.message);
  }
  if (completedRes.error) {
    console.error("[getDashboardStats] completed bookings error:", completedRes.error.message);
  }
  if (calendarRes.error) {
    console.error("[getDashboardStats] calendar error:", calendarRes.error.message);
  }
  if (studentsRes.error) {
    console.error("[getDashboardStats] students error:", studentsRes.error.message);
  }

  let cashIncome = 0;
  let cashExpense = 0;
  let cashIncomeRmb = 0;
  let cashExpenseRmb = 0;

  // 现金口径统一：只认 transactions。
  // Sine 完成课程时会生成 Tuition income transaction；
  // CuS 充值时生成 income transaction。bookings 只用于 Realized，不再额外叠加现金收入。
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

  let realizedRevenue = 0;
  let realizedRevenueRmb = 0;
  for (const booking of completedRes.data || []) {
    const student = Array.isArray(booking.student) ? booking.student[0] : booking.student;
    const rate = Number(booking.actual_rate ?? student?.hourly_rate ?? 70);
    const value = Number(booking.duration || 0) * rate;
    const currency = normalizeCurrency(student?.currency);

    if (currency === "RMB") realizedRevenueRmb += value;
    else realizedRevenue += value;

  }

  const calendarBookings = calendarRes.data || [];
  const students = studentsRes.data || [];

  let unearnedRevenue = 0;
  let unearnedRevenueRmb = 0;
  const lowBalanceStudents: any[] = [];

  const confirmedHoursByStudent = new Map<string, number>();
  for (const booking of calendarBookings) {
    if (booking.status !== "confirmed" || !booking.student_id) continue;
    confirmedHoursByStudent.set(
      booking.student_id,
      (confirmedHoursByStudent.get(booking.student_id) || 0) + Number(booking.duration || 0)
    );
  }

  for (const student of students) {
    const balance = Number(student.balance || 0);
    const rate = Number(student.hourly_rate || 0);

    if (balance > 0) {
      const value = balance * rate;
      if (normalizeCurrency(student.currency) === "RMB") unearnedRevenueRmb += value;
      else unearnedRevenue += value;
    }

    const scheduledHours = confirmedHoursByStudent.get(student.id) || 0;
    if (
      isPaymentAlert(
        balance,
        student.payment_type,
        { businessUnitId: student.business_unit_id },
        scheduledHours
      )
    ) {
      lowBalanceStudents.push({ ...student, scheduledHours });
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
    chartData: [],
    calendarBookings,
    lowBalanceStudents,
    monthRange: { startIso, endIso, startDate, nextMonthStart },
    businessUnitId: resolvedBusinessId,
  };
}
