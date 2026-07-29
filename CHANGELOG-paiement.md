# CHANGELOG — Module Paiement Manuel MonMenu

## [2.0.0] — 2026-07-29 · feat(paiement): implémentation complète

### Nouvelles fonctionnalités

#### Backend (monmenu)
- `src/lib/paiement.ts` — 10 utilitaires : `genererReferencePaiement`, `calculerDeadlineConfirmation`,
  `heuresRestantesAvantDeadline`, `estDeadlineDepassee`, `validerMimeImage` (magic bytes JPEG/PNG),
  `validerExtensionImage`, `validerContentTypeImage`, `construireCleR2Preuve`, `formaterDate`, `formaterMontant`
- `src/routes/api-paiement.ts` — 5 routes API complètes (SEC-01→09) :
  - `GET /api/v1/paiement/statut` — statut abonnement, référence active, délai confirmation
  - `GET /api/v1/paiement/reference` — génère ou retourne la référence du tenant
  - `POST /api/v1/paiement/soumettre` — upload preuve R2, idempotence, rate-limit 3/h
  - `GET /api/v1/paiement/historique` — historique abonnements IDOR-proof
  - `GET /api/v1/paiement/notifications` — notifications in-app bandeau
- `src/routes/api-cron.ts` — Ajout cron `30 */6 * * *` : `bloquerPaiementsExpires()`
  (bloque tenants avec deadline 72h dépassée + notif WhatsApp)
- `src/routes/api-cron.ts` — Fix `verifierEssaisExpires()` : ajoute `en_attente_confirmation`
  dans les statuts vérifiés pour ne pas bloquer les paiements en cours
- `src/routes/api-dashboard.ts` — `GET /api/v1/dashboard/notifications` (audit 07 §1.2)
- `src/lib/whatsapp.ts` — `notifierPaiementConfirme`, `notifierPaiementRejete`, `notifierBlocageAutomatique`
- `src/types/database.ts` — Tenant +2 champs, Abonnement statut étendu +10 champs,
  +interface `NotificationRestaurant`, Env +`ADMIN_BASE_URL` +`ADMIN_WEBHOOK_SECRET`
- `wrangler.jsonc` — crons : ajout `"30 */6 * * *"`

#### Frontend (monmenu)
- `src/pages/dashboard.ts` — Lien nav "Abonnement" + badge orange + `#notification-bandeaux`
  + chargement `dashboard-paiement.js` + `initBandeauxPaiement()`
- `src/pages/bienvenue.ts` — Étape 5 "Abonnement & Paiement" : grille des plans,
  référence de paiement avec copie, instructions Mobile Money
- `src/pages/compte-inactif.ts` — CTA "Déclarer mon paiement" (primaire) + note délai 72h
- `src/index.ts` — `paiementRouter` monté à `/api/v1/paiement` + `en_attente_confirmation`
  autorisé dans la vérification d'accès dashboard
- `public/static/js/dashboard-paiement.js` — Module UI complet :
  - `initBandeauxPaiement()` — bandeaux header selon statut
  - `initSectionAbonnement()` — carte statut + barre délai + upload
  - `soumettrePreuvePaiement()` — drag-and-drop + validation client + progress bar
  - `construireHistorique()` — tableau abonnements
  - `afficherNotificationsPaiement()` — liste notifications

#### Migrations Supabase
- `supabase/migrations/007_abonnement_paiement_manuel.sql`
- `supabase/migrations/008_notifications_paiement.sql`
- `supabase/migrations/009_sync_plans_depuis_d1.sql`

### Sécurité
SEC-01 SEC-02 SEC-03 SEC-05 SEC-06 SEC-07 SEC-08 SEC-09 toutes appliquées.

### Commits
- `d496722` — feat(db): migrations 007/008/009
- `e802a35` — feat(paiement): implémentation complète module paiement manuel — web
