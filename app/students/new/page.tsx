"use client";

import { useState, FormEvent, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createStudent } from "../actions"; 
import { useBusiness } from "@/contexts/BusinessContext";
import { createClient } from "@/lib/supabase/client";
import { Navbar } from "@/components/Navbar"; 
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CreatableCombobox } from "@/components/CreatableCombobox";
import { fetchFormSuggestions } from "@/lib/form-suggestions";
import { PAYMENT_TYPE_OPTIONS } from "@/lib/student-payment";
import { CURRENCY_OPTIONS, currencySymbol, type Currency } from "@/lib/currency";
import { INCOME_SOURCE_OPTIONS } from "@/lib/income-source";
import { 
  Loader2, ArrowLeft, Wallet, GraduationCap, User, BookOpen, Car
} from "lucide-react";
import { toast } from "sonner"; 
import { MobileDock } from "@/components/MobileDock";

export default function NewStudentPage() {
  const { currentBusinessId } = useBusiness();
  const router = useRouter();
  const supabase = createClient();
  const [loading, setLoading] = useState(false);

  const [hourlyRate, setHourlyRate] = useState("70");
  const [currency, setCurrency] = useState<Currency>("NZD");
  const [balance, setBalance] = useState("0");
  const [level, setLevel] = useState("Year 11");
  const [paymentType, setPaymentType] = useState("monthly");
  const [incomeSource, setIncomeSource] = useState("");
  const [subject, setSubject] = useState("");
  const [teacher, setTeacher] = useState("");
  const [subjectOptions, setSubjectOptions] = useState<string[]>([]);
  const [teacherOptions, setTeacherOptions] = useState<string[]>([]);

  useEffect(() => {
    async function loadSuggestions() {
      const { subjects, teachers } = await fetchFormSuggestions(supabase, currentBusinessId);
      setSubjectOptions(subjects);
      setTeacherOptions(teachers);
    }
    if (!currentBusinessId.includes("sine")) {
      loadSuggestions();
    }
  }, [currentBusinessId, supabase]);

  // ==========================================
  // 🚗 拦截器：驾校模式下不需要此页面，直接引导去排课
  // ==========================================
  if (currentBusinessId.includes('sine')) {
    return (
      <div className="min-h-screen bg-slate-50 font-sans text-slate-900 pb-24 md:pb-10">
        <div className="hidden md:block"><Navbar /></div>
        <main className="mx-auto max-w-xl px-4 py-20 text-center">
           <div className="mx-auto h-20 w-20 bg-indigo-100 text-indigo-600 rounded-full flex items-center justify-center mb-6 shadow-sm">
              <Car className="h-10 w-10" />
           </div>
           <h1 className="text-2xl font-black text-slate-900 mb-3">驾校模式专属流程</h1>
           <p className="text-slate-500 mb-8 leading-relaxed">
             为了提高效率，驾校业务采用了<strong className="text-indigo-600">“极速排课”</strong>模式。<br/>
             您不需要在此单独录入学员档案，请直接去排课，<br/>系统会在排课时自动为新学员建档。
           </p>
           <Button onClick={() => router.push('/bookings/quick')} className="h-14 px-8 rounded-2xl bg-indigo-600 hover:bg-indigo-700 font-bold text-base shadow-lg shadow-indigo-200 transition-all active:scale-95">
             前往极速排课 &rarr;
           </Button>
        </main>
        <MobileDock />
      </div>
    );
  }

  // ==========================================
  // 📚 教培模式：标准的档案创建流程
  // ==========================================
  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    const formData = new FormData(e.currentTarget);
    formData.append("businessId", currentBusinessId);
    formData.append("level", level);
    formData.append("paymentType", paymentType);
    formData.append("currency", currency);
    formData.append("incomeSource", incomeSource);
    formData.set("subject", subject);
    formData.set("teacher", teacher);

    const res = await createStudent(null, formData);
    setLoading(false);

    if (res?.error) {
      toast.error("创建失败: " + res.error);
    } else {
      toast.success("学员档案创建成功");
      router.push("/students");
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-900 pb-24 md:pb-10">
      
      {/* 1. Desktop Navbar */}
      <div className="hidden md:block"><Navbar /></div>

      <main className="mx-auto max-w-2xl px-3 py-3 md:px-6 md:py-8">
        
        {/* 2. Header */}
        <div className="flex items-center gap-2 mb-3 md:gap-3 md:mb-6">
          <Button variant="outline" size="icon" className="h-9 w-9 rounded-lg md:h-10 md:w-10 md:rounded-xl bg-white border-slate-200 shadow-sm hover:bg-slate-50" onClick={() => router.back()}>
            <ArrowLeft className="h-5 w-5 text-slate-600" />
          </Button>
          <div>
            <h1 className="text-lg md:text-xl font-black text-slate-900">录入新学员</h1>
            <p className="text-xs text-slate-400 font-medium">Create New Profile</p>
          </div>
        </div>

        {/* 3. Form Card */}
        <Card className="p-3 md:p-6 md:p-8 rounded-xl md:rounded-3xl shadow-sm border-slate-200 bg-white">
          <form onSubmit={handleSubmit} className="space-y-8">
            
            {/* Section 1: Basic Info */}
            <div className="space-y-4">
               <div className="flex items-center gap-2 text-slate-900 font-bold text-sm">
                 <User className="h-4 w-4 text-indigo-500" /> 基本信息
               </div>
               <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-xs text-slate-500">学员姓名 (Name)</Label>
                  <Input name="name" placeholder="例如: Michael Wang" required className="h-10 md:h-11 rounded-xl bg-slate-50 border-slate-200 focus-visible:ring-indigo-500" />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs text-slate-500">学员编号 (Student ID)</Label>
                  <Input name="studentId" placeholder="例如: S2026001" className="h-10 md:h-11 rounded-xl bg-slate-50 border-slate-200 focus-visible:ring-indigo-500" />
                </div>
              </div>
            </div>

            <div className="h-px bg-slate-100" />

            {/* Section 2: Financial Config */}
            <div className="space-y-4">
               <div className="flex items-center gap-2 text-slate-900 font-bold text-sm">
                 <Wallet className="h-4 w-4 text-emerald-500" /> 账户配置
               </div>
               <div className="bg-slate-50/50 p-4 rounded-2xl border border-slate-100 grid grid-cols-2 gap-4">
                  <div className="space-y-2 col-span-2">
                    <Label className="text-xs text-slate-500">课时费率</Label>
                    <div className="flex gap-2">
                      <div className="relative flex-1">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-bold">
                          {currencySymbol(currency)}
                        </span>
                        <Input 
                          name="hourlyRate" 
                          type="number" 
                          value={hourlyRate}
                          onChange={(e) => setHourlyRate(e.target.value)}
                          className="h-10 md:h-11 pl-7 rounded-xl border-slate-200 bg-white" 
                        />
                      </div>
                      <Select value={currency} onValueChange={(v) => setCurrency(v as Currency)}>
                        <SelectTrigger className="h-10 md:h-11 w-[120px] rounded-xl border-slate-200 bg-white font-bold text-xs shrink-0">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {CURRENCY_OPTIONS.map((c) => (
                            <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <p className="text-[10px] text-slate-400">费率与后续充值流水默认使用此币种</p>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs text-slate-500">初始课时 (Balance)</Label>
                    <div className="relative">
                      <Input 
                        name="balance" 
                        type="number" 
                        value={balance}
                        onChange={(e) => setBalance(e.target.value)}
                        className="h-10 md:h-11 pr-10 rounded-xl border-slate-200 bg-white" 
                        placeholder="0"
                      />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400 font-bold">Hrs</span>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs text-slate-500">缴费类型</Label>
                    <Select value={paymentType} onValueChange={setPaymentType}>
                      <SelectTrigger className="h-10 md:h-11 rounded-xl border-slate-200 bg-white">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {PAYMENT_TYPE_OPTIONS.map((opt) => (
                          <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2 col-span-2">
                    <Label className="text-xs text-slate-500">默认收款来源</Label>
                    <Select value={incomeSource} onValueChange={setIncomeSource}>
                      <SelectTrigger className="h-10 md:h-11 rounded-xl border-slate-200 bg-white">
                        <SelectValue placeholder="选择该学员通常付款到哪里" />
                      </SelectTrigger>
                      <SelectContent className="max-h-72">
                        {INCOME_SOURCE_OPTIONS.map((source) => (
                          <SelectItem key={source} value={source}>{source}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="text-[10px] text-slate-400">后续为该学员充值时，会自动把这项写入财务流水的“收入来源”。</p>
                  </div>
               </div>
            </div>

            <div className="h-px bg-slate-100" />

            {/* Section 3: Academic Info */}
            <div className="space-y-4">
               <div className="flex items-center gap-2 text-slate-900 font-bold text-sm">
                 <GraduationCap className="h-4 w-4 text-indigo-500" /> 学术信息
               </div>
               <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label className="text-xs text-slate-500">当前年级 (Level)</Label>
                    <Select value={level} onValueChange={setLevel}>
                      <SelectTrigger className="h-10 md:h-11 rounded-xl bg-slate-50 border-slate-200">
                        <SelectValue placeholder="选择年级..." />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Year 9">Year 9</SelectItem>
                        <SelectItem value="Year 10">Year 10</SelectItem>
                        <SelectItem value="Year 11">Year 11</SelectItem>
                        <SelectItem value="Year 12">Year 12</SelectItem>
                        <SelectItem value="Year 13">Year 13</SelectItem>
                        <SelectItem value="University">University</SelectItem>
                        <SelectItem value="Adult">Adult</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs text-slate-500">学习科目 (Subject)</Label>
                    <CreatableCombobox
                      name="subject"
                      value={subject}
                      onChange={setSubject}
                      options={subjectOptions}
                      placeholder="例如: NCEA L1 Math"
                      inputClassName="h-10 md:h-11 rounded-xl bg-slate-50 border-slate-200"
                    />
                  </div>
                  <div className="space-y-2 md:col-span-2">
                    <Label className="text-xs text-slate-500">负责老师 (Teacher)</Label>
                    <CreatableCombobox
                      name="teacher"
                      value={teacher}
                      onChange={setTeacher}
                      options={teacherOptions}
                      placeholder="例如: Henry Liu"
                      inputClassName="h-10 md:h-11 rounded-xl bg-slate-50 border-slate-200"
                    />
                  </div>
               </div>
            </div>

            <Button type="submit" className="w-full h-11 md:h-12 rounded-xl text-base font-bold bg-indigo-600 hover:bg-indigo-700 shadow-lg shadow-indigo-200 mt-4 transition-all active:scale-[0.98]" disabled={loading}>
              {loading ? <Loader2 className="animate-spin" /> : "确认创建档案"}
            </Button>
          </form>
        </Card>

      </main>

      <MobileDock />
    </div>
  );
}