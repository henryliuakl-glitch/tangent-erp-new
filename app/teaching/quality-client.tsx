"use client";
import {useState,type FormEvent} from "react";
import {useRouter} from "next/navigation";
import {toast} from "sonner";
import {ShieldCheck,GraduationCap,Plus,CheckCircle2,Clock3,AlertCircle} from "lucide-react";
import {saveCredential,updateCredential,saveTraining,updateTraining} from "./quality-actions";

type Unit="cus"|"astra";
type Staff={id:string;full_name:string;scope:string;subjects:string|null;active:boolean};
type Credential={id:string;staff_id:string;credential_type:string;title:string;status:string;
  issued_on:string|null;review_due_on:string|null;reference_note:string|null;notes:string|null};
type Training={id:string;staff_id:string;kind:string;title:string;outcome:string;
  session_date:string;notes:string|null};
type Result={ok:boolean;error?:string};
const input="w-full min-w-0 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none";
const btn="rounded-lg bg-indigo-600 px-4 py-2 text-xs font-semibold text-white hover:bg-indigo-700 disabled:opacity-50";
const panel="rounded-xl border border-slate-200 bg-white p-3 shadow-sm md:p-4";
const titles:Record<string,string>={
 first_aid:"First Aid",police_vetting:"Police Vetting",p_endorsement:"P Endorsement",
 teacher_registration:"教师注册",other:"其他资质",
 onboarding:"入职培训",training:"内部培训",demo:"试讲评估",observation:"听课观察",review:"教学复盘"
};
function Field({name,children}:{name:string;children:React.ReactNode}){
 return <label className="flex min-w-0 flex-col gap-1 text-xs font-semibold text-slate-600">{name}{children}</label>;
}
export function QualityClient({unit,staff,credentials,trainings}:{
 unit:Unit;staff:Staff[];credentials:Credential[];trainings:Training[]
}){
 const router=useRouter();
 const [selected,setSelected]=useState(staff[0]?.id||"");
 const [busy,setBusy]=useState(false);
 const [view,setView]=useState<"credentials"|"training">("credentials");
 const who=staff.find(x=>x.id===selected);
 const scopedCred=credentials.filter(x=>x.staff_id===selected);
 const scopedTraining=trainings.filter(x=>x.staff_id===selected);
 const today=new Date().toLocaleDateString("en-CA",{timeZone:"Pacific/Auckland"});
 const plus30=new Date(Date.now()+30*86400000).toLocaleDateString("en-CA",{timeZone:"Pacific/Auckland"});
 const due=credentials.filter(x=>x.review_due_on&&x.review_due_on<=plus30&&x.status!=="needs_review");
 async function act(e:FormEvent<HTMLFormElement>,fn:(f:FormData)=>Promise<Result>){
  e.preventDefault();if(busy)return;
  const form=new FormData(e.currentTarget);form.set("businessId",unit);
  setBusy(true);
  try{const r=await fn(form);if(!r.ok){toast.error(r.error||"保存失败");return;}
    toast.success("保存成功");router.refresh();}
  catch(err){toast.error(err instanceof Error?err.message:"保存失败");}
  finally{setBusy(false);}
 }
 return <div className="space-y-3">
  <header className="grid gap-2 sm:grid-cols-3">
   <div className={panel}><p className="text-xs text-slate-500">教师档案</p><p className="mt-1 text-2xl font-bold">{staff.length}</p></div>
   <div className={panel}><p className="text-xs text-slate-500">证书 / 审查记录</p><p className="mt-1 text-2xl font-bold">{credentials.length}</p></div>
   <div className={panel}><p className="text-xs text-slate-500">未来30天需核查（含已逾期）</p><p className="mt-1 text-2xl font-bold text-amber-700">{due.length}</p></div>
  </header>
  {due.length>0&&<section className={panel+" border-amber-200"}>
   <h2 className="flex items-center gap-2 text-sm font-bold"><AlertCircle className="h-4 w-4 text-amber-600"/>资质复查提醒</h2>
   <div className="mt-2 flex flex-wrap gap-2">{due.slice(0,30).map(x=><button key={x.id}
    onClick={()=>{setSelected(x.staff_id);setView("credentials");}}
    className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900">
    {staff.find(t=>t.id===x.staff_id)?.full_name||"教师"} · {x.title} · {x.review_due_on}
    {x.review_due_on&&x.review_due_on<today?"（已逾期）":""}
   </button>)}</div>
  </section>}
  <div className="grid items-start gap-3 lg:grid-cols-[275px_minmax(0,1fr)]">
   <section className={panel+" space-y-2"}>
    <h2 className="text-sm font-bold">选择教师</h2>
    <select className={input} value={selected} onChange={e=>setSelected(e.target.value)}>
     {staff.map(x=><option key={x.id} value={x.id}>{x.full_name} {x.scope==="care"?"(晚托)":""}</option>)}
    </select>
    {!staff.length&&<p className="text-sm text-slate-500">请先到「教师档案」登记教师。</p>}
    {who&&<div className="rounded-lg bg-slate-50 p-3 text-xs text-slate-600">
     <strong>{who.full_name}</strong> · {who.active?"在职":"停用"}<br/>{who.subjects||"未登记学科"}
    </div>}
    <p className="text-xs leading-relaxed text-slate-500">
      Police Vetting 只记录核验状态和复查日期，不保存审查报告、身份证件或其他敏感原件。
    </p>
   </section>
   <section className={panel+" space-y-3"}>
    <div className="flex flex-wrap gap-2">
     <button className={(view==="credentials"?btn:"rounded-lg bg-slate-100 px-3 py-2 text-xs text-slate-700")}
      onClick={()=>setView("credentials")}><ShieldCheck className="mr-1 inline h-4 w-4"/>资质档案</button>
     <button className={(view==="training"?btn:"rounded-lg bg-slate-100 px-3 py-2 text-xs text-slate-700")}
      onClick={()=>setView("training")}><GraduationCap className="mr-1 inline h-4 w-4"/>培训与质量</button>
    </div>
    {view==="credentials"&&<>
     <details className="rounded-xl bg-[#f8f9ff] p-3">
      <summary className="cursor-pointer text-sm font-bold"><Plus className="inline h-4 w-4"/> 新增资质 / 审查记录</summary>
      <form className="mt-3 grid gap-3 sm:grid-cols-2" onSubmit={e=>act(e,saveCredential)}>
       <input type="hidden" name="staff_id" value={selected}/>
       <Field name="资质类型"><select className={input} name="credential_type">{["first_aid","police_vetting","p_endorsement","teacher_registration","other"].map(t=><option key={t} value={t}>{titles[t]}</option>)}</select></Field>
       <Field name="资质名称"><input name="title" className={input} required placeholder="例如 First Aid Level 2"/></Field>
       <Field name="审核状态"><select className={input} name="status"><option value="pending">待核验</option><option value="verified">已核验</option><option value="needs_review">需复查</option></select></Field>
       <Field name="内部参考编号（非证件号）"><input name="reference_note" className={input}/></Field>
       <Field name="取得 / 审查日期"><input name="issued_on" type="date" className={input}/></Field>
       <Field name="复查 / 到期提醒日期"><input name="review_due_on" type="date" className={input}/></Field>
       <div className="sm:col-span-2"><Field name="备注"><input name="notes" className={input}/></Field></div>
       <button className={btn+" sm:col-span-2"} disabled={busy||!selected}>保存记录</button>
      </form>
     </details>
     {scopedCred.length===0?<p className="text-sm text-slate-500">暂无资质记录</p>:scopedCred.map(x=>
      <details key={x.id} className="rounded-xl border border-slate-100 p-3">
       <summary className="flex cursor-pointer flex-wrap items-center justify-between gap-2 text-sm font-semibold">
        <span>{titles[x.credential_type]||"其他"} · {x.title}</span>
        <span className={"text-xs "+(x.review_due_on&&x.review_due_on<today?"text-rose-600":x.status==="verified"?"text-emerald-600":"text-amber-600")}>
         {x.review_due_on&&x.review_due_on<today?"复查逾期":x.status==="verified"?"已核验":x.status==="needs_review"?"需复查":"待核验"} · {x.review_due_on||"无提醒日期"}
        </span>
       </summary>
       <form className="mt-3 grid gap-2 sm:grid-cols-2" onSubmit={e=>act(e,updateCredential)}>
        <input type="hidden" name="id" value={x.id}/>
        <Field name="状态"><select className={input} name="status" defaultValue={x.status}>
         <option value="pending">待核验</option><option value="verified">已核验</option><option value="needs_review">需复查</option>
        </select></Field>
        <Field name="下次复查"><input className={input} name="review_due_on" type="date" defaultValue={x.review_due_on||""}/></Field>
        <div className="sm:col-span-2"><Field name="备注"><input className={input} name="notes" defaultValue={x.notes||""}/></Field></div>
        <button className={btn+" sm:col-span-2"} disabled={busy}>保存修改</button>
       </form>
      </details>)}
    </>}
    {view==="training"&&<>
     <details className="rounded-xl bg-[#f8f9ff] p-3">
      <summary className="cursor-pointer text-sm font-bold"><Plus className="inline h-4 w-4"/> 新增教师培训 / 评估</summary>
      <form className="mt-3 grid gap-3 sm:grid-cols-2" onSubmit={e=>act(e,saveTraining)}>
       <input type="hidden" name="staff_id" value={selected}/>
       <Field name="类别"><select className={input} name="kind">{["onboarding","training","demo","observation","review"].map(k=><option key={k} value={k}>{titles[k]}</option>)}</select></Field>
       <Field name="日期"><input className={input} type="date" name="session_date" required defaultValue={today}/></Field>
       <Field name="主题"><input className={input} name="title" required placeholder="例如 Cambridge 试讲"/></Field>
       <Field name="状态"><select className={input} name="outcome"><option value="planned">计划中</option><option value="completed">已完成</option><option value="followup">待改进</option><option value="cancelled">已取消</option></select></Field>
       <div className="sm:col-span-2"><Field name="评价与改进建议"><input className={input} name="notes"/></Field></div>
       <button className={btn+" sm:col-span-2"} disabled={busy||!selected}>保存培训</button>
      </form>
     </details>
     {scopedTraining.length===0?<p className="text-sm text-slate-500">暂无培训记录</p>:scopedTraining.map(x=>
      <details key={x.id} className="rounded-xl border border-slate-100 p-3">
       <summary className="flex cursor-pointer flex-wrap items-center justify-between gap-2 text-sm font-semibold">
        <span>{titles[x.kind]||x.kind} · {x.title}</span>
        <span className="text-xs text-slate-500">{x.session_date} · {x.outcome==="completed"?"已完成":x.outcome==="planned"?"计划中":x.outcome==="followup"?"待改进":"已取消"}</span>
       </summary>
       <form className="mt-3 grid gap-2 sm:grid-cols-2" onSubmit={e=>act(e,updateTraining)}>
        <input type="hidden" name="id" value={x.id}/>
        <Field name="结果"><select className={input} name="outcome" defaultValue={x.outcome}>
          <option value="planned">计划中</option><option value="completed">已完成</option>
          <option value="followup">待改进</option><option value="cancelled">已取消</option>
        </select></Field>
        <Field name="反馈与下一步"><textarea className={input} name="notes" defaultValue={x.notes||""} rows={2}/></Field>
        <button className={btn+" sm:col-span-2"} disabled={busy}>保存评估</button>
       </form>
      </details>)}
    </>}
   </section>
  </div>
 </div>;
}
