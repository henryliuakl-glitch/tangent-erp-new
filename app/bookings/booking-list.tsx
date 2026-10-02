"use client";

import { useState } from "react";
import { useBusiness } from "@/contexts/BusinessContext";
import { completeBooking, cancelBooking, deleteBooking, updateBooking, type BookingScope } from "./actions";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { 
  MapPin, Loader2, Trash2, Pencil, Check, 
  Calendar as CalendarIcon, FileText, Search, Plus
} from "lucide-react";
import { isPast } from "date-fns";
import { zhCN } from "date-fns/locale";
import { InvoiceModal } from "@/components/InvoiceModal";
import { DualTimezoneTime, DualTimezonePreview } from "@/components/DualTimezoneTime";
import { toast } from "sonner";
import Link from "next/link";
import { isDrivingSchoolBusiness } from "@/lib/business";
import {
  isTodayInNZ,
  isTomorrowInNZ,
  utcToNzDateKey,
  utcToNzDateStr,
  utcToNzTimeStr,
  formatDateLabelInNZ,
} from "@/lib/timezone";

type Booking = {
  id: string;
  start_time: string;
  end_time: string;
  duration: number;
  status: string;
  location: string | null;
  subject?: string | null;
  teacher?: string | null;
  student: { id: string; name: string; teacher: string | null; subject: string | null; hourly_rate?: number; student_code?: string; } | null;
  business_unit_id: string;
  actual_rate?: number | null;
  metadata?: {
    coach?: string | null;
    useInstructorCar?: boolean | null;
    plateNumber?: string | null;
  } | null;
};

type ScopeDialogState =
  | { mode: "cancel"; booking: Booking }
  | { mode: "update"; booking: Booking }
  | null;

type ScopedActionResult = {
  error?: string;
  cancelledCount?: number;
  updatedCount?: number;
};

function getStaffAccent(name?: string | null) {
  const key = (name || "").trim().toLowerCase();

  const blueNames = ["牛教练", "henry", "henry老师", "coach henry"];
  const yellowNames = ["童教练", "yvetta", "yvetta老师", "teacher yvetta"];

  if (blueNames.includes(key)) {
    return {
      line: "border-blue-300 hover:border-blue-400",
      dot: "bg-blue-500",
      card: "border-blue-200 bg-blue-50/40",
      label: "bg-blue-50 text-blue-700 border-blue-200",
    };
  }

  if (yellowNames.includes(key)) {
    return {
      line: "border-amber-300 hover:border-amber-400",
      dot: "bg-amber-400",
      card: "border-amber-200 bg-amber-50/50",
      label: "bg-amber-50 text-amber-700 border-amber-200",
    };
  }

  return {
    line: "border-slate-200 hover:border-indigo-300",
    dot: "bg-indigo-500",
    card: "border-slate-100 bg-white",
    label: "bg-slate-50 text-slate-600 border-slate-200",
  };
}

export function BookingsCta() {
  const { currentBusinessId } = useBusiness();
  const driving = isDrivingSchoolBusiness(currentBusinessId);
  return (
    <Link href={driving ? "/bookings/quick" : "/bookings/new"} className="self-end sm:self-auto">
      <Button className="h-9 rounded-xl bg-indigo-600 px-3 text-xs font-bold shadow-lg shadow-indigo-200 transition-transform active:scale-95 hover:bg-indigo-700 sm:h-10 sm:w-auto sm:px-4 sm:text-sm">
        <Plus className="mr-1 h-4 w-4 sm:mr-2 sm:h-5 sm:w-5" />
        {driving ? "极速排课" : "新建排课"}
      </Button>
    </Link>
  );
}

