export const INCOME_SOURCE_OPTIONS = [
  "牛教练 · ASB",
  "牛教练 · BNZ",
  "牛教练 · ANZ",
  "牛教练 · Kiwibank",
  "童教练 · ASB",
  "童教练 · BNZ",
  "童教练 · ANZ",
  "童教练 · Kiwibank",
  "Joint · ASB",
  "Joint · BNZ",
  "Joint · ANZ",
  "Joint · Kiwibank",
  "公司 · ASB",
  "公司 · BNZ",
  "公司 · ANZ",
  "公司 · Kiwibank",
  "现金",
  "人民币",
] as const;

export type IncomeSource = (typeof INCOME_SOURCE_OPTIONS)[number];

export function isIncomeSource(value: unknown): value is IncomeSource {
  return typeof value === "string" && INCOME_SOURCE_OPTIONS.includes(value as IncomeSource);
}
