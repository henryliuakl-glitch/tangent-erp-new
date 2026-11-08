"use client";

import Link from "next/link";
import {usePathname,useRouter} from "next/navigation";
import {useState} from "react";
import type {ComponentType} from "react";
import {
  CalendarDays, CirclePlus, House, LayoutDashboard, ReceiptText, Users,
  CarFront, GraduationCap, Baby, Grid2X2, LogOut, X, ArrowUpRight, UserRoundSearch
} from "lucide-react";
import {useBusiness} from "@/contexts/BusinessContext";
import {isDrivingSchoolBusiness} from "@/lib/business";
import {createClient} from "@/lib/supabase/client";

type IconComponent=ComponentType<{className?:string}>;
function DockLink({href,icon:Icon,label,active,accent=false,onClick}:{
  href:string;icon:IconComponent;label:string;active:boolean;accent?:boolean;onClick?:()=>void;
}){
  return <Link href={href} onClick={onClick} aria-current={active?"page":undefined}
    className={"flex min-w-0 flex-1 flex-col items-center justify-center gap-1 py-1.5 "+
      (accent?"text-[#5355ef]":active?"text-[#4546d5]":"text-[#989cb0]")}>
    <span className={"flex h-8 w-8 items-center justify-center rounded-xl transition-all "+
      (accent?"bg-[#5455ee] text-white shadow-[0_4px_10px_rgba(84,85,238,.3)]":
        active?"bg-[#efeeff] text-[#5455ee]":"text-[#989cb0]")}>
      <Icon className="h-[18px] w-[18px]"/>
    </span>
    <span className="truncate text-[10px] font-bold">{label}</span>
  </Link>;
}
const pill="flex items-center gap-3 rounded-xl border border-[#ededf5] bg-white p-3 text-sm font-semibold text-[#383a57]";

export function MobileDock(){
  const pathname=usePathname(),router=useRouter();
  const {currentBusinessId,careOnly,astraOnly,crmAllowed}=useBusiness();
  const [more,setMore]=useState(false);
  const driving=isDrivingSchoolBusiness(currentBusinessId);
  const family=currentBusinessId==="family";
  const education=["cus","astra","tangent"].includes(currentBusinessId);
  const showVehicles=driving||currentBusinessId==="tangent";
  const newHref=driving?"/bookings/quick":"/bookings/new";
  const close=()=>setMore(false);
  const active=(path:string)=>pathname===path||pathname.startsWith(path+"/");
  async function signOut(){
    close();
    const db=createClient();await db.auth.signOut();
    router.replace("/login");router.refresh();
  }
  const extra=careOnly?[{href:"/afterschool",label:"晚托",icon:Baby}]:family?[]:[
    ...(crmAllowed&&["cus","astra"].includes(currentBusinessId)?[{href:"/crm",label:"招生",icon:UserRoundSearch}]:[]),
    {href:"/finance",label:"财务",icon:ReceiptText},
    ...(education?[{href:"/teaching",label:"教务",icon:GraduationCap}]:[]),
    ...(currentBusinessId==="astra"?[{href:"/afterschool",label:"晚托",icon:Baby}]:[]),
    ...(showVehicles?[{href:"/vehicles",label:"车辆",icon:CarFront}]:[])
  ];

  return <>
    {more&&<div className="fixed inset-0 z-[68] bg-[#242646]/35 backdrop-blur-[2px] md:hidden"
      onClick={close} aria-hidden="true"/>}
    {more&&<section role="dialog" aria-label="更多模块" className="fixed inset-x-3 bottom-[calc(81px+env(safe-area-inset-bottom))] z-[69] mx-auto max-w-md rounded-[22px] border border-[#e9eaf6] bg-[#fafaff] p-4 shadow-[0_20px_60px_rgba(21,27,78,.22)] md:hidden">
      <div className="mb-4 flex items-center justify-between">
        <p className="text-base font-extrabold tracking-tight text-[#242642]">更多模块</p>
        <button onClick={close} type="button" aria-label="关闭" className="rounded-lg bg-white p-2 text-[#777c97]"><X className="h-4 w-4"/></button>
      </div>
      <div className="grid grid-cols-2 gap-2">
        {extra.map(({href,label,icon:Icon})=><Link key={href} href={href} onClick={close} className={pill}>
          <Icon className="h-[18px] w-[18px] text-[#5759ed]"/><span>{label}</span>
          <ArrowUpRight className="ml-auto h-3.5 w-3.5 text-[#a8acc0]"/>
        </Link>)}
        <button type="button" onClick={signOut} className={pill+" text-rose-600"}>
          <LogOut className="h-[18px] w-[18px]"/><span>退出登录</span>
        </button>
      </div>
    </section>}
    <nav className="fixed inset-x-0 bottom-0 z-[70] border-t border-[#e7e9f2] bg-white/95 pb-[env(safe-area-inset-bottom)] shadow-[0_-6px_26px_rgba(30,30,90,.035)] backdrop-blur-xl md:hidden"
      aria-label="移动端导航">
      <div className="mx-auto flex h-[66px] max-w-lg items-stretch gap-1 px-2.5">
        {family?<DockLink href="/family" icon={House} label="家庭" active={active("/family")}/>:careOnly?<>
          <DockLink href="/teaching" icon={GraduationCap} label="教务" active={active("/teaching")}/>
          <DockLink href="/afterschool" icon={Baby} label="晚托" active={active("/afterschool")}/>
        </>:<>
          <DockLink href="/" icon={LayoutDashboard} label="工作台" active={pathname==="/"}/>
          <DockLink href="/students" icon={Users} label="学员" active={active("/students")}/>
          <DockLink href={newHref} icon={CirclePlus} label="新建" accent active={active(newHref)}/>
          <DockLink href="/bookings" icon={CalendarDays} label="排课" active={pathname==="/bookings"}/>
        </>}
        <button onClick={()=>setMore(!more)} aria-expanded={more} aria-label="更多模块" type="button"
          className={"flex min-w-0 flex-1 flex-col items-center justify-center gap-1 py-1.5 "+(more?"text-[#5555ef]":"text-[#989cb0]")}>
          <span className={"flex h-8 w-8 items-center justify-center rounded-xl "+(more?"bg-[#efeeff] text-[#5555ef]":"")}>
            <Grid2X2 className="h-[18px] w-[18px]"/>
          </span>
          <span className="text-[10px] font-bold">更多</span>
        </button>
      </div>
    </nav>
  </>;
}
