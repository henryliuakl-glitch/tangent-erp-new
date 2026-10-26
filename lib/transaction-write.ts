import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizeCurrency, type Currency } from "@/lib/currency";
import { convertCurrencyAmount } from "@/lib/fx";

/** PostgREST / schema cache 报缺可选列 */
export function isMissingOptionalColumnError(message: string | undefined | null): boolean {
  if (!message) return false;
  return /(currency|income_source|family_account_id)/i.test(message) && /(schema cache|could not find|column)/i.test(message);
}

export function isMissingCurrencyColumnError(message: string | undefined | null): boolean {
  return isMissingOptionalColumnError(message) && /currency/i.test(message || "");
}

function optionalColumnMissing(message: string | undefined | null): "currency" | "income_source" | "family_account_id" | null {
  if (!isMissingOptionalColumnError(message)) return null;
  if (/family_account_id/i.test(message || "")) return "family_account_id";
  if (/income_source/i.test(message || "")) return "income_source";
  if (/currency/i.test(message || "")) return "currency";
  return null;
}

type FamilyAccount = {
  id: string;
  name?: string | null;
  currency?: string | null;
  balance?: number | string | null;
};

type FamilyMirror = {
  id: string;
  type: string;
  amount: number | string;
  currency?: string | null;
  account_id?: string | null;
};

async function resolveFamilyAccount(
  supabase: SupabaseClient,
  explicitId: string | null | undefined,
  incomeSource: string
): Promise<{ account: FamilyAccount | null; error: string | null }> {
  if (explicitId) {
    const { data, error } = await supabase
      .from("family_accounts")
      .select("id,name,currency,balance")
      .eq("id", explicitId)
      .maybeSingle();
    return { account: (data as FamilyAccount | null) || null, error: error?.message || null };
  }

  if (!incomeSource) return { account: null, error: null };

  const { data, error } = await supabase
    .from("family_accounts")
    .select("id,name,currency,balance")
    .eq("name", incomeSource)
    .limit(1);

  return {
    account: ((data || [])[0] as FamilyAccount | undefined) || null,
    error: error?.message || null,
  };
}

async function applyFamilyMirror(
  supabase: SupabaseClient,
  transactionId: string,
  accountId: string,
  row: Record<string, unknown>,
  currency: Currency
): Promise<{ error: string | null }> {
  const { data: existing, error: existingError } = await supabase
    .from("family_transactions")
    .select("id")
    .eq("source_transaction_id", transactionId)
    .limit(1);

  if (existingError) return { error: existingError.message };
  if (existing?.length) return { error: null };

  const type = String(row.type || "");
  if (type !== "income" && type !== "expense") return { error: null };

  const amount = Number(row.amount || 0);
  if (!(amount > 0)) return { error: null };

  const { data: account, error: accountError } = await supabase
    .from("family_accounts")
    .select("id,balance,currency")
    .eq("id", accountId)
    .single();

  if (accountError || !account) return { error: accountError?.message || "Family 账户不存在" };

  const accountCurrency = normalizeCurrency(account.currency);
  const fx = await convertCurrencyAmount(amount, currency, accountCurrency);
  const mirrorAmount = fx.amount;
  const fxNote =
    accountCurrency === currency
      ? ""
      : ` [FX ${currency} ${amount.toFixed(2)} → ${accountCurrency} ${mirrorAmount.toFixed(2)} @ ${fx.rate.toFixed(4)}]`;

  const { data: mirror, error: mirrorError } = await supabase
    .from("family_transactions")
    .insert({
      transaction_date: String(row.transaction_date || new Date().toISOString()).slice(0, 10),
      type,
      amount: mirrorAmount,
      currency: accountCurrency,
      category: row.category ?? null,
      description: `${String(row.description || "")}${fxNote}`.trim() || null,
      account_id: accountId,
      source_business_unit_id: row.business_unit_id ?? null,
      source_transaction_id: transactionId,
    })
    .select("id")
    .single();

  // 并发重复同步时，已有镜像即视为成功，绝不重复改余额。
  if (mirrorError) {
    if ((mirrorError as any).code === "23505" || /duplicate key/i.test(mirrorError.message || "")) {
      return { error: null };
    }
    return { error: mirrorError.message };
  }

  const delta = type === "income" ? mirrorAmount : -mirrorAmount;
  const { error: balanceError } = await supabase
    .from("family_accounts")
    .update({
      balance: Number(account.balance || 0) + delta,
      updated_at: new Date().toISOString(),
    })
    .eq("id", accountId);

  if (balanceError) {
    await supabase.from("family_transactions").delete().eq("id", mirror.id);
    return { error: balanceError.message };
  }

  return { error: null };
}

