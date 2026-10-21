"use client";

import { useEffect, useState } from "react";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { INCOME_SOURCE_OPTIONS } from "@/lib/income-source";
import { createClient } from "@/lib/supabase/client";

type PaymentAccount = {
  id: string;
  name: string;
  currency?: string | null;
  is_business_account?: boolean | null;
};

export function IncomeSourceSelect({
  value,
  onChange,
  label = "收款账户",
  placeholder = "选择实际到账账户",
}: {
  value: string;
  onChange: (value: string) => void;
  label?: string;
  placeholder?: string;
}) {
  const [accounts, setAccounts] = useState<PaymentAccount[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const supabase = createClient();

    async function load() {
      let result: any = await supabase
        .from("family_accounts")
        .select("id,name,currency,is_business_account,active_for_payments")
        .eq("active_for_payments", true)
        .order("is_business_account")
        .order("name");

      if (result.error && /active_for_payments|schema cache|column/i.test(result.error.message || "")) {
        result = await supabase
          .from("family_accounts")
          .select("id,name,currency,is_business_account")
          .order("is_business_account")
          .order("name");
      }

      if (cancelled) return;

      if (!result.error && result.data?.length) {
        setAccounts(result.data as PaymentAccount[]);
      } else {
        setAccounts(
          INCOME_SOURCE_OPTIONS.map((name, index) => ({
            id: `fallback-${index}`,
            name,
          }))
        );
      }
      setLoaded(true);
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="space-y-2">
      <Label className="text-xs font-bold text-slate-500">{label}</Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="h-11 w-full rounded-xl border-slate-200 bg-white">
          <SelectValue placeholder={loaded ? placeholder : "加载账户…"} />
        </SelectTrigger>
        <SelectContent className="max-h-72">
          {accounts.map((account) => (
            <SelectItem key={account.id} value={account.name}>
              <div className="flex items-center gap-2">
                <span>{account.name}</span>
                {account.currency ? (
                  <span className="text-[10px] font-semibold text-slate-400">{account.currency}</span>
                ) : null}
                {account.is_business_account ? (
                  <span className="text-[9px] font-bold text-indigo-500">Company</span>
                ) : null}
              </div>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
