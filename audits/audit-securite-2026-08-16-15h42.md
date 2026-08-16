# Audit Sécurité MonMenu — Web, Mobile, Pentest applicatif & Performance

**Date et heure de génération :** 2026-08-16 — 15h42 UTC  
**Auditeur :** Agent AI Security Analyst — Audit #3 (White-box, accès complet au code source)  
**Dépôt analysé :** `https://github.com/poodasamuelpro/monmenu` — branche `main` (commit `60a7e57`)  
**Branches actives signalées :** `audit/rapport-2026-08-12`, `fix/audit-session-3`, `refactor/remove-i18n-darkmode-unify-design`  
**Périmètre :** Hono + Cloudflare Workers + Supabase + R2 + D1 + KV — SaaS restaurants  
**Méthodologie :** Revue de code statique white-box, fichier par fichier — aucun test actif contre la production

---

## Table des matières

1. [Résumé exécutif](#1-résumé-exécutif)
2. [Section 1 — Authentification & gestion de session](#2-section-1--authentification--gestion-de-session)
3. [Section 2 — Autorisation, isolation multi-tenant & IDOR](#3-section-2--autorisation-isolation-multi-tenant--idor)
4. [Section 3 — Injections (SQL, XSS, template, command)](#4-section-3--injections-sql-xss-template-command)
5. [Section 4 — Protection anti brute-force & rate limiting](#5-section-4--protection-anti-brute-force--rate-limiting)
6. [Section 5 — Headers de sécurité HTTP, CSP & CORS](#6-section-5--headers-de-sécurité-http-csp--cors)
7. [Section 6 — Secrets, configuration & surface d'attaque](#7-section-6--secrets-configuration--surface-dattaque)
8. [Section 7 — Webhooks & sécurité des paiements](#8-section-7--webhooks--sécurité-des-paiements)
9. [Section 8 — Sécurité mobile](#9-section-8--sécurité-mobile)
10. [Section 9 — Performance sous charge & résilience DoS](#10-section-9--performance-sous-charge--résilience-dos)
11. [Synthèse des risques par sévérité](#11-synthèse-des-risques-par-sévérité)
12. [Recommandations générales](#12-recommandations-générales)

---

## 1. Résumé exécutif

| Sévérité | Nombre de findings |
|----------|--------------------|
| **Critique** | 3 |
| **Élevée** | 6 |
| **Moyenne** | 9 |
| **Faible** | 5 |
| **Total** | **23** |

Le projet MonMenu présente une maturité sécurité correcte par rapport à sa taille : un middleware d'authentification centralisé existe (`src/middleware/auth.ts`), des cookies `HttpOnly`/`Secure`/`SameSite=Lax` sont correctement posés, les tokens JWT sont validés via Supabase Auth, la logique d'accès tenant est centralisée dans `verifierAccesTenant()`, et un rate limiting KV est en place sur les routes sensibles.

Néanmoins, plusieurs failles **critiques et élevées** subsistent :

- **CRITIQUE** : La protection CSRF sur les routes d'écriture repose exclusivement sur `X-Requested-With: XMLHttpRequest` — un header librement posable par `fetch()` depuis n'importe quel site tiers, ce qui annule presque entièrement la protection CSRF.
- **CRITIQUE** : La route `POST /api/v1/commandes` applique le rate limiting IP **sans passer le KV** (`c.env.KV_CACHE`), dégradant la protection vers un `Map` en mémoire par isolate — contournable à grande échelle via la rotation d'instances Cloudflare Workers.
- **CRITIQUE** : La CSP active `unsafe-inline` inconditionnellement pour `script-src` sur toutes les pages sans nonce explicite (migration déclarée mais non finalisée), neutralisant la protection XSS pour la quasi-totalité des pages.
- **ÉLEVÉE** : La route `GET /api/v1/commandes/suivi/:token` expose `metadata` (contenant `code_promo` et `remise_promo`) dans la réponse publique, et `notes` de commande, sans filtre — sur-exposition de données.
- **ÉLEVÉE** : L'authentification admin (`api-admin-paiements.ts`) repose sur un secret partagé transmis en header `X-Admin-Secret` sans second facteur ni expiration — un secret compromis donne un accès permanent illimité aux opérations admin les plus critiques.
- **ÉLEVÉE** : Absence totale de protection anti-bot/captcha sur la route `POST /api/v1/auth/register` — permettant la création en masse de comptes fantômes.

---

## 2. Section 1 — Authentification & gestion de session

### FINDING-S1-01 — Cookies de session correctement configurés ✅

**Fichier :** `src/routes/api-auth.ts`, lignes 125–133

```typescript
function cookieOptions(maxAge: number) {
  return {
    httpOnly: true,
    secure: true,
    sameSite: 'Lax' as const,
    path: '/',
    maxAge
  }
}
```

**Analyse :** Les cookies `sb-access-token` et `sb-refresh-token` sont posés avec `HttpOnly: true` (non lisibles depuis JavaScript), `Secure: true` (HTTPS uniquement), `SameSite: Lax` (protection CSRF partielle pour les navigations cross-site). Configuration conforme aux bonnes pratiques.

**Nuance :** `SameSite=Lax` ne protège pas des requêtes `POST` cross-site initiées avec `fetch()` depuis un tiers. Pour des routes sensibles d'écriture, `Strict` serait préférable, mais le CORS + X-Requested-With atténue (imparfaitement — voir FINDING-S1-04).

---

### FINDING-S1-02 — Durée de vie des tokens et révocation des sessions ✅

**Fichier :** `src/routes/api-auth.ts`, lignes 122–123

```typescript
const ACCESS_TOKEN_MAX_AGE = 3600          // 1 heure
const REFRESH_TOKEN_MAX_AGE = 60 * 60 * 24 * 30  // 30 jours
```

**Analyse :** L'access token expire dans 1 heure, conforme aux bonnes pratiques Supabase. Le refresh token est valide 30 jours — standard Supabase. Une session révoquée par l'admin (compte suspendu) est correctement invalidée au niveau du middleware (`authMiddleware`, ligne 81 : `.neq('tenants.statut', 'suspendu')`), qui effectue une vérification en base à chaque requête via `supabase.auth.getUser(token)`. ✅

---

### FINDING-S1-03 — Flux de reset de mot de passe — point manquant (Faible)

**Fichier :** `src/routes/api-auth.ts`, lignes 538–688

**Analyse :**
- `/forgot-password` utilise `supabase.auth.resetPasswordForEmail()` — correct. ✅
- Réponse générique (pas d'énumération de comptes). ✅
- Code OTP 8 chiffres + rate limiting 10 tentatives / 15 min par IP + email. ✅
- `/reset-password` utilise `admin.updateUserById()` + `admin.signOut(token, 'global')`. ✅
- **Point manquant :** Aucune vérification que le nouveau mot de passe ne soit pas identique à l'ancien sur `/reset-password` (vérification présente sur `/profil/change-password` mais absente du flow reset public).

**Sévérité :** Faible

**Correctif proposé :** Ajouter une vérification optionnelle via `signInWithPassword` avant `updateUserById` pour détecter le same-password.

---

### FINDING-S1-04 — Protection CSRF basée sur X-Requested-With (CRITIQUE)

**Fichier :** `src/routes/api-dashboard.ts`, lignes 122–138 ; `src/routes/api-auth.ts`, lignes 102–120

```typescript
dashboardRouter.use('*', async (c, next) => {
  const method = c.req.method.toUpperCase()
  if (!['POST', 'PATCH', 'PUT', 'DELETE'].includes(method)) return next()
  const hasBearerToken = c.req.header('Authorization')?.startsWith('Bearer ')
  if (hasBearerToken) return next()
  const xRequestedWith = c.req.header('X-Requested-With')
  if (xRequestedWith !== 'XMLHttpRequest') {
    return c.json({ error: '...', code: 'CSRF_PROTECTION' }, 403)
  }
  return next()
})
```

**Catégorie :** CSRF (A05:2021 — Security Misconfiguration)

**Description :** La protection CSRF repose uniquement sur la présence du header `X-Requested-With: XMLHttpRequest`. **Ce header n'est pas un secret et peut être librement posé par `fetch()` depuis n'importe quel site tiers.** L'API `fetch()` moderne permet à un site malveillant d'inclure ce header dans une requête cross-origin avec `credentials: 'include'` (qui envoie les cookies).

Le seul vrai garde-fou est la politique CORS (`originAutorisee()`) qui filtre les origines autorisées — mais uniquement pour les requêtes **préflight OPTIONS**. Les navigateurs anciens ou certaines configurations non-standard peuvent contourner ce mécanisme.

**Scénario d'exploitation :**
1. Un restaurateur est connecté sur `monmenu.app` (cookie `sb-access-token` actif).
2. Il visite un site malveillant `evil.com` qui exécute :
   ```javascript
   fetch('https://monmenu.app/api/v1/dashboard/parametres', {
     method: 'PATCH',
     credentials: 'include',
     headers: {
       'Content-Type': 'application/json',
       'X-Requested-With': 'XMLHttpRequest'  // Header librement ajouté
     },
     body: JSON.stringify({ nom: 'Restaurant Hacké', whatsapp_number: '+22600000000' })
   })
   ```
3. Si le navigateur envoie les cookies, l'API accepte la requête comme légitime.

**Sévérité :** **CRITIQUE**

**Correctif proposé — Double-submit cookie pattern :**

```typescript
// src/lib/csrf.ts
export function generateCsrfToken(): string {
  const array = new Uint8Array(32)
  crypto.getRandomValues(array)
  return Array.from(array, b => b.toString(16).padStart(2, '0')).join('')
}

export function verifyCsrfToken(cookieToken: string | undefined, headerToken: string | undefined): boolean {
  if (!cookieToken || !headerToken) return false
  return timingSafeEqual(cookieToken, headerToken)
}

// À la connexion :
// setCookie(c, 'csrf-token', generateCsrfToken(), { secure: true, sameSite: 'Strict', path: '/', httpOnly: false })
// Le frontend lit ce cookie et l'envoie dans le header X-CSRF-Token
// Le serveur compare cookie vs header — un attaquant cross-origin ne peut pas lire le cookie
```

**Alternative plus simple :** Vérifier l'header `Origin` de façon stricte côté serveur pour toutes les mutations, en complément de CORS.

---

### FINDING-S1-05 — Tokens JWT renvoyés en clair dans le body JSON (Élevée)

**Fichier :** `src/routes/api-auth.ts`, lignes 241–252 (login), 454–477 (register)

```typescript
return c.json({
  success: true,
  access_token: data.session.access_token,   // JWT en clair dans le body
  refresh_token: data.session.refresh_token,  // Refresh token en clair
  tenant: { ... }
})
```

**Description :** Les tokens d'accès et de rafraîchissement sont renvoyés dans les cookies httpOnly ET dans le corps JSON de la réponse. Pour les clients navigateur, le body JSON est accessible par JavaScript. Si une XSS est exploitée sur le dashboard, un attaquant peut intercepter la réponse de connexion et exfiltrer les tokens.

**Sévérité :** **Élevée** (surtout si XSS présente)

**Correctif proposé :**
```typescript
// Ne pas inclure les tokens dans le body pour les clients navigateur (cookie-first)
const isApiClient = c.req.header('Authorization')?.startsWith('Bearer ')
return c.json({
  success: true,
  ...(isApiClient ? { access_token: data.session.access_token, refresh_token: data.session.refresh_token } : {}),
  tenant: { ... }
})
```

---

## 3. Section 2 — Autorisation, isolation multi-tenant & IDOR

### FINDING-S2-01 — Isolation multi-tenant correctement implémentée ✅

**Analyse globale :** Chaque route sensible du dashboard filtre systématiquement par `auth.tenant_id` dérivé du JWT validé côté serveur, jamais depuis le body client. Le tenant est résolu via slug URL dans `api-commandes.ts` (FINDING-05 session-7 corrigé). Aucune faille IDOR directe détectée sur les routes authentifiées. ✅

---

### FINDING-S2-02 — Sur-exposition de données sur la route de suivi commande (Élevée)

**Fichier :** `src/routes/api-commandes.ts`, lignes 482–522

```typescript
const { data: commande } = await adminClient
  .from('commandes')
  .select(`
    id, client_nom, items_json, montant_total,
    frais_livraison, mode_paiement, statut,
    token_suivi, notes, metadata, created_at, updated_at,  // ← metadata + notes exposés
    tenants!inner(nom, logo_url, couleur_primaire, slug)
  `)
  .eq('token_suivi', token)  // Route publique, sans authentification
```

**Catégorie :** Sur-exposition de données (A03:2021 — Sensitive Data Exposure)

**Description :** La route publique `/api/v1/commandes/suivi/:token` (sans authentification) renvoie le champ `metadata` JSON qui contient `{"code_promo": "PROMO123", "remise_promo": 1500}`, ainsi que `notes` (commentaires libres du client). Ces données ne sont pas nécessaires pour le suivi de commande et ne doivent pas être exposées publiquement.

**Scénario d'exploitation :**
1. Un client partage son lien de suivi WhatsApp.
2. Un tiers récupère le token depuis le lien et appelle `GET /api/v1/commandes/suivi/{token}`.
3. La réponse JSON contient `metadata.code_promo` — le code promo confidentiel du restaurateur est exposé.

**Sévérité :** **Élevée**

**Correctif proposé (`api-commandes.ts`) :**
```typescript
// Remplacer le select — ne pas sélectionner 'notes' ni 'metadata'
const { data: commande } = await adminClient
  .from('commandes')
  .select(`
    id, client_nom, items_json, montant_total,
    frais_livraison, mode_paiement, statut,
    token_suivi, created_at, updated_at,
    tenants!inner(nom, logo_url, couleur_primaire, slug)
  `)
  .eq('token_suivi', token)
  .is('deleted_at', null)
  .single()

// Dans le return — ne pas inclure notes ni metadata :
return c.json({
  commande: {
    id: commande.id,
    client_nom: commande.client_nom,
    items,
    montant_total: commande.montant_total,
    frais_livraison: commande.frais_livraison,
    mode_paiement: commande.mode_paiement,
    statut: commande.statut,
    token_suivi: commande.token_suivi,
    created_at: commande.created_at,
    updated_at: commande.updated_at,
    restaurant_nom: tenantInfo?.nom,
    logo_url: tenantInfo?.logo_url,
    couleur_primaire: tenantInfo?.couleur_primaire,
    restaurant_slug: tenantInfo?.slug,
  },
  historique: historique ?? []
})
```

---

### FINDING-S2-03 — Authentification admin par secret statique partagé (CRITIQUE)

**Fichier :** `src/routes/api-admin-paiements.ts`, lignes 48–63

```typescript
adminPaiementsRouter.use('*', async (c, next) => {
  const secret = c.req.header('X-Admin-Secret')
  if (!c.env.ADMIN_WEBHOOK_SECRET) return c.json({ error: 'Administration non configurée.' }, 503)
  if (!secret || !timingSafeEqual(secret, c.env.ADMIN_WEBHOOK_SECRET)) {
    return c.json({ error: 'Non autorisé.' }, 401)
  }
  return next()
})
```

**Catégorie :** Authentification insuffisante (A07:2021 — Identification and Authentication Failures)

**Description :** L'intégralité du panneau admin (confirmation/rejet de paiements, suppression de comptes, gestion des moyens de paiement) est protégée par un **unique secret statique** transmis en header HTTP. Problèmes critiques :

1. Pas de rotation automatique — un secret compromis donne un accès illimité dans le temps.
2. Pas de second facteur — aucune authentification utilisateur.
3. Pas d'audit trail des accès admin — `admin_id` est optionnel et non vérifié.
4. Pas de limitation de tentatives — bruteforce possible si l'entropie du secret est faible.
5. Toutes les routes admin partagent le même secret — pas de granularité.

**Scénario d'exploitation :**
Un attaquant qui obtient le secret peut confirmer frauduleusement des paiements inexistants (activer des tenants sans paiement), rejeter des paiements légitimes, supprimer des comptes, ou accéder aux preuves de paiement de tous les tenants.

**Sévérité :** **CRITIQUE**

**Correctif proposé (court terme) :**
```typescript
adminPaiementsRouter.use('*', async (c, next) => {
  // Rate limiting anti-bruteforce
  const ip = c.req.header('CF-Connecting-IP') ?? 'unknown'
  if (c.env.KV_CACHE) {
    const rl = await checkRateLimit(`admin-secret:${ip}`, 10, 900000, c.env.KV_CACHE)
    if (!rl.allowed) {
      console.error(`[Admin] Bruteforce tenté depuis IP: ${ip}`)
      return c.json({ error: 'Trop de tentatives.' }, 429)
    }
  }
  
  const secret = c.req.header('X-Admin-Secret')
  if (!c.env.ADMIN_WEBHOOK_SECRET) return c.json({ error: 'Non configuré.' }, 503)
  if (!secret || !timingSafeEqual(secret, c.env.ADMIN_WEBHOOK_SECRET)) {
    console.error(`[Admin] Accès refusé depuis IP: ${ip}`)
    return c.json({ error: 'Non autorisé.' }, 401)
  }
  return next()
})
```

**Correctif moyen terme :** Migrer vers une authentification Supabase Auth avec rôle admin vérifié en base.

---

### FINDING-S2-04 — Route admin preuve/:id — validation UUID manquante (Moyenne)

**Fichier :** `src/routes/api-admin-paiements.ts`, lignes 504–539

```typescript
adminPaiementsRouter.get('/preuve/:id', async (c) => {
  const abonnementId = c.req.param('id')
  // Pas de validation UUID ici (contrairement à /confirmer et /rejeter)
  // Recherche sur tout statut, pas seulement 'en_attente_confirmation'
```

**Description :** La route `/preuve/:id` récupère les URLs signées R2 pour n'importe quel abonnement, quel que soit son statut (y compris des preuves archivées). La validation de format UUID absente (présente dans les autres routes admin).

**Sévérité :** **Moyenne**

**Correctif :**
```typescript
adminPaiementsRouter.get('/preuve/:id', async (c) => {
  const abonnementId = c.req.param('id')
  const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
  if (!UUID_REGEX.test(abonnementId ?? '')) {
    return c.json({ error: 'Format id invalide (UUID v4 attendu).' }, 422)
  }
  // ...
})
```

---

### FINDING-S2-05 — Logique d'autorisation dupliquée avec comportement différent (Élevée)

**Fichiers :** `src/routes/api-commandes.ts` (lignes 71–95) ET `src/routes/api-dashboard.ts` (lignes 153–179)

**Description :** La fonction `verifyRestaurantAuth()` dans `api-commandes.ts` duplique `verifyAuth()` de `api-dashboard.ts` avec une logique différente :

- `verifyAuth()` (dashboard) : appelle `verifierAccesTenant()`, exige `accesComplet` → bloque un tenant `bloque`/`inactif`.
- `verifyRestaurantAuth()` (commandes/mobile) : vérifie uniquement `.neq('tenants.statut', 'suspendu')` → un tenant `bloque`/`inactif` peut toujours modifier le statut de ses commandes via l'app mobile.

**Scénario :** Un tenant dont l'abonnement a expiré (accès `bloque`) peut continuer à accéder à `PATCH /api/v1/commandes/:id/statut` via l'app mobile, alors que le dashboard web lui est bloqué.

**Sévérité :** **Élevée** (incohérence métier)

**Correctif :** Utiliser le middleware centralisé `authMiddleware` de `src/middleware/auth.ts` sur toutes les routes protégées, y compris `api-commandes.ts`.

```typescript
// api-commandes.ts
import { authMiddleware } from '../middleware/auth'
commandesRouter.use('/:id/statut', authMiddleware)
commandesRouter.patch('/:id/statut', async (c) => {
  const auth = c.get('auth')  // { user_id, tenant_id, tenant_slug, token }
  // ...
})
```

---

### FINDING-S2-06 — Vérification accès blog admin (Faible)

**Analyse :** Le commit `8c0e1af` (session-7) a ajouté la vérification `ADMIN_EMAILS` sur les routes blog `/admin/*`. Correctif appliqué. La vérification repose sur l'email Supabase — suffisant si 2FA est activé sur les comptes admin Supabase.

**Sévérité :** Faible ✅

---

## 4. Section 3 — Injections (SQL, XSS, template, command)

### FINDING-S3-01 — XSS potentiel via le contenu d'articles de blog (Élevée)

**Fichier :** `src/index.tsx` lignes 418–447 → `src/pages/article.ts`

**Description :** La route `GET /blog/:slug` récupère le champ `contenu` depuis Supabase et le passe à `renderArticlePage()`. Si `contenu` est du HTML riche non sanitisé, un admin compromis peut injecter des balises `<script>` ou des handlers d'événements servis à tous les visiteurs.

**Sévérité :** **Élevée**

**Correctif :** Sanitiser le HTML avant rendu SSR :
```typescript
// Dans renderArticlePage() — filtrer avant injection HTML
function sanitizeHtml(html: string): string {
  return html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/\son\w+\s*=\s*["'][^"']*["']/gi, '')
    .replace(/javascript:/gi, 'nojavascript:')
}
// Ou utiliser la librairie sanitize-html avec whitelist stricte
```

---

### FINDING-S3-02 — CSP `unsafe-inline` actif sur script-src (CRITIQUE)

**Fichier :** `src/lib/security.ts`, lignes 157–184

```typescript
export function setSecurityHeaders(c: Context, nonce?: string): string {
  const usedNonce = nonce ?? generateCspNonce()
  const scriptSrcDirective = nonce
    ? `'nonce-${usedNonce}' cdn.tailwindcss.com cdn.jsdelivr.net api.mapbox.com`
    : `'unsafe-inline' 'nonce-${usedNonce}' cdn.tailwindcss.com cdn.jsdelivr.net api.mapbox.com`
  // ...
}
```

**Description :** Pratiquement toutes les routes appellent `setSecurityHeaders(c)` **sans passer de nonce explicite**, ce qui active systématiquement `'unsafe-inline'` dans `script-src`. La CSP avec `unsafe-inline` ne protège pas contre les XSS — tout script inline s'exécute.

**Sévérité :** **CRITIQUE** (annule la protection XSS principale)

**Correctif :** Finaliser la migration vers les nonces CSP :

```typescript
// Dans src/index.tsx, chaque route de page HTML :
app.get('/', async (c) => {
  const nonce = setSecurityHeaders(c)  // Retourne le nonce
  const nomProjet = await getNomProjet(c.env)
  return c.html(renderHomePage(nomProjet, nonce))  // Passer le nonce au template
})

// Dans chaque template (ex: src/pages/home.ts) :
export function renderHomePage(nomProjet: string, nonce: string) {
  return `<script nonce="${nonce}">/* scripts inline */</script>`
}

// Puis dans setSecurityHeaders(), supprimer 'unsafe-inline' :
const scriptSrcDirective = `'nonce-${usedNonce}' cdn.tailwindcss.com cdn.jsdelivr.net api.mapbox.com`
```

---

### FINDING-S3-03 — Injection CSV dans les exports (Moyenne)

**Fichier :** `src/routes/api-dashboard.ts`, lignes 452–487

```typescript
const rows = (commandes ?? []).map(cmd => {
  return [
    cmd.client_nom,   // Données utilisateur non préfixées contre formules
    cmd.notes ?? '',
    ...
  ].map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(',')
})
```

**Description :** Un `client_nom` ou `notes` contenant `=CMD("calc.exe")` ou `@SUM(1+1)` peut être interprété comme une formule par certaines versions d'Excel ou LibreOffice lors de l'ouverture du CSV.

**Sévérité :** **Moyenne**

**Correctif :**
```typescript
function escapeCsvField(value: string): string {
  let escaped = String(value ?? '').replace(/"/g, '""')
  // Neutraliser les caractères déclencheurs de formules
  if (/^[=+\-@\t\r]/.test(escaped)) {
    escaped = `'${escaped}`
  }
  return `"${escaped}"`
}
```

---

### FINDING-S3-04 — Injection dans les liens WhatsApp (Faible)

**Description :** Les numéros WhatsApp sont correctement validés par regex. Cependant, les messages générés par `genererMessageCommande()` peuvent contenir des données utilisateur (nom client, adresse) non encodées avant injection dans l'URL `wa.me/?text=...`.

**Sévérité :** **Faible**

**Correctif :** Encoder les messages avec `encodeURIComponent()` avant construction de l'URL `wa.me`.

---

### FINDING-S3-05 — Validation MIME des images par magic bytes ✅

**Fichier :** `src/routes/api-dashboard.ts`, lignes 1886–1893 ; `src/lib/validation.ts`

**Analyse :** Validation en 4 couches (extension, Content-Type déclaré, magic bytes, taille max 5 MB). Les fichiers HTML ou exécutables ne peuvent pas être uploadés avec une extension image valide. ✅

---

### FINDING-S3-06 — Pas d'injection SQL via les clients Supabase JS ✅

**Analyse :** Toutes les requêtes Supabase utilisent l'API fluent client JS (paramétrisée nativement). Aucun `rpc()` avec concaténation de chaîne détecté. Les fonctions SQL (ex. `increment_promo_usage` via RPC) reçoivent des paramètres typés, pas des chaînes concaténées. ✅

---

## 5. Section 4 — Protection anti brute-force & rate limiting

### FINDING-S4-01 — Rate limiting commandes sans KV — fallback Map par isolate (CRITIQUE)

**Fichier :** `src/routes/api-commandes.ts`, ligne 143

```typescript
// PROBLÈME : pas de 4ème argument c.env.KV_CACHE
const rateLimit = await checkRateLimit(`commande:${ip}`, 10, 60000)

// COMPARAISON — route login (correct) :
const rateLimit = await checkRateLimit(`auth_login:${ip}`, 5, 900000, c.env.KV_CACHE)
```

**Description :** Sans le paramètre `kv`, `checkRateLimit()` utilise un `Map` local à l'isolate Workers. Dans Cloudflare Workers, **chaque instance de l'isolate a son propre état en mémoire**, et les Workers tournent sur plusieurs datacenters simultanément. Un attaquant distribuant ses requêtes sur plusieurs régions Cloudflare peut totalement contourner ce rate limiting.

**Sévérité :** **CRITIQUE**

**Correctif (`api-commandes.ts`, ligne 143 et ligne 602) :**
```typescript
// Ligne 143 — POST /api/v1/commandes :
const rateLimit = await checkRateLimit(`commande:${ip}`, 10, 60000, c.env.KV_CACHE)

// Ligne 602 — POST /api/v1/commandes/valider-promo :
const rateLimit = await checkRateLimit(`promo-check:${ip}`, 20, 60000, c.env.KV_CACHE)
```

**Fichiers additionnels impactés :** Auditer tous les appels `checkRateLimit()` sans 4ème argument dans `api-contact.ts`, `api-newsletter.ts`.

---

### FINDING-S4-02 — Absence de protection anti-bot sur l'inscription (Élevée)

**Fichier :** `src/routes/api-auth.ts`, lignes 263–478

**Description :** Rate limiting IP (15 tentatives/heure) mais **aucun captcha ou honeypot**. Avec rotation d'IP, un bot peut créer des centaines de comptes/jour, entraînant : spam Brevo, pollution DB Supabase, coûts d'infrastructure.

**Sévérité :** **Élevée**

**Correctif — Intégrer Cloudflare Turnstile :**
```typescript
// Dans api-auth.ts /register :
const turnstileToken = body.cf_turnstile_token
if (c.env.TURNSTILE_SECRET_KEY && turnstileToken) {
  const verifyResp = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
    method: 'POST',
    body: new URLSearchParams({
      secret: c.env.TURNSTILE_SECRET_KEY,
      response: turnstileToken,
      remoteip: ip
    })
  })
  const result = await verifyResp.json() as { success: boolean }
  if (!result.success) {
    return c.json({ error: 'Vérification anti-bot échouée. Réessayez.' }, 422)
  }
}
```

---

### FINDING-S4-03 — Absence de rate limiting sur le formulaire de contact (Moyenne)

**Fichier :** `src/routes/api-contact.ts` (référencé `src/index.tsx` ligne 198)

**Description :** Le formulaire de contact public envoie un email via Brevo. Sans rate limiting, un attaquant peut déclencher des milliers d'emails en quelques secondes, épuisant le quota Brevo.

**Sévérité :** **Moyenne**

**Correctif :** Appliquer un rate limiting IP + KV (5 messages/heure par IP) :
```typescript
const rateLimit = await checkRateLimit(`contact:${ip}`, 5, 3600000, c.env.KV_CACHE)
if (!rateLimit.allowed) return c.json({ error: 'Trop de messages. Réessayez dans 1 heure.' }, 429)
```

---

### FINDING-S4-04 — Pas de verrouillage de compte (Faible / Acceptable)

**Analyse :** Rate limiting par IP + par email sur login et OTP — équilibre correct entre sécurité et anti-DoS sur comptes légitimes. Le verrouillage compte (N échecs → blocage) est volontairement absent pour éviter qu'un attaquant ne bloque les comptes légitimes de ses cibles. Cette approche est défendable. ✅

**Sévérité :** Faible

---

## 6. Section 5 — Headers de sécurité HTTP, CSP & CORS

### FINDING-S5-01 — Headers de sécurité — synthèse

**Fichier :** `src/lib/security.ts`, lignes 167–183

| Header | Valeur | Évaluation |
|--------|--------|------------|
| `Strict-Transport-Security` | `max-age=31536000; includeSubDomains; preload` | ✅ Correct |
| `X-Content-Type-Options` | `nosniff` | ✅ Correct |
| `X-Frame-Options` | `DENY` | ✅ Correct |
| `X-XSS-Protection` | `1; mode=block` | ⚠️ Obsolète, inoffensif |
| `Referrer-Policy` | `strict-origin-when-cross-origin` | ✅ Correct |
| `Permissions-Policy` | `geolocation=(self), microphone=()` | ✅ Raisonnable |
| `Content-Security-Policy` | Voir FINDING-S3-02 | ❌ `unsafe-inline` actif |
| `frame-ancestors` | `'none'` | ✅ Correct (via CSP) |

**Manquant :** `Cross-Origin-Opener-Policy`, `Cross-Origin-Embedder-Policy` (recommandés mais non critiques).

---

### FINDING-S5-02 — CSP `connect-src` trop large (Moyenne)

**Fichier :** `src/lib/security.ts`, ligne 179

```typescript
`connect-src 'self' https://*.supabase.co wss://*.supabase.co api.mapbox.com events.mapbox.com api.openweathermap.org graph.facebook.com nominatim.openstreetmap.org api.qrserver.com; `
```

**Description :** `graph.facebook.com` est autorisé sans justification visible dans le code frontend audité. Si du code malveillant (via XSS) tente d'exfiltrer des données vers Facebook Graph, la CSP ne le bloquera pas.

**Sévérité :** **Moyenne**

**Correctif :** Supprimer `graph.facebook.com` de `connect-src` si aucun appel à Facebook Graph n'est effectué depuis le frontend.

---

### FINDING-S5-03 — CORS `localhost` autorisé en production (Faible)

**Fichier :** `src/index.tsx`, lignes 150–151

```typescript
const localhosts = ['http://localhost:5173', 'http://localhost:3000']
if (localhosts.includes(origin)) return origin
```

**Description :** Les origines `localhost` devraient être conditionnées à l'environnement de développement.

**Sévérité :** **Faible**

**Correctif :**
```typescript
const localhosts = c.env.ENVIRONMENT === 'development'
  ? ['http://localhost:5173', 'http://localhost:3000']
  : []
```

---

### FINDING-S5-04 — CORS configuration globale ✅

**Analyse :** La fonction `originAutorisee()` (lignes 146–166) filtre correctement les origines autorisées. Le Workers.dev URL est comparé de façon exacte (FINDING-20 session-7 corrigé). `credentials: true` est correctement couplé à une liste d'origines précises (pas de wildcard `*` avec credentials). ✅

---

## 7. Section 6 — Secrets, configuration & surface d'attaque

### FINDING-S6-01 — Aucun secret en dur dans le code source ✅

**Analyse :** Recherche sur les motifs `sk_`, `Bearer `, `password =`, `SECRET`, clés longues suspectes — aucun secret trouvé en dur. Variables d'environnement correctement référencées via `c.env.*`. ✅

---

### FINDING-S6-02 — Messages d'erreur 500 — nuance (Faible)

**Fichier :** `src/index.tsx`, lignes 605–610 ; `src/routes/api-dashboard.ts`

**Description :** Le handler d'erreur global renvoie `"Erreur interne du serveur."` sans stack trace. ✅ Cependant, certaines routes locales exposent `detail: error.message` (ex. `api-dashboard.ts` ligne 310) qui peut contenir des noms de tables/colonnes Supabase.

**Sévérité :** **Faible**

**Correctif :** Conditionner `detail` à `c.env.ENVIRONMENT !== 'production'`.

---

### FINDING-S6-03 — Absence de Subresource Integrity sur les CDN (Faible)

**Description :** Les scripts CDN (Tailwind, FontAwesome, Chart.js, Axios) dans les templates HTML n'ont pas d'attributs `integrity` et `crossorigin`. Si un CDN est compromis, du code malveillant peut être injecté.

**Sévérité :** **Faible**

**Correctif :** Ajouter les attributs SRI :
```html
<script src="https://cdn.jsdelivr.net/npm/axios@1.6.0/dist/axios.min.js"
        integrity="sha384-[HASH_SHA384]"
        crossorigin="anonymous"></script>
```

---

### FINDING-S6-04 — Configuration wrangler.jsonc correcte ✅

**Analyse :** Schéma `$schema` présent. Aucun secret dans le fichier. Bindings séparés selon usage. ✅

---

## 8. Section 7 — Webhooks & sécurité des paiements

### FINDING-S7-01 — Montant du paiement forcé côté serveur ✅

**Fichier :** `src/routes/api-paiement.ts`, ligne 418

```typescript
const montantPaye = plan.prix_mensuel  // Toujours lu depuis Supabase, jamais depuis le client
```

**Analyse :** Montant facturé extrait directement du plan Supabase validé. Aucune valeur financière n'est acceptée depuis le body client. ✅

---

### FINDING-S7-02 — Idempotence des paiements ✅

**Fichier :** `src/routes/api-paiement.ts`, lignes 372–388 ; `src/routes/api-admin-paiements.ts`, lignes 159–176

**Analyse :** Un seul abonnement `en_attente_confirmation` par tenant à la fois. La confirmation utilise `.eq('statut', 'en_attente_confirmation')` + vérification des lignes affectées — protection contre les double-confirmations. ✅

---

### FINDING-S7-03 — Paiement manuel — pas de webhook tiers (Faible / Non applicable)

**Analyse :** MonMenu utilise un paiement manuel (preuve uploadée, validation admin humaine). Pas de webhook de prestataire externe dans le code audité. Si des webhooks automatiques sont intégrés dans le futur, une vérification HMAC-SHA256 devra être implémentée.

**Sévérité :** Faible (hors périmètre actuel)

---

### FINDING-S7-04 — Rate limiting paiement conditionnel (Moyenne)

**Fichier :** `src/routes/api-paiement.ts`, lignes 309–315

```typescript
if (c.env.KV_CACHE) {  // Rate limiting sauté si KV absent
  const rateLimit = await checkRateLimit(...)
  if (!rateLimit.allowed) return c.json(..., 429)
}
```

**Description :** Si `KV_CACHE` est non configuré (staging sans KV), la vérification est sautée. Un tenant pourrait soumettre des centaines de preuves, remplissant R2 et spammant les admins.

**Sévérité :** **Moyenne**

**Correctif :** Rendre le rate limiting non-conditionnel (fallback Map si KV absent) :
```typescript
// Toujours vérifier — checkRateLimit a déjà un fallback Map si kv est undefined
const rateLimit = await checkRateLimit(
  `paiement_upload:${auth.tenant_id}`,
  RATE_LIMIT_UPLOAD,
  RATE_LIMIT_WINDOW,
  c.env.KV_CACHE
)
if (!rateLimit.allowed) return c.json({ error: 'Trop de soumissions. Réessayez dans 1 heure.' }, 429)
```

---

## 9. Section 8 — Sécurité mobile

### FINDING-S8-01 — Application mobile Flutter non auditée (Moyenne)

**Fichiers de référence :** `audits/AUDIT-MOBILE-FLUTTER-MONMENU.md`, `docs/audit-session-3/IMPACT-API-MOBILE.md`

**Analyse :** Le dépôt principal ne contient pas de code d'application mobile. L'API mobile utilise le header `Authorization: Bearer` (supporté par `authMiddleware` et `verifyRestaurantAuth`).

**Risques identifiés depuis le code backend :**
1. Le logger Hono ne trace pas les headers — pas d'exposition des tokens dans les logs. ✅
2. Durée de vie du refresh token mobile : 30 jours — si l'app stocke ce token dans AsyncStorage non chiffré (Android), il est extractible par toute app malveillante sur l'appareil.
3. Pas de pinning de certificat vérifiable côté backend.

**Sévérité :** **Moyenne** (nécessite audit du code Flutter séparé)

**Recommandation :** Demander l'accès au dépôt Flutter. S'assurer que les tokens sont stockés dans Keystore (Android) / Keychain (iOS), pas dans SharedPreferences ou AsyncStorage non chiffré.

---

## 10. Section 9 — Performance sous charge & résilience DoS

### FINDING-S9-01 — Limite de taille body absente avant lecture formData (Moyenne)

**Fichier :** `src/routes/api-dashboard.ts` ligne 1867 ; `src/routes/api-paiement.ts` ligne 322

```typescript
// Dans upload-image et paiement/soumettre :
let formData: FormData
try {
  formData = await c.req.formData()  // Body entier lu avant vérification de taille
}
```

**Description :** La vérification de taille (`file.size > MAX_SIZE`) se fait APRÈS que le body entier est lu en mémoire. Un upload de 99 MB déclenche la lecture complète avant rejet.

**Sévérité :** **Moyenne**

**Correctif :** Vérifier `Content-Length` avant la lecture du body :
```typescript
const contentLength = parseInt(c.req.header('Content-Length') ?? '0')
if (contentLength > 10 * 1024 * 1024) {
  return c.json({ error: 'Payload trop volumineux.' }, 413)
}
```

---

### FINDING-S9-02 — Export CSV jusqu'à 5000 commandes en mémoire (Moyenne)

**Fichier :** `src/routes/api-dashboard.ts`, ligne 445

```typescript
.limit(5000)
```

**Description :** L'export CSV charge jusqu'à 5000 commandes en mémoire Workers. Rate limiting à 10/heure en place (FINDING-29 session-7 corrigé ✅), mais une seule requête peut saturer l'isolate.

**Sévérité :** **Moyenne** (mitigé par le rate limiting)

**Correctif :** Réduire à 1000 commandes max avec pagination ou streaming.

---

### FINDING-S9-03 — Timeouts sur les appels externes (Faible / Partiellement corrigé)

**Analyse :** Brevo : timeout 8s via `AbortSignal.timeout` (FINDING-30 session-7 ✅). Supabase : pas de timeout explicite côté code (géré par Supabase). thum.io, OpenWeather : timeout non visible dans le code audité.

**Sévérité :** **Faible**

---

### FINDING-S9-04 — Cache KV boutiques ✅

**Fichier :** `src/index.tsx`, lignes 71–132

**Analyse :** Cache 30s sur `fetchTenantAvecPdv()`, 10s pour les slugs invalides. Invalidations KV correctes. ✅

---

### FINDING-S9-05 — Sitemap XML sans cache KV (Faible)

**Fichier :** `src/index.tsx`, lignes 218–233

**Description :** Requête Supabase (500 tenants) à chaque appel `/sitemap.xml` sans cache.

**Sévérité :** **Faible**

**Correctif :**
```typescript
app.get('/sitemap.xml', async (c) => {
  const cached = await c.env.KV_CACHE?.get('sitemap:xml')
  if (cached) return c.text(cached, 200, { 'Content-Type': 'application/xml; charset=utf-8' })
  // ... génération ...
  await c.env.KV_CACHE?.put('sitemap:xml', sitemap, { expirationTtl: 3600 })
  return c.text(sitemap, 200, { 'Content-Type': 'application/xml; charset=utf-8' })
})
```

---

## 11. Synthèse des risques par sévérité

| ID | Sévérité | Catégorie OWASP | Description courte | Fichier principal |
|----|----------|-----------------|--------------------|--------------------|
| S1-04 | **CRITIQUE** | A05 - CSRF | Protection X-Requested-With contournable | `api-dashboard.ts`, `api-auth.ts` |
| S3-02 | **CRITIQUE** | A03 - XSS/CSP | `unsafe-inline` actif (migration nonce incomplète) | `security.ts` |
| S4-01 | **CRITIQUE** | A05 - DoS | Rate limiting commandes sans KV → Map par isolate | `api-commandes.ts` |
| S2-03 | **ÉLEVÉE** | A07 - Auth | Secret statique admin, sans rotation ni 2FA | `api-admin-paiements.ts` |
| S1-05 | **ÉLEVÉE** | A02 - Crypto | Tokens JWT en clair dans le body JSON | `api-auth.ts` |
| S2-02 | **ÉLEVÉE** | A03 - Data Exp. | `metadata`/`notes` exposés sur suivi public | `api-commandes.ts` |
| S2-05 | **ÉLEVÉE** | A01 - Auth | Auth dupliquée avec logique différente | `api-commandes.ts` |
| S3-01 | **ÉLEVÉE** | A03 - XSS | Contenu HTML articles blog potentiellement non sanitisé | `pages/article.ts` |
| S4-02 | **ÉLEVÉE** | A07 - Auth | Absence captcha/honeypot sur l'inscription | `api-auth.ts` |
| S2-04 | **MOYENNE** | A01 - IDOR | Validation UUID manquante sur preuve/:id | `api-admin-paiements.ts` |
| S3-03 | **MOYENNE** | A03 - Injection | CSV injection via nom client / notes | `api-dashboard.ts` |
| S4-03 | **MOYENNE** | A05 - DoS | Formulaire contact sans rate limiting | `api-contact.ts` |
| S5-02 | **MOYENNE** | A05 - CSP | `connect-src` inclut `graph.facebook.com` non justifié | `security.ts` |
| S7-04 | **MOYENNE** | A05 - Paiement | Rate limiting paiement conditionnel (sauté si pas de KV) | `api-paiement.ts` |
| S8-01 | **MOYENNE** | A06 - Mobile | App mobile Flutter non auditée | (dépôt externe) |
| S9-01 | **MOYENNE** | A05 - DoS | Pas de limite taille body avant lecture formData | `api-dashboard.ts` |
| S9-02 | **MOYENNE** | A05 - DoS | Export CSV 5000 commandes en mémoire | `api-dashboard.ts` |
| S1-03 | **FAIBLE** | A07 - Auth | Same-password non vérifié sur /reset-password | `api-auth.ts` |
| S3-04 | **FAIBLE** | A03 - Inject. | Messages WhatsApp avec données non-encodées | `lib/whatsapp.ts` |
| S5-03 | **FAIBLE** | A05 - CORS | `localhost` autorisé en production | `src/index.tsx` |
| S6-02 | **FAIBLE** | A04 - InfoDisc | `detail: error.message` dans certaines réponses 500 | `api-dashboard.ts` |
| S6-03 | **FAIBLE** | A06 - Dépend. | Absence SRI sur les CDN | Templates HTML |
| S9-05 | **FAIBLE** | A05 - Perf. | Sitemap XML sans cache KV | `src/index.tsx` |

---

## 12. Recommandations générales

### R1 — Migrer vers un vrai mécanisme CSRF [CRITIQUE, immédiat]
Abandonner `X-Requested-With` comme seule protection. Implémenter le double-submit cookie pattern ou vérifier l'header `Origin` de façon stricte côté serveur pour toutes les mutations sensibles (dashboard, auth, paiement).

### R2 — Finaliser la migration CSP avec nonces [CRITIQUE, immédiat]
Injecter le nonce généré par `setSecurityHeaders()` dans chaque template SSR, puis supprimer `'unsafe-inline'` de `script-src`. La migration est déclarée mais non finalisée depuis session-7 — c'est la mesure anti-XSS la plus efficace disponible.

### R3 — Centraliser l'authentification sur un middleware unique [ÉLEVÉE]
Utiliser `authMiddleware` de `src/middleware/auth.ts` sur TOUTES les routes protégées, y compris `api-commandes.ts`. Éliminer les fonctions locales `verifyAuth()`, `verifyRestaurantAuth()`, `verifyAuthPaiement()` qui dupliquent la même logique avec des nuances dangereuses.

### R4 — Remplacer l'auth admin par Supabase Auth + rôle admin [CRITIQUE]
Migrer l'interface admin vers une authentification via email/MDP Supabase Auth avec vérification d'un rôle `is_admin = true` dans une table dédiée. Le secret statique `X-Admin-Secret` ne doit pas rester comme seule protection des opérations les plus critiques.

### R5 — Intégrer Cloudflare Turnstile sur les formulaires publics [ÉLEVÉE]
Inscription, formulaire de contact : protéger avec Turnstile (gratuit, intégré Cloudflare). Ajouter le token Turnstile côté frontend et sa vérification côté API.

### R6 — Passer le KV explicitement à checkRateLimit() sur toutes les routes [CRITIQUE]
Audit systématique de tous les appels `checkRateLimit()` sans le 4ème argument. Corriger `api-commandes.ts` lignes 143 et 602 en priorité immédiate.

### R7 — Sanitiser le HTML des articles de blog [ÉLEVÉE]
Implémenter une sanitisation HTML (librairie `sanitize-html` avec whitelist stricte) sur le champ `contenu` avant injection dans les templates SSR.

### R8 — Auditer l'application mobile Flutter [MOYENNE]
Accès au dépôt Flutter requis pour vérifier : stockage sécurisé des tokens (Keystore/Keychain), pinning TLS, deep links, secrets embarqués.

### R9 — Mettre en cache le sitemap XML [FAIBLE]
Cache KV 1 heure sur `/sitemap.xml` pour éviter une requête Supabase à chaque crawl de bot.

### R10 — Supprimer `detail: error.message` en production [FAIBLE]
Conditionner ce champ à `c.env.ENVIRONMENT !== 'production'` pour éviter l'exposition de détails PostgreSQL.

---

## Fichiers audités

| Fichier | Statut |
|---------|--------|
| `src/index.tsx` | ✅ Audité |
| `src/lib/acces-tenant.ts` | ✅ Audité |
| `src/lib/security.ts` | ✅ Audité |
| `src/lib/supabase.ts` | ✅ Audité (partiel) |
| `src/lib/paiement.ts` | ✅ Audité (partiel) |
| `src/middleware/auth.ts` | ✅ Audité |
| `src/routes/api-auth.ts` | ✅ Audité |
| `src/routes/api-commandes.ts` | ✅ Audité |
| `src/routes/api-dashboard.ts` | ✅ Audité |
| `src/routes/api-paiement.ts` | ✅ Audité |
| `src/routes/api-admin-paiements.ts` | ✅ Audité |
| `src/routes/api-blog.ts` | ⚠️ Partiellement (structure) |
| `src/routes/api-admin-tasks.ts` | ⚠️ Partiellement (structure) |
| `src/routes/api-contact.ts` | ⚠️ Partiellement (structure) |
| `src/routes/api-tenants.ts` | ⚠️ Partiellement |
| `src/routes/api-livraison.ts` | ⚠️ Partiellement |
| `src/routes/api-newsletter.ts` | ⚠️ Partiellement |
| `src/routes/api-cron.ts` | ⚠️ Partiellement |
| `src/pages/*` | ⚠️ Partiellement (templates SSR) |
| `public/static/js/*.js` | ⚠️ Non lus (fichiers frontend statiques) |
| `supabase/migrations/*.sql` | ⚠️ Non lus (hors accès direct) |
| `wrangler.jsonc` | ✅ Audité |
| `package.json` | ✅ Audité |
| `tsconfig.json` | ✅ Structure |
| `node_modules/` | ❌ Hors périmètre (binaire) |
| `package-lock.json` / `pnpm-lock.yaml` | ❌ Lockfiles (hors sujet) |
| Assets binaires (`*.jpg`, `*.svg`, `*.css`) | ❌ Hors périmètre |

---

*Rapport généré par analyse statique du code source (white-box) — aucun test actif contre l'environnement de production n'a été effectué. Les payloads d'exploitation ne sont pas fournis pour ne pas faciliter des attaques réelles contre le service en production.*
