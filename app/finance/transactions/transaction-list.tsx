"use client";

import { useState } from "react";
import { useBusiness } from "@/contexts/BusinessContext";
import { deleteTransaction } from "../actions";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, Trash2, FileText, ArrowUpRight, ArrowDownLeft } from "lucide-react";
import Link from "next/link";
import { formatMoney, normalizeCurrency } from "@/lib/currency";
import { isPendingReimbursementTx } from "@/lib/reimbursement";

type Transaction = {
  id: string;
  amount: number;
  type: string;
  category: string;
  description: string | null;
  transaction_date: string;
  business_unit_id: string;
  proof_img_url: string | null;
  currency?: string | null;
  income_source?: string | null;
};

export function TransactionList({ initialTransactions }: { initialTransactions: Transaction[] }) {
  const { currentBusinessId } = useBusiness();
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // 1. 客户端过滤：只显示当前公司的
  const filteredTransactions = initialTransactions.filter((t) => {
    if (isPendingReimbursementTx(t.description)) return false;
    if (currentBusinessId === "tangent") return true;
    return t.business_unit_id === currentBusinessId;
  });

  // 2. 删除逻辑
  const handleDelete = async (id: string) => {
    if (!confirm("确定要删除这笔记录吗？删了就找不回了。")) return;
    
    setDeletingId(id);
    await deleteTransaction(id);
    setDeletingId(null);
    // Server Action 会自动 revalidatePath，页面数据会刷新
  };

  if (filteredTransactions.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center text-slate-500">
        <p>暂无流水记录</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {filteredTransactions.map((t) => (
        <Card key={t.id} className="group relative flex items-center justify-between overflow-hidden rounded-2xl border border-slate-200/70 bg-white p-4 shadow-sm transition-all hover:shadow-md">
          
          <div className="flex items-center gap-4">
            {/* 图标：收入是绿箭头，支出是红箭头 */}
            <div className={`flex h-10 w-10 items-center justify-center rounded-full ${
              t.type === 'income' ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'
            }`}>
              {t.type === 'income' ? <ArrowUpRight className="h-5 w-5" /> : <ArrowDownLeft className="h-5 w-5" />}
            </div>

            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-bold text-slate-900">{t.category}</h3>
                {t.proof_img_url && (
                  <Link href={t.proof_img_url} target="_blank" className="text-indigo-500 hover:text-indigo-700">
                    <FileText className="h-3.5 w-3.5" />
                  </Link>
                )}
              </div>
              <p className="text-xs text-slate-500">
                {new Date(t.transaction_date).toLocaleDateString()} 
                {t.description && ` · ${t.description}`}
              </p>
              {t.type === "income" && t.income_source ? (
                <p className="mt-1 text-[10px] font-semibold text-indigo-500">
                  收款：{t.income_source}
                </p>
              ) : null}
            </div>
          </div>

          <div className="flex items-center gap-4">
            <span className={`text-sm font-bold ${
              t.type === 'income' ? 'text-emerald-600' : 'text-slate-900'
            }`}>
              {t.type === 'income' ? '+' : '-'}{formatMoney(Number(t.amount), t.currency)}
              <span className="text-[10px] text-slate-400 font-medium ml-1">{normalizeCurrency(t.currency)}</span>
            </span>

            {/* 删除按钮 */}
            <Button
              variant="ghost"
              size="icon"
              disabled={deletingId === t.id}
              onClick={() => handleDelete(t.id)}
              className="h-8 w-8 text-slate-300 hover:bg-rose-50 hover:text-rose-600"
            >
              {deletingId === t.id ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Trash2 className="h-4 w-4" />
              )}
            </Button>
          </div>
        </Card>
      ))}
    </div>
  );
}