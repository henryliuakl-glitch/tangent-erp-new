import { createClient } from "@/lib/supabase/server";
import { StudentList } from "./student-list"; 
import { Navbar } from "@/components/Navbar"; 
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { Plus, Users } from "lucide-react";
import { MobileDock } from "@/components/MobileDock";
import { cookies } from "next/headers";

export default async function StudentsPage() {
  const supabase = await createClient();
  const cookieStore = await cookies();
  const businessId = cookieStore.get("businessId")?.value || "cus";

  let studentQuery = supabase
    .from("students")
    .select("*")
    .order("created_at", { ascending: false });

  let confirmedQuery = supabase
    .from("bookings")
    .select("student_id, duration, status, start_time")
    .eq("status", "confirmed");

  const recentCutoff = new Date(Date.now() - 15 * 24 * 60 * 60 * 1000).toISOString();
  let recentQuery = supabase
    .from("bookings")
    .select("student_id, duration, status, start_time")
    .gte("start_time", recentCutoff);

  if (businessId !== "tangent") {
    studentQuery = studentQuery.eq("business_unit_id", businessId);
    confirmedQuery = confirmedQuery.eq("business_unit_id", businessId);
    recentQuery = recentQuery.eq("business_unit_id", businessId);
  }

  const [
    { data: studentRows, error: studentError },
    { data: confirmedBookings, error: confirmedError },
    { data: recentBookings, error: recentError },
  ] = await Promise.all([studentQuery, confirmedQuery, recentQuery]);

  if (studentError) console.error("Failed to load students:", studentError.message);
  if (confirmedError) console.error("Failed to load confirmed bookings:", confirmedError.message);
  if (recentError) console.error("Failed to load recent bookings:", recentError.message);

  const bookingsByStudent = new Map<string, any[]>();
  for (const booking of [...(confirmedBookings || []), ...(recentBookings || [])]) {
    if (!booking.student_id) continue;
    const list = bookingsByStudent.get(booking.student_id) || [];
    if (!list.some((item) => item.start_time === booking.start_time && item.status === booking.status && item.duration === booking.duration)) {
      list.push(booking);
    }
    bookingsByStudent.set(booking.student_id, list);
  }

  const students = (studentRows || []).map((student) => ({
    ...student,
    bookings: bookingsByStudent.get(student.id) || [],
  }));

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