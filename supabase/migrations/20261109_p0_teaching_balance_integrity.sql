-- P0: scoped Astra teaching writes + reliable credit-booking settlement
-- No student/booking/transaction data is deleted by this migration.
-- Apply together with the verified frontend release.
begin;

-- A half-hour must not be rounded into a whole hour during a debit/credit.
alter table public.students alter column balance type numeric(12,2)
 using coalesce(balance,0)::numeric(12,2);

-- Historical duplicates must be resolved before introducing this invariant.
do $$
begin
 if exists (
   select 1 from public.students
   where nullif(btrim(student_code),'') is not null
   group by business_unit_id, btrim(student_code) having count(*)>1
 ) then
   raise exception 'Duplicate student codes exist: resolve them before this migration';
 end if;
end;
$$;
create unique index if not exists students_unique_entity_code
 on public.students (business_unit_id, btrim(student_code))
 where nullif(btrim(student_code),'') is not null;

-- Teachers can write Astra classroom evidence, not students, bookings, cash
-- transactions, class definitions, or teacher records on someone else's behalf.
create or replace function public.erp_astra_teacher()
returns boolean language sql stable security invoker set search_path=public,pg_temp as $$
  select exists(select 1 from public.erp_memberships m
    where m.user_id=(select auth.uid()) and m.business_unit_id='astra'
      and m.role='teacher');
$$;
revoke all on function public.erp_astra_teacher() from public,anon;
grant execute on function public.erp_astra_teacher() to authenticated;

drop policy if exists tenant_records_insert on public.cus_teaching_records;
create policy tenant_records_insert on public.cus_teaching_records
 for insert to authenticated
 with check (created_by=(select auth.uid()) and
   ((select public.erp_is_owner()) or
    (public.erp_record_tenant(booking_id,class_session_id)='astra' and
      ((select public.erp_astra_access(true)) or (select public.erp_astra_teacher())))));
drop policy if exists tenant_records_update on public.cus_teaching_records;
create policy tenant_records_update on public.cus_teaching_records
 for update to authenticated
 using (
  (select public.erp_is_owner()) or
  (public.erp_record_tenant(booking_id,class_session_id)='astra' and
   ((select public.erp_astra_access(true)) or
    (created_by=(select auth.uid()) and (select public.erp_astra_teacher()))))
 )
 with check (
  (select public.erp_is_owner()) or
  (public.erp_record_tenant(booking_id,class_session_id)='astra' and
   ((select public.erp_astra_access(true)) or
    (created_by=(select auth.uid()) and (select public.erp_astra_teacher()))))
 );

drop policy if exists tenant_insert on public.cus_attendance;
create policy tenant_insert on public.cus_attendance for insert to authenticated
 with check ((select public.erp_is_owner()) or
  (public.erp_session_tenant(session_id)='astra' and
   ((select public.erp_astra_access(true)) or (select public.erp_astra_teacher()))));
drop policy if exists tenant_update on public.cus_attendance;
create policy tenant_update on public.cus_attendance for update to authenticated
 using ((select public.erp_is_owner()) or
  (public.erp_session_tenant(session_id)='astra' and
   ((select public.erp_astra_access(true)) or (select public.erp_astra_teacher()))))
 with check ((select public.erp_is_owner()) or
  (public.erp_session_tenant(session_id)='astra' and
   ((select public.erp_astra_access(true)) or (select public.erp_astra_teacher()))));
-- Deliberately do not grant DELETE on attendance to ordinary teachers.

-- All 1:1 CREDIT-based course completion happens in one database transaction:
-- lock course, check entity and student, change status/metadata and debit balance.
create or replace function public.erp_complete_credit_booking(p_booking_id uuid)
returns boolean language plpgsql security invoker set search_path=public,pg_temp as $$
declare b public.bookings%rowtype; s public.students%rowtype;
        settlement text;
