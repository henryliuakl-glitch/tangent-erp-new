"use client";

import { useEffect, useMemo, useState } from "react";
import { useBusiness } from "@/contexts/BusinessContext";
import { Navbar } from "@/components/Navbar";
import { MobileDock } from "@/components/MobileDock";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  AlertTriangle,
  CalendarClock,
  Car,
  Gauge,
  Loader2,
  Pencil,
  Plus,
  ShieldCheck,
  Trash2,
  Wrench,
} from "lucide-react";
import { toast } from "sonner";
import {
  addMaintenance,
  createVehicle,
  deleteMaintenance,
  deleteVehicle,
  listVehicles,
  updateVehicle,
} from "./actions";

type Vehicle = {
  id: string;
  business_unit_id: string;
  nickname: string;
  make: string;
  model: string;
  year?: number | null;
  color?: string | null;
  plate_number: string;
  transmission?: string | null;
  usage_status: string;
  primary_driver?: string | null;
  owner?: string | null;
  purchase_date?: string | null;
  purchase_price?: number | null;
  current_odometer_km: number;
  wof_expiry?: string | null;
  rego_expiry?: string | null;
  insurance_provider?: string | null;
  insurance_policy_number?: string | null;
  insurance_type?: string | null;
  insurance_premium_amount?: number | null;
  insurance_premium_frequency?: string | null;
  insurance_expiry?: string | null;
  next_service_date?: string | null;
  next_service_odometer_km?: number | null;
  condition_status: string;
  known_issues?: string | null;
  tyre_status?: string | null;
  battery_status?: string | null;
  notes?: string | null;
};

type Maintenance = {
  id: string;
  vehicle_id: string;
  service_date: string;
  odometer_km?: number | null;
  service_types: string[];
  cost: number;
  provider?: string | null;
  notes?: string | null;
  receipt_url?: string | null;
  transaction_id?: string | null;
};

const SERVICE_TYPES = [
  "机油",
  "机滤",
  "空滤",
  "火花塞",
  "变速箱油",
  "刹车油",
  "冷却液",
  "轮胎",
  "刹车片/刹车盘",
  "电瓶",
  "WOF",
  "Rego",
  "其他维修",
];

const INITIAL_FORM = {
  nickname: "",
  make: "",
  model: "",
  year: "",
  color: "",
  plateNumber: "",
  transmission: "AT",
  usageStatus: "teaching",
  primaryDriver: "",
  owner: "",
  purchaseDate: "",
  purchasePrice: "",
  currentOdometerKm: "",
  wofExpiry: "",
  regoExpiry: "",
  insuranceProvider: "",
  insurancePolicyNumber: "",
  insuranceType: "Comprehensive",
  insurancePremiumAmount: "",
  insurancePremiumFrequency: "annual",
  insuranceExpiry: "",
  nextServiceDate: "",
  nextServiceOdometerKm: "",
  conditionStatus: "normal",
  knownIssues: "",
  tyreStatus: "normal",
  batteryStatus: "normal",
  notes: "",
};

function daysUntil(date?: string | null) {
  if (!date) return null;
  const target = new Date(`${date}T12:00:00`);
  const today = new Date();
  today.setHours(12, 0, 0, 0);
  return Math.ceil((target.getTime() - today.getTime()) / 86400000);
}

function expiryTone(date?: string | null) {
  const d = daysUntil(date);
  if (d == null) return "text-slate-400";
  if (d < 0) return "text-rose-600";
  if (d <= 30) return "text-amber-600";
  return "text-slate-700";
}

function expiryText(date?: string | null) {
  if (!date) return "未记录";
  const d = daysUntil(date);
  if (d == null) return date;
  if (d < 0) return `${date} · 已过期 ${Math.abs(d)} 天`;
  if (d <= 30) return `${date} · ${d} 天后`;
  return date;
}

function statusMeta(status: string) {
  if (status === "stop") return { label: "停驶", cls: "bg-rose-50 text-rose-600 border-rose-200" };
  if (status === "urgent") return { label: "尽快维修", cls: "bg-orange-50 text-orange-600 border-orange-200" };
  if (status === "attention") return { label: "注意", cls: "bg-amber-50 text-amber-700 border-amber-200" };
  return { label: "正常", cls: "bg-emerald-50 text-emerald-700 border-emerald-200" };
}

