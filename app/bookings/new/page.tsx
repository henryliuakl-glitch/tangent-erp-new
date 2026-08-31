"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import type { AppRouterInstance } from "next/dist/shared/lib/app-router-context.shared-runtime";
import { useBusiness } from "@/contexts/BusinessContext";
import { createBooking, quickCreateDrivingBooking } from "../actions"; 
import { createClient } from "@/lib/supabase/client";

import { Navbar } from "@/components/Navbar";
import { Button } from "@/components/ui/button";
import { MobileDock } from "@/components/MobileDock";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea"; 
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, Loader2, MapPin, Repeat, CalendarCheck, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { DualTimezonePreview } from "@/components/DualTimezoneTime";
import { CreatableCombobox } from "@/components/CreatableCombobox";
import { addCalendarDaysInNZ, addHoursToNzDateTime, getTodayInNZ } from "@/lib/timezone";
import {
  DEFAULT_DRIVING_COACH,
  DEFAULT_DRIVING_SUBJECT,
  DRIVING_COACHES,
  defaultCoachForEmail,
  parseDrivingBookingText,
  type DrivingCoach,
} from "@/lib/driving-booking-text";
import { cn } from "@/lib/utils";
import {
  fetchFormSuggestions,
  formatDrivingPrefillSummary,
  mergeLocationOptions,
  partitionStudentsByActivity,
  searchDrivingStudentsWithLastBooking,
  type DrivingStudentPrefill,
  type StudentWithMeta,
} from "@/lib/form-suggestions";
import {
  REPEAT_MODE_OPTIONS,
  isRecurringMode,
  usesSingleTimePicker,
  usesWeeklyScheduleBuilder,
} from "@/lib/recurrence";

const VTNZ_LOCATIONS = [
  "VTNZ Glen Innes (139 Apirana Ave)", "VTNZ Mt Wellington (5 Sylvia Park Rd)", "VTNZ New Lynn (46 Portage Rd)",
  "VTNZ Westgate (6 Pinot Ln)", "VTNZ Albany (5 Saturn Pl)", "VTNZ North Shore (120 Sunnybrae Rd)",
  "VTNZ Silverdale (5 Furnace Pl)", "VTNZ Warkworth (6/14 Glenmore Dr)", "VTNZ Manukau (132 Cavendish Rd)",
  "VTNZ Manukau ABC (33 Lambie Dr)", "VTNZ Pukekohe (14 Subway Rd)", "VTNZ Takanini (14 Spartan Rd)",
  "VTNZ Wiri (103 Roscommon Rd)", "其他 (Other)"
];

const QUICK_SUBJECTS = [
  "全驾照练车",
  "限制性练车",
  "全驾照陪考",
  "限制性陪考",
  "道路熟悉练车",
] as const;

function subjectSelectValue(value: string) {
  return (QUICK_SUBJECTS as readonly string[]).includes(value) ? value : "custom";
}

const DURATION_PRESETS = [
  { value: "1", label: "1h (60 min)" },
  { value: "1.5", label: "1.5h (90 min)" },
  { value: "2", label: "2h (120 min)" },
] as const;

const FIELD =
  "h-11 w-full min-w-0 rounded-xl border-slate-200 bg-white text-sm";

function durationSelectValue(value: string) {
  const n = Number(value);
  if (n === 1) return "1";
  if (n === 1.5) return "1.5";
  if (n === 2) return "2";
  return "custom";
}

