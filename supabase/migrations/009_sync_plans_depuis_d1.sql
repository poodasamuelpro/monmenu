-- =====================================================================
-- Migration 009 : Synchronisation des plans — D1 (source de vérité) → Supabase
-- Référence : PROMPT D'EXÉCUTION 1 §"Correction impérative sur la source de vérité des plans"
-- Référence : audit 06-synchronisation.md §3, 07-notifications-inapp-bdd.md §3.2
-- Date : 2026-07-29
--
-- Règle définitive : D1 (Cloudflare) est la SOURCE DE VÉRITÉ pour les plans.
-- Supabase est mis à jour pour refléter D1. Jamais l'inverse.
--
-- -----------------------------------------------------------------------
-- TABLE DE CORRESPONDANCE D1 ↔ SUPABASE (documentation)
-- -----------------------------------------------------------------------
-- | Nom D1   | ID D1          | Nom Supabase avant | Prix mensuel D1 | Prix mensuel Supabase avant |
-- |----------|----------------|--------------------|-----------------|------------------------------|
-- | Faso     | plan_faso      | Gratuit            | 0 FCFA          | 0                            |
-- | Baraka   | plan_baraka    | Starter            | 8 000 FCFA      | 9 500                        |
-- | Naaba    | plan_naaba     | Pro                | 18 000 FCFA     | 19 500                       |
-- | Mogho    | plan_mogho     | Premium            | 35 000 FCFA     | 39 500                       |
--
-- -----------------------------------------------------------------------
-- STRATÉGIE : Ajouter la colonne d1_plan_id dans plans (Supabase)
-- pour le mapping, puis aligner les noms et prix sur D1.
-- Les IDs UUID Supabase sont conservés car ils sont référencés par
-- la FK tenants.plan_id — on ne peut pas les remplacer par les IDs D1
-- (TEXT) sans risquer de casser les références existantes.
-- -----------------------------------------------------------------------

-- Étape 1 : Ajouter la colonne de mapping D1 → Supabase
-- Permettra à l'API /api/v1/plans (D1) et au mobile de faire le lien
-- avec les plans Supabase lors de la confirmation admin
ALTER TABLE plans
  ADD COLUMN IF NOT EXISTS d1_plan_id TEXT UNIQUE;

-- Étape 2 : Mapping des plans existants Supabase → D1
-- Basé sur la correspondance tarifaire (Gratuit→Faso, Starter→Baraka, Pro→Naaba, Premium→Mogho)
UPDATE plans SET d1_plan_id = 'plan_faso'   WHERE nom = 'Gratuit'  AND d1_plan_id IS NULL;
UPDATE plans SET d1_plan_id = 'plan_baraka' WHERE nom = 'Starter'  AND d1_plan_id IS NULL;
UPDATE plans SET d1_plan_id = 'plan_naaba'  WHERE nom = 'Pro'      AND d1_plan_id IS NULL;
UPDATE plans SET d1_plan_id = 'plan_mogho'  WHERE nom = 'Premium'  AND d1_plan_id IS NULL;

-- Étape 3 : Aligner les NOMS des plans Supabase sur D1
-- Règle : les noms affichés partout (web, admin, mobile) doivent être identiques
UPDATE plans SET nom = 'Faso'   WHERE d1_plan_id = 'plan_faso';
UPDATE plans SET nom = 'Baraka' WHERE d1_plan_id = 'plan_baraka';
UPDATE plans SET nom = 'Naaba'  WHERE d1_plan_id = 'plan_naaba';
UPDATE plans SET nom = 'Mogho'  WHERE d1_plan_id = 'plan_mogho';

-- Étape 4 : Aligner les PRIX sur D1 (source de vérité)
-- D1 : Faso=0, Baraka=8000/80000, Naaba=18000/180000, Mogho=35000/350000
UPDATE plans SET
  prix_mensuel = 0,
  prix_annuel  = 0
WHERE d1_plan_id = 'plan_faso';

UPDATE plans SET
  prix_mensuel = 8000,
  prix_annuel  = 80000
WHERE d1_plan_id = 'plan_baraka';

UPDATE plans SET
  prix_mensuel = 18000,
  prix_annuel  = 180000
WHERE d1_plan_id = 'plan_naaba';

UPDATE plans SET
  prix_mensuel = 35000,
  prix_annuel  = 350000
WHERE d1_plan_id = 'plan_mogho';

