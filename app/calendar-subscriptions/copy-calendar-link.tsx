"use client";

import {useState} from "react";
import {Copy,Check} from "lucide-react";

export function CopyCalendarLink({url}:{url:string}){
  const [copied,setCopied]=useState(false);
  async function copy(){
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
    }catch {
      setCopied(false);
    }
  }
  return <div className="flex flex-col gap-2 sm:flex-row">
    <input aria-label="苹果订阅日历地址" type="text" className="min-w-0 flex-1 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600"
      value={url} readOnly onFocus={e=>e.currentTarget.select()}/>
    <button type="button" onClick={copy}
      className="inline-flex shrink-0 items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700">
      {copied?<Check className="h-4 w-4"/>:<Copy className="h-4 w-4"/>}
      {copied?"已复制":"复制链接"}
    </button>
  </div>;
}
