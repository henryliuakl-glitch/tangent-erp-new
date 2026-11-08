import { createClient } from "@/lib/supabase/server";
import { Suspense } from "react";
import { ClassSessionsStrip } from "./class-sessions-strip";
import { Navbar } from "@/components/Navbar";
import { BookingList, BookingsCta } from "./booking-list";
import { BookingsDateRange } from "./date-range-filter";
import { MobileDock } from "@/components/MobileDock";
import { cookies } from "next/headers";
import { addCalendarMonthsInNZ, getTodayInNZ, nzLocalToUtc } from "@/lib/timezone";

const BOOKINGS_PAGE_SIZE = 1000;

export default async function BookingsPage({ searchParams }: { searchParams: Promise<{ from?: string; to?: string }> }) {
  const params = await searchParams;
  const today = getTodayInNZ();
  const defaultFrom = addCalendarMonthsInNZ(today.slice(0, 8) + "01", -1);
  const defaultTo = addCalendarMonthsInNZ(today.slice(0, 8) + "01", 2);
  const validDate = (value: string | undefined, fallback: string) => value && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value)) ? value : fallback;
  const fromDate = validDate(params.from, defaultFrom);
  const toDate = validDate(params.to, defaultTo);
  const lower = fromDate <= toDate ? fromDate : toDate;
  const upper = fromDate <= toDate ? toDate : fromDate;
  const fromIso = nzLocalToUtc(lower, "00:00").toISOString();
  const toIso = nzLocalToUtc(upper, "23:59:59").toISOString();
  const supabase = await createClient();
  const cookieStore = await cookies();
  const businessId = cookieStore.get("businessId")?.value || "cus";

  // 日程页不再做 bookings -> students 的数据库嵌套 join。
  // 这样可以避免 students 可选字段（如 income_source）schema cache 不一致时整页直接变空。
  // 并行读取 bookings 和当前实体 students，最后在服务端按 student_id 合并。
  const studentsPromise = (async () => {
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

    return students;
  })();

  const rawBookings: any[] = [];
  let from = 0;

  while (true) {
    let query = supabase
      .from("bookings")
      .select("id,student_id,start_time,end_time,duration,status,location,notes,subject,teacher,actual_rate,metadata,business_unit_id")
      .gte("start_time", fromIso)
      .lte("start_time", toIso)
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


  const students = await studentsPromise;

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

      <main className="mx-auto max-w-[1600px] px-3 py-2 md:px-5 md:py-4">
        <BookingList bookings={bookings} toolbar={<div className="flex w-full min-w-0 items-center gap-1.5 md:w-auto md:shrink-0 md:gap-2">
          <h1 className="shrink-0 text-[18px] font-extrabold tracking-tight text-[#232643]">排课</h1>
          <BookingsDateRange from={lower} to={upper}/>
          <BookingsCta/>
        </div>}
        afterToolbar={["cus","astra","tangent"].includes(businessId)&&
          <Suspense fallback={null}><ClassSessionsStrip fromIso={fromIso} toIso={toIso} businessId={businessId==="astra"?"astra":"cus"}/></Suspense>}/>


      </main>

      <MobileDock />
    </div>
  );
}
