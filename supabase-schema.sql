-- Run this in Supabase SQL Editor

create table if not exists users (
  id uuid primary key default gen_random_uuid(),
  email text unique not null,
  name text,
  role text default 'viewer', -- 'admin' | 'accountant' | 'viewer'
  created_at timestamptz default now()
);

-- Bank statement entries (Народный банк / Каспи)
create table if not exists bank_entries (
  id uuid primary key default gen_random_uuid(),
  entry_date date not null,
  bank text not null, -- 'narodniy' | 'kaspi'
  type text not null, -- 'income' | 'expense'
  amount numeric(14,2) not null,
  category text,      -- 'pulto' | 'montazh' | 'zp' | 'nalog' | 'other'
  description text,
  counterparty text,
  created_by uuid references users(id),
  created_at timestamptz default now()
);

-- Cash expense entries
create table if not exists cash_entries (
  id uuid primary key default gen_random_uuid(),
  entry_date date not null,
  amount numeric(14,2) not null,
  type text not null, -- 'income' | 'expense'
  category text,      -- 'zp_guard' | 'zp_office' | 'materials' | 'fuel' | 'other'
  description text,
  responsible text,   -- 'sergey' | 'other'
  created_by uuid references users(id),
  created_at timestamptz default now()
);

-- Salary plan (monthly target)
create table if not exists salary_plan (
  id uuid primary key default gen_random_uuid(),
  month date not null,  -- first day of month
  total_planned numeric(14,2) not null,
  bank_part numeric(14,2),
  cash_part numeric(14,2),
  notes text,
  created_by uuid references users(id),
  created_at timestamptz default now()
);

-- Weekly snapshots (для сверки директора)
create table if not exists weekly_snapshots (
  id uuid primary key default gen_random_uuid(),
  snap_date date not null,
  balance_narodniy numeric(14,2) default 0,
  balance_kaspi numeric(14,2) default 0,
  balance_cash numeric(14,2) default 0,
  zp_remaining numeric(14,2) default 0,
  notes text,
  created_by uuid references users(id),
  created_at timestamptz default now()
);

-- Clients (security alarm panels / пульты)
create table if not exists clients (
  id uuid primary key default gen_random_uuid(),
  pult_number varchar(50) unique not null,  -- номер пульта
  name text not null,                        -- имя клиента / объект
  address text,
  phone text,
  monthly_rate numeric(14,2) default 0,      -- ежемесячная плата
  is_active boolean default true,
  created_by uuid references users(id),
  created_at timestamptz default now()
);

-- Monthly payment records for each pult
create table if not exists pult_payments (
  id uuid primary key default gen_random_uuid(),
  client_id uuid references clients(id) on delete cascade,
  payment_month date not null,               -- first day of month (e.g. 2024-03-01)
  is_paid boolean default false,
  payment_date date,
  notes text,
  created_by uuid references users(id),
  created_at timestamptz default now(),
  unique(client_id, payment_month)
);

-- RLS policies
alter table bank_entries enable row level security;
alter table cash_entries enable row level security;
alter table salary_plan enable row level security;
alter table weekly_snapshots enable row level security;

-- Allow authenticated users to read/write
create policy "auth_all_bank" on bank_entries for all using (auth.role() = 'authenticated');
create policy "auth_all_cash" on cash_entries for all using (auth.role() = 'authenticated');
create policy "auth_all_salary" on salary_plan for all using (auth.role() = 'authenticated');
create policy "auth_all_snap" on weekly_snapshots for all using (auth.role() = 'authenticated');

alter table clients enable row level security;
alter table pult_payments enable row level security;
create policy "auth_all_clients" on clients for all using (auth.role() = 'authenticated');
create policy "auth_all_pult_payments" on pult_payments for all using (auth.role() = 'authenticated');
