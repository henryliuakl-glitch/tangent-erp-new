"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getTodayInNZ, nzLocalToUtc } from "@/lib/timezone";

function text(form: FormData, key: string) {return String(form.get(key)||"").trim();}
function must(form: FormData, key: string) {const val=text(form,key);if(!val) throw new Error("请填写："+key);return val;}
function ensure(ok:unknown,message:string): asserts ok {if(!ok) throw new Error(message);}
function png(value:string) {ensure(value.startsWith("data:image/png;base64,") && value.length<200000 && value.length>250,"必须在签名框内手写签名");return value;}
function signedName(name:string, typed:string) {ensure(name.trim().replace(/\s+/g," ").toLowerCase()===typed.trim().replace(/\s+/g," ").toLowerCase(),"签署姓名必须与档案中姓名一致");}
async function operator(roles:string[]=["owner","admin","teacher"]) {
  const db=await createClient();
  const {data:{user}}=await db.auth.getUser();
  ensure(user,"请先登录");
  const {data:members,error}=await db.from("erp_memberships").select("business_unit_id,role")
    .eq("user_id",user.id).in("business_unit_id",["cus","care"]);
  ensure(!error,"无法读取账户权限");
  const owner=members?.some(m=>m.business_unit_id==="cus"&&m.role==="owner");
  const care=members?.find(m=>m.business_unit_id==="care");
  ensure(owner || (care&&roles.includes(care.role)),"权限不足");
  return {db,user};
}
function check(error:{message:string}|null){if(error) throw new Error(error.message);}
function phoneNumber(value:string,label="联系人"){
 const formatted=value.normalize("NFKC").replace(/[\\s（）()－—–-]/g,"").trim();
 ensure(/^\\+?\\d{6,16}$/.test(formatted),"请输入有效的"+label+"电话（至少 6 位数字）");
 return formatted;
}

/** Parent-assisted enrollment on a supervised device. Missing second guardian remains pending, not waived. */

/** Registers into the standalone child-care ledger. All inserts happen in one DB transaction. */
export async function registerCareChild(form:FormData):
  Promise<{ok:true;student_id:string;created:true;status:"active"|"pending"}|{ok:false;error:string}> {
 try {
   const {db}=await operator(["owner","admin"]);
   const child_name=must(form,"child_name");
   const parent1=must(form,"guardian_1_name");
   const parent2=text(form,"guardian_2_name");
   const missing_reason=text(form,"missing_guardian_reason");
   ensure(parent2||missing_reason,"请填写第二位家长或说明特殊情况");
   const guardian1={
     name:parent1,relation:must(form,"guardian_1_relation"),
     phone:phoneNumber(must(form,"guardian_1_phone"),"家长 1"),
     email:text(form,"guardian_1_email"),
     signature:png(must(form,"guardian_1_signature"))
   };
   signedName(parent1,must(form,"guardian_1_signed_name"));
   const guardian2=parent2?{
     name:parent2,relation:must(form,"guardian_2_relation"),
     phone:phoneNumber(must(form,"guardian_2_phone"),"家长 2"),
     email:text(form,"guardian_2_email"),
     signature:png(must(form,"guardian_2_signature"))
   }:null;
   if(parent2)signedName(parent2,must(form,"guardian_2_signed_name"));
   const emergency={
     name:must(form,"emergency_name"),
     phone:phoneNumber(must(form,"emergency_phone"),"紧急联系人"),
     relation:text(form,"emergency_relation")
   };
   const primary=text(form,"primary_contact")==="2"?2:1;
   ensure(primary!==2||!!guardian2,"主要联系人未提供签名");
   ensure(form.get("terms_accepted")==="on","请先确认服务条款");
   const payload={
     child_name,school:text(form,"school"),year_level:text(form,"year_level"),
     dob:text(form,"date_of_birth"),allergies:text(form,"allergies"),
     medical:text(form,"medical_notes"),parent_notes:text(form,"parental_arrangement_notes"),
     missing_reason,image_consent:form.get("image_consent")==="on",
     sms_consent:form.get("sms_consent")==="on",accepted:true,primary,
     guardian1,guardian2,emergency
   };
   const {data,error}=await db.rpc("cus_register_care_child",{p:payload});
   if(error)throw new Error(error.message);
   ensure(typeof data==="string","未取得新档案编号");
   revalidatePath("/afterschool");
   return {ok:true,student_id:data,created:true,status:guardian2?"active":"pending"};
 }catch(error){
   console.error("[care-register]",error);
   const msg=error instanceof Error?error.message:"创建档案失败";
   const safe=["请填写：","请输入有效的","必须在签名框内手写签名",
     "签署姓名必须与档案中姓名一致","请填写第二位家长","主要联系人",
     "请先确认服务条款","权限不足"];
   return {ok:false,error:safe.some(p=>msg.startsWith(p))?msg:
     "档案保存失败，请检查电话号码及签名；若仍失败，请确认已执行最新晚托数据库升级"};
 }
}

