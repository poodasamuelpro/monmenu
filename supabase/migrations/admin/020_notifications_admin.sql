-- ============================================================
-- MIGRATION MonMenu — 020 : Notifications in-app du panel admin
-- ============================================================
-- Objectif : créer la table `notifications_admin` utilisée par le panel
-- administrateur (src/routes/notifications.ts du dépôt monmenu-admin) :
-- badges "non lues", flux paginé, notifications dérivées (essais expirants,
-- nouveaux restaurants, brouillons, paiements).
--
-- Cette migration est idempotente ET auto-réparatrice :
--   • si la table n'existe pas → elle est créée complète
--   • si la table existe mais sans certaines colonnes (état partiel d'une
--     exécution antérieure) → les colonnes et index manquants sont ajoutés
--     sans supprimer les lignes existantes
--   • si la table est complète → rien n'est fait (0 ms)
--
-- Ordre d'application : APRÈS la migration 019 (suppléments généraux).
-- ============================================================

-- ── 1. Table notifications_admin ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS notifications_admin (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID DEFAULT NULL,             -- contexte tenant (optionnel)
  type TEXT NOT NULL CHECK (type IN ('info', 'warning', 'success', 'error')),
  titre TEXT NOT NULL,
  message TEXT NOT NULL,
  lien TEXT DEFAULT NULL,                  -- route anchor côté panel (#paiements...)
  payload JSONB DEFAULT NULL,              -- contient { source_key: "..." } pour les
                                             -- notifications dérivées (déduplication via
                                             -- l'expression payload->>'source_key')
  lue BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── 1bis. Auto-réparation : colonnes manquantes si la table préexistait ──────
DO $$
BEGIN
  -- tenant_id (contexte tenant, paiements d'un restaurant spécifique)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'notifications_admin' AND column_name = 'tenant_id'
  ) THEN
    ALTER TABLE notifications_admin ADD COLUMN tenant_id UUID DEFAULT NULL;
  END IF;

  -- type, titre, message, payload, lue, created_at : le schéma attendu
  -- Vérification de chaque colonne attendue, ajout si absente
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'notifications_admin' AND column_name = 'type'
  ) THEN
    ALTER TABLE notifications_admin ADD COLUMN type TEXT NOT NULL DEFAULT 'info'
      CHECK (type IN ('info', 'warning', 'success', 'error'));
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'notifications_admin' AND column_name = 'titre'
  ) THEN
    ALTER TABLE notifications_admin ADD COLUMN titre TEXT NOT NULL DEFAULT '';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'notifications_admin' AND column_name = 'message'
  ) THEN
    ALTER TABLE notifications_admin ADD COLUMN message TEXT NOT NULL DEFAULT '';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'notifications_admin' AND column_name = 'lien'
  ) THEN
    ALTER TABLE notifications_admin ADD COLUMN lien TEXT DEFAULT NULL;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'notifications_admin' AND column_name = 'payload'
  ) THEN
    ALTER TABLE notifications_admin ADD COLUMN payload JSONB DEFAULT NULL;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'notifications_admin' AND column_name = 'lue'
  ) THEN
    ALTER TABLE notifications_admin ADD COLUMN lue BOOLEAN NOT NULL DEFAULT false;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'notifications_admin' AND column_name = 'created_at'
  ) THEN
    ALTER TABLE notifications_admin ADD COLUMN created_at TIMESTAMPTZ NOT NULL DEFAULT now();
  END IF;

  -- Suppression de la colonne sourceKey si une version antérieure (fausse)
  -- de la migration l'avait ajoutée : elle est remplacée par le payload.
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'notifications_admin' AND column_name = 'sourcekey'
  ) THEN
    ALTER TABLE notifications_admin DROP COLUMN sourcekey;
  END IF;
END $$;

-- Contrainte CHECK sur type : ajoutée aussi si la table préexistait sans elle
-- (ADD CONSTRAINT IF NOT EXISTS n'existe pas en PostgreSQL → on vérifie dans pg_constraint)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_class
    WHERE relname = 'notifications_admin'
  ) AND NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'notifications_admin_type_check'
      AND conrelid = (SELECT oid FROM pg_class WHERE relname = 'notifications_admin')
  ) THEN
    ALTER TABLE notifications_admin
      ADD CONSTRAINT notifications_admin_type_check
      CHECK (type IN ('info', 'warning', 'success', 'error'));
  END IF;
END $$;

-- ── 2. Index (tous IF NOT EXISTS — sûrs si la table préexistait) ────────────
-- Flux principal : triées par date décroissante
CREATE INDEX IF NOT EXISTS idx_notifications_admin_created_at
  ON notifications_admin(created_at DESC);
-- Filtre "non lues"
CREATE INDEX IF NOT EXISTS idx_notifications_admin_lue
  ON notifications_admin(lue)
  WHERE lue = false;
-- Déduplication des notifications dérivées (expression index sur payload)
CREATE INDEX IF NOT EXISTS idx_notifications_admin_payload_source_key
  ON notifications_admin ((payload->>'source_key'))
  WHERE payload->>'source_key' IS NOT NULL;
-- Contexte tenant (paiement d'un restaurant spécifique)
CREATE INDEX IF NOT EXISTS idx_notifications_admin_tenant
  ON notifications_admin(tenant_id, created_at DESC)
  WHERE tenant_id IS NOT NULL;

-- ── 3. RLS : seules les requêtes service_role (panel admin / webhooks) ──────
-- peuvent écrire ; personne ne lit cette table côté client.
ALTER TABLE notifications_admin ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS notifications_admin_service_role_all ON notifications_admin;
CREATE POLICY notifications_admin_service_role_all
  ON notifications_admin
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- ── 4. Nettoyage : archiver les notifications lues de plus de 30 jours ──────
-- Fonction exécutable à la main (ou via cron) — pas de cron dans le repo admin.
CREATE OR REPLACE FUNCTION cleanup_notifications_admin(max_age_days INTEGER DEFAULT 30)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM notifications_admin
  WHERE lue = true
    AND created_at < now() - (max_age_days || ' days')::INTERVAL;
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$;
-- ── FIN MIGRATION ──────────────────────────────────────────────────────────
-- ROLLBACK (à exécuter manuellement si nécessaire) :
--
-- DROP FUNCTION IF EXISTS cleanup_notifications_admin;
-- DROP POLICY IF EXISTS notifications_admin_service_role_all ON notifications_admin;
-- ALTER TABLE notifications_admin DISABLE ROW LEVEL SECURITY;
-- DROP INDEX IF EXISTS idx_notifications_admin_tenant;
-- DROP INDEX IF EXISTS idx_notifications_admin_payload_source_key;
-- DROP INDEX IF EXISTS idx_notifications_admin_lue;
-- DROP INDEX IF EXISTS idx_notifications_admin_created_at;
-- DROP TABLE IF EXISTS notifications_admin;
