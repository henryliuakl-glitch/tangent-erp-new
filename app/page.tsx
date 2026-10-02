"use client";

import { useEffect, useState, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useBusiness } from "@/contexts/BusinessContext";
import { getDashboardStats } from "./dashboard-actions";
import { createClient } from "@/lib/supabase/client";
import { Navbar } from "@/components/Navbar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { 
  TrendingUp, PiggyBank, 
  Loader2, MapPin, 
  Wallet, AlertCircle, Sun, Moon, Calendar as CalendarIcon, 
  ArrowUpRight, Clock, User, BookOpen,
  LogOut, Check, Building2, Plus, Zap
} from "lucide-react";
import { AreaChart, Area, ResponsiveContainer } from 'recharts';
import { format } from "date-fns";
import { zhCN } from "date-fns/locale";
import { isBookingUnpaid } from "@/lib/student-payment";
import { isDrivingSchoolBusiness } from "@/lib/business";
import { MobileDock } from "@/components/MobileDock";
import { DashboardCalendar } from "@/components/DashboardCalendar";
import { completeBooking } from "@/app/bookings/actions";
import { isTodayInNZ, utcToNzTimeStr, TZ_NZ } from "@/lib/timezone";
import { toast } from "sonner";
import { formatInTimeZone } from "date-fns-tz";

// 简单的下拉菜单组件
function MobileUserMenu({ user, currentLabel, businesses, onSwitch, onSignOut }: any) {
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div className="relative" ref={menuRef}>
      <button 
        onClick={() => setIsOpen(!isOpen)}
        className="h-10 w-10 bg-white border border-slate-200 rounded-full flex items-center justify-center shadow-sm overflow-hidden active:scale-95 transition-transform"
      >
        {user?.avatar_url ? (
          <img src={user.avatar_url} alt="Avatar" className="h-full w-full object-cover" />
        ) : <span className="text-xs font-bold text-slate-500">...</span>}
      </button>

      {isOpen && (
        <div className="absolute right-0 top-12 w-56 bg-white rounded-xl shadow-xl border border-slate-100 py-2 z-50 animate-in fade-in slide-in-from-top-2">
          <div className="px-4 py-2 border-b border-slate-50 mb-1">
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">切换业务 (Switch)</p>
          </div>
          {businesses.map((b: any) => (
            <button
              key={b.id}
              onClick={() => { onSwitch(b.id); setIsOpen(false); }}
              className="w-full text-left px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 flex items-center justify-between"
            >
              <span className="flex items-center gap-2">
                <Building2 className="h-4 w-4 text-slate-400" />
                {b.name}
              </span>
              {currentLabel === b.name && <Check className="h-4 w-4 text-indigo-600" />}
            </button>
          ))}
          <div className="h-px bg-slate-100 my-1" />
          <button
            onClick={onSignOut}
            className="w-full text-left px-4 py-2.5 text-sm font-bold text-rose-600 hover:bg-rose-50 flex items-center gap-2"
          >
            <LogOut className="h-4 w-4" /> 退出登录
          </button>
        </div>
      )}
    </div>
  );
}

