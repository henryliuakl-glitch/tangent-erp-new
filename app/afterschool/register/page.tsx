import Link from "next/link";
import {createClient} from "@/lib/supabase/server";
import {Navbar} from "@/components/Navbar";
import {MobileDock} from "@/components/MobileDock";
import {CareRegistration} from "./registration";

export default async function RegisterCarePage(){
 const db=await createClient();
 const {data:{user}}=await db.auth.getUser();
 if(!user) return <main className="p-8"><Link href="/login">请先登录</Link></main>;
 const {data:m}=await db.from("erp_memberships").select("role").eq("business_unit_id","cus").eq("user_id",user.id).maybeSingle();
 if(!["owner","admin"].includes(m?.role||"")) return <main className="p-8">仅 CuS Owner/Admin 可以办理报名。</main>;
 const {data:students}=await db.from("students").select("id,name").eq("business_unit_id","cus").order("name");
 return <div className="min-h-screen bg-slate-50 pb-24 md:pb-10">
  <div className="hidden md:block"><Navbar/></div>
  <main className="px-3 py-5 md:px-6"><CareRegistration students={students||[]}/></main>
  <MobileDock/>
 </div>;
}
