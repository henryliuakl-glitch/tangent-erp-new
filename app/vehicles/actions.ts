"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { insertTransaction } from "@/lib/transaction-write";

const VEHICLE_SELECT = `
  id, business_unit_id, nickname, make, model, year, color, plate_number,
  transmission, usage_status, primary_driver, owner, purchase_date, purchase_price,
  current_odometer_km, wof_expiry, rego_expiry, insurance_provider,
  insurance_policy_number, insurance_type, insurance_premium_amount,
  insurance_premium_frequency, insurance_expiry, next_service_date,
  next_service_odometer_km, condition_status, known_issues, tyre_status,
  battery_status, notes, created_at, updated_at
`;

function clean(value: FormDataEntryValue | null) {
  const text = String(value ?? "").trim();
  return text || null;
}

function numberOrNull(value: FormDataEntryValue | null) {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

export async function listVehicles() {
  const supabase = await createClient();

  const { data: vehicles, error } = await supabase
    .from("vehicles")
    .select(VEHICLE_SELECT)
    .eq("business_unit_id", "sine")
    .order("nickname");

  if (error) return { vehicles: [], maintenance: [], error: error.message };

  const ids = (vehicles || []).map((v: any) => v.id);
  if (ids.length === 0) return { vehicles: [], maintenance: [], error: null };

  const { data: maintenance, error: maintenanceError } = await supabase
    .from("vehicle_maintenance")
    .select("id, vehicle_id, service_date, odometer_km, service_types, cost, provider, notes, receipt_url, transaction_id, created_at")
    .in("vehicle_id", ids)
    .order("service_date", { ascending: false });

  return {
    vehicles: vehicles || [],
    maintenance: maintenance || [],
    error: maintenanceError?.message || null,
  };
}

export async function createVehicle(formData: FormData) {
  const supabase = await createClient();

  const nickname = clean(formData.get("nickname"));
  const make = clean(formData.get("make"));
  const model = clean(formData.get("model"));
  const plateNumber = clean(formData.get("plateNumber"));

  if (!nickname || !make || !model || !plateNumber) {
    return { error: "昵称、品牌、车型和车牌号为必填项" };
  }

  const odometer = numberOrNull(formData.get("currentOdometerKm")) ?? 0;
  if (odometer < 0) return { error: "公里数不能小于 0" };

  const { error } = await supabase.from("vehicles").insert({
    business_unit_id: "sine",
    nickname,
    make,
    model,
    year: numberOrNull(formData.get("year")),
    color: clean(formData.get("color")),
    plate_number: String(plateNumber).toUpperCase(),
    transmission: clean(formData.get("transmission")),
    usage_status: clean(formData.get("usageStatus")) || "teaching",
    primary_driver: clean(formData.get("primaryDriver")),
    owner: clean(formData.get("owner")),
    purchase_date: clean(formData.get("purchaseDate")),
    purchase_price: numberOrNull(formData.get("purchasePrice")),
    current_odometer_km: odometer,
    wof_expiry: clean(formData.get("wofExpiry")),
    rego_expiry: clean(formData.get("regoExpiry")),
    insurance_provider: clean(formData.get("insuranceProvider")),
    insurance_policy_number: clean(formData.get("insurancePolicyNumber")),
    insurance_type: clean(formData.get("insuranceType")),
    insurance_premium_amount: numberOrNull(formData.get("insurancePremiumAmount")),
    insurance_premium_frequency: clean(formData.get("insurancePremiumFrequency")),
    insurance_expiry: clean(formData.get("insuranceExpiry")),
    next_service_date: clean(formData.get("nextServiceDate")),
    next_service_odometer_km: numberOrNull(formData.get("nextServiceOdometerKm")),
    condition_status: clean(formData.get("conditionStatus")) || "normal",
    known_issues: clean(formData.get("knownIssues")),
    tyre_status: clean(formData.get("tyreStatus")),
    battery_status: clean(formData.get("batteryStatus")),
    notes: clean(formData.get("notes")),
  });

  if (error) return { error: error.message };
  revalidatePath("/vehicles");
  return { success: true };
}

export async function updateVehicle(id: string, formData: FormData) {
  const supabase = await createClient();
  const odometer = numberOrNull(formData.get("currentOdometerKm"));

  if (odometer != null && odometer < 0) return { error: "公里数不能小于 0" };

  const { error } = await supabase
    .from("vehicles")
    .update({
      nickname: clean(formData.get("nickname")),
      make: clean(formData.get("make")),
      model: clean(formData.get("model")),
      year: numberOrNull(formData.get("year")),
      color: clean(formData.get("color")),
      plate_number: String(clean(formData.get("plateNumber")) || "").toUpperCase(),
      transmission: clean(formData.get("transmission")),
      usage_status: clean(formData.get("usageStatus")) || "teaching",
      primary_driver: clean(formData.get("primaryDriver")),
      owner: clean(formData.get("owner")),
      purchase_date: clean(formData.get("purchaseDate")),
      purchase_price: numberOrNull(formData.get("purchasePrice")),
      current_odometer_km: odometer ?? 0,
      wof_expiry: clean(formData.get("wofExpiry")),
      rego_expiry: clean(formData.get("regoExpiry")),
      insurance_provider: clean(formData.get("insuranceProvider")),
      insurance_policy_number: clean(formData.get("insurancePolicyNumber")),
      insurance_type: clean(formData.get("insuranceType")),
      insurance_premium_amount: numberOrNull(formData.get("insurancePremiumAmount")),
      insurance_premium_frequency: clean(formData.get("insurancePremiumFrequency")),
      insurance_expiry: clean(formData.get("insuranceExpiry")),
      next_service_date: clean(formData.get("nextServiceDate")),
      next_service_odometer_km: numberOrNull(formData.get("nextServiceOdometerKm")),
      condition_status: clean(formData.get("conditionStatus")) || "normal",
      known_issues: clean(formData.get("knownIssues")),
      tyre_status: clean(formData.get("tyreStatus")),
      battery_status: clean(formData.get("batteryStatus")),
      notes: clean(formData.get("notes")),
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("business_unit_id", "sine");

  if (error) return { error: error.message };
  revalidatePath("/vehicles");
  return { success: true };
}

export async function deleteVehicle(id: string) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("vehicles")
    .delete()
    .eq("id", id)
    .eq("business_unit_id", "sine");

  if (error) return { error: error.message };
  revalidatePath("/vehicles");
  return { success: true };
}

export async function addMaintenance(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "未登录" };

  const vehicleId = String(formData.get("vehicleId") || "");
  const serviceDate = String(formData.get("serviceDate") || "");
  const odometer = numberOrNull(formData.get("odometerKm"));
  const cost = numberOrNull(formData.get("cost")) ?? 0;
  const serviceTypes = formData
    .getAll("serviceTypes")
    .map((v) => String(v).trim())
    .filter(Boolean);
  const syncFinance = formData.get("syncFinance") === "true";

  if (!vehicleId || !serviceDate || serviceTypes.length === 0) {
    return { error: "请填写日期并至少选择一个保养/维修项目" };
  }

  const { data: vehicle, error: vehicleError } = await supabase
    .from("vehicles")
    .select("id, nickname, plate_number, current_odometer_km")
    .eq("id", vehicleId)
    .eq("business_unit_id", "sine")
    .maybeSingle();

  if (vehicleError || !vehicle) return { error: "找不到车辆" };

  let transactionId: string | null = null;
  if (syncFinance && cost > 0) {
    const tx = await insertTransaction(supabase, {
      type: "expense",
      amount: cost,
      category: "Vehicle Maintenance",
      description: `车辆保养/维修 · ${vehicle.nickname} ${vehicle.plate_number} · ${serviceTypes.join("、")}`,
      transaction_date: serviceDate,
      business_unit_id: "sine",
      created_by: user.id,
      currency: "NZD",
    });

    if (tx.error) return { error: `财务流水写入失败：${tx.error}` };
    transactionId = tx.id || null;
  }

  const { error } = await supabase.from("vehicle_maintenance").insert({
    vehicle_id: vehicleId,
    service_date: serviceDate,
    odometer_km: odometer,
    service_types: serviceTypes,
    cost,
    provider: clean(formData.get("provider")),
    notes: clean(formData.get("notes")),
    receipt_url: clean(formData.get("receiptUrl")),
    transaction_id: transactionId,
  });

  if (error) {
    if (transactionId) await supabase.from("transactions").delete().eq("id", transactionId);
    return { error: error.message };
  }

  if (odometer != null && odometer > Number(vehicle.current_odometer_km || 0)) {
    await supabase
      .from("vehicles")
      .update({ current_odometer_km: odometer, updated_at: new Date().toISOString() })
      .eq("id", vehicleId);
  }

  revalidatePath("/vehicles");
  revalidatePath("/finance");
  revalidatePath("/");
  return { success: true };
}

export async function deleteMaintenance(id: string) {
  const supabase = await createClient();
  const { data: row, error: fetchError } = await supabase
    .from("vehicle_maintenance")
    .select("id, transaction_id")
    .eq("id", id)
    .maybeSingle();

  if (fetchError || !row) return { error: "找不到该记录" };

  const { error } = await supabase.from("vehicle_maintenance").delete().eq("id", id);
  if (error) return { error: error.message };

  if (row.transaction_id) {
    await supabase.from("transactions").delete().eq("id", row.transaction_id);
  }

  revalidatePath("/vehicles");
  revalidatePath("/finance");
  return { success: true };
}
