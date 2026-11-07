"use client";

import { useState, useEffect, useRef } from "react";
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
import { FinanceInsights } from "./finance-insights";
import { INCOME_SOURCE_OPTIONS } from "@/lib/income-source";

const EMPTY_FINANCE_DATA = {
  income: 0,
  expense: 0,
  net: 0,
  realized: 0,
  realizedRmb: 0,
  completedLessons: 0,
  completedHours: 0,
  byCurrency: {
    NZD: { income: 0, expense: 0, net: 0 },
    RMB: { income: 0, expense: 0, net: 0 },
  },
  transactions: [],
  chartData: [],
  incomeBySource: [],
  expenseByCategory: [],
  transactionReadError: null,
  pendingReimburseCount: 0,
  pendingReimburseNzd: 0,
  pendingReimburseRmb: 0,
};

const financeCache = new Map<string, any>();

function shiftFinanceAnchor(
  anchorDate: string,
  mode: "week" | "month" | "year",
  direction: -1 | 1
) {
  const [year, month, day] = anchorDate.split("-").map(Number);
  const d = new Date(Date.UTC(year, month - 1, day, 12));

  if (mode === "week") d.setUTCDate(d.getUTCDate() + direction * 7);
  if (mode === "month") d.setUTCMonth(d.getUTCMonth() + direction, 1);
  if (mode === "year") d.setUTCFullYear(d.getUTCFullYear() + direction, 0, 1);

  return [
    d.getUTCFullYear(),
    String(d.getUTCMonth() + 1).padStart(2, "0"),
    String(d.getUTCDate()).padStart(2, "0"),
  ].join("-");
}

