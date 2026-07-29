# MonMenu — Plateforme de commande en ligne pour restaurants 

## Vue d'ensemble
**MonMenu** est une plateforme SaaS de commande en ligne pour les restaurants d'Afrique de l'Ouest et Centrale. Les restaurateurs créent leur boutique digitale en quelques minutes, gèrent leur menu et reçoivent les commandes directement sur WhatsApp — sans commission.

## Stack technique
- **Backend** : Hono v4 sur Cloudflare Workers (Edge)
- **Base de données applicative** : Supabase PostgreSQL (tenants, commandes, menu, livreurs)
- **Base de données site** : Cloudflare D1 SQLite (config_globale, pays, plans)
- **Cache** : Cloudflare KV (`KV_CACHE`) — optionnel, fortement recommandé en production
- **Médias** : Cloudflare R2 (`R2_MEDIA`)
- **Auth** : Supabase Auth (OTP email + JWT)
- **Temps réel** : Supabase Realtime (`postgres_changes`) — Phase 3
- **Carte** : Leaflet.js + OpenStreetMap + Nominatim
- **Frontend** : Tailwind CSS (CDN), FontAwesome 6.5, Chart.js
- **i18n** : FR/EN — Phase 3
- **Notifications** : WhatsApp Business API + Brevo (email)
- **Cron** : Cloudflare Cron Triggers (`0 2 * * *`) — stats journalières

## Variables d'environnement requises
```
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...   # opérations admin côté serveur
ENVIRONMENT=production              # 'development' | 'production'
WHATSAPP_API_TOKEN=...              # optionnel
WHATSAPP_PHONE_ID=...               # optionnel
BREVO_API_KEY_1=...                 # optionnel
OPENWEATHER_API_KEY=...             # optionnel
MAPBOX_TOKEN=...                    # optionnel
```

Variables Cloudflare (wrangler.jsonc) :
- `KV_CACHE` — Namespace KV pour cache distribué et rate limiting (**fortement recommandé**)
- `R2_MEDIA` — Bucket R2 pour les médias (logos, photos plats)
- `DB` — Base D1 pour la configuration site

