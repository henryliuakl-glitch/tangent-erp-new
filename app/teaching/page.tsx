import Link from "next/link";
import {createClient} from "@/lib/supabase/server";
import {Navbar} from "@/components/Navbar";
import {MobileDock} from "@/components/MobileDock";
import {TeachingRecords} from "./records";
import {TeachingClasses} from "./classes";
import {TeachingStaff,CareTeachingOverview} from "./staff";

export default async function TeachingPage({
  searchParams
}:{searchParams:Promise<{view?:string;date?:string}>}) {
  const db=await createClient();
  const {data:{user}}=await db.auth.getUser();
  if(!user)return <main className="p-8">请先 <Link className="text-indigo-600" href="/login">登录</Link>。</main>;
  const {data:members,error}=await db.from("erp_memberships")
    .select("business_unit_id,role").eq("user_id",user.id)
    .in("business_unit_id",["cus","care","astra"]);
  const owner=!!members?.some(m=>m.business_unit_id==="cus"&&m.role==="owner");
  const careMember=members?.find(m=>m.business_unit_id==="care");
  const astraStaff=owner||!!members?.some(m=>
    ["care","astra","cus"].includes(m.business_unit_id)&&
    ["teacher","admin","owner"].includes(m.role));
  if(error||(!owner&&!careMember&&!astraStaff))
    return <main className="p-8">没有教务访问权限。</main>;
  const {view,date}=await searchParams;
  const selectedDate=date&&/^\d{4}-\d{2}-\d{2}$/.test(date)&&!Number.isNaN(Date.parse(date))?date:undefined;
  const current=owner
    ? view==="classes"?"classes":view==="teachers"?"teachers":
      view==="astra"?"astra":view==="care"?"care":"cus"
    : view==="care"||!astraStaff?"care":"astra";
  const tabs=owner?[
    {id:"cus",label:"CuS 教学记录",href:"/teaching"},
    {id:"astra",label:"Astra 教学记录",href:"/teaching?view=astra"},
    {id:"classes",label:"班级管理",href:"/teaching?view=classes"},
    {id:"teachers",label:"教师档案",href:"/teaching?view=teachers"},
    {id:"care",label:"晚托课堂",href:"/teaching?view=care"}
  ]:[
    ...(astraStaff?[{id:"astra",label:"Astra 教学记录",href:"/teaching"}]:[]),
    ...(careMember?[{id:"care",label:"晚托课堂",href:"/teaching?view=care"}]:[])
  ];
  return <div className="min-h-screen bg-slate-50 pb-24 text-slate-900 md:pb-10">
    <div className="hidden md:block"><Navbar/></div>
    <main className="mx-auto max-w-[1500px] space-y-2 px-3 py-3 md:px-5">
      <header className="erp-page-heading flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-bold">教务</h1>

      </header>
      <nav aria-label="教务视图" className="inline-flex flex-wrap rounded-xl bg-white p-1 text-sm shadow-sm">
        {tabs.map(tab=><Link key={tab.id} href={tab.href}
          aria-current={current===tab.id?"page":undefined}
          className={"rounded-lg px-3 py-1.5 font-semibold "+(current===tab.id?
            "bg-indigo-600 text-white":"text-slate-600 hover:bg-slate-50")}>
          {tab.label}
        </Link>)}
      </nav>
      {current==="care"?<CareTeachingOverview/>:
        current==="cus"?<TeachingRecords scope="cus" editable={owner} owner={owner} selectedDate={selectedDate}/>:
        current==="astra"?<TeachingRecords scope="astra" editable={astraStaff} owner={owner} selectedDate={selectedDate}/>:
        current==="teachers"?<TeachingStaff owner={owner}/>:
        <TeachingClasses editable={owner}/>}
    </main><MobileDock/>
  </div>;
}
