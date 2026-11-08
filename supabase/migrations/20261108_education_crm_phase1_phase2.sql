-- Tangent ERP Education CRM (CuS / Astra only)
-- Apply to the *ERP* Supabase project AFTER the 20261108 Astra independent-entity v2 migration.
-- Safe, additive: does not change existing students, bookings, lesson or finance records.
-- Run as one SQL Editor transaction after a backup, then test CuS/Astra RLS separately.
begin;

create or replace function public.erp_education_crm_access(p_unit text)
returns boolean language sql stable security invoker set search_path=public as $$
 select p_unit in ('cus','astra') and
 exists(select 1 from public.erp_memberships m
   where m.user_id=(select auth.uid()) and
   ((m.business_unit_id='cus' and m.role='owner')
    or (m.business_unit_id=p_unit and m.role in ('owner','admin'))));
$$;
revoke all on function public.erp_education_crm_access(text) from public,anon;
grant execute on function public.erp_education_crm_access(text) to authenticated;

create table if not exists public.edu_leads (
 id uuid primary key default gen_random_uuid(),
 business_unit_id text not null check(business_unit_id in ('cus','astra')),
 student_id uuid references public.students(id) on delete set null,
 student_name text not null check(length(btrim(student_name)) between 1 and 160),
 parent_name text,
 contact text,
 contact_channel text,
 school text,
 year_level text,
 subject text,
 course_interest text,
 source text not null default 'other',
 assigned_to uuid references auth.users(id),
 status text not null default 'new' check(status in
   ('new','contacted','trial_booked','trial_done','considering','enrolled','lost')),
 next_followup_at timestamptz,
 lost_reason text,
 notes text,
 created_by uuid not null default auth.uid() references auth.users(id),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 unique(id,business_unit_id)
);
create index if not exists edu_leads_unit_status_idx
 on public.edu_leads(business_unit_id,status,created_at desc);
create index if not exists edu_leads_unit_followup_idx
 on public.edu_leads(business_unit_id,next_followup_at) where next_followup_at is not null;
create index if not exists edu_leads_student_idx on public.edu_leads(student_id);

create table if not exists public.edu_lead_activities (
 id uuid primary key default gen_random_uuid(),
 business_unit_id text not null check(business_unit_id in ('cus','astra')),
 lead_id uuid not null,
 kind text not null default 'note' check(kind in ('note','call','wechat','message','meeting','feedback')),
 content text not null check(length(btrim(content)) between 1 and 4000),
 created_by uuid not null default auth.uid() references auth.users(id),
 created_at timestamptz not null default now(),
 foreign key(lead_id,business_unit_id)
   references public.edu_leads(id,business_unit_id) on delete restrict
);
create index if not exists edu_lead_activities_lead_idx
 on public.edu_lead_activities(lead_id,created_at desc);

create table if not exists public.edu_trials (
 id uuid primary key default gen_random_uuid(),
 business_unit_id text not null check(business_unit_id in ('cus','astra')),
 lead_id uuid not null,
 booking_id uuid references public.bookings(id) on delete set null,
 starts_at timestamptz not null,
 duration_minutes integer not null default 45 check(duration_minutes between 15 and 240),
 teacher text,
 subject text,
 fee_nzd numeric(12,2) not null default 0 check(fee_nzd >= 0),
 status text not null default 'scheduled' check(status in ('scheduled','completed','no_show','cancelled')),
 assessment text,
 outcome text check(outcome is null or outcome in ('enrolled','considering','declined')),
 created_by uuid not null default auth.uid() references auth.users(id),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 foreign key(lead_id,business_unit_id)
   references public.edu_leads(id,business_unit_id) on delete restrict
);
create index if not exists edu_trials_unit_date_idx
 on public.edu_trials(business_unit_id,starts_at desc);
create index if not exists edu_trials_lead_idx on public.edu_trials(lead_id,starts_at desc);

