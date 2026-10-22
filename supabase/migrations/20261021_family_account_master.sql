-- Family account master integration across CuS / Sine / Tangent.
-- Run after 20261021_family_treasury.sql.

alter table public.family_accounts
  add column if not exists active_for_payments boolean not null default true;

alter table public.transactions
  add column if not exists family_account_id uuid
    references public.family_accounts(id) on delete set null;

alter table public.students
  add column if not exists family_account_id uuid
    references public.family_accounts(id) on delete set null;

alter table public.family_transactions
  add column if not exists source_transaction_id uuid;

-- PostgreSQL UNIQUE indexes already allow multiple NULL values.
-- Keep this index non-partial so ON CONFLICT (source_transaction_id)
-- can infer it inside sync_business_income_to_family().
drop index if exists public.family_transactions_source_transaction_uidx;
create unique index family_transactions_source_transaction_uidx
  on public.family_transactions(source_transaction_id);

create index if not exists transactions_family_account_idx
  on public.transactions(family_account_id);

-- Business receipts update the Family account balance while preserving
-- the original business_unit_id on the business ledger.
create or replace function public.sync_business_income_to_family()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    if new.type = 'income' and new.family_account_id is not null then
      update public.family_accounts
      set balance = balance + coalesce(new.amount, 0),
          updated_at = now()
      where id = new.family_account_id;

      insert into public.family_transactions (
        transaction_date,
        type,
        amount,
        currency,
        category,
        description,
        account_id,
        source_business_unit_id,
        source_transaction_id
      ) values (
        new.transaction_date::date,
        'income',
        coalesce(new.amount, 0),
        coalesce(new.currency, 'NZD'),
        new.category,
        new.description,
        new.family_account_id,
        new.business_unit_id,
        new.id
      )
      on conflict (source_transaction_id) do nothing;
    end if;
    return new;
  end if;

  if tg_op = 'DELETE' then
    if old.type = 'income' and old.family_account_id is not null then
      update public.family_accounts
      set balance = balance - coalesce(old.amount, 0),
          updated_at = now()
      where id = old.family_account_id;

      delete from public.family_transactions
      where source_transaction_id = old.id;
    end if;
    return old;
  end if;

  if tg_op = 'UPDATE' then
    if old.type = 'income' and old.family_account_id is not null then
      update public.family_accounts
      set balance = balance - coalesce(old.amount, 0),
          updated_at = now()
      where id = old.family_account_id;

      delete from public.family_transactions
      where source_transaction_id = old.id;
    end if;

    if new.type = 'income' and new.family_account_id is not null then
      update public.family_accounts
      set balance = balance + coalesce(new.amount, 0),
          updated_at = now()
      where id = new.family_account_id;

      insert into public.family_transactions (
        transaction_date,
        type,
        amount,
        currency,
        category,
        description,
        account_id,
        source_business_unit_id,
        source_transaction_id
      ) values (
        new.transaction_date::date,
        'income',
        coalesce(new.amount, 0),
        coalesce(new.currency, 'NZD'),
        new.category,
        new.description,
        new.family_account_id,
        new.business_unit_id,
        new.id
      )
      on conflict (source_transaction_id) do update set
        transaction_date = excluded.transaction_date,
        amount = excluded.amount,
        currency = excluded.currency,
        category = excluded.category,
        description = excluded.description,
        account_id = excluded.account_id,
        source_business_unit_id = excluded.source_business_unit_id;
    end if;
    return new;
  end if;

  return null;
end;
$$;

drop trigger if exists trg_sync_business_income_to_family on public.transactions;
create trigger trg_sync_business_income_to_family
after insert or update or delete on public.transactions
for each row execute function public.sync_business_income_to_family();

comment on column public.family_accounts.active_for_payments is
  'When true, this account is available as a payment destination in CuS/Sine/Tangent.';
comment on column public.transactions.family_account_id is
  'Physical destination account from Family account master. Business classification stays on business_unit_id.';
