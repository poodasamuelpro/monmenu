-- =====================================================
-- MonMenu — Migration D1 001 : Schéma SITE WEB
-- =====================================================
-- IMPORTANT : Ce fichier concerne UNIQUEMENT la base D1 Cloudflare.
-- D1 = SITE WEB UNIQUEMENT : config_globale, pays, plans
--
-- TOUTES les données applicatives (tenants, commandes, menu, livreurs,
-- codes_promo, utilisateurs_tenant, points_de_vente, commandes_historique,
-- abonnements, stats_journalieres, audit_log) sont dans Supabase PostgreSQL.
-- Voir : supabase/migrations/001_initial_schema.sql
-- =====================================================

-- TABLE : pays (référentiel géographique pour le site web / formulaire inscription)
CREATE TABLE IF NOT EXISTS pays (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))),2) || '-' || substr('89ab',abs(random()) % 4 + 1, 1) || substr(lower(hex(randomblob(2))),2) || '-' || lower(hex(randomblob(6)))),
  code_iso TEXT NOT NULL UNIQUE,
  nom TEXT NOT NULL,
  devise TEXT NOT NULL,
  symbole_devise TEXT NOT NULL DEFAULT 'FCFA',
  indicatif_tel TEXT NOT NULL,
  langue_defaut TEXT NOT NULL DEFAULT 'fr',
  actif INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Données pays (Afrique de l'Ouest + Afrique Centrale)
INSERT OR IGNORE INTO pays (code_iso, nom, devise, symbole_devise, indicatif_tel, langue_defaut) VALUES
  ('BF', 'Burkina Faso', 'XOF', 'FCFA', '+226', 'fr'),
  ('CI', 'Côte d''Ivoire', 'XOF', 'FCFA', '+225', 'fr'),
  ('CM', 'Cameroun', 'XAF', 'FCFA', '+237', 'fr'),
  ('ML', 'Mali', 'XOF', 'FCFA', '+223', 'fr'),
  ('SN', 'Sénégal', 'XOF', 'FCFA', '+221', 'fr'),
  ('TG', 'Togo', 'XOF', 'FCFA', '+228', 'fr'),
  ('BJ', 'Bénin', 'XOF', 'FCFA', '+229', 'fr'),
  ('NE', 'Niger', 'XOF', 'FCFA', '+227', 'fr'),
  ('GN', 'Guinée', 'GNF', 'GNF', '+224', 'fr'),
  ('GW', 'Guinée-Bissau', 'XOF', 'FCFA', '+245', 'pt'),
  ('MR', 'Mauritanie', 'MRU', 'MRU', '+222', 'ar'),
  ('GA', 'Gabon', 'XAF', 'FCFA', '+241', 'fr'),
  ('CG', 'Congo', 'XAF', 'FCFA', '+242', 'fr'),
  ('TD', 'Tchad', 'XAF', 'FCFA', '+235', 'fr');

-- TABLE : config_globale (configuration du site web MonMenu)
CREATE TABLE IF NOT EXISTS config_globale (
  cle TEXT PRIMARY KEY,
  valeur TEXT NOT NULL,
  description TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Configuration initiale du site web
INSERT OR IGNORE INTO config_globale (cle, valeur, description) VALUES
  ('nom_projet', 'MonMenu', 'Nom de la plateforme affiché sur le site'),
  ('url_site', 'https://monmenu.app', 'URL publique du site web'),
  ('email_contact', 'contact@monmenu.app', 'Email de contact affiché sur le site'),
  ('version', '2.0.0', 'Version courante de l''application'),
  ('maintenance_mode', 'false', 'Mode maintenance (true/false)'),
  ('inscription_ouverte', 'true', 'Autoriser les nouvelles inscriptions (true/false)'),
  ('max_tenants_gratuit', '50', 'Nombre max de restaurants en plan gratuit'),
  ('meta_description', 'MonMenu — La plateforme de commande en ligne pour les restaurants africains. Créez votre boutique en ligne en 5 minutes.', 'Description meta du site web'),
  ('whatsapp_support', '+22600000000', 'Numéro WhatsApp du support MonMenu'),
  ('twitter_handle', '@monmenuapp', 'Compte Twitter MonMenu'),
  ('pays_defaut', 'BF', 'Pays par défaut pour les nouvelles inscriptions (code ISO)');

-- TABLE : plans (offres tarifaires affichées sur la page tarifs du site web)
CREATE TABLE IF NOT EXISTS plans (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))),2) || '-' || substr('89ab',abs(random()) % 4 + 1, 1) || substr(lower(hex(randomblob(2))),2) || '-' || lower(hex(randomblob(6)))),
  nom TEXT NOT NULL,
  prix_mensuel INTEGER NOT NULL DEFAULT 0,
  prix_annuel INTEGER NOT NULL DEFAULT 0,
  commandes_incluses INTEGER NOT NULL DEFAULT 50,
  fonctionnalites TEXT,
  ordre_affichage INTEGER NOT NULL DEFAULT 0,
  actif INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Plans tarifaires (prix en FCFA)
-- prix_annuel = prix_mensuel * 10 (2 mois offerts)
INSERT OR IGNORE INTO plans (nom, prix_mensuel, prix_annuel, commandes_incluses, fonctionnalites, ordre_affichage) VALUES
  ('Gratuit', 0, 0, 50,
   '{"menu_en_ligne":true,"commandes_whatsapp":true,"qr_code":true,"stats_base":true,"support_email":false,"domaine_perso":false,"livreurs":1,"produits_max":20}',
   0),
  ('Starter', 5000, 50000, 200,
   '{"menu_en_ligne":true,"commandes_whatsapp":true,"qr_code":true,"stats_avancees":true,"support_email":true,"domaine_perso":false,"livreurs":3,"produits_max":100,"codes_promo":true}',
   1),
  ('Pro', 15000, 150000, 1000,
   '{"menu_en_ligne":true,"commandes_whatsapp":true,"qr_code":true,"stats_avancees":true,"support_email":true,"support_whatsapp":true,"domaine_perso":true,"livreurs_illimites":true,"produits_max":-1,"codes_promo":true,"export_csv":true,"api_access":true}',
   2),
  ('Enterprise', 0, 0, -1,
   '{"tout_inclus":true,"support_dedie":true,"onboarding":true,"formation":true,"sla":true}',
   3);

-- Index pour les recherches fréquentes
CREATE INDEX IF NOT EXISTS idx_pays_code_iso ON pays(code_iso);
CREATE INDEX IF NOT EXISTS idx_plans_ordre ON plans(ordre_affichage);
CREATE INDEX IF NOT EXISTS idx_config_cle ON config_globale(cle);
