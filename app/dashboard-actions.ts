"use server";

import { createClient } from "@/lib/supabase/server";
import { isPaymentAlert, isPostpaid, isPrepaid } from "@/lib/student-payment";
import { emptyDualTotals, normalizeCurrency } from "@/lib/currency";
import {
  addCalendarDaysInNZ,
  getDayOfWeekInNZ,
  getNzMonthBounds,
  getTodayInNZ,
  nzStartOfDayUtc,
} from "@/lib/timezone";

function scopeFilter(businessId: string) {
  return businessId === "tangent" ? ["cus", "sine"] : [businessId || "cus"];
}

function applyScope(query: any, businessId: string) {
  const resolved = businessId || "cus";
  return resolved === "tangent"
    ? query.in("business_unit_id", ["cus", "sine"])
    : query.eq("business_unit_id", resolved);
}

async function loadStudentsByIds(supabase: any, studentIds: string[]) {
  if (!studentIds.length) return { students: [] as any[], error: null as string | null };

  let primary = await supabase
    .from("students")
    .select("id,name,student_code,teacher,subject,balance,payment_type,currency,level,hourly_rate,income_source,business_unit_id")
    .in("id", studentIds);

  if (
    primary.error &&
    /income_source|schema cache|column/i.test(primary.error.message || "")
  ) {
    const fallback = await supabase
      .from("students")
      .select("id,name,student_code,teacher,subject,balance,payment_type,currency,level,hourly_rate,business_unit_id")
      .in("id", studentIds);

    return {
      students: (fallback.data || []).map((student: any) => ({
        ...student,
        income_source: null,
      })),
      error: fallback.error?.message || null,
    };
  }

  return {
    students: primary.data || [],
    error: primary.error?.message || null,
  };
}

function attachStudents(bookings: any[], students: any[]) {
  const studentsById = new Map(students.map((student: any) => [student.id, student]));
  return bookings.map((booking: any) => ({
    ...booking,
    student: booking.student_id ? studentsById.get(booking.student_id) || null : null,
  }));
}

/**
 * 首页 KPI。
 * 优先走数据库聚合 RPC；如果 migration 尚未执行，则自动 fallback。
 */
export async function getDashboardStats(businessId: string) {
  const resolvedBusinessId = businessId || "cus";
  const supabase = await createClient();
  const { startIso, endIso, startDate, nextMonthStart } = getNzMonthBounds(0);

  const rpc = await supabase.rpc("get_dashboard_kpis", {
    p_business_id: resolvedBusinessId,
    p_start_date: startDate,
    p_next_date: nextMonthStart,
    p_start_ts: startIso,
    p_end_ts: endIso,
  });

  let cashIncome = 0;
  let cashExpense = 0;
  let cashIncomeRmb = 0;
  let cashExpenseRmb = 0;
  let realizedRevenue = 0;
  let realizedRevenueRmb = 0;
  let unearnedRevenue = 0;
  let unearnedRevenueRmb = 0;
  let accountsReceivable = 0;
  let accountsReceivableRmb = 0;

  if (!rpc.error && rpc.data) {
    const row = Array.isArray(rpc.data) ? rpc.data[0] : rpc.data;
    cashIncome = Number(row?.cash_income_nzd || 0);
    cashExpense = Number(row?.cash_expense_nzd || 0);
    cashIncomeRmb = Number(row?.cash_income_rmb || 0);
    cashExpenseRmb = Number(row?.cash_expense_rmb || 0);
    realizedRevenue = Number(row?.realized_nzd || 0);
    realizedRevenueRmb = Number(row?.realized_rmb || 0);
    unearnedRevenue = Number(row?.unearned_nzd || 0);
    unearnedRevenueRmb = Number(row?.unearned_rmb || 0);
    accountsReceivable = Number(row?.receivable_nzd || 0);
    accountsReceivableRmb = Number(row?.receivable_rmb || 0);
  } else {
    let txQuery = supabase
      .from("transactions")
      .select("type,amount,currency")
      .gte("transaction_date", startDate)
      .lt("transaction_date", nextMonthStart);

    let completedQuery = supabase
      .from("bookings")
      .select("duration,actual_rate,student_id")
      .eq("status", "completed")
      .gte("start_time", startIso)
      .lte("start_time", endIso);

    let studentsQuery = supabase
      .from("students")
      .select("id,balance,hourly_rate,payment_type,currency,business_unit_id");

    txQuery = applyScope(txQuery, resolvedBusinessId);
    completedQuery = applyScope(completedQuery, resolvedBusinessId);
    studentsQuery = applyScope(studentsQuery, resolvedBusinessId);

    const [transactionsRes, completedRes, studentsRes] = await Promise.all([
      txQuery,
      completedQuery,
      studentsQuery,
    ]);

    const students = studentsRes.data || [];
    const studentsById = new Map(students.map((student: any) => [student.id, student]));

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

    for (const booking of completedRes.data || []) {
      const student: any = booking.student_id ? studentsById.get(booking.student_id) : null;
      const rate = Number(booking.actual_rate ?? student?.hourly_rate ?? 70);
      const value = Number(booking.duration || 0) * rate;
      if (normalizeCurrency(student?.currency) === "RMB") realizedRevenueRmb += value;
      else realizedRevenue += value;
    }

    for (const student of students) {
      const balance = Number(student.balance || 0);
      const rate = Number(student.hourly_rate || 0);
      if (isPrepaid(student.payment_type) && balance > 0) {
        const value = balance * rate;
        if (normalizeCurrency(student.currency) === "RMB") unearnedRevenueRmb += value;
        else unearnedRevenue += value;
      }
      if (isPostpaid(student.payment_type) && balance < 0) {
        const value = Math.abs(balance) * rate;
        if (normalizeCurrency(student.currency) === "RMB") accountsReceivableRmb += value;
        else accountsReceivable += value;
      }
    }
  }

  let lowBalanceQuery = supabase
    .from("students")
    .select("id,name,balance,hourly_rate,payment_type,currency,business_unit_id")
    .lt("balance", 0);

  lowBalanceQuery = applyScope(lowBalanceQuery, resolvedBusinessId);
  const lowBalanceRes = await lowBalanceQuery;

  const lowBalanceStudents = (lowBalanceRes.data || [])
    .filter((student: any) =>
      isPaymentAlert(
        Number(student.balance || 0),
        student.payment_type,
        { businessUnitId: student.business_unit_id },
        0
      )
    )
    .map((student: any) => ({ ...student, scheduledHours: 0 }));

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
    accountsReceivable,
    accountsReceivableRmb,
    lowBalanceStudents,
    monthRange: { startIso, endIso, startDate, nextMonthStart },
    businessUnitId: resolvedBusinessId,
    source: !rpc.error ? "rpc" : "fallback",
  };
}

