"use client";

import { useEffect, useMemo, useState } from "react";
import { Plus, Loader2, WalletCards, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { getTodayInNZ } from "@/lib/timezone";
import { createGlobalTransaction, getGlobalPaymentAccounts } from "@/app/global-ledger-actions";

type Account = {
  id: string;
  name: string;
  currency: "NZD" | "RMB";
  is_business_account?: boolean | null;
};

const FAMILY_CATEGORIES = ["生活", "饮食", "房租", "交通", "车辆", "医疗", "旅行", "购物", "利息", "其他"];
const BUSINESS_CATEGORIES = ["Tuition", "Fuel", "Vehicle", "Software", "Equipment", "Rent", "Marketing", "Wages", "Other"];

export function GlobalLedgerButton() {
  const [open, setOpen] = useState(false);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loadingAccounts, setLoadingAccounts] = useState(false);
  const [saving, setSaving] = useState(false);

  const [scope, setScope] = useState<"family" | "cus" | "sine">("family");
  const [type, setType] = useState<"income" | "expense">("expense");
  const [amount, setAmount] = useState("");
  const [accountId, setAccountId] = useState("");
  const [currency, setCurrency] = useState<"NZD" | "RMB">("NZD");
  const [category, setCategory] = useState("");
  const [date, setDate] = useState(() => getTodayInNZ());
  const [description, setDescription] = useState("");

  useEffect(() => {
    if (!open || accounts.length > 0) return;
    let cancelled = false;
    setLoadingAccounts(true);
    getGlobalPaymentAccounts().then((res) => {
      if (cancelled) return;
      setLoadingAccounts(false);
      if (res.error) {
        toast.error("账户加载失败: " + res.error);
        return;
      }
      setAccounts(res.accounts as Account[]);
    });
    return () => { cancelled = true; };
  }, [open, accounts.length]);

  const selectedAccount = accounts.find((a) => a.id === accountId);
  const categories = scope === "family" ? FAMILY_CATEGORIES : BUSINESS_CATEGORIES;

  useEffect(() => {
    if (selectedAccount?.currency) setCurrency(selectedAccount.currency);
  }, [selectedAccount?.currency]);

  useEffect(() => {
    setCategory("");
  }, [scope, type]);

  const reset = () => {
    setType("expense");
    setAmount("");
    setAccountId("");
    setCurrency("NZD");
    setCategory("");
    setDate(getTodayInNZ());
    setDescription("");
  };

  const save = async () => {
    if (!amount || Number(amount) <= 0) return toast.warning("请输入金额");
    if (!accountId) return toast.warning("请选择实际发生账户");
    if (!category) return toast.warning("请选择分类");

    setSaving(true);
    const fd = new FormData();
    fd.append("scope", scope);
    fd.append("type", type);
    fd.append("amount", amount);
    fd.append("accountId", accountId);
    fd.append("currency", currency);
    fd.append("category", category);
    fd.append("date", date);
    fd.append("description", description);

    const res = await createGlobalTransaction(fd);
    setSaving(false);

    if (res.error) return toast.error("记账失败: " + res.error);

    toast.success(
      scope === "family"
        ? "已记入 Family"
        : `已记入 ${scope === "cus" ? "CuS" : "Sine"}，并同步 Family 账户`
    );
    setOpen(false);
    reset();
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed bottom-[calc(4.7rem+env(safe-area-inset-bottom,0px))] right-3 z-[60] flex h-11 w-11 items-center justify-center rounded-full bg-slate-950 text-white shadow-lg transition-transform active:scale-95 md:bottom-6 md:right-6 md:h-12 md:w-auto md:gap-2 md:rounded-xl md:px-4"
        aria-label="全局记账"
      >
        <Plus className="h-5 w-5" />
        <span className="hidden text-sm font-bold md:inline">记一笔</span>
      </button>

      <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) reset(); }}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto rounded-2xl sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <WalletCards className="h-5 w-5 text-indigo-600" />
              全局记账
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-3">
            <div>
              <Label className="mb-1 block text-xs font-bold text-slate-500">归属</Label>
              <div className="grid grid-cols-3 gap-1 rounded-xl bg-slate-100 p-1">
                {[
                  ["family", "Family"],
                  ["cus", "CuS"],
                  ["sine", "Sine"],
                ].map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setScope(value as "family" | "cus" | "sine")}
                    className={`h-9 rounded-lg text-xs font-bold transition-all ${
                      scope === value ? "bg-white text-slate-950 shadow-sm" : "text-slate-500"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <p className="mt-1 text-[10px] text-slate-400">
                Family = 纯家庭流水；CuS/Sine = 同时保留业务归属并影响 Family 实际账户。
              </p>
            </div>

            <div>
              <Label className="mb-1 block text-xs font-bold text-slate-500">类型</Label>
              <div className="grid grid-cols-2 gap-1 rounded-xl bg-slate-100 p-1">
                <button type="button" onClick={() => setType("expense")} className={`h-9 rounded-lg text-xs font-bold ${type === "expense" ? "bg-white text-rose-600 shadow-sm" : "text-slate-500"}`}>支出</button>
                <button type="button" onClick={() => setType("income")} className={`h-9 rounded-lg text-xs font-bold ${type === "income" ? "bg-white text-emerald-600 shadow-sm" : "text-slate-500"}`}>收入</button>
              </div>
            </div>

            <div>
              <Label className="mb-1 block text-xs font-bold text-slate-500">金额</Label>
              <div className="flex gap-2">
                <Input
                  type="number"
                  step="0.01"
                  inputMode="decimal"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="0.00"
                  className="h-12 flex-1 rounded-xl text-xl font-black"
                />
                <div className="flex h-12 w-20 items-center justify-center rounded-xl border border-slate-200 bg-slate-50 text-xs font-black text-slate-600">
                  {currency}
                </div>
              </div>
            </div>

            <div>
              <Label className="mb-1 block text-xs font-bold text-slate-500">实际账户</Label>
              <Select value={accountId} onValueChange={setAccountId}>
                <SelectTrigger className="h-11 rounded-xl">
                  <SelectValue placeholder={loadingAccounts ? "加载账户…" : "选择钱实际从哪里进/出"} />
                </SelectTrigger>
                <SelectContent className="max-h-72">
                  {accounts.map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.name} · {a.currency}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="mb-1 block text-xs font-bold text-slate-500">分类</Label>
                <Select value={category} onValueChange={setCategory}>
                  <SelectTrigger className="h-11 rounded-xl"><SelectValue placeholder="选择分类" /></SelectTrigger>
                  <SelectContent>
                    {categories.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="mb-1 block text-xs font-bold text-slate-500">日期</Label>
                <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="h-11 rounded-xl" />
              </div>
            </div>

            <div>
              <Label className="mb-1 block text-xs font-bold text-slate-500">备注</Label>
              <Textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="选填" rows={2} className="resize-none rounded-xl" />
            </div>

            <Button onClick={save} disabled={saving} className="h-11 w-full rounded-xl bg-slate-950 font-bold">
              {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              保存
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
