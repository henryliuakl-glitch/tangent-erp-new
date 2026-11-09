-- Tangent ERP security hardening: production tenant boundaries, 2026-11-09
-- Back up policy metadata before altering grants and RLS. No operational records are deleted.
-- Deploy application support for signed receipt links BEFORE applying this migration.
begin;
create schema if not exists erp_security_backup;
revoke all on schema erp_security_backup from public,anon,authenticated;
create table if not exists erp_security_backup.policies_20261109 as
  select schemaname,tablename,policyname,permissive,roles,cmd,qual,with_check
  from pg_policies where schemaname in ('public','storage');
create table if not exists erp_security_backup.buckets_20261109 as
  select id,public from storage.buckets;

-- Core owner means a signed-in user explicitly assigned cus/owner;
-- Astra members are never automatically core owners.
create or replace function public.erp_astra_access(p_write boolean default false)
returns boolean language sql stable security invoker set search_path=public,pg_temp as $$
  select public.erp_is_owner()
  or exists(
    select 1 from public.erp_memberships m
    where m.user_id=(select auth.uid()) and m.business_unit_id='astra'
      and (not p_write or m.role in ('owner','admin'))
  );
$$;
revoke all on function public.erp_astra_access(boolean) from public,anon;
grant execute on function public.erp_astra_access(boolean) to authenticated;

-- Remove permissive OR-ed policies that overrode tenant policies.
do $$
declare t text; rec record;
begin
 foreach t in array array[
  'business_units','companies','family_accounts','family_transactions',
  'family_recurring_cashflows','vehicles','vehicle_maintenance','profiles'
 ] loop
   for rec in
      select policyname from pg_policies
      where schemaname='public' and tablename=t
        and (policyname like 'erp_authenticated_%'
             or policyname in ('Admin full access','erp_care_isolation',
                               'Public profiles are viewable by everyone.',
                               'Users can insert their own profile.',
                               'Users can update own profile.'))
   loop
      execute format('drop policy if exists %I on public.%I',rec.policyname,t);
   end loop;
   execute format('alter table public.%I enable row level security',t);
   execute format('drop policy if exists erp_core_owner_all on public.%I',t);
   execute format('create policy erp_core_owner_all on public.%I for all to authenticated using ((select public.erp_is_owner())) with check ((select public.erp_is_owner()))',t);
 end loop;
end;
$$;

-- Profiles are visible only to their owner and core owner; a member may edit
-- their own display name but cannot mutate or delete someone else's profile.
drop policy if exists erp_profile_read_self on public.profiles;
create policy erp_profile_read_self on public.profiles
 for select to authenticated using (id=(select auth.uid()));
drop policy if exists erp_profile_insert_self on public.profiles;
create policy erp_profile_insert_self on public.profiles
 for insert to authenticated with check (id=(select auth.uid()));
drop policy if exists erp_profile_update_self on public.profiles;
create policy erp_profile_update_self on public.profiles
 for update to authenticated using (id=(select auth.uid()))
 with check (id=(select auth.uid()));
-- Core owners retain all permissions. Regular members cannot delete profiles.

-- Guard old family-sync trigger from cross-tenant accounting manipulation.
-- The app normally passes NULL for new receipts' family_account_id; owner-only
-- legacy mirrors continue working. Entity and linked family account are immutable
-- for non-core users.
create or replace function public.erp_guard_transaction_family()
returns trigger language plpgsql security invoker set search_path=public,pg_temp as $$
begin
 if tg_op='DELETE' then
   if old.family_account_id is not null and not public.erp_is_owner() then
     raise exception 'Deleting a Family-linked transaction requires a core owner';
   end if;
   return old;
 end if;
 if tg_op='UPDATE' then
   if new.business_unit_id is distinct from old.business_unit_id then
     raise exception 'Transaction entity cannot be reassigned';
   end if;
   if old.family_account_id is not null and not public.erp_is_owner() then
     raise exception 'Editing a Family-linked transaction requires a core owner';
   end if;
 end if;
 if new.business_unit_id='astra' and new.family_account_id is not null then
   raise exception 'Astra cannot link a Family account';
 end if;
 if new.family_account_id is not null and not public.erp_is_owner() then
   raise exception 'Family mirroring requires a core owner';
 end if;
 return new;
