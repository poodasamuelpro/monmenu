# AUDIT PARCOURS INSCRIPTION — MonMenu 
**Mission 5 — Audit complet du flux onboarding restaurateur**
**Date :** 2026-07-28
**Auditeur :** Agent IA (session audit+corrections)
**Branche :** main

---

## 1. PÉRIMÈTRE DE L'AUDIT 

Fichiers analysés :
- `src/pages/inscription.ts` — Page d'inscription (formulaire multi-étapes)
- `src/routes/api-auth.ts` — Endpoint `POST /api/v1/auth/register`
- `src/pages/auth.ts` — Pages connexion / création compte
- `src/pages/dashboard.ts` — Première page vue après connexion
- `src/middleware/auth.ts` — Middleware de vérification JWT

---

## 2. FLUX COMPLET DU PARCOURS

```
[Client] → GET /inscription → Formulaire (nom_restaurant, nom_gérant, whatsapp, email, password)
         → POST /api/v1/auth/register (credentials:include)
         → [Serveur] crée user Supabase Auth + tenant + utilisateurs_tenant
         → [Serveur] pose cookie httpOnly sb-access-token
         → [Client] reçoit { tenant, boutique_url }
         → [Client] redirige → GET /dashboard/home (cookie envoyé automatiquement)
         → [Serveur] vérifie cookie JWT → renderDashboardPage()
```

---

## 3. ANALYSE DÉTAILLÉE PAR ÉTAPE

### 3.1 Page `/inscription` — `src/pages/inscription.ts`

**✅ CORRECT :**
- Utilise `credentials: 'include'` sur le fetch (migration httpOnly OK)
- Validation front-end sur tous les champs obligatoires (minlength, type)
- Aperçu slug en temps réel (`updateSlugPreview()`)
- Indicateur de force du mot de passe côté JS
- Barre de progression 3 étapes visuelles (Informations → Confirmation → Dashboard)

**⚠️ PROBLÈME IDENTIFIÉ — Prévisualisation slug :**
```html
<!-- Dans inscription.ts ligne ~108 -->
monmenu.app/<span id="slug-preview">votre-restaurant</span>
```
→ **Bug :** affiche `monmenu.app/` (domaine statique inexistant). Doit utiliser l'URL réelle du Worker ou simplement `/votre-restaurant`.

