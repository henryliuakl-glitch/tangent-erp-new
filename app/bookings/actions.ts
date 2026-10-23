"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { durationToMs } from "@/lib/utils";
import { incrementStudentBalance } from "@/lib/student-balance";
import { isDrivingSchoolBusiness, isOperationalBusinessId } from "@/lib/business";
import {
  recordPayAsYouGoLessonTuition,
  reversePayAsYouGoLessonTuition,
} from "@/lib/driving-settlement";
import { isPayAsYouGo, isPostpaid } from "@/lib/student-payment";
import {
  addCalendarDaysInNZ,
  addCalendarMonthsInNZ,
  getDayOfWeekInNZ,
  nzEndOfDayUtc,
  nzLocalToUtc,
} from "@/lib/timezone";
import { isIncomeSource } from "@/lib/income-source";
import {
  getWeekStep,
  isRecurringMode,
  normalizeRepeatMode,
  shouldParseWeeklySchedule,
} from "@/lib/recurrence";

type WeeklySession = { dayOfWeek: string; time: string };

async function loadBookingStudent(supabase: any, studentId: string | null | undefined) {
  if (!studentId) return { student: null as any, error: null as string | null };

  let primary = await supabase
    .from("students")
    .select("id,name,student_code,hourly_rate,currency,level,payment_type,income_source")
    .eq("id", studentId)
    .maybeSingle();

  if (
    primary.error &&
    /income_source|schema cache|column/i.test(primary.error.message || "")
  ) {
    const fallback = await supabase
      .from("students")
      .select("id,name,student_code,hourly_rate,currency,level,payment_type")
      .eq("id", studentId)
      .maybeSingle();

    return {
      student: fallback.data ? { ...fallback.data, income_source: null } : null,
      error: fallback.error?.message || null,
    };
  }

  return {
    student: primary.data || null,
    error: primary.error?.message || null,
  };
}

/** 循环排课：新西兰本地时间 → UTC ISO 会话列表 */
function buildBookingSessions(params: {
  dateStr: string;
  timeStr: string;
  repeatMode: string;
  endMode: string;
  repeatCount: number;
  endDateStr: string;
  weeklySchedule: WeeklySession[];
  customIntervalWeeks: number;
  duration: number;
}): { start_time: string; end_time: string; duration: number }[] {
  const {
    dateStr,
    timeStr,
    repeatMode: rawMode,
    endMode,
    repeatCount,
    endDateStr,
    weeklySchedule,
    customIntervalWeeks,
    duration,
  } = params;

  const repeatMode = normalizeRepeatMode(rawMode);
  const recurring = isRecurringMode(repeatMode);

  let schedule: WeeklySession[] = [];
  if (shouldParseWeeklySchedule(repeatMode)) {
    schedule = weeklySchedule.length > 0 ? weeklySchedule : [{ dayOfWeek: getDayOfWeekInNZ(dateStr).toString(), time: timeStr }];
  } else {
    schedule = [{ dayOfWeek: getDayOfWeekInNZ(dateStr).toString(), time: timeStr }];
  }

  const startDayOfWeek = getDayOfWeekInNZ(dateStr);
  const targetEndUtc =
    recurring && endMode === "date" && endDateStr
      ? nzEndOfDayUtc(endDateStr)
      : null;

  const sessions: { start_time: string; end_time: string; duration: number }[] = [];
  let iteration = 0;
  const maxIterations = repeatMode === "monthly" ? 24 : 52;
  const weekStep = getWeekStep(repeatMode, customIntervalWeeks);

  const pushSession = (localDateStr: string, sessionTime: string) => {
    const startDateTime = nzLocalToUtc(localDateStr, sessionTime);
    if (targetEndUtc && startDateTime > targetEndUtc) return false;

    const endDateTime = new Date(startDateTime.getTime() + durationToMs(duration));
    sessions.push({
      start_time: startDateTime.toISOString(),
      end_time: endDateTime.toISOString(),
      duration,
    });
    return true;
  };

  while (iteration < maxIterations) {
    if (repeatMode === "none" && iteration >= 1) break;
    if (recurring && endMode === "count" && iteration >= repeatCount) break;

    if (repeatMode === "monthly") {
      const localDateStr = addCalendarMonthsInNZ(dateStr, iteration);
      pushSession(localDateStr, timeStr);
    } else {
      for (const session of schedule) {
        const dayDiff = Number(session.dayOfWeek) - startDayOfWeek;
        const daysToAdd = iteration * 7 * weekStep + dayDiff;
        if (iteration === 0 && dayDiff < 0) continue;

        const localDateStr = addCalendarDaysInNZ(dateStr, daysToAdd);
        pushSession(localDateStr, session.time);
      }

      if (targetEndUtc) {
        const endOfPeriodStr = addCalendarDaysInNZ(
          dateStr,
          iteration * 7 * weekStep + 6
        );
        if (nzEndOfDayUtc(endOfPeriodStr) > targetEndUtc) break;
      }
    }

    if (repeatMode === "none") break;
    iteration++;
  }

  return sessions;
}

