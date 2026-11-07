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
    // Fail closed if role lookup fails for a user previously marked care-only.
    const owner=members?.some(m=>m.business_unit_id==="cus"&&m.role==="owner");
    const care=members?.some(m=>m.business_unit_id==="care");
    const astra=members?.some(m=>m.business_unit_id==="astra");
    // Only the two explicitly provisioned CuS Owners may access core ERP.
    // A signed-in teacher with a legacy cus/teacher role is not an Owner.
    const careOnly=!owner||!!roleError;
    const astraOnly=!owner&&!care;
    supabaseResponse.cookies.set("erp_care_only",careOnly?"1":"0",{
      httpOnly:true,sameSite:"lax",path:"/",secure:process.env.NODE_ENV==="production"
    });
    supabaseResponse.cookies.set("erp_astra_only",astraOnly?"1":"0",{
      httpOnly:true,sameSite:"lax",path:"/",secure:process.env.NODE_ENV==="production"
    });
    const allowed=pathname==="/teaching"||
      (!!care&&pathname.startsWith("/afterschool"));
    if(careOnly&&!allowed){
      const url=request.nextUrl.clone();
      url.pathname=care?"/afterschool":"/teaching";
      url.search="";
      const redirect=NextResponse.redirect(url);
      for(const c of supabaseResponse.cookies.getAll()){
        redirect.cookies.set(c.name,c.value);
      }
      return redirect;
    }
  }
  return supabaseResponse;
}
