import Link from "next/link";

export default function AccessDeniedPage(){
  return <main className="flex min-h-dvh items-center justify-center bg-[#f5f6fc] p-5">
    <section className="w-full max-w-md rounded-2xl bg-white p-7 text-center shadow-sm">
      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-amber-50 text-xl">🔒</div>
      <h1 className="mt-4 text-xl font-bold text-slate-900">账号尚未分配 ERP 权限</h1>
      <p className="mt-3 text-sm leading-7 text-slate-600">
        你的账号已通过登录验证，但没有查到有效的实体成员权限，
        或者暂时无法验证权限。请联系系统管理员在
        <span className="font-semibold"> erp_memberships </span>
        中确认所属实体与角色。
      </p>
      <div className="mt-5 flex flex-wrap justify-center gap-3">
        <Link href="/login" className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white">返回登录页</Link>
      </div>
      <p className="mt-4 text-xs text-slate-400">Astra 教师应具有 astra / teacher 权限，无需 CuS 权限。</p>
    </section>
  </main>;
}
