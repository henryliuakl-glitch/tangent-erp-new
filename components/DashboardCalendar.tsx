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

const DEFAULT_START_HOUR = 10;
const DEFAULT_END_HOUR = 20;
const HOUR_HEIGHT = 38;

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
      block: "border-blue-200 bg-blue-50/95 text-blue-950",
    };
  }

  if (["童教练", "yvetta", "yvetta老师", "teacher yvetta"].includes(name)) {
    return {
      dot: "bg-amber-400",
      chip: "bg-amber-50 border-amber-200 text-amber-700",
      block: "border-amber-200 bg-amber-50/95 text-amber-950",
    };
  }

  return {
    dot: booking.business_unit_id === "sine" ? "bg-sky-500" : "bg-violet-500",
    chip: "bg-slate-50 border-slate-200 text-slate-600",
    block:
      booking.business_unit_id === "sine"
        ? "border-sky-200 bg-sky-50/95 text-sky-950"
        : "border-violet-200 bg-violet-50/95 text-violet-950",
  };
}

function endIso(booking: CalendarBooking) {
  if (booking.end_time) return booking.end_time;
  const durationHours = Number(booking.duration || 1);
  return new Date(new Date(booking.start_time).getTime() + durationHours * 3600000).toISOString();
}

function timeRangeLabel(booking: CalendarBooking) {
  return `${utcToNzTimeStr(booking.start_time)}–${utcToNzTimeStr(endIso(booking))}`;
}

function timeStringToMinutes(value: string) {
  const [h, m] = value.split(":").map(Number);
  return h * 60 + m;
}

function bookingWindow(booking: CalendarBooking) {
  const start = timeStringToMinutes(utcToNzTimeStr(booking.start_time));
  const end = timeStringToMinutes(utcToNzTimeStr(endIso(booking)));
  return {
    start,
    end: end <= start ? start + Math.max(30, Number(booking.duration || 1) * 60) : end,
  };
}

type PositionedBooking = {
  booking: CalendarBooking;
  start: number;
  end: number;
  column: number;
  columns: number;
};

function layoutBookings(
  bookings: CalendarBooking[],
  gridStartHour: number,
  gridEndHour: number
): PositionedBooking[] {
  const rows = bookings
    .map((booking) => {
      const { start, end } = bookingWindow(booking);
      return { booking, start, end };
    })
    .filter(({ start, end }) => end > gridStartHour * 60 && start < gridEndHour * 60)
    .sort((a, b) => a.start - b.start || a.end - b.end);

  const result: PositionedBooking[] = [];
  let group: typeof rows = [];
  let groupEnd = -1;

  const flushGroup = () => {
    if (!group.length) return;

    const columnEnds: number[] = [];
    const placed = group.map((item) => {
      let column = columnEnds.findIndex((end) => end <= item.start);
      if (column === -1) {
        column = columnEnds.length;
        columnEnds.push(item.end);
      } else {
        columnEnds[column] = item.end;
      }
      return { ...item, column };
    });

    const columns = Math.max(1, columnEnds.length);
    placed.forEach((item) =>
      result.push({
        booking: item.booking,
        start: item.start,
        end: item.end,
        column: item.column,
        columns,
      })
    );

    group = [];
    groupEnd = -1;
  };

  for (const row of rows) {
    if (group.length && row.start >= groupEnd) flushGroup();
    group.push(row);
    groupEnd = Math.max(groupEnd, row.end);
  }
  flushGroup();

  return result;
}

