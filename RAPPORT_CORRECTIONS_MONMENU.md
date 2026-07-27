# RAPPORT DE CORRECTIONS — MonMenu Phase 2

**Date** : 2026-07-27  
**Branche** : `main`  
**Dépôt** : `poodasamuelpro/monmenu`  
**Auditeur** : Agent IA (Genspark)  
**Référence audit initial** : `AUDIT_MONMENU.md` (commit `829d765`)

---

## Résumé exécutif

Ce rapport documente les **11 corrections fonctionnelles** et les **4 corrections d'incohérences** appliquées lors de la Phase 2 du projet MonMenu. Toutes les modifications sont committées sur la branche `main` et poussées sur GitHub.

**Fichiers créés** : 3  
**Fichiers modifiés** : 13  
**Migrations SQL** : 1 nouvelle (`004_audit_triggers.sql`)

---

## §1 — Corrections fonctionnelles

### §1.1 — Carte Leaflet/OSM interactive en boutique ✅ (Phase précédente)

**Fichiers** : `public/static/js/boutique.js`, `src/pages/boutique.ts`, `src/lib/security.ts`

- **`boutique.js`** : Ajout des variables globales `livraisonMap` / `livraisonMarker`, fonctions `initCartelivraison()` et `geocoderInverse()`. La carte Leaflet s'initialise automatiquement lorsque le mode "Livraison" est sélectionné dans le checkout. Le marqueur est draggable — en fin de drag, la position est renvoyée à Nominatim (reverse geocoding) qui remplit automatiquement le champ adresse. La fonction `geolocaliser()` synchronise la carte avec la position GPS du navigateur.
- **`boutique.ts`** : Injection du CSS Leaflet dans `<head>` via le paramètre `extra` de `renderHead()`, ajout du script `leaflet.min.js` avant `boutique.js`, conteneur `#carte-livraison` avec overflow-hidden.
- **`security.ts`** : CSP étendue : `img-src` ← `*.tile.openstreetmap.org`, `connect-src` ← `nominatim.openstreetmap.org`.

---

### §1.2 — Dark mode boutique ✅

**Fichier** : `src/pages/boutique.ts`

Ajout des classes Tailwind `dark:` sur l'ensemble de la page boutique :
- `<body>` : `dark:bg-gray-900`
- `<header>` : `dark:bg-gray-800`, bordures et textes adaptés
- **Modal Panier** : fond `dark:bg-gray-800`, bordures `dark:border-gray-700`, textes `dark:text-white`
- **Modal Checkout** : idem + tous les `<input>` et `<textarea>` : `dark:bg-gray-700 dark:border-gray-600 dark:text-white dark:placeholder-gray-500`
- **Labels de formulaire** : `dark:text-gray-200`
- **Récapitulatif** : `dark:bg-gray-700/50`, bordure séparateur `dark:border-gray-600`
- **Boutons radio livraison/à emporter** : `dark:has-[:checked]:bg-red-900/20`
- Le bouton `#dark-toggle` est présent dans l'en-tête boutique et se branche sur la logique de `main.js` déjà en place.

---

### §1.3 — Bug promo increment + auto-génération ✅

**Fichiers** : `src/routes/api-commandes.ts`, `src/routes/api-dashboard.ts`, `supabase/migrations/004_audit_triggers.sql`

**Bug corrigé** : La ligne `update({ usage_actuel: (produitMap.size) })` était incorrecte — elle écrasait `usage_actuel` avec le nombre d'articles du panier au lieu de l'incrémenter. Remplacé par un appel RPC atomique :
```typescript
adminClient.rpc('increment_promo_usage', { promo_id: promoId })
```

La fonction SQL `increment_promo_usage(UUID)` est définie dans la migration `004_audit_triggers.sql` :
```sql
UPDATE codes_promo
SET usage_actuel = COALESCE(usage_actuel, 0) + 1, updated_at = NOW()
WHERE id = promo_id;
```

**Auto-génération** : Nouvel endpoint `POST /api/v1/dashboard/codes-promo/generate` qui génère un code unique de forme `PROMO[6chars]` (charset sans ambiguïté O/0, I/1) et l'insère directement avec les paramètres fournis (`type`, `valeur`, `usage_max`, `date_fin`).

---

### §1.4 — Retrait de `stock_actuel` + toggle disponibilité ✅

**Fichier** : `src/routes/api-dashboard.ts` (ligne 319)

La colonne `stock_actuel` a été supprimée du SELECT des produits dans la route `GET /api/v1/dashboard/menu` :
```typescript
// Avant
.select('id, categorie_id, nom, description, prix, photo_url, disponible, ordre_affichage, stock_actuel, ...')

// Après
.select('id, categorie_id, nom, description, prix, photo_url, disponible, ordre_affichage, ...')
```