export async function createCareSchedule(form:FormData) {
 const {db}=await operator(["owner","admin"]);
 const childId=must(form,"student_id"),from=must(form,"date_from"),to=must(form,"date_to");
 const start=must(form,"start_time"),end=must(form,"end_time");
 ensure(/^\d{4}-\d{2}-\d{2}$/.test(from)&&/^\d{4}-\d{2}-\d{2}$/.test(to),"请填写有效日期");
 ensure(/^\d{2}:\d{2}$/.test(start)&&/^\d{2}:\d{2}$/.test(end)&&end>start,"请检查托管时间");
 const fromDate=new Date(from+"T12:00:00Z"),toDate=new Date(to+"T12:00:00Z");
 const span=Math.round((toDate.getTime()-fromDate.getTime())/86400000);
 ensure(span>=0&&span<=120,"排班日期范围为 1—121 天");
 const weekdays=[0,1,2,3,4,5,6].filter(d=>form.get("weekday_"+d)==="on");
 ensure(weekdays.length>0,"请选择至少一个星期");
 const {data:child}=await db.from("cus_care_children").select("id").eq("id",childId).single();
 ensure(child,"找不到晚托档案");
 const dates=[] as {student_id:string;care_date:string;scheduled_start:string;scheduled_end:string}[];
 for(let d=0;d<=span;d++){
   const day=new Date(fromDate.getTime()+d*86400000);
   if(!weekdays.includes(day.getUTCDay()))continue;
   const date=day.toISOString().slice(0,10);
   dates.push({student_id:childId,care_date:date,
     scheduled_start:nzLocalToUtc(date,start).toISOString(),
     scheduled_end:nzLocalToUtc(date,end).toISOString()});
 }
 ensure(dates.length>0,"所选范围没有匹配的日期");
 const {error}=await db.from("cus_care_visits").upsert(dates,{
   onConflict:"student_id,care_date",ignoreDuplicates:true
 });
 check(error);
 revalidatePath("/afterschool");
 return {ok:true,count:dates.length};
}
export async function addCareDayCredits(form:FormData) {
 const {db}=await operator(["owner","admin"]);
 const days=Number(must(form,"days"));
 ensure(Number.isInteger(days)&&days!==0&&Math.abs(days)<=365,"天数必须是 -365 到 365 之间的非零整数");
 const child=must(form,"student_id");
 const {error}=await db.from("cus_care_day_credits").insert({
   student_id:child,days,note:text(form,"note")||null
 });
 check(error);revalidatePath("/afterschool");
}
export async function createTeacher(form:FormData){
 const {db}=await operator(["owner","admin"]);
 const scope=text(form,"scope")==="general"?"general":"care";
 if(scope==="general"){
   const {data:{user}}=await db.auth.getUser();
   const {data:owner}=await db.from("erp_memberships").select("role").eq("user_id",user!.id)
     .eq("business_unit_id","cus").eq("role","owner").maybeSingle();
   ensure(owner,"只有总管理员可登记普通教务教师");
 }
 const {error}=await db.from("cus_staff").insert({
   full_name:must(form,"full_name"),phone:text(form,"phone")||null,
   email:text(form,"email")||null,subjects:text(form,"subjects")||null,
   notes:text(form,"notes")||null,scope
 });
 check(error);revalidatePath("/teaching");revalidatePath("/afterschool");
}
export async function addCareLessonLog(form:FormData){
 const {db}=await operator();
 const visitId=must(form,"visit_id");
 const {data:visit}=await db.from("cus_care_visits").select("id").eq("id",visitId).single();
 ensure(visit,"无法找到当天托管记录");
 const teacherId=text(form,"teacher_id")||null;
 if(teacherId){
   const {data:t}=await db.from("cus_staff").select("id").eq("id",teacherId).eq("scope","care").single();
   ensure(t,"请选择已登记的晚托老师");
 }
 const {error}=await db.from("cus_care_lesson_logs").insert({
   visit_id:visitId,teacher_id:teacherId,
   teacher_actions:must(form,"teacher_actions"),child_actions:must(form,"child_actions"),
   observations:text(form,"observations")||null
 });
 check(error);revalidatePath("/afterschool");
}
export async function clockCare(form:FormData){
  const {db,user}=await operator();
  const visitId=must(form,"visit_id"),direction=must(form,"direction");
  ensure(["in","out"].includes(direction),"操作无效");
  const {data:visit}=await db.from("cus_care_visits").select("*").eq("id",visitId).single();
  ensure(visit,"未找到托管记录");
  const {data:profile}=await db.from("cus_care_profiles").select("status").eq("student_id",visit.student_id).single();
  ensure(profile?.status==="active","孩子档案未完成双家长签名审核，禁止交接打卡");
  ensure(form.get("identity_checked")==="on","教务必须核对接送人身份");
  const name=must(form,"signed_name"),signature=png(must(form,"signature"));
  const staffName=must(form,"staff_name"),staffSignature=png(must(form,"staff_signature"));
  const personType=text(form,"person_type")||"guardian",personId=must(form,"person_id");
  ensure(!(direction==="in"&&personType!=="guardian"),"Clock In 必须由登记家长完成");
  const now=new Date();
  if(direction==="in") {
    ensure(visit.status==="scheduled","此孩子已签到或已结束");
    const {data:guardian}=await db.from("cus_care_guardians").select("*")
      .eq("id",personId).eq("student_id",visit.student_id).single();
    ensure(guardian?.pickup_authorized&&guardian.signature_data,"家长未完成备案签名");
    signedName(guardian.full_name,name);
    const {data,error}=await db.from("cus_care_visits").update({
      status:"in_care",check_in_at:now.toISOString(),check_in_guardian_id:guardian.id,
      check_in_name:name,check_in_signature:signature,check_in_staff_name:staffName,check_in_staff_signature:staffSignature,check_in_recorded_by:user.id
    }).eq("id",visitId).eq("status","scheduled").select("id").maybeSingle();
    check(error);ensure(data,"操作发生冲突，请刷新");
  }else{
    ensure(visit.status==="in_care","必须先 Clock In，且不能重复 Clock Out");
    let update:Record<string,unknown>={status:"released",check_out_at:now.toISOString(),
      check_out_name:name,check_out_signature:signature,check_out_staff_name:staffName,check_out_staff_signature:staffSignature,check_out_recorded_by:user.id,
      staff_verified_identity:true};
    if(personType==="guardian"){
      const {data:g}=await db.from("cus_care_guardians").select("*")
        .eq("id",personId).eq("student_id",visit.student_id).single();
      ensure(g?.pickup_authorized&&g.signature_data,"未备案的家长不能接走");
      signedName(g.full_name,name);update.check_out_guardian_id=g.id;
    }else{
      const {data:contact}=await db.from("cus_care_emergency_contacts").select("*")
        .eq("id",personId).eq("student_id",visit.student_id).single();
      ensure(contact,"找不到第三方联系人");
      signedName(contact.full_name,name);
      const {data:approvals}=await db.from("cus_care_pickup_approvals").select("*")
        .eq("visit_id",visitId).eq("contact_id",contact.id)
        .is("revoked_at",null).order("approved_at",{ascending:false}).limit(1);
      const approval=approvals?.[0];
      ensure(approval?.child_response_checked && approval?.video_path && approval?.parent_notified_at,
        "第三方接送必须先获得家长确认、上传交接视频并通知家长");
      update.check_out_contact_id=contact.id;
    }
    const lateMinutes=Math.max(0,Math.ceil((now.getTime()-new Date(visit.scheduled_end).getTime())/60000));
    const fee=lateMinutes===0?0:lateMinutes<=60?20:20+10*Math.ceil((lateMinutes-60)/60);
    update.late_fee_nzd=fee;
    update.late_fee_note=fee>0?"Provisional; staff approval required before invoicing":null;
    const {data,error}=await db.from("cus_care_visits").update(update)
      .eq("id",visitId).eq("status","in_care").select("id").maybeSingle();
    check(error);ensure(data,"操作发生冲突，请刷新");
  }
  revalidatePath("/afterschool");
  return {ok:true};
}
export async function approveThirdParty(form:FormData){
  const {db,user}=await operator(["owner","admin"]);
  const visitId=must(form,"visit_id"),contactId=must(form,"contact_id"),guardianId=must(form,"guardian_id");
  const {data:visit}=await db.from("cus_care_visits").select("student_id,status").eq("id",visitId).single();
  ensure(visit?.status==="in_care","需要孩子已签到且尚未交接");
  const {data:careProfile}=await db.from("cus_care_profiles")
    .select("image_consent").eq("student_id",visit.student_id).single();
  ensure(careProfile?.image_consent,"本家庭未同意交接录像，不能使用此第三方录像流程，请由登记监护人接送或另行依法确认");
  const [{data:contact},{data:guardian}]=await Promise.all([
    db.from("cus_care_emergency_contacts").select("id").eq("student_id",visit.student_id).eq("id",contactId).single(),
    db.from("cus_care_guardians").select("id").eq("student_id",visit.student_id).eq("id",guardianId).single()
  ]);
  ensure(contact && guardian,"接送人或授权家长不属于该孩子");
  ensure(form.get("child_checked")==="on","必须检查孩子反应");
  ensure(form.get("parent_verified")==="on","必须确认联系的是档案中家长");
  const channel=must(form,"channel");
  ensure(["verified_call","verified_message","in_person"].includes(channel),"审批方式无效");
  const {error}=await db.from("cus_care_pickup_approvals").insert({
    visit_id:visitId,contact_id:contactId,parent_guardian_id:guardianId,approval_channel:channel,
    approved_by:user.id,notes:must(form,"notes"),child_response_checked:true
  });check(error);revalidatePath("/afterschool");
}
export async function uploadThirdPartyVideo(form:FormData){
  const {db}=await operator(["owner","admin"]);
  const approvalId=must(form,"approval_id");
  const {data:a}=await db.from("cus_care_pickup_approvals")
    .select("id,visit_id,revoked_at").eq("id",approvalId).single();
  ensure(a && !a.revoked_at,"无效审批记录");
  const file=form.get("video");
  ensure(file instanceof File && file.size>0 && file.size<=50*1024*1024,"请选择 50MB 以下的视频文件");
  ensure(["video/mp4","video/quicktime","video/webm"].includes(file.type),"仅支持 MP4/MOV/WebM");
  const path=a.visit_id+"/"+a.id+"-"+crypto.randomUUID();
  const {error}=await db.storage.from("cus-care-evidence").upload(path,file,{upsert:false,contentType:file.type});
  check(error);
  const {error:u}=await db.from("cus_care_pickup_approvals").update({video_path:path}).eq("id",approvalId);
  check(u);revalidatePath("/afterschool");
}
export async function markParentNotified(form:FormData){
  const {db}=await operator(["owner","admin"]);
  const id=must(form,"approval_id");
  ensure(form.get("confirmed")==="on","请先确认已通过核实的家长联系方式通知家长");
  const {data:a}=await db.from("cus_care_pickup_approvals").select("video_path").eq("id",id).single();
  ensure(a?.video_path,"必须先上传交接视频");
  const {error}=await db.from("cus_care_pickup_approvals").update({parent_notified_at:new Date().toISOString()}).eq("id",id);
  check(error);revalidatePath("/afterschool");
}

