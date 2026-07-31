-- Migration 012 — Table moyens_paiement
-- Feat F : Table dédiée aux moyens de paiement gérés par l'admin.
-- Uniquement Mobile Money et Orange Money selon spec.
-- Chaque moyen de paiement contient les instructions complètes pour le restaurant.
--
-- Auteur : audit Feat F — 2026-07-31

-- =========================================================================
-- 1. Créer la table moyens_paiement
-- =========================================================================

CREATE TABLE IF NOT EXISTS moyens_paiement (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  code            TEXT        NOT NULL UNIQUE,   -- ex: 'orange_money', 'mobile_money'
  nom             TEXT        NOT NULL,           -- ex: 'Orange Money', 'Mobile Money (Moov)'
  description     TEXT        NOT NULL DEFAULT '', -- instructions courtes
  instructions    TEXT        NOT NULL DEFAULT '', -- instructions détaillées (multilignes)
  numero          TEXT,                           -- numéro de compte/dépôt (ex: +226 70 00 00 00)
  nom_compte      TEXT,                           -- nom du compte destinataire
  logo_url        TEXT,                           -- URL logo opérateur (optionnel)
  actif           BOOLEAN     NOT NULL DEFAULT true,
  ordre_affichage INTEGER     NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT chk_code_format CHECK (code ~ '^[a-z0-9_]+$'),
  CONSTRAINT chk_nom_length   CHECK (char_length(nom) BETWEEN 2 AND 100)
);

-- =========================================================================
-- 2. Données initiales (Mobile Money + Orange Money)
-- =========================================================================

INSERT INTO moyens_paiement (code, nom, description, instructions, numero, nom_compte, ordre_affichage)
VALUES
  (
    'orange_money',
    'Orange Money',
    'Paiement via Orange Money (Burkina Faso)',
    'Ouvrez votre application Orange Money ou composez #144#. Choisissez "Transfert d''argent". Entrez le numéro destinataire et le montant exact. Mentionnez votre référence de paiement dans le message. Faites une capture d''écran du reçu et uploadez-la.',
    '+226 70 00 00 00',
    'MonMenu Burkina',
    1
  ),
  (
    'mobile_money',
    'Mobile Money (Moov)',
    'Paiement via Moov Money (Burkina Faso)',
    'Ouvrez votre application Moov Money ou composez *555#. Sélectionnez "Transfert". Entrez le numéro et le montant. Indiquez votre référence de paiement en objet. Prenez une capture d''écran du reçu et uploadez-la.',
    '+226 71 00 00 00',
    'MonMenu Burkina',
    2
  )
ON CONFLICT (code) DO NOTHING;

-- =========================================================================
-- 3. RLS — Table publique en lecture, écriture service_role uniquement
-- =========================================================================

ALTER TABLE moyens_paiement ENABLE ROW LEVEL SECURITY;

-- Lecture publique (les restaurants doivent voir les moyens de paiement)
CREATE POLICY "moyens_paiement_select_public"
  ON moyens_paiement
  FOR SELECT
  USING (actif = true);

-- Insertion, modification, suppression : service_role uniquement (admin)
CREATE POLICY "moyens_paiement_write_service"
  ON moyens_paiement
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- =========================================================================
-- 4. Trigger updated_at
-- =========================================================================

CREATE OR REPLACE FUNCTION update_moyens_paiement_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_moyens_paiement_updated_at
  BEFORE UPDATE ON moyens_paiement
  FOR EACH ROW EXECUTE FUNCTION update_moyens_paiement_updated_at();

-- =========================================================================
-- 5. Index
-- =========================================================================

CREATE INDEX IF NOT EXISTS idx_moyens_paiement_actif_ordre
  ON moyens_paiement (actif, ordre_affichage ASC);

-- =========================================================================
-- 6. Commentaires
-- =========================================================================

COMMENT ON TABLE moyens_paiement IS
  'Moyens de paiement acceptés, gérés par l''admin. Lecture publique (actif=true). Écriture service_role uniquement.';
COMMENT ON COLUMN moyens_paiement.code IS
  'Identifiant technique unique : orange_money, mobile_money';
COMMENT ON COLUMN moyens_paiement.instructions IS
  'Instructions détaillées affichées au restaurant lors du paiement';
COMMENT ON COLUMN moyens_paiement.numero IS
  'Numéro de compte / numéro de dépôt affiché au restaurant';
