import type {Session} from "@supabase/supabase-js";

// Refresh tokens must not be copied into origin-wide localStorage.
// Standard Supabase SSR cookies remain the only persisted session store.
export function persistSessionBackup(_session:Session|null){
 if(typeof window!=="undefined"){
  window.localStorage.removeItem("tangent-auth-session-backup");
 }
}
export function readSessionBackup():{access_token:string;refresh_token:string}|null{
 if(typeof window!=="undefined"){
  window.localStorage.removeItem("tangent-auth-session-backup");
 }
 return null;
}
