import Link from "next/link";
import {cookies} from "next/headers";
import {createClient} from "@/lib/supabase/server";
import {Navbar} from "@/components/Navbar";
import {MobileDock} from "@/components/MobileDock";
import {TeachingRecords} from "./records";
import {TeachingClasses} from "./classes";

export default async function TeachingPage({
  searchParams
}:{searchParams:Promise<{view?:string}>}) {
  const db=await createClient();
  const {data:{user}}=await db.auth.getUser();
  if(!user)return <main className="p-8">请先 <Link className="text-indigo-600" href="/login">登录</Link>。</main>;
  const store=await cookies();
  const business=store.get("businessId")?.value||"cus";
  if(business!=="cus"&&business!=="tangent")return <main className="p-8">请切换至 CuS 后查看教务。</main>;
  const {data:member,error}=await db.from("erp_memberships")
    .select("role").eq("user_id",user.id).eq("business_unit_id","cus").maybeSingle();
  if(error||!member)return <main className="p-8">该账户尚未开通 CuS 教务权限。</main>;
  const {view}=await searchParams;
  const current=view==="classes"?"classes":"records";
  const editable=["owner","admin","teacher"].includes(member.role);
  return <div className="min-h-screen bg-slate-50 pb-24 text-slate-900 md:pb-10">
    <div className="hidden md:block"><Navbar/></div>
    <main className="mx-auto max-w-6xl space-y-4 px-3 py-5 md:px-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">教务</h1>
        <div className="flex items-center gap-2">
          <Link href="/bookings" className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm">排课</Link>
          <Link href="/students" className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm">学员</Link>
        </div>
      </header>
      <nav aria-label="教务视图" className="inline-flex rounded-lg border border-slate-200 bg-white p-1 text-sm">
        <Link href="/teaching" aria-current={current==="records"?"page":undefined}
          className={"rounded-md px-4 py-2 font-semibold "+(current==="records"?"bg-indigo-600 text-white":"text-slate-600 hover:bg-slate-50")}>
          教学记录
        </Link>
        <Link href="/teaching?view=classes" aria-current={current==="classes"?"page":undefined}
          className={"rounded-md px-4 py-2 font-semibold "+(current==="classes"?"bg-indigo-600 text-white":"text-slate-600 hover:bg-slate-50")}>
          班级管理
        </Link>
      </nav>
      {current==="records"?<TeachingRecords editable={editable}/>:<TeachingClasses editable={editable}/>}
    </main><MobileDock/>
  </div>;
}
