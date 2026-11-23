-- ============================================================================
-- Migration Multi-Devises Hajj (FCFA, EUR, USD)
-- À exécuter dans le SQL Editor de Supabase.
-- Toutes les données existantes reçoivent automatiquement la devise 'FCFA'.
--
-- Rappel PowerSync :
-- Si vos Sync Rules listent explicitement les colonnes des tables
-- `pelerins`, `pelerin_payments` et `depenses_hajj`, pensez à y ajouter
-- la colonne `devise` puis à déployer vos Sync Rules.
-- ============================================================================

-- 1. Table pelerins
alter table public.pelerins
  add column if not exists devise text not null default 'FCFA';

update public.pelerins
  set devise = 'FCFA'
  where devise is null or trim(devise) = '';

alter table public.pelerins
  drop constraint if exists pelerins_devise_check;

alter table public.pelerins
  add constraint pelerins_devise_check
  check (devise in ('FCFA', 'EUR', 'USD'));

create index if not exists idx_pelerins_devise
  on public.pelerins (devise);

-- 2. Table pelerin_payments
alter table public.pelerin_payments
  add column if not exists devise text not null default 'FCFA';

update public.pelerin_payments pp
  set devise = coalesce(nullif(trim(p.devise), ''), 'FCFA')
  from public.pelerins p
  where pp.pelerin_id = p.id
    and (pp.devise is null or trim(pp.devise) = '' or pp.devise = 'FCFA');

alter table public.pelerin_payments
  drop constraint if exists pelerin_payments_devise_check;

alter table public.pelerin_payments
  add constraint pelerin_payments_devise_check
  check (devise in ('FCFA', 'EUR', 'USD'));

create index if not exists idx_pelerin_payments_devise
  on public.pelerin_payments (devise);

-- 3. Table depenses_hajj
alter table public.depenses_hajj
  add column if not exists devise text not null default 'FCFA';

update public.depenses_hajj
  set devise = 'FCFA'
  where devise is null or trim(devise) = '';

alter table public.depenses_hajj
  drop constraint if exists depenses_hajj_devise_check;

alter table public.depenses_hajj
  add constraint depenses_hajj_devise_check
  check (devise in ('FCFA', 'EUR', 'USD'));

create index if not exists idx_depenses_hajj_devise
  on public.depenses_hajj (devise);
