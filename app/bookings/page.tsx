import { createClient } from "@/lib/supabase/server";
import { Navbar } from "@/components/Navbar";
import { BookingList, BookingsCta } from "./booking-list";
import { Calendar as CalendarIcon } from "lucide-react";
import { MobileDock } from "@/components/MobileDock";
import { cookies } from "next/headers";
import { addCalendarMonthsInNZ, getTodayInNZ, nzLocalToUtc } from "@/lib/timezone";

const BOOKINGS_PAGE_SIZE = 1000;

export default async function BookingsPage({ searchParams }: { searchParams: Promise<{ from?: string; to?: string }> }) {
  const params = await searchParams;
  const today = getTodayInNZ();
  const defaultFrom = addCalendarMonthsInNZ(today.slice(0, 8) + "01", -3);
  const defaultTo = addCalendarMonthsInNZ(today.slice(0, 8) + "01", 4);
  const validDate = (value: string | undefined, fallback: string) => value && /^\\d{4}-\\d{2}-\\d{2}$/.test(value) && !Number.isNaN(Date.parse(value)) ? value : fallback;
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

      <main className="mx-auto max-w-6xl px-2.5 py-2 md:px-5 md:py-5">
        <div className="mb-2 flex flex-row items-center justify-between gap-2 sm:mb-3 sm:items-center sm:justify-between">
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

        <form method="get" className="mb-3 flex flex-wrap items-end gap-2 rounded-xl border border-slate-200 bg-white p-3">
          <label className="text-xs font-semibold text-slate-600">开始日期<input type="date" name="from" defaultValue={lower} className="mt-1 block rounded-lg border border-slate-200 px-2 py-1.5 text-sm"/></label>
          <label className="text-xs font-semibold text-slate-600">结束日期<input type="date" name="to" defaultValue={upper} className="mt-1 block rounded-lg border border-slate-200 px-2 py-1.5 text-sm"/></label>
          <button type="submit" className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white">查询</button>
          <span className="text-xs text-slate-500">按日期区间加载，当前 {bookings.length} 条</span>
        </form>
        <BookingList bookings={bookings} />

      </main>

      <MobileDock />
    </div>
  );
}
