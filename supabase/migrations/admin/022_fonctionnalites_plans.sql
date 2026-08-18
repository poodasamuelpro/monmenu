-- ============================================================
-- Migration 022 — Catalogue centralisé des fonctionnalités par plan
-- Repo : monmenu-admin (copie identique à appliquer sur la base du site web)
-- Date : 2026-08-18
-- Conception : CONCEPTION-PLANS-FONCTIONNALITES-2026-08-17 (commit fb6bb96, repo web)
--
-- Crée :
--   • `fonctionnalites`          — catalogue géré par migration (pas éditable UI)
--   • `plan_fonctionnalites`     — matrice plan × fonctionnalité (défaut sécurisé :
--                                  absence = désactivé)
-- Migre :
--   • `plans.supplements_actifs`/`limite_supplements` → ligne 'supplements'
--   • `plans.fonctionnalites` (JSONB) → lignes du catalogue (clés connues)
-- NON destructif : les colonnes/JSONB de `plans` sont conservées en parallèle
-- pendant la transition (conformément au plan de migration en 2 phases de la
-- conception — rien ne casse l'API actuelle du site web).
-- ============================================================

-- ── 1. Trigger générique updated_at (réutilisable, idempotent) ──────────────
CREATE OR REPLACE FUNCTION trigger_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ── 2. Table catalogue ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS fonctionnalites (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code        TEXT NOT NULL UNIQUE,
  nom         TEXT NOT NULL,
  description TEXT,
  type        TEXT NOT NULL
                CHECK (type IN ('booleen', 'limite_periodique')),
  periode     TEXT
                CHECK (periode IS NULL OR periode IN ('mensuel')),
  actif       BOOLEAN NOT NULL DEFAULT true,
  ordre       INTEGER NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DROP TRIGGER IF EXISTS set_updated_at ON fonctionnalites;
CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON fonctionnalites
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

-- ── 3. Table matrice plan × fonctionnalité ──────────────────────────────────
CREATE TABLE IF NOT EXISTS plan_fonctionnalites (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id           UUID NOT NULL REFERENCES plans(id) ON DELETE CASCADE,
  fonctionnalite_id UUID NOT NULL REFERENCES fonctionnalites(id) ON DELETE CASCADE,
  actif             BOOLEAN NOT NULL DEFAULT false,   -- DÉFAUT SÉCURISÉ
  limite            INTEGER DEFAULT NULL,             -- null = illimité
  periode           TEXT DEFAULT NULL,                -- override local optionnel
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (plan_id, fonctionnalite_id)
);

CREATE INDEX IF NOT EXISTS idx_plan_fonctionnalites_plan
  ON plan_fonctionnalites (plan_id) WHERE actif = true;
CREATE INDEX IF NOT EXISTS idx_plan_fonctionnalites_feature
  ON plan_fonctionnalites (fonctionnalite_id);

DROP TRIGGER IF EXISTS set_updated_at ON plan_fonctionnalites;
CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON plan_fonctionnalites
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

-- ── 4. RLS — lecture/écriture service_role uniquement (comportement admin) ───
ALTER TABLE fonctionnalites ENABLE ROW LEVEL SECURITY;
ALTER TABLE plan_fonctionnalites ENABLE ROW LEVEL SECURITY;
-- Le service_role (utilisé par les routes admin ET web) bypass RLS.
-- Aucune policy publique n'est créée : les tenants ne lisent jamais cette
-- table directement — le backend résout les fonctionnalités du plan.

-- ── 5. Catalogue — données initiales idempotentes (ON CONFLICT code) ────────
INSERT INTO fonctionnalites (code, nom, description, type, periode, ordre) VALUES
  ('boutique_en_ligne',             'Boutique en ligne',              'Accès à la boutique publique',                 'booleen',           NULL,      1),
  ('qr_code',                       'QR Code',                        'Génération QR Code de la boutique',            'booleen',           NULL,      2),
  ('notifications_whatsapp',        'Notifications WhatsApp',         'Notifications livreur et client WhatsApp',     'booleen',           NULL,      3),
  ('livreurs',                      'Gestion livreurs',               'Ajout et gestion de livreurs WhatsApp',        'booleen',           NULL,      4),
  ('statistiques_avancees',         'Statistiques avancées',          'Stats avancées (CA par produit, taux…)',       'booleen',           NULL,      5),
  ('codes_promo',                   'Codes promotionnels',            'Création de codes promo par mois',             'limite_periodique', 'mensuel', 6),
  ('supplements',                   'Suppléments',                    'Nombre de suppléments actifs simultanés',      'limite_periodique', 'mensuel', 7),
  ('export_csv',                    'Export CSV',                     'Export des commandes en CSV',                  'booleen',           NULL,      8),
  ('support_whatsapp_prioritaire',  'Support WhatsApp prioritaire',   'Accès support WhatsApp prioritaire',           'booleen',           NULL,      9),
  ('multi_boutique',                'Multi-boutique',                 'Plusieurs points de vente',                    'booleen',           NULL,     10),
  ('domaine_perso',                 'Domaine personnalisé',           'Utilisation d''un domaine personnalisé',       'booleen',           NULL,     11),
  ('onboarding_dedie',              'Onboarding dédié',               'Accompagnement onboarding personnalisé',       'booleen',           NULL,     12),
  ('acces_api',                     'Accès API',                      'Accès à l''API publique MonMenu',              'booleen',           NULL,     13)
ON CONFLICT (code) DO UPDATE
  SET nom = EXCLUDED.nom, description = EXCLUDED.description,
      type = EXCLUDED.type, periode = EXCLUDED.periode, ordre = EXCLUDED.ordre;

-- ── 6. Migration des données existantes — scaffold supplements ──────────────
-- Reprend plans.supplements_actifs/limite_supplements en lignes de matrice.
INSERT INTO plan_fonctionnalites (plan_id, fonctionnalite_id, actif, limite, periode)
SELECT
  p.id                     AS plan_id,
  f.id                     AS fonctionnalite_id,
  COALESCE(p.supplements_actifs, false) AS actif,
  p.limite_supplements     AS limite,
  'mensuel'                AS periode
FROM plans p
CROSS JOIN fonctionnalites f
WHERE f.code = 'supplements'
ON CONFLICT (plan_id, fonctionnalite_id) DO UPDATE
  SET actif  = EXCLUDED.actif,
      limite = EXCLUDED.limite,
      periode = EXCLUDED.periode;

-- ── 7. Migration des données existantes — JSONB fonctionnalites ─────────────
-- Transforme les clés JSONB connues des plans en lignes de matrice.
-- Clés harmonisées selon le catalogue (§4.1 de la conception) :
--   codes_promo, export_csv, statistiques_avancees, livreurs,
--   support_whatsapp_prioritaire, multi_boutique, domaine_perso,
--   onboarding_dedie, acces_api, boutique_en_ligne, qr_code,
--   notifications_whatsapp
DO $$
DECLARE
  v_code TEXT;
  v_func_id UUID;
BEGIN
  FOREACH v_code IN ARRAY ARRAY[
    'codes_promo', 'export_csv', 'statistiques_avancees', 'livreurs',
    'support_whatsapp_prioritaire', 'multi_boutique', 'domaine_perso',
    'onboarding_dedie', 'acces_api', 'boutique_en_ligne', 'qr_code',
    'notifications_whatsapp'
  ] LOOP
    SELECT id INTO v_func_id FROM fonctionnalites WHERE code = v_code;
    IF v_func_id IS NULL THEN
      CONTINUE; -- clé inconnue au catalogue : ignorée en sécurité
    END IF;
    EXECUTE format(
      'INSERT INTO plan_fonctionnalites (plan_id, fonctionnalite_id, actif, periode)
       SELECT p.id, $1, COALESCE((p.fonctionnalites->>%L)::boolean, false),
              CASE WHEN %L::text IN (''codes_promo'', ''supplements'') THEN ''mensuel'' ELSE NULL END
       FROM plans p
       ON CONFLICT (plan_id, fonctionnalite_id) DO NOTHING',
      v_code, v_code
    ) USING v_func_id;
  END LOOP;
END $$;

-- ── 8. Vérification post-migration (RAISE NOTICE — non bloquant) ────────────
DO $$
DECLARE
  v_missing INT;
BEGIN
  SELECT COUNT(*) INTO v_missing
  FROM plans p
  CROSS JOIN fonctionnalites f
  WHERE f.actif = true
    AND NOT EXISTS (
      SELECT 1 FROM plan_fonctionnalites pf
      WHERE pf.plan_id = p.id AND pf.fonctionnalite_id = f.id
    );
  IF v_missing > 0 THEN
    RAISE NOTICE 'Migration 022 : % combinaison(s) plan×fonctionnalité sans ligne — défaut sécurisé actif=false.', v_missing;
  END IF;
END $$;
