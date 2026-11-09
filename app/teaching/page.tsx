import Link from "next/link";
import {cookies} from "next/headers";
import {createClient} from "@/lib/supabase/server";
import {Navbar} from "@/components/Navbar";
import {MobileDock} from "@/components/MobileDock";
import {TeachingRecords} from "./records";
import {TeachingClasses} from "./classes";
import {TeachingStaff,CareTeachingOverview} from "./staff";
import {TeachingQuality} from "./quality";

export default async function TeachingPage({searchParams}:{
 searchParams:Promise<{view?:string;date?:string}>
}){
 const db=await createClient();
 const {data:{user}}=await db.auth.getUser();
 if(!user)return <main className="p-8">请先 <Link href="/login">登录</Link>。</main>;
 const {data:members,error}=await db.from("erp_memberships").select("business_unit_id,role")
  .eq("user_id",user.id).in("business_unit_id",["cus","astra"]);
 const owner=!!members?.some(m=>m.business_unit_id==="cus"&&m.role==="owner");
 const astraMember=!!members?.some(m=>m.business_unit_id==="astra");
 const astraStaff=owner||!!members?.some(m=>m.business_unit_id==="astra"&&
  ["owner","admin","teacher"].includes(m.role));
 if(error||(!owner&&!astraMember))return <main className="p-8">没有教务访问权限。</main>;
 const c=await cookies();
 const businessId:"cus"|"astra"=(!owner||c.get("businessId")?.value==="astra")?"astra":"cus";
 const {view,date}=await searchParams;
 const selectedDate=date&&/^\d{4}-\d{2}-\d{2}$/.test(date)&&!Number.isNaN(Date.parse(date))?date:undefined;
 const current=view==="classes"?"classes":view==="teachers"?"teachers":
  view==="quality"?"quality":
  view==="care"&&businessId==="astra"?"care":"records";
 const tabs=[
  {id:"records",label:businessId==="astra"?"Astra 教学记录":"CuS 教学记录",href:"/teaching"},
  {id:"classes",label:"班级管理",href:"/teaching?view=classes"},
  {id:"teachers",label:"教师档案",href:"/teaching?view=teachers"},
  ...(owner||!!members?.some(m=>m.business_unit_id===businessId&&["owner","admin"].includes(m.role))?
    [{id:"quality",label:"资质与培训",href:"/teaching?view=quality"}]:[]),
  ...(businessId==="astra"?[{id:"care",label:"晚托课堂",href:"/teaching?view=care"}]:[])
 ];
 const editable=businessId==="cus"?owner:astraStaff;
 const canManageTeachers=owner||!!members?.some(m=>m.business_unit_id==="astra"&&["owner","admin"].includes(m.role));
 return <div className="min-h-screen bg-slate-50 pb-24 text-slate-900 md:pb-10">
  <div className="hidden md:block"><Navbar/></div>
  <main className="mx-auto max-w-[1500px] space-y-2 px-3 py-3 md:px-5">
   <header className="erp-page-heading flex flex-wrap items-center gap-3">
    <h1 className="shrink-0 text-xl font-bold">教务</h1>
    <nav aria-label="教务视图" className="erp-teaching-tabs flex min-w-0 flex-wrap items-center gap-1 rounded-xl bg-white p-1 text-xs shadow-sm">
     {tabs.map(tab=><Link key={tab.id} href={tab.href} aria-current={current===tab.id?"page":undefined}
      className={"flex h-9 items-center rounded-lg px-3 font-semibold "+
       (current===tab.id?"bg-indigo-600 text-white":"text-slate-600 hover:bg-slate-50")}>
      {tab.label}
     </Link>)}
    </nav>
   </header>
   {current==="care"?<CareTeachingOverview/>:
    current==="records"?<TeachingRecords scope={businessId} editable={editable} owner={owner} selectedDate={selectedDate}/>:
    current==="classes"?<TeachingClasses businessId={businessId} editable={canManageTeachers} attendanceEditable={editable}/>:
    current==="quality"?(canManageTeachers?<TeachingQuality unit={businessId}/>:<p className="p-4 text-sm">无管理权限</p>):
    <TeachingStaff businessId={businessId} canManage={canManageTeachers}/>}
  </main><MobileDock/>
 </div>;
}