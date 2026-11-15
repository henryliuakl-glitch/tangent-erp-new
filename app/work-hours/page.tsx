import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { Navbar } from "@/components/Navbar";
import { MobileDock } from "@/components/MobileDock";
import { createClient } from "@/lib/supabase/server";
import {
  addCalendarMonthsInNZ, getTodayInNZ, nzStartOfDayUtc,
  utcToNzDateStr, utcToNzTimeStr,
} from "@/lib/timezone";
import {
  STAFF_GROUPS, STAFF_LABELS, hoursLabel, summarizeWorkHours,
  type HourTally, type StaffKey, type WorkSession, type WorkUnit,
} from "@/lib/work-hours";

type SearchParams = Promise<{ month?: string; period?: string }>;
type Db = Awaited<ReturnType<typeof createClient>>;
type Period = "month" | "year" | "all";

const PAGE_SIZE = 1000;

function monthStart(value?: string): string {
  const current = getTodayInNZ().slice(0, 7);
  const valid = value && /^\d{4}-(0[1-9]|1[0-2])$/.test(value) &&
    Number(value.slice(0, 4)) >= 2020 && Number(value.slice(0, 4)) <= 2100;
  return (valid ? value : current) + "-01";
}

function periodBounds(period: Period, month: string) {
  if (period === "all") return { from: undefined, to: undefined };
  const first = period === "year" ? month.slice(0, 4) + "-01-01" : month;
  const next = period === "year"
    ? String(Number(month.slice(0, 4)) + 1) + "-01-01"
    : addCalendarMonthsInNZ(month, 1);
  return {
    from: nzStartOfDayUtc(first).toISOString(),
    to: nzStartOfDayUtc(next).toISOString(),
  };
}

async function loadBookings(db: Db, units: WorkUnit[], from?: string, to?: string): Promise<WorkSession[]> {
  const rows: WorkSession[] = [];
  for (let offset = 0; ; offset += PAGE_SIZE) {
    let query = db.from("bookings")
      .select("id,business_unit_id,start_time,end_time,duration,status,teacher,metadata")
      .in("business_unit_id", units).neq("status", "cancelled")
      .order("start_time", { ascending: false }).range(offset, offset + PAGE_SIZE - 1);
    if (from) query = query.gte("start_time", from);
    if (to) query = query.lt("start_time", to);
    const { data, error } = await query;
    if (error) throw new Error("读取排课记录失败：" + error.message);
    for (const row of data || []) {
      const metadata = row.metadata && typeof row.metadata === "object" &&
        !Array.isArray(row.metadata) ? row.metadata as Record<string, unknown> : {};
      rows.push({
        id: row.id,
        source: "booking",
        business_unit_id: row.business_unit_id as WorkUnit,
        starts_at: row.start_time,
        ends_at: row.end_time,
        duration: row.duration,
        status: row.status,
        teacher: row.teacher,
        coach: typeof metadata.coach === "string" ? metadata.coach : null,
      });
    }
    if (!data || data.length < PAGE_SIZE) break;
  }
  return rows;
}

/** A class is one teaching session regardless of how many children attend. */
async function loadClassSessions(db: Db, from?: string, to?: string): Promise<WorkSession[]> {
  const { data: programmes, error: programmesError } = await db.from("cus_programmes")
    .select("id").eq("business_unit_id", "cus");
  if (programmesError) throw new Error("读取班课项目失败：" + programmesError.message);
  const programmeIds = (programmes || []).map(p => p.id);
  if (!programmeIds.length) return [];

  const classTeachers = new Map<string, string | null>();
  for (let i = 0; i < programmeIds.length; i += 80) {
    for (let offset = 0; ; offset += PAGE_SIZE) {
      const { data, error } = await db.from("cus_classes")
        .select("id,teacher").in("programme_id", programmeIds.slice(i, i + 80))
        .order("id").range(offset, offset + PAGE_SIZE - 1);
      if (error) throw new Error("读取班级失败：" + error.message);
      for (const item of data || []) classTeachers.set(item.id, item.teacher);
      if (!data || data.length < PAGE_SIZE) break;
    }
  }
  const classIds = [...classTeachers.keys()];
  const sessions: WorkSession[] = [];
  for (let i = 0; i < classIds.length; i += 80) {
    for (let offset = 0; ; offset += PAGE_SIZE) {
      let query = db.from("cus_class_sessions")
        .select("id,class_id,starts_at,ends_at,status")
        .in("class_id", classIds.slice(i, i + 80)).neq("status", "cancelled")
        .order("starts_at", { ascending: false }).range(offset, offset + PAGE_SIZE - 1);
      if (from) query = query.gte("starts_at", from);
      if (to) query = query.lt("starts_at", to);
      const { data, error } = await query;
      if (error) throw new Error("读取班课 Session 失败：" + error.message);
      for (const item of data || []) {
        sessions.push({
          id: item.id,
          source: "class",
          business_unit_id: "cus",
          starts_at: item.starts_at,
          ends_at: item.ends_at,
          status: item.status,
          teacher: classTeachers.get(item.class_id),
        });
      }
      if (!data || data.length < PAGE_SIZE) break;
    }
  }
  return sessions;
}

