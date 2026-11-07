-- ERP Care: access isolation, standalone child profiles, teacher files, dated care, dual-sign custody.
-- Execute ONLY on Tangent ERP Supabase after the 2026-11-06 care migrations.
-- Back up database first. This is intentionally not run automatically during deployment.

create or replace function public.erp_is_owner()
returns boolean language sql stable security invoker set search_path=public as $$
  select exists(
    select 1 from public.erp_memberships
    where user_id=(select auth.uid()) and business_unit_id='cus' and role='owner'
  );
$$;
create or replace function public.erp_is_care_only()
returns boolean language sql stable security invoker set search_path=public as $$
  select not public.erp_is_owner() and exists(
    select 1 from public.erp_memberships
    where user_id=(select auth.uid()) and business_unit_id='care'
  );
$$;
create or replace function public.erp_can_care_read()
returns boolean language sql stable security invoker set search_path=public as $$
  select public.erp_is_owner() or exists(
    select 1 from public.erp_memberships
    where user_id=(select auth.uid()) and business_unit_id='care'
      and role in ('owner','admin','teacher','viewer')
  );
$$;
create or replace function public.erp_can_care_write()
returns boolean language sql stable security invoker set search_path=public as $$
  select public.erp_is_owner() or exists(
    select 1 from public.erp_memberships
    where user_id=(select auth.uid()) and business_unit_id='care'
      and role in ('owner','admin','teacher')
  );
$$;
create or replace function public.erp_can_care_manage()
returns boolean language sql stable security invoker set search_path=public as $$
  select public.erp_is_owner() or exists(
    select 1 from public.erp_memberships
    where user_id=(select auth.uid()) and business_unit_id='care'
      and role in ('owner','admin')
  );
$$;
revoke all on function public.erp_is_owner(), public.erp_is_care_only(),
  public.erp_can_care_read(), public.erp_can_care_write(), public.erp_can_care_manage()
  from public,anon;
grant execute on function public.erp_is_owner(), public.erp_is_care_only(),
  public.erp_can_care_read(), public.erp_can_care_write(), public.erp_can_care_manage()
  to authenticated;

-- Decouple care children from the existing private CuS student ledger.
create table if not exists public.cus_care_children (
  id uuid primary key default gen_random_uuid(),
  full_name text not null check(length(btrim(full_name)) between 1 and 150),
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id)
);
insert into public.cus_care_children(id,full_name)
select p.student_id, coalesce(nullif(btrim(s.name),''),'历史托管学员')
from public.cus_care_profiles p
left join public.students s on s.id=p.student_id
on conflict (id) do nothing;
alter table public.cus_care_profiles
  drop constraint if exists cus_care_profiles_student_id_fkey;
alter table public.cus_care_profiles
  add constraint cus_care_profiles_student_id_fkey
    foreign key(student_id) references public.cus_care_children(id) on delete restrict;

-- Weekday templates are optional; actual bookings are always date-stamped in care_visits.
alter table public.cus_care_weekdays drop constraint if exists cus_care_weekdays_weekday_check;
alter table public.cus_care_weekdays
  add constraint cus_care_weekdays_weekday_check check (weekday between 0 and 6);
create index if not exists cus_care_visits_child_date_idx
  on public.cus_care_visits(student_id,care_date desc);

-- Two independent signatures are required on each physical handover.
alter table public.cus_care_visits
 add column if not exists check_in_staff_name text,
 add column if not exists check_in_staff_signature text,
 add column if not exists check_out_staff_name text,
 add column if not exists check_out_staff_signature text;

create table if not exists public.cus_staff (
  id uuid primary key default gen_random_uuid(),
  full_name text not null check(length(btrim(full_name)) between 1 and 150),
  phone text,
  email text,
  subjects text,
  notes text,
  scope text not null default 'care' check(scope in ('care','general')),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id)
);
create index if not exists cus_staff_scope_name_idx on public.cus_staff(scope,full_name);

create table if not exists public.cus_care_lesson_logs (
  id uuid primary key default gen_random_uuid(),
  visit_id uuid not null references public.cus_care_visits(id) on delete restrict,
  teacher_id uuid references public.cus_staff(id) on delete restrict,
  teacher_actions text not null check(length(btrim(teacher_actions)) between 1 and 8000),
  child_actions text not null check(length(btrim(child_actions)) between 1 and 8000),
  observations text,
  created_by uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(),
  unique(visit_id,teacher_id)
);
create index if not exists cus_care_lesson_logs_visit_idx on public.cus_care_lesson_logs(visit_id);
create table if not exists public.cus_care_day_credits (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.cus_care_children(id) on delete restrict,
  days integer not null check(days between -365 and 365 and days<>0),
  note text,
  created_by uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now()
);
create index if not exists cus_care_credit_student_idx on public.cus_care_day_credits(student_id);

