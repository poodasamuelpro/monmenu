-- =====================================================
-- MonMenu — Migration 002 : Row Level Security (RLS)
-- Section 4.2 du cahier des charges
-- =====================================================

-- Activer RLS sur toutes les tables sensibles
ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE utilisateurs_tenant ENABLE ROW LEVEL SECURITY;
ALTER TABLE points_de_vente ENABLE ROW LEVEL SECURITY;
ALTER TABLE categories_menu ENABLE ROW LEVEL SECURITY;
ALTER TABLE produits ENABLE ROW LEVEL SECURITY;
ALTER TABLE variantes_produits ENABLE ROW LEVEL SECURITY;
ALTER TABLE livreurs ENABLE ROW LEVEL SECURITY;
ALTER TABLE commandes ENABLE ROW LEVEL SECURITY;
ALTER TABLE commandes_historique ENABLE ROW LEVEL SECURITY;
ALTER TABLE abonnements ENABLE ROW LEVEL SECURITY;
ALTER TABLE stats_journalieres ENABLE ROW LEVEL SECURITY;
ALTER TABLE codes_promo ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;

-- Tables publiques (lecture libre)
ALTER TABLE pays ENABLE ROW LEVEL SECURITY;
ALTER TABLE plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE modes_paiement ENABLE ROW LEVEL SECURITY;
ALTER TABLE config_globale ENABLE ROW LEVEL SECURITY;

-- =====================================================
-- Helper : obtenir le tenant_id de l'utilisateur connecté
-- =====================================================
CREATE OR REPLACE FUNCTION get_user_tenant_id()
RETURNS UUID AS $$
  SELECT tenant_id FROM utilisateurs_tenant
  WHERE auth_user_id = auth.uid()
  LIMIT 1;
$$ LANGUAGE SQL SECURITY DEFINER STABLE;

-- =====================================================
-- POLICIES : Tables publiques (SELECT sans restriction)
-- =====================================================

-- pays
CREATE POLICY "pays_public_read" ON pays FOR SELECT USING (actif = true);

-- plans
CREATE POLICY "plans_public_read" ON plans FOR SELECT USING (actif = true);

-- modes_paiement
CREATE POLICY "modes_paiement_public_read" ON modes_paiement FOR SELECT USING (true);

-- config_globale (lecture publique, jamais écriture depuis client)
CREATE POLICY "config_globale_public_read" ON config_globale FOR SELECT USING (true);

-- =====================================================
-- POLICIES : tenants
-- =====================================================

-- Lecture publique des boutiques actives (pour les pages boutique)
CREATE POLICY "tenants_public_read" ON tenants
  FOR SELECT
  USING (
    statut IN ('actif', 'essai')
    AND deleted_at IS NULL
    AND (
      -- Accès public : seulement les champs non sensibles via select limité
      current_setting('request.jwt.claims', true)::json->>'role' = 'anon'
      -- Restaurant connecté voit sa propre boutique
      OR id = get_user_tenant_id()
    )
  );

-- Un restaurant ne peut modifier que ses propres données
CREATE POLICY "tenants_owner_update" ON tenants
  FOR UPDATE
  USING (id = get_user_tenant_id())
  WITH CHECK (id = get_user_tenant_id());

-- Insertion : via service_role uniquement (inscription gérée côté Worker)
CREATE POLICY "tenants_insert_service" ON tenants
  FOR INSERT
  WITH CHECK (
    current_setting('request.jwt.claims', true)::json->>'role' = 'service_role'
  );

-- =====================================================
-- POLICIES : utilisateurs_tenant
-- =====================================================

CREATE POLICY "utilisateurs_tenant_own_read" ON utilisateurs_tenant
  FOR SELECT
  USING (
    tenant_id = get_user_tenant_id()
    OR auth_user_id = auth.uid()
  );

CREATE POLICY "utilisateurs_tenant_own_update" ON utilisateurs_tenant
  FOR UPDATE
  USING (auth_user_id = auth.uid())
  WITH CHECK (auth_user_id = auth.uid());