function parseWeeklySchedule(formData: FormData, repeatMode: string): WeeklySession[] {
  if (!shouldParseWeeklySchedule(repeatMode)) return [];
  const wsStr = formData.get("weeklySchedule") as string;
  if (!wsStr) return [];
  try {
    return JSON.parse(wsStr) as WeeklySession[];
  } catch {
    return [];
  }
}

function parseCustomIntervalWeeks(formData: FormData): number {
  const n = Number(formData.get("customIntervalWeeks"));
  return Number.isFinite(n) && n >= 1 ? Math.min(n, 52) : 1;
}

export type BookingScope = "single" | "following";

/** 同系列：同学员 + 同时长 + 同地点，且 start_time >= 本节 */
async function findSeriesBookings(
  supabase: Awaited<ReturnType<typeof createClient>>,
  booking: {
    id: string;
    student_id: string | null;
    start_time: string;
    duration: number;
    location: string | null;
    status?: string;
    business_unit_id?: string | null;
    subject?: string | null;
    teacher?: string | null;
    actual_rate?: number | null;
    metadata?: Record<string, unknown> | null;
  },
  scope: BookingScope
) {
  if (scope === "single" || !booking.student_id) {
    return [booking];
  }

  let query = supabase
    .from("bookings")
    .select("id, student_id, start_time, end_time, duration, location, status, business_unit_id, subject, teacher, actual_rate, metadata")
    .eq("student_id", booking.student_id)
    .eq("status", "confirmed")
    .eq("duration", booking.duration)
    .gte("start_time", booking.start_time)
    .order("start_time", { ascending: true });

  if (booking.location == null || booking.location === "") {
    query = query.is("location", null);
  } else {
    query = query.eq("location", booking.location);
  }

  const { data, error } = await query;
  if (error) return [booking];
  const list = data || [];
  if (!list.some((b) => b.id === booking.id)) {
    return [booking, ...list];
  }
  return list;
}

// 1. 创建预约 (教培)
export async function createBooking(prevState: any, formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "未登录" };

  const studentId = formData.get("studentId") as string;
  const dateStr = formData.get("date") as string;
  const timeStr = formData.get("time") as string;
  const duration = Number(formData.get("duration"));
  const location = formData.get("location") as string;
  const businessId = formData.get("businessId") as string;
  const subject = formData.get("subject") as string;
  const teacher = formData.get("teacher") as string;
  const notes = formData.get("notes") as string;

  if (!isOperationalBusinessId(businessId)) return { error: "请选择 CuS 或 Sine 业务实体" };

  const repeatMode = (formData.get("repeatMode") as string) || "none";
  const endMode = (formData.get("endMode") as string) || "count";
  const repeatCount = Number(formData.get("repeatCount")) || 1;
  const endDateStr = formData.get("endDate") as string;

  if (!studentId || !dateStr) return { error: "信息不完整" };
  if (!Number.isFinite(duration) || duration <= 0) return { error: "课时必须大于 0" };

  const sessionSlots = buildBookingSessions({
    dateStr,
    timeStr,
    repeatMode,
    endMode,
    repeatCount,
    endDateStr,
    weeklySchedule: parseWeeklySchedule(formData, repeatMode),
    customIntervalWeeks: parseCustomIntervalWeeks(formData),
    duration,
  });

  // 驾校/教培均不因课时或余额不足阻断排课
  const bookingsToInsert = sessionSlots.map((slot) => ({
    ...slot,
    student_id: studentId,
    location,
    business_unit_id: businessId,
    status: "confirmed",
    subject: subject || null,
    teacher: teacher || null,
    notes: notes || null,
  }));

  const { error } = await supabase.from("bookings").insert(bookingsToInsert);
  if (error) return { error: error.message };

  revalidatePath("/bookings");
  return { success: true };
}

