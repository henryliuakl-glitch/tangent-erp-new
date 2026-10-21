"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

function textOrNull(v: FormDataEntryValue | null) {
  const s = String(v ?? "").trim();
  return s || null;
}

function money(v: FormDataEntryValue | null) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

export async function getFamilyFxRate() {
  try {
    const res = await fetch("https://api.frankfurter.app/latest?from=NZD&to=CNY", {
      next: { revalidate: 3600 },
    });
    if (!res.ok) throw new Error("FX request failed");
    const data = await res.json();
    const rate = Number(data?.rates?.CNY);
    if (!Number.isFinite(rate) || rate <= 0) throw new Error("Invalid FX rate");
    return { rate, date: data.date || null, source: "Frankfurter / ECB reference" };
  } catch {
    return { rate: null, date: null, source: null };
  }
}

export async function getFamilyData() {
  const supabase = await createClient();

  const [accountsRes, transactionsRes, recurringRes, fx] = await Promise.all([
    supabase
      .from("family_accounts")
      .select("*")
      .order("sort_order")
      .order("created_at"),
    supabase
      .from("family_transactions")
      .select("*")
      .order("transaction_date", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(100),
    supabase
      .from("family_recurring_cashflows")
      .select("*")
      .order("created_at"),
    getFamilyFxRate(),
  ]);

  return {
    accounts: accountsRes.data || [],
    transactions: transactionsRes.data || [],
    recurring: recurringRes.data || [],
    fx,
    error:
      accountsRes.error?.message ||
      transactionsRes.error?.message ||
      recurringRes.error?.message ||
      null,
  };
}

export async function createFamilyAccount(formData: FormData) {
  const supabase = await createClient();
  const name = textOrNull(formData.get("name"));
  if (!name) return { error: "账户名称必填" };

  const { error } = await supabase.from("family_accounts").insert({
    name,
    owner: textOrNull(formData.get("owner")) || "Family",
    institution: textOrNull(formData.get("institution")),
    account_type: textOrNull(formData.get("accountType")) || "bank",
    currency: formData.get("currency") === "RMB" ? "RMB" : "NZD",
    balance: money(formData.get("balance")),
    include_in_net_worth: formData.get("includeInNetWorth") !== "false",
    is_business_account: formData.get("isBusinessAccount") === "true",
    notes: textOrNull(formData.get("notes")),
  });

  if (error) return { error: error.message };
  revalidatePath("/family");
  return { success: true };
}

export async function updateFamilyAccountBalance(id: string, balance: number) {
  const supabase = await createClient();
  if (!Number.isFinite(balance)) return { error: "余额无效" };

  const { error } = await supabase
    .from("family_accounts")
    .update({ balance, updated_at: new Date().toISOString() })
    .eq("id", id);

  if (error) return { error: error.message };
  revalidatePath("/family");
  return { success: true };
}

export async function deleteFamilyAccount(id: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("family_accounts").delete().eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/family");
  return { success: true };
}

export async function createFamilyTransaction(formData: FormData) {
  const supabase = await createClient();
  const type = String(formData.get("type") || "");
  const accountId = String(formData.get("accountId") || "");
  const transferAccountId = String(formData.get("transferAccountId") || "");
  const amount = money(formData.get("amount"));
  const currency = formData.get("currency") === "RMB" ? "RMB" : "NZD";

  if (!["income", "expense", "transfer", "adjustment"].includes(type)) {
    return { error: "流水类型无效" };
  }
  if (!accountId || amount <= 0) return { error: "请选择账户并填写金额" };
  if (type === "transfer" && (!transferAccountId || transferAccountId === accountId)) {
    return { error: "请选择不同的转入账户" };
  }

  const { data: accounts, error: accError } = await supabase
    .from("family_accounts")
    .select("id,balance,currency")
    .in("id", type === "transfer" ? [accountId, transferAccountId] : [accountId]);

  if (accError) return { error: accError.message };
  const source = (accounts || []).find((a: any) => a.id === accountId);
  const target = (accounts || []).find((a: any) => a.id === transferAccountId);
  if (!source) return { error: "找不到来源账户" };
  if (source.currency !== currency) return { error: "流水币种必须与账户币种一致" };
  if (type === "transfer" && target?.currency !== currency) {
    return { error: "第一版内部转账仅支持同币种账户" };
  }

  const { data: tx, error: txError } = await supabase
    .from("family_transactions")
    .insert({
      transaction_date: textOrNull(formData.get("date")),
      type,
      amount,
      currency,
      category: textOrNull(formData.get("category")),
      description: textOrNull(formData.get("description")),
      account_id: accountId,
      transfer_account_id: type === "transfer" ? transferAccountId : null,
      source_business_unit_id: textOrNull(formData.get("sourceBusinessUnitId")),
    })
    .select("id")
    .single();

  if (txError) return { error: txError.message };

  let sourceDelta = 0;
  if (type === "income") sourceDelta = amount;
  if (type === "expense") sourceDelta = -amount;
  if (type === "adjustment") sourceDelta = amount;
  if (type === "transfer") sourceDelta = -amount;

  const { error: sourceError } = await supabase
    .from("family_accounts")
    .update({
      balance: Number(source.balance || 0) + sourceDelta,
      updated_at: new Date().toISOString(),
    })
    .eq("id", accountId);

  if (sourceError) {
    await supabase.from("family_transactions").delete().eq("id", tx.id);
    return { error: sourceError.message };
  }

  if (type === "transfer" && target) {
    const { error: targetError } = await supabase
      .from("family_accounts")
      .update({
        balance: Number(target.balance || 0) + amount,
        updated_at: new Date().toISOString(),
      })
      .eq("id", target.id);

    if (targetError) {
      await supabase
        .from("family_accounts")
        .update({ balance: Number(source.balance || 0) })
        .eq("id", accountId);
      await supabase.from("family_transactions").delete().eq("id", tx.id);
      return { error: targetError.message };
    }
  }

  revalidatePath("/family");
  return { success: true };
}

export async function createRecurringCashflow(formData: FormData) {
  const supabase = await createClient();
  const name = textOrNull(formData.get("name"));
  const amount = money(formData.get("amount"));
  if (!name || amount <= 0) return { error: "请填写名称和金额" };

  const { error } = await supabase.from("family_recurring_cashflows").insert({
    name,
    type: formData.get("type") === "expense" ? "expense" : "income",
    amount,
    currency: formData.get("currency") === "RMB" ? "RMB" : "NZD",
    frequency: textOrNull(formData.get("frequency")) || "monthly",
    category: textOrNull(formData.get("category")),
    notes: textOrNull(formData.get("notes")),
    active: true,
  });

  if (error) return { error: error.message };
  revalidatePath("/family");
  return { success: true };
}

export async function deleteRecurringCashflow(id: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("family_recurring_cashflows").delete().eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/family");
  return { success: true };
}
