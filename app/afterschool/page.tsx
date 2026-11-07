import Link from "next/link";
import {createClient} from "@/lib/supabase/server";
import {Navbar} from "@/components/Navbar";
import {MobileDock} from "@/components/MobileDock";
import {getTodayInNZ} from "@/lib/timezone";

import {CareDailyClient} from "./daily-client";

export const dynamic="force-dynamic";
export default async function AfterSchoolPage({searchParams}:{searchParams:Promise<{date?:string}>}){
 const db=await createClient();
 const {data:{user}}=await db.auth.getUser();
 if(!user)return <main className="p-8"><Link href="/login">请先登录</Link></main>;
 const {data:members,error:memberError}=await db.from("erp_memberships").select("business_unit_id,role")
  .eq("user_id",user.id).in("business_unit_id",["cus","care"]);
 const globalOwner=members?.some(m=>m.business_unit_id==="cus"&&m.role==="owner");
 const care=members?.find(m=>m.business_unit_id==="care");
 if(memberError||(!globalOwner&&!care))return <main className="p-8">没有晚托访问权限。</main>;
 const isAdmin=!!globalOwner||["owner","admin"].includes(care?.role||"");
 const requested=(await searchParams).date;
 const today=requested&&/^\d{4}-\d{2}-\d{2}$/.test(requested)&&
   !Number.isNaN(Date.parse(requested))?requested:getTodayInNZ();
 const actualToday=getTodayInNZ();
 // Read today's visits first, then only the related people and approvals.
 const [v,p,c,t,b,up]=await Promise.all([
   db.from("cus_care_visits")
    .select("id,student_id,care_date,scheduled_start,scheduled_end,status,check_in_at,check_out_at,check_out_name,late_fee_nzd")
    .eq("care_date",today).order("scheduled_start").limit(150),
   db.from("cus_care_profiles").select("student_id,status,missing_guardian_reason").order("created_at",{ascending:false}).limit(300),
   db.from("cus_care_children").select("id,full_name").order("created_at",{ascending:false}).limit(300),
   db.from("cus_staff").select("id,full_name,phone,email,subjects,scope")
     .eq("scope","care").order("full_name").limit(100),
   db.rpc("cus_care_balances"),
   db.from("cus_care_visits").select("id,student_id,care_date,status")
     .gte("care_date",actualToday).eq("status","scheduled")
     .order("care_date").limit(250)
 ]);
 if([v,p,c,t,b,up].some(x=>x.error))
  return <main className="mx-auto max-w-3xl p-8">晚托数据未就绪，请确认已执行最新数据库升级。</main>;
 const profiles=p.data||[],visits=v.data||[];
 const studentIds=[...new Set([...profiles.map(x=>x.student_id),...visits.map(x=>x.student_id)])];
 const visitIds=visits.map(x=>x.id);
 const empty=Promise.resolve({data:[],error:null});
 const [g,e,a,l]=await Promise.all([
  studentIds.length?db.from("cus_care_guardians").select("id,student_id,full_name,relationship,phone,primary_contact,pickup_authorized,signature_signed_at").in("student_id",studentIds):empty,
  studentIds.length?db.from("cus_care_emergency_contacts").select("id,student_id,full_name,relationship,phone,pickup_authorized").in("student_id",studentIds):empty,
  visitIds.length?db.from("cus_care_pickup_approvals").select("id,visit_id,contact_id,parent_guardian_id,approved_at,revoked_at,video_path,parent_notified_at,child_response_checked")
    .in("visit_id",visitIds).order("approved_at"):empty,
  visitIds.length?db.from("cus_care_lesson_logs").select("id,visit_id,teacher_id,teacher_actions,child_actions,observations")
    .in("visit_id",visitIds).order("created_at"):empty
 ]);
 if([g,e,a,l].some(x=>x.error))return <main className="p-8">接送信息读取失败，请刷新页面。</main>;
 const children=(c.data||[]).map(x=>({id:x.id,name:x.full_name}));
 return <div className="min-h-screen bg-slate-50 pb-24 text-slate-900 md:pb-10">
  <div className="hidden md:block"><Navbar/></div>
  <main className="mx-auto max-w-[1500px] space-y-2 px-3 py-3 md:px-5">
   <header className="erp-page-heading flex flex-wrap items-center justify-between gap-3">
    <h1 className="text-2xl font-bold">晚托</h1>
    <div className="flex flex-wrap gap-2">
      
      {isAdmin&&<Link href="/afterschool/register" className="rounded-lg bg-indigo-600 px-3 py-2 text-sm text-white">＋ 建立档案</Link>}
      <form method="get" className="flex items-center gap-2">
        <input aria-label="查看日期" type="date" name="date" defaultValue={today}
          className="rounded-lg border border-slate-200 bg-white px-2 py-2 text-sm"/>
        <button type="submit" className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm">查询</button>
      </form>
    </div>
   </header>
   <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
    {[["已报名孩子",profiles.length],["今日预计",visits.length],
      ["托管中",visits.filter(x=>x.status==="in_care").length],
      ["已交接",visits.filter(x=>x.status==="released").length]].map(([label,n])=>
      <div key={String(label)} className="erp-care-metric rounded-xl border bg-white p-4"><p className="text-xs text-slate-500">{label}</p>
       <p className="mt-1 text-2xl font-bold">{n}</p></div>)}
   </div>
   <CareDailyClient visits={visits} students={children} profiles={profiles}
    guardians={g.data||[]} contacts={e.data||[]} approvals={a.data||[]}
    teachers={t.data||[]} balances={b.data||[]} upcoming={up.data||[]}
    lessonLogs={l.data||[]} selectedDate={today} isAdmin={isAdmin}/>
  </main><MobileDock/>
 </div>;
}