export function DashboardCalendar({
  bookings,
  businessId,
  loading = false,
  onMonthChange,
  reminders = [],
}: {
  bookings: CalendarBooking[];
  businessId: string;
  loading?: boolean;
  onMonthChange?: (monthKey: string) => void;
  reminders?: {id:string;name:string;balance:number}[];
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
  const { gridStartHour, gridEndHour } = useMemo(() => {
    if (selectedBookings.length === 0) {
      return {
        gridStartHour: DEFAULT_START_HOUR,
        gridEndHour: DEFAULT_END_HOUR,
      };
    }

    const windows = selectedBookings.map(bookingWindow);
    const earliest = Math.min(...windows.map((w) => w.start));
    const latest = Math.max(...windows.map((w) => w.end));

    return {
      gridStartHour: Math.max(0, Math.min(DEFAULT_START_HOUR, Math.floor(earliest / 60))),
      gridEndHour: Math.min(24, Math.max(DEFAULT_END_HOUR, Math.ceil(latest / 60))),
    };
  }, [selectedBookings]);


  const positionedBookings=useMemo(
    ()=>layoutBookings(selectedBookings,gridStartHour,gridEndHour),
    [selectedBookings,gridStartHour,gridEndHour]
  );

  const moveMonth = (delta: number) => {
    const next = addCalendarMonthsInNZ(`${visibleMonth}-01`, delta).slice(0, 7);
    setVisibleMonth(next);
    if (selectedKey.slice(0, 7) !== next) {
      setSelectedKey(`${next}-01`);
    }
    onMonthChange?.(next);
  };

  const goToday = () => {
    const month = todayKey.slice(0, 7);
    setSelectedKey(todayKey);
    setVisibleMonth(month);
    onMonthChange?.(month);
  };

  const scopeLabel =
    businessId === "tangent"
      ? "Tangent 综合日历"
      : businessId === "sine"
        ? "Sine Driving 日历"
        : "CuS Academy 日历";

  return (
    <section className="erp-surface overflow-hidden rounded-2xl bg-white">
      <div className="flex items-center justify-between gap-3 px-3.5 py-2.5 sm:px-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <CalendarDays className="h-4 w-4 text-indigo-600" />
            <h3 className="truncate text-sm font-extrabold text-slate-900">
              {scopeLabel}
            </h3>
          </div>
        </div>

        <button
          type="button"
          onClick={goToday}
          className="shrink-0 rounded-lg bg-[#f1f1ff] px-2.5 py-1 text-[11px] font-bold text-indigo-600 active:scale-95"
        >
          今天
        </button>
      </div>

      <div className="grid lg:grid-cols-[minmax(0,0.92fr)_minmax(0,1.08fr)]">
        <div className="min-w-0 p-2.5 sm:p-3">
          <div className="mb-1.5 flex items-center justify-between">
            <button
              type="button"
              onClick={() => moveMonth(-1)}
              className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100"
              aria-label="上个月"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>

            <div className="text-xs font-black text-slate-900">
              {monthTitle(visibleMonth)}
            </div>

            <button
              type="button"
              onClick={() => moveMonth(1)}
              className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100"
              aria-label="下个月"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>

          <div className="grid grid-cols-7 pb-1">
            {["日", "一", "二", "三", "四", "五", "六"].map((d) => (
              <div
                key={d}
                className="py-0.5 text-center text-[9px] font-bold text-slate-400"
              >
                {d}
              </div>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-y-0.5">
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
                  className={`relative mx-auto flex h-8 w-full max-w-[46px] flex-col items-center justify-center rounded-lg transition-all active:scale-95 ${
                    isSelected
                      ? "bg-slate-900 text-white shadow-md"
                      : isToday
                        ? "bg-indigo-50 text-indigo-700"
                        : inMonth
                          ? "text-slate-800 hover:bg-slate-50"
                          : "text-slate-300"
                  }`}
                >
                  <span className={`text-xs font-bold ${isToday && !isSelected ? "text-indigo-700" : ""}`}>
                    {dayNumber(dateKey)}
                  </span>

                  <div className="mt-0.5 flex h-1 items-center justify-center gap-0.5">
                    {dots.map((event) => (
                      <span
                        key={event.id}
                        className={`h-1 w-1 rounded-full ${
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

          <div className="mt-2 flex items-center justify-between rounded-xl bg-[#f7f8ff] px-3 py-2">
            <div className="text-[10px] font-bold text-slate-400">
              {selectedKey.slice(5, 7)}月{selectedKey.slice(8, 10)}日 · {weekdayLabel(selectedKey)}
            </div>
            <div className="mt-0.5 text-sm font-black text-slate-900">
              {selectedBookings.length} 节课程
            </div>
          </div>
          <div className="mt-2 rounded-xl bg-[#f7f8ff] p-3">
            <div className="mb-1.5 flex items-center justify-between">
              <h4 className="text-xs font-bold text-[#282b4a]">课时提醒</h4>
              {reminders.length>0&&<span className="rounded-full bg-rose-50 px-2 text-[10px] font-bold text-rose-600">{reminders.length}</span>}
            </div>
            {reminders.length===0?<p className="py-1 text-[11px] text-slate-400">暂无课时提醒</p>:
              <div className="grid grid-cols-2 gap-x-2 gap-y-1">
                {reminders.slice(0,6).map(student=><Link key={student.id} href={`/students/${student.id}`}
                  className="flex min-w-0 items-center justify-between gap-2 rounded-lg px-1.5 py-1 text-[11px] hover:bg-white">
                  <span className="truncate text-slate-600">{student.name}</span>
                  <span className="shrink-0 font-bold text-rose-600">{Number(student.balance)}h</span>
                </Link>)}
              </div>}
          </div>
        </div>

        <div className="min-w-0 rounded-xl bg-[#fbfbff] p-2.5 sm:p-3">
          <div className="mb-2 flex items-center justify-between gap-2">
            <span className="text-xs font-black text-slate-900">当天时段</span>
            <span className="text-[10px] font-semibold text-slate-400">{selectedBookings.length} 节</span>
          </div>
          <div className="mb-1 ml-[39px] grid grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)] gap-1.5 px-2 text-[9px] font-medium text-slate-400">
            <span>学员</span><span>科目 / 教师</span>
          </div>
          <div className="overflow-hidden rounded-xl bg-white px-2 py-3">
            <div className="relative ml-[37px]" style={{height:(gridEndHour-gridStartHour)*HOUR_HEIGHT}}>
              {Array.from({length:gridEndHour-gridStartHour+1},(_,i)=>{
                const hour=gridStartHour+i;
                return <div key={hour} className="absolute inset-x-0 border-t border-[#eff0f7]"
                  style={{top:i*HOUR_HEIGHT}}>
                  <span className="absolute right-full top-0 w-[35px] -translate-y-1/2 pr-1 text-right text-[9px] font-semibold tabular-nums text-slate-400">
                    {String(hour).padStart(2,"0")}:00
                  </span>
                </div>;
              })}
              {positionedBookings.map(({booking,start,end,column,columns})=>{
                const clippedStart=Math.max(start,gridStartHour*60);
                const clippedEnd=Math.min(end,gridEndHour*60);
                const top=(clippedStart-gridStartHour*60)/60*HOUR_HEIGHT;
                const height=Math.max(20,(clippedEnd-clippedStart)/60*HOUR_HEIGHT-3);
                const pct=100/columns;
                const student=booking.student||{};
                const subject=booking.subject||student.subject||(booking.business_unit_id==="sine"?"练车":"课程");
                const teacher=staffLabel(booking);
                const accent=accentFor(booking);
                return <div key={booking.id}
                  className={`absolute z-10 flex min-w-0 items-center overflow-hidden rounded-lg px-1.5 ${accent.block}`}
                  style={{
                    top,height,
                    left:`calc(${column*pct}% + 2px)`,
                    width:`calc(${pct}% - 4px)`
                  }}
                  title={`${timeRangeLabel(booking)} · ${student.student_code||""} ${student.name||"未知学员"} · ${subject}${teacher?" · "+teacher:""}`}>
                  <div className="grid w-full min-w-0 grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)] items-center gap-1.5">
                    <span className="truncate text-[10px] font-bold">
                      {student.student_code?student.student_code+" · ":""}{student.name||"未知学员"}
                    </span>
                    <span className="truncate text-[9px] font-semibold">
                      {subject}{teacher?" · "+teacher:""}
                    </span>
                  </div>
                </div>;
              })}
              {!selectedBookings.length&&<div className="absolute inset-0 flex items-center justify-center text-[11px] text-slate-400">当天暂无课程</div>}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
