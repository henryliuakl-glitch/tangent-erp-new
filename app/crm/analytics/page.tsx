import Link from "next/link";
import {formatInTimeZone} from "date-fns-tz";
import {Navbar} from "@/components/Navbar";
import {MobileDock} from "@/components/MobileDock";
import {educationManager} from "@/lib/education-manager";

export const dynamic="force-dynamic";
const nz="Pacific/Auckland";
const panel="rounded-xl border border-slate-200 bg-white p-4 shadow-sm";
const money=(n:number,c:"NZD"|"RMB")=>(c==="NZD"?"NZ$":"¥")+
 Number(n||0).toLocaleString("en-NZ",{maximumFractionDigits:2});
const num=(n:number)=>n.toLocaleString("en-NZ");
const percent=(a:number,b:number)=>b?Math.round(a/b*1000)/10:null;
type Lead={id:string;created_at:string;source:string;status:string;student_id:string|null};
type Trial={id:string;lead_id:string;starts_at:string;status:string};
type Booking={id:string;student_id:string;start_time:string;status:string;subject:string|null;teacher:string|null;duration:number;actual_rate:number|null};
type Tx={id:string;type:string;amount:number;currency:string|null;transaction_date:string};
type Student={id:string;hourly_rate:number;currency:string|null};
type Task={id:string;kind:string;status:string;completed_at:string|null;created_at:string};
type Event={id:string;title:string;starts_at:string};
type Registration={id:string;campaign_id:string;lead_id:string;status:string};