create table if not exists public.edu_followups (
 id uuid primary key default gen_random_uuid(),
 business_unit_id text not null check(business_unit_id in ('cus','astra')),
 lead_id uuid,
 student_id uuid references public.students(id) on delete cascade,
 kind text not null default 'lead' check(kind in ('lead','trial','parent','renewal')),
 title text not null check(length(btrim(title)) between 1 and 200),
 notes text,
 due_at timestamptz not null,
 status text not null default 'open' check(status in ('open','done','cancelled')),
 completed_at timestamptz,
 assigned_to uuid references auth.users(id),
 created_by uuid not null default auth.uid() references auth.users(id),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 constraint edu_followups_target_check check(lead_id is not null or student_id is not null),
 foreign key(lead_id,business_unit_id)
   references public.edu_leads(id,business_unit_id) on delete restrict
);
create index if not exists edu_followups_unit_due_idx
 on public.edu_followups(business_unit_id,status,due_at);
create index if not exists edu_followups_student_idx on public.edu_followups(student_id);

create table if not exists public.edu_student_activities (
 id uuid primary key default gen_random_uuid(),
 business_unit_id text not null check(business_unit_id in ('cus','astra')),
 student_id uuid not null references public.students(id) on delete restrict,
 kind text not null default 'note' check(kind in ('note','call','wechat','message','meeting','feedback')),
 content text not null check(length(btrim(content)) between 1 and 4000),
 created_by uuid not null default auth.uid() references auth.users(id),
 created_at timestamptz not null default now()
);
create index if not exists edu_student_activities_student_idx
 on public.edu_student_activities(student_id,created_at desc);

-- Database-level tenant integrity, including direct PostgREST writes.
create or replace function public.erp_education_check_scope()
returns trigger language plpgsql security invoker set search_path=public as $$
begin
 if tg_op='UPDATE' then
   if new.business_unit_id is distinct from old.business_unit_id then
     raise exception 'Education entity cannot be changed after creation';
   end if;
 end if;
 if tg_table_name in ('edu_leads','edu_followups','edu_student_activities') then
   if new.student_id is not null and not exists (
     select 1 from public.students s where s.id=new.student_id
       and s.business_unit_id=new.business_unit_id
   ) then raise exception 'Student must belong to the same education entity'; end if;
 end if;
 if tg_table_name='edu_trials' then
   if new.booking_id is not null and not exists (
     select 1 from public.bookings b join public.edu_leads l on l.id=new.lead_id
      where b.id=new.booking_id and b.business_unit_id=new.business_unit_id
        and l.student_id is not null and l.student_id=b.student_id
   ) then raise exception 'Trial booking must match the linked student and entity'; end if;
 end if;
 return new;
end $;
drop trigger if exists edu_leads_scope on public.edu_leads;
create trigger edu_leads_scope before insert or update of student_id,business_unit_id
 on public.edu_leads for each row execute function public.erp_education_check_scope();
drop trigger if exists edu_trials_scope on public.edu_trials;
create trigger edu_trials_scope before insert or update of booking_id,business_unit_id
 on public.edu_trials for each row execute function public.erp_education_check_scope();
drop trigger if exists edu_followups_scope on public.edu_followups;
create trigger edu_followups_scope before insert or update of student_id,business_unit_id
 on public.edu_followups for each row execute function public.erp_education_check_scope();
drop trigger if exists edu_student_activities_scope on public.edu_student_activities;
create trigger edu_student_activities_scope before insert or update of student_id,business_unit_id
 on public.edu_student_activities for each row execute function public.erp_education_check_scope();

create or replace function public.erp_education_touch()
returns trigger language plpgsql security invoker set search_path=public as $$
begin new.updated_at=now(); return new; end $$;
drop trigger if exists edu_leads_touch on public.edu_leads;
create trigger edu_leads_touch before update on public.edu_leads
 for each row execute function public.erp_education_touch();
drop trigger if exists edu_trials_touch on public.edu_trials;
create trigger edu_trials_touch before update on public.edu_trials
 for each row execute function public.erp_education_touch();
