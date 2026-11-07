-- Astra independently operated company: migration + isolation.
-- RUN MANUALLY on the TANGENT ERP production Supabase, in a maintenance window
-- AFTER A DATABASE BACKUP. Deployment does NOT execute this file.
-- Existing CuS records whose NONBLANK code does not start with "1" are moved to
-- Astra together with linked bookings and student-linked transactions.
-- Unlinked transactions need manual classification; they are NOT guessed.
-- Astra's care data remains in historical cus_care_* tables but is controlled by
-- Astra memberships, not by CuS access.
begin;
insert into public.erp_memberships(user_id,business_unit_id,role)
select user_id,'astra',role from public.erp_memberships
where business_unit_id='care'
on conflict(user_id,business_unit_id) do nothing;
insert into public.erp_memberships(user_id,business_unit_id,role)
select user_id,'astra','owner' from public.erp_memberships
where business_unit_id='cus' and role='owner'
on conflict(user_id,business_unit_id) do update set role='owner';

-- business_units.id is UUID in the existing ERP schema, whereas the
-- operational tenant code is a TEXT value in erp_memberships,
-- students, bookings, transactions and cus_programmes.
-- Do NOT insert 'astra' as business_units.id. The application switches
-- to the Astra tenant using the TEXT code and its membership mapping.
-- Its display label is already defined by the application UI.

create temporary table _astra_moved_students on commit drop as
select id from public.students
where business_unit_id='cus' and nullif(btrim(student_code),'') is not null
and btrim(student_code) not like '1%';

update public.bookings set business_unit_id='astra'
where business_unit_id='cus' and student_id in (select id from _astra_moved_students);
update public.transactions set business_unit_id='astra'
where business_unit_id='cus' and student_id in (select id from _astra_moved_students);
update public.students set business_unit_id='astra'
where business_unit_id='cus' and id in (select id from _astra_moved_students);

-- Owner = two CuS administrators; Astra staff = membership in Astra only.
create or replace function public.erp_astra_access(p_write boolean default false)
returns boolean language sql stable security invoker set search_path=public as $$
 select public.erp_is_owner() or exists(
  select 1 from public.erp_memberships m
  where m.user_id=(select auth.uid()) and m.business_unit_id='astra'
   and (not p_write or m.role in ('owner','admin','teacher'))
 );
$$;
revoke all on function public.erp_astra_access(boolean) from public,anon;
grant execute on function public.erp_astra_access(boolean) to authenticated;

-- Replace broad legacy or "care-isolation" policies with genuine tenant RLS.
do $$
declare t text; p record;
begin
 foreach t in array array['students','bookings','transactions'] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('revoke all on public.%I from anon',t);
  execute format('grant select,insert,update,delete on public.%I to authenticated',t);
  for p in select policyname from pg_policies
    where schemaname='public' and tablename=t loop
    execute format('drop policy if exists %I on public.%I',p.policyname,t);
  end loop;
  execute format('create policy tenant_select on public.%I for select to authenticated using ((select public.erp_is_owner()) or (business_unit_id=''astra'' and (select public.erp_astra_access(false))))',t);
  execute format('create policy tenant_insert on public.%I for insert to authenticated with check ((select public.erp_is_owner()) or (business_unit_id=''astra'' and (select public.erp_astra_access(true))))',t);
  execute format('create policy tenant_update on public.%I for update to authenticated using ((select public.erp_is_owner()) or (business_unit_id=''astra'' and (select public.erp_astra_access(true)))) with check ((select public.erp_is_owner()) or (business_unit_id=''astra'' and (select public.erp_astra_access(true))))',t);
  execute format('create policy tenant_delete on public.%I for delete to authenticated using ((select public.erp_is_owner()) or (business_unit_id=''astra'' and (select public.erp_astra_access(true))))',t);
 end loop;
end $$;

-- Prevent one organisation's booking / finance entry from pointing at the other's students.
create or replace function public.erp_verify_student_tenant()
returns trigger language plpgsql security invoker set search_path=public as $$
begin
 if new.student_id is not null and not exists(
  select 1 from public.students s
  where s.id=new.student_id and s.business_unit_id=new.business_unit_id
 ) then
   raise exception 'Student and business unit must match';
 end if;
 return new;
