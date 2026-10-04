"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Navbar } from "@/components/Navbar";
import { useBusiness } from "@/contexts/BusinessContext";
import { getFinanceStats, deleteTransaction, updateTransaction } from "./actions"; // ✅ 引入 updateTransaction
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input"; // ✅ 新增
import { Label } from "@/components/ui/label"; // ✅ 新增
import { Textarea } from "@/components/ui/textarea"; // ✅ 新增
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"; // ✅ 新增
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"; // ✅ 新增
import { 
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger 
} from "@/components/ui/dropdown-menu";
import { 
  Wallet, TrendingUp, ArrowUpRight, ArrowDownRight, 
  Loader2, Plus, DollarSign, Calendar as CalendarIcon,
  FileBarChart, MoreVertical, Trash2, Pencil, Receipt, ChevronLeft, ChevronRight
} from "lucide-react";
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer 
} from 'recharts';
import { format } from "date-fns";
import { toast } from "sonner";
import { currencySymbol, formatMoney, normalizeCurrency, type Currency, CURRENCY_OPTIONS } from "@/lib/currency";
import { MobileDock } from "@/components/MobileDock";
import { INCOME_SOURCE_OPTIONS } from "@/lib/income-source";

export default function FinancePage() {
  const { currentBusinessId } = useBusiness();
  const [loading, setLoading] = useState(true);
  const [periodMode, setPeriodMode] = useState<"week" | "month" | "year">("month");
  const [anchorDate, setAnchorDate] = useState(() => format(new Date(), "yyyy-MM-dd"));
  const [txFilter, setTxFilter] = useState<"all" | "income" | "expense">("all");
  const [data, setData] = useState<any>({
    income: 0, expense: 0, net: 0, realized: 0, realizedRmb: 0,
    byCurrency: {
      NZD: { income: 0, expense: 0, net: 0 },
      RMB: { income: 0, expense: 0, net: 0 },
    },
    transactions: [], chartData: [],
    pendingReimburseCount: 0, pendingReimburseNzd: 0, pendingReimburseRmb: 0,
  });

  // --- 编辑状态管理 ---
  const [editingTx, setEditingTx] = useState<any>(null); // 当前正在编辑的流水
  const [editLoading, setEditLoading] = useState(false);
  // 编辑表单字段
  const [editForm, setEditForm] = useState({
    amount: "",
    category: "",
    date: "",
    description: "",
    type: "expense",
    currency: "NZD" as Currency,
    incomeSource: "",
  });

  // 分类选项 (与 Add Page 保持一致)
  const categories = {
    income: [
      { value: "Tuition", label: "🎓 课程收入" },
      { value: "Services", label: "🛠️ 其他服务" },
      { value: "Investment", label: "📈 投资收益" },
    ],
    expense: [
      { value: "Wages", label: "👨‍🏫 员工工资" },
      { value: "Rent", label: "🏠 场地租金" },
      { value: "Software", label: "💻 软件订阅" },
      { value: "Marketing", label: "📣 市场推广" },
      { value: "Reimbursement", label: "🧾 报销" },
      { value: "Other", label: "📦 其他支出" },
    ]
  };

  // 加载数据
  async function loadData() {
    if (!currentBusinessId) return;
    setLoading(true);
    try {
      const res = await getFinanceStats(currentBusinessId, periodMode, anchorDate);
      setData(res);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }

  useEffect(() => {
    loadData();
  }, [periodMode, anchorDate, currentBusinessId]);

  // 删除流水
  const handleDelete = async (id: string) => {
    if (!confirm("确定删除这条流水吗？")) return;
    const res = await deleteTransaction(id);
    if (res?.error) {
      toast.error(res.error);
    } else {
      toast.success("删除成功");
      loadData(); // 刷新数据
    }
  };

  // 打开编辑弹窗
  const openEdit = (tx: any) => {
    setEditingTx(tx);
    // 初始化表单
    setEditForm({
      amount: String(tx.amount),
      category: tx.category || "",
      date: tx.transaction_date.split('T')[0],
      description: tx.description || "",
      type: tx.type,
      currency: normalizeCurrency(tx.currency),
      incomeSource: tx.income_source || "",
    });
  };

  // 保存编辑
  const handleSaveEdit = async () => {
    if (!editingTx) return;
    setEditLoading(true);

    const res = await updateTransaction(editingTx.id, {
      amount: Number(editForm.amount),
      category: editForm.category,
      description: editForm.description,
      date: editForm.date,
      type: editForm.type,
      currency: editForm.currency,
      incomeSource: editForm.incomeSource || null,
    });

    setEditLoading(false);

    if (res?.error) {
      toast.error("更新失败: " + res.error);
    } else {
      toast.success("流水已更新");
      setEditingTx(null); // 关闭弹窗
      loadData(); // 刷新列表
    }
  };


  const shiftPeriod = (direction: -1 | 1) => {
    const [year, month, day] = anchorDate.split("-").map(Number);
    const d = new Date(Date.UTC(year, month - 1, day, 12));

    if (periodMode === "week") d.setUTCDate(d.getUTCDate() + direction * 7);
    if (periodMode === "month") d.setUTCMonth(d.getUTCMonth() + direction, 1);
    if (periodMode === "year") d.setUTCFullYear(d.getUTCFullYear() + direction, 0, 1);

    setAnchorDate([
      d.getUTCFullYear(),
      String(d.getUTCMonth() + 1).padStart(2, "0"),
      String(d.getUTCDate()).padStart(2, "0"),
    ].join("-"));
  };

  const resetToCurrentPeriod = () => {
    setAnchorDate(format(new Date(), "yyyy-MM-dd"));
  };

  const periodLabel = (() => {
    const start = data.period?.startDay;
    const endExclusive = data.period?.endExclusiveDay;
    if (!start || !endExclusive) return "加载中";

    const end = new Date(`${endExclusive}T12:00:00Z`);
    end.setUTCDate(end.getUTCDate() - 1);
    const startDateObj = new Date(`${start}T12:00:00Z`);

    if (periodMode === "year") return `${startDateObj.getUTCFullYear()}年`;
    if (periodMode === "month") {
      return `${startDateObj.getUTCFullYear()}年${startDateObj.getUTCMonth() + 1}月`;
    }
    return `${startDateObj.getUTCMonth() + 1}月${startDateObj.getUTCDate()}日 – ${end.getUTCMonth() + 1}月${end.getUTCDate()}日`;
  })();

  const setMonthAnchor = (value: string) => {
    if (!/^\d{4}-\d{2}$/.test(value)) return;
    setAnchorDate(`${value}-01`);
  };

  const setYearAnchor = (value: string) => {
    if (!/^\d{4}$/.test(value)) return;
    setAnchorDate(`${value}-01-01`);
  };

  return (
    <div className="min-h-screen bg-slate-50 pb-24 md:pb-10 font-sans text-slate-900">
      <div className="hidden md:block"><Navbar /></div>

      <main className="max-w-7xl mx-auto px-3 py-3 md:px-6 md:py-8">
        
        {/* Header & Controls */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-2 mb-3 md:gap-4 md:mb-8 pt-1 md:pt-0">
          <div>
             <h1 className="text-lg md:text-2xl font-black text-slate-900 flex items-center gap-2">
               <Wallet className="h-5 w-5 md:h-6 md:w-6 text-indigo-600" />
               财务驾驶舱 (Finance)
             </h1>
             <p className="text-[9px] md:text-xs font-bold text-slate-400 mt-0.5 uppercase tracking-wider pl-7 md:pl-8">
               Revenue & Expense Overview
             </p>
          </div>
          
          <div className="w-full md:w-auto">
            <div className="grid grid-cols-3 gap-1 rounded-xl border border-slate-200 bg-white p-1 shadow-sm">
              {([
                { id: "week" as const, label: "按周" },
                { id: "month" as const, label: "按月" },
                { id: "year" as const, label: "按年" },
              ]).map((item) => (
                <button
                  key={item.id}
                  onClick={() => setPeriodMode(item.id)}
                  className={`rounded-lg px-3 py-1.5 text-[11px] font-bold transition-all sm:text-xs ${
                    periodMode === item.id
                      ? "bg-slate-900 text-white shadow-sm"
                      : "text-slate-500 hover:bg-slate-50"
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>

            <div className="mt-1.5 flex items-center justify-between gap-2 rounded-xl border border-slate-200 bg-white px-1.5 py-1 shadow-sm">
              <button
                type="button"
                onClick={() => shiftPeriod(-1)}
                className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100"
                aria-label="上一个期间"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>

              <button
                type="button"
                onClick={resetToCurrentPeriod}
                className="min-w-0 flex-1 px-2 text-center"
                title="点击返回当前期间"
              >
                <div className="truncate text-xs font-black text-slate-900">{periodLabel}</div>
                <div className="mt-0.5 text-[9px] font-semibold text-slate-400">
                  {periodMode === "week" ? "每周单独查看" : periodMode === "month" ? "每月单独查看" : "每年单独查看"}
                </div>
              </button>

              <button
                type="button"
                onClick={() => shiftPeriod(1)}
                className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100"
                aria-label="下一个期间"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
            <div className="mt-1.5 flex items-center gap-2">
              <span className="shrink-0 text-[10px] font-semibold text-slate-400">跳转到</span>
              {periodMode === "week" ? (
                <Input
                  type="date"
                  value={anchorDate}
                  onChange={(e) => setAnchorDate(e.target.value)}
                  className="h-8 rounded-lg border-slate-200 bg-white text-[11px]"
                />
              ) : periodMode === "month" ? (
                <Input
                  type="month"
                  value={anchorDate.slice(0, 7)}
                  onChange={(e) => setMonthAnchor(e.target.value)}
                  className="h-8 rounded-lg border-slate-200 bg-white text-[11px]"
                />
              ) : (
                <Input
                  type="number"
                  min="2000"
                  max="2100"
                  value={anchorDate.slice(0, 4)}
                  onChange={(e) => setYearAnchor(e.target.value)}
                  className="h-8 rounded-lg border-slate-200 bg-white text-[11px]"
                />
              )}
            </div>
          </div>
        </div>

        {(data.pendingReimburseCount || 0) > 0 && (
          <Link href="/finance/reimburse" className="mb-5 flex items-center justify-between rounded-2xl border border-amber-100 bg-amber-50 px-4 py-3">
            <div>
              <p className="text-xs font-bold text-amber-700">有 {data.pendingReimburseCount} 笔报销待打款</p>
              <p className="mt-0.5 text-sm font-black text-slate-900">
                {Number(data.pendingReimburseNzd || 0) > 0 ? `$${Number(data.pendingReimburseNzd).toLocaleString()}` : ""}
                {Number(data.pendingReimburseNzd || 0) > 0 && Number(data.pendingReimburseRmb || 0) > 0 ? " · " : ""}
                {Number(data.pendingReimburseRmb || 0) > 0 ? `¥${Number(data.pendingReimburseRmb).toLocaleString()}` : ""}
              </p>
            </div>
            <span className="text-xs font-bold text-amber-700">去平账 →</span>
          </Link>
        )}

        {/* Stats Cards — NZD / RMB 独立轨道 */}
        <div className="flex overflow-x-auto gap-2 pb-2 -mx-3 px-3 md:gap-4 md:pb-4 md:-mx-0 md:px-0 md:mx-0 md:px-0 md:grid md:grid-cols-4 md:gap-6 no-scrollbar snap-x snap-mandatory">
          <Card className="snap-center min-w-[85vw] md:min-w-0 p-3 md:p-5 border-emerald-100 bg-emerald-50/50 shadow-sm flex flex-col justify-between h-auto">
             <div className="flex justify-between items-start">
               <div>
                 <p className="text-xs font-bold text-emerald-600 uppercase tracking-wider">现金收入 (In)</p>
                 <h2 className="text-xl md:text-3xl font-black text-slate-900 mt-2">${(data.byCurrency?.NZD?.income ?? data.income).toLocaleString()}</h2>
                 <p className="text-sm font-bold text-emerald-700/80 mt-1 tabular-nums">¥{(data.byCurrency?.RMB?.income ?? 0).toLocaleString()} <span className="text-[10px] font-medium text-emerald-600/70">RMB</span></p>
               </div>
               <div className="h-8 w-8 md:h-10 md:w-10 rounded-lg md:rounded-full bg-emerald-100 flex items-center justify-center text-emerald-600"><ArrowDownRight className="h-5 w-5" /></div>
             </div>
          </Card>
          <Card className="snap-center min-w-[85vw] md:min-w-0 p-3 md:p-5 border-rose-100 bg-rose-50/50 shadow-sm flex flex-col justify-between h-auto">
             <div className="flex justify-between items-start">
               <div>
                 <p className="text-xs font-bold text-rose-600 uppercase tracking-wider">现金支出 (Out)</p>
                 <h2 className="text-xl md:text-3xl font-black text-slate-900 mt-2">${(data.byCurrency?.NZD?.expense ?? data.expense).toLocaleString()}</h2>
                 <p className="text-sm font-bold text-rose-700/80 mt-1 tabular-nums">¥{(data.byCurrency?.RMB?.expense ?? 0).toLocaleString()} <span className="text-[10px] font-medium text-rose-600/70">RMB</span></p>
               </div>
               <div className="h-8 w-8 md:h-10 md:w-10 rounded-lg md:rounded-full bg-rose-100 flex items-center justify-center text-rose-600"><ArrowUpRight className="h-5 w-5" /></div>
             </div>
          </Card>
          <Card className="snap-center min-w-[85vw] md:min-w-0 p-3 md:p-5 border-indigo-100 bg-indigo-50/50 shadow-sm flex flex-col justify-between h-auto">
             <div className="flex justify-between items-start">
               <div>
                 <p className="text-xs font-bold text-indigo-600 uppercase tracking-wider">净现金流 (Net)</p>
                 <h2 className={`text-xl md:text-3xl font-black mt-2 ${(data.byCurrency?.NZD?.net ?? data.net) >= 0 ? 'text-indigo-700' : 'text-rose-600'}`}>
                   {(data.byCurrency?.NZD?.net ?? data.net) >= 0 ? '+' : ''}${(data.byCurrency?.NZD?.net ?? data.net).toLocaleString()}
                 </h2>
                 <p className={`text-sm font-bold mt-1 tabular-nums ${(data.byCurrency?.RMB?.net ?? 0) >= 0 ? 'text-indigo-700/80' : 'text-rose-600/80'}`}>
                   {(data.byCurrency?.RMB?.net ?? 0) >= 0 ? '+' : ''}¥{Math.abs(data.byCurrency?.RMB?.net ?? 0).toLocaleString()} <span className="text-[10px] font-medium opacity-70">RMB</span>
                 </p>
               </div>
               <div className="h-8 w-8 md:h-10 md:w-10 rounded-lg md:rounded-full bg-indigo-100 flex items-center justify-center text-indigo-600"><Wallet className="h-5 w-5" /></div>
             </div>
          </Card>
          <Card className="snap-center min-w-[85vw] md:min-w-0 p-3 md:p-5 border-amber-100 bg-amber-50/50 shadow-sm flex flex-col justify-between h-auto">
             <div className="flex justify-between items-start">
               <div><p className="text-xs font-bold text-amber-600 uppercase tracking-wider">消课产值 (Realized)</p><h2 className="text-xl md:text-3xl font-black text-slate-900 mt-2">${Number(data.realized).toLocaleString(undefined, { maximumFractionDigits: 2 })}</h2>
               <p className="text-sm font-bold text-amber-700/80 mt-1 tabular-nums">¥{Number(data.realizedRmb ?? 0).toLocaleString(undefined, { maximumFractionDigits: 2 })} <span className="text-[10px] font-medium text-amber-600/70">RMB</span></p>
               </div>
               <div className="h-8 w-8 md:h-10 md:w-10 rounded-lg md:rounded-full bg-amber-100 flex items-center justify-center text-amber-600"><TrendingUp className="h-5 w-5" /></div>
             </div>
          </Card>
        </div>

        {data.incomeBySource?.length > 0 && (
          <div className="mt-3 md:mt-6 rounded-xl md:rounded-2xl border border-slate-200 bg-white p-3 shadow-sm md:p-5">
            <div className="mb-3">
              <h3 className="text-sm font-bold text-slate-900">收入来源</h3>
              <p className="mt-0.5 text-[11px] text-slate-400">当前筛选时段内，实际收到各账户/方式的收入</p>
            </div>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {data.incomeBySource.map((row: any) => (
                <div key={row.source} className="rounded-xl border border-slate-100 bg-slate-50 px-3 py-3">
                  <div className="truncate text-xs font-bold text-slate-700">{row.source}</div>
                  <div className="mt-1 flex items-baseline gap-2">
                    {Number(row.NZD || 0) > 0 && (
                      <span className="text-sm font-black text-slate-900">${Number(row.NZD).toLocaleString()}</span>
                    )}
                    {Number(row.RMB || 0) > 0 && (
                      <span className="text-sm font-black text-slate-900">¥{Number(row.RMB).toLocaleString()}</span>
                    )}
                  </div>
                  <div className="mt-0.5 text-[10px] text-slate-400">{row.count} 笔</div>
                </div>
              ))}
            </div>
          </div>
        )}
        {/* Chart */}
        <div className="mt-3 md:mt-4 md:mt-8">
          <h3 className="text-sm font-bold text-slate-900 mb-2 md:mb-4 flex items-center gap-2">
            <FileBarChart className="h-4 w-4 text-slate-400" /> 趋势分析 (Trend)
          </h3>
          <Card className="p-3 md:p-6 border-slate-200 shadow-sm overflow-hidden bg-white">
            <div className="overflow-x-auto no-scrollbar w-full pb-2">
               <div className="h-[190px] md:h-[300px] min-w-[600px] md:min-w-full">
                 {loading ? (
                   <div className="h-full flex items-center justify-center"><Loader2 className="animate-spin text-slate-300"/></div>
                 ) : (
                   <ResponsiveContainer width="100%" height="100%">
                     <BarChart data={data.chartData} barGap={0} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                       <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                       <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} dy={10} />
                       <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                       <Tooltip cursor={{ fill: '#f8fafc' }} contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }} />
                       <Legend iconType="circle" wrapperStyle={{ fontSize: '12px', paddingTop: '10px' }}/>
                       <Bar dataKey="income" name="收入 In" fill="#10b981" radius={[4, 4, 0, 0]} barSize={periodMode === "week" ? 20 : periodMode === "year" ? 14 : 8} />
                       <Bar dataKey="expense" name="支出 Out" fill="#f43f5e" radius={[4, 4, 0, 0]} barSize={periodMode === "week" ? 20 : periodMode === "year" ? 14 : 8} />
                       <Bar dataKey="realized" name="产值 Realized" fill="#f59e0b" radius={[4, 4, 0, 0]} barSize={periodMode === "week" ? 20 : periodMode === "year" ? 14 : 8} />
                     </BarChart>
                   </ResponsiveContainer>
                 )}
               </div>
            </div>
          </Card>
        </div>

        {/* Transactions List */}
        <div className="mt-4 md:mt-8">
           <div className="flex items-center justify-between mb-2 md:mb-4">
             <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
               <DollarSign className="h-4 w-4 text-slate-400" /> 近期流水 (Recent)
             </h3>
             <div className="flex items-center gap-2">
               <Link href="/finance/reimburse">
                 <Button size="sm" variant="outline" className="h-8 text-xs font-bold rounded-full border-amber-200 bg-amber-50 text-amber-700">
                   <Receipt className="h-3 w-3 mr-1" /> 报销
                 </Button>
               </Link>
               <Link href="/finance/add">
                 <Button size="sm" variant="outline" className="h-8 text-xs font-bold rounded-full border-slate-200">
                   <Plus className="h-3 w-3 mr-1" /> 记一笔
                 </Button>
               </Link>
             </div>
           </div>

           <div className="mx-auto mb-2 md:mb-4 grid w-full max-w-md grid-cols-3 gap-1 rounded-xl bg-slate-100 p-1">
             {([
               { id: "all" as const, label: "全部" },
               { id: "income" as const, label: "收入" },
               { id: "expense" as const, label: "支出" },
             ]).map((tab) => (
               <button
                 key={tab.id}
                 onClick={() => setTxFilter(tab.id)}
                 className={`rounded-lg py-2 text-center text-xs font-bold transition-all ${
                   txFilter === tab.id
                     ? "bg-white text-indigo-600 shadow-sm"
                     : "text-slate-500 hover:text-slate-700"
                 }`}
               >
                 {tab.label}
               </button>
             ))}
           </div>
           
           <div className="space-y-2 md:space-y-3">
             {loading ? (
               <div className="text-center py-10"><Loader2 className="animate-spin text-slate-300 mx-auto"/></div>
             ) : data.transactions.filter((t: { type?: string }) => txFilter === "all" || t.type === txFilter).length === 0 ? (
               <div className="text-center py-12 bg-white rounded-2xl border border-dashed border-slate-200 text-slate-400 text-xs">
                 本时段无流水记录
               </div>
             ) : (
               data.transactions
                 .filter((t: { type?: string }) => txFilter === "all" || t.type === txFilter)
                 .map((t: any) => (
                 <div key={t.id} className="bg-white border border-slate-100 rounded-xl md:rounded-2xl p-3 md:p-4 flex items-center justify-between shadow-sm active:scale-[0.99] transition-transform">
                    <div className="flex items-center gap-4">
                       <div className={`h-8 w-8 md:h-10 md:w-10 rounded-lg md:rounded-full flex items-center justify-center shrink-0 ${
                         t.type === 'income' ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'
                       }`}>
                         {t.type === 'income' ? <ArrowDownRight className="h-5 w-5" /> : <ArrowUpRight className="h-5 w-5" />}
                       </div>
                       <div>
                         <div className="text-sm font-bold text-slate-900 line-clamp-1">{t.category || "未分类"}</div>
                         <div className="text-xs text-slate-400 mt-0.5 line-clamp-1 max-w-[150px] md:max-w-md font-medium">
                           {t.description || format(new Date(t.transaction_date), "MMM d, HH:mm")}
                         </div>
                         {t.type === "income" && t.income_source ? (
                           <div className="mt-1 text-[10px] font-semibold text-indigo-500">收款：{t.income_source}</div>
                         ) : null}
                       </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className={`text-base font-black font-mono whitespace-nowrap ${
                        t.type === 'income' ? 'text-emerald-600' : 'text-slate-900'
                      }`}>
                        {t.type === 'income' ? '+' : '-'}{formatMoney(Number(t.amount), t.currency)}
                      </div>
                      
                      {/* 操作菜单 */}
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-300 hover:text-slate-600">
                            <MoreVertical className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          {/* ✅ 1. 新增：编辑按钮 */}
                          <DropdownMenuItem onClick={() => openEdit(t)}>
                            <Pencil className="mr-2 h-4 w-4" /> 编辑记录
                          </DropdownMenuItem>
                          <DropdownMenuItem className="text-rose-600 focus:text-rose-600" onClick={() => handleDelete(t.id)}>
                            <Trash2 className="mr-2 h-4 w-4" /> 删除记录
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                 </div>
               ))
             )}
           </div>
        </div>

        {/* ✅ 2. 新增：编辑流水弹窗 */}
        <Dialog open={!!editingTx} onOpenChange={(open) => !open && setEditingTx(null)}>
          <DialogContent className="sm:max-w-[425px]">
            <DialogHeader><DialogTitle>编辑流水</DialogTitle></DialogHeader>
            <div className="grid gap-4 py-2">
               <div className="grid grid-cols-4 items-center gap-4">
                 <Label className="text-right">类型</Label>
                 <Select value={editForm.type} onValueChange={(val) => setEditForm({...editForm, type: val})}>
                    <SelectTrigger className="col-span-3">
                      <SelectValue placeholder="类型" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="expense">支出</SelectItem>
                      <SelectItem value="income">收入</SelectItem>
                    </SelectContent>
                 </Select>
               </div>
               <div className="grid grid-cols-4 items-center gap-4">
                 <Label className="text-right">币种</Label>
                 <Select value={editForm.currency} onValueChange={(val) => setEditForm({...editForm, currency: val as Currency})}>
                    <SelectTrigger className="col-span-3">
                      <SelectValue placeholder="币种" />
                    </SelectTrigger>
                    <SelectContent>
                      {CURRENCY_OPTIONS.map(c => (
                        <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                      ))}
                    </SelectContent>
                 </Select>
               </div>
               <div className="grid grid-cols-4 items-center gap-4">
                 <Label className="text-right">金额</Label>
                 <div className="col-span-3 relative">
                   <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">{currencySymbol(editForm.currency)}</span>
                   <Input type="number" step="0.01" value={editForm.amount} onChange={(e) => setEditForm({...editForm, amount: e.target.value})} className="pl-7" />
                 </div>
               </div>
               <div className="grid grid-cols-4 items-center gap-4">
                 <Label className="text-right">分类</Label>
                 <Select value={editForm.category} onValueChange={(val) => setEditForm({...editForm, category: val})}>
                    <SelectTrigger className="col-span-3">
                      <SelectValue placeholder="分类" />
                    </SelectTrigger>
                    <SelectContent>
                      {(editForm.type === 'income' ? categories.income : categories.expense).map(c => (
                        <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                      ))}
                    </SelectContent>
                 </Select>
               </div>
               <div className="grid grid-cols-4 items-center gap-4">
                 <Label className="text-right">日期</Label>
                 <Input type="date" value={editForm.date} onChange={(e) => setEditForm({...editForm, date: e.target.value})} className="col-span-3" />
               </div>
               <div className="grid grid-cols-4 items-start gap-4">
                 <Label className="text-right mt-2">备注</Label>
                 <Textarea value={editForm.description} onChange={(e) => setEditForm({...editForm, description: e.target.value})} className="col-span-3 h-20" />
               </div>
               {editForm.type === "income" && (
                 <div className="grid grid-cols-4 items-center gap-4">
                   <Label className="text-right">收入来源</Label>
                   <Select value={editForm.incomeSource} onValueChange={(val) => setEditForm({...editForm, incomeSource: val})}>
                     <SelectTrigger className="col-span-3">
                       <SelectValue placeholder="选择收入来源" />
                     </SelectTrigger>
                     <SelectContent className="max-h-72">
                       {INCOME_SOURCE_OPTIONS.map((source) => (
                         <SelectItem key={source} value={source}>{source}</SelectItem>
                       ))}
                     </SelectContent>
                   </Select>
                 </div>
               )}
            </div>
            <DialogFooter>
              <Button onClick={handleSaveEdit} disabled={editLoading}>
                {editLoading ? <Loader2 className="animate-spin" /> : "保存修改"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

      </main>
      
      <MobileDock />
    </div>
  );
}