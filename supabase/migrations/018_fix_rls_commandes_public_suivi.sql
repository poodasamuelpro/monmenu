-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 018 — fix: policy RLS commandes_public_suivi trop permissive
-- Session 7, A-1 (FINDING-12 CRITIQUE)
--
-- Problème : la policy "commandes_public_suivi" contient la clause
-- `OR deleted_at IS NULL`, ce qui rend TOUTES les commandes non supprimées
-- de TOUS les tenants accessibles publiquement par quiconque possède la clé
-- Supabase anon (visible dans le HTML), en accès direct à Supabase hors Worker.
--
-- Diagnostic : le suivi de commande passe déjà INTÉGRALEMENT par le Worker
-- via `GET /api/v1/commandes/suivi/:token` (api-commandes.ts), qui utilise
-- le client adminClient (service role) — la policy RLS publique n'a donc
-- aucune raison d'exister. Le Worker filtre lui-même par token_suivi ET
-- deleted_at IS NULL, avec son propre contrôle d'accès.
--
-- Correction : suppression de la policy permissive et remplacement par une
-- policy stricte propriétaire uniquement (tenant_id = get_user_tenant_id()),
-- identique à "commandes_tenant_read" qui coexiste déjà.
-- La policy "commandes_public_insert" (INSERT public) est conservée intacte
-- car elle est nécessaire pour permettre aux clients de passer commande.
--
-- Impact fonctionnel : aucun — le suivi public continue de fonctionner via
-- le Worker (qui bypasse RLS via service role). La clé anon ne peut plus
-- lister les commandes d'aucun tenant.
-- ─────────────────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "commandes_public_suivi" ON commandes;

-- Policy stricte : un utilisateur authentifié ne voit QUE les commandes
-- de son propre tenant. Identique à "commandes_tenant_read" déjà en place
-- mais renommée pour remplacer explicitement la policy supprimée.
-- Note : si "commandes_tenant_read" existe déjà (elle est définie dans
-- 002_rls_policies.sql), cette CREATE est protégée par IF NOT EXISTS.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'commandes'
      AND policyname = 'commandes_tenant_owner_select'
  ) THEN
    EXECUTE $policy$
      CREATE POLICY "commandes_tenant_owner_select" ON commandes
        FOR SELECT
        USING (tenant_id = get_user_tenant_id() AND deleted_at IS NULL)
    $policy$;
  END IF;
END;
$$;
