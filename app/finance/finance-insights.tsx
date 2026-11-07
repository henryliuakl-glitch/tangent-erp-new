"use client";

import {useMemo,useState} from "react";
import {
  Bar,BarChart,CartesianGrid,Cell,Legend,Line,LineChart,Pie,PieChart,
  ResponsiveContainer,Tooltip,XAxis,YAxis
} from "recharts";
import {Banknote,ChartColumnIncreasing,FileText,PiggyBank,Wallet} from "lucide-react";

const palette=["#454d83","#7885c7","#abb3dd","#d7dbee","#95a2b8","#6e82ae"];
const fmt=(n:number)=>Number(n||0).toLocaleString("en-NZ",{maximumFractionDigits:0});
const money=(n:number,c:"NZD"|"RMB")=>(c==="RMB"?"¥":"$")+fmt(n);
const panel="min-w-0 rounded-[20px] bg-white p-4 shadow-[0_4px_18px_rgba(35,43,93,.055)]";
const title="mb-1 text-[13px] font-extrabold text-[#313956]";
const desc="text-[10px] text-[#8b94ab]";
const empty=<div className="flex h-[160px] items-center justify-center text-center text-xs text-[#a0a8b8]">暂无可统计的流水</div>;

function ChartPie({rows,total,currency}:{
 rows:{name:string;value:number}[];total:number;currency:"NZD"|"RMB"
}){
 if(total<=0||rows.length===0)return empty;
 return <div className="relative h-[168px]">
  <ResponsiveContainer width="100%" height="100%">
   <PieChart><Pie data={rows} dataKey="value" nameKey="name"
    innerRadius="57%" outerRadius="83%" paddingAngle={2} stroke="none">
    {rows.map((r,i)=><Cell key={r.name} fill={palette[i%palette.length]}/>)}
   </Pie><Tooltip formatter={(v:any)=>money(Number(v),currency)}/></PieChart>
  </ResponsiveContainer>
  <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
   <span className="text-[10px] text-slate-400">合计</span>
   <span className="text-base font-black text-[#354061]">{money(total,currency)}</span>
  </div>
 </div>;
}
function CategoryRows({rows,currency,limit=5}:{
 rows:{name:string;value:number}[];currency:"NZD"|"RMB";limit?:number
}){
 const max=Math.max(...rows.map(r=>r.value),1);
 return <div className="space-y-2">{rows.slice(0,limit).map((r,i)=>
  <div key={r.name}>
   <div className="mb-1 flex justify-between gap-2 text-[11px]">
    <span className="truncate font-semibold text-[#515b75]">{r.name}</span>
    <span className="shrink-0 font-bold tabular-nums text-[#404965]">{money(r.value,currency)}</span>
   </div>
   <div className="h-1.5 overflow-hidden rounded-full bg-[#eff1f8]">
    <div className="h-full rounded-full" style={{width:`${r.value/max*100}%`,background:palette[i%palette.length]}}/>
   </div>
  </div>)}</div>;
}
export function FinanceInsights({data,loading,periodMode}:{
 data:any;loading:boolean;periodMode:"week"|"month"|"year"
}){
 const [currency,setCurrency]=useState<"NZD"|"RMB">("NZD");
 const income=Number(data.byCurrency?.[currency]?.income||0);
 const expense=Number(data.byCurrency?.[currency]?.expense||0);
 const net=Number(data.byCurrency?.[currency]?.net||0);
 const realized=Number(currency==="RMB"?data.realizedRmb:data.realized||0);
 const sources=useMemo(()=>(data.incomeBySource||[])
  .map((r:any)=>({name:String(r.source),value:Number(r[currency]||0)}))
  .filter((r:{value:number})=>r.value>0).sort((a:any,b:any)=>b.value-a.value),
  [data.incomeBySource,currency]);
 const expenses=useMemo(()=>(data.expenseByCategory||[])
  .map((r:any)=>({name:String(r.category),value:Number(r[currency]||0)}))
  .filter((r:{value:number})=>r.value>0).sort((a:any,b:any)=>b.value-a.value),
  [data.expenseByCategory,currency]);
 const billTypes=["Rent","Wages","Software","Utilities","Bills","Electricity","Internet"];
 const paidBills=(data.transactions||[]).filter((r:any)=>r.type==="expense"&&billTypes.includes(String(r.category||"")));
 const hasCashDetailError=!!data.transactionReadError;
 const highest=expenses.slice(0,3);
 const savingRate=income>0?net/income*100:null;
 const period=data.period?.mode==="year"?"年度":data.period?.mode==="week"?"本周":"本月";
 const chart=(data.chartData||[]).map((r:any)=>({
  name:String(r.date),
  income:Number(currency==="RMB"?r.incomeRmb:r.income||0),
  expense:Number(currency==="RMB"?r.expenseRmb:r.expense||0),
  realized:Number(currency==="RMB"?r.realizedRmb:r.realized||0),
 }));
 const cashBars=[{label:"收款",value:income},{label:"销课",value:realized},{label:"支出",value:expense}];
 const maxCash=Math.max(...cashBars.map(r=>r.value),1);
 return <section className="mt-3 space-y-3" aria-label="财务分析">
  <div className="flex flex-wrap items-center justify-between gap-3">
   <div className="flex items-center gap-2"><ChartColumnIncreasing className="h-4 w-4 text-[#626a9e]"/><h3 className="text-sm font-bold text-[#2d3455]">财务分析</h3></div>
   <div className="flex gap-1 rounded-full bg-white p-1 shadow-sm" role="group" aria-label="图表币种">
    {(["NZD","RMB"] as const).map(c=><button key={c} type="button" onClick={()=>setCurrency(c)}
     className={`rounded-full px-3 py-1.5 text-[11px] font-bold ${c===currency?"bg-[#444c7c] text-white":"text-[#7b84a1]"}`}>{c}</button>)}
   </div>
  </div>
  {hasCashDetailError&&<p role="alert" className="rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-800">
   收支汇总按工作台同源聚合显示，部分流水明细暂未读取成功；图表分类可能不完整。
  </p>}
  <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-12">
   <article className={panel+" xl:col-span-4"}>
    <h4 className={title}>收款分配</h4><p className={desc}>按已登记的收入渠道</p>
    {loading?empty:<ChartPie rows={sources} total={sources.reduce((a,r)=>a+r.value,0)} currency={currency}/>}
    <CategoryRows rows={sources} currency={currency} limit={3}/>
   </article>
   <article className="min-w-0 rounded-[20px] bg-[#414974] p-4 text-white shadow-[0_8px_22px_rgba(35,43,93,.15)] xl:col-span-5">
    <div className="mb-5 flex items-start justify-between">
     <div><h4 className="text-sm font-extrabold">现金流概览</h4><p className="mt-1 text-[10px] text-[#c6cbe2]">{period} · {currency}</p></div>
     <Wallet className="h-4 w-4 text-[#c7ccf8]"/>
    </div>
    <div className="space-y-5">
     {cashBars.map((r,i)=><div key={r.label} className="grid grid-cols-[42px_minmax(0,1fr)_75px] items-center gap-3">
      <span className="text-[11px] font-semibold text-[#e4e7fc]">{r.label}</span>
      <div className="h-4 rounded bg-[#343c64]"><div className="h-full rounded"
       style={{width:`${r.value/maxCash*100}%`,background:["#c7d0fa","#8ba4e9","#e5e6fb"][i]}}/></div>
      <span className="text-right text-xs font-bold tabular-nums">{money(r.value,currency)}</span>
     </div>)}
    </div>
    <p className="mt-6 text-[10px] text-[#c9d0e9]">收款是现金流水；销课是已完成课程价值，两者不重复合计。</p>
   </article>
   <article className={panel+" xl:col-span-3"}>
    <h4 className={title}>现金状况</h4><p className={desc}>本期净变化，并非银行账户余额</p>
    <div className="mt-6 text-[26px] font-black tracking-tight text-[#36416c]">{net<0?"−":"+"}{money(Math.abs(net),currency)}</div>
    <div className="mt-4 rounded-xl bg-[#eff0fc] p-3">
     <p className="text-[11px] text-[#697194]">现金结余率</p>
     <p className="text-xl font-extrabold text-[#454e8b]">{savingRate===null?"—":savingRate.toFixed(1)+"%"}</p>
    </div>
    <p className="mt-4 text-[10px] leading-relaxed text-slate-400">预算尚未配置，不把本期净现金流误标为实际账户余额。</p>
   </article>
   <article className={panel+" xl:col-span-4"}>
    <h4 className={title}>支出分布</h4><p className={desc}>各费用类别的实际占比</p>
    <ChartPie rows={expenses} total={expenses.reduce((a,r)=>a+r.value,0)} currency={currency}/>
   </article>
   <article className={panel+" xl:col-span-4"}>
    <h4 className={title}>账单汇总</h4><p className={desc}>已入账的房租、薪酬及日常账单</p>
    {expenses.length===0?empty:<div className="mt-4"><CategoryRows rows={expenses} currency={currency}/></div>}
    <div className="mt-4 rounded-xl bg-[#f3f4fa] px-3 py-2">
     <span className="text-[11px] text-[#68728c]">已登记账单支出 </span>
     <strong className="float-right text-xs text-[#424b77]">{paidBills.length} 笔</strong>
    </div>
    <p className="mt-2 text-[10px] text-slate-400">未付账单尚未接入，不作为零笔显示。</p>
   </article>
   <article className={panel+" xl:col-span-4"}>
    <h4 className={title}>预算与实际</h4><p className={desc}>预算未设置时仅显示真实数据</p>
    <div className="mt-5 grid grid-cols-2 gap-2">
     <div className="rounded-xl bg-[#f1f2f9] p-3"><div className="text-[10px] text-[#7a83a0]">实际支出</div><div className="mt-1 text-lg font-black text-[#454c76]">{money(expense,currency)}</div></div>
     <div className="rounded-xl bg-[#f1f2f9] p-3"><div className="text-[10px] text-[#7a83a0]">预算金额</div><div className="mt-1 text-lg font-black text-[#9298ad]">未设置</div></div>
    </div>
    <div className="mt-5 text-[11px] text-[#7f86a1]">实际完成课时 <strong className="text-[#444d77]">{Number(data.completedHours||0).toLocaleString()} h</strong></div>
    <div className="mt-1.5 text-[11px] text-[#7f86a1]">销课确认收入 <strong className="text-[#444d77]">{money(realized,currency)}</strong></div>
   </article>
   <article className={panel+" xl:col-span-4"}>
    <h4 className={title}>收入来源</h4><p className={desc}>按收款账户/渠道分类</p>
    {sources.length===0?empty:<div className="mt-5"><CategoryRows rows={sources} currency={currency} limit={6}/></div>}
   </article>
   <article className={panel+" xl:col-span-5"}>
    <h4 className={title}>实际收支趋势</h4><p className={desc}>真实现金进出与销课价值 · {currency}</p>
    <div className="mt-3 h-[205px] min-w-0">
     {loading?empty:<ResponsiveContainer width="100%" height="100%">
      <LineChart data={chart} margin={{top:5,left:-27,right:12,bottom:5}}>
       <CartesianGrid stroke="#e9ebf3" vertical={false}/><XAxis dataKey="name" tick={{fontSize:9,fill:"#949db2"}} tickLine={false} axisLine={false}/>
       <YAxis tick={{fontSize:9,fill:"#949db2"}} tickLine={false} axisLine={false}/>
       <Tooltip formatter={(v:any)=>money(Number(v),currency)}/>
       <Legend iconType="circle" wrapperStyle={{fontSize:10}}/>
       <Line type="monotone" name="实收" dataKey="income" stroke="#415b92" strokeWidth={2} dot={false}/>
       <Line type="monotone" name="支出" dataKey="expense" stroke="#d69da8" strokeWidth={2} dot={false}/>
       <Line type="monotone" name="销课" dataKey="realized" stroke="#8e9bda" strokeWidth={2} dot={false}/>
      </LineChart>
     </ResponsiveContainer>}
    </div>
   </article>
   <article className={panel+" xl:col-span-3"}>
    <h4 className={title}>主要支出</h4><p className={desc}>金额最高的三类费用</p>
    {highest.length===0?empty:<div className="mt-5 space-y-4">{highest.map((r,i)=><div key={r.name} className="flex items-center justify-between gap-2">
     <span className="text-xs font-medium text-[#65708d]">{i+1}. {r.name}</span>
     <span className="rounded-lg bg-[#eef0fc] px-3 py-1.5 text-xs font-bold text-[#4d5789]">{money(r.value,currency)}</span>
    </div>)}</div>}
   </article>
  </div>
 </section>;
}