export default function FinancePage() {
  const { currentBusinessId } = useBusiness();
  const [loading, setLoading] = useState(true);
  const [periodMode, setPeriodMode] = useState<"week" | "month" | "year">("month");
  const [anchorDate, setAnchorDate] = useState(() => format(new Date(), "yyyy-MM-dd"));
  const [txFilter, setTxFilter] = useState<"all" | "income" | "expense">("all");
  const [data, setData] = useState<any>(EMPTY_FINANCE_DATA);
  const requestSeq = useRef(0);

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

  // 加载数据：实体切换时绝不显示上一个实体的旧账；去掉相邻期间后台预取，
  // 避免一次切换同时堆积 3 个重型 Server Action 导致 CuS/Sine 长时间转圈。
  async function loadData() {
    if (!currentBusinessId) return;

    const seq = ++requestSeq.current;
    const key = `${currentBusinessId}:${periodMode}:${anchorDate}`;
    const cached = financeCache.get(key);

    if (cached) {
      setData(cached);
      setLoading(false);
    } else {
      setData(EMPTY_FINANCE_DATA);
      setLoading(true);
    }

    try {
      const timeout = new Promise<never>((_, reject) => {
        window.setTimeout(() => reject(new Error("Finance stats timeout")), 15000);
      });
      const res = await Promise.race([
        getFinanceStats(currentBusinessId, periodMode, anchorDate),
        timeout,
      ]);

      if (seq !== requestSeq.current) return;
      financeCache.set(key, res);
      setData(res);
    } catch (e) {
      if (seq !== requestSeq.current) return;
      console.error("[finance] load failed:", e);
      toast.error("财务数据加载失败，请重试");
    } finally {
      if (seq === requestSeq.current) setLoading(false);
    }
  }

  useEffect(() => {
    void loadData();
    // requestSeq prevents stale entity/period responses from overwriting the current view.
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
    const nextAnchor = shiftFinanceAnchor(anchorDate, periodMode, direction);
    const nextKey = `${currentBusinessId}:${periodMode}:${nextAnchor}`;
    const cached = financeCache.get(nextKey);
    if (cached) setData(cached);
    setAnchorDate(nextAnchor);
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

      <main className="max-w-[1600px] mx-auto px-3 py-3 md:px-5 md:py-4">
        
        <div className="erp-page-heading erp-finance-toolbar flex flex-wrap items-center justify-end gap-2.5">
          <div className="flex items-center gap-1 rounded-xl bg-white p-1 shadow-sm">
            {([{id:"week" as const,label:"周"},{id:"month" as const,label:"月"},{id:"year" as const,label:"年"}]).map(item=>
              <button key={item.id} type="button" onClick={()=>setPeriodMode(item.id)}
                className={`rounded-lg px-3 py-1.5 text-xs font-bold ${periodMode===item.id?"bg-slate-900 text-white":"text-slate-500 hover:bg-slate-50"}`}>
                {item.label}
              </button>)}
          </div>
          <div className="flex h-9 items-center gap-1 rounded-xl bg-white px-1.5 shadow-sm">
            <button type="button" onClick={()=>shiftPeriod(-1)} aria-label="上个期间" className="rounded-lg p-1 text-slate-500"><ChevronLeft className="h-4 w-4"/></button>
            <button type="button" onClick={resetToCurrentPeriod} className="min-w-[76px] px-1 text-xs font-bold">{periodLabel}</button>
            <button type="button" onClick={()=>shiftPeriod(1)} aria-label="下个期间" className="rounded-lg p-1 text-slate-500"><ChevronRight className="h-4 w-4"/></button>
          </div>
          <div className="flex h-9 items-center gap-1 rounded-xl bg-white px-1.5 shadow-sm">
            {periodMode==="week"?
              <Input aria-label="跳转日期" type="date" value={anchorDate} onChange={e=>setAnchorDate(e.target.value)}
                className="h-8 w-[145px] border-0 bg-transparent px-1 text-xs shadow-none"/>:
            periodMode==="month"?<>
              <select aria-label="跳转年份" value={anchorDate.slice(0,4)}
                onChange={e=>setMonthAnchor(e.target.value+"-"+anchorDate.slice(5,7))}
                className="erp-period-select w-[80px]">
                {Array.from({length:26},(_,i)=>2015+i).map(y=><option key={y} value={y}>{y}年</option>)}
              </select>
              <select aria-label="跳转月份" value={Number(anchorDate.slice(5,7))}
                onChange={e=>setMonthAnchor(anchorDate.slice(0,4)+"-"+String(e.target.value).padStart(2,"0"))}
                className="erp-period-select w-[65px]">
                {Array.from({length:12},(_,i)=>i+1).map(m=><option key={m} value={m}>{m}月</option>)}
              </select>
            </>:<select aria-label="跳转年份" value={anchorDate.slice(0,4)}
              onChange={e=>setYearAnchor(e.target.value)} className="erp-period-select w-24">
              {Array.from({length:26},(_,i)=>2015+i).map(y=><option key={y} value={y}>{y}年</option>)}
            </select>}
          </div>
          <Link href="/finance/add" className="inline-flex h-9 shrink-0 items-center justify-center rounded-xl bg-indigo-600 px-4 text-xs font-bold text-white">
            记一笔
          </Link>
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
        <div className="grid grid-cols-2 gap-2 pb-1 lg:grid-cols-4">
          <Card className="erp-finance-kpi p-3 md:p-4 border-emerald-100 bg-emerald-50/50 shadow-sm flex flex-col justify-between h-auto">
             <div className="flex justify-between items-start">
               <div>
                 <p className="text-xs font-bold text-emerald-600 uppercase tracking-wider">实际收款</p>
                 <h2 className="text-xl md:text-2xl font-black text-slate-900 mt-2">${(data.byCurrency?.NZD?.income ?? data.income).toLocaleString()}</h2>
                 <p className="text-sm font-bold text-emerald-700/80 mt-1 tabular-nums">¥{(data.byCurrency?.RMB?.income ?? 0).toLocaleString()} <span className="text-[10px] font-medium text-emerald-600/70">RMB</span></p>
               </div>
               <div className="h-8 w-8 md:h-10 md:w-10 rounded-lg md:rounded-full bg-emerald-100 flex items-center justify-center text-emerald-600"><ArrowDownRight className="h-5 w-5" /></div>
             </div>
          </Card>
          <Card className="erp-finance-kpi p-3 md:p-4 border-rose-100 bg-rose-50/50 shadow-sm flex flex-col justify-between h-auto">
             <div className="flex justify-between items-start">
               <div>
                 <p className="text-xs font-bold text-rose-600 uppercase tracking-wider">现金支出</p>
                 <h2 className="text-xl md:text-2xl font-black text-slate-900 mt-2">${(data.byCurrency?.NZD?.expense ?? data.expense).toLocaleString()}</h2>
                 <p className="text-sm font-bold text-rose-700/80 mt-1 tabular-nums">¥{(data.byCurrency?.RMB?.expense ?? 0).toLocaleString()} <span className="text-[10px] font-medium text-rose-600/70">RMB</span></p>
               </div>
               <div className="h-8 w-8 md:h-10 md:w-10 rounded-lg md:rounded-full bg-rose-100 flex items-center justify-center text-rose-600"><ArrowUpRight className="h-5 w-5" /></div>
             </div>
          </Card>
          <Card className="erp-finance-kpi p-3 md:p-4 border-indigo-100 bg-indigo-50/50 shadow-sm flex flex-col justify-between h-auto">
             <div className="flex justify-between items-start">
               <div>
                 <p className="text-xs font-bold text-indigo-600 uppercase tracking-wider">净现金流</p>
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
          <Card className="erp-finance-kpi p-3 md:p-4 border-amber-100 bg-amber-50/50 shadow-sm flex flex-col justify-between h-auto">
             <div className="flex justify-between items-start">
               <div><p className="text-xs font-bold text-amber-600 uppercase tracking-wider">销课确认收入</p><h2 className="text-xl md:text-2xl font-black text-slate-900 mt-2">${Number(data.realized).toLocaleString(undefined, { maximumFractionDigits: 2 })}</h2>
               <p className="text-sm font-bold text-amber-700/80 mt-1 tabular-nums">¥{Number(data.realizedRmb ?? 0).toLocaleString(undefined, { maximumFractionDigits: 2 })} <span className="text-[10px] font-medium text-amber-600/70">RMB</span></p>
               </div>
               <div className="h-8 w-8 md:h-10 md:w-10 rounded-lg md:rounded-full bg-amber-100 flex items-center justify-center text-amber-600"><TrendingUp className="h-5 w-5" /></div>
             </div>
          </Card>
        </div>

        <div className="mb-2 mt-2 grid grid-cols-2 gap-2 lg:grid-cols-4">
          {([
            {label:"已完成课程",value:`${Number(data.completedLessons||0).toLocaleString()} 节`,note:"本期销课次数"},
            {label:"已完成课时",value:`${Number(data.completedHours||0).toLocaleString(undefined,{maximumFractionDigits:1})} h`,note:"本期实际教学时长"},
            {label:"实收笔数",value:`${(data.transactions||[]).filter((t:{type:string})=>t.type==="income").length} 笔`,note:"已登记收款流水"},
            {label:"支出笔数",value:`${(data.transactions||[]).filter((t:{type:string})=>t.type==="expense").length} 笔`,note:"已登记支出流水"}
          ]).map(item=><div key={item.label} className="erp-finance-mini-card rounded-2xl bg-white px-4 py-3">
            <p className="text-[11px] font-semibold text-slate-500">{item.label}</p>
            <p className="mt-1 text-xl font-extrabold tabular-nums text-[#282a4a]">{item.value}</p>
            <p className="mt-0.5 text-[10px] text-slate-400">{item.note}</p>
          </div>)}
        </div>

        <FinanceInsights data={data} loading={loading} periodMode={periodMode}/>

        {/* Transactions List */}
        <div className="mt-3">
           <div className="mb-2 flex items-center justify-between">
             <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
               <DollarSign className="h-4 w-4 text-slate-400" /> 近期流水
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
               <div className="erp-surface py-10 text-center text-xs text-slate-400">
                 本时段无流水记录
               </div>
             ) : (
               data.transactions
                 .filter((t: { type?: string }) => txFilter === "all" || t.type === txFilter)
                 .map((t: any) => (
                 <div key={t.id} className="erp-plain-card p-2.5 md:p-3 flex items-center justify-between shadow-sm active:scale-[0.99] transition-transform">
                    <div className="flex items-center gap-4">
                       <div className={`h-8 w-8 md:h-10 md:w-10 rounded-lg md:rounded-full flex items-center justify-center shrink-0 ${
                         t.type === 'income' ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'
                       }`}>
                         {t.type === 'income' ? <ArrowDownRight className="h-5 w-5" /> : <ArrowUpRight className="h-5 w-5" />}
                       </div>
                       <div>
                         <div className="flex items-center gap-1.5">
                                                    <div className="text-sm font-bold text-slate-900 line-clamp-1">{t.category || "未分类"}</div>
                           {currentBusinessId === "tangent" && (
                             <span className={`shrink-0 rounded px-1.5 py-0.5 text-[9px] font-bold ${
                               t.business_unit_id === "sine"
                                 ? "bg-slate-900 text-white"
                                 : "bg-indigo-50 text-indigo-600"
                             }`}>
                               {t.business_unit_id === "sine" ? "Sine" : "CuS"}
                             </span>
                           )}
                         </div>
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