import {createClient} from "@/lib/supabase/server";
import {QualityClient} from "./quality-client";

export async function TeachingQuality({unit}:{unit:"cus"|"astra"}){
 const db=await createClient();
 const [staff,credentials,training]=await Promise.all([
   db.from("cus_staff").select("id,full_name,scope,active,subjects")
     .in("scope",unit==="cus"?["general"]:["astra","care"]).order("full_name").limit(250),
   db.from("edu_staff_credentials").select("*").eq("business_unit_id",unit)
     .order("review_due_on",{ascending:true,nullsFirst:false}).limit(800),
   db.from("edu_staff_training").select("*").eq("business_unit_id",unit)
     .order("session_date",{ascending:false}).limit(800)
 ]);
 if(staff.error||credentials.error||training.error)return <section className="erp-surface p-5">
  <h2 className="text-base font-bold">教师资质与培训尚未就绪</h2>
  <p className="mt-2 text-sm text-slate-500">请在 Tangent ERP 的 Supabase 项目执行 20261108_education_crm_phases3_4_5.sql 后再试。原有教师档案不会受影响。</p>
 </section>;
 return <QualityClient unit={unit} staff={staff.data||[]}
   credentials={credentials.data||[]} trainings={training.data||[]}/>;
}
