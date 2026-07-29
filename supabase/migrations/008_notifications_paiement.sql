-- =====================================================================
-- Migration 008 : Tables de notifications in-app (restaurant + admin)
-- Référence : audit 07-notifications-inapp-bdd.md §2.2
-- Date : 2026-07-29
--
-- Objectif : Créer les tables de notifications persistantes pour :
--   1. notifications_restaurant : bandeaux dans le dashboard web/mobile
--   2. notifications_admin : alertes critiques dans le dashboard admin
--
-- Ces tables permettent de persister les notifications (vs les notifications
-- générées à la volée dans notifications.ts qui ne sont pas marquables lues).
-- =====================================================================

-- -----------------------------------------------------------------------
-- TABLE notifications_restaurant
-- Consommée par GET /api/v1/dashboard/notifications (api-dashboard.ts)
-- Peuplée par : POST /api/v1/paiement/soumettre, confirmation admin, rejet, cron 72h
-- -----------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS notifications_restaurant (
  id           UUID     PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    UUID     NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  type         TEXT     NOT NULL CHECK (type IN ('info', 'warning', 'success', 'error')),
  titre        TEXT     NOT NULL,
  message      TEXT     NOT NULL,
  lue          BOOLEAN  NOT NULL DEFAULT false,
  lien         TEXT,
  -- payload JSON optionnel (ex: {abonnement_id, plan_nom, date_fin})
  payload      JSONB,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index : lecture rapide des non-lues d'un tenant (bandeau dashboard)
CREATE INDEX IF NOT EXISTS idx_notif_restaurant_tenant
  ON notifications_restaurant (tenant_id, created_at DESC)
  WHERE lue = false;

-- Index pour le marquage en masse "tout lire"
CREATE INDEX IF NOT EXISTS idx_notif_restaurant_tenant_toutes
  ON notifications_restaurant (tenant_id, created_at DESC);

-- -----------------------------------------------------------------------
-- TABLE notifications_admin
-- Consommée par GET /api/admin/notifications (notifications.ts)
-- Peuplée par : POST /api/v1/paiement/soumettre (via webhook ou insert direct)
-- -----------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS notifications_admin (
  id           UUID     PRIMARY KEY DEFAULT gen_random_uuid(),
  type         TEXT     NOT NULL CHECK (type IN ('info', 'warning', 'success', 'error')),
  titre        TEXT     NOT NULL,
  message      TEXT     NOT NULL,
  lue          BOOLEAN  NOT NULL DEFAULT false,
  lien         TEXT,
  -- payload JSON : données associées (tenant_id, abonnement_id, soumis_le, etc.)
  payload      JSONB,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index principal : non-lues uniquement, ordre antéchronologique
CREATE INDEX IF NOT EXISTS idx_notif_admin_lue
  ON notifications_admin (lue, created_at DESC);

-- Index pour nettoyage automatique (garder 90 jours)
CREATE INDEX IF NOT EXISTS idx_notif_admin_created
  ON notifications_admin (created_at DESC);
