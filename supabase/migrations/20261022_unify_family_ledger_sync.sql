-- Canonical ledger architecture (2026-10-22)
-- Business transactions are mirrored to Family by the application layer in
-- lib/transaction-write.ts. Disable the legacy database trigger so there is
-- only one writer and no ON CONFLICT/index-version coupling.

drop trigger if exists trg_sync_business_income_to_family on public.transactions;
drop function if exists public.sync_business_income_to_family();

-- Keep source_transaction_id unique for idempotent Family mirrors.
drop index if exists public.family_transactions_source_transaction_uidx;
create unique index family_transactions_source_transaction_uidx
  on public.family_transactions(source_transaction_id);
