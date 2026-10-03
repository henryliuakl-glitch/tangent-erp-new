alter table if exists public.students
  add column if not exists income_source text;

alter table if exists public.transactions
  add column if not exists income_source text;

create index if not exists transactions_income_source_idx
  on public.transactions (income_source);

comment on column public.students.income_source is
  'Default income source/payment destination for this student, mainly used by tutoring.';

comment on column public.transactions.income_source is
  'Actual income source/payment destination for this transaction.';
