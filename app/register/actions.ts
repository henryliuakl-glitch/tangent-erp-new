"use server";

import {createHash} from "node:crypto";
import {headers} from "next/headers";
import {createClient} from "@supabase/supabase-js";

const clean=(form:FormData,key:string,max:number)=>{
 const value=String(form.get(key)||"").trim();
 if(value.length>max)throw new Error("输入内容过长："+key);
 return value;
};

/**
 * Public enrollment requests must NEVER bypass RLS to create live student
 * records. Store them in the isolated pending-inquiry inbox instead.
 */
export async function submitRegistration(form:FormData){
 try{
  // Honeypot: harmless for real students, filters unsophisticated bots.
  if(form.get("website"))return {success:true,code:""};
  const name=clean(form,"name",160);
  const phone=clean(form,"phone",100);
  const email=clean(form,"email",200);
  const school=clean(form,"school",200);
  const level=clean(form,"level",100);
  const subject=clean(form,"subject",200);
  const goal=clean(form,"goal",500);
  const currentGrade=clean(form,"currentGrade",100);
  const targetGrade=clean(form,"targetGrade",100);
  const notes=clean(form,"notes",1000);
  if(name.length<1||phone.length<5){
   return {error:"请填写学生姓名及有效联系方式"};
  }
  if(email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)){
   return {error:"邮箱格式不正确"};
  }
  const h=await headers();
  const forwarded=h.get("x-forwarded-for");
  const remote=forwarded?.split(",")[0]?.trim()||h.get("x-real-ip")||"unknown";
  // No raw network address or email is stored in the rate-limit table.
  const secret=process.env.SUPABASE_SERVICE_ROLE_KEY;
  const url=process.env.NEXT_PUBLIC_SUPABASE_URL;
  if(!secret||!url)throw new Error("服务暂时不可用");
  const fingerprint=createHash("sha256").update(remote+"|"+secret).digest("hex");
  const db=createClient(url,secret,{auth:{autoRefreshToken:false,persistSession:false}});
  const {error}=await db.rpc("erp_submit_public_inquiry",{
   p_fingerprint:fingerprint,p_name:name,p_phone:phone,p_email:email,
   p_school:school,p_year_level:level,p_subject:subject,p_goal:goal,
   p_current_grade:currentGrade,p_target_grade:targetGrade,p_notes:notes
  });
  if(error){
   if(/too many/i.test(error.message))return {error:"提交过于频繁，请稍后再试"};
   console.error("Public inquiry rejected:",error.code);
   return {error:"提交失败，请稍后重试"};
  }
  return {success:true,code:""};
 }catch(e){
  console.error("Public inquiry error:",e instanceof Error?e.message:"unknown");
  return {error:"提交失败，请检查填写内容后重试"};
 }
}
