import type { SupabaseClient } from "@supabase/supabase-js";
import { insertTransaction } from "@/lib/transaction-write";
import { normalizeCurrency } from "@/lib/currency";
import { isDrivingSchoolBusiness } from "@/lib/business";

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function lessonTuitionMarker(bookingId: string): string {
  return `[booking:${bookingId}]`;
}

type LessonStudent = {
  name?: string | null;
  student_code?: string | null;
  hourly_rate?: number | null;
  currency?: string | null;
} | null;

type LessonBooking = {
  id: string;
  student_id: string | null;
  duration: number;
  actual_rate?: number | null;
  business_unit_id?: string | null;
  start_time?: string | null;
  student?: LessonStudent;
  income_source?: string | null;
};

/** 驾校消课：按时长 × 单价记 Tuition 实收，不扣预付课时 */
export async function recordDrivingLessonTuition(
  supabase: SupabaseClient,
  booking: LessonBooking,
  createdBy: string
): Promise<{ error: string | null }> {
  if (!isDrivingSchoolBusiness(booking.business_unit_id)) return { error: null };
  if (!booking.student_id) return { error: null };

  const duration = Number(booking.duration) || 0;
  const rate = Number(booking.actual_rate ?? booking.student?.hourly_rate ?? 85);
  const amount = round2(duration * rate);
  if (!(amount > 0) || !(duration > 0)) return { error: null };

  const marker = lessonTuitionMarker(booking.id);
  const { data: existing } = await supabase
    .from("transactions")
    .select("id")
    .eq("category", "Tuition")
    .ilike("description", `%${marker}%`)
    .limit(1);

  if (existing && existing.length > 0) return { error: null };

  const identifier = booking.student?.student_code || booking.student?.name || "学员";
  return insertTransaction(supabase, {
    type: "income",
    amount,
    category: "Tuition",
    description: `消课实收 ${marker} ${identifier} × ${duration}h`,
    transaction_date: booking.start_time ?? new Date().toISOString(),
    business_unit_id: booking.business_unit_id,
    created_by: createdBy,
    student_id: booking.student_id,
    quantity: duration,
    currency: normalizeCurrency(booking.student?.currency),
    income_source: booking.income_source || null,
  });
}

export async function reverseDrivingLessonTuition(
  supabase: SupabaseClient,
  bookingId: string
): Promise<{ error: string | null }> {
  const marker = lessonTuitionMarker(bookingId);
  const { data, error } = await supabase
    .from("transactions")
    .select("id")
    .eq("category", "Tuition")
    .ilike("description", `%${marker}%`);

  if (error) return { error: error.message };
  if (!data?.length) return { error: null };

  const { error: delError } = await supabase
    .from("transactions")
    .delete()
    .in(
      "id",
      data.map((row) => row.id)
    );

  return { error: delError?.message ?? null };
}
