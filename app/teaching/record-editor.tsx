"use client";

import {useState,useTransition} from "react";
import {useRouter} from "next/navigation";
import {saveTeachingRecord} from "./actions";
import {
 MASTERY_OPTIONS,PARTICIPATION_OPTIONS,PROGRESS_OPTIONS,HOMEWORK_OPTIONS,
 normalizeTutor,readTeacherNotes,readStudentRatings
} from "@/lib/teaching-record-format";

export type LessonTarget={value:string;label:string;teacher?:string|null};
export type SavedLesson={
 id:string;target:string;updated_at:string;created_by:string;teacher:string|null;lesson_content:string;
 homework:string|null;student_feedback:string|null;next_steps:string|null;
};
const field="erp-soft-control h-10 w-full min-w-0 rounded-xl px-3 text-sm text-[#343a54] outline-none focus:ring-2 focus:ring-[#adb4ef]";
const area="erp-soft-control min-h-[86px] w-full min-w-0 resize-y rounded-xl px-3 py-2.5 text-sm text-[#343a54] outline-none focus:ring-2 focus:ring-[#adb4ef]";
const label="block min-w-0 space-y-1.5 text-xs font-semibold text-[#4a516e]";
const selectChoices=(items:readonly string[])=>
 items.map(value=><option key={value} value={value}>{value}</option>);
export function TeachingRecordEditor({
 targets,records,scope,currentUserId,owner
}:{targets:LessonTarget[];records:SavedLesson[];scope:"cus"|"astra";currentUserId:string;owner:boolean}){
 const router=useRouter();
 const [target,setTarget]=useState(targets[0]?.value||"");
 const [pending,start]=useTransition();
 const [feedback,setFeedback]=useState("");
 const current=records.find(r=>r.target===target);
 const chosen=targets.find(t=>t.value===target);
 const teacher=normalizeTutor(current?.teacher)||normalizeTutor(chosen?.teacher);
 const notes=readTeacherNotes(current?.lesson_content);
 const ratings=readStudentRatings(current?.student_feedback);
 const homework=current?.homework==="未布置"?"未布置":current?.homework?"已布置":"未布置";
 const canEdit=!current||owner||current.created_by===currentUserId;
 function submit(event:React.FormEvent<HTMLFormElement>){
  event.preventDefault();
  const form=new FormData(event.currentTarget);
  setFeedback("");
  start(async()=>{
   try{
    const result=await saveTeachingRecord(form);
    if(!result.ok){setFeedback(result.error);return;}
    setFeedback("已保存");
    router.refresh();
   }catch{setFeedback("网络异常，请稍后再试");}
  });
 }
 if(targets.length===0)return <section className="erp-surface p-4 text-xs text-slate-500">暂无可记录课程，请先安排课程。</section>;
 return <section className="erp-surface p-4 md:p-5">
  <h2 className="mb-4 text-sm font-extrabold text-[#282b4a]">填写教学记录</h2>
  <form key={target} onSubmit={submit} className="space-y-4">
   <input type="hidden" name="scope" value={scope}/>
   <input type="hidden" name="record_id" value={current?.id||""}/>
   <input type="hidden" name="record_version" value={current?.updated_at||""}/>
   <div className="grid min-w-0 gap-3 lg:grid-cols-[minmax(0,2fr)_minmax(190px,1fr)]">
    <label className={label}>课程
     <select name="target" className={field} value={target} required onChange={e=>{setTarget(e.target.value);setFeedback("");}}>
      {targets.map(t=><option key={t.value} value={t.value}>{t.label}</option>)}
     </select>
    </label>
    <label className={label}>授课教师
     <select name="teacher" key={target+":teacher"} className={field} defaultValue={teacher} required>
      <option value="" disabled>请选择教师</option>
      <option value="Henry">Henry</option><option value="Yvetta">Yvetta</option>
     </select>
    </label>
   </div>
   <div className="border-t border-[#f0f1f7] pt-3">
    <h3 className="mb-2 text-[13px] font-extrabold text-[#3b4267]">教师记录</h3>
    <div className="grid min-w-0 gap-3 md:grid-cols-3">
     <label className={label}>授课内容
      <textarea name="lesson_content" className={area} rows={3} maxLength={4000}
       defaultValue={notes.content==="无"?"":notes.content} placeholder="无"/>
     </label>
     <label className={label}>课程评价
      <textarea name="lesson_evaluation" className={area} rows={3} maxLength={3000}
       defaultValue={notes.evaluation==="无"?"":notes.evaluation} placeholder="无"/>
     </label>
     <label className={label}>下节计划
      <textarea name="next_steps" className={area} rows={3} maxLength={3000}
       defaultValue={current?.next_steps==="无"?"":current?.next_steps||""} placeholder="无"/>
     </label>
    </div>
   </div>
   <div className="border-t border-[#f0f1f7] pt-3">
    <h3 className="mb-2 text-[13px] font-extrabold text-[#3b4267]">学生表现与作业</h3>
    <div className="grid min-w-0 gap-3 sm:grid-cols-2 lg:grid-cols-4">
     <label className={label}>掌握程度
      <select name="mastery" className={field} defaultValue={ratings.mastery}>{selectChoices(MASTERY_OPTIONS)}</select>
     </label>
     <label className={label}>课堂参与
      <select name="participation" className={field} defaultValue={ratings.participation}>{selectChoices(PARTICIPATION_OPTIONS)}</select>
     </label>
     <label className={label}>进步情况
      <select name="progress" className={field} defaultValue={ratings.progress}>{selectChoices(PROGRESS_OPTIONS)}</select>
     </label>
     <label className={label}>布置作业
      <select name="homework" className={field} defaultValue={homework}>{selectChoices(HOMEWORK_OPTIONS)}</select>
     </label>
    </div>
   </div>
   <div className="flex flex-wrap items-center gap-3">
    <button type="submit" disabled={pending||!target||!canEdit}
      className="h-10 rounded-xl bg-[#5657ef] px-5 text-sm font-bold text-white shadow-sm hover:bg-[#4849d6] disabled:opacity-50">
      {pending?"保存中…":current?"更新记录":"保存记录"}
    </button>
    {!canEdit&&<span className="text-xs text-amber-700">只能由记录人或管理员修改</span>}
    {feedback&&<span role="status" className={"text-xs "+(feedback==="已保存"?"text-emerald-700":"text-rose-600")}>{feedback}</span>}
   </div>
  </form>
 </section>;
}
