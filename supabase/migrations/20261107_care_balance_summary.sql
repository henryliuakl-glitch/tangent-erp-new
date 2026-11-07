-- Fast balances without downloading years of attendance or finance data.
create or replace function public.cus_care_balances()
returns table (
 student_id uuid, purchased_days bigint, used_days bigint,
 reserved_days bigint, remaining_days bigint
) language sql stable security invoker set search_path=public as $$
 select c.id,
   coalesce(cr.total,0) as purchased_days,
   coalesce(v.used,0) as used_days,
   coalesce(v.reserved,0) as reserved_days,
   coalesce(cr.total,0) - coalesce(v.used,0) as remaining_days
 from public.cus_care_children c
 left join (
   select student_id,sum(days)::bigint as total
   from public.cus_care_day_credits group by student_id
 ) cr on cr.student_id=c.id
 left join (
   select student_id,
     count(*) filter(where status in ('in_care','released'))::bigint as used,
     count(*) filter(where status='scheduled')::bigint as reserved
   from public.cus_care_visits group by student_id
 ) v on v.student_id=c.id
 where public.erp_can_care_read()
$$;
revoke all on function public.cus_care_balances() from public,anon;
grant execute on function public.cus_care_balances() to authenticated;
