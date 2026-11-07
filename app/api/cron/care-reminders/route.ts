import {NextRequest,NextResponse} from "next/server";
import {createClient} from "@supabase/supabase-js";
import {getTodayInNZ,nzLocalToUtc,utcToNzTimeStr} from "@/lib/timezone";

export const runtime="nodejs";
export const dynamic="force-dynamic";
function phoneE164(raw:string){
 const digits=raw.replace(/[\s()-]/g,"");
 if(/^\+[1-9]\d{7,14}$/.test(digits))return digits;
 if(/^0\d{8,10}$/.test(digits))return "+64"+digits.slice(1);
 return null;
}
type Reminder="before_start"|"after_start"|"before_end"|"late";
function message(type:Reminder,name:string,start:string,end:string,contact:string){
 const prefix="CuS Academy："+name+"，";
 if(type==="before_start")return prefix+"今天 "+start+" 有晚托班，请按约定时间送达。"+contact;
 if(type==="after_start")return prefix+"今天的晚托班已开始，预计 "+end+" 结束，请安排准时接送。"+contact;
 if(type==="before_end")return prefix+"距离约定接送时间 "+end+" 还有约30分钟，如有延误请及时联系我们。"+contact;
 return prefix+"已超过约定接送时间15分钟，工作人员将电话联系，请尽快回复并安排接送。"+contact;
}
export async function GET(req:NextRequest){
 const secret=process.env.CRON_SECRET;
 if(!secret||req.headers.get("authorization")!=="Bearer "+secret)
   return NextResponse.json({error:"unauthorised"},{status:401});
 const sid=process.env.TWILIO_ACCOUNT_SID,token=process.env.TWILIO_AUTH_TOKEN;
 const sender=process.env.TWILIO_FROM_NUMBER;
 if(!sid||!token||!sender||!process.env.SUPABASE_SERVICE_ROLE_KEY)
   return NextResponse.json({error:"SMS provider and ERP database credentials not configured; nothing sent"},{status:503});
 const db=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.SUPABASE_SERVICE_ROLE_KEY,{
  auth:{persistSession:false,autoRefreshToken:false}
 });
 const today=getTodayInNZ();
 const day=new Date(today+"T12:00:00Z").getUTCDay();
 if(day<1||day>5)return NextResponse.json({date:today,skipped:"weekend"});
 // Send only against explicit dated visits; never auto-book recurring weekdays.
 const {data:profiles,error:pe}=await db.from("cus_care_profiles")
   .select("student_id,status,sms_consent");
 if(pe)return NextResponse.json({error:pe.message},{status:500});
 const enabled=new Map((profiles||[]).filter(p=>p.status==="active").map(p=>[p.student_id,p]));
 const {data:visits,error:ve}=await db.from("cus_care_visits")
  .select("id,student_id,status,scheduled_start,scheduled_end").eq("care_date",today);
 if(ve)return NextResponse.json({error:ve.message},{status:500});
 const {data:parents,error:ge}=await db.from("cus_care_guardians")
  .select("student_id,full_name,phone,primary_contact").eq("primary_contact",true);
 const {data:students,error:se}=await db.from("cus_care_children").select("id,full_name");
 if(ge||se)return NextResponse.json({error:ge?.message||se?.message},{status:500});
 const byParent=new Map((parents||[]).map(g=>[g.student_id,g]));
 const byStudent=new Map((students||[]).map(s=>[s.id,s]));
 const now=Date.now();
 let sent=0,ignored=0,failed=0;
 for(const visit of visits||[]){
   const profile=enabled.get(visit.student_id),guardian=byParent.get(visit.student_id);
   if(!profile?.sms_consent||!guardian||visit.status==="cancelled"||visit.status==="released")continue;
   const destination=phoneE164(guardian.phone);
   if(!destination){ignored++;continue;}
   const start=new Date(visit.scheduled_start).getTime(),end=new Date(visit.scheduled_end).getTime();
   const stages: {type:Reminder;due:number;enabled:boolean}[]=[
     {type:"before_start",due:start-3600000,enabled:visit.status==="scheduled"},
     {type:"after_start",due:start+3600000,enabled:visit.status==="in_care"},
     {type:"before_end",due:end-1800000,enabled:visit.status==="in_care"},
     {type:"late",due:end+900000,enabled:visit.status==="in_care"}
   ];
   for(const stage of stages){
     if(!stage.enabled||now<stage.due||now-stage.due>15*60000)continue;
     const {data:reserved,error:reserveError}=await db.from("cus_care_sms_log").insert({
       visit_id:visit.id,reminder_type:stage.type,recipient_phone:destination,status:"pending"
     }).select("id").maybeSingle();
     if(reserveError?.code==="23505"){ignored++;continue;}
     if(reserveError||!reserved){failed++;continue;}
     const body=message(stage.type,byStudent.get(visit.student_id)?.full_name||"孩子",
       utcToNzTimeStr(visit.scheduled_start),utcToNzTimeStr(visit.scheduled_end),
       process.env.CARE_CONTACT_PHONE?" 如有问题请致电 "+process.env.CARE_CONTACT_PHONE:"");
     try{
       const params=new URLSearchParams({To:destination,From:sender,Body:body});
       const response=await fetch("https://api.twilio.com/2010-04-01/Accounts/"+encodeURIComponent(sid)+"/Messages.json",{
         method:"POST",headers:{
           Authorization:"Basic "+Buffer.from(sid+":"+token).toString("base64"),
           "Content-Type":"application/x-www-form-urlencoded"
         },body:params.toString(),cache:"no-store"
       });
       const result=await response.json() as {sid?:string;message?:string};
       if(!response.ok||!result.sid)throw new Error("Provider HTTP "+response.status);
       await db.from("cus_care_sms_log").update({status:"sent",provider_message_id:result.sid,sent_at:new Date().toISOString()})
         .eq("id",reserved.id);
       sent++;
     }catch(e){
       await db.from("cus_care_sms_log").update({status:"failed",error:String(e).slice(0,350)})
         .eq("id",reserved.id);
       failed++;
     }
   }
 }
 return NextResponse.json({date:today,sent,ignored,failed});
}
