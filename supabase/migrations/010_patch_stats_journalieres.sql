-- Migration 010 — Patch table stats_journalieres
-- BUG-004 : Le cron calculerStatsJournalieres (api-cron.ts) utilise les colonnes
--   chiffre_affaires, frais_livraison_total, top_produits
-- mais la table initiale (001_initial_schema.sql) n'a que :
--   ca_total, taux_annulation, produit_top_id
--
-- Solution : ajouter les colonnes manquantes et migrer les données existantes.
-- Les anciennes colonnes sont conservées pour rétrocompatibilité (non supprimées).
--
-- Auteur : audit BUG-004 — 2026-07-31

-- 1. Ajouter les colonnes manquantes utilisées par le cron
ALTER TABLE stats_journalieres
  ADD COLUMN IF NOT EXISTS chiffre_affaires         NUMERIC(12,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS frais_livraison_total     NUMERIC(12,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS top_produits             JSONB         DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS nb_commandes_livrees     INTEGER        DEFAULT 0,
  ADD COLUMN IF NOT EXISTS nb_commandes_annulees    INTEGER        DEFAULT 0,
  ADD COLUMN IF NOT EXISTS updated_at               TIMESTAMPTZ   DEFAULT NOW();

-- 2. Migrer les données existantes : copier ca_total → chiffre_affaires
UPDATE stats_journalieres
SET chiffre_affaires = ca_total
WHERE chiffre_affaires = 0 AND ca_total IS NOT NULL AND ca_total > 0;

-- 3. Index pour les requêtes fréquentes par tenant + date
CREATE INDEX IF NOT EXISTS idx_stats_journalieres_tenant_date
  ON stats_journalieres (tenant_id, date DESC);

-- 4. Commentaire de documentation
COMMENT ON COLUMN stats_journalieres.chiffre_affaires IS
  'Chiffre d''affaires de la journée (commandes non annulées) — alimenté par api-cron.ts';
COMMENT ON COLUMN stats_journalieres.frais_livraison_total IS
  'Total des frais de livraison de la journée — alimenté par api-cron.ts';
COMMENT ON COLUMN stats_journalieres.top_produits IS
  'Top 3 produits JSON : [{produit_id, nom, quantite}] — alimenté par api-cron.ts';
