/** 报销平账：待打款流水不计入净现金流，确认打款后才记支出 */

export const REIMBURSE_PENDING_MARK = "[报销待打款]";
export const REIMBURSE_PAID_MARK = "[报销已打款]";

export const REIMBURSE_CATEGORIES = [
  { value: "Fuel", label: "油费" },
  { value: "Parking", label: "停车费" },
  { value: "Exam", label: "考试/场地" },
  { value: "Supplies", label: "物料耗材" },
  { value: "Transport", label: "交通" },
  { value: "Meals", label: "餐饮" },
  { value: "Other", label: "其他" },
] as const;

export type ReimburseCategory = (typeof REIMBURSE_CATEGORIES)[number]["value"];

export const REIMBURSE_CLAIMANTS = ["牛教练", "童教练", "Henry"] as const;

export function getReimburseCategoryLabel(value: string | null | undefined): string {
  return REIMBURSE_CATEGORIES.find((c) => c.value === value)?.label ?? value ?? "其他";
}

export function isReimbursementTx(description?: string | null): boolean {
  const d = description || "";
  return d.includes(REIMBURSE_PENDING_MARK) || d.includes(REIMBURSE_PAID_MARK);
}

export function isPendingReimbursementTx(description?: string | null): boolean {
  return (description || "").includes(REIMBURSE_PENDING_MARK);
}

export function isPaidReimbursementTx(description?: string | null): boolean {
  return (description || "").includes(REIMBURSE_PAID_MARK);
}

export function formatReimburseDescription(input: {
  claimant: string;
  notes?: string | null;
  paid?: boolean;
}): string {
  const mark = input.paid ? REIMBURSE_PAID_MARK : REIMBURSE_PENDING_MARK;
  const claimant = input.claimant.trim() || "未填写";
  const notes = input.notes?.trim();
  return notes ? `${mark} 垫付:${claimant} | ${notes}` : `${mark} 垫付:${claimant}`;
}

export function parseReimburseClaimant(description?: string | null): string {
  const m = (description || "").match(/垫付:([^|]+)/);
  return m?.[1]?.trim() || "";
}

export function parseReimburseNotes(description?: string | null): string {
  const raw = description || "";
  const idx = raw.indexOf("|");
  if (idx < 0) return "";
  return raw.slice(idx + 1).trim();
}

export function markReimbursePaid(description?: string | null): string {
  return (description || REIMBURSE_PENDING_MARK).replace(
    REIMBURSE_PENDING_MARK,
    REIMBURSE_PAID_MARK
  );
}
