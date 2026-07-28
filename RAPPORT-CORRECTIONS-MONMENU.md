# RAPPORT COMPLET DES CORRECTIONS — MonMenu
**Date :** 2026-07-28
**Repo :** https://github.com/poodasamuelpro/monmenu
**Agent :** Session audit+corrections complètes

---

## RÉSUMÉ EXÉCUTIF

5 missions d'audit + correction ont été réalisées sur le projet MonMenu (Hono + Cloudflare Workers).
Toutes les corrections critiques sont **committées et poussées** sur GitHub dans des branches dédiées.

| Mission | Sujet | Statut | Branche |
|---------|-------|--------|---------|
| Mission 1 | Auth httpOnly Cookies | ✅ Complète | `feature/auth-httponly-cookies` |
| Mission 2 | i18n FR/EN | ✅ Complète | `fix/i18n-language-switch` |
| Mission 3 | Dark Mode | ✅ Complète | `fix/dark-mode-toggle` |
| Mission 4 | Images R2 | ✅ Complète | `fix/image-upload-display` |
| Mission 5 | Audit Onboarding | ✅ Complète | `main` (fichier MD) |

---

## MISSION 1 — AUTH HTTPONLY COOKIES
**Branche :** `feature/auth-httponly-cookies`
**Commits :** 5

### Problème
31 appels `fetch()` dans `dashboard.js` utilisaient `Authorization: Bearer <token>` en lisant depuis `localStorage.monmenu_auth_token`. Ce token n'existe plus (le serveur pose un cookie httpOnly) → toutes les requêtes du dashboard retournaient 401.

### Corrections apportées

#### `public/static/js/dashboard.js`
- Suppression de `localStorage.getItem('monmenu_auth_token')` dans `initDashboard()`
- **31 requêtes GET** : `fetch(url)` → `fetch(url, { credentials: 'include' })`
- **Toutes requêtes POST/PATCH/DELETE** : ajout du header `X-Requested-With: XMLHttpRequest` + `credentials: 'include'`
- `showAuthError()` : suppression du fallback `localStorage` → simple redirect `/dashboard`

#### `src/pages/dashboard.ts`
- `logout()` : appel serveur `POST /api/v1/auth/logout` avec `credentials: 'include'` avant redirect

#### `src/routes/api-dashboard.ts`
- Ajout helper `checkCsrfProtection()` : vérifie le header `X-Requested-With: XMLHttpRequest` sur toutes les routes d'écriture
- Middleware CSRF appliqué sur : POST, PATCH, PUT, DELETE

#### `src/routes/api-auth.ts`
- Protection CSRF sur `POST /api/v1/auth/logout`
- Protection CSRF sur `POST /api/v1/auth/refresh`

#### `src/index.tsx`
- Ajout de `X-Requested-With` dans `allowHeaders` du middleware CORS

---

## MISSION 2 — I18N FR/EN
**Branche :** `fix/i18n-language-switch`
**Commits :** 1

### Problème
Les fichiers de traduction `src/i18n/fr.json` et `src/i18n/en.json` existaient mais n'étaient **jamais utilisés**. Les pages `home.ts` et `contact.ts` n'acceptaient pas de paramètre `locale`. Les routes `/fr` et `/en` redirectionnaient mais les pages restaient en français.

### Corrections apportées

#### `src/pages/home.ts`
- Signature : `renderHomePage(nomProjet, locale = 'fr')`
- Import `getTranslations` depuis `../i18n`
- Toutes les sections traduites : hero, features (6 cards), "comment ça marche" (4 étapes), partenaires, tarifs, FAQ (9 questions), CTA final
- `renderNav()` appelé avec `locale`

#### `src/pages/contact.ts`
- Signature : `renderContactPage(nomProjet, whatsapp, locale = 'fr')`
- Formulaire, labels, options select, messages de succès/erreur traduits
- `renderNav()` appelé avec `locale`

#### `src/index.tsx`
- Nouvelle fonction `resolveLocale(c)` : `?lang=` > cookie `monmenu-lang` > `Accept-Language` header > `'fr'`
- Routes `/fr`, `/en`, `/fr/*`, `/en/*` : posent maintenant le cookie `monmenu-lang` (Max-Age 1 an)
- `GET /` et `GET /contact` : lisent la locale et la passent aux renderers

#### `src/components/nav.ts`
- Sélecteur de langue converti de `group-hover:block` (CSS-only, cassé sur mobile) vers **JS `toggleLangMenu()`**
- `click-outside` handler pour fermer le menu
- Menu **mobile** : sélecteur de langue ajouté avec indicateur actif ✓
- Label bouton : affiche `EN` ou `FR` selon la locale active

---

## MISSION 3 — DARK MODE
**Branche :** `fix/dark-mode-toggle`
**Commits :** 1

### Problème
`src/pages/boutique.ts` et `src/pages/legal.ts` avaient des classes `dark:` Tailwind dans leur HTML mais n'incluaient pas `<script src="/static/js/main.js">`. Ce script est responsable de lire la préférence `monmenu-theme` dans localStorage et d'ajouter la classe `dark` sur `<html>` → sans lui, le dark mode ne s'activait jamais.

### Corrections apportées

#### `src/pages/boutique.ts`
```html
<script src="/static/js/main.js"></script>  <!-- ajouté avant </body> -->
```

#### `src/pages/legal.ts`
```html
<script src="/static/js/main.js"></script>  <!-- ajouté avant </body> -->
```

---

## MISSION 4 — IMAGES R2
**Branche :** `fix/image-upload-display`
**Commits :** 1

