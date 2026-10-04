"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { incrementStudentBalance } from "@/lib/student-balance";
import { eachDayOfInterval } from "date-fns";
import { formatInTimeZone } from "date-fns-tz";
import { aggregateByCurrency, DEFAULT_CURRENCY, normalizeCurrency } from "@/lib/currency";
import { getTodayInNZ, nzStartOfDayUtc, TZ_NZ } from "@/lib/timezone";
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

function parseDayKey(day: string) {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d, 12));
}

function formatDayKey(date: Date) {
  return [
    date.getUTCFullYear(),
    String(date.getUTCMonth() + 1).padStart(2, "0"),
    String(date.getUTCDate()).padStart(2, "0"),
  ].join("-");
}

function addDaysKey(day: string, amount: number) {
  const d = parseDayKey(day);
  d.setUTCDate(d.getUTCDate() + amount);
  return formatDayKey(d);
}

function periodBounds(
  mode: "week" | "month" | "year",
  anchorDay: string
) {
  const anchor = parseDayKey(anchorDay);
  const y = anchor.getUTCFullYear();
  const m = anchor.getUTCMonth();

  if (mode === "week") {
    const dow = anchor.getUTCDay();
    const daysSinceMonday = (dow + 6) % 7;
    const startDay = addDaysKey(anchorDay, -daysSinceMonday);
    const endExclusiveDay = addDaysKey(startDay, 7);
    return { startDay, endExclusiveDay };
  }

  if (mode === "year") {
    return {
      startDay: `${y}-01-01`,
      endExclusiveDay: `${y + 1}-01-01`,
    };
  }

  const startDay = `${y}-${String(m + 1).padStart(2, "0")}-01`;
  const next = new Date(Date.UTC(y, m + 1, 1, 12));
  return {
    startDay,
    endExclusiveDay: formatDayKey(next),
  };
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
  data: { amount: number; category: string; description: string; date: string; type: string; currency?: string; incomeSource?: string | null }
) {
  const supabase = await createClient();
  
  const { error } = await updateTransactionRow(supabase, id, {
    amount: data.amount,
    category: data.category,
    description: data.description,
    transaction_date: data.date,
    type: data.type,
    ...(data.currency ? { currency: normalizeCurrency(data.currency) } : {}),
    income_source:
      data.type === "income" && isIncomeSource(data.incomeSource)
        ? data.incomeSource
        : null,
  });

  if (error) return { error };
  revalidatePath("/finance");
  revalidatePath("/");
  return { success: true };
}

