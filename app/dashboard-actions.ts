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
  // tangent 汇总：分别拉 cus + sine 再合并；其余业务单元单查
  const finance =
    resolvedBusinessId === "tangent"
      ? await mergeFinanceUnits(["cus", "sine"])
      : await getFinanceStats(resolvedBusinessId, "month");

  // --- 日历待办 + 资金池（需独立查学员/排课）---
  const unitFilter =
    resolvedBusinessId === "tangent"
      ? ["cus", "sine"]
      : [resolvedBusinessId];

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
      .neq("status", "cancelled"),

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

/** Tangent 集团视图：合并多个业务单元的 Finance 本月数据 */
async function mergeFinanceUnits(unitIds: string[]) {
  const parts = await Promise.all(unitIds.map((id) => getFinanceStats(id, "month")));
  const byCurrency = emptyDualTotals();
  let realized = 0;
  let realizedRmb = 0;
  const chartMap = new Map<string, number>();

  for (const part of parts) {
    byCurrency.NZD.income += part.byCurrency?.NZD?.income || 0;
    byCurrency.NZD.expense += part.byCurrency?.NZD?.expense || 0;
    byCurrency.RMB.income += part.byCurrency?.RMB?.income || 0;
    byCurrency.RMB.expense += part.byCurrency?.RMB?.expense || 0;
    realized += part.realized || 0;
    realizedRmb += part.realizedRmb || 0;
    (part.chartData || []).forEach((d: any) => {
      chartMap.set(d.fullDate || d.date, (chartMap.get(d.fullDate || d.date) || 0) + (d.net || 0));
    });
  }

  byCurrency.NZD.net = byCurrency.NZD.income - byCurrency.NZD.expense;
  byCurrency.RMB.net = byCurrency.RMB.income - byCurrency.RMB.expense;

  const chartData = Array.from(chartMap.entries())
    .map(([date, net]) => ({ date, fullDate: date, net }))
    .sort((a, b) => a.date.localeCompare(b.date));

  return {
    income: byCurrency.NZD.income,
    expense: byCurrency.NZD.expense,
    net: byCurrency.NZD.net,
    realized,
    realizedRmb,
    byCurrency,
    chartData,
    transactions: [],
  };
}
