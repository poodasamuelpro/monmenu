# MonMenu — Plateforme de commande en ligne pour restaurants

> **Afrique de l'Ouest et Centrale** | Multi-pays | Multi-tenant | Sans commission

## Vue d'ensemble

MonMenu est une plateforme SaaS de commande en ligne destinée aux restaurants d'Afrique de l'Ouest et Centrale, en commençant par le Burkina Faso.

**Principe fondamental :** Les clients commandent sans créer de compte. Seuls les restaurants créent un compte.

---

## URLs

| Environnement | URL |
|---|---|
| Production (public) | https://monmenu.app |
| Boutique restaurant | https://monmenu.app/{slug-restaurant} |
| Suivi commande | https://monmenu.app/suivi/{token} |
| Dashboard restaurant | https://monmenu.app/dashboard |
| Admin (privé) | https://admin.monmenu.app |
| GitHub public | https://github.com/poodasamuelpro/monmenu-public |
| GitHub admin | https://github.com/poodasamuelpro/monmenu-admin |

---

## Stack technique

| Couche | Technologie |
|---|---|
| Runtime | Cloudflare Workers / Pages |
| Framework | Hono (TypeScript) |
| Base de données | Supabase (PostgreSQL) |
| Auth restaurants | Supabase Auth |
| Cache | Cloudflare KV |
| Médias | Cloudflare R2 |
| Email | Brevo (rotation 3 clés API) |
| WhatsApp | WhatsApp Business Cloud API |
| Carte | Mapbox |
| Météo | OpenWeatherMap |
| Déploiement | Cloudflare Pages (CI/CD GitHub) |

---

## Architecture des 2 dépôts

### Dépôt 1 — monmenu-public (ce dépôt)
- Landing page marketing (FR/EN)
- Pages boutique restaurant publiques
- Tableau de bord restaurant
- Clé Supabase : **anon publique** + RLS strict
- **Ne contient JAMAIS la clé service_role**

### Dépôt 2 — monmenu-admin (privé)
- Tableau de bord administrateur plateforme
- Gestion tenants, plans, facturation
- Clé Supabase : **service_role** (Workers uniquement)
- Non indexé (robots.txt noindex), accès protégé

---

## Fonctionnalités implémentées

- [x] Page d'accueil (hero, fonctionnalités, tarifs dynamiques, FAQ, footer)
- [x] Boutique restaurant (menu par catégories, panier localStorage)
- [x] Checkout sans inscription (nom, téléphone, carte Mapbox)
- [x] Calcul dynamique frais de livraison (distance + heure + météo)
- [x] Notification WhatsApp à la commande (API Business Cloud)
- [x] Suivi commande par token unique
- [x] API commandes sécurisée (validation Zod, idempotency, rate limiting)
- [x] API tenants (boutique publique, menu, QR code)
- [x] Tableau de bord restaurant (commandes, menu, stats, QR code)
- [x] Dashboard admin (gestion tenants, plans, config globale)
- [x] Email Brevo avec rotation intelligente 3 clés API
- [x] Schéma DB complet (20+ tables) avec RLS
- [x] Migrations Supabase versionnées
- [x] SEO (meta, OG, sitemap.xml dynamique, robots.txt, hreflang)
- [x] Mode sombre/clair automatique
- [x] Nom projet dynamique depuis config_globale (base de données)
- [x] Security headers (CSP, X-Frame-Options, etc.)
- [x] Multi-pays (BF, CI, CM, ML, SN)

## Fonctionnalités à activer progressivement

- [ ] Mobile Money (Moov, Orange)
- [ ] Carte bancaire
- [ ] Programme fidélité
- [ ] Avis clients
- [ ] Webhooks sortants
- [ ] API d'affiliation
- [ ] Internationalisation EN des boutiques

---

## Modèle de données principal

```
pays → tenants → utilisateurs_tenant
              → points_de_vente
              → categories_menu → produits → variantes_produits
              → livreurs
              → commandes → commandes_historique
              → abonnements → plans
              → stats_journalieres
              → codes_promo
config_globale (nom_projet, etc.)
audit_log
```

---

## Variables d'environnement requises

```bash
# Supabase (JAMAIS la clé service_role dans ce dépôt)
SUPABASE_URL=https://xxxxx.supabase.co
SUPABASE_ANON_KEY=eyJhbGci...

# WhatsApp Business Cloud
WHATSAPP_API_TOKEN=EAAxx...
WHATSAPP_PHONE_ID=1234567890

# Brevo (3 clés en rotation)
BREVO_API_KEY_1=xkeysib-xxx
BREVO_API_KEY_2=xkeysib-yyy
BREVO_API_KEY_3=xkeysib-zzz

# Mapbox
MAPBOX_TOKEN=pk.eyJ1...

# Météo
OPENWEATHER_API_KEY=xxx
```

---

## Déploiement

```bash
# Développement local
npm run build
npm run dev:sandbox

# Production Cloudflare Pages
npm run deploy:prod
```

---

## Sécurité

- RLS activé sur toutes les tables sensibles
- Clé service_role uniquement dans les Workers admin
- Validation Zod côté serveur (Workers)
- Rate limiting par IP
- Idempotency key sur les commandes
- HTTPS/TLS systématique
- Security headers (CSP, X-Frame-Options, etc.)
- UUID v4 pour tous les identifiants (pas d'auto-increment)
- Suppression douce (deleted_at) sur toutes les tables métier
- Audit log complet

---

**Déploiement** : Cloudflare Pages  
**Statut** : En développement — Phase 1 (Burkina Faso)  
**Dernière mise à jour** : 2026-07-26
