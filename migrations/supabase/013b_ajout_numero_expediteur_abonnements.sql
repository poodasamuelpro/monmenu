-- migrations/supabase/013b_ajout_numero_expediteur_abonnements.sql
--
-- CYCLE-8 — Ajout du numéro utilisé par le restaurant pour effectuer le
-- paiement (Mobile Money ou autre), nécessaire pour la tarification et la
-- traçabilité/rapprochement manuel par l'admin.
--
-- Utilisé par :
--   - POST /api/v1/paiement/soumettre   (src/routes/api-paiement.ts)   → écriture
--   - GET  /api/v1/paiement/statut      (src/routes/api-paiement.ts)   → lecture
--   - GET  /api/v1/paiement/historique  (src/routes/api-paiement.ts)   → lecture
--   - GET  /api/v1/admin/paiements      (src/routes/api-admin-paiements.ts) → lecture (admin)
--
-- SANS CETTE MIGRATION : POST /api/v1/paiement/soumettre échouera à
-- l'insertion (colonne inconnue) dès que le front-end enverra le champ
-- numero_expediteur — donc CETTE MIGRATION EST BLOQUANTE, à exécuter AVANT
-- de déployer le code de src/routes/api-paiement.ts (CYCLE-8).

ALTER TABLE public.abonnements
  ADD COLUMN IF NOT EXISTS numero_expediteur text;

COMMENT ON COLUMN public.abonnements.numero_expediteur IS
  'Numéro (Mobile Money ou autre) utilisé par le restaurant pour effectuer '
  'le paiement — saisi par le restaurant au moment de soumettre sa preuve. '
  'Sert au rapprochement manuel par l''admin (SEC-09 : jamais loggé en '
  'clair côté serveur, uniquement stocké en base et affiché dans le panel '
  'admin protégé par ADMIN_WEBHOOK_SECRET).';

-- Contrainte de format légère (numérique, 8 à 20 caractères, + optionnel en
-- tête) — la validation stricte de format reste côté API (voir
-- src/routes/api-paiement.ts, POST /soumettre), cette contrainte est un
-- filet de sécurité en base uniquement.
ALTER TABLE public.abonnements
  ADD CONSTRAINT IF NOT EXISTS numero_expediteur_format
  CHECK (numero_expediteur IS NULL OR numero_expediteur ~ '^\+?[0-9]{8,20}$');

-- Index optionnel : utile si l'admin doit un jour rechercher tous les
-- paiements soumis avec un même numéro (ex : détection de fraude/doublons).
-- Décommenter si besoin réel constaté :
-- CREATE INDEX IF NOT EXISTS idx_abonnements_numero_expediteur
--   ON public.abonnements (numero_expediteur);
