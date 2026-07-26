-- Migration 003 : Données de démonstration (SQLite/D1)
-- Marquées EXPLICITEMENT comme données d'exemple

INSERT OR IGNORE INTO tenants (
  id, pays_id, nom, slug, whatsapp_number,
  couleur_primaire, couleur_secondaire, statut, plan_id, metadata
) VALUES (
  'demo00000000000000000000000000001',
  (SELECT id FROM pays WHERE code_iso = 'BF' LIMIT 1),
  'Restaurant Démo (exemple)',
  'demo-restaurant',
  '+22600000000',
  '#DC2626', '#1D4ED8',
  'actif',
  'plan-pro-001',
  '{"is_demo":true,"note":"Données de démonstration uniquement"}'
);

INSERT OR IGNORE INTO points_de_vente (
  tenant_id, nom, adresse, latitude, longitude, actif
) VALUES (
  'demo00000000000000000000000000001',
  'Siège démo (exemple)',
  'Avenue Kwamé N''Krumah, Ouagadougou',
  12.3569, -1.5353, 1
);

INSERT OR IGNORE INTO categories_menu (tenant_id, nom, ordre_affichage) VALUES
  ('demo00000000000000000000000000001', 'Plats principaux (exemple)', 1),
  ('demo00000000000000000000000000001', 'Boissons (exemple)', 2);

INSERT OR IGNORE INTO produits (tenant_id, categorie_id, nom, description, prix, disponible, ordre_affichage)
SELECT
  'demo00000000000000000000000000001',
  cm.id,
  'Riz sauce tomate (exemple)',
  'Données de démonstration uniquement',
  1500, 1, 1
FROM categories_menu cm
WHERE cm.tenant_id = 'demo00000000000000000000000000001' AND cm.nom LIKE 'Plats%'
LIMIT 1;

INSERT OR IGNORE INTO produits (tenant_id, categorie_id, nom, description, prix, disponible, ordre_affichage)
SELECT
  'demo00000000000000000000000000001',
  cm.id,
  'Poulet braisé (exemple)',
  'Données de démonstration uniquement',
  3500, 1, 2
FROM categories_menu cm
WHERE cm.tenant_id = 'demo00000000000000000000000000001' AND cm.nom LIKE 'Plats%'
LIMIT 1;
