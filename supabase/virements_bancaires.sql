-- =============================================================================
-- Migration : Suivi des Virements Bancaires (indépendant de la comptabilité)
-- À exécuter dans Supabase > SQL Editor
-- =============================================================================

create table if not exists public.virements_bancaires (
  id uuid primary key default gen_random_uuid(),
  agence_id uuid references public.agences(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  sens text not null check (sens in ('emis', 'recu')),
  banque text not null,
  nom_compte text not null,
  numero_compte text,
  contrepartie text,
  montant numeric not null check (montant > 0),
  devise text not null default 'FCFA' check (devise in ('FCFA', 'EUR', 'USD')),
  motif text not null,
  reference_bancaire text,
  date_virement date not null default current_date,
  statut text not null default 'execute' check (statut in ('execute', 'en_attente', 'annule')),
  recu_url text,
  notes text,
  campagne integer,
  recorded_by_name text,
  recorded_by_role text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists virements_bancaires_agence_date_idx
  on public.virements_bancaires(agence_id, date_virement desc, created_at desc);

create index if not exists virements_bancaires_campagne_idx
  on public.virements_bancaires(campagne, devise);

create or replace function public.touch_virements_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists virements_bancaires_touch_updated_at on public.virements_bancaires;
create trigger virements_bancaires_touch_updated_at
before update on public.virements_bancaires
for each row execute function public.touch_virements_updated_at();

-- Row Level Security : chaque agence ne voit et ne gère que ses propres virements
alter table public.virements_bancaires enable row level security;

drop policy if exists virements_bancaires_agency_select on public.virements_bancaires;
create policy virements_bancaires_agency_select on public.virements_bancaires
for select using (
  user_id = auth.uid()
  or (
    agence_id is not null
    and agence_id = (select p.agence_id from public.profiles p where p.id = auth.uid() limit 1)
  )
);

drop policy if exists virements_bancaires_agency_insert on public.virements_bancaires;
create policy virements_bancaires_agency_insert on public.virements_bancaires
for insert with check (
  user_id = auth.uid()
  and (
    agence_id is null
    or agence_id = (select p.agence_id from public.profiles p where p.id = auth.uid() limit 1)
  )
);

drop policy if exists virements_bancaires_agency_update on public.virements_bancaires;
create policy virements_bancaires_agency_update on public.virements_bancaires
for update using (
  user_id = auth.uid()
  or (
    agence_id is not null
    and agence_id = (select p.agence_id from public.profiles p where p.id = auth.uid() limit 1)
  )
) with check (
  user_id = auth.uid()
  or (
    agence_id is not null
    and agence_id = (select p.agence_id from public.profiles p where p.id = auth.uid() limit 1)
  )
);

drop policy if exists virements_bancaires_agency_delete on public.virements_bancaires;
create policy virements_bancaires_agency_delete on public.virements_bancaires
for delete using (
  user_id = auth.uid()
  or (
    agence_id is not null
    and agence_id = (select p.agence_id from public.profiles p where p.id = auth.uid() limit 1)
  )
);
