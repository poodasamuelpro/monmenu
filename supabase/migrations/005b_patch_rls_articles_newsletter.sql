-- =====================================================
-- Patch 005b — Ajouter RLS sur articles / newsletter_subscribers
-- (tables déjà créées via la version sans RLS ; ce patch
--  active RLS et ajoute les policies, idempotent grâce à
--  DROP POLICY IF EXISTS)
-- =====================================================

-- Trigger updated_at sur articles (au cas où pas encore présent)
DROP TRIGGER IF EXISTS set_updated_at ON public.articles;
CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON public.articles
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

-- Activer RLS
ALTER TABLE public.articles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.newsletter_subscribers ENABLE ROW LEVEL SECURITY;

-- articles : lecture publique des articles publiés uniquement
DROP POLICY IF EXISTS "articles_public_read" ON public.articles;
CREATE POLICY "articles_public_read" ON public.articles
  FOR SELECT
  USING (statut = 'publie');

-- articles : écriture (create/update/delete/lecture brouillons) réservée au service_role
DROP POLICY IF EXISTS "articles_service_write" ON public.articles;
CREATE POLICY "articles_service_write" ON public.articles
  FOR ALL
  USING (current_setting('request.jwt.claims', true)::json->>'role' = 'service_role')
  WITH CHECK (current_setting('request.jwt.claims', true)::json->>'role' = 'service_role');

-- newsletter_subscribers : inscription publique (formulaire footer)
DROP POLICY IF EXISTS "newsletter_public_insert" ON public.newsletter_subscribers;
CREATE POLICY "newsletter_public_insert" ON public.newsletter_subscribers
  FOR INSERT
  WITH CHECK (true);

-- newsletter_subscribers : lecture réservée au service_role (protège les emails)
DROP POLICY IF EXISTS "newsletter_service_read" ON public.newsletter_subscribers;
CREATE POLICY "newsletter_service_read" ON public.newsletter_subscribers
  FOR SELECT
  USING (current_setting('request.jwt.claims', true)::json->>'role' = 'service_role');

-- newsletter_subscribers : mise à jour réservée au service_role
DROP POLICY IF EXISTS "newsletter_service_update" ON public.newsletter_subscribers;
CREATE POLICY "newsletter_service_update" ON public.newsletter_subscribers
  FOR UPDATE
  USING (current_setting('request.jwt.claims', true)::json->>'role' = 'service_role')
  WITH CHECK (current_setting('request.jwt.claims', true)::json->>'role' = 'service_role');
