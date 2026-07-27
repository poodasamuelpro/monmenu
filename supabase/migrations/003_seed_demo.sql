-- =====================================================
-- MonMenu — Migration 003 : Données de démonstration
-- Marquées EXPLICITEMENT comme exemples (section 1.1)
-- =====================================================
-- IMPORTANT : Ces données sont des EXEMPLES de démonstration
-- Elles doivent être remplacées par des données réelles en production

-- Restaurant de démonstration
-- NB : l'id est généré automatiquement (gen_random_uuid() par défaut).
-- L'ancien littéral 'demo-restaurant-001'::uuid n'est pas un UUID
-- valide (format 8-4-4-4-12 requis) et provoquait une erreur
-- "invalid input syntax for type uuid". L'idempotence est assurée
-- par la contrainte UNIQUE sur "slug" (ON CONFLICT (slug) DO NOTHING).
INSERT INTO tenants (
  pays_id, nom, slug, whatsapp_number,
  couleur_primaire, couleur_secondaire,
  statut, plan_id, metadata
)
SELECT
  p.id,
  'Restaurant Démo (exemple)',
  'demo-restaurant',
  '+22600000000',
  '#DC2626',
  '#1D4ED8',
  'actif',
  pl.id,
  '{"is_demo": true, "note": "Données de démonstration - ne pas utiliser en production"}'
FROM pays p, plans pl
WHERE p.code_iso = 'BF' AND pl.nom = 'Pro'
LIMIT 1
ON CONFLICT (slug) DO NOTHING;

-- Point de vente démo
INSERT INTO points_de_vente (tenant_id, nom, adresse, latitude, longitude, actif)
SELECT
  t.id,
  'Siège principal (exemple)',
  'Avenue Kwamé N''Krumah, Ouagadougou',
  12.3569,
  -1.5353,
  true
FROM tenants t
WHERE t.slug = 'demo-restaurant'
ON CONFLICT DO NOTHING;

-- Catégories démo
INSERT INTO categories_menu (tenant_id, nom, ordre_affichage)
SELECT t.id, 'Plats principaux (exemple)', 1
FROM tenants t WHERE t.slug = 'demo-restaurant'
ON CONFLICT DO NOTHING;

INSERT INTO categories_menu (tenant_id, nom, ordre_affichage)
SELECT t.id, 'Boissons (exemple)', 2
FROM tenants t WHERE t.slug = 'demo-restaurant'
ON CONFLICT DO NOTHING;

-- Produits démo
INSERT INTO produits (tenant_id, categorie_id, nom, description, prix, disponible, ordre_affichage)
SELECT
  t.id, cm.id,
  'Riz sauce tomate (exemple)',
  'Plat traditionnel burkinabè — Données de démonstration',
  1500, true, 1
FROM tenants t
JOIN categories_menu cm ON cm.tenant_id = t.id AND cm.nom LIKE 'Plats principaux%'
WHERE t.slug = 'demo-restaurant'
ON CONFLICT DO NOTHING;

INSERT INTO produits (tenant_id, categorie_id, nom, description, prix, disponible, ordre_affichage)
SELECT
  t.id, cm.id,
  'Poulet braisé (exemple)',
  'Poulet grillé aux épices locales — Données de démonstration',
  3500, true, 2
FROM tenants t
JOIN categories_menu cm ON cm.tenant_id = t.id AND cm.nom LIKE 'Plats principaux%'
WHERE t.slug = 'demo-restaurant'
ON CONFLICT DO NOTHING;