### Problème
L'endpoint `POST /api/v1/dashboard/upload-image` retournait une URL hardcodée :
```typescript
const publicUrl = `https://media.monmenu.app/${key}` // DOMAINE INEXISTANT
```
Ce domaine `media.monmenu.app` n'existe pas. Toutes les images uploadées étaient stockées dans R2 mais leurs URLs retournées au client étaient **inaccessibles** (404 DNS).

### Corrections apportées

#### `src/routes/api-dashboard.ts`
**URL d'upload dynamique :**
```typescript
// AVANT (bug)
const publicUrl = `https://media.monmenu.app/${key}`

// APRÈS (corrigé)
const origin = new URL(c.req.url).origin
const publicUrl = `${origin}/api/v1/media/${encodeURIComponent(key)}`
```

**Nouvelle route `GET /api/v1/media/:key` (route publique R2) :**
- Lit le fichier depuis `c.env.R2_MEDIA`
- Retourne avec le bon `Content-Type`
- Cache `Cache-Control: public, max-age=31536000, immutable`
- Support `ETag` / `If-None-Match` (304 conditionnel)
- Validation du key (pas de traversal `..`, pas de `/` initial)
- Fonctionne sur **n'importe quel sous-domaine Workers** (pas besoin de domaine fixe)

**Autres URLs dynamicisées :**
- `boutique_url` dans `/profil` : `/${tenant.slug}` (relatif)
- `boutiqueUrl` QR code : `${origin}/${tenant.slug}` (dynamique)

#### `src/routes/api-auth.ts`
- `boutique_url` dans `/register` : `/${newTenant.slug}` (relatif)

#### `src/routes/api-tenants.ts`
- `url` dans QR code tenant : `${new URL(c.req.url).origin}/${slug}`

#### `src/pages/boutique.ts`
- `boutiqueUrl` : `/${tenant.slug}` (relatif)

#### `src/index.tsx`
- `baseUrl` sitemap : `new URL(c.req.url).origin` (dynamique)
- `Sitemap:` dans robots.txt : `${origin}/sitemap.xml` (dynamique)

---

## MISSION 5 — AUDIT PARCOURS INSCRIPTION
**Fichier :** `AUDIT-PARCOURS-INSCRIPTION.md`

Voir le fichier dédié pour l'audit complet. Résumé :

| # | Problème | Sévérité | Statut |
|---|----------|----------|--------|
| M5-1 | URL slug affiche `monmenu.app/` dans inscription.ts | 🟡 Moyen | À corriger |
| M5-2 | CSRF non envoyé sur register | 🟢 Faible | À améliorer |
| M5-3 | `boutique_url` domaine .app | 🔴 Critique | ✅ Corrigé Mission 4 |
| M5-4 | Race condition slug unique | 🟡 Moyen | À corriger |
| M5-5 | plan_id hardcodé 'faso' | 🟢 Faible | Acceptable |
| M5-6 | Refresh token non automatique | 🟡 Moyen | À planifier |
| M5-7 | Lien confirmation email Supabase non géré | 🟡 Moyen | À corriger |
| M5-8 | Pas de wizard onboarding | 🟢 Faible | Nice-to-have |

---

## ARCHITECTURE DE SÉCURITÉ FINALE

```
Navigateur
  │
  ├─ Cookie httpOnly sb-access-token (Secure, SameSite=Lax)
  ├─ Cookie httpOnly sb-refresh-token
  ├─ Header X-Requested-With: XMLHttpRequest (CSRF protection)
  └─ credentials: 'include' sur tous les fetch
         │
         ▼
Cloudflare Worker (Hono)
  │
  ├─ CORS : allowHeaders inclut X-Requested-With
  ├─ extractToken() : cookie > Bearer fallback
  ├─ checkCsrfProtection() : toutes routes POST/PATCH/PUT/DELETE
  ├─ verifyAuth() : supabase.auth.getUser(token) — vrai JWT check
  └─ GET /api/v1/media/:key — R2 sans domaine statique
         │
         ▼
Supabase Auth + Cloudflare R2
```

---

## BRANCHES GITHUB

| Branche | Commits | Contenu |
|---------|---------|---------|
| `main` | base | Code original + rapports MD |
| `feature/auth-httponly-cookies` | 5 | Mission 1 complète |
| `fix/dark-mode-toggle` | 1 | Mission 3 |
| `fix/i18n-language-switch` | 1 | Mission 2 complète |
| `fix/image-upload-display` | 1 | Mission 4 complète |

---

## FICHIERS MODIFIÉS — RÉCAPITULATIF GLOBAL

| Fichier | Missions | Modifications |
|---------|---------|---------------|
| `public/static/js/dashboard.js` | M1 | 31 fetch→credentials:include, CSRF headers, initDashboard sans localStorage |
| `src/pages/dashboard.ts` | M1 | logout() appelle serveur |
| `src/routes/api-dashboard.ts` | M1, M4 | CSRF middleware + route GET /media/:key + URLs dynamiques |
| `src/routes/api-auth.ts` | M1, M4 | CSRF sur logout/refresh + boutique_url relatif |
| `src/routes/api-tenants.ts` | M4 | URL tenant dynamique |
| `src/index.tsx` | M1, M2, M4 | CORS headers, resolveLocale(), routes i18n avec cookie, sitemap/robots dynamiques |
| `src/pages/home.ts` | M2, M4 | Locale param, traductions complètes, hreflang relatifs |
| `src/pages/contact.ts` | M2 | Locale param, formulaire traduit |
| `src/pages/boutique.ts` | M3, M4 | main.js ajouté, boutiqueUrl relatif |
| `src/pages/legal.ts` | M3 | main.js ajouté |
| `src/components/nav.ts` | M2 | Sélecteur langue JS-driven, menu mobile i18n |
| `AUDIT-PARCOURS-INSCRIPTION.md` | M5 | Audit complet onboarding |
| `RAPPORT-CORRECTIONS-MONMENU.md` | All | Ce fichier |
