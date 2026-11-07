"use server";

import {revalidatePath} from "next/cache";
import {createClient} from "@/lib/supabase/server";
import {nzLocalToUtc} from "@/lib/timezone";

type Unit="cus"|"astra";
type ActionResult={ok:true;studentId?:string}|{ok:false;error:string};
const statuses=["new","contacted","trial_booked","trial_done","considering","enrolled","lost"];
const trialStatuses=["scheduled","completed","no_show","cancelled"];
const followupKinds=["lead","trial","parent","renewal"];
function value(form:FormData,key:string){return String(form.get(key)||"").trim();}
function required(form:FormData,key:string){const v=value(form,key);if(!v)throw new Error("请填写："+key);return v;}
function limit(v:string,max=2000){if(v.length>max)throw new Error("内容过长");return v||null;}
function parseNz(v:string,optional=false){
 if(!v&&optional)return null;
 const match=/^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})$/.exec(v);
 if(!match)throw new Error("请选择有效的新西兰日期和时间");
 const date=nzLocalToUtc(match[1],match[2]);
 if(!Number.isFinite(+date))throw new Error("日期格式不正确");
 return date.toISOString();
}
async function context(form:FormData){
 const unit=value(form,"businessId");
 if(unit!=="cus"&&unit!=="astra")throw new Error("请选择 CuS 或 Astra 实体");
 const db=await createClient();
 const {data:{user}}=await db.auth.getUser();
 if(!user)throw new Error("请先登录");
 const {data:members,error}=await db.from("erp_memberships")
   .select("business_unit_id,role").eq("user_id",user.id)
   .in("business_unit_id",["cus","astra"]);
 if(error)throw new Error("无法验证教培权限");
 const isOwner=members?.some(m=>m.business_unit_id==="cus"&&m.role==="owner");
 const manager=members?.some(m=>m.business_unit_id===unit&&["owner","admin"].includes(m.role));
 if(!isOwner&&!manager)throw new Error("只有当前教培实体的管理员可以管理招生");
 return {unit:unit as Unit,db,user};
}
async function assertLead(db:Awaited<ReturnType<typeof createClient>>,unit:Unit,id:string){
 const {data,error}=await db.from("edu_leads").select("id,student_id,status")
    .eq("id",id).eq("business_unit_id",unit).maybeSingle();
 if(error)throw new Error(error.message);
 if(!data)throw new Error("找不到当前实体的咨询记录");
 return data;
}
function respond(e:unknown):ActionResult{
 return {ok:false,error:e instanceof Error?e.message:"保存失败，请重试"};
}
function refresh(){
 revalidatePath("/crm");
 revalidatePath("/students");
}

export async function saveLead(form:FormData):Promise<ActionResult>{
 try {
  const {db,unit,user}=await context(form);
  const id=value(form,"lead_id");
  const student_name=required(form,"student_name");
  const status=value(form,"status")||"new";
  if(!statuses.includes(status))throw new Error("无效咨询状态");
  const payload={
    student_name:limit(student_name,160)!,parent_name:limit(value(form,"parent_name"),160),
    contact:limit(value(form,"contact"),160),contact_channel:limit(value(form,"contact_channel"),80),
    school:limit(value(form,"school"),160),year_level:limit(value(form,"year_level"),80),
    subject:limit(value(form,"subject"),160),course_interest:limit(value(form,"course_interest"),300),
    source:limit(value(form,"source"),80)||"other",status,
    notes:limit(value(form,"notes"),4000),lost_reason:limit(value(form,"lost_reason"),500),
    next_followup_at:parseNz(value(form,"next_followup_at"),true)
  };
  if(id){
    const lead=await assertLead(db,unit,id);
    if(lead.student_id&&status!=="enrolled")throw new Error("已报名咨询不能更改为其他状态");
    const {error}=await db.from("edu_leads").update(payload)
      .eq("id",id).eq("business_unit_id",unit);
    if(error)throw new Error(error.message);
  }else{
    const {error}=await db.from("edu_leads").insert({
      ...payload,business_unit_id:unit,created_by:user.id,assigned_to:user.id
    });
    if(error)throw new Error(error.message);
  }
  refresh();return {ok:true};
 }catch(e){return respond(e);}
}

export async function addActivity(form:FormData):Promise<ActionResult>{
 try{
  const {db,unit,user}=await context(form);
  const leadId=required(form,"lead_id");
  await assertLead(db,unit,leadId);
  const kind=value(form,"kind")||"note";
  if(!["note","call","wechat","message","meeting","feedback"].includes(kind))
    throw new Error("无效沟通方式");
  const content=required(form,"content");
  limit(content,4000);
  const {error}=await db.from("edu_lead_activities").insert({
    business_unit_id:unit,lead_id:leadId,kind,content,created_by:user.id
  });
  if(error)throw new Error(error.message);
  refresh();return {ok:true};
 }catch(e){return respond(e);}
}

export async function scheduleTrial(form:FormData):Promise<ActionResult>{
 try{
  const {db,unit,user}=await context(form);
  const leadId=required(form,"lead_id");
  const lead=await assertLead(db,unit,leadId);
  const duration=Number(value(form,"duration_minutes")||"45");
  const fee=Number(value(form,"fee_nzd")||"0");
  if(!Number.isInteger(duration)||duration<15||duration>240)throw new Error("试听时长应为15–240分钟");
  if(!Number.isFinite(fee)||fee<0||fee>10000)throw new Error("试听费用不正确");
  const bookingId=value(form,"booking_id")||null;
  if(bookingId&&!lead.student_id)throw new Error("只有已关联学员的试听才能绑定现有排课");
  const {error}=await db.from("edu_trials").insert({
    business_unit_id:unit,lead_id:leadId,booking_id:bookingId,
    starts_at:parseNz(required(form,"starts_at"))!,
    duration_minutes:duration,fee_nzd:fee,
    teacher:limit(value(form,"teacher"),160),subject:limit(value(form,"subject"),160),
    created_by:user.id
  });
  if(error)throw new Error(error.message);
  if(!lead.student_id&&lead.status!=="enrolled"){
    const {error:statusError}=await db.from("edu_leads").update({status:"trial_booked"})
      .eq("id",leadId).eq("business_unit_id",unit);
    if(statusError)throw new Error("试听已创建，但咨询状态更新失败，请刷新检查");
  }
  refresh();return {ok:true};
 }catch(e){return respond(e);}
}