async function reverseFamilyMirror(
  supabase: SupabaseClient,
  transactionId: string
): Promise<{ error: string | null; mirror?: FamilyMirror | null }> {
  const { data: mirror, error: mirrorError } = await supabase
    .from("family_transactions")
    .select("id,type,amount,currency,account_id")
    .eq("source_transaction_id", transactionId)
    .maybeSingle();

  if (mirrorError) return { error: mirrorError.message };
  if (!mirror) return { error: null, mirror: null };

  const typedMirror = mirror as FamilyMirror;
  const accountId = typedMirror.account_id;
  const amount = Number(typedMirror.amount || 0);

  if (accountId && amount > 0) {
    const { data: account, error: accountError } = await supabase
      .from("family_accounts")
      .select("balance")
      .eq("id", accountId)
      .single();

    if (accountError || !account) return { error: accountError?.message || "Family 账户不存在" };

    const originalDelta = typedMirror.type === "income" ? amount : typedMirror.type === "expense" ? -amount : 0;
    const { error: balanceError } = await supabase
      .from("family_accounts")
      .update({
        balance: Number(account.balance || 0) - originalDelta,
        updated_at: new Date().toISOString(),
      })
      .eq("id", accountId);

    if (balanceError) return { error: balanceError.message };
  }

  const { error: deleteError } = await supabase
    .from("family_transactions")
    .delete()
    .eq("id", typedMirror.id);

  if (deleteError) {
    // 镜像删失败则尽力把余额恢复，避免账实分离。
    if (accountId && amount > 0) {
      const { data: account } = await supabase
        .from("family_accounts")
        .select("balance")
        .eq("id", accountId)
        .single();
      if (account) {
        const originalDelta = typedMirror.type === "income" ? amount : typedMirror.type === "expense" ? -amount : 0;
        await supabase
          .from("family_accounts")
          .update({ balance: Number(account.balance || 0) + originalDelta, updated_at: new Date().toISOString() })
          .eq("id", accountId);
      }
    }
    return { error: deleteError.message };
  }

  return { error: null, mirror: typedMirror };
}

async function insertRawTransaction(
  supabase: SupabaseClient,
  payload: Record<string, unknown>
): Promise<{ error: string | null; id?: string }> {
  let attempt = { ...payload };

  for (let i = 0; i < 3; i++) {
    const { data, error } = await supabase
      .from("transactions")
      .insert(attempt)
      .select("id")
      .single();

    if (!error) return { error: null, id: data?.id };

    const missing = optionalColumnMissing(error.message);
    if (!missing || !(missing in attempt)) return { error: error.message };
    delete attempt[missing];
  }

  return { error: "流水写入失败" };
}

/**
 * 唯一业务流水写入口。
 * 业务 transactions 保存业务事实；Family 账户/流水由应用层镜像同步。
 * 新写入不再把 family_account_id 交给数据库 trigger，避免数据库 trigger / index 版本差异。
 */
export async function insertTransaction(
  supabase: SupabaseClient,
  row: Record<string, unknown> & { currency?: Currency | string | null }
): Promise<{ error: string | null; id?: string }> {
  const currency = normalizeCurrency(row.currency as string | undefined);
  const incomeSource = typeof row.income_source === "string" ? row.income_source.trim() : "";
  const explicitFamilyAccountId = typeof row.family_account_id === "string" ? row.family_account_id : null;

  let familyAccount: FamilyAccount | null = null;
  if (((row.type === "income" || row.type === "expense") && incomeSource) || explicitFamilyAccountId) {
    const resolved = await resolveFamilyAccount(supabase, explicitFamilyAccountId, incomeSource);
    if (resolved.error) return { error: resolved.error };
    familyAccount = resolved.account;

    if ((incomeSource || explicitFamilyAccountId) && !familyAccount) {
      return { error: "找不到对应的 Family 实际账户" };
    }
  }

  const payload = { ...row, currency } as Record<string, unknown>;
  // 新流水一律由应用层同步 Family；数据库 trigger 保持 no-op。
  delete payload.family_account_id;

  const inserted = await insertRawTransaction(supabase, payload);
  if (inserted.error || !inserted.id) return inserted;

  if (familyAccount && (row.type === "income" || row.type === "expense")) {
    const synced = await applyFamilyMirror(supabase, inserted.id, familyAccount.id, payload, currency);
    if (synced.error) {
      await supabase.from("transactions").delete().eq("id", inserted.id);
      return { error: `Family 同步失败：${synced.error}` };
    }
  }

  return inserted;
}

/**
 * 删除业务流水，同时撤销 Family 镜像。
 * 兼容旧记录：若 transactions.family_account_id 非空，先置空让旧 trigger 只执行“撤销旧镜像”分支，
 * 再由应用层检查是否仍有镜像需要撤销。
 */
