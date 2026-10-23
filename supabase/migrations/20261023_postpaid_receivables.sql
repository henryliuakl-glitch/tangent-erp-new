-- Add postpaid receivables to dashboard KPI.
-- Safe for an existing Tangent production database that already ran
-- 20261023_dashboard_performance.sql.

create index if not exists students_postpaid_receivable_idx
  on public.students (business_unit_id, balance)
  include (hourly_rate, currency)
  where payment_type = 'postpaid' and balance < 0;

drop function if exists public.get_dashboard_kpis(
  text, date, date, timestamptz, timestamptz
);

create function public.get_dashboard_kpis(
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
  unearned_rmb numeric,
  receivable_nzd numeric,
  receivable_rmb numeric
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
        (p_business_id = 'tangent' and t.business_unit_id in ('cus', 'sine'))
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
        (p_business_id = 'tangent' and b.business_unit_id in ('cus', 'sine'))
        or b.business_unit_id = p_business_id
      )
  ),
  balances as (
    select
      coalesce(sum(
        greatest(coalesce(s.balance, 0), 0) * coalesce(s.hourly_rate, 0)
      ) filter (
        where coalesce(s.payment_type, 'monthly') not in ('single', 'postpaid')
          and upper(coalesce(s.currency, 'NZD')) <> 'RMB'
      ), 0) as unearned_nzd,
      coalesce(sum(
        greatest(coalesce(s.balance, 0), 0) * coalesce(s.hourly_rate, 0)
      ) filter (
        where coalesce(s.payment_type, 'monthly') not in ('single', 'postpaid')
          and upper(coalesce(s.currency, 'NZD')) = 'RMB'
      ), 0) as unearned_rmb,
      coalesce(sum(
        abs(least(coalesce(s.balance, 0), 0)) * coalesce(s.hourly_rate, 0)
      ) filter (
        where s.payment_type = 'postpaid'
          and s.balance < 0
          and upper(coalesce(s.currency, 'NZD')) <> 'RMB'
      ), 0) as receivable_nzd,
      coalesce(sum(
        abs(least(coalesce(s.balance, 0), 0)) * coalesce(s.hourly_rate, 0)
      ) filter (
        where s.payment_type = 'postpaid'
          and s.balance < 0
          and upper(coalesce(s.currency, 'NZD')) = 'RMB'
      ), 0) as receivable_rmb
    from public.students s
    where (
      (p_business_id = 'tangent' and s.business_unit_id in ('cus', 'sine'))
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
    balances.unearned_nzd,
    balances.unearned_rmb,
    balances.receivable_nzd,
    balances.receivable_rmb
  from tx
  cross join realized
  cross join balances;
$$;

comment on function public.get_dashboard_kpis(text,date,date,timestamptz,timestamptz)
  is 'Dashboard KPI aggregate including deferred revenue and postpaid receivables.';