/** Admin-assisted supplementary parent signature; never replaces the original record. */
export async function addSecondGuardian(form:FormData){
  const {db,user}=await operator(["owner","admin"]);
  const studentId=must(form,"student_id");
  const {data:p}=await db.from("cus_care_profiles").select("student_id,status").eq("student_id",studentId).single();
  ensure(p,"档案不存在");
  const {data:current}=await db.from("cus_care_guardians").select("id").eq("student_id",studentId);
  ensure((current||[]).length===1,"此档案并非仅缺一位家长签名");
  const name=must(form,"full_name");
  signedName(name,must(form,"signed_name"));
  const {error}=await db.from("cus_care_guardians").insert({
    student_id:studentId,full_name:name,relationship:must(form,"relationship"),
    phone:phoneNumber(must(form,"phone")),email:text(form,"email")||null,
    primary_contact:false,pickup_authorized:true,
    signature_data:png(must(form,"signature")),signature_name:name,
    signature_signed_at:new Date().toISOString(),signature_recorded_by:user.id
  });check(error);
  const {error:u}=await db.from("cus_care_profiles").update({
    status:"active",missing_guardian_reason:null,updated_at:new Date().toISOString()
  }).eq("student_id",studentId);
  check(u);revalidatePath("/afterschool");
}
export async function updateCareWeekdays(form:FormData){
  const {db}=await operator(["owner","admin"]);
  const studentId=must(form,"student_id");
  const days=[0,1,2,3,4,5,6].filter(d=>form.get("weekday_"+d)==="on");
  ensure(days.length>0,"至少选择一天");
  const starts=must(form,"start_time"),ends=must(form,"end_time");
  ensure(/^\d{2}:\d{2}$/.test(starts)&&/^\d{2}:\d{2}$/.test(ends)&&ends>starts,"时间不正确");
  const {error:del}=await db.from("cus_care_weekdays").delete().eq("student_id",studentId);check(del);
  const {error}=await db.from("cus_care_weekdays").insert(days.map(weekday=>({
    student_id:studentId,weekday,starts_at:starts,ends_at:ends
  })));check(error);
  revalidatePath("/afterschool");
}
