"use client";

import Link from "next/link";
import {usePathname,useRouter} from "next/navigation";
import {
  LayoutDashboard, Users, CalendarDays, ReceiptText, GraduationCap, Baby,
  CarFront, House, LogOut, Plus, ChevronRight, BookOpenCheck, BriefcaseBusiness,
  ArrowUpRight, Wallet
} from "lucide-react";
import {createClient} from "@/lib/supabase/client";
import {useBusiness} from "@/contexts/BusinessContext";
import BusinessSwitcher from "@/components/BusinessSwitcher";

type NavItem={href:string;label:string;icon:typeof LayoutDashboard};
type NavGroup={label:string;items:NavItem[]};

const dashboard:NavItem={href:"/",label:"工作台",icon:LayoutDashboard};
const students:NavItem={href:"/students",label:"学员",icon:Users};
const bookings:NavItem={href:"/bookings",label:"排课",icon:CalendarDays};
const finance:NavItem={href:"/finance",label:"财务",icon:ReceiptText};
const teaching:NavItem={href:"/teaching",label:"教务",icon:GraduationCap};
const afterschool:NavItem={href:"/afterschool",label:"晚托",icon:Baby};
const vehicles:NavItem={href:"/vehicles",label:"车辆",icon:CarFront};

function navFor(business:string,careOnly:boolean,astraOnly:boolean):NavGroup[]{
  if(careOnly)return [{label:"教学工作",items:astraOnly?[teaching]:[teaching,afterschool]}];
  if(business==="family")return [{label:"家庭财务",items:[{href:"/family",label:"家庭总览",icon:House}]}];
  const education=business==="cus"||business==="tangent";
  const driving=business==="sine"||business==="tangent";
  return [
    {label:"工作空间",items:[dashboard,students,bookings]},
    {label:"财务",items:[finance]},
    ...(education?[{label:"教学运营",items:[teaching,afterschool]}]:[]),
    ...(driving?[{label:"运营资产",items:[vehicles]}]:[])
  ];
}
function dateLabel(){
  return new Intl.DateTimeFormat("zh-CN",{timeZone:"Pacific/Auckland",month:"long",day:"numeric",weekday:"long"}).format(new Date());
}

export function Navbar(){
  const pathname=usePathname();
  const router=useRouter();
  const {currentBusinessId,currentLabel,careOnly,astraOnly}=useBusiness();
  const groups=navFor(currentBusinessId,careOnly,astraOnly);
  const active=(href:string)=>href==="/"?pathname==="/":pathname===href||pathname.startsWith(href+"/");
  async function signOut(){
    const supabase=createClient();
    await supabase.auth.signOut();
    router.replace("/login");
    router.refresh();
  }
  const businessLabel=careOnly?(astraOnly?"Astra · Teaching":"After School Care"):currentLabel;

  return <>
    <aside className="erp-sidebar" aria-label="Tangent ERP 主导航">
      <div className="erp-sidebar-brand">
        <div className="erp-brand-icon"><img src="/favicon.svg" alt="" className="h-7 w-7"/></div>
        <div className="min-w-0">
          <div className="erp-brand-name">tangent<span className="text-[#5555f4]">.</span></div>
          <div className="erp-brand-subtitle">OPERATIONS</div>
        </div>
      </div>
      <div className="erp-sidebar-workspace">
        <div className="erp-workspace-symbol"><BriefcaseBusiness className="h-[17px] w-[17px]"/></div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[12px] font-bold text-[#181a38]">{businessLabel}</p>
          <p className="text-[10px] text-[#969ab0]">Workspace</p>
        </div>
        <ChevronRight className="h-4 w-4 text-[#a1a5bc]"/>
      </div>
      <nav className="erp-sidebar-nav" aria-label="功能模块">
        {groups.map(group=><div key={group.label} className="erp-nav-group">
          <p className="erp-nav-label">{group.label}</p>
          {group.items.map(({href,label,icon:Icon})=><Link key={href} href={href}
            aria-current={active(href)?"page":undefined}
            className={"erp-nav-link "+(active(href)?"erp-nav-link-active":"")}>
            <Icon className="h-[17px] w-[17px] stroke-[1.85]"/>
            <span>{label}</span>
            {active(href)&&<span className="ml-auto h-1.5 w-1.5 rounded-full bg-white/90"/>}
          </Link>)}
        </div>)}
      </nav>
      <div className="erp-sidebar-footer">
        {!careOnly&&currentBusinessId!=="family"&&<Link href="/bookings/quick" className="erp-side-action">
          <span className="flex h-8 w-8 items-center justify-center rounded-[10px] bg-[#eeeefe] text-[#5355ed]">
            <Plus className="h-4 w-4"/>
          </span>
          <span className="min-w-0 flex-1"><strong className="block text-xs text-[#252844]">快速排课</strong>
            <span className="text-[10px] text-[#999db2]">Quick action</span></span>
          <ArrowUpRight className="h-4 w-4 text-[#b3b6c7]"/>
        </Link>}
        <button onClick={signOut} className="erp-nav-link erp-signout" type="button">
          <LogOut className="h-[17px] w-[17px]"/><span>退出登录</span>
        </button>
        <p className="px-3 pt-3 text-[10px] tracking-wide text-[#b1b4c6]">TANGENT GROUP · ERP</p>
      </div>
    </aside>

    <header className="erp-topbar" aria-label="当前工作空间">
      <div className="flex min-w-0 items-center gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#ededfe] text-[#5355ed]">
          <BookOpenCheck className="h-[18px] w-[18px]"/>
        </div>
        <div className="min-w-0">
          <p className="truncate text-xs font-semibold text-[#222542]">{businessLabel}</p>
          <p className="text-[11px] text-[#9a9eb2]">{dateLabel()}</p>
        </div>
      </div>
      <div className="flex items-center gap-2.5">
        {!careOnly&&<Link href="/finance/add" className="erp-topbar-icon" title="新增财务记录" aria-label="新增财务记录">
          <Wallet className="h-[17px] w-[17px]"/>
        </Link>}
        {!careOnly&&<BusinessSwitcher/>}
        <button onClick={signOut} className="erp-topbar-icon" title="退出登录" aria-label="退出登录" type="button">
          <LogOut className="h-[17px] w-[17px]"/>
        </button>
      </div>
    </header>

    <nav className="erp-tabletbar" aria-label="导航">
      <Link href={careOnly?"/teaching":"/"} className="flex items-center gap-2 text-sm font-black tracking-tight text-[#222542]">
        <img src="/favicon.svg" alt="" className="h-6 w-6"/> Tangent ERP
      </Link>
      <div className="flex min-w-0 items-center gap-1 overflow-x-auto">
        {groups.flatMap(g=>g.items).map(({href,label,icon:Icon})=><Link key={href} href={href}
          className={"flex shrink-0 items-center gap-1.5 rounded-xl px-2.5 py-2 text-xs font-semibold "+
          (active(href)?"bg-[#5555f4] text-white":"text-[#737990] hover:bg-[#f3f3fa]")}>
          <Icon className="h-3.5 w-3.5"/>{label}
        </Link>)}
      </div>
      {!careOnly&&<BusinessSwitcher/>}
      <button onClick={signOut} aria-label="退出登录" type="button" className="rounded-lg p-2 text-[#737990]">
        <LogOut className="h-4 w-4"/>
      </button>
    </nav>
  </>;
}
