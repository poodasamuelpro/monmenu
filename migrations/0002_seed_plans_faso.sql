-- =====================================================================
-- Migration D1 : 0002_seed_plans_faso.sql
-- Remplace les 3 anciens plans par 4 plans, noms d'inspiration
-- burkinabè (mooré/dioula) — à valider auprès d'un locuteur natif
-- avant mise en production définitive (voir notes/NOMS-PLANS.md).
--
-- Rappel architecture : cette table "plans" vit dans D1 (site web
-- uniquement), PAS dans Supabase. Elle alimente /api/v1/plans et
-- la page d'accueil de façon 100% dynamique — aucun prix en dur
-- côté HTML/JS.
-- =====================================================================

DELETE FROM plans;

-- 1. Essai gratuit — découverte, aucun engagement
INSERT INTO plans (
  id, nom, prix_mensuel, prix_annuel, devise,
  commandes_incluses, frais_par_commande, limite_pdv,
  fonctionnalites, actif, ordre_affichage, created_at, updated_at
) VALUES (
  'plan_faso',
  'Faso',
  0, 0, 'FCFA',
  30, 0, 1,
  '{
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
  }',
  1, 1, datetime('now'), datetime('now')
);

-- 2. Petit vendeur / restaurant qui démarre en ligne — prix faible
INSERT INTO plans (
  id, nom, prix_mensuel, prix_annuel, devise,
  commandes_incluses, frais_par_commande, limite_pdv,
  fonctionnalites, actif, ordre_affichage, created_at, updated_at
) VALUES (
  'plan_baraka',
  'Baraka',
  8000, 80000, 'FCFA',
  100, 50, 1,
  '{
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
  }',
  1, 2, datetime('now'), datetime('now')
);

-- 3. Restaurant moyen — le plus choisi
INSERT INTO plans (
  id, nom, prix_mensuel, prix_annuel, devise,
  commandes_incluses, frais_par_commande, limite_pdv,
  fonctionnalites, actif, ordre_affichage, created_at, updated_at
) VALUES (
  'plan_naaba',
  'Naaba',
  18000, 180000, 'FCFA',
  400, 40, 3,
  '{
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
  }',
  1, 3, datetime('now'), datetime('now')
);

-- 4. Grand restaurant / groupe très pro — toutes les fonctionnalités
INSERT INTO plans (
  id, nom, prix_mensuel, prix_annuel, devise,
  commandes_incluses, frais_par_commande, limite_pdv,
  fonctionnalites, actif, ordre_affichage, created_at, updated_at
) VALUES (
  'plan_mogho',
  'Mogho',
  35000, 350000, 'FCFA',
  -1, 0, -1,
  '{
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
  }',
  1, 4, datetime('now'), datetime('now')
);
