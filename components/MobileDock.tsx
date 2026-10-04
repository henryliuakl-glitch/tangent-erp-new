"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ComponentType } from "react";
import {
  CalendarDays,
  CirclePlus,
  Home,
  ReceiptText,
  Users,
} from "lucide-react";
import { useBusiness } from "@/contexts/BusinessContext";
import { isDrivingSchoolBusiness } from "@/lib/business";

function NavItem({
  href,
  icon: Icon,
  label,
  active,
  primary = false,
}: {
  href: string;
  icon: ComponentType<{ className?: string }>;
  label: string;
  active: boolean;
  primary?: boolean;
}) {
  return (
    <Link
      href={href}
      className={`flex min-w-0 flex-1 flex-col items-center justify-center gap-0.5 py-1.5 transition-transform active:scale-95 ${
        primary ? "text-indigo-600" : active ? "text-slate-950" : "text-slate-400"
      }`}
    >
      <div
        className={`flex h-7 w-7 items-center justify-center rounded-lg transition-colors ${
          primary
            ? "bg-indigo-600 text-white shadow-sm"
            : active
              ? "bg-slate-100 text-slate-950"
              : "text-slate-400"
        }`}
      >
        <Icon className="h-4 w-4" />
      </div>
      <span
        className={`max-w-full truncate text-[9px] font-semibold ${
          primary ? "text-indigo-600" : active ? "text-slate-800" : "text-slate-400"
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

  const createHref = driving ? "/bookings/quick" : "/bookings/new";
  const createLabel = driving ? "排课" : "新建";

  return (
    <div className="fixed inset-x-0 bottom-0 z-50 border-t border-slate-200 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-md md:hidden">
      <div className="mx-auto flex h-[58px] max-w-lg items-stretch px-2">
        <NavItem href="/" icon={Home} label="首页" active={pathname === "/"} />
        <NavItem
          href="/students"
          icon={Users}
          label="学员"
          active={pathname.startsWith("/students")}
        />
        <NavItem
          href={createHref}
          icon={CirclePlus}
          label={createLabel}
          active={pathname.startsWith("/bookings/quick") || pathname.startsWith("/bookings/new")}
          primary
        />
        <NavItem
          href="/bookings"
          icon={CalendarDays}
          label="日程"
          active={pathname === "/bookings"}
        />
        <NavItem
          href="/finance"
          icon={ReceiptText}
          label="财务"
          active={pathname.startsWith("/finance")}
        />
      </div>
    </div>
  );
}
