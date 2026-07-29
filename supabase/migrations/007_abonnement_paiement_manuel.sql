-- =====================================================================
-- Migration 007 : Paiement manuel — champs manquants sur abonnements et tenants
-- Référence : audit 04-plan-implementation.md §Phase 1, 05-securite-risques.md
-- Date : 2026-07-29
--
-- Objectif : Ajouter tous les champs nécessaires au flux de paiement
--   manuel (référence, preuve R2, statut intermédiaire, audit trail,
--   délai 72h de confirmation, rejet).
--
-- Dépendances : Migration 001 (tables abonnements, tenants existantes)
-- =====================================================================

-- -----------------------------------------------------------------------
-- TABLE abonnements — ajout des champs manquants pour le paiement manuel
-- -----------------------------------------------------------------------

-- Preuve de paiement : clé R2 (pas l'URL publique — cf. SEC-06)
-- Exemple : "paiements/{tenant_id}/{uuid}.jpg"
ALTER TABLE abonnements
  ADD COLUMN IF NOT EXISTS preuve_paiement_url TEXT;

-- Référence de paiement unique auto-générée (aide-mémoire de rapprochement)
-- Format : MM-SLUG-YYYYMM-XXXXXX (ex: MM-CHEZFT-202607-A3F9B2)
-- SEC-10 : cette référence n'autorise rien — elle sert uniquement au rapprochement
ALTER TABLE abonnements
  ADD COLUMN IF NOT EXISTS reference_paiement TEXT;

-- Horodatage de soumission de la preuve par le restaurant
ALTER TABLE abonnements
  ADD COLUMN IF NOT EXISTS soumis_le TIMESTAMPTZ;

-- Deadline de confirmation : soumis_le + 72h
-- Au-delà, le cron "30 */6 * * *" passe l'abonnement en 'expire'
-- et le tenant en 'inactif' (cf. api-cron.ts bloquerPaiementsExpires)
ALTER TABLE abonnements
  ADD COLUMN IF NOT EXISTS delai_confirmation_expire_le TIMESTAMPTZ;

-- Audit trail : qui a confirmé le paiement (user_id de la session admin)
-- SEC-04 : non renseigné dans l'existant — correction obligatoire
ALTER TABLE abonnements
  ADD COLUMN IF NOT EXISTS confirme_par TEXT;

-- Horodatage exact de la confirmation admin
ALTER TABLE abonnements
  ADD COLUMN IF NOT EXISTS confirme_le TIMESTAMPTZ;

-- Audit trail : qui a rejeté le paiement
ALTER TABLE abonnements
  ADD COLUMN IF NOT EXISTS rejete_par TEXT;

-- Horodatage du rejet
ALTER TABLE abonnements
  ADD COLUMN IF NOT EXISTS rejete_le TIMESTAMPTZ;

-- Motif de rejet obligatoire (affiché au restaurant dans sa notification)
ALTER TABLE abonnements
  ADD COLUMN IF NOT EXISTS motif_rejet TEXT;

-- Méthode de paiement déclarée par le restaurant (Mobile Money, virement, etc.)
ALTER TABLE abonnements
  ADD COLUMN IF NOT EXISTS methode_paiement TEXT;

-- -----------------------------------------------------------------------
-- Mise à jour du CHECK statut pour inclure 'en_attente_confirmation'
-- Cf. audit 06-synchronisation.md §8 : nouveau statut intermédiaire
--
-- Avant : CHECK (statut IN ('actif', 'expire', 'annule', 'en_retard'))
-- Après : ajoute 'en_attente_confirmation'
-- -----------------------------------------------------------------------
ALTER TABLE abonnements DROP CONSTRAINT IF EXISTS abonnements_statut_check;
ALTER TABLE abonnements ADD CONSTRAINT abonnements_statut_check
  CHECK (statut IN ('actif', 'expire', 'annule', 'en_retard', 'en_attente_confirmation'));

-- -----------------------------------------------------------------------
-- TABLE tenants — champs pour le suivi du paiement en attente
-- -----------------------------------------------------------------------

-- Horodatage du moment où le tenant a soumis sa preuve de paiement
-- Utilisé par le dashboard restaurant (bandeau "paiement en cours") et l'admin
ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS paiement_en_attente_depuis TIMESTAMPTZ;

-- Référence de paiement active (dernière référence générée pour ce tenant)
-- Permettra au restaurant de retrouver sa référence sans appel API
ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS reference_paiement_active TEXT;

-- -----------------------------------------------------------------------
-- Index pour la performance du cron 72h (bloquerPaiementsExpires)
-- Partial index : uniquement sur les lignes 'en_attente_confirmation'
-- -----------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_abonnements_delai_confirmation
  ON abonnements (delai_confirmation_expire_le)
  WHERE statut = 'en_attente_confirmation';

-- Index pour le dashboard admin (liste des paiements en attente, ordre antéchrono)
CREATE INDEX IF NOT EXISTS idx_abonnements_en_attente
  ON abonnements (soumis_le DESC)
  WHERE statut = 'en_attente_confirmation';

-- Index pour l'idempotence (vérifier un seul en_attente_confirmation par tenant)
CREATE INDEX IF NOT EXISTS idx_abonnements_tenant_attente
  ON abonnements (tenant_id)
  WHERE statut = 'en_attente_confirmation';
