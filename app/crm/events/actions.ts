"use server";
import {revalidatePath} from "next/cache";
import {nzLocalToUtc} from "@/lib/timezone";
import {educationManagerForm,requiredFormString,formString,actionError,type ActionFeedback} from "@/lib/education-manager";

const categories=["event","trial_day","workshop","holiday","seminar","other"];
const statuses=["draft","open","closed","completed","cancelled"];
function eventDate(form:FormData,key:string,optional=false){
 const input=formString(form,key,30);
 if(optional&&!input)return null;
 const m=/^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})$/.exec(input);
 if(!m)throw new Error("请选择有效的日期与时间："+key);
 const value=nzLocalToUtc(m[1],m[2]);
 if(!Number.isFinite(+value))throw new Error("活动时间格式无效");
 return value.toISOString();
}
function price(form:FormData){
 const v=formString(form,"advertised_fee_nzd",30);
 if(!v)return null;
 const value=Number(v);
 if(!Number.isFinite(value)||value<0||value>100000)throw new Error("活动价格无效");
 return value;
}
export async function createCampaign(form:FormData):Promise<ActionFeedback>{
 try {
  const {db,user,unit}=await educationManagerForm(form);
  const category=formString(form,"category",30)||"event";
  const status=formString(form,"status",30)||"draft";
  if(!categories.includes(category)||!statuses.includes(status))throw new Error("无效活动类别或状态");
  const capacity=Number(requiredFormString(form,"capacity",10));
  if(!Number.isInteger(capacity)||capacity<1||capacity>500)throw new Error("报名上限必须为1–500");
  const starts_at=eventDate(form,"starts_at")!,ends_at=eventDate(form,"ends_at",true);
  if(ends_at&&ends_at<=starts_at)throw new Error("结束时间必须晚于开始时间");
  const {error}=await db.from("edu_campaigns").insert({
    business_unit_id:unit,title:requiredFormString(form,"title",200),
    category,starts_at,ends_at,capacity,status,
    location:formString(form,"location",200)||null,
    advertised_fee_nzd:price(form),
    lead_source:formString(form,"lead_source",100)||"活动",
    notes:formString(form,"notes",2000)||null,
    created_by:user.id
  });
  if(error)throw new Error(error.message);
  revalidatePath("/crm/events");
  return {ok:true};
 }catch(e){return actionError(e);}
}
export async function updateCampaign(form:FormData):Promise<ActionFeedback>{
 try{
  const {db,unit}=await educationManagerForm(form);
  const id=requiredFormString(form,"campaign_id",60);
  const status=requiredFormString(form,"status",40);
  if(!statuses.includes(status))throw new Error("无效活动状态");
  const {data,error}=await db.from("edu_campaigns")
    .update({status,notes:formString(form,"notes",2000)||null,
      updated_at:new Date().toISOString()})
    .eq("id",id).eq("business_unit_id",unit).select("id").maybeSingle();
  if(error)throw new Error(error.message);
  if(!data)throw new Error("活动不属于当前实体");
  revalidatePath("/crm/events");return {ok:true};
 }catch(e){return actionError(e);}
}
export async function signUpCampaign(form:FormData):Promise<ActionFeedback>{
 try{
  const {db,unit}=await educationManagerForm(form);
  const campaignId=requiredFormString(form,"campaign_id",60);
  const {data:campaign,error}=await db.from("edu_campaigns").select("id,status")
    .eq("id",campaignId).eq("business_unit_id",unit).maybeSingle();
  if(error||!campaign)throw new Error("活动不存在或没有权限");
  if(campaign.status!=="open")throw new Error("活动未开放报名");
  const leadId=formString(form,"lead_id",60)||null;
  const studentName=leadId?null:requiredFormString(form,"student_name",160);
  const {error:rpcError}=await db.rpc("erp_education_campaign_signup",{
   p_campaign_id:campaignId,
   p_lead_id:leadId,
   p_student_name:studentName,
   p_parent_name:leadId?null:formString(form,"parent_name",160)||null,
   p_contact:leadId?null:formString(form,"contact",160)||null
  });
  if(rpcError)throw new Error(rpcError.message);
  revalidatePath("/crm/events");revalidatePath("/crm");
  return {ok:true};
 }catch(e){return actionError(e);}
}
export async function markEventAttendance(form:FormData):Promise<ActionFeedback>{
 try{
  const {db,unit}=await educationManagerForm(form);
  const id=requiredFormString(form,"registration_id",60);
  const status=requiredFormString(form,"status",30);
  if(!["attended","no_show","cancelled"].includes(status))throw new Error("只能标记到场、未到或取消");
  const {data,error}=await db.from("edu_campaign_registrations").update({
   status,notes:formString(form,"notes",1000)||null,
   updated_at:new Date().toISOString()
  }).eq("id",id).eq("business_unit_id",unit).neq("status","cancelled")
    .select("id").maybeSingle();
  if(error)throw new Error(error.message);
  if(!data)throw new Error("报名不存在、已取消或没有权限");
  revalidatePath("/crm/events");return {ok:true};
 }catch(e){return actionError(e);}
}
