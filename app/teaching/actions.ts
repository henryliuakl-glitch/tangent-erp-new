"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { nzLocalToUtc } from "@/lib/timezone";
import {encodeTeacherNotes,encodeStudentRatings,validRatings,HOMEWORK_OPTIONS} from "@/lib/teaching-record-format";

type TeachingScope = "cus" | "astra";
type Db = Awaited<ReturnType<typeof createClient>>;
function required(form: FormData, name: string): string {
  const value=String(form.get(name)||"").trim();
  if(!value)throw new Error("缺少必填字段："+name);
  return value;
}
function optional(form: FormData, name: string):string|null {
  return String(form.get(name)||"").trim()||null;
}
function fail(error:{message:string}|null){
  if(error)throw new Error(error.message);
}
function formScope(form:FormData):TeachingScope {
  const scope=required(form,"businessId");
  if(scope!=="cus"&&scope!=="astra")throw new Error("无效教培实体");
  return scope;
}
async function memberContext(){
  const db=await createClient();
  const {data:{user},error}=await db.auth.getUser();
  if(error||!user)throw new Error("请先登录");
  const {data:members,error:membershipError}=await db.from("erp_memberships")
    .select("business_unit_id,role").eq("user_id",user.id)
    .in("business_unit_id",["cus","astra"]);
  fail(membershipError);
  const owner=!!members?.some(m=>m.business_unit_id==="cus"&&m.role==="owner");
  return {db,owner,members:members||[]};
}
async function teachingWriter(form:FormData){
  const scope=formScope(form);
  const ctx=await memberContext();
  const writable=ctx.owner||ctx.members.some(m=>
    m.business_unit_id===scope&&["owner","admin"].includes(m.role));
  if(!writable)throw new Error("只有当前实体管理员可以调整课程、班级和报名");
  return {...ctx,scope};
}
async function teachingRecordStaff(scope:TeachingScope){
  const ctx=await memberContext();
  const writable=ctx.owner||ctx.members.some(m=>
    m.business_unit_id===scope&&["owner","admin","teacher"].includes(m.role));
  if(!writable)throw new Error("没有该实体的教学记录权限");
  return ctx;
}
async function ensureProgramme(db:Db,programmeId:string,scope:TeachingScope){
  const {data,error}=await db.from("cus_programmes").select("id")
    .eq("id",programmeId).eq("business_unit_id",scope).maybeSingle();
  fail(error);
  if(!data)throw new Error("课程项目不属于当前教培实体");
}
async function classInScope(db:Db,classId:string,scope:TeachingScope){
  const {data,error}=await db.from("cus_classes")
    .select("id,programme_id,capacity").eq("id",classId).maybeSingle();
  fail(error);
  if(!data)throw new Error("班级不存在");
  await ensureProgramme(db,data.programme_id,scope);
  return data;
}

/** Only the teaching directory creates teachers; late care refers to those records. */
export async function createTeacher(form:FormData){
  const scope=formScope(form);
  const ctx=await memberContext();
  const canManage=ctx.owner||ctx.members.some(m=>
    m.business_unit_id===scope&&["owner","admin"].includes(m.role));
  if(!canManage)throw new Error("只有管理员可以登记教师");
  const teacherScope=required(form,"scope");
  if(scope==="cus" ? teacherScope!=="general" : !["astra","care"].includes(teacherScope))
    throw new Error("教师类别与教培实体不匹配");
  const {error}=await ctx.db.from("cus_staff").insert({
    full_name:required(form,"full_name"),phone:optional(form,"phone"),
    email:optional(form,"email"),subjects:optional(form,"subjects"),
    notes:optional(form,"notes"),scope:teacherScope
  });
  fail(error);
  revalidatePath("/teaching");
  revalidatePath("/afterschool");
}
export async function createProgramme(form:FormData){
  const {db,scope}=await teachingWriter(form);
  const {error}=await db.from("cus_programmes").insert({
    title:required(form,"title"),category:required(form,"category"),
    description:optional(form,"description"),business_unit_id:scope
  });
  fail(error);
  revalidatePath("/teaching");
}
export async function createClass(form:FormData){
  const {db,scope}=await teachingWriter(form);
  const capacity=Number(required(form,"capacity"));
  if(!Number.isInteger(capacity)||capacity<1||capacity>200)throw new Error("班级人数需为 1—200");
  const programmeId=required(form,"programme_id");
  await ensureProgramme(db,programmeId,scope);
  const {error}=await db.from("cus_classes").insert({
    programme_id:programmeId,title:required(form,"title"),
    teacher:optional(form,"teacher"),room:optional(form,"room"),capacity,
    start_date:optional(form,"start_date"),end_date:optional(form,"end_date")
  });
  fail(error);
  revalidatePath("/teaching");
}
export async function enrolStudent(form:FormData){
  const {db,scope}=await teachingWriter(form);
  const classId=required(form,"class_id"),studentId=required(form,"student_id");
  const cls=await classInScope(db,classId,scope);
  const {data:student,error:studentError}=await db.from("students").select("id")
    .eq("id",studentId).eq("business_unit_id",scope).maybeSingle();
  fail(studentError);
  if(!student)throw new Error("学生不属于当前实体");
  const {count,error:countError}=await db.from("cus_enrolments")
    .select("id",{count:"exact",head:true}).eq("class_id",classId).eq("status","active");
  fail(countError);
  const {data:existing,error:existingError}=await db.from("cus_enrolments")
    .select("id,status").eq("class_id",classId).eq("student_id",studentId).maybeSingle();
  fail(existingError);
  if(existing?.status==="active")throw new Error("学生已报名");
  if((count||0)>=cls.capacity)throw new Error("班级已满");
  if(existing){
    const {error}=await db.from("cus_enrolments").update({status:"active"})
      .eq("id",existing.id).eq("class_id",classId);
    fail(error);
  }else{
    const {error}=await db.from("cus_enrolments").insert({class_id:classId,student_id:studentId});
    fail(error);
  }
  revalidatePath("/teaching");
}
export async function withdrawStudent(form:FormData){
  const {db,scope}=await teachingWriter(form);
  const enrolmentId=required(form,"enrolment_id");
  const {data:enrolment,error:lookupError}=await db.from("cus_enrolments")
    .select("class_id").eq("id",enrolmentId).maybeSingle();
  fail(lookupError);
  if(!enrolment)throw new Error("报名记录不存在");
  await classInScope(db,enrolment.class_id,scope);
  const {error}=await db.from("cus_enrolments").update({status:"withdrawn"})
    .eq("id",enrolmentId).eq("class_id",enrolment.class_id);
  fail(error);
  revalidatePath("/teaching");
}
export async function createSession(form:FormData){
  const {db,scope}=await teachingWriter(form);
  const classId=required(form,"class_id");
  await classInScope(db,classId,scope);
  const date=required(form,"date"),start=required(form,"start"),end=required(form,"end");
  const starts_at=nzLocalToUtc(date,start),ends_at=nzLocalToUtc(date,end);
  if(!Number.isFinite(+starts_at)||!Number.isFinite(+ends_at)||ends_at<=starts_at)
    throw new Error("下课时间必须晚于上课时间");
  const {error}=await db.from("cus_class_sessions").insert({
    class_id:classId,starts_at:starts_at.toISOString(),ends_at:ends_at.toISOString(),
    topic:optional(form,"topic"),room:optional(form,"room")
  });
  fail(error);
  revalidatePath("/teaching");
}
export async function setAttendance(form:FormData){
  const scope=required(form,"businessId");
  if(scope!=="cus"&&scope!=="astra")throw new Error("无效实体");
  // Teachers may mark attendance only; programme/class management stays admin-only.
  const {db}=await teachingRecordStaff(scope);
  const sessionId=required(form,"session_id"),studentId=required(form,"student_id");
  const {data:session,error:sessionError}=await db.from("cus_class_sessions")
    .select("class_id").eq("id",sessionId).maybeSingle();
  fail(sessionError);
  if(!session)throw new Error("课次不存在");
  await classInScope(db,session.class_id,scope);
  const {data:enrolment,error:enrolError}=await db.from("cus_enrolments")
    .select("id").eq("class_id",session.class_id).eq("student_id",studentId)
    .eq("status","active").maybeSingle();
  fail(enrolError);
  if(!enrolment)throw new Error("该学生未在本班报名");
  const status=required(form,"status");
  if(!["present","late","absent","excused"].includes(status))throw new Error("无效出勤状态");
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
    const ctx=await teachingRecordStaff(scope);
    const {db}=ctx;
    const isAstraTeacher=scope==="astra"&&!ctx.owner&&
      ctx.members.some(m=>m.business_unit_id==="astra"&&m.role==="teacher");
    const target = required(form, "target");
    const divider = target.indexOf(":");
    const type = target.slice(0, divider);
    const id = target.slice(divider + 1);
    if (!["booking", "session"].includes(type) ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
      return {ok:false,error:"请选择有效的课程"};
    }
    const teacher = required(form,"teacher");
    const {data:allowedTeacher}=await db.from("cus_staff").select("id")
      .eq("full_name",teacher)
      .in("scope",scope==="astra"?["astra","care"]:["general"]).maybeSingle();
    if(isAstraTeacher){
      // Tie the displayed teacher identity to the signed-in account, never trust
      // a teacher name chosen from someone else's staff list.
      const {data:{user}}=await db.auth.getUser();
      const {data:ownStaff}=await db.from("cus_staff").select("full_name")
        .eq("email",user?.email||"").in("scope",["astra","care"]).limit(1).maybeSingle();
      if(!user?.email||![user.email,ownStaff?.full_name].includes(teacher))
        return {ok:false,error:"教师仅可使用本人登记的姓名或登录邮箱填写记录"};
    }else if(!["Henry","Yvetta"].includes(teacher)&&!allowedTeacher){
      return {ok:false,error:"请选择已登记的授课教师"};
    }
    const lesson_content = encodeTeacherNotes(
      String(form.get("lesson_content")||""),
      String(form.get("lesson_evaluation")||"")
    );
    if(lesson_content.length>8000)return {ok:false,error:"教师记录合计不能超过 8000 字"};
    const mastery = required(form,"mastery");
    const participation = required(form,"participation");
    const progress = required(form,"progress");
    if(!validRatings(mastery,participation,progress))
      return {ok:false,error:"学生表现选项不正确"};
    const student_feedback = encodeStudentRatings(mastery,participation,progress);
    const homework = String(form.get("homework")||"");
    if(!HOMEWORK_OPTIONS.some(x=>x===homework))return {ok:false,error:"请选择是否布置作业"};
    const next_steps = String(form.get("next_steps")||"").trim()||"无";
    const payload = {teacher,lesson_content,homework,student_feedback,next_steps};
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
        const {data:student}=await db.from("students").select("id").eq("id",data.student_id).eq("business_unit_id","cus").single();
        if(!student)return {ok:false,error:"此学员不属于 CuS"};
        studentId=student.id;
      }
    } else {
      const {data:session} = await db.from("cus_class_sessions")
        .select("id,class_id").eq("id",id).single();
      if (!session) return {ok:false,error:"班级课次不存在"};
      const {data:cls} = await db.from("cus_classes")
        .select("programme_id").eq("id",session.class_id).single();
      const {data:programme} = await db.from("cus_programmes")
        .select("id").eq("id",cls?.programme_id ?? "").eq("business_unit_id",scope).maybeSingle();
      if(!programme)return {ok:false,error:"课次不属于当前教培实体"};
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
