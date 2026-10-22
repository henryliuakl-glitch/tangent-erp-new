"use client";

import { useEffect, useRef, useState } from "react";
import { Building2, Check, House, LayoutGrid, LogOut, UserRound, Car } from "lucide-react";

type BusinessItem = {
  id: string;
  name: string;
};

const iconFor = (id: string) => {
  if (id === "family") return House;
  if (id === "tangent") return LayoutGrid;
  if (id === "sine") return Car;
  return Building2;
};

export function MobileAccountMenu({
  user,
  currentBusinessId,
  businesses,
  onSwitch,
  onSignOut,
}: {
  user?: any;
  currentBusinessId: string;
  businesses: BusinessItem[];
  onSwitch: (id: string) => void;
  onSignOut: () => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDoc = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-full border border-slate-200 bg-white shadow-sm"
        aria-label="账户与业务切换"
      >
        {user?.avatar_url ? (
          <img src={user.avatar_url} alt="" className="h-full w-full object-cover" />
        ) : (
          <UserRound className="h-5 w-5 text-slate-500" />
        )}
      </button>

      {open ? (
        <div className="absolute right-0 top-12 z-50 w-64 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl">
          <div className="border-b border-slate-100 px-4 py-3">
            <div className="text-xs font-semibold text-slate-400">切换实体</div>
          </div>
          <div className="p-2">
            {businesses.map((b) => {
              const Icon = iconFor(b.id);
              return (
                <button
                  type="button"
                  key={b.id}
                  onClick={() => {
                    onSwitch(b.id);
                    setOpen(false);
                  }}
                  className="flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-left text-sm font-semibold text-slate-700 hover:bg-slate-50"
                >
                  <span className="flex items-center gap-2">
                    <Icon className="h-4 w-4 text-slate-400" />
                    {b.name}
                  </span>
                  {currentBusinessId === b.id ? <Check className="h-4 w-4 text-indigo-600" /> : null}
                </button>
              );
            })}
          </div>
          <div className="border-t border-slate-100 p-2">
            <button
              type="button"
              onClick={onSignOut}
              className="flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-sm font-semibold text-rose-600 hover:bg-rose-50"
            >
              <LogOut className="h-4 w-4" />
              退出登录
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
