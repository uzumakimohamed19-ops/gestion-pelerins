-- =============================================================================
-- Migration : Notifications Push Web (Android & iOS PWA)
-- À exécuter dans Supabase > SQL Editor
-- =============================================================================

create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  agence_id uuid references public.agences(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  platform text not null default 'web'
    check (platform in ('ios-pwa', 'android-pwa', 'android-web', 'desktop', 'web')),
  user_agent text,
  enabled boolean not null default true,
  morning_enabled boolean not null default true,
  evening_enabled boolean not null default true,
  timezone text not null default 'Africa/Bamako',
  last_seen_at timestamptz not null default now(),
  last_notified_at timestamptz,
  last_slot_sent text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists push_subscriptions_user_idx
  on public.push_subscriptions(user_id);

create index if not exists push_subscriptions_agence_idx
  on public.push_subscriptions(agence_id);

create index if not exists push_subscriptions_enabled_idx
  on public.push_subscriptions(enabled)
  where enabled = true;

-- Journal d'envoi (évite les doublons & permet de suivre l'historique)
create table if not exists public.push_notification_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  agence_id uuid references public.agences(id) on delete cascade,
  slot text not null check (slot in ('morning', 'evening', 'test')),
  category text not null,
  title text not null,
  body text not null,
  url text not null default '/hajj/dashboard',
  sent_count integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists push_notification_logs_agence_created_idx
  on public.push_notification_logs(agence_id, created_at desc);

-- Trigger updated_at automatique
create or replace function public.touch_push_subscription_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists push_subscriptions_touch_updated_at on public.push_subscriptions;
create trigger push_subscriptions_touch_updated_at
before update on public.push_subscriptions
for each row execute function public.touch_push_subscription_updated_at();

-- Row Level Security (chaque utilisateur gère uniquement ses propres appareils)
alter table public.push_subscriptions enable row level security;

drop policy if exists push_subscriptions_owner_select on public.push_subscriptions;
create policy push_subscriptions_owner_select on public.push_subscriptions
for select using (auth.uid() = user_id);

drop policy if exists push_subscriptions_owner_insert on public.push_subscriptions;
create policy push_subscriptions_owner_insert on public.push_subscriptions
for insert with check (auth.uid() = user_id);

drop policy if exists push_subscriptions_owner_update on public.push_subscriptions;
create policy push_subscriptions_owner_update on public.push_subscriptions
for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists push_subscriptions_owner_delete on public.push_subscriptions;
create policy push_subscriptions_owner_delete on public.push_subscriptions
for delete using (auth.uid() = user_id);

alter table public.push_notification_logs enable row level security;

drop policy if exists push_notification_logs_owner_select on public.push_notification_logs;
create policy push_notification_logs_owner_select on public.push_notification_logs
for select using (auth.uid() = user_id);
