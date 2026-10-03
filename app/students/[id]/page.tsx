import { createClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import Link from "next/link";
import { Navbar } from "@/components/Navbar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Card } from "@/components/ui/card";
import { 
  ArrowLeft, Wallet, Clock, Calendar as CalendarIcon,
  ArrowUpRight, ArrowDownRight, MapPin, CheckCircle2
} from "lucide-react";
import { format } from "date-fns";
import TopUpButton from "./top-up-button"; 
import EditStudentButton from "./edit-button";
import { getStudentHistory } from "../actions";
import { isPaymentAlert, getPaymentTypeLabel } from "@/lib/student-payment";
import { currencySymbol, formatMoney } from "@/lib/currency";
import { MobileDock } from "@/components/MobileDock";
import { isDrivingSchoolBusiness } from "@/lib/business";

export default async function StudentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  // 1. 获取学员基础信息
  const { data: student } = await supabase
    .from("students")
    .select("*")
    .eq("id", id)
    .single();

  if (!student) notFound();

  // 2. ✅ 获取历史记录
  const { bookings, transactions } = await getStudentHistory(id);

  const paymentAlert = isPaymentAlert(Number(student.balance), student.payment_type, {
    businessUnitId: student.business_unit_id,
    level: student.level,
  });
  const driving = isDrivingSchoolBusiness(student.business_unit_id);
  const avatarUrl = `https://api.dicebear.com/9.x/notionists/svg?seed=${student.name}&backgroundColor=e5e7eb,d1d5db,9ca3af`;

  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-900 pb-24 md:pb-10">
      <div className="hidden md:block"><Navbar /></div>

      <main className="mx-auto max-w-2xl px-4 md:px-6 py-6 md:py-8">
        
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <Link href="/students">
            <Button variant="outline" size="icon" className="h-10 w-10 rounded-xl bg-white border-slate-200 shadow-sm hover:bg-slate-50">
              <ArrowLeft className="h-5 w-5 text-slate-600" />
            </Button>
          </Link>
          <div>
            <h1 className="text-xl font-black text-slate-900">学员档案</h1>
            <p className="text-xs text-slate-400 font-medium">Student Profile & History</p>
          </div>
        </div>

        {/* Profile Card */}
        <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden relative mb-6">
          <div className="h-24 bg-gradient-to-r from-slate-100 to-slate-50 border-b border-slate-100 relative">
             <div className="absolute top-4 right-4"><EditStudentButton student={student} /></div>
          </div>
          <div className="px-6 pb-8 relative">
            <div className="absolute -top-10 left-6 h-20 w-20 rounded-full border-4 border-white shadow-md bg-white overflow-hidden">
              <img src={avatarUrl} alt={student.name} className="h-full w-full object-cover" />
            </div>
            <div className="pt-12 mb-6">
               <div className="flex items-center gap-2">
                 <h2 className="text-2xl font-black text-slate-900">{student.name}</h2>
                 {student.student_code && <Badge variant="secondary" className="bg-slate-100 text-slate-500 font-mono text-xs border-slate-200">{student.student_code}</Badge>}
               </div>
               <p className="text-sm text-slate-500 mt-1 flex items-center gap-2">
                 <span className="inline-block h-2 w-2 rounded-full bg-slate-300"></span>{student.level || (driving ? "驾校学员" : "年级未知")}
                 <span className="text-slate-300">·</span>
                 {driving ? "一课一缴" : getPaymentTypeLabel(student.payment_type)}
               </p>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-2 gap-4 mb-6">
               {driving ? (
                 <div className="p-4 rounded-2xl border border-slate-100 bg-slate-50">
                    <div className="flex items-center gap-2 mb-1">
                      <Clock className="h-4 w-4 text-slate-400" />
                      <span className="text-xs font-bold uppercase tracking-wider text-slate-400">缴费方式</span>
                    </div>
                    <div className="flex items-baseline gap-1">
                      <span className="text-xl font-black text-slate-800">一课一缴</span>
                    </div>
                 </div>
               ) : (
               <div className={`p-4 rounded-2xl border ${paymentAlert ? 'bg-rose-50 border-rose-100' : 'bg-emerald-50 border-emerald-100'}`}>
                  <div className="flex items-center gap-2 mb-1">
                    <Clock className={`h-4 w-4 ${paymentAlert ? 'text-rose-500' : 'text-emerald-500'}`} />
                    <span className={`text-xs font-bold uppercase tracking-wider ${paymentAlert ? 'text-rose-400' : 'text-emerald-400'}`}>剩余课时</span>
                  </div>
                  <div className="flex items-baseline gap-1">
                    <span className={`text-3xl font-black ${paymentAlert ? 'text-rose-600' : 'text-emerald-600'}`}>{Number(student.balance)}</span>
                    <span className={`text-sm font-bold ${paymentAlert ? 'text-rose-400' : 'text-emerald-500'}`}>hrs</span>
                  </div>
               </div>
               )}
               <div className="p-4 rounded-2xl border border-indigo-100 bg-indigo-50/50">
                  <div className="flex items-center gap-2 mb-1">
                    <Wallet className="h-4 w-4 text-indigo-500" />
                    <span className="text-xs font-bold uppercase tracking-wider text-indigo-400">当前费率</span>
                  </div>
                  <div className="flex items-baseline gap-1">
                    <span className="text-3xl font-black text-indigo-600">
                      {currencySymbol(student.currency)}{student.hourly_rate}
                    </span>
                    <span className="text-sm font-bold text-indigo-400">/hr</span>
                  </div>
                  <p className="text-[10px] text-indigo-300 font-medium mt-1">
                    {student.currency === "RMB" ? "RMB" : "NZD"}
                  </p>
               </div>
            </div>

            {!driving && (
              <>
                <div className="mt-4 rounded-2xl border border-slate-100 bg-slate-50 p-4">
                  <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400">默认收款来源</div>
                  <div className="mt-1 text-sm font-bold text-slate-800">
                    {student.income_source || "未设置"}
                  </div>
                  <p className="mt-1 text-[10px] text-slate-400">该学员后续充值会自动同步到财务流水。</p>
                </div>
                <div className="mt-4"><TopUpButton studentId={student.id} defaultCurrency={student.currency || "NZD"} /></div>
              </>
            )}
          </div>
        </div>

        {/* ✅ History Tabs */}
        <Tabs defaultValue="classes" className="w-full">
          <TabsList className="mx-auto mb-4 grid h-12 w-full max-w-md grid-cols-2 rounded-2xl bg-slate-200/50 p-1">
            <TabsTrigger value="classes" className="rounded-xl text-xs font-bold data-[state=active]:bg-white data-[state=active]:shadow-sm">
              📚 上课记录 ({bookings?.length || 0})
            </TabsTrigger>
            <TabsTrigger value="transactions" className="rounded-xl text-xs font-bold data-[state=active]:bg-white data-[state=active]:shadow-sm">
              💰 资金流水 ({transactions?.length || 0})
            </TabsTrigger>
          </TabsList>

          {/* 上课记录 Tab */}
          <TabsContent value="classes" className="space-y-3">
            {!bookings?.length ? (
              <div className="text-center py-10 text-slate-400 text-xs">暂无上课记录</div>
            ) : (
              bookings.map((b: any) => (
                <Card key={b.id} className="p-4 flex items-center justify-between shadow-sm border-slate-100">
                  <div className="flex items-center gap-4">
                    <div className={`h-10 w-10 rounded-full flex items-center justify-center shrink-0 ${b.status === 'completed' ? 'bg-slate-100 text-slate-500' : 'bg-indigo-100 text-indigo-600'}`}>
                      {b.status === 'completed' ? <CheckCircle2 className="h-5 w-5"/> : <CalendarIcon className="h-5 w-5"/>}
                    </div>
                    <div>
                      <div className="text-sm font-bold text-slate-900">
                        {format(new Date(b.start_time), "MMM d, HH:mm")}
                      </div>
                      <div className="text-xs text-slate-500 flex items-center gap-1 mt-0.5">
                        <MapPin className="h-3 w-3" /> {b.location || "线上"} · {b.duration}h
                      </div>
                    </div>
                  </div>
                  <Badge variant={b.status === 'completed' ? 'secondary' : 'default'} className={b.status === 'completed' ? 'bg-slate-100 text-slate-500' : 'bg-indigo-600'}>
                    {b.status === 'completed' ? '已消课' : b.status === 'cancelled' ? '已取消' : '待上课'}
                  </Badge>
                </Card>
              ))
            )}
          </TabsContent>

          {/* 资金流水 Tab */}
          <TabsContent value="transactions" className="space-y-3">
            {!transactions?.length ? (
              <div className="text-center py-10 text-slate-400 text-xs">暂无资金记录</div>
            ) : (
              transactions.map((t: any) => (
                <Card key={t.id} className="p-4 flex items-center justify-between shadow-sm border-slate-100">
                  <div className="flex items-center gap-4">
                    <div className={`h-10 w-10 rounded-full flex items-center justify-center shrink-0 ${t.type === 'income' ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'}`}>
                      {t.type === 'income' ? <ArrowDownRight className="h-5 w-5"/> : <ArrowUpRight className="h-5 w-5"/>}
                    </div>
                    <div>
                      <div className="text-sm font-bold text-slate-900">{t.category}</div>
                      <div className="text-xs text-slate-400 mt-0.5 max-w-[200px] truncate">
                        {format(new Date(t.transaction_date), "MMM d")} · {t.description}
                        {t.income_source ? ` · 收款：${t.income_source}` : ""}
                      </div>
                    </div>
                  </div>
                  <div className={`text-sm font-black font-mono ${t.type === 'income' ? 'text-emerald-600' : 'text-slate-900'}`}>
                    {t.type === 'income' ? '+' : '-'}{formatMoney(Number(t.amount), t.currency)}
                  </div>
                </Card>
              ))
            )}
          </TabsContent>
        </Tabs>

      </main>

      <MobileDock />
    </div>
  );
}