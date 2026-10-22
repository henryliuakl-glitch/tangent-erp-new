"use client";

import { useState } from "react";
import { topUpStudent } from "../actions";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CreditCard, Loader2, Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { CURRENCY_OPTIONS, type Currency } from "@/lib/currency";
import { IncomeSourceSelect } from "@/components/IncomeSourceSelect";

export default function TopUpButton({
  studentId,
  defaultCurrency = "NZD",
  defaultIncomeSource = "",
}: {
  studentId: string;
  defaultCurrency?: string;
  defaultIncomeSource?: string;
}) {
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState<Currency>(defaultCurrency === "RMB" ? "RMB" : "NZD");
  const [loading, setLoading] = useState(false);
  const [incomeSource, setIncomeSource] = useState(defaultIncomeSource);
  const router = useRouter();

  const handleOpenChange = (next: boolean) => {
    if (next) {
      setCurrency(defaultCurrency === "RMB" ? "RMB" : "NZD");
      setIncomeSource(defaultIncomeSource);
    }
    setOpen(next);
  };

  const handleTopUp = async () => {
    if (!amount) return;
    if (!incomeSource) {
      alert("请选择本次实际到账账户");
      return;
    }
    setLoading(true);

    const res = await topUpStudent(studentId, Number(amount), currency, incomeSource);

    setLoading(false);

    if (res?.error) {
      alert("充值失败: " + res.error);
    } else {
      setOpen(false);
      setAmount("");
      setCurrency("NZD");
      router.refresh();
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button className="bg-indigo-600 hover:bg-indigo-700 text-white gap-2 shadow-sm">
          <CreditCard className="h-4 w-4" />
          充值课时 (Top Up)
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-indigo-700">
            <Plus className="h-5 w-5" /> 增加课时余额
          </DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="amount">充值数量 (Hours to add)</Label>
            <div className="relative">
              <Input
                id="amount"
                type="number"
                placeholder="例如: 10"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="h-12 text-lg font-bold pr-12"
              />
              <span className="absolute right-4 top-3 text-slate-400 font-bold text-sm">Hrs</span>
            </div>
          </div>
          <div className="space-y-2">
            <Label>币种 (Currency)</Label>
            <Select value={currency} onValueChange={(v) => setCurrency(v as Currency)}>
              <SelectTrigger className="h-11">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CURRENCY_OPTIONS.map((c) => (
                  <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-[10px] text-slate-500">
              课时余额与币种无关；币种仅决定对应财务流水进入 NZD 或 RMB 轨道。
            </p>
          </div>
          <IncomeSourceSelect
            value={incomeSource}
            onChange={setIncomeSource}
            label="本次实际到账账户"
            placeholder="选择钱实际收到哪里"
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>取消</Button>
          <Button onClick={handleTopUp} disabled={loading || !amount || !incomeSource} className="bg-indigo-600 hover:bg-indigo-700">
            {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : "确认充值"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
