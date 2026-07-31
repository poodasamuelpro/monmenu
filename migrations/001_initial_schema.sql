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
  ('instagram_url', 'https://instagram.com/monmenuapp', 'URL Instagram MonMenu'),
  ('facebook_url', 'https://facebook.com/monmenuapp', 'URL Facebook MonMenu'),
  ('linkedin_url', 'https://linkedin.com/company/monmenuapp', 'URL LinkedIn MonMenu'),
  ('pays_defaut', 'BF', 'Pays par défaut pour les nouvelles inscriptions (code ISO)');

-- TABLE : plans (offres tarifaires affichées sur la page tarifs du site web)
CREATE TABLE IF NOT EXISTS plans (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))),2) || '-' || substr('89ab',abs(random()) % 4 + 1, 1) || substr(lower(hex(randomblob(2))),2) || '-' || lower(hex(randomblob(6)))),
  nom TEXT NOT NULL,
  prix_mensuel INTEGER NOT NULL DEFAULT 0,
  prix_annuel INTEGER NOT NULL DEFAULT 0,
  devise TEXT NOT NULL DEFAULT 'FCFA',
  commandes_incluses INTEGER NOT NULL DEFAULT 50,
  frais_par_commande INTEGER NOT NULL DEFAULT 0,
  limite_pdv INTEGER NOT NULL DEFAULT 1,
  fonctionnalites TEXT,
  ordre_affichage INTEGER NOT NULL DEFAULT 0,
  actif INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Les plans sont insérés par la migration 0002_seed_plans_faso.sql
-- qui définit les 4 plans officiels (Faso, Baraka, Naaba, Mogho).

-- Index pour les recherches fréquentes
CREATE INDEX IF NOT EXISTS idx_pays_code_iso ON pays(code_iso);
CREATE INDEX IF NOT EXISTS idx_plans_ordre ON plans(ordre_affichage);
CREATE INDEX IF NOT EXISTS idx_config_cle ON config_globale(cle);
