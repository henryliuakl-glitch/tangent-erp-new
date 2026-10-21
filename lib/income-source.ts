export const INCOME_SOURCE_OPTIONS = [
  "Joint · ASB",
  "Joint · BNZ",
  "Joint · ANZ",
  "Joint · Kiwibank",
  "Company · ASB",
  "Company · BNZ",
  "微信 · Henry",
  "微信 · Yutong",
  "Cash",
] as const;

export type IncomeSource = string;

/**
 * 收款账户现在以 family_accounts 为主数据。
 * 这里仅保留非空字符串校验，用于兼容旧调用；真正的账户 ID 会在写入流水时解析。
 */
export function isIncomeSource(value: unknown): value is IncomeSource {
  return typeof value === "string" && value.trim().length > 0;
}
