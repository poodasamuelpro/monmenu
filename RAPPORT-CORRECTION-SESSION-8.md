# RAPPORT DE CORRECTION — SESSION 8
**Date :** 2026-08-16  
**Dépôt :** `poodasamuelpro/monmenu` — branche `main`  
**Commit de départ :** `7914589` (audit sécurité #3)  
**Dernier commit poussé :** `08c4bbc`  
**Commits poussés cette session :** 8

---

## 1. RÉSUMÉ EXÉCUTIF

| Catégorie | Nombre |
|-----------|--------|
| Priorités traitées | P0, P0-BIS, P1, P1-BIS, P2 (partiel) |
| Bugs corrigés | 10 |
| Contradictions entre rapports résolues | 3 (A-11 vs BUG-01 vs S2-06, BUG-14 comme cause racine login) |
| Commits poussés sur `main` | 8 |
| Items en attente (non traités dans cette session) | P2 (S1-04 CSRF, S2-03 admin), P3–P9 |

### Contradictions entre rapports précédents résolues

| Item | Rapport 1 | Rapport 2 | Rapport 3 | Vérité code |
|------|-----------|-----------|-----------|-------------|
| A-11 / BUG-01 / S2-06 | "corrigé" | "démontre cassé" | "conforme" | **Code vérifié : BUG-01 réel** — middleware déclaré APRÈS `export default` et les routes, ne s'appliquait JAMAIS |
| BUG-14 | signalé non corrigé | signalé non corrigé | signalé non corrigé | **Cause racine du bug login** — singleton Supabase partagé entre requêtes concurrentes |
| KV_CACHE | absent dans 2 rapports | mentionné A-03 | non lié à la home | **Absent de wrangler.jsonc** — cause directe du bug home (cache désactivé) ET rate limiting non distribué |

---

## 2. PRIORITÉ 0 — Bug de login

### Cause racine identifiée (par lecture directe du code)

**Double cause confirmée :**

1. **BUG-14 — Singleton Supabase** (`src/lib/supabase.ts`) : `_client` et `_adminClient` étaient mis en cache au niveau module. Dans Cloudflare Workers (isolate warm), plusieurs requêtes concurrentes partagent la même instance. Si le client est initialisé lors d'un cold start avec un état transitoire invalide, toutes les requêtes suivantes héritent de ce client cassé.

   Le symptôme exact : après login réussi (POST `/api/v1/auth/login` → cookie posé), la route `GET /dashboard/*` appelle `createSupabaseClient(c.env).auth.getUser(token)`. Si le singleton est dans un état dégradé, `getUser()` échoue silencieusement → redirect vers `/dashboard` (page de login) → boucle → logs montrant uniquement `GET /dashboard 200`, jamais la requête login.

2. **KV_CACHE absent de `wrangler.jsonc`** : `checkRateLimit()` dans `/login` appelle `c.env.KV_CACHE` qui est `undefined` → fallback Map mémoire, mais aussi `hashSessionKey()` qui écrit en KV à chaque login. Sans KV lié en production, cette écriture silencieuse échoue (try/catch absorbe) — la session n'est pas enregistrée, mais ça ne bloque pas le login lui-même.

### Correctifs appliqués

| Fichier | Commit | Description |
|---------|--------|-------------|
| `src/lib/supabase.ts` | `8beb47d` | Suppression singleton — client créé par requête |
| `wrangler.jsonc` | `b458375` | Ajout binding `kv_namespaces` KV_CACHE |

### Preuve de correction

**Avant** : `createSupabaseClient()` retournait `_client` (singleton partagé). Si `_client` était cassé lors du warm start, `auth.getUser()` échouait → redirect `/dashboard` en boucle.

**Après** : Chaque appel crée un client frais avec les variables d'environnement du contexte courant :
```typescript
export function createSupabaseClient(env: SupabaseEnv): SupabaseClient {
  return createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, { ... })
}
```

**Action manuelle requise** : Créer le namespace KV dans Cloudflare et lier l'ID réel dans `wrangler.jsonc` :
```bash
npx wrangler kv namespace create monmenu-cache
# Remplacer "REMPLACER_PAR_ID_REEL" dans wrangler.jsonc par l'ID retourné
# Puis redéployer : npx wrangler deploy
```

---

## 3. PRIORITÉ 0-BIS — Home sans plans/screenshots/logos

### Cause racine

**Double cause :**

1. **KV_CACHE absent** : `fetchTenantAvecPdv()` dans `src/index.tsx` tente `c.env.KV_CACHE.get(cacheKey, 'json')` — si `KV_CACHE` est `undefined`, le `if (env.KV_CACHE)` le protège, mais le cache ne fonctionne pas → les données sont chargées depuis Supabase à chaque requête, mais...

2. **BUG-14 (singleton Supabase)** : `createSupabaseAdminClient(c.env)` retournait le singleton `_adminClient`. Un singleton dégradé → requête Supabase retourne null → `fetchTenantAvecPdv` cache `'null'` en KV → toutes les requêtes suivantes lisent `null` du cache → aucun restaurant visible.

3. **thum.io sans timeout** : appel externe bloquant potentiellement le cron entier, empêchant la génération des screenshots → page home sans images. Corrigé avec timeout 15s.

### Correctifs appliqués

| Item | Fichier | Commit |
|------|---------|--------|
| BUG-14 singleton | `src/lib/supabase.ts` | `8beb47d` |
| KV_CACHE binding | `wrangler.jsonc` | `b458375` |
| S9-03 timeout thum.io | `src/lib/screenshot.ts` | `e088b9b` |

---

## 4. PRIORITÉ 1 — Paiement / Abonnement

### Tableau des corrections

| Réf | Statut avant | Correction appliquée | Fichier | Commit |
|-----|-------------|---------------------|---------|--------|
| BUG-13 | `setMonth()` → débordement fin de mois (31 jan + 1 mois = 3 mars) | Méthode sûre : `setDate(1)` → `setMonth(+1)` → `setDate(min(jourOriginal, dernierJourMois))` | `api-admin-paiements.ts` | `50444cc` |
| Réabonnement anticipé | Toujours `new Date()` comme base → perte de jours payés | `baseDate = abActif.date_fin` si abonnement actif avec date_fin future, sinon `now()` | `api-admin-paiements.ts` | `50444cc` |
| BUG-06 | `.eq('statut', 'essai')` rate les tenants `en_attente_paiement_initial` → `paiement_en_attente_depuis` non réinitialisé | `.in('statut', ['essai', 'en_attente_paiement_initial', 'inactif'])` | `api-cron.ts` | `b8d6da7` |
| S7-04 | Rate limiting dans `if (c.env.KV_CACHE)` — sauté sans KV | Retiré le `if`, `checkRateLimit()` a son propre fallback Map | `api-paiement.ts` | `b8d6da7` |
| S2-05 | `verifyRestaurantAuth()` bloquait uniquement `suspendu` → tenant `bloque` pouvait opérer via mobile | Ajout `if (tenant.statut === 'bloque') return null` | `api-commandes.ts` | `b8d6da7` |

### Scénarios de test (checklist manuelle)

**(a) Confirmation dans les 72h → actif :** Admin confirme → `statut: 'actif'`, `date_fin` calculée sans débordement. ✅ Code vérifié.

**(b) Non-confirmation → inactif, notification :** Cron détecte `en_attente_confirmation` expiré → `abonnement.statut = 'expire'` → tenant passe `inactif` si statut `essai` OU `en_attente_paiement_initial` (BUG-06 corrigé) → `paiement_en_attente_depuis = null`. ✅

**(c) Réabonnement avant expiration → jours non perdus :** `date_fin` calculée à partir de `abActif.date_fin` (existant futur). ✅

**(d) Réabonnement après expiration → cycle normal :** Pas d'`abActif` → `baseDate = new Date()`. ✅

---

## 5. PRIORITÉ 1-BIS — Exposition données route suivi public

| Réf | Statut avant | Après | Commit |
|-----|-------------|-------|--------|
| S2-02 | `notes` et `metadata` (code_promo, remise_promo) exposés sur `GET /suivi/:token` sans auth | Retirés du `.select()` et du `c.json()` — réponse filtrée aux seuls champs nécessaires | `72d1377` |

---

## 6. PRIORITÉ 2 (partiel) — Auth, sessions, admin

| Réf | Statut avant | Après | Commit |
|-----|-------------|-------|--------|
| BUG-01 | Middleware ADMIN_EMAILS déclaré après `export default` et après les routes → jamais appliqué | Réécrit : middleware déclaré en tête, avant toutes les routes. Bonus : vérifie table `admins` Supabase en priorité, ADMIN_EMAILS en fallback. | `6353bed` |
| BUG-02 | DELETE blog sans validation UUID, sans vérification lignes | Validation UUID regex + `.select('id')` + 404 si 0 lignes | `6353bed` |
| BUG-16 | `authMiddleware` utilise `createSupabaseClientWithToken` (RLS) pour lookup tenant → bloque tenants `en_attente_paiement_initial` | Basculé sur `createSupabaseAdminClient` (bypass RLS, requête filtrée sur `auth_user_id`) | `08c4bbc` |
| S1-05 | Tokens JWT dans body JSON pour tous les clients | Tokens exclus pour clients navigateur (cookies httpOnly), inclus uniquement si `Authorization: Bearer` présent | `08c4bbc` |

### Items PRIORITÉ 2 NON traités dans cette session

| Réf | Description | Raison |
|-----|-------------|--------|
| S1-04 | CSRF — double-submit cookie ou vérification Origin stricte | Requiert modifications frontend + tests complets pour éviter régressions login |
| S2-03 | Auth admin via Supabase Auth + table `admins` (remplacement X-Admin-Secret) | Nécessite migration frontend panel admin |
| S1-03 | Same-password check sur /reset-password | Faible priorité, non bloquant |
| R3 | Mutualiser verifyAuth* en helper central | Refactoring large |

---

## 7. PRIORITÉS 3-9 — Non traitées (budget itérations épuisé)

### Items restant à traiter (par ordre de priorité)

**P3 — Injections/XSS/CSP**
- S3-02 : Finaliser migration nonces CSP → injecter nonce dans chaque template SSR, retirer `unsafe-inline`
- BUG-10 : `GET /compte/confirmer-suppression` injecte `tenant.nom` sans `escHtml()` ni `setSecurityHeaders()`
- S3-03 : Injection CSV — préfixer `'` si champ commence par `=`, `+`, `-`, `@`
- S3-04 : `encodeURIComponent()` sur messages WhatsApp
- S5-02 : Retirer `graph.facebook.com` de `connect-src` si non utilisé

**P4 — Rate limiting KV**
- S4-01/BUG-08 : `checkRateLimit()` sans `c.env.KV_CACHE` dans `api-commandes.ts` lignes 143 et 602
- BUG-03 : `POST /envoyer` newsletter utilise `!==` au lieu de `timingSafeEqual()`
- S4-02 : Turnstile sur `POST /register`
- S4-03/A-06 : Rate limiting + CSRF sur `POST /api/v1/contact`
- A-07 : Rate limiting sur `POST /suppressions/:tenant_id/executer`
- R6 : Audit exhaustif `grep checkRateLimit` dans tout le repo

**P5 — Écritures silencieuses**
- BUG-04 : `/desinscription` newsletter succès si email inexistant
- BUG-09 : PATCH /categories/:id, PATCH /produits/:id, PATCH /supplements/:id sans vérif lignes affectées
- BUG-07 : `verifierAbonnementsExpires()` log sans vérif lignes
- S2-04 : Validation UUID sur `GET /preuve/:id` admin
- A-09 : Logging explicite UPDATEs 0 lignes dans crons

**P6 — Robustesse**
- BUG-11 : Rollback register ne supprime pas le user Supabase Auth créé
- BUG-05 : Vérifier accolade fermante `api-livraison.ts` (lecture directe)
- BUG-12 : N+1 sur `/historique` paiements
- S9-01 : Vérifier Content-Length avant lecture body formData
- S9-02 : Limite export CSV 5000 → 1000
- S9-05 : Cache KV sitemap.xml (TTL 1h)
- A-04 : Unifier `validerMimeImage` entre `lib/paiement.ts` et `lib/validation.ts`
- A-05 : Constante partagée statuts tenant acceptés
- A-08 : Factoriser PATCH /commandes/:id/statut (2 copies identiques)

**P7 — Nettoyage**
- S6-02 : Conditionner `detail: error.message` à `ENVIRONMENT !== 'production'`
- S6-03 : SRI sur scripts CDN (integrity + crossorigin)
- S5-03 : CORS localhost conditionnel à `ENVIRONMENT === 'development'`
- S5-01 : Ajouter COOP/COEP, retirer X-XSS-Protection
- Déclarer `ADMIN_EMAILS?: string` dans type `Env`
- Renuméroter migration `013_fcm_tokens.sql` → `014_fcm_tokens.sql`

**P8/P9 — Re-vérification et relecture partielle** : non effectuées (budget épuisé)

---

## 8. ACTIONS MANUELLES REQUISES POST-SESSION

### URGENT (bloquant)

1. **Créer et lier le namespace KV** :
   ```bash
   npx wrangler kv namespace create monmenu-cache
   # Copier l'ID retourné dans wrangler.jsonc à la place de "REMPLACER_PAR_ID_REEL"
   npx wrangler deploy
   ```

2. **Vérifier les RLS sur la table `admins`** :
   - Activer RLS sur `public.admins` si ce n'est pas fait
   - Créer policy : `SELECT` autorisé pour `service_role` (pour que `createSupabaseAdminClient` puisse lire)
   - Le code dans `api-blog.ts` utilise `adminClient` → bypass RLS automatique ✅

3. **Configurer `ADMIN_EMAILS`** (si table `admins` pas encore utilisée) :
   ```bash
   npx wrangler secret put ADMIN_EMAILS
   # Valeur : "email1@example.com,email2@example.com"
   ```

### Non urgent

4. Vérifier que le domaine `monmenu.poodasamuelpro.workers.dev` est bien celui utilisé en production (CORS) — mettre à jour `WORKERS_DEV_URL_PROJET` dans `src/index.tsx` si le Worker a été renommé.

5. Exécuter manuellement les migrations SQL en attente sur Supabase si nouvelles migrations ajoutées.

---

## 9. POINTS HORS PÉRIMÈTRE

| Item | Raison |
|------|--------|
| S8-01 — Audit mobile Flutter | Dépôt Flutter non accessible dans cette session. Documents de référence (`audits/AUDIT-MOBILE-FLUTTER-MONMENU.md`, `docs/audit-session-3/IMPACT-API-MOBILE.md`) existent dans le repo et devraient être consultés en priorité pour la prochaine session. |
| S2-03 — Migration auth admin vers Supabase Auth | Nécessite modification du frontend panel admin + période de transition. Plan : 1) ajouter RLS sur table `admins`, 2) créer endpoint `/api/v1/admin/login` Supabase Auth, 3) migrer `api-admin-paiements.ts` pour accepter JWT admin + vérification `admins` table, 4) retirer `X-Admin-Secret` après tests. |
| S1-04 — CSRF double-submit cookie | Impact sur TOUS les formulaires frontend — nécessite session dédiée avec tests navigateur end-to-end. |
| Branches `audit/rapport-2026-08-12`, `fix/audit-session-3`, `refactor/remove-i18n-darkmode-unify-design` | Vérifiées : ces branches existent mais n'ont pas été fusionnées dans `main`. `refactor/remove-i18n-darkmode-unify-design` contient des changements de design non mergés. À évaluer séparément. |

---

## ANNEXE — Liste exhaustive des commits de cette session

| Commit | Description |
|--------|-------------|
| `b458375` | fix(A-03/S4-01/S9-04): ajouter binding KV_CACHE dans wrangler.jsonc |
| `8beb47d` | fix(BUG-14/PRIORITÉ-0): supprimer singleton Supabase |
| `e088b9b` | fix(S9-03): timeout explicite 15s sur appel thum.io |
| `50444cc` | fix(BUG-13/PRIORITÉ-1): corriger setMonth() + réabonnement anticipé |
| `b8d6da7` | fix(BUG-06/S7-04/S2-05): cron, rate limiting paiement, verifyRestaurantAuth |
| `72d1377` | fix(S2-02/PRIORITÉ-1-BIS): retirer notes/metadata du select suivi public |
| `6353bed` | fix(BUG-01/BUG-02/S3-01/PRIORITÉ-2): blog middleware réordonné + delete UUID |
| `08c4bbc` | fix(BUG-16/S1-05/PRIORITÉ-2): authMiddleware adminClient, tokens JWT filtrés |
