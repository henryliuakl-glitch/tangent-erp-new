/** 学员缴费类型（students.payment_type） */
import { isDrivingSchoolBusiness } from "@/lib/business";

export type PaymentType = "single" | "monthly" | "ten_sessions" | "term" | "custom";

export const PAYMENT_TYPE_OPTIONS: { value: PaymentType; label: string }[] = [
  { value: "single", label: "一课一缴" },
  { value: "monthly", label: "一月一缴" },
  { value: "ten_sessions", label: "十节课一缴" },
  { value: "term", label: "一学期一缴" },
  { value: "custom", label: "自定义" },
];

export const DEFAULT_PAYMENT_TYPE: PaymentType = "monthly";

export function getPaymentTypeLabel(type: string | null | undefined): string {
  return PAYMENT_TYPE_OPTIONS.find((o) => o.value === type)?.label ?? "一月一缴";
}

export type PaymentContext = {
  businessUnitId?: string | null;
  level?: string | null;
};

/** 驾校一单一结：不按预付余额做欠费判定 */
export function isPayAsYouGoDriving(ctx?: PaymentContext): boolean {
  if (isDrivingSchoolBusiness(ctx?.businessUnitId)) return true;
  if (typeof ctx?.level === "string" && /driving/i.test(ctx.level)) return true;
  return false;
}

/**
 * 学员列表「欠费」红标 / 工作台课时提醒
 * - 驾校一单一结不按余额报警
 * - 教培预付：余额 <= 0 即需续费
 * - 即使余额仍为正，只要已确认的待上课时超过余额，也视为欠费/课时不足
 * - single 类型仅在余额 < 0 或已排课超过余额时报警
 */
export function isPaymentAlert(
  balance: number,
  paymentType?: string | null,
  ctx?: PaymentContext,
  scheduledHours = 0
): boolean {
  if (isPayAsYouGoDriving(ctx)) return false;

  const bal = Number(balance);
  const scheduled = Math.max(0, Number(scheduledHours) || 0);

  if (scheduled > bal) return true;
  if (bal < 0) return true;

  const type = paymentType || DEFAULT_PAYMENT_TYPE;
  if (type === "single") return false;

  return bal <= 0;
}

/**
 * Dashboard 待办课程「待缴费」标签
 * - single：仅 balance < 0
 * - 其他预付费：balance <= 0
 * - balance > 0：绝对不显示（禁止用累计待消课时误标）
 * - 驾校一单一结：不显示
 */
export function isBookingUnpaid(
  balance: number,
  paymentType: string | null | undefined,
  _cumulativeUsage?: number,
  ctx?: PaymentContext
): boolean {
  if (isPayAsYouGoDriving(ctx)) return false;
  const bal = Number(balance);
  if (bal > 0) return false;
  const type = paymentType || DEFAULT_PAYMENT_TYPE;
  if (type === "single") return bal < 0;
  return bal <= 0;
}