// 2. 更新预约 — 接收新西兰本地 date + time，存储 UTC
// scope=following 时：对本节及后续同系列 confirmed 课施加相同时间偏移，并同步 duration/location
export async function updateBooking(
  id: string,
  data: {
    date: string;
    time: string;
    duration: number;
    location: string;
    teacher: string;
    actualRate: number | null;
    subject: string;
  },
  scope: BookingScope = "single"
) {
  const supabase = await createClient();

  if (!Number.isFinite(data.duration) || data.duration <= 0) {
    return { error: "课时必须大于 0" };
  }
  if (data.actualRate != null && (!Number.isFinite(data.actualRate) || data.actualRate < 0)) {
    return { error: "价格必须是有效的非负数" };
  }

  const { data: current, error: fetchError } = await supabase
    .from("bookings")
    .select("id, student_id, start_time, end_time, duration, location, status, business_unit_id, subject, teacher, actual_rate, metadata")
    .eq("id", id)
    .single();

  if (fetchError || !current) return { error: "Booking not found" };

  const newStart = nzLocalToUtc(data.date, data.time);
  const newEnd = new Date(newStart.getTime() + durationToMs(data.duration));
  const deltaMs = newStart.getTime() - new Date(current.start_time).getTime();

  const targets = await findSeriesBookings(supabase, current, scope);

  for (const b of targets) {
    const driving = isDrivingSchoolBusiness(b.business_unit_id || current.business_unit_id);
    const baseMetadata = (b.metadata as Record<string, unknown> | null) ?? {};
    const staffPayload = driving
      ? {
          teacher: null,
          metadata: {
            ...baseMetadata,
            coach: data.teacher || null,
          },
        }
      : {
          teacher: data.teacher || null,
        };

    if (b.id === id) {
      const { error } = await supabase.from("bookings").update({
        start_time: newStart.toISOString(),
        end_time: newEnd.toISOString(),
        duration: data.duration,
        location: data.location,
        subject: data.subject || null,
        actual_rate: data.actualRate,
        ...staffPayload,
      }).eq("id", id);
      if (error) return { error: error.message };
    } else {
      const shiftedStart = new Date(new Date(b.start_time).getTime() + deltaMs);
      const shiftedEnd = new Date(shiftedStart.getTime() + durationToMs(data.duration));
      const { error } = await supabase.from("bookings").update({
        start_time: shiftedStart.toISOString(),
        end_time: shiftedEnd.toISOString(),
        duration: data.duration,
        location: data.location,
        subject: data.subject || null,
        actual_rate: data.actualRate,
        ...staffPayload,
      }).eq("id", b.id);
      if (error) return { error: error.message };
    }
  }

  revalidatePath("/bookings");
  return { success: true, updatedCount: targets.length };
}

