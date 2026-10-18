-- Yune — esquema inicial
-- Cada pessoa só enxerga e altera os próprios dados (RLS em todas as tabelas).

create table public.profiles (
  id uuid primary key references auth.users on delete cascade,
  name text,
  sex text check (sex in ('f', 'm')),
  birth_year int check (birth_year between 1900 and 2100),
  height_cm numeric check (height_cm between 50 and 260),
  weight_kg numeric check (weight_kg between 20 and 400),
  kcal_goal int not null default 2000 check (kcal_goal between 800 and 6000),
  water_goal_ml int not null default 2000 check (water_goal_ml between 250 and 8000),
  sleep_goal_min int not null default 480 check (sleep_goal_min between 180 and 720),
  timezone text not null default 'America/Sao_Paulo',
  created_at timestamptz not null default now()
);

create table public.meals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  eaten_at timestamptz not null default now(),
  description text not null check (char_length(description) between 1 and 600),
  kcal int not null check (kcal between 0 and 10000),
  protein_g numeric,
  carbs_g numeric,
  fat_g numeric,
  items jsonb,
  source text not null default 'manual' check (source in ('ai', 'manual')),
  created_at timestamptz not null default now()
);

create table public.activities (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  started_at timestamptz not null default now(),
  kind text not null check (char_length(kind) between 1 and 60),
  duration_min int not null check (duration_min between 1 and 1440),
  intensity text not null default 'moderada' check (intensity in ('leve', 'moderada', 'intensa')),
  kcal int not null check (kcal between 0 and 10000),
  note text check (char_length(note) <= 300),
  created_at timestamptz not null default now()
);

create table public.water (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  drank_at timestamptz not null default now(),
  ml int not null check (ml between 10 and 3000),
  created_at timestamptz not null default now()
);

create table public.sleep (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  bed_at timestamptz not null,
  wake_at timestamptz,
  created_at timestamptz not null default now(),
  check (wake_at is null or (wake_at > bed_at and wake_at - bed_at < interval '20 hours'))
);

create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz not null default now()
);

create table public.reminders (
  user_id uuid primary key default auth.uid() references public.profiles on delete cascade,
  water_enabled boolean not null default true,
  water_every_min int not null default 120 check (water_every_min between 30 and 480),
  water_start time not null default '09:00',
  water_end time not null default '21:00',
  summary_enabled boolean not null default true,
  summary_time time not null default '21:30',
  bedtime_enabled boolean not null default false,
  bedtime_time time not null default '23:00',
  last_water_at timestamptz,
  last_summary_date date,
  last_bedtime_date date
);

create index on public.meals (user_id, eaten_at);
create index on public.activities (user_id, started_at);
create index on public.water (user_id, drank_at);
create index on public.sleep (user_id, wake_at);
create index on public.push_subscriptions (user_id);

-- RLS -------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.meals enable row level security;
alter table public.activities enable row level security;
alter table public.water enable row level security;
alter table public.sleep enable row level security;
alter table public.push_subscriptions enable row level security;
alter table public.reminders enable row level security;

create policy "own profile" on public.profiles
  for all to authenticated using (id = auth.uid()) with check (id = auth.uid());

do $$
declare t text;
begin
  foreach t in array array['meals', 'activities', 'water', 'sleep', 'push_subscriptions', 'reminders'] loop
    execute format(
      'create policy "own rows" on public.%I for all to authenticated
         using (user_id = auth.uid()) with check (user_id = auth.uid())', t);
  end loop;
end $$;

-- Perfil + lembretes criados automaticamente no cadastro -----------------
create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, name)
    values (new.id, nullif(new.raw_user_meta_data ->> 'name', ''));
  insert into public.reminders (user_id) values (new.id);
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Totais do dia (usado pelo resumo noturno; só o service role chama) -----
create function public.daily_totals(p_user uuid, p_day date)
returns table (kcal_in int, kcal_out int, water_ml int, sleep_min int)
language sql stable set search_path = '' as $$
  with tz as (select timezone from public.profiles where id = p_user)
  select
    coalesce((select sum(m.kcal) from public.meals m, tz
              where m.user_id = p_user and (m.eaten_at at time zone tz.timezone)::date = p_day), 0)::int,
    coalesce((select sum(a.kcal) from public.activities a, tz
              where a.user_id = p_user and (a.started_at at time zone tz.timezone)::date = p_day), 0)::int,
    coalesce((select sum(w.ml) from public.water w, tz
              where w.user_id = p_user and (w.drank_at at time zone tz.timezone)::date = p_day), 0)::int,
    coalesce((select sum(extract(epoch from (s.wake_at - s.bed_at)) / 60) from public.sleep s, tz
              where s.user_id = p_user and s.wake_at is not null
                and (s.wake_at at time zone tz.timezone)::date = p_day), 0)::int
$$;

revoke execute on function public.daily_totals(uuid, date) from public, anon, authenticated;
grant execute on function public.daily_totals(uuid, date) to service_role;
