"use server";
import {revalidatePath} from "next/cache";
import {educationManagerForm,formString,requiredFormString,actionError,type ActionFeedback} from "@/lib/education-manager";

const types=["first_aid","police_vetting","p_endorsement","teacher_registration","other"];
const outcomes=["planned","completed","followup","cancelled"];
const kinds=["onboarding","training","demo","observation","review"];
const statuses=["pending","verified","needs_review"];
function qualityScore(form:FormData){
 const raw=formString(form,"quality_score",2);
 if(!raw)return null;
 const value=Number(raw);
 if(!Number.isInteger(value)||value<1||value>5)throw new Error("评分应为1–5");
 return value;
}

function date(form:FormData,key:string){
 const d=formString(form,key,10);
 if(d&&!/^\d{4}-\d{2}-\d{2}$/.test(d))throw new Error("日期格式不正确："+key);
 return d||null;
}
async function checkStaff(db:Awaited<ReturnType<typeof import("@/lib/supabase/server").createClient>>,unit:"cus"|"astra",staffId:string){
 const {data,error}=await db.from("cus_staff").select("id,scope")
  .eq("id",staffId).maybeSingle();
 if(error||!data||!(unit==="cus"?data.scope==="general":["astra","care"].includes(data.scope)))
  throw new Error("教师不属于当前教培实体");
}

export async function saveCredential(form:FormData):Promise<ActionFeedback>{
 try{
  const {db,unit,user}=await educationManagerForm(form);
  const staffId=requiredFormString(form,"staff_id",60);
  await checkStaff(db,unit,staffId);
  const type=requiredFormString(form,"credential_type",40);
  const status=formString(form,"status",40)||"pending";
  if(!types.includes(type)||!statuses.includes(status))throw new Error("证书类型或状态无效");
  const {error}=await db.from("edu_staff_credentials").insert({
    business_unit_id:unit,staff_id:staffId,credential_type:type,
    title:requiredFormString(form,"title",200),status,
    reference_note:formString(form,"reference_note",200)||null,
    issued_on:date(form,"issued_on"),review_due_on:date(form,"review_due_on"),
    notes:formString(form,"notes",1000)||null,created_by:user.id
  });
  if(error)throw new Error(error.message);
  revalidatePath("/teaching");
  return {ok:true};
 }catch(e){return actionError(e);}
}

export async function updateCredential(form:FormData):Promise<ActionFeedback>{
 try{
  const {db,unit}=await educationManagerForm(form);
  const status=requiredFormString(form,"status",40);
  if(!statuses.includes(status))throw new Error("无效的证书状态");
  const {data,error}=await db.from("edu_staff_credentials")
   .update({status,review_due_on:date(form,"review_due_on"),
    notes:formString(form,"notes",1000)||null,updated_at:new Date().toISOString()})
   .eq("id",requiredFormString(form,"id",60)).eq("business_unit_id",unit)
   .select("id").maybeSingle();
  if(error)throw new Error(error.message);
  if(!data)throw new Error("证书未找到或没有权限");
  revalidatePath("/teaching");return {ok:true};
 }catch(e){return actionError(e);}
}

export async function saveTraining(form:FormData):Promise<ActionFeedback>{
 try{
  const {db,unit,user}=await educationManagerForm(form);
  const staffId=requiredFormString(form,"staff_id",60);
  await checkStaff(db,unit,staffId);
  const kind=requiredFormString(form,"kind",40),outcome=requiredFormString(form,"outcome",40);
  if(!kinds.includes(kind)||!outcomes.includes(outcome))throw new Error("培训类型或结果无效");
  const sessionDate=date(form,"session_date");
  if(!sessionDate)throw new Error("请选择日期");
  const {error}=await db.from("edu_staff_training").insert({
    business_unit_id:unit,staff_id:staffId,kind,
    title:requiredFormString(form,"title",200),session_date:sessionDate,
    outcome,quality_score:qualityScore(form),
    notes:formString(form,"notes",2000)||null,created_by:user.id
  });
  if(error)throw new Error(error.message);
  revalidatePath("/teaching");return {ok:true};
 }catch(e){return actionError(e);}
}

export async function updateTraining(form:FormData):Promise<ActionFeedback>{
 try{
  const {db,unit}=await educationManagerForm(form);
  const outcome=requiredFormString(form,"outcome",40);
  if(!outcomes.includes(outcome))throw new Error("无效培训结果");
  const {data,error}=await db.from("edu_staff_training").update({
    outcome,quality_score:qualityScore(form),
    notes:formString(form,"notes",2000)||null,updated_at:new Date().toISOString()
  }).eq("id",requiredFormString(form,"id",60)).eq("business_unit_id",unit)
    .select("id").maybeSingle();
  if(error)throw new Error(error.message);
  if(!data)throw new Error("培训记录不存在或没有权限");
  revalidatePath("/teaching");return {ok:true};
 }catch(e){return actionError(e);}
}
