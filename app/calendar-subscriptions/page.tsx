import Link from "next/link";
import {createClient} from "@/lib/supabase/server";
import {calendarFeedToken} from "@/lib/calendar-feed-token";
import {Navbar} from "@/components/Navbar";
import {MobileDock} from "@/components/MobileDock";
import {CopyCalendarLink} from "./copy-calendar-link";

export const dynamic="force-dynamic";

const ownerFeeds=[
 {businessId:"cus",staff:"henry",label:"CuS · Henry"},
 {businessId:"cus",staff:"yvetta",label:"CuS · Yvetta"},
 {businessId:"cus",staff:null,label:"CuS · 全部课程"},
 {businessId:"sine",staff:"niu",label:"Sine · 牛教练"},
 {businessId:"sine",staff:"tong",label:"Sine · 童教练"},
 {businessId:"sine",staff:null,label:"Sine · 全部课程"},
 {businessId:"tangent",staff:null,label:"Tangent · 集团课表（不含 Astra）"},
 {businessId:"astra",staff:null,label:"Astra · 全部课程"}
];
const astraFeeds=[{businessId:"astra",staff:null,label:"Astra · 全部课程"}];

export default async function CalendarSubscriptionsPage(){
 const db=await createClient();
 const {data:{user}}=await db.auth.getUser();
 if(!user)return <main className="p-8">请先 <Link href="/login">登录</Link>。</main>;
 const {data:members,error}=await db.from("erp_memberships")
  .select("business_unit_id,role").eq("user_id",user.id)
  .in("business_unit_id",["cus","astra"]);
 const owner=!error&&!!members?.some(m=>m.business_unit_id==="cus"&&m.role==="owner");
 const astraManager=!error&&!!members?.some(m=>m.business_unit_id==="astra"&&
  ["owner","admin"].includes(m.role));
 const feeds=owner?ownerFeeds:astraManager?astraFeeds:[];

 return <div className="min-h-screen bg-slate-50 pb-24 md:pb-10">
  <div className="hidden md:block"><Navbar/></div>
  <main className="mx-auto max-w-4xl space-y-4 px-4 py-5 md:px-6">
   <div>
    <Link href="/bookings" className="text-sm font-semibold text-indigo-600">← 返回排课</Link>
    <h1 className="mt-3 text-xl font-extrabold">苹果日历订阅</h1>
    <p className="mt-1 text-sm text-slate-500">每位老师使用独立订阅链接。修改或删除课程后，订阅源会更新；苹果日历实际刷新时间由设备决定。</p>
   </div>
   {feeds.length===0?<div className="rounded-xl border border-amber-100 bg-white p-5 text-sm">当前账号没有生成订阅链接的权限。</div>:
    feeds.map(x=>{
     const token=calendarFeedToken(x.businessId,x.staff);
     const url=token
      ?`https://tangent.center/api/calendar/${encodeURIComponent(x.businessId)}?${x.staff?`staff=${encodeURIComponent(x.staff)}&`:""}token=${token}`
      :null;
     return <section key={x.businessId+":"+(x.staff||"all")} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <h2 className="mb-2 text-sm font-bold">{x.label}</h2>
      {url?<CopyCalendarLink url={url}/>:<p className="text-xs text-rose-600">订阅密钥未配置，请联系系统管理员设置 CALENDAR_FEED_SECRET 并重新部署。</p>}
     </section>;
    })
   }
   <section className="rounded-xl border border-indigo-100 bg-indigo-50 p-4 text-sm text-slate-700">
    <p className="font-bold">重新订阅方法</p>
    <p className="mt-1">复制对应链接，在 iPhone 设置的日历账户中选择「添加已订阅的日历」，或在 Mac 日历选择「文件 → 新建日历订阅」。请勿将订阅链接公开分享。</p>
   </section>
  </main><MobileDock/>
 </div>;
}
