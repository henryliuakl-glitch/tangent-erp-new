"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight, CalendarDays, MapPin } from "lucide-react";
import {
  addCalendarDaysInNZ,
  addCalendarMonthsInNZ,
  getTodayInNZ,
  utcToNzDateKey,
  utcToNzTimeStr,
} from "@/lib/timezone";

type CalendarBooking = {
  id: string;
  start_time: string;
  end_time?: string | null;
  duration?: number | null;
  status?: string | null;
  location?: string | null;
  subject?: string | null;
  teacher?: string | null;
  business_unit_id?: string | null;
  metadata?: { coach?: string | null } | null;
  student?: {
    name?: string | null;
    student_code?: string | null;
    teacher?: string | null;
    subject?: string | null;
  } | null;
};

function monthTitle(monthKey: string) {
  const [y, m] = monthKey.split("-").map(Number);
  return `${y}年${m}月`;
}

function dayNumber(dateKey: string) {
  return Number(dateKey.slice(8, 10));
}

function weekdayLabel(dateKey: string) {
  const [y, m, d] = dateKey.split("-").map(Number);
  const day = new Date(Date.UTC(y, m - 1, d, 12)).getUTCDay();
  return ["星期日", "星期一", "星期二", "星期三", "星期四", "星期五", "星期六"][day];
}

function buildMonthGrid(monthKey: string) {
  const [year, month] = monthKey.split("-").map(Number);
  const firstKey = `${year}-${String(month).padStart(2, "0")}-01`;
  const firstDow = new Date(Date.UTC(year, month - 1, 1, 12)).getUTCDay();
  const gridStart = addCalendarDaysInNZ(firstKey, -firstDow);
  return Array.from({ length: 42 }, (_, i) => addCalendarDaysInNZ(gridStart, i));
}

function staffLabel(booking: CalendarBooking) {
  return booking.metadata?.coach || booking.teacher || booking.student?.teacher || "";
}

function accentFor(booking: CalendarBooking) {
  const name = staffLabel(booking).trim().toLowerCase();

  if (["牛教练", "henry", "henry老师", "coach henry"].includes(name)) {
    return {
      dot: "bg-blue-500",
      chip: "bg-blue-50 border-blue-200 text-blue-700",
    };
  }

  if (["童教练", "yvetta", "yvetta老师", "teacher yvetta"].includes(name)) {
    return {
      dot: "bg-amber-400",
      chip: "bg-amber-50 border-amber-200 text-amber-700",
    };
  }

  return {
    dot: booking.business_unit_id === "sine" ? "bg-sky-500" : "bg-violet-500",
    chip: "bg-slate-50 border-slate-200 text-slate-600",
  };
}

