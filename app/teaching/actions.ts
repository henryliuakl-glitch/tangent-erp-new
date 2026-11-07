"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { nzLocalToUtc } from "@/lib/timezone";

async function staff() {
  const db = await createClient();
  const { data: { user }, error } = await db.auth.getUser();
  if (error || !user) throw new Error("请先登录");
  const { data: membership, error: memberError } = await db.from("erp_memberships")
    .select("role").eq("user_id", user.id).eq("business_unit_id", "cus").single();
  if (memberError || !membership || !["owner","admin","teacher"].includes(membership.role)) {
    throw new Error("没有 CuS 教务编辑权限，请管理员先配置 erp_memberships");
  }
  return db;
}
async function teachingRecordStaff(scope:"cus"|"astra"){
  const db=await createClient();
  const {data:{user},error}=await db.auth.getUser();
  if(error||!user)throw new Error("请先登录");
  const {data:members,error:memberError}=await db.from("erp_memberships")
    .select("business_unit_id,role").eq("user_id",user.id)
    .in("business_unit_id",["cus","care","astra"]);
  if(memberError)throw new Error("无法读取教师权限");
  const owner=!!members?.some(m=>m.business_unit_id==="cus"&&m.role==="owner");
  const canAstra=owner||!!members?.some(m=>
    ["cus","care","astra"].includes(m.business_unit_id)&&
    ["owner","admin","teacher"].includes(m.role));
  if(scope==="cus"&&!owner)throw new Error("只有 CuS Owner 可以管理 CuS 教学记录");
  if(scope==="astra"&&!canAstra)throw new Error("没有 Astra 教学权限");
  return {db,user,owner};
}
function required(form: FormData, name: string): string {
  const value = String(form.get(name) || "").trim();
  if (!value) throw new Error("缺少必填字段：" + name);
  return value;
}
function optional(form: FormData, name: string): string | null {
  return String(form.get(name) || "").trim() || null;
}
function fail(error: { message: string } | null) {
  if (error) throw new Error(error.message);
}

export async function createProgramme(form: FormData) {
  const db = await staff();
  const { error } = await db.from("cus_programmes").insert({
    title: required(form, "title"), category: required(form, "category"),
    description: optional(form, "description"), business_unit_id: "cus"
  });
  fail(error);
  revalidatePath("/teaching");
}
export async function createClass(form: FormData) {
  const db = await staff();
  const capacity = Number(required(form, "capacity"));
  if (!Number.isInteger(capacity) || capacity < 1 || capacity > 200) throw new Error("班级人数需为 1—200");
  const { error } = await db.from("cus_classes").insert({
    programme_id: required(form, "programme_id"),
    title: required(form, "title"), teacher: optional(form, "teacher"),
    room: optional(form, "room"), capacity,
    start_date: optional(form, "start_date"), end_date: optional(form, "end_date")
  });
  fail(error);
  revalidatePath("/teaching");
}
export async function enrolStudent(form: FormData) {
  const db = await staff();
  const classId = required(form, "class_id");
  const studentId = required(form, "student_id");
  const { data: student } = await db.from("students").select("id").eq("id", studentId)
    .eq("business_unit_id", "cus").single();
  if (!student) throw new Error("仅允许报名 CuS 学员");
  const { data: cls } = await db.from("cus_classes").select("capacity").eq("id",classId).single();
  if (!cls) throw new Error("找不到班级");
  const { count, error: countError } = await db.from("cus_enrolments")
    .select("id", { count:"exact", head:true }).eq("class_id",classId).eq("status","active");
  fail(countError);
  const { data: existing } = await db.from("cus_enrolments").select("id,status")
    .eq("class_id",classId).eq("student_id",studentId).maybeSingle();
  if (existing?.status === "active") throw new Error("学生已报名");
  if ((count || 0) >= cls.capacity) throw new Error("班级已满");
  if (existing) {
    const {error} = await db.from("cus_enrolments").update({status:"active"}).eq("id",existing.id);
    fail(error);
  } else {
    const {error} = await db.from("cus_enrolments").insert({class_id:classId,student_id:studentId});
    fail(error);
  }
  revalidatePath("/teaching");
}
export async function withdrawStudent(form: FormData) {
  const db=await staff();
  const {error}=await db.from("cus_enrolments").update({status:"withdrawn"}).eq("id",required(form,"enrolment_id"));
  fail(error);
  revalidatePath("/teaching");
}
export async function createSession(form: FormData) {
  const db = await staff();
  const date=required(form,"date"), start=required(form,"start"), end=required(form,"end");
  const starts_at=nzLocalToUtc(date,start), ends_at=nzLocalToUtc(date,end);
  if (!Number.isFinite(+starts_at)||!Number.isFinite(+ends_at)||ends_at<=starts_at)
    throw new Error("下课时间必须晚于上课时间");
  const {error}=await db.from("cus_class_sessions").insert({
    class_id:required(form,"class_id"),starts_at:starts_at.toISOString(),ends_at:ends_at.toISOString(),
    topic:optional(form,"topic"), room:optional(form,"room")
  });
  fail(error);
  revalidatePath("/teaching");
}
export async function setAttendance(form: FormData) {
  const db=await staff();
  const sessionId=required(form,"session_id"),studentId=required(form,"student_id");
  const {data: session}=await db.from("cus_class_sessions").select("class_id")
    .eq("id",sessionId).single();
  if (!session) throw new Error("课次不存在");
  const {data: enrolment}=await db.from("cus_enrolments").select("id")
    .eq("class_id",session.class_id).eq("student_id",studentId).eq("status","active").single();
  if (!enrolment) throw new Error("该学生未在本班报名");
  const status=required(form,"status");
  if (!["present","late","absent","excused"].includes(status)) throw new Error("无效出勤状态");
  const {error}=await db.from("cus_attendance").upsert({
    session_id:sessionId,student_id:studentId,status,note:optional(form,"note"),
    checked_at:new Date().toISOString()
  },{onConflict:"session_id,student_id"});
  fail(error);
  revalidatePath("/teaching");
}

