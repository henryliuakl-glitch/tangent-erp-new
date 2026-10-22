import { createClient } from "@/lib/supabase/server";
import { Navbar } from "@/components/Navbar";
import { BookingList, BookingsCta } from "./booking-list";
import { Calendar as CalendarIcon } from "lucide-react";
import { MobileDock } from "@/components/MobileDock";
import { cookies } from "next/headers";

const BOOKINGS_PAGE_SIZE = 1000;

export default async function BookingsPage() {
  const supabase = await createClient();
  const cookieStore = await cookies();
  const businessId = cookieStore.get("businessId")?.value || "cus";

  // 日程页不再做 bookings -> students 的数据库嵌套 join。
  // 这样可以避免 students 可选字段（如 income_source）schema cache 不一致时整页直接变空。
  // 先分页取 bookings，再一次性取当前实体 students，最后在服务端按 student_id 合并。
  const rawBookings: any[] = [];
  let from = 0;

  while (true) {
    let query = supabase
      .from("bookings")
      .select("id,student_id,start_time,end_time,duration,status,location,notes,subject,teacher,actual_rate,metadata,business_unit_id")
      .order("start_time", { ascending: true })
      .range(from, from + BOOKINGS_PAGE_SIZE - 1);

    if (businessId === "tangent") {
      query = query.in("business_unit_id", ["cus", "sine"]);
    } else {
      query = query.eq("business_unit_id", businessId);
    }

    const { data, error } = await query;

    if (error) {
      console.error("Failed to load bookings:", error);
      break;
    }

    const page = data || [];
    rawBookings.push(...page);

    if (page.length < BOOKINGS_PAGE_SIZE) break;
    from += BOOKINGS_PAGE_SIZE;
  }

  let studentsQuery = supabase
    .from("students")
    .select("id,name,teacher,subject,hourly_rate,student_code,currency,payment_type,income_source,business_unit_id");

  if (businessId === "tangent") {
    studentsQuery = studentsQuery.in("business_unit_id", ["cus", "sine"]);
  } else {
    studentsQuery = studentsQuery.eq("business_unit_id", businessId);
  }

  let { data: students, error: studentsError } = await studentsQuery;

  if (
    studentsError &&
    /income_source|schema cache|column/i.test(studentsError.message || "")
  ) {
    let fallbackQuery = supabase
      .from("students")
      .select("id,name,teacher,subject,hourly_rate,student_code,currency,payment_type,business_unit_id");

    if (businessId === "tangent") {
      fallbackQuery = fallbackQuery.in("business_unit_id", ["cus", "sine"]);
    } else {
      fallbackQuery = fallbackQuery.eq("business_unit_id", businessId);
    }

    const fallback = await fallbackQuery;
    students = (fallback.data || []).map((student: any) => ({
      ...student,
      income_source: null,
    })) as any;
    studentsError = fallback.error;
  }

  if (studentsError) {
    console.error("Failed to load booking students:", studentsError);
  }

  const studentsById = new Map(
    (students || []).map((student: any) => [student.id, student])
  );

  const bookings = rawBookings.map((booking: any) => ({
    ...booking,
    student: booking.student_id ? studentsById.get(booking.student_id) || null : null,
  }));

  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-900 pb-24 md:pb-10">
      
      <div className="hidden md:block"><Navbar /></div>

      <main className="mx-auto max-w-4xl px-2.5 py-2 md:px-6 md:py-8">
        <div className="mb-2 flex flex-row items-center justify-between gap-2 sm:mb-5 sm:items-center sm:justify-between">
          <div className="min-w-0">
            <h1 className="flex items-center gap-1.5 text-[17px] font-black tracking-tight text-slate-900 sm:gap-2 sm:text-2xl">
              <CalendarIcon className="h-4.5 w-4.5 text-indigo-600 sm:h-5 sm:w-5" />
              课程管理 (Schedule)
            </h1>
            <p className="mt-0.5 hidden pl-7 text-[9px] font-bold uppercase tracking-wider text-slate-400 sm:block sm:text-xs">
              Manage Bookings & Timesheets
            </p>
          </div>

          <BookingsCta />
        </div>

        <BookingList bookings={bookings} />

      </main>

      <MobileDock />
    </div>
  );
}
