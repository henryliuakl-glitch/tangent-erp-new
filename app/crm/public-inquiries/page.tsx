import Link from "next/link";
import {createClient} from "@/lib/supabase/server";
import {convertPublicInquiry} from "./actions";

export const dynamic="force-dynamic";
export default async function PublicInquiriesPage(){
 const db=await createClient();
 const {data:{user}}=await db.auth.getUser();
 if(!user)return <main className="p-8">请先登录。</main>;
 const {data:membership}=await db.from("erp_memberships")
  .select("role").eq("user_id",user.id).eq("business_unit_id","cus")
  .eq("role","owner").maybeSingle();
 if(!membership)return <main className="p-8">只有 CuS 核心管理员可访问此页面。</main>;
 const {data,error}=await db.from("erp_public_inquiries").select(
  "id,student_name,phone,email,school,year_level,subject,goal,notes,status,created_at")
  .order("created_at",{ascending:false}).limit(250);
 return <main className="mx-auto min-h-screen max-w-5xl space-y-4 bg-[#f8f9fc] p-4 pb-24">
  <header className="flex flex-wrap items-center justify-between gap-3">
   <div><h1 className="text-xl font-bold">公开咨询审核箱</h1>
   <p className="mt-1 text-xs text-slate-500">官网表单仅生成待审核咨询，不会直接创建学员或扣课时。</p></div>
   <Link href="/crm" className="rounded-lg bg-white px-4 py-2 text-sm text-indigo-600">返回 CRM</Link>
  </header>
  {error?<p className="rounded-xl bg-white p-4 text-sm text-rose-600">
    请先执行 20261109_security_hardening_astra.sql。{error.message}
  </p>:<div className="space-y-3">
    {data?.length===0&&<p className="rounded-xl bg-white p-5 text-sm text-slate-500">暂无咨询。</p>}
    {data?.map(item=><article key={item.id} className="rounded-xl bg-white p-4 shadow-sm">
     <div className="flex flex-wrap justify-between gap-3">
      <div><p className="font-bold">{item.student_name} <span className="text-xs font-normal text-slate-500">· {item.status}</span></p>
       <p className="mt-1 text-sm text-slate-700">{item.phone} {item.email?" · "+item.email:""}</p>
       <p className="mt-1 text-xs text-slate-500">{[item.school,item.year_level,item.subject].filter(Boolean).join(" · ")}</p>
       {(item.goal||item.notes)&&<p className="mt-2 text-xs text-slate-600">{[item.goal,item.notes].filter(Boolean).join(" · ")}</p>}
       <p className="mt-2 text-[11px] text-slate-400">{new Date(item.created_at).toLocaleString("en-NZ",{timeZone:"Pacific/Auckland"})}</p>
      </div>
      {item.status!=="converted"&&<form action={async()=>{"use server";await convertPublicInquiry(item.id);}}>
       <button className="rounded-lg bg-indigo-600 px-4 py-2 text-xs font-semibold text-white">转入 CuS 招生 CRM</button>
      </form>}
     </div>
    </article>)}
   </div>}
 </main>;
}
