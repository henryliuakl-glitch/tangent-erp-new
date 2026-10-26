import type { Currency } from "@/lib/currency";

export type FxQuote = {
  amount: number;
  rate: number;
  from: Currency;
  to: Currency;
  date: string | null;
};

const FALLBACK_NZD_CNY = 3.8;

export async function convertCurrencyAmount(
  amount: number,
  from: Currency,
  to: Currency
): Promise<FxQuote> {
  if (from === to) {
    return { amount, rate: 1, from, to, date: null };
  }

  let nzdToCny = FALLBACK_NZD_CNY;
  let date: string | null = null;

  try {
    const res = await fetch("https://api.frankfurter.app/latest?from=NZD&to=CNY", {
      next: { revalidate: 3600 },
    });
    if (res.ok) {
      const data = await res.json();
      const rate = Number(data?.rates?.CNY);
      if (Number.isFinite(rate) && rate > 0) {
        nzdToCny = rate;
        date = data?.date || null;
      }
    }
  } catch {
    // Keep a conservative fallback so booking settlement never blocks on FX availability.
  }

  const converted =
    from === "NZD" && to === "RMB"
      ? amount * nzdToCny
      : from === "RMB" && to === "NZD"
        ? amount / nzdToCny
        : amount;

  return {
    amount: Math.round(converted * 100) / 100,
    rate: from === "NZD" ? nzdToCny : 1 / nzdToCny,
    from,
    to,
    date,
  };
}