-- =====================================================
-- POLICIES : points_de_vente
-- =====================================================

-- Lecture publique des PDV actifs (pour le calcul de livraison)
CREATE POLICY "pdv_public_read" ON points_de_vente
  FOR SELECT
  USING (actif = true);

-- CRUD uniquement pour le propriétaire du tenant
CREATE POLICY "pdv_owner_all" ON points_de_vente
  FOR ALL
  USING (tenant_id = get_user_tenant_id())
  WITH CHECK (tenant_id = get_user_tenant_id());

-- =====================================================
-- POLICIES : categories_menu + produits
-- =====================================================

-- Lecture publique des menus
CREATE POLICY "categories_public_read" ON categories_menu
  FOR SELECT
  USING (actif = true);

CREATE POLICY "categories_owner_all" ON categories_menu
  FOR ALL
  USING (tenant_id = get_user_tenant_id())
  WITH CHECK (tenant_id = get_user_tenant_id());

CREATE POLICY "produits_public_read" ON produits
  FOR SELECT
  USING (deleted_at IS NULL);

CREATE POLICY "produits_owner_all" ON produits
  FOR ALL
  USING (tenant_id = get_user_tenant_id())
  WITH CHECK (tenant_id = get_user_tenant_id());

-- =====================================================
-- POLICIES : commandes
-- =====================================================

-- Insertion publique (client qui commande — pas de compte requis)
CREATE POLICY "commandes_public_insert" ON commandes
  FOR INSERT
  WITH CHECK (true);

-- Lecture publique pour le suivi (token unique)
CREATE POLICY "commandes_public_suivi" ON commandes
  FOR SELECT
  USING (
    -- Accès via token de suivi (géré au niveau Worker, pas via PostgREST direct)
    tenant_id = get_user_tenant_id()
    OR deleted_at IS NULL
  );

-- Restaurant voit seulement ses propres commandes
CREATE POLICY "commandes_tenant_read" ON commandes
  FOR SELECT
  USING (
    tenant_id = get_user_tenant_id()
    AND deleted_at IS NULL
  );

CREATE POLICY "commandes_tenant_update" ON commandes
  FOR UPDATE
  USING (tenant_id = get_user_tenant_id())
  WITH CHECK (tenant_id = get_user_tenant_id());

-- =====================================================
-- POLICIES : commandes_historique
-- =====================================================

CREATE POLICY "historique_tenant_read" ON commandes_historique
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM commandes c
      WHERE c.id = commandes_historique.commande_id
      AND c.tenant_id = get_user_tenant_id()
    )
  );

CREATE POLICY "historique_insert" ON commandes_historique
  FOR INSERT
  WITH CHECK (true);

-- =====================================================
-- POLICIES : stats, abonnements, audit (tenant only)
-- =====================================================

CREATE POLICY "stats_tenant_read" ON stats_journalieres
  FOR SELECT
  USING (tenant_id = get_user_tenant_id());

CREATE POLICY "abonnements_tenant_read" ON abonnements
  FOR SELECT
  USING (tenant_id = get_user_tenant_id());

CREATE POLICY "codes_promo_tenant_all" ON codes_promo
  FOR ALL
  USING (tenant_id = get_user_tenant_id())
  WITH CHECK (tenant_id = get_user_tenant_id());

-- audit_log : lecture service_role uniquement
CREATE POLICY "audit_service_only" ON audit_log
  FOR ALL
  USING (
    current_setting('request.jwt.claims', true)::json->>'role' = 'service_role'
  );

CREATE POLICY "livreurs_tenant_all" ON livreurs
  FOR ALL
  USING (tenant_id = get_user_tenant_id())
  WITH CHECK (tenant_id = get_user_tenant_id());

CREATE POLICY "variantes_public_read" ON variantes_produits
  FOR SELECT
  USING (disponible = true);

CREATE POLICY "variantes_owner_all" ON variantes_produits
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM produits p
      WHERE p.id = variantes_produits.produit_id
      AND p.tenant_id = get_user_tenant_id()
    )
  );
