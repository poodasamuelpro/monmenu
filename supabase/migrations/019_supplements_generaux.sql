-- ============================================================
-- MIGRATION MonMenu — 019 : Suppléments généraux par tenant
-- ============================================================
-- Objectif : transformer les suppléments de "liés à un produit"
-- (produit_id NOT NULL) en "généraux par restaurant" (produit_id nullable),
-- tout en préservant les données historiques existantes.
-- Ajoute les colonnes plan (scaffold) et la photo_url / photo_r2_key.
--
-- Idempotent : peut être rejouée sans effet de bord.
-- Rollback documenté en fin de fichier.
-- ============================================================

-- ── 1. Rendre produit_id nullable (sans perte de données historiques) ──────
-- Les lignes existantes conservent leur produit_id. La nouvelle logique
-- ne crée plus de suppléments avec produit_id, mais l'ancienne valeur
-- reste en base pour audit et rétrocompatibilité.
ALTER TABLE supplements
  ALTER COLUMN produit_id DROP NOT NULL;

-- ── 2. Ajouter photo_url (URL publique lisible) ─────────────────────────────
ALTER TABLE supplements
  ADD COLUMN IF NOT EXISTS photo_url TEXT DEFAULT NULL;

-- ── 3. Ajouter photo_r2_key (clé R2 pour purge propre) ─────────────────────
-- Jamais null si une image existe — garantit la purge sans re-dériver la clé.
ALTER TABLE supplements
  ADD COLUMN IF NOT EXISTS photo_r2_key TEXT DEFAULT NULL;

-- ── 4. Scaffold plan/limite (colonnes créées, logique NON activée) ──────────
-- supplements_actifs : fonctionnalité activée pour ce plan ?
-- limite_supplements : null = illimité, entier = plafond.
-- Ces colonnes sont créées maintenant. La restriction côté API reste
-- désactivée par défaut (vérification contournée tant que supplements_actifs
-- n'est pas positionné à true par l'admin via sa console).
ALTER TABLE plans
  ADD COLUMN IF NOT EXISTS supplements_actifs BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE plans
  ADD COLUMN IF NOT EXISTS limite_supplements INTEGER DEFAULT NULL;

-- ── 5. Index optimisé pour la nouvelle requête "tenant-level" ───────────────
-- Remplace la combinaison produit_id+deleted_at par tenant_id+ordre+deleted_at.
CREATE INDEX IF NOT EXISTS idx_supplements_tenant_ordre
  ON supplements(tenant_id, ordre_affichage)
  WHERE deleted_at IS NULL;

-- ── 6. Trigger updated_at (idempotent) ──────────────────────────────────────
-- Si le trigger set_updated_at n'existe pas encore sur supplements, on le crée.
-- (La migration 00-migration.sql le crée déjà mais peut ne pas avoir été jouée.)
DROP TRIGGER IF EXISTS set_updated_at ON supplements;
CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON supplements
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

-- ── 7. RLS : policies tenant-scoped généraux ────────────────────────────────
-- LECTURE : les suppléments d'un tenant sont lisibles par l'utilisateur
--           authentifié du même tenant (get_user_tenant_id() = tenant_id).
-- ÉCRITURE : idem, via service role pour les routes API (bypass RLS explicite).
-- Note : le service role bypasse RLS — le filtrage tenant_id dans le code
--        applicatif (api-supplements.ts) reste le seul contrôle réel.

-- Supprimer les anciennes policies si elles existent
DROP POLICY IF EXISTS supplements_tenant_select ON supplements;
DROP POLICY IF EXISTS supplements_tenant_insert ON supplements;
DROP POLICY IF EXISTS supplements_tenant_update ON supplements;
DROP POLICY IF EXISTS supplements_tenant_delete ON supplements;

-- Activer RLS si pas déjà actif
ALTER TABLE supplements ENABLE ROW LEVEL SECURITY;

-- SELECT : tout utilisateur authentifié peut lire les suppléments de son tenant.
CREATE POLICY supplements_tenant_select ON supplements
  FOR SELECT
  USING (tenant_id = get_user_tenant_id());

-- INSERT : un utilisateur ne peut créer des suppléments que pour son tenant.
CREATE POLICY supplements_tenant_insert ON supplements
  FOR INSERT
  WITH CHECK (tenant_id = get_user_tenant_id());

-- UPDATE : un utilisateur ne peut modifier que les suppléments de son tenant.
CREATE POLICY supplements_tenant_update ON supplements
  FOR UPDATE
  USING (tenant_id = get_user_tenant_id());

-- DELETE : un utilisateur ne peut supprimer que les suppléments de son tenant.
CREATE POLICY supplements_tenant_delete ON supplements
  FOR DELETE
  USING (tenant_id = get_user_tenant_id());

-- ── FIN MIGRATION ──────────────────────────────────────────────────────────
-- ROLLBACK (à exécuter manuellement si nécessaire) :
--
-- ALTER TABLE supplements ALTER COLUMN produit_id SET NOT NULL;  -- ATTENTION : échec si des lignes ont produit_id NULL
-- ALTER TABLE supplements DROP COLUMN IF EXISTS photo_url;
-- ALTER TABLE supplements DROP COLUMN IF EXISTS photo_r2_key;
-- ALTER TABLE plans DROP COLUMN IF EXISTS supplements_actifs;
-- ALTER TABLE plans DROP COLUMN IF EXISTS limite_supplements;
-- DROP INDEX IF EXISTS idx_supplements_tenant_ordre;
-- DROP TRIGGER IF EXISTS set_updated_at ON supplements;
-- DROP POLICY IF EXISTS supplements_tenant_select ON supplements;
-- DROP POLICY IF EXISTS supplements_tenant_insert ON supplements;
-- DROP POLICY IF EXISTS supplements_tenant_update ON supplements;
-- DROP POLICY IF EXISTS supplements_tenant_delete ON supplements;