export async function finishTrial(form:FormData):Promise<ActionResult>{
 try{
  const {db,unit}=await context(form);
  const id=required(form,"trial_id");
  const status=required(form,"status");
  const outcome=value(form,"outcome")||null;
  if(!trialStatuses.includes(status))throw new Error("无效试听状态");
  if(outcome&&!["enrolled","considering","declined"].includes(outcome))
    throw new Error("无效试听结果");
  const {data:trial,error:lookupError}=await db.from("edu_trials").select("lead_id")
   .eq("id",id).eq("business_unit_id",unit).maybeSingle();
  if(lookupError||!trial)throw new Error("找不到试听记录");
  const {error}=await db.from("edu_trials").update({
    status,outcome,assessment:limit(value(form,"assessment"),4000)
  }).eq("id",id).eq("business_unit_id",unit);
  if(error)throw new Error(error.message);
  const lead=await assertLead(db,unit,trial.lead_id);
  if(!lead.student_id&&status==="completed"){
    const {error:statusError}=await db.from("edu_leads")
     .update({status:outcome==="declined"?"lost":outcome==="enrolled"?"considering":"trial_done"})
     .eq("id",trial.lead_id).eq("business_unit_id",unit);
    if(statusError)throw new Error("试听已保存，但咨询状态更新失败");
  }
  refresh();return {ok:true};
 }catch(e){return respond(e);}
}

export async function addFollowup(form:FormData):Promise<ActionResult>{
 try{
  const {db,unit,user}=await context(form);
  const leadId=value(form,"lead_id")||null;
  const studentId=value(form,"student_id")||null;
  if(!leadId&&!studentId)throw new Error("请选择咨询或学员");
  if(leadId)await assertLead(db,unit,leadId);
  if(studentId){
    const {data}=await db.from("students").select("id")
      .eq("id",studentId).eq("business_unit_id",unit).maybeSingle();
    if(!data)throw new Error("学员不属于当前实体");
  }
  const kind=value(form,"kind")||"lead";
  if(!followupKinds.includes(kind))throw new Error("无效跟进类别");
  const {error}=await db.from("edu_followups").insert({
    business_unit_id:unit,lead_id:leadId,student_id:studentId,
    kind,title:limit(required(form,"title"),200)!,notes:limit(value(form,"notes"),2000),
    due_at:parseNz(required(form,"due_at"))!,created_by:user.id,assigned_to:user.id
  });
  if(error)throw new Error(error.message);
  refresh();return {ok:true};
 }catch(e){return respond(e);}
}

export async function completeFollowup(form:FormData):Promise<ActionResult>{
 try{
  const {db,unit}=await context(form);
  const status=required(form,"status");
  if(!["done","cancelled","open"].includes(status))throw new Error("无效任务状态");
  const {error}=await db.from("edu_followups").update({
    status,completed_at:status==="done"?new Date().toISOString():null
  }).eq("id",required(form,"followup_id")).eq("business_unit_id",unit);
  if(error)throw new Error(error.message);
  refresh();return {ok:true};
 }catch(e){return respond(e);}
}

export async function convertLead(form:FormData):Promise<ActionResult>{
 try{
  const {db,unit}=await context(form);
  const id=required(form,"lead_id");
  await assertLead(db,unit,id);
  const rate=Number(value(form,"hourly_rate")||"70");
  if(!Number.isFinite(rate)||rate<=0||rate>10000)throw new Error("课时费不正确");
  const {data,error}=await db.rpc("erp_education_convert_lead",{
    p_lead_id:id,
    p_existing_student_id:value(form,"existing_student_id")||null,
    p_student_code:value(form,"student_code")||null,
    p_hourly_rate:rate,
    p_payment_type:value(form,"payment_type")||"monthly"
  });
  if(error)throw new Error(error.message);
  if(!data)throw new Error("未能关联学员，请检查数据库迁移");
  refresh();revalidatePath("/students/"+data);
  return {ok:true,studentId:String(data)};
 }catch(e){return respond(e);}
}

export async function createRenewalTask(form:FormData):Promise<ActionResult>{
 try{
  const {db,unit,user}=await context(form);
  const id=required(form,"student_id");
  const {data:student,error:studentError}=await db.from("students")
    .select("id,name").eq("id",id).eq("business_unit_id",unit).maybeSingle();
  if(studentError||!student)throw new Error("找不到当前实体学员");
  const {data:existing,error:existingError}=await db.from("edu_followups")
    .select("id").eq("business_unit_id",unit).eq("student_id",id)
    .eq("kind","renewal").eq("status","open").limit(1);
  if(existingError)throw new Error(existingError.message);
  if((existing||[]).length)return {ok:false,error:"这位学员已有待处理的续费任务"};
  const due=new Date(Date.now()+24*3600*1000).toISOString();
  const {error}=await db.from("edu_followups").insert({
    business_unit_id:unit,student_id:id,kind:"renewal",
    title:"跟进续费 · "+student.name,due_at:due,created_by:user.id,assigned_to:user.id
  });
  if(error)throw new Error(error.message);
  refresh();return {ok:true};
 }catch(e){return respond(e);}
}
