-- Migration 016 — Flux de suppression de compte (Session 3 — Correction #11)
--
-- Ajoute les colonnes nécessaires au flux de suppression de compte validé
-- par admin (soft-delete programmé sur 30 jours) :
--
--   suppression_demandee_le        : horodatage de la demande initiale
--   suppression_prevue_le          : date programmée (demande + 30 jours)
--   suppression_token              : token à usage unique envoyé par email
--                                    pour confirmer la demande (UUID)
--   suppression_token_expire_le    : expiration du token de confirmation (48h)
--
-- La colonne deleted_at existante gère la suppression définitive réelle.
-- Ces nouvelles colonnes gèrent uniquement la phase de préparation.

ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS suppression_demandee_le TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS suppression_prevue_le TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS suppression_token TEXT UNIQUE,
  ADD COLUMN IF NOT EXISTS suppression_token_expire_le TIMESTAMPTZ;

-- Index pour la recherche admin des suppressions en attente
CREATE INDEX IF NOT EXISTS idx_tenants_suppression_prevue
  ON tenants(suppression_prevue_le)
  WHERE suppression_prevue_le IS NOT NULL AND deleted_at IS NULL;

-- Index pour la validation du token de confirmation
CREATE INDEX IF NOT EXISTS idx_tenants_suppression_token
  ON tenants(suppression_token)
  WHERE suppression_token IS NOT NULL;

COMMENT ON COLUMN tenants.suppression_demandee_le IS 'Horodatage de la demande de suppression du compte par le restaurateur';
COMMENT ON COLUMN tenants.suppression_prevue_le IS 'Date programmée de suppression définitive (= demande + 30 jours)';
COMMENT ON COLUMN tenants.suppression_token IS 'Token UUID à usage unique pour confirmer la demande de suppression par email (expire en 48h)';
COMMENT ON COLUMN tenants.suppression_token_expire_le IS 'Date d''expiration du token de confirmation (48h après la demande)';
