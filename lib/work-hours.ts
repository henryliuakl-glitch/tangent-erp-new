/** Staff time reports derived from lesson bookings / class sessions (no extra clock-in table).
 * Unassigned sessions intentionally belong to 牛教练 (Sine) or 小硫 (CuS).
 * A past, not-completed booking is NOT silently treated as verified worked time.
 */
export type WorkUnit = "sine" | "cus";
export type StaffKey = "niu" | "tong" | "sulfur" | "copper" | "sine-other" | "cus-other";
export type WorkBucket = "completed" | "unconfirmed" | "upcoming";

export type WorkSession = {
  id: string;
  source: "booking" | "class";
  business_unit_id: WorkUnit;
  starts_at: string;
  ends_at?: string | null;
  duration?: number | null; // hours, when explicitly stored on bookings
  status: string;
  teacher?: string | null;
  coach?: string | null;
};

export type HourTally = {
  completedMinutes: number;
  unconfirmedMinutes: number;
  upcomingMinutes: number;
  completedSessions: number;
  unconfirmedSessions: number;
  upcomingSessions: number;
};

export type ClassifiedSession = WorkSession & {
  staff: StaffKey;
  bucket: WorkBucket;
  minutes: number;
  rawStaffLabel: string;
};

export const STAFF_LABELS: Record<StaffKey, string> = {
  niu: "牛教练",
  tong: "童教练",
  sulfur: "小硫",
  copper: "小铜",
  "sine-other": "其他驾校教练（待核对）",
  "cus-other": "其他 CuS 老师（待核对）",
};

export const STAFF_GROUPS: Record<WorkUnit, StaffKey[]> = {
  sine: ["niu", "tong", "sine-other"],
  cus: ["sulfur", "copper", "cus-other"],
};

const drivingNiu = new Set(["牛", "牛教练", "老牛", "henry", "coach henry", "henry教练", "henry老师", "niu"]);
const drivingTong = new Set(["童", "童教练", "大头", "老公", "yvetta", "coach yvetta", "yvetta教练", "lynn", "yutong"]);
const academySulfur = new Set(["小硫", "硫", "tutor sulfur", "sulfur", "henry", "henry老师", "teacher henry"]);
const academyCopper = new Set(["小铜", "铜", "tutor copper", "copper", "yvetta", "yvetta老师", "teacher yvetta", "yutong", "lynn"]);

const blankTally = (): HourTally => ({
  completedMinutes: 0, unconfirmedMinutes: 0, upcomingMinutes: 0,
  completedSessions: 0, unconfirmedSessions: 0, upcomingSessions: 0,
});

function normalizeName(value?: string | null): string {
  return String(value || "").trim().toLowerCase().replace(/\s+/g, " ");
}

export function classifyStaff(session: WorkSession): { staff: StaffKey; rawStaffLabel: string } {
  // The session's own assignment takes precedence; student default teacher is not an assignment.
  const raw = session.business_unit_id === "sine"
    ? session.coach?.trim() || session.teacher?.trim() || ""
    : session.teacher?.trim() || "";
  const value = normalizeName(raw);
  if (session.business_unit_id === "sine") {
    if (!value || drivingNiu.has(value)) return { staff: "niu", rawStaffLabel: raw };
    if (drivingTong.has(value)) return { staff: "tong", rawStaffLabel: raw };
    return { staff: "sine-other", rawStaffLabel: raw };
  }
  if (!value || academySulfur.has(value)) return { staff: "sulfur", rawStaffLabel: raw };
  if (academyCopper.has(value)) return { staff: "copper", rawStaffLabel: raw };
  return { staff: "cus-other", rawStaffLabel: raw };
}

function sessionMinutes(session: WorkSession): number {
  const stored = Number(session.duration);
  if (session.duration != null && Number.isFinite(stored) && stored > 0) {
    return Math.round(stored * 60);
  }
  const start = new Date(session.starts_at).getTime();
  const end = new Date(session.ends_at || "").getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return 0;
  return Math.round((end - start) / 60_000);
}

function increment(tally: HourTally, bucket: WorkBucket, minutes: number) {
  if (bucket === "completed") {
    tally.completedMinutes += minutes;
    tally.completedSessions += 1;
  } else if (bucket === "unconfirmed") {
    tally.unconfirmedMinutes += minutes;
    tally.unconfirmedSessions += 1;
  } else {
    tally.upcomingMinutes += minutes;
    tally.upcomingSessions += 1;
  }
}

export function summarizeWorkHours(sessions: WorkSession[], referenceTime = new Date()) {
  const byStaff: Record<StaffKey, HourTally> = {
    niu: blankTally(), tong: blankTally(), sulfur: blankTally(), copper: blankTally(),
    "sine-other": blankTally(), "cus-other": blankTally(),
  };
  const totals = blankTally();
  const classified: ClassifiedSession[] = [];
  const unknownNames = new Set<string>();
  let invalidCount = 0;
  const now = referenceTime.getTime();

  for (const session of sessions) {
    if (session.status === "cancelled") continue;
    const minutes = sessionMinutes(session);
    const start = new Date(session.starts_at).getTime();
    if (!Number.isFinite(start) || minutes <= 0) {
      invalidCount += 1;
      continue;
    }
    const { staff, rawStaffLabel } = classifyStaff(session);
    const bucket: WorkBucket = session.status === "completed"
      ? "completed"
      : start < now ? "unconfirmed" : "upcoming";
    increment(byStaff[staff], bucket, minutes);
    increment(totals, bucket, minutes);
    if (staff.endsWith("-other")) unknownNames.add(rawStaffLabel);
    classified.push({ ...session, staff, bucket, minutes, rawStaffLabel });
  }
  classified.sort((a, b) => b.starts_at.localeCompare(a.starts_at));
  return { byStaff, totals, classified, unknownNames: [...unknownNames].sort(), invalidCount };
}

export function hoursLabel(minutes: number): string {
  const hours = Math.round((minutes / 60) * 100) / 100;
  return hours.toLocaleString("zh-CN", { maximumFractionDigits: 2 }) + "h";
}
