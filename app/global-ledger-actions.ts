"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { insertTransaction } from "@/lib/transaction-write";
import { normalizeCurrency } from "@/lib/currency";

function text(v: FormDataEntryValue | null) {
  return String(v ?? "").trim();
}

export async function getGlobalPaymentAccounts() {
  const supabase = await createClient();

  let query: any = await supabase
    .from("family_accounts")
    .select("id,name,currency,is_business_account,active_for_payments,sort_order")
    .eq("active_for_payments", true)
    .order("sort_order")
    .order("name");

  if (query.error && /active_for_payments|schema cache|column/i.test(query.error.message || "")) {
    query = await supabase
      .from("family_accounts")
      .select("id,name,currency,is_business_account,sort_order")
      .order("sort_order")
      .order("name");
  }

  return {
    accounts: query.data || [],
    error: query.error?.message || null,
  };
}

export async function createGlobalTransaction(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "未登录" };

  const scope = text(formData.get("scope")) || "family";
  const type = text(formData.get("type"));
  const amount = Number(formData.get("amount"));
  const date = text(formData.get("date"));
  const category = text(formData.get("category"));
  const description = text(formData.get("description"));
  const accountId = text(formData.get("accountId"));
  const currency = normalizeCurrency(text(formData.get("currency")));

  if (!["family", "cus", "sine"].includes(scope)) return { error: "归属无效" };
  if (!["income", "expense"].includes(type)) return { error: "类型无效" };
  if (!Number.isFinite(amount) || amount <= 0) return { error: "金额必须大于 0" };
  if (!accountId) return { error: "请选择实际发生账户" };

  const { data: account, error: accountError } = await supabase
    .from("family_accounts")
    .select("id,name,currency,balance")
    .eq("id", accountId)
    .single();

  if (accountError || !account) return { error: "找不到 Family 账户" };
  if (normalizeCurrency(account.currency) !== currency) {
    return { error: "币种必须与账户币种一致" };
  }

  // Family 自身流水：直接写 Family 账并更新账户余额。
  if (scope === "family") {
    const { data: tx, error: txError } = await supabase
      .from("family_transactions")
      .insert({
        transaction_date: date || new Date().toISOString().slice(0, 10),
        type,
        amount,
        currency,
        category: category || null,
        description: description || null,
        account_id: accountId,
        source_business_unit_id: null,
      })
      .select("id")
      .single();

    if (txError) return { error: txError.message };

    const delta = type === "income" ? amount : -amount;
    const { error: balanceError } = await supabase
      .from("family_accounts")
      .update({
        balance: Number(account.balance || 0) + delta,
        updated_at: new Date().toISOString(),
      })
      .eq("id", accountId);

    if (balanceError) {
      await supabase.from("family_transactions").delete().eq("id", tx.id);
      return { error: balanceError.message };
    }

    revalidatePath("/family");
    return { success: true };
  }

  // CuS/Sine 业务收入：沿用 transactions -> Family trigger，避免重复记两次。
  if (type === "income") {
    const txResult = await insertTransaction(supabase, {
      type: "income",
      amount,
      category: category || "Other",
      description: description || null,
      transaction_date: date || new Date().toISOString().slice(0, 10),
      business_unit_id: scope,
      created_by: user.id,
      currency,
      income_source: account.name,
      family_account_id: accountId,
    });

    if (txResult.error) return { error: txResult.error };

    revalidatePath("/");
    revalidatePath("/finance");
    revalidatePath("/family");
    return { success: true };
  }

  // CuS/Sine 业务支出：业务账和 Family 账户同时记录。
  // 现有数据库 trigger 只自动同步 income，因此这里显式写 Family expense。
  const txResult = await insertTransaction(supabase, {
    type: "expense",
    amount,
    category: category || "Other",
    description: description || null,
    transaction_date: date || new Date().toISOString().slice(0, 10),
    business_unit_id: scope,
    created_by: user.id,
    currency,
  });

  if (txResult.error) return { error: txResult.error };

  const { data: familyTx, error: familyTxError } = await supabase
    .from("family_transactions")
    .insert({
      transaction_date: date || new Date().toISOString().slice(0, 10),
      type: "expense",
      amount,
      currency,
      category: category || null,
      description: description || null,
      account_id: accountId,
      source_business_unit_id: scope,
      source_transaction_id: txResult.id || null,
    })
    .select("id")
    .single();

  if (familyTxError) {
    if (txResult.id) await supabase.from("transactions").delete().eq("id", txResult.id);
    return { error: familyTxError.message };
  }

  const { error: balanceError } = await supabase
    .from("family_accounts")
    .update({
      balance: Number(account.balance || 0) - amount,
      updated_at: new Date().toISOString(),
    })
    .eq("id", accountId);

  if (balanceError) {
    await supabase.from("family_transactions").delete().eq("id", familyTx.id);
    if (txResult.id) await supabase.from("transactions").delete().eq("id", txResult.id);
    return { error: balanceError.message };
  }

  revalidatePath("/");
  revalidatePath("/finance");
  revalidatePath("/family");
  return { success: true };
}
