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
