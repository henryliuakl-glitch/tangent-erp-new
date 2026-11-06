-- CuS teaching management, additive migration; run on the ERP Supabase project.
-- Existing students/bookings/transactions are not modified.
create table if not exists public.erp_memberships (
  user_id uuid not null references auth.users(id) on delete cascade,
  business_unit_id text not null,
  role text not null check (role in ('owner','admin','teacher','viewer')),
  primary key (user_id, business_unit_id)
);
create table if not exists public.cus_programmes (
  id uuid primary key default gen_random_uuid(),
  business_unit_id text not null default 'cus' check (business_unit_id = 'cus'),
  title text not null,
  category text not null default 'weekend',
  description text,
  created_at timestamptz not null default now()
);
create table if not exists public.cus_classes (
  id uuid primary key default gen_random_uuid(),
  programme_id uuid not null references public.cus_programmes(id) on delete restrict,
  title text not null,
  teacher text,
  room text,
  capacity integer not null default 10 check (capacity > 0),
  start_date date,
  end_date date,
  status text not null default 'active' check (status in ('active','paused','completed')),
  created_at timestamptz not null default now()
);
create table if not exists public.cus_enrolments (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references public.cus_classes(id) on delete cascade,
  student_id uuid not null references public.students(id) on delete restrict,
  status text not null default 'active' check (status in ('active','withdrawn','completed')),
  enrolled_at timestamptz not null default now(),
  unique (class_id,student_id)
);
create table if not exists public.cus_class_sessions (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references public.cus_classes(id) on delete cascade,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  room text,
  topic text,
  notes text,
  status text not null default 'scheduled' check (status in ('scheduled','completed','cancelled')),
  check (ends_at > starts_at),
  unique (class_id, starts_at)
);
create table if not exists public.cus_attendance (
  session_id uuid not null references public.cus_class_sessions(id) on delete cascade,
  student_id uuid not null references public.students(id) on delete restrict,
  status text not null check (status in ('present','absent','late','excused')),
  checked_at timestamptz not null default now(),
  note text,
  primary key (session_id,student_id)
);
create index if not exists cus_sessions_class_start_idx on public.cus_class_sessions(class_id, starts_at);
create index if not exists cus_enrolments_student_idx on public.cus_enrolments(student_id);
create index if not exists cus_classes_programme_idx on public.cus_classes(programme_id);
-- Membership rows are provisioned by an ERP database administrator, never by browser signup.
alter table public.erp_memberships enable row level security;
revoke all on public.erp_memberships from anon;
grant select on public.erp_memberships to authenticated;
create policy erp_memberships_self on public.erp_memberships for select to authenticated
  using (user_id = (select auth.uid()));
-- An authenticated staff member must have an explicit CuS assignment.
-- The membership lookup is evaluated against the caller's own visible rows.
create or replace function public.cus_can_read() returns boolean language sql stable security invoker
set search_path = public as $$
  select exists(select 1 from public.erp_memberships
    where user_id = (select auth.uid()) and business_unit_id = 'cus');
$$;
create or replace function public.cus_can_write() returns boolean language sql stable security invoker
set search_path = public as $$
  select exists(select 1 from public.erp_memberships
    where user_id = (select auth.uid()) and business_unit_id = 'cus' and role in ('owner','admin','teacher'));
$$;
revoke all on function public.cus_can_read(), public.cus_can_write() from public, anon;
grant execute on function public.cus_can_read(), public.cus_can_write() to authenticated;
do $$
declare t text;
begin
  foreach t in array array['cus_programmes','cus_classes','cus_enrolments','cus_class_sessions','cus_attendance'] loop
    execute format('alter table public.%I enable row level security',t);
    execute format('revoke all on public.%I from anon',t);
    execute format('grant select,insert,update,delete on public.%I to authenticated',t);
    execute format('create policy cus_read on public.%I for select to authenticated using ((select public.cus_can_read()))',t);
    execute format('create policy cus_insert on public.%I for insert to authenticated with check ((select public.cus_can_write()))',t);
    execute format('create policy cus_update on public.%I for update to authenticated using ((select public.cus_can_write())) with check ((select public.cus_can_write()))',t);
    execute format('create policy cus_delete on public.%I for delete to authenticated using ((select public.cus_can_write()))',t);
  end loop;
end $$;
-- Bootstrap ONE existing ERP user in SQL editor after migration:
-- insert into public.erp_memberships(user_id,business_unit_id,role)
-- values ('<auth.users.id>', 'cus', 'owner')
-- on conflict (user_id,business_unit_id) do update set role=excluded.role;
