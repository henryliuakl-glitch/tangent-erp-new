import Link from "next/link";
import {cookies} from "next/headers";
import {createClient} from "@/lib/supabase/server";
import {Navbar} from "@/components/Navbar";
import {MobileDock} from "@/components/MobileDock";
import {CrmClient} from "./crm-client";

export const dynamic="force-dynamic";

export default async function CrmPage({searchParams}:{
 searchParams:Promise<{student?:string;lead?:string}>
}){
 const db=await createClient();
 const {data:{user}}=await db.auth.getUser();
 if(!user)return <main className="p-8">请先 <Link href="/login">登录</Link>。</main>;
 const store=await cookies();
 const rawUnit=store.get("businessId")?.value||"cus";
 if(rawUnit!=="cus"&&rawUnit!=="astra"){
  return <div className="min-h-screen bg-slate-50 pb-24 md:pb-10">
    <div className="hidden md:block"><Navbar/></div>
    <main className="mx-auto max-w-3xl p-6 text-sm text-slate-600">招生 CRM 仅在 CuS 或 Astra 实体中使用，请先切换业务实体。</main>
    <MobileDock/>
  </div>;
 }
 const unit=rawUnit;
 const {data:members,error:memberError}=await db.from("erp_memberships")
   .select("business_unit_id,role").eq("user_id",user.id).in("business_unit_id",["cus","astra"]);
 const owner=members?.some(m=>m.business_unit_id==="cus"&&m.role==="owner");
 const manager=members?.some(m=>m.business_unit_id===unit&&["owner","admin"].includes(m.role));
 if(memberError||(!owner&&!manager)){
   return <main className="p-8 text-sm">当前账号没有该教培实体的招生管理权限。</main>;
 }

 const cutoff=new Date(Date.now()-180*86400000).toISOString();
 const [l,a,t,f,s,b,sa]=await Promise.all([
  db.from("edu_leads").select("*").eq("business_unit_id",unit).order("created_at",{ascending:false}).limit(600),
  db.from("edu_lead_activities").select("*").eq("business_unit_id",unit).order("created_at",{ascending:false}).limit(1200),
  db.from("edu_trials").select("*").eq("business_unit_id",unit).order("starts_at",{ascending:false}).limit(500),
  db.from("edu_followups").select("*").eq("business_unit_id",unit).order("due_at",{ascending:true}).limit(800),
  db.from("students").select("id,name,student_code,level,subject,teacher,balance,payment_type,hourly_rate,created_at")
    .eq("business_unit_id",unit).order("name").limit(1200),
  db.from("bookings").select("id,student_id,start_time,status,subject,teacher,duration")
    .eq("business_unit_id",unit).gte("start_time",cutoff)
    .order("start_time",{ascending:false}).limit(2000),
  db.from("edu_student_activities").select("*").eq("business_unit_id",unit)
    .order("created_at",{ascending:false}).limit(1200)
 ]);
 const problems=[l,a,t,f,s,b,sa].filter(x=>x.error).map(x=>x.error?.message);
 if(problems.length){
  console.error("[education-crm] data fetch failed:",problems);
  return <div className="min-h-screen bg-slate-50 pb-24 md:pb-10">
   <div className="hidden md:block"><Navbar/></div>
   <main className="mx-auto max-w-3xl space-y-3 p-6">
    <h1 className="text-xl font-bold">招生 CRM 尚未就绪</h1>
    <p className="text-sm text-slate-600">请确认已在 Tangent ERP 的 Supabase 数据库执行 20261108_education_crm_phase1_phase2.sql，并检查实体权限。原有学生、排课和财务功能不受影响。</p>
   </main><MobileDock/>
  </div>;
 }

 const students=s.data||[];
 const bookings=b.data||[];
 const now=Date.now();
 const lastAndNext=new Map<string,{last:number;next:number}>();
 for(const booking of bookings){
  if(!booking.student_id||booking.status==="cancelled")continue;
  const timestamp=Date.parse(booking.start_time);
  if(!Number.isFinite(timestamp))continue;
  const current=lastAndNext.get(booking.student_id)||{last:0,next:0};
  if(timestamp>now&&booking.status==="confirmed")current.next=Math.max(current.next,timestamp);
  if(timestamp<=now&&booking.status==="completed")current.last=Math.max(current.last,timestamp);
  lastAndNext.set(booking.student_id,current);
 }
 const renewalCandidates=students.flatMap(student=>{
   const paymentType=String(student.payment_type||"monthly");
   const balance=Number(student.balance)||0;
   const schedule=lastAndNext.get(student.id)||{last:0,next:0};
   let reason="";
   if(paymentType==="monthly"&&balance<=2)reason=balance<0?"课时已超额":"剩余课时 ≤ 2h";
   if(paymentType==="postpaid"&&balance<0)reason="后付费待结算";
   if(paymentType==="single"&&schedule.last&&now-schedule.last>21*86400000&&!schedule.next)
     reason="一课一结：超过21天未再次排课";
   return reason?[{id:student.id,name:student.name,payment_type:paymentType,balance,reason,
     lastLesson:schedule.last?new Date(schedule.last).toISOString():null,nextLesson:schedule.next?new Date(schedule.next).toISOString():null}]:[];
 });
 const params=await searchParams;
 return <div className="min-h-screen bg-slate-50 pb-24 text-slate-900 md:pb-10">
  <div className="hidden md:block"><Navbar/></div>
  <main className="mx-auto max-w-[1500px] px-3 py-3 md:px-5 md:py-5">
   <CrmClient unit={unit} leads={l.data||[]} activities={a.data||[]}
     trials={t.data||[]} followups={f.data||[]} students={students}
     bookings={bookings} studentActivities={sa.data||[]}
     renewalCandidates={renewalCandidates}
     focusLeadId={params.lead||null} focusStudentId={params.student||null}/>
  </main><MobileDock/>
 </div>;
}
