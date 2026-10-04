"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useBusiness } from "@/contexts/BusinessContext";
import { createClient } from "@/lib/supabase/client";
import {
  createReimbursement,
  deleteReimbursement,
  listReimbursements,
  settleReimbursement,
} from "./actions";

import { Navbar } from "@/components/Navbar";
import { MobileDock } from "@/components/MobileDock";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  ArrowLeft,
  Camera,
  Check,
  CheckCircle2,
  Loader2,
  Receipt,
  Trash2,
  Wallet,
} from "lucide-react";
import { toast } from "sonner";
import { CURRENCY_OPTIONS, currencySymbol, formatMoney, type Currency } from "@/lib/currency";
import { getTodayInNZ } from "@/lib/timezone";
import {
  REIMBURSE_CATEGORIES,
  REIMBURSE_CLAIMANTS,
  getReimburseCategoryLabel,
  parseReimburseClaimant,
  parseReimburseNotes,
} from "@/lib/reimbursement";
import { defaultCoachForEmail } from "@/lib/driving-booking-text";

type ReimburseRow = {
  id: string;
  amount: number;
  category: string;
  description: string | null;
  transaction_date: string;
  proof_img_url: string | null;
  currency?: string | null;
  business_unit_id?: string | null;
};

export default function ReimbursePage() {
  const router = useRouter();
  const { currentBusinessId, currentLabel } = useBusiness();
  const isTangent = currentBusinessId === "tangent";
  const [targetBusinessId, setTargetBusinessId] = useState<"cus" | "sine">("cus");
  const effectiveBusinessId = isTangent ? targetBusinessId : currentBusinessId;
  const supabase = createClient();

  const [tab, setTab] = useState<"pending" | "paid">("pending");
  const [pending, setPending] = useState<ReimburseRow[]>([]);
  const [paid, setPaid] = useState<ReimburseRow[]>([]);
  const [loadingList, setLoadingList] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [actingId, setActingId] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  const [claimant, setClaimant] = useState("");
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState("Fuel");
  const [currency, setCurrency] = useState<Currency>("NZD");
  const [date, setDate] = useState(() => getTodayInNZ());
  const [notes, setNotes] = useState("");
  const [proofUrl, setProofUrl] = useState("");

  const claimantOptions = useMemo(() => {
    const set = new Set<string>(REIMBURSE_CLAIMANTS);
    if (claimant.trim()) set.add(claimant.trim());
    return Array.from(set);
  }, [claimant]);

  async function reload() {
    if (!currentBusinessId) return;
    setLoadingList(true);
    const res = await listReimbursements(currentBusinessId);
    setLoadingList(false);
    if (res.error) {
      toast.error(res.error);
      return;
    }
    setPending((res.pending || []) as ReimburseRow[]);
    setPaid((res.paid || []) as ReimburseRow[]);
  }

  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentBusinessId]);

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) return;
      const { data: profile } = await supabase
        .from("profiles")
        .select("full_name")
        .eq("id", user.id)
        .maybeSingle();
      const name = profile?.full_name?.trim();
      if (name) {
        setClaimant(name);
        return;
      }
      setClaimant(defaultCoachForEmail(user.email));
    });
  }, [supabase]);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) return;
    setUploading(true);
    const file = e.target.files[0];
    const fileExt = file.name.split(".").pop();
    const fileName = `reimburse-${Date.now()}.${fileExt}`;
    const filePath = `${effectiveBusinessId}/${fileName}`;

    const { error: uploadError } = await supabase.storage.from("receipts").upload(filePath, file);
    if (uploadError) {
      toast.error("凭证上传失败");
      setUploading(false);
      return;
    }
    const {
      data: { publicUrl },
    } = supabase.storage.from("receipts").getPublicUrl(filePath);
    setProofUrl(publicUrl);
    setUploading(false);
    toast.success("凭证已上传");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!amount || !category || !claimant) {
      toast.warning("请填写垫付人、金额和分类");
      return;
    }
    setSubmitting(true);
    const formData = new FormData();
    formData.append("amount", amount);
    formData.append("category", category);
    formData.append("claimant", claimant);
    formData.append("date", date);
    formData.append("notes", notes);
    formData.append("businessId", effectiveBusinessId);
    formData.append("currency", currency);
    if (proofUrl) formData.append("proofUrl", proofUrl);

    const result = await createReimbursement(formData);
    setSubmitting(false);
    if (result.error) {
      toast.error(result.error);
      return;
    }
    toast.success("已提交，待打款");
    setAmount("");
    setNotes("");
    setProofUrl("");
    setTab("pending");
    await reload();
  };

  const handleSettle = async (id: string) => {
    if (!confirm("确认已打款给垫付人？打款后将计入本期支出。")) return;
    setActingId(id);
    const res = await settleReimbursement(id);
    setActingId(null);
    if (res.error) toast.error(res.error);
    else {
      toast.success("已平账，支出已入账");
      await reload();
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("删除这笔报销？")) return;
    setActingId(id);
    const res = await deleteReimbursement(id);
    setActingId(null);
    if (res.error) toast.error(res.error);
    else {
      toast.success("已删除");
      await reload();
    }
  };

  const list = tab === "pending" ? pending : paid;
  const pendingTotal = { NZD: 0, RMB: 0 };
  pending.forEach((row) => {
    if (row.currency === "RMB") pendingTotal.RMB += Number(row.amount) || 0;
    else pendingTotal.NZD += Number(row.amount) || 0;
  });

  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-900 pb-24 md:pb-10">
      <div className="hidden md:block">
        <Navbar />
      </div>

      <main className="mx-auto max-w-xl px-3 py-3 md:px-6 md:py-8">
        <div className="mb-3 md:mb-5 flex items-center gap-2 md:gap-3">
          <Button
            variant="outline"
            size="icon"
            className="h-9 w-9 rounded-lg md:h-10 md:w-10 md:rounded-xl border-slate-200 bg-white shadow-sm"
            onClick={() => router.push("/finance")}
          >
            <ArrowLeft className="h-5 w-5 text-slate-600" />
          </Button>
          <div className="min-w-0 flex-1">
            <h1 className="text-lg md:text-xl font-black text-slate-900">报销平账</h1>
            <p className="text-xs font-medium text-slate-400">
              {isTangent ? "Tangent · 同时管理 CuS / Sine" : currentLabel} · 待打款不计入净现金流
            </p>
          </div>
          <Receipt className="h-5 w-5 text-indigo-500" />
        </div>

        {pending.length > 0 && (
          <div className="mb-3 md:mb-5 rounded-xl md:rounded-2xl border border-amber-100 bg-amber-50 px-4 py-3">
            <p className="text-xs font-bold uppercase tracking-wider text-amber-700">待打款合计</p>
            <p className="mt-1 text-lg font-black text-slate-900">
              {pendingTotal.NZD > 0 ? `$${pendingTotal.NZD.toLocaleString()}` : null}
              {pendingTotal.NZD > 0 && pendingTotal.RMB > 0 ? " · " : null}
              {pendingTotal.RMB > 0 ? `¥${pendingTotal.RMB.toLocaleString()}` : null}
              {pendingTotal.NZD === 0 && pendingTotal.RMB === 0 ? "$0" : null}
            </p>
          </div>
        )}

        <div className="mb-3 md:mb-6 rounded-xl md:rounded-3xl border border-slate-200 bg-white p-3 md:p-5 shadow-sm">
          <form onSubmit={handleSubmit} className="space-y-3 md:space-y-4">
            {isTangent && (
              <div className="grid grid-cols-2 gap-1 rounded-xl border border-slate-200 bg-slate-50 p-1">
                <button
                  type="button"
                  onClick={() => setTargetBusinessId("cus")}
                  className={`h-9 rounded-lg text-xs font-bold ${
                    targetBusinessId === "cus" ? "bg-indigo-600 text-white shadow-sm" : "text-slate-500"
                  }`}
                >
                  CuS 教培
                </button>
                <button
                  type="button"
                  onClick={() => setTargetBusinessId("sine")}
                  className={`h-9 rounded-lg text-xs font-bold ${
                    targetBusinessId === "sine" ? "bg-slate-950 text-white shadow-sm" : "text-slate-500"
                  }`}
                >
                  Sine 驾校
                </button>
              </div>
            )}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-[11px] font-bold uppercase tracking-wider text-slate-400">垫付人</Label>
                <Input
                  list="claimant-options"
                  value={claimant}
                  onChange={(e) => setClaimant(e.target.value)}
                  placeholder="谁垫的钱"
                  className="h-10 rounded-lg md:h-11 md:rounded-xl"
                />
                <datalist id="claimant-options">
                  {claimantOptions.map((c) => (
                    <option key={c} value={c} />
                  ))}
                </datalist>
              </div>
              <div className="space-y-1.5">
                <Label className="text-[11px] font-bold uppercase tracking-wider text-slate-400">分类</Label>
                <Select value={category} onValueChange={setCategory}>
                  <SelectTrigger className="h-10 rounded-lg md:h-11 md:rounded-xl">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {REIMBURSE_CATEGORIES.map((c) => (
                      <SelectItem key={c.value} value={c.value}>
                        {c.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label className="text-[11px] font-bold uppercase tracking-wider text-slate-400">金额</Label>
                <Select value={currency} onValueChange={(v) => setCurrency(v as Currency)}>
                  <SelectTrigger className="h-8 w-[110px] rounded-lg text-xs font-bold">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CURRENCY_OPTIONS.map((c) => (
                      <SelectItem key={c.value} value={c.value}>
                        {c.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="relative">
                <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-2xl font-black text-amber-600">
                  {currencySymbol(currency)}
                </span>
                <Input
                  type="number"
                  step="0.01"
                  min="0.01"
                  placeholder="0.00"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="h-12 md:h-14 rounded-xl md:rounded-2xl border-slate-200 bg-slate-50 pl-10 text-center text-3xl font-black"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-[11px] font-bold uppercase tracking-wider text-slate-400">发生日期</Label>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="h-10 rounded-lg md:h-11 md:rounded-xl" />
            </div>

            <div className={`relative flex h-16 md:h-20 w-full items-center justify-center rounded-xl border-2 border-dashed transition-all ${proofUrl ? "border-emerald-400 bg-emerald-50" : "border-slate-200 bg-slate-50"}`}>
              <input type="file" accept="image/*" onChange={handleFileUpload} disabled={uploading} className="absolute inset-0 z-10 cursor-pointer opacity-0" />
              {uploading ? (
                <Loader2 className="h-5 w-5 animate-spin text-indigo-600" />
              ) : proofUrl ? (
                <div className="flex items-center gap-2 text-sm font-bold text-emerald-600">
                  <CheckCircle2 className="h-5 w-5" /> 凭证已上传
                </div>
              ) : (
                <div className="flex items-center gap-2 text-sm font-medium text-slate-400">
                  <Camera className="h-5 w-5" /> 拍照上传发票
                </div>
              )}
            </div>

            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="备注，例如：Albany 练车油费"
              className="rounded-xl"
              rows={2}
            />

            <Button
              type="submit"
              disabled={submitting || uploading}
              className="h-12 w-full rounded-2xl bg-amber-600 text-base font-bold shadow-lg shadow-amber-200 hover:bg-amber-700"
            >
              {submitting ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : <Wallet className="mr-2 h-5 w-5" />}
              提交待打款
            </Button>
          </form>
        </div>

        <div className="mx-auto mb-4 grid w-full grid-cols-2 gap-1 rounded-xl bg-slate-100 p-1">
          <button
            onClick={() => setTab("pending")}
            className={`rounded-lg py-2 text-xs font-bold ${tab === "pending" ? "bg-white text-amber-700 shadow-sm" : "text-slate-500"}`}
          >
            待打款 ({pending.length})
          </button>
          <button
            onClick={() => setTab("paid")}
            className={`rounded-lg py-2 text-xs font-bold ${tab === "paid" ? "bg-white text-slate-800 shadow-sm" : "text-slate-500"}`}
          >
            已打款 ({paid.length})
          </button>
        </div>

        {loadingList ? (
          <div className="py-12 text-center">
            <Loader2 className="mx-auto animate-spin text-slate-300" />
          </div>
        ) : list.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-200 bg-white py-12 text-center text-xs text-slate-400">
            {tab === "pending" ? "暂无待打款报销" : "暂无已打款记录"}
          </div>
        ) : (
          <div className="space-y-3">
            {list.map((row) => {
              const claimantName = parseReimburseClaimant(row.description);
              const note = parseReimburseNotes(row.description);
              return (
                <div key={row.id} className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-bold text-slate-900">{claimantName || "未填垫付人"}</span>
                        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-500">
                          {getReimburseCategoryLabel(row.category)}
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-slate-400">
                        {String(row.transaction_date).slice(0, 10)}
                        {note ? ` · ${note}` : ""}
                      </p>
                      {row.proof_img_url ? (
                        <a href={row.proof_img_url} target="_blank" rel="noreferrer" className="mt-1 inline-block text-[11px] font-bold text-indigo-600">
                          查看凭证
                        </a>
                      ) : null}
                    </div>
                    <div className="shrink-0 text-right">
                      <div className="font-black text-amber-700">
                        {formatMoney(Number(row.amount), row.currency)}
                      </div>
                      <div className="mt-2 flex justify-end gap-1">
                        {tab === "pending" ? (
                          <Button
                            size="sm"
                            className="h-8 rounded-lg bg-slate-900 px-3 text-xs font-bold hover:bg-slate-800"
                            disabled={actingId === row.id}
                            onClick={() => handleSettle(row.id)}
                          >
                            {actingId === row.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
                            已打款
                          </Button>
                        ) : null}
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-8 w-8 text-slate-300 hover:text-rose-500"
                          disabled={actingId === row.id}
                          onClick={() => handleDelete(row.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>

      <MobileDock />
    </div>
  );
}
