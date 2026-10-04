import { createClient } from "@/lib/supabase/server";
import { Navbar } from "@/components/Navbar";
import { BookingList, BookingsCta } from "./booking-list";
import { Calendar as CalendarIcon } from "lucide-react";
import { MobileDock } from "@/components/MobileDock";

const BOOKINGS_PAGE_SIZE = 1000;

export default async function BookingsPage() {
  const supabase = await createClient();

  // Supabase/PostgREST can cap a single select at 1000 rows.
  // Fetch all bookings in pages so future bookings are not silently truncated
  // once the table grows past the API's per-request row limit.
  const bookings: any[] = [];
  let from = 0;

  while (true) {
    const { data, error } = await supabase
      .from("bookings")
      .select(`
        *,
        student:students ( id, name, teacher, subject, hourly_rate, student_code, currency )
      `)
      .order("start_time", { ascending: true })
      .range(from, from + BOOKINGS_PAGE_SIZE - 1);

    if (error) {
      console.error("Failed to load bookings:", error);
      break;
    }

    const page = data || [];
    bookings.push(...page);

    if (page.length < BOOKINGS_PAGE_SIZE) break;
    from += BOOKINGS_PAGE_SIZE;
  }

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
