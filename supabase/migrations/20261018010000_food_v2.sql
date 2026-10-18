-- Yune — comida v2: local da refeição, fotos, itens próprios (rótulos) e limite de uso da IA.

alter table public.meals
  add column place text not null default 'casa' check (place in ('casa', 'restaurante', 'delivery')),
  add column photo_path text;

-- Itens próprios: suplementos e industrializados lidos do rótulo, ou cadastrados à mão.
create table public.custom_foods (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  name text not null check (char_length(name) between 1 and 120),
  brand text check (char_length(brand) <= 80),
  serving_label text not null default '1 porção',
  serving_g numeric not null check (serving_g > 0 and serving_g <= 2000),
  kcal numeric not null check (kcal between 0 and 5000),
  protein_g numeric not null default 0,
  carbs_g numeric not null default 0,
  fat_g numeric not null default 0,
  created_at timestamptz not null default now()
);
create index on public.custom_foods (user_id);
alter table public.custom_foods enable row level security;
create policy "own rows" on public.custom_foods
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Fotos dos pratos: bucket privado, uma pasta por pessoa (<user_id>/<arquivo>).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('meal-photos', 'meal-photos', false, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

create policy "meal photos: own folder read" on storage.objects
  for select to authenticated
  using (bucket_id = 'meal-photos' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "meal photos: own folder insert" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'meal-photos' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "meal photos: own folder delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'meal-photos' and (storage.foldername(name))[1] = auth.uid()::text);

-- Limite diário de chamadas à IA por pessoa (protege a conta da Anthropic).
create table public.ai_usage (
  user_id uuid not null references auth.users on delete cascade,
  day date not null default current_date,
  calls int not null default 0,
  primary key (user_id, day)
);
alter table public.ai_usage enable row level security;

create function public.bump_ai_usage(p_user uuid) returns int
language sql set search_path = '' as $$
  insert into public.ai_usage (user_id, day, calls) values (p_user, current_date, 1)
  on conflict (user_id, day) do update set calls = public.ai_usage.calls + 1
  returning calls
$$;
revoke execute on function public.bump_ai_usage(uuid) from public, anon, authenticated;
grant execute on function public.bump_ai_usage(uuid) to service_role;