**⚠️ PROBLÈME IDENTIFIÉ — Redirection post-inscription :**
```javascript
window.location.href = '/dashboard/home';
// ou
window.location.href = '/dashboard/bienvenue';
```
→ La redirection exacte dépend de l'état Supabase. À vérifier si `/dashboard/home` ou `/dashboard/bienvenue` est bien géré par `app.get('/dashboard/*')` dans `index.tsx`. Actuellement oui, car le wildcard capture tout.

**⚠️ PROBLÈME IDENTIFIÉ — CSRF non appliqué sur le formulaire :**
- Le POST vers `/api/v1/auth/register` n'envoie pas le header `X-Requested-With: XMLHttpRequest`
- Or `api-auth.ts` ne vérifie pas le CSRF sur `/register` (seulement sur `/logout` et `/refresh`)
- Impact : faible pour register (pas de session existante à protéger), mais cohérence à améliorer.

**❌ PROBLÈME — Email de confirmation :**
- Supabase envoie un email de confirmation par défaut
- Le message d'erreur "Vérifiez votre email" est affiché si `authData.session` est null
- **Mais** : le flow post-confirmation (clic sur le lien email → redirect vers `/dashboard`) n'est pas géré dans `index.tsx`. L'utilisateur qui clique sur le lien Supabase arrive sur une URL avec `#access_token=...` et ne sera pas redirigé automatiquement vers `/dashboard`.

### 3.2 API `/api/v1/auth/register` — `src/routes/api-auth.ts`

**✅ CORRECT :**
- Validation serveur : email, password (min 8 chars), nom_restaurant, whatsapp
- Création atomique : user Supabase → tenant → utilisateurs_tenant (avec rollback)
- Cookie httpOnly posé : `sb-access-token` (Secure, SameSite=Lax)
- Cookie refresh posé : `sb-refresh-token`
- Rate limiting vérifié (via `checkRateLimit`)

**⚠️ PROBLÈME — boutique_url dans la réponse :**
```typescript
boutique_url: `https://monmenu.app/${newTenant.slug}`,  // AVANT (corrigé en Mission 4)
boutique_url: `/${newTenant.slug}`,                       // APRÈS (correction Mission 4)
```

**⚠️ PROBLÈME — Slug collision :**
- Le slug est généré depuis le nom du restaurant (`slugify(nom_restaurant)`)
- En cas de collision, le code tente de générer un slug unique (suffixe numérique)
- **Mais** si deux requêtes simultanées arrivent avec le même nom, il peut y avoir une race condition (INSERT échoue sur la contrainte UNIQUE)
- Recommandation : ajouter `ON CONFLICT` ou retry côté serveur.

**⚠️ PROBLÈME — Plan par défaut :**
- Le tenant est créé avec `plan_id = 'faso'` (plan gratuit 30 jours)
- Mais `plans` est stocké dans Cloudflare D1, et la route register n'accède qu'à Supabase
- Le `plan_id` est hardcodé en string : si la table `plans` est réinitialisée, la FK peut rompre.
- Recommandation : utiliser `plan_code` ou vérifier l'existence du plan avant insertion.

### 3.3 Middleware Auth — `src/middleware/auth.ts`

**✅ CORRECT :**
- Lecture cookie `sb-access-token` en priorité
- Fallback sur `Authorization: Bearer` (clients API/mobile)
- Validation JWT via `supabase.auth.getUser(token)` (vraie vérification, pas juste décodage)

**⚠️ PROBLÈME — Refresh token non géré automatiquement :**
- Quand le `sb-access-token` expire (1h par défaut Supabase), le middleware retourne 401
- Le cookie `sb-refresh-token` est posé mais jamais utilisé automatiquement côté serveur
- Le client (`dashboard.js`) doit appeler `POST /api/v1/auth/refresh` manuellement
- Si `dashboard.js` ne gère pas les 401 → l'utilisateur est bloqué silencieusement

### 3.4 Page Dashboard post-inscription — `src/pages/dashboard.ts`

**✅ CORRECT :**
- `initDashboard()` ne vérifie plus `localStorage.monmenu_auth_token` (corrigé Mission 1)
- `logout()` appelle `/api/v1/auth/logout` avec `credentials: 'include'` (corrigé Mission 1)
- Toutes les requêtes API utilisent `credentials: 'include'` (corrigé Mission 1)

**⚠️ PROBLÈME — Première connexion :**
- Pas de page "bienvenue" dédiée pour les nouveaux inscrits
- L'utilisateur arrive sur le dashboard standard sans guidance
- Recommandation : détecter `is_new_user` (ex: via `created_at < 5 min`) et afficher un wizard d'onboarding

---

## 4. TABLEAU RÉCAPITULATIF DES PROBLÈMES

| # | Fichier | Problème | Sévérité | Statut |
|---|---------|----------|----------|--------|
| M5-1 | `inscription.ts` | URL slug affiche `monmenu.app/` | 🟡 Moyen | À corriger |
| M5-2 | `inscription.ts` | CSRF non envoyé sur register | 🟢 Faible | À améliorer |
| M5-3 | `api-auth.ts` | `boutique_url` domaine .app | 🔴 Critique | ✅ **Corrigé Mission 4** |
| M5-4 | `api-auth.ts` | Race condition sur slug unique | 🟡 Moyen | À corriger |
| M5-5 | `api-auth.ts` | plan_id hardcodé 'faso' | 🟢 Faible | Acceptable |
| M5-6 | `middleware/auth.ts` | Refresh token non auto | 🟡 Moyen | À planifier |
| M5-7 | `index.tsx` | Lien confirmation email Supabase non géré | 🟡 Moyen | À corriger |
| M5-8 | `dashboard.ts` | Pas de wizard onboarding premier login | 🟢 Faible | Nice-to-have |

---

## 5. RECOMMANDATIONS PRIORITAIRES

### Priorité 1 — Lien confirmation email Supabase
Ajouter dans `index.tsx` une route qui intercepte le callback Supabase Auth :
```typescript
// Route à ajouter dans index.tsx
app.get('/auth/callback', async (c) => {
  // Supabase redirige vers /?access_token=...&type=signup
  // Récupérer le token, poser le cookie, rediriger vers /dashboard/home
  const accessToken = c.req.query('access_token')
  const refreshToken = c.req.query('refresh_token')
  if (accessToken) {
    setCookie(c, 'sb-access-token', accessToken, { httpOnly: true, secure: true, sameSite: 'Lax', path: '/' })
    if (refreshToken) setCookie(c, 'sb-refresh-token', refreshToken, { httpOnly: true, secure: true, sameSite: 'Lax', path: '/' })
    return c.redirect('/dashboard/home', 302)
  }
  return c.redirect('/connexion', 302)
})
```

### Priorité 2 — URL slug dans inscription.ts
```typescript
// AVANT (Bug)
monmenu.app/<span id="slug-preview">...
// APRÈS (Correction)
/<span id="slug-preview">...
// OU afficher l'URL complète dynamiquement via JS :
// window.location.origin + '/' + slug
```

### Priorité 3 — Refresh automatique
Dans `dashboard.js`, ajouter un intercepteur sur les réponses 401 :
```javascript
async function fetchWithRefresh(url, options) {
  let res = await fetch(url, { ...options, credentials: 'include' });
  if (res.status === 401) {
    // Tenter refresh
    const refreshRes = await fetch('/api/v1/auth/refresh', {
      method: 'POST',
      credentials: 'include',
      headers: { 'X-Requested-With': 'XMLHttpRequest' }
    });
    if (refreshRes.ok) {
      res = await fetch(url, { ...options, credentials: 'include' });
    } else {
      showAuthError(); // Rediriger vers /dashboard (page login)
    }
  }
  return res;
}
```

---

## 6. CONCLUSION

Le parcours d'inscription est **fonctionnellement complet** et sécurisé sur les points critiques :
- ✅ Cookie httpOnly correctement posé
- ✅ Validation serveur robuste
- ✅ Rate limiting actif
- ✅ Rollback en cas d'échec

Les problèmes identifiés sont majoritairement de sévérité **moyenne ou faible** et n'empêchent pas le fonctionnement nominal. Le problème le plus impactant (gestion du lien de confirmation email) doit être traité avant le lancement en production.

**Score global parcours inscription : 7.5/10**
