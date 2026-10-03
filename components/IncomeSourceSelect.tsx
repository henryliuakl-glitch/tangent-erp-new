"use client";

import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { INCOME_SOURCE_OPTIONS } from "@/lib/income-source";

export function IncomeSourceSelect({
  value,
  onChange,
  label = "收入来源",
  placeholder = "选择实际收款来源",
}: {
  value: string;
  onChange: (value: string) => void;
  label?: string;
  placeholder?: string;
}) {
  return (
    <div className="space-y-2">
      <Label className="text-xs font-bold text-slate-500">{label}</Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="h-11 w-full rounded-xl border-slate-200 bg-white">
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent className="max-h-72">
          {INCOME_SOURCE_OPTIONS.map((source) => (
            <SelectItem key={source} value={source}>
              {source}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
