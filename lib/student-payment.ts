/** 学员结算方式（students.payment_type）
 * 兼容历史值：
 * - single = 一课一结
 * - monthly / ten_sessions / term / custom = 预充值
 * 新 UI 只暴露两种模式，避免把“月付/十节/学期”与真正现金确认逻辑混在一起。
 */

export type PaymentType = "single" | "monthly";

export const PAYMENT_TYPE_OPTIONS: { value: PaymentType; label: string; description: string }[] = [
  { value: "monthly", label: "预充值", description: "先充值课时；充值时记现金收入，消课只记产值并扣课时" },
  { value: "single", label: "一课一结", description: "每次完成课程时同时记现金收入和产值，不使用预付课时余额" },
];

export const DEFAULT_PAYMENT_TYPE: PaymentType = "monthly";

export function normalizePaymentType(type: string | null | undefined): PaymentType {
  return type === "single" ? "single" : "monthly";
}

export function isPayAsYouGo(type: string | null | undefined): boolean {
  return normalizePaymentType(type) === "single";
}

export function isPrepaid(type: string | null | undefined): boolean {
  return !isPayAsYouGo(type);
}

export function getPaymentTypeLabel(type: string | null | undefined): string {
  return isPayAsYouGo(type) ? "一课一结" : "预充值";
}

export type PaymentContext = {
  businessUnitId?: string | null;
  level?: string | null;
};

/** @deprecated 兼容旧调用；现在不再按业务实体判断，完全由学员 payment_type 决定 */
export function isPayAsYouGoDriving(_ctx?: PaymentContext): boolean {
  return false;
}

export function isPaymentAlert(
  balance: number,
  paymentType?: string | null,
  _ctx?: PaymentContext,
  _scheduledHours = 0
): boolean {
  if (isPayAsYouGo(paymentType)) return false;
  return Number(balance) < 0;
}

export function isBookingUnpaid(
  balance: number,
  paymentType: string | null | undefined,
  _cumulativeUsage?: number,
  _ctx?: PaymentContext
): boolean {
  if (isPayAsYouGo(paymentType)) return false;
  return Number(balance) < 0;
}
