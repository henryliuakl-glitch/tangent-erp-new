import { Navbar } from "@/components/Navbar";
import { MobileDock } from "@/components/MobileDock";

export default function Loading() {
  return (
    <div className="min-h-screen bg-slate-50 pb-24">
      <div className="hidden md:block"><Navbar /></div>
      <main className="mx-auto max-w-7xl space-y-4 px-3 py-6" aria-busy="true" aria-label="正在加载">
        <div className="h-7 w-40 animate-pulse rounded-lg bg-slate-200" />
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {[0, 1, 2, 3].map(i => <div key={i} className="h-24 animate-pulse rounded-xl border border-slate-200 bg-white" />)}
        </div>
        <div className="h-72 animate-pulse rounded-xl border border-slate-200 bg-white" />
      </main>
      <MobileDock />
    </div>
  );
}
