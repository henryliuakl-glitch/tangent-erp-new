import { addDays, isSameDay, type Locale } from "date-fns";
import { fromZonedTime, formatInTimeZone, toZonedTime } from "date-fns-tz";

export const TZ_NZ = "Pacific/Auckland";
export const TZ_CN = "Asia/Shanghai";

/** 新西兰「今天」的日历日期 YYYY-MM-DD */
export function getTodayInNZ(): string {
  return formatInTimeZone(new Date(), TZ_NZ, "yyyy-MM-dd");
}

/** 将新西兰本地 date + time 解析为 UTC Date（存储屏障） */
export function nzLocalToUtc(dateStr: string, timeStr: string): Date {
  const normalized = timeStr.length === 5 ? `${timeStr}:00` : timeStr;
  return fromZonedTime(`${dateStr} ${normalized}`, TZ_NZ);
}

/** UTC ISO → 新西兰日期/时间（编辑表单回填） */
export function utcToNzDateStr(utcIso: string): string {
  return formatInTimeZone(new Date(utcIso), TZ_NZ, "yyyy-MM-dd");
}

export function utcToNzTimeStr(utcIso: string): string {
  return formatInTimeZone(new Date(utcIso), TZ_NZ, "HH:mm");
}

/**
 * 新西兰日历日加减（纯日历算术，避免 toZonedTime + formatInTimeZone 双重偏移）
 * 旧实现会把「墙钟 Date」再当 UTC 格式化，导致 NZ 夏季整日 +1（如 8.12 → 8.13）。
 */
