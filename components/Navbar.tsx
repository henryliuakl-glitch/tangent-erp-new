"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  CalendarDays,
  LayoutDashboard,
  LogOut,
  Menu,
  ReceiptText,
  Users,
} from "lucide-react";

import BusinessSwitcher from "@/components/BusinessSwitcher";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { createClient } from "@/lib/supabase/client";

const NAV_ITEMS = [
  { href: "/", label: "工作台", icon: LayoutDashboard },
  { href: "/students", label: "学员", icon: Users },
  { href: "/bookings", label: "排课", icon: CalendarDays },
  { href: "/finance", label: "财务", icon: ReceiptText },
];

export function Navbar() {
  const pathname = usePathname();
  const router = useRouter();

  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href);

  const handleLogout = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
  };

  return (
    <nav className="sticky top-0 z-40 border-b border-slate-200 bg-white/95 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-[1440px] items-center justify-between gap-6 px-6 lg:px-8">
        <div className="flex min-w-0 items-center gap-7">
          <Link href="/" className="flex shrink-0 items-center gap-2.5">
            <img src="/favicon.svg" alt="" className="h-8 w-8" />
            <div className="hidden xl:block">
              <div className="text-sm font-bold tracking-tight text-slate-950">Tangent ERP</div>
              <div className="text-[9px] font-semibold uppercase tracking-[0.14em] text-slate-400">
                Operations
              </div>
            </div>
          </Link>

          <div className="hidden items-center gap-1 lg:flex">
            {NAV_ITEMS.map(({ href, label, icon: Icon }) => (
              <Link
                key={href}
                href={href}
                className={`flex h-9 items-center gap-2 rounded-lg px-3 text-sm font-semibold transition-colors ${
                  isActive(href)
                    ? "bg-slate-100 text-slate-950"
                    : "text-slate-500 hover:bg-slate-50 hover:text-slate-900"
                }`}
              >
                <Icon className="h-4 w-4" />
                {label}
              </Link>
            ))}
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <BusinessSwitcher />

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                size="icon"
                className="h-9 w-9 rounded-lg border-slate-200 bg-white shadow-none"
              >
                <Menu className="h-4 w-4 text-slate-600" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52 rounded-xl p-2">
              <DropdownMenuItem asChild>
                <Link href="/bookings/quick" className="cursor-pointer rounded-lg">
                  快速排课
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link href="/finance/add" className="cursor-pointer rounded-lg">
                  记一笔
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link href="/finance/transactions" className="cursor-pointer rounded-lg">
                  查看流水
                </Link>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={handleLogout}
                className="cursor-pointer rounded-lg text-rose-600 focus:bg-rose-50 focus:text-rose-700"
              >
                <LogOut className="mr-2 h-4 w-4" />
                退出登录
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </nav>
  );
}