export default function Home() {
  const { currentBusinessId, currentLabel, setBusinessId } = useBusiness();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [userProfile, setUserProfile] = useState<any>(null);
  const [mounted, setMounted] = useState(false);
  const [businessList, setBusinessList] = useState<any[]>([]); 
  
  const [stats, setStats] = useState<any>({
    cashIncome: 0, netCashFlow: 0, cashIncomeRmb: 0, netCashFlowRmb: 0,
    realizedRevenue: 0, realizedRevenueRmb: 0,
    unearnedRevenue: 0, unearnedRevenueRmb: 0,
    chartData: [], calendarBookings: [], lowBalanceStudents: []
  });
  
  const [activeCardIndex, setActiveCardIndex] = useState(0);
  const [completingId, setCompletingId] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setMounted(true);
    async function initData() {
      const supabase = createClient();
      
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data: profile } = await supabase.from('profiles').select('*').eq('id', user.id).single();
        setUserProfile(profile || { 
          full_name: user.email?.split('@')[0], 
          avatar_url: `https://api.dicebear.com/9.x/notionists/svg?seed=${user.email}` 
        });
      }

      const { data: units } = await supabase.from('business_units').select('id, name').order('name');
      if (units && units.length > 0) {
        setBusinessList(units);
      } else {
        setBusinessList([
          { id: 'cus', name: 'CuS Academy' },
          { id: 'sine', name: 'Sine Studio' },
          { id: 'tangent', name: 'Tangent Group' }
        ]);
      }

      if (currentBusinessId) {
        setLoading(true);
        try {
          // 确保传入有效租户 ID（与 Finance 一致）
          const unitId = currentBusinessId || "cus";
          const data = await getDashboardStats(unitId);
          setStats(data);
        } catch (error) { console.error(error); } 
        finally { setLoading(false); }
      }
    }
    initData();
  }, [currentBusinessId]);

  const handleSignOut = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push('/login');
  };

  const reloadStats = async () => {
    if (!currentBusinessId) return;
    try {
      const data = await getDashboardStats(currentBusinessId);
      setStats(data);
    } catch (error) {
      console.error(error);
    }
  };

  const handleCompleteTodo = async (e: React.MouseEvent, b: any) => {
    e.preventDefault();
    e.stopPropagation();
    if (!b.student?.id) {
      toast.error("缺少学员信息，无法消课");
      return;
    }
    if (!confirm(`确认完成 ${b.student?.name} 的课程？`)) return;
    setCompletingId(b.id);
    const res = await completeBooking(b.id, b.student.id, b.duration);
    setCompletingId(null);
    if (res?.error) toast.error(res.error);
    else {
      toast.success("已消课");
      await reloadStats();
    }
  };

  const handleScroll = () => {
    if (scrollRef.current) {
      const scrollLeft = scrollRef.current.scrollLeft;
      const width = scrollRef.current.offsetWidth;
      setActiveCardIndex(Math.round(scrollLeft / width));
    }
  };

  const hour = new Date().getHours();
  const greeting = hour < 12 ? "早安" : hour < 18 ? "下午好" : "晚上好";
  const GreetingIcon = hour < 18 ? Sun : Moon;

  // ==========================================
  // 🧠 核心：智能计算待办课程与待缴费状态
  // ==========================================
  const rawFutureBookings = stats.calendarBookings
    .filter((b: any) => b.status === 'confirmed') // 只要没点完成，全部算待办
    .sort((a: any, b: any) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime());

  const studentUsage: Record<string, number> = {};
  const futureBookings = rawFutureBookings.map((b: any) => {
    const sid = b.student_id || b.student?.id;
    if (!studentUsage[sid]) studentUsage[sid] = 0;
    
    const balance = Number(b.student?.balance || 0);
    const paymentType = b.student?.payment_type;
    const newUsage = studentUsage[sid] + Number(b.duration);
    studentUsage[sid] = newUsage;

    // 仅按缴费类型 + 余额判定；balance > 0 绝不标「待缴费」
    const isUnpaid = isBookingUnpaid(balance, paymentType, undefined, {
      businessUnitId: b.business_unit_id,
      level: b.student?.level,
    });
    
    return { ...b, isUnpaid };
  });

  const driving = isDrivingSchoolBusiness(currentBusinessId);
  const quickBookHref = driving ? "/bookings/quick" : "/bookings/new";
  const quickBookLabel = driving ? "极速排课" : "新建排课";

  const todayLessons = (stats.calendarBookings || []).filter(
    (b: any) => b.status !== "cancelled" && isTodayInNZ(b.start_time)
  );
  const todayPending = todayLessons.filter((b: any) => b.status === "confirmed").length;
  const todayDone = todayLessons.filter((b: any) => b.status === "completed").length;

  return (
    <>
      <div className="hidden md:block"><Navbar /></div>

      <main className="md:min-h-screen bg-slate-50 font-sans text-slate-900 h-[100dvh] md:h-auto flex flex-col md:block overflow-hidden md:overflow-visible">
        
        {/* --- PART 1: HEADER & CARDS --- */}
        <div className="shrink-0 z-20 bg-slate-50 md:bg-transparent pb-2 relative">
          
          <div className="md:hidden px-6 pt-12 pb-4 flex justify-between items-center bg-slate-50">
            <div>
              <div className="flex items-center gap-1.5 text-slate-400 text-[10px] font-bold uppercase tracking-wider mb-0.5">
                <GreetingIcon className="h-3 w-3 text-amber-500" />
                <span>{format(new Date(), "M月d日 EEEE", { locale: zhCN })}</span>
              </div>
              <div className="flex items-center gap-1">
                <h1 className="text-xl font-black text-slate-900 tracking-tight">
                  Hi, <span className="text-indigo-600 truncate max-w-[150px]">{userProfile?.full_name || "..."}</span>
                </h1>
                <Badge variant="outline" className="ml-2 text-[10px] h-5 bg-white border-slate-200 text-slate-500">
                  {currentLabel}
                </Badge>
              </div>
            </div>
            <MobileUserMenu 
              user={userProfile} currentLabel={currentLabel} businesses={businessList} 
              onSwitch={setBusinessId} onSignOut={handleSignOut}
            />
          </div>

          <div className="hidden md:flex max-w-7xl mx-auto px-6 pt-8 pb-6 justify-between items-end">
             <div>
               <p className="text-slate-500 text-sm font-bold mb-1 flex items-center gap-2">
                 {format(new Date(), "yyyy年M月d日 EEEE", { locale: zhCN })}
               </p>
               <h1 className="text-3xl font-extrabold text-slate-900">
                 {greeting}, <span className="text-indigo-600">{userProfile?.full_name}</span>
               </h1>
             </div>
             {userProfile?.avatar_url && <img src={userProfile.avatar_url} className="h-12 w-12 rounded-full border-2 border-white shadow-sm" />}
          </div>

          <div className="relative w-full max-w-7xl mx-auto">
            <div ref={scrollRef} onScroll={handleScroll} className="md:hidden flex snap-x snap-mandatory overflow-x-auto gap-0 no-scrollbar px-5 py-2">
              
              <Link href="/finance" className="snap-center w-full min-w-full px-1 block active:scale-[0.98] transition-transform">
                <div className="h-44 rounded-3xl bg-indigo-600 p-6 text-white shadow-xl shadow-indigo-200 relative overflow-hidden flex flex-col z-0">
                   <div className="z-10 relative">
                     <p className="text-indigo-200 text-xs font-bold uppercase tracking-wider mb-1 flex items-center gap-1">
                       <Wallet className="h-3 w-3" /> 净现金流 (Net)
                     </p>
                     <h2 className="text-4xl font-black tracking-tight flex items-center gap-2">
                       {stats.netCashFlow >= 0 ? '+' : ''}${Number(stats.netCashFlow).toLocaleString(undefined, { maximumFractionDigits: 2 })}
                       <ArrowUpRight className="h-5 w-5 opacity-50" />
                     </h2>
                     <p className="text-indigo-200/80 text-xs font-medium mt-1.5 tabular-nums tracking-wide">
                       RMB: ¥{Number(stats.netCashFlowRmb ?? 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}
                     </p>
                   </div>
                   <div className="absolute bottom-0 left-0 right-0 h-24 w-full opacity-30 pointer-events-none z-0">
                     {mounted && stats.chartData.length > 0 && (
                       <ResponsiveContainer width="100%" height="100%">
                         <AreaChart data={stats.chartData}>
                           <defs><linearGradient id="colorNetMobile" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#ffffff" stopOpacity={0.8}/><stop offset="95%" stopColor="#ffffff" stopOpacity={0}/></linearGradient></defs>
                           <Area type="monotone" dataKey="net" stroke="#ffffff" strokeWidth={3} fill="url(#colorNetMobile)" isAnimationActive={false} />
                         </AreaChart>
                       </ResponsiveContainer>
                     )}
                   </div>
                </div>
              </Link>

              <Link href="/bookings" className="snap-center w-full min-w-full px-1 block active:scale-[0.98] transition-transform">
                <div className="h-44 rounded-3xl bg-white border border-slate-200 p-6 shadow-sm relative overflow-hidden flex flex-col justify-between">
                   <div className="absolute right-[-15px] top-[-15px] opacity-[0.07] pointer-events-none"><TrendingUp className="h-32 w-32 text-indigo-900" /></div>
                   <div className="z-10">
                     <p className="text-slate-500 text-xs font-bold uppercase tracking-wider mb-1 flex items-center gap-1">
                       <Clock className="h-3 w-3" /> 本月已消课
                     </p>
                     <h2 className="text-4xl font-black tracking-tight text-slate-900 flex items-center gap-2">
                       ${Number(stats.realizedRevenue).toLocaleString(undefined, { maximumFractionDigits: 2 })}
                       <ArrowUpRight className="h-5 w-5 text-slate-300" />
                     </h2>
                     <p className="text-slate-400 text-xs font-medium mt-1.5 tabular-nums tracking-wide">
                       RMB: ¥{Number(stats.realizedRevenueRmb ?? 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}
                     </p>
                   </div>
                   <div className="z-10 mt-auto">
                      <span className="text-[10px] font-bold text-slate-400 bg-slate-50 px-2.5 py-1 rounded-lg border border-slate-100">点击查看排课</span>
                   </div>
                </div>
              </Link>

              <Link href={driving ? "/bookings" : "/students"} className="snap-center w-full min-w-full px-1 block active:scale-[0.98] transition-transform">
                <div className="h-44 rounded-3xl bg-slate-900 p-6 text-white shadow-lg relative overflow-hidden flex flex-col justify-between">
                   <div className="absolute right-[-10px] bottom-[-10px] opacity-10 pointer-events-none"><PiggyBank className="h-32 w-32" /></div>
                   <div className="z-10">
                     <p className="text-slate-500 text-xs font-bold uppercase tracking-wider mb-1 flex items-center gap-1">
                        {driving ? <CalendarIcon className="h-3 w-3" /> : <PiggyBank className="h-3 w-3" />}
                        {driving ? "今日课程" : "资金池 (Pool)"}
                     </p>
                     {driving ? (
                       <>
                         <h2 className="text-4xl font-black tracking-tight flex items-center gap-2">
                           {todayPending}
                           <span className="text-lg font-bold text-slate-500">待办</span>
                         </h2>
                         <p className="text-slate-500 text-xs font-medium mt-1.5 tabular-nums tracking-wide">
                           已完成 {todayDone} 节
                         </p>
                       </>
                     ) : (
                       <>
                         <h2 className="text-4xl font-black tracking-tight flex items-center gap-2">
                           ${Number(stats.unearnedRevenue).toLocaleString(undefined, { maximumFractionDigits: 2 })}
                           <ArrowUpRight className="h-5 w-5 opacity-50" />
                         </h2>
                         <p className="text-slate-500 text-xs font-medium mt-1.5 tabular-nums tracking-wide">
                           RMB: ¥{Number(stats.unearnedRevenueRmb ?? 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}
                         </p>
                       </>
                     )}
                   </div>
                   <div className="text-xs text-slate-600 font-medium z-10">
                     {driving ? "点击查看排课" : "* 预收学费总额"}
                   </div>
                </div>
              </Link>
            </div>
            
            <div className="flex md:hidden justify-center gap-2 mt-3 mb-2">
              {[0, 1, 2].map((i) => (
                <div key={i} className={`h-1.5 rounded-full transition-all duration-300 ${i === activeCardIndex ? 'w-4 bg-indigo-600' : 'w-1.5 bg-slate-300'}`} />
              ))}
            </div>

            <div className="hidden md:grid grid-cols-3 gap-6 px-6">
               <Link href="/finance" className="block hover:scale-[1.02] transition-transform relative group">
                  <div className="h-48 rounded-3xl bg-indigo-600 p-6 text-white shadow-lg relative overflow-hidden">
                     <div className="z-10 relative">
                       <p className="text-indigo-200 text-xs font-bold uppercase">净现金流 (Net)</p>
                       <h2 className="text-4xl font-black mt-2 flex items-center gap-2">
                         {stats.netCashFlow >= 0 ? '+' : ''}${Number(stats.netCashFlow).toLocaleString(undefined, { maximumFractionDigits: 2 })}
                         <ArrowUpRight className="h-5 w-5 opacity-50"/>
                       </h2>
                       <p className="text-indigo-200/80 text-xs font-medium mt-1.5 tabular-nums tracking-wide">
                         RMB: ¥{Number(stats.netCashFlowRmb ?? 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}
                       </p>
                     </div>
                     <div className="absolute bottom-0 left-0 right-0 h-24 w-full opacity-30 group-hover:opacity-40 transition-opacity pointer-events-none">
                        {mounted && <ResponsiveContainer width="100%" height="100%"><AreaChart data={stats.chartData}><defs><linearGradient id="colorNetDesktop" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#fff" stopOpacity={0.5}/><stop offset="95%" stopColor="#fff" stopOpacity={0}/></linearGradient></defs><Area type="monotone" dataKey="net" stroke="#fff" strokeWidth={3} fill="url(#colorNetDesktop)" isAnimationActive={false} /></AreaChart></ResponsiveContainer>}
                     </div>
                  </div>
               </Link>
               <Link href="/bookings" className="block hover:scale-[1.02] transition-transform">
                  <div className="h-48 rounded-3xl bg-white border border-slate-200 p-6 shadow-sm relative overflow-hidden flex flex-col justify-between hover:border-indigo-300 hover:shadow-md transition-all">
                     <div>
                       <p className="text-slate-500 text-xs font-bold uppercase">本月已消课</p>
                       <h2 className="text-4xl font-black mt-2 text-slate-900">${Number(stats.realizedRevenue).toLocaleString(undefined, { maximumFractionDigits: 2 })}</h2>
                       <p className="text-slate-400 text-xs font-medium mt-1.5 tabular-nums tracking-wide">
                         RMB: ¥{Number(stats.realizedRevenueRmb ?? 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}
                       </p>
                     </div>
                     <div className="text-right"><div className="h-10 w-10 bg-slate-50 rounded-full flex items-center justify-center ml-auto"><ArrowUpRight className="h-5 w-5 text-slate-400"/></div></div>
                  </div>
               </Link>
               <Link href={driving ? "/bookings" : "/students"} className="block hover:scale-[1.02] transition-transform">
                  <div className="h-48 rounded-3xl bg-slate-900 p-6 text-white shadow-lg relative overflow-hidden flex flex-col justify-between">
                     <div>
                       <p className="text-slate-500 text-xs font-bold uppercase">{driving ? "今日课程" : "资金池 (负债)"}</p>
                       {driving ? (
                         <>
                           <h2 className="text-4xl font-black mt-2">
                             {todayPending}
                             <span className="ml-2 text-lg font-bold text-slate-500">待办</span>
                           </h2>
                           <p className="text-slate-500 text-xs font-medium mt-1.5 tabular-nums tracking-wide">
                             已完成 {todayDone} 节
                           </p>
                         </>
                       ) : (
                         <>
                           <h2 className="text-4xl font-black mt-2">${Number(stats.unearnedRevenue).toLocaleString(undefined, { maximumFractionDigits: 2 })}</h2>
                           <p className="text-slate-500 text-xs font-medium mt-1.5 tabular-nums tracking-wide">
                             RMB: ¥{Number(stats.unearnedRevenueRmb ?? 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}
                           </p>
                         </>
                       )}
                     </div>
                     <div className="text-right"><div className="h-10 w-10 bg-slate-800 rounded-full flex items-center justify-center ml-auto"><ArrowUpRight className="h-5 w-5 text-slate-400"/></div></div>
                  </div>
               </Link>
            </div>
          </div>
        </div>

        {/* --- PART 2: CALENDAR + LIST AREA --- */}
        <div className="flex-1 px-5 pt-0 pb-24 md:pb-6 md:px-6 max-w-7xl mx-auto w-full md:grid md:grid-cols-3 md:gap-8 overflow-y-auto md:overflow-visible">
          
          <div className="md:col-span-3 mb-5 md:mb-0">
            <DashboardCalendar
              bookings={stats.calendarBookings || []}
              businessId={currentBusinessId}
            />
          </div>

          <div className="md:col-span-2 flex flex-col">
             <div className="sticky top-0 bg-slate-50 z-30 py-4 border-b border-slate-100/50 mb-2 shadow-[0_4px_10px_-10px_rgba(0,0,0,0.1)]">
               <div className="flex items-center justify-between gap-3">
                 <h3 className="text-base font-extrabold text-slate-900 flex items-center gap-2">
                   <CalendarIcon className="h-5 w-5 text-indigo-600" />
                   待办课程 <span className="text-slate-400 font-normal text-xs ml-1">({futureBookings.length})</span>
                 </h3>
                 <Link href={quickBookHref} className="md:hidden shrink-0">
                   <Button className="h-9 rounded-full bg-indigo-600 px-3 text-xs font-black shadow-md shadow-indigo-200 hover:bg-indigo-700">
                     <Plus className="mr-1 h-4 w-4" /> {quickBookLabel}
                   </Button>
                 </Link>
               </div>
             </div>

             <div className="min-h-[200px]">
               {loading ? (
                 <div className="h-40 flex items-center justify-center"><Loader2 className="animate-spin text-slate-300"/></div>
               ) : futureBookings.length === 0 ? (
                 <div className="text-center py-12"><p className="text-slate-400 text-xs">暂无待办课程安排 ☕️</p></div>
               ) : (
                 <div className="space-y-3 relative pl-4 pb-4">
                   <div className="absolute left-[26px] top-6 bottom-6 w-0.5 bg-slate-200 z-0 rounded-full"></div>
                   
                   {futureBookings.map((b: any) => {
                     const isToday = isTodayInNZ(b.start_time);
                     const dateStr = formatInTimeZone(new Date(b.start_time), TZ_NZ, "MMM d", { locale: zhCN });
                     const timeStr = utcToNzTimeStr(b.start_time);
                     const student = b.student || {};
                     const subjectLabel = b.subject || student.subject || (driving ? "练车" : "无科目");
                     const coachLabel = b.metadata?.coach || b.teacher || student.teacher || (driving ? "" : "无老师");
                     
                     return (
                       <div key={b.id} className="relative z-10 flex gap-4 group">
                          
                          <Link href="/bookings" className="flex flex-col items-center gap-1 shrink-0 w-14 pt-1 active:scale-[0.98] transition-transform duration-200">
                             <div className={`h-14 w-14 rounded-2xl flex flex-col items-center justify-center text-xs font-bold shadow-sm z-20 border-[3px] border-slate-50 ${isToday ? 'bg-indigo-600 text-white' : 'bg-white text-slate-600'}`}>
                               <span className="text-[10px] leading-tight opacity-80">{dateStr}</span>
                               <span className="text-sm leading-tight">{timeStr}</span>
                             </div>
                          </Link>

                          <div className="flex-1 p-4 rounded-2xl bg-white border border-slate-100 shadow-sm hover:border-indigo-200 transition-colors">
                               <Link href="/bookings" className="block">
                               <div className="flex justify-between items-start mb-2">
                                  <div className="flex items-center gap-2 min-w-0">
                                    {student.student_code && (
                                      <Badge variant="outline" className="text-[10px] h-5 px-1 bg-slate-50 text-slate-500 font-mono border-slate-200">
                                        {student.student_code}
                                      </Badge>
                                    )}
                                    <h4 className="font-bold text-sm text-slate-900 truncate">{student.name}</h4>
                                    
                                    {b.isUnpaid && (
                                      <Badge variant="destructive" className="bg-rose-100 text-rose-600 border-none px-1.5 py-0 h-5 text-[10px] ml-1 shadow-none">
                                        待缴费
                                      </Badge>
                                    )}

                                  </div>
                                  <div className="flex items-center gap-1 text-[10px] text-slate-400 bg-slate-50 px-2 py-0.5 rounded-full shrink-0">
                                    <Clock className="h-3 w-3" /> {b.duration}h
                                  </div>
                               </div>
                               
                               <div className="flex items-center gap-3 text-xs text-slate-600 mb-2">
                                  <span className="flex items-center gap-1 truncate max-w-[140px]">
                                    <BookOpen className="h-3.5 w-3.5 text-indigo-400" /> 
                                    {subjectLabel}
                                  </span>
                                  {coachLabel ? (
                                    <>
                                      <span className="h-3 w-px bg-slate-200"></span>
                                      <span className="flex items-center gap-1 truncate">
                                        <User className="h-3.5 w-3.5 text-emerald-500" />
                                        {coachLabel}
                                      </span>
                                    </>
                                  ) : null}
                               </div>

                               <div className="flex items-center gap-1.5 text-[10px] font-medium text-slate-400 border-t border-slate-50 pt-2 mt-1">
                                  <MapPin className="h-3 w-3" /> {b.location || "线上 (Online)"}
                               </div>
                               </Link>
                               <div className="mt-2 flex justify-end">
                                 <button
                                   type="button"
                                   onClick={(e) => handleCompleteTodo(e, b)}
                                   disabled={completingId === b.id}
                                   className="flex h-8 items-center gap-1 rounded-lg bg-slate-900 px-3 text-xs font-bold text-white shadow-sm transition-colors hover:bg-slate-800 disabled:opacity-60"
                                 >
                                   {completingId === b.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
                                   完成
                                 </button>
                               </div>
                          </div>
                       </div>
                     );
                   })}
                 </div>
               )}
             </div>
          </div>

          <div className="hidden md:block space-y-6 pt-16">
             <div className="bg-white rounded-3xl border border-slate-200 p-6 shadow-sm">
                <h3 className="text-sm font-bold text-slate-900 mb-4">快捷操作</h3>
                <div className="grid grid-cols-2 gap-3">
                  <Link href={quickBookHref}>
                    <Button className="w-full h-12 rounded-xl bg-indigo-600 hover:bg-indigo-700 shadow-lg shadow-indigo-200 font-black">
                      <Zap className="mr-1.5 h-4 w-4" /> {quickBookLabel}
                    </Button>
                  </Link>
                  <Link href="/finance/add"><Button className="w-full bg-slate-900 hover:bg-slate-800 h-12 rounded-xl shadow-lg shadow-slate-200">记账</Button></Link>
                </div>
             </div>
             {!driving && !loading && stats.lowBalanceStudents.length > 0 && (
               <div className="bg-white rounded-3xl border border-rose-100 p-6">
                 <h3 className="text-sm font-bold text-slate-900 mb-4 flex items-center gap-2">
                   <AlertCircle className="h-4 w-4 text-rose-500" /> 待续费学员
                 </h3>
                 <div className="space-y-3">
                    {stats.lowBalanceStudents.map((s: any) => (
                       <Link href={`/students/${s.id}`} key={s.id} className="flex items-center justify-between group p-2 hover:bg-slate-50 rounded-lg transition-colors">
                          <div className="flex items-center gap-3">
                             <div className="h-8 w-8 rounded-full bg-rose-50 text-rose-600 flex items-center justify-center font-bold text-xs">{s.name.charAt(0)}</div>
                             <span className="text-sm text-slate-600 font-bold group-hover:text-indigo-600">{s.name}</span>
                          </div>
                          <span className="text-xs text-rose-500 font-mono font-bold bg-rose-50 px-2 py-1 rounded">{Number(s.balance)}h</span>
                       </Link>
                    ))}
                 </div>
               </div>
             )}
          </div>
        </div>

        <MobileDock />

      </main>
    </>
  );
}