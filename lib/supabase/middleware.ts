import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

const AUTH_COOKIE_MAX_AGE = 60 * 24 * 60 * 60;

function isAuthTokenCookie(name: string) {
  return name.includes("-auth-token");
}

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({
            request,
          });
          cookiesToSet.forEach(({ name, value, options }) => {
            supabaseResponse.cookies.set(name, value, {
              ...(options ?? {}),
              maxAge: AUTH_COOKIE_MAX_AGE,
              sameSite: "lax",
              path: "/",
              secure: process.env.NODE_ENV === "production",
            });
          });
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const pathname = request.nextUrl.pathname;
  const isLogin = pathname.startsWith("/login");
  const hasAuthCookie = request.cookies
    .getAll()
    .some((cookie) => isAuthTokenCookie(cookie.name));

  if (!user && !isLogin && !hasAuthCookie) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }


  if(user && !isLogin){
    const {data:members,error:roleError}=await supabase.from("erp_memberships")
      .select("business_unit_id,role").eq("user_id",user.id)
      .in("business_unit_id",["cus","care","astra"]);
    const owner=!roleError&&!!members?.some(m=>m.business_unit_id==="cus"&&m.role==="owner");
    const astraMember=!roleError&&!!members?.some(m=>m.business_unit_id==="astra"&&["owner","admin","teacher","viewer"].includes(m.role));
    const careMember=!roleError&&!!members?.some(m=>m.business_unit_id==="care");
    const astraOnly=!owner&&astraMember;
    const careOnly=!owner&&!astraMember;
    const crmAllowed=owner||!!members?.some(m=>m.business_unit_id==="astra"&&["owner","admin"].includes(m.role));
    const roleCookieOptions={httpOnly:true,sameSite:"lax" as const,path:"/",secure:process.env.NODE_ENV==="production"};
    supabaseResponse.cookies.set("erp_care_only",careOnly?"1":"0",roleCookieOptions);
    supabaseResponse.cookies.set("erp_astra_only",astraOnly?"1":"0",roleCookieOptions);
    supabaseResponse.cookies.set("erp_crm_allowed",crmAllowed?"1":"0",roleCookieOptions);

    if(astraOnly) {
      const allowed = ["/","/students","/bookings","/finance","/teaching","/afterschool","/crm","/calendar-subscriptions"]
        .some(prefix=>prefix==="/"?pathname==="/":pathname===prefix||pathname.startsWith(prefix+"/"));
      if(!allowed){
        const url=request.nextUrl.clone();url.pathname="/";url.search="";
        const redirect=NextResponse.redirect(url);
        supabaseResponse.cookies.getAll().forEach(c=>redirect.cookies.set(c.name,c.value));
        redirect.cookies.set("businessId","astra",{sameSite:"lax",path:"/",secure:process.env.NODE_ENV==="production"});
        return redirect;
      }
      // Apply Astra identity to the forwarded request instead of redirecting to
      // exactly the same URL. A self-redirect can loop indefinitely on Safari/PWA
      // when browser cookies and middleware request cookies are out of sync.
      const cookieOptions={sameSite:"lax" as const,path:"/",secure:process.env.NODE_ENV==="production"};
      request.cookies.set("businessId","astra");
      request.cookies.set("erp_astra_only","1");
      request.cookies.set("erp_care_only","0");
      request.cookies.set("erp_crm_allowed",crmAllowed?"1":"0");
      const next=NextResponse.next({request:{headers:request.headers}});
      supabaseResponse.cookies.getAll().forEach(c=>next.cookies.set(c.name,c.value,c));
      next.cookies.set("businessId","astra",cookieOptions);
      next.cookies.set("erp_astra_only","1",roleCookieOptions);
      next.cookies.set("erp_care_only","0",roleCookieOptions);
      next.cookies.set("erp_crm_allowed",crmAllowed?"1":"0",roleCookieOptions);
      return next;
    } else if(careOnly){
      const allowed=(pathname==="/teaching"||pathname.startsWith("/afterschool"))&&!!careMember;
      if(!allowed){
        const url=request.nextUrl.clone();url.pathname=careMember?"/afterschool":"/teaching";url.search="";
        const redirect=NextResponse.redirect(url);
        supabaseResponse.cookies.getAll().forEach(c=>redirect.cookies.set(c.name,c.value));
        return redirect;
      }
    }
  }
  return supabaseResponse;
}
