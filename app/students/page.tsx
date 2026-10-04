import { createClient } from "@/lib/supabase/server";
import { StudentList } from "./student-list"; 
import { Navbar } from "@/components/Navbar"; 
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { Plus, Users } from "lucide-react";
import { MobileDock } from "@/components/MobileDock";

export default async function StudentsPage() {
  const supabase = await createClient();

  // ✅ 核心修改：联表查询 bookings 时，带上 start_time 字段
  // 这样前端的 student-list 才能计算该学员在过去 30 天内是否排过课
  const { data: students } = await supabase
    .from("students")
    .select(`
      *,
      bookings (
        duration,
        status,
        start_time
      )
    `)
    .order("created_at", { ascending: false });

  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-900 pb-24 md:pb-10">
      
      <div className="hidden md:block"><Navbar /></div>

      <main className="mx-auto max-w-7xl px-3 py-3 md:px-6 md:py-8">
        
        {/* Header */}
        <div className="flex items-center justify-between mb-3 md:mb-6">
          <div>
            <h1 className="text-lg md:text-2xl font-black tracking-tight text-slate-900 flex items-center gap-2">
              <Users className="h-5 w-5 md:h-6 md:w-6 text-indigo-600" />
              学员管理 (Students)
            </h1>
            <p className="text-[9px] md:text-xs font-bold text-slate-400 mt-0.5 uppercase tracking-wider pl-7 md:pl-8">
              Directory & Balance
            </p>
          </div>
          <Link href="/students/new">
            <Button className="rounded-xl bg-indigo-600 font-bold shadow-lg shadow-indigo-200 hover:bg-indigo-700 h-9 w-9 md:h-10 md:w-10 p-0 active:scale-95 transition-transform">
              <Plus className="h-5 w-5" />
            </Button>
          </Link>
        </div>

        {/* 智能列表：将带 start_time 的数据传给子组件进行沉睡名单过滤 */}
        <StudentList students={students || []} />

      </main>

      <MobileDock />
    </div>
  );
}