begin
 select * into b from public.bookings where id=p_booking_id for update;
 if not found then raise exception 'Booking not found or access denied'; end if;
 if not (public.erp_is_owner() or
   (b.business_unit_id='astra' and public.erp_astra_access(true))) then
   raise exception 'Not authorised to settle course';
 end if;
 if b.status='completed' then return false; end if;
 if b.status<>'confirmed' then raise exception 'Only confirmed bookings can be completed'; end if;
 select * into s from public.students where id=b.student_id for update;
 if not found or s.business_unit_id<>b.business_unit_id then
   raise exception 'Student and booking entity mismatch';
 end if;
 if b.duration is null or b.duration<=0 then raise exception 'Invalid lesson duration'; end if;
 if s.payment_type::text='single' then
   raise exception 'Pay-as-you-go bookings must use cash settlement';
 end if;
 settlement:=case when s.payment_type::text='postpaid' then 'postpaid' else 'prepaid' end;
 update public.bookings set status='completed',
   metadata=coalesce(b.metadata,'{}'::jsonb)||jsonb_build_object('settlementMode',settlement)
 where id=b.id and status='confirmed';
 update public.students set balance=round((coalesce(balance,0)-b.duration)::numeric,2)
 where id=s.id;
 return true;
end;
$$;
revoke all on function public.erp_complete_credit_booking(uuid) from public,anon;
grant execute on function public.erp_complete_credit_booking(uuid) to authenticated;

create or replace function public.erp_cancel_credit_booking(p_booking_id uuid)
returns boolean language plpgsql security invoker set search_path=public,pg_temp as $$
declare b public.bookings%rowtype; s public.students%rowtype;
begin
 select * into b from public.bookings where id=p_booking_id for update;
 if not found then raise exception 'Booking not found or access denied'; end if;
 if not (public.erp_is_owner() or
   (b.business_unit_id='astra' and public.erp_astra_access(true))) then
   raise exception 'Not authorised to cancel course';
 end if;
 if b.status='cancelled' then return false; end if;
 if b.status<>'completed' then raise exception 'Only completed bookings can be reversed'; end if;
 select * into s from public.students where id=b.student_id for update;
 if not found or s.business_unit_id<>b.business_unit_id then
   raise exception 'Student and booking entity mismatch';
 end if;
 if coalesce(b.metadata->>'settlementMode','')='single' or
   (not (b.metadata?'settlementMode') and s.payment_type::text='single') then
   raise exception 'Pay-as-you-go cancellations require cash reversal';
 end if;
 update public.bookings set status='cancelled' where id=b.id;
 update public.students set balance=round((coalesce(balance,0)+b.duration)::numeric,2)
 where id=s.id;
 return true;
end;
$$;
revoke all on function public.erp_cancel_credit_booking(uuid) from public,anon;
grant execute on function public.erp_cancel_credit_booking(uuid) to authenticated;

create or replace function public.erp_delete_credit_booking(p_booking_id uuid)
returns boolean language plpgsql security invoker set search_path=public,pg_temp as $$
declare b public.bookings%rowtype; s public.students%rowtype;
begin
 select * into b from public.bookings where id=p_booking_id for update;
 if not found then raise exception 'Booking not found or access denied'; end if;
 if not (public.erp_is_owner() or
   (b.business_unit_id='astra' and public.erp_astra_access(true))) then
   raise exception 'Not authorised to delete course';
 end if;
 if b.status<>'completed' then raise exception 'Only completed bookings accepted'; end if;
 select * into s from public.students where id=b.student_id for update;
 if not found or s.business_unit_id<>b.business_unit_id then
   raise exception 'Student and booking entity mismatch';
 end if;
 if coalesce(b.metadata->>'settlementMode','')='single' or
   (not (b.metadata?'settlementMode') and s.payment_type::text='single') then
   raise exception 'Pay-as-you-go deletion requires cash reversal';
 end if;
 -- FK RESTRICT or other failure rolls back both deletion and balance credit.
 delete from public.bookings where id=b.id;
 update public.students set balance=round((coalesce(balance,0)+b.duration)::numeric,2)
 where id=s.id;
 return true;
end;
$$;
revoke all on function public.erp_delete_credit_booking(uuid) from public,anon;
grant execute on function public.erp_delete_credit_booking(uuid) to authenticated;
commit;