-- Replace care RLS: partners receive care scope only, not the original CuS role.
do $$
declare t text; p record;
begin
 foreach t in array array[
   'cus_care_children','cus_care_profiles','cus_care_guardians',
   'cus_care_emergency_contacts','cus_care_weekdays','cus_care_visits',
   'cus_care_pickup_approvals','cus_care_events','cus_care_sms_log',
   'cus_care_lesson_logs','cus_care_day_credits'
 ] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('revoke all on public.%I from anon',t);
  for p in select policyname from pg_policies
    where schemaname='public' and tablename=t loop
   execute format('drop policy if exists %I on public.%I',p.policyname,t);
  end loop;
  execute format('create policy care_read on public.%I for select to authenticated using ((select public.erp_can_care_read()))',t);
  if t not in ('cus_care_events','cus_care_sms_log') then
   execute format('create policy care_insert on public.%I for insert to authenticated with check ((select public.erp_can_care_write()))',t);
  end if;
  if t in ('cus_care_profiles','cus_care_guardians','cus_care_emergency_contacts','cus_care_weekdays','cus_care_pickup_approvals','cus_care_children') then
   execute format('create policy care_update on public.%I for update to authenticated using ((select public.erp_can_care_manage())) with check ((select public.erp_can_care_manage()))',t);
  end if;
  if t='cus_care_visits' then
   execute format('create policy care_update on public.%I for update to authenticated using ((select public.erp_can_care_write())) with check ((select public.erp_can_care_write()))',t);
  end if;
  if t='cus_care_weekdays' then
   execute format('create policy care_delete on public.%I for delete to authenticated using ((select public.erp_can_care_manage()))',t);
  end if;
  if t in ('cus_care_lesson_logs','cus_care_day_credits') then
   execute format('create policy care_update on public.%I for update to authenticated using ((select public.erp_can_care_manage())) with check ((select public.erp_can_care_manage()))',t);
  end if;
  if t in ('cus_care_children','cus_care_profiles','cus_care_guardians','cus_care_emergency_contacts','cus_care_weekdays','cus_care_visits','cus_care_pickup_approvals','cus_care_lesson_logs','cus_care_day_credits') then
   execute format('grant select,insert,update on public.%I to authenticated',t);
  else
   execute format('grant select on public.%I to authenticated',t);
  end if;
 end loop;
end $$;
revoke insert,update,delete on public.cus_care_events,public.cus_care_sms_log from authenticated;
grant delete on public.cus_care_weekdays to authenticated;
revoke delete on public.cus_care_children,public.cus_care_profiles,
  public.cus_care_guardians,public.cus_care_emergency_contacts,
  public.cus_care_visits,public.cus_care_pickup_approvals,
  public.cus_care_lesson_logs,public.cus_care_day_credits from authenticated;

alter table public.cus_staff enable row level security;
revoke all on public.cus_staff from anon;
grant select,insert,update on public.cus_staff to authenticated;
drop policy if exists care_staff_read on public.cus_staff;
create policy care_staff_read on public.cus_staff for select to authenticated
 using ((select public.erp_is_owner()) or
   (scope='care' and (select public.erp_can_care_read())));
drop policy if exists care_staff_insert on public.cus_staff;
create policy care_staff_insert on public.cus_staff for insert to authenticated
 with check ((select public.erp_is_owner()) or
   (scope='care' and (select public.erp_can_care_manage())));
drop policy if exists care_staff_update on public.cus_staff;
create policy care_staff_update on public.cus_staff for update to authenticated
 using ((select public.erp_is_owner()) or
   (scope='care' and (select public.erp_can_care_manage())))
 with check ((select public.erp_is_owner()) or
   (scope='care' and (select public.erp_can_care_manage())));

-- Existing core RLS policies currently grant broad authenticated access.
-- Add a RESTRICTIVE policy to each non-care public table. For tables that had
-- RLS disabled, preserve previous non-care behaviour with an explicit permissive policy.
do $$
declare r record; p record; had_rls boolean;
begin
 for r in
   select c.relname as t,c.relrowsecurity as enabled
   from pg_class c join pg_namespace n on n.oid=c.relnamespace
   where n.nspname='public' and c.relkind in ('r','p')
     and c.relname not in ('erp_memberships','cus_staff')
     and c.relname not like 'cus_care_%'
 loop
   had_rls := r.enabled;
   execute format('alter table public.%I enable row level security',r.t);
   execute format('drop policy if exists erp_care_isolation on public.%I',r.t);
   execute format(
     'create policy erp_care_isolation on public.%I as restrictive for all to authenticated using (not (select public.erp_is_care_only())) with check (not (select public.erp_is_care_only()))',r.t);
   if not had_rls then
     execute format('drop policy if exists erp_legacy_non_care on public.%I',r.t);
     execute format('create policy erp_legacy_non_care on public.%I for all to authenticated using (true) with check (true)',r.t);
   end if;
 end loop;
