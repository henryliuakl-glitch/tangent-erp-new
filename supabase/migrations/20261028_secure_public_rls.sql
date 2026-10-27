-- Secure every application-owned table in the exposed public schema.
-- Tangent ERP is an internal collaborative app: authenticated ERP users may
-- access all ERP rows, while anonymous Data API access is denied.
--
-- Public student registration and ICS feeds use the server-only service role
-- and therefore continue to work after RLS is enabled.

do $$
declare
  r record;
begin
  for r in
    select n.nspname as schema_name, c.relname as table_name
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind in ('r', 'p')
      and not exists (
        select 1
        from pg_depend d
        join pg_extension e on e.oid = d.refobjid
        where d.classid = 'pg_class'::regclass
          and d.objid = c.oid
          and d.deptype = 'e'
      )
  loop
    execute format('alter table %I.%I enable row level security', r.schema_name, r.table_name);

    -- Anonymous users must not be able to reach internal ERP tables.
    execute format('revoke all privileges on table %I.%I from anon', r.schema_name, r.table_name);

    -- The ERP is collaborative: every signed-in ERP account can work across
    -- CuS / Sine / Tangent / Family. RLS still blocks unauthenticated access.
    execute format(
      'grant select, insert, update, delete on table %I.%I to authenticated',
      r.schema_name,
      r.table_name
    );

    execute format(
      'drop policy if exists erp_authenticated_select on %I.%I',
      r.schema_name,
      r.table_name
    );
    execute format(
      'drop policy if exists erp_authenticated_insert on %I.%I',
      r.schema_name,
      r.table_name
    );
    execute format(
      'drop policy if exists erp_authenticated_update on %I.%I',
      r.schema_name,
      r.table_name
    );
    execute format(
      'drop policy if exists erp_authenticated_delete on %I.%I',
      r.schema_name,
      r.table_name
    );

    execute format(
      'create policy erp_authenticated_select on %I.%I for select to authenticated using ((select auth.uid()) is not null)',
      r.schema_name,
      r.table_name
    );
    execute format(
      'create policy erp_authenticated_insert on %I.%I for insert to authenticated with check ((select auth.uid()) is not null)',
      r.schema_name,
      r.table_name
    );
    execute format(
      'create policy erp_authenticated_update on %I.%I for update to authenticated using ((select auth.uid()) is not null) with check ((select auth.uid()) is not null)',
      r.schema_name,
      r.table_name
    );
    execute format(
      'create policy erp_authenticated_delete on %I.%I for delete to authenticated using ((select auth.uid()) is not null)',
      r.schema_name,
      r.table_name
    );
  end loop;
end
$$;

-- If any application table uses an identity/serial sequence, anonymous callers
-- should not be able to use it. Authenticated ERP users retain sequence access.
do $$
declare
  r record;
begin
  for r in
    select n.nspname as schema_name, c.relname as sequence_name
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind = 'S'
      and not exists (
        select 1
        from pg_depend d
        join pg_extension e on e.oid = d.refobjid
        where d.classid = 'pg_class'::regclass
          and d.objid = c.oid
          and d.deptype = 'e'
      )
  loop
    execute format('revoke all privileges on sequence %I.%I from anon', r.schema_name, r.sequence_name);
    execute format('grant usage, select on sequence %I.%I to authenticated', r.schema_name, r.sequence_name);
  end loop;
end
$$;

-- Prevent future tables created by the postgres owner from automatically
-- inheriting anonymous table privileges in public.
alter default privileges for role postgres in schema public
  revoke all on tables from anon;

alter default privileges for role postgres in schema public
  revoke all on sequences from anon;
