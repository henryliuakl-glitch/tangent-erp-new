import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { AUTH_COOKIE_MAX_AGE, authClientOptions } from "@/lib/supabase/auth-options";
import {
  persistSessionBackup,
  readSessionBackup,
} from "@/lib/supabase/session-backup";

const REMEMBER_ME_KEY = "tangent-remember-me";

let browserClient: SupabaseClient | null = null;
let sessionHooksBound = false;

export function getRememberMe(): boolean {
  if (typeof window === "undefined") return true;
  return window.localStorage.getItem(REMEMBER_ME_KEY) !== "0";
}

export function setRememberMe(remember: boolean) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(REMEMBER_ME_KEY, remember ? "1" : "0");
}

function bindSessionHooks(client: SupabaseClient) {
  if (sessionHooksBound || typeof window === "undefined") return;
  sessionHooksBound = true;

  client.auth.onAuthStateChange((_event, session) => {
    if (getRememberMe()) persistSessionBackup(session);
    else persistSessionBackup(null);
  });

  // On the login screen, do not start a competing getSession()/setSession()
  // recovery task while the user is authenticating with another account.
  if (window.location.pathname.startsWith("/login")) return;

  void (async () => {
    const { data: { session } } = await client.auth.getSession();
    if (session) {
      persistSessionBackup(session);
      return;
    }
    const backup = readSessionBackup();
    if (!backup || !getRememberMe()) return;
    await client.auth.setSession(backup);
  })();
}

export function createClient() {
  if (browserClient) return browserClient;

  const remember = getRememberMe();
  browserClient = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      auth: authClientOptions,
      cookieOptions: {
        path: "/",
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        ...(remember ? { maxAge: AUTH_COOKIE_MAX_AGE } : {}),
      },
    }
  );

  bindSessionHooks(browserClient);
  return browserClient;
}
