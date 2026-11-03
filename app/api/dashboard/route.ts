import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getDashboardStats, getDashboardToday, getDashboardUpcoming, getDashboardCalendarMonth } from "@/app/dashboard-actions";

export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store" };

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const businessId = params.get("businessId") || "cus";
  const widget = params.get("widget");
  const month = params.get("month") || undefined;
  if (!["cus", "sine", "tangent"].includes(businessId) ||
      !["stats", "today", "upcoming", "calendar"].includes(widget || "") ||
      (month && !/^\d{4}-(0[1-9]|1[0-2])$/.test(month))) {
    return NextResponse.json({ error: "Invalid parameters" }, { status: 400, headers });
  }
  // API routes bypass middleware; authenticate explicitly and retain the caller's RLS.
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers });
  try {
    const result = widget === "stats" ? await getDashboardStats(businessId)
      : widget === "today" ? await getDashboardToday(businessId)
      : widget === "upcoming" ? await getDashboardUpcoming(businessId)
      : await getDashboardCalendarMonth(businessId, month);
    return NextResponse.json(result, { headers });
  } catch (error) {
    console.error("[dashboard API]", error);
    return NextResponse.json({ error: "Dashboard unavailable" }, { status: 500, headers });
  }
}
