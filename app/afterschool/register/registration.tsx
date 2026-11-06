"use client";
import {useState,useTransition} from "react";
import Link from "next/link";
import {useRouter} from "next/navigation";
import {SignaturePad} from "../signature-pad";
import {registerCareChild} from "../actions";

type Student={id:string;name:string};
const input="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm";
const section="rounded-xl border border-slate-200 bg-white p-4 shadow-sm space-y-3";
const lbl="block space-y-1 text-xs font-semibold text-slate-700";
function Field({name,label,type="text",required=false,placeholder}:{name:string;label:string;type?:string;required?:boolean;placeholder?:string}) {
  return <label className={lbl}>{label}<input type={type} name={name} required={required} placeholder={placeholder} className={input}/></label>;
}
export function CareRegistration({students}:{students:Student[]}){
 const router=useRouter(),[pending,start]=useTransition();
 const [missing,setMissing]=useState(false),[result,setResult]=useState("");
 const [existing,setExisting]=useState("");
 const onSubmit=(e:React.FormEvent<HTMLFormElement>)=>{
   e.preventDefault();const data=new FormData(e.currentTarget);setResult("");
   start(async()=>{try{const r=await registerCareChild(data);router.push("/afterschool?created="+r.status);router.refresh();}
     catch(err){setResult(err instanceof Error?err.message:"提交失败，请重新核对");}});
 };
 return <form onSubmit={onSubmit} className="mx-auto max-w-4xl space-y-4">
  <header className="flex items-center justify-between"><div><h1 className="text-2xl font-bold">晚托班 · 新学生报名</h1>
  <p className="text-sm text-slate-500">学生资料 → 每周班次 → 两位家长签名 → 紧急联系人</p></div>
  <Link className="text-sm text-indigo-600" href="/afterschool">返回接送工作台</Link></header>
  <section className={section}><h2 className="text-lg font-bold">1. 孩子信息</h2>
    <label className={lbl}>关联已有 CuS 学员（可选）
      <select name="student_id" className={input} value={existing} onChange={e=>setExisting(e.target.value)}>
        <option value="">新学生：创建学员档案</option>
        {students.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}
      </select></label>
    <div className="grid gap-3 sm:grid-cols-2">
      <Field name="child_name" label="孩子姓名" required/>
      <Field name="date_of_birth" type="date" label="出生日期"/>
      <Field name="school" label="学校"/>
      <Field name="year_level" label="年级"/>
      <Field name="allergies" label="过敏信息（无则填无）" placeholder="食品 / 药物过敏"/>
      <Field name="medical_notes" label="健康与用药注意事项"/>
    </div>
  </section>
  <section className={section}><h2 className="text-lg font-bold">2. 每周托管班次</h2>
    <p className="text-xs text-slate-500">可选多天，每天按同一开始与结束时间安排；之后可由教务调整。</p>
    <div className="flex flex-wrap gap-4">{["周一","周二","周三","周四","周五"].map((d,i)=>
      <label key={d} className="flex items-center gap-2 text-sm"><input type="checkbox" name={"weekday_"+(i+1)} defaultChecked={i===0}/>{d}</label>)}</div>
    <div className="grid gap-3 sm:grid-cols-2">
      <Field name="start_time" type="time" label="开始时间" required/>
      <Field name="end_time" type="time" label="结束时间" required/>
    </div><p className="text-xs text-amber-700">请确保开始/结束时间与晚托实际经营安排一致。</p>
  </section>
  <section className={section}><h2 className="text-lg font-bold">3. 家长 / 法定监护人档案</h2>
    <p className="text-sm text-slate-600">两位家长分别签名；有无法联系、监护限制或其他特殊情况时，应先标记待审核，不自动视为放弃安全核验。</p>
    <div className="grid gap-3 sm:grid-cols-2">
      <Field name="guardian_1_name" label="家长 1 全名" required/>
      <label className={lbl}>身份<select name="guardian_1_relation" className={input}>
        <option value="mother">母亲</option><option value="father">父亲</option><option value="guardian">其他法定监护人</option><option value="other">其他</option></select></label>
      <Field name="guardian_1_phone" label="家长 1 电话" type="tel" required/>
      <Field name="guardian_1_email" label="家长 1 Email" type="email"/>
      <Field name="guardian_1_signed_name" label="家长 1 本人签署姓名（须匹配全名）" required/>
      <SignaturePad name="guardian_1_signature" label="家长 1 手写签名"/>
    </div>
    <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={missing} onChange={e=>setMissing(e.target.checked)}/>第二位家长暂时无法签署／存在特殊情况</label>
    {!missing?<div className="grid gap-3 border-t border-slate-200 pt-3 sm:grid-cols-2">
      <Field name="guardian_2_name" label="家长 2 全名" required/>
      <label className={lbl}>身份<select name="guardian_2_relation" className={input}>
        <option value="father">父亲</option><option value="mother">母亲</option><option value="guardian">其他法定监护人</option><option value="other">其他</option></select></label>
      <Field name="guardian_2_phone" label="家长 2 电话" type="tel" required/>
      <Field name="guardian_2_email" label="家长 2 Email" type="email"/>
      <Field name="guardian_2_signed_name" label="家长 2 本人签署姓名（须匹配全名）" required/>
      <SignaturePad name="guardian_2_signature" label="家长 2 手写签名"/>
    </div>:<label className={lbl}>特殊情况说明（该学员将保持待审核，不允许接送打卡）
      <textarea required name="missing_guardian_reason" className={input} rows={3}
        placeholder="例如单亲/监护安排限制；详细敏感情况只记录必要内容"/></label>}
    <label className={lbl}>主要联系家长
      <select name="primary_contact" className={input}>
        <option value="1">家长 1</option>{!missing&&<option value="2">家长 2</option>}
      </select></label>
    <label className={lbl}>特别监护或接送限制说明
      <textarea name="parental_arrangement_notes" className={input} rows={2} placeholder="有法院命令或监护权限制时，由管理员核对有关证明后记录"/></label>
  </section>
  <section className={section}><h2 className="text-lg font-bold">4. 额外紧急联系人</h2>
    <p className="text-xs text-slate-500">第三人默认为紧急联系人，不会自动获得接走孩子的权限。</p>
    <div className="grid gap-3 sm:grid-cols-3">
      <Field name="emergency_name" label="姓名" required/>
      <Field name="emergency_phone" label="电话" type="tel" required/>
      <Field name="emergency_relation" label="与孩子的关系"/>
    </div>
  </section>
  <section className={section}><h2 className="text-lg font-bold">5. 接送、费用与隐私确认</h2>
    <p className="text-sm text-slate-600">正常接送需现场签字并核对身份。第三方接送须获得档案中家长额外确认；未获确认不得放行。迟接初步收费规则：超时不足或等于 60 分钟收 NZ$20，超过 60 分钟后额外每开始一小时收 NZ$10（最终以机构签署条款为准）。</p>
    <p className="text-sm text-slate-600">签名、接送时间、审批、交接影像仅用于安全管理和纠纷处理。录像需单独征得知情同意，并通过受保护渠道分享；具体隐私声明、保存期限和退款条款在正式招生前还须审核。</p>
    <label className="flex items-start gap-2 text-sm"><input type="checkbox" name="image_consent" className="mt-1"/>同意在必要的第三方接送核验中按隐私告知采集交接视频（不同意时仅允许正常监护人接送，特殊情况须人工另行处理）</label>
    <label className="flex items-start gap-2 text-sm"><input type="checkbox" name="terms_accepted" required className="mt-1"/>确认已阅读上述临时接送、收费及隐私告知，并同意建立孩子的托管档案</label>
  </section>
  {result&&<p role="alert" className="rounded-lg bg-rose-50 p-3 text-sm text-rose-700">{result}</p>}
  <button type="submit" disabled={pending} className="w-full rounded-xl bg-indigo-600 p-3 font-semibold text-white disabled:opacity-50">{pending?"正在保存…":"确认报名并建立档案"}</button>
 </form>;
}
