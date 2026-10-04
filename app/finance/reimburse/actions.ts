"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { insertTransaction, updateTransactionRow } from "@/lib/transaction-write";
import { normalizeCurrency } from "@/lib/currency";
import { isOperationalBusinessId } from "@/lib/business";
import {
  formatReimburseDescription,
  isPaidReimbursementTx,
  isPendingReimbursementTx,
  markReimbursePaid,
} from "@/lib/reimbursement";

function revalidateFinance() {
  revalidatePath("/finance");
  revalidatePath("/finance/reimburse");
  revalidatePath("/finance/transactions");
  revalidatePath("/");
}

export async function createReimbursement(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "未登录" };

  const amount = Number(formData.get("amount"));
  const category = String(formData.get("category") || "").trim();
  const claimant = String(formData.get("claimant") || "").trim();
  const date = String(formData.get("date") || "");
  const notes = String(formData.get("notes") || "");
  const businessId = String(formData.get("businessId") || "");
  const proofUrl = String(formData.get("proofUrl") || "");
  const currency = normalizeCurrency(formData.get("currency") as string);

  if (!(amount > 0) || !category || !claimant || !date || !businessId) {
    return { error: "请填写垫付人、金额、分类和日期" };
  }
  if (!isOperationalBusinessId(businessId)) {
    return { error: "请选择 CuS 或 Sine 业务实体" };
  }

  const { error } = await insertTransaction(supabase, {
    type: "expense",
    amount,
    category,
    description: formatReimburseDescription({ claimant, notes }),
    transaction_date: date,
    business_unit_id: businessId,
    proof_img_url: proofUrl || null,
    created_by: user.id,
    currency,
  });

  if (error) return { error };
  revalidateFinance();
  return { success: true };
}

export async function listReimbursements(businessId: string) {
  const supabase = await createClient();
  if (!businessId) return { pending: [], paid: [], error: "缺少业务单元" };

  let query = supabase
    .from("transactions")
    .select("*")
    .or("description.ilike.%[报销待打款]%,description.ilike.%[报销已打款]%")
    .order("transaction_date", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(200);

  if (businessId === "tangent") {
    query = query.in("business_unit_id", ["cus", "sine"]);
  } else {
    query = query.eq("business_unit_id", businessId);
  }

  const { data, error } = await query;
  if (error) return { pending: [], paid: [], error: error.message };

  const pending: typeof data = [];
  const paid: typeof data = [];
  for (const row of data || []) {
    const desc = row.description as string | null;
    if (isPendingReimbursementTx(desc)) pending.push(row);
    else if (isPaidReimbursementTx(desc)) paid.push(row);
  }

  return { pending, paid, error: null };
}

export async function settleReimbursement(id: string) {
  const supabase = await createClient();
  const { data: tx, error: fetchError } = await supabase
    .from("transactions")
    .select("id, description")
    .eq("id", id)
    .single();

  if (fetchError || !tx) return { error: "找不到报销记录" };
  if (!isPendingReimbursementTx(tx.description)) {
    return { error: "该记录已打款或不属于待报销" };
  }

  const { error } = await updateTransactionRow(supabase, id, {
    description: markReimbursePaid(tx.description),
  });
  if (error) return { error };

  revalidateFinance();
  return { success: true };
}

export async function deleteReimbursement(id: string) {
  const supabase = await createClient();
  const { data: tx } = await supabase
    .from("transactions")
    .select("id, description")
    .eq("id", id)
    .single();

  if (!tx) return { error: "找不到报销记录" };
  if (!isPendingReimbursementTx(tx.description) && !isPaidReimbursementTx(tx.description)) {
    return { error: "只能删除报销记录" };
  }

  const { error } = await supabase.from("transactions").delete().eq("id", id);
  if (error) return { error: error.message };

  revalidateFinance();
  return { success: true };
}
