import Link from "next/link";
import {createClient} from "@/lib/supabase/server";
import {utcToNzDateStr,utcToNzTimeStr} from "@/lib/timezone";

type Row=Record<string,any>;

/** Read-only class schedule on the existing Booking screen; no duplicate bookings. */
export async function ClassSessionsStrip({fromIso,toIso,businessId="cus"}:{
  fromIso:string;toIso:string;businessId?:"cus"|"astra"
}){
  const db=await createClient();
  const {data,error}=await db.from("cus_class_sessions")
    .select("id,class_id,starts_at,ends_at,topic,status")
    .gte("starts_at",fromIso).lte("starts_at",toIso).neq("status","cancelled")
    .order("starts_at",{ascending:true}).limit(80);
  if(error||!data?.length)return null;
  const {data:programmes,error:progError}=await db.from("cus_programmes")
    .select("id").eq("business_unit_id",businessId);
  if(progError)return null;
  const programmeIds=(programmes||[]).map(p=>p.id);
  if(!programmeIds.length)return null;
  const {data:classes,error:classError}=await db.from("cus_classes")
    .select("id,title").in("programme_id",programmeIds);
  if(classError)return null;
  const names=new Map(((classes||[]) as Row[]).map(c=>[c.id,c.title]));
  const sessions=(data as Row[]).filter(s=>names.has(s.class_id));
  if(!sessions.length)return null;
  return <section className="mb-3 rounded-xl border border-slate-200 bg-white p-3">
    <div className="mb-2 flex items-center justify-between gap-2">
      <h2 className="text-sm font-bold">班课日程</h2>
      <Link href="/teaching?view=classes" className="text-xs text-indigo-600">班级管理</Link>
    </div>
    <div className="flex gap-2 overflow-x-auto pb-1">
      {sessions.map(s=><div key={s.id} className="min-w-44 shrink-0 rounded-lg bg-slate-50 px-3 py-2">
        <p className="text-xs font-semibold">{utcToNzDateStr(s.starts_at)} · {utcToNzTimeStr(s.starts_at)}–{utcToNzTimeStr(s.ends_at)}</p>
        <p className="mt-1 truncate text-xs text-slate-700">{names.get(s.class_id)||"班课"}</p>
        {s.topic&&<p className="mt-0.5 truncate text-[11px] text-slate-500">{s.topic}</p>}
      </div>)}
    </div>
  </section>;
}
