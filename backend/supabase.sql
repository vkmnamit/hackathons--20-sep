-- Run this once in Supabase SQL Editor before setting backend/.env credentials.
-- The backend uses its service-role key; never expose that key to the browser.

create table if not exists public.wlo_users (
  email text primary key,
  password_hash text not null,
  company_id text not null unique,
  company_name text not null,
  dataset_size integer not null default 56 check (dataset_size in (56, 90)),
  dataset_seed integer not null,
  created_at timestamptz not null default now()
);

-- Safe migration for an earlier 50/70 demo schema.
alter table public.wlo_users drop constraint if exists wlo_users_dataset_size_check;
alter table public.wlo_users add constraint wlo_users_dataset_size_check check (dataset_size between 1 and 500);

create table if not exists public.wlo_datasets (
  company_id text primary key,
  owner_email text not null references public.wlo_users(email) on delete cascade,
  neighborhoods jsonb not null,
  candidates jsonb not null,
  updated_at timestamptz not null default now()
);

create table if not exists public.wlo_runs (
  id bigint generated always as identity primary key,
  company_id text,
  name text not null,
  algorithm text not null,
  warehouse_count integer not null,
  total_cost numeric not null,
  avg_distance numeric not null,
  runtime_ms integer not null,
  created_at timestamptz not null default now()
);

create table if not exists public.wlo_warehouses (
  id text primary key,
  name text not null,
  x numeric not null default 50,
  y numeric not null default 50,
  capacity numeric not null default 500,
  storage_m3 numeric not null default 3,
  throughput_per_hr numeric not null default 100,
  handling_cost_per_unit numeric not null default 1.2,
  fixed_operating_cost numeric not null default 600,
  open boolean not null default true,
  waves jsonb not null default '[8,12,16,20]',
  vehicles jsonb not null default '[]',
  updated_at timestamptz not null default now()
);

create index if not exists wlo_runs_company_created_idx on public.wlo_runs (company_id, created_at desc);

-- Pre-seeded Warehouses (Bengaluru Core Docks)
insert into public.wlo_warehouses (id, name, x, y, capacity, storage_m3, throughput_per_hr, handling_cost_per_unit, fixed_operating_cost, open, waves, vehicles)
values
  ('W1', 'Basavanagudi Hub', 12.942, 77.570, 900, 3.5, 120, 1.20, 1500, true, '[8,12,16,20]', '[{"id":"W1-V1","capacityUnits":25,"speedKmH":30,"maxStops":8}]'),
  ('W2', 'Jayanagar Dock', 12.924, 77.585, 1100, 4.0, 150, 1.15, 1500, true, '[8,12,16,20]', '[{"id":"W2-V1","capacityUnits":30,"speedKmH":35,"maxStops":10}]'),
  ('W3', 'Gandhi Bazaar Depot', 12.935, 77.573, 700, 2.8, 90, 1.30, 1400, true, '[8,12,16,20]', '[{"id":"W3-V1","capacityUnits":20,"speedKmH":25,"maxStops":6}]'),
  ('W4', 'DVG Road Point', 12.939, 77.566, 650, 2.5, 80, 1.35, 1300, true, '[8,12,16,20]', '[{"id":"W4-V1","capacityUnits":20,"speedKmH":25,"maxStops":6}]'),
  ('W5', 'South Bangalore DC', 12.930, 77.580, 1400, 5.0, 180, 1.10, 1800, true, '[8,12,16,20]', '[{"id":"W5-V1","capacityUnits":40,"speedKmH":40,"maxStops":12}]'),
  ('W6', '9th Block Node', 12.920, 77.590, 800, 3.0, 100, 1.25, 1400, true, '[8,12,16,20]', '[{"id":"W6-V1","capacityUnits":25,"speedKmH":30,"maxStops":8}]')
on conflict (id) do update set
  name = excluded.name,
  x = excluded.x,
  y = excluded.y,
  capacity = excluded.capacity,
  storage_m3 = excluded.storage_m3,
  throughput_per_hr = excluded.throughput_per_hr,
  handling_cost_per_unit = excluded.handling_cost_per_unit,
  fixed_operating_cost = excluded.fixed_operating_cost;
