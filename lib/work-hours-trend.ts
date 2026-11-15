import {
  addCalendarDaysInNZ, addCalendarMonthsInNZ, getTodayInNZ, utcToNzDateStr,
} from "@/lib/timezone";
import type { ClassifiedSession, StaffKey } from "@/lib/work-hours";

export type WorkTrendPeriod = "month" | "year" | "all";
export type TrendPoint = {
  date: string;
  label: string;
  niu: number;
  tong: number;
  sulfur: number;
  copper: number;
  other: number;
};
export type WorkTrend = { historical: TrendPoint[]; completed: TrendPoint[] };

type TrendStaff = Exclude<StaffKey, "sine-other" | "cus-other"> | "other";
const keys: TrendStaff[] = ["niu", "tong", "sulfur", "copper", "other"];

function emptyPoint(date: string, period: WorkTrendPeriod): TrendPoint {
  return {
    date,
    label: period === "month" ? String(Number(date.slice(8, 10))) + "日" :
      period === "year" ? String(Number(date.slice(5, 7))) + "月" :
        date.slice(2, 4) + "/" + date.slice(5, 7),
    niu: 0, tong: 0, sulfur: 0, copper: 0, other: 0,
  };
}

/** Always aggregate from NZ local calendar dates, not the runtime/browser timezone.
 * Historical includes completed plus past unconfirmed bookings, but never future sessions.
 */
export function buildWorkTrend(
  sessions: ClassifiedSession[],
  period: WorkTrendPeriod,
  month: string,
  today = getTodayInNZ(),
): WorkTrend {
  const historical = new Map<string, TrendPoint>();
  const completed = new Map<string, TrendPoint>();
  const currentMonth = today.slice(0, 7) + "-01";

  let first: string;
  let endExclusive: string;

  if (period === "month") {
    first = month;
    endExclusive = addCalendarMonthsInNZ(month, 1);
  } else if (period === "year") {
    first = month.slice(0, 4) + "-01-01";
    endExclusive = (Number(month.slice(0, 4)) + 1) + "-01-01";
  } else {
    const pastDates = sessions.filter(s => s.bucket !== "upcoming")
      .map(s => utcToNzDateStr(s.starts_at)).sort();
    first = pastDates.length ? pastDates[0].slice(0, 7) + "-01" : currentMonth;
    endExclusive = addCalendarMonthsInNZ(currentMonth, 1);
  }

  // Prevent future empty buckets (or a confusing cliff to zero in the current month).
  const currentEndExclusive = period === "month"
    ? addCalendarDaysInNZ(today, 1)
    : addCalendarMonthsInNZ(currentMonth, 1);
  if (endExclusive > currentEndExclusive) endExclusive = currentEndExclusive;
  if (first >= endExclusive) return { historical: [], completed: [] };

  const step = period === "month" ? addCalendarDaysInNZ : addCalendarMonthsInNZ;
  for (let date = first, i = 0; date < endExclusive && i < 1500; date = step(date, 1), i++) {
    const index = period === "month" ? date : date.slice(0, 7);
    historical.set(index, emptyPoint(date, period));
    completed.set(index, emptyPoint(date, period));
  }

  for (const session of sessions) {
    if (session.bucket === "upcoming") continue;
    const nzDate = utcToNzDateStr(session.starts_at);
    const index = period === "month" ? nzDate : nzDate.slice(0, 7);
    const staff: TrendStaff =
      session.staff === "sine-other" || session.staff === "cus-other" ? "other" : session.staff;
    const hour = session.minutes / 60;
    const historic = historical.get(index);
    if (historic) historic[staff] += hour;
    if (session.bucket === "completed") {
      const done = completed.get(index);
      if (done) done[staff] += hour;
    }
  }

  // Keep stored values precise enough for 15-minute and 30-minute bookings.
  const normalize = (data: Map<string, TrendPoint>) =>
    [...data.values()].map(point => {
      for (const key of keys) point[key] = Math.round(point[key] * 100) / 100;
      return point;
    });
  return { historical: normalize(historical), completed: normalize(completed) };
}