La disponibilité est gérée exclusivement via le champ booléen `disponible` (toggle `PATCH /api/v1/dashboard/produits/:id`). La boutique affiche déjà un badge "Indisponible" sur les produits avec `disponible: false`.

---

### §1.5 — Cookie consent ✅ (déjà implémenté)

Audité et confirmé : `src/components/footer.ts` contient le HTML `#cookie-banner`, et `public/static/js/main.js` implémente `initCookieBanner()`, `acceptCookies()`, `rejectCookies()`. **Aucune modification nécessaire.**

---

### §1.6 — Peuplement audit_log ✅

**Fichiers créés/modifiés** : `supabase/migrations/004_audit_triggers.sql`, `src/routes/api-auth.ts`

**Triggers Postgres** (migration `004`) :
- `trg_audit_commandes` : déclenché sur INSERT et UPDATE de `statut` dans `commandes`
- `trg_audit_produits` : INSERT / UPDATE / DELETE dans `produits`
- `trg_audit_codes_promo` : INSERT / UPDATE / DELETE dans `codes_promo`
- `trg_audit_tenants` : UPDATE dans `tenants`

La fonction générique `fn_audit_log()` capture la table, l'action (`INSERT/UPDATE/DELETE`), l'`id` de l'enregistrement, le `tenant_id`, et un diff JSON `{ avant, apres }` pour les UPDATE.

**Écriture applicative** : La route `POST /api/v1/auth/login` insère maintenant une entrée `action: 'LOGIN'` dans `audit_log` de façon asynchrone (`waitUntil`) avec l'IP client.

Index ajoutés : `idx_audit_log_tenant_created`, `idx_audit_log_table_action`.

---

### §1.7 — Récupération mot de passe OTP 6 chiffres + change-password dashboard ✅

**Fichiers** : `src/routes/api-auth.ts`, `src/pages/auth.ts`, `src/pages/forgot-password.ts` (nouveau), `src/routes/api-dashboard.ts`, `src/index.tsx`

**3 nouveaux endpoints dans `api-auth.ts`** :

| Endpoint | Description |
|---|---|
| `POST /api/v1/auth/forgot-password` | Envoie un OTP 6 chiffres via `supabase.auth.signInWithOtp()`. Réponse toujours générique (anti-enumération). Rate limit : 5 req/heure/IP. |
| `POST /api/v1/auth/verify-otp` | Vérifie le code avec `supabase.auth.verifyOtp()`. Retourne `access_token` si valide. Rate limit : 10 req/15min/IP. Validation regex `^\d{6}$`. |
| `POST /api/v1/auth/reset-password` | Utilise le Bearer token issu de `verify-otp` pour appeler `supabase.auth.updateUser({ password })`. Minimum 8 caractères. |

**Page `/mot-de-passe-oublie`** (`forgot-password.ts`) : Interface en 4 étapes (email → OTP → nouveau mdp → succès). Gestion complète des erreurs, mode sombre, champ OTP centré avec police mono.

**Dashboard** : Nouveau endpoint `POST /api/v1/dashboard/profil/change-password` — vérifie l'ancien mot de passe via re-signin, puis appelle `auth.updateUser()`.

**Lien corrigé** dans `src/pages/auth.ts` : `href="#"` → `href="/mot-de-passe-oublie"`.

---

### §1.8 — Cron trigger stats journalières + affichage dashboard ✅

**Fichiers** : `wrangler.jsonc`, `src/routes/api-cron.ts` (nouveau), `src/routes/api-dashboard.ts`, `src/index.tsx`

**`wrangler.jsonc`** : Ajout du bloc `"triggers": { "crons": ["0 2 * * *"] }` — déclenche le calcul à 02h00 UTC chaque nuit.

**`api-cron.ts`** : Handler `handleScheduled(event, env, ctx)` exporté depuis le Worker. Pour chaque tenant actif, calcule sur la journée J-1 :
- `nb_commandes`, `nb_commandes_livrees`, `nb_commandes_annulees`
- `chiffre_affaires` (hors annulées), `frais_livraison_total`
- `top_produits` : top 3 produits par quantité commandée (JSON)

Upsert sur `(tenant_id, date)` — idempotent en cas de relance.

**`index.tsx`** : Export remplacé par l'objet Worker complet `{ fetch, scheduled }`.

**Endpoint** `GET /api/v1/dashboard/stats-journalieres?jours=30` : retourne la liste des stats sur N jours + totaux agrégés (`nb_commandes`, `chiffre_affaires`, `nb_jours_actifs`, `moyenne_journaliere`).

