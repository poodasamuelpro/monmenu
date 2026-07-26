-- Migration 002 : Note RLS
-- Le RLS (Row Level Security) est géré côté Supabase PostgreSQL en production.
-- Cette migration est vide pour D1/SQLite local car SQLite ne supporte pas RLS.
-- Les politiques RLS complètes se trouvent dans supabase/migrations/002_rls_policies.sql
-- et doivent être appliquées via la CLI Supabase sur la base PostgreSQL.

-- Pour D1 local, la sécurité est assurée par :
-- 1. Validation côté Worker (Zod)
-- 2. Vérification tenant_id sur chaque requête SQL paramétrée
-- 3. Rate limiting
-- 4. Idempotency keys

SELECT 1; -- Migration valide