/** Classroom notes and 1:1 notes share a single teaching ledger; scheduling remains in Booking. */
export async function saveTeachingRecord(form: FormData): Promise<{ok:true}|{ok:false;error:string}> {
  try {
    const scope=String(form.get("scope")||"");
    if(scope!=="cus"&&scope!=="astra")return {ok:false,error:"请选择教学记录类别"};
    const {db,owner}=await teachingRecordStaff(scope);
    const target = required(form, "target");
    const divider = target.indexOf(":");
    const type = target.slice(0, divider);
    const id = target.slice(divider + 1);
    if (!["booking", "session"].includes(type) ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
      return {ok:false,error:"请选择有效的课程"};
    }
    const content = required(form,"lesson_content");
    if (content.length > 8000) return {ok:false,error:"课堂内容不能超过 8000 字"};
    const teacher = optional(form,"teacher");
    const homework = optional(form,"homework");
    const student_feedback = required(form,"student_feedback");
    const next_steps = optional(form,"next_steps");
    const payload = {teacher,lesson_content:content,homework,student_feedback,next_steps};
    const foreignKey = type === "booking" ? "booking_id" : "class_session_id";
    let studentId: string | null = null;
    if (type === "booking") {
      if(scope==="astra"){
        const {data,error}=await db.rpc("astra_lesson_identity",{p_booking_id:id});
        if(error||!data?.[0]?.student_id)return {ok:false,error:"此课程不属于 Astra，或当前账号没有权限"};
        studentId=data[0].student_id;
      } else {
        const {data,error}=await db.from("bookings").select("id,student_id")
          .eq("id",id).eq("business_unit_id","cus").single();
        if(error||!data?.student_id)return {ok:false,error:"找不到这节 CuS 课程"};
        const {data:student}=await db.from("students").select("id,student_code")
          .eq("id",data.student_id).eq("business_unit_id","cus").single();
        if(!String(student?.student_code||"").trim().startsWith("1"))
          return {ok:false,error:"此学员不属于 CuS 教学记录"};
        studentId=student.id;
      }
    } else {
      if(scope!=="cus"||!owner)return {ok:false,error:"班课只能由 CuS Owner 记录"};
      const {data:session} = await db.from("cus_class_sessions")
        .select("id,class_id").eq("id",id).single();
      if (!session) return {ok:false,error:"班级课次不存在"};
      const {data:cls} = await db.from("cus_classes")
        .select("programme_id").eq("id",session.class_id).single();
      const {data:programme} = await db.from("cus_programmes")
        .select("id").eq("id",cls?.programme_id ?? "").eq("business_unit_id","cus").maybeSingle();
      if (!programme) return {ok:false,error:"课次不属于 CuS"};
    }
    const {data:existing, error:findError} = await db.from("cus_teaching_records")
      .select("id,updated_at").eq(foreignKey,id).maybeSingle();
    if (findError) throw findError;
    if (existing) {
      if (form.get("record_id") !== existing.id ||
          form.get("record_version") !== existing.updated_at) {
        return {ok:false,error:"这节课的记录已存在或被更新，请刷新页面后再修改"};
      }
      const {data:updated,error} = await db.from("cus_teaching_records")
        .update(payload).eq("id",existing.id).eq("updated_at",existing.updated_at)
        .select("id").maybeSingle();
      if (error) throw error;
      if (!updated) return {ok:false,error:"这节课的记录刚被其他老师更新，请刷新后重试"};
    } else {
      if (form.get("record_id")) return {ok:false,error:"记录状态已改变，请刷新页面"};
      const {error} = await db.from("cus_teaching_records").insert({
        ...payload,[foreignKey]:id,student_id:studentId
      });
      if (error?.code==="23505") return {ok:false,error:"这节课已存在教学记录，请刷新页面"};
      if (error) throw error;
    }
    revalidatePath("/teaching");
    return {ok:true};
  } catch(error) {
    console.error("[teaching-records]",error);
    return {ok:false,error:"保存失败，请确认课程和必填内容；若问题持续，请联系管理员"};
  }
}