---

### §1.9 — Option "à emporter" dans le tunnel de commande ✅

**Fichiers** : `src/lib/whatsapp.ts`, `src/lib/security.ts`, `src/routes/api-commandes.ts`, `public/static/js/boutique.js`

**`whatsapp.ts`** : `genererMessageCommande()` accepte un 3ème paramètre `modeLivraison: 'livraison' | 'emporter'`. En mode `emporter` : pas d'adresse, pas de liens Maps/Waze, message "Retrait sur place", mention paiement sur place.

**`security.ts` (CommandeSchema)** : Ajout du champ `mode_livraison: z.enum(['livraison', 'emporter']).default('livraison')`.

**`api-commandes.ts`** : Passage de `data.mode_livraison` aux deux appels `genererMessageCommande()`. Les champs `client_adresse`, `client_latitude`, `client_longitude` sont également inclus dans `commandeComplete` pour être disponibles dans le message WhatsApp.

**`boutique.js`** : `submitOrder()` envoie `mode_livraison: isEmporter ? 'emporter' : 'livraison'` dans le payload. En mode à emporter, `client_adresse`, `client_latitude`, `client_longitude` sont mis à `null`.

---

### §1.10 — Upload rate limit 20→25/heure + message erreur amélioré ✅

**Fichier** : `src/routes/api-dashboard.ts` (ligne ~1059)

```typescript
// Avant
checkRateLimit(`upload:${auth.tenant_id}`, 20, 3600000)
// Erreur: 'Trop de téléversements. Réessayez dans une heure.'

// Après
checkRateLimit(`upload:${auth.tenant_id}`, 25, 3600000)
// Erreur dynamique avec temps restant calculé depuis rateLimit.resetAt :
// "Limite d'uploads atteinte (25/heure). Réessayez dans 12 minutes."
// + champ retry_after_seconds dans le corps JSON
```

---

### §1.11 — Custom domain routing + restriction plan Mogho ✅

**Fichier** : `src/index.tsx`, `src/routes/api-dashboard.ts`

**Middleware de routage** (`index.tsx`) : Avant toutes les routes, un middleware `app.use('*', ...)` inspecte l'en-tête `Host`. Si le domaine n'appartient pas à la plateforme (`monmenu.app/com/bf`, `workers.dev`, `localhost`), une requête Supabase cherche le tenant dont `domaine_perso = host`. Si trouvé, la boutique est rendue directement.

**Restriction Mogho** (`PATCH /api/v1/dashboard/parametres`) : Si `domaine_perso` est renseigné, une vérification D1 contrôle que le tenant est sur le plan "Mogho". Sinon, retour HTTP 403 avec `upgrade_required: true`.

---

## §2 — Corrections d'incohérences

### §2.1 — Route PATCH statut dupliquée supprimée ✅

**Fichier** : `src/routes/api-commandes.ts`

La route `PATCH /:id/statut` dans `api-commandes.ts` (lignes 382–439) était un doublon exact de `PATCH /commandes/:id/statut` dans `api-dashboard.ts`. Le doublon dans `api-commandes.ts` a été supprimé. La source de vérité est désormais uniquement dans `api-dashboard.ts`, accessible via le préfixe `/api/v1/dashboard/commandes/:id/statut` avec authentification JWT restaurant.

---

### §2.2 — Canonical URL dynamique par page ✅

**Fichier** : `src/components/head.ts`

Signature mise à jour :
```typescript
// Avant
export function renderHead(title, description, nomProjet, extra = '')

// Après
export function renderHead(title, description, nomProjet, extra = '', canonicalUrl = 'https://monmenu.app/')
```

La balise `<link rel="canonical">` utilise maintenant la variable `${canonicalUrl}` au lieu de la valeur hardcodée. La valeur par défaut `https://monmenu.app/` préserve la compatibilité avec tous les appelants existants qui ne passent pas ce paramètre.

La page `/mot-de-passe-oublie` utilise déjà le paramètre avec sa propre URL canonique.

---

### §2.3 — Auth check server-side avant /dashboard/* ✅

**Fichier** : `src/index.tsx`

La route `app.get('/dashboard/*', ...)` vérifie maintenant la présence d'un token JWT avant de rendre le HTML du dashboard. La vérification cherche le cookie `sb-access-token` ou l'en-tête `Authorization: Bearer`. Si aucun token n'est trouvé et que le chemin n'est pas la racine du dashboard (page de login), une redirection 302 vers `/dashboard?redirect=<path>` est émise.

