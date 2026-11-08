"use client";
import {useState,type FormEvent} from "react";
import {useRouter} from "next/navigation";
import Link from "next/link";
import {toast} from "sonner";
import {CalendarDays,Plus,Users,CheckCircle2,ArrowUpRight} from "lucide-react";
import {createCampaign,updateCampaign,signUpCampaign,markEventAttendance} from "./actions";

type Unit="cus"|"astra";
type Campaign={id:string;title:string;category:string;starts_at:string;ends_at:string|null;
 location:string|null;capacity:number;advertised_fee_nzd:number|null;status:string;lead_source:string;notes:string|null};
type Registration={id:string;campaign_id:string;lead_id:string;status:string;notes:string|null;created_at:string};
type Lead={id:string;student_name:string;parent_name:string|null;contact:string|null;status:string;student_id:string|null;source:string};
type Feedback={ok:boolean;error?:string};
const control="min-w-0 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none";
const panel="rounded-xl border border-slate-200 bg-white p-3 shadow-sm md:p-4";
const btn="rounded-lg bg-indigo-600 px-3 py-2 text-xs font-semibold text-white hover:bg-indigo-700 disabled:opacity-50";
const soft="rounded-lg bg-slate-100 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-200";
const statuses:Record<string,string>={draft:"草稿",open:"开放报名",closed:"停止报名",completed:"已结束",cancelled:"已取消",
  registered:"已报名",attended:"已到场",no_show:"未到场"};
