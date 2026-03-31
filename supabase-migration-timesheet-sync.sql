-- ============================================================
-- МИГРАЦИЯ: Синхронизация табеля из TumarDashboard
-- Запустить в Supabase SQL Editor
-- ============================================================

-- 1. Физпосты (Guard Posts) — объекты с охранниками
create table if not exists guard_posts (
  id uuid primary key default gen_random_uuid(),
  external_id text unique not null,         -- MongoDB _id из TumarDashboard
  number text,                               -- номер поста
  callsign text,                             -- позывной
  name text,                                 -- название объекта
  address text,                              -- адрес
  rate numeric(14,2) default 0,              -- ставка за смену/час
  contract_amount numeric(14,2) default 0,   -- сумма контракта с клиентом (ввод вручную)
  is_active boolean default true,
  synced_at timestamptz,
  created_at timestamptz default now()
);

-- 2. Охранники
create table if not exists guards (
  id uuid primary key default gen_random_uuid(),
  external_id text unique not null,         -- MongoDB _id из TumarDashboard
  surname text not null,
  first_name text not null,
  patronymic text,
  iin text,                                  -- ИИН
  is_official boolean default false,         -- официальный / неофициальный
  is_active boolean default true,
  synced_at timestamptz,
  created_at timestamptz default now()
);

-- 3. Данные табеля за месяц — основная таблица для расчёта ФОТ
create table if not exists timesheet_entries (
  id uuid primary key default gen_random_uuid(),
  month date not null,                       -- первый день месяца (2025-03-01)
  guard_post_id uuid references guard_posts(id),
  guard_id uuid references guards(id),
  rate numeric(14,2) default 0,              -- ставка (на момент синхронизации)
  days_worked int default 0,                 -- кол-во отработанных дней
  shifts_worked int default 0,               -- кол-во смен
  total_hours numeric(10,2) default 0,       -- часов всего
  salary numeric(14,2) default 0,            -- расчётная ЗП (часы × ставка)
  is_official boolean default false,         -- дублируем для быстрых запросов
  synced_at timestamptz default now(),
  created_at timestamptz default now(),
  unique(month, guard_post_id, guard_id)     -- один охранник × один пост × один месяц
);

-- 4. Сводка по месяцу — итоги синхронизации
create table if not exists timesheet_sync_log (
  id uuid primary key default gen_random_uuid(),
  month date not null,
  total_guards int default 0,
  official_count int default 0,
  unofficial_count int default 0,
  total_salary numeric(14,2) default 0,
  official_salary numeric(14,2) default 0,
  unofficial_salary numeric(14,2) default 0,
  tax_estimate numeric(14,2) default 0,      -- ~12% от официальной ЗП
  synced_at timestamptz default now(),
  synced_by uuid references users(id),
  created_at timestamptz default now()
);

-- 5. Рентабельность постов (view) — автоматический расчёт
-- Директор видит: доход от объекта - ЗП = прибыль/убыток
create or replace view guard_post_profitability as
select
  gp.id,
  gp.external_id,
  gp.callsign,
  gp.name,
  gp.address,
  gp.contract_amount,
  gp.rate,
  coalesce(te.total_salary, 0) as total_salary,
  coalesce(te.official_salary, 0) as official_salary,
  coalesce(te.unofficial_salary, 0) as unofficial_salary,
  coalesce(te.guard_count, 0) as guard_count,
  coalesce(te.official_count, 0) as official_count,
  coalesce(te.unofficial_count, 0) as unofficial_count,
  gp.contract_amount - coalesce(te.total_salary, 0) as profit,
  te.month
from guard_posts gp
left join (
  select
    guard_post_id,
    month,
    sum(salary) as total_salary,
    sum(case when is_official then salary else 0 end) as official_salary,
    sum(case when not is_official then salary else 0 end) as unofficial_salary,
    count(*) as guard_count,
    count(*) filter (where is_official) as official_count,
    count(*) filter (where not is_official) as unofficial_count
  from timesheet_entries
  group by guard_post_id, month
) te on te.guard_post_id = gp.id
where gp.is_active = true;

-- 6. Сравнение: снятая наличка vs реальные расходы (view)
-- Показывает разницу между тем что сняли и тем что реально ушло
create or replace view cash_accountability as
select
  to_char(ce.entry_date, 'YYYY-MM') as month,
  -- Сколько наличных потрачено (по кассе tumar-finance)
  sum(case when ce.type = 'expense' then ce.amount else 0 end) as cash_spent_reported,
  -- Сколько ушло на ЗП охранников (неофиц) по табелю
  coalesce(ts.unofficial_salary, 0) as unofficial_salary_from_timesheet,
  -- Разница = неучтённые деньги
  sum(case when ce.type = 'expense' then ce.amount else 0 end)
    - coalesce(ts.unofficial_salary, 0) as unaccounted
from cash_entries ce
left join (
  select
    to_char(month, 'YYYY-MM') as month_str,
    sum(case when not is_official then salary else 0 end) as unofficial_salary
  from timesheet_entries
  group by to_char(month, 'YYYY-MM')
) ts on ts.month_str = to_char(ce.entry_date, 'YYYY-MM')
group by to_char(ce.entry_date, 'YYYY-MM'), ts.unofficial_salary
order by month desc;

-- RLS policies
alter table guard_posts enable row level security;
alter table guards enable row level security;
alter table timesheet_entries enable row level security;
alter table timesheet_sync_log enable row level security;

create policy "auth_all_guard_posts" on guard_posts for all using (auth.role() = 'authenticated');
create policy "auth_all_guards" on guards for all using (auth.role() = 'authenticated');
create policy "auth_all_timesheet_entries" on timesheet_entries for all using (auth.role() = 'authenticated');
create policy "auth_all_timesheet_sync_log" on timesheet_sync_log for all using (auth.role() = 'authenticated');