export function DashboardCalendar({
  bookings,
  businessId,
}: {
  bookings: CalendarBooking[];
  businessId: string;
}) {
  const todayKey = getTodayInNZ();
  const [selectedKey, setSelectedKey] = useState(todayKey);
  const [visibleMonth, setVisibleMonth] = useState(todayKey.slice(0, 7));

  const activeBookings = useMemo(
    () => (bookings || []).filter((b) => b.status !== "cancelled"),
    [bookings]
  );

  const byDate = useMemo(() => {
    const map = new Map<string, CalendarBooking[]>();

    for (const booking of activeBookings) {
      const key = utcToNzDateKey(booking.start_time);
      const list = map.get(key) || [];
      list.push(booking);
      map.set(key, list);
    }

    for (const list of map.values()) {
      list.sort(
        (a, b) =>
          new Date(a.start_time).getTime() - new Date(b.start_time).getTime()
      );
    }

    return map;
  }, [activeBookings]);

  const gridDays = useMemo(() => buildMonthGrid(visibleMonth), [visibleMonth]);
  const selectedBookings = byDate.get(selectedKey) || [];

  const moveMonth = (delta: number) => {
    const next = addCalendarMonthsInNZ(`${visibleMonth}-01`, delta).slice(0, 7);
    setVisibleMonth(next);
    if (selectedKey.slice(0, 7) !== next) {
      setSelectedKey(`${next}-01`);
    }
  };

  const goToday = () => {
    setSelectedKey(todayKey);
    setVisibleMonth(todayKey.slice(0, 7));
  };

  const scopeLabel =
    businessId === "tangent"
      ? "Tangent 综合日历"
      : businessId === "sine"
        ? "Sine Driving 日历"
        : "CuS Academy 日历";

  return (
    <section className="md:col-span-3 overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
      <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-4 py-4 sm:px-6">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <CalendarDays className="h-5 w-5 text-indigo-600" />
            <h3 className="truncate text-base font-extrabold text-slate-900">
              {scopeLabel}
            </h3>
          </div>
          <p className="mt-0.5 text-[11px] font-medium text-slate-400">
            {businessId === "tangent"
              ? "驾校 + 教培全部课程"
              : "仅显示当前业务实体课程"}
          </p>
        </div>

        <button
          type="button"
          onClick={goToday}
          className="shrink-0 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-indigo-600 shadow-sm active:scale-95"
        >
          今天
        </button>
      </div>

      <div className="grid lg:grid-cols-[minmax(0,1.35fr)_minmax(300px,0.65fr)]">
        <div className="border-b border-slate-100 p-3 sm:p-5 lg:border-b-0 lg:border-r">
          <div className="mb-3 flex items-center justify-between">
            <button
              type="button"
              onClick={() => moveMonth(-1)}
              className="flex h-9 w-9 items-center justify-center rounded-full text-slate-500 hover:bg-slate-100"
              aria-label="上个月"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>

            <div className="text-base font-black text-slate-900">
              {monthTitle(visibleMonth)}
            </div>

            <button
              type="button"
              onClick={() => moveMonth(1)}
              className="flex h-9 w-9 items-center justify-center rounded-full text-slate-500 hover:bg-slate-100"
              aria-label="下个月"
            >
              <ChevronRight className="h-5 w-5" />
            </button>
          </div>

          <div className="grid grid-cols-7 pb-1">
            {["日", "一", "二", "三", "四", "五", "六"].map((d) => (
              <div
                key={d}
                className="py-1 text-center text-[10px] font-bold text-slate-400"
              >
                {d}
              </div>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-y-1">
            {gridDays.map((dateKey) => {
              const inMonth = dateKey.slice(0, 7) === visibleMonth;
              const isToday = dateKey === todayKey;
              const isSelected = dateKey === selectedKey;
              const events = byDate.get(dateKey) || [];
              const dots = events.slice(0, 3);

              return (
                <button
                  key={dateKey}
                  type="button"
                  onClick={() => {
                    setSelectedKey(dateKey);
                    if (!inMonth) setVisibleMonth(dateKey.slice(0, 7));
                  }}
                  className={`relative mx-auto flex aspect-square w-full max-w-[54px] flex-col items-center justify-center rounded-2xl transition-all active:scale-95 ${
                    isSelected
                      ? "bg-slate-900 text-white shadow-md"
                      : isToday
                        ? "bg-indigo-50 text-indigo-700"
                        : inMonth
                          ? "text-slate-800 hover:bg-slate-50"
                          : "text-slate-300"
                  }`}
                >
                  <span className={`text-sm font-bold ${isToday && !isSelected ? "text-indigo-700" : ""}`}>
                    {dayNumber(dateKey)}
                  </span>

                  <div className="mt-1 flex h-1.5 items-center justify-center gap-0.5">
                    {dots.map((event) => (
                      <span
                        key={event.id}
                        className={`h-1.5 w-1.5 rounded-full ${
                          isSelected ? "bg-white" : accentFor(event).dot
                        }`}
                      />
                    ))}

                    {events.length > 3 ? (
                      <span
                        className={`ml-0.5 text-[8px] font-black leading-none ${
                          isSelected ? "text-white" : "text-slate-400"
                        }`}
                      >
                        +{events.length - 3}
                      </span>
                    ) : null}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        <div className="min-h-[280px] bg-slate-50/50 p-4 sm:p-5">
          <div className="mb-3">
            <div className="text-xs font-bold text-slate-400">
              {selectedKey.slice(5, 7)}月{selectedKey.slice(8, 10)}日 · {weekdayLabel(selectedKey)}
            </div>
            <div className="mt-0.5 text-lg font-black text-slate-900">
              {selectedBookings.length} 节课程
            </div>
          </div>

          {selectedBookings.length === 0 ? (
            <div className="flex min-h-[190px] flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-white/60 text-center">
              <CalendarDays className="mb-2 h-7 w-7 text-slate-300" />
              <p className="text-xs font-medium text-slate-400">当天暂无课程</p>
            </div>
          ) : (
            <div className="space-y-2.5">
              {selectedBookings.map((booking) => {
                const student = booking.student || {};
                const teacher = staffLabel(booking);
                const subject =
                  booking.subject ||
                  student.subject ||
                  (booking.business_unit_id === "sine" ? "练车" : "课程");
                const accent = accentFor(booking);
                const unitLabel =
                  booking.business_unit_id === "sine" ? "Sine" : "CuS";

                return (
                  <Link
                    key={booking.id}
                    href="/bookings"
                    className="block rounded-2xl border border-slate-200 bg-white p-3 shadow-sm transition-all hover:border-indigo-200 active:scale-[0.99]"
                  >
                    <div className="flex items-start gap-3">
                      <div className="w-12 shrink-0 pt-0.5 text-center">
                        <div className="text-sm font-black text-slate-900">
                          {utcToNzTimeStr(booking.start_time)}
                        </div>
                        <div className="mt-0.5 text-[9px] font-bold text-slate-400">
                          NZT
                        </div>
                      </div>

                      <div className="min-w-0 flex-1 border-l border-slate-100 pl-3">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <div className="truncate text-sm font-bold text-slate-900">
                              {student.student_code
                                ? `${student.student_code} · ${student.name || ""}`
                                : student.name || "未知学员"}
                            </div>
                            <div className="mt-0.5 truncate text-xs font-medium text-slate-500">
                              {subject}
                            </div>
                          </div>

                          {businessId === "tangent" ? (
                            <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[9px] font-black text-slate-500">
                              {unitLabel}
                            </span>
                          ) : null}
                        </div>

                        <div className="mt-2 flex flex-wrap items-center gap-1.5">
                          {teacher ? (
                            <span
                              className={`rounded-full border px-2 py-0.5 text-[10px] font-bold ${accent.chip}`}
                            >
                              {teacher}
                            </span>
                          ) : null}

                          {booking.status === "completed" ? (
                            <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-600">
                              已完成
                            </span>
                          ) : (
                            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-500">
                              待办
                            </span>
                          )}
                        </div>

                        {booking.location ? (
                          <div className="mt-2 flex items-center gap-1 text-[10px] font-medium text-slate-400">
                            <MapPin className="h-3 w-3" />
                            <span className="truncate">{booking.location}</span>
                          </div>
                        ) : null}
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
