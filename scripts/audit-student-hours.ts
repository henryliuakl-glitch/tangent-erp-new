/**
 * Tangent ERP 课时审计脚本
 *
 * 用途：
 *   对 CuS 教培学员的 students.balance 做独立重算，并与：
 *   1) Tuition 流水 quantity
 *   2) 已完成课程 duration
 *   进行交叉核对。
 *
 * 默认仅报告，不写库：
 *   npx tsx scripts/audit-student-hours.ts
 *
 * 确认报告无误后可修复：
 *   npx tsx scripts/audit-student-hours.ts --fix
 */

import { config as loadEnv } from "dotenv";
import { resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";

loadEnv({ path: resolve(process.cwd(), ".env.local") });
loadEnv({ path: resolve(process.cwd(), ".env") });

const FIX = process.argv.includes("--fix");
const BUSINESS_ID = "cus";

function roundHours(n: number) {
  return Number(n.toFixed(1));
}

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("缺少 NEXT_PUBLIC_SUPABASE_URL 或 SUPABASE_SERVICE_ROLE_KEY");
  }

  const supabase = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const [{ data: students, error: studentError }, { data: bookings, error: bookingError }, { data: transactions, error: txError }] =
    await Promise.all([
      supabase
        .from("students")
        .select("id, name, student_code, balance, business_unit_id")
        .eq("business_unit_id", BUSINESS_ID),
      supabase
        .from("bookings")
        .select("id, student_id, duration, status, business_unit_id")
        .eq("business_unit_id", BUSINESS_ID)
        .eq("status", "completed"),
      supabase
        .from("transactions")
        .select("id, student_id, quantity, type, category, description, business_unit_id")
        .eq("business_unit_id", BUSINESS_ID)
        .eq("category", "Tuition"),
    ]);

  if (studentError) throw new Error(studentError.message);
  if (bookingError) throw new Error(bookingError.message);
  if (txError) throw new Error(txError.message);

  const txHours = new Map<string, number>();
  for (const tx of transactions || []) {
    if (!tx.student_id) continue;
    const q = Number(tx.quantity);
    if (!Number.isFinite(q) || q === 0) continue;

    let effect = 0;
    if (tx.type === "income") {
      effect = Math.abs(q);
    } else if (tx.type === "expense" && String(tx.description || "").includes("[退课退款]")) {
      effect = -Math.abs(q);
    } else if (tx.type === "adjustment") {
      effect = q;
    }

    txHours.set(tx.student_id, roundHours((txHours.get(tx.student_id) || 0) + effect));
  }

  const usedHours = new Map<string, number>();
  for (const booking of bookings || []) {
    if (!booking.student_id) continue;
    const h = Number(booking.duration);
    if (!Number.isFinite(h) || h <= 0) continue;
    usedHours.set(
      booking.student_id,
      roundHours((usedHours.get(booking.student_id) || 0) + h)
    );
  }

  const mismatches: Array<{
    id: string;
    label: string;
    stored: number;
    expected: number;
    diff: number;
    credited: number;
    consumed: number;
  }> = [];

  for (const student of students || []) {
    const credited = roundHours(txHours.get(student.id) || 0);
    const consumed = roundHours(usedHours.get(student.id) || 0);
    const expected = roundHours(credited - consumed);
    const stored = roundHours(Number(student.balance) || 0);
    const diff = roundHours(stored - expected);

    if (Math.abs(diff) >= 0.05) {
      mismatches.push({
        id: student.id,
        label: student.student_code
          ? `${student.student_code} · ${student.name}`
          : student.name,
        stored,
        expected,
        diff,
        credited,
        consumed,
      });
    }
  }

  console.log("\n=== Tangent ERP 课时审计 ===");
  console.log(`教培学员总数: ${students?.length || 0}`);
  console.log(`发现差异: ${mismatches.length}`);
  console.log(`模式: ${FIX ? "FIX" : "DRY-RUN"}\n`);

  for (const row of mismatches) {
    console.log(
      `${row.label}: 系统=${row.stored}h, 重算=${row.expected}h, 差异=${row.diff}h (充值/调账=${row.credited}h, 已消课=${row.consumed}h)`
    );
  }

  if (!FIX || mismatches.length === 0) return;

  console.log("\n开始修复...");
  for (const row of mismatches) {
    const { error } = await supabase
      .from("students")
      .update({ balance: row.expected })
      .eq("id", row.id)
      .eq("business_unit_id", BUSINESS_ID);

    if (error) {
      console.error(`✗ ${row.label}: ${error.message}`);
    } else {
      console.log(`✓ ${row.label}: ${row.stored}h → ${row.expected}h`);
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
