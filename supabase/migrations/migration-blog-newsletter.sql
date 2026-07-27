-- =============================================================
-- Table des articles de blog (écrits depuis le dashboard admin)
-- =============================================================
create table if not exists public.articles (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  titre text not null,
  extrait text not null,
  contenu text not null,
  categorie text not null default 'Guide',
  temps_lecture text,
  image_url text,
  statut text not null default 'brouillon' check (statut in ('brouillon', 'publie')),
  auteur text,
  date_publication timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_articles_statut on public.articles(statut);
create index if not exists idx_articles_slug on public.articles(slug);
create index if not exists idx_articles_date_publication on public.articles(date_publication desc);

-- =============================================================
-- Table des inscrits à la newsletter (formulaire du footer)
-- =============================================================
create table if not exists public.newsletter_subscribers (
  id uuid primary key default gen_random_uuid(),
  email text unique not null,
  statut text not null default 'actif' check (statut in ('actif', 'desinscrit')),
  source text,
  created_at timestamptz not null default now()
);

create index if not exists idx_newsletter_email on public.newsletter_subscribers(email);