export async function deleteTransactionRow(
  supabase: SupabaseClient,
  id: string
): Promise<{ error: string | null }> {
  const { data: tx, error: fetchError } = await supabase
    .from("transactions")
    .select("*")
    .eq("id", id)
    .single();

  if (fetchError || !tx) return { error: fetchError?.message || "流水不存在" };

  const oldFamilyAccountId = (tx as any).family_account_id as string | null | undefined;

  if (oldFamilyAccountId) {
    const { error: detachError } = await supabase
      .from("transactions")
      .update({ family_account_id: null })
      .eq("id", id);
    if (detachError) return { error: detachError.message };
  }

  const reverse = await reverseFamilyMirror(supabase, id);
  if (reverse.error) return { error: reverse.error };

  const { error: deleteError } = await supabase.from("transactions").delete().eq("id", id);
  if (!deleteError) return { error: null };

  // 删除失败：恢复刚才撤销的 Family 镜像。
  const mirror = reverse.mirror;
  if (mirror?.account_id) {
    await applyFamilyMirror(
      supabase,
      id,
      mirror.account_id,
      tx as Record<string, unknown>,
      normalizeCurrency((tx as any).currency)
    );
  }

  return { error: deleteError.message };
}

/** 更新流水，同时重建对应 Family 镜像，避免金额/账户变化后 Family 残留旧值。 */
export async function updateTransactionRow(
  supabase: SupabaseClient,
  id: string,
  data: Record<string, unknown> & { currency?: Currency | string | null }
): Promise<{ error: string | null }> {
  const { data: oldTx, error: fetchError } = await supabase
    .from("transactions")
    .select("*")
    .eq("id", id)
    .single();

  if (fetchError || !oldTx) return { error: fetchError?.message || "流水不存在" };

  const oldFamilyAccountId = (oldTx as any).family_account_id as string | null | undefined;

  if (oldFamilyAccountId) {
    const { error: detachError } = await supabase
      .from("transactions")
      .update({ family_account_id: null })
      .eq("id", id);
    if (detachError) return { error: detachError.message };
  }

  const reverse = await reverseFamilyMirror(supabase, id);
  if (reverse.error) return { error: reverse.error };

  const payload = {
    ...data,
    ...(data.currency !== undefined ? { currency: normalizeCurrency(data.currency as string) } : {}),
    family_account_id: null,
  } as Record<string, unknown>;

  let attempt = { ...payload };
  let updateError: string | null = null;
  for (let i = 0; i < 3; i++) {
    const { error } = await supabase.from("transactions").update(attempt).eq("id", id);
    if (!error) {
      updateError = null;
      break;
    }
    const missing = optionalColumnMissing(error.message);
    if (!missing || !(missing in attempt)) {
      updateError = error.message;
      break;
    }
    delete attempt[missing];
    updateError = error.message;
  }

  if (updateError) {
    if (reverse.mirror?.account_id) {
      await applyFamilyMirror(
        supabase,
        id,
        reverse.mirror.account_id,
        oldTx as Record<string, unknown>,
        normalizeCurrency((oldTx as any).currency)
      );
    }
    return { error: updateError };
  }

  const nextTx = { ...oldTx, ...attempt, family_account_id: null } as Record<string, unknown>;
  const nextType = String(nextTx.type || "");
  const nextCurrency = normalizeCurrency(nextTx.currency as string | undefined);
  let nextAccountId: string | null = null;

  if (nextType === "income" || nextType === "expense") {
    const source = typeof nextTx.income_source === "string" ? nextTx.income_source.trim() : "";
    if (source) {
      const resolved = await resolveFamilyAccount(supabase, null, source);
      if (resolved.error) return { error: resolved.error };
      if (!resolved.account) return { error: "找不到新的 Family 实际账户" };
      nextAccountId = resolved.account.id;
    } else if (nextType === "expense" && reverse.mirror?.account_id) {
      nextAccountId = reverse.mirror.account_id;
    }
  }

  if (nextAccountId) {
    const sync = await applyFamilyMirror(supabase, id, nextAccountId, nextTx, nextCurrency);
    if (sync.error) {
      // 尽力恢复旧业务内容和旧 Family 镜像。
      await supabase.from("transactions").update({ ...oldTx, family_account_id: null }).eq("id", id);
      if (reverse.mirror?.account_id) {
        await applyFamilyMirror(
          supabase,
          id,
          reverse.mirror.account_id,
          oldTx as Record<string, unknown>,
          normalizeCurrency((oldTx as any).currency)
        );
      }
      return { error: `Family 同步失败：${sync.error}` };
    }
  }

  return { error: null };
}
