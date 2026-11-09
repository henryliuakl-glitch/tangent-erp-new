import Link from "next/link";
import {createClient} from "@/lib/supabase/server";
import {addCalendarDaysInNZ,getTodayInNZ,nzLocalToUtc,utcToNzDateStr,utcToNzTimeStr} from "@/lib/timezone";
import {TeachingRecordEditor,type LessonTarget,type SavedLesson} from "./record-editor";
import {readTeacherNotes,readStudentRatings} from "@/lib/teaching-record-format";

type Row=Record<string,any>;
const panel="erp-surface p-3 md:p-4";
type Scope="cus"|"astra";
type Props={scope:Scope;editable:boolean;owner:boolean;selectedDate?:string};
type LessonRow={id:string;student_id:string;starts_at:string;subject:string|null;teacher:string|null;student_name:string;student_code:string|null};

function distanceFromDay(date:string,today:string){
  const t=Date.parse(date+"T12:00:00Z"),n=Date.parse(today+"T12:00:00Z");
  return Math.abs(t-n);
}
function sortClosest(a:{date:string;value:string},b:{date:string;value:string},preferred:string){
  const da=distanceFromDay(a.date,preferred),db=distanceFromDay(b.date,preferred);
  if(da!==db)return da-db;
  // After the same-day group, prefer upcoming over older lessons.
  const fa=a.date>=preferred,fb=b.date>=preferred;
  if(fa!==fb)return fa?-1:1;
  return a.value.localeCompare(b.value);
}