function Metric({label,value,note}:{label:string;value:string|number;note:string}){
 return <article className={panel}>
   <p className="text-xs text-slate-500">{label}</p>
   <p className="mt-2 text-2xl font-extrabold text-slate-900">{value}</p>
   <p className="mt-1 text-[11px] leading-relaxed text-slate-400">{note}</p>
 </article>;
}
function Bars({title,subtitle,rows}:{title:string;subtitle?:string;rows:{name:string;value:number;detail?:string}[]}){
 const top=Math.max(...rows.map(x=>x.value),1);
 return <article className={panel}>
   <h3 className="text-sm font-bold">{title}</h3>
   {subtitle&&<p className="mt-1 text-xs text-slate-500">{subtitle}</p>}
   {rows.length===0?<p className="py-8 text-center text-sm text-slate-400">暂无可统计的数据</p>:
    <div className="mt-4 space-y-3">{rows.slice(0,12).map((r,i)=>
      <div key={r.name+i}>
       <div className="mb-1 flex justify-between gap-2 text-xs">
        <span className="min-w-0 truncate font-semibold">{r.name}</span>
        <span className="shrink-0 tabular-nums text-slate-600">{r.detail||num(r.value)}</span>
       </div>
       <div className="h-2 overflow-hidden rounded-full bg-slate-100">
        <div className="h-full rounded-full bg-indigo-500" style={{width:(r.value/top*100)+"%"}}/>
       </div>
      </div>)}</div>}
 </article>;
}
export default async function CrmAnalyticsPage({searchParams}:{
 searchParams:Promise<{days?:string}>
}){
 let ctx;
 try{ctx=await educationManager();}
 catch{return <main className="p-8 text-sm">没有教培经营分析权限，请先切换 CuS 或 Astra 管理员账号。</main>;}
 const {unit,db}=ctx;
 const params=await searchParams;
 const days=[30,90,180].includes(Number(params.days))?Number(params.days):30;
 const from=new Date(Date.now()-days*86400000);
 const fromIso=from.toISOString();
 const fromDay=formatInTimeZone(from,nz,"yyyy-MM-dd");

 const [l,t,f,b,s,tx,events,registrations]=await Promise.all([
   db.from("edu_leads").select("id,created_at,source,status,student_id")
     .eq("business_unit_id",unit).gte("created_at",fromIso).order("created_at",{ascending:false}).limit(4000),
   db.from("edu_trials").select("id,lead_id,starts_at,status")
     .eq("business_unit_id",unit).gte("starts_at",fromIso).order("starts_at",{ascending:false}).limit(4000),
   db.from("edu_followups").select("id,kind,status,completed_at,created_at")
     .eq("business_unit_id",unit).eq("kind","renewal").eq("status","done")
     .gte("completed_at",fromIso).order("completed_at",{ascending:false}).limit(4000),
   db.from("bookings").select("id,student_id,start_time,status,subject,teacher,duration,actual_rate")
     .eq("business_unit_id",unit).gte("start_time",fromIso).order("start_time",{ascending:false}).limit(6000),
   db.from("students").select("id,hourly_rate,currency")
     .eq("business_unit_id",unit).limit(3500),
   db.from("transactions").select("id,type,amount,currency,transaction_date")
     .eq("business_unit_id",unit).gte("transaction_date",fromDay)
     .order("transaction_date",{ascending:false}).limit(6000),
   db.from("edu_campaigns").select("id,title,starts_at")
     .eq("business_unit_id",unit).gte("starts_at",fromIso).limit(500),
   db.from("edu_campaign_registrations").select("id,campaign_id,lead_id,status")
     .eq("business_unit_id",unit).limit(4500)
 ]);
 // Active class utilisation is a current-state metric from the existing teaching ledger.
 const programmes=await db.from("cus_programmes").select("id")
   .eq("business_unit_id",unit).limit(200);
 const programmeIds=(programmes.data||[]).map(x=>x.id);
 const classes=programmes.error?{data:[],error:programmes.error}:
   programmeIds.length?await db.from("cus_classes").select("id,title,capacity,status")
     .in("programme_id",programmeIds).eq("status","active").limit(700)
     :{data:[],error:null};
 const classIds=(classes.data||[]).map(x=>x.id);
 const enrolments=classes.error?{data:[],error:classes.error}:
   classIds.length?await db.from("cus_enrolments").select("class_id")
     .in("class_id",classIds).eq("status","active").limit(4000)
    :{data:[],error:null};
 const errors=[l,t,f,b,s,tx,events,registrations,programmes,classes,enrolments]
   .filter(x=>x.error).map(x=>x.error!.message);
 return <div className="min-h-screen bg-slate-50 pb-24 md:pb-8">
  <div className="hidden md:block"><Navbar/></div>
  <main className="mx-auto max-w-[1500px] space-y-3 px-3 py-4 md:px-5">
   <header className="flex flex-wrap items-center justify-between gap-3">
    <div><h1 className="text-xl font-extrabold">教培经营分析</h1>
      <p className="mt-1 text-xs text-slate-500">{unit==="cus"?"CuS Academy":"Astra Education"} · 独立实体数据，滚动时间窗口</p>
    </div>
    <nav className="flex flex-wrap gap-2 text-xs font-semibold text-indigo-600">
     <Link className="rounded-lg bg-white px-3 py-2" href="/crm">招生 CRM</Link>
     <Link className="rounded-lg bg-white px-3 py-2" href="/crm/events">活动管理</Link>
    </nav>
   </header>
   <nav className="flex flex-wrap gap-2">
    {[30,90,180].map(n=><Link key={n} href={"/crm/analytics?days="+n}
      className={"rounded-lg px-4 py-2 text-xs font-semibold "+(days===n?"bg-indigo-600 text-white":"bg-white text-slate-600")}>
      最近{n}天</Link>)}
   </nav>
   {errors.length>0?<div className={panel}>
     <h2 className="font-bold">经营数据暂时无法读取</h2>
     <p className="mt-2 text-sm text-slate-600">
       请确认已在 Tangent ERP 的 Supabase 执行阶段一、二及阶段三至五的 SQL。
       读取失败时不显示虚假的零数据。
     </p>
   </div>:<AnalyticsContent {...{
     days,leads:l.data||[],trials:t.data||[],tasks:f.data||[],
     bookings:b.data||[],students:s.data||[],transactions:tx.data||[],
     campaigns:events.data||[],registrations:registrations.data||[],
     activeClasses:classes.data||[],activeEnrolments:enrolments.data||[],
     truncated:!!(programmes.data?.length===200||classes.data?.length===700||
       enrolments.data?.length===4000||l.data?.length===4000||t.data?.length===4000||f.data?.length===4000||
       b.data?.length===6000||s.data?.length===3500||tx.data?.length===6000||
       events.data?.length===500||registrations.data?.length===4500)
   }}/>}
  </main><MobileDock/>
 </div>;
}
function AnalyticsContent({days,leads,trials,tasks,bookings,students,transactions,campaigns,registrations,activeClasses,activeEnrolments,truncated}:{
 days:number;leads:Lead[];trials:Trial[];tasks:Task[];bookings:Booking[];
 students:Student[];transactions:Tx[];campaigns:Event[];registrations:Registration[];
 activeClasses:{id:string;title:string;capacity:number}[];
 activeEnrolments:{class_id:string}[];
 truncated:boolean
}){
 const leadMap=new Map(leads.map(l=>[l.id,l]));
 const studentMap=new Map(students.map(s=>[s.id,s]));
 const converted=leads.filter(x=>!!x.student_id).length;
 const completedTrials=trials.filter(x=>x.status==="completed");
 const trialLeadIds=new Set(completedTrials.map(x=>x.lead_id));
 const convertedTrialLeads=[...trialLeadIds].filter(x=>leadMap.get(x)?.student_id).length;
 const completed=bookings.filter(x=>x.status==="completed");
 const completedHours=completed.reduce((n,x)=>n+Number(x.duration||0),0);
 const attendedStudents=new Set(completed.map(x=>x.student_id).filter(Boolean));
 const renewalDone=tasks.filter(x=>x.kind==="renewal"&&x.status==="done").length;
 const src=new Map<string,{count:number;converted:number}>();
 for(const lead of leads){
   const key=lead.source||"未登记";
   const old=src.get(key)||{count:0,converted:0};
   old.count++;if(lead.student_id)old.converted++;
   src.set(key,old);
 }
 const bySource=[...src.entries()].map(([name,x])=>({
   name,value:x.count,detail:x.count+"条 · 转学员 "+x.converted+
     "（"+(percent(x.converted,x.count)??0)+"%）"
 })).sort((a,b)=>b.value-a.value);
 const subjectHours=new Map<string,number>(),teacherHours=new Map<string,number>();
 const lessonValue:{NZD:number;RMB:number}={NZD:0,RMB:0};
 for(const x of completed){
   const hours=Number(x.duration||0);
   const subject=x.subject||"未标注课程";
   subjectHours.set(subject,(subjectHours.get(subject)||0)+hours);
   const teacher=x.teacher||"未分配教师";
   teacherHours.set(teacher,(teacherHours.get(teacher)||0)+hours);
   const student=studentMap.get(x.student_id);
   const c=student?.currency==="RMB"?"RMB":"NZD";
   const rate=Number(x.actual_rate??student?.hourly_rate??0);
   if(rate>0)lessonValue[c]+=hours*rate;
 }
 const cash:{NZD:number;RMB:number}={NZD:0,RMB:0};
 for(const t of transactions){
   if(t.type!=="income")continue;
   const c=t.currency==="RMB"?"RMB":"NZD";
   cash[c]+=Number(t.amount||0);
 }
 const eventIds=new Set(campaigns.map(x=>x.id));
 const eventRegistrations=registrations.filter(x=>eventIds.has(x.campaign_id));
 const eventAttended=eventRegistrations.filter(x=>x.status==="attended");
 const eventConverted=new Set(eventAttended.filter(x=>leadMap.get(x.lead_id)?.student_id)
   .map(x=>x.lead_id)).size;
 const eventStats=campaigns.map(c=>{
   const rs=eventRegistrations.filter(x=>x.campaign_id===c.id);
   return {name:c.title,value:rs.filter(x=>x.status==="attended").length,
    detail:rs.filter(x=>x.status==="attended").length+"人到场"};
 }).sort((a,b)=>b.value-a.value);

 return <div className="space-y-3">
  {truncated&&<p className="rounded-lg bg-amber-50 p-3 text-xs text-amber-800">
    有数据达到查询条数上限，以下统计可能不完整。建议缩短时间范围。
  </p>}
  <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
   <Metric label="新增招生线索" value={num(leads.length)} note={"最近"+days+"天创建的咨询"}/>
   <Metric label="咨询→学员" value={percent(converted,leads.length)===null?"—":percent(converted,leads.length)+"%"}
    note={converted+"/"+leads.length+"，按本期新增咨询目前的学员关联状态计算"}/>
   <Metric label="已完成试听" value={num(completedTrials.length)}
    note={"已完成试听；其中"+convertedTrialLeads+"条本期咨询已关联正式学员"}/>
   <Metric label="活跃上课学生" value={num(attendedStudents.size)} note="本期至少有1节已完成一对一课程"/>
   <Metric label="已完成一对一课时" value={completedHours.toFixed(1)+"h"} note="只统计原有 Bookings 已完成课程"/>
   <Metric label="完成续费跟进" value={num(renewalDone)} note="表示任务完成，不等于实际续费收款"/>
   <Metric label="本期活动到场人次" value={num(eventAttended.length)} note="按本期举行的活动与签到状态统计"/>
   <Metric label="活动到场后转学员" value={num(eventConverted)} note="仅统计在本期新增咨询中可验证的学员关联"/>
  </div>
  <div className="grid gap-3 sm:grid-cols-2">
    <Metric label="当前活跃班级" value={num(activeClasses.length)}
      note="读取现有教务 active 班级，当前状态不随日期窗口变化"/>
    <Metric label="当前班级容量占用"
      value={activeClasses.reduce((n,x)=>n+Number(x.capacity||0),0)?
       percent(activeEnrolments.length,activeClasses.reduce((n,x)=>n+Number(x.capacity||0),0))+"%":"—"}
      note={activeEnrolments.length+"位有效报名 / "+
         activeClasses.reduce((n,x)=>n+Number(x.capacity||0),0)+"个名额；按班级人次统计"/>
  </div>
  <div className="grid gap-3 md:grid-cols-2">
   <article className={panel}>
     <h3 className="mb-1 text-sm font-bold">现金收款</h3>
     <p className="text-xs text-slate-500">来自现有 Transactions 的 income 流水（包含非学费收入，未换汇）</p>
     <div className="mt-4 grid grid-cols-2 gap-3">
      <div><p className="text-[11px] text-slate-400">NZD</p><p className="text-xl font-bold">{money(cash.NZD,"NZD")}</p></div>
      <div><p className="text-[11px] text-slate-400">RMB</p><p className="text-xl font-bold">{money(cash.RMB,"RMB")}</p></div>
     </div>
   </article>
   <article className={panel}>
     <h3 className="mb-1 text-sm font-bold">已完成课程价值（销课）</h3>
     <p className="text-xs text-slate-500">Bookings 实际费率或学生课时费 × 已完成时长，非现金流水</p>
     <div className="mt-4 grid grid-cols-2 gap-3">
      <div><p className="text-[11px] text-slate-400">NZD</p><p className="text-xl font-bold">{money(lessonValue.NZD,"NZD")}</p></div>
      <div><p className="text-[11px] text-slate-400">RMB</p><p className="text-xl font-bold">{money(lessonValue.RMB,"RMB")}</p></div>
     </div>
   </article>
  </div>
  <div className="grid gap-3 lg:grid-cols-2">
   <Bars title="招生渠道表现" subtitle="同一批新线索目前的转学员比例；不是历史日期上的成交率" rows={bySource}/>
   <Bars title="各科目已完成课时" subtitle="仅统计一对一 Bookings，不含尚未接入的班课价值"
     rows={[...subjectHours].map(([name,value])=>({name,value,detail:value.toFixed(1)+"h"})).sort((a,b)=>b.value-a.value)}/>
   <Bars title="教师授课时长" subtitle="不能等同教师利用率，尚无统一可用工时数据"
     rows={[...teacherHours].map(([name,value])=>({name,value,detail:value.toFixed(1)+"h"})).sort((a,b)=>b.value-a.value)}/>
   <Bars title="活动签到表现" subtitle="按活动实际开始时间所在窗口"
     rows={eventStats}/>
  </div>
  <p className="text-xs leading-relaxed text-slate-500">
    统计口径：最近{days}天；招生按创建时间，课程按开始时间，财务按交易日期，活动按开始时间。
    实收现金与销课价值分别展示，不重复合计。尚无可信数据时，不计算续费率、正式学生流失率、
    教师利用率或活动利润；这些需要进一步配置续费交易归因、停课记录及教师可用工时。
  </p>
 </div>;
}
