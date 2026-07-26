-- =====================================================
-- MonMenu — Migration 001 : Schéma initial complet
-- Section 4.3 du cahier des charges
-- =====================================================

-- Activer les extensions nécessaires
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- =====================================================
-- TABLE : pays
-- =====================================================
CREATE TABLE IF NOT EXISTS pays (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code_iso CHAR(2) NOT NULL UNIQUE,
  nom TEXT NOT NULL,
  devise TEXT NOT NULL,
  symbole_devise TEXT NOT NULL DEFAULT 'FCFA',
  indicatif_tel TEXT NOT NULL,
  langue_defaut TEXT NOT NULL DEFAULT 'fr',
  actif BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Données initiales pays
INSERT INTO pays (code_iso, nom, devise, symbole_devise, indicatif_tel, langue_defaut) VALUES
  ('BF', 'Burkina Faso', 'XOF', 'FCFA', '+226', 'fr'),
  ('CI', 'Côte d''Ivoire', 'XOF', 'FCFA', '+225', 'fr'),
  ('CM', 'Cameroun', 'XAF', 'FCFA', '+237', 'fr'),
  ('ML', 'Mali', 'XOF', 'FCFA', '+223', 'fr'),
  ('SN', 'Sénégal', 'XOF', 'FCFA', '+221', 'fr')
ON CONFLICT (code_iso) DO NOTHING;

-- =====================================================
-- TABLE : config_globale
-- =====================================================
CREATE TABLE IF NOT EXISTS config_globale (
  cle TEXT PRIMARY KEY,
  valeur TEXT NOT NULL,
  description TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Config initiale
INSERT INTO config_globale (cle, valeur, description) VALUES
  ('nom_projet', 'MonMenu', 'Nom affiché sur la plateforme'),
  ('version', '1.0.0', 'Version de la plateforme'),
  ('maintenance', 'false', 'Mode maintenance global'),
  ('support_email', 'support@monmenu.app', 'Email de support'),
  ('support_whatsapp', '+22600000000', 'Numéro WhatsApp support')
ON CONFLICT (cle) DO NOTHING;

-- =====================================================
-- TABLE : plans
-- =====================================================
CREATE TABLE IF NOT EXISTS plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nom TEXT NOT NULL,
  description TEXT,
  prix_mensuel NUMERIC(10,2) NOT NULL DEFAULT 0,
  prix_annuel NUMERIC(10,2) NOT NULL DEFAULT 0,
  devise TEXT NOT NULL DEFAULT 'XOF',
  commandes_incluses INTEGER NOT NULL DEFAULT 100,
  frais_par_commande NUMERIC(8,2) NOT NULL DEFAULT 0,
  limite_pdv INTEGER NOT NULL DEFAULT 1,
  fonctionnalites JSONB NOT NULL DEFAULT '{}',
  actif BOOLEAN NOT NULL DEFAULT true,
  ordre_affichage INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Plans initiaux
INSERT INTO plans (nom, description, prix_mensuel, prix_annuel, commandes_incluses, frais_par_commande, limite_pdv, fonctionnalites, ordre_affichage) VALUES
  ('Gratuit', 'Pour démarrer et tester', 0, 0, 30, 0, 1,
   '{"boutique_en_ligne": true, "whatsapp_notifications": true, "qrcode": true, "stats_basiques": true, "support_email": false, "livreurs": false, "codes_promo": false}',
   0),
  ('Starter', 'Pour les petits restaurants', 9500, 95000, 200, 50, 1,
   '{"boutique_en_ligne": true, "whatsapp_notifications": true, "qrcode": true, "stats_basiques": true, "support_email": true, "livreurs": true, "codes_promo": false, "export_csv": false}',
   1),
  ('Pro', 'Le plus populaire', 19500, 195000, 1000, 25, 3,
   '{"boutique_en_ligne": true, "whatsapp_notifications": true, "qrcode_custom": true, "stats_avancees": true, "support_email": true, "livreurs": true, "codes_promo": true, "export_csv": true, "domaine_perso": true}',
   2),
  ('Premium', 'Pour les restaurants à fort volume', 39500, 395000, 5000, 10, 10,
   '{"boutique_en_ligne": true, "whatsapp_notifications": true, "qrcode_custom": true, "stats_avancees": true, "support_prioritaire": true, "livreurs": true, "codes_promo": true, "export_csv": true, "domaine_perso": true, "api_access": true, "webhooks": true}',
   3)
ON CONFLICT DO NOTHING;

-- =====================================================
-- TABLE : tenants (restaurants)
-- =====================================================
CREATE TABLE IF NOT EXISTS tenants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pays_id UUID NOT NULL REFERENCES pays(id),
  nom TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  logo_url TEXT,
  banniere_url TEXT,
  couleur_primaire CHAR(7) NOT NULL DEFAULT '#DC2626',
  couleur_secondaire CHAR(7) NOT NULL DEFAULT '#1D4ED8',
  whatsapp_number TEXT NOT NULL,
  domaine_perso TEXT UNIQUE,
  statut TEXT NOT NULL DEFAULT 'essai'
    CHECK (statut IN ('essai', 'actif', 'inactif', 'suspendu')),
  plan_id UUID REFERENCES plans(id),
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_tenants_slug ON tenants(slug) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_tenants_statut ON tenants(statut) WHERE deleted_at IS NULL;

-- =====================================================
-- TABLE : utilisateurs_tenant
-- =====================================================
CREATE TABLE IF NOT EXISTS utilisateurs_tenant (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  auth_user_id UUID NOT NULL UNIQUE,
  role TEXT NOT NULL DEFAULT 'proprietaire'
    CHECK (role IN ('proprietaire', 'gestionnaire', 'employe')),
  nom TEXT NOT NULL,
  telephone TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_utilisateurs_tenant_tenant ON utilisateurs_tenant(tenant_id);
CREATE INDEX IF NOT EXISTS idx_utilisateurs_tenant_auth ON utilisateurs_tenant(auth_user_id);

-- =====================================================
-- TABLE : points_de_vente
-- =====================================================
CREATE TABLE IF NOT EXISTS points_de_vente (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  nom TEXT NOT NULL,
  adresse TEXT NOT NULL,
  latitude NUMERIC(10,7),
  longitude NUMERIC(10,7),
  zone_livraison_geojson JSONB,
  horaires JSONB,
  tarif_livraison_base NUMERIC(8,2) DEFAULT 500,
  tarif_par_km NUMERIC(8,2) DEFAULT 200,
  actif BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pdv_tenant ON points_de_vente(tenant_id) WHERE actif = true;

-- =====================================================
-- TABLE : categories_menu
-- =====================================================
CREATE TABLE IF NOT EXISTS categories_menu (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  nom TEXT NOT NULL,
  description TEXT,
  ordre_affichage INTEGER NOT NULL DEFAULT 0,
  actif BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_categories_tenant ON categories_menu(tenant_id, ordre_affichage) WHERE actif = true;

-- =====================================================
-- TABLE : produits
-- =====================================================
CREATE TABLE IF NOT EXISTS produits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  categorie_id UUID NOT NULL REFERENCES categories_menu(id) ON DELETE CASCADE,
  nom TEXT NOT NULL,
  description TEXT,
  prix NUMERIC(10,2) NOT NULL CHECK (prix >= 0),
  photo_url TEXT,
  disponible BOOLEAN NOT NULL DEFAULT true,
  ordre_affichage INTEGER NOT NULL DEFAULT 0,
  stock_actuel INTEGER,
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_produits_tenant ON produits(tenant_id, ordre_affichage)
  WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_produits_categorie ON produits(categorie_id)
  WHERE deleted_at IS NULL;

-- =====================================================
-- TABLE : variantes_produits
-- =====================================================
CREATE TABLE IF NOT EXISTS variantes_produits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  produit_id UUID NOT NULL REFERENCES produits(id) ON DELETE CASCADE,
  nom TEXT NOT NULL,
  prix_supplement NUMERIC(8,2) NOT NULL DEFAULT 0,
  disponible BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_variantes_produit ON variantes_produits(produit_id);

-- =====================================================
-- TABLE : modes_paiement
-- =====================================================
CREATE TABLE IF NOT EXISTS modes_paiement (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  nom TEXT NOT NULL,
  actif_par_pays JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO modes_paiement (code, nom, actif_par_pays) VALUES
  ('especes_livraison', 'Espèces à la livraison', '{"BF": true, "CI": true, "CM": true, "ML": true, "SN": true}'),
  ('mobile_money', 'Mobile Money', '{"BF": false, "CI": false, "CM": false}'),
  ('carte_bancaire', 'Carte bancaire', '{"BF": false, "CI": false}')
ON CONFLICT (code) DO NOTHING;

-- =====================================================
-- TABLE : commandes
-- =====================================================
CREATE TABLE IF NOT EXISTS commandes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  point_de_vente_id UUID NOT NULL REFERENCES points_de_vente(id),
  client_nom TEXT NOT NULL,
  client_telephone TEXT NOT NULL,
  client_adresse TEXT,
  client_latitude NUMERIC(10,7),
  client_longitude NUMERIC(10,7),
  -- Figé au moment de la commande — immuable après création
  items_json JSONB NOT NULL,
  montant_total NUMERIC(10,2) NOT NULL CHECK (montant_total >= 0),
  frais_livraison NUMERIC(8,2) NOT NULL DEFAULT 0,
  mode_paiement TEXT NOT NULL REFERENCES modes_paiement(code),
  statut TEXT NOT NULL DEFAULT 'en_attente'
    CHECK (statut IN ('en_attente', 'confirmee', 'en_preparation', 'en_livraison', 'livree', 'annulee', 'remboursee')),
  livreur_id UUID REFERENCES livreurs(id),
  token_suivi TEXT NOT NULL UNIQUE,
  idempotency_key UUID NOT NULL UNIQUE,
  notes TEXT,
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_commandes_tenant ON commandes(tenant_id, created_at DESC)
  WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_commandes_statut ON commandes(tenant_id, statut)
  WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_commandes_token ON commandes(token_suivi);
CREATE INDEX IF NOT EXISTS idx_commandes_idempotency ON commandes(idempotency_key);

-- =====================================================
-- TABLE : livreurs
-- =====================================================
CREATE TABLE IF NOT EXISTS livreurs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  nom TEXT NOT NULL,
  whatsapp_number TEXT NOT NULL,
  actif BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_livreurs_tenant ON livreurs(tenant_id) WHERE actif = true;

-- Maintenant on peut ajouter la contrainte FK sur commandes.livreur_id
-- (La table livreurs est créée ci-dessus)
ALTER TABLE commandes
  ADD CONSTRAINT fk_commandes_livreur
  FOREIGN KEY (livreur_id) REFERENCES livreurs(id);

-- =====================================================
-- TABLE : commandes_historique
-- =====================================================
CREATE TABLE IF NOT EXISTS commandes_historique (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  commande_id UUID NOT NULL REFERENCES commandes(id) ON DELETE CASCADE,
  ancien_statut TEXT NOT NULL,
  nouveau_statut TEXT NOT NULL,
  note TEXT,
  source TEXT NOT NULL DEFAULT 'restaurant'
    CHECK (source IN ('restaurant', 'livreur', 'systeme', 'client')),
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_historique_commande ON commandes_historique(commande_id, timestamp ASC);

-- =====================================================
-- TABLE : abonnements
-- =====================================================
CREATE TABLE IF NOT EXISTS abonnements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  plan_id UUID NOT NULL REFERENCES plans(id),
  date_debut TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  date_fin TIMESTAMPTZ,
  statut TEXT NOT NULL DEFAULT 'actif'
    CHECK (statut IN ('actif', 'expire', 'annule', 'en_retard')),
  montant_paye NUMERIC(10,2),
  devise TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_abonnements_tenant ON abonnements(tenant_id, statut);

-- =====================================================
-- TABLE : stats_journalieres
-- =====================================================
CREATE TABLE IF NOT EXISTS stats_journalieres (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  date DATE NOT NULL,
  nb_commandes INTEGER NOT NULL DEFAULT 0,
  ca_total NUMERIC(12,2) NOT NULL DEFAULT 0,
  produit_top_id UUID REFERENCES produits(id),
  taux_annulation NUMERIC(5,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(tenant_id, date)
);

CREATE INDEX IF NOT EXISTS idx_stats_tenant_date ON stats_journalieres(tenant_id, date DESC);

-- =====================================================
-- TABLE : codes_promo
-- =====================================================
CREATE TABLE IF NOT EXISTS codes_promo (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('pourcentage', 'montant_fixe', 'livraison_gratuite')),
  valeur NUMERIC(8,2) NOT NULL DEFAULT 0,
  date_debut TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  date_fin TIMESTAMPTZ,
  usage_max INTEGER,
  usage_actuel INTEGER NOT NULL DEFAULT 0,
  actif BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(tenant_id, code)
);

-- =====================================================
-- TABLE : audit_log
-- =====================================================
CREATE TABLE IF NOT EXISTS audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  table_cible TEXT NOT NULL,
  ligne_id UUID NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('INSERT', 'UPDATE', 'DELETE')),
  ancien_valeur JSONB,
  nouvelle_valeur JSONB,
  auteur_id UUID,
  ip_address INET,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_timestamp ON audit_log(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_audit_table ON audit_log(table_cible, ligne_id);

-- =====================================================
-- TRIGGERS : updated_at automatique
-- =====================================================
CREATE OR REPLACE FUNCTION trigger_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
DECLARE
  t TEXT;
BEGIN
  FOR t IN SELECT unnest(ARRAY['tenants', 'utilisateurs_tenant', 'points_de_vente',
    'categories_menu', 'produits', 'commandes', 'livreurs', 'plans', 'abonnements'])
  LOOP
    EXECUTE format('
      DROP TRIGGER IF EXISTS set_updated_at ON %I;
      CREATE TRIGGER set_updated_at
        BEFORE UPDATE ON %I
        FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
    ', t, t);
  END LOOP;
END $$;
