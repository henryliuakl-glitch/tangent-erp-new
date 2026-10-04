"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useBusiness } from "@/contexts/BusinessContext";
import { createTransaction } from "../actions";
import { createReimbursement } from "../reimburse/actions";
import { createClient } from "@/lib/supabase/client";

import { Navbar } from "@/components/Navbar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ArrowLeft, Camera, Loader2, CheckCircle2, User, Clock, Receipt } from "lucide-react";
import { toast } from "sonner"; 
import { CURRENCY_OPTIONS, currencySymbol, type Currency } from "@/lib/currency"; 
import { MobileDock } from "@/components/MobileDock";
import { getTodayInNZ } from "@/lib/timezone";
import { REIMBURSE_CATEGORIES, REIMBURSE_CLAIMANTS } from "@/lib/reimbursement";
import { defaultCoachForEmail } from "@/lib/driving-booking-text";
import { IncomeSourceSelect } from "@/components/IncomeSourceSelect";

export default function AddTransactionPage() {
  const router = useRouter();
  const { currentBusinessId, currentLabel } = useBusiness();
  const isTangent = currentBusinessId === "tangent";
  const [targetBusinessId, setTargetBusinessId] = useState<"cus" | "sine">("cus");
  const effectiveBusinessId = isTangent ? targetBusinessId : currentBusinessId;
  const supabase = createClient();
  
  const [isLoading, setIsLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  
  const [students, setStudents] = useState<any[]>([]); 
  
  // 表单状态
  const [amount, setAmount] = useState("");
  const [mode, setMode] = useState<"income" | "expense" | "reimburse">("expense"); 
  const [category, setCategory] = useState("");
  const [currency, setCurrency] = useState<Currency>("NZD");
  const [date, setDate] = useState(() => getTodayInNZ());
  const [description, setDescription] = useState("");
  const [proofUrl, setProofUrl] = useState("");
  const [claimant, setClaimant] = useState("");
  const [incomeSource, setIncomeSource] = useState("");
  
  // 关联表单状态
  const [selectedStudent, setSelectedStudent] = useState("");
  const [hoursToAdd, setHoursToAdd] = useState("");

  // 1. 进入页面自动加载学生列表
  useEffect(() => {
    async function fetchStudents() {
      if (!effectiveBusinessId) return;
      const { data } = await supabase
        .from("students")
        .select("id, name, student_code, income_source")
        .eq("business_unit_id", effectiveBusinessId)
        .order("name");
      
      if (data) setStudents(data);
    }
    fetchStudents();
  }, [effectiveBusinessId, supabase]);

  // ✅ 2. 核心新增：自动生成备注逻辑
  useEffect(() => {
    // 只有在【收入】且【Tuition】且【已选学生】时才自动填充
    if (mode === 'income' && category === 'Tuition' && selectedStudent) {
      const student = students.find(s => s.id === selectedStudent);
      if (student) {
        if (student.income_source) setIncomeSource(student.income_source);
        const hours = hoursToAdd || '0';
        const codePart = student.student_code ? `[${student.student_code}] ` : '';
        // 自动生成的格式：学员充值: [S123] Name (+10课时)
        const autoNote = `学员充值: ${codePart}${student.name} (+${hours}课时)`;
        setDescription(autoNote);
      }
    }
  }, [selectedStudent, hoursToAdd, mode, category, students]); // 依赖项：这些变了就重新生成

  const incomeCategories = [
    { value: "Tuition", label: "🎓 课程收入 (Tuition)" },
    { value: "Services", label: "🛠️ 其他服务 (Services)" },
    { value: "Investment", label: "📈 投资收益 (Investment)" },
  ];

  const expenseCategories = [
    { value: "Wages", label: "👨‍🏫 员工工资 (Wages)" },
    { value: "Rent", label: "🏠 场地租金 (Rent)" },
    { value: "Software", label: "💻 软件订阅 (Software)" },
    { value: "Marketing", label: "📣 市场推广 (Marketing)" },
    { value: "Other", label: "📦 其他支出 (Other)" },
  ];

  const currentCategories = mode === 'income' ? incomeCategories : mode === 'reimburse' ? REIMBURSE_CATEGORIES.map((c) => ({ value: c.value, label: c.label })) : expenseCategories;

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) return;
      const { data: profile } = await supabase
        .from("profiles")
        .select("full_name")
        .eq("id", user.id)
        .maybeSingle();
      const name = profile?.full_name?.trim();
      setClaimant(name || defaultCoachForEmail(user.email));
    });
  }, [supabase]);

  const handleTypeChange = (val: string) => {
    setMode(val as "income" | "expense" | "reimburse");
    setCategory(val === "reimburse" ? "Fuel" : ""); 
    setSelectedStudent(""); 
    setHoursToAdd("");
    setDescription("");
    setIncomeSource("");
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) return;
    setUploading(true);
    const file = e.target.files[0];
    const fileExt = file.name.split(".").pop();
    const fileName = `${Date.now()}.${fileExt}`;
    const filePath = `${effectiveBusinessId}/${fileName}`;

    const { error: uploadError } = await supabase.storage.from("receipts").upload(filePath, file);
    if (uploadError) {
      toast.error("图片上传失败");
      setUploading(false);
      return;
    }
    const { data: { publicUrl } } = supabase.storage.from("receipts").getPublicUrl(filePath);
    setProofUrl(publicUrl);
    setUploading(false);
    toast.success("凭证上传成功");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (mode === "reimburse") {
      if (!amount || !category || !claimant) {
        toast.warning("请填写垫付人、金额和分类");
        return;
      }
      setIsLoading(true);
      const formData = new FormData();
      formData.append("amount", amount);
      formData.append("category", category);
      formData.append("claimant", claimant);
      formData.append("date", date);
      formData.append("notes", description);
      formData.append("businessId", effectiveBusinessId);
      formData.append("currency", currency);
      if (proofUrl) formData.append("proofUrl", proofUrl);
      const result = await createReimbursement(formData);
      setIsLoading(false);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success("已提交待打款，尚未计入净现金流");
      router.push("/finance/reimburse");
      return;
    }

    if (!amount || !category) {
      toast.warning("请填写金额和分类");
      return;
    }
    if (mode === "income" && !incomeSource) {
      toast.warning("请选择收入来源");
      return;
    }

    setIsLoading(true);

    const formData = new FormData();
    formData.append("amount", amount);
    formData.append("type", mode);
    formData.append("category", category);
    formData.append("currency", currency);
    formData.append("date", date);
    formData.append("description", description);
    formData.append("businessId", effectiveBusinessId);
    if (mode === "income" && incomeSource) formData.append("incomeSource", incomeSource);
    if (proofUrl) formData.append("proofUrl", proofUrl);
    
    // 提交关联数据
    if (mode === 'income' && category === 'Tuition' && selectedStudent) {
      formData.append("studentId", selectedStudent);
      if (hoursToAdd) formData.append("hoursToAdd", hoursToAdd);
    }

    const result = await createTransaction(null, formData);
    setIsLoading(false);

    if (result && 'error' in result && result.error) {
      toast.error(`保存失败: ${result.error}`);
    } else {
      const successMsg = (mode === 'income' && hoursToAdd) 
        ? `入账成功，且已为学生充值 ${hoursToAdd} 课时！` 
        : "记账成功！";
      toast.success(successMsg);
      router.push("/finance"); 
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-900 pb-24 md:pb-10">
      
      <div className="hidden md:block"><Navbar /></div>

      <main className="mx-auto max-w-xl px-3 py-3 md:px-6 md:py-8">
        
        {/* Header */}
        <div className="mb-3 md:mb-6 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button variant="outline" size="icon" className="h-9 w-9 rounded-lg md:h-10 md:w-10 md:rounded-xl bg-white border-slate-200 shadow-sm hover:bg-slate-50 hover:-translate-y-px transition-all" onClick={() => router.back()}>
              <ArrowLeft className="h-5 w-5 text-slate-600" />
            </Button>
            <div>
              <h1 className="text-lg md:text-xl font-black text-slate-900">{mode === "reimburse" ? "报销" : "记一笔"}</h1>
              <p className="text-xs text-slate-400 font-medium">
                {mode === "reimburse" ? "提交后待打款，不计入净现金流" : "New Transaction"}
              </p>
            </div>
          </div>
          {mode === "reimburse" ? (
            <Button variant="outline" className="h-9 rounded-xl text-xs font-bold" onClick={() => router.push("/finance/reimburse")}>
              待打款列表
            </Button>
          ) : (
          <div className="hidden md:block">
             <Badge variant="outline" className="bg-white text-indigo-600 border-indigo-200">
               {isTangent ? (effectiveBusinessId === "cus" ? "Tangent · CuS" : "Tangent · Sine") : currentLabel}
             </Badge>
          </div>
          )}
        </div>

        <div className="rounded-xl md:rounded-3xl border border-slate-200 bg-white p-3 md:p-6 shadow-sm">
          <form onSubmit={handleSubmit} className="space-y-3 md:space-y-6">
            

            {isTangent && (
              <div className="grid grid-cols-2 gap-1 rounded-xl border border-slate-200 bg-slate-50 p-1">
                <button
                  type="button"
                  onClick={() => {
                    setTargetBusinessId("cus");
                    setSelectedStudent("");
                  }}
                  className={`h-9 rounded-lg text-xs font-bold transition-all ${
                    targetBusinessId === "cus"
                      ? "bg-indigo-600 text-white shadow-sm"
                      : "text-slate-500 hover:bg-white"
                  }`}
                >
                  CuS 教培
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setTargetBusinessId("sine");
                    setSelectedStudent("");
                  }}
                  className={`h-9 rounded-lg text-xs font-bold transition-all ${
                    targetBusinessId === "sine"
                      ? "bg-slate-950 text-white shadow-sm"
                      : "text-slate-500 hover:bg-white"
                  }`}
                >
                  Sine 驾校
                </button>
              </div>
            )}

            {/* Type Switcher */}
            <Tabs value={mode} onValueChange={handleTypeChange} className="w-full">
              <TabsList className="mx-auto grid h-10 md:h-12 w-full max-w-md grid-cols-3 rounded-xl md:rounded-2xl bg-slate-100 p-1">
                <TabsTrigger value="expense" className="rounded-lg text-xs md:text-sm font-bold data-[state=active]:bg-white data-[state=active]:text-rose-600 data-[state=active]:shadow-sm">支出</TabsTrigger>
                <TabsTrigger value="income" className="rounded-lg text-xs md:text-sm font-bold data-[state=active]:bg-white data-[state=active]:text-emerald-600 data-[state=active]:shadow-sm">收入</TabsTrigger>
                <TabsTrigger value="reimburse" className="rounded-lg text-xs md:text-sm font-bold data-[state=active]:bg-white data-[state=active]:text-amber-700 data-[state=active]:shadow-sm">报销</TabsTrigger>
              </TabsList>
            </Tabs>

            {/* Amount + Currency */}
            <div className="space-y-2">
              <div className="flex items-center justify-between pl-1">
                <Label className="text-xs text-slate-400 font-bold uppercase tracking-wider">金额 (Amount)</Label>
                <Select value={currency} onValueChange={(v) => setCurrency(v as Currency)}>
                  <SelectTrigger className="h-8 w-[120px] rounded-lg text-xs font-bold border-slate-200">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CURRENCY_OPTIONS.map((c) => (
                      <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="relative">
                <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-5">
                  <span className={`text-3xl font-black ${mode === 'income' ? 'text-emerald-500' : mode === 'reimburse' ? 'text-amber-600' : 'text-rose-500'}`}>{currencySymbol(currency)}</span>
                </div>
                <Input
                  type="number"
                  placeholder="0.00"
                  step="0.01"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="h-14 md:h-20 rounded-xl md:rounded-2xl border-slate-200 bg-slate-50 pl-10 text-3xl md:text-4xl font-black tracking-tight text-slate-900 focus-visible:ring-indigo-500 focus-visible:bg-white transition-all text-center"
                  autoFocus
                />
              </div>
            </div>

            {/* Category & Date */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-xs text-slate-400 font-bold uppercase tracking-wider pl-1">分类 (Category)</Label>
                <Select value={category} onValueChange={setCategory}>
                  <SelectTrigger className="h-12 rounded-xl border-slate-200 bg-white font-medium text-slate-700 focus:ring-indigo-500">
                    <SelectValue placeholder="选择分类..." />
                  </SelectTrigger>
                  <SelectContent className="rounded-xl border-slate-200 shadow-lg max-h-60">
                    {currentCategories.map((cat) => (
                      <SelectItem key={cat.value} value={cat.value} className="py-3 font-medium">
                        {cat.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label className="text-xs text-slate-400 font-bold uppercase tracking-wider pl-1">日期 (Date)</Label>
                <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="h-12 rounded-xl border-slate-200 bg-white font-medium text-slate-700 block" />
              </div>
            </div>

            {mode === "reimburse" && (
              <div className="space-y-2">
                <Label className="text-xs text-amber-600 font-bold uppercase tracking-wider pl-1">垫付人 (谁先付的)</Label>
                <Input
                  list="claimant-options"
                  value={claimant}
                  onChange={(e) => setClaimant(e.target.value)}
                  placeholder="例如：牛教练"
                  className="h-12 rounded-xl border-amber-200 bg-amber-50/40"
                />
                <datalist id="claimant-options">
                  {REIMBURSE_CLAIMANTS.map((c) => (
                    <option key={c} value={c} />
                  ))}
                </datalist>
                <p className="text-[11px] text-amber-700/80 pl-1">提交后进入待打款，确认打款才会记入支出。</p>
              </div>
            )}

            {/* 关联学生 + 充值面板 */}
            {mode === 'income' && category === 'Tuition' && (
              <div className="bg-indigo-50/50 border border-indigo-100 rounded-2xl p-4 space-y-4 animate-in fade-in zoom-in-95 duration-300">
                 <div className="flex items-center gap-2 text-indigo-700 font-bold text-sm">
                   <User className="h-4 w-4" /> 关联学员充值 (可选)
                 </div>
                 <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label className="text-xs text-indigo-400 font-bold">选择学员</Label>
                      <Select value={selectedStudent} onValueChange={setSelectedStudent}>
                        <SelectTrigger className="h-11 rounded-xl border-indigo-200 bg-white focus:ring-indigo-500">
                          <SelectValue placeholder="选择..." />
                        </SelectTrigger>
                        <SelectContent className="max-h-60">
                          {students.length > 0 ? (
                            students.map((s) => (
                              <SelectItem key={s.id} value={s.id}>
                                {s.name} {s.student_code ? `(${s.student_code})` : ''}
                              </SelectItem>
                            ))
                          ) : (
                            <div className="p-2 text-xs text-slate-400 text-center">无学员数据</div>
                          )}
                        </SelectContent>
                      </Select>
                    </div>
                    {selectedStudent && (
                      <div className="space-y-2">
                        <Label className="text-xs text-indigo-400 font-bold">增加课时 (Hours)</Label>
                        <div className="relative">
                          <Input 
                            type="number" 
                            placeholder="0" 
                            value={hoursToAdd} 
                            onChange={(e) => setHoursToAdd(e.target.value)} 
                            className="h-11 rounded-xl border-indigo-200 bg-white pr-8"
                          />
                          <Clock className="absolute right-3 top-3.5 h-4 w-4 text-indigo-300" />
                        </div>
                      </div>
                    )}
                 </div>
                 {selectedStudent && hoursToAdd && (
                   <p className="text-[10px] text-indigo-600 font-medium bg-indigo-100/50 p-2 rounded-lg text-center">
                     💡 保存后，将自动为 <strong>{students.find(s=>s.id===selectedStudent)?.name}</strong> 增加 {hoursToAdd} 课时
                   </p>
                 )}
              </div>
            )}

            {mode === "income" && (
              <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-3 md:p-4">
                <IncomeSourceSelect
                  value={incomeSource}
                  onChange={setIncomeSource}
                  label="收入来源"
                  placeholder="选择这笔钱实际收到了哪里"
                />
                <p className="mt-2 text-[10px] text-slate-400">
                  选择学员后，如果学员档案设置了默认收款来源，会自动带入；仍可在本次手动修改。
                </p>
              </div>
            )}

            {/* Receipt Upload */}
            <div className="space-y-2">
              <Label className="text-xs text-slate-400 font-bold uppercase tracking-wider pl-1">凭证 (Receipt)</Label>
              <div className={`relative flex w-full items-center justify-center rounded-xl border-2 border-dashed transition-all ${proofUrl ? 'border-emerald-400 bg-emerald-50 h-20' : 'border-slate-200 bg-slate-50 hover:bg-slate-100 h-24'}`}>
                <input type="file" accept="image/*" onChange={handleFileUpload} disabled={uploading} className="absolute inset-0 cursor-pointer opacity-0 z-10" />
                <div className="flex flex-col items-center gap-1 text-center">
                  {uploading ? <Loader2 className="h-6 w-6 animate-spin text-indigo-600" /> : proofUrl ? <div className="flex items-center gap-2 text-emerald-600"><CheckCircle2 className="h-5 w-5" /><span className="text-xs font-bold">已上传 (点击替换)</span></div> : <><div className="rounded-full bg-white p-2 text-indigo-600 shadow-sm border border-slate-100"><Camera className="h-5 w-5" /></div><span className="text-xs font-bold text-slate-400">拍照或上传</span></>}
                </div>
              </div>
            </div>

            {/* Notes */}
            <div className="space-y-2">
              <Label className="text-xs text-slate-400 font-bold uppercase tracking-wider pl-1">备注 (Notes)</Label>
              <Textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder={mode === "reimburse" ? "例如：Albany 练车油费" : "例如：支付给 Alex 的本周工资..."} className="resize-none rounded-xl border-slate-200 bg-slate-50 text-sm font-medium text-slate-700 focus-visible:bg-white transition-all" rows={3} />
            </div>

            <Button
              type="submit"
              disabled={isLoading || uploading}
              className={`h-11 md:h-14 w-full rounded-xl md:rounded-2xl text-sm md:text-base font-bold shadow-lg transition-all active:scale-[0.98] ${
                mode === "income"
                  ? "bg-emerald-600 hover:bg-emerald-700 shadow-emerald-200"
                  : mode === "reimburse"
                    ? "bg-amber-600 hover:bg-amber-700 shadow-amber-200"
                    : "bg-rose-600 hover:bg-rose-700 shadow-rose-200"
              }`}
            >
              {isLoading ? (
                <><Loader2 className="mr-2 h-5 w-5 animate-spin" /> 保存中...</>
              ) : mode === "reimburse" ? (
                <><Receipt className="mr-2 h-5 w-5" /> 提交待打款</>
              ) : selectedStudent && hoursToAdd ? (
                "保存并充值"
              ) : (
                "确认保存"
              )}
            </Button>
          </form>
        </div>
      </main>

      <MobileDock />
    </div>
  );
}