import {createClient} from "@/lib/supabase/server";
import {getTodayInNZ,utcToNzDateStr,utcToNzTimeStr} from "@/lib/timezone";
import {createProgramme,createClass,enrolStudent,withdrawStudent,createSession,setAttendance} from "./actions";

type Row=Record<string,any>;
const input="erp-field w-full px-3 py-2.5 text-sm";
const btn="rounded-lg bg-indigo-600 px-3 py-2 text-sm font-semibold text-white hover:bg-indigo-700";
const panel="erp-surface p-3 md:p-4";
function SelectField({name,items,placeholder}:{name:string;items:{id:string;label:string}[];placeholder:string}){
  return <select required name={name} defaultValue="" className={input}>
    <option value="" disabled>{placeholder}</option>
    {items.map(x=><option key={x.id} value={x.id}>{x.label}</option>)}
  </select>;
}
function Submit({children}:{children:React.ReactNode}){return <button className={btn} type="submit">{children}</button>;}
function Editor({title,children}:{title:string;children:React.ReactNode}){
  return <details className="erp-surface p-3">
    <summary className="cursor-pointer text-sm font-semibold">{title}</summary>
    <div className="mt-3">{children}</div>
  </details>;
}

export async function TeachingClasses({editable,businessId="cus"}:{editable:boolean;businessId?:"cus"|"astra"}){
  const db=await createClient();
  const [pr,cl,st,se]=await Promise.all([
    db.from("cus_programmes").select("id,title,category").eq("business_unit_id",businessId).order("created_at",{ascending:false}).limit(100),
    db.from("cus_classes").select("id,title,programme_id,teacher,room,capacity,status")
      .order("created_at",{ascending:false}).limit(120),
    db.from("students").select("id,name,student_code").eq("business_unit_id",businessId)
      .order("name").limit(500),
    db.from("cus_class_sessions").select("id,class_id,starts_at,ends_at,topic,room,status")
      .order("starts_at",{ascending:false}).limit(35)
  ]);
  const err=[pr,cl,st,se].find(x=>x.error);
  if(err?.error) return <section className={panel}>班级信息读取失败，请刷新页面。</section>;
  const programmes=(pr.data||[]) as Row[];
  const scopedIds=new Set(programmes.map(p=>p.id));
  const classes=((cl.data||[]) as Row[]).filter(c=>scopedIds.has(c.programme_id));
  const students=(st.data||[]) as Row[];
  const scopedClassIds=new Set(classes.map(c=>c.id));
  const sessions=((se.data||[]) as Row[]).filter(s=>scopedClassIds.has(s.class_id));
  const classIds=classes.map(x=>x.id),sessionIds=sessions.map(x=>x.id);
  const [en,att]=await Promise.all([
    classIds.length?db.from("cus_enrolments").select("id,class_id,student_id,status")
      .in("class_id",classIds).eq("status","active"):Promise.resolve({data:[],error:null}),
    sessionIds.length?db.from("cus_attendance").select("session_id,student_id,status")
      .in("session_id",sessionIds):Promise.resolve({data:[],error:null})
  ]);
  if(en.error||att.error) return <section className={panel}>报名或出勤信息读取失败。</section>;
  const enrolments=(en.data||[]) as Row[],attendance=(att.data||[]) as Row[];
  const studentNames=new Map(students.map(s=>[s.id,s.name]));
  const programmeNames=new Map(programmes.map(p=>[p.id,p.title]));
  const classNames=new Map(classes.map(c=>[c.id,c.title]));
  const byClass=new Map<string,Row[]>();
  for(const e of enrolments)byClass.set(e.class_id,[...(byClass.get(e.class_id)||[]),e]);
  const attendanceByKey=new Map(attendance.map(a=>[a.session_id+":"+a.student_id,a]));
  return <div className="space-y-2">
    {editable&&<div className="grid items-start gap-2 sm:grid-cols-2">
      <div className="min-w-0 space-y-2">
        <Editor title="课程项目"><form action={createProgramme} className="space-y-2"><input type="hidden" name="businessId" value={businessId}/>
        <input required name="title" className={input} placeholder="课程名称"/>
        <select name="category" className={input} defaultValue="weekend">
          <option value="weekend">周末班</option><option value="tutoring">学科辅导</option>
          <option value="holiday">假期班</option><option value="after_school">其他班课</option></select>
        <input name="description" className={input} placeholder="备注（选填）"/>
        <Submit>创建课程</Submit>
      </form></Editor>
        <Editor title="学员入班"><form action={enrolStudent} className="space-y-2"><input type="hidden" name="businessId" value={businessId}/>
        <SelectField name="class_id" placeholder="选择班级" items={classes.filter(c=>c.status==="active").map(c=>({
          id:c.id,label:c.title+" ("+(byClass.get(c.id)||[]).length+"/"+c.capacity+")"
        }))}/>
        <SelectField name="student_id" placeholder="选择学员" items={students.map(s=>({id:s.id,label:s.name+" "+(s.student_code||"")}))}/>
        <Submit>确认入班</Submit>
      </form></Editor>
      </div>
      <div className="min-w-0 space-y-2">
        <Editor title="开设班级"><form action={createClass} className="space-y-2"><input type="hidden" name="businessId" value={businessId}/>
        <SelectField name="programme_id" placeholder="选择课程项目" items={programmes.map(p=>({id:p.id,label:p.title}))}/>
        <input required name="title" className={input} placeholder="班级名称"/>
        <div className="grid grid-cols-3 gap-2">
          <input name="teacher" className={input} placeholder="教师"/>
          <input name="room" className={input} placeholder="教室"/>
          <input name="capacity" className={input} type="number" min="1" max="200" required defaultValue="10" aria-label="人数上限"/>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <label className="text-xs">开始日期<input name="start_date" type="date" className={input}/></label>
          <label className="text-xs">结束日期<input name="end_date" type="date" className={input}/></label>
        </div><Submit>创建班级</Submit>
      </form></Editor>
        <Editor title="添加课次"><form action={createSession} className="space-y-2"><input type="hidden" name="businessId" value={businessId}/>
        <SelectField name="class_id" placeholder="选择班级" items={classes.map(c=>({id:c.id,label:c.title}))}/>
        <div className="grid grid-cols-3 gap-2">
          <input name="date" aria-label="日期" type="date" className={input} defaultValue={getTodayInNZ()} required/>
          <input name="start" aria-label="开始" type="time" className={input} defaultValue="10:00" required/>
          <input name="end" aria-label="结束" type="time" className={input} defaultValue="11:00" required/>
        </div>
        <div className="grid grid-cols-2 gap-2"><input name="room" className={input} placeholder="教室"/>
          <input name="topic" className={input} placeholder="课次主题"/></div>
        <Submit>添加课次</Submit>
      </form></Editor>
      </div>
    </div>}
    <section className={panel}>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-semibold">班级</h2>
        <span className="text-xs text-slate-500">{classes.length} 个班级</span>
      </div>
      {classes.length===0?<p className="text-sm text-slate-500">尚无班级。</p>:
      <div className="grid gap-2 md:grid-cols-2">{classes.map(c=><details key={c.id} className="rounded-xl bg-[#f8f9ff] p-3 hover:bg-[#f3f4ff]">
        <summary className="cursor-pointer list-none">
          <div className="flex items-start justify-between gap-2">
            <div><p className="font-semibold">{c.title}</p><p className="mt-1 text-xs text-slate-500">
              {programmeNames.get(c.programme_id)||"课程"} · {c.teacher||"未分配教师"} · {c.room||"未分配教室"}
            </p></div><span className="text-xs text-slate-500">{(byClass.get(c.id)||[]).length}/{c.capacity}</span>
          </div>
        </summary>
        <div className="mt-3 flex flex-wrap gap-2">{(byClass.get(c.id)||[]).map(e=><div key={e.id}
          className="flex items-center gap-1 rounded-md bg-slate-100 px-2 py-1 text-xs">
          {studentNames.get(e.student_id)||"学员"}
          {editable&&<form action={withdrawStudent}><input type="hidden" name="businessId" value={businessId}/><input type="hidden" name="enrolment_id" value={e.id}/>
            <button type="submit" aria-label="移出班级" title="移出班级" className="text-rose-600">×</button></form>}
        </div>)}
        {(byClass.get(c.id)||[]).length===0&&<p className="text-xs text-slate-500">暂无学员。</p>}
        </div>
      </details>)}</div>}
    </section>
    <section className={panel}><h2 className="mb-3 font-semibold">近期课次与出勤</h2>
      {sessions.length===0?<p className="text-sm text-slate-500">暂无班课课次。</p>:
       <div className="space-y-2">{sessions.map(s=><details key={s.id} className="rounded-xl bg-[#f8f9ff] p-3">
         <summary className="cursor-pointer text-sm font-semibold">
           {utcToNzDateStr(s.starts_at)} {utcToNzTimeStr(s.starts_at)} · {classNames.get(s.class_id)||"班课"}
         </summary>
         <div className="mt-3 grid gap-2 border-t pt-3 sm:grid-cols-2">
           {(byClass.get(s.class_id)||[]).map(e=>{
             const marked=attendanceByKey.get(s.id+":"+e.student_id);
             return <form action={setAttendance} key={e.id}
               className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-slate-50 p-2 text-sm">
               <span>{studentNames.get(e.student_id)||"学员"}</span>
               <input type="hidden" name="businessId" value={businessId}/><input type="hidden" name="session_id" value={s.id}/>
               <input type="hidden" name="student_id" value={e.student_id}/>
               {editable?<div className="flex gap-2"><select name="status" defaultValue={marked?.status||"present"}
                 className="rounded border border-slate-200 bg-white p-1 text-xs">
                 <option value="present">出席</option><option value="late">迟到</option>
                 <option value="absent">缺席</option><option value="excused">请假</option>
               </select><button className="rounded bg-indigo-50 px-2 py-1 text-xs text-indigo-700">保存</button></div>
                 :<span className="text-xs text-slate-500">{marked?.status||"未点名"}</span>}
             </form>;
           })}
           {(byClass.get(s.class_id)||[]).length===0&&<p className="text-sm text-slate-500">本班暂无学员。</p>}
         </div>
       </details>)}</div>}
    </section>
  </div>;
}