> **Note** : Cette vérification côté serveur est une garde de premier niveau (prévient le rendu de l'UI). La vérification complète du JWT reste faite par chaque endpoint API Hono via `verifyAuth()`.

---

### §2.4 — TENANT_ID retiré du HTML boutique ✅ (Phase précédente)

**Fichier** : `src/pages/boutique.ts`, `public/static/js/boutique.js`

`const TENANT_ID = '${tenant.id}'` supprimé du bloc `<script>` inline. `tenantId` est maintenant résolu côté client depuis l'API publique `GET /api/v1/tenants/:slug` (qui retourne `id`) dans la fonction `loadTenant()` de `boutique.js`.

---

## §3 — Points non touchés (conformément aux instructions)

### Taux de change dynamiques

La logique de conversion de devises n'a pas été modifiée. La table `config_globale` en D1 et les flux de taux de change restent inchangés. **Documentation** : Les taux sont récupérés depuis `config_globale` (D1) à chaque rendu de page publique. Pour les actualiser, exécuter une migration D1 ou un Worker cron dédié.

### Singleton Supabase

Le pattern singleton n'a pas été modifié. **Documentation** : `createSupabaseClient()` et `createSupabaseAdminClient()` créent une nouvelle instance à chaque appel car Cloudflare Workers ne maintient pas d'état entre les requêtes. Ce comportement est correct — les connexions Supabase sont légères (HTTP REST) et n'ont pas besoin d'être poolées.

---

## §4 — Spécifications à implémenter (non codées)

### Webhooks sortants (facturation / POS)

Pour chaque événement commande (création, changement de statut, livraison confirmée), le système devrait émettre un webhook vers une URL configurée par tenant. Schéma suggéré :

```json
{
  "event": "commande.livree",
  "tenant_id": "uuid",
  "commande_id": "uuid",
  "timestamp": "ISO8601",
  "data": { "montant_total": 5000, "client_nom": "...", "items": [...] }
}
```

Table Supabase recommandée : `webhooks_config (tenant_id, url, secret_hmac, events[], actif)`. Implémentation : Worker Cloudflare avec signature HMAC-SHA256 dans l'en-tête `X-MonMenu-Signature`.

---

## §5 — Documentation fonctionnalités futures

### Programme de fidélité

Architecture suggérée : table `points_fidelite (tenant_id, client_telephone, points, updated_at)`. À chaque commande livrée, un Worker cron crédite N points (paramétrable par tenant). Endpoint client : `GET /api/v1/fidelite/:telephone`. Récompense : génération automatique d'un code promo via `POST /api/v1/dashboard/codes-promo/generate`.

### Avis clients

Architecture suggérée : table `avis_clients (id, tenant_id, commande_id, note, commentaire, created_at)` avec RLS publique en lecture. Un lien de notation est envoyé dans le message WhatsApp de suivi 24h après la livraison (via un cron). Affichage boutique : note moyenne en étoiles dans l'en-tête.

### Programme d'affiliation

Architecture suggérée : table `affilies (id, tenant_id, code_affiliation, commission_pct, total_revenus)`. Un tenant peut partager son lien d'affiliation `monmenu.app/ref/CODE` qui crédite automatiquement sa commission à chaque inscription depuis ce lien. Suivi via champ `referral_code` dans la table `tenants`.

---

## Récapitulatif des fichiers modifiés

| Fichier | Type | §§ concernés |
|---|---|---|
| `public/static/js/boutique.js` | Modifié | §1.1, §1.9, §2.4 |
| `src/components/head.ts` | Modifié | §2.2 |
| `src/index.tsx` | Modifié | §1.7, §1.8, §1.11, §2.3 |
| `src/lib/security.ts` | Modifié | §1.1 (CSP), §1.9 (CommandeSchema) |
| `src/lib/whatsapp.ts` | Modifié | §1.9 |
| `src/pages/auth.ts` | Modifié | §1.7 |
| `src/pages/boutique.ts` | Modifié | §1.1, §1.2, §2.4 |
| `src/pages/forgot-password.ts` | **Créé** | §1.7 |
| `src/routes/api-auth.ts` | Modifié | §1.6, §1.7 |
| `src/routes/api-commandes.ts` | Modifié | §1.3, §1.9, §2.1 |
| `src/routes/api-cron.ts` | **Créé** | §1.8 |
| `src/routes/api-dashboard.ts` | Modifié | §1.3b, §1.4, §1.7, §1.8, §1.10, §1.11 |
| `supabase/migrations/004_audit_triggers.sql` | **Créé** | §1.3, §1.6 |
| `wrangler.jsonc` | Modifié | §1.8 |

---

*Rapport généré automatiquement — Phase 2 corrections MonMenu — 2026-07-27*
