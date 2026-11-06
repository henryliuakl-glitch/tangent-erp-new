import Link from "next/link";
import {createClient} from "@/lib/supabase/server";
import {Navbar} from "@/components/Navbar";
import {MobileDock} from "@/components/MobileDock";
import {getTodayInNZ} from "@/lib/timezone";
import {createTodayCareVisits} from "./actions";
import {CareDailyClient} from "./daily-client";

export const dynamic="force-dynamic";
export default async function AfterSchoolPage(){
 const db=await createClient();
 const {data:{user}}=await db.auth.getUser();
 if(!user)return <main className="p-8"><Link href="/login">请先登录</Link></main>;
 const {data:membership,error:memberError}=await db.from("erp_memberships").select("role")
  .eq("user_id",user.id).eq("business_unit_id","cus").maybeSingle();
 if(memberError||!membership)return <main className="max-w-2xl p-8">
  <h1 className="text-xl font-bold">晚托系统尚未启用</h1>
  <p className="mt-2 text-sm">需要在 ERP Supabase 执行三份 cus_care 迁移，并配置 CuS 成员权限。</p>
  <Link href="/teaching" className="mt-3 inline-block text-indigo-600">返回教务</Link>
 </main>;
 const today=getTodayInNZ();
 const [v,s,p,g,e,a,w]=await Promise.all([
  db.from("cus_care_visits").select("*").eq("care_date",today).order("scheduled_start"),
  db.from("students").select("id,name,student_code").eq("business_unit_id","cus"),
  db.from("cus_care_profiles").select("*").order("created_at",{ascending:false}),
  db.from("cus_care_guardians").select("id,student_id,full_name,relationship,phone,primary_contact,pickup_authorized,signature_signed_at"),
  db.from("cus_care_emergency_contacts").select("id,student_id,full_name,relationship,phone,pickup_authorized"),
  db.from("cus_care_pickup_approvals").select("id,visit_id,contact_id,parent_guardian_id,approved_at,revoked_at,video_path,parent_notified_at,child_response_checked").order("approved_at"),
  db.from("cus_care_weekdays").select("*")
 ]);
 const failed=[v,s,p,g,e,a,w].find(q=>q.error);
 if(failed?.error)return <main className="mx-auto max-w-3xl p-8"><h1 className="text-xl font-bold">数据库尚未同步</h1>
  <p className="mt-2 text-sm text-slate-600">{failed.error.message}</p>
  <p className="mt-2 text-sm">请执行 20261106_cus_care_safeguarding.sql 和 20261106_cus_care_handover_guards.sql。</p></main>;
 const isAdmin=["owner","admin"].includes(membership.role);
 return <div className="min-h-screen bg-slate-50 pb-24 text-slate-900 md:pb-10">
  <div className="hidden md:block"><Navbar/></div>
  <main className="mx-auto max-w-6xl space-y-4 px-3 py-5 md:px-6">
   <header className="flex flex-wrap items-center justify-between gap-3">
    <div><h1 className="text-2xl font-bold">晚托班 · 接送工作台</h1>
     <p className="text-sm text-slate-500">{today}（奥克兰） · 托管签到 / 签退 / 家长联系</p></div>
    <div className="flex flex-wrap gap-2">
      <Link href="/teaching" className="rounded-lg border bg-white px-3 py-2 text-sm">普通教务</Link>
      {isAdmin&&<Link href="/afterschool/register" className="rounded-lg bg-indigo-600 px-3 py-2 text-sm text-white">＋ 新生报名</Link>}
      <form action={createTodayCareVisits}><button type="submit" className="rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-2 text-sm text-indigo-700">生成今日班次</button></form>
    </div>
   </header>
   <div className="grid gap-3 sm:grid-cols-4">
    {[["已报名孩子",(p.data||[]).length],["今日预计",(v.data||[]).length],
      ["托管中",(v.data||[]).filter(x=>x.status==="in_care").length],
      ["已交接",(v.data||[]).filter(x=>x.status==="released").length]].map(([label,n])=>
      <div key={String(label)} className="rounded-xl border bg-white p-3"><p className="text-xs text-slate-500">{label}</p>
       <p className="mt-1 text-2xl font-bold">{n}</p></div>)}
   </div>
   <CareDailyClient visits={v.data||[]} students={s.data||[]} profiles={p.data||[]}
    guardians={g.data||[]} contacts={e.data||[]} approvals={a.data||[]} weekdays={w.data||[]}
    isAdmin={isAdmin}/>
  </main><MobileDock/>
 </div>;
}
