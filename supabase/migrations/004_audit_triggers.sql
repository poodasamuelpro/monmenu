-- =============================================================
-- Migration 004 — Triggers d'audit automatique (§1.6)
-- Peuple automatiquement la table audit_log via des triggers
-- Postgres pour les opérations sur les tables sensibles.
--
-- Schéma audit_log attendu (voir migration 001) :
--   id, tenant_id, table_name, record_id, action, changes, created_at
-- =============================================================

-- -------------------------------------------------------
-- 1. Fonction générique d'audit (INSERT / UPDATE / DELETE)
-- -------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_audit_log()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant_id UUID;
  v_changes   JSONB;
BEGIN
  -- Résoudre le tenant_id depuis la ligne modifiée.
  -- Cas particulier : la table "tenants" n'a pas de colonne
  -- "tenant_id" (c'est elle-même le tenant, identifiée par "id").
  IF TG_TABLE_NAME = 'tenants' THEN
    v_tenant_id := CASE WHEN TG_OP = 'DELETE' THEN OLD.id ELSE NEW.id END;
  ELSIF TG_OP = 'DELETE' THEN
    v_tenant_id := OLD.tenant_id;
  ELSE
    v_tenant_id := NEW.tenant_id;
  END IF;

  -- Calculer le diff pour UPDATE
  IF TG_OP = 'UPDATE' THEN
    v_changes := jsonb_build_object(
      'avant', to_jsonb(OLD),
      'apres', to_jsonb(NEW)
    );
  ELSIF TG_OP = 'INSERT' THEN
    v_changes := jsonb_build_object('data', to_jsonb(NEW));
  ELSE
    v_changes := jsonb_build_object('data', to_jsonb(OLD));
  END IF;

  INSERT INTO audit_log (
    id,
    tenant_id,
    action,
    table_name,
    record_id,
    changes,
    created_at
  ) VALUES (
    gen_random_uuid(),
    v_tenant_id,
    TG_OP,
    TG_TABLE_NAME,
    CASE
      WHEN TG_OP = 'DELETE' THEN OLD.id::TEXT
      ELSE NEW.id::TEXT
    END,
    v_changes,
    NOW()
  );

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- Ne jamais bloquer l'opération principale à cause de l'audit
  RETURN NEW;
END;
$$;

-- -------------------------------------------------------
-- 2. Trigger sur commandes (INSERT + UPDATE statut)
-- -------------------------------------------------------
DROP TRIGGER IF EXISTS trg_audit_commandes ON commandes;
CREATE TRIGGER trg_audit_commandes
  AFTER INSERT OR UPDATE OF statut
  ON commandes
  FOR EACH ROW
  EXECUTE FUNCTION fn_audit_log();

-- -------------------------------------------------------
-- 3. Trigger sur produits (INSERT / UPDATE / DELETE)
-- -------------------------------------------------------
DROP TRIGGER IF EXISTS trg_audit_produits ON produits;
CREATE TRIGGER trg_audit_produits
  AFTER INSERT OR UPDATE OR DELETE
  ON produits
  FOR EACH ROW
  EXECUTE FUNCTION fn_audit_log();

-- -------------------------------------------------------
-- 4. Trigger sur codes_promo (INSERT / UPDATE / DELETE)
-- -------------------------------------------------------
DROP TRIGGER IF EXISTS trg_audit_codes_promo ON codes_promo;
CREATE TRIGGER trg_audit_codes_promo
  AFTER INSERT OR UPDATE OR DELETE
  ON codes_promo
  FOR EACH ROW
  EXECUTE FUNCTION fn_audit_log();

-- -------------------------------------------------------
-- 5. Trigger sur tenants (UPDATE — changements de plan, statut, etc.)
-- -------------------------------------------------------
DROP TRIGGER IF EXISTS trg_audit_tenants ON tenants;
CREATE TRIGGER trg_audit_tenants
  AFTER UPDATE
  ON tenants
  FOR EACH ROW
  EXECUTE FUNCTION fn_audit_log();

-- -------------------------------------------------------
-- 6. Colonne updated_at manquante sur codes_promo
-- (DOIT être exécuté AVANT la création de increment_promo_usage
--  ci-dessous : une fonction LANGUAGE sql est analysée à la
--  création et échoue si la colonne n'existe pas encore)
-- -------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'codes_promo' AND column_name = 'updated_at'
  ) THEN
    ALTER TABLE codes_promo ADD COLUMN updated_at TIMESTAMPTZ DEFAULT NOW();
  END IF;
END $$;

-- -------------------------------------------------------
-- 7. RPC pour incrément atomique usage code promo (§1.3)
-- Évite la race condition sur usage_actuel
-- -------------------------------------------------------
CREATE OR REPLACE FUNCTION increment_promo_usage(promo_id UUID)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE codes_promo
  SET usage_actuel = COALESCE(usage_actuel, 0) + 1,
      updated_at   = NOW()
  WHERE id = promo_id;
$$;

-- -------------------------------------------------------
-- 8. Index sur audit_log pour les requêtes dashboard
-- -------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_audit_log_tenant_created
  ON audit_log (tenant_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_audit_log_table_action
  ON audit_log (table_name, action);
