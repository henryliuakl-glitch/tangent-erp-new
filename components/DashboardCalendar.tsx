"use client";

import { useMemo, useState } from "react";
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

const GRID_START_HOUR = 6;
const GRID_END_HOUR = 22;
const HOUR_HEIGHT = 34;
const GRID_MINUTES = (GRID_END_HOUR - GRID_START_HOUR) * 60;

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

function layoutBookings(bookings: CalendarBooking[]): PositionedBooking[] {
  const rows = bookings
    .map((booking) => {
      const { start, end } = bookingWindow(booking);
      return { booking, start, end };
    })
    .filter(({ start, end }) => end > GRID_START_HOUR * 60 && start < GRID_END_HOUR * 60)
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
  const positionedBookings = useMemo(
    () => layoutBookings(selectedBookings),
    [selectedBookings]
  );

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
    <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-3.5 py-2.5 sm:px-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <CalendarDays className="h-4 w-4 text-indigo-600" />
            <h3 className="truncate text-sm font-extrabold text-slate-900">
              {scopeLabel}
            </h3>
          </div>
          <p className="mt-0.5 text-[10px] font-medium text-slate-400">
            月历选日期 · 右侧查看 06:00–22:00 已占时段
          </p>
        </div>

        <button
          type="button"
          onClick={goToday}
          className="shrink-0 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-bold text-indigo-600 shadow-sm active:scale-95"
        >
          今天
        </button>
      </div>

      <div className="grid lg:grid-cols-[minmax(0,0.88fr)_minmax(360px,1.12fr)]">
        <div className="border-b border-slate-100 p-2.5 sm:p-3 lg:border-b-0 lg:border-r">
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
                  className={`relative mx-auto flex h-9 w-full max-w-[46px] flex-col items-center justify-center rounded-lg transition-all active:scale-95 ${
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

          <div className="mt-3 rounded-xl bg-slate-50 px-3 py-2.5">
            <div className="text-[10px] font-bold text-slate-400">
              {selectedKey.slice(5, 7)}月{selectedKey.slice(8, 10)}日 · {weekdayLabel(selectedKey)}
            </div>
            <div className="mt-0.5 text-sm font-black text-slate-900">
              {selectedBookings.length} 节课程
            </div>
            <div className="mt-1 text-[10px] text-slate-400">
              网格按实际开始与结束时间占位，空白时段就是可排时间。
            </div>
          </div>
        </div>

        <div className="bg-slate-50/40 p-2.5 sm:p-3">
          <div className="mb-2 flex items-center justify-between gap-2">
            <div>
              <div className="text-xs font-black text-slate-900">当天时段</div>
              <div className="text-[9px] font-medium text-slate-400">06:00–22:00 · 每小时一格</div>
            </div>
            <div className="text-[10px] font-bold text-slate-400">
              {selectedBookings.length ? `${selectedBookings.length} booked` : "全部空闲"}
            </div>
          </div>

          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
            <div
              className="relative ml-[48px]"
              style={{ height: (GRID_END_HOUR - GRID_START_HOUR) * HOUR_HEIGHT }}
            >
              {Array.from({ length: GRID_END_HOUR - GRID_START_HOUR + 1 }, (_, i) => {
                const hour = GRID_START_HOUR + i;
                const top = i * HOUR_HEIGHT;
                return (
                  <div
                    key={hour}
                    className="absolute left-0 right-0 border-t border-slate-100"
                    style={{ top }}
                  >
                    <span className="absolute right-full top-0 w-[44px] -translate-y-1/2 pr-2 text-right text-[9px] font-semibold tabular-nums text-slate-400">
                      {String(hour).padStart(2, "0")}:00
                    </span>
                  </div>
                );
              })}

              <div
                className="pointer-events-none absolute inset-x-0 top-0 grid"
                style={{
                  height: (GRID_END_HOUR - GRID_START_HOUR) * HOUR_HEIGHT,
                  gridTemplateRows: `repeat(${GRID_END_HOUR - GRID_START_HOUR}, ${HOUR_HEIGHT}px)`,
                }}
              >
                {Array.from({ length: GRID_END_HOUR - GRID_START_HOUR }, (_, i) => (
                  <div key={i} className={i % 2 ? "bg-slate-50/25" : ""} />
                ))}
              </div>

              {positionedBookings.map(({ booking, start, end, column, columns }) => {
                const clippedStart = Math.max(start, GRID_START_HOUR * 60);
                const clippedEnd = Math.min(end, GRID_END_HOUR * 60);
                const top = ((clippedStart - GRID_START_HOUR * 60) / 60) * HOUR_HEIGHT;
                const height = Math.max(
                  24,
                  ((clippedEnd - clippedStart) / 60) * HOUR_HEIGHT - 2
                );
                const widthPct = 100 / columns;
                const leftPct = column * widthPct;
                const student = booking.student || {};
                const teacher = staffLabel(booking);
                const subject =
                  booking.subject ||
                  student.subject ||
                  (booking.business_unit_id === "sine" ? "练车" : "课程");
                const accent = accentFor(booking);
                const unitLabel = booking.business_unit_id === "sine" ? "Sine" : "CuS";

                return (
                  <div
                    key={booking.id}
                    className={`absolute z-10 overflow-hidden rounded-lg border px-2 py-1 shadow-sm ${accent.block}`}
                    style={{
                      top,
                      height,
                      left: `calc(${leftPct}% + 2px)`,
                      width: `calc(${widthPct}% - 4px)`,
                    }}
                    title={`${timeRangeLabel(booking)} · ${student.name || "未知学员"} · ${subject}`}
                  >
                    <div className="flex min-w-0 items-center gap-1">
                      <span className="shrink-0 text-[10px] font-black tabular-nums">
                        {timeRangeLabel(booking)}
                      </span>
                      {businessId === "tangent" ? (
                        <span className="shrink-0 rounded bg-white/70 px-1 py-px text-[8px] font-black text-slate-500">
                          {unitLabel}
                        </span>
                      ) : null}
                    </div>
                    <div className="mt-0.5 truncate text-[10px] font-bold">
                      {student.student_code ? `${student.student_code} · ` : ""}
                      {student.name || "未知学员"}
                    </div>
                    {height >= 42 ? (
                      <div className="mt-0.5 truncate text-[9px] font-medium opacity-75">
                        {subject}{teacher ? ` · ${teacher}` : ""}
                      </div>
                    ) : null}
                    {height >= 62 && booking.location ? (
                      <div className="mt-0.5 flex min-w-0 items-center gap-1 truncate text-[8px] opacity-60">
                        <MapPin className="h-2.5 w-2.5 shrink-0" />
                        <span className="truncate">{booking.location}</span>
                      </div>
                    ) : null}
                  </div>
                );
              })}

              {positionedBookings.length === 0 ? (
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="rounded-xl border border-dashed border-slate-200 bg-white/90 px-4 py-3 text-center">
                    <CalendarDays className="mx-auto mb-1 h-4 w-4 text-slate-300" />
                    <div className="text-[10px] font-semibold text-slate-400">06:00–22:00 全部空闲</div>
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
