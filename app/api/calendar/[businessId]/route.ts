import {
  formatSineIcsDescription,
  formatSineIcsSummary,
} from "@/lib/driving-booking-text";
import { createClient } from "@supabase/supabase-js";
import ical from "ical-generator";
import { formatDualTime } from "@/lib/timezone";
export const dynamic = "force-dynamic";

type StaffFeed = "niu" | "tong" | "henry" | "yvetta";

const STAFF_LABELS: Record<StaffFeed, string> = {
  niu: "牛教练",
  tong: "童教练",
  henry: "Henry",
  yvetta: "Yvetta",
};

function normalizeName(value?: string | null) {
  return (value || "").trim().toLowerCase();
}

function isOnlineLocation(value?: string | null) {
  const key = normalizeName(value);
  return !key || ["线上", "online", "zoom", "remote"].some((token) => key.includes(token));
}

function buildAppleCalendarLocation(value?: string | null) {
  const raw = (value || "").trim();
  if (!raw || isOnlineLocation(raw)) return "";

  // 把 “VTNZ Albany (5 Saturn Pl)” 这类内部展示格式改成更适合 Apple Maps 地理编码的格式。
  let location = raw.replace(/\s*\(([^)]+)\)\s*$/, ", $1").trim();

  // Tangent 当前主要在奥克兰运营。对明显是街道地址但未写城市/国家的记录补足地理上下文，
  // 提高 iOS Calendar/Maps 自动识别地址的成功率。
  const hasAucklandContext = /auckland|new zealand|nz\b/i.test(location);
  const looksLikeStreetAddress =
    /\d/.test(location) &&
    /\b(st|street|rd|road|ave|avenue|pl|place|ln|lane|dr|drive|cres|crescent|way|terrace|tce|highway|hwy)\b/i.test(location);

  if (!hasAucklandContext && looksLikeStreetAddress) {
    location += ", Auckland, New Zealand";
  }

  return location;
}

function appleMapsUrl(location: string) {
  if (!location) return undefined;
  return `https://maps.apple.com/?q=${encodeURIComponent(location)}`;
}

function matchesStaff(
  staff: StaffFeed | null,
  businessId: string,
  booking: any
) {
  if (!staff) return true;

  const metadata = (booking.metadata as Record<string, unknown> | null) ?? {};
  const coach = normalizeName(
    metadata.coach != null ? String(metadata.coach) : ""
  );
  const teacher = normalizeName(booking.teacher || booking.student?.teacher);

  if (businessId === "sine") {
    if (staff === "niu") {
      return ["牛教练", "牛", "henry", "henry老师", "coach henry"].includes(coach);
    }
    if (staff === "tong") {
      return ["童教练", "童", "大头", "老公", "yvetta", "yvetta老师"].includes(coach);
    }
    return false;
  }

  if (businessId === "cus") {
    if (staff === "henry") {
      return ["henry", "henry老师", "牛教练"].includes(teacher);
    }
    if (staff === "yvetta") {
      return ["yvetta", "yvetta老师", "童教练"].includes(teacher);
    }
    return false;
  }

  return true;
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ businessId: string }> }
) {
  const { businessId } = await params;
  const url = new URL(request.url);
  const rawStaff = url.searchParams.get("staff");
  const staff: StaffFeed | null =
    rawStaff && ["niu", "tong", "henry", "yvetta"].includes(rawStaff)
      ? (rawStaff as StaffFeed)
      : null;

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  let query = supabase
    .from("bookings")
    .select(`
      *,
      student:students(name, student_code, teacher)
    `)
    .neq("status", "cancelled");

  if (businessId !== "tangent") {
    query = query.eq("business_unit_id", businessId);
  }

  const { data: bookings, error } = await query;

  if (error) {
    console.error("Calendar DB Error:", error);
    return new Response("Database Error", { status: 500 });
  }

  const isSine = businessId === "sine";
  const feedBookings = (bookings || []).filter((booking) =>
    matchesStaff(staff, businessId, booking)
  );

  const staffLabel = staff ? STAFF_LABELS[staff] : null;
  const calendarName = staffLabel
    ? `${staffLabel} · ${isSine ? "Sine Driving" : "CuS Academy"}`
    : isSine
      ? "Sine Driving School"
      : `Tangent Schedule (${businessId.toUpperCase()})`;

  const calendar = ical({
    name: calendarName,
    prodId: { company: "Tangent ERP", product: "Calendar", language: "EN" },
    timezone: "UTC",
    ttl: 900,
  });

  for (const booking of feedBookings) {
    const start = new Date(booking.start_time);
    const end = new Date(booking.end_time);
    if (isNaN(start.getTime()) || isNaN(end.getTime())) continue;

    const student = booking.student;
    const studentCode = student?.student_code || "无编号";
    const studentName = student?.name || "未知学员";
    const teacherName = booking.teacher || student?.teacher || "无老师";
    const notes = booking.notes || "";
    const statusLabel = booking.status === "completed" ? "已完成" : "待进行";
    const placeLabel = booking.location?.trim() || "未指定";
    const calendarLocation = buildAppleCalendarLocation(booking.location);
    const mapsUrl = appleMapsUrl(calendarLocation);
    const metadata = (booking.metadata as Record<string, unknown> | null) ?? {};

    let summaryText: string;
    let descriptionText: string;

    if (isSine) {
      summaryText = formatSineIcsSummary({
        subject: booking.subject,
        studentCode,
        studentName,
        location: booking.location,
        metadata,
        actualRate: booking.actual_rate,
        duration: booking.duration,
      });
      descriptionText = formatSineIcsDescription({
        subject: booking.subject,
        studentCode,
        studentName,
        location: booking.location,
        notes,
        status: booking.status,
        metadata,
        actualRate: booking.actual_rate,
        duration: booking.duration,
        startTimeLabel: formatDualTime(booking.start_time),
      });
    } else {
      summaryText = `${studentCode} ${studentName} ${teacherName}`;
      descriptionText = [
        `学员: ${studentName}`,
        `编号: ${studentCode}`,
        `老师: ${teacherName}`,
        `地点: ${placeLabel}`,
        `备注: ${notes || "无"}`,
        `状态: ${statusLabel}`,
      ].join("\n");
    }

    calendar.createEvent({
      id: booking.id,
      start,
      end,
      summary: summaryText,
      description: mapsUrl
        ? `${descriptionText}\n\nApple Maps: ${mapsUrl}`
        : descriptionText,
      // LOCATION 必须只放可地理编码的地点。之前混入 NZT/BJT 时间，
      // 会导致 Apple Calendar 有时无法识别为地址。
      location: calendarLocation || undefined,
      url: mapsUrl,
      alarms: [
        {
          type: "display",
          trigger: 30 * 60,
          description: `30 分钟后：${summaryText}`,
        },
      ],
      lastModified: new Date(),
    });
  }

  const filename = staff
    ? `tangent-${businessId}-${staff}.ics`
    : `tangent-${businessId}.ics`;

  return new Response(calendar.toString(), {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0",
      Pragma: "no-cache",
      Expires: "0",
    },
  });
}
