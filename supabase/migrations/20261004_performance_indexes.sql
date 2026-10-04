-- Performance indexes for Tangent ERP hot paths.
-- Safe to run repeatedly.

create index if not exists bookings_business_status_start_idx
  on public.bookings (business_unit_id, status, start_time);

create index if not exists bookings_student_status_start_idx
  on public.bookings (student_id, status, start_time);

create index if not exists bookings_business_start_idx
  on public.bookings (business_unit_id, start_time);

create index if not exists transactions_business_date_idx
  on public.transactions (business_unit_id, transaction_date desc);

create index if not exists students_business_created_idx
  on public.students (business_unit_id, created_at desc);
