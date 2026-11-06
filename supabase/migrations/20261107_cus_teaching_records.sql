-- CuS teaching notes: one unified record per tutoring booking or class session.
-- Additive only: no changes to existing bookings, students, billing or care data.
-- Run on the Tangent ERP Supabase project after 20261106_cus_teaching_management.sql.
create table if not exists public.cus_teaching_records (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid references public.bookings(id) on delete restrict,
  class_session_id uuid references public.cus_class_sessions(id) on delete restrict,
  student_id uuid references public.students(id) on delete restrict,
  teacher text,
  lesson_content text not null check (length(btrim(lesson_content)) between 1 and 8000),
  homework text,
  student_feedback text,
  next_steps text,
  created_by uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint cus_teaching_one_source check (
    (booking_id is not null and class_session_id is null and student_id is not null)
    or
    (booking_id is null and class_session_id is not null and student_id is null)
  )
);
create unique index if not exists cus_teaching_booking_once_idx
  on public.cus_teaching_records(booking_id) where booking_id is not null;
create unique index if not exists cus_teaching_class_session_once_idx
  on public.cus_teaching_records(class_session_id) where class_session_id is not null;
create index if not exists cus_teaching_created_idx
  on public.cus_teaching_records(created_at desc);
create index if not exists cus_teaching_student_idx
  on public.cus_teaching_records(student_id, created_at desc);

-- Only records linked to a CuS booking/student or a CuS programme are visible.
create or replace function public.cus_teaching_record_scope(
  p_booking_id uuid, p_session_id uuid, p_student_id uuid
) returns boolean language sql stable security invoker set search_path=public as $$
  select
    (p_booking_id is not null and p_session_id is null and p_student_id is not null
      and exists (
        select 1 from public.bookings b
        join public.students s on s.id = b.student_id
        where b.id = p_booking_id and b.business_unit_id = 'cus'
          and s.business_unit_id = 'cus' and b.student_id = p_student_id
      ))
    or
    (p_session_id is not null and p_booking_id is null and p_student_id is null
      and exists (
        select 1 from public.cus_class_sessions cs
        join public.cus_classes c on c.id = cs.class_id
        join public.cus_programmes p on p.id = c.programme_id
        where cs.id = p_session_id and p.business_unit_id = 'cus'
      ));
$$;
revoke all on function public.cus_teaching_record_scope(uuid,uuid,uuid) from public,anon;
grant execute on function public.cus_teaching_record_scope(uuid,uuid,uuid) to authenticated;

alter table public.cus_teaching_records enable row level security;
revoke all on public.cus_teaching_records from anon;
grant select, insert, update on public.cus_teaching_records to authenticated;
revoke delete on public.cus_teaching_records from authenticated;

drop policy if exists cus_teaching_records_read on public.cus_teaching_records;
create policy cus_teaching_records_read on public.cus_teaching_records for select to authenticated
  using ((select public.cus_can_read()) and
    public.cus_teaching_record_scope(booking_id,class_session_id,student_id));

drop policy if exists cus_teaching_records_insert on public.cus_teaching_records;
create policy cus_teaching_records_insert on public.cus_teaching_records for insert to authenticated
  with check ((select public.cus_can_write()) and created_by = (select auth.uid())
    and public.cus_teaching_record_scope(booking_id,class_session_id,student_id));

drop policy if exists cus_teaching_records_update on public.cus_teaching_records;
create policy cus_teaching_records_update on public.cus_teaching_records for update to authenticated
  using ((select public.cus_can_write()) and
    public.cus_teaching_record_scope(booking_id,class_session_id,student_id))
  with check ((select public.cus_can_write()) and
    public.cus_teaching_record_scope(booking_id,class_session_id,student_id));

-- Prevent an update from silently moving a note to another student/lesson or writer.
create or replace function public.cus_teaching_record_immutable_keys()
returns trigger language plpgsql security invoker set search_path=public as $$
begin
  if new.id is distinct from old.id
    or new.booking_id is distinct from old.booking_id
    or new.class_session_id is distinct from old.class_session_id
    or new.student_id is distinct from old.student_id
    or new.created_by is distinct from old.created_by
    or new.created_at is distinct from old.created_at then
    raise exception 'Teaching record ownership and lesson references cannot be changed';
  end if;
  new.updated_at = now();
  return new;
end $$;
drop trigger if exists cus_teaching_record_protect on public.cus_teaching_records;
create trigger cus_teaching_record_protect before update on public.cus_teaching_records
  for each row execute function public.cus_teaching_record_immutable_keys();
