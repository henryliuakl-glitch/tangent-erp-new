import Link from "next/link";
import {createClient} from "@/lib/supabase/server";
import {Navbar} from "@/components/Navbar";
import {MobileDock} from "@/components/MobileDock";
import {CareRegistration} from "./registration";

export default async function RegisterCarePage(){
 const db=await createClient();
 const {data:{user}}=await db.auth.getUser();
 if(!user) return <main className="p-8"><Link href="/login">请先登录</Link></main>;
 const {data:members}=await db.from("erp_memberships").select("business_unit_id,role").eq("user_id",user.id);
 const authorized=members?.some(m=>(m.business_unit_id==="cus"&&m.role==="owner")||
   (m.business_unit_id==="care"&&["owner","admin"].includes(m.role)));
 if(!authorized) return <main className="p-8">没有晚托档案管理权限。</main>;
 return <div className="min-h-screen bg-slate-50 pb-24 md:pb-10">
  <div className="hidden md:block"><Navbar/></div>
  <main className="px-3 py-5 md:px-6"><CareRegistration/></main>
  <MobileDock/>
 </div>;
}
