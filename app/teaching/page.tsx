import Link from "next/link";
import {createClient} from "@/lib/supabase/server";
import {Navbar} from "@/components/Navbar";
import {MobileDock} from "@/components/MobileDock";
import {TeachingRecords} from "./records";
import {TeachingClasses} from "./classes";
import {TeachingStaff,CareTeachingOverview} from "./staff";

export default async function TeachingPage({
  searchParams
}:{searchParams:Promise<{view?:string}>}) {
  const db=await createClient();
  const {data:{user}}=await db.auth.getUser();
  if(!user)return <main className="p-8">请先 <Link className="text-indigo-600" href="/login">登录</Link>。</main>;
  const {data:members,error}=await db.from("erp_memberships")
    .select("business_unit_id,role").eq("user_id",user.id)
    .in("business_unit_id",["cus","care"]);
  const owner=members?.some(m=>m.business_unit_id==="cus"&&m.role==="owner");
  const careMember=members?.find(m=>m.business_unit_id==="care");
  if(error||(!owner&&!careMember))return <main className="p-8">没有教务访问权限。</main>;
  const {view}=await searchParams;
  const current=!owner?"care":view==="classes"?"classes":view==="teachers"?"teachers":"records";
  const editable=!!owner;
  return <div className="min-h-screen bg-slate-50 pb-24 text-slate-900 md:pb-10">
    <div className="hidden md:block"><Navbar/></div>
    <main className="mx-auto max-w-6xl space-y-4 px-3 py-5 md:px-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">教务</h1>
        {owner&&<div className="flex items-center gap-2">
          <Link href="/bookings" className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm">排课</Link>
          <Link href="/students" className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm">学员</Link>
        </div>}
      </header>

      {owner&&<nav aria-label="教务视图" className="inline-flex flex-wrap rounded-lg border border-slate-200 bg-white p-1 text-sm">
        {[
          {href:"/teaching",label:"教学记录",id:"records"},
          {href:"/teaching?view=classes",label:"班级管理",id:"classes"},
          {href:"/teaching?view=teachers",label:"教师档案",id:"teachers"}
        ].map(tab=><Link key={tab.id} href={tab.href} aria-current={current===tab.id?"page":undefined}
          className={"rounded-md px-4 py-2 font-semibold "+(current===tab.id?"bg-indigo-600 text-white":"text-slate-600")}>
          {tab.label}
        </Link>)}
      </nav>}
      {current==="care"?<CareTeachingOverview/>:
        current==="records"?<TeachingRecords editable={editable}/>:
        current==="teachers"?<TeachingStaff owner={!!owner}/>:
        <TeachingClasses editable={editable}/>}
    </main><MobileDock/>
  </div>;
}