// 3. 完成预约
// 结算方式属于学员，不属于业务实体：
// 一课一结：完成时记 Tuition 现金收入，不扣预付课时。
// 预充值：完成时扣预付课时；现金已在充值时入账。
// 后付费：完成时形成负课时（应收），不记现金；实际结算时才记现金。
export async function completeBooking(
  id: string,
  studentId: string,
  duration: number,
  incomeSource?: string | null
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const { data: booking, error: fetchError } = await supabase
    .from("bookings")
    .select("id,status,student_id,duration,actual_rate,business_unit_id,start_time,metadata")
    .eq("id", id)
    .maybeSingle();

  if (fetchError) {
    console.error("[completeBooking] booking lookup failed:", fetchError.message);
    return { error: `课程读取失败：${fetchError.message}` };
  }
  if (!booking) return { error: "Booking not found" };
  if (booking.status === "completed") return { success: true };
  if (booking.status !== "confirmed") return { error: "只有待办课程可以完成" };

  const studentResult = await loadBookingStudent(supabase, booking.student_id || studentId);
  if (studentResult.error) {
    console.error("[completeBooking] student lookup failed:", studentResult.error);
    return { error: `学员读取失败：${studentResult.error}` };
  }
  const student = studentResult.student;
  const payAsYouGo = isPayAsYouGo(student?.payment_type);
  const resolvedIncomeSource = isIncomeSource(incomeSource)
    ? incomeSource
    : isIncomeSource(student?.income_source)
      ? student?.income_source
      : null;

  if (payAsYouGo && !resolvedIncomeSource) {
    return { error: "该学员为一课一结，请选择本次实际收款账户后再完成课程" };
  }

  // 幂等抢占：只有第一个把 confirmed 改成 completed 的请求才能继续扣课时/记收入。
  const { data: claimed, error: claimError } = await supabase
    .from("bookings")
    .update({ status: "completed" })
    .eq("id", id)
    .eq("status", "confirmed")
    .select("id")
    .maybeSingle();

  if (claimError) return { error: claimError.message };
  if (!claimed) return { success: true };

  const targetStudentId = booking.student_id || studentId;
  const hours = Number(booking.duration) || duration;

  if (!targetStudentId || !Number.isFinite(hours) || hours <= 0) {
    await supabase
      .from("bookings")
      .update({ status: "confirmed" })
      .eq("id", id)
      .eq("status", "completed");
    return { error: "课程缺少有效学员或课时，未执行消课" };
  }

  if (payAsYouGo) {
    const baseMetadata = (booking.metadata as Record<string, unknown> | null) ?? {};
    await supabase
      .from("bookings")
      .update({
        metadata: {
          ...baseMetadata,
          incomeSource: resolvedIncomeSource,
          settlementMode: "single",
        },
      })
      .eq("id", id)
      .eq("status", "completed");

    const tuitionRes = await recordPayAsYouGoLessonTuition(
      supabase,
      {
        id: booking.id,
        student_id: booking.student_id,
        duration: hours,
        actual_rate: booking.actual_rate,
        business_unit_id: booking.business_unit_id,
        start_time: booking.start_time,
        student,
        income_source: resolvedIncomeSource,
      },
      user?.id || ""
    );

    if (tuitionRes.error) {
      await supabase
        .from("bookings")
        .update({ status: "confirmed" })
        .eq("id", id)
        .eq("status", "completed");
      return { error: `消课收入写入失败，课程状态已回滚：${tuitionRes.error}` };
    }
  } else {
    const balanceRes = await incrementStudentBalance(supabase, targetStudentId, -hours);
    if (balanceRes.error) {
      await supabase
        .from("bookings")
        .update({ status: "confirmed" })
        .eq("id", id)
        .eq("status", "completed");
      return { error: `扣课时失败，课程状态已回滚：${balanceRes.error}` };
    }

    const baseMetadata = (booking.metadata as Record<string, unknown> | null) ?? {};
    await supabase
      .from("bookings")
      .update({
        metadata: {
          ...baseMetadata,
          settlementMode: isPostpaid(student?.payment_type) ? "postpaid" : "prepaid",
        },
      })
      .eq("id", id)
      .eq("status", "completed");
  }

  revalidatePath("/bookings");
  revalidatePath("/students");
  revalidatePath("/finance");
  revalidatePath("/");
  return { success: true };
}

