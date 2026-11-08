import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * One independent bearer token per calendar scope/staff pair.
 * Possession of the Henry/CuS link must not authorize the entire ERP calendar.
 * Keep CALENDAR_FEED_SECRET server-side only, never in NEXT_PUBLIC_ variables.
 */
export function calendarFeedToken(businessId: string, staff: string | null): string | null {
  const secret = process.env.CALENDAR_FEED_SECRET;
  if (!secret || secret.length < 24) return null;
  return createHmac("sha256", secret)
    .update(`tangent-ics-v1:${businessId}:${staff || "all"}`)
    .digest("hex");
}

export function isValidCalendarFeedToken(
  supplied: string | null,
  businessId: string,
  staff: string | null
): boolean {
  if (!supplied) return false;
  const expected = calendarFeedToken(businessId, staff);
  if (!expected || supplied.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(supplied), Buffer.from(expected));
}
