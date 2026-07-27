-- =====================================================
-- Patch 001b — Corriger le schéma de audit_log déjà appliqué
-- (la migration 001 initiale a créé l'ancien schéma
--  table_cible/ligne_id/ancien_valeur/... ; ce patch le
--  transforme vers le schéma attendu par fn_audit_log()
--  de la migration 004 : tenant_id/table_name/record_id/changes)
--
-- Prérequis : audit_log est vide (confirmé).
-- =====================================================

-- Supprimer les anciens index (référencent des colonnes qui vont disparaître)
DROP INDEX IF EXISTS idx_audit_timestamp;
DROP INDEX IF EXISTS idx_audit_table;

-- Supprimer les anciennes colonnes
ALTER TABLE audit_log DROP COLUMN IF EXISTS table_cible;
ALTER TABLE audit_log DROP COLUMN IF EXISTS ligne_id;
ALTER TABLE audit_log DROP COLUMN IF EXISTS ancien_valeur;
ALTER TABLE audit_log DROP COLUMN IF EXISTS nouvelle_valeur;
ALTER TABLE audit_log DROP COLUMN IF EXISTS auteur_id;
ALTER TABLE audit_log DROP COLUMN IF EXISTS ip_address;
ALTER TABLE audit_log DROP COLUMN IF EXISTS "timestamp";

-- Ajouter les nouvelles colonnes attendues par fn_audit_log()
ALTER TABLE audit_log ADD COLUMN IF NOT EXISTS tenant_id UUID;
ALTER TABLE audit_log ADD COLUMN IF NOT EXISTS table_name TEXT;
ALTER TABLE audit_log ADD COLUMN IF NOT EXISTS record_id TEXT;
ALTER TABLE audit_log ADD COLUMN IF NOT EXISTS changes JSONB;
ALTER TABLE audit_log ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- Rendre table_name et record_id obligatoires (table vide, donc sans risque)
ALTER TABLE audit_log ALTER COLUMN table_name SET NOT NULL;
ALTER TABLE audit_log ALTER COLUMN record_id SET NOT NULL;

-- Vérifier que la contrainte CHECK sur action existe toujours
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'audit_log' AND constraint_name = 'audit_log_action_check'
  ) THEN
    ALTER TABLE audit_log ADD CONSTRAINT audit_log_action_check
      CHECK (action IN ('INSERT', 'UPDATE', 'DELETE'));
  END IF;
END $$;
