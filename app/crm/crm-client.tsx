"use client";

import Link from "next/link";
import {useRouter} from "next/navigation";
import {useMemo,useState,type FormEvent} from "react";
import {toast} from "sonner";
import {UserPlus,ClipboardList,CalendarClock,Users,ArrowRight,Check,Plus,RefreshCw} from "lucide-react";
import {saveLead,addActivity,scheduleTrial,finishTrial,addFollowup,completeFollowup,convertLead,createRenewalTask,addStudentActivity} from "./actions";

type Unit="cus"|"astra";
type Lead={
 id:string;student_id:string|null;student_name:string;parent_name:string|null;contact:string|null;
 contact_channel:string|null;school:string|null;year_level:string|null;subject:string|null;
 course_interest:string|null;source:string;status:string;next_followup_at:string|null;
 lost_reason:string|null;notes:string|null;created_at:string;
};
type Activity={id:string;lead_id:string;kind:string;content:string;created_at:string};
type Trial={id:string;lead_id:string;starts_at:string;duration_minutes:number;fee_nzd:number;
 teacher:string|null;subject:string|null;status:string;assessment:string|null;outcome:string|null;
 booking_id:string|null};
type Followup={id:string;lead_id:string|null;student_id:string|null;kind:string;title:string;
 notes:string|null;due_at:string;status:string};
type Booking={id:string;student_id:string|null;start_time:string;status:string;subject:string|null;teacher:string|null;duration:number};
type StudentActivity={id:string;student_id:string;kind:string;content:string;created_at:string};
type Student={id:string;name:string;student_code:string|null;balance:number;payment_type:string;
 subject:string|null;level:string|null;hourly_rate:number|null};
type Renewal={id:string;name:string;payment_type:string;balance:number;reason:string;lastLesson:string|null;nextLesson:string|null};
type ActionResult={ok:true;studentId?:string;leadId?:string}|{ok:false;error:string};
type Action=(form:FormData)=>Promise<ActionResult>;
type Props={unit:Unit;leads:Lead[];activities:Activity[];trials:Trial[];followups:Followup[];
 students:Student[];bookings:Booking[];studentActivities:StudentActivity[];renewalCandidates:Renewal[];focusLeadId:string|null;focusStudentId:string|null};
