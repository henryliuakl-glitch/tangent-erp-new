"use server";

import { createClient } from "@supabase/supabase-js";

// ⚠️ 重要：请将此 ID 替换为你数据库里 "CuS Academy (教培)" 这个业务线的真实 ID
// 你可以在数据库的 business_units 表里找到，或者就在 ERP 里看一眼 URL 里的 id
const DEFAULT_BUSINESS_ID = "cus_academy"; 

export async function submitRegistration(formData: FormData) {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    }
  );

  const name = formData.get("name") as string;
  const phone = formData.get("phone") as string;
  const email = formData.get("email") as string;
  const level = formData.get("level") as string;
  const school = formData.get("school") as string;
  const subject = formData.get("subject") as string;
  const goal = formData.get("goal") as string;
  const currentGrade = formData.get("currentGrade") as string;
  const targetGrade = formData.get("targetGrade") as string;
  const notes = formData.get("notes") as string;

  if (!name || !phone) {
    return { error: "姓名和联系方式必填" };
  }

  // 1. 自动生成学号 (查找当前最大的纯数字学号 + 1)
  // 这里假设你的学号是纯数字字符串 '1301', '1302' 等
  const { data: lastStudent } = await supabase
    .from("students")
    .select("student_code")
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  let nextCode = "1001"; // 默认初始学号
  if (lastStudent && lastStudent.student_code) {
    const lastCodeNum = parseInt(lastStudent.student_code);
    if (!isNaN(lastCodeNum)) {
      nextCode = (lastCodeNum + 1).toString();
    }
  }

  // 2. 插入数据
  const { error } = await supabase.from("students").insert({
    name,
    phone,
    email,
    level,
    school,
    subject,
    goal,
    current_grade: currentGrade,
    target_grade: targetGrade,
    notes,
    student_code: nextCode,
    hourly_rate: 70, // 默认费率
    balance: 0,      // 默认课时
    business_unit_id: DEFAULT_BUSINESS_ID,
    // created_at 会自动生成
  });

  if (error) {
    console.error("Registration Error:", error);
    return { error: "提交失败，请稍后重试" };
  }

  return { success: true, code: nextCode };
}