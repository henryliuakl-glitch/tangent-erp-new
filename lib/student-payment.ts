/** 学员结算方式（students.payment_type）
 * 兼容历史值：
 * - single = 一课一结
 * - postpaid = 后付费（先上课，后统一结算）
 * - monthly / ten_sessions / term / custom = 预充值
 */

export type PaymentType = "single" | "monthly" | "postpaid";

export const PAYMENT_TYPE_OPTIONS: { value: PaymentType; label: string; description: string }[] = [
  { value: "monthly", label: "预充值", description: "先充值课时；充值时记现金收入，消课只记产值并扣课时" },
  { value: "postpaid", label: "后付费", description: "先上课形成应收课款；结算付款时才记现金收入" },
  { value: "single", label: "一课一结", description: "每次完成课程时同时记现金收入和产值，不保留课时欠款" },
];

export const DEFAULT_PAYMENT_TYPE: PaymentType = "monthly";

export function normalizePaymentType(type: string | null | undefined): PaymentType {
  if (type === "single") return "single";
  if (type === "postpaid") return "postpaid";
  return "monthly";
}

export function isPayAsYouGo(type: string | null | undefined): boolean {
  return normalizePaymentType(type) === "single";
}

export function isPostpaid(type: string | null | undefined): boolean {
  return normalizePaymentType(type) === "postpaid";
}

export function isPrepaid(type: string | null | undefined): boolean {
  return normalizePaymentType(type) === "monthly";
}

export function getPaymentTypeLabel(type: string | null | undefined): string {
  const normalized = normalizePaymentType(type);
  if (normalized === "single") return "一课一结";
  if (normalized === "postpaid") return "后付费";
  return "预充值";
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
  if (isPostpaid(paymentType)) return Number(balance) < 0;
  return Number(balance) < 0;
}

export function isBookingUnpaid(
  balance: number,
  paymentType: string | null | undefined,
  _cumulativeUsage?: number,
  _ctx?: PaymentContext
): boolean {
  if (isPayAsYouGo(paymentType)) return false;
  if (isPostpaid(paymentType)) return Number(balance) < 0;
  return Number(balance) < 0;
}