// 4. 获取概览 — 双币种独立汇总；「本月」与 Dashboard 共用 NZT 月界
export async function getFinanceStats(
  businessId: string,
  mode: "week" | "month" | "year" = "month",
  anchorDate?: string
) {
  const supabase = await createClient();

  const todayNz = getTodayInNZ();
  const safeAnchor = /^\d{4}-\d{2}-\d{2}$/.test(anchorDate || "")
    ? String(anchorDate)
    : todayNz;

  const { startDay, endExclusiveDay } = periodBounds(mode, safeAnchor);
  const startDate = nzStartOfDayUtc(startDay);
  const endExclusiveDate = nzStartOfDayUtc(endExclusiveDay);
  const endDate = new Date(endExclusiveDate.getTime() - 1);

  const startStr = startDay;
  const endStr = endExclusiveDay;

  // 流水查询：按 business_unit_id 隔离；月界用半开区间，兼容 DATE / timestamptz
  // select *：避免因 currency 等列尚未迁移导致整查询失败 → 空数组 → 净现金流 $0
  let txQuery = supabase
    .from("transactions")
    .select("id,type,amount,category,description,transaction_date,business_unit_id,student_id,quantity,currency,income_source")
    .order("transaction_date", { ascending: false });

  if (businessId === "tangent") {
    txQuery = txQuery.in("business_unit_id", ["cus", "sine"]);
  } else {
    txQuery = txQuery.eq("business_unit_id", businessId);
  }

  txQuery = txQuery
    .gte("transaction_date", startStr)
    .lt("transaction_date", endStr);

  const bookingStartIso = startDate.toISOString();
  const bookingEndIso = endExclusiveDate.toISOString();

  let bookingQuery = supabase
    .from("bookings")
    .select(`start_time, duration, actual_rate, student:students(hourly_rate, currency)`)
    .eq("status", "completed")
    .gte("start_time", bookingStartIso)
    .lt("start_time", bookingEndIso);

  let pendingQuery = supabase
    .from("transactions")
    .select("amount, currency, description")
    .ilike("description", "%[报销待打款]%");

  if (businessId === "tangent") {
    bookingQuery = bookingQuery.in("business_unit_id", ["cus", "sine"]);
    pendingQuery = pendingQuery.in("business_unit_id", ["cus", "sine"]);
  } else {
    bookingQuery = bookingQuery.eq("business_unit_id", businessId);
    pendingQuery = pendingQuery.eq("business_unit_id", businessId);
  }

  const [transactionsRes, bookingsPrimary, pendingRes] = await Promise.all([
    txQuery,
    bookingQuery,
    pendingQuery,
  ]);

  let bookings: any[] = bookingsPrimary.data || [];

  // 若显式关联 currency 失败，回退不带 student.currency
  if (bookingsPrimary.error) {
    console.error("[getFinanceStats] bookings error, retry without currency:", bookingsPrimary.error.message);
    let fallbackQuery = supabase
      .from("bookings")
      .select(`start_time, duration, actual_rate, student:students(hourly_rate)`)
      .eq("status", "completed")
      .gte("start_time", bookingStartIso)
      .lt("start_time", bookingEndIso);

    if (businessId === "tangent") {
      fallbackQuery = fallbackQuery.in("business_unit_id", ["cus", "sine"]);
    } else {
      fallbackQuery = fallbackQuery.eq("business_unit_id", businessId);
    }

    const bookingsFallback = await fallbackQuery;
    bookings = bookingsFallback.data || [];
  }

  if (transactionsRes.error) {
    console.error("[getFinanceStats] transactions error:", transactionsRes.error.message, {
      businessId,
      mode,
      anchorDate: safeAnchor,
      startStr,
      endStr,
    });
  }

  // 再按 NZ 日历日收紧，统一使用半开区间 [start, end)
  let transactions = (transactionsRes.data || []).filter((t) => {
    const day = toNzCalendarDay(t.transaction_date);
    return day >= startDay && day < endExclusiveDay;
  });

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

  const incomeBySource = Object.entries(
    transactions
      .filter((t: any) => t.type === "income")
      .reduce((acc: Record<string, { NZD: number; RMB: number; count: number }>, t: any) => {
        const source = t.income_source || "未记录来源";
        if (!acc[source]) acc[source] = { NZD: 0, RMB: 0, count: 0 };
        const cur = normalizeCurrency(t.currency);
        acc[source][cur] += Number(t.amount) || 0;
        acc[source].count += 1;
        return acc;
      }, {})
  )
    .map(([source, totals]) => ({ source, ...totals }))
    .sort((a, b) => (b.NZD + b.RMB) - (a.NZD + a.RMB));

  const bookingDay = (value: string) =>
    formatInTimeZone(new Date(value), TZ_NZ, "yyyy-MM-dd");

  let chartData: any[] = [];

  if (mode === "year") {
    const year = Number(startDay.slice(0, 4));
    chartData = Array.from({ length: 12 }, (_, index) => {
      const monthKey = `${year}-${String(index + 1).padStart(2, "0")}`;
      let income = 0;
      let expense = 0;
      let incomeRmb = 0;
      let expenseRmb = 0;
      let realizedMonth = 0;

      transactions.forEach((t: any) => {
        if (!toNzCalendarDay(t.transaction_date).startsWith(monthKey)) return;
        const cur = normalizeCurrency(t.currency);
        const amt = Number(t.amount) || 0;
        if (cur === "RMB") {
          if (t.type === "income") incomeRmb += amt;
          else if (t.type === "expense") expenseRmb += Math.abs(amt);
        } else {
          if (t.type === "income") income += amt;
          else if (t.type === "expense") expense += Math.abs(amt);
        }
      });

      bookings.forEach((b: any) => {
        if (!bookingDay(b.start_time).startsWith(monthKey)) return;
        const rate = Number(b.actual_rate ?? b.student?.hourly_rate ?? 70);
        realizedMonth += Number(b.duration) * rate;
      });

      return {
        date: `${index + 1}月`,
        fullDate: monthKey,
        income,
        expense,
        incomeRmb,
        expenseRmb,
        realized: realizedMonth,
        net: income - expense,
        netRmb: incomeRmb - expenseRmb,
      };
    });
  } else {
    const daysInterval = eachDayOfInterval({ start: startDate, end: endDate });
    chartData = daysInterval.map((day) => {
      const dateStr = formatInTimeZone(day, TZ_NZ, "yyyy-MM-dd");
      let dailyIncome = 0;
      let dailyExpense = 0;
      let dailyRealized = 0;
      let dailyIncomeRmb = 0;
      let dailyExpenseRmb = 0;

      transactions.forEach((t: any) => {
        if (toNzCalendarDay(t.transaction_date) !== dateStr) return;
        const cur = normalizeCurrency(t.currency);
        const amt = Number(t.amount) || 0;
        if (cur === "RMB") {
          if (t.type === "income") dailyIncomeRmb += amt;
          else if (t.type === "expense") dailyExpenseRmb += Math.abs(amt);
        } else {
          if (t.type === "income") dailyIncome += amt;
          else if (t.type === "expense") dailyExpense += Math.abs(amt);
        }
      });

      bookings.forEach((b: any) => {
        if (bookingDay(b.start_time) !== dateStr) return;
        const rate = Number(b.actual_rate ?? b.student?.hourly_rate ?? 70);
        dailyRealized += Number(b.duration) * rate;
      });

      return {
        date: mode === "week"
          ? formatInTimeZone(day, TZ_NZ, "EEE dd")
          : formatInTimeZone(day, TZ_NZ, "dd"),
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
  }

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
    incomeBySource,
    period: {
      mode,
      anchorDate: safeAnchor,
      startDay,
      endExclusiveDay,
    },
  };
}
