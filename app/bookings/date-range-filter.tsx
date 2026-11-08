"use client";

import {useState} from "react";

function compactDate(value:string){
  const parts=/^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  return parts?`${parts[3]}/${parts[2]}/${parts[1].slice(2)}`:"选择日期";
}

function DateField({name,label,value,onChange}:{
  name:"from"|"to";label:string;value:string;onChange:(value:string)=>void;
}){
  return <label className="relative block h-10 min-w-0 flex-1 overflow-hidden rounded-xl bg-white shadow-sm md:w-[132px] md:flex-none">
    <span className="pointer-events-none flex h-full items-center justify-center text-[11px] font-medium tabular-nums text-slate-700 md:hidden">
      {compactDate(value)}
    </span>
    <input type="date" name={name} aria-label={label} value={value}
      onChange={e=>onChange(e.target.value)}
      className="absolute inset-0 z-10 h-full w-full min-w-0 max-w-full cursor-pointer opacity-0 md:static md:z-auto md:block md:h-10 md:rounded-xl md:px-2 md:text-xs md:opacity-100"/>
  </label>;
}

export function BookingsDateRange({from,to}:{from:string;to:string}){
  const [start,setStart]=useState(from);
  const [end,setEnd]=useState(to);
  return <form method="get" className="flex min-w-0 flex-1 items-center gap-1 md:flex-none md:gap-1.5" aria-label="日期范围">
    <DateField name="from" label="开始日期" value={start} onChange={setStart}/>
    <span className="shrink-0 text-[11px] text-slate-400">至</span>
    <DateField name="to" label="结束日期" value={end} onChange={setEnd}/>
    <button type="submit" className="h-10 shrink-0 rounded-xl bg-[#eeeefe] px-2.5 text-xs font-bold text-indigo-600 hover:bg-[#e6e6ff] md:px-3">
      查询
    </button>
  </form>;
}
