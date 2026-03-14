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