end $$;

-- Protect non-care storage buckets from care-only accounts, too.
drop policy if exists erp_care_storage_isolation on storage.objects;
create policy erp_care_storage_isolation on storage.objects as restrictive for all to authenticated
 using (bucket_id='cus-care-evidence' or not (select public.erp_is_care_only()))
 with check (bucket_id='cus-care-evidence' or not (select public.erp_is_care_only()));
drop policy if exists cus_care_evidence_read on storage.objects;
create policy cus_care_evidence_read on storage.objects for select to authenticated
 using (bucket_id='cus-care-evidence' and (select public.erp_can_care_read()));
drop policy if exists cus_care_evidence_upload on storage.objects;
create policy cus_care_evidence_upload on storage.objects for insert to authenticated
 with check (bucket_id='cus-care-evidence' and (select public.erp_can_care_manage()));

-- Signed presence is not accepted unless an identified employee signs as well.
create or replace function public.cus_care_validate_visit()
returns trigger language plpgsql security invoker set search_path=public as $$
declare g record; c record; a record;
begin
 if old.status='released' then
   raise exception 'Released care record cannot be changed';
 end if;
 if old.student_id is distinct from new.student_id or
    old.care_date is distinct from new.care_date or
    old.scheduled_start is distinct from new.scheduled_start or
    old.scheduled_end is distinct from new.scheduled_end then
   raise exception 'Care visit identity and dates are immutable';
 end if;
 if old.status='scheduled' and new.status='in_care' then
   if new.check_in_at is null or new.check_in_name is null or
     new.check_in_signature is null or length(new.check_in_signature)<250 or
     new.check_in_staff_name is null or length(btrim(new.check_in_staff_name))<2 or
     new.check_in_staff_signature is null or length(new.check_in_staff_signature)<250 or
     new.check_in_recorded_by is null or new.check_in_guardian_id is null then
       raise exception 'Parent and staff signatures are both required for check-in';
   end if;
   select * into g from public.cus_care_guardians
    where id=new.check_in_guardian_id and student_id=new.student_id
      and pickup_authorized and signature_signed_at is not null;
   if not found or lower(btrim(g.full_name))<>lower(btrim(new.check_in_name)) then
      raise exception 'Parent identity mismatch on check-in';
   end if;
 elsif old.status='in_care' and new.status='released' then
   if new.check_out_at is null or new.check_out_name is null or
     new.check_out_signature is null or length(new.check_out_signature)<250 or
     new.check_out_staff_name is null or length(btrim(new.check_out_staff_name))<2 or
     new.check_out_staff_signature is null or length(new.check_out_staff_signature)<250 or
     new.check_out_recorded_by is null or not new.staff_verified_identity then
       raise exception 'Parent/collector and staff signatures are required for check-out';
   end if;
   if (new.check_out_guardian_id is not null) = (new.check_out_contact_id is not null) then
      raise exception 'Specify exactly one collector';
   end if;
   if new.check_out_guardian_id is not null then
     select * into g from public.cus_care_guardians
       where id=new.check_out_guardian_id and student_id=new.student_id
         and pickup_authorized and signature_signed_at is not null;
     if not found or lower(btrim(g.full_name))<>lower(btrim(new.check_out_name)) then
        raise exception 'Parent identity mismatch on check-out';
     end if;
   else
     select * into c from public.cus_care_emergency_contacts
       where id=new.check_out_contact_id and student_id=new.student_id;
     if not found or lower(btrim(c.full_name))<>lower(btrim(new.check_out_name)) then
       raise exception 'Collector identity mismatch';
     end if;
     select * into a from public.cus_care_pickup_approvals
       where visit_id=new.id and contact_id=new.check_out_contact_id and revoked_at is null
         and child_response_checked and video_path is not null and parent_notified_at is not null
       order by approved_at desc limit 1;
     if not found then raise exception 'Verified parent approval and evidence are required'; end if;
   end if;
 elsif old.status='scheduled' and new.status='cancelled' then
    null;
 else
    raise exception 'Invalid care visit transition';
 end if;
 return new;
end $$;
-- Existing audit trigger is retained: both signatures are recorded in the row,
-- and state changes remain logged in cus_care_events.

-- Optional provisioning pattern: do NOT grant partners cus/sine/tangent/family.
-- insert into erp_memberships(user_id,business_unit_id,role)
-- select id,'care','admin' from auth.users where email='partner@example.com'
-- on conflict(user_id,business_unit_id) do update set role=excluded.role;
-- delete from erp_memberships where user_id=(select id from auth.users
-- where email='partner@example.com') and business_unit_id <> 'care';