function dateLabel(s:string|null){if(!s)return"—";return new Intl.DateTimeFormat("zh-CN",{
 timeZone:"Pacific/Auckland",year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",hourCycle:"h23"
}).format(new Date(s));}
function Field({label,children}:{label:string;children:React.ReactNode}){
 return <label className="flex min-w-0 flex-col gap-1 text-xs font-semibold text-slate-600">{label}{children}</label>;
}
export function EventsClient({unit,campaigns,registrations,leads,truncated}:{
 unit:Unit;campaigns:Campaign[];registrations:Registration[];leads:Lead[];truncated:boolean
}){
 const router=useRouter();
 const [active,setActive]=useState(campaigns[0]?.id||"");
 const [mode,setMode]=useState<"existing"|"new">("new");
 const [busy,setBusy]=useState(false);
 const selected=campaigns.find(c=>c.id===active);
 const rs=registrations.filter(r=>r.campaign_id===active);
 const activeSeats=rs.filter(r=>["registered","attended"].includes(r.status)).length;
 const attended=rs.filter(r=>r.status==="attended");
 const converted=new Set(attended.filter(r=>leads.find(l=>l.id===r.lead_id)?.student_id)
    .map(r=>r.lead_id)).size;
 const leadName=(id:string)=>leads.find(x=>x.id===id);
 async function submit(e:FormEvent<HTMLFormElement>,action:(f:FormData)=>Promise<Feedback>){
  e.preventDefault();if(busy)return;
  const form=new FormData(e.currentTarget);form.set("businessId",unit);
  setBusy(true);
  try{const r=await action(form);if(!r.ok){toast.error(r.error||"保存失败");return;}
    toast.success("保存成功");router.refresh();}
  catch(err){toast.error(err instanceof Error?err.message:"操作失败");}
  finally{setBusy(false);}
 }
 return <div className="space-y-3">
  {truncated&&<p className="rounded-lg bg-amber-50 p-3 text-xs text-amber-800">
    数据条数已达到本页查询上限，统计可能不完整。请按阶段查阅历史活动。
  </p>}
  <div className="grid gap-3 md:grid-cols-3">
    <div className={panel}><p className="text-xs text-slate-500">活动总数（当前加载）</p>
      <p className="mt-1 text-2xl font-bold">{campaigns.length}</p></div>
    <div className={panel}><p className="text-xs text-slate-500">开放报名</p>
      <p className="mt-1 text-2xl font-bold">{campaigns.filter(x=>x.status==="open").length}</p></div>
    <div className={panel}><p className="text-xs text-slate-500">活动到场人次</p>
      <p className="mt-1 text-2xl font-bold">{registrations.filter(x=>x.status==="attended").length}</p></div>
  </div>
  <div className="grid items-start gap-3 lg:grid-cols-[330px_minmax(0,1fr)]">
    <div className="space-y-3">
      <section className={panel+" space-y-2"}>
        <h2 className="font-bold">活动列表</h2>
        {campaigns.length===0&&<p className="text-sm text-slate-500">暂无活动，先创建一个。</p>}
        {campaigns.map(x=><button key={x.id} onClick={()=>setActive(x.id)}
         className={"w-full rounded-lg p-3 text-left "+(active===x.id?"bg-indigo-50 ring-1 ring-indigo-200":"bg-slate-50 hover:bg-slate-100")}>
         <div className="flex justify-between gap-2 text-sm font-bold"><span>{x.title}</span><span className="shrink-0 text-[11px] text-indigo-600">{statuses[x.status]||x.status}</span></div>
         <p className="mt-1 text-xs text-slate-500">{dateLabel(x.starts_at)} · {x.location||"未指定地点"}</p>
         <p className="mt-1 text-xs text-slate-500">{registrations.filter(r=>r.campaign_id===x.id&&r.status!=="cancelled").length}/{x.capacity} 报名</p>
        </button>)}
      </section>
      <section className={panel}>
       <details>
        <summary className="flex cursor-pointer items-center gap-2 text-sm font-bold"><Plus className="h-4 w-4"/>创建活动</summary>
        <form className="mt-3 grid gap-3" onSubmit={e=>submit(e,createCampaign)}>
         <Field label="活动名称"><input required className={control} name="title" placeholder="例如 Christmas Science Day"/></Field>
         <Field label="活动类型"><select className={control} name="category">
           <option value="event">公开活动</option><option value="trial_day">试听体验</option>
           <option value="workshop">工作坊</option><option value="holiday">假期班</option>
           <option value="seminar">讲座</option><option value="other">其他</option>
         </select></Field>
         <Field label="开始日期 / 时间（NZ）"><input className={control} name="starts_at" type="datetime-local" required/></Field>
         <Field label="结束日期 / 时间（NZ）"><input className={control} name="ends_at" type="datetime-local"/></Field>
         <Field label="地点"><input className={control} name="location"/></Field>
         <Field label="报名容量"><input className={control} name="capacity" type="number" min="1" max="500" defaultValue="20" required/></Field>
         <Field label="活动标价（NZD，非收款）"><input className={control} name="advertised_fee_nzd" type="number" min="0" step="0.01"/></Field>
         <Field label="招生来源标签"><input className={control} name="lead_source" defaultValue="活动"/></Field>
         <Field label="初始状态"><select className={control} name="status"><option value="draft">草稿</option><option value="open">开放报名</option></select></Field>
         <Field label="活动说明"><textarea className={control} name="notes" rows={2}/></Field>
         <button className={btn} disabled={busy}>保存活动</button>
        </form>
       </details>
      </section>
    </div>
    <div className="min-w-0 space-y-3">
     {!selected?<section className={panel+" p-8 text-center text-sm text-slate-500"}>选择左侧活动查看报名名单</section>:<>
      <section className={panel+" space-y-3"}>
       <div className="flex flex-wrap items-center justify-between gap-2">
        <div><h2 className="text-base font-bold">{selected.title}</h2>
          <p className="mt-1 text-xs text-slate-500">{dateLabel(selected.starts_at)} · {selected.location||"未指定地点"}</p>
        </div>
        <span className="rounded-lg bg-indigo-50 px-3 py-2 text-xs font-semibold text-indigo-700">{statuses[selected.status]}</span>
       </div>
       <div className="grid grid-cols-3 gap-2">
        <div className="rounded-lg bg-slate-50 p-3"><p className="text-[11px] text-slate-500">占用名额</p><p className="mt-1 text-xl font-bold">{activeSeats}/{selected.capacity}</p></div>
        <div className="rounded-lg bg-slate-50 p-3"><p className="text-[11px] text-slate-500">已签到</p><p className="mt-1 text-xl font-bold">{attended.length}</p></div>
        <div className="rounded-lg bg-slate-50 p-3"><p className="text-[11px] text-slate-500">到场后已转学员</p><p className="mt-1 text-xl font-bold">{converted}</p></div>
       </div>
       <p className="text-xs text-slate-500">
        活动标价 {selected.advertised_fee_nzd===null?"未设置":"NZ$"+Number(selected.advertised_fee_nzd).toFixed(2)}；这不是实际收款。
        已转学员按关联招生线索的真实学员档案计算。
       </p>
       <form onSubmit={e=>submit(e,updateCampaign)} className="flex flex-wrap items-end gap-2">
        <input type="hidden" name="campaign_id" value={selected.id}/>
        <Field label="活动状态"><select className={control} name="status" defaultValue={selected.status} key={selected.id}>
         {["draft","open","closed","completed","cancelled"].map(x=><option key={x} value={x}>{statuses[x]}</option>)}
        </select></Field>
        <input className={control+" flex-1"} name="notes" defaultValue={selected.notes||""} placeholder="活动备注"/>
        <button className={soft} disabled={busy}>保存状态</button>
       </form>
      </section>
      <section className={panel+" space-y-3"}>
       <h3 className="flex items-center gap-2 text-sm font-bold"><Users className="h-4 w-4"/>活动报名</h3>
       {selected.status==="open"?<>
        <div className="flex gap-2 text-xs">
         <button onClick={()=>setMode("new")} className={mode==="new"?btn:soft}>登记新咨询</button>
         <button onClick={()=>setMode("existing")} className={mode==="existing"?btn:soft}>选择已有咨询</button>
        </div>
        <form onSubmit={e=>submit(e,signUpCampaign)} className="grid gap-2 rounded-lg bg-slate-50 p-3 sm:grid-cols-2">
         <input type="hidden" name="campaign_id" value={selected.id}/>
         {mode==="existing"?<div className="sm:col-span-2"><Field label="已存在的招生线索">
          <select className={control} name="lead_id" required defaultValue="">
           <option value="">选择学生</option>
           {leads.map(x=><option key={x.id} value={x.id}>{x.student_name} · {x.contact||"无联系方式"}</option>)}
          </select>
         </Field></div>:<>
          <Field label="学生姓名"><input name="student_name" className={control} required/></Field>
          <Field label="家长姓名"><input name="parent_name" className={control}/></Field>
          <div className="sm:col-span-2"><Field label="联系方式"><input name="contact" className={control}/></Field></div>
         </>}
         <button className={btn+" sm:col-span-2"} disabled={busy||activeSeats>=selected.capacity}>
           {activeSeats>=selected.capacity?"报名已满":"确认报名，关联招生 CRM"}
         </button>
        </form>
       </>:<p className="text-sm text-slate-500">此活动暂未开放报名。</p>}
      </section>
      <section className={panel+" space-y-2"}>
       <h3 className="font-bold">报名及签到名单</h3>
       {rs.length===0&&<p className="text-sm text-slate-500">暂无报名记录</p>}
       {rs.map(x=>{const lead=leadName(x.lead_id);return <div key={x.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-100 p-3">
        <div className="min-w-0 flex-1">
         <p className="text-sm font-semibold">{lead?.student_name||"咨询学生"} · <span className="text-xs font-normal text-slate-500">{statuses[x.status]||x.status}</span></p>
         <p className="mt-1 text-xs text-slate-500">{lead?.contact||"无联系方式"} · {lead?.student_id?"已转正式学员":"尚未转学员"}</p>
         <Link href={"/crm?lead="+encodeURIComponent(x.lead_id)} className="mt-1 inline-flex items-center gap-1 text-xs font-semibold text-indigo-600">
          查看咨询记录<ArrowUpRight className="h-3 w-3"/></Link>
        </div>
        {x.status!=="cancelled"&&<form className="flex items-center gap-1.5" onSubmit={e=>submit(e,markEventAttendance)}>
         <input type="hidden" name="registration_id" value={x.id}/>
         <select name="status" className={control+" max-w-[100px]"} defaultValue={x.status==="registered"?"attended":x.status}>
          <option value="attended">已到场</option><option value="no_show">未到场</option><option value="cancelled">取消</option>
         </select>
         <button className={soft} disabled={busy}>保存</button>
        </form>}
       </div>})}
      </section>
     </>}
    </div>
  </div>
 </div>;
}