function StatTile({ title, minutes, caption }: { title: string; minutes: number; caption: string }) {
  return <div className="rounded-2xl bg-white p-4 shadow-sm">
    <p className="text-xs font-semibold text-slate-500">{title}</p>
    <p className="mt-2 text-2xl font-bold tabular-nums text-[#24264a]">{hoursLabel(minutes)}</p>
    <p className="mt-1 text-xs text-slate-400">{caption}</p>
  </div>;
}

function StaffCard({ name, tally }: { name: string; tally: HourTally }) {
  return <article className="rounded-2xl bg-white p-4 shadow-sm">
    <div className="mb-3 flex items-start justify-between gap-2">
      <h3 className="text-base font-bold text-slate-900">{name}</h3>
      <span className="rounded-lg bg-indigo-50 px-2 py-1 text-xs font-semibold text-indigo-700">
        历史 {hoursLabel(tally.completedMinutes + tally.unconfirmedMinutes)}
      </span>
    </div>
    <div className="grid grid-cols-3 gap-2">
      <div>
        <p className="text-[11px] text-slate-500">已完成</p>
        <p className="mt-1 text-lg font-bold tabular-nums text-slate-800">{hoursLabel(tally.completedMinutes)}</p>
        <p className="text-[11px] text-slate-400">{tally.completedSessions} 节</p>
      </div>
      <div>
        <p className="text-[11px] text-slate-500">过去待确认</p>
        <p className="mt-1 text-lg font-bold tabular-nums text-slate-800">{hoursLabel(tally.unconfirmedMinutes)}</p>
        <p className="text-[11px] text-slate-400">{tally.unconfirmedSessions} 节</p>
      </div>
      <div>
        <p className="text-[11px] text-slate-500">未来已排</p>
        <p className="mt-1 text-lg font-bold tabular-nums text-slate-800">{hoursLabel(tally.upcomingMinutes)}</p>
        <p className="text-[11px] text-slate-400">{tally.upcomingSessions} 节</p>
      </div>
    </div>
  </article>;
}