const statuses=[
 ["new","新咨询"],["contacted","跟进中"],["trial_booked","已约试听"],
 ["trial_done","已试听"],["considering","待决定"],["enrolled","已报名"],["lost","未成交"]
] as const;
const statusLabel=(s:string)=>statuses.find(x=>x[0]===s)?.[1]||s;
const sources=["小红书","微信","转介绍","活动","老带新","Google","电话","其他"];
const field="h-9 min-w-0 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100";
const area=field+" min-h-[75px] py-2";
const btn="inline-flex items-center justify-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-2 text-xs font-semibold text-white hover:bg-indigo-700 disabled:cursor-wait disabled:opacity-50";
const subtle="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50";
const card="rounded-xl border border-slate-200 bg-white p-3 shadow-sm md:p-4";
function dateLabel(value:string|null|undefined){
 if(!value)return "—";
 const d=new Date(value);
 return Number.isFinite(+d)?new Intl.DateTimeFormat("zh-CN",{
  timeZone:"Pacific/Auckland",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",
  hourCycle:"h23"
 }).format(d):"—";
}
function localInput(value:string|null|undefined){
 if(!value)return "";
 const date=new Date(value);
 if(!Number.isFinite(+date))return "";
 const parts=new Intl.DateTimeFormat("en-GB",{timeZone:"Pacific/Auckland",
  year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",hourCycle:"h23"
 }).formatToParts(date);
 const get=(k:string)=>parts.find(p=>p.type===k)?.value||"";
 return get("year")+"-"+get("month")+"-"+get("day")+"T"+get("hour")+":"+get("minute");
}
function Field({label,children}:{label:string;children:React.ReactNode}){
 return <label className="flex min-w-0 flex-col gap-1 text-xs font-semibold text-slate-500">
  {label}{children}
 </label>;
}
function Empty({children}:{children:React.ReactNode}){
 return <div className="rounded-lg bg-slate-50 px-4 py-7 text-center text-sm text-slate-400">{children}</div>;
}
export function CrmClient({unit,leads,activities,trials,followups,students,bookings,studentActivities,renewalCandidates,focusLeadId,focusStudentId}:Props){
 const router=useRouter();
 const [tab,setTab]=useState<"leads"|"trials"|"followups"|"parents"|"renewals">(focusStudentId?"parents":"leads");
 const [selectedStudentId,setSelectedStudentId]=useState<string|null>(focusStudentId||students[0]?.id||null);
 const [selectedId,setSelectedId]=useState<string|null>(focusLeadId||leads[0]?.id||null);
 const [query,setQuery]=useState("");
 const [statusFilter,setStatusFilter]=useState("all");
 const [newLead,setNewLead]=useState(false);
 const [newTask,setNewTask]=useState(false);
 const [taskTarget,setTaskTarget]=useState<"lead"|"student">(focusStudentId?"student":"lead");
 const [busy,setBusy]=useState(false);
 const [trialOpen,setTrialOpen]=useState(false);
 const [trialBookingId,setTrialBookingId]=useState("");
 const selected=leads.find(l=>l.id===selectedId)||null;
 const selectedActivities=activities.filter(x=>x.lead_id===selectedId);
 const selectedTrials=trials.filter(x=>x.lead_id===selectedId);
 const openTasks=followups.filter(x=>x.status==="open");
 const dueLeads=leads.filter(x=>x.next_followup_at&&!["enrolled","lost"].includes(x.status)
    &&Date.parse(x.next_followup_at)<=Date.now());
 const selectedStudent=students.find(x=>x.id===selectedStudentId);
 const selectedStudentActivities=studentActivities.filter(x=>x.student_id===selectedStudentId);
 const relatedLeadIds=new Set(leads.filter(x=>x.student_id===selectedStudentId).map(x=>x.id));
 const linkedLeadActivities=activities.filter(x=>relatedLeadIds.has(x.lead_id));
 const filtered=useMemo(()=>leads.filter(l=>{
  const match=statusFilter==="all"||l.status===statusFilter;
  const q=query.trim().toLowerCase();
  return match&&(!q||[l.student_name,l.parent_name,l.contact,l.school,l.subject,l.course_interest]
    .some(x=>(x||"").toLowerCase().includes(q)));
 }),[leads,statusFilter,query]);
 const named=(leadId:string|null,studentId:string|null)=>{
  if(leadId)return leads.find(l=>l.id===leadId)?.student_name||"咨询";
  if(studentId)return students.find(s=>s.id===studentId)?.name||"学员";
  return "—";
 };
 async function perform(form:FormData,action:Action,done?:(res:ActionResult)=>void){
  form.set("businessId",unit);
  setBusy(true);
  try{
   const result=await action(form);
   if(!result.ok){toast.error(result.error);return;}
   toast.success("保存成功");
   done?.(result);
   router.refresh();
  }catch(error){toast.error(error instanceof Error?error.message:"操作失败，请重试");}
  finally{setBusy(false);}
 }
 function submit(event:FormEvent<HTMLFormElement>,action:Action,done?:(res:ActionResult)=>void){
  event.preventDefault();
  void perform(new FormData(event.currentTarget),action,done);
 }
 function chooseLead(id:string){
  setSelectedId(id);setNewLead(false);setTrialOpen(false);setTrialBookingId("");setTab("leads");
 }
 const tabItems=[
  {id:"leads" as const,label:"咨询线索",icon:UserPlus,count:leads.filter(l=>l.status!=="enrolled"&&l.status!=="lost").length},
  {id:"trials" as const,label:"试听管理",icon:CalendarClock,count:trials.filter(t=>t.status==="scheduled").length},
  {id:"followups" as const,label:"跟进任务",icon:ClipboardList,count:openTasks.length+dueLeads.length},
  {id:"parents" as const,label:"家长服务",icon:Users,count:students.length},
  {id:"renewals" as const,label:"续费与留存",icon:RefreshCw,count:renewalCandidates.length}
 ];
 return <div className="space-y-3">
  <header className="flex flex-wrap items-center justify-between gap-3">
   <div><h1 className="text-xl font-extrabold tracking-tight">招生 CRM</h1>
     <p className="mt-1 text-xs text-slate-500">{unit==="cus"?"CuS Academy":"Astra Education"} · 咨询、试听、报名与续费</p></div>
   <div className="flex flex-wrap items-center gap-2">
    <Link href="/crm/analytics" className={subtle}>经营分析</Link>
    <Link href="/crm/events" className={subtle}>活动招生</Link>
    <button className={btn} onClick={()=>{setTab("leads");setNewLead(true);}}><Plus className="h-4 w-4"/>新增咨询</button>
   </div>
  </header>
  <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
   {[
    ["累计咨询",leads.length],["待跟进",openTasks.length+dueLeads.length],
    ["已约试听",trials.filter(t=>t.status==="scheduled").length],
    ["已转学员",leads.filter(l=>l.status==="enrolled").length]
   ].map(([name,count])=><div key={String(name)} className={card}>
     <p className="text-xs text-slate-500">{name}</p>
     <p className="mt-1 text-2xl font-bold tabular-nums">{count}</p>
   </div>)}
  </div>
  <nav className="flex gap-1 overflow-x-auto rounded-xl border border-slate-200 bg-white p-1" aria-label="招生功能">
   {tabItems.map(x=><button key={x.id} type="button" onClick={()=>setTab(x.id)}
     className={"inline-flex min-w-max flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-2.5 text-xs font-semibold "+
       (tab===x.id?"bg-indigo-600 text-white":"text-slate-600 hover:bg-slate-50")}>
     <x.icon className="h-3.5 w-3.5"/>{x.label}
     <span className={"rounded-full px-1.5 py-0.5 text-[10px] "+(tab===x.id?"bg-white/20":"bg-slate-100")}>{x.count}</span>
    </button>)}
  </nav>

  {tab==="leads"&&<div className="grid items-start gap-3 lg:grid-cols-[330px_minmax(0,1fr)]">
   <section className={card+" space-y-3"}>
    <div className="grid grid-cols-[minmax(0,1fr)_130px] gap-2">
     <input className={field} value={query} onChange={e=>setQuery(e.target.value)} placeholder="搜索"/>
     <select className={field} value={statusFilter} onChange={e=>setStatusFilter(e.target.value)}>
      <option value="all">全部状态</option>{statuses.map(([v,l])=><option key={v} value={v}>{l}</option>)}
     </select>
    </div>
    <div className="max-h-[70vh] space-y-1 overflow-y-auto">
     {filtered.length===0&&<Empty>暂无符合条件的咨询</Empty>}
     {filtered.map(l=><button key={l.id} onClick={()=>chooseLead(l.id)}
      className={"w-full rounded-lg border p-3 text-left transition-colors "+(selectedId===l.id&&!newLead?"border-indigo-200 bg-indigo-50":"border-transparent hover:bg-slate-50")}>
      <div className="flex items-center justify-between gap-2">
       <span className="min-w-0 truncate text-sm font-bold">{l.student_name}</span>
       <span className="shrink-0 rounded bg-white px-1.5 py-1 text-[10px] text-slate-500">{statusLabel(l.status)}</span>
      </div>
      <p className="mt-1 truncate text-xs text-slate-500">{l.year_level||"年级未填"} · {l.subject||l.course_interest||"课程未定"}</p>
      <p className="mt-1 truncate text-[11px] text-slate-400">{l.source} · {l.contact||"未留联系方式"}</p>
      {l.next_followup_at&&<p className={"mt-1 text-[11px] "+(Date.parse(l.next_followup_at)<Date.now()&&l.status!=="enrolled"?"font-semibold text-rose-600":"text-indigo-500")}>
       下次联系 {dateLabel(l.next_followup_at)}</p>}
     </button>)}
    </div>
   </section>
   <div className="min-w-0 space-y-3">
    {newLead?<section className={card}>
     <div className="mb-3 flex items-center justify-between"><h2 className="font-bold">新增招生咨询</h2>
      <button className={subtle} onClick={()=>setNewLead(false)}>取消</button></div>
     <LeadForm unit={unit} busy={busy} onSubmit={e=>submit(e,saveLead,res=>{setNewLead(false);if(res.ok&&res.leadId)setSelectedId(res.leadId);})}/>
    </section>:selected?<>
      <section className={card}>
       <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div><h2 className="text-base font-bold">{selected.student_name}</h2>
         <p className="text-xs text-slate-500">咨询登记于 {dateLabel(selected.created_at)}</p></div>
        <span className="rounded-full bg-indigo-50 px-3 py-1 text-xs font-semibold text-indigo-700">{statusLabel(selected.status)}</span>
       </div>
       <details className="group" key={selected.id}>
        <summary className="mb-2 cursor-pointer text-sm font-semibold text-indigo-600">编辑咨询资料 / 状态</summary>
        <LeadForm unit={unit} lead={selected} busy={busy} onSubmit={e=>submit(e,saveLead)}/>
       </details>
       {!selected.student_id&&<div className="mt-3 rounded-xl border border-indigo-100 bg-[#f8f9ff] p-3">
        <h3 className="mb-2 text-sm font-bold">转为正式学员</h3>
        <p className="mb-3 text-xs text-slate-500">关联现有学员，或在原 ERP 学生表新建零课时学员；不会自动记账或销课。</p>
        <form onSubmit={e=>submit(e,convertLead,res=>{
          if(res.ok&&res.studentId)router.push("/students/"+res.studentId);
        })} className="grid gap-2 sm:grid-cols-2">
         <input type="hidden" name="lead_id" value={selected.id}/>
         <Field label="关联已有学员（不选则新建）">
          <select className={field} name="existing_student_id" defaultValue="">
           <option value="">新建正式学员</option>
           {students.map(s=><option key={s.id} value={s.id}>{s.name} {s.student_code||""}</option>)}
          </select>
         </Field>
         <Field label="新学员编号（可空）"><input className={field} name="student_code" placeholder="编号"/></Field>
         <Field label="新学员课时费 NZD/h"><input className={field} type="number" min="1" step="0.01" name="hourly_rate" defaultValue="70"/></Field>
         <Field label="新学员结算方式"><select className={field} name="payment_type">
          <option value="monthly">预充值</option><option value="single">一课一结</option><option value="postpaid">后付费</option>
         </select></Field>
         <button className={btn+" sm:col-span-2"} disabled={busy}>确认转为正式学员 <ArrowRight className="h-3.5 w-3.5"/></button>
        </form>
       </div>}
       {selected.student_id&&<div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800">
        <span className="font-semibold">已关联正式学员</span>
        <Link className="font-bold underline" href={"/students/"+selected.student_id}>查看学生档案</Link>
       </div>}
      </section>
      <section className={card+" space-y-3"}>
       <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-bold">试听记录 <span className="text-slate-400">{selectedTrials.length}</span></h3>
        <button onClick={()=>setTrialOpen(!trialOpen)} className={subtle}><CalendarClock className="h-3.5 w-3.5"/>安排试听</button>
       </div>
       {trialOpen&&<form className="grid gap-2 rounded-xl bg-slate-50 p-3 sm:grid-cols-2" onSubmit={e=>submit(e,scheduleTrial,()=>{setTrialOpen(false);setTrialBookingId("");})}>
        <input type="hidden" name="lead_id" value={selected.id}/>
        {selected.student_id&&<div className="sm:col-span-2"><Field label="关联现有排课（可选）">
         <select className={field} name="booking_id" value={trialBookingId} onChange={e=>setTrialBookingId(e.target.value)}>
          <option value="">不关联，在 CRM 新建试听预约</option>
          {bookings.filter(b=>b.student_id===selected.student_id&&b.status!=="cancelled").map(b=>
           <option key={b.id} value={b.id}>{dateLabel(b.start_time)} · {b.subject||"课程"} · {b.teacher||"未分配"}</option>)}
         </select>
        </Field></div>}
        {trialBookingId?<p className="rounded-lg border border-indigo-100 bg-white p-3 text-xs text-indigo-700 sm:col-span-2">
         已关联真实排课，试听日期、课时、科目及教师将直接使用该课程记录。
        </p>:<>
         <Field label="试听日期与时间（新西兰）"><input className={field} type="datetime-local" name="starts_at" required/></Field>
         <Field label="时长（分钟）"><input className={field} type="number" name="duration_minutes" defaultValue="45" min="15" max="240"/></Field>
         <Field label="授课教师"><input className={field} name="teacher" placeholder="教师姓名"/></Field>
         <Field label="试听科目"><input className={field} name="subject" defaultValue={selected.subject||""}/></Field>
        </>}
        <Field label="试听费用（NZD，仅登记约定，不自动收款）"><input className={field} type="number" name="fee_nzd" defaultValue="0" min="0" step="0.01"/></Field>
        <button className={btn+" self-end"} disabled={busy}>保存试听预约</button>
        <p className="text-xs text-slate-500 sm:col-span-2">未报名学员的试听先记录于 CRM，不创建虚假学员或财务流水。正式学员可另在排课中安排课程。</p>
       </form>}
       {selectedTrials.length===0&&<Empty>尚未预约试听</Empty>}
       {selectedTrials.map(t=><details key={t.id} className="rounded-lg border border-slate-100 p-3">
        <summary className="cursor-pointer text-sm font-semibold">{dateLabel(t.starts_at)} · {t.subject||"试听"} · {t.status==="scheduled"?"已预约":t.status==="completed"?"已完成":t.status==="no_show"?"未到场":"已取消"}</summary>
        <form className="mt-3 grid gap-2 sm:grid-cols-2" onSubmit={e=>submit(e,finishTrial)}>
         <input type="hidden" name="trial_id" value={t.id}/>
         <Field label="试听状态"><select name="status" className={field} defaultValue={t.status}>
          <option value="scheduled">已预约</option><option value="completed">已完成</option><option value="no_show">未到场</option><option value="cancelled">已取消</option>
         </select></Field>
         <Field label="试听结果"><select name="outcome" className={field} defaultValue={t.outcome||""}>
          <option value="">未确定</option><option value="enrolled">有报名意向</option>
          <option value="considering">考虑中</option><option value="declined">不报名</option>
         </select></Field>
         <Field label="学情评估 / 建议"><textarea className={area+" sm:col-span-2"} name="assessment" defaultValue={t.assessment||""} rows={3}/></Field>
         <button className={btn+" sm:col-span-2"} disabled={busy}>保存试听结果</button>
        </form>
       </details>)}
      </section>
      <section className={card+" space-y-3"}>
       <h3 className="font-bold">家长沟通 / 跟进时间轴</h3>
       <form className="flex flex-col gap-2 sm:flex-row" onSubmit={e=>submit(e,addActivity,()=>{})}>
        <input type="hidden" name="lead_id" value={selected.id}/>
        <select name="kind" className={field+" sm:w-32"}>
         <option value="wechat">微信</option><option value="call">电话</option><option value="message">短信</option>
         <option value="meeting">面谈</option><option value="feedback">家长反馈</option><option value="note">备注</option>
        </select>
        <input name="content" required className={field+" flex-1"} placeholder="记录本次沟通及下步计划"/>
        <button className={btn} disabled={busy}>添加记录</button>
       </form>
       {selectedActivities.length===0&&<Empty>暂无沟通记录</Empty>}
       <div className="max-h-80 space-y-2 overflow-y-auto">
        {selectedActivities.map(x=><div key={x.id} className="border-l-2 border-indigo-100 pl-3">
         <p className="text-xs font-semibold text-slate-500">{x.kind} · {dateLabel(x.created_at)}</p>
         <p className="mt-1 whitespace-pre-wrap text-sm">{x.content}</p>
        </div>)}
       </div>
       <button className={subtle} onClick={()=>{setTab("followups");setTaskTarget("lead");setNewTask(true);}}>设置下次跟进任务 <ArrowRight className="h-3.5 w-3.5"/></button>
      </section>
     </>:<div className={card}><Empty>选择左侧咨询，或新建咨询</Empty></div>}
    </div>
  </div>}

  {tab==="trials"&&<section className={card}>
    <h2 className="mb-3 font-bold">试听预约与记录</h2>
    {trials.length===0&&<Empty>暂无试听记录，请进入咨询线索安排试听</Empty>}
    <div className="space-y-2">
     {trials.map(t=><div key={t.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-100 p-3">
      <div><p className="text-sm font-semibold">{named(t.lead_id,null)} · {t.subject||"试听"}</p>
       <p className="mt-1 text-xs text-slate-500">{dateLabel(t.starts_at)} · {t.duration_minutes}min · {t.teacher||"待分配老师"}</p></div>
      <div className="flex items-center gap-2">
       <span className="text-xs text-slate-500">{t.status==="scheduled"?"待上课":t.status==="completed"?"已完成":t.status==="no_show"?"未到场":"已取消"}</span>
       <button className={subtle} onClick={()=>chooseLead(t.lead_id)}>查看 / 记录结果</button>
      </div>
     </div>)}
    </div>
  </section>}

  {tab==="followups"&&<div className="grid items-start gap-3 lg:grid-cols-[minmax(0,1.4fr)_minmax(300px,1fr)]">
   <section className={card+" space-y-3"}>
    <div className="flex items-center justify-between">
     <h2 className="font-bold">待办和家长跟进</h2>
     <button className={subtle} onClick={()=>setNewTask(!newTask)}><Plus className="h-3.5 w-3.5"/>新增任务</button>
    </div>
    {dueLeads.map(l=><div key={"lead-due-"+l.id} className="flex items-center justify-between gap-3 rounded-lg border border-amber-100 bg-amber-50 p-3">
      <div><p className="text-sm font-semibold">{l.student_name} · 预约跟进已到期</p>
       <p className="mt-1 text-xs text-slate-600">计划联系 {dateLabel(l.next_followup_at)}</p></div>
      <button className={subtle} onClick={()=>chooseLead(l.id)}>查看咨询</button>
     </div>)}
    {followups.length===0&&dueLeads.length===0&&<Empty>暂无跟进任务</Empty>}
    {followups.map(task=><div key={task.id} className="flex flex-wrap items-center gap-3 rounded-lg border border-slate-100 p-3">
     <div className="min-w-0 flex-1">
      <p className={"text-sm font-semibold "+(task.status==="done"?"text-slate-400 line-through":"")}>{task.title}</p>
      <p className="mt-1 text-xs text-slate-500">{named(task.lead_id,task.student_id)} · 截止 {dateLabel(task.due_at)} · {task.kind}</p>
      {task.notes&&<p className="mt-1 text-xs text-slate-500">{task.notes}</p>}
     </div>
     <button disabled={busy} className={task.status==="open"?btn:subtle} onClick={()=>{
      const fd=new FormData();fd.set("followup_id",task.id);fd.set("status",task.status==="open"?"done":"open");
      void perform(fd,completeFollowup);
     }}><Check className="h-3.5 w-3.5"/>{task.status==="open"?"完成":task.status==="done"?"重新打开":"恢复"}</button>
    </div>)}
   </section>
   <section className={card+" space-y-3"}>
    <h3 className="font-bold">新建跟进任务</h3>
    {!newTask&&<p className="text-sm text-slate-500">可以为招生线索或已报名学生建立跟进与续费任务。</p>}
    <form onSubmit={e=>submit(e,addFollowup,()=>setNewTask(false))} className="space-y-3">
     <Field label="跟进对象">
      <select className={field} value={taskTarget} onChange={e=>setTaskTarget(e.target.value as "lead"|"student")}>
       <option value="lead">咨询线索</option><option value="student">正式学员</option>
      </select>
     </Field>
     {taskTarget==="lead"?<Field label="咨询">
      <select className={field} name="lead_id" required defaultValue={selectedId||""}>
       <option value="">请选择</option>{leads.map(l=><option key={l.id} value={l.id}>{l.student_name} · {statusLabel(l.status)}</option>)}
      </select>
     </Field>:<Field label="学员">
      <select className={field} name="student_id" required defaultValue={selectedStudentId||""} key={selectedStudentId}>
       <option value="">请选择</option>{students.map(s=><option key={s.id} value={s.id}>{s.name} · {s.level||""}</option>)}
      </select>
     </Field>}
     <Field label="类别"><select name="kind" className={field} defaultValue={taskTarget==="student"?"renewal":"lead"} key={taskTarget}>
      <option value="lead">咨询</option><option value="trial">试听</option>
      <option value="parent">家长沟通</option><option value="renewal">续费</option>
     </select></Field>
     <Field label="任务名称"><input className={field} name="title" placeholder="例如：试听后联系家长" required/></Field>
     <Field label="提醒时间（新西兰）"><input className={field} name="due_at" type="datetime-local" required/></Field>
     <Field label="备注"><textarea name="notes" rows={2} className={area}/></Field>
     <button disabled={busy} className={btn+" w-full"}>保存跟进任务</button>
    </form>
   </section>
  </div>}


  {tab==="parents"&&<div className="grid items-start gap-3 lg:grid-cols-[280px_minmax(0,1fr)]">
   <section className={card+" space-y-2"}>
    <h2 className="font-bold">已报名学员</h2>
    <select className={field} value={selectedStudentId||""} onChange={e=>setSelectedStudentId(e.target.value)}>
     <option value="">请选择学员</option>
     {students.map(s=><option key={s.id} value={s.id}>{s.name} · {s.level||""}</option>)}
    </select>
    <p className="text-xs text-slate-500">这里直接使用 ERP 原有学生档案，不会建立重复学生。</p>
   </section>
   <section className={card+" space-y-3"}>
    {!selectedStudent?<Empty>选择学员，查看家长沟通记录</Empty>:<>
     <div className="flex flex-wrap items-center justify-between gap-2">
      <h2 className="text-base font-bold">{selectedStudent.name} · 家长沟通</h2>
      <Link href={"/students/"+selectedStudent.id} className={subtle}>查看学员档案</Link>
     </div>
     <form className="flex flex-col gap-2 sm:flex-row" onSubmit={e=>submit(e,addStudentActivity)}>
      <input type="hidden" name="student_id" value={selectedStudent.id}/>
      <select name="kind" className={field+" sm:w-32"}>
       <option value="wechat">微信</option><option value="call">电话</option><option value="message">短信</option>
       <option value="meeting">面谈</option><option value="feedback">家长反馈</option><option value="note">备注</option>
      </select>
      <input className={field+" flex-1"} name="content" required placeholder="记录家长沟通、学习目标或反馈"/>
      <button className={btn} disabled={busy}>保存</button>
     </form>
     {selectedStudentActivities.length+linkedLeadActivities.length===0&&<Empty>尚无沟通记录</Empty>}
     <div className="max-h-[440px] space-y-2 overflow-y-auto">
      {[...selectedStudentActivities.map(x=>({...x,origin:"学生"})),...linkedLeadActivities.map(x=>({...x,origin:"咨询"}))]
       .sort((a,b)=>b.created_at.localeCompare(a.created_at))
       .map(x=><div key={x.origin+x.id} className="border-l-2 border-indigo-100 py-1 pl-3">
        <p className="text-xs font-semibold text-slate-500">{x.origin} · {x.kind} · {dateLabel(x.created_at)}</p>
        <p className="mt-1 whitespace-pre-wrap text-sm">{x.content}</p>
       </div>)}
     </div>
     <button className={subtle} onClick={()=>{setTab("followups");setTaskTarget("student");setNewTask(true);}}>
      <Plus className="h-3.5 w-3.5"/>为该学员建立跟进或续费任务
     </button>
    </>}
   </section>
  </div>}

  {tab==="renewals"&&<section className={card+" space-y-3"}>
   <div><h2 className="font-bold">续费与留存预警</h2>
    <p className="mt-1 text-xs text-slate-500">根据现有学生课时余额和最近排课记录生成建议。预警不是实际欠款；一课一结不按余额判断。</p>
   </div>
   {renewalCandidates.length===0&&<Empty>当前没有符合规则的续费预警</Empty>}
   {renewalCandidates.map(x=><div key={x.id} className={"flex flex-wrap items-center gap-3 rounded-xl border p-3 "+
     (x.id===focusStudentId?"border-indigo-200 bg-indigo-50":"border-slate-100")}>
    <div className="min-w-0 flex-1">
     <Link href={"/students/"+x.id} className="text-sm font-bold text-indigo-600 hover:underline">{x.name}</Link>
     <p className="mt-1 text-xs text-slate-600">{x.reason}</p>
     <p className="mt-1 text-[11px] text-slate-400">
      {x.payment_type==="single"?"一课一结":x.payment_type==="postpaid"?"后付费":"预充值"}
      {x.payment_type!=="single"?" · 余额 "+x.balance+"h":""}
      {" · "}最近完成 {dateLabel(x.lastLesson)} · 下节课 {dateLabel(x.nextLesson)}
     </p>
    </div>
    {openTasks.some(f=>f.student_id===x.id&&f.kind==="renewal")?
     <span className="text-xs font-semibold text-emerald-700">已有跟进任务</span>:
     <button className={subtle} disabled={busy} onClick={()=>{
      const fd=new FormData();fd.set("student_id",x.id);void perform(fd,createRenewalTask);
     }}><Plus className="h-3.5 w-3.5"/>创建续费跟进</button>}
   </div>)}
  </section>}
 </div>;
}

function LeadForm({lead,busy,onSubmit}:{unit:Unit;lead?:Lead;busy:boolean;onSubmit:(e:FormEvent<HTMLFormElement>)=>void}){
 return <form key={lead?.id||"new"} onSubmit={onSubmit} className="grid gap-3 sm:grid-cols-2">
  {lead&&<input type="hidden" name="lead_id" value={lead.id}/>}
  <Field label="学生姓名 *"><input className={field} name="student_name" required defaultValue={lead?.student_name||""}/></Field>
  <Field label="家长姓名"><input className={field} name="parent_name" defaultValue={lead?.parent_name||""}/></Field>
  <Field label="联系方式 / 微信"><input className={field} name="contact" defaultValue={lead?.contact||""}/></Field>
  <Field label="联系渠道"><select className={field} name="contact_channel" defaultValue={lead?.contact_channel||"微信"}>
   <option>微信</option><option>电话</option><option>短信</option><option>Email</option><option>其他</option>
  </select></Field>
  <Field label="学生学校"><input className={field} name="school" defaultValue={lead?.school||""}/></Field>
  <Field label="年级"><input className={field} name="year_level" placeholder="Year 12" defaultValue={lead?.year_level||""}/></Field>
  <Field label="科目"><input className={field} name="subject" placeholder="Physics / Chemistry / Maths" defaultValue={lead?.subject||""}/></Field>
  <Field label="课程意向"><input className={field} name="course_interest" defaultValue={lead?.course_interest||""}/></Field>
  <Field label="招生来源"><input className={field} name="source" list="crm-sources" defaultValue={lead?.source||"小红书"}/>
   <datalist id="crm-sources">{sources.map(s=><option key={s} value={s}/>)}</datalist>
  </Field>
  <Field label="当前状态"><select className={field} name="status" defaultValue={lead?.status||"new"}>
   {statuses.map(([v,l])=><option key={v} value={v}>{l}</option>)}
  </select></Field>
  <Field label="下次联系时间（新西兰）"><input type="datetime-local" name="next_followup_at" className={field} defaultValue={localInput(lead?.next_followup_at)}/></Field>
  <Field label="未成交原因"><input name="lost_reason" className={field} defaultValue={lead?.lost_reason||""}/></Field>
  <div className="sm:col-span-2"><Field label="学习需求及备注"><textarea name="notes" className={area} rows={2} defaultValue={lead?.notes||""}/></Field></div>
  <button className={btn+" sm:col-span-2"} disabled={busy}>保存咨询资料</button>
 </form>;
}
