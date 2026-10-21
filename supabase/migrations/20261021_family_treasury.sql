-- Family treasury layer above Tangent.
-- Run on Tangent ERP production Supabase.

create table if not exists public.family_accounts (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  owner text not null default 'Family',
  account_type text not null default 'bank',
  currency text not null default 'NZD' check (currency in ('NZD','RMB')),
  balance numeric(14,2) not null default 0,
  include_in_net_worth boolean not null default true,
  is_business_account boolean not null default false,
  institution text,
  notes text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists family_accounts_currency_idx
  on public.family_accounts (currency, include_in_net_worth);

create table if not exists public.family_transactions (
  id uuid primary key default gen_random_uuid(),
  transaction_date date not null default current_date,
  type text not null check (type in ('income','expense','transfer','adjustment')),
  amount numeric(14,2) not null check (amount >= 0),
  currency text not null default 'NZD' check (currency in ('NZD','RMB')),
  category text,
  description text,
  account_id uuid references public.family_accounts(id) on delete set null,
  transfer_account_id uuid references public.family_accounts(id) on delete set null,
  source_business_unit_id text,
  created_at timestamptz not null default now()
);

create index if not exists family_transactions_date_idx
  on public.family_transactions (transaction_date desc);

create index if not exists family_transactions_account_idx
  on public.family_transactions (account_id);

create table if not exists public.family_recurring_cashflows (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  type text not null check (type in ('income','expense')),
  amount numeric(14,2) not null check (amount >= 0),
  currency text not null default 'NZD' check (currency in ('NZD','RMB')),
  frequency text not null default 'monthly' check (frequency in ('weekly','fortnightly','monthly','yearly')),
  active boolean not null default true,
  category text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.family_accounts is
  'Family treasury accounts. Balances stay in original currency and may include personal, joint, cash and business bank accounts.';
comment on table public.family_transactions is
  'Internal household cashflow ledger. Transfers move money between accounts and must not count as household income or expense.';
comment on table public.family_recurring_cashflows is
  'Expected recurring household cashflows used for savings forecasts.';
