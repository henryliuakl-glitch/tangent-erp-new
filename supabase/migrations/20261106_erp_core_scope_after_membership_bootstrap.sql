-- Stage 2: execute ONLY AFTER setting up erp_memberships for every ERP user.
-- This migration fails closed if no owner mapping is present for each operational business.
do $$
begin
  if not exists (select 1 from public.erp_memberships where business_unit_id='cus' and role='owner')
     or not exists (select 1 from public.erp_memberships where business_unit_id='sine' and role='owner') then
    raise exception 'Seed CuS and Sine owners in erp_memberships before applying business isolation';
  end if;
end $$;

-- Existing authenticated-all policies must be removed for these three core tables.
-- The group view (tangent) is not an independent security scope: grant each unit separately.
do $$
declare t text; p record;
begin
  foreach t in array array['students','bookings','transactions'] loop
    for p in select policyname from pg_policies where schemaname='public' and tablename=t loop
      execute format('drop policy if exists %I on public.%I',p.policyname,t);
    end loop;
    execute format('alter table public.%I enable row level security',t);
    execute format('revoke all on public.%I from anon',t);
    execute format('grant select,insert,update,delete on public.%I to authenticated',t);
    execute format($q$create policy erp_scoped_read on public.%I for select to authenticated using (
      exists (select 1 from public.erp_memberships m
        where m.user_id=(select auth.uid()) and m.business_unit_id=business_unit_id)
    )$q$,t);
    execute format($q$create policy erp_scoped_insert on public.%I for insert to authenticated with check (
      exists (select 1 from public.erp_memberships m
        where m.user_id=(select auth.uid()) and m.business_unit_id=business_unit_id
          and m.role in ('owner','admin','teacher'))
    )$q$,t);
    execute format($q$create policy erp_scoped_update on public.%I for update to authenticated using (
      exists (select 1 from public.erp_memberships m
        where m.user_id=(select auth.uid()) and m.business_unit_id=business_unit_id
          and m.role in ('owner','admin','teacher'))
    ) with check (
      exists (select 1 from public.erp_memberships m
        where m.user_id=(select auth.uid()) and m.business_unit_id=business_unit_id
          and m.role in ('owner','admin','teacher'))
    )$q$,t);
    execute format($q$create policy erp_scoped_delete on public.%I for delete to authenticated using (
      exists (select 1 from public.erp_memberships m
        where m.user_id=(select auth.uid()) and m.business_unit_id=business_unit_id
          and m.role in ('owner','admin'))
    )$q$,t);
  end loop;
end $$;

-- Legacy security-definer RPCs and service-role routes require separate review.
-- This migration deliberately avoids altering Family or vehicle tables until roles
-- and service callers have been inventoried.
