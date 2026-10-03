import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizeCurrency, type Currency } from "@/lib/currency";

/** PostgREST / schema cache 报缺 currency 列 */
export function isMissingOptionalColumnError(message: string | undefined | null): boolean {
  if (!message) return false;
  return /(currency|income_source)/i.test(message) && /(schema cache|could not find|column)/i.test(message);
}

export function isMissingCurrencyColumnError(message: string | undefined | null): boolean {
  return isMissingOptionalColumnError(message) && /currency/i.test(message || "");
}

function optionalColumnMissing(message: string | undefined | null): "currency" | "income_source" | null {
  if (!isMissingOptionalColumnError(message)) return null;
  if (/income_source/i.test(message || "")) return "income_source";
  if (/currency/i.test(message || "")) return "currency";
  return null;
}

/**
 * 写入 transactions：优先带 currency；若生产库尚未加列 / schema cache 未刷新，自动降级去掉 currency 再试。
 * 记账不被「Could not find the 'currency' column」阻断。
 */
export async function insertTransaction(
  supabase: SupabaseClient,
  row: Record<string, unknown> & { currency?: Currency | string | null }
): Promise<{ error: string | null; id?: string }> {
  const currency = normalizeCurrency(row.currency as string | undefined);
  const withCurrency = { ...row, currency };

  const { data: firstData, error: firstError } = await supabase
    .from("transactions")
    .insert(withCurrency)
    .select("id")
    .single();
  if (!firstError) return { error: null, id: firstData?.id };

  const missing = optionalColumnMissing(firstError.message);
  if (missing) {
    const retryPayload = { ...withCurrency } as Record<string, unknown>;
    delete retryPayload[missing];

    const { data: retryData, error: retryError } = await supabase
      .from("transactions")
      .insert(retryPayload)
      .select("id")
      .single();

    if (!retryError) return { error: null, id: retryData?.id };

    const secondMissing = optionalColumnMissing(retryError.message);
    if (secondMissing && secondMissing !== missing) {
      delete retryPayload[secondMissing];
      const { data: finalData, error: finalError } = await supabase
        .from("transactions")
        .insert(retryPayload)
        .select("id")
        .single();
      if (!finalError) return { error: null, id: finalData?.id };
      return { error: finalError.message };
    }

    return { error: retryError.message };
  }

  return { error: firstError.message };
}

/** 更新流水：currency 列不存在时自动去掉该字段重试 */
export async function updateTransactionRow(
  supabase: SupabaseClient,
  id: string,
  data: Record<string, unknown> & { currency?: Currency | string | null }
): Promise<{ error: string | null }> {
  const payload = {
    ...data,
    ...(data.currency !== undefined
      ? { currency: normalizeCurrency(data.currency as string) }
      : {}),
  };

  const { error: firstError } = await supabase
    .from("transactions")
    .update(payload)
    .eq("id", id);

  if (!firstError) return { error: null };

  const missing = optionalColumnMissing(firstError.message);
  if (missing) {
    const retryPayload = { ...payload } as Record<string, unknown>;
    delete retryPayload[missing];

    const { error: retryError } = await supabase
      .from("transactions")
      .update(retryPayload)
      .eq("id", id);

    if (!retryError) return { error: null };

    const secondMissing = optionalColumnMissing(retryError.message);
    if (secondMissing && secondMissing !== missing) {
      delete retryPayload[secondMissing];
      const { error: finalError } = await supabase
        .from("transactions")
        .update(retryPayload)
        .eq("id", id);
      if (!finalError) return { error: null };
      return { error: finalError.message };
    }

    return { error: retryError.message };
  }

  return { error: firstError.message };
}
