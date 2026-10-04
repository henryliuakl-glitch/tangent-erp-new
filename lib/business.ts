/** 业务单元：驾校一单一结，不走预付课时门槛 */
export function isDrivingSchoolBusiness(businessId?: string | null): boolean {
  return typeof businessId === "string" && businessId.toLowerCase().includes("sine");
}


export const TANGENT_CHILD_BUSINESS_IDS = ["cus", "sine"] as const;

export type OperationalBusinessId = (typeof TANGENT_CHILD_BUSINESS_IDS)[number];

export function isOperationalBusinessId(value?: string | null): value is OperationalBusinessId {
  return value === "cus" || value === "sine";
}

export function businessUnitLabel(value?: string | null): string {
  if (value === "sine") return "Sine";
  if (value === "cus") return "CuS";
  if (value === "tangent") return "Tangent";
  return value || "Unknown";
}
