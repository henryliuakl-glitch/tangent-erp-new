"use client";

import { useState } from "react";
import {
  CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import type { TrendPoint, WorkTrend } from "@/lib/work-hours-trend";
import type { WorkUnit } from "@/lib/work-hours";

const STAFF_LINES = {
  niu: { label: "牛教练", color: "#4f5df6" },
  tong: { label: "童教练", color: "#f1a73c" },
  sulfur: { label: "小硫", color: "#9477dc" },
  copper: { label: "小铜", color: "#20a89b" },
  other: { label: "其他（待核对）", color: "#98a1ae" },
} as const;
type LineKey = keyof typeof STAFF_LINES;

export function WorkHoursTrend({ trend, units }: { trend: WorkTrend; units: WorkUnit[] }) {
  const [mode, setMode] = useState<"historical" | "completed">("historical");
  const series = trend[mode];
  const enabled: LineKey[] = [
    ...(units.includes("sine") ? (["niu", "tong"] as const) : []),
    ...(units.includes("cus") ? (["sulfur", "copper"] as const) : []),
    ...(series.some(row => row.other > 0) ? (["other"] as const) : []),
  ];
  const hasData = series.some(row => enabled.some(key => Number(row[key]) > 0));
  const total = series.reduce((sum, row) =>
    sum + enabled.reduce((acc, key) => acc + Number(row[key] ?? 0), 0), 0);
  const maxHour = Math.ceil(Math.max(1, ...series.map(row =>
    enabled.reduce((sum, key) => sum + Number(row[key] ?? 0), 0))));
  const formatHours = (hours: number) => hours.toLocaleString("zh-CN", { maximumFractionDigits: 2 }) + "h";

  return <section className="rounded-2xl bg-white p-3 shadow-sm md:p-5" aria-label="工作时长趋势">
    <div className="mb-4 flex flex-wrap items-start justify-between gap-2">
      <div>
        <h2 className="text-sm font-extrabold text-[#292c4d] md:text-base">工作时长趋势</h2>
        <p className="mt-1 text-[11px] text-slate-500">
          {mode === "historical" ? "已完成 + 过去待确认课程" : "仅统计状态为已完成的课程"}
          {" · "}每条线代表一位老师
        </p>
      </div>
      <div className="flex items-center gap-1 rounded-xl bg-slate-100 p-1" role="group" aria-label="工时计算方式">
        <button type="button" onClick={() => setMode("historical")}
          aria-pressed={mode === "historical"}
          className={"rounded-lg px-3 py-2 text-xs font-semibold transition-colors " +
            (mode === "historical" ? "bg-white text-indigo-700 shadow-sm" : "text-slate-500")}>
          历史排课
        </button>
        <button type="button" onClick={() => setMode("completed")}
          aria-pressed={mode === "completed"}
          className={"rounded-lg px-3 py-2 text-xs font-semibold transition-colors " +
            (mode === "completed" ? "bg-white text-indigo-700 shadow-sm" : "text-slate-500")}>
          已完成
        </button>
      </div>
    </div>
    {hasData ? <>
      <div className="mb-1 flex items-baseline gap-2 pl-1">
        <strong className="text-2xl font-extrabold tabular-nums text-[#282a4e]">{formatHours(total)}</strong>
        <span className="text-xs text-slate-400">当前图表合计</span>
      </div>
      <div className="h-[250px] w-full sm:h-[300px] md:h-[345px]">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={series} margin={{ top: 15, right: 12, bottom: 6, left: -20 }}>
            <CartesianGrid strokeDasharray="3 5" vertical={false} stroke="#eef0f5"/>
            <XAxis dataKey="label" tickLine={false} axisLine={false}
              minTickGap={20} tick={{ fill: "#8c92a3", fontSize: 11 }} dy={10}/>
            <YAxis domain={[0, "auto"]} allowDecimals={maxHour < 4}
              tickLine={false} axisLine={false} tick={{ fill: "#8c92a3", fontSize: 11 }}
              tickFormatter={(value: number) => String(value)}/>
            <Tooltip
              cursor={{ stroke: "#d0d5e9", strokeDasharray: "3 4" }}
              formatter={(value) => [formatHours(Number(value ?? 0)), ""]}
              labelFormatter={(_label, payload) =>
                (payload?.[0]?.payload as TrendPoint | undefined)?.date || String(_label)}
              contentStyle={{ borderRadius: 12, border: "1px solid #edf0f5", fontSize: 12,
                boxShadow: "0 12px 28px rgba(25,33,90,.08)" }}
            />
            <Legend verticalAlign="bottom" height={28}
              wrapperStyle={{ fontSize: 12, paddingTop: 8 }}/>
            {enabled.map(key => <Line key={key} type="monotone" dataKey={key}
              name={STAFF_LINES[key].label} stroke={STAFF_LINES[key].color}
              strokeWidth={2.8} dot={false} activeDot={{ r: 4, strokeWidth: 0 }}
              isAnimationActive={false}/>)}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </> : <p className="flex h-36 items-center justify-center text-sm text-slate-400">
      当前时段暂无可绘制的历史工时
    </p>}
  </section>;
}
