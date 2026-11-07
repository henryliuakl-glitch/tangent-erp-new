import Link from "next/link";
import {createClient} from "@/lib/supabase/server";
import {createTeacher} from "@/app/afterschool/actions";
type Staff={id:string;full_name:string;phone:string|null;email:string|null;subjects:string|null;scope:string;active:boolean};
const input="erp-field w-full px-3 py-2.5 text-sm";
export async function TeachingStaff({owner}:{owner:boolean}){
 const db=await createClient();
 const {data:staff,error}=await db.from("cus_staff")
  .select("id,full_name,phone,email,subjects,scope,active").order("full_name").limit(120);
 if(error)return <section className="erp-surface p-5 md:p-6">教师档案尚未启用，请执行晚托数据库升级。</section>;
 const rows=(staff||[]) as Staff[];
 return <div className="space-y-4">
  <section className="rounded-xl border bg-white p-4">
   <h2 className="mb-3 font-semibold">教师档案</h2>
   {rows.length===0?<p className="text-sm text-slate-500">尚未登记教师。</p>:
    <div className="grid gap-2 sm:grid-cols-2">{rows.map(t=><div key={t.id} className="rounded-xl border border-[#eceefa] bg-[#fcfcff] p-4">
      <div className="flex justify-between gap-2"><strong>{t.full_name}</strong><span className="text-xs text-slate-500">{t.scope==="care"?"晚托":"教学"} · {t.active?"在职":"暂停"}</span></div>
      {t.subjects&&<p className="mt-1 text-sm text-slate-600">{t.subjects}</p>}
      {t.phone&&<a className="mt-1 block text-sm text-indigo-600" href={"tel:"+t.phone}>{t.phone}</a>}
      {t.email&&<p className="text-xs text-slate-500">{t.email}</p>}
    </div>)}</div>}
  </section>
  <section className="rounded-xl border bg-white p-4">
    <details><summary className="cursor-pointer font-semibold">＋ 登记教师</summary>
      <form action={createTeacher} className="mt-3 grid gap-2 sm:grid-cols-2">
        <input name="full_name" className={input} placeholder="姓名" required/>
        <select name="scope" className={input} defaultValue="general">
          {owner&&<option value="general">普通教务</option>}
          <option value="care">晚托班</option>
        </select>
        <input name="phone" className={input} placeholder="联系电话"/>
        <input name="email" type="email" className={input} placeholder="Email"/>
        <input name="subjects" className={input} placeholder="学科或职责"/>
        <input name="notes" className={input} placeholder="备注"/>
        <button className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white">保存教师</button>
      </form>
    </details>
  </section>
 </div>;
}
export async function CareTeachingOverview(){
 const db=await createClient();
 const [teachers,logs]=await Promise.all([
   db.from("cus_staff").select("id,full_name,subjects").eq("scope","care").order("full_name").limit(80),
   db.from("cus_care_lesson_logs").select("id,visit_id,teacher_id,teacher_actions,child_actions,observations,created_at")
     .order("created_at",{ascending:false}).limit(50)
 ]);
 if(teachers.error||logs.error)return <section className="rounded-xl border bg-white p-4">晚托教务尚未启用，请联系管理员。</section>;
 const ids=[...new Set((logs.data||[]).map(x=>x.visit_id))];
 const {data:visits}=ids.length?await db.from("cus_care_visits").select("id,care_date,student_id").in("id",ids):{data:[]};
 const childIds=[...new Set((visits||[]).map(x=>x.student_id))];
 const {data:children}=childIds.length?await db.from("cus_care_children").select("id,full_name").in("id",childIds):{data:[]};
 const names=new Map((teachers.data||[]).map(t=>[t.id,t.full_name]));
 const childNames=new Map((children||[]).map(t=>[t.id,t.full_name]));
 const visitMap=new Map((visits||[]).map(v=>[v.id,v]));
 return <div className="space-y-4">
   <section className="rounded-xl border bg-white p-4">
     <div className="flex items-center justify-between"><h2 className="font-semibold">晚托教师</h2><Link href="/afterschool" className="text-sm text-indigo-600">进入晚托</Link></div>
     <div className="mt-3 flex flex-wrap gap-2">{(teachers.data||[]).map(t=><span key={t.id} className="rounded-lg bg-slate-100 px-3 py-2 text-sm">{t.full_name}</span>)}</div>
     {(teachers.data||[]).length===0&&<p className="mt-2 text-sm text-slate-500">暂无登记教师。</p>}
   </section>
   <section className="rounded-xl border bg-white p-4">
    <h2 className="mb-3 font-semibold">最近课堂记录</h2>
    {(logs.data||[]).map(l=>{
      const visit=visitMap.get(l.visit_id);
      return <details key={l.id} className="mb-2 rounded-lg border p-3">
        <summary className="cursor-pointer font-semibold text-sm">{visit?.care_date||""} · {childNames.get(visit?.student_id)||"学生"} · {names.get(l.teacher_id)||"教师"}</summary>
        <p className="mt-3 whitespace-pre-wrap text-sm"><strong>教师做了什么：</strong>{l.teacher_actions}</p>
        <p className="mt-2 whitespace-pre-wrap text-sm"><strong>学生做了什么：</strong>{l.child_actions}</p>
        {l.observations&&<p className="mt-2 whitespace-pre-wrap text-sm">备注：{l.observations}</p>}
      </details>;
    })}
    {(logs.data||[]).length===0&&<p className="text-sm text-slate-500">暂无课堂记录。</p>}
   </section>
 </div>;
}