/**
 * 今日课程：只查新西兰今天这个自然日。
 */
export async function getDashboardToday(businessId: string) {
  const resolvedBusinessId = businessId || "cus";
  const supabase = await createClient();
  const today = getTodayInNZ();
  const tomorrow = addCalendarDaysInNZ(today, 1);

  let query = supabase
    .from("bookings")
    .select("id,student_id,start_time,end_time,duration,status,location,subject,teacher,actual_rate,metadata,business_unit_id")
    .neq("status", "cancelled")
    .gte("start_time", nzStartOfDayUtc(today).toISOString())
    .lt("start_time", nzStartOfDayUtc(tomorrow).toISOString())
    .order("start_time", { ascending: true });

  query = applyScope(query, resolvedBusinessId);

  const { data: rows, error } = await query;
  if (error) {
    console.error("[getDashboardToday] bookings error:", error.message);
    return { bookings: [], error: error.message };
  }

  const studentIds = Array.from(
    new Set((rows || []).map((b: any) => b.student_id).filter(Boolean))
  ) as string[];
  const studentsResult = await loadStudentsByIds(supabase, studentIds);

  return {
    bookings: attachStudents(rows || [], studentsResult.students),
    error: studentsResult.error,
  };
}

/**
 * 仅加载一个日历月份实际需要的 6 周网格。
 */
export async function getDashboardCalendarMonth(
  businessId: string,
  monthKey?: string
) {
  const resolvedBusinessId = businessId || "cus";
  const supabase = await createClient();
  const currentMonth = monthKey || getTodayInNZ().slice(0, 7);
  const firstDay = `${currentMonth}-01`;
  const gridStart = addCalendarDaysInNZ(firstDay, -getDayOfWeekInNZ(firstDay));
  const gridEndExclusive = addCalendarDaysInNZ(gridStart, 42);

  let bookingsQuery = supabase
    .from("bookings")
    .select("id,student_id,start_time,end_time,duration,status,location,subject,teacher,actual_rate,metadata,business_unit_id")
    .neq("status", "cancelled")
    .gte("start_time", nzStartOfDayUtc(gridStart).toISOString())
    .lt("start_time", nzStartOfDayUtc(gridEndExclusive).toISOString())
    .order("start_time", { ascending: true });

  bookingsQuery = applyScope(bookingsQuery, resolvedBusinessId);

  const { data: rawBookings, error: bookingsError } = await bookingsQuery;
  if (bookingsError) {
    console.error("[getDashboardCalendarMonth] bookings error:", bookingsError.message);
    return { bookings: [], monthKey: currentMonth, error: bookingsError.message };
  }

  const studentIds = Array.from(
    new Set((rawBookings || []).map((b: any) => b.student_id).filter(Boolean))
  ) as string[];
  const studentsResult = await loadStudentsByIds(supabase, studentIds);

  return {
    bookings: attachStudents(rawBookings || [], studentsResult.students),
    monthKey: currentMonth,
    error: studentsResult.error,
  };
}

/**
 * 接下来 8 节 + 全部待办 count。
 * 数据库只返回真正需要的 8 行，不再拉全量 confirmed bookings。
 */
export async function getDashboardUpcoming(businessId: string) {
  const resolvedBusinessId = businessId || "cus";
  const supabase = await createClient();
  const nowIso = new Date().toISOString();

  let rowsQuery = supabase
    .from("bookings")
    .select("id,student_id,start_time,end_time,duration,status,location,subject,teacher,actual_rate,metadata,business_unit_id")
    .eq("status", "confirmed")
    .gte("start_time", nowIso)
    .order("start_time", { ascending: true })
    .limit(8);

  let countQuery = supabase
    .from("bookings")
    .select("id", { count: "exact", head: true })
    .eq("status", "confirmed")
    .gte("start_time", nowIso);

  rowsQuery = applyScope(rowsQuery, resolvedBusinessId);
  countQuery = applyScope(countQuery, resolvedBusinessId);

  const [rowsRes, countRes] = await Promise.all([rowsQuery, countQuery]);

  if (rowsRes.error) {
    console.error("[getDashboardUpcoming] rows error:", rowsRes.error.message);
    return { bookings: [], count: 0, error: rowsRes.error.message };
  }

  const studentIds = Array.from(
    new Set((rowsRes.data || []).map((b: any) => b.student_id).filter(Boolean))
  ) as string[];
  const studentsResult = await loadStudentsByIds(supabase, studentIds);

  return {
    bookings: attachStudents(rowsRes.data || [], studentsResult.students),
    count: countRes.count || 0,
    error: studentsResult.error || countRes.error?.message || null,
  };
}