// 4. 取消预约 — scope=following 时批量取消本节及后续同系列 confirmed 课
export async function cancelBooking(id: string, scope: BookingScope = "single") {
  const supabase = await createClient();

  const { data: booking } = await supabase
    .from("bookings")
    .select("id, status, student_id, duration, start_time, location, business_unit_id")
    .eq("id", id)
    .single();

  if (!booking) return { error: "Booking not found" };

  const targets =
    scope === "following" && booking.status === "confirmed"
      ? await findSeriesBookings(supabase, booking, scope)
      : [booking];

  let cancelledCount = 0;

  for (const b of targets) {
    if (b.status === "cancelled") continue;

    if (b.status === "confirmed") {
      const { data: changed, error } = await supabase
        .from("bookings")
        .update({ status: "cancelled" })
        .eq("id", b.id)
        .eq("status", "confirmed")
        .select("id")
        .maybeSingle();

      if (error) return { error: error.message };
      if (changed) cancelledCount++;
      continue;
    }

    if (b.status !== "completed") continue;

    // 先抢占 completed → cancelled，避免并发重复恢复课时。
    const { data: claimed, error: claimError } = await supabase
      .from("bookings")
      .update({ status: "cancelled" })
      .eq("id", b.id)
      .eq("status", "completed")
      .select("id")
      .maybeSingle();

    if (claimError) return { error: claimError.message };
    if (!claimed) continue;

    const { data: full, error: fullError } = await supabase
      .from("bookings")
      .select("id,business_unit_id,student_id,duration,metadata")
      .eq("id", b.id)
      .maybeSingle();

    if (fullError || !full) {
      await supabase.from("bookings").update({ status: "completed" }).eq("id", b.id).eq("status", "cancelled");
      return { error: `取消失败：课程详情读取失败${fullError ? `：${fullError.message}` : ""}` };
    }

    const fullStudentResult = await loadBookingStudent(supabase, full.student_id);
    if (fullStudentResult.error) {
      await supabase.from("bookings").update({ status: "completed" }).eq("id", b.id).eq("status", "cancelled");
      return { error: `取消失败：学员详情读取失败：${fullStudentResult.error}` };
    }
    const fullStudent = fullStudentResult.student;
    const completedAsPayg =
      (full.metadata as Record<string, unknown> | null)?.settlementMode === "single" ||
      (!(full.metadata as Record<string, unknown> | null)?.settlementMode && isPayAsYouGo(fullStudent?.payment_type));

    if (completedAsPayg) {
      const reverseRes = await reversePayAsYouGoLessonTuition(supabase, b.id);
      if (reverseRes.error) {
        await supabase.from("bookings").update({ status: "completed" }).eq("id", b.id).eq("status", "cancelled");
        return { error: `取消失败，课程状态已回滚：${reverseRes.error}` };
      }
    } else if (full.student_id) {
      const balanceRes = await incrementStudentBalance(
        supabase,
        full.student_id,
        Number(full.duration)
      );

      if (balanceRes.error) {
        await supabase.from("bookings").update({ status: "completed" }).eq("id", b.id).eq("status", "cancelled");
        return { error: `恢复课时失败，课程状态已回滚：${balanceRes.error}` };
      }
    }

    cancelledCount++;
  }

  revalidatePath("/bookings");
  revalidatePath("/students");
  revalidatePath("/finance");
  return { success: true, cancelledCount };
}

// 5. 删除预约
export async function deleteBooking(id: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const { data: booking, error: fetchError } = await supabase
    .from("bookings")
    .select("id,status,student_id,duration,actual_rate,business_unit_id,start_time,metadata")
    .eq("id", id)
    .maybeSingle();

  if (fetchError) {
    console.error("[deleteBooking] booking lookup failed:", fetchError.message);
    return { error: `课程读取失败：${fetchError.message}` };
  }
  if (!booking) return { error: "Booking not found" };

  const bookingStudentResult = await loadBookingStudent(supabase, booking.student_id);
  if (bookingStudentResult.error) {
    return { error: `学员读取失败：${bookingStudentResult.error}` };
  }
  const bookingStudent = bookingStudentResult.student;

  // 已完成课程先抢占成 cancelled，再恢复课时/删除收入，防止并发重复回滚。
  if (booking.status === "completed") {
    const { data: claimed, error: claimError } = await supabase
      .from("bookings")
      .update({ status: "cancelled" })
      .eq("id", id)
      .eq("status", "completed")
      .select("id")
      .maybeSingle();

    if (claimError) return { error: claimError.message };
    if (!claimed) return { error: "课程状态已被其他操作修改，请刷新后重试" };

    const completedAsPayg =
      (booking.metadata as Record<string, unknown> | null)?.settlementMode === "single" ||
      (!(booking.metadata as Record<string, unknown> | null)?.settlementMode && isPayAsYouGo(bookingStudent?.payment_type));

    if (completedAsPayg) {
      const reverseRes = await reversePayAsYouGoLessonTuition(supabase, id);
      if (reverseRes.error) {
        await supabase.from("bookings").update({ status: "completed" }).eq("id", id).eq("status", "cancelled");
        return { error: reverseRes.error };
      }
    } else if (booking.student_id) {
      const balanceRes = await incrementStudentBalance(
        supabase,
        booking.student_id,
        Number(booking.duration)
      );
      if (balanceRes.error) {
        await supabase.from("bookings").update({ status: "completed" }).eq("id", id).eq("status", "cancelled");
        return { error: balanceRes.error };
      }
    }

    const { error: deleteError } = await supabase
      .from("bookings")
      .delete()
      .eq("id", id)
      .eq("status", "cancelled");

    if (deleteError) {
      // 删除失败：尽力恢复到“已完成 + 已扣课时/已记收入”的原状态。
      if (completedAsPayg) {
        const student = bookingStudent;
        await recordPayAsYouGoLessonTuition(
          supabase,
          {
            id: booking.id,
            student_id: booking.student_id,
            duration: Number(booking.duration),
            actual_rate: booking.actual_rate,
            business_unit_id: booking.business_unit_id,
            start_time: booking.start_time,
            student,
            income_source: (booking.metadata as Record<string, unknown> | null)?.incomeSource
              ? String((booking.metadata as Record<string, unknown>).incomeSource)
              : student?.income_source || null,
          },
          user?.id || ""
        );
      } else if (booking.student_id) {
        await incrementStudentBalance(supabase, booking.student_id, -Number(booking.duration));
      }

      await supabase
        .from("bookings")
        .update({ status: "completed" })
        .eq("id", id)
        .eq("status", "cancelled");

      return { error: `删除失败，已尝试恢复原状态：${deleteError.message}` };
    }
  } else {
    const { error } = await supabase.from("bookings").delete().eq("id", id);
    if (error) return { error: error.message };
  }

  revalidatePath("/bookings");
  revalidatePath("/students");
  revalidatePath("/finance");
  return { success: true };
}

