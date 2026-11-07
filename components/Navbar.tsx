"use client";
import Link from "next/link";
import {usePathname,useRouter} from "next/navigation";
import {LayoutDashboard,Users,CalendarDays,ReceiptText,GraduationCap,Baby,CarFront,House,LogOut,Plus} from "lucide-react";
import {createClient} from "@/lib/supabase/client";
import {useBusiness} from "@/contexts/BusinessContext";
import BusinessSwitcher from "@/components/BusinessSwitcher";
type Item={href:string;label:string;icon:typeof LayoutDashboard};
const home:Item={href:"/",label:"工作台",icon:LayoutDashboard};
const students:Item={href:"/students",label:"学员",icon:Users};
const booking:Item={href:"/bookings",label:"排课",icon:CalendarDays};
const finance:Item={href:"/finance",label:"财务",icon:ReceiptText};
const teaching:Item={href:"/teaching",label:"教务",icon:GraduationCap};
const care:Item={href:"/afterschool",label:"晚托",icon:Baby};
const car:Item={href:"/vehicles",label:"车辆",icon:CarFront};
const family:Item={href:"/family",label:"家庭",icon:House};
export function Navbar(){
  const pathname=usePathname(),router=useRouter();
  const {currentBusinessId,careOnly,astraOnly}=useBusiness();
  const nav:Item[]=careOnly?(astraOnly?[teaching]:[teaching,care]):
    currentBusinessId==="family"?[family]:
      [home,students,booking,finance,
        ...(["cus","tangent"].includes(currentBusinessId)?[teaching,care]:[]),
        ...(["sine","tangent"].includes(currentBusinessId)?[car]:[])];
  const active=(href:string)=>href==="/"?pathname==="/":pathname===href||pathname.startsWith(href+"/");
  const quickHref=currentBusinessId==="sine"?"/bookings/quick":"/bookings/new";
  async function signOut(){await createClient().auth.signOut();router.replace("/login");router.refresh();}
  return <aside className="erp-sidebar" aria-label="主导航">
    <Link href={careOnly?"/teaching":currentBusinessId==="family"?"/family":"/"}
      className="erp-sidebar-brand" aria-label="Tangent ERP">
      <div className="erp-brand-icon"><img src="/favicon.svg" alt="" width={27} height={27}/></div>
      <div><div className="erp-brand-name">tangent<span className="text-[#5555f4]">.</span></div>
        <div className="erp-brand-subtitle">OPERATIONS</div></div>
    </Link>
    <div className="erp-sidebar-switch">
      {careOnly?<div className="erp-fixed-entity">{astraOnly?"Astra 教务":"晚托管理"}</div>:<BusinessSwitcher compact/>}
    </div>
    <nav className="erp-sidebar-nav" aria-label="功能模块">
      {nav.map(({href,label,icon:Icon})=><Link key={href} href={href}
        aria-current={active(href)?"page":undefined}
        className={"erp-nav-link "+(active(href)?"erp-nav-link-active":"")}>
        <Icon className="h-[18px] w-[18px] shrink-0 stroke-[1.9]"/>
        <span>{label}</span>
        {active(href)&&<span className="ml-auto h-1.5 w-1.5 rounded-full bg-white/95"/>}
      </Link>)}
    </nav>
    <div className="erp-sidebar-footer">
      {!careOnly&&currentBusinessId!=="family"&&<Link href={quickHref} className="erp-nav-link erp-quick-link">
        <Plus className="h-[18px] w-[18px]"/><span>快速排课</span>
      </Link>}
      <button onClick={signOut} className="erp-nav-link erp-signout" type="button">
        <LogOut className="h-[18px] w-[18px]"/><span>退出登录</span>
      </button>
    </div>
  </aside>;
}