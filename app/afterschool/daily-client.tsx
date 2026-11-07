"use client";
import {useState,useTransition} from "react";
import {useRouter} from "next/navigation";
import {SignaturePad} from "./signature-pad";
import {clockCare,approveThirdParty,uploadThirdPartyVideo,markParentNotified,
  addSecondGuardian,createCareSchedule,addCareDayCredits,createTeacher,addCareLessonLog} from "./actions";
type Data=Record<string,any>;
type Props={visits:Data[];students:Data[];profiles:Data[];guardians:Data[];
  contacts:Data[];approvals:Data[];teachers:Data[];balances:Data[];upcoming:Data[];lessonLogs:Data[];isAdmin:boolean;selectedDate:string};
const box="rounded-xl border border-slate-200 bg-white p-4 shadow-sm";
const input="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm";
const button="rounded-lg bg-indigo-600 px-3 py-2 text-sm font-semibold text-white disabled:opacity-40";
const days=["日","一","二","三","四","五","六"];
function nzDate(value:string){return new Intl.DateTimeFormat("zh-NZ",{timeZone:"Pacific/Auckland",dateStyle:"medium",timeStyle:"short"}).format(new Date(value));}
export function CareDailyClient({visits,students,profiles,guardians,contacts,approvals,teachers,balances,upcoming,lessonLogs,isAdmin,selectedDate}:Props){
 const router=useRouter(),[pending,start]=useTransition();
 const [error,setError]=useState(""),[active,setActive]=useState(""),[direction,setDirection]=useState<"in"|"out">("in");
 const [personType,setPersonType]=useState("guardian"),[selectedPerson,setSelectedPerson]=useState("");
 const [editing,setEditing]=useState("");
 const personById=new Map([...guardians,...contacts].map(p=>[p.id,p]));
 const studentById=new Map(students.map(s=>[s.id,s]));
 const doAction=(fn:(f:FormData)=>Promise<unknown>)=>(event:React.FormEvent<HTMLFormElement>)=>{
   event.preventDefault();const data=new FormData(event.currentTarget);setError("");
   start(async()=>{try{await fn(data);setActive("");setEditing("");router.refresh();}
    catch(e){setError(e instanceof Error?e.message:"操作失败");}});
 };
 const openClock=(visit:Data,dir:"in"|"out")=>{
   setActive(visit.id);setDirection(dir);setPersonType("guardian");
   setSelectedPerson(guardians.find(g=>g.student_id===visit.student_id)?.id||"");setError("");
 };
 const pendingProfiles=profiles.filter(p=>p.status!=="active");
 const balanceByChild=new Map(balances.map(x=>[x.student_id,x]));
 return <div className="space-y-5">
  {error&&<div role="alert" className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{error}</div>}
  <section className={box}><h2 className="mb-3 text-lg font-bold">{selectedDate} 托管名单</h2>
   {visits.length===0?<p className="text-sm text-slate-500">暂无今日名单，请点击「生成今日班次」。</p>:
   <div className="grid gap-3 lg:grid-cols-2">{visits.map(v=>{
     const gs=guardians.filter(x=>x.student_id===v.student_id);
     const cs=contacts.filter(x=>x.student_id===v.student_id);
     const late=v.status==="in_care"&&new Date()>new Date(v.scheduled_end);
     const app=approvals.filter(x=>x.visit_id===v.id && !x.revoked_at).at(-1);
     return <div key={v.id} className="space-y-2 rounded-xl border border-slate-200 p-3">
      <div className="flex items-start justify-between gap-2"><div>
        <h3 className="font-bold">{studentById.get(v.student_id)?.name||"未知学员"}</h3>
        <p className="text-xs text-slate-500">{nzDate(v.scheduled_start)} — {nzDate(v.scheduled_end).split(" ").at(-1)}</p>
      </div><span className={"rounded-full px-2 py-1 text-xs font-semibold "+(
        v.status==="released"?"bg-emerald-100 text-emerald-800":
        v.status==="in_care"?"bg-amber-100 text-amber-800":"bg-slate-100 text-slate-600")}>
        {v.status==="released"?"已交接":v.status==="in_care"?"托管中":v.status==="scheduled"?"待入场":"取消"}</span></div>
      <div className="flex flex-wrap gap-2 text-xs">
       {gs.map(g=><a key={g.id} className="rounded-lg bg-blue-50 px-2 py-1 text-blue-700" href={"tel:"+g.phone}>
         📞 {g.full_name}{g.primary_contact?"（首联）":""} {g.phone}</a>)}
       {cs.map(g=><span key={g.id} className="rounded-lg bg-slate-100 px-2 py-1">{g.full_name}（紧急）</span>)}
      </div>
      {late&&<p className="text-xs font-semibold text-rose-600">已超出预定结束时间，请联系家长并记录处置</p>}
      {v.status==="released"&&<p className="text-xs text-emerald-700">Clock Out：{nzDate(v.check_out_at)} · {v.check_out_name} · 暂计超时费 NZ$ {Number(v.late_fee_nzd||0).toFixed(2)}</p>}
      <div className="flex flex-wrap gap-2">
        {v.status==="scheduled"&&<button onClick={()=>openClock(v,"in")} className={button}>Clock In 签到</button>}
        {v.status==="in_care"&&<button onClick={()=>openClock(v,"out")} className={button}>Clock Out 签退</button>}
        {v.status==="in_care"&&isAdmin&&cs.length>0&&<button onClick={()=>setEditing(editing===v.id?"":v.id)} className="rounded-lg border px-3 py-2 text-xs">第三方接送审批</button>}
      </div>
      {editing===v.id&&isAdmin&&<div className="space-y-3 rounded-lg bg-slate-50 p-3">
       <p className="font-semibold">第三方接送审批</p>
       <form onSubmit={doAction(approveThirdParty)} className="space-y-2">
        <input type="hidden" name="visit_id" value={v.id}/>
        <label className="block text-xs">申请接送人<select className={input} name="contact_id" required defaultValue=""><option value="">选择紧急联系人</option>{cs.map(x=><option key={x.id} value={x.id}>{x.full_name} · {x.phone}</option>)}</select></label>
        <label className="block text-xs">批准的家长<select className={input} name="guardian_id" required defaultValue=""><option value="">请选择授权家长</option>{gs.map(x=><option key={x.id} value={x.id}>{x.full_name}</option>)}</select></label>
        <label className="block text-xs">批准渠道<select className={input} name="channel"><option value="verified_call">核实号码后通话</option><option value="verified_message">核实号码后的消息确认</option><option value="in_person">家长现场确认</option></select></label>
        <textarea className={input} name="notes" rows={2} placeholder="记录授权内容、确认时间及核实方式" required/>
        <label className="flex gap-2 text-xs"><input type="checkbox" name="parent_verified" required/>已向档案中家长确认，明确批准该接送人</label>
        <label className="flex gap-2 text-xs"><input type="checkbox" name="child_checked" required/>已观察孩子反应，没有安全疑虑</label>
        <button disabled={pending} className={button}>保存批准记录</button>
       </form>
       {app&&<div className="space-y-2 border-t pt-3">
        <p className="text-xs">已有批准记录：{personById.get(app.contact_id)?.full_name} · {app.video_path?"已上传视频":"待上传视频"} · {app.parent_notified_at?"家长已通知":"待通知家长"}</p>
        {!app.video_path&&<form onSubmit={doAction(uploadThirdPartyVideo)} className="flex flex-wrap items-center gap-2">
         <input type="hidden" name="approval_id" value={app.id}/>
         <input type="file" name="video" accept="video/mp4,video/quicktime,video/webm" required className="max-w-52 text-xs"/>
         <button disabled={pending} className={button}>上传私密交接视频</button>
        </form>}
        {app.video_path&&!app.parent_notified_at&&<form onSubmit={doAction(markParentNotified)} className="space-y-2">
          <input type="hidden" name="approval_id" value={app.id}/>
          <p className="text-xs text-amber-700">视频不会自动发送，请通过受保护渠道联系已核实的家长，再记录通知。</p>
          <label className="flex items-center gap-2 text-xs"><input type="checkbox" name="confirmed" required/>我已直接向批准家长确认交接影像及接送安排</label>
          <button disabled={pending} className={button}>记录家长已通知</button>
        </form>}
       </div>}
      </div>}
     </div>;
   })}</div>}
  </section>
  {active&&(()=>{
    const visit=visits.find(v=>v.id===active);
    if(!visit)return null;
    const gs=guardians.filter(g=>g.student_id===visit.student_id&&g.pickup_authorized);
    const cs=contacts.filter(g=>g.student_id===visit.student_id);
    const people=personType==="guardian"?gs:cs;
    const selected=people.find(x=>x.id===selectedPerson);
    return <section className={box}><div className="flex items-center justify-between">
      <h2 className="text-lg font-bold">{direction==="in"?"到场签到":"离场签退"} · {studentById.get(visit.student_id)?.name}</h2>
      <button className="text-sm text-slate-500" onClick={()=>setActive("")}>关闭 ×</button></div>
      <form onSubmit={doAction(clockCare)} className="mt-3 space-y-3">
        <input type="hidden" name="visit_id" value={visit.id}/><input type="hidden" name="direction" value={direction}/>
        {direction==="out"&&<label className="block text-xs font-semibold">接送人类型
         <select className={input} value={personType} name="person_type" onChange={e=>{setPersonType(e.target.value);setSelectedPerson("");}}>
           <option value="guardian">登记家长</option><option value="contact">第三方联系人（需先审批）</option>
         </select></label>}
        {direction==="in"&&<input type="hidden" name="person_type" value="guardian"/>}
        <label className="block text-xs font-semibold">现场签字人
          <select className={input} name="person_id" required value={selectedPerson}
           onChange={e=>setSelectedPerson(e.target.value)}>
            <option value="">请选择登记人员</option>{people.map(x=><option key={x.id} value={x.id}>{x.full_name}</option>)}
          </select></label>
        <label className="block text-xs font-semibold">签署姓名（必须匹配人员档案）
          <input className={input} name="signed_name" autoComplete="off" required placeholder={selected?.full_name||"请由签字人填写全名"}/></label>
        <SignaturePad key={active+direction+personType} name="signature" label="家长 / 接送人签名"/>
        <label className="block space-y-1 text-xs font-semibold">现场负责人姓名
          <input required name="staff_name" className={input} placeholder="工作人员本人姓名"/>
        </label>
        <SignaturePad key={active+direction+"staff"} name="staff_signature" label="负责人现场手写签名"/>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="identity_checked" required/>教务已实际核实此人身份、接送权限和孩子反应</label>
        <button disabled={pending} className={button}>{pending?"正在保存…":"确认 "+(direction==="in"?"Clock In":"Clock Out")}</button>
      </form>
    </section>;
  })()}
  {pendingProfiles.length>0&&<section className={box}><h2 className="mb-3 text-lg font-bold">待补家长签名 / 人工审核</h2>
    <p className="mb-3 text-xs text-amber-700">未完成两位家长签字的档案目前不能生成有效的孩子交接记录。</p>
    {pendingProfiles.map(p=><div key={p.student_id} className="mb-3 rounded-lg border border-amber-200 p-3">
      <p className="mb-2 font-semibold">{studentById.get(p.student_id)?.name} · {p.missing_guardian_reason||"待审核"}</p>
      {isAdmin&&<form onSubmit={doAction(addSecondGuardian)} className="grid gap-2 sm:grid-cols-2">
       <input type="hidden" name="student_id" value={p.student_id}/>
       <input className={input} name="full_name" placeholder="第二家长全名" required/>
       <select className={input} name="relationship"><option value="father">父亲</option><option value="mother">母亲</option><option value="guardian">法定监护人</option><option value="other">其他</option></select>
       <input className={input} name="phone" placeholder="电话" required/>
       <input className={input} name="email" placeholder="Email" type="email"/>
       <input className={input} name="signed_name" placeholder="本人签署全名" required/>
       <SignaturePad name="signature" label="第二家长补签"/>
       <button disabled={pending} className={button}>保存补签并激活档案</button>
      </form>}
    </div>)}
  </section>}

  <section className={box}>
    <h2 className="mb-3 text-lg font-bold">学生档案与托管天数</h2>
    {profiles.length===0?<p className="text-sm text-slate-500">暂无晚托档案，请先创建档案。</p>:
      <div className="grid gap-2 md:grid-cols-2">{profiles.map(p=>{
        const child=studentById.get(p.student_id),balance=balanceByChild.get(p.student_id);
        const next=upcoming.filter(v=>v.student_id===p.student_id);
        return <details className="rounded-lg border border-slate-200 p-3" key={p.student_id}>
          <summary className="flex cursor-pointer items-center justify-between gap-2">
            <span className="font-semibold">{child?.name||"学生"}</span>
            <span className="text-xs text-slate-600">剩余 {balance?.remaining_days??0} 天 · 已安排 {balance?.reserved_days??0} 天</span>
          </summary>
          <div className="mt-3 space-y-3 text-sm">
            <p className="text-xs text-slate-600">已使用 {balance?.used_days??0} 天 · 累计录入 {balance?.purchased_days??0} 天</p>
            <div className="flex flex-wrap gap-1">{next.slice(0,20).map(v=><span key={v.id} className="rounded bg-slate-100 px-2 py-1 text-xs">{v.care_date}</span>)}</div>
            {next.length===0&&<p className="text-xs text-slate-500">暂无未来的具体日期。</p>}
            {isAdmin&&<form onSubmit={doAction(addCareDayCredits)} className="flex flex-wrap items-end gap-2">
              <input type="hidden" name="student_id" value={p.student_id}/>
              <label className="text-xs">登记天数（可为负）
                <input className={input} name="days" type="number" min="-365" max="365" required placeholder="例如 10"/>
              </label>
              <label className="text-xs">备注<input className={input} name="note" placeholder="套餐 / 调整原因"/></label>
              <button className={button} disabled={pending}>记录天数</button>
            </form>}
          </div>
        </details>;
      })}</div>}
  </section>
  {isAdmin&&<section className={box}>
    <details>
      <summary className="cursor-pointer font-bold">＋ 安排具体日期</summary>
      <form onSubmit={doAction(createCareSchedule)} className="mt-3 space-y-3">
        <label className="block text-sm">晚托学生
          <select name="student_id" className={input} required defaultValue="">
            <option value="" disabled>选择已建档学生</option>
            {students.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}
          </select></label>
        <div className="grid gap-2 sm:grid-cols-2">
          <label className="text-sm">起始日期<input type="date" name="date_from" className={input} defaultValue={selectedDate} required/></label>
          <label className="text-sm">结束日期<input type="date" name="date_to" className={input} defaultValue={selectedDate} required/></label>
        </div>
        <div className="flex flex-wrap gap-3">{days.map((d,i)=>
          <label key={i} className="flex items-center gap-1 text-sm"><input type="checkbox" name={"weekday_"+i} defaultChecked/>周{d}</label>)}</div>
        <div className="grid grid-cols-2 gap-2">
          <label className="text-sm">开始时间<input type="time" name="start_time" defaultValue="15:30" required className={input}/></label>
          <label className="text-sm">结束时间<input type="time" name="end_time" defaultValue="17:30" required className={input}/></label>
        </div>
        <button type="submit" disabled={pending} className={button}>保存日期班次</button>
      </form>
    </details>
  </section>}
  <section className={box}>
    <details>
      <summary className="cursor-pointer text-lg font-bold">教师与课堂记录</summary>
      <div className="mt-3 space-y-4">
        <div className="flex flex-wrap gap-2">{teachers.map(t=><span key={t.id} className="rounded bg-slate-100 px-3 py-1 text-sm">{t.full_name}</span>)}</div>
        {isAdmin&&<details className="rounded-lg border p-3"><summary className="cursor-pointer text-sm font-semibold">＋ 登记老师</summary>
          <form onSubmit={doAction(createTeacher)} className="mt-3 grid gap-2 sm:grid-cols-2">
            <input type="hidden" name="scope" value="care"/>
            <input className={input} name="full_name" placeholder="姓名" required/>
            <input className={input} name="phone" placeholder="联系电话"/>
            <input className={input} name="email" placeholder="Email" type="email"/>
            <input className={input} name="subjects" placeholder="负责课程 / 专长"/>
            <input className={input} name="notes" placeholder="备注"/>
            <button type="submit" className={button} disabled={pending}>保存教师档案</button>
          </form>
        </details>}
        {visits.map(v=><details key={v.id} className="rounded-lg border p-3">
          <summary className="cursor-pointer font-semibold">{studentById.get(v.student_id)?.name||"学生"} · {selectedDate}</summary>
          <div className="mt-3 space-y-2">
            {lessonLogs.filter(x=>x.visit_id===v.id).map(x=><div key={x.id} className="rounded-lg bg-slate-50 p-2 text-sm">
              <p><strong>教师：</strong>{teachers.find(t=>t.id===x.teacher_id)?.full_name||"未指定"}</p>
              <p className="whitespace-pre-wrap"><strong>教师活动：</strong>{x.teacher_actions}</p>
              <p className="whitespace-pre-wrap"><strong>学生完成：</strong>{x.child_actions}</p>
              {x.observations&&<p className="whitespace-pre-wrap"><strong>备注：</strong>{x.observations}</p>}
            </div>)}
            <form onSubmit={doAction(addCareLessonLog)} className="space-y-2">
              <input type="hidden" name="visit_id" value={v.id}/>
              <select className={input} name="teacher_id" defaultValue="">
                <option value="">选择教师（可选）</option>
                {teachers.map(t=><option key={t.id} value={t.id}>{t.full_name}</option>)}
              </select>
              <textarea className={input} name="teacher_actions" rows={2} required placeholder="本节课教师讲解、组织和指导的内容"/>
              <textarea className={input} name="child_actions" rows={2} required placeholder="孩子参与、完成或练习的内容"/>
              <textarea className={input} name="observations" rows={2} placeholder="观察与跟进（选填）"/>
              <button type="submit" disabled={pending} className={button}>保存课堂记录</button>
            </form>
          </div>
        </details>)}
        {visits.length===0&&<p className="text-sm text-slate-500">选择有班次的日期后记录课堂情况。</p>}
      </div>
    </details>
  </section>
 </div>;
}
