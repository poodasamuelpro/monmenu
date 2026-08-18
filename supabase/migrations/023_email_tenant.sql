-- ============================================================
-- Migration 023 — Colonne email sur tenants (notifications admin)
-- Repo : monmenu (app web — à appliquer sur la base Supabase unique)
-- Date : 2026-08-18
-- But : le dashboard admin envoie les notifications par email (Brevo) vers
--       l'adresse email du tenant. Cette adresse doit être stockée sur la
--       table `tenants` (la colonne `metadata.email` était vide, aucun code
--       ne la remplissait).
--
-- Ordre d'application STRICT : cette migration DOIT être appliquée AVANT
-- le déploiement du code qui utilise la nouvelle colonne.
-- ============================================================

-- 1. Ajout de la colonne (nullable : les tenants existants n'ont pas encore
--    d'email renseigné — le rattrapage ci-dessous les alimente).
ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS email TEXT;

-- 2. Rattrapage des tenants existants : leur adresse email est déjà dans
--    auth.users (capturée à l'inscription). On la propage via
--    utilisateurs_tenant (le premier utilisateur lié = propriétaire).
--    Idempotent : ré-exécution sans effet.
UPDATE tenants
SET email = (
  SELECT au.email
  FROM utilisateurs_tenant ut
  JOIN auth.users au ON au.id = ut.auth_user_id
  WHERE ut.tenant_id = tenants.id
  ORDER BY ut.created_at ASC
  LIMIT 1
)
WHERE email IS NULL;

-- 3. Documentation uniquement — aucun index : la lecture se fait par PK
--    (id) déjà couverte, pas besoin d'index sur une colonne peu filtrée.
COMMENT ON COLUMN tenants.email IS
  'Adresse email du tenant, utilisée par le dashboard admin pour les notifications email (Brevo). Capturée à l''inscription (register) et modifiable via PATCH /api/v1/dashboard/parametres.';
