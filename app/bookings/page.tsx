import { createClient } from "@/lib/supabase/server";
import { Navbar } from "@/components/Navbar";
import { BookingList, BookingsCta } from "./booking-list";
import { Calendar as CalendarIcon } from "lucide-react";
import { MobileDock } from "@/components/MobileDock";

export default async function BookingsPage() {
  const supabase = await createClient();

  // ✅ 核心修改：增加了 hourly_rate, student_code
  const { data: bookings } = await supabase
    .from("bookings")
    .select(`
      *,
      student:students ( id, name, teacher, subject, hourly_rate, student_code, currency )
    `)
    .order("start_time", { ascending: true });

  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-900 pb-24 md:pb-10">
      
      <div className="hidden md:block"><Navbar /></div>

      <main className="mx-auto max-w-3xl px-4 md:px-6 py-5 md:py-8">
        <div className="mb-5 flex flex-col gap-3 sm:mb-6 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <h1 className="flex items-center gap-2 text-xl font-black tracking-tight text-slate-900 sm:text-2xl">
              <CalendarIcon className="h-6 w-6 text-indigo-600" />
              课程管理 (Schedule)
            </h1>
            <p className="mt-1 pl-8 text-[11px] font-bold uppercase tracking-wider text-slate-400 sm:text-xs">
              Manage Bookings & Timesheets
            </p>
          </div>

          <BookingsCta />
        </div>

        <BookingList bookings={bookings || []} />

      </main>

      <MobileDock />
    </div>
  );
}