"use client";

import {useState,useTransition} from "react";
import {useRouter} from "next/navigation";
import {saveTeachingRecord} from "./actions";

export type LessonTarget = {value:string;label:string};
export type SavedLesson = {
  id:string;target:string;teacher:string|null;lesson_content:string;
  homework:string|null;student_feedback:string|null;next_steps:string|null;
};
const input="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm";
export function TeachingRecordEditor({
  targets,records
}: {targets:LessonTarget[];records:SavedLesson[]}) {
  const router=useRouter();
  const [target,setTarget]=useState(targets[0]?.value||"");
  const [pending,start]=useTransition();
  const [feedback,setFeedback]=useState("");
  const current=records.find(r=>r.target===target);
  function submit(event:React.FormEvent<HTMLFormElement>){
    event.preventDefault();
    const form=new FormData(event.currentTarget);
    setFeedback("");
    start(async()=>{
      try {
        const result=await saveTeachingRecord(form);
        if(!result.ok){setFeedback(result.error);return;}
        setFeedback("已保存");
        router.refresh();
      } catch {setFeedback("网络异常，请稍后再试");}
    });
  }
  if(targets.length===0) return <p className="text-sm text-slate-500">暂无可记录的课程，请先到「排课」或「班级」安排课程。</p>;
  return <div className="rounded-xl border border-slate-200 bg-white p-4">
    <h2 className="mb-3 font-semibold">填写教学记录</h2>
    <form key={target} onSubmit={submit} className="space-y-3">
      <label className="block space-y-1 text-sm">
        <span className="font-medium">课程</span>
        <select className={input} name="target" value={target} required onChange={e=>{setTarget(e.target.value);setFeedback("");}}>
          {targets.map(t=><option key={t.value} value={t.value}>{t.label}</option>)}
        </select>
      </label>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block space-y-1 text-sm"><span className="font-medium">授课教师</span>
          <input name="teacher" className={input} defaultValue={current?.teacher||""} placeholder="教师姓名"/>
        </label>
        <label className="block space-y-1 text-sm sm:col-span-2">
          <span className="font-medium">本节内容 *</span>
          <textarea name="lesson_content" className={input} required rows={3} maxLength={8000}
            defaultValue={current?.lesson_content||""} placeholder="讲解的知识点、完成的教学内容"/>
        </label>
        <label className="block space-y-1 text-sm"><span className="font-medium">作业</span>
          <textarea name="homework" className={input} rows={2}
            defaultValue={current?.homework||""} placeholder="题目、练习与提交要求"/>
        </label>
        <label className="block space-y-1 text-sm"><span className="font-medium">学生表现</span>
          <textarea name="student_feedback" className={input} rows={2}
            defaultValue={current?.student_feedback||""} placeholder="掌握程度、需要关注的地方"/>
        </label>
        <label className="block space-y-1 text-sm sm:col-span-2"><span className="font-medium">下节计划</span>
          <input name="next_steps" className={input} defaultValue={current?.next_steps||""}
            placeholder="下节课需要继续的内容"/>
        </label>
      </div>
      <div className="flex items-center gap-3">
        <button type="submit" disabled={pending||!target}
          className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
          {pending?"保存中…":current?"更新记录":"保存记录"}
        </button>
        {feedback&&<span role="status" className={"text-sm "+(feedback==="已保存"?"text-emerald-700":"text-rose-600")}>{feedback}</span>}
      </div>
    </form>
  </div>;
}