// 6. 驾校极速排课
export async function quickCreateDrivingBooking(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "未登录" };

  const businessId = formData.get("businessId") as string;
  const identifier = formData.get("identifier") as string;
  const dateStr = formData.get("date") as string;
  const timeStr = formData.get("time") as string;
  const duration = Number(formData.get("duration"));
  const location = formData.get("location") as string;
  const actualRate = Number(formData.get("actualRate"));
  const subject = formData.get("subject") as string;
  const notes = formData.get("notes") as string;

  if (businessId !== "sine") return { error: "驾校排课必须归属 Sine" };

  const repeatMode = (formData.get("repeatMode") as string) || "none";
  const endMode = (formData.get("endMode") as string) || "count";
  const repeatCount = Number(formData.get("repeatCount")) || 1;
  const endDateStr = formData.get("endDate") as string;

  const metadata = {
    useInstructorCar: formData.get("useInstructorCar") === "true",
    needPickup: formData.get("needPickup") === "true",
    pickupAddress: formData.get("pickupAddress") as string,
    plateNumber: formData.get("plateNumber") as string,
    coach: (formData.get("coach") as string) || null,
  };

  if (!identifier || !dateStr) return { error: "信息不完整" };
  if (!Number.isFinite(duration) || duration <= 0) return { error: "课时必须大于 0" };
  if (!Number.isFinite(actualRate) || actualRate < 0) return { error: "价格必须是有效的非负数" };
  // 极速排课默认新学员为一课一结；已有学员沿用其个人结算方式。

  let studentId = "";
  const { data: existingStudent } = await supabase
    .from("students")
    .select("id")
    .eq("business_unit_id", businessId)
    .or(`student_code.eq.${identifier},name.eq.${identifier}`)
    .limit(1)
    .single();

  if (existingStudent) {
    studentId = existingStudent.id;
  } else {
    const { data: newStudent, error: createError } = await supabase
      .from("students")
      .insert({
        name: identifier,
        student_code: identifier,
        business_unit_id: businessId,
        level: "Driving",
        balance: 0,
        hourly_rate: actualRate,
        payment_type: "single",
      })
      .select("id")
      .single();

    if (createError) return { error: "学员创建失败: " + createError.message };
    studentId = newStudent.id;
  }

  const sessionSlots = buildBookingSessions({
    dateStr,
    timeStr,
    repeatMode,
    endMode,
    repeatCount,
    endDateStr,
    weeklySchedule: parseWeeklySchedule(formData, repeatMode),
    customIntervalWeeks: parseCustomIntervalWeeks(formData),
    duration,
  });

  const bookingsToInsert = sessionSlots.map((slot) => ({
    ...slot,
    student_id: studentId,
    location,
    business_unit_id: businessId,
    status: "confirmed",
    actual_rate: actualRate,
    subject: subject || null,
    notes: notes || null,
    metadata,
  }));

  const { error } = await supabase.from("bookings").insert(bookingsToInsert);
  if (error) return { error: error.message };

  revalidatePath("/bookings");
  revalidatePath("/students");
  return { success: true };
}
