import Link from "next/link";
import {Navbar} from "@/components/Navbar";
import {MobileDock} from "@/components/MobileDock";
import {educationManager} from "@/lib/education-manager";
import {EventsClient} from "./events-client";

export const dynamic="force-dynamic";
export default async function EducationEventsPage(){
 let ctx;
 try{ctx=await educationManager();}
 catch{return <main className="p-8 text-sm">无权访问教培活动，请先登录并切换到 CuS 或 Astra 管理员账号。</main>;}
 const {unit,db}=ctx;
 const [c,r,l]=await Promise.all([
   db.from("edu_campaigns").select("*").eq("business_unit_id",unit)
    .order("starts_at",{ascending:false}).limit(250),
   db.from("edu_campaign_registrations").select("*").eq("business_unit_id",unit)
    .order("created_at",{ascending:false}).limit(2500),
   db.from("edu_leads").select("id,student_name,parent_name,contact,status,student_id,source")
    .eq("business_unit_id",unit).order("created_at",{ascending:false}).limit(2500)
 ]);
 const hasError=c.error||r.error||l.error;
 return <div className="min-h-screen bg-slate-50 pb-24 md:pb-8">
   <div className="hidden md:block"><Navbar/></div>
   <main className="mx-auto max-w-[1500px] space-y-3 px-3 py-4 md:px-5">
     <div className="flex flex-wrap items-center justify-between gap-3">
       <div><h1 className="text-xl font-extrabold">活动招生</h1>
        <p className="mt-1 text-xs text-slate-500">{unit==="cus"?"CuS Academy":"Astra Education"} · 活动报名、签到与学员转化</p>
       </div>
       <nav className="flex flex-wrap gap-2 text-xs font-semibold text-indigo-600">
        <Link className="rounded-lg bg-white px-3 py-2" href="/crm">招生 CRM</Link>
        <Link className="rounded-lg bg-white px-3 py-2" href="/crm/analytics">经营分析</Link>
       </nav>
     </div>
     {hasError?<section className="rounded-xl bg-white p-5">
      <h2 className="font-bold">活动模块尚未就绪</h2>
      <p className="mt-2 text-sm text-slate-600">请先在 Tangent ERP 的 Supabase 中执行 20261108_education_crm_phases3_4_5.sql。原有招生和学生数据不受影响。</p>
     </section>:<EventsClient unit={unit} campaigns={c.data||[]} registrations={r.data||[]} leads={l.data||[]}
       truncated={!!(c.data?.length===250||r.data?.length===2500||l.data?.length===2500)}/>}
   </main><MobileDock/>
 </div>;
}