export default function VehiclesPage() {
  const { currentBusinessId } = useBusiness();
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [maintenance, setMaintenance] = useState<Maintenance[]>([]);
  const [loading, setLoading] = useState(true);
  const [schemaError, setSchemaError] = useState("");
  const [vehicleDialogOpen, setVehicleDialogOpen] = useState(false);
  const [editingVehicle, setEditingVehicle] = useState<Vehicle | null>(null);
  const [vehicleForm, setVehicleForm] = useState({ ...INITIAL_FORM });
  const [maintenanceVehicle, setMaintenanceVehicle] = useState<Vehicle | null>(null);
  const [saving, setSaving] = useState(false);
  const [selectedServiceTypes, setSelectedServiceTypes] = useState<string[]>(["机油", "机滤"]);
  const [maintenanceForm, setMaintenanceForm] = useState({
    serviceDate: new Date().toISOString().slice(0, 10),
    odometerKm: "",
    cost: "",
    provider: "",
    notes: "",
    receiptUrl: "",
    syncFinance: true,
  });

  const canManage = currentBusinessId === "sine" || currentBusinessId === "tangent";

  async function load() {
    setLoading(true);
    const res = await listVehicles();
    setLoading(false);
    if (res.error) {
      setSchemaError(res.error);
      setVehicles(res.vehicles as Vehicle[]);
      setMaintenance(res.maintenance as Maintenance[]);
      return;
    }
    setSchemaError("");
    setVehicles(res.vehicles as Vehicle[]);
    setMaintenance(res.maintenance as Maintenance[]);
  }

  useEffect(() => {
    if (canManage) void load();
    else setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentBusinessId]);

  const maintenanceByVehicle = useMemo(() => {
    const map = new Map<string, Maintenance[]>();
    maintenance.forEach((row) => {
      const list = map.get(row.vehicle_id) || [];
      list.push(row);
      map.set(row.vehicle_id, list);
    });
    return map;
  }, [maintenance]);

  const totalMaintenanceCost = maintenance.reduce((sum, row) => sum + Number(row.cost || 0), 0);

  const openNewVehicle = () => {
    setEditingVehicle(null);
    setVehicleForm({ ...INITIAL_FORM });
    setVehicleDialogOpen(true);
  };

  const openEditVehicle = (v: Vehicle) => {
    setEditingVehicle(v);
    setVehicleForm({
      nickname: v.nickname || "",
      make: v.make || "",
      model: v.model || "",
      year: v.year ? String(v.year) : "",
      color: v.color || "",
      plateNumber: v.plate_number || "",
      transmission: v.transmission || "AT",
      usageStatus: v.usage_status || "teaching",
      primaryDriver: v.primary_driver || "",
      owner: v.owner || "",
      purchaseDate: v.purchase_date || "",
      purchasePrice: v.purchase_price != null ? String(v.purchase_price) : "",
      currentOdometerKm: String(v.current_odometer_km || 0),
      wofExpiry: v.wof_expiry || "",
      regoExpiry: v.rego_expiry || "",
      insuranceProvider: v.insurance_provider || "",
      insurancePolicyNumber: v.insurance_policy_number || "",
      insuranceType: v.insurance_type || "Comprehensive",
      insurancePremiumAmount: v.insurance_premium_amount != null ? String(v.insurance_premium_amount) : "",
      insurancePremiumFrequency: v.insurance_premium_frequency || "annual",
      insuranceExpiry: v.insurance_expiry || "",
      nextServiceDate: v.next_service_date || "",
      nextServiceOdometerKm: v.next_service_odometer_km != null ? String(v.next_service_odometer_km) : "",
      conditionStatus: v.condition_status || "normal",
      knownIssues: v.known_issues || "",
      tyreStatus: v.tyre_status || "normal",
      batteryStatus: v.battery_status || "normal",
      notes: v.notes || "",
    });
    setVehicleDialogOpen(true);
  };

  const saveVehicle = async () => {
    setSaving(true);
    const fd = new FormData();
    Object.entries(vehicleForm).forEach(([key, value]) => fd.append(key, value));
    const res = editingVehicle
      ? await updateVehicle(editingVehicle.id, fd)
      : await createVehicle(fd);
    setSaving(false);

    if (res.error) {
      toast.error(res.error);
      return;
    }
    toast.success(editingVehicle ? "车辆资料已更新" : "车辆已添加");
    setVehicleDialogOpen(false);
    await load();
  };

  const removeVehicle = async (v: Vehicle) => {
    if (!confirm(`删除 ${v.nickname}？该车的保养记录也会一并删除。`)) return;
    const res = await deleteVehicle(v.id);
    if (res.error) toast.error(res.error);
    else {
      toast.success("车辆已删除");
      await load();
    }
  };

  const openMaintenance = (v: Vehicle) => {
    setMaintenanceVehicle(v);
    setSelectedServiceTypes(["机油", "机滤"]);
    setMaintenanceForm({
      serviceDate: new Date().toISOString().slice(0, 10),
      odometerKm: String(v.current_odometer_km || ""),
      cost: "",
      provider: "",
      notes: "",
      receiptUrl: "",
      syncFinance: true,
    });
  };

  const saveMaintenance = async () => {
    if (!maintenanceVehicle) return;
    setSaving(true);
    const fd = new FormData();
    fd.append("vehicleId", maintenanceVehicle.id);
    fd.append("serviceDate", maintenanceForm.serviceDate);
    fd.append("odometerKm", maintenanceForm.odometerKm);
    fd.append("cost", maintenanceForm.cost);
    fd.append("provider", maintenanceForm.provider);
    fd.append("notes", maintenanceForm.notes);
    fd.append("receiptUrl", maintenanceForm.receiptUrl);
    fd.append("syncFinance", String(maintenanceForm.syncFinance));
    selectedServiceTypes.forEach((type) => fd.append("serviceTypes", type));

    const res = await addMaintenance(fd);
    setSaving(false);
    if (res.error) {
      toast.error(res.error);
      return;
    }
    toast.success(maintenanceForm.syncFinance && Number(maintenanceForm.cost) > 0 ? "已记录，并同步到 Sine 财务" : "保养记录已保存");
    setMaintenanceVehicle(null);
    await load();
  };

  const removeMaintenance = async (row: Maintenance) => {
    if (!confirm("删除这条保养记录？如果它关联了自动生成的财务流水，也会一起删除。")) return;
    const res = await deleteMaintenance(row.id);
    if (res.error) toast.error(res.error);
    else {
      toast.success("记录已删除");
      await load();
    }
  };

  if (!canManage) {
    return (
      <div className="min-h-screen bg-slate-50 pb-24">
        <div className="hidden md:block"><Navbar /></div>
        <main className="mx-auto max-w-xl px-4 py-16 text-center">
          <Car className="mx-auto h-12 w-12 text-slate-300" />
          <h1 className="mt-4 text-xl font-black text-slate-900">车辆管理属于 Sine 驾校</h1>
          <p className="mt-2 text-sm text-slate-500">切换到 Sine Driving 或 Tangent Group 后即可查看和管理家里/驾校车辆。</p>
        </main>
        <MobileDock />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 pb-24 text-slate-900 md:pb-10">
      <div className="hidden md:block"><Navbar /></div>
      <main className="mx-auto max-w-6xl px-3 py-3 md:px-6 md:py-8">
        <div className="mb-3 flex items-center justify-between gap-3 md:mb-6">
          <div>
            <div className="flex items-center gap-2">
              <Car className="h-5 w-5 text-indigo-600" />
              <h1 className="text-xl font-black tracking-tight md:text-2xl">车辆管理</h1>
            </div>
            <p className="mt-1 text-[11px] font-medium text-slate-400">公里数、WOF / Rego、保险、保养维修与车辆成本</p>
          </div>
          <Button onClick={openNewVehicle} className="h-9 rounded-xl bg-slate-950 px-3 text-xs font-bold hover:bg-slate-800 md:h-10 md:px-4 md:text-sm">
            <Plus className="mr-1.5 h-4 w-4" /> 添加车辆
          </Button>
        </div>

        {schemaError ? (
          <div className="mb-4 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
            <div className="font-bold">车辆模块数据库尚未初始化</div>
            <div className="mt-1 text-xs leading-relaxed">
              已经把车辆管理 migration 推到 main；生产 Supabase 执行 migration 后这里会自动恢复。当前错误：{schemaError}
            </div>
          </div>
        ) : null}

        <div className="mb-3 grid grid-cols-3 gap-2">
          <div className="rounded-xl border border-slate-200 bg-white p-3">
            <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">车辆</div>
            <div className="mt-1 text-xl font-black">{vehicles.length}</div>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-3">
            <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">保养记录</div>
            <div className="mt-1 text-xl font-black">{maintenance.length}</div>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-3">
            <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">维修保养成本</div>
            <div className="mt-1 text-xl font-black">${totalMaintenanceCost.toLocaleString()}</div>
          </div>
        </div>

        {loading ? (
          <div className="flex h-48 items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-slate-300" />
          </div>
        ) : vehicles.length === 0 ? (
          <button onClick={openNewVehicle} className="flex w-full flex-col items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-white py-16 text-center">
            <Car className="h-12 w-12 text-slate-200" />
            <div className="mt-3 text-sm font-bold text-slate-600">还没有车辆</div>
            <div className="mt-1 text-xs text-slate-400">先把小白、小灰、小蓝、大灰录进来</div>
          </button>
        ) : (
          <div className="grid gap-3 lg:grid-cols-2">
            {vehicles.map((v) => {
              const records = maintenanceByVehicle.get(v.id) || [];
              const last = records[0];
              const status = statusMeta(v.condition_status);
              const serviceKmRemaining =
                v.next_service_odometer_km != null
                  ? Number(v.next_service_odometer_km) - Number(v.current_odometer_km || 0)
                  : null;
              const serviceDue =
                (serviceKmRemaining != null && serviceKmRemaining <= 500) ||
                (daysUntil(v.next_service_date) != null && Number(daysUntil(v.next_service_date)) <= 30);

              return (
                <div key={v.id} className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                  <div className="border-b border-slate-100 p-3.5">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <h2 className="text-lg font-black text-slate-950">{v.nickname}</h2>
                          <Badge variant="outline" className={`h-5 px-1.5 text-[9px] font-bold ${status.cls}`}>{status.label}</Badge>
                          {serviceDue ? (
                            <Badge variant="outline" className="h-5 border-amber-200 bg-amber-50 px-1.5 text-[9px] font-bold text-amber-700">
                              保养将到期
                            </Badge>
                          ) : null}
                        </div>
                        <div className="mt-0.5 text-xs font-medium text-slate-500">
                          {[v.year, v.make, v.model, v.transmission].filter(Boolean).join(" · ")}
                        </div>
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          <span className="rounded-lg bg-slate-100 px-2 py-1 font-mono text-[11px] font-bold text-slate-700">{v.plate_number}</span>
                          {v.primary_driver ? <span className="rounded-lg bg-blue-50 px-2 py-1 text-[10px] font-bold text-blue-700">{v.primary_driver}</span> : null}
                          {v.owner ? <span className="rounded-lg bg-slate-50 px-2 py-1 text-[10px] font-semibold text-slate-500">归属：{v.owner}</span> : null}
                        </div>
                      </div>
                      <div className="flex shrink-0 gap-1">
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEditVehicle(v)}><Pencil className="h-4 w-4" /></Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-300 hover:text-rose-600" onClick={() => removeVehicle(v)}><Trash2 className="h-4 w-4" /></Button>
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-px bg-slate-100">
                    <div className="bg-white p-3">
                      <div className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-slate-400"><Gauge className="h-3.5 w-3.5" /> 当前公里数</div>
                      <div className="mt-1 text-lg font-black tabular-nums">{Number(v.current_odometer_km || 0).toLocaleString()} km</div>
                    </div>
                    <div className="bg-white p-3">
                      <div className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-slate-400"><Wrench className="h-3.5 w-3.5" /> 下次保养</div>
                      <div className={`mt-1 text-sm font-black ${serviceDue ? "text-amber-700" : "text-slate-800"}`}>
                        {v.next_service_odometer_km ? `${Number(v.next_service_odometer_km).toLocaleString()} km` : v.next_service_date || "未设置"}
                      </div>
                    </div>
                  </div>

                  <div className="space-y-2.5 p-3.5">
                    <div className="grid grid-cols-[72px_1fr] items-start gap-2 text-xs">
                      <span className="font-semibold text-slate-400">WOF</span>
                      <span className={`font-bold ${expiryTone(v.wof_expiry)}`}>{expiryText(v.wof_expiry)}</span>
                    </div>
                    <div className="grid grid-cols-[72px_1fr] items-start gap-2 text-xs">
                      <span className="font-semibold text-slate-400">Rego</span>
                      <span className={`font-bold ${expiryTone(v.rego_expiry)}`}>{expiryText(v.rego_expiry)}</span>
                    </div>
                    <div className="grid grid-cols-[72px_1fr] items-start gap-2 text-xs">
                      <span className="font-semibold text-slate-400">保险</span>
                      <div>
                        <span className={`font-bold ${expiryTone(v.insurance_expiry)}`}>{expiryText(v.insurance_expiry)}</span>
                        {v.insurance_provider ? <span className="ml-2 text-slate-400">{v.insurance_provider}</span> : null}
                      </div>
                    </div>

                    {v.known_issues ? (
                      <div className="flex gap-2 rounded-xl border border-amber-100 bg-amber-50/60 p-2.5 text-[11px] text-amber-800">
                        <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                        <span>{v.known_issues}</span>
                      </div>
                    ) : null}

                    <div className="rounded-xl bg-slate-50 p-2.5">
                      <div className="mb-1.5 flex items-center justify-between">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">最近保养/维修</span>
                        <button onClick={() => openMaintenance(v)} className="text-[10px] font-bold text-indigo-600">+ 添加记录</button>
                      </div>
                      {last ? (
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <div className="truncate text-xs font-bold text-slate-700">{last.service_types.join(" · ")}</div>
                            <div className="mt-0.5 text-[10px] text-slate-400">
                              {last.service_date}{last.odometer_km ? ` · ${Number(last.odometer_km).toLocaleString()} km` : ""}{last.provider ? ` · ${last.provider}` : ""}
                            </div>
                          </div>
                          <div className="shrink-0 text-xs font-black text-slate-700">${Number(last.cost || 0).toLocaleString()}</div>
                        </div>
                      ) : (
                        <div className="text-[11px] text-slate-400">暂无记录</div>
                      )}
                    </div>

                    {records.length > 0 ? (
                      <details className="group">
                        <summary className="cursor-pointer list-none text-[11px] font-bold text-slate-500">查看全部 {records.length} 条记录</summary>
                        <div className="mt-2 space-y-1.5">
                          {records.map((row) => (
                            <div key={row.id} className="flex items-center justify-between gap-2 rounded-lg border border-slate-100 px-2.5 py-2">
                              <div className="min-w-0">
                                <div className="truncate text-[11px] font-semibold text-slate-700">{row.service_types.join(" · ")}</div>
                                <div className="text-[9px] text-slate-400">{row.service_date}{row.transaction_id ? " · 已同步财务" : ""}</div>
                              </div>
                              <div className="flex shrink-0 items-center gap-1">
                                <span className="text-[11px] font-bold">${Number(row.cost || 0).toLocaleString()}</span>
                                <button onClick={() => removeMaintenance(row)} className="p-1 text-slate-300 hover:text-rose-500"><Trash2 className="h-3.5 w-3.5" /></button>
                              </div>
                            </div>
                          ))}
                        </div>
                      </details>
                    ) : null}
                  </div>

                  <div className="grid grid-cols-2 gap-2 border-t border-slate-100 p-3">
                    <Button variant="outline" className="h-9 rounded-xl text-xs font-bold" onClick={() => openEditVehicle(v)}>
                      <Pencil className="mr-1.5 h-3.5 w-3.5" /> 更新车辆
                    </Button>
                    <Button className="h-9 rounded-xl bg-indigo-600 text-xs font-bold hover:bg-indigo-700" onClick={() => openMaintenance(v)}>
                      <Wrench className="mr-1.5 h-3.5 w-3.5" /> 记录保养
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>

      <Dialog open={vehicleDialogOpen} onOpenChange={setVehicleDialogOpen}>
        <DialogContent className="max-h-[88dvh] overflow-y-auto rounded-2xl sm:max-w-2xl">
          <DialogHeader><DialogTitle>{editingVehicle ? `编辑车辆 · ${editingVehicle.nickname}` : "添加车辆"}</DialogTitle></DialogHeader>
          <div className="space-y-4 py-1">
            <section>
              <div className="mb-2 text-[11px] font-black uppercase tracking-wider text-slate-400">基本资料</div>
              <div className="grid grid-cols-2 gap-2">
                {[
                  ["nickname", "车辆昵称 *", "小白"],
                  ["plateNumber", "车牌号 *", "ABC123"],
                  ["make", "品牌 *", "Suzuki"],
                  ["model", "车型 *", "Swift"],
                  ["year", "年份", "2010"],
                  ["color", "颜色", "Grey"],
                ].map(([key, label, placeholder]) => (
                  <div key={key} className="space-y-1">
                    <Label className="text-[10px] font-semibold text-slate-500">{label}</Label>
                    <Input value={(vehicleForm as any)[key]} onChange={(e) => setVehicleForm((p) => ({ ...p, [key]: e.target.value }))} placeholder={placeholder} className="h-9 rounded-xl" />
                  </div>
                ))}
                <div className="space-y-1">
                  <Label className="text-[10px] font-semibold text-slate-500">变速箱</Label>
                  <Select value={vehicleForm.transmission} onValueChange={(v) => setVehicleForm((p) => ({ ...p, transmission: v }))}>
                    <SelectTrigger className="h-9 rounded-xl"><SelectValue /></SelectTrigger>
                    <SelectContent><SelectItem value="AT">自动 AT</SelectItem><SelectItem value="MT">手动 MT</SelectItem><SelectItem value="CVT">CVT</SelectItem><SelectItem value="Other">其他</SelectItem></SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-[10px] font-semibold text-slate-500">当前用途</Label>
                  <Select value={vehicleForm.usageStatus} onValueChange={(v) => setVehicleForm((p) => ({ ...p, usageStatus: v }))}>
                    <SelectTrigger className="h-9 rounded-xl"><SelectValue /></SelectTrigger>
                    <SelectContent><SelectItem value="teaching">教学车</SelectItem><SelectItem value="personal">家用</SelectItem><SelectItem value="backup">备用</SelectItem><SelectItem value="inactive">停用</SelectItem></SelectContent>
                  </Select>
                </div>
                <div className="space-y-1"><Label className="text-[10px] font-semibold text-slate-500">主要教练</Label><Input value={vehicleForm.primaryDriver} onChange={(e) => setVehicleForm((p) => ({ ...p, primaryDriver: e.target.value }))} placeholder="牛教练 / 童教练" className="h-9 rounded-xl" /></div>
                <div className="space-y-1"><Label className="text-[10px] font-semibold text-slate-500">车辆归属</Label><Input value={vehicleForm.owner} onChange={(e) => setVehicleForm((p) => ({ ...p, owner: e.target.value }))} placeholder="Henry / Yutong / Joint / Sine" className="h-9 rounded-xl" /></div>
              </div>
            </section>

            <section>
              <div className="mb-2 text-[11px] font-black uppercase tracking-wider text-slate-400">公里数与合规</div>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1"><Label className="text-[10px] font-semibold text-slate-500">当前公里数</Label><Input type="number" value={vehicleForm.currentOdometerKm} onChange={(e) => setVehicleForm((p) => ({ ...p, currentOdometerKm: e.target.value }))} className="h-9 rounded-xl" /></div>
                <div className="space-y-1"><Label className="text-[10px] font-semibold text-slate-500">车辆状态</Label><Select value={vehicleForm.conditionStatus} onValueChange={(v) => setVehicleForm((p) => ({ ...p, conditionStatus: v }))}><SelectTrigger className="h-9 rounded-xl"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="normal">正常</SelectItem><SelectItem value="attention">注意</SelectItem><SelectItem value="urgent">尽快维修</SelectItem><SelectItem value="stop">停驶</SelectItem></SelectContent></Select></div>
                <div className="space-y-1"><Label className="text-[10px] font-semibold text-slate-500">WOF 到期</Label><Input type="date" value={vehicleForm.wofExpiry} onChange={(e) => setVehicleForm((p) => ({ ...p, wofExpiry: e.target.value }))} className="h-9 rounded-xl" /></div>
                <div className="space-y-1"><Label className="text-[10px] font-semibold text-slate-500">Rego 到期</Label><Input type="date" value={vehicleForm.regoExpiry} onChange={(e) => setVehicleForm((p) => ({ ...p, regoExpiry: e.target.value }))} className="h-9 rounded-xl" /></div>
                <div className="space-y-1"><Label className="text-[10px] font-semibold text-slate-500">下次保养日期</Label><Input type="date" value={vehicleForm.nextServiceDate} onChange={(e) => setVehicleForm((p) => ({ ...p, nextServiceDate: e.target.value }))} className="h-9 rounded-xl" /></div>
                <div className="space-y-1"><Label className="text-[10px] font-semibold text-slate-500">下次保养公里数</Label><Input type="number" value={vehicleForm.nextServiceOdometerKm} onChange={(e) => setVehicleForm((p) => ({ ...p, nextServiceOdometerKm: e.target.value }))} className="h-9 rounded-xl" /></div>
              </div>
            </section>

            <section>
              <div className="mb-2 text-[11px] font-black uppercase tracking-wider text-slate-400">保险</div>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1"><Label className="text-[10px] font-semibold text-slate-500">保险公司</Label><Input value={vehicleForm.insuranceProvider} onChange={(e) => setVehicleForm((p) => ({ ...p, insuranceProvider: e.target.value }))} className="h-9 rounded-xl" /></div>
                <div className="space-y-1"><Label className="text-[10px] font-semibold text-slate-500">保险类型</Label><Select value={vehicleForm.insuranceType} onValueChange={(v) => setVehicleForm((p) => ({ ...p, insuranceType: v }))}><SelectTrigger className="h-9 rounded-xl"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="Comprehensive">Comprehensive</SelectItem><SelectItem value="Third Party">Third Party</SelectItem><SelectItem value="Third Party Fire & Theft">Third Party Fire & Theft</SelectItem></SelectContent></Select></div>
                <div className="space-y-1"><Label className="text-[10px] font-semibold text-slate-500">保险到期</Label><Input type="date" value={vehicleForm.insuranceExpiry} onChange={(e) => setVehicleForm((p) => ({ ...p, insuranceExpiry: e.target.value }))} className="h-9 rounded-xl" /></div>
                <div className="space-y-1"><Label className="text-[10px] font-semibold text-slate-500">保费</Label><Input type="number" value={vehicleForm.insurancePremiumAmount} onChange={(e) => setVehicleForm((p) => ({ ...p, insurancePremiumAmount: e.target.value }))} placeholder="$" className="h-9 rounded-xl" /></div>
                <div className="space-y-1"><Label className="text-[10px] font-semibold text-slate-500">保费周期</Label><Select value={vehicleForm.insurancePremiumFrequency} onValueChange={(v) => setVehicleForm((p) => ({ ...p, insurancePremiumFrequency: v }))}><SelectTrigger className="h-9 rounded-xl"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="annual">年付</SelectItem><SelectItem value="monthly">月付</SelectItem></SelectContent></Select></div>
                <div className="space-y-1"><Label className="text-[10px] font-semibold text-slate-500">保单号</Label><Input value={vehicleForm.insurancePolicyNumber} onChange={(e) => setVehicleForm((p) => ({ ...p, insurancePolicyNumber: e.target.value }))} className="h-9 rounded-xl" /></div>
              </div>
            </section>

            <section>
              <div className="mb-2 text-[11px] font-black uppercase tracking-wider text-slate-400">购入与当前状态</div>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1"><Label className="text-[10px] font-semibold text-slate-500">购入日期</Label><Input type="date" value={vehicleForm.purchaseDate} onChange={(e) => setVehicleForm((p) => ({ ...p, purchaseDate: e.target.value }))} className="h-9 rounded-xl" /></div>
                <div className="space-y-1"><Label className="text-[10px] font-semibold text-slate-500">购入价格</Label><Input type="number" value={vehicleForm.purchasePrice} onChange={(e) => setVehicleForm((p) => ({ ...p, purchasePrice: e.target.value }))} className="h-9 rounded-xl" /></div>
                <div className="space-y-1"><Label className="text-[10px] font-semibold text-slate-500">轮胎状态</Label><Select value={vehicleForm.tyreStatus} onValueChange={(v) => setVehicleForm((p) => ({ ...p, tyreStatus: v }))}><SelectTrigger className="h-9 rounded-xl"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="normal">正常</SelectItem><SelectItem value="attention">注意</SelectItem><SelectItem value="replace">需更换</SelectItem></SelectContent></Select></div>
                <div className="space-y-1"><Label className="text-[10px] font-semibold text-slate-500">电瓶状态</Label><Select value={vehicleForm.batteryStatus} onValueChange={(v) => setVehicleForm((p) => ({ ...p, batteryStatus: v }))}><SelectTrigger className="h-9 rounded-xl"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="normal">正常</SelectItem><SelectItem value="attention">注意</SelectItem><SelectItem value="replace">需更换</SelectItem></SelectContent></Select></div>
              </div>
              <div className="mt-2 space-y-1"><Label className="text-[10px] font-semibold text-slate-500">已知问题</Label><Textarea value={vehicleForm.knownIssues} onChange={(e) => setVehicleForm((p) => ({ ...p, knownIssues: e.target.value }))} rows={2} className="rounded-xl" placeholder="例如：方向机轻微渗油，继续观察" /></div>
              <div className="mt-2 space-y-1"><Label className="text-[10px] font-semibold text-slate-500">备注</Label><Textarea value={vehicleForm.notes} onChange={(e) => setVehicleForm((p) => ({ ...p, notes: e.target.value }))} rows={2} className="rounded-xl" /></div>
            </section>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setVehicleDialogOpen(false)}>取消</Button>
            <Button onClick={saveVehicle} disabled={saving} className="bg-slate-950 hover:bg-slate-800">{saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}{editingVehicle ? "保存修改" : "添加车辆"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!maintenanceVehicle} onOpenChange={(open) => !open && setMaintenanceVehicle(null)}>
        <DialogContent className="max-h-[88dvh] overflow-y-auto rounded-2xl sm:max-w-lg">
          <DialogHeader><DialogTitle>记录保养 / 维修 · {maintenanceVehicle?.nickname}</DialogTitle></DialogHeader>
          <div className="space-y-3 py-1">
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1"><Label className="text-[10px] font-semibold text-slate-500">日期</Label><Input type="date" value={maintenanceForm.serviceDate} onChange={(e) => setMaintenanceForm((p) => ({ ...p, serviceDate: e.target.value }))} className="h-9 rounded-xl" /></div>
              <div className="space-y-1"><Label className="text-[10px] font-semibold text-slate-500">公里数</Label><Input type="number" value={maintenanceForm.odometerKm} onChange={(e) => setMaintenanceForm((p) => ({ ...p, odometerKm: e.target.value }))} className="h-9 rounded-xl" /></div>
            </div>

            <div>
              <Label className="mb-1.5 block text-[10px] font-semibold text-slate-500">项目（可多选）</Label>
              <div className="flex flex-wrap gap-1.5">
                {SERVICE_TYPES.map((type) => {
                  const active = selectedServiceTypes.includes(type);
                  return (
                    <button
                      key={type}
                      type="button"
                      onClick={() => setSelectedServiceTypes((prev) => active ? prev.filter((x) => x !== type) : [...prev, type])}
                      className={`rounded-lg border px-2 py-1.5 text-[10px] font-bold transition-colors ${active ? "border-indigo-600 bg-indigo-600 text-white" : "border-slate-200 bg-white text-slate-500"}`}
                    >
                      {type}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1"><Label className="text-[10px] font-semibold text-slate-500">费用</Label><Input type="number" value={maintenanceForm.cost} onChange={(e) => setMaintenanceForm((p) => ({ ...p, cost: e.target.value }))} placeholder="$0" className="h-9 rounded-xl" /></div>
              <div className="space-y-1"><Label className="text-[10px] font-semibold text-slate-500">维修商 / Garage</Label><Input value={maintenanceForm.provider} onChange={(e) => setMaintenanceForm((p) => ({ ...p, provider: e.target.value }))} className="h-9 rounded-xl" /></div>
            </div>

            <div className="space-y-1"><Label className="text-[10px] font-semibold text-slate-500">收据 / 凭证 URL（选填）</Label><Input value={maintenanceForm.receiptUrl} onChange={(e) => setMaintenanceForm((p) => ({ ...p, receiptUrl: e.target.value }))} className="h-9 rounded-xl" /></div>
            <div className="space-y-1"><Label className="text-[10px] font-semibold text-slate-500">备注</Label><Textarea value={maintenanceForm.notes} onChange={(e) => setMaintenanceForm((p) => ({ ...p, notes: e.target.value }))} rows={2} className="rounded-xl" /></div>

            <button
              type="button"
              onClick={() => setMaintenanceForm((p) => ({ ...p, syncFinance: !p.syncFinance }))}
              className={`flex w-full items-center justify-between rounded-xl border p-3 text-left ${maintenanceForm.syncFinance ? "border-emerald-200 bg-emerald-50" : "border-slate-200 bg-white"}`}
            >
              <div>
                <div className="text-xs font-bold text-slate-800">同步到 Sine 财务</div>
                <div className="mt-0.5 text-[10px] text-slate-400">有费用时自动生成 Vehicle Maintenance 支出，避免重复记账</div>
              </div>
              <div className={`h-5 w-9 rounded-full p-0.5 transition-colors ${maintenanceForm.syncFinance ? "bg-emerald-500" : "bg-slate-200"}`}>
                <div className={`h-4 w-4 rounded-full bg-white shadow-sm transition-transform ${maintenanceForm.syncFinance ? "translate-x-4" : ""}`} />
              </div>
            </button>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setMaintenanceVehicle(null)}>取消</Button>
            <Button onClick={saveMaintenance} disabled={saving || selectedServiceTypes.length === 0} className="bg-indigo-600 hover:bg-indigo-700">{saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Wrench className="mr-2 h-4 w-4" />}保存记录</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <MobileDock />
    </div>
  );
}
