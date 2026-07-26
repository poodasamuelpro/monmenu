-- =====================================================
-- MonMenu — Migration 001 : Schéma initial (D1/SQLite)
-- =====================================================

-- TABLE : pays
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

INSERT OR IGNORE INTO pays (code_iso, nom, devise, symbole_devise, indicatif_tel, langue_defaut) VALUES
  ('BF', 'Burkina Faso', 'XOF', 'FCFA', '+226', 'fr'),
  ('CI', 'Côte d''Ivoire', 'XOF', 'FCFA', '+225', 'fr'),
  ('CM', 'Cameroun', 'XAF', 'FCFA', '+237', 'fr'),
  ('ML', 'Mali', 'XOF', 'FCFA', '+223', 'fr'),
  ('SN', 'Sénégal', 'XOF', 'FCFA', '+221', 'fr');

-- TABLE : config_globale
CREATE TABLE IF NOT EXISTS config_globale (
  cle TEXT PRIMARY KEY,
  valeur TEXT NOT NULL,
  description TEXT,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

INSERT OR IGNORE INTO config_globale (cle, valeur, description) VALUES
  ('nom_projet', 'MonMenu', 'Nom affiché sur la plateforme'),
  ('version', '1.0.0', 'Version de la plateforme'),
  ('maintenance', 'false', 'Mode maintenance global'),
  ('support_email', 'support@monmenu.app', 'Email de support'),
  ('support_whatsapp', '+22600000000', 'Numéro WhatsApp support');

-- TABLE : plans
CREATE TABLE IF NOT EXISTS plans (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  nom TEXT NOT NULL,
  description TEXT,
  prix_mensuel REAL NOT NULL DEFAULT 0,
  prix_annuel REAL NOT NULL DEFAULT 0,
  devise TEXT NOT NULL DEFAULT 'XOF',
  commandes_incluses INTEGER NOT NULL DEFAULT 100,
  frais_par_commande REAL NOT NULL DEFAULT 0,
  limite_pdv INTEGER NOT NULL DEFAULT 1,
  fonctionnalites TEXT NOT NULL DEFAULT '{}',
  actif INTEGER NOT NULL DEFAULT 1,
  ordre_affichage INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

INSERT OR IGNORE INTO plans (id, nom, description, prix_mensuel, prix_annuel, commandes_incluses, frais_par_commande, limite_pdv, fonctionnalites, ordre_affichage) VALUES
  ('plan-gratuit-001', 'Gratuit', 'Pour démarrer et tester', 0, 0, 30, 0, 1,
   '{"boutique_en_ligne":true,"whatsapp_notifications":true,"qrcode":true,"stats_basiques":true}', 0),
  ('plan-starter-001', 'Starter', 'Pour les petits restaurants', 9500, 95000, 200, 50, 1,
   '{"boutique_en_ligne":true,"whatsapp_notifications":true,"qrcode":true,"stats_basiques":true,"support_email":true,"livreurs":true}', 1),
  ('plan-pro-001', 'Pro', 'Le plus populaire', 19500, 195000, 1000, 25, 3,
   '{"boutique_en_ligne":true,"whatsapp_notifications":true,"qrcode_custom":true,"stats_avancees":true,"support_email":true,"livreurs":true,"codes_promo":true,"export_csv":true,"domaine_perso":true}', 2),
  ('plan-premium-001', 'Premium', 'Pour les restaurants à fort volume', 39500, 395000, 5000, 10, 10,
   '{"boutique_en_ligne":true,"whatsapp_notifications":true,"qrcode_custom":true,"stats_avancees":true,"support_prioritaire":true,"livreurs":true,"codes_promo":true,"export_csv":true,"domaine_perso":true,"api_access":true,"webhooks":true}', 3);

-- TABLE : tenants
CREATE TABLE IF NOT EXISTS tenants (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  pays_id TEXT NOT NULL REFERENCES pays(id),
  nom TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  logo_url TEXT,
  banniere_url TEXT,
  couleur_primaire TEXT NOT NULL DEFAULT '#DC2626',
  couleur_secondaire TEXT NOT NULL DEFAULT '#1D4ED8',
  whatsapp_number TEXT NOT NULL,
  domaine_perso TEXT UNIQUE,
  statut TEXT NOT NULL DEFAULT 'essai',
  plan_id TEXT REFERENCES plans(id),
  metadata TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_tenants_slug ON tenants(slug);
CREATE INDEX IF NOT EXISTS idx_tenants_statut ON tenants(statut);

-- TABLE : utilisateurs_tenant
CREATE TABLE IF NOT EXISTS utilisateurs_tenant (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  auth_user_id TEXT NOT NULL UNIQUE,
  role TEXT NOT NULL DEFAULT 'proprietaire',
  nom TEXT NOT NULL,
  telephone TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_utilisateurs_tenant ON utilisateurs_tenant(tenant_id);

-- TABLE : points_de_vente
CREATE TABLE IF NOT EXISTS points_de_vente (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  nom TEXT NOT NULL,
  adresse TEXT NOT NULL,
  latitude REAL,
  longitude REAL,
  zone_livraison_geojson TEXT,
  horaires TEXT,
  tarif_livraison_base REAL DEFAULT 500,
  tarif_par_km REAL DEFAULT 200,
  actif INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_pdv_tenant ON points_de_vente(tenant_id);

-- TABLE : categories_menu
CREATE TABLE IF NOT EXISTS categories_menu (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  nom TEXT NOT NULL,
  description TEXT,
  ordre_affichage INTEGER NOT NULL DEFAULT 0,
  actif INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_categories_tenant ON categories_menu(tenant_id, ordre_affichage);

-- TABLE : produits
CREATE TABLE IF NOT EXISTS produits (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  categorie_id TEXT NOT NULL REFERENCES categories_menu(id),
  nom TEXT NOT NULL,
  description TEXT,
  prix REAL NOT NULL DEFAULT 0,
  photo_url TEXT,
  disponible INTEGER NOT NULL DEFAULT 1,
  ordre_affichage INTEGER NOT NULL DEFAULT 0,
  stock_actuel INTEGER,
  metadata TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_produits_tenant ON produits(tenant_id, ordre_affichage);
CREATE INDEX IF NOT EXISTS idx_produits_categorie ON produits(categorie_id);

-- TABLE : variantes_produits
CREATE TABLE IF NOT EXISTS variantes_produits (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  produit_id TEXT NOT NULL REFERENCES produits(id),
  nom TEXT NOT NULL,
  prix_supplement REAL NOT NULL DEFAULT 0,
  disponible INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- TABLE : livreurs
CREATE TABLE IF NOT EXISTS livreurs (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  nom TEXT NOT NULL,
  whatsapp_number TEXT NOT NULL,
  actif INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- TABLE : modes_paiement
CREATE TABLE IF NOT EXISTS modes_paiement (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  code TEXT NOT NULL UNIQUE,
  nom TEXT NOT NULL,
  actif_par_pays TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

INSERT OR IGNORE INTO modes_paiement (code, nom, actif_par_pays) VALUES
  ('especes_livraison', 'Espèces à la livraison', '{"BF":true,"CI":true,"CM":true,"ML":true,"SN":true}'),
  ('mobile_money', 'Mobile Money', '{"BF":false,"CI":false,"CM":false}'),
  ('carte_bancaire', 'Carte bancaire', '{"BF":false,"CI":false}');

-- TABLE : commandes
CREATE TABLE IF NOT EXISTS commandes (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  point_de_vente_id TEXT NOT NULL REFERENCES points_de_vente(id),
  client_nom TEXT NOT NULL,
  client_telephone TEXT NOT NULL,
  client_adresse TEXT,
  client_latitude REAL,
  client_longitude REAL,
  items_json TEXT NOT NULL,
  montant_total REAL NOT NULL DEFAULT 0,
  frais_livraison REAL NOT NULL DEFAULT 0,
  mode_paiement TEXT NOT NULL DEFAULT 'especes_livraison',
  statut TEXT NOT NULL DEFAULT 'en_attente',
  livreur_id TEXT REFERENCES livreurs(id),
  token_suivi TEXT NOT NULL UNIQUE,
  idempotency_key TEXT NOT NULL UNIQUE,
  notes TEXT,
  metadata TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_commandes_tenant ON commandes(tenant_id, created_at);
CREATE INDEX IF NOT EXISTS idx_commandes_statut ON commandes(tenant_id, statut);
CREATE INDEX IF NOT EXISTS idx_commandes_token ON commandes(token_suivi);
CREATE INDEX IF NOT EXISTS idx_commandes_idempotency ON commandes(idempotency_key);

-- TABLE : commandes_historique
CREATE TABLE IF NOT EXISTS commandes_historique (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  commande_id TEXT NOT NULL REFERENCES commandes(id),
  ancien_statut TEXT NOT NULL,
  nouveau_statut TEXT NOT NULL,
  note TEXT,
  source TEXT NOT NULL DEFAULT 'restaurant',
  timestamp TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_historique_commande ON commandes_historique(commande_id, timestamp);

-- TABLE : abonnements
CREATE TABLE IF NOT EXISTS abonnements (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  plan_id TEXT NOT NULL REFERENCES plans(id),
  date_debut TEXT NOT NULL DEFAULT (datetime('now')),
  date_fin TEXT,
  statut TEXT NOT NULL DEFAULT 'actif',
  montant_paye REAL,
  devise TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- TABLE : stats_journalieres
CREATE TABLE IF NOT EXISTS stats_journalieres (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  date TEXT NOT NULL,
  nb_commandes INTEGER NOT NULL DEFAULT 0,
  ca_total REAL NOT NULL DEFAULT 0,
  produit_top_id TEXT REFERENCES produits(id),
  taux_annulation REAL NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(tenant_id, date)
);

-- TABLE : codes_promo
CREATE TABLE IF NOT EXISTS codes_promo (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  code TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'pourcentage',
  valeur REAL NOT NULL DEFAULT 0,
  date_debut TEXT NOT NULL DEFAULT (datetime('now')),
  date_fin TEXT,
  usage_max INTEGER,
  usage_actuel INTEGER NOT NULL DEFAULT 0,
  actif INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(tenant_id, code)
);

-- TABLE : audit_log
CREATE TABLE IF NOT EXISTS audit_log (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  table_cible TEXT NOT NULL,
  ligne_id TEXT NOT NULL,
  action TEXT NOT NULL,
  ancien_valeur TEXT,
  nouvelle_valeur TEXT,
  auteur_id TEXT,
  ip_address TEXT,
  timestamp TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_audit_timestamp ON audit_log(timestamp);
