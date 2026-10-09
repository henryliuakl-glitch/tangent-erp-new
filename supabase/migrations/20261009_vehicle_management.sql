-- Vehicle management for Sine Driving / Tangent fleet view.
-- Run this migration on the Tangent production Supabase project.

create table if not exists public.vehicles (
  id uuid primary key default gen_random_uuid(),
  business_unit_id text not null default 'sine',
  nickname text not null,
  make text not null,
  model text not null,
  year integer,
  color text,
  plate_number text not null,
  transmission text,
  usage_status text not null default 'teaching',
  primary_driver text,
  owner text,
  purchase_date date,
  purchase_price numeric(12,2),
  current_odometer_km integer not null default 0,
  wof_expiry date,
  rego_expiry date,
  insurance_provider text,
  insurance_policy_number text,
  insurance_type text,
  insurance_premium_amount numeric(12,2),
  insurance_premium_frequency text,
  insurance_expiry date,
  next_service_date date,
  next_service_odometer_km integer,
  condition_status text not null default 'normal',
  known_issues text,
  tyre_status text,
  battery_status text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists vehicles_plate_number_unique_idx
  on public.vehicles (upper(plate_number));

create index if not exists vehicles_business_status_idx
  on public.vehicles (business_unit_id, usage_status);

create table if not exists public.vehicle_maintenance (
  id uuid primary key default gen_random_uuid(),
  vehicle_id uuid not null references public.vehicles(id) on delete cascade,
  service_date date not null,
  odometer_km integer,
  service_types text[] not null default '{}',
  cost numeric(12,2) not null default 0,
  provider text,
  notes text,
  receipt_url text,
  transaction_id uuid,
  created_at timestamptz not null default now()
);

create index if not exists vehicle_maintenance_vehicle_date_idx
  on public.vehicle_maintenance (vehicle_id, service_date desc);

comment on table public.vehicles is
  'Sine/Tangent fleet registry: vehicle identity, compliance, insurance, odometer and current operating status.';

comment on table public.vehicle_maintenance is
  'Vehicle maintenance and repair history. transaction_id optionally links a maintenance cost to a finance transaction.';