end $$;
drop trigger if exists bookings_verify_student_tenant on public.bookings;
create trigger bookings_verify_student_tenant before insert or update of student_id,business_unit_id
on public.bookings for each row execute function public.erp_verify_student_tenant();
drop trigger if exists transactions_verify_student_tenant on public.transactions;
create trigger transactions_verify_student_tenant before insert or update of student_id,business_unit_id
on public.transactions for each row execute function public.erp_verify_student_tenant();

-- Permit CuS / Astra programmes in the same infrastructure, but isolated by programme.
alter table public.cus_programmes drop constraint if exists cus_programmes_business_unit_id_check;
alter table public.cus_programmes
 add constraint cus_programmes_business_unit_id_check
 check (business_unit_id in ('cus','astra'));

create or replace function public.erp_programme_tenant(p_id uuid)
returns text language sql stable security invoker set search_path=public as $$
 select p.business_unit_id from public.cus_programmes p where p.id=p_id;
$$;
create or replace function public.erp_class_tenant(p_id uuid)
returns text language sql stable security invoker set search_path=public as $$
 select p.business_unit_id from public.cus_classes c
 join public.cus_programmes p on p.id=c.programme_id where c.id=p_id;
$$;
create or replace function public.erp_session_tenant(p_id uuid)
returns text language sql stable security invoker set search_path=public as $$
 select p.business_unit_id from public.cus_class_sessions s
 join public.cus_classes c on c.id=s.class_id
 join public.cus_programmes p on p.id=c.programme_id where s.id=p_id;
$$;
revoke all on function public.erp_programme_tenant(uuid),
 public.erp_class_tenant(uuid),public.erp_session_tenant(uuid) from public,anon;
grant execute on function public.erp_programme_tenant(uuid),
 public.erp_class_tenant(uuid),public.erp_session_tenant(uuid) to authenticated;

-- Policies are scope-resolved via the parent programme; signed-in Astra staff
-- can see/modify only Astra classes, attendance, sessions and enrolments.
do $$
declare t text; expr text; p record;
begin
 foreach t in array array[
 'cus_programmes','cus_classes','cus_enrolments','cus_class_sessions','cus_attendance'
 ] loop
  expr:=case t
    when 'cus_programmes' then 'business_unit_id'
    when 'cus_classes' then 'public.erp_programme_tenant(programme_id)'
    when 'cus_enrolments' then 'public.erp_class_tenant(class_id)'
    when 'cus_class_sessions' then 'public.erp_class_tenant(class_id)'
    when 'cus_attendance' then 'public.erp_session_tenant(session_id)'
  end;
  execute format('alter table public.%I enable row level security',t);
  execute format('revoke all on public.%I from anon',t);
  execute format('grant select,insert,update,delete on public.%I to authenticated',t);
  for p in select policyname from pg_policies where schemaname='public' and tablename=t loop
   execute format('drop policy if exists %I on public.%I',p.policyname,t);
  end loop;
  execute format('create policy tenant_select on public.%I for select to authenticated using ((select public.erp_is_owner()) or ((%s)=''astra'' and (select public.erp_astra_access(false))))',t,expr);
  execute format('create policy tenant_insert on public.%I for insert to authenticated with check ((select public.erp_is_owner()) or ((%s)=''astra'' and (select public.erp_astra_access(true))))',t,expr);
  execute format('create policy tenant_update on public.%I for update to authenticated using ((select public.erp_is_owner()) or ((%s)=''astra'' and (select public.erp_astra_access(true)))) with check ((select public.erp_is_owner()) or ((%s)=''astra'' and (select public.erp_astra_access(true))))',t,expr,expr);
  execute format('create policy tenant_delete on public.%I for delete to authenticated using ((select public.erp_is_owner()) or ((%s)=''astra'' and (select public.erp_astra_access(true))))',t,expr);
 end loop;
end $$;

create or replace function public.erp_verify_class_student()
returns trigger language plpgsql security invoker set search_path=public as $$
declare tenant text; target_student uuid;
begin
 if tg_table_name='cus_enrolments' then
   tenant:=public.erp_class_tenant(new.class_id);target_student:=new.student_id;
 else
   tenant:=public.erp_session_tenant(new.session_id);target_student:=new.student_id;
 end if;
 if tenant is null or not exists(
   select 1 from public.students s where s.id=target_student and s.business_unit_id=tenant
 ) then
   raise exception 'Student must be enrolled in the same organisation';
 end if;
 return new;
end $$;
drop trigger if exists class_enrolment_tenant on public.cus_enrolments;
create trigger class_enrolment_tenant before insert or update of class_id,student_id
 on public.cus_enrolments for each row execute function public.erp_verify_class_student();
drop trigger if exists class_attendance_tenant on public.cus_attendance;
create trigger class_attendance_tenant before insert or update of session_id,student_id
 on public.cus_attendance for each row execute function public.erp_verify_class_student();

-- Astra's class and tutoring notes coexist without granting access to CuS notes.
create or replace function public.erp_record_tenant(
 p_booking_id uuid,p_session_id uuid
) returns text language sql stable security invoker set search_path=public as $$
 select case when p_booking_id is not null then
  (select b.business_unit_id from public.bookings b where b.id=p_booking_id)
 else public.erp_session_tenant(p_session_id) end;
$$;
revoke all on function public.erp_record_tenant(uuid,uuid) from public,anon;
grant execute on function public.erp_record_tenant(uuid,uuid) to authenticated;
alter table public.cus_teaching_records enable row level security;
revoke all on public.cus_teaching_records from anon;
grant select,insert,update on public.cus_teaching_records to authenticated;
revoke delete on public.cus_teaching_records from authenticated;
do $$
declare p record;
begin
 for p in select policyname from pg_policies
  where schemaname='public' and tablename='cus_teaching_records' loop
   execute format('drop policy if exists %I on public.cus_teaching_records',p.policyname);
 end loop;
end $$;
create policy tenant_records_read on public.cus_teaching_records for select to authenticated
using ((select public.erp_is_owner()) or
 (public.erp_record_tenant(booking_id,class_session_id)='astra' and
 (select public.erp_astra_access(false))));
create policy tenant_records_insert on public.cus_teaching_records for insert to authenticated
with check (created_by=(select auth.uid()) and
 ((select public.erp_is_owner()) or
 (public.erp_record_tenant(booking_id,class_session_id)='astra' and
 (select public.erp_astra_access(true)))));
create policy tenant_records_update on public.cus_teaching_records for update to authenticated
using ((select public.erp_is_owner()) or
 (created_by=(select auth.uid()) and public.erp_record_tenant(booking_id,class_session_id)='astra'
 and (select public.erp_astra_access(true))))
with check ((select public.erp_is_owner()) or
 (created_by=(select auth.uid()) and public.erp_record_tenant(booking_id,class_session_id)='astra'
 and (select public.erp_astra_access(true))));

-- Supersede old security-definer Astra booking APIs. Never cross-read CuS.
create or replace function public.erp_can_astra_teaching()
returns boolean language sql stable security invoker set search_path=public as $$
 select public.erp_astra_access(false);
$$;
create or replace function public.astra_booking_matches(p_booking_id uuid,p_student_id uuid)
returns boolean language sql stable security invoker set search_path=public as $$
 select public.erp_astra_access(false) and exists(
 select 1 from public.bookings b join public.students s on s.id=b.student_id
 where b.id=p_booking_id and b.student_id=p_student_id
  and b.business_unit_id='astra' and s.business_unit_id='astra'
 );
$$;
create or replace function public.astra_lesson_options(
 p_start timestamptz,p_end timestamptz
) returns table(
 booking_id uuid,student_id uuid,student_name text,student_code text,
 starts_at timestamptz,subject text,teacher text
) language plpgsql stable security invoker set search_path=public as $$
begin
 if not public.erp_astra_access(false) then raise exception 'Not authorised';end if;
 if p_start is null or p_end is null or p_end<=p_start
 or p_end-p_start>interval '370 days' then raise exception 'Bad date range';end if;
 return query select b.id,b.student_id,s.name::text,s.student_code::text,
 b.start_time,b.subject::text,b.teacher::text
 from public.bookings b join public.students s on s.id=b.student_id
 where b.business_unit_id='astra' and s.business_unit_id='astra'
 and b.start_time>=p_start and b.start_time<=p_end
 and b.status<>'cancelled' order by b.start_time desc limit 350;
