-- Migration 021 — Assistant IA blog (Gemini) : réglages par défaut dans config_globale
-- Repo : monmenu-admin. Repo web non modifié.
--
-- La table config_globale (clé/valeur) sert déjà de panneau Configuration du
-- dashboard admin. Ces 5 clés activent le paramétrage des garde-fous de
-- l'assistant IA blog (src/lib/ia.ts) :
--   ia_actif              — "oui" / "non" : désactive entièrement l'assistant
--   ia_max_generations_h  — limite d'invocations Gemini / heure / admin (défaut 20)
--   ia_longueur_min       — longueur minimale exigée du texte généré en mots (défaut 300)
--   ia_ton                — "chaleureux" | "professionnel" | "journalistique"
--   ia_sujets_supplement  — règles d'écriture supplémentaires (storytelling, vocabulaire, contexte BF...)
--
-- Le secret GEMINI_API_KEY se configure à part : wrangler secret put GEMINI_API_KEY

INSERT INTO config_globale (cle, valeur, description, updated_at) VALUES
  ('ia_actif', 'oui', 'Active ou désactive l''assistant IA blog (Gemini)', now())
ON CONFLICT (cle) DO NOTHING;

INSERT INTO config_globale (cle, valeur, description, updated_at) VALUES
  ('ia_max_generations_h', '20', 'Limite d''invocations Gemini par heure et par admin', now())
ON CONFLICT (cle) DO NOTHING;

INSERT INTO config_globale (cle, valeur, description, updated_at) VALUES
  ('ia_longueur_min', '300', 'Nombre de mots minimum exigé dans un article généré', now())
ON CONFLICT (cle) DO NOTHING;

INSERT INTO config_globale (cle, valeur, description, updated_at) VALUES
  ('ia_ton', 'chaleureux', 'Ton d''écriture par défaut : chaleureux | professionnel | journalistique', now())
ON CONFLICT (cle) DO NOTHING;

INSERT INTO config_globale (cle, valeur, description, updated_at) VALUES
  ('ia_sujets_supplement', '', 'Règles d''écriture supplémentaires pour l''assistant IA (vide = par défaut)', now())
ON CONFLICT (cle) DO NOTHING;
