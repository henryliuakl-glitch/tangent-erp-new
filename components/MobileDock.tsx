"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ComponentType } from "react";
import {
  Home as HomeIcon,
  Users,
  Calendar as CalendarIcon,
  FileBarChart,
  PenLine,
  Plus,
} from "lucide-react";
import { useBusiness } from "@/contexts/BusinessContext";
import { isDrivingSchoolBusiness } from "@/lib/business";

function TabItem({
  href,
  icon: Icon,
  label,
  isActive,
}: {
  href: string;
  icon: ComponentType<{ className?: string }>;
  label: string;
  isActive: boolean;
}) {
  return (
    <Link
      href={href}
      className={`flex flex-1 flex-col items-center justify-center gap-1 py-2 group active:scale-95 transition-transform ${
        isActive ? "text-indigo-600" : "text-slate-400"
      }`}
    >
      <div
        className={`h-6 w-6 ${
          isActive ? "text-indigo-600" : "text-slate-400 group-hover:text-slate-600"
        } transition-colors`}
      >
        <Icon className="h-full w-full" />
      </div>
      <span
        className={`text-[10px] font-medium ${
          isActive ? "text-indigo-600" : "text-slate-500 group-hover:text-slate-800"
        }`}
      >
        {label}
      </span>
    </Link>
  );
}

export function MobileDock() {
  const pathname = usePathname();
  const { currentBusinessId } = useBusiness();
  const driving = isDrivingSchoolBusiness(currentBusinessId);

  const isHome = pathname === "/";
  const isStudents = pathname.startsWith("/students");
  const isBookings = pathname.startsWith("/bookings");
  const isFinance = pathname === "/finance" || pathname.startsWith("/finance/transactions");
  const isFinanceAdd = pathname.startsWith("/finance/add");

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 w-full max-w-full overflow-visible border-t border-slate-200/60 bg-white/95 px-4 pb-[env(safe-area-inset-bottom,16px)] pt-1 backdrop-blur-md md:hidden">
      <div className="flex items-end justify-between overflow-visible">
        <TabItem href="/" icon={HomeIcon} label="首页" isActive={isHome} />
        <TabItem href="/students" icon={Users} label="学生" isActive={isStudents} />

        {driving ? (
          <Link
            href="/bookings/quick"
            className="relative -top-5 flex flex-col items-center justify-center active:scale-90 transition-transform"
            aria-label="极速排课"
          >
            <div className={`flex h-14 w-14 items-center justify-center rounded-full border-4 border-slate-50 text-white shadow-lg ${
              pathname.startsWith("/bookings/quick") || pathname.startsWith("/bookings/new")
                ? "bg-indigo-700 shadow-indigo-400/60"
                : "bg-indigo-600 shadow-indigo-400/50"
            }`}>
              <Plus className="h-7 w-7" strokeWidth={2.5} />
            </div>
            <span className="mt-1 text-[10px] font-semibold leading-none text-indigo-600">
              极速排课
            </span>
          </Link>
        ) : (
          <Link
            href="/finance/add"
            className="relative -top-5 flex flex-col items-center justify-center active:scale-90 transition-transform"
            aria-label="记一笔"
          >
            <div className={`flex h-14 w-14 items-center justify-center rounded-full border-4 border-slate-50 text-white shadow-lg ${
              isFinanceAdd ? "bg-slate-800 shadow-slate-400/60" : "bg-slate-900 shadow-slate-400/50"
            }`}>
              <PenLine className="h-6 w-6" />
            </div>
            <span className="mt-1 text-[10px] font-semibold leading-none text-slate-700">
              记一笔
            </span>
          </Link>
        )}

        <TabItem href="/bookings" icon={CalendarIcon} label="排课" isActive={isBookings && !pathname.startsWith("/bookings/quick") && !pathname.startsWith("/bookings/new")} />
        <TabItem
          href="/finance"
          icon={FileBarChart}
          label="报表"
          isActive={isFinance || (!driving && isFinanceAdd)}
        />
      </div>
    </div>
  );
}
