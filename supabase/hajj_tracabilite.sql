-- ============================================================================
-- Migration Traçabilité Profils Hajj (Qui a enregistré le pèlerin, le paiement, la dépense)
-- À exécuter dans le SQL Editor de Supabase.
--
-- Rappel PowerSync :
-- Vos streams utilisent déjà `SELECT *` : après avoir exécuté ce script,
-- cliquez simplement sur "Validate & Deploy" dans PowerSync Sync Rules
-- pour synchroniser automatiquement ces nouvelles colonnes.
-- ============================================================================

-- 1. Auteur de l'enregistrement d'un pèlerin
alter table public.pelerins
  add column if not exists created_by_name text,
  add column if not exists created_by_role text;

-- 2. Auteur de l'enregistrement d'un paiement pèlerin
alter table public.pelerin_payments
  add column if not exists recorded_by_name text,
  add column if not exists recorded_by_role text;

-- 3. Auteur de l'enregistrement d'une dépense Hajj
alter table public.depenses_hajj
  add column if not exists recorded_by_name text,
  add column if not exists recorded_by_role text;