-- Étape 5 : Aligner les fonctionnalités sur D1 (merge des clés D1 dans Supabase)
-- Les clés fonctionnalites D1 sont enrichies (produits_max, categories_max, etc.)
-- On les recopie entièrement depuis D1 ici :
UPDATE plans SET fonctionnalites = '{
  "sous_titre": "Essai gratuit, sans engagement",
  "cible": "Pour tester la plateforme avant de se lancer",
  "boutique_en_ligne": true,
  "qr_code": true,
  "notifications_whatsapp": true,
  "produits_max": 15,
  "categories_max": 3,
  "statistiques_avancees": false,
  "codes_promo": false,
  "domaine_perso": false,
  "export_csv": false,
  "support_whatsapp_prioritaire": false,
  "multi_boutique": false,
  "recommande": false,
  "duree_essai_jours": 30
}'::jsonb
WHERE d1_plan_id = 'plan_faso';

UPDATE plans SET fonctionnalites = '{
  "sous_titre": "Pour bien démarrer en ligne",
  "cible": "Petit restaurant, vente ambulante, snack",
  "boutique_en_ligne": true,
  "qr_code": true,
  "notifications_whatsapp": true,
  "produits_max": 40,
  "categories_max": 8,
  "statistiques_avancees": false,
  "codes_promo": false,
  "domaine_perso": false,
  "export_csv": false,
  "support_whatsapp_prioritaire": false,
  "multi_boutique": false,
  "recommande": false
}'::jsonb
WHERE d1_plan_id = 'plan_baraka';

UPDATE plans SET fonctionnalites = '{
  "sous_titre": "Pour un restaurant qui grandit",
  "cible": "Restaurant établi, plusieurs services par jour",
  "boutique_en_ligne": true,
  "qr_code": true,
  "notifications_whatsapp": true,
  "produits_max": -1,
  "categories_max": -1,
  "statistiques_avancees": true,
  "codes_promo": true,
  "domaine_perso": false,
  "export_csv": true,
  "support_whatsapp_prioritaire": false,
  "multi_boutique": false,
  "recommande": true
}'::jsonb
WHERE d1_plan_id = 'plan_naaba';

UPDATE plans SET fonctionnalites = '{
  "sous_titre": "Toutes les fonctionnalités, sans limite",
  "cible": "Groupe de restaurants, grande enseigne, franchise",
  "boutique_en_ligne": true,
  "qr_code": true,
  "notifications_whatsapp": true,
  "produits_max": -1,
  "categories_max": -1,
  "statistiques_avancees": true,
  "codes_promo": true,
  "domaine_perso": true,
  "export_csv": true,
  "support_whatsapp_prioritaire": true,
  "multi_boutique": true,
  "onboarding_dedie": true,
  "acces_api": true,
  "recommande": false
}'::jsonb
WHERE d1_plan_id = 'plan_mogho';

-- Étape 6 : Aligner l'ordre d'affichage sur D1 (1=Faso, 2=Baraka, 3=Naaba, 4=Mogho)
UPDATE plans SET ordre_affichage = 1 WHERE d1_plan_id = 'plan_faso';
UPDATE plans SET ordre_affichage = 2 WHERE d1_plan_id = 'plan_baraka';
UPDATE plans SET ordre_affichage = 3 WHERE d1_plan_id = 'plan_naaba';
UPDATE plans SET ordre_affichage = 4 WHERE d1_plan_id = 'plan_mogho';

-- Étape 7 : Aligner la devise sur D1 (FCFA pour tous les plans Burkina Faso)
UPDATE plans SET devise = 'XOF' WHERE d1_plan_id IS NOT NULL;

-- Étape 8 : Mettre à jour les timestamps de modification
UPDATE plans SET updated_at = NOW() WHERE d1_plan_id IS NOT NULL;

-- Index pour la recherche par d1_plan_id (utilisé par le mapping admin→D1)
CREATE INDEX IF NOT EXISTS idx_plans_d1_plan_id ON plans (d1_plan_id) WHERE d1_plan_id IS NOT NULL;

-- -----------------------------------------------------------------------
-- Vérification finale (commentée — à exécuter manuellement pour contrôle)
-- SELECT id, nom, d1_plan_id, prix_mensuel, prix_annuel, devise, ordre_affichage
-- FROM plans
-- ORDER BY ordre_affichage;
-- Attendu :
--   | UUID | Faso   | plan_faso   |     0 |       0 | XOF | 1 |
--   | UUID | Baraka | plan_baraka |  8000 |   80000 | XOF | 2 |
--   | UUID | Naaba  | plan_naaba  | 18000 |  180000 | XOF | 3 |
--   | UUID | Mogho  | plan_mogho  | 35000 |  350000 | XOF | 4 |
-- -----------------------------------------------------------------------
