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
  Pencil,
  UserRound,
  UsersRound,
  WalletCards,
} from "lucide-react";
import { toast } from "sonner";

import { useBusiness } from "@/contexts/BusinessContext";
import { getDashboardCalendar, getDashboardStats } from "./dashboard-actions";
import { createClient } from "@/lib/supabase/client";
import { Navbar } from "@/components/Navbar";
import { MobileDock } from "@/components/MobileDock";
import { DashboardCalendar } from "@/components/DashboardCalendar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { IncomeSourceSelect } from "@/components/IncomeSourceSelect";
import { MobileAccountMenu } from "@/components/MobileAccountMenu";
import { completeBooking, updateBooking } from "@/app/bookings/actions";
import { isBookingUnpaid, isPayAsYouGo } from "@/lib/student-payment";
import { isDrivingSchoolBusiness } from "@/lib/business";
import {
  formatDateLabelInNZ,
  getTodayInNZ,
  isTodayInNZ,
  utcToNzDateStr,
  utcToNzTimeStr,
} from "@/lib/timezone";

function bookingEndLabel(booking: any) {
  if (booking?.end_time) return utcToNzTimeStr(booking.end_time);
  const duration = Number(booking?.duration || 1);
  return utcToNzTimeStr(
    new Date(new Date(booking.start_time).getTime() + duration * 3600000).toISOString()
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
      className="group rounded-xl border border-slate-200 bg-white px-3.5 py-3 shadow-[0_1px_2px_rgba(15,23,42,0.04)] transition-all hover:border-slate-300 hover:shadow-sm"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold text-slate-500">{label}</p>
          <p className="mt-1 text-xl font-bold tracking-tight text-slate-950">{value}</p>
          <p className="mt-0.5 text-[10px] font-medium text-slate-400">{meta}</p>
        </div>
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-100 text-slate-600 transition-colors group-hover:bg-indigo-50 group-hover:text-indigo-600">
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
  const [calendarLoading, setCalendarLoading] = useState(true);
  const [calendarBookings, setCalendarBookings] = useState<any[]>([]);
  const [userProfile, setUserProfile] = useState<any>(null);
  const [businessList, setBusinessList] = useState<any[]>([]);
  const [completingId, setCompletingId] = useState<string | null>(null);
  const [completeTarget, setCompleteTarget] = useState<any>(null);
  const [completeIncomeSource, setCompleteIncomeSource] = useState("");
  const [editTarget, setEditTarget] = useState<any>(null);
  const [editSaving, setEditSaving] = useState(false);
  const [editDate, setEditDate] = useState("");
  const [editTime, setEditTime] = useState("");
  const [editDuration, setEditDuration] = useState("1");
  const [editLocation, setEditLocation] = useState("");
  const [editStaff, setEditStaff] = useState("");
  const [editRate, setEditRate] = useState("");
  const [editSubject, setEditSubject] = useState("");
  const [stats, setStats] = useState<any>({
    cashIncome: 0,
    netCashFlow: 0,
    cashIncomeRmb: 0,
    netCashFlowRmb: 0,
    realizedRevenue: 0,
    realizedRevenueRmb: 0,
    unearnedRevenue: 0,
    unearnedRevenueRmb: 0,
    lowBalanceStudents: [],
  });

  useEffect(() => {
    let cancelled = false;

    async function loadStats() {
      if (currentBusinessId === "family") {
        router.replace("/family");
        return;
      }

      setLoading(true);

      try {
        const nextStats = await getDashboardStats(currentBusinessId || "cus");
        if (!cancelled) setStats(nextStats);
      } catch (error) {
        console.error("[dashboard] stats load failed:", error);
        if (!cancelled) toast.error("工作台核心数据加载失败");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void loadStats();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentBusinessId]);

  useEffect(() => {
    let cancelled = false;

    async function loadCalendar() {
      if (currentBusinessId === "family") return;
      setCalendarLoading(true);

      try {
        const result = await getDashboardCalendar(currentBusinessId || "cus");
        if (cancelled) return;
        setCalendarBookings(result.bookings || []);
        if (result.error) {
          console.error("[dashboard] calendar partial error:", result.error);
        }
      } catch (error) {
        console.error("[dashboard] calendar load failed:", error);
        if (!cancelled) {
          setCalendarBookings([]);
          toast.error("工作台日历加载失败");
        }
      } finally {
        if (!cancelled) setCalendarLoading(false);
      }
    }

    void loadCalendar();

    return () => {
      cancelled = true;
    };
  }, [currentBusinessId]);

  useEffect(() => {
    let cancelled = false;
    const supabase = createClient();

    async function loadShellData() {
      try {
        const [authResult, unitsResult] = await Promise.allSettled([
          supabase.auth.getUser(),
          supabase.from("business_units").select("id, name").order("name"),
        ]);

        if (cancelled) return;

        const auth =
          authResult.status === "fulfilled"
            ? authResult.value.data
            : null;

        const units =
          unitsResult.status === "fulfilled"
            ? unitsResult.value.data
            : null;

        const baseUnits =
          units?.length
            ? units
            : [
                { id: "cus", name: "CuS Academy" },
                { id: "sine", name: "SINE Driving School" },
                { id: "tangent", name: "Tangent Group" },
              ];

        setBusinessList([
          { id: "family", name: "Family" },
          ...baseUnits.filter((unit: any) => unit.id !== "family"),
        ]);

        const user = auth?.user;
        if (!user) return;

        const { data: profile } = await supabase
          .from("profiles")
          .select("*")
          .eq("id", user.id)
          .single();

        if (cancelled) return;

        setUserProfile(
          profile || {
            full_name: user.email?.split("@")[0],
            avatar_url: `https://api.dicebear.com/9.x/notionists/svg?seed=${user.email}`,
          }
        );
      } catch (error) {
        console.error("[dashboard] shell data load failed:", error);
      }
    }

    void loadShellData();

    return () => {
      cancelled = true;
    };
  }, []);
  const reloadStats = async () => {
    try {
      const [nextStats, nextCalendar] = await Promise.all([
        getDashboardStats(currentBusinessId),
        getDashboardCalendar(currentBusinessId),
      ]);
      setStats(nextStats);
      setCalendarBookings(nextCalendar.bookings || []);
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

    if (isPayAsYouGo(booking.student?.payment_type)) {
      setCompleteTarget(booking);
      setCompleteIncomeSource(
        booking.metadata?.incomeSource || booking.student?.income_source || ""
      );
      return;
    }

    if (!confirm(`确认完成 ${booking.student?.name || "该学员"} 的课程？将扣除 ${booking.duration}h 预付课时。`)) return;

    setCompletingId(booking.id);
    const result = await completeBooking(booking.id, booking.student.id, booking.duration);
    setCompletingId(null);

    if (result?.error) {
      toast.error(result.error);
      return;
    }

    toast.success("课程已完成 · 已扣预付课时");
    await reloadStats();
  };

  const confirmPayAsYouGoComplete = async () => {
    if (!completeTarget?.student?.id || !completeIncomeSource) return;

    setCompletingId(completeTarget.id);
    const result = await completeBooking(
      completeTarget.id,
      completeTarget.student.id,
      completeTarget.duration,
      completeIncomeSource
    );
    setCompletingId(null);

    if (result?.error) {
      toast.error(result.error);
      return;
    }

    toast.success(`课程已完成 · ${completeIncomeSource}`);
    setCompleteTarget(null);
    setCompleteIncomeSource("");
    await reloadStats();
  };

  const openBookingEdit = (booking: any) => {
    setEditTarget(booking);
    setEditDate(utcToNzDateStr(booking.start_time));
    setEditTime(utcToNzTimeStr(booking.start_time));
    setEditDuration(String(booking.duration || 1));
    setEditLocation(booking.location || "");
    setEditStaff(
      booking.metadata?.coach ||
      booking.teacher ||
      booking.student?.teacher ||
      ""
    );
    setEditRate(
      booking.actual_rate != null
        ? String(booking.actual_rate)
        : booking.student?.hourly_rate != null
          ? String(booking.student.hourly_rate)
          : ""
    );
    setEditSubject(
      booking.subject ||
      booking.student?.subject ||
      (isDrivingSchoolBusiness(booking.business_unit_id) ? "练车" : "")
    );
  };

  const saveBookingEdit = async () => {
    if (!editTarget) return;

    const duration = Number(editDuration);
    const actualRate = editRate.trim() === "" ? null : Number(editRate);

    if (!editDate || !editTime || !Number.isFinite(duration) || duration <= 0) {
      toast.error("请检查日期、时间和时长");
      return;
    }
    if (actualRate != null && (!Number.isFinite(actualRate) || actualRate < 0)) {
      toast.error("请检查课费");
      return;
    }

    setEditSaving(true);
    const result = await updateBooking(
      editTarget.id,
      {
        date: editDate,
        time: editTime,
        duration,
        location: editLocation,
        teacher: editStaff,
        actualRate,
        subject: editSubject,
      },
      "single"
    );
    setEditSaving(false);

    if (result?.error) {
      toast.error(result.error);
      return;
    }

    toast.success("排课信息已更新");
    setEditTarget(null);
    await reloadStats();
  };

  const bookings = calendarBookings;
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
          <header className="flex items-start justify-between gap-4 pb-3 pt-4 md:pb-4 md:pt-5">
            <div className="min-w-0">
              <div className="mb-1 flex flex-wrap items-center gap-2">
                <span className="text-xs font-semibold text-slate-400">
                  {format(new Date(), "M月d日 EEEE", { locale: zhCN })}
                </span>
                <span className="rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[10px] font-bold text-slate-500">
                  {currentLabel}
                </span>
              </div>
              <h1 className="text-xl font-bold tracking-tight text-slate-950 md:text-2xl">
                {scopeName}
              </h1>
              <p className="mt-0.5 text-xs text-slate-500">
                课程、收入与待办
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
                  onSwitch={(id: string) => {
                    setBusinessId(id);
                    if (id === "family") router.push("/family");
                  }}
                  onSignOut={handleSignOut}
                />
              </div>
            </div>
          </header>

          <section className="grid grid-cols-2 gap-2 lg:grid-cols-6">
            <MetricCard
              label="今日课程"
              value={calendarLoading ? "—" : String(todayLessons.length)}
              meta={`${todayPending} 待办 · ${todayDone} 已完成`}
              icon={CalendarDays}
              href="/bookings"
            />
            <MetricCard
              label="待办课程"
              value={calendarLoading ? "—" : String(pendingBookings.length)}
              meta="当前仍未完成"
              icon={Clock3}
              href="/bookings"
            />
            <MetricCard
              label="本月已消课"
              value={
                loading
                  ? "—"
                  : `${Number(stats.realizedRevenue || 0).toLocaleString(undefined, {
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
              label="预收课时负债"
              value={
                loading
                  ? "—"
                  : `${Number(stats.unearnedRevenue || 0).toLocaleString(undefined, {
                      maximumFractionDigits: 0,
                    })}`
              }
              meta={`¥${Number(stats.unearnedRevenueRmb || 0).toLocaleString(undefined, {
                maximumFractionDigits: 0,
              })} RMB · 仅预充值学员`}
              icon={BookOpen}
              href="/students"
            />
            <MetricCard
              label="本月现金收入"
              value={
                loading
                  ? "—"
                  : `${Number(stats.cashIncome || 0).toLocaleString(undefined, {
                      maximumFractionDigits: 0,
                    })}`
              }
              meta={`¥${Number(stats.cashIncomeRmb || 0).toLocaleString(undefined, {
                maximumFractionDigits: 0,
              })} RMB · 充值/一课一结`}
              icon={WalletCards}
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

          <section className="mt-3 grid gap-3 xl:grid-cols-[minmax(0,1.65fr)_minmax(340px,0.85fr)]">
            <div className="min-w-0">
              {calendarLoading ? (
                <div className="flex h-[410px] items-center justify-center rounded-xl border border-slate-200 bg-white">
                  <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
                </div>
              ) : (
                <DashboardCalendar bookings={bookings} businessId={currentBusinessId} />
              )}
            </div>

            <div className="grid min-w-0 gap-3 content-start">
              <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
                <div className="flex items-center justify-between border-b border-slate-100 px-3.5 py-2.5">
                  <div>
                    <h2 className="text-sm font-bold text-slate-950">接下来</h2>
                    <p className="text-[10px] text-slate-400">最近 8 节待办课程</p>
                  </div>
                  <Link
                    href="/bookings"
                    className="flex items-center gap-1 text-[11px] font-semibold text-slate-500 hover:text-slate-900"
                  >
                    全部
                    <ChevronRight className="h-3.5 w-3.5" />
                  </Link>
                </div>

                {calendarLoading ? (
                  <div className="flex h-32 items-center justify-center">
                    <Loader2 className="h-5 w-5 animate-spin text-slate-300" />
                  </div>
                ) : nextBookings.length === 0 ? (
                  <div className="px-4 py-8 text-center text-xs text-slate-400">
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
                        <div key={b.id} className="flex items-center gap-2.5 px-3.5 py-2.5">
                          <div className="w-13 shrink-0">
                            <div className="text-[12px] font-bold tabular-nums text-slate-950">
                              {utcToNzTimeStr(b.start_time)}–{bookingEndLabel(b)}
                            </div>
                            <div className="text-[9px] font-medium text-slate-400">
                              {isToday ? "今天" : formatDateLabelInNZ(b.start_time, zhCN).split(" ")[0]}
                            </div>
                          </div>

                          <div className="min-w-0 flex-1">
                            <div className="flex min-w-0 items-center gap-1.5">
                              <span className="truncate text-xs font-semibold text-slate-900">
                                {student.student_code ? `${student.student_code} · ` : ""}
                                {student.name || "未知学员"}
                              </span>
                              {b.isUnpaid ? (
                                <span className="shrink-0 rounded bg-rose-50 px-1.5 py-0.5 text-[9px] font-bold text-rose-600">
                                  待缴
                                </span>
                              ) : null}
                            </div>
                            <div className="mt-0.5 flex min-w-0 items-center gap-2 text-[10px] text-slate-400">
                              <span className="truncate">{subject}</span>
                              {staff ? <span className="shrink-0">· {staff}</span> : null}
                            </div>
                          </div>

                          <div className="flex shrink-0 items-center gap-1">
                            <button
                              type="button"
                              onClick={() => openBookingEdit(b)}
                              className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 hover:bg-slate-50 hover:text-indigo-600"
                              aria-label="编辑排课"
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </button>
                            <button
                              type="button"
                              disabled={completingId === b.id}
                              onClick={() => handleComplete(b)}
                              className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 disabled:opacity-50"
                              aria-label="完成课程"
                            >
                              {completingId === b.id ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              ) : (
                                <Check className="h-3.5 w-3.5" />
                              )}
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-2">
                <Link
                  href={quickBookHref}
                  className="flex h-10 items-center justify-between rounded-xl bg-slate-950 px-3 text-xs font-semibold text-white hover:bg-slate-800"
                >
                  <span className="flex items-center gap-1.5">
                    <Plus className="h-3.5 w-3.5" />
                    {quickBookLabel}
                  </span>
                  <ArrowRight className="h-3.5 w-3.5 text-slate-400" />
                </Link>
                <Link
                  href="/finance/add"
                  className="flex h-10 items-center justify-between rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                >
                  <span className="flex items-center gap-1.5">
                    <WalletCards className="h-3.5 w-3.5 text-slate-400" />
                    记一笔
                  </span>
                  <ChevronRight className="h-3.5 w-3.5 text-slate-400" />
                </Link>
              </div>

              {!loading && stats.lowBalanceStudents?.length > 0 ? (
                <div className="rounded-xl border border-slate-200 bg-white p-3.5">
                  <div className="mb-2 flex items-center justify-between">
                    <h2 className="text-xs font-bold text-slate-950">课时提醒</h2>
                    <span className="rounded-full bg-rose-50 px-1.5 py-0.5 text-[9px] font-bold text-rose-600">
                      {stats.lowBalanceStudents.length}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-x-3 gap-y-1">
                    {stats.lowBalanceStudents.slice(0, 6).map((s: any) => (
                      <Link
                        key={s.id}
                        href={`/students/${s.id}`}
                        className="flex items-center justify-between rounded-lg px-1.5 py-1.5 hover:bg-slate-50"
                      >
                        <span className="truncate text-[11px] font-medium text-slate-700">{s.name}</span>
                        <span className="ml-2 shrink-0 text-[10px] font-semibold text-rose-600">
                          {Number(s.balance)}h
                        </span>
                      </Link>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          </section>

          <div className="mt-4 pb-2 text-center text-[10px] text-slate-300">
            {today} · Tangent ERP
          </div>
        </div>

        <Dialog
          open={!!editTarget}
          onOpenChange={(open) => {
            if (!open && !editSaving) setEditTarget(null);
          }}
        >
          <DialogContent className="rounded-2xl sm:max-w-[460px]">
            <DialogHeader>
              <DialogTitle>编辑排课</DialogTitle>
              <DialogDescription>
                {editTarget?.student?.name || "该学员"} · 直接修改本节课程
              </DialogDescription>
            </DialogHeader>

            <div className="grid gap-3 py-2">
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label className="text-[11px] font-semibold text-slate-500">日期</Label>
                  <Input
                    type="date"
                    value={editDate}
                    onChange={(e) => setEditDate(e.target.value)}
                    className="h-10 rounded-xl"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-[11px] font-semibold text-slate-500">时间</Label>
                  <Input
                    type="time"
                    value={editTime}
                    onChange={(e) => setEditTime(e.target.value)}
                    className="h-10 rounded-xl"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label className="text-[11px] font-semibold text-slate-500">时长（小时）</Label>
                  <Input
                    type="number"
                    min="0.5"
                    step="0.5"
                    value={editDuration}
                    onChange={(e) => setEditDuration(e.target.value)}
                    className="h-10 rounded-xl"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-[11px] font-semibold text-slate-500">课费 / h</Label>
                  <Input
                    type="number"
                    min="0"
                    value={editRate}
                    onChange={(e) => setEditRate(e.target.value)}
                    className="h-10 rounded-xl"
                    placeholder="可留空"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <Label className="text-[11px] font-semibold text-slate-500">课程 / 科目</Label>
                <Input
                  value={editSubject}
                  onChange={(e) => setEditSubject(e.target.value)}
                  className="h-10 rounded-xl"
                />
              </div>

              <div className="space-y-1">
                <Label className="text-[11px] font-semibold text-slate-500">
                  {isDrivingSchoolBusiness(editTarget?.business_unit_id) ? "教练" : "老师"}
                </Label>
                <Input
                  value={editStaff}
                  onChange={(e) => setEditStaff(e.target.value)}
                  className="h-10 rounded-xl"
                />
              </div>

              <div className="space-y-1">
                <Label className="text-[11px] font-semibold text-slate-500">地点</Label>
                <Input
                  value={editLocation}
                  onChange={(e) => setEditLocation(e.target.value)}
                  className="h-10 rounded-xl"
                  placeholder={isDrivingSchoolBusiness(editTarget?.business_unit_id) ? "见面地址" : "上课地点 / 线上"}
                />
              </div>
            </div>

            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setEditTarget(null)}
                disabled={editSaving}
              >
                取消
              </Button>
              <Button
                onClick={saveBookingEdit}
                disabled={editSaving}
                className="bg-slate-950 hover:bg-slate-800"
              >
                {editSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Pencil className="mr-2 h-4 w-4" />}
                保存修改
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog
          open={!!completeTarget}
          onOpenChange={(open) => {
            if (!open && !completingId) {
              setCompleteTarget(null);
              setCompleteIncomeSource("");
            }
          }}
        >
          <DialogContent className="sm:max-w-[420px] rounded-2xl">
            <DialogHeader>
              <DialogTitle>确认课程完成</DialogTitle>
              <DialogDescription>
                {completeTarget?.student?.name || "该学员"} · {completeTarget?.duration || 0}h
              </DialogDescription>
            </DialogHeader>
            <div className="py-3">
              <IncomeSourceSelect
                value={completeIncomeSource}
                onChange={setCompleteIncomeSource}
                label="本次实际收款账户"
              />
              <p className="mt-2 text-[11px] leading-relaxed text-slate-400">
                一课一结：完成课程时同时记现金收入与消课产值，并同步更新 Family 实际账户。
              </p>
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setCompleteTarget(null)}
                disabled={!!completingId}
              >
                取消
              </Button>
              <Button
                onClick={confirmPayAsYouGoComplete}
                disabled={!completeIncomeSource || !!completingId}
                className="bg-slate-900 hover:bg-slate-800"
              >
                {completingId ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Check className="mr-2 h-4 w-4" />}
                确认完成并入账
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <MobileDock />
      </main>
    </>
  );
}
