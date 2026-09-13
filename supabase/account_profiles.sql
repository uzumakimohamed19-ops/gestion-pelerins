create table if not exists public.account_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(trim(name)) between 1 and 80),
  profile_type text not null check (profile_type in ('direction', 'agent')),
  pin_hash text not null check (pin_hash ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists account_profiles_one_direction
  on public.account_profiles(user_id)
  where profile_type = 'direction';

create unique index if not exists account_profiles_unique_name
  on public.account_profiles(user_id, lower(name));

create or replace function public.enforce_account_profile_limits()
returns trigger
language plpgsql
as $$
begin
  if new.profile_type = 'agent' and (
    select count(*) from public.account_profiles
    where user_id = new.user_id and profile_type = 'agent' and id <> new.id
  ) >= 2 then
    raise exception 'Deux profils Agent maximum sont autorises';
  end if;
  return new;
end;
$$;

drop trigger if exists account_profiles_limits on public.account_profiles;
create trigger account_profiles_limits
before insert or update on public.account_profiles
for each row execute function public.enforce_account_profile_limits();

alter table public.account_profiles enable row level security;
drop policy if exists account_profiles_owner_select on public.account_profiles;
create policy account_profiles_owner_select on public.account_profiles
for select using (auth.uid() = user_id);
drop policy if exists account_profiles_owner_insert on public.account_profiles;
create policy account_profiles_owner_insert on public.account_profiles
for insert with check (auth.uid() = user_id);
drop policy if exists account_profiles_owner_update on public.account_profiles;
create policy account_profiles_owner_update on public.account_profiles
for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists account_profiles_owner_delete on public.account_profiles;
create policy account_profiles_owner_delete on public.account_profiles
for delete using (auth.uid() = user_id);