export function addCalendarDaysInNZ(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  // UTC 正午锚点：仅作公历加减，不经过系统本地时区
  const utc = new Date(Date.UTC(y, m - 1, d + days, 12, 0, 0));
  const yy = utc.getUTCFullYear();
  const mm = String(utc.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(utc.getUTCDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

/** 新西兰日历月加减（每月重复排课） */
export function addCalendarMonthsInNZ(dateStr: string, months: number): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const utc = new Date(Date.UTC(y, m - 1 + months, d, 12, 0, 0));
  // 处理月末溢出（如 1/31 + 1 月）：钳制到目标月最后一天
  if (utc.getUTCDate() !== d) {
    utc.setUTCDate(0);
  }
  const yy = utc.getUTCFullYear();
  const mm = String(utc.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(utc.getUTCDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

/** 新西兰星期几 0=周日 … 6=周六（公历日无歧义，用 UTC 正午取 weekday） */
export function getDayOfWeekInNZ(dateStr: string): number {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d, 12, 0, 0)).getUTCDay();
}

/** 新西兰当日结束时刻的 UTC Date（用于循环排课截止比较） */
export function nzEndOfDayUtc(dateStr: string): Date {
  return fromZonedTime(`${dateStr} 23:59:59`, TZ_NZ);
}

/** 新西兰当日开始时刻的 UTC Date */
export function nzStartOfDayUtc(dateStr: string): Date {
  return fromZonedTime(`${dateStr} 00:00:00`, TZ_NZ);
}

/**
 * 新西兰自然月起止（本月 1 号 00:00:00 → 月末 23:59:59 NZT）→ UTC ISO
 * monthOffset: 0=本月, -1=上月
 * nextMonthStart: 下月 1 号 YYYY-MM-DD，用于 transaction_date 的半开区间过滤 [.gte(start), .lt(next))
 */
export function getNzMonthBounds(
  monthOffset = 0,
  reference: Date = new Date()
): {
  startIso: string;
  endIso: string;
  startDate: string;
  endDate: string;
  nextMonthStart: string;
} {
  const todayNz = formatInTimeZone(reference, TZ_NZ, "yyyy-MM-dd");
  const firstOfThisMonth = `${todayNz.slice(0, 8)}01`;
  const startDate = addCalendarMonthsInNZ(firstOfThisMonth, monthOffset);
  const nextMonthStart = addCalendarMonthsInNZ(startDate, 1);
  const endDate = addCalendarDaysInNZ(nextMonthStart, -1);
  return {
    startDate,
    endDate,
    nextMonthStart,
    startIso: nzStartOfDayUtc(startDate).toISOString(),
    endIso: nzEndOfDayUtc(endDate).toISOString(),
  };
}

/** 双时区时间展示：16:00 (NZT) / 12:00 (BJT) */
export function formatDualTime(utcIso: string): string {
  const d = new Date(utcIso);
  const nzt = formatInTimeZone(d, TZ_NZ, "HH:mm");
  const bjt = formatInTimeZone(d, TZ_CN, "HH:mm");
  return `${nzt} (NZT) / ${bjt} (BJT)`;
}

export function formatDualTimeParts(utcIso: string): { nzt: string; bjt: string } {
  const d = new Date(utcIso);
  return {
    nzt: formatInTimeZone(d, TZ_NZ, "HH:mm"),
    bjt: formatInTimeZone(d, TZ_CN, "HH:mm"),
  };
}

/** NZT 时段：10:30 - 11:30 (1h)；endUtc 缺失时用 duration 推算 */
export function formatNzTimeRange(
  startUtc: string,
  endUtc?: string | null,
  durationHours?: number | null
): string {
  const start = new Date(startUtc);
  if (Number.isNaN(start.getTime())) return "";
  const startNzt = formatInTimeZone(start, TZ_NZ, "HH:mm");

  let end = endUtc ? new Date(endUtc) : null;
  if (!end || Number.isNaN(end.getTime())) {
    const hours = Number(durationHours) || 1;
    end = new Date(start.getTime() + hours * 3_600_000);
  }
  const endNzt = formatInTimeZone(end, TZ_NZ, "HH:mm");

  const dur =
    durationHours != null && Number.isFinite(Number(durationHours))
      ? Number(durationHours)
      : (end.getTime() - start.getTime()) / 3_600_000;
  const durLabel = Number.isInteger(dur) ? `${dur}h` : `${Math.round(dur * 10) / 10}h`;
  return `${startNzt} - ${endNzt} (${durLabel})`;
}

/** 根据新西兰本地输入预览双时区（新建排课） */
export function formatDualTimeFromNzLocal(dateStr: string, timeStr: string): string {
  if (!dateStr || !timeStr) return "";
  return formatDualTime(nzLocalToUtc(dateStr, timeStr).toISOString());
}

export function utcToNzDateKey(utcIso: string): string {
  return formatInTimeZone(new Date(utcIso), TZ_NZ, "yyyy-MM-dd");
}

/** 新西兰本地 date+time 加上课时，跨日则进一天（连排下一节用） */
export function addHoursToNzDateTime(
  dateStr: string,
  timeStr: string,
  hours: number
): { date: string; time: string } {
  const [h, m] = timeStr.split(":").map(Number);
  const startMin = (Number.isFinite(h) ? h : 0) * 60 + (Number.isFinite(m) ? m : 0);
  const total = startMin + hours * 60;
  const dayDelta = Math.floor(total / (24 * 60));
  const wrapped = ((total % (24 * 60)) + 24 * 60) % (24 * 60);
  const nh = Math.floor(wrapped / 60);
  const nm = Math.round(wrapped % 60);
  return {
    date: addCalendarDaysInNZ(dateStr, dayDelta),
    time: `${String(nh).padStart(2, "0")}:${String(nm).padStart(2, "0")}`,
  };
}

export function isTodayInNZ(utcIso: string): boolean {
  const now = toZonedTime(new Date(), TZ_NZ);
  const target = toZonedTime(new Date(utcIso), TZ_NZ);
  return isSameDay(now, target);
}

export function isTomorrowInNZ(utcIso: string): boolean {
  const now = toZonedTime(new Date(), TZ_NZ);
  const tomorrow = addDays(now, 1);
  const target = toZonedTime(new Date(utcIso), TZ_NZ);
  return isSameDay(tomorrow, target);
}

export function formatDateLabelInNZ(utcIso: string, locale?: Locale): string {
  return formatInTimeZone(new Date(utcIso), TZ_NZ, "M月d日 EEEE", { locale });
}