export async function TeachingRecords({scope,editable,owner,selectedDate}:Props){
 const db=await createClient();
 const today=getTodayInNZ(),focus=selectedDate||today;
 const past=nzLocalToUtc(addCalendarDaysInNZ(focus,-90),"00:00").toISOString();
 const future=nzLocalToUtc(addCalendarDaysInNZ(focus,60),"23:59").toISOString();
 let oneToOne:LessonRow[]=[];
 let classSessions:Row[]=[];
 let errorMessage="";
 if(scope==="astra"){
   // SECURITY DEFINER RPC returns only date/name/subject for approved Astra bookings.
   // It does not grant teachers SELECT on private Students or Bookings.
   const {data,error}=await db.rpc("astra_lesson_options",{p_start:past,p_end:future});
   if(error)errorMessage="Astra 教学记录尚未启用，请管理员执行新的教学权限 SQL。";
   else oneToOne=((data||[]) as Row[]).map(r=>({
     id:r.booking_id,student_id:r.student_id,starts_at:r.starts_at,
     subject:r.subject,teacher:r.teacher,student_name:r.student_name,
     student_code:r.student_code
   }));
 }else{
   // Owner-only: tenant ownership, not a historical student-code prefix, defines CuS lessons.
   const {data:bookings,error}=await db.from("bookings")
    .select("id,student_id,start_time,subject,teacher,status")
    .eq("business_unit_id","cus").gte("start_time",past).lte("start_time",future)
    .neq("status","cancelled").order("start_time",{ascending:false}).limit(350);
   if(error)errorMessage="课程读取失败，请刷新重试。";
   else {
     const rows=(bookings||[]) as Row[];
     const ids=[...new Set(rows.map(b=>b.student_id).filter(Boolean))];
     const {data:students,error:studentError}=ids.length
       ?await db.from("students").select("id,name,student_code,teacher,subject").eq("business_unit_id","cus").in("id",ids)
       :{data:[],error:null};
     if(studentError)errorMessage="学员资料读取失败。";
     else {
       const names=new Map(((students||[]) as Row[]).map(s=>[s.id,s]));
       oneToOne=rows.flatMap(b=>{
         const student=names.get(b.student_id);
         const code=String(student?.student_code||"").trim();
         return student?[{
           id:b.id,student_id:b.student_id,starts_at:b.start_time,
           subject:b.subject||student.subject||null,teacher:b.teacher||student.teacher||null,student_name:student.name,
           student_code:code
         }]:[];
       });
     }
   }
 }
 // Restrict class sessions through their programme's tenant, before limiting results.
 if(!errorMessage){
   const {data:programmes,error:programmeError}=await db.from("cus_programmes")
     .select("id").eq("business_unit_id",scope).limit(200);
   if(programmeError)errorMessage="课程项目读取失败。";
   else {
     const programmeIds=(programmes||[]).map(p=>p.id);
     const {data:classes,error:classError}=programmeIds.length
       ?await db.from("cus_classes").select("id").in("programme_id",programmeIds).limit(500)
       :{data:[],error:null};
     if(classError)errorMessage="班级读取失败。";
     else {
       const classIds=(classes||[]).map(c=>c.id);
       if(classIds.length){
         const {data:sessions,error:sessionError}=await db.from("cus_class_sessions")
           .select("id,class_id,starts_at,topic,status").in("class_id",classIds)
           .gte("starts_at",past).lte("starts_at",future).neq("status","cancelled")
           .order("starts_at",{ascending:false}).limit(80);
         if(sessionError)errorMessage="班课信息读取失败。";
         else classSessions=(sessions||[]) as Row[];
       }
     }
   }
 }
 if(errorMessage)return <section className={panel}><p className="text-sm text-amber-700">{errorMessage}</p></section>;

 const bookingIds=oneToOne.map(b=>b.id),sessionIds=classSessions.map(s=>s.id);
 const classIds=[...new Set(classSessions.map(s=>s.class_id))];
 const [bookingRecords,sessionRecords,classesResult]=await Promise.all([
   bookingIds.length?db.from("cus_teaching_records")
     .select("id,booking_id,class_session_id,student_id,teacher,lesson_content,homework,student_feedback,next_steps,created_at,updated_at,created_by")
     .in("booking_id",bookingIds).order("created_at",{ascending:false}).limit(150)
     :Promise.resolve({data:[],error:null}),
   sessionIds.length?db.from("cus_teaching_records")
     .select("id,booking_id,class_session_id,student_id,teacher,lesson_content,homework,student_feedback,next_steps,created_at,updated_at,created_by")
     .in("class_session_id",sessionIds).order("created_at",{ascending:false}).limit(100)
     :Promise.resolve({data:[],error:null}),
   classIds.length?db.from("cus_classes").select("id,title,teacher").in("id",classIds)
     :Promise.resolve({data:[],error:null})
 ]);
 if(bookingRecords.error||sessionRecords.error||classesResult.error)
   return <section className={panel}><p className="text-sm text-amber-700">教学记录暂不可用，请确认教学权限数据库已升级。</p></section>;
 const records=[...((bookingRecords.data||[]) as Row[]),...((sessionRecords.data||[]) as Row[])]
   .sort((a,b)=>String(b.created_at).localeCompare(String(a.created_at)));
 const classNames=new Map(((classesResult.data||[]) as Row[]).map(c=>[c.id,c.title]));
 const classTeachers=new Map(((classesResult.data||[]) as Row[]).map(c=>[c.id,c.teacher||null]));
 const labels=new Map<string,string>();
 const datedTargets:(LessonTarget & {date:string})[]=[];
 for(const b of oneToOne){
   const value="booking:"+b.id;
   const label=[utcToNzDateStr(b.starts_at),utcToNzTimeStr(b.starts_at),
     b.student_name,b.subject||""].filter(Boolean).join(" · ");
   datedTargets.push({value,label,date:utcToNzDateStr(b.starts_at),teacher:b.teacher});
   labels.set(value,label);
 }
 for(const s of classSessions){
   const value="session:"+s.id;
   const label=[utcToNzDateStr(s.starts_at),utcToNzTimeStr(s.starts_at),
     classNames.get(s.class_id)||"班课",s.topic||""].filter(Boolean).join(" · ");
   datedTargets.push({value,label,date:utcToNzDateStr(s.starts_at),teacher:classTeachers.get(s.class_id)||null});
   labels.set(value,label);
 }
 datedTargets.sort((a,b)=>sortClosest(a,b,focus));
 const targets:LessonTarget[]=datedTargets.map(({value,label,teacher})=>({value,label,teacher}));
 const saved:SavedLesson[]=records.map(r=>({
   id:r.id,target:r.booking_id?"booking:"+r.booking_id:"session:"+r.class_session_id,
   updated_at:r.updated_at,created_by:r.created_by,
   teacher:r.teacher||null,lesson_content:r.lesson_content,
   homework:r.homework||null,student_feedback:r.student_feedback||null,next_steps:r.next_steps||null
 }));
 const {data:staffList}=await db.from("cus_staff").select("full_name")
   .in("scope",scope==="astra"?["astra","care"]:["general"]).eq("active",true).limit(120);
 const {data:{user}}=await db.auth.getUser();
 const currentUserId=user?.id||"";
 const {data:membership}=scope==="astra"&&!owner&&user
   ?await db.from("erp_memberships").select("role").eq("user_id",user.id)
     .eq("business_unit_id","astra").maybeSingle()
   :{data:null};
 const isTeacher=membership?.role==="teacher";
 const {data:ownStaff}=isTeacher&&user?.email
   ?await db.from("cus_staff").select("full_name").eq("email",user.email)
     .in("scope",["astra","care"]).limit(1).maybeSingle()
   :{data:null};
 // A teacher may author notes only under their verified staff name or login email.
 const teacherOptions=isTeacher
   ?[...new Set([ownStaff?.full_name,user?.email].filter((v):v is string=>!!v))]
   :[...new Set(["Henry","Yvetta",...(staffList||[]).map(s=>s.full_name))];
 const displayed=records.filter(r=>r.created_at).slice(0,80);
 return <div className="space-y-2">
   <form action="/teaching" method="get" className="erp-surface flex w-fit flex-wrap items-center gap-2 px-3 py-2">
     <input type="hidden" name="view" value={scope}/>
     <label className="flex items-center gap-2 text-xs font-semibold text-slate-600">日期
       <input type="date" name="date" defaultValue={focus}
        className="h-9 rounded-xl border-0 bg-[#f7f8fc] px-2 text-xs"/>
     </label>
     <button className="h-9 rounded-xl bg-[#eeeefe] px-3 text-xs font-bold text-indigo-600">查看</button>
     <Link href={scope==="astra"?"/teaching?view=astra":"/teaching"}
       className="flex h-9 items-center rounded-xl px-3 text-xs font-semibold text-indigo-600">今天</Link>
   </form>
   {editable&&<TeachingRecordEditor
     key={scope+":"+focus} scope={scope} currentUserId={currentUserId}
     owner={owner} teacherOptions={teacherOptions}
     targets={targets} records={saved}/>}
   <section className={panel}>
     <h2 className="mb-3 font-semibold">已保存的教学记录</h2>
     {displayed.length===0?<p className="text-sm text-slate-500">暂无记录。</p>:
       <div className="space-y-2">{displayed.map(r=>{
         const value=r.booking_id?"booking:"+r.booking_id:"session:"+r.class_session_id;
         const title=labels.get(value)||"历史课次";
         const lesson=readTeacherNotes(r.lesson_content);
         const ratings=readStudentRatings(r.student_feedback);
         return <details key={r.id} className="group rounded-xl bg-[#f8f9ff] px-3 py-2.5 transition-colors hover:bg-[#f3f4ff]">
           <summary className="cursor-pointer list-none">
             <div className="flex items-center justify-between gap-3">
               <div className="min-w-0"><p className="truncate text-sm font-semibold">{title}</p>
                 <p className="mt-0.5 text-xs text-slate-500">{r.teacher||"未填写教师"} · {utcToNzDateStr(r.updated_at)}</p>
               </div><span className="text-xs text-indigo-600 group-open:hidden">展开</span>
             </div>
           </summary>
           <div className="mt-3 space-y-2 border-t border-slate-100 pt-3 text-sm">
             <p className="whitespace-pre-wrap"><strong>授课内容：</strong>{lesson.content}</p>
             <p className="whitespace-pre-wrap"><strong>课程评价：</strong>{lesson.evaluation}</p>
             <p className="whitespace-pre-wrap"><strong>下节计划：</strong>{r.next_steps||"无"}</p>
             <p><strong>掌握程度：</strong>{ratings.mastery}　<strong>课堂参与：</strong>{ratings.participation}　<strong>进步情况：</strong>{ratings.progress}</p>
             {ratings.legacy&&<p className="whitespace-pre-wrap"><strong>旧版学生记录：</strong>{ratings.legacy}</p>}
             <p><strong>作业：</strong>{r.homework==="未布置"?"未布置":r.homework?"已布置":"未布置"}</p>
             {r.homework&&r.homework!=="已布置"&&r.homework!=="未布置"&&<p className="whitespace-pre-wrap text-xs text-slate-500">原作业备注：{r.homework}</p>}
           </div>
         </details>;
       })}</div>}
   </section>
 </div>;
}
