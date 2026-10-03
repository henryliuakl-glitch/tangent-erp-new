"use client";

import { useEffect, useState, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { zhCN } from "date-fns/locale";
import {
  ArrowRight,
  BookOpen,
  Building2,
  CalendarDays,
  Check,
  ChevronRight,
  Clock3,
  DollarSign,
  Loader2,
  LogOut,
  MapPin,
  Plus,
  UserRound,
  UsersRound,
  WalletCards,
} from "lucide-react";
import { toast } from "sonner";

import { useBusiness } from "@/contexts/BusinessContext";
import { getDashboardStats } from "./dashboard-actions";
import { createClient } from "@/lib/supabase/client";
import { Navbar } from "@/components/Navbar";
import { MobileDock } from "@/components/MobileDock";
import { DashboardCalendar } from "@/components/DashboardCalendar";
import { completeBooking } from "@/app/bookings/actions";
import { isBookingUnpaid } from "@/lib/student-payment";
import { isDrivingSchoolBusiness } from "@/lib/business";
import {
  formatDateLabelInNZ,
  getTodayInNZ,
  isTodayInNZ,
  utcToNzTimeStr,
} from "@/lib/timezone";

function MobileAccountMenu({
  user,
  currentBusinessId,
  businesses,
  onSwitch,
  onSignOut,
}: any) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDoc = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-full border border-slate-200 bg-white shadow-sm"
        aria-label="账户与业务切换"
      >
        {user?.avatar_url ? (
          <img src={user.avatar_url} alt="" className="h-full w-full object-cover" />
        ) : (
          <UserRound className="h-5 w-5 text-slate-500" />
        )}
      </button>

      {open ? (
        <div className="absolute right-0 top-12 z-50 w-64 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl">
          <div className="border-b border-slate-100 px-4 py-3">
            <div className="text-xs font-semibold text-slate-400">当前业务</div>
          </div>
          <div className="p-2">
            {businesses.map((b: any) => (
              <button
                type="button"
                key={b.id}
                onClick={() => {
                  onSwitch(b.id);
                  setOpen(false);
                }}
                className="flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-left text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                <span className="flex items-center gap-2">
                  <Building2 className="h-4 w-4 text-slate-400" />
                  {b.name}
                </span>
                {currentBusinessId === b.id ? <Check className="h-4 w-4 text-indigo-600" /> : null}
              </button>
            ))}
          </div>
          <div className="border-t border-slate-100 p-2">
            <button
              type="button"
              onClick={onSignOut}
              className="flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-sm font-semibold text-rose-600 hover:bg-rose-50"
            >
              <LogOut className="h-4 w-4" />
              退出登录
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function MetricCard({
  label,
  value,
  meta,
  icon: Icon,
  href,
}: {
  label: string;
  value: string;
  meta: string;
  icon: any;
  href: string;
}) {
  return (
    <Link
      href={href}
      className="group rounded-2xl border border-slate-200 bg-white p-4 shadow-[0_1px_2px_rgba(15,23,42,0.04)] transition-all hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold text-slate-500">{label}</p>
          <p className="mt-2 text-2xl font-bold tracking-tight text-slate-950">{value}</p>
          <p className="mt-1 text-[11px] font-medium text-slate-400">{meta}</p>
        </div>
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-100 text-slate-600 transition-colors group-hover:bg-indigo-50 group-hover:text-indigo-600">
          <Icon className="h-4.5 w-4.5" />
        </div>
      </div>
    </Link>
  );
}

export default function Home() {
  const { currentBusinessId, currentLabel, setBusinessId } = useBusiness();
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [userProfile, setUserProfile] = useState<any>(null);
  const [businessList, setBusinessList] = useState<any[]>([]);
  const [completingId, setCompletingId] = useState<string | null>(null);
  const [stats, setStats] = useState<any>({
    cashIncome: 0,
    netCashFlow: 0,
    cashIncomeRmb: 0,
    netCashFlowRmb: 0,
    realizedRevenue: 0,
    realizedRevenueRmb: 0,
    unearnedRevenue: 0,
    unearnedRevenueRmb: 0,
    calendarBookings: [],
    lowBalanceStudents: [],
  });

  useEffect(() => {
    async function load() {
      const supabase = createClient();

      const [{ data: auth }, { data: units }] = await Promise.all([
        supabase.auth.getUser(),
        supabase.from("business_units").select("id, name").order("name"),
      ]);

      const user = auth?.user;
      if (user) {
        const { data: profile } = await supabase
          .from("profiles")
          .select("*")
          .eq("id", user.id)
          .single();

        setUserProfile(
          profile || {
            full_name: user.email?.split("@")[0],
            avatar_url: `https://api.dicebear.com/9.x/notionists/svg?seed=${user.email}`,
          }
        );
      }

      setBusinessList(
        units?.length
          ? units
          : [
              { id: "cus", name: "CuS Academy" },
              { id: "sine", name: "SINE Driving School" },
              { id: "tangent", name: "Tangent Group" },
            ]
      );

      setLoading(true);
      try {
        setStats(await getDashboardStats(currentBusinessId || "cus"));
      } catch (error) {
        console.error(error);
        toast.error("工作台数据加载失败");
      } finally {
        setLoading(false);
      }
    }

    load();
  }, [currentBusinessId]);

  const reloadStats = async () => {
    try {
      setStats(await getDashboardStats(currentBusinessId));
    } catch (error) {
      console.error(error);
    }
  };

  const handleSignOut = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
  };

  const handleComplete = async (booking: any) => {
    if (!booking.student?.id) {
      toast.error("缺少学员信息，无法消课");
      return;
    }

    if (!confirm(`确认完成 ${booking.student?.name || "该学员"} 的课程？`)) return;

    setCompletingId(booking.id);
    const result = await completeBooking(booking.id, booking.student.id, booking.duration);
    setCompletingId(null);

    if (result?.error) {
      toast.error(result.error);
      return;
    }

    toast.success("课程已完成");
    await reloadStats();
  };

  const bookings = stats.calendarBookings || [];
  const driving = isDrivingSchoolBusiness(currentBusinessId);
  const today = getTodayInNZ();

  const todayLessons = bookings
    .filter((b: any) => b.status !== "cancelled" && isTodayInNZ(b.start_time))
    .sort((a: any, b: any) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime());

  const pendingBookings = bookings
    .filter((b: any) => b.status === "confirmed")
    .sort((a: any, b: any) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime())
    .map((b: any) => ({
      ...b,
      isUnpaid: isBookingUnpaid(
        Number(b.student?.balance || 0),
        b.student?.payment_type,
        undefined,
        {
          businessUnitId: b.business_unit_id,
          level: b.student?.level,
        }
      ),
    }));

  const nextBookings = pendingBookings.slice(0, 8);
  const todayPending = todayLessons.filter((b: any) => b.status === "confirmed").length;
  const todayDone = todayLessons.filter((b: any) => b.status === "completed").length;

  const quickBookHref = driving ? "/bookings/quick" : "/bookings/new";
  const quickBookLabel = driving ? "快速排课" : "新建排课";

  const scopeName =
    currentBusinessId === "tangent"
      ? "集团工作台"
      : currentBusinessId === "sine"
        ? "驾校工作台"
        : "教培工作台";

  return (
    <>
      <div className="hidden md:block">
        <Navbar />
      </div>

      <main className="min-h-[100dvh] bg-slate-50 pb-24 text-slate-900 md:pb-10">
        <div className="mx-auto w-full max-w-[1440px] px-4 sm:px-6 lg:px-8">
          <header className="flex items-start justify-between gap-4 pb-5 pt-8 md:pb-7 md:pt-8">
            <div className="min-w-0">
              <div className="mb-1 flex flex-wrap items-center gap-2">
                <span className="text-xs font-semibold text-slate-400">
                  {format(new Date(), "M月d日 EEEE", { locale: zhCN })}
                </span>
                <span className="rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[10px] font-bold text-slate-500">
                  {currentLabel}
                </span>
              </div>
              <h1 className="text-2xl font-bold tracking-tight text-slate-950 md:text-3xl">
                {scopeName}
              </h1>
              <p className="mt-1 text-sm text-slate-500">
                今天的课程、收入和待办事项都在这里。
              </p>
            </div>

            <div className="flex shrink-0 items-center gap-2">
              <Link
                href={quickBookHref}
                className="hidden h-10 items-center gap-2 rounded-xl bg-slate-950 px-4 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-slate-800 sm:flex"
              >
                <Plus className="h-4 w-4" />
                {quickBookLabel}
              </Link>

              <div className="md:hidden">
                <MobileAccountMenu
                  user={userProfile}
                  currentBusinessId={currentBusinessId}
                  businesses={businessList}
                  onSwitch={setBusinessId}
                  onSignOut={handleSignOut}
                />
              </div>
            </div>
          </header>

          <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <MetricCard
              label="今日课程"
              value={loading ? "—" : String(todayLessons.length)}
              meta={`${todayPending} 待办 · ${todayDone} 已完成`}
              icon={CalendarDays}
              href="/bookings"
            />
            <MetricCard
              label="待办课程"
              value={loading ? "—" : String(pendingBookings.length)}
              meta="当前仍未完成"
              icon={Clock3}
              href="/bookings"
            />
            <MetricCard
              label="本月已消课"
              value={
                loading
                  ? "—"
                  : `$${Number(stats.realizedRevenue || 0).toLocaleString(undefined, {
                      maximumFractionDigits: 0,
                    })}`
              }
              meta={`¥${Number(stats.realizedRevenueRmb || 0).toLocaleString(undefined, {
                maximumFractionDigits: 0,
              })} RMB`}
              icon={DollarSign}
              href="/finance"
            />
            <MetricCard
              label="本月净现金流"
              value={
                loading
                  ? "—"
                  : `${Number(stats.netCashFlow || 0) >= 0 ? "+" : ""}$${Number(
                      stats.netCashFlow || 0
                    ).toLocaleString(undefined, { maximumFractionDigits: 0 })}`
              }
              meta={`¥${Number(stats.netCashFlowRmb || 0).toLocaleString(undefined, {
                maximumFractionDigits: 0,
              })} RMB`}
              icon={WalletCards}
              href="/finance"
            />
          </section>

          <section className="mt-5">
            {loading ? (
              <div className="flex h-72 items-center justify-center rounded-2xl border border-slate-200 bg-white">
                <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
              </div>
            ) : (
              <DashboardCalendar bookings={bookings} businessId={currentBusinessId} />
            )}
          </section>

          <section className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
            <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
              <div className="flex items-center justify-between border-b border-slate-100 px-4 py-4 sm:px-5">
                <div>
                  <h2 className="text-sm font-bold text-slate-950">接下来</h2>
                  <p className="mt-0.5 text-[11px] text-slate-400">最近 8 节待办课程</p>
                </div>
                <Link
                  href="/bookings"
                  className="flex items-center gap-1 text-xs font-semibold text-slate-500 hover:text-slate-900"
                >
                  查看全部
                  <ChevronRight className="h-4 w-4" />
                </Link>
              </div>

              {loading ? (
                <div className="flex h-40 items-center justify-center">
                  <Loader2 className="h-5 w-5 animate-spin text-slate-300" />
                </div>
              ) : nextBookings.length === 0 ? (
                <div className="px-5 py-12 text-center text-sm text-slate-400">
                  暂无待办课程
                </div>
              ) : (
                <div className="divide-y divide-slate-100">
                  {nextBookings.map((b: any) => {
                    const student = b.student || {};
                    const isToday = isTodayInNZ(b.start_time);
                    const staff = b.metadata?.coach || b.teacher || student.teacher || "";
                    const subject =
                      b.subject ||
                      student.subject ||
                      (isDrivingSchoolBusiness(b.business_unit_id) ? "练车" : "课程");

                    return (
                      <div key={b.id} className="flex items-center gap-3 px-4 py-3.5 sm:px-5">
                        <div className="w-16 shrink-0">
                          <div className="text-sm font-bold text-slate-950">
                            {utcToNzTimeStr(b.start_time)}
                          </div>
                          <div className="mt-0.5 text-[10px] font-medium text-slate-400">
                            {isToday ? "今天" : formatDateLabelInNZ(b.start_time, zhCN).split(" ")[0]}
                          </div>
                        </div>

                        <div className="min-w-0 flex-1">
                          <div className="flex min-w-0 items-center gap-2">
                            <span className="truncate text-sm font-semibold text-slate-900">
                              {student.student_code ? `${student.student_code} · ` : ""}
                              {student.name || "未知学员"}
                            </span>
                            {b.isUnpaid ? (
                              <span className="shrink-0 rounded-full bg-rose-50 px-2 py-0.5 text-[10px] font-bold text-rose-600">
                                待缴费
                              </span>
                            ) : null}
                          </div>
                          <div className="mt-1 flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-400">
                            <span className="flex items-center gap-1">
                              <BookOpen className="h-3 w-3" />
                              {subject}
                            </span>
                            {staff ? (
                              <span className="flex items-center gap-1">
                                <UserRound className="h-3 w-3" />
                                {staff}
                              </span>
                            ) : null}
                            {b.location ? (
                              <span className="flex max-w-[220px] items-center gap-1 truncate">
                                <MapPin className="h-3 w-3 shrink-0" />
                                <span className="truncate">{b.location}</span>
                              </span>
                            ) : null}
                          </div>
                        </div>

                        <button
                          type="button"
                          disabled={completingId === b.id}
                          onClick={() => handleComplete(b)}
                          className="flex h-9 shrink-0 items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 transition-colors hover:border-slate-300 hover:bg-slate-50 disabled:opacity-50"
                        >
                          {completingId === b.id ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Check className="h-3.5 w-3.5" />
                          )}
                          <span className="hidden sm:inline">完成</span>
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <aside className="space-y-5">
              <div className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
                <h2 className="text-sm font-bold text-slate-950">快捷操作</h2>
                <div className="mt-3 grid gap-2">
                  <Link
                    href={quickBookHref}
                    className="flex h-11 items-center justify-between rounded-xl bg-slate-950 px-3.5 text-sm font-semibold text-white hover:bg-slate-800"
                  >
                    <span className="flex items-center gap-2">
                      <Plus className="h-4 w-4" />
                      {quickBookLabel}
                    </span>
                    <ArrowRight className="h-4 w-4 text-slate-400" />
                  </Link>
                  <Link
                    href="/students"
                    className="flex h-11 items-center justify-between rounded-xl border border-slate-200 px-3.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                  >
                    <span className="flex items-center gap-2">
                      <UsersRound className="h-4 w-4 text-slate-400" />
                      学员管理
                    </span>
                    <ChevronRight className="h-4 w-4 text-slate-400" />
                  </Link>
                  <Link
                    href="/finance/add"
                    className="flex h-11 items-center justify-between rounded-xl border border-slate-200 px-3.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                  >
                    <span className="flex items-center gap-2">
                      <WalletCards className="h-4 w-4 text-slate-400" />
                      记一笔
                    </span>
                    <ChevronRight className="h-4 w-4 text-slate-400" />
                  </Link>
                </div>
              </div>

              {!driving && !loading && stats.lowBalanceStudents?.length > 0 ? (
                <div className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
                  <div className="flex items-center justify-between">
                    <h2 className="text-sm font-bold text-slate-950">课时提醒</h2>
                    <span className="rounded-full bg-rose-50 px-2 py-0.5 text-[10px] font-bold text-rose-600">
                      {stats.lowBalanceStudents.length}
                    </span>
                  </div>
                  <div className="mt-3 space-y-1">
                    {stats.lowBalanceStudents.slice(0, 6).map((s: any) => (
                      <Link
                        key={s.id}
                        href={`/students/${s.id}`}
                        className="flex items-center justify-between rounded-xl px-2 py-2 hover:bg-slate-50"
                      >
                        <span className="truncate text-sm font-medium text-slate-700">{s.name}</span>
                        <span className="ml-3 shrink-0 text-xs font-semibold text-rose-600">
                          {Number(s.balance)}h
                        </span>
                      </Link>
                    ))}
                  </div>
                </div>
              ) : null}
            </aside>
          </section>

          <div className="mt-4 pb-2 text-center text-[10px] text-slate-300">
            {today} · Tangent ERP
          </div>
        </div>

        <MobileDock />
      </main>
    </>
  );
}
