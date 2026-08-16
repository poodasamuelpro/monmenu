-- supabase/migrations/013_fcm_tokens.sql
-- Table pour stocker les tokens FCM des devices des restaurateurs
-- (app mobile monmenu-mobile). Utilisée par src/lib/fcm.ts et les routes
-- POST/DELETE /api/v1/dashboard/fcm-token (src/routes/api-dashboard.ts).

CREATE TABLE IF NOT EXISTS public.fcm_tokens (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id   UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  token       TEXT NOT NULL UNIQUE,
  platform    TEXT NOT NULL DEFAULT 'android' CHECK (platform IN ('android', 'ios', 'web')),
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Index pour requêtes par tenant (performances — sendFcmToTenant lit tous
-- les tokens d'un tenant à chaque envoi de notification)
CREATE INDEX IF NOT EXISTS idx_fcm_tokens_tenant_id ON public.fcm_tokens(tenant_id);

-- RLS — seul le service role (backend Cloudflare Workers) peut lire/écrire.
-- Le mobile n'accède jamais directement à cette table : il passe toujours
-- par POST/DELETE /api/v1/dashboard/fcm-token, qui utilise le client admin
-- (service role) côté serveur.
ALTER TABLE public.fcm_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_all" ON public.fcm_tokens
  FOR ALL USING (auth.role() = 'service_role');

-- Nettoyage automatique des tokens inactifs > 60 jours (à appeler depuis
-- un cron, ex: api-cron.ts, ou manuellement via SQL Editor).
CREATE OR REPLACE FUNCTION public.cleanup_old_fcm_tokens()
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  DELETE FROM public.fcm_tokens
  WHERE updated_at < NOW() - INTERVAL '60 days';
END;
$$;

-- Vérification après exécution :
-- SELECT table_name FROM information_schema.tables
-- WHERE table_schema = 'public' AND table_name = 'fcm_tokens';
-- -- Doit retourner : fcm_tokens
