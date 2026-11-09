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
  const {data:{user}}=await supabase.auth.getUser();
  const {data:members}=user
    ?await supabase.from("erp_memberships").select("business_unit_id,role").eq("user_id",user.id)
    :{data:[]};
  const coreOwner=!!members?.some(m=>m.business_unit_id==="cus"&&m.role==="owner");
  const canCreateStudent=coreOwner||
    (businessId==="astra"&&!!members?.some(m=>m.business_unit_id==="astra"&&
      (m.role==="owner"||m.role==="admin")));

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

  if (businessId === "tangent") {
    studentQuery = studentQuery.in("business_unit_id", ["cus", "sine"]);
    confirmedQuery = confirmedQuery.in("business_unit_id", ["cus", "sine"]);
    recentQuery = recentQuery.in("business_unit_id", ["cus", "sine"]);
  } else {
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

      <main className="mx-auto max-w-[1480px] px-3 py-3 md:px-5 md:py-5">
        
        {/* 智能列表：将带 start_time 的数据传给子组件进行沉睡名单过滤 */}
        <StudentList students={students || []} canCreateStudent={canCreateStudent} />

      </main>

      <MobileDock />
    </div>
  );
}