end $$;
create or replace function public.astra_lesson_identity(p_booking_id uuid)
returns table(booking_id uuid,student_id uuid)
language plpgsql stable security invoker set search_path=public as $$
begin
 if not public.erp_astra_access(false) then raise exception 'Not authorised';end if;
 return query select b.id,b.student_id from public.bookings b
 where b.id=p_booking_id and b.business_unit_id='astra' limit 1;
end $$;

-- Existing care records now belong to Astra's operation. Preserve signatures and audit.
create or replace function public.erp_can_care_read()
returns boolean language sql stable security invoker set search_path=public as $$
 select public.erp_astra_access(false);
$$;
create or replace function public.erp_can_care_write()
returns boolean language sql stable security invoker set search_path=public as $$
 select public.erp_astra_access(true);
$$;
create or replace function public.erp_can_care_manage()
returns boolean language sql stable security invoker set search_path=public as $$
 select public.erp_is_owner() or exists(
  select 1 from public.erp_memberships
  where user_id=(select auth.uid()) and business_unit_id='astra'
   and role in ('owner','admin'));
$$;

alter table public.cus_staff drop constraint if exists cus_staff_scope_check;
alter table public.cus_staff add constraint cus_staff_scope_check
 check(scope in ('care','astra','general'));
alter table public.cus_staff enable row level security;
do $$
declare p record;
begin
 for p in select policyname from pg_policies where schemaname='public' and tablename='cus_staff' loop
   execute format('drop policy if exists %I on public.cus_staff',p.policyname);
 end loop;
end $$;
create policy astra_staff_read on public.cus_staff for select to authenticated
using ((select public.erp_is_owner()) or
 (scope in ('care','astra') and (select public.erp_astra_access(false))));
create policy astra_staff_insert on public.cus_staff for insert to authenticated
with check ((select public.erp_is_owner()) or
 (scope in ('care','astra') and (select public.erp_astra_access(true))));
create policy astra_staff_update on public.cus_staff for update to authenticated
using ((select public.erp_is_owner()) or
 (scope in ('care','astra') and (select public.erp_astra_access(true))))
with check ((select public.erp_is_owner()) or
 (scope in ('care','astra') and (select public.erp_astra_access(true))));

-- Receipt uploads use a separate Astra prefix. Care-evidence bucket retains
-- its existing safeguarding policies; no Astra user may open CuS receipts.
drop policy if exists erp_care_storage_isolation on storage.objects;
create policy erp_care_storage_isolation on storage.objects
as restrictive for all to authenticated
using ((select public.erp_is_owner()) or
 (bucket_id='cus-care-evidence' and (select public.erp_astra_access(false))) or
 (bucket_id='receipts' and name like 'astra/%' and (select public.erp_astra_access(false))))
with check ((select public.erp_is_owner()) or
 (bucket_id='cus-care-evidence' and (select public.erp_astra_access(true))) or
 (bucket_id='receipts' and name like 'astra/%' and (select public.erp_astra_access(true))));
drop policy if exists astra_receipts_insert on storage.objects;
create policy astra_receipts_insert on storage.objects for insert to authenticated
with check (bucket_id='receipts' and name like 'astra/%'
 and (select public.erp_astra_access(true)));
drop policy if exists astra_receipts_read on storage.objects;
create policy astra_receipts_read on storage.objects for select to authenticated
using (bucket_id='receipts' and name like 'astra/%'
 and (select public.erp_astra_access(false)));

commit;

-- VERIFY IN SQL EDITOR, separately:
-- select business_unit_id,count(*) from public.students group by 1;
-- select business_unit_id,count(*) from public.bookings group by 1;
-- select business_unit_id,count(*) from public.transactions group by 1;
-- select u.email,m.business_unit_id,m.role from public.erp_memberships m
-- join auth.users u on u.id=m.user_id order by u.email,m.business_unit_id;
-- Review unlinked CuS transactions with historical Astra meaning before recoding.
