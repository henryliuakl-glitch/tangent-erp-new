"use client";

import {useState,useTransition} from "react";
import {useRouter} from "next/navigation";
import {saveTeachingRecord} from "./actions";

export type LessonTarget={value:string;label:string};
export type SavedLesson={
 id:string;target:string;updated_at:string;created_by:string;teacher:string|null;lesson_content:string;
 homework:string|null;student_feedback:string|null;next_steps:string|null;
};
const field="block h-10 w-full min-w-0 rounded-xl border-0 bg-[#f7f8fd] px-3 text-sm text-slate-800 outline-none focus:ring-2 focus:ring-indigo-200";
const area="block min-h-[92px] w-full min-w-0 resize-y rounded-xl border-0 bg-[#f7f8fd] px-3 py-2.5 text-sm text-slate-800 outline-none focus:ring-2 focus:ring-indigo-200";
export function TeachingRecordEditor({
 targets,records,scope,currentUserId,owner
}:{targets:LessonTarget[];records:SavedLesson[];scope:"cus"|"astra";currentUserId:string;owner:boolean}){
 const router=useRouter();
 const [target,setTarget]=useState(targets[0]?.value||"");
 const [pending,start]=useTransition();
 const [feedback,setFeedback]=useState("");
 const current=records.find(r=>r.target===target);
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
 if(targets.length===0)return <div className="erp-surface p-4 text-sm text-slate-500">暂无可记录课程，请先安排课程。</div>;
 return <section className="erp-surface p-4 md:p-5">
  <h2 className="mb-3 text-[15px] font-extrabold text-[#282b4a]">填写教学记录</h2>
  <form key={target} onSubmit={submit} className="space-y-3">
   <input type="hidden" name="scope" value={scope}/>
   <input type="hidden" name="record_id" value={current?.id||""}/>
   <input type="hidden" name="record_version" value={current?.updated_at||""}/>
   <div className="grid min-w-0 gap-3 lg:grid-cols-[minmax(0,2fr)_minmax(220px,1fr)]">
    <label className="block min-w-0 space-y-1 text-xs font-semibold text-slate-700">课程
     <select name="target" className={field} value={target} required onChange={e=>{setTarget(e.target.value);setFeedback("");}}>
      {targets.map(t=><option key={t.value} value={t.value}>{t.label}</option>)}
     </select>
    </label>
    <label className="block min-w-0 space-y-1 text-xs font-semibold text-slate-700">授课教师
     <input name="teacher" className={field} defaultValue={current?.teacher||""} placeholder="教师姓名"/>
    </label>
   </div>
   <div className="grid min-w-0 gap-3 md:grid-cols-2">
    <label className="block min-w-0 space-y-1 text-xs font-semibold text-slate-700">教师做了什么 *
     <textarea name="lesson_content" className={area} required rows={3} maxLength={8000}
      defaultValue={current?.lesson_content||""} placeholder="授课内容、讲解、指导与课堂安排"/>
    </label>
    <label className="block min-w-0 space-y-1 text-xs font-semibold text-slate-700">学生做了什么 *
     <textarea name="student_feedback" className={area} required rows={3}
      defaultValue={current?.student_feedback||""} placeholder="学生练习、参与情况与掌握程度"/>
    </label>
    <label className="block min-w-0 space-y-1 text-xs font-semibold text-slate-700">作业
     <textarea name="homework" className={area} rows={2}
      defaultValue={current?.homework||""} placeholder="题目、练习与提交要求"/>
    </label>
    <label className="block min-w-0 space-y-1 text-xs font-semibold text-slate-700">下节计划
     <textarea name="next_steps" className={area} rows={2}
      defaultValue={current?.next_steps||""} placeholder="下节课需要继续的内容"/>
    </label>
   </div>
   <div className="flex flex-wrap items-center gap-3">
    <button type="submit" disabled={pending||!target||!canEdit}
     className="h-10 rounded-xl bg-indigo-600 px-5 text-sm font-bold text-white disabled:opacity-50">
     {pending?"保存中…":current?"更新记录":"保存记录"}
    </button>
    {!canEdit&&<span className="text-xs text-amber-700">只能由记录人或管理员修改</span>}
    {feedback&&<span role="status" className={"text-xs "+(feedback==="已保存"?"text-emerald-700":"text-rose-600")}>{feedback}</span>}
   </div>
  </form>
 </section>;
}
