-- =============================================================
-- Migration 013 — Cycle de correction N°3
-- Date : 2026-07-31
-- Objectifs :
--   1. Ajouter statut 'en_attente_paiement_initial' pour les tenants
--      ayant choisi un plan payant sans encore soumettre de preuve
--   2. Ajouter colonne 'periodicite' sur abonnements (mensuel seulement désormais)
--   3. Supprimer le concept d'annuel : periodicite vaut toujours 'mensuel'
--   4. Corriger policy RLS INSERT notifications_restaurant (BUG-NOUVEAU-003)
--   5. Corriger JWT claim admin notifications (BUG-NOUVEAU-004)
-- =============================================================

-- ─── 1. Ajouter la colonne periodicite sur abonnements ─────────────────────
-- Valeur par défaut 'mensuel' : couvre les lignes existantes ET impose le
-- mode mensuel exclusif désormais en vigueur.
ALTER TABLE abonnements
  ADD COLUMN IF NOT EXISTS periodicite TEXT NOT NULL DEFAULT 'mensuel'
  CHECK (periodicite IN ('mensuel'));
-- NOTE : la contrainte CHECK ('mensuel') uniquement encode la règle métier :
-- l'abonnement annuel est supprimé. Pour ajouter 'annuel' plus tard, il
-- faudra ALTER TABLE et modifier la contrainte explicitement.

-- ─── 2a. Ajouter statut 'en_attente_paiement_initial' dans le CHECK tenants ─
-- La contrainte CHECK de la migration 001 liste uniquement :
--   'essai', 'actif', 'inactif', 'suspendu'
-- Le nouveau statut CYCLE-3 doit être ajouté explicitement.
-- Sur PostgreSQL/Supabase on recrée la contrainte (DROP + ADD).
ALTER TABLE tenants DROP CONSTRAINT IF EXISTS tenants_statut_check;
ALTER TABLE tenants
  ADD CONSTRAINT tenants_statut_check
  CHECK (statut IN ('essai', 'actif', 'inactif', 'suspendu', 'en_attente_paiement_initial'));

-- ─── 2b. Ajouter colonne 'plan_initial_id' sur tenants ─────────────────────
-- Conserve le plan que le client a choisi lors de l'inscription même avant
-- qu'un abonnement soit créé. Utilisé pour afficher le bon récapitulatif
-- dans la section abonnement AVANT la soumission de preuve.
ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS plan_initial_id TEXT;
-- Note : c'est un UUID D1 (texte), pas une FK Supabase, identique à plan_id.

-- ─── 3. Corriger RLS INSERT trop permissive sur notifications_restaurant ────
-- BUG-NOUVEAU-003 : WITH CHECK (true) permettait à tout utilisateur
-- authentifié d'insérer n'importe quelle notification.
-- Correction : seul le service_role peut insérer (c'est l'usage réel via
-- adminClient dans api-cron.ts et api-commandes.ts).
DROP POLICY IF EXISTS "restaurant_insert_notifications" ON notifications_restaurant;
CREATE POLICY "restaurant_insert_notifications" ON notifications_restaurant
  FOR INSERT
  WITH CHECK (false);
-- false = personne via RLS ; seul service_role (qui bypass RLS) peut insérer.
-- Cela correspond au comportement réel du code : insertions via adminClient.

-- ─── 4. Corriger JWT claim admin dans policies notifications_admin ──────────
-- BUG-NOUVEAU-004 : auth.jwt() ->> 'role' est invalide pour les custom
-- claims Supabase. Le rôle custom est dans app_metadata.
DROP POLICY IF EXISTS "admin_all_notifications" ON notifications_admin;
CREATE POLICY "admin_all_notifications" ON notifications_admin
  FOR ALL
  USING (
    (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
    OR auth.role() = 'service_role'
  )
  WITH CHECK (
    (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
    OR auth.role() = 'service_role'
  );

-- ─── 5. Index pour recherche par statut et plan_initial_id ─────────────────
CREATE INDEX IF NOT EXISTS idx_tenants_plan_initial_id ON tenants(plan_initial_id)
  WHERE plan_initial_id IS NOT NULL;

-- ─── 6. Commentaires de documentation ──────────────────────────────────────
COMMENT ON COLUMN abonnements.periodicite IS
  'Périodicité de l''abonnement. Valeur unique : mensuel. L''abonnement annuel a été supprimé le 2026-07-31.';

COMMENT ON COLUMN tenants.plan_initial_id IS
  'UUID D1 du plan choisi à l''inscription. Permet d''afficher le récapitulatif du plan avant la première soumission de preuve de paiement. Distinct de plan_id (plan actif confirmé).';
