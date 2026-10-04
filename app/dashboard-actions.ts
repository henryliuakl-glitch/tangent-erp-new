"use server";

import { createClient } from "@/lib/supabase/server";
import { isPaymentAlert } from "@/lib/student-payment";
import { emptyDualTotals, normalizeCurrency } from "@/lib/currency";
import { getNzMonthBounds } from "@/lib/timezone";
import { getFinanceStats } from "@/app/finance/actions";

/**
 * Dashboard 本月统计
 * 净现金流 / 消课产值：直接复用 getFinanceStats("month")，与财务驾驶舱 1:1 对齐
 * 资金池：学员 balance > 0 × hourly_rate（按 currency 分轨）
 */
export async function getDashboardStats(businessId: string) {
  // 租户隔离：缺省回落到 cus，避免空 id 查出空集
  const resolvedBusinessId =
    !businessId || businessId === "tangent" ? businessId || "cus" : businessId;

  const supabase = await createClient();
  const { startIso, endIso, startDate, nextMonthStart } = getNzMonthBounds(0);

  // --- 与 Finance「本月」共用同一套流水/产值计算 ---
  // getFinanceStats 已原生支持 tangent 聚合，避免集团视图重复发两套财务查询。
  const finance = await getFinanceStats(resolvedBusinessId, "month");

  // --- 日历待办 + 资金池（需独立查学员/排课）---
  const unitFilter =
    resolvedBusinessId === "tangent"
      ? ["cus", "sine"]
      : [resolvedBusinessId];

  const calendarStart = new Date(Date.now() - 62 * 24 * 60 * 60 * 1000).toISOString();
  const calendarEnd = new Date(Date.now() + 370 * 24 * 60 * 60 * 1000).toISOString();

  const [
    { data: calendarBookings, error: calErr },
    { data: students, error: stuErr },
  ] = await Promise.all([
    supabase
      .from("bookings")
      .select(`
        id, start_time, end_time, duration, status, location, subject, teacher, actual_rate, metadata, student_id, business_unit_id,
        student:students (
          id, name, student_code, teacher, subject, balance, payment_type, currency, level
        )
      `)
      .in("business_unit_id", unitFilter)
      .neq("status", "cancelled")
      .gte("start_time", calendarStart)
      .lt("start_time", calendarEnd),

    supabase
      .from("students")
      .select("balance, hourly_rate, name, id, payment_type, currency, business_unit_id")
      .in("business_unit_id", unitFilter),
  ]);

  if (calErr) console.error("[getDashboardStats] bookings error:", calErr.message);
  if (stuErr) console.error("[getDashboardStats] students error:", stuErr.message);

  let unearnedRevenue = 0;
  let unearnedRevenueRmb = 0;
  const lowBalanceStudents: any[] = [];

  students?.forEach((s) => {
    const bal = Number(s.balance);
    const rate = Number(s.hourly_rate) || 0;
    if (bal > 0) {
      const value = bal * rate;
      if (normalizeCurrency(s.currency) === "RMB") unearnedRevenueRmb += value;
      else unearnedRevenue += value;
    }
    if (isPaymentAlert(bal, s.payment_type, { businessUnitId: s.business_unit_id })) {
      lowBalanceStudents.push(s);
    }
  });

  const byCurrency = finance.byCurrency || emptyDualTotals();

  return {
    cashIncome: finance.income ?? byCurrency.NZD.income,
    cashExpense: finance.expense ?? byCurrency.NZD.expense,
    netCashFlow: finance.net ?? byCurrency.NZD.net,
    cashIncomeRmb: byCurrency.RMB.income,
    cashExpenseRmb: byCurrency.RMB.expense,
    netCashFlowRmb: byCurrency.RMB.net,
    byCurrency,
    realizedRevenue: finance.realized ?? 0,
    realizedRevenueRmb: finance.realizedRmb ?? 0,
    unearnedRevenue,
    unearnedRevenueRmb,
    chartData: finance.chartData || [],
    calendarBookings: calendarBookings || [],
    lowBalanceStudents,
    monthRange: { startIso, endIso, startDate, nextMonthStart },
    businessUnitId: resolvedBusinessId,
  };
}
