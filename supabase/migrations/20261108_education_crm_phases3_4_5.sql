-- Tangent Education CRM phases 3/4/5. Run after 20261108_education_crm_phase1_phase2.sql.
-- Append-only extension of the existing ERP; no students/bookings/transactions rebuilt.
begin;

create table if not exists public.edu_staff_credentials (
 id uuid primary key default gen_random_uuid(),
 business_unit_id text not null check(business_unit_id in ('cus','astra')),
 staff_id uuid not null references public.cus_staff(id) on delete restrict,
 credential_type text not null check(credential_type in
  ('first_aid','police_vetting','p_endorsement','teacher_registration','other')),
 title text not null check(length(btrim(title)) between 1 and 200),
 status text not null default 'pending' check(status in ('pending','verified','needs_review')),
 reference_note text,
 issued_on date,
 review_due_on date,
 notes text,
 created_by uuid not null default auth.uid() references auth.users(id),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create index if not exists edu_staff_credentials_scope_idx
 on public.edu_staff_credentials(business_unit_id,staff_id,review_due_on);

create table if not exists public.edu_staff_training (
 id uuid primary key default gen_random_uuid(),
 business_unit_id text not null check(business_unit_id in ('cus','astra')),
 staff_id uuid not null references public.cus_staff(id) on delete restrict,
 kind text not null check(kind in ('onboarding','training','demo','observation','review')),
 title text not null check(length(btrim(title)) between 1 and 200),
 session_date date not null,
 outcome text not null default 'planned' check(outcome in ('planned','completed','followup','cancelled')),
 notes text,
 created_by uuid not null default auth.uid() references auth.users(id),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create index if not exists edu_staff_training_scope_idx
 on public.edu_staff_training(business_unit_id,staff_id,session_date desc);

create table if not exists public.edu_campaigns (
 id uuid primary key default gen_random_uuid(),
 business_unit_id text not null check(business_unit_id in ('cus','astra')),
 title text not null check(length(btrim(title)) between 1 and 200),
 category text not null default 'event'
  check(category in ('event','trial_day','workshop','holiday','seminar','other')),
 starts_at timestamptz not null,
 ends_at timestamptz,
 location text,
 capacity integer not null default 20 check(capacity between 1 and 500),
 advertised_fee_nzd numeric(12,2) check(advertised_fee_nzd is null or advertised_fee_nzd>=0),
 status text not null default 'draft'
  check(status in ('draft','open','closed','completed','cancelled')),
 lead_source text not null default '活动',
 notes text,
 created_by uuid not null default auth.uid() references auth.users(id),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 unique(id,business_unit_id),
 constraint edu_campaign_dates check(ends_at is null or ends_at>starts_at)
);
create index if not exists edu_campaigns_scope_idx
 on public.edu_campaigns(business_unit_id,starts_at desc);

create table if not exists public.edu_campaign_registrations (
 id uuid primary key default gen_random_uuid(),
 business_unit_id text not null check(business_unit_id in ('cus','astra')),
 campaign_id uuid not null,
 lead_id uuid not null,
 status text not null default 'registered'
  check(status in ('registered','attended','no_show','cancelled')),
 notes text,
 created_by uuid not null default auth.uid() references auth.users(id),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 unique(campaign_id,lead_id),
 foreign key(campaign_id,business_unit_id)
  references public.edu_campaigns(id,business_unit_id) on delete restrict,
 foreign key(lead_id,business_unit_id)
  references public.edu_leads(id,business_unit_id) on delete restrict
);
create index if not exists edu_campaign_reg_scope_idx
 on public.edu_campaign_registrations(business_unit_id,campaign_id,status);

-- Enforce teacher-scope ownership and prevent record reassignment even via PostgREST.
create or replace function public.erp_education_ext_scope()
returns trigger language plpgsql security invoker set search_path=public as $$
declare s text;
begin
 if tg_op='UPDATE' then
   if new.business_unit_id is distinct from old.business_unit_id then
     raise exception 'Entity cannot change';
   end if;
   if tg_table_name in ('edu_staff_credentials','edu_staff_training')
      and new.staff_id is distinct from old.staff_id then
     raise exception 'Cannot reassign teacher records';
   end if;
   if tg_table_name='edu_campaign_registrations' and
      (new.lead_id is distinct from old.lead_id or new.campaign_id is distinct from old.campaign_id) then
     raise exception 'Cannot reassign registration';
   end if;
 end if;
 if tg_table_name in ('edu_staff_credentials','edu_staff_training') then
   select scope into s from public.cus_staff where id=new.staff_id;
   if s is null or (new.business_unit_id='cus' and s<>'general')
      or (new.business_unit_id='astra' and s not in ('astra','care')) then
     raise exception 'Teacher belongs to another entity';
   end if;
 end if;
 return new;
end;
$$;
drop trigger if exists edu_staff_credentials_scope on public.edu_staff_credentials;
create trigger edu_staff_credentials_scope
 before insert or update of staff_id,business_unit_id on public.edu_staff_credentials
 for each row execute function public.erp_education_ext_scope();
drop trigger if exists edu_staff_training_scope on public.edu_staff_training;
create trigger edu_staff_training_scope
 before insert or update of staff_id,business_unit_id on public.edu_staff_training
 for each row execute function public.erp_education_ext_scope();
drop trigger if exists edu_campaigns_scope on public.edu_campaigns;
create trigger edu_campaigns_scope
 before insert or update of business_unit_id on public.edu_campaigns
 for each row execute function public.erp_education_ext_scope();
drop trigger if exists edu_campaign_reg_scope on public.edu_campaign_registrations;
create trigger edu_campaign_reg_scope
 before insert or update of business_unit_id,campaign_id,lead_id on public.edu_campaign_registrations
 for each row execute function public.erp_education_ext_scope();

-- RLS: same administrator predicate and separation as Phase 1.
do $$
declare t text;
begin
 foreach t in array array['edu_staff_credentials','edu_staff_training',
   'edu_campaigns','edu_campaign_registrations'] loop
   execute format('alter table public.%I enable row level security',t);
   execute format('revoke all on public.%I from anon,authenticated',t);
   execute format('grant select,insert,update on public.%I to authenticated',t);
   execute format('drop policy if exists edu_ext_read on public.%I',t);
   execute format('drop policy if exists edu_ext_insert on public.%I',t);
   execute format('drop policy if exists edu_ext_update on public.%I',t);
   execute format('create policy edu_ext_read on public.%I for select to authenticated using (public.erp_education_crm_access(business_unit_id))',t);
   execute format('create policy edu_ext_insert on public.%I for insert to authenticated with check (public.erp_education_crm_access(business_unit_id) and created_by=(select auth.uid()))',t);
   execute format('create policy edu_ext_update on public.%I for update to authenticated using (public.erp_education_crm_access(business_unit_id)) with check (public.erp_education_crm_access(business_unit_id))',t);
 end loop;
end;
$$;

-- Single transaction: either reserve a place AND create/link a lead or do neither.
create or replace function public.erp_education_campaign_signup(
 p_campaign_id uuid,p_lead_id uuid default null,
 p_student_name text default null,p_parent_name text default null,p_contact text default null
) returns uuid language plpgsql security invoker set search_path=public as $$
declare c public.edu_campaigns%rowtype; lead_unit text;
        target uuid; reg uuid; state text; occupied integer;
begin
 select * into c from public.edu_campaigns where id=p_campaign_id for update;
 if not found then raise exception 'Event not found'; end if;
 if not public.erp_education_crm_access(c.business_unit_id) then
   raise exception 'No access to event';
 end if;
 if c.status<>'open' then raise exception 'Event is not open'; end if;
 if p_lead_id is not null then
   select business_unit_id into lead_unit from public.edu_leads where id=p_lead_id;
   if lead_unit is distinct from c.business_unit_id then
     raise exception 'Lead does not belong to this event';
   end if;
   target:=p_lead_id;
   select id,status into reg,state from public.edu_campaign_registrations
     where campaign_id=c.id and lead_id=target;
   if reg is not null and state in ('registered','attended') then return reg; end if;
 else
   if length(btrim(coalesce(p_student_name,''))) not between 1 and 160
      or length(coalesce(p_parent_name,''))>160
      or length(coalesce(p_contact,''))>160 then
     raise exception 'Invalid new attendee information';
   end if;
 end if;
 select count(*) into occupied from public.edu_campaign_registrations
   where campaign_id=c.id and status in ('registered','attended');
 if occupied>=c.capacity then raise exception 'Event is full'; end if;
 if target is null then
   insert into public.edu_leads(business_unit_id,student_name,parent_name,contact,contact_channel,source)
     values(c.business_unit_id,btrim(p_student_name),nullif(btrim(p_parent_name),''),
       nullif(btrim(p_contact),''),'微信',c.lead_source)
     returning id into target;
 end if;
 insert into public.edu_campaign_registrations(business_unit_id,campaign_id,lead_id,status)
   values(c.business_unit_id,c.id,target,'registered')
   on conflict (campaign_id,lead_id) do update
     set status='registered',updated_at=now()
   returning id into reg;
 return reg;
end;
$$;
revoke all on function public.erp_education_campaign_signup(uuid,uuid,text,text,text) from public,anon;
grant execute on function public.erp_education_campaign_signup(uuid,uuid,text,text,text) to authenticated;
commit;

-- No scanned police-vetting results, raw criminal records or medical records are stored.
-- Event fees are advertised prices only: receipts remain in the existing Finance module.