## Sécurité (Phase 3)
- **Authentification renforcée** : middleware JWT Supabase réutilisable (`src/middleware/auth.ts`) appliqué aux routes admin du blog et dashboard
- **CSP durcie** : nonce dynamique par requête remplaçant `unsafe-inline` (`generateCspNonce()` dans `src/lib/security.ts`)
- **Rate limiting distribué** : KV-based avec fallback in-memory si KV absent
- **XSS corrigé** : `renderProduitCard()` utilise `data-*` + `addEventListener` (plus d'`onclick` inline JSON)
- **Validation UUID** : `pdv_id` validé regex UUID v4 dans `api-livraison.ts`
- **Erreurs Supabase masquées** : `safeSupabaseError()` — message générique en production, détail loggé serveur seulement

## Fonctionnalités principales
- ✅ Boutique restaurant publique (`/{slug}`) — commande en ligne + carte livraison Leaflet
- ✅ Dashboard restaurant (auth JWT) — commandes temps réel, menu, statistiques, QR code
- ✅ **Supabase Realtime** — nouvelles commandes push (plus de polling 30s)
- ✅ Mode à emporter / livraison à domicile
- ✅ Codes promo (pourcentage, montant fixe, livraison gratuite)
- ✅ Suivi commande client (`/suivi/:token`)
- ✅ Récupération de mot de passe (OTP email)
- ✅ Stats journalières (cron 2h du matin)
- ✅ Blog (lecture publique, admin JWT protégé)
- ✅ Domaines personnalisés (`domaine_perso`)
- ✅ i18n FR/EN (pages institutionnelles)
- ✅ SEO complet (OG, Twitter Card, JSON-LD, hreflang)
- ✅ `llms.txt` accessible à `/llms.txt`

## Fonctionnalités non implémentées (reportées)
- ❌ Programme de fidélité par points
- ❌ Programme de partenaires / affiliation
- ❌ Taux de conversion devise dynamique
- ❌ Avis clients modérables
- ❌ Optimisation images WebP (§7.2 — Cloudflare Polish recommandé à la place)
- ❌ Tailwind CDN → build @tailwindcss/vite (§7.3 — reporté)
- ❌ FontAwesome subset (§7.4 — reporté)

## Déploiement
```bash
# Développement local
npm run build
npx wrangler pages dev dist --d1=webapp-production --local --ip 0.0.0.0 --port 3000

# Production
npm run build
npx wrangler pages deploy dist --project-name monmenu
```

## Phases de correction
- **Phase 1** (Audit) : `AUDIT_MONMENU.md` — juillet 2025
- **Phase 2** (Corrections) : `RAPPORT_CORRECTIONS_MONMENU.md` — juillet 2026
- **Phase 3** (Sécurité + Performance + i18n + SEO) : juillet 2026 — voir `RAPPORT_PHASE3.md`

---

## Module Paiement Manuel (v2.0 — 2026-07-29)

### Flux global
Restaurant → soumet preuve (JPG/PNG) → Admin vérifie → Confirme ou Rejette

### Fenêtres temporelles
| Événement | Délai |
|-----------|-------|
| Soumission → Confirmation admin (engagé) | ≤ 38h |
| Tolérance accès (fenêtre cron blocage) | 72h |
| Cron blocage automatique | toutes les 6h (`30 */6 * * *`) |

### Routes API paiement
| Méthode | Route | Description |
|---------|-------|-------------|
| `GET` | `/api/v1/paiement/statut` | Statut abonnement + référence + délai |
| `GET` | `/api/v1/paiement/reference` | Référence de paiement active |
| `POST` | `/api/v1/paiement/soumettre` | Upload preuve + abonnement en_attente_confirmation |
| `GET` | `/api/v1/paiement/historique` | Historique abonnements du tenant |
| `GET` | `/api/v1/paiement/notifications` | Notifications paiement in-app |
| `GET` | `/api/v1/dashboard/notifications` | Bandeau notifications (alias) |

### Statuts abonnement
`actif` | `essai` | `en_attente_confirmation` *(nouveau)* | `expire` | `annule` | `en_retard`

### Sécurité appliquée
- **SEC-01** : statut jamais fourni par le client
- **SEC-02** : validation MIME 4 couches (ext + Content-Type + magic bytes + taille 5Mo max)
- **SEC-03** : IDOR impossible — filtrage systématique par `tenant_id` du JWT
- **SEC-05** : CSRF — `X-Requested-With: XMLHttpRequest` requis sur toutes routes d'écriture
- **SEC-06** : clé R2 en DB, jamais l'URL publique (URL signée 15min pour admin seulement)
- **SEC-07** : rate-limit 3 soumissions/heure par tenant
- **SEC-08** : idempotence — un seul `en_attente_confirmation` par tenant
- **SEC-09** : aucun nom de fichier ni token dans les logs

### Plans D1 (source de vérité)
| plan_faso | plan_baraka | plan_naaba | plan_mogho |
|-----------|-------------|------------|------------|
| 0 FCFA | 8 000/80 000 FCFA | 18 000/180 000 FCFA | 35 000/350 000 FCFA |

### Migrations Supabase
- `007_abonnement_paiement_manuel.sql` — 10 colonnes abonnements + 2 tenants + CHECK
- `008_notifications_paiement.sql` — tables notifications_restaurant + notifications_admin
- `009_sync_plans_depuis_d1.sql` — synchronisation plans Supabase → D1

### Pages frontend modifiées
- `/dashboard` — nav Abonnement + bandeau notifications
- `/bienvenue` — étape 5 (plan + référence)
- `/dashboard/compte-inactif` — CTA "Déclarer mon paiement"
- `/dashboard/abonnement` — section complète (statut + upload + historique)