export function BookingList({ bookings }: { bookings: Booking[] }) {
  const { currentBusinessId } = useBusiness();
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'upcoming' | 'history'>('upcoming');

  const [editingBooking, setEditingBooking] = useState<Booking | null>(null);
  const [editDate, setEditDate] = useState("");
  const [editTime, setEditTime] = useState("");
  const [editDuration, setEditDuration] = useState("1");
  const [editLocation, setEditLocation] = useState("");
  const [editTeacher, setEditTeacher] = useState("");
  const [editRate, setEditRate] = useState("");
  const [editSubject, setEditSubject] = useState("");

  const [scopeDialog, setScopeDialog] = useState<ScopeDialogState>(null);
  const [scopeChoice, setScopeChoice] = useState<BookingScope>("single");

  const [invoiceBooking, setInvoiceBooking] = useState<Booking | null>(null);
  const [invoiceOpen, setInvoiceOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");

  const filteredByBusiness = bookings.filter((b) => {
    if (currentBusinessId === "tangent") return true;
    return b.business_unit_id === currentBusinessId;
  });

  const upcomingBookings = filteredByBusiness
    .filter(b => b.status === 'confirmed')
    .sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime());

  const historyBookings = filteredByBusiness
    .filter(b => b.status !== 'confirmed')
    .sort((a, b) => new Date(b.start_time).getTime() - new Date(a.start_time).getTime());

  const displayList = (activeTab === 'upcoming' ? upcomingBookings : historyBookings).filter((b) => {
    const q = searchTerm.trim().toLowerCase();
    if (!q) return true;
    const name = b.student?.name?.toLowerCase() || "";
    const code = b.student?.student_code?.toLowerCase() || "";
    const loc = b.location?.toLowerCase() || "";
    const subject = (b.subject || b.student?.subject || "").toLowerCase();
    const coach = (b.metadata?.coach || b.teacher || b.student?.teacher || "").toLowerCase();
    return name.includes(q) || code.includes(q) || loc.includes(q) || subject.includes(q) || coach.includes(q);
  });

  const groupedBookings: Record<string, Booking[]> = {};
  displayList.forEach(b => {
    const dateKey = utcToNzDateKey(b.start_time);
    if (!groupedBookings[dateKey]) groupedBookings[dateKey] = [];
    groupedBookings[dateKey].push(b);
  });

  const handleComplete = async (b: Booking) => {
    if (!confirm(`确认完成 ${b.student?.name} 的课程？`)) return;
    setLoadingId(b.id);
    if (b.student?.id) await completeBooking(b.id, b.student.id, b.duration);
    setLoadingId(null);
  };

  const requestCancel = (b: Booking) => {
    setScopeChoice("single");
    setScopeDialog({ mode: "cancel", booking: b });
  };

  const requestSaveEdit = () => {
    if (!editingBooking) return;
    setScopeChoice("single");
    setScopeDialog({ mode: "update", booking: editingBooking });
  };

  const confirmScopeAction = async () => {
    if (!scopeDialog) return;
    const { mode, booking } = scopeDialog;
    setLoadingId(booking.id);

    if (mode === "cancel") {
      const res = (await cancelBooking(booking.id, scopeChoice)) as ScopedActionResult;
      if (res?.error) toast.error(res.error);
      else {
        const n = res?.cancelledCount || 1;
        toast.success(n > 1 ? `已取消 ${n} 节课程` : "课程已取消");
        if (editingBooking?.id === booking.id) setEditingBooking(null);
      }
    } else {
      const res = (await updateBooking(
        booking.id,
        {
          date: editDate,
          time: editTime,
          duration: Number(editDuration),
          location: editLocation,
          teacher: editTeacher,
          actualRate: editRate.trim() === "" ? null : Number(editRate),
          subject: editSubject,
        },
        scopeChoice
      )) as ScopedActionResult;
      if (res?.error) toast.error(res.error);
      else {
        const n = res?.updatedCount || 1;
        toast.success(n > 1 ? `已更新 ${n} 节课程` : "课程已更新");
        setEditingBooking(null);
      }
    }

    setLoadingId(null);
    setScopeDialog(null);
  };

  const handleDelete = async (id: string) => {
    if (!confirm("彻底删除记录？")) return;
    setLoadingId(id); await deleteBooking(id); setLoadingId(null);
  };

  const openEdit = (b: Booking) => {
    setEditingBooking(b);
    setEditDate(utcToNzDateStr(b.start_time));
    setEditTime(utcToNzTimeStr(b.start_time));
    setEditDuration(b.duration.toString());
    setEditLocation(b.location || "");
    setEditTeacher(b.metadata?.coach || b.teacher || b.student?.teacher || "");
    setEditRate(
      b.actual_rate != null
        ? String(b.actual_rate)
        : b.student?.hourly_rate != null
          ? String(b.student.hourly_rate)
          : ""
    );
    setEditSubject(b.subject || b.student?.subject || "");
  };

  const Avatar = ({ name }: { name: string }) => {
    const avatarUrl = `https://api.dicebear.com/9.x/notionists/svg?seed=${name}&backgroundColor=e5e7eb,d1d5db,9ca3af`;
    return (
      <div className="h-10 w-10 rounded-full border border-slate-200 shadow-sm bg-white overflow-hidden flex-shrink-0">
        <img src={avatarUrl} alt={name} className="h-full w-full object-cover" />
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <Input
          placeholder="搜索学员、编号、地点、教练…"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="h-11 rounded-xl border-slate-200 bg-white pl-9 text-sm"
        />
      </div>
      <div className="mx-auto w-full max-w-md bg-slate-100 p-1 rounded-xl grid grid-cols-2">
        <button 
          onClick={() => setActiveTab('upcoming')}
          className={`py-2 text-xs font-bold rounded-lg transition-all ${
            activeTab === 'upcoming' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'
          }`}
        >
          待办 ({upcomingBookings.length})
        </button>
        <button 
          onClick={() => setActiveTab('history')}
          className={`py-2 text-xs font-bold rounded-lg transition-all ${
            activeTab === 'history' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'
          }`}
        >
          历史 ({historyBookings.length})
        </button>
      </div>

      {Object.keys(groupedBookings).length === 0 ? (
        <div className="text-center py-20">
          <div className="inline-flex h-16 w-16 items-center justify-center rounded-full bg-slate-50 text-slate-300 mb-4">
            <CalendarIcon className="h-8 w-8" />
          </div>
          <p className="text-slate-400 text-sm font-medium">
            {activeTab === 'upcoming' ? '暂无待办课程' : '暂无历史记录'}
          </p>
        </div>
      ) : (
        Object.entries(groupedBookings).map(([dateKey, items]) => {
          const sampleUtc = items[0].start_time;
          const isDateToday = isTodayInNZ(sampleUtc);
          const isDateTomorrow = isTomorrowInNZ(sampleUtc);

          let dateLabel = formatDateLabelInNZ(sampleUtc, zhCN);
          if (isDateToday) dateLabel = "今天 (Today)";
          if (isDateTomorrow) dateLabel = "明天 (Tomorrow)";

          return (
            <div key={dateKey} className="relative">
              <div className="sticky top-0 z-10 bg-slate-50 py-3 flex items-center gap-3">
                 <h3 className={`text-sm font-bold ${isDateToday ? 'text-indigo-600' : 'text-slate-500'}`}>
                   {dateLabel}
                 </h3>
                 <div className="h-px flex-1 bg-slate-200"></div>
              </div>

              <div className="space-y-3">
                {items.map(b => {
                   const isOverdue = activeTab === 'upcoming' && isPast(new Date(b.start_time)) && !isTodayInNZ(b.start_time);
                   const studentCode = b.student?.student_code?.trim() || "";
                   const studentName = b.student?.name?.trim() || "";
                   const studentTitle =
                     studentCode && studentName && studentCode !== studentName
                       ? `${studentCode} · ${studentName}`
                       : studentCode || studentName || "未知学员";
                   const subjectLabel = b.subject || b.student?.subject || "无科目";
                   const coachLabel = b.metadata?.coach || b.teacher || b.student?.teacher || null;
                   const staffAccent = getStaffAccent(coachLabel);
                   const lineClass = isOverdue ? "border-rose-300 hover:border-rose-400" : staffAccent.line;
                   const dotClass =
                     isOverdue
                       ? "bg-rose-500"
                       : b.status === "completed" || b.status === "cancelled"
                         ? "bg-slate-300"
                         : staffAccent.dot;
                   const cardClass = isOverdue
                     ? "border-rose-200 bg-rose-50/30"
                     : staffAccent.card;
                   const carLabel =
                     b.metadata?.useInstructorCar === true
                       ? "教练车"
                       : b.metadata?.useInstructorCar === false
                         ? (b.metadata?.plateNumber ? `自己车 ${b.metadata.plateNumber}` : "自己车")
                         : null;
                   const rateLabel = b.actual_rate || b.student?.hourly_rate || null;
                   
                   return (
                     <div key={b.id} className={`relative border-l-2 py-1 pl-3 transition-colors group ${lineClass}`}>
                        <div className={`absolute -left-[5px] top-4 h-2.5 w-2.5 rounded-full border-2 border-slate-50 ${dotClass}`}></div>
                        
                        <div className={`rounded-2xl border p-3 shadow-sm transition-transform active:scale-[0.99] sm:p-4 ${cardClass}`}>
                           <div className="mb-3 flex items-start justify-between gap-3">
                              <div className="flex min-w-0 items-start gap-3">
                                 <Avatar name={studentName || studentCode || "?"} />
                                 <div className="min-w-0 flex-1">
                                    <h4 className="truncate text-base font-semibold text-slate-900">{studentTitle}</h4>
                                    <p className="mt-0.5 truncate text-sm font-medium text-slate-700">{subjectLabel}</p>
                                    <div className="mt-2 flex flex-wrap items-center gap-1.5">
                                      <Badge variant="secondary" className="rounded-full px-2 py-0.5 text-[11px] font-medium">
                                        {b.status === "completed" ? "已完成" : b.status === "cancelled" ? "已取消" : "待办"}
                                      </Badge>
                                      {isOverdue && (
                                        <Badge className="rounded-full bg-rose-50 px-2 py-0.5 text-[11px] font-medium text-rose-600 hover:bg-rose-50">
                                          已过期
                                        </Badge>
                                      )}
                                      {coachLabel ? (
                                        <Badge
                                          variant="outline"
                                          className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${staffAccent.label}`}
                                        >
                                          {coachLabel}
                                        </Badge>
                                      ) : null}
                                    </div>
                                 </div>
                              </div>
                              <div className="shrink-0 text-right">
                                 <DualTimezoneTime
                                   utcIso={b.start_time}
                                   endUtc={b.end_time}
                                   durationHours={b.duration}
                                   compact
                                   className={isOverdue ? "text-rose-500" : undefined}
                                 />
                                 {rateLabel ? (
                                   <div className="mt-1 text-sm font-bold text-emerald-600">
                                     ${rateLabel}
                                   </div>
                                 ) : null}
                              </div>
                           </div>

                           <div className="space-y-2 border-t border-slate-50 pt-2">
                              <div className="space-y-1 text-xs text-slate-500">
                                <div className="flex items-start gap-1.5">
                                  <MapPin className="mt-0.5 h-3 w-3 shrink-0" />
                                  <span className="min-w-0 truncate">{b.location || "线上"}</span>
                                </div>
                                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 pl-[18px]">
                                  {coachLabel ? (
                                    <span className="truncate">
                                      {isDrivingSchoolBusiness(b.business_unit_id) ? "教练" : "老师"}：{coachLabel}
                                    </span>
                                  ) : null}
                                  {carLabel ? <span className="truncate">用车：{carLabel}</span> : null}
                                </div>
                              </div>

                              <div className="flex flex-wrap items-center justify-end gap-2">
                                {activeTab === 'upcoming' ? (
                                  <>
                                    <button onClick={() => openEdit(b)} className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-slate-50 rounded-lg transition-colors">
                                      <Pencil className="h-4 w-4" />
                                    </button>
                                    <button onClick={() => handleComplete(b)} disabled={!!loadingId} className="flex h-8 items-center gap-1 rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-bold text-white shadow-sm transition-colors hover:bg-slate-800">
                                      {loadingId === b.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
                                      <span>完成</span>
                                    </button>
                                  </>
                                ) : (
                                  <div className="flex flex-wrap items-center justify-end gap-2">
                                     {b.status === 'completed' && (
                                       <Button 
                                         size="sm" variant="outline" className="h-7 gap-1 border-indigo-100 bg-indigo-50 px-2 text-[10px] text-indigo-600 hover:bg-indigo-100"
                                         onClick={() => { setInvoiceBooking(b); setInvoiceOpen(true); }}
                                       >
                                         <FileText className="h-3 w-3" /> 单据
                                       </Button>
                                     )}
                                     
                                     <Badge variant="secondary" className="rounded-full bg-slate-50 px-2 py-0.5 text-[10px] font-normal text-slate-400">
                                       {b.status === 'completed' ? '已完成' : '已取消'}
                                     </Badge>
                                     <button onClick={() => handleDelete(b.id)} className="p-1.5 text-slate-300 hover:text-rose-500 transition-colors">
                                       <Trash2 className="h-4 w-4" />
                                     </button>
                                  </div>
                                )}
                              </div>
                           </div>
                        </div>
                     </div>
                   );
                })}
              </div>
            </div>
          );
        })
      )}

      <Dialog open={!!editingBooking} onOpenChange={(open) => !open && setEditingBooking(null)}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-[425px] rounded-2xl">
          <DialogHeader><DialogTitle>编辑课程</DialogTitle></DialogHeader>
          <div className="grid gap-5 py-4">
            <div className="grid grid-cols-4 items-center gap-4">
              <Label className="text-right text-xs text-slate-500">日期</Label>
              <Input type="date" value={editDate} onChange={(e) => setEditDate(e.target.value)} className="col-span-3 h-9" />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label className="text-right text-xs text-slate-500">时间 (NZT)</Label>
              <div className="col-span-3 space-y-1">
                <Input type="time" value={editTime} onChange={(e) => setEditTime(e.target.value)} className="h-9" />
                {editDate && editTime && (
                  <DualTimezonePreview date={editDate} time={editTime} className="mt-1" />
                )}
              </div>
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label className="text-right text-xs text-slate-500">时长</Label>
              <Input type="number" step="0.5" min="0.5" value={editDuration} onChange={(e) => setEditDuration(e.target.value)} className="col-span-3 h-9" />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label className="text-right text-xs text-slate-500">地点</Label>
              <Input value={editLocation} onChange={(e) => setEditLocation(e.target.value)} className="col-span-3 h-9" />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label className="text-right text-xs text-slate-500">
                {editingBooking && isDrivingSchoolBusiness(editingBooking.business_unit_id) ? "教练" : "老师"}
              </Label>
              <div className="col-span-3">
                <Select value={editTeacher} onValueChange={setEditTeacher}>
                  <SelectTrigger className="h-9 w-full">
                    <SelectValue placeholder={editingBooking && isDrivingSchoolBusiness(editingBooking.business_unit_id) ? "选择教练" : "选择老师"} />
                  </SelectTrigger>
                  <SelectContent>
                    {(editingBooking && isDrivingSchoolBusiness(editingBooking.business_unit_id)
                      ? ["牛教练", "童教练"]
                      : ["Henry", "Yvetta"]
                    ).map((name) => (
                      <SelectItem key={name} value={name}>{name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label className="text-right text-xs text-slate-500">价格</Label>
              <div className="col-span-3 relative">
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={editRate}
                  onChange={(e) => setEditRate(e.target.value)}
                  className="h-9 pr-12"
                  placeholder="每小时价格"
                />
                <span className="absolute right-3 top-2 text-xs text-slate-400">/h</span>
              </div>
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label className="text-right text-xs text-slate-500">课程内容</Label>
              <Input
                value={editSubject}
                onChange={(e) => setEditSubject(e.target.value)}
                className="col-span-3 h-9"
                placeholder={editingBooking && isDrivingSchoolBusiness(editingBooking.business_unit_id) ? "如：限制性练车" : "如：IGCSE Chemistry"}
              />
            </div>
            <div className="flex justify-center pt-2">
               <button onClick={() => { if (editingBooking) requestCancel(editingBooking); }} className="text-xs text-rose-500 hover:underline">
                 取消该预约
               </button>
            </div>
          </div>
          <DialogFooter>
            <Button onClick={requestSaveEdit} className="w-full bg-indigo-600 hover:bg-indigo-700 rounded-xl font-bold">保存修改</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 批量范围：仅此节 / 此节及后续 */}
      <Dialog open={!!scopeDialog} onOpenChange={(open) => !open && setScopeDialog(null)}>
        <DialogContent className="sm:max-w-[400px] rounded-2xl">
          <DialogHeader>
            <DialogTitle>
              {scopeDialog?.mode === "cancel" ? "取消课程范围" : "修改课程范围"}
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-500 pt-1">
              该课程可能属于循环排课系列。请选择操作范围：
            </DialogDescription>
          </DialogHeader>
          <RadioGroup
            value={scopeChoice}
            onValueChange={(v) => setScopeChoice(v as BookingScope)}
            className="gap-3 py-2"
          >
            <label className={`flex items-start gap-3 rounded-xl border p-3 cursor-pointer transition-colors ${scopeChoice === "single" ? "border-indigo-300 bg-indigo-50/50" : "border-slate-200"}`}>
              <RadioGroupItem value="single" id="scope-single" className="mt-0.5" />
              <div>
                <div className="text-sm font-bold text-slate-800">仅操作此课程</div>
                <div className="text-[11px] text-slate-500 mt-0.5">只影响当前这一节课</div>
              </div>
            </label>
            <label className={`flex items-start gap-3 rounded-xl border p-3 cursor-pointer transition-colors ${scopeChoice === "following" ? "border-indigo-300 bg-indigo-50/50" : "border-slate-200"}`}>
              <RadioGroupItem value="following" id="scope-following" className="mt-0.5" />
              <div>
                <div className="text-sm font-bold text-slate-800">操作此课程及后续所有课程</div>
                <div className="text-[11px] text-slate-500 mt-0.5">
                  同学员、同时长、同地点，且开始时间 ≥ 本节的全部未完成排课
                </div>
              </div>
            </label>
          </RadioGroup>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setScopeDialog(null)} className="rounded-xl">返回</Button>
            <Button
              onClick={confirmScopeAction}
              disabled={!!loadingId}
              className={`rounded-xl font-bold ${scopeDialog?.mode === "cancel" ? "bg-rose-600 hover:bg-rose-700" : "bg-indigo-600 hover:bg-indigo-700"}`}
            >
              {loadingId ? <Loader2 className="animate-spin h-4 w-4" /> : (scopeDialog?.mode === "cancel" ? "确认取消" : "确认修改")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <InvoiceModal 
        booking={invoiceBooking} 
        open={invoiceOpen} 
        onOpenChange={setInvoiceOpen} 
      />
    </div>
  );
}