export default async function WorkHoursPage({ searchParams }: { searchParams: SearchParams }) {
  const db = await createClient();
  const { data: { user } } = await db.auth.getUser();
  if (!user) redirect("/login");

  const store = await cookies();
  const currentBusiness = store.get("businessId")?.value || "cus";
  const restricted = store.get("erp_care_only")?.value === "1" ||
    store.get("erp_astra_only")?.value === "1";
  const { data: memberships, error: membershipError } = await db.from("erp_memberships")
    .select("business_unit_id,role").eq("user_id", user.id)
    .in("business_unit_id", ["cus", "sine"]);
  const allowed = (memberships || [])
    .filter(m => m.role === "owner" || m.role === "admin")
    .map(m => m.business_unit_id)
    .filter((unit): unit is WorkUnit => unit === "sine" || unit === "cus");

  const units: WorkUnit[] = restricted || membershipError ? [] :
    currentBusiness === "tangent" ? allowed :
    (currentBusiness === "sine" || currentBusiness === "cus") && allowed.includes(currentBusiness)
      ? [currentBusiness] : [];

  const params = await searchParams;
  const period: Period = params.period === "year" ? "year" : params.period === "all" ? "all" : "month";
  const month = monthStart(params.month);
  const monthKey = month.slice(0, 7);
  const previous = addCalendarMonthsInNZ(month, period === "year" ? -12 : -1).slice(0, 7);
  const next = addCalendarMonthsInNZ(month, period === "year" ? 12 : 1).slice(0, 7);
  const periodHref = (mode: Period, key = monthKey) =>
    "/work-hours?period=" + mode + "&month=" + key;
  const bounds = periodBounds(period, month);

  let workSessions: WorkSession[] = [];
  let loadError = membershipError ? "暂时无法校验业务权限。" : "";
  if (units.length && !loadError) {
    try {
      const [bookingSessions, classSessions] = await Promise.all([
        loadBookings(db, units, bounds.from, bounds.to),
        units.includes("cus") ? loadClassSessions(db, bounds.from, bounds.to) : Promise.resolve([]),
      ]);
      workSessions = [...bookingSessions, ...classSessions];
    } catch (error) {
      loadError = error instanceof Error ? error.message : "工时统计读取失败";
    }
  }

  const report = summarizeWorkHours(workSessions);
  const { totals } = report;

  return <div className="min-h-screen bg-slate-50 pb-24 font-sans text-slate-900 md:pb-10">
    <div className="hidden md:block"><Navbar /></div>
    <main className="mx-auto max-w-[1500px] space-y-4 px-3 py-3 md:px-5 md:py-5">
      <header>
        <h1 className="text-xl font-extrabold tracking-tight text-[#232643]">工作时长统计</h1>
        <p className="mt-1 text-xs text-slate-500">
          {currentBusiness === "sine" ? "Sine 驾校" : currentBusiness === "cus" ? "CuS Academy" : "Tangent Group"}
          {" · "}按新西兰时间及 Session 开始日期统计
        </p>
      </header>

      {!units.length ? <section className="rounded-2xl bg-white p-5 text-sm text-slate-600">
        工时属于管理统计，仅 CuS / Sine 的 owner 或 admin 可查看。请切换到已授权的实体。
      </section> : <>
        <div className="flex flex-wrap items-center gap-2 rounded-2xl bg-white p-2.5 shadow-sm">
          <nav className="flex flex-wrap items-center gap-1" aria-label="统计周期">
            {([["month", "按月"], ["year", "按年"], ["all", "全部"]] as const).map(([value, label]) =>
              <Link key={value} href={periodHref(value)} aria-current={period === value ? "page" : undefined}
                className={"rounded-xl px-3 py-2 text-xs font-bold " +
                  (period === value ? "bg-indigo-600 text-white" : "text-slate-500 hover:bg-slate-50")}>
                {label}
              </Link>
            )}
          </nav>
          {period !== "all" && <div className="ml-auto flex items-center gap-2">
            <Link href={periodHref(period, previous)} aria-label="上一周期"
              className="rounded-xl bg-slate-100 px-3 py-2 text-sm font-bold text-slate-600 hover:bg-slate-200">‹</Link>
            <span className="min-w-24 text-center text-sm font-bold tabular-nums text-slate-700">
              {period === "year" ? month.slice(0, 4) + " 年" : monthKey}
            </span>
            <Link href={periodHref(period, next)} aria-label="下一周期"
              className="rounded-xl bg-slate-100 px-3 py-2 text-sm font-bold text-slate-600 hover:bg-slate-200">›</Link>
          </div>}
        </div>

        {loadError ? <section role="alert" className="rounded-xl bg-white p-4 text-sm text-rose-600">
          统计暂不可用：{loadError}。为避免显示不完整的工时，已停止计算。
        </section> : <>
          <section className="grid grid-cols-2 gap-2 lg:grid-cols-4" aria-label="汇总工时">
            <StatTile title="历史排课时长" minutes={totals.completedMinutes + totals.unconfirmedMinutes}
              caption="已完成 + 过去待确认"/>
            <StatTile title="已完成工时" minutes={totals.completedMinutes}
              caption={String(totals.completedSessions) + " 节已完成 Session"}/>
            <StatTile title="过去待确认" minutes={totals.unconfirmedMinutes}
              caption={String(totals.unconfirmedSessions) + " 节尚未标记完成"}/>
            <StatTile title="未来已排工时" minutes={totals.upcomingMinutes}
              caption={String(totals.upcomingSessions) + " 节待进行 Session"}/>
          </section>

          {(["sine", "cus"] as const).filter(unit => units.includes(unit)).map(unit =>
            <section key={unit} className="space-y-2">
              <h2 className="px-1 text-sm font-extrabold text-[#34365c]">
                {unit === "sine" ? "驾校 · 牛教练 / 童教练" : "CuS · 小硫 / 小铜"}
              </h2>
              <div className="grid gap-2 sm:grid-cols-2">
                {STAFF_GROUPS[unit].filter((staff: StaffKey) =>
                  !staff.endsWith("-other") ||
                  report.byStaff[staff].completedSessions +
                  report.byStaff[staff].unconfirmedSessions +
                  report.byStaff[staff].upcomingSessions > 0
                ).map(staff =>
                  <StaffCard key={staff} name={STAFF_LABELS[staff]} tally={report.byStaff[staff]}/>
                )}
              </div>
            </section>
          )}

          {(report.unknownNames.length > 0 || report.invalidCount > 0) &&
            <section className="rounded-xl bg-white p-3 text-xs text-amber-700">
              {report.unknownNames.length > 0 &&
                <p>以下 Session 有未识别的老师名称，已单列到「其他（待核对）」，未擅自分配：
                  {report.unknownNames.join("、")}</p>}
              {report.invalidCount > 0 &&
                <p>{report.invalidCount} 节 Session 缺少有效时长，未计入合计。</p>}
            </section>}

          <section className="rounded-2xl bg-white p-3 shadow-sm md:p-4">
            <details>
              <summary className="cursor-pointer text-sm font-bold text-[#34365c]">
                查看最近 60 条 Session 明细（共 {report.classified.length} 条）
              </summary>
              <div className="mt-3 overflow-x-auto">
                <table className="w-full min-w-[590px] text-left text-xs">
                  <thead className="text-slate-500">
                    <tr className="border-b border-slate-100">
                      <th className="px-2 py-2 font-semibold">日期 / 时间 (NZT)</th>
                      <th className="px-2 py-2 font-semibold">来源</th>
                      <th className="px-2 py-2 font-semibold">负责老师</th>
                      <th className="px-2 py-2 text-right font-semibold">时长</th>
                      <th className="px-2 py-2 font-semibold">状态</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.classified.slice(0, 60).map(session =>
                      <tr key={session.source + ":" + session.id} className="border-b border-slate-50">
                        <td className="px-2 py-2 tabular-nums">{utcToNzDateStr(session.starts_at)}
                          {" "}{utcToNzTimeStr(session.starts_at)}</td>
                        <td className="px-2 py-2">
                          <Link className="text-indigo-600 hover:underline"
                            href={session.source === "class" ? "/teaching?view=classes" :
                              "/bookings?from=" + utcToNzDateStr(session.starts_at) +
                              "&to=" + utcToNzDateStr(session.starts_at)}>
                            {session.source === "class" ? "CuS 班课" :
                              session.business_unit_id === "sine" ? "驾校排课" : "CuS 排课"}
                          </Link>
                        </td>
                        <td className="px-2 py-2">{STAFF_LABELS[session.staff]}
                          {!session.rawStaffLabel && <span className="ml-1 text-[10px] text-slate-400">默认</span>}
                        </td>
                        <td className="px-2 py-2 text-right font-semibold tabular-nums">{hoursLabel(session.minutes)}</td>
                        <td className="px-2 py-2">{session.bucket === "completed" ? "已完成" :
                          session.bucket === "unconfirmed" ? "过去待确认" : "未来已排"}</td>
                      </tr>
                    )}
                  </tbody>
                </table>
                {report.classified.length > 60 && <p className="mt-2 text-[11px] text-slate-400">
                  这里只展示最新 60 条，顶部统计包含所选周期的全部记录。
                </p>}
              </div>
            </details>
          </section>

          <p className="px-1 text-xs leading-5 text-slate-500">
            规则：取消的 Session 不计入；驾校未写教练默认牛教练，CuS 未写老师默认小硫；
            Henry / Yvetta 分别对应小硫 / 小铜。已完成只计完成状态；
            过去未标记完成的课程单列，不视为已经核实的实际工时。
            CuS 班课按每场实际时长计算一次，不按学生人数重复累计。
          </p>
        </>}
      </>}
    </main>
    <MobileDock/>
  </div>;
}
