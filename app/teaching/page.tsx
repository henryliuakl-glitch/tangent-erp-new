import Link from "next/link";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { Navbar } from "@/components/Navbar";
import { MobileDock } from "@/components/MobileDock";
import { utcToNzDateStr, utcToNzTimeStr, getTodayInNZ } from "@/lib/timezone";
import { createProgramme, createClass, enrolStudent, withdrawStudent, createSession, setAttendance } from "./actions";

type Row = Record<string, any>;
const input = "w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm";
const btn = "rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700";
const section = "rounded-xl border border-slate-200 bg-white p-4 shadow-sm";
function Submit({children}:{children:React.ReactNode}) {return <button type="submit" className={btn}>{children}</button>;}
function SelectField({name,items,placeholder}:{name:string;items:{id:string;label:string}[];placeholder:string}) {
  return <select required name={name} defaultValue="" className={input}><option value="" disabled>{placeholder}</option>
    {items.map(x=><option key={x.id} value={x.id}>{x.label}</option>)}</select>;
}
export default async function TeachingPage() {
  const db=await createClient();
  const {data:{user}}=await db.auth.getUser();
  if(!user) return <main className="p-8">请先 <Link className="text-indigo-600" href="/login">登录</Link>。</main>;
  const cookie=await cookies();
  const businessId=cookie.get("businessId")?.value || "cus";
  if(businessId !== "cus" && businessId !== "tangent") return <main className="p-8">请切换至 CuS 或 Tangent 业务查看教务。</main>;
  const membership=await db.from("erp_memberships").select("role").eq("user_id",user.id).eq("business_unit_id","cus").maybeSingle();
  if(membership.error || !membership.data) return <main className="mx-auto max-w-3xl p-8">
    <h1 className="text-xl font-bold">CuS 教务尚未启用</h1>
    <p className="mt-3 text-sm text-slate-600">请先在 ERP 的 Supabase 数据库执行 20261106_cus_teaching_management.sql，并为当前账户分配 CuS 成员权限。</p>
    <Link href="/" className="mt-4 inline-block text-indigo-600">返回首页</Link>
  </main>;
  const editable=["owner","admin","teacher"].includes(membership.data.role);
  const [programmesRes,classesRes,studentsRes,enrolmentsRes,sessionsRes,attendanceRes]=await Promise.all([
    db.from("cus_programmes").select("*").order("created_at",{ascending:false}),
    db.from("cus_classes").select("*").order("created_at",{ascending:false}),
    db.from("students").select("id,name,student_code").eq("business_unit_id","cus").order("name"),
    db.from("cus_enrolments").select("*").order("enrolled_at",{ascending:false}),
    db.from("cus_class_sessions").select("*").order("starts_at",{ascending:false}).limit(200),
    db.from("cus_attendance").select("*")
  ]);
  const err=[programmesRes,classesRes,studentsRes,enrolmentsRes,sessionsRes,attendanceRes].find(r=>r.error);
  if(err?.error) return <main className="p-8">读取教务数据失败：{err.error.message}</main>;
  const programmes=(programmesRes.data||[]) as Row[], classes=(classesRes.data||[]) as Row[];
  const students=(studentsRes.data||[]) as Row[], enrolments=(enrolmentsRes.data||[]) as Row[];
  const sessions=(sessionsRes.data||[]) as Row[],attendance=(attendanceRes.data||[]) as Row[];
  const studentById=new Map(students.map(s=>[s.id,s]));
  const programmeById=new Map(programmes.map(p=>[p.id,p]));
  const classById=new Map(classes.map(c=>[c.id,c]));
  const enrolledByClass=new Map<string,Row[]>();
  for(const e of enrolments.filter(x=>x.status==="active")) enrolledByClass.set(e.class_id,[...(enrolledByClass.get(e.class_id)||[]),e]);
  const attendanceByKey=new Map(attendance.map(a=>[a.session_id+":"+a.student_id,a]));
  return <div className="min-h-screen bg-slate-50 pb-24 text-slate-900 md:pb-10">
    <div className="hidden md:block"><Navbar/></div>
    <main className="mx-auto max-w-6xl space-y-5 px-3 py-5 md:px-6">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <div><h1 className="text-2xl font-bold">CuS 教务管理</h1>
          <p className="text-sm text-slate-500">课程项目 · 班级 · 报名 · 课次 · 出勤</p></div>
        <div className="flex items-center gap-2"><Link href="/afterschool" className="rounded-lg bg-indigo-600 px-3 py-2 text-sm font-semibold text-white">晚托接送管理</Link><span className="rounded-full bg-indigo-50 px-3 py-1 text-xs text-indigo-700">权限：{membership.data.role}</span></div>
      </header>
      <div className="grid gap-3 sm:grid-cols-3">
        {[["课程项目",programmes.length],["班级数量",classes.length],["有效报名",enrolments.filter(x=>x.status==="active").length]].map(([label,value])=>
          <div className={section} key={label}><p className="text-xs text-slate-500">{label}</p><p className="mt-1 text-2xl font-bold">{value}</p></div>)}
      </div>
      {editable && <div className="grid gap-4 lg:grid-cols-2">
        <section className={section}><h2 className="mb-3 font-semibold">1. 新增课程项目</h2>
          <form action={createProgramme} className="grid gap-2">
            <input className={input} name="title" required placeholder="例如：周六科学实验 / 晚托班"/>
            <select className={input} name="category" defaultValue="weekend"><option value="weekend">周末班</option><option value="after_school">晚托班</option><option value="tutoring">学科辅导</option><option value="holiday">假期班</option></select>
            <input className={input} name="description" placeholder="课程说明（选填）"/><div><Submit>创建项目</Submit></div>
          </form>
        </section>
        <section className={section}><h2 className="mb-3 font-semibold">2. 开设班级</h2>
          <form action={createClass} className="grid gap-2">
            <SelectField name="programme_id" placeholder="选择课程项目" items={programmes.map(p=>({id:p.id,label:p.title}))}/>
            <input className={input} name="title" placeholder="例如：2026 Term 4 周六 A 班" required/>
            <div className="grid grid-cols-3 gap-2"><input className={input} name="teacher" placeholder="教师"/><input className={input} name="room" placeholder="教室"/><input className={input} name="capacity" type="number" min="1" max="200" defaultValue="10" required/></div>
            <div className="grid grid-cols-2 gap-2"><label className="text-xs text-slate-500">开班日期<input className={input} type="date" name="start_date"/></label><label className="text-xs text-slate-500">结束日期<input className={input} type="date" name="end_date"/></label></div>
            <div><Submit>创建班级</Submit></div>
          </form>
        </section>
        <section className={section}><h2 className="mb-3 font-semibold">3. 学生报名</h2>
          <form action={enrolStudent} className="grid gap-2">
            <SelectField name="class_id" placeholder="选择班级" items={classes.filter(c=>c.status==="active").map(c=>({id:c.id,label:c.title+" ("+(enrolledByClass.get(c.id)||[]).length+"/"+c.capacity+")"}))}/>
            <SelectField name="student_id" placeholder="选择已有 CuS 学员" items={students.map(s=>({id:s.id,label:s.name+" "+(s.student_code||"")}))}/>
            <div><Submit>确认报名</Submit></div>
          </form>
        </section>
        <section className={section}><h2 className="mb-3 font-semibold">4. 添加课次</h2>
          <form action={createSession} className="grid gap-2">
            <SelectField name="class_id" placeholder="选择班级" items={classes.map(c=>({id:c.id,label:c.title}))}/>
            <div className="grid grid-cols-3 gap-2"><input aria-label="上课日期" className={input} type="date" name="date" defaultValue={getTodayInNZ()} required/><input aria-label="上课时间" className={input} type="time" name="start" defaultValue="15:30" required/><input aria-label="下课时间" className={input} type="time" name="end" defaultValue="17:30" required/></div>
            <div className="grid grid-cols-2 gap-2"><input className={input} name="room" placeholder="教室"/><input className={input} name="topic" placeholder="本节主题"/></div>
            <div><Submit>添加课次</Submit></div>
          </form>
        </section>
      </div>}
      <section className={section}><h2 className="mb-3 text-lg font-semibold">班级与报名</h2>
        {classes.length===0?<p className="text-sm text-slate-500">还没有班级，先创建课程项目和班级。</p>:
        <div className="grid gap-3 md:grid-cols-2">{classes.map(c=><div className="rounded-lg border border-slate-200 p-3" key={c.id}>
          <div className="flex justify-between gap-2"><div><p className="font-semibold">{c.title}</p><p className="text-xs text-slate-500">{programmeById.get(c.programme_id)?.title||"课程"} · {c.teacher||"未分配教师"} · {c.room||"未分配教室"}</p></div>
            <span className="text-xs text-slate-500">{(enrolledByClass.get(c.id)||[]).length}/{c.capacity}</span></div>
          <div className="mt-2 flex flex-wrap gap-2">{(enrolledByClass.get(c.id)||[]).map(e=><div key={e.id} className="flex items-center gap-1 rounded-md bg-slate-100 px-2 py-1 text-xs">{studentById.get(e.student_id)?.name||"未知学员"}{editable&&<form action={withdrawStudent}><input type="hidden" name="enrolment_id" value={e.id}/><button type="submit" title="退出班级" className="text-rose-600">×</button></form>}</div>)}</div>
        </div>)}</div>}
      </section>
      <section className={section}><h2 className="mb-3 text-lg font-semibold">最近课次与出勤</h2>
        {sessions.length===0?<p className="text-sm text-slate-500">暂无课次。</p>:
          <div className="space-y-4">{sessions.map(s=><div key={s.id} className="rounded-lg border border-slate-200 p-3">
            <div className="font-semibold">{classById.get(s.class_id)?.title||"班级"} · {utcToNzDateStr(s.starts_at)} {utcToNzTimeStr(s.starts_at)}–{utcToNzTimeStr(s.ends_at)}</div>
            <p className="mb-3 text-xs text-slate-500">{s.topic||"未填写主题"} · {s.room||"未设置教室"}</p>
            <div className="grid gap-2 md:grid-cols-2">{(enrolledByClass.get(s.class_id)||[]).map(e=>{
              const marked=attendanceByKey.get(s.id+":"+e.student_id);
              return <form key={e.id} action={setAttendance} className="flex flex-wrap items-center gap-2 rounded-md bg-slate-50 p-2 text-sm">
                <span className="min-w-16 font-medium">{studentById.get(e.student_id)?.name||"未知学员"}</span>
                <input type="hidden" name="session_id" value={s.id}/><input type="hidden" name="student_id" value={e.student_id}/>
                <select name="status" defaultValue={marked?.status||"present"} className="rounded border border-slate-200 p-1 text-xs">
                  <option value="present">出席</option><option value="late">迟到</option><option value="absent">缺席</option><option value="excused">请假</option>
                </select>{editable&&<button type="submit" className="rounded bg-indigo-50 px-2 py-1 text-xs text-indigo-700">保存</button>}
                {marked&&<span className="text-xs text-emerald-700">已记录</span>}
              </form>;
            })}</div>
          </div>)}</div>}
      </section>
    </main><MobileDock/>
  </div>;
}
