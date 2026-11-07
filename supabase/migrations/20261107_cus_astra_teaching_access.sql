-- CuS/Astra teaching record separation.
-- Requires 20261107_cus_teaching_records.sql and care access migration.
-- CuS student codes beginning "1" remain private to ERP owners.
-- Astra: non-empty student code NOT beginning "1", in CuS booking ledger.
-- Uncoded students remain owner-only until classified.
-- Children's care profiles and pickup records are NOT exposed by this migration.

create or replace function public.erp_can_astra_teaching()
returns boolean language sql stable security invoker set search_path=public as $$
  select exists (
    select 1 from public.erp_memberships m
    where m.user_id=(select auth.uid()) and (
       (m.business_unit_id='cus' and m.role in ('owner','admin','teacher'))
       or (m.business_unit_id in ('care','astra') and m.role in ('owner','admin','teacher'))
    )
  );
$$;
revoke all on function public.erp_can_astra_teaching() from public,anon;
grant execute on function public.erp_can_astra_teaching() to authenticated;

-- This helper reads private bookings *without* returning raw booking/student rows.
-- It checks both scope and the authenticated caller's Astra membership.
create or replace function public.astra_booking_matches(
 p_booking_id uuid,p_student_id uuid
) returns boolean language sql stable security definer set search_path='' as $$
  select public.erp_can_astra_teaching()
   and exists (
    select 1 from public.bookings b
    join public.students s on s.id=b.student_id
    where b.id=p_booking_id and b.student_id=p_student_id
      and b.business_unit_id='cus' and s.business_unit_id='cus'
      and nullif(btrim(s.student_code),'') is not null
      and btrim(s.student_code) not like '1%'
   );
$$;
revoke all on function public.astra_booking_matches(uuid,uuid) from public,anon;
grant execute on function public.astra_booking_matches(uuid,uuid) to authenticated;

-- A narrowly scoped booking selector for teachers who are intentionally
-- blocked from directly reading the private students/bookings tables.
create or replace function public.astra_lesson_options(
 p_start timestamptz,p_end timestamptz
) returns table (
 booking_id uuid,student_id uuid,student_name text,student_code text,
 starts_at timestamptz,subject text,teacher text
) language plpgsql stable security definer set search_path='' as $$
begin
 if not public.erp_can_astra_teaching() then
   raise exception 'Not authorised for Astra records' using errcode='42501';
 end if;
 if p_start is null or p_end is null or p_end<=p_start
   or p_end-p_start>interval '370 days' then
   raise exception 'Invalid lesson date range' using errcode='22023';
 end if;
 return query
 select b.id,b.student_id,s.name::text,s.student_code::text,
   b.start_time,b.subject::text,b.teacher::text
 from public.bookings b
 join public.students s on s.id=b.student_id
 where b.business_unit_id='cus' and s.business_unit_id='cus'
   and nullif(btrim(s.student_code),'') is not null
   and btrim(s.student_code) not like '1%'
   and b.start_time>=p_start and b.start_time<=p_end
   and b.status<>'cancelled'
 order by b.start_time desc limit 250;
end $$;
revoke all on function public.astra_lesson_options(timestamptz,timestamptz) from public,anon;
grant execute on function public.astra_lesson_options(timestamptz,timestamptz) to authenticated;

create or replace function public.astra_lesson_identity(p_booking_id uuid)
returns table (booking_id uuid,student_id uuid)
language plpgsql stable security definer set search_path='' as $$
begin
 if not public.erp_can_astra_teaching() then
   raise exception 'Not authorised for Astra records' using errcode='42501';
 end if;
 return query
 select b.id,b.student_id
 from public.bookings b join public.students s on s.id=b.student_id
 where b.id=p_booking_id and b.business_unit_id='cus' and s.business_unit_id='cus'
   and nullif(btrim(s.student_code),'') is not null
   and btrim(s.student_code) not like '1%'
 limit 1;
end $$;
revoke all on function public.astra_lesson_identity(uuid) from public,anon;
grant execute on function public.astra_lesson_identity(uuid) to authenticated;

-- The care migration added an owner-only restrictive policy for all ordinary
-- business tables. The teaching notes table is the ONE scoped exception.
alter table public.cus_teaching_records enable row level security;
drop policy if exists erp_care_isolation on public.cus_teaching_records;
drop policy if exists cus_teaching_records_read on public.cus_teaching_records;
drop policy if exists cus_teaching_records_insert on public.cus_teaching_records;
drop policy if exists cus_teaching_records_update on public.cus_teaching_records;
drop policy if exists erp_legacy_non_care on public.cus_teaching_records;
drop policy if exists cus_teaching_scope_select on public.cus_teaching_records;
drop policy if exists cus_teaching_scope_insert on public.cus_teaching_records;
drop policy if exists cus_teaching_scope_update on public.cus_teaching_records;

create policy cus_teaching_scope_select on public.cus_teaching_records
for select to authenticated using (
  ((select public.erp_is_owner()) and
    public.cus_teaching_record_scope(booking_id,class_session_id,student_id))
  or (class_session_id is null and
    public.astra_booking_matches(booking_id,student_id))
);
create policy cus_teaching_scope_insert on public.cus_teaching_records
for insert to authenticated with check (
  created_by=(select auth.uid()) and (
    ((select public.erp_is_owner()) and
      public.cus_teaching_record_scope(booking_id,class_session_id,student_id))
    or (class_session_id is null and
      public.astra_booking_matches(booking_id,student_id))
  )
);
create policy cus_teaching_scope_update on public.cus_teaching_records
for update to authenticated
using (
 ((select public.erp_is_owner()) and
   public.cus_teaching_record_scope(booking_id,class_session_id,student_id))
 or (class_session_id is null and created_by=(select auth.uid()) and
   public.astra_booking_matches(booking_id,student_id))
)
with check (
 ((select public.erp_is_owner()) and
   public.cus_teaching_record_scope(booking_id,class_session_id,student_id))
 or (class_session_id is null and created_by=(select auth.uid()) and
   public.astra_booking_matches(booking_id,student_id))
);
grant select,insert,update on public.cus_teaching_records to authenticated;
revoke delete on public.cus_teaching_records from authenticated;

-- Existing CuS booking/student RLS stays owner-only. Nothing is granted on
-- private balances, payments, custody records or general ERP student profiles.
