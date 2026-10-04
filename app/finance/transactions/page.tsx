import { createClient } from "@/lib/supabase/server";
import { Navbar } from "@/components/Navbar";
import { TransactionList } from "./transaction-list";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Plus } from "lucide-react";
import Link from "next/link";
import { cookies } from "next/headers";

export default async function TransactionsPage() {
  const supabase = await createClient();
  const cookieStore = await cookies();
  const businessId = cookieStore.get("businessId")?.value || "cus";

  let query = supabase
    .from("transactions")
    .select("*")
    .order("transaction_date", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(50);

  query =
    businessId === "tangent"
      ? query.in("business_unit_id", ["cus", "sine"])
      : query.eq("business_unit_id", businessId);

  const { data: transactions } = await query;

  return (
    <main className="min-h-screen bg-slate-50 font-sans text-slate-900 pb-10">
      <div className="hidden md:block"><Navbar /></div>

      <div className="mx-auto max-w-2xl px-3 py-3 md:px-6 md:py-8">
        <div className="mb-3 md:mb-8 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/" className="rounded-xl border border-slate-200 bg-white p-2 text-slate-500 hover:text-indigo-600">
              <ArrowLeft className="h-4 w-4" />
            </Link>
            <div>
              <h1 className="text-lg md:text-xl font-bold tracking-tight text-slate-900">收支明细</h1>
              <p className="text-xs font-medium text-slate-400">最近 50 笔交易</p>
            </div>
          </div>
          
          <Link href="/finance/add">
            <Button className="h-9 rounded-lg bg-indigo-600 px-3 text-xs font-bold shadow-sm hover:bg-indigo-700">
              <Plus className="mr-1 h-4 w-4" /> 记一笔
            </Button>
          </Link>
        </div>

        <TransactionList initialTransactions={transactions || []} />
      </div>
    </main>
  );
}