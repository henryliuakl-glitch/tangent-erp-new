"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useBusiness } from "@/contexts/BusinessContext";
import { Navbar } from "@/components/Navbar";
import { MobileDock } from "@/components/MobileDock";
import { MobileAccountMenu } from "@/components/MobileAccountMenu";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  ArrowDownRight,
  ArrowUpRight,
  Banknote,
  CircleDollarSign,
  Landmark,
  Loader2,
  GripVertical,
  ArrowUp,
  ArrowDown,
  Plus,
  RefreshCw,
  Trash2,
  TrendingUp,
  WalletCards,
} from "lucide-react";
import { toast } from "sonner";
import {
  createFamilyAccount,
  createRecurringCashflow,
  deleteFamilyAccount,
  deleteRecurringCashflow,
  getFamilyData,
  reorderFamilyAccounts,
  updateFamilyAccountBalance,
} from "./actions";

type Account = {
  id: string;
  name: string;
  owner: string;
  account_type: string;
  currency: "NZD" | "RMB";
  balance: number;
  include_in_net_worth: boolean;
  is_business_account: boolean;
  institution?: string | null;
  notes?: string | null;
  sort_order?: number | null;
};

type Recurring = {
  id: string;
  name: string;
  type: "income" | "expense";
  amount: number;
  currency: "NZD" | "RMB";
  frequency: "weekly" | "fortnightly" | "monthly" | "yearly";
  active: boolean;
  category?: string | null;
};

type Transaction = {
  id: string;
  transaction_date: string;
  type: "income" | "expense" | "transfer" | "adjustment";
  amount: number;
  currency: "NZD" | "RMB";
  category?: string | null;
  description?: string | null;
  account_id?: string | null;
  transfer_account_id?: string | null;
};

function monthlyEquivalent(row: Recurring) {
  const amount = Number(row.amount || 0);
  if (row.frequency === "weekly") return amount * 52 / 12;
  if (row.frequency === "fortnightly") return amount * 26 / 12;
  if (row.frequency === "yearly") return amount / 12;
  return amount;
}

function money(amount: number, currency: "NZD" | "RMB") {
  const symbol = currency === "RMB" ? "¥" : "$";
  return `${symbol}${Number(amount || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

export default function FamilyPage() {
  const { currentBusinessId, setBusinessId } = useBusiness();
  const router = useRouter();
  const [userProfile, setUserProfile] = useState<any>(null);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [recurring, setRecurring] = useState<Recurring[]>([]);
  const [fx, setFx] = useState<{ rate: number | null; date: string | null; source: string | null }>({ rate: null, date: null, source: null });
  const [loading, setLoading] = useState(true);
  const [schemaError, setSchemaError] = useState("");
  const [displayCurrency, setDisplayCurrency] = useState<"NZD" | "RMB">("NZD");
  const [accountOpen, setAccountOpen] = useState(false);
  const [forecastOpen, setForecastOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editingBalance, setEditingBalance] = useState<{ id: string; value: string } | null>(null);
  const [draggingAccountId, setDraggingAccountId] = useState<string | null>(null);

  const [accountForm, setAccountForm] = useState({
    name: "",
    owner: "Family",
    institution: "",
    accountType: "bank",
    currency: "NZD",
    balance: "",
    includeInNetWorth: true,
    isBusinessAccount: false,
    notes: "",
  });

  const [forecastForm, setForecastForm] = useState({
    name: "",
    type: "income",
    amount: "",
    currency: "NZD",
    frequency: "monthly",
    category: "",
  });

  async function load() {
    setLoading(true);
    const res = await getFamilyData();
    setLoading(false);
    if (res.error) {
      setSchemaError(res.error);
      return;
    }
    setSchemaError("");
    setAccounts(res.accounts as Account[]);
    setTransactions(res.transactions as Transaction[]);
    setRecurring(res.recurring as Recurring[]);
    setFx(res.fx);
  }

  useEffect(() => {
    if (currentBusinessId !== "family") setBusinessId("family");
    void load();

    const supabase = createClient();
    void supabase.auth.getUser().then(async ({ data }) => {
      const user = data.user;
      if (!user) return;
      const { data: profile } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", user.id)
        .single();

      setUserProfile(
        profile || {
          full_name: user.email?.split("@")[0],
          avatar_url: `https://api.dicebear.com/9.x/notionists/svg?seed=${user.email}`,
        }
      );
    });

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSignOut = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
  };

  const familyBusinesses = [
    { id: "family", name: "Family" },
    { id: "tangent", name: "Tangent Group" },
    { id: "cus", name: "CuS Academy (教培)" },
    { id: "sine", name: "Sine Driving (驾校)" },
  ];

  const totals = useMemo(() => {
    let nzd = 0;
    let rmb = 0;
    accounts.filter((a) => a.include_in_net_worth).forEach((a) => {
      if (a.currency === "RMB") rmb += Number(a.balance || 0);
      else nzd += Number(a.balance || 0);
    });

    const rate = Number(fx.rate || 0);
    return {
      nzd,
      rmb,
      totalNzd: rate > 0 ? nzd + rmb / rate : nzd,
      totalRmb: rate > 0 ? rmb + nzd * rate : rmb,
    };
  }, [accounts, fx.rate]);

  const forecast = useMemo(() => {
    let monthlyNzd = 0;
    let monthlyRmb = 0;

    recurring.filter((r) => r.active).forEach((r) => {
      const value = monthlyEquivalent(r) * (r.type === "income" ? 1 : -1);
      if (r.currency === "RMB") monthlyRmb += value;
      else monthlyNzd += value;
    });

    const rate = Number(fx.rate || 0);
    const monthlyInNzd = rate > 0 ? monthlyNzd + monthlyRmb / rate : monthlyNzd;
    const monthlyInRmb = rate > 0 ? monthlyRmb + monthlyNzd * rate : monthlyRmb;

    return {
      monthlyNzd,
      monthlyRmb,
      monthlyInNzd,
      monthlyInRmb,
    };
  }, [recurring, fx.rate]);

  const variableForecast = useMemo(() => {
    const rate = Number(fx.rate || 0);
    const nowMs = Date.now();
    const cutoffMs = nowMs - 90 * 86400000;

    let netNzd = 0;
    let netRmb = 0;
    let sampleCount = 0;
    let earliestMs = Number.POSITIVE_INFINITY;
    let latestMs = 0;

    transactions.forEach((t) => {
      if (t.type !== "income" && t.type !== "expense") return;
      const dateMs = Date.parse(`${t.transaction_date}T12:00:00`);
      if (!Number.isFinite(dateMs) || dateMs < cutoffMs) return;

      const signed = Number(t.amount || 0) * (t.type === "income" ? 1 : -1);
      if (t.currency === "RMB") netRmb += signed;
      else netNzd += signed;

      sampleCount += 1;
      earliestMs = Math.min(earliestMs, dateMs);
      latestMs = Math.max(latestMs, dateMs);
    });

    const observedDays =
      sampleCount > 0 && Number.isFinite(earliestMs)
        ? Math.max(1, Math.floor((latestMs - earliestMs) / 86400000) + 1)
        : 0;

    // 新系统刚开始记录时，至少按30天窗口归一化，避免几天的数据被夸大成年化趋势。
    const normalizedDays = Math.max(30, observedDays);
    const monthlyNzd = sampleCount > 0 ? (netNzd / normalizedDays) * 30.4375 : 0;
    const monthlyRmb = sampleCount > 0 ? (netRmb / normalizedDays) * 30.4375 : 0;

    return {
      monthlyInNzd: rate > 0 ? monthlyNzd + monthlyRmb / rate : monthlyNzd,
      monthlyInRmb: rate > 0 ? monthlyRmb + monthlyNzd * rate : monthlyRmb,
      sampleCount,
      observedDays,
    };
  }, [transactions, fx.rate]);

  const saveAccount = async () => {
    setSaving(true);
    const fd = new FormData();
    Object.entries(accountForm).forEach(([k, v]) => fd.append(k, String(v)));
    const res = await createFamilyAccount(fd);
    setSaving(false);
    if (res.error) return toast.error(res.error);
    toast.success("账户已添加");
    setAccountOpen(false);
    setAccountForm({
      name: "",
      owner: "Family",
      institution: "",
      accountType: "bank",
      currency: "NZD",
      balance: "",
      includeInNetWorth: true,
      isBusinessAccount: false,
      notes: "",
    });
    await load();
  };

  const saveRecurring = async () => {
    setSaving(true);
    const fd = new FormData();
    Object.entries(forecastForm).forEach(([k, v]) => fd.append(k, String(v)));
    const res = await createRecurringCashflow(fd);
    setSaving(false);
    if (res.error) return toast.error(res.error);
    toast.success("预测项目已添加");
    setForecastOpen(false);
    await load();
  };

  const updateBalance = async () => {
    if (!editingBalance) return;
    const value = Number(editingBalance.value);
    const res = await updateFamilyAccountBalance(editingBalance.id, value);
    if (res.error) return toast.error(res.error);
    setEditingBalance(null);
    toast.success("余额已更新");
    await load();
  };

  const persistAccountOrder = async (next: Account[]) => {
    setAccounts(next);
    const res = await reorderFamilyAccounts(next.map((a) => a.id));
    if (res.error) {
      toast.error("账户排序保存失败: " + res.error);
      await load();
    }
  };

  const moveAccount = async (id: string, direction: -1 | 1) => {
    const index = accounts.findIndex((a) => a.id === id);
    const nextIndex = index + direction;
    if (index < 0 || nextIndex < 0 || nextIndex >= accounts.length) return;
    const next = [...accounts];
    [next[index], next[nextIndex]] = [next[nextIndex], next[index]];
    await persistAccountOrder(next);
  };

  const dropAccount = async (targetId: string) => {
    if (!draggingAccountId || draggingAccountId === targetId) {
      setDraggingAccountId(null);
      return;
    }

    const from = accounts.findIndex((a) => a.id === draggingAccountId);
    const to = accounts.findIndex((a) => a.id === targetId);
    if (from < 0 || to < 0) return;

    const next = [...accounts];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    setDraggingAccountId(null);
    await persistAccountOrder(next);
  };

  const displayTotal = displayCurrency === "NZD" ? totals.totalNzd : totals.totalRmb;
  const monthlyForecast = displayCurrency === "NZD" ? forecast.monthlyInNzd : forecast.monthlyInRmb;
  const monthlyVariableForecast =
    displayCurrency === "NZD"
      ? variableForecast.monthlyInNzd
      : variableForecast.monthlyInRmb;

  const forecastChart = useMemo(() => {
    const points = Array.from({ length: 13 }, (_, month) => ({
      month,
      fixed: displayTotal + monthlyForecast * month,
      variable: displayTotal + monthlyVariableForecast * month,
    }));

    const values = points.flatMap((p) => [p.fixed, p.variable]);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const spread = Math.max(1, max - min);
    const paddedMin = min - spread * 0.08;
    const paddedMax = max + spread * 0.08;
    const range = Math.max(1, paddedMax - paddedMin);
    const width = 600;
    const height = 180;
    const x = (month: number) => (month / 12) * width;
    const y = (value: number) => height - ((value - paddedMin) / range) * height;
    const path = (key: "fixed" | "variable") =>
      points
        .map((p, index) => `${index === 0 ? "M" : "L"} ${x(p.month).toFixed(1)} ${y(p[key]).toFixed(1)}`)
        .join(" ");

    return {
      points,
      fixedPath: path("fixed"),
      variablePath: path("variable"),
      min: paddedMin,
      max: paddedMax,
    };
  }, [displayTotal, monthlyForecast, monthlyVariableForecast]);

  return (
    <div className="min-h-screen bg-slate-50 pb-24 text-slate-900 md:pb-10">
      <div className="hidden md:block"><Navbar /></div>

      <main className="mx-auto max-w-[1440px] px-3 py-4 sm:px-6 lg:px-8">
        <div className="mb-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <WalletCards className="h-5 w-5 shrink-0 text-indigo-600" />
                <h1 className="truncate text-xl font-black tracking-tight md:text-2xl">Family Treasury</h1>
              </div>
              <p className="mt-1 text-xs text-slate-500">家庭资产、账户余额与未来存款预测</p>
            </div>

            <div className="shrink-0 md:hidden">
              <MobileAccountMenu
                user={userProfile}
                currentBusinessId={currentBusinessId}
                businesses={familyBusinesses}
                onSwitch={(id) => {
                  setBusinessId(id);
                  router.push(id === "family" ? "/family" : "/");
                }}
                onSignOut={handleSignOut}
              />
            </div>
          </div>

          <div className="mt-3 flex items-center gap-2">
            <div className="grid grid-cols-2 rounded-xl border border-slate-200 bg-white p-1 shadow-sm">
              {(["NZD", "RMB"] as const).map((cur) => (
                <button
                  key={cur}
                  type="button"
                  onClick={() => setDisplayCurrency(cur)}
                  className={`h-8 rounded-lg px-3 text-xs font-bold ${
                    displayCurrency === cur ? "bg-slate-950 text-white" : "text-slate-500"
                  }`}
                >
                  {cur}
                </button>
              ))}
            </div>
            <Button onClick={() => void load()} variant="outline" size="icon" className="h-10 w-10 rounded-xl">
              <RefreshCw className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {schemaError ? (
          <div className="mb-4 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
            <div className="font-bold">Family 数据库尚未初始化</div>
            <div className="mt-1 text-xs leading-relaxed">
              已把 migration 推到 main。请在 Tangent Supabase SQL Editor 执行
              <span className="mx-1 font-mono">20261021_family_treasury.sql</span>
              后刷新。当前错误：{schemaError}
            </div>
          </div>
        ) : null}

        <section className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-500">家庭总资产</span>
              <CircleDollarSign className="h-4 w-4 text-slate-300" />
            </div>
            <div className="mt-2 text-2xl font-black">
              {loading ? "—" : money(displayTotal, displayCurrency)}
            </div>
            <div className="mt-1 text-[10px] text-slate-400">
              {fx.rate ? `1 NZD ≈ ¥${fx.rate.toFixed(4)} · ${fx.date || "最新"}` : "实时汇率暂不可用，当前仅显示原币轨道"}
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="text-xs font-bold text-slate-500">NZD 账户余额</div>
            <div className="mt-2 text-2xl font-black">{money(totals.nzd, "NZD")}</div>
            <div className="mt-1 text-[10px] text-slate-400">原币余额，不受汇率变化影响</div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="text-xs font-bold text-slate-500">RMB 账户余额</div>
            <div className="mt-2 text-2xl font-black">{money(totals.rmb, "RMB")}</div>
            <div className="mt-1 text-[10px] text-slate-400">原币余额，不受汇率变化影响</div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-500">预计每月净增加</span>
              <TrendingUp className="h-4 w-4 text-emerald-500" />
            </div>
            <div className={`mt-2 text-2xl font-black ${monthlyForecast >= 0 ? "text-emerald-600" : "text-rose-600"}`}>
              {monthlyForecast >= 0 ? "+" : ""}{money(monthlyForecast, displayCurrency)}
            </div>
            <div className="mt-1 text-[10px] text-slate-400">来自已录入的固定收入 / 支出预测</div>
          </div>
        </section>

        <section className="mt-3 grid gap-3 xl:grid-cols-[1.35fr_0.65fr]">
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
              <div>
                <h2 className="text-sm font-black">Accounts</h2>
                <p className="text-[10px] text-slate-400">家庭、个人、Joint、公司、现金和人民币账户</p>
              </div>
              <Button onClick={() => setAccountOpen(true)} className="h-9 rounded-xl bg-slate-950 px-3 text-xs font-bold">
                <Plus className="mr-1.5 h-4 w-4" /> 添加账户
              </Button>
            </div>

            {loading ? (
              <div className="flex h-40 items-center justify-center"><Loader2 className="h-5 w-5 animate-spin text-slate-300" /></div>
            ) : accounts.length === 0 ? (
              <button onClick={() => setAccountOpen(true)} className="flex w-full flex-col items-center py-12 text-center">
                <Landmark className="h-10 w-10 text-slate-200" />
                <div className="mt-2 text-sm font-bold text-slate-600">先把家庭账户录进来</div>
                <div className="mt-1 text-xs text-slate-400">Henry / Yutong / Joint / Company / Cash / RMB</div>
              </button>
            ) : (
              <div className="divide-y divide-slate-100">
                {accounts.map((a, index) => (
                  <div
                    key={a.id}
                    draggable
                    onDragStart={() => setDraggingAccountId(a.id)}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={() => void dropAccount(a.id)}
                    onDragEnd={() => setDraggingAccountId(null)}
                    className={`flex items-center gap-2 px-3 py-3 transition-opacity ${
                      draggingAccountId === a.id ? "opacity-50" : "opacity-100"
                    }`}
                  >
                    <button
                      type="button"
                      className="hidden cursor-grab text-slate-300 hover:text-slate-500 sm:block"
                      title="拖动排序"
                    >
                      <GripVertical className="h-4 w-4" />
                    </button>

                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-100">
                      {a.account_type === "cash" ? <Banknote className="h-4 w-4 text-slate-500" /> : <Landmark className="h-4 w-4 text-slate-500" />}
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex min-w-0 items-center gap-2">
                        <span className="truncate text-sm font-bold text-slate-900">{a.name}</span>
                        <span className="shrink-0 rounded bg-slate-100 px-1.5 py-0.5 text-[9px] font-bold text-slate-500">{a.currency}</span>
                        {a.is_business_account ? <span className="shrink-0 rounded bg-indigo-50 px-1.5 py-0.5 text-[9px] font-bold text-indigo-600">Business</span> : null}
                      </div>
                      <div className="mt-0.5 text-[10px] text-slate-400">{a.owner}{a.institution ? ` · ${a.institution}` : ""}</div>
                    </div>

                    <button
                      type="button"
                      onClick={() => setEditingBalance({ id: a.id, value: String(a.balance || 0) })}
                      className="shrink-0 text-right"
                    >
                      <div className="text-sm font-black tabular-nums">{money(Number(a.balance || 0), a.currency)}</div>
                      <div className="text-[9px] font-semibold text-indigo-500">更新余额</div>
                    </button>

                    <div className="flex shrink-0 flex-col sm:hidden">
                      <button
                        type="button"
                        disabled={index === 0}
                        onClick={() => void moveAccount(a.id, -1)}
                        className="p-0.5 text-slate-300 disabled:opacity-20"
                        aria-label="上移账户"
                      >
                        <ArrowUp className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        disabled={index === accounts.length - 1}
                        onClick={() => void moveAccount(a.id, 1)}
                        className="p-0.5 text-slate-300 disabled:opacity-20"
                        aria-label="下移账户"
                      >
                        <ArrowDown className="h-3.5 w-3.5" />
                      </button>
                    </div>

                    <button
                      type="button"
                      onClick={async () => {
                        if (!confirm(`删除账户 ${a.name}？`)) return;
                        const res = await deleteFamilyAccount(a.id);
                        if (res.error) toast.error(res.error);
                        else { toast.success("账户已删除"); await load(); }
                      }}
                      className="p-1 text-slate-300 hover:text-rose-500"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="grid content-start gap-3">
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="mb-3 flex items-center justify-between">
                <div>
                  <h2 className="text-sm font-black">Savings Forecast</h2>
                  <p className="text-[10px] text-slate-400">Fixed = 手工预算；Variable = 最近实际流水趋势</p>
                </div>
                <Button onClick={() => setForecastOpen(true)} variant="outline" size="sm" className="h-8 rounded-lg text-[10px] font-bold">+ 预测项</Button>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="rounded-xl bg-slate-50 p-3">
                  <div className="text-[9px] font-bold uppercase tracking-wider text-slate-400">Fixed monthly</div>
                  <div className={`mt-1 text-sm font-black ${monthlyForecast >= 0 ? "text-emerald-600" : "text-rose-600"}`}>
                    {monthlyForecast >= 0 ? "+" : ""}{money(monthlyForecast, displayCurrency)}
                  </div>
                </div>
                <div className="rounded-xl bg-slate-50 p-3">
                  <div className="text-[9px] font-bold uppercase tracking-wider text-slate-400">Variable monthly</div>
                  <div className={`mt-1 text-sm font-black ${monthlyVariableForecast >= 0 ? "text-emerald-600" : "text-rose-600"}`}>
                    {monthlyVariableForecast >= 0 ? "+" : ""}{money(monthlyVariableForecast, displayCurrency)}
                  </div>
                  <div className="mt-0.5 text-[8px] text-slate-400">
                    {variableForecast.sampleCount} 笔 · 最近90天实际流水
                  </div>
                </div>
              </div>

              <div className="mt-3 rounded-xl border border-slate-100 bg-white p-3">
                <div className="mb-2 flex items-center justify-between text-[9px] font-bold text-slate-400">
                  <span>未来 12 个月余额走势</span>
                  <span className="flex items-center gap-3">
                    <span className="flex items-center gap-1"><span className="h-0.5 w-4 bg-slate-900" /> Fixed</span>
                    <span className="flex items-center gap-1"><span className="h-0.5 w-4 border-t border-dashed border-indigo-500" /> Variable</span>
                  </span>
                </div>
                <svg viewBox="0 0 600 205" className="h-44 w-full overflow-visible" role="img" aria-label="Savings forecast chart">
                  {[0, 3, 6, 9, 12].map((month) => {
                    const x = (month / 12) * 600;
                    return (
                      <g key={month}>
                        <line x1={x} y1="0" x2={x} y2="180" stroke="currentColor" className="text-slate-100" />
                        <text x={x} y="200" textAnchor={month === 0 ? "start" : month === 12 ? "end" : "middle"} className="fill-slate-400 text-[18px]">
                          {month === 0 ? "Now" : `${month}m`}
                        </text>
                      </g>
                    );
                  })}
                  {[0, 0.5, 1].map((ratio) => {
                    const y = 180 - ratio * 180;
                    const value = forecastChart.min + (forecastChart.max - forecastChart.min) * ratio;
                    return (
                      <g key={ratio}>
                        <line x1="0" y1={y} x2="600" y2={y} stroke="currentColor" className="text-slate-100" />
                        <text x="6" y={Math.max(14, y - 5)} className="fill-slate-300 text-[16px]">
                          {money(value, displayCurrency)}
                        </text>
                      </g>
                    );
                  })}
                  <path d={forecastChart.fixedPath} fill="none" stroke="#0f172a" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
                  <path d={forecastChart.variablePath} fill="none" stroke="#6366f1" strokeWidth="3" strokeDasharray="10 8" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>

              <div className="mt-2 grid grid-cols-3 gap-2">
                {[3, 6, 12].map((months) => (
                  <div key={months} className="rounded-xl bg-slate-50 p-2.5">
                    <div className="text-[9px] font-bold text-slate-400">{months}个月</div>
                    <div className="mt-1 text-[9px] text-slate-400">Fixed</div>
                    <div className="text-xs font-black">
                      {money(displayTotal + monthlyForecast * months, displayCurrency)}
                    </div>
                    <div className="mt-1 text-[9px] text-slate-400">Variable</div>
                    <div className="text-xs font-black text-indigo-600">
                      {money(displayTotal + monthlyVariableForecast * months, displayCurrency)}
                    </div>
                  </div>
                ))}
              </div>

              <div className="mt-3 space-y-1.5">
                {recurring.length === 0 ? (
                  <div className="py-4 text-center text-[11px] text-slate-400">还没有固定现金流预测</div>
                ) : recurring.slice(0, 8).map((r) => (
                  <div key={r.id} className="flex items-center justify-between rounded-lg px-1 py-1.5">
                    <div className="min-w-0">
                      <div className="truncate text-[11px] font-semibold text-slate-700">{r.name}</div>
                      <div className="text-[9px] text-slate-400">{r.frequency}</div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`text-[11px] font-bold ${r.type === "income" ? "text-emerald-600" : "text-rose-600"}`}>
                        {r.type === "income" ? "+" : "-"}{money(Number(r.amount), r.currency)}
                      </span>
                      <button
                        onClick={async () => {
                          const res = await deleteRecurringCashflow(r.id);
                          if (res.error) toast.error(res.error);
                          else await load();
                        }}
                        className="text-slate-300 hover:text-rose-500"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="mb-3">
                <h2 className="text-sm font-black">Automatic Cashflow</h2>
                <p className="text-[10px] text-slate-400">仅保留课程与业务自动产生的必要流水；日常家庭支出不再逐笔记录</p>
              </div>

              <div className="space-y-1">
                {transactions.length === 0 ? (
                  <div className="py-4 text-center text-[11px] text-slate-400">暂无家庭流水</div>
                ) : transactions.slice(0, 8).map((t) => (
                  <div key={t.id} className="flex items-center justify-between gap-2 rounded-lg px-1 py-1.5">
                    <div className="min-w-0">
                      <div className="truncate text-[11px] font-semibold text-slate-700">{t.category || t.description || t.type}</div>
                      <div className="text-[9px] text-slate-400">{t.transaction_date} · {t.type}</div>
                    </div>
                    <div className={`shrink-0 text-[11px] font-bold ${
                      t.type === "income" ? "text-emerald-600" : t.type === "expense" ? "text-rose-600" : "text-slate-500"
                    }`}>
                      {t.type === "income" ? "+" : t.type === "expense" ? "-" : ""}{money(Number(t.amount), t.currency)}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>
      </main>

      <Dialog open={accountOpen} onOpenChange={setAccountOpen}>
        <DialogContent className="rounded-2xl sm:max-w-lg">
          <DialogHeader><DialogTitle>添加家庭账户</DialogTitle></DialogHeader>
          <div className="grid gap-3 py-2">
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1"><Label>账户名称</Label><Input value={accountForm.name} onChange={(e) => setAccountForm((p) => ({ ...p, name: e.target.value }))} placeholder="Henry · ASB" /></div>
              <div className="space-y-1"><Label>Owner</Label><Input value={accountForm.owner} onChange={(e) => setAccountForm((p) => ({ ...p, owner: e.target.value }))} placeholder="Henry / Yutong / Joint / Company" /></div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1"><Label>机构</Label><Input value={accountForm.institution} onChange={(e) => setAccountForm((p) => ({ ...p, institution: e.target.value }))} placeholder="ASB / BNZ / ANZ / Kiwibank" /></div>
              <div className="space-y-1"><Label>账户类型</Label><Select value={accountForm.accountType} onValueChange={(v) => setAccountForm((p) => ({ ...p, accountType: v }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="bank">Bank</SelectItem><SelectItem value="cash">Cash</SelectItem><SelectItem value="wallet">Wallet</SelectItem><SelectItem value="investment">Investment</SelectItem></SelectContent></Select></div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1"><Label>币种</Label><Select value={accountForm.currency} onValueChange={(v) => setAccountForm((p) => ({ ...p, currency: v }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="NZD">NZD</SelectItem><SelectItem value="RMB">RMB</SelectItem></SelectContent></Select></div>
              <div className="space-y-1"><Label>当前余额</Label><Input type="number" value={accountForm.balance} onChange={(e) => setAccountForm((p) => ({ ...p, balance: e.target.value }))} /></div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <button type="button" onClick={() => setAccountForm((p) => ({ ...p, includeInNetWorth: !p.includeInNetWorth }))} className={`rounded-xl border p-3 text-left text-xs font-bold ${accountForm.includeInNetWorth ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-slate-200 text-slate-500"}`}>计入家庭总资产</button>
              <button type="button" onClick={() => setAccountForm((p) => ({ ...p, isBusinessAccount: !p.isBusinessAccount }))} className={`rounded-xl border p-3 text-left text-xs font-bold ${accountForm.isBusinessAccount ? "border-indigo-200 bg-indigo-50 text-indigo-700" : "border-slate-200 text-slate-500"}`}>公司账户</button>
            </div>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setAccountOpen(false)}>取消</Button><Button onClick={saveAccount} disabled={saving}>{saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}添加账户</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={forecastOpen} onOpenChange={setForecastOpen}>
        <DialogContent className="rounded-2xl sm:max-w-lg">
          <DialogHeader><DialogTitle>添加固定现金流预测</DialogTitle></DialogHeader>
          <div className="grid gap-3 py-2">
            <div className="space-y-1"><Label>名称</Label><Input value={forecastForm.name} onChange={(e) => setForecastForm((p) => ({ ...p, name: e.target.value }))} placeholder="CuS 固定课收入 / 房租 / 保险…" /></div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1"><Label>类型</Label><Select value={forecastForm.type} onValueChange={(v) => setForecastForm((p) => ({ ...p, type: v }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="income">收入</SelectItem><SelectItem value="expense">支出</SelectItem></SelectContent></Select></div>
              <div className="space-y-1"><Label>周期</Label><Select value={forecastForm.frequency} onValueChange={(v) => setForecastForm((p) => ({ ...p, frequency: v }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="weekly">每周</SelectItem><SelectItem value="fortnightly">每两周</SelectItem><SelectItem value="monthly">每月</SelectItem><SelectItem value="yearly">每年</SelectItem></SelectContent></Select></div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1"><Label>币种</Label><Select value={forecastForm.currency} onValueChange={(v) => setForecastForm((p) => ({ ...p, currency: v }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="NZD">NZD</SelectItem><SelectItem value="RMB">RMB</SelectItem></SelectContent></Select></div>
              <div className="space-y-1"><Label>金额</Label><Input type="number" value={forecastForm.amount} onChange={(e) => setForecastForm((p) => ({ ...p, amount: e.target.value }))} /></div>
            </div>
            <div className="space-y-1"><Label>分类</Label><Input value={forecastForm.category} onChange={(e) => setForecastForm((p) => ({ ...p, category: e.target.value }))} /></div>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setForecastOpen(false)}>取消</Button><Button onClick={saveRecurring} disabled={saving}>添加预测</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!editingBalance} onOpenChange={(open) => !open && setEditingBalance(null)}>
        <DialogContent className="rounded-2xl sm:max-w-sm">
          <DialogHeader><DialogTitle>更新账户余额</DialogTitle></DialogHeader>
          <Input type="number" value={editingBalance?.value || ""} onChange={(e) => setEditingBalance((p) => p ? { ...p, value: e.target.value } : p)} />
          <DialogFooter><Button variant="outline" onClick={() => setEditingBalance(null)}>取消</Button><Button onClick={updateBalance}>保存余额</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <MobileDock />
    </div>
  );
}
