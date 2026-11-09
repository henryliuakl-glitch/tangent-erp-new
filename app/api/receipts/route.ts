import {NextRequest,NextResponse} from "next/server";
import {createClient} from "@/lib/supabase/server";

export async function GET(req:NextRequest){
 const file=req.nextUrl.searchParams.get("path")||"";
 if(file.length>512||!file.match(/^(astra|cus|sine|tangent|family)\/[^\0\r\n]+$/)||
    file.split("/").some(part=>part===".."||part===".")){
  return new NextResponse("Invalid receipt reference",{status:400});
 }
 const db=await createClient();
 const {data:{user}}=await db.auth.getUser();
 if(!user)return new NextResponse("Unauthorized",{status:401,headers:{"Cache-Control":"no-store"}});
 const {data:members,error}=await db.from("erp_memberships").select("business_unit_id,role")
   .eq("user_id",user.id);
 if(error)return new NextResponse("Unable to verify access",{status:403});
 const owner=members?.some(m=>m.business_unit_id==="cus"&&m.role==="owner");
 const astraManager=members?.some(m=>m.business_unit_id==="astra"&&
   (m.role==="owner"||m.role==="admin"));
 if(!owner&&!(file.startsWith("astra/")&&astraManager)){
   return new NextResponse("Forbidden",{status:403,headers:{"Cache-Control":"no-store"}});
 }
 const {data,error:signError}=await db.storage.from("receipts").createSignedUrl(file,60);
 if(signError||!data?.signedUrl)return new NextResponse("Receipt unavailable",{status:404});
 const response=NextResponse.redirect(data.signedUrl,302);
 response.headers.set("Cache-Control","private, no-store, max-age=0");
 response.headers.set("Referrer-Policy","no-referrer");
 return response;
}
