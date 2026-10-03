"use client";

import { useState } from "react";
import { updateStudent } from "../actions";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CURRENCY_OPTIONS, currencySymbol, type Currency } from "@/lib/currency";
import { Pencil, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { PAYMENT_TYPE_OPTIONS } from "@/lib/student-payment";
import { INCOME_SOURCE_OPTIONS } from "@/lib/income-source";

export default function EditStudentButton({ student }: { student: any }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState(student);
  const router = useRouter();

  const handleOpen = () => {
    setData({
      ...student,
      targetBalance: Number(student.balance),
      currency: student.currency || "NZD",
    });
    setOpen(true);
  };

  const handleSave = async () => {
    setLoading(true);
    const res = await updateStudent(student.id, {
      name: data.name,
      studentCode: data.student_code,
      subject: data.subject,
      level: data.level,
      hourlyRate: Number(data.hourly_rate),
      teacher: data.teacher,
      targetBalance: Number(data.targetBalance),
      paymentType: data.payment_type,
      currency: data.currency || "NZD",
      incomeSource: data.income_source || null,
    });
    setLoading(false);

    if (res?.error) {
      toast.error(res.error);
    } else {
      toast.success("保存成功");
      setOpen(false);
      router.refresh();
    }
  };

  const rateCurrency = (data.currency || "NZD") as Currency;

  return (
    <>
      <Button variant="outline" size="icon" onClick={handleOpen}>
        <Pencil className="h-4 w-4 text-slate-500" />
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>编辑档案</DialogTitle></DialogHeader>
          <div className="grid gap-4 py-4">
             <div className="space-y-2">
               <Label>姓名</Label>
               <Input value={data.name} onChange={(e) => setData({...data, name: e.target.value})} />
             </div>
             <div className="space-y-2">
               <Label>学号</Label>
               <Input value={data.student_code || ""} onChange={(e) => setData({...data, student_code: e.target.value})} />
             </div>
             <div className="grid grid-cols-2 gap-4">
               <div className="space-y-2">
                 <Label>科目</Label>
                 <Input value={data.subject || ""} onChange={(e) => setData({...data, subject: e.target.value})} />
               </div>
               <div className="space-y-2">
                 <Label>年级</Label>
                 <Select value={data.level} onValueChange={(val) => setData({...data, level: val})}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Year 9">Year 9</SelectItem>
                      <SelectItem value="Year 10">Year 10</SelectItem>
                      <SelectItem value="Year 11">Year 11</SelectItem>
                      <SelectItem value="Year 12">Year 12</SelectItem>
                      <SelectItem value="Year 13">Year 13</SelectItem>
                      <SelectItem value="University">University</SelectItem>
                    </SelectContent>
                 </Select>
               </div>
             </div>
             <div className="grid grid-cols-2 gap-4">
               <div className="space-y-2">
                 <Label>课时费率</Label>
                 <div className="flex gap-2">
                   <div className="relative flex-1">
                     <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">
                       {currencySymbol(rateCurrency)}
                     </span>
                     <Input
                       type="number"
                       value={data.hourly_rate}
                       onChange={(e) => setData({...data, hourly_rate: e.target.value})}
                       className="pl-7"
                     />
                   </div>
                   <Select
                     value={rateCurrency}
                     onValueChange={(val) => setData({ ...data, currency: val })}
                   >
                     <SelectTrigger className="w-[110px] shrink-0 text-xs font-bold">
                       <SelectValue />
                     </SelectTrigger>
                     <SelectContent>
                       {CURRENCY_OPTIONS.map((c) => (
                         <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                       ))}
                     </SelectContent>
                   </Select>
                 </div>
               </div>
               <div className="space-y-2">
                 <Label>老师</Label>
                 <Input value={data.teacher || ""} onChange={(e) => setData({...data, teacher: e.target.value})} />
               </div>
             </div>
             <div className="space-y-2">
               <Label>缴费类型</Label>
               <Select value={data.payment_type || "monthly"} onValueChange={(val) => setData({ ...data, payment_type: val })}>
                 <SelectTrigger><SelectValue /></SelectTrigger>
                 <SelectContent>
                   {PAYMENT_TYPE_OPTIONS.map((opt) => (
                     <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                   ))}
                 </SelectContent>
               </Select>
             </div>
             <div className="space-y-2">
               <Label>默认收款来源</Label>
               <Select
                 value={data.income_source || ""}
                 onValueChange={(val) => setData({ ...data, income_source: val })}
               >
                 <SelectTrigger><SelectValue placeholder="选择默认收款来源" /></SelectTrigger>
                 <SelectContent className="max-h-72">
                   {INCOME_SOURCE_OPTIONS.map((source) => (
                     <SelectItem key={source} value={source}>{source}</SelectItem>
                   ))}
                 </SelectContent>
               </Select>
               <p className="text-[11px] text-slate-400">教培充值流水会自动继承该来源。</p>
             </div>
             <div className="space-y-2">
               <Label>当前总课时</Label>
               <div className="relative">
                 <Input
                   type="number"
                   step="0.5"
                   value={data.targetBalance}
                   onChange={(e) => setData({ ...data, targetBalance: e.target.value })}
                   className="pr-8"
                 />
                 <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">h</span>
               </div>
               <p className="text-[11px] text-slate-400 leading-snug">
                 提示：手动修改总课时将由系统自动生成一笔无现金流的 [系统调账] 流水，以供财务审计。
               </p>
             </div>
          </div>
          <DialogFooter>
            <Button onClick={handleSave} disabled={loading}>{loading ? <Loader2 className="animate-spin"/> : "保存"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}