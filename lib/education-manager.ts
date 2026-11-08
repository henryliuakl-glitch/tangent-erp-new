import "server-only";
import {cookies} from "next/headers";
import {createClient} from "@/lib/supabase/server";

export type EducationUnit="cus"|"astra";

export async function educationManager(){
 const db=await createClient();
 const {data:{user},error:userError}=await db.auth.getUser();
 if(userError||!user)throw new Error("请先登录");
 const rawUnit=(await cookies()).get("businessId")?.value||"cus";
 if(rawUnit!=="cus"&&rawUnit!=="astra")throw new Error("请先切换到 CuS 或 Astra 实体");
 const {data:members,error}=await db.from("erp_memberships")
   .select("business_unit_id,role").eq("user_id",user.id)
   .in("business_unit_id",["cus","astra"]);
 if(error)throw new Error("无法验证教培管理权限");
 const owner=members?.some(m=>m.business_unit_id==="cus"&&m.role==="owner");
 const manager=members?.some(m=>m.business_unit_id===rawUnit&&["owner","admin"].includes(m.role));
 if(!owner&&!manager)throw new Error("当前账号没有该教培实体的经营管理权限");
 return {db,user,unit:rawUnit as EducationUnit};
}
export async function educationManagerForm(form:FormData){
 const ctx=await educationManager();
 if(String(form.get("businessId")||"")!==ctx.unit)
  throw new Error("当前实体已切换，请刷新页面后重试");
 return ctx;
}
export function formString(form:FormData,key:string,max=500):string{
 const value=String(form.get(key)||"").trim();
 if(value.length>max)throw new Error(key+"内容过长");
 return value;
}
export function requiredFormString(form:FormData,key:string,max=500):string{
 const value=formString(form,key,max);
 if(!value)throw new Error("请填写："+key);
 return value;
}
export function nzDateTime(form:FormData,key:string){
 const raw=requiredFormString(form,key,40);
 const match=/^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})$/.exec(raw);
 if(!match)throw new Error("请填写有效的新西兰日期及时间");
 // Existing ERP uses the same Auckland timezone conversion.
 return raw;
}
export type ActionFeedback={ok:true}|{ok:false;error:string};
export function actionError(error:unknown):ActionFeedback{
 return {ok:false,error:error instanceof Error?error.message:"保存失败，请重试"};
}
