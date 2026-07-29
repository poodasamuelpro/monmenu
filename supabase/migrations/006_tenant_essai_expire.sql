-- Ajoute la date de fin d'essai sur tenants (Supabase — tenants y vit déjà).
ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS essai_expire_le TIMESTAMPTZ;

-- Backfill : les tenants déjà en essai sans date reçoivent 14 jours
-- à partir de leur created_at, pour ne pas les faire basculer en
-- inactif immédiatement au premier passage du cron après déploiement.
UPDATE tenants
SET essai_expire_le = created_at + INTERVAL '14 days'
WHERE statut = 'essai' AND essai_expire_le IS NULL;

-- Index pour que le cron nocturne retrouve vite les essais à vérifier.
CREATE INDEX IF NOT EXISTS idx_tenants_essai_expire
  ON tenants (essai_expire_le)
  WHERE statut = 'essai' AND deleted_at IS NULL;