export default function NewBookingPage() {
  const router = useRouter();
  const { currentBusinessId } = useBusiness();
  const isDrivingSchool = currentBusinessId.includes('sine');

  if (isDrivingSchool) {
    return (
      <div className="flex h-dvh max-h-dvh w-full max-w-full flex-col overflow-hidden overscroll-none bg-slate-50 font-sans text-slate-900">
        <div className="hidden shrink-0 md:block"><Navbar /></div>
        <main className="mx-auto flex min-h-0 w-full max-w-xl flex-1 flex-col px-4 pt-3 pb-[calc(5rem+env(safe-area-inset-bottom,16px))] md:px-6 md:py-4">
          <div className="mb-3 flex shrink-0 items-center gap-2">
            <Button variant="outline" size="icon" className="h-9 w-9 shrink-0 rounded-xl border-slate-200 bg-white shadow-sm" onClick={() => router.back()}>
              <ArrowLeft className="h-5 w-5 text-slate-600" />
            </Button>
            <h1 className="hidden text-lg font-black text-slate-900 md:block">极速排课</h1>
          </div>
          <DrivingBookingForm businessId={currentBusinessId} router={router} />
        </main>
        <MobileDock />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-900 pb-24 md:pb-10">
      <div className="hidden md:block"><Navbar /></div>
      <main className="mx-auto max-w-xl px-4 md:px-6 py-5 md:py-8">
        
        <div className="mb-5 flex items-start gap-3 sm:mb-6 sm:items-center">
          <Button variant="outline" size="icon" className="h-9 w-9 rounded-xl border-slate-200 bg-white shadow-sm sm:h-10 sm:w-10" onClick={() => router.back()}>
            <ArrowLeft className="h-5 w-5 text-slate-600" />
          </Button>
          <div className="min-w-0">
            <h1 className="text-lg font-black text-slate-900 sm:text-xl">新建课程预约</h1>
            <p className="text-[11px] font-medium text-slate-400 sm:text-xs">New Session Booking</p>
          </div>
        </div>

        <TutoringBookingForm businessId={currentBusinessId} router={router} />

      </main>
      <MobileDock />
    </div>
  );
}

// ✅ 提取复用：高度复杂的 Zoom 级循环构建器
function RecurrenceSelector({ 
  repeatMode, setRepeatMode, 
  endMode, setEndMode, 
  repeatCount, setRepeatCount, 
  endDate, setEndDate,
  time, setTime,
  weeklySchedule, setWeeklySchedule,
  customIntervalWeeks, setCustomIntervalWeeks,
  hideTime = false,
}: {
  repeatMode: string;
  setRepeatMode: (v: string) => void;
  endMode: string;
  setEndMode: (v: string) => void;
  repeatCount: string;
  setRepeatCount: (v: string) => void;
  endDate: string;
  setEndDate: (v: string) => void;
  time: string;
  setTime: (v: string) => void;
  weeklySchedule: { dayOfWeek: string; time: string }[];
  setWeeklySchedule: (v: { dayOfWeek: string; time: string }[]) => void;
  customIntervalWeeks: string;
  setCustomIntervalWeeks: (v: string) => void;
  hideTime?: boolean;
}) {
  const recurring = isRecurringMode(repeatMode);
  const showSingleTime = usesSingleTimePicker(repeatMode);
  const showWeeklyBuilder = usesWeeklyScheduleBuilder(repeatMode);

  return (
    <div className="col-span-2 w-full min-w-0 space-y-3 rounded-2xl border border-indigo-100/50 bg-indigo-50/30 p-3 transition-all sm:p-5">
      <div className="grid w-full min-w-0 grid-cols-2 gap-3">
        <div className={hideTime ? "col-span-2 min-w-0 space-y-2" : "min-w-0 space-y-2"}>
          <Label className="text-xs text-indigo-700 font-bold uppercase pl-1 flex items-center gap-1"><Repeat className="h-3 w-3"/> 排课模式</Label>
          <Select value={repeatMode} onValueChange={setRepeatMode}>
            <SelectTrigger className={`h-12 w-full min-w-0 rounded-xl bg-white ${recurring ? 'border-indigo-400 font-bold text-indigo-700 shadow-sm' : 'border-slate-200'}`}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {REPEAT_MODE_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        
        {showSingleTime && !hideTime && (
          <div className="space-y-2 animate-in fade-in zoom-in-95">
            <Label className="text-xs text-slate-500 font-bold pl-1">上课时间 (NZT)</Label>
            <Input type="time" value={time} onChange={e => setTime(e.target.value)} className={FIELD} />
          </div>
        )}
      </div>

      {repeatMode === "custom" && (
        <div className="space-y-2 animate-in fade-in">
          <Label className="text-xs text-slate-500 font-bold pl-1">自定义间隔 (周)</Label>
          <div className="relative max-w-[200px]">
            <Input type="number" min="1" max="52" value={customIntervalWeeks} onChange={e => setCustomIntervalWeeks(e.target.value)} className="h-10 rounded-xl bg-white pr-8" />
            <span className="absolute right-3 top-2.5 text-xs text-slate-400 font-bold">周</span>
          </div>
        </div>
      )}

      {showWeeklyBuilder && (
        <div className="space-y-4 pt-3 mt-2 border-t border-indigo-100 animate-in fade-in slide-in-from-top-2">
           <div>
             <Label className="text-xs font-bold text-indigo-700 mb-2 block">每周上课时间 (Weekly Schedule)</Label>
             <div className="space-y-2">
               {weeklySchedule.map((session, index) => (
                  <div key={index} className="flex min-w-0 items-center gap-2">
                     <Select value={session.dayOfWeek} onValueChange={(val) => {
                         const newSchedule = [...weeklySchedule];
                         newSchedule[index].dayOfWeek = val;
                         setWeeklySchedule(newSchedule);
                     }}>
                        <SelectTrigger className="h-10 w-full min-w-0 flex-1 bg-white border-slate-200 shadow-sm"><SelectValue/></SelectTrigger>
                        <SelectContent>
                           <SelectItem value="1">周一 (Mon)</SelectItem><SelectItem value="2">周二 (Tue)</SelectItem>
                           <SelectItem value="3">周三 (Wed)</SelectItem><SelectItem value="4">周四 (Thu)</SelectItem>
                           <SelectItem value="5">周五 (Fri)</SelectItem><SelectItem value="6">周六 (Sat)</SelectItem>
                           <SelectItem value="0">周日 (Sun)</SelectItem>
                        </SelectContent>
                     </Select>
                     <Input type="time" value={session.time} onChange={(e) => {
                         const newSchedule = [...weeklySchedule];
                         newSchedule[index].time = e.target.value;
                         setWeeklySchedule(newSchedule);
                     }} className="h-10 w-full min-w-0 flex-1 bg-white border-slate-200 shadow-sm" />
                     {weeklySchedule.length > 1 && (
                         <Button variant="ghost" size="icon" type="button" onClick={() => setWeeklySchedule(weeklySchedule.filter((_, i) => i !== index))} className="text-rose-400 hover:text-rose-600 hover:bg-rose-50 h-10 w-10 shrink-0">
                           <Trash2 className="h-4 w-4"/>
                         </Button>
                     )}
                  </div>
               ))}
               <Button type="button" variant="outline" size="sm" className="w-full h-10 border-dashed border-indigo-300 text-indigo-600 bg-indigo-50/50 hover:bg-indigo-100 mt-2" onClick={() => setWeeklySchedule([...weeklySchedule, { dayOfWeek: "1", time: "16:00" }])}>
                 + 增加一天上课时间 (Add Time)
               </Button>
             </div>
           </div>
        </div>
      )}

      {recurring && (
           <div className="grid grid-cols-2 gap-3 pt-3 mt-3 border-t border-indigo-100 animate-in fade-in">
             <div className="space-y-2">
               <Label className="text-xs text-slate-500 font-bold pl-1">结束条件</Label>
               <Select value={endMode} onValueChange={setEndMode}>
                 <SelectTrigger className="h-10 rounded-xl bg-white border-slate-200"><SelectValue /></SelectTrigger>
                 <SelectContent>
                   <SelectItem value="count">{repeatMode === "monthly" ? "按月数结束" : "按周数结束"}</SelectItem>
                   <SelectItem value="date">按日期结束</SelectItem>
                 </SelectContent>
               </Select>
             </div>
             
             {endMode === 'count' ? (
               <div className="space-y-2">
                 <Label className="text-xs text-slate-500 font-bold pl-1">
                   {repeatMode === "monthly" ? "重复总月数" : "重复总周数"}
                 </Label>
                 <div className="relative">
                   <Input type="number" min="2" max="52" value={repeatCount} onChange={e => setRepeatCount(e.target.value)} className="h-10 rounded-xl bg-white pr-8" />
                   <span className="absolute right-3 top-2.5 text-xs text-slate-400 font-bold">{repeatMode === "monthly" ? "月" : "周"}</span>
                 </div>
               </div>
             ) : (
               <div className="space-y-2">
                 <Label className="text-xs text-slate-500 font-bold pl-1 flex items-center gap-1"><CalendarCheck className="h-3 w-3"/> 截止日期</Label>
                 <Input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="h-10 rounded-xl bg-white" />
               </div>
             )}
           </div>
      )}
    </div>
  );
}

function DrivingStudentPicker({
  businessId,
  value,
  onChange,
  onSelectPrefill,
}: {
  businessId: string;
  value: string;
  onChange: (value: string) => void;
  onSelectPrefill: (row: DrivingStudentPrefill) => void;
}) {
  const supabase = createClient();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<DrivingStudentPrefill[]>([]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    const handle = window.setTimeout(async () => {
      setLoading(true);
      const rows = await searchDrivingStudentsWithLastBooking(
        supabase,
        businessId,
        value
      );
      if (!cancelled) {
        setResults(rows);
        setLoading(false);
      }
    }, 180);
    return () => {
      cancelled = true;
      window.clearTimeout(handle);
    };
  }, [businessId, supabase, value, open]);

  return (
    <div className="relative w-full min-w-0">
      <Input
        placeholder="学员编号/姓名"
        value={value}
        autoComplete="off"
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => window.setTimeout(() => setOpen(false), 160)}
        className={`${FIELD} font-semibold`}
      />
      {open && (
        <div className="absolute z-50 mt-1 w-full max-h-64 overflow-y-auto rounded-xl border border-slate-200 bg-white py-1 shadow-lg">
          {loading && results.length === 0 ? (
            <div className="px-3 py-3 text-xs text-slate-400">查找学员与上次偏好…</div>
          ) : results.length === 0 ? (
            <div className="px-3 py-3 text-xs text-slate-400">
              {value.trim() ? "无匹配学员，提交时将自动建档" : "输入编号或姓名开始联想"}
            </div>
          ) : (
            results.map((row) => (
              <button
                key={row.id}
                type="button"
                className="flex w-full flex-col gap-0.5 px-3 py-2.5 text-left hover:bg-indigo-50"
                onMouseDown={(e) => {
                  e.preventDefault();
                  onSelectPrefill(row);
                  setOpen(false);
                }}
              >
                <span className="text-sm font-bold text-slate-800">
                  {row.student_code ? `${row.student_code} ${row.name}` : row.name}
                </span>
                <span className="text-[11px] text-slate-500">
                  {formatDrivingPrefillSummary(row).split(" · ").slice(1).join(" · ") || "暂无历史排课"}
                </span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}

// ==========================================
// 🚗 驾校专属：极速排课表单
// ==========================================
function DrivingBookingForm({ businessId, router }: { businessId: string, router: AppRouterInstance }) {
  const supabase = createClient();
  const [isLoading, setIsLoading] = useState(false);
  const parseTimerRef = useRef<number | null>(null);

  const [magicInput, setMagicInput] = useState("");
  const [identifier, setIdentifier] = useState("");
  const [date, setDate] = useState(() => getTodayInNZ());
  const [time, setTime] = useState("10:00");
  const [duration, setDuration] = useState("1");
  const [location, setLocation] = useState("");
  const [subject, setSubject] = useState<string>(DEFAULT_DRIVING_SUBJECT);
  const [coach, setCoach] = useState<DrivingCoach | "">(DEFAULT_DRIVING_COACH);
  const dateInputRef = useRef<HTMLInputElement>(null);
  const [notes, setNotes] = useState("");

  const [useInstructorCar, setUseInstructorCar] = useState(true);
  const [actualRate, setActualRate] = useState("85");
  const [needPickup, setNeedPickup] = useState(true);
  const [pickupAddress, setPickupAddress] = useState("");
  const [plateNumber, setPlateNumber] = useState("");
  const [locationOptions, setLocationOptions] = useState<string[]>(
    VTNZ_LOCATIONS.filter((l) => l !== "其他 (Other)")
  );

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      setCoach(defaultCoachForEmail(user?.email));
    });
    fetchFormSuggestions(supabase, businessId).then((s) => {
      setLocationOptions(
        mergeLocationOptions(
          s.locations,
          VTNZ_LOCATIONS.filter((l) => l !== "其他 (Other)")
        )
      );
    });
  }, [supabase, businessId]);

  useEffect(() => {
    return () => {
      if (parseTimerRef.current) window.clearTimeout(parseTimerRef.current);
    };
  }, []);

  const applyMagicParse = (text: string) => {
    const parsed = parseDrivingBookingText(text, Number(duration) || 1);
    if (!parsed) return false;

    if (parsed.studentIdentifier) setIdentifier(parsed.studentIdentifier);
    setSubject(parsed.subject);
    if (parsed.coach) setCoach(parsed.coach);
    if (parsed.useInstructorCar != null) setUseInstructorCar(parsed.useInstructorCar);
    if (parsed.needPickup) setNeedPickup(true);
    if (parsed.plateNumber) setPlateNumber(parsed.plateNumber);
    if (parsed.resolvedLocation) setLocation(parsed.resolvedLocation);
    if (parsed.suggestedHourlyRate != null) {
      setActualRate(String(parsed.suggestedHourlyRate));
    }
    return true;
  };

  const scheduleMagicParse = (text: string) => {
    if (parseTimerRef.current) window.clearTimeout(parseTimerRef.current);
    parseTimerRef.current = window.setTimeout(() => {
      if (text.trim().length >= 4) applyMagicParse(text);
    }, 200);
  };

  const applyStudentPrefill = (row: DrivingStudentPrefill) => {
    const nextId = row.student_code?.trim() || row.name;
    setIdentifier(nextId);

    const last = row.lastBooking;
    if (!last) {
      setSubject(DEFAULT_DRIVING_SUBJECT);
      return;
    }

    // 时间已在顶部选定，不回填上次上课时间，避免冲掉「时间前置」流程
    if (last.location) setLocation(last.location);
    if (last.useInstructorCar != null) {
      setUseInstructorCar(last.useInstructorCar);
      if (!(last.actualRate != null && last.actualRate > 0)) {
        setActualRate(last.useInstructorCar ? "85" : "75");
      }
    }
    if (last.actualRate != null && last.actualRate > 0) {
      setActualRate(String(last.actualRate));
    }
    if (last.duration != null && last.duration > 0) setDuration(String(last.duration));
    setSubject(last.subject?.trim() || DEFAULT_DRIVING_SUBJECT);
    setNeedPickup(last.needPickup);
    if (last.pickupAddress) setPickupAddress(last.pickupAddress);
    if (last.plateNumber) setPlateNumber(last.plateNumber);
  };

  const submitBooking = async () => {
    if (!identifier || !date || !location || !subject) {
      toast.warning("请补全必填信息");
      return;
    }
    if (!Number(duration)) {
      toast.warning("请填写时长");
      return;
    }
    if (!time) {
      toast.warning("请填写时间");
      return;
    }

    setIsLoading(true);
    const formData = new FormData();
    formData.append("businessId", businessId);
    formData.append("identifier", identifier);
    formData.append("date", date);
    formData.append("time", time);
    formData.append("duration", duration);
    formData.append("location", location);
    formData.append("actualRate", actualRate);
    formData.append("useInstructorCar", String(useInstructorCar));
    formData.append("needPickup", String(needPickup));
    formData.append("subject", subject);
    if (coach) formData.append("coach", coach);
    formData.append("repeatMode", "none");
    formData.append("endMode", "count");
    formData.append("repeatCount", "1");
    formData.append("endDate", "");
    formData.append("customIntervalWeeks", "1");
    formData.append("weeklySchedule", JSON.stringify([]));

    if (notes) formData.append("notes", notes);
    if (pickupAddress) formData.append("pickupAddress", pickupAddress);
    if (plateNumber) formData.append("plateNumber", plateNumber);

    const result = await quickCreateDrivingBooking(formData);
    setIsLoading(false);

    if (result && result.error) toast.error(result.error);
    else {
      toast.success("已排课，可继续排下一节", {
        action: {
          label: "课表",
          onClick: () => router.push("/bookings"),
        },
      });
      const next = addHoursToNzDateTime(date, time, Number(duration) || 1);
      setDate(next.date);
      setTime(next.time);
      setIdentifier("");
      setMagicInput("");
      setNotes("");
      setPickupAddress("");
      setPlateNumber("");
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await submitBooking();
  };

  const handleMagicKeyDown = async (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== "Enter") return;
    e.preventDefault();
    const text = magicInput.trim();
    if (text) applyMagicParse(text);
    await submitBooking();
  };

  const todayNz = getTodayInNZ();
  const tomorrowNz = addCalendarDaysInNZ(todayNz, 1);
  const dayAfterNz = addCalendarDaysInNZ(todayNz, 2);
  const nextWeekNz = addCalendarDaysInNZ(todayNz, 7);
  const isCustomDate =
    date !== todayNz &&
    date !== tomorrowNz &&
    date !== dayAfterNz &&
    date !== nextWeekNz;

  const openCustomCalendar = () => {
    const el = dateInputRef.current;
    if (!el) return;
    if (typeof el.showPicker === "function") el.showPicker();
    else el.focus();
  };

  const DatePill = ({
    label,
    active,
    onClick,
  }: {
    label: string;
    active: boolean;
    onClick: () => void;
  }) => (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "h-8 w-full min-w-0 rounded-full px-1 text-[10px] font-bold leading-tight transition-all active:scale-95 sm:text-[11px]",
        active
          ? "bg-indigo-600 text-white shadow-sm"
          : "border border-slate-200 bg-white text-slate-600"
      )}
    >
      {label}
    </button>
  );

  const durationMode = durationSelectValue(duration);
  const subjectMode = subjectSelectValue(subject);

  return (
    <form
      onSubmit={handleSubmit}
      className="flex min-h-0 flex-1 flex-col"
    >
      <div className="flex min-h-0 flex-1 flex-col justify-center gap-3.5 overflow-y-auto overscroll-contain py-1">
        <div className="grid w-full min-w-0 grid-cols-5 gap-2">
          <DatePill label="今天" active={date === todayNz} onClick={() => setDate(todayNz)} />
          <DatePill label="明天" active={date === tomorrowNz} onClick={() => setDate(tomorrowNz)} />
          <DatePill label="后天" active={date === dayAfterNz} onClick={() => setDate(dayAfterNz)} />
          <DatePill label="下周今天" active={date === nextWeekNz} onClick={() => setDate(nextWeekNz)} />
          <DatePill label="自定义" active={isCustomDate} onClick={openCustomCalendar} />
        </div>

        <div className="grid w-full min-w-0 grid-cols-3 gap-3">
          <Input
            ref={dateInputRef}
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className={FIELD}
            aria-label="日期"
          />
          <Input
            type="time"
            value={time}
            onChange={(e) => setTime(e.target.value)}
            className={FIELD}
            aria-label="开始时间"
          />
          {durationMode === "custom" ? (
            <div className="relative min-w-0">
              <Input
                type="number"
                step="0.5"
                min="0.5"
                placeholder="时长 h"
                value={duration}
                onChange={(e) => setDuration(e.target.value)}
                className={`${FIELD} pr-8`}
                aria-label="自定义时长"
              />
              <button
                type="button"
                onClick={() => setDuration("1")}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] font-bold text-indigo-500"
              >
                预设
              </button>
            </div>
          ) : (
            <Select
              value={durationMode}
              onValueChange={(v) => {
                if (v === "custom") {
                  setDuration("");
                  return;
                }
                setDuration(v);
              }}
            >
              <SelectTrigger className={FIELD}>
                <SelectValue placeholder="时长" />
              </SelectTrigger>
              <SelectContent position="popper" className="w-[var(--radix-select-trigger-width)]">
                {DURATION_PRESETS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                ))}
                <SelectItem value="custom">自定义</SelectItem>
              </SelectContent>
            </Select>
          )}
        </div>

        <Input
          placeholder="极速排课"
          value={magicInput}
          onChange={(e) => {
            const v = e.target.value;
            setMagicInput(v);
            scheduleMagicParse(v);
          }}
          onKeyDown={handleMagicKeyDown}
          className={`${FIELD} border-indigo-200 bg-indigo-50/40`}
        />

        <div className="grid w-full min-w-0 grid-cols-3 gap-3">
          <DrivingStudentPicker
            businessId={businessId}
            value={identifier}
            onChange={setIdentifier}
            onSelectPrefill={applyStudentPrefill}
          />
          {subjectMode === "custom" ? (
            <div className="relative min-w-0">
              <Input
                placeholder="自定义科目"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                className={`${FIELD} pr-8`}
              />
              <button
                type="button"
                onClick={() => setSubject(DEFAULT_DRIVING_SUBJECT)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] font-bold text-indigo-500"
              >
                预设
              </button>
            </div>
          ) : (
            <Select
              value={subjectMode}
              onValueChange={(v) => {
                if (v === "custom") {
                  setSubject("");
                  return;
                }
                setSubject(v);
              }}
            >
              <SelectTrigger className={FIELD}>
                <SelectValue placeholder="课程阶段" />
              </SelectTrigger>
              <SelectContent position="popper" className="w-[var(--radix-select-trigger-width)]">
                {QUICK_SUBJECTS.map((s) => (
                  <SelectItem key={s} value={s}>{s}</SelectItem>
                ))}
                <SelectItem value="custom">自定义</SelectItem>
              </SelectContent>
            </Select>
          )}
          <Select value={coach || undefined} onValueChange={(v) => setCoach(v as DrivingCoach)}>
            <SelectTrigger className={FIELD}>
              <SelectValue placeholder="教练" />
            </SelectTrigger>
            <SelectContent position="popper" className="w-[var(--radix-select-trigger-width)]">
              {DRIVING_COACHES.map((c) => (
                <SelectItem key={c} value={c}>{c}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <CreatableCombobox
          value={location}
          onChange={setLocation}
          options={locationOptions}
          placeholder="练车地点"
          inputClassName={FIELD}
        />

        <div className="grid w-full min-w-0 grid-cols-3 gap-3">
          <Select
            value={useInstructorCar ? "instructor" : "own"}
            onValueChange={(v) => {
              const instructor = v === "instructor";
              setUseInstructorCar(instructor);
              setActualRate(instructor ? "85" : "75");
            }}
          >
            <SelectTrigger className={FIELD}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent position="popper" className="w-[var(--radix-select-trigger-width)]">
              <SelectItem value="instructor">教练车</SelectItem>
              <SelectItem value="own">自己车</SelectItem>
            </SelectContent>
          </Select>
          <Select
            value={needPickup ? "pickup" : "self"}
            onValueChange={(v) => setNeedPickup(v === "pickup")}
          >
            <SelectTrigger className={FIELD}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent position="popper" className="w-[var(--radix-select-trigger-width)]">
              <SelectItem value="pickup">上门接送</SelectItem>
              <SelectItem value="self">自行前往</SelectItem>
            </SelectContent>
          </Select>
          <Input
            type="number"
            placeholder="单价 $/h"
            value={actualRate}
            onChange={(e) => setActualRate(e.target.value)}
            className={`${FIELD} text-right font-semibold text-emerald-600`}
          />
        </div>

        {(needPickup || !useInstructorCar) && (
          <div className={`grid w-full min-w-0 gap-3 ${needPickup && !useInstructorCar ? "grid-cols-2" : "grid-cols-1"}`}>
            {needPickup && (
              <Input
                placeholder="接送地址"
                value={pickupAddress}
                onChange={(e) => setPickupAddress(e.target.value)}
                className={FIELD}
              />
            )}
            {!useInstructorCar && (
              <Input
                placeholder="车牌号"
                value={plateNumber}
                onChange={(e) => setPlateNumber(e.target.value.toUpperCase())}
                className={FIELD}
              />
            )}
          </div>
        )}

        <Input
          placeholder="备注信息 (选填)"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          className={FIELD}
        />
      </div>

      <Button
        type="submit"
        disabled={isLoading}
        className="mt-3 h-12 w-full min-w-0 shrink-0 rounded-2xl bg-indigo-600 text-base font-semibold shadow-lg shadow-indigo-200 hover:bg-indigo-700 active:scale-[0.98]"
      >
        {isLoading ? (
          <>
            <Loader2 className="mr-2 animate-spin" />
            提交中...
          </>
        ) : (
          "一键排课"
        )}
      </Button>
    </form>
  );
}

// ==========================================
// 📚 教培专属：标准排课表单
// ==========================================
function TutoringBookingForm({ businessId, router }: { businessId: string, router: AppRouterInstance }) {
  const supabase = createClient();
  const [isLoading, setIsLoading] = useState(false);
  const [students, setStudents] = useState<StudentWithMeta[]>([]);
  const [activeStudents, setActiveStudents] = useState<StudentWithMeta[]>([]);
  const [inactiveStudents, setInactiveStudents] = useState<StudentWithMeta[]>([]);
  const [subjectOptions, setSubjectOptions] = useState<string[]>([]);
  const [teacherOptions, setTeacherOptions] = useState<string[]>([]);
  const [locationOptions, setLocationOptions] = useState<string[]>(["2 Bently Ave", "线上"]);
  
  const [selectedStudent, setSelectedStudent] = useState("");
  const [date, setDate] = useState(() => getTodayInNZ());
  const [time, setTime] = useState("16:00");
  const [duration, setDuration] = useState("1");
  const [location, setLocation] = useState("线上");
  const [subject, setSubject] = useState("");
  const [teacher, setTeacher] = useState("Henry");
  const [notes, setNotes] = useState("");
  
  const [repeatMode, setRepeatMode] = useState("none");
  const [endMode, setEndMode] = useState("count");
  const [repeatCount, setRepeatCount] = useState("10");
  const [endDate, setEndDate] = useState("");
  const [weeklySchedule, setWeeklySchedule] = useState([{ dayOfWeek: "1", time: "16:00" }]);
  const [customIntervalWeeks, setCustomIntervalWeeks] = useState("1");

  useEffect(() => {
    async function fetchData() {
      const oneMonthAgo = new Date();
      oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);

      const [studentsRes, bookingsRes, suggestions] = await Promise.all([
        supabase
          .from("students")
          .select("id, name, student_code, subject")
          .eq("business_unit_id", businessId)
          .order("student_code", { ascending: true }),
        supabase
          .from("bookings")
          .select("student_id")
          .eq("business_unit_id", businessId)
          .gte("start_time", oneMonthAgo.toISOString())
          .neq("status", "cancelled"),
        fetchFormSuggestions(supabase, businessId),
      ]);

      const list = (studentsRes.data ?? []) as StudentWithMeta[];
      setStudents(list);

      const activeIds = new Set(
        (bookingsRes.data ?? []).map((b) => b.student_id).filter(Boolean)
      );
      const { active, inactive } = partitionStudentsByActivity(list, activeIds);
      setActiveStudents(active);
      setInactiveStudents(inactive);

      setSubjectOptions(suggestions.subjects);
      setTeacherOptions(suggestions.teachers);
      setLocationOptions(mergeLocationOptions(suggestions.locations));
    }
    fetchData();
  }, [businessId, supabase]);

  const handleStudentChange = (studentId: string) => {
    setSelectedStudent(studentId);
    const s = students.find(st => st.id === studentId);
    if (s?.subject) {
      setSubject(s.subject);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedStudent || !date || !location) { toast.warning("请补全信息"); return; }
    if (usesSingleTimePicker(repeatMode) && !time) { toast.warning("请填写时间"); return; }
    if (isRecurringMode(repeatMode) && endMode === 'date' && !endDate) { toast.warning("请选择结束日期"); return; }

    setIsLoading(true);
    const formData = new FormData();
    formData.append("studentId", selectedStudent);
    formData.append("date", date);
    formData.append("time", time);
    formData.append("duration", duration);
    formData.append("location", location);
    formData.append("businessId", businessId);
    formData.append("subject", subject);
    formData.append("teacher", teacher);
    
    // 注入循环参数
    formData.append("repeatMode", repeatMode);
    formData.append("endMode", endMode);
    formData.append("repeatCount", repeatCount);
    formData.append("endDate", endDate);
    formData.append("customIntervalWeeks", customIntervalWeeks);
    formData.append("weeklySchedule", JSON.stringify(weeklySchedule));

    if (notes) formData.append("notes", notes); 

    const result = await createBooking(null, formData);
    setIsLoading(false);

    if (result && result.error) toast.error(result.error);
    else { 
       toast.success(isRecurringMode(repeatMode) ? "批量排课成功！" : "课程预约已创建"); 
       router.push("/bookings"); 
    }
  };

  const renderStudentItem = (s: StudentWithMeta) => (
    <SelectItem key={s.id} value={s.id} className="py-3 font-medium">
      <span className="font-mono text-slate-400 mr-2">{s.student_code ? `[${s.student_code}]` : ''}</span>{s.name}
    </SelectItem>
  );

  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="space-y-2">
          <Label className="text-xs text-slate-400 font-bold uppercase pl-1">学员 (Student)</Label>
          <Select value={selectedStudent} onValueChange={handleStudentChange}>
            <SelectTrigger className="h-12 rounded-xl bg-white font-medium text-slate-900 w-full"><SelectValue placeholder="选择学员..." /></SelectTrigger>
            <SelectContent className="max-h-72">
              {activeStudents.length > 0 && (
                <SelectGroup>
                  <SelectLabel className="text-indigo-600 font-bold text-xs px-2 py-2">
                    活跃学员 · 近一月有课
                  </SelectLabel>
                  {activeStudents.map(renderStudentItem)}
                </SelectGroup>
              )}
              {activeStudents.length > 0 && inactiveStudents.length > 0 && (
                <div className="my-1 border-t border-slate-100" />
              )}
              {inactiveStudents.length > 0 && (
                <SelectGroup>
                  <SelectLabel className="text-slate-400 font-bold text-xs px-2 py-2">
                    沉寂学员 · 超一月未排课
                  </SelectLabel>
                  {inactiveStudents.map(renderStudentItem)}
                </SelectGroup>
              )}
              {students.length === 0 && (
                <SelectItem value="_empty" disabled>暂无学员，请先添加</SelectItem>
              )}
            </SelectContent>
          </Select>
        </div>
        <div className="grid grid-cols-2 gap-4">
           <div className="space-y-2">
            <Label className="text-xs text-slate-400 font-bold uppercase pl-1">科目 (Subject)</Label>
            <CreatableCombobox
              value={subject}
              onChange={setSubject}
              options={subjectOptions}
              placeholder="选择或输入科目"
            />
          </div>
          <div className="space-y-2">
            <Label className="text-xs text-slate-400 font-bold uppercase pl-1">老师 (Teacher)</Label>
            <CreatableCombobox
              value={teacher}
              onChange={setTeacher}
              options={teacherOptions}
              placeholder="选择或输入老师"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2"><Label className="text-xs text-slate-400 font-bold uppercase pl-1">首节日期 (Start Date)</Label><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="h-12 rounded-xl" /></div>
          <div className="space-y-2"><Label className="text-xs text-slate-400 font-bold uppercase pl-1">单节时长 (Hours)</Label><div className="relative"><Input type="number" step="0.5" min="0.5" value={duration} onChange={(e) => setDuration(e.target.value)} className="h-12 rounded-xl pr-8" /><span className="absolute right-4 top-3.5 text-xs font-bold text-slate-400">h</span></div></div>
        </div>
        
        <RecurrenceSelector repeatMode={repeatMode} setRepeatMode={setRepeatMode} endMode={endMode} setEndMode={setEndMode} repeatCount={repeatCount} setRepeatCount={setRepeatCount} endDate={endDate} setEndDate={setEndDate} time={time} setTime={setTime} weeklySchedule={weeklySchedule} setWeeklySchedule={setWeeklySchedule} customIntervalWeeks={customIntervalWeeks} setCustomIntervalWeeks={setCustomIntervalWeeks} />
        {usesSingleTimePicker(repeatMode) && date && time && (
          <DualTimezonePreview date={date} time={time} />
        )}

        <div className="space-y-2">
            <Label className="text-xs text-slate-400 font-bold uppercase pl-1">地点 (Location)</Label>
            <div className="relative">
              <CreatableCombobox
                value={location}
                onChange={setLocation}
                options={locationOptions}
                placeholder="选择或输入地点"
              />
              <MapPin className="absolute right-3 top-3.5 h-5 w-5 text-slate-400 pointer-events-none" />
            </div>
        </div>
        
        <div className="space-y-2">
          <Label className="text-xs text-slate-400 font-bold uppercase pl-1">备注 (Notes)</Label>
          <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} className="rounded-xl border-slate-200 bg-white" placeholder="选填..." />
        </div>

        <Button type="submit" disabled={isLoading} className="h-14 w-full rounded-2xl bg-indigo-600 hover:bg-indigo-700 text-base font-bold shadow-lg shadow-indigo-200 mt-4 transition-all active:scale-95">
          {isLoading ? <><Loader2 className="mr-2 h-5 animate-spin" /> 创建中...</> : (isRecurringMode(repeatMode) ? "批量生成" : "确认预约")}
        </Button>
      </form>
    </div>
  );
}