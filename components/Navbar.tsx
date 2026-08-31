"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import BusinessSwitcher from "@/components/BusinessSwitcher";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Menu,
  LayoutDashboard,
  CalendarDays,
  Users,
  PlusCircle,
  ListOrdered,
  LogOut
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";

export function Navbar() {
  const pathname = usePathname();
  const router = useRouter();
  const supabase = createClient();

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push("/login");
  };

  // 辅助函数：判断链接是否激活 (用于高亮)
  const isActive = (path: string) =>
    path === "/" ? pathname === "/" : pathname.startsWith(path);

  return (
    <nav className="sticky top-0 z-40 flex h-16 w-full items-center justify-between border-b border-slate-200/70 bg-white/80 px-4 backdrop-blur-md sm:px-6">
      
      {/* 1. 左侧：Logo (点击回首页) */}
      <div className="flex items-center gap-4">
        <Link 
          href="/" 
          className="flex items-center gap-2 transition-opacity hover:opacity-80"
        >
          {/* ✅ 替换为你新生成的 SVG Logo */}
          <img 
            src="/favicon.svg" 
            alt="Tangent ERP Logo" 
            className="h-8 w-auto object-contain" 
          />
          <span className="text-lg font-bold tracking-tight text-slate-900 hidden sm:inline-block">
            Tangent ERP
          </span>
        </Link>
      </div>

      {/* 2. 右侧：业务切换 + 导航菜单 */}
      <div className="flex items-center gap-3">
        {/* 业务切换器 */}
        <BusinessSwitcher />

        {/* 汉堡菜单 (核心导航) */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="icon" className="h-10 w-10 rounded-xl border-slate-200/70 bg-white shadow-sm">
              <Menu className="h-5 w-5 text-slate-600" />
            </Button>
          </DropdownMenuTrigger>
          
          <DropdownMenuContent align="end" className="w-56 rounded-xl p-2 shadow-xl">
            
            {/* 首页 */}
            <Link href="/">
              <DropdownMenuItem className={`rounded-lg px-3 py-2.5 cursor-pointer ${isActive('/') ? 'bg-indigo-50 text-indigo-700 font-medium' : ''}`}>
                <LayoutDashboard className="mr-2 h-4 w-4" />
                仪表盘 (Dashboard)
              </DropdownMenuItem>
            </Link>

            <DropdownMenuSeparator className="my-1 bg-slate-100" />

            {/* 财务模块 */}
            <DropdownMenuLabel className="px-3 py-1.5 text-xs text-slate-400 font-normal uppercase tracking-wider">
              财务 (Finance)
            </DropdownMenuLabel>
            <Link href="/finance/add">
              <DropdownMenuItem className={`rounded-lg px-3 py-2 cursor-pointer ${pathname.startsWith('/finance/add') ? 'bg-indigo-50 text-indigo-700 font-medium' : ''}`}>
                <PlusCircle className="mr-2 h-4 w-4 text-emerald-500" />
                记一笔 (Record)
              </DropdownMenuItem>
            </Link>
            <Link href="/finance/reimburse">
              <DropdownMenuItem className={`rounded-lg px-3 py-2 cursor-pointer ${pathname.startsWith('/finance/reimburse') ? 'bg-indigo-50 text-indigo-700 font-medium' : ''}`}>
                <PlusCircle className="mr-2 h-4 w-4 text-amber-500" />
                报销平账 (Reimburse)
              </DropdownMenuItem>
            </Link>
            <Link href="/finance/transactions">
              <DropdownMenuItem className={`rounded-lg px-3 py-2 cursor-pointer ${pathname.startsWith('/finance/transactions') ? 'bg-indigo-50 text-indigo-700 font-medium' : ''}`}>
                <ListOrdered className="mr-2 h-4 w-4 text-slate-500" />
                查流水 (History)
              </DropdownMenuItem>
            </Link>

            <DropdownMenuSeparator className="my-1 bg-slate-100" />

            {/* 排课模块 */}
            <DropdownMenuLabel className="px-3 py-1.5 text-xs text-slate-400 font-normal uppercase tracking-wider">
              排课 (Bookings)
            </DropdownMenuLabel>
            <Link href="/bookings/quick">
              <DropdownMenuItem className={`rounded-lg px-3 py-2 cursor-pointer ${pathname.startsWith('/bookings/quick') || pathname.startsWith('/bookings/new') ? 'bg-indigo-50 text-indigo-700 font-medium' : ''}`}>
                <PlusCircle className="mr-2 h-4 w-4 text-amber-500" />
                极速排课 (Quick)
              </DropdownMenuItem>
            </Link>
            <Link href="/bookings">
              <DropdownMenuItem className={`rounded-lg px-3 py-2 cursor-pointer ${pathname === '/bookings' ? 'bg-indigo-50 text-indigo-700 font-medium' : ''}`}>
                <CalendarDays className="mr-2 h-4 w-4 text-slate-500" />
                排课表 (Schedule)
              </DropdownMenuItem>
            </Link>

            <DropdownMenuSeparator className="my-1 bg-slate-100" />

            {/* 学员模块 */}
            <DropdownMenuLabel className="px-3 py-1.5 text-xs text-slate-400 font-normal uppercase tracking-wider">
              学员 (Students)
            </DropdownMenuLabel>
            <Link href="/students/new">
              <DropdownMenuItem className={`rounded-lg px-3 py-2 cursor-pointer ${pathname.startsWith('/students/new') ? 'bg-indigo-50 text-indigo-700 font-medium' : ''}`}>
                <PlusCircle className="mr-2 h-4 w-4 text-indigo-500" />
                添加学员 (Add)
              </DropdownMenuItem>
            </Link>
            <Link href="/students">
              <DropdownMenuItem className={`rounded-lg px-3 py-2 cursor-pointer ${pathname === '/students' ? 'bg-indigo-50 text-indigo-700 font-medium' : ''}`}>
                <Users className="mr-2 h-4 w-4 text-slate-500" />
                学员名单 (List)
              </DropdownMenuItem>
            </Link>

            <DropdownMenuSeparator className="my-1 bg-slate-100" />

            {/* 登出 */}
            <DropdownMenuItem 
              onClick={handleLogout}
              className="rounded-lg px-3 py-2 text-rose-600 focus:bg-rose-50 focus:text-rose-700 cursor-pointer"
            >
              <LogOut className="mr-2 h-4 w-4" />
              退出登录
            </DropdownMenuItem>

          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </nav>
  );
}