"use client";

import * as React from "react";
import { Check, ChevronsUpDown, Building2, Car, LayoutGrid, House } from "lucide-react";
import { useBusiness } from "@/contexts/BusinessContext";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button"; 
// 如果 Button 也没装，可以把 Button 换成普通的 <button className="...">

const BUSINESS_UNITS = [
  { id: "family", name: "Family", icon: House },
  { id: "tangent", name: "Tangent Group", icon: LayoutGrid },
  { id: "cus", name: "CuS Academy (教培)", icon: Building2 },
  { id: "sine", name: "Sine Driving (驾校)", icon: Car },
];

export default function BusinessSwitcher() {
  const router = useRouter();
  const [isOpen, setIsOpen] = React.useState(false);
  const dropdownRef = React.useRef<HTMLDivElement>(null);
  
  // ✅ 获取全局状态
  const { currentBusinessId, setBusinessId, currentLabel } = useBusiness();

  // 找到当前选中的对象
  const currentUnit = BUSINESS_UNITS.find((unit) => unit.id === currentBusinessId);

  // 点击外部关闭下拉菜单
  React.useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div className="relative" ref={dropdownRef}>
      {/* 触发按钮 */}
      <Button
        variant="outline"
        role="combobox"
        aria-expanded={isOpen}
        onClick={() => setIsOpen(!isOpen)}
        className="w-60 justify-between bg-white" // ✅ 修复：w-[240px] -> w-60
      >
        {currentUnit ? (
          <div className="flex items-center gap-2 text-slate-700">
            <currentUnit.icon className="h-4 w-4 text-slate-500" />
            <span className="truncate">{currentUnit.name}</span>
          </div>
        ) : (
          <span className="truncate text-slate-700">{currentLabel}</span>
        )}
        <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
      </Button>

      {/* 下拉列表 (纯 Tailwind 实现，不依赖 Command 组件) */}
      {isOpen && (
        <div className="absolute top-12 left-0 w-60 z-50 rounded-md border border-slate-200 bg-white shadow-md animate-in fade-in zoom-in-95 duration-100">
          <div className="p-1">
            <div className="px-2 py-1.5 text-xs font-semibold text-slate-500">
              选择业务单元
            </div>
            {BUSINESS_UNITS.map((unit) => (
              <button
                key={unit.id}
                onClick={() => {
                  setBusinessId(unit.id);
                  setIsOpen(false);
                  router.push(unit.id === "family" ? "/family" : "/");
                }}
                className={`
                  relative flex w-full cursor-default select-none items-center rounded-sm py-2 pl-2 pr-8 text-sm outline-none hover:bg-slate-100 transition-colors
                  ${currentBusinessId === unit.id ? "bg-slate-50 text-indigo-600 font-medium" : "text-slate-700"}
                `}
              >
                <div className="flex items-center gap-2">
                  <unit.icon className={`h-4 w-4 ${currentBusinessId === unit.id ? "text-indigo-600" : "text-slate-400"}`} />
                  <span>{unit.name}</span>
                </div>
                {currentBusinessId === unit.id && (
                  <span className="absolute right-2 flex h-3.5 w-3.5 items-center justify-center">
                    <Check className="h-4 w-4" />
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}