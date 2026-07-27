-- =============================================================
-- Migration 005 — Blog (articles) + Newsletter
-- =============================================================

-- -------------------------------------------------------
-- Table des articles de blog (écrits depuis le dashboard admin)
-- -------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.articles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT UNIQUE NOT NULL,
  titre TEXT NOT NULL,
  extrait TEXT NOT NULL,
  contenu TEXT NOT NULL,
  categorie TEXT NOT NULL DEFAULT 'Guide',
  temps_lecture TEXT,
  image_url TEXT,
  statut TEXT NOT NULL DEFAULT 'brouillon' CHECK (statut IN ('brouillon', 'publie')),
  auteur TEXT,
  date_publication TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_articles_statut ON public.articles(statut);
CREATE INDEX IF NOT EXISTS idx_articles_slug ON public.articles(slug);
CREATE INDEX IF NOT EXISTS idx_articles_date_publication ON public.articles(date_publication DESC);

-- -------------------------------------------------------
-- Table des inscrits à la newsletter (formulaire du footer)
-- -------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.newsletter_subscribers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  statut TEXT NOT NULL DEFAULT 'actif' CHECK (statut IN ('actif', 'desinscrit')),
  source TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_newsletter_email ON public.newsletter_subscribers(email);

-- -------------------------------------------------------
-- updated_at automatique sur articles (réutilise la fonction
-- trigger_set_updated_at() créée en migration 001)
-- -------------------------------------------------------
DROP TRIGGER IF EXISTS set_updated_at ON public.articles;
CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON public.articles
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

-- =============================================================
-- Row Level Security
-- =============================================================
ALTER TABLE public.articles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.newsletter_subscribers ENABLE ROW LEVEL SECURITY;

-- articles : lecture publique des articles publiés uniquement
CREATE POLICY "articles_public_read" ON public.articles
  FOR SELECT
  USING (statut = 'publie');

-- articles : écriture (create/update/delete/lecture brouillons) réservée au service_role
-- (dashboard admin passe par le backend avec la clé service_role)
CREATE POLICY "articles_service_write" ON public.articles
  FOR ALL
  USING (current_setting('request.jwt.claims', true)::json->>'role' = 'service_role')
  WITH CHECK (current_setting('request.jwt.claims', true)::json->>'role' = 'service_role');

-- newsletter_subscribers : inscription publique (formulaire footer),
-- mais pas de lecture publique (protège les emails des autres inscrits)
CREATE POLICY "newsletter_public_insert" ON public.newsletter_subscribers
  FOR INSERT
  WITH CHECK (true);

CREATE POLICY "newsletter_service_read" ON public.newsletter_subscribers
  FOR SELECT
  USING (current_setting('request.jwt.claims', true)::json->>'role' = 'service_role');

CREATE POLICY "newsletter_service_update" ON public.newsletter_subscribers
  FOR UPDATE
  USING (current_setting('request.jwt.claims', true)::json->>'role' = 'service_role')
  WITH CHECK (current_setting('request.jwt.claims', true)::json->>'role' = 'service_role');
