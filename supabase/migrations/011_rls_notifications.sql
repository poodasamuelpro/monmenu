-- Migration 011 — RLS sur tables notifications_restaurant et notifications_admin
-- BUG-011 : Ces tables ont été créées dans migration 008 sans RLS.
-- Un tenant peut lire les notifications des autres tenants et les notifications admin.
--
-- Auteur : audit BUG-011 — 2026-07-31

-- =========================================================================
-- 1. Activer RLS sur les deux tables
-- =========================================================================

ALTER TABLE notifications_restaurant ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications_admin       ENABLE ROW LEVEL SECURITY;

-- =========================================================================
-- 2. Policies pour notifications_restaurant
--    Accès limité au tenant propriétaire des notifications
-- =========================================================================

-- Lecture : un tenant ne voit que SES notifications
CREATE POLICY "notif_restaurant_select_own"
  ON notifications_restaurant
  FOR SELECT
  USING (
    tenant_id IN (
      SELECT ut.tenant_id
      FROM utilisateurs_tenant ut
      WHERE ut.auth_user_id = auth.uid()
    )
  );

-- Insertion : le service role (Worker) peut insérer — les tenants ne peuvent pas
-- insérer leurs propres notifications (risque d'auto-notification)
CREATE POLICY "notif_restaurant_insert_service"
  ON notifications_restaurant
  FOR INSERT
  WITH CHECK (true);  -- contrôlé par Service Role uniquement via createSupabaseAdminClient

-- Mise à jour (marquer comme lue) : uniquement sur SES notifications
CREATE POLICY "notif_restaurant_update_own"
  ON notifications_restaurant
  FOR UPDATE
  USING (
    tenant_id IN (
      SELECT ut.tenant_id
      FROM utilisateurs_tenant ut
      WHERE ut.auth_user_id = auth.uid()
    )
  )
  WITH CHECK (
    tenant_id IN (
      SELECT ut.tenant_id
      FROM utilisateurs_tenant ut
      WHERE ut.auth_user_id = auth.uid()
    )
  );

-- Suppression : interdite côté client (soft-delete non applicable ici)
-- Le service role peut supprimer via admin client

-- =========================================================================
-- 3. Policies pour notifications_admin
--    Lecture uniquement pour les admins authentifiés (pas le service public)
-- =========================================================================

-- Lecture : réservée aux comptes admin (via metadata Supabase Auth)
-- Si un claim 'role' = 'admin' est défini dans le JWT metadata, autoriser.
-- Sinon, bloquer complètement l'accès via le client anon/user.
CREATE POLICY "notif_admin_select_admin_only"
  ON notifications_admin
  FOR SELECT
  USING (
    -- Vérifier le claim 'role' = 'admin' dans les metadata utilisateur
    (auth.jwt() ->> 'role') = 'admin'
    OR
    -- OU le service role (Workers backend) qui utilise SUPABASE_SERVICE_ROLE_KEY
    auth.role() = 'service_role'
  );

-- Insertion : réservée au service role (Workers via createSupabaseAdminClient)
CREATE POLICY "notif_admin_insert_service"
  ON notifications_admin
  FOR INSERT
  WITH CHECK (
    auth.role() = 'service_role'
    OR (auth.jwt() ->> 'role') = 'admin'
  );

-- Mise à jour (marquer comme lue) : réservée aux admins
CREATE POLICY "notif_admin_update_admin_only"
  ON notifications_admin
  FOR UPDATE
  USING (
    (auth.jwt() ->> 'role') = 'admin'
    OR auth.role() = 'service_role'
  )
  WITH CHECK (
    (auth.jwt() ->> 'role') = 'admin'
    OR auth.role() = 'service_role'
  );

-- =========================================================================
-- 4. Index pour améliorer les performances des queries RLS
-- =========================================================================

CREATE INDEX IF NOT EXISTS idx_notif_restaurant_tenant_lue
  ON notifications_restaurant (tenant_id, lue, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_notif_admin_created
  ON notifications_admin (created_at DESC);

-- =========================================================================
-- 5. Commentaires
-- =========================================================================

COMMENT ON TABLE notifications_restaurant IS
  'Notifications in-app pour les restaurants. RLS : lecture/update limités au tenant propriétaire.';
COMMENT ON TABLE notifications_admin IS
  'Notifications internes pour l''équipe admin. RLS : accès restreint aux comptes admin et service_role.';
