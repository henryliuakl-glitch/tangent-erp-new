"use client";

import { useState } from "react";
import { submitRegistration } from "./actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, CheckCircle2, BookOpen, GraduationCap } from "lucide-react";
import { toast } from "sonner";

export default function RegisterPage() {
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    const formData = new FormData(e.currentTarget);
    const res = await submitRegistration(formData);
    setLoading(false);

    if (res?.error) {
      toast.error(res.error);
    } else if (res?.success) {
      setSuccess(true);
      toast.success("提交成功！");
    }
  };

  if (success) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-6">
        <div className="bg-white rounded-3xl shadow-xl p-8 max-w-md w-full text-center space-y-6">
          <div className="h-20 w-20 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto mb-4">
            <CheckCircle2 className="h-10 w-10" />
          </div>
          <h1 className="text-2xl font-black text-slate-900">咨询已提交！</h1>
          <p className="text-slate-500">
            已收到您的课程咨询，我们核对信息后将联系您安排后续事宜。
          </p>
          <div className="rounded-xl bg-indigo-50 p-4 text-sm text-indigo-700">此步骤仅登记课程咨询，不代表已完成正式入学。</div>
          <p className="text-sm text-slate-400">
            我们的老师将尽快与您联系安排试课。
          </p>
          <Button onClick={() => window.location.href = "https://cusacademy.com"} className="w-full bg-slate-900 text-white rounded-xl h-12 font-bold mt-4">
            访问 CuS 智能题库
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-900">
      
      {/* Header */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-50">
        <div className="max-w-3xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 bg-slate-900 rounded-lg flex items-center justify-center text-white font-black text-sm">C</div>
            <span className="font-bold text-lg tracking-tight">CuS Academy</span>
          </div>
          <a href="https://cusacademy.com" target="_blank" className="text-sm font-bold text-indigo-600 hover:text-indigo-700">
            官网主页 &rarr;
          </a>
        </div>
      </header>

      <main className="max-w-xl mx-auto px-4 py-10">
        <div className="text-center mb-10 space-y-2">
          <h1 className="text-3xl font-black text-slate-900">新学员入学登记</h1>
          <p className="text-slate-500 font-medium">Student Registration Form</p>
        </div>

        <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-6 md:p-8">
          <form onSubmit={handleSubmit} className="space-y-8">
            <label className="absolute -left-[9999px]" aria-hidden="true">
              Leave this blank
              <input name="website" tabIndex={-1} autoComplete="off" />
            </label>
            
            {/* 1. 基本信息 */}
            <div className="space-y-4">
              <h3 className="text-sm font-bold text-indigo-600 uppercase tracking-wider flex items-center gap-2">
                <UserIcon /> 基本信息 (Basic Info)
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>学员姓名 (Name) *</Label>
                  <Input name="name" placeholder="请输入姓名" required className="rounded-xl h-11 bg-slate-50 border-slate-200" />
                </div>
                <div className="space-y-2">
                  <Label>联系电话 (Phone) *</Label>
                  <Input name="phone" placeholder="请输入手机号" required className="rounded-xl h-11 bg-slate-50 border-slate-200" />
                </div>
              </div>
              <div className="space-y-2">
                <Label>电子邮箱 (Email)</Label>
                <Input name="email" type="email" placeholder="接收学习报告用" className="rounded-xl h-11 bg-slate-50 border-slate-200" />
              </div>
            </div>

            <div className="h-px bg-slate-100" />

            {/* 2. 学习背景 */}
            <div className="space-y-4">
              <h3 className="text-sm font-bold text-indigo-600 uppercase tracking-wider flex items-center gap-2">
                <SchoolIcon /> 学习背景 (Academic)
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>在读学校 (School)</Label>
                  <Input name="school" placeholder="例如: Macleans College" className="rounded-xl h-11 bg-slate-50 border-slate-200" />
                </div>
                <div className="space-y-2">
                  <Label>当前年级 (Year Level)</Label>
                  <Select name="level">
                    <SelectTrigger className="rounded-xl h-11 bg-slate-50 border-slate-200">
                      <SelectValue placeholder="选择年级" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Year 9">Year 9</SelectItem>
                      <SelectItem value="Year 10">Year 10</SelectItem>
                      <SelectItem value="Year 11">Year 11 (NCEA L1)</SelectItem>
                      <SelectItem value="Year 12">Year 12 (NCEA L2 / AS)</SelectItem>
                      <SelectItem value="Year 13">Year 13 (NCEA L3 / A2)</SelectItem>
                      <SelectItem value="University">University</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-2">
                <Label>需要补习的科目 (Subject)</Label>
                <Input name="subject" placeholder="例如: NCEA L2 Math, Physics..." className="rounded-xl h-11 bg-slate-50 border-slate-200" />
              </div>
            </div>

            <div className="h-px bg-slate-100" />

            {/* 3. 学习目标 */}
            <div className="space-y-4">
              <h3 className="text-sm font-bold text-indigo-600 uppercase tracking-wider flex items-center gap-2">
                <TargetIcon /> 目标与期望 (Goals)
              </h3>
              
              <div className="space-y-3">
                <Label>补习主要目的 (Primary Goal)</Label>
                <RadioGroup name="goal" defaultValue="sync" className="grid grid-cols-2 gap-3">
                  <div className="flex items-center space-x-2 border border-slate-200 rounded-xl p-3 cursor-pointer hover:bg-slate-50 [&:has(:checked)]:border-indigo-600 [&:has(:checked)]:bg-indigo-50 transition-all">
                    <RadioGroupItem value="sync" id="r1" />
                    <Label htmlFor="r1" className="cursor-pointer font-medium">同步辅导 (Follow School)</Label>
                  </div>
                  <div className="flex items-center space-x-2 border border-slate-200 rounded-xl p-3 cursor-pointer hover:bg-slate-50 [&:has(:checked)]:border-indigo-600 [&:has(:checked)]:bg-indigo-50 transition-all">
                    <RadioGroupItem value="review" id="r2" />
                    <Label htmlFor="r2" className="cursor-pointer font-medium">查漏补缺 (Review)</Label>
                  </div>
                  <div className="flex items-center space-x-2 border border-slate-200 rounded-xl p-3 cursor-pointer hover:bg-slate-50 [&:has(:checked)]:border-indigo-600 [&:has(:checked)]:bg-indigo-50 transition-all">
                    <RadioGroupItem value="exam" id="r3" />
                    <Label htmlFor="r3" className="cursor-pointer font-medium">考前刷题 (Exam Prep)</Label>
                  </div>
                  <div className="flex items-center space-x-2 border border-slate-200 rounded-xl p-3 cursor-pointer hover:bg-slate-50 [&:has(:checked)]:border-indigo-600 [&:has(:checked)]:bg-indigo-50 transition-all">
                    <RadioGroupItem value="advance" id="r4" />
                    <Label htmlFor="r4" className="cursor-pointer font-medium">超前预习 (Advance)</Label>
                  </div>
                </RadioGroup>
              </div>

              <div className="grid grid-cols-2 gap-4">
                 <div className="space-y-2">
                   <Label>当前大概成绩</Label>
                   <Input name="currentGrade" placeholder="例如: Merit, B..." className="rounded-xl h-11 bg-slate-50 border-slate-200" />
                 </div>
                 <div className="space-y-2">
                   <Label>期望达成成绩</Label>
                   <Input name="targetGrade" placeholder="例如: Excellence, A*..." className="rounded-xl h-11 bg-slate-50 border-slate-200" />
                 </div>
              </div>

              <div className="space-y-2">
                <Label>其他备注 / 老师特殊要求</Label>
                <Textarea name="notes" placeholder="例如：希望老师严格一点，或者专注于几何部分..." className="rounded-xl bg-slate-50 border-slate-200 min-h-[100px]" />
              </div>
            </div>

            <Button type="submit" disabled={loading} className="w-full h-14 rounded-2xl bg-slate-900 hover:bg-slate-800 text-lg font-bold shadow-lg shadow-slate-200 transition-all active:scale-[0.98]">
              {loading ? <Loader2 className="animate-spin mr-2" /> : "提交注册 (Submit)"}
            </Button>

          </form>
        </div>
      </main>

      {/* Footer */}
      <footer className="py-10 text-center space-y-4 bg-slate-100 border-t border-slate-200">
         <div className="flex justify-center items-center gap-2 mb-2">
            <div className="h-6 w-6 bg-slate-300 rounded flex items-center justify-center text-slate-50 font-bold text-xs">C</div>
            <span className="font-bold text-slate-400">CuS Academy</span>
         </div>
         <p className="text-xs text-slate-400 max-w-sm mx-auto px-6">
           CuS Academy 专注于新西兰 NCEA / Cambridge / IB 课程辅导，结合自研智能题库系统，提供最科学的提分方案。
         </p>
         <div className="text-xs font-bold text-indigo-500 hover:underline">
           <a href="https://cusacademy.com">访问智能题库系统 (Engineering Logic) &rarr;</a>
         </div>
         <div className="text-[10px] text-slate-300 pt-4">
           Powered by Tangent ERP
         </div>
      </footer>
    </div>
  );
}

// Icons
const UserIcon = () => <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>;
const SchoolIcon = () => <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M22 10v6M2 10l10-5 10 5-10 5z"/><path d="M6 12v5c3 3 9 3 12 0v-5"/></svg>;
const TargetIcon = () => <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg>;