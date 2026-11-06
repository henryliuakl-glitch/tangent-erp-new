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