drop trigger if exists edu_followups_touch on public.edu_followups;
create trigger edu_followups_touch before update on public.edu_followups
 for each row execute function public.erp_education_touch();

do $$
declare t text;
begin
 foreach t in array array['edu_leads','edu_lead_activities','edu_trials','edu_followups','edu_student_activities'] loop
   execute format('alter table public.%I enable row level security',t);
   execute format('revoke all on public.%I from anon',t);
   -- Historical communication records are append-only; leads/trials/tasks are editable.
   execute format('revoke update,delete on public.%I from authenticated',t);
   execute format('grant select,insert on public.%I to authenticated',t);
   execute format('drop policy if exists education_crm_read on public.%I',t);
   execute format('drop policy if exists education_crm_insert on public.%I',t);
   execute format('drop policy if exists education_crm_update on public.%I',t);
   execute format('create policy education_crm_read on public.%I for select to authenticated using (public.erp_education_crm_access(business_unit_id))',t);
   execute format('create policy education_crm_insert on public.%I for insert to authenticated with check (public.erp_education_crm_access(business_unit_id) and created_by=(select auth.uid()))',t);
   if t not in ('edu_lead_activities','edu_student_activities') then
     execute format('grant update on public.%I to authenticated',t);
     execute format('create policy education_crm_update on public.%I for update to authenticated using (public.erp_education_crm_access(business_unit_id)) with check (public.erp_education_crm_access(business_unit_id))',t);
   end if;
 end loop;
end $$;

-- Leads are linked to the existing students ledger transactionally. A trial is a
-- pre-enrolment appointment, not a completed lesson and never a cash receipt.
create or replace function public.erp_education_convert_lead(
 p_lead_id uuid,
 p_existing_student_id uuid default null,
 p_student_code text default null,
 p_hourly_rate numeric default 70,
 p_payment_type text default 'monthly'
) returns uuid language plpgsql security invoker set search_path=public as $$
declare l public.edu_leads%rowtype; sid uuid;
begin
 select * into l from public.edu_leads where id=p_lead_id for update;
 if not found then raise exception 'Lead not found'; end if;
 if not public.erp_education_crm_access(l.business_unit_id) then
   raise exception 'Not authorised'; end if;
 if l.student_id is not null then
   if p_existing_student_id=l.student_id then return l.student_id; end if;
   raise exception 'Lead is already linked to a student';
 end if;
 if p_existing_student_id is not null then
   select id into sid from public.students
    where id=p_existing_student_id and business_unit_id=l.business_unit_id;
   if sid is null then raise exception 'Existing student is not in this entity'; end if;
 else
   if p_payment_type not in ('monthly','postpaid','single') then
     raise exception 'Invalid payment type'; end if;
   if p_hourly_rate is null or p_hourly_rate<=0 or p_hourly_rate>10000 then
     raise exception 'Invalid hourly rate'; end if;
   insert into public.students(
     name,student_code,subject,teacher,level,hourly_rate,balance,
     payment_type,currency,business_unit_id
   ) values (
     l.student_name,coalesce(nullif(btrim(p_student_code),''),''),coalesce(l.subject,''),
     '',coalesce(nullif(btrim(l.year_level),''),'Year 11'),p_hourly_rate,0,
     p_payment_type,'NZD',l.business_unit_id
   ) returning id into sid;
 end if;
 update public.edu_leads set student_id=sid,status='enrolled',
   next_followup_at=null where id=l.id and business_unit_id=l.business_unit_id;
 return sid;
end $$;
revoke all on function public.erp_education_convert_lead(uuid,uuid,text,numeric,text) from public,anon;
grant execute on function public.erp_education_convert_lead(uuid,uuid,text,numeric,text) to authenticated;
commit;

-- Verification after migration, under real CuS Owner and Astra Admin sessions:
--   CuS cannot write an Astra lead; Astra cannot read CuS leads; teacher has no CRM access.
--   Converting a lead either creates/links exactly one student in the same entity or rolls back.
--   Followups/activities/trials must reject mismatched entity IDs even via direct API.
