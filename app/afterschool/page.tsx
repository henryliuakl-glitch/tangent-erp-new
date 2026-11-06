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
 // Read today's visits first, then only the related people and approvals.
 const [v,p]=await Promise.all([
  db.from("cus_care_visits").select("id,student_id,care_date,scheduled_start,scheduled_end,status,check_in_at,check_out_at,check_out_name,late_fee_nzd").eq("care_date",today).order("scheduled_start"),
  db.from("cus_care_profiles").select("student_id,status,missing_guardian_reason").order("created_at",{ascending:false})
 ]);
 if(v.error||p.error)return <main className="mx-auto max-w-3xl p-8">晚托名单读取失败，请刷新重试。</main>;
 const profiles=p.data||[],visits=v.data||[];
 const studentIds=[...new Set([...profiles.map(x=>x.student_id),...visits.map(x=>x.student_id)])];
 const visitIds=visits.map(x=>x.id);
 const empty=Promise.resolve({data:[],error:null});
 const [s,g,e,a,w]=await Promise.all([
  studentIds.length?db.from("students").select("id,name,student_code").eq("business_unit_id","cus").in("id",studentIds):empty,
  studentIds.length?db.from("cus_care_guardians").select("id,student_id,full_name,relationship,phone,primary_contact,pickup_authorized,signature_signed_at").in("student_id",studentIds):empty,
  studentIds.length?db.from("cus_care_emergency_contacts").select("id,student_id,full_name,relationship,phone,pickup_authorized").in("student_id",studentIds):empty,
  visitIds.length?db.from("cus_care_pickup_approvals")
    .select("id,visit_id,contact_id,parent_guardian_id,approved_at,revoked_at,video_path,parent_notified_at,child_response_checked")
    .in("visit_id",visitIds).order("approved_at"):empty,
  studentIds.length?db.from("cus_care_weekdays").select("student_id,weekday,starts_at,ends_at")
    .in("student_id",studentIds):empty
 ]);
 if([s,g,e,a,w].some(q=>q.error))return <main className="mx-auto max-w-3xl p-8">接送信息读取失败，请刷新重试。</main>;
 const isAdmin=["owner","admin"].includes(membership.role);
 return <div className="min-h-screen bg-slate-50 pb-24 text-slate-900 md:pb-10">
  <div className="hidden md:block"><Navbar/></div>
  <main className="mx-auto max-w-6xl space-y-4 px-3 py-5 md:px-6">
   <header className="flex flex-wrap items-center justify-between gap-3">
    <div><h1 className="text-2xl font-bold">晚托</h1>
     <p className="text-sm text-slate-500">{today} · 接送工作台</p></div>
    <div className="flex flex-wrap gap-2">
      
      {isAdmin&&<Link href="/afterschool/register" className="rounded-lg bg-indigo-600 px-3 py-2 text-sm text-white">＋ 新生报名</Link>}
      <form action={createTodayCareVisits}><button type="submit" className="rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-2 text-sm text-indigo-700">生成今日班次</button></form>
    </div>
   </header>
   <div className="grid gap-3 sm:grid-cols-4">
    {[["已报名孩子",profiles.length],["今日预计",visits.length],
      ["托管中",visits.filter(x=>x.status==="in_care").length],
      ["已交接",visits.filter(x=>x.status==="released").length]].map(([label,n])=>
      <div key={String(label)} className="rounded-xl border bg-white p-3"><p className="text-xs text-slate-500">{label}</p>
       <p className="mt-1 text-2xl font-bold">{n}</p></div>)}
   </div>
   <CareDailyClient visits={visits} students={s.data||[]} profiles={profiles}
    guardians={g.data||[]} contacts={e.data||[]} approvals={a.data||[]} weekdays={w.data||[]}
    isAdmin={isAdmin}/>
  </main><MobileDock/>
 </div>;
}
