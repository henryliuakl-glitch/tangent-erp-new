"use client";
import {useEffect,useRef,useState} from "react";

export function SignaturePad({name,label,required=true}:{name:string;label:string;required?:boolean}){
  const ref=useRef<HTMLCanvasElement>(null);
  const drawing=useRef(false);
  const [image,setImage]=useState("");
  useEffect(()=>{
    const canvas=ref.current;if(!canvas)return;
    canvas.width=720;canvas.height=180;
    const ctx=canvas.getContext("2d");if(!ctx)return;
    ctx.fillStyle="#ffffff";ctx.fillRect(0,0,canvas.width,canvas.height);
    ctx.strokeStyle="#0f172a";ctx.lineWidth=3;ctx.lineJoin="round";ctx.lineCap="round";
  },[]);
  const point=(e:React.PointerEvent<HTMLCanvasElement>)=>{
    const c=e.currentTarget,r=c.getBoundingClientRect();
    return {x:(e.clientX-r.left)*c.width/r.width,y:(e.clientY-r.top)*c.height/r.height};
  };
  const begin=(e:React.PointerEvent<HTMLCanvasElement>)=>{
    const c=e.currentTarget,ctx=c.getContext("2d");if(!ctx)return;
    drawing.current=true;c.setPointerCapture(e.pointerId);
    const p=point(e);ctx.beginPath();ctx.moveTo(p.x,p.y);ctx.lineTo(p.x+0.1,p.y+0.1);ctx.stroke();
  };
  const move=(e:React.PointerEvent<HTMLCanvasElement>)=>{
    if(!drawing.current)return;const ctx=e.currentTarget.getContext("2d");if(!ctx)return;
    const p=point(e);ctx.lineTo(p.x,p.y);ctx.stroke();
  };
  const finish=(e:React.PointerEvent<HTMLCanvasElement>)=>{
    if(!drawing.current)return;drawing.current=false;setImage(e.currentTarget.toDataURL("image/png"));
  };
  const clear=()=>{const c=ref.current,ctx=c?.getContext("2d");if(!c||!ctx)return;
    ctx.fillStyle="#fff";ctx.fillRect(0,0,c.width,c.height);ctx.fillStyle="#0f172a";setImage("");
  };
  return <div className="space-y-1">
    <div className="flex items-center justify-between"><label className="text-xs font-semibold text-slate-700">{label}{required?" *":""}</label>
      <button type="button" onClick={clear} className="text-xs text-indigo-600">清除重签</button></div>
    <canvas ref={ref} onPointerDown={begin} onPointerMove={move} onPointerUp={finish}
      onPointerCancel={finish} className="h-28 w-full touch-none rounded-lg border border-slate-300 bg-white"/>
    <input type="hidden" name={name} value={image} required={required}/>
    <p className="text-[11px] text-slate-500">请由本人在此签名；仅输入姓名不等于完成身份核验。</p>
  </div>;
}