end;
$;
drop trigger if exists erp_guard_transaction_family on public.transactions;
create trigger erp_guard_transaction_family
 before insert or update or delete on public.transactions
 for each row execute function public.erp_guard_transaction_family();

-- Even a service-role caller cannot directly expose a privileged trigger RPC.
revoke all on function public.sync_business_income_to_family() from public,anon,authenticated;
revoke all on function public.handle_new_user() from public,anon,authenticated;
-- Trigger execution does not require invoker to hold EXECUTE on trigger function.
alter function public.handle_new_user() set search_path=public,pg_temp;
alter function public.handle_lesson_deduction() set search_path=public,pg_temp;
alter function public.cus_care_no_audit_changes() set search_path=public,pg_temp;
alter function public.increment_student_balance(uuid,numeric) set search_path=public,pg_temp;

-- Receipts were a public bucket. A publicly shared object URL cannot be
-- retroactively unshared, but changing the bucket to private blocks future
-- anonymous downloads. Only core owners and Astra managers can use this bucket.
update storage.buckets set public=false where id='receipts';
drop policy if exists "Allow Authenticated Uploads 1lnm9mj_0" on storage.objects;
drop policy if exists "Allow Authenticated Uploads 1lnm9mj_1" on storage.objects;
drop policy if exists "Allow Authenticated Uploads 1lnm9mj_2" on storage.objects;
drop policy if exists astra_receipts_insert on storage.objects;
drop policy if exists astra_receipts_read on storage.objects;
drop policy if exists erp_care_storage_isolation on storage.objects;
drop policy if exists erp_receipts_owner on storage.objects;
create policy erp_receipts_owner on storage.objects for all to authenticated
 using (bucket_id='receipts' and (select public.erp_is_owner()))
 with check (bucket_id='receipts' and (select public.erp_is_owner()));
drop policy if exists erp_receipts_astra_manager on storage.objects;
create policy erp_receipts_astra_manager on storage.objects for all to authenticated
 using (bucket_id='receipts' and name like 'astra/%'
        and (select public.erp_astra_access(true)))
 with check (bucket_id='receipts' and name like 'astra/%'
             and (select public.erp_astra_access(true)));

-- Preserve existing teaching-child safeguarding permission on private videos:
-- those policies still have explicit erp_can_care_read/manage checks.
-- Do not grant any storage operation to arbitrary authenticated identities.

-- Rate-limited public enquiry intake replaces public creation of formal students.
create table if not exists public.erp_public_signup_limits(
 fingerprint text primary key check (length(fingerprint)=64),
 window_start timestamptz not null default now(),
 attempt_count integer not null default 0,
 updated_at timestamptz not null default now()
);
alter table public.erp_public_signup_limits enable row level security;
revoke all on public.erp_public_signup_limits from public,anon,authenticated;
grant all on public.erp_public_signup_limits to service_role;

-- Public submissions are consultations only. CRM's auth.uid created_by is
-- deliberately NOT faked: store this in a separate intake table.
create table if not exists public.erp_public_inquiries(
 id uuid primary key default gen_random_uuid(),
 student_name text not null check(length(trim(student_name)) between 1 and 160),
 phone text not null check(length(trim(phone)) between 5 and 100),
 email text,
 school text,
 year_level text,
 subject text,
 goal text,
 current_grade text,
 target_grade text,
 notes text,
 source text not null default 'CuS Website',
 status text not null default 'new' check(status in ('new','reviewed','converted','spam')),
 created_at timestamptz not null default now()
);
alter table public.erp_public_inquiries enable row level security;
revoke all on public.erp_public_inquiries from public,anon,authenticated;
grant all on public.erp_public_inquiries to service_role;
grant select,update on public.erp_public_inquiries to authenticated;
drop policy if exists erp_public_inquiry_owner on public.erp_public_inquiries;
create policy erp_public_inquiry_owner on public.erp_public_inquiries
 for all to authenticated using ((select public.erp_is_owner()))
 with check ((select public.erp_is_owner()));

