-- Tangent ERP dashboard performance architecture
-- Safe to run repeatedly in the Tangent production Supabase SQL editor.

-- 1) Hot-path indexes ---------------------------------------------------------

create index if not exists bookings_dashboard_scope_start_idx
  on public.bookings (business_unit_id, start_time)
  include (status, student_id, duration, actual_rate);

create index if not exists bookings_dashboard_confirmed_idx
  on public.bookings (business_unit_id, start_time)
  include (student_id, duration, actual_rate)
  where status = 'confirmed';

create index if not exists bookings_dashboard_completed_idx
  on public.bookings (business_unit_id, start_time)
  include (student_id, duration, actual_rate)
  where status = 'completed';

create index if not exists transactions_dashboard_period_idx
  on public.transactions (business_unit_id, transaction_date)
  include (type, currency, amount);

create index if not exists students_dashboard_scope_idx
  on public.students (business_unit_id, payment_type, balance)
  include (hourly_rate, currency, name);

-- 2) One-row dashboard KPI aggregate -----------------------------------------
-- Tangent means CuS + Sine; otherwise scope to the requested business unit.
-- This function is SECURITY INVOKER, so normal RLS still applies.

create or replace function public.get_dashboard_kpis(
  p_business_id text,
  p_start_date date,
  p_next_date date,
  p_start_ts timestamptz,
  p_end_ts timestamptz
)
returns table (
  cash_income_nzd numeric,
  cash_expense_nzd numeric,
  cash_income_rmb numeric,
  cash_expense_rmb numeric,
  realized_nzd numeric,
  realized_rmb numeric,
  unearned_nzd numeric,
  unearned_rmb numeric
)
language sql
stable
security invoker
set search_path = public
as $$
  with tx as (
    select
      coalesce(sum(amount) filter (
        where type = 'income'
          and upper(coalesce(currency, 'NZD')) <> 'RMB'
      ), 0) as cash_income_nzd,
      coalesce(sum(abs(amount)) filter (
        where type = 'expense'
          and upper(coalesce(currency, 'NZD')) <> 'RMB'
      ), 0) as cash_expense_nzd,
      coalesce(sum(amount) filter (
        where type = 'income'
          and upper(coalesce(currency, 'NZD')) = 'RMB'
      ), 0) as cash_income_rmb,
      coalesce(sum(abs(amount)) filter (
        where type = 'expense'
          and upper(coalesce(currency, 'NZD')) = 'RMB'
      ), 0) as cash_expense_rmb
    from public.transactions t
    where t.transaction_date >= p_start_date
      and t.transaction_date < p_next_date
      and (
        p_business_id = 'tangent'
        and t.business_unit_id in ('cus', 'sine')
        or t.business_unit_id = p_business_id
      )
  ),
  realized as (
    select
      coalesce(sum(
        b.duration * coalesce(b.actual_rate, s.hourly_rate, 70)
      ) filter (
        where upper(coalesce(s.currency, 'NZD')) <> 'RMB'
      ), 0) as realized_nzd,
      coalesce(sum(
        b.duration * coalesce(b.actual_rate, s.hourly_rate, 70)
      ) filter (
        where upper(coalesce(s.currency, 'NZD')) = 'RMB'
      ), 0) as realized_rmb
    from public.bookings b
    left join public.students s on s.id = b.student_id
    where b.status = 'completed'
      and b.start_time >= p_start_ts
      and b.start_time <= p_end_ts
      and (
        p_business_id = 'tangent'
        and b.business_unit_id in ('cus', 'sine')
        or b.business_unit_id = p_business_id
      )
  ),
  unearned as (
    select
      coalesce(sum(
        greatest(coalesce(s.balance, 0), 0) * coalesce(s.hourly_rate, 0)
      ) filter (
        where coalesce(s.payment_type, 'monthly') <> 'single'
          and upper(coalesce(s.currency, 'NZD')) <> 'RMB'
      ), 0) as unearned_nzd,
      coalesce(sum(
        greatest(coalesce(s.balance, 0), 0) * coalesce(s.hourly_rate, 0)
      ) filter (
        where coalesce(s.payment_type, 'monthly') <> 'single'
          and upper(coalesce(s.currency, 'NZD')) = 'RMB'
      ), 0) as unearned_rmb
    from public.students s
    where (
      p_business_id = 'tangent'
      and s.business_unit_id in ('cus', 'sine')
      or s.business_unit_id = p_business_id
    )
  )
  select
    tx.cash_income_nzd,
    tx.cash_expense_nzd,
    tx.cash_income_rmb,
    tx.cash_expense_rmb,
    realized.realized_nzd,
    realized.realized_rmb,
    unearned.unearned_nzd,
    unearned.unearned_rmb
  from tx
  cross join realized
  cross join unearned;
$$;

comment on function public.get_dashboard_kpis(text,date,date,timestamptz,timestamptz)
  is 'Fast one-row KPI aggregate for Tangent ERP dashboard.';
