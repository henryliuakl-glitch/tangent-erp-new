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
  const {data:membership,error}=await db.from("erp_memberships").select("role")
    .eq("business_unit_id","cus").eq("user_id",user.id).maybeSingle();
  ensure(!error && membership && roles.includes(membership.role),"权限不足");
  return {db,user};
}
function check(error:{message:string}|null){if(error) throw new Error(error.message);}
function phoneNumber(value:string){ensure(/^\+?[0-9 ()-]{7,22}$/.test(value),"请输入有效的联系电话");return value;}

/** Parent-assisted enrollment on a supervised device. Missing second guardian remains pending, not waived. */
export async function registerCareChild(form:FormData) {
  const {db,user}=await operator(["owner","admin"]);
  const fullName=must(form,"child_name"), existingId=text(form,"student_id");
  let studentId=existingId, created=false;
  const parent1=must(form,"guardian_1_name"),phone1=phoneNumber(must(form,"guardian_1_phone"));
  const parent2=text(form,"guardian_2_name"),phone2=text(form,"guardian_2_phone");
  const missingReason=text(form,"missing_guardian_reason");
  ensure((parent2 && phone2)||missingReason,"必须填写第二家长信息，或说明不能提供的原因");
  ensure(!parent2||phone2,"第二家长必须填写电话");
  const s1=png(must(form,"guardian_1_signature"));
  const s2=parent2 ? png(must(form,"guardian_2_signature")):null;
  signedName(parent1,must(form,"guardian_1_signed_name"));
  if(parent2) signedName(parent2,must(form,"guardian_2_signed_name"));
  const days=[1,2,3,4,5].filter(d=>form.get("weekday_"+d)==="on");
  ensure(days.length>0,"至少选择一个上课星期");
  ensure(form.get("terms_accepted")==="on","必须确认已阅读托管及隐私条款");
  const emergencyName=must(form,"emergency_name");
  const emergencyPhone=phoneNumber(must(form,"emergency_phone"));
  const primary=text(form,"primary_contact")==="2"?"2":"1";
  ensure(!(primary==="2"&&!parent2),"未填写第二家长时不能指定为主要联系人");
  const timeStart=must(form,"start_time"),timeEnd=must(form,"end_time");
  ensure(/^\d{2}:\d{2}$/.test(timeStart)&&/^\d{2}:\d{2}$/.test(timeEnd)&&timeEnd>timeStart,"托管时段无效");
  // Check for existing signed records before mutating a child's profile.
  if(existingId) {
    const {count:guardianCount,error:countError}=await db.from("cus_care_guardians")
      .select("id",{count:"exact",head:true}).eq("student_id",existingId);
    check(countError);ensure(!guardianCount,"已有家长签名档案，不能重新报名覆盖");
  }
  if(existingId) {
    const {data:s}=await db.from("students").select("id").eq("id",existingId)
      .eq("business_unit_id","cus").single();
    ensure(s,"找不到此 CuS 学员");
  } else {
    const {data:s,error}=await db.from("students").insert({
      name:fullName,business_unit_id:"cus",level:text(form,"year_level")||"Primary",
      subject:"After School Care",teacher:"",hourly_rate:0,balance:0,
      payment_type:"single",currency:"NZD"
    }).select("id").single();
    check(error);ensure(s,"创建学员失败");studentId=s.id;created=true;
  }
  const {error:profileError}=await db.from("cus_care_profiles").upsert({
    student_id:studentId,school:text(form,"school")||null,
    year_level:text(form,"year_level")||null,
    date_of_birth:text(form,"date_of_birth")||null,
    allergies:text(form,"allergies")||null,
    medical_notes:text(form,"medical_notes")||null,
    parental_arrangement_notes:text(form,"parental_arrangement_notes")||null,
    missing_guardian_reason:missingReason||null,
    image_consent:form.get("image_consent")==="on",
    sms_consent:form.get("sms_consent")==="on",
    terms_acknowledged_at:new Date().toISOString(),
    status:parent2?"active":"pending",updated_at:new Date().toISOString()
  },{onConflict:"student_id"});
  check(profileError);
  // First enrollment only: prevent silent overwriting of recorded guardian signatures.
  const guardians=[
    {student_id:studentId,full_name:parent1,relationship:must(form,"guardian_1_relation"),
      phone:phone1,email:text(form,"guardian_1_email")||null,primary_contact:primary==="1",
      pickup_authorized:true,signature_data:s1,signature_name:parent1,
      signature_signed_at:new Date().toISOString(),signature_recorded_by:user.id},
    ...(parent2?[{student_id:studentId,full_name:parent2,relationship:must(form,"guardian_2_relation"),
      phone:phoneNumber(phone2),email:text(form,"guardian_2_email")||null,primary_contact:primary==="2",
      pickup_authorized:true,signature_data:s2,signature_name:parent2,
      signature_signed_at:new Date().toISOString(),signature_recorded_by:user.id}]:[])
  ];
  const {error:gError}=await db.from("cus_care_guardians").insert(guardians);
  check(gError);
  const {error:eError}=await db.from("cus_care_emergency_contacts").insert({
    student_id:studentId,full_name:emergencyName,
    relationship:text(form,"emergency_relation")||null,phone:emergencyPhone,
    pickup_authorized:false
  });check(eError);
  const {error:dError}=await db.from("cus_care_weekdays").upsert(
    days.map(weekday=>({student_id:studentId,weekday,starts_at:timeStart,ends_at:timeEnd})),
    {onConflict:"student_id,weekday"}
  );check(dError);
  revalidatePath("/afterschool");revalidatePath("/students");
  return {student_id:studentId,created,status:parent2?"active":"pending"};
}
export async function createTodayCareVisits() {
  const {db}=await operator();
  const date=getTodayInNZ(),weekday=new Date(date+"T12:00:00Z").getUTCDay();
  ensure(weekday>=1&&weekday<=5,"今天不是周一至周五");
  const {data:rows,error}=await db.from("cus_care_weekdays")
    .select("student_id,weekday,starts_at,ends_at,cus_care_profiles!inner(status)")
    .eq("weekday",weekday);
  check(error);
  let created=0;
  for (const row of rows||[]) {
    const profile=row.cus_care_profiles as any;
    if(profile?.status!=="active") continue;
    const scheduled_start=nzLocalToUtc(date,row.starts_at).toISOString();
    const scheduled_end=nzLocalToUtc(date,row.ends_at).toISOString();
    const result=await db.from("cus_care_visits").upsert({
      student_id:row.student_id,care_date:date,scheduled_start,scheduled_end
    },{onConflict:"student_id,care_date",ignoreDuplicates:true});
    check(result.error);created++;
  }
  revalidatePath("/afterschool");
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
      check_in_name:name,check_in_signature:signature,check_in_recorded_by:user.id
    }).eq("id",visitId).eq("status","scheduled").select("id").maybeSingle();
    check(error);ensure(data,"操作发生冲突，请刷新");
  }else{
    ensure(visit.status==="in_care","必须先 Clock In，且不能重复 Clock Out");
    let update:Record<string,unknown>={status:"released",check_out_at:now.toISOString(),
      check_out_name:name,check_out_signature:signature,check_out_recorded_by:user.id,
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
  const days=[1,2,3,4,5].filter(d=>form.get("weekday_"+d)==="on");
  ensure(days.length>0,"至少选择一天");
  const starts=must(form,"start_time"),ends=must(form,"end_time");
  ensure(/^\d{2}:\d{2}$/.test(starts)&&/^\d{2}:\d{2}$/.test(ends)&&ends>starts,"时间不正确");
  const {error:del}=await db.from("cus_care_weekdays").delete().eq("student_id",studentId);check(del);
  const {error}=await db.from("cus_care_weekdays").insert(days.map(weekday=>({
    student_id:studentId,weekday,starts_at:starts,ends_at:ends
  })));check(error);
  revalidatePath("/afterschool");
}
