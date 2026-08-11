-- ============================================================
-- MIGRATION MonMenu — Plans (Supabase devient l'unique source
-- de vérité) + création de la table Suppléments.
-- À exécuter UNE SEULE FOIS dans le SQL Editor Supabase,
-- JUSTE AVANT de déployer le nouveau code.
-- ============================================================

-- ── 1) Vérifier / compléter les données réelles des 4 plans ──
-- IMPORTANT : ces UPDATE utilisent des montants d'exemple.
-- Remplace prix_mensuel par le VRAI tarif de chaque plan tel
-- qu'il existait dans D1 avant d'exécuter cette migration.
-- Si tu ne connais pas les montants exacts, va d'abord les
-- vérifier avec : npx wrangler d1 execute TA_BASE --remote
--   --command "SELECT id, nom, prix_mensuel FROM plans;"

-- update plans set prix_mensuel = 0,     actif = true where nom = 'Faso';   -- exemple, à corriger
-- update plans set prix_mensuel = 15000, actif = true where nom = 'Baraka';
-- update plans set prix_mensuel = 25000, actif = true where nom = 'Naaba';
-- update plans set prix_mensuel = 35000, actif = true where nom = 'Mogho';

-- Décommente et corrige les 4 lignes ci-dessus avec les vrais
-- montants avant de lancer cette migration.

-- ── 2) Migrer les abonnements existants dont plan_id est encore
--       un ancien slug D1 (ex: "plan_mogho") vers l'UUID Supabase ──
update abonnements a
set plan_id = p.id::text
from plans p
where p.d1_plan_id = a.plan_id
  and a.plan_id !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';

-- ── 3) Vérification post-migration — DOIT renvoyer 0 ligne ──
select id, plan_id
from abonnements
where plan_id is not null
  and plan_id !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';

-- Si la requête ci-dessus renvoie des lignes, NE DÉPLOIE PAS le
-- nouveau code tant que ce n'est pas réglé (id orphelin sans
-- correspondance d1_plan_id — à corriger manuellement au cas par cas).

-- ── 4) Table Suppléments (nouvelle fonctionnalité) ──
create table if not exists supplements (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  produit_id uuid not null references produits(id) on delete cascade,
  nom text not null,
  prix numeric not null default 0 check (prix >= 0),
  actif boolean not null default true,
  ordre_affichage int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index if not exists idx_supplements_produit
  on supplements(produit_id)
  where deleted_at is null;

create index if not exists idx_supplements_tenant
  on supplements(tenant_id)
  where deleted_at is null;

-- Réutilise le trigger déjà existant sur les autres tables
-- (trigger_set_updated_at) — si absent, décommente ce bloc :
-- create or replace function trigger_set_updated_at()
-- returns trigger as $$
-- begin
--   new.updated_at = now();
--   return new;
-- end;
-- $$ language plpgsql;

drop trigger if exists set_updated_at on supplements;
create trigger set_updated_at
before update on supplements
for each row execute function trigger_set_updated_at();

-- ── FIN DE LA MIGRATION ──
