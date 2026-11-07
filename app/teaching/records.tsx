import Link from "next/link";
import {createClient} from "@/lib/supabase/server";
import {addCalendarDaysInNZ,getTodayInNZ,nzLocalToUtc,utcToNzDateStr,utcToNzTimeStr} from "@/lib/timezone";
import {TeachingRecordEditor, type LessonTarget, type SavedLesson} from "./record-editor";

type Row=Record<string,any>;
const panel="rounded-xl border border-slate-200 bg-white p-4";

export async function TeachingRecords({editable}:{editable:boolean}) {
  const db=await createClient();
  const today=getTodayInNZ();
  const past=nzLocalToUtc(addCalendarDaysInNZ(today,-90),"00:00").toISOString();
  const future=nzLocalToUtc(addCalendarDaysInNZ(today,45),"23:59").toISOString();
  // Bounded parallel queries: no unbounded bookings or class attendance are read here.
  const [bookingsResult,sessionsResult,recordsResult]=await Promise.all([
    db.from("bookings").select("id,student_id,start_time,subject,teacher,status")
      .eq("business_unit_id","cus").gte("start_time",past).lte("start_time",future)
      .order("start_time",{ascending:false}).limit(100),
    db.from("cus_class_sessions").select("id,class_id,starts_at,topic,status")
      .gte("starts_at",past).lte("starts_at",future).neq("status","cancelled")
      .order("starts_at",{ascending:false}).limit(80),
    db.from("cus_teaching_records")
      .select("id,booking_id,class_session_id,student_id,teacher,lesson_content,homework,student_feedback,next_steps,created_at,updated_at")
      .order("created_at",{ascending:false}).limit(50)
  ]);
  if(recordsResult.error) return <section className={panel}>
    <h2 className="font-semibold">教学记录尚未启用</h2>
    <p className="mt-2 text-sm text-slate-500">请管理员安装教学记录数据库更新。</p>
  </section>;
  const failed=[bookingsResult,sessionsResult].find(x=>x.error);
  if(failed?.error)return <section className={panel}><p className="text-sm text-rose-600">课程信息读取失败，请刷新重试。</p></section>;
  const bookings=(bookingsResult.data||[]) as Row[];
  const sessions=(sessionsResult.data||[]) as Row[];
  const records=(recordsResult.data||[]) as Row[];
  const studentIds=[...new Set([...bookings.map(b=>b.student_id),...records.map(r=>r.student_id)].filter(Boolean))];
  const classIds=[...new Set(sessions.map(s=>s.class_id).filter(Boolean))];
  const [studentsResult,classesResult]=await Promise.all([
    studentIds.length?db.from("students").select("id,name").eq("business_unit_id","cus").in("id",studentIds):
      Promise.resolve({data:[],error:null}),
    classIds.length?db.from("cus_classes").select("id,title").in("id",classIds):
      Promise.resolve({data:[],error:null})
  ]);
  if(studentsResult.error||classesResult.error) return <section className={panel}>课程关联信息读取失败。</section>;
  const studentNames=new Map(((studentsResult.data||[]) as Row[]).map(s=>[s.id,s.name as string]));
  const classNames=new Map(((classesResult.data||[]) as Row[]).map(c=>[c.id,c.title as string]));
  const labels=new Map<string,string>();
  const targets:LessonTarget[]=[];
  for(const b of bookings) {
    const value="booking:"+b.id;
    const label=[utcToNzDateStr(b.start_time),utcToNzTimeStr(b.start_time),
      studentNames.get(b.student_id)||"一对一",b.subject||""].filter(Boolean).join(" · ");
    targets.push({value,label});labels.set(value,label);
  }
  for(const s of sessions) {
    const value="session:"+s.id;
    const label=[utcToNzDateStr(s.starts_at),utcToNzTimeStr(s.starts_at),
      classNames.get(s.class_id)||"班课",s.topic||""].filter(Boolean).join(" · ");
    targets.push({value,label});labels.set(value,label);
  }
  const saved:SavedLesson[]=records.map(r=>({
    id:r.id,target:r.booking_id?"booking:"+r.booking_id:"session:"+r.class_session_id,
    updated_at:r.updated_at,
    teacher:r.teacher||null,lesson_content:r.lesson_content,
    homework:r.homework||null,student_feedback:r.student_feedback||null,next_steps:r.next_steps||null
  }));
  return <div className="space-y-4">
    {editable&&<TeachingRecordEditor targets={targets} records={saved}/>}
    <section className={panel}>
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="font-semibold">最近教学记录</h2>
        <Link href="/bookings" className="text-xs text-indigo-600">查看排课</Link>
      </div>
      {records.length===0?<p className="text-sm text-slate-500">暂无教学记录。</p>:
       <div className="space-y-2">{records.map(r=>{
         const target=r.booking_id?"booking:"+r.booking_id:"session:"+r.class_session_id;
         const title=labels.get(target)||((r.student_id?studentNames.get(r.student_id):"班课")||"历史课程");
         return <details key={r.id} className="group rounded-lg border border-slate-200 px-3 py-2">
           <summary className="cursor-pointer list-none">
             <div className="flex items-center justify-between gap-3">
               <div className="min-w-0"><p className="truncate text-sm font-semibold">{title}</p>
                 <p className="mt-0.5 truncate text-xs text-slate-500">{r.teacher||"未填教师"} · {utcToNzDateStr(r.updated_at)}</p></div>
               <span className="shrink-0 text-xs text-indigo-600 group-open:hidden">展开</span>
             </div>
           </summary>
           <div className="mt-3 space-y-2 border-t border-slate-100 pt-3 text-sm">
             <p className="whitespace-pre-wrap"><strong>教师做了什么：</strong>{r.lesson_content}</p>
             {r.homework&&<p className="whitespace-pre-wrap"><strong>作业：</strong>{r.homework}</p>}
             {r.student_feedback&&<p className="whitespace-pre-wrap"><strong>学生做了什么：</strong>{r.student_feedback}</p>}
             {r.next_steps&&<p className="whitespace-pre-wrap"><strong>下节计划：</strong>{r.next_steps}</p>}
           </div>
         </details>;
       })}</div>}
    </section>
  </div>;
}