-- The service-role-only procedure atomically applies throttling and creates an
-- intake, never a students or Family entry.
create or replace function public.erp_submit_public_inquiry(
  p_fingerprint text,p_name text,p_phone text,p_email text,
  p_school text,p_year_level text,p_subject text,p_goal text,
  p_current_grade text,p_target_grade text,p_notes text
) returns uuid language plpgsql security invoker set search_path=public,pg_temp as $$
declare n integer; last_window timestamptz; created_id uuid;
begin
 if length(p_fingerprint)<>64 or p_fingerprint !~ '^[a-f0-9]{64}$' then
   raise exception 'Invalid request';
 end if;
 if length(trim(coalesce(p_name,''))) not between 1 and 160
    or length(trim(coalesce(p_phone,''))) not between 5 and 100
    or length(coalesce(p_email,''))>200 or length(coalesce(p_school,''))>200
    or length(coalesce(p_year_level,''))>100 or length(coalesce(p_subject,''))>200
    or length(coalesce(p_goal,''))>500 or length(coalesce(p_notes,''))>1000 then
   raise exception 'Invalid registration fields';
 end if;
 insert into public.erp_public_signup_limits(fingerprint,attempt_count)
   values(p_fingerprint,0) on conflict(fingerprint) do nothing;
 select window_start,attempt_count into last_window,n
   from public.erp_public_signup_limits where fingerprint=p_fingerprint for update;
 if last_window>now()-interval '1 hour' and n>=4 then
   raise exception 'Too many registration attempts';
 end if;
 update public.erp_public_signup_limits
   set window_start=case when window_start<=now()-interval '1 hour' then now() else window_start end,
       attempt_count=case when window_start<=now()-interval '1 hour' then 1 else attempt_count+1 end,
       updated_at=now()
   where fingerprint=p_fingerprint;
 insert into public.erp_public_inquiries(
   student_name,phone,email,school,year_level,subject,goal,current_grade,target_grade,notes
 ) values (
   trim(p_name),trim(p_phone),nullif(trim(p_email),''),
   nullif(trim(p_school),''),nullif(trim(p_year_level),''),nullif(trim(p_subject),''),
   nullif(trim(p_goal),''),nullif(trim(p_current_grade),''),nullif(trim(p_target_grade),''),
   nullif(trim(p_notes),'')
 ) returning id into created_id;
 return created_id;
end;
$$;
revoke all on function public.erp_submit_public_inquiry(text,text,text,text,text,text,text,text,text,text,text) from public,anon,authenticated;
grant execute on function public.erp_submit_public_inquiry(text,text,text,text,text,text,text,text,text,text,text) to service_role;


-- Owner-only atomic conversion of a reviewed public inquiry to a CRM lead.
create or replace function public.erp_convert_public_inquiry(p_id uuid)
returns uuid language plpgsql security invoker set search_path=public,pg_temp as $$
declare q public.erp_public_inquiries%rowtype; lead_id uuid;
begin
 if not public.erp_is_owner() then raise exception 'Not authorised'; end if;
 select * into q from public.erp_public_inquiries where id=p_id for update;
 if not found then raise exception 'Inquiry not found'; end if;
 if q.status='converted' then raise exception 'Already converted'; end if;
 insert into public.edu_leads (
   business_unit_id,student_name,contact,contact_channel,school,year_level,
   subject,source,status,notes,created_by
 ) values (
   'cus',q.student_name,q.phone,'电话',q.school,q.year_level,
   q.subject,'Public Registration','new',
   concat_ws(E'\n',nullif(q.goal,''),nullif(q.notes,''),
             case when q.email is not null then 'Email: '||q.email end,
             case when q.current_grade is not null then 'Current: '||q.current_grade end,
             case when q.target_grade is not null then 'Target: '||q.target_grade end),
   (select auth.uid())
 ) returning id into lead_id;
 update public.erp_public_inquiries set status='converted' where id=q.id;
 return lead_id;
end;
$$;
revoke all on function public.erp_convert_public_inquiry(uuid) from public,anon;
grant execute on function public.erp_convert_public_inquiry(uuid) to authenticated;

commit;
