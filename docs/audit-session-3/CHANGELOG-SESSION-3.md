# CHANGELOG Session-3 — MonMenu Audit

**Date** : 2026-08-14 | **Branche** : `fix/audit-session-3`

## Nouvelles fonctionnalités
- **Flux suppression de compte** : POST/GET/POST `/dashboard/compte/suppression` + routes admin `/admin/paiements/suppressions`
- **7 emails transactionnels** : bienvenue, paiement soumis/confirmé/rejeté, rappel expiration, suppression demandée, newsletter
- **Crons rappels expiration** : J-5 (08h UTC) et J-2 (09h UTC)

## Corrections sécurité
- **HSTS** : `max-age=31536000; includeSubDomains; preload`
- **Magic bytes upload** : validation JPEG/PNG/WebP/GIF côté serveur (anti-spoofing MIME)
- **URLs emails** : toutes dynamiques via `PUBLIC_BASE_URL` — fallback `https://monmenu.com`, zéro URL hardcodée
- **escapeHtml** : exportée et appliquée sur tous les templates email
- **Rate limiting KV** : newsletter (IP+email), upload (25/h), suppression (3/24h)
- **essai_expire_le** : vérification real-time dans `verifierAccesTenant()` (cron peut avoir du retard)

## Corrections performance
- **GET /stats** : `allCommandes` → 3 COUNT SQL head-only (anti-fetch mémoire)
- **GET /profil** : `pdv + totalCommandes` en `Promise.all`
- **Admin paiements** : `chargerPlan` → `.in('id', planIds)` groupé
- **Cron stats** : boucle séquentielle → `Promise.allSettled` batches de 5
- **select('*')** → colonnes explicites sur `tenants`, `points_de_vente`, `produits` dans api-commandes.ts

## Corrections bugs
- **RLS bug PATCH /apparence** : switch vers `createSupabaseAdminClient` + vérification rowCount
- **Filtre statut tenants** : `inactif` ajouté pour grace_confirmation (GET /:slug + GET /:slug/menu)
- **KV cache fetchTenantAvecPdv** : 30s TTL, null caché 10s

## Suppressions
- **domaine_perso** : supprimé de 6 fichiers (feature retirée)
- **Middleware custom domain** : supprimé de index.tsx

## Migrations Supabase
- `015_limite_pdv_1.sql` : `UPDATE plans SET limite_pdv = 1`
- `016_suppression_compte.sql` : 4 colonnes + 2 index sur `tenants`
