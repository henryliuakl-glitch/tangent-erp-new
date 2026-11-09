"use server";
import {revalidatePath} from "next/cache";
import {createClient} from "@/lib/supabase/server";

export async function convertPublicInquiry(id:string){
 const db=await createClient();
 const {data:{user}}=await db.auth.getUser();
 if(!user)return {error:"请先登录"};
 const {data:membership,error:membershipError}=await db.from("erp_memberships")
   .select("role").eq("user_id",user.id).eq("business_unit_id","cus")
   .eq("role","owner").maybeSingle();
 if(membershipError||!membership)return {error:"只有 CuS 核心管理员可以处理公开咨询"};
 if(!/^[0-9a-f-]{36}$/i.test(id))return {error:"无效咨询编号"};
 const {data,error}=await db.rpc("erp_convert_public_inquiry",{p_id:id});
 if(error)return {error:error.message};
 revalidatePath("/crm/public-inquiries");
 revalidatePath("/crm");
 return {success:true,leadId:data};
}
