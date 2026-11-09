-- Astra financial transactions are manager-only; teachers still see lesson bookings.
begin;
drop policy if exists tenant_select on public.transactions;
create policy tenant_select on public.transactions
 for select to authenticated
 using ((select public.erp_is_owner()) or
        (business_unit_id='astra' and (select public.erp_astra_access(true))));
commit;
