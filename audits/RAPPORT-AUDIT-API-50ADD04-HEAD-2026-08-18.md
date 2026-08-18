# Audit API complet — Plage `50add04` → dernier commit (HEAD)

**Dépôt** : [poodasamuelpro/monmenu](https://github.com/poodasamuelpro/monmenu) — branche `main`
**Plage auditée** : `50add04` (13/08 13h20) → `43e7424` (dernier commit : 17/08 23h40 UTC)
**Volume** : 124 commits, 10 fichiers API touchés pour **+2 330 / −542 lignes** dans le périmètre API
**Périmètre de ce rapport** : API blog, newsletter, plans/fonctionnalités, paiement admin, commandes, auth, tenants, dashboard + tout ce qui doit être fait de votre côté
**Date** : 2026-08-18 — **Auteur** : Manus AI

---

## 1. Vue d'ensemble : ce que la plage a changé dans les API

Entre le rapport de sécurité du 13/08 (`50add04`) et le dernier commit d'aujourd'hui, les API ont traversé **11 sessions de correction** (sessions 3→11 du 13→17/08) puis une implémentation de fonctionnalité majeure (suppléments généraux) et un correctif de bug bloquant. La transformation la plus importante se résume en une phrase :

> **Les API sont passées d'un état « fonctionnel mais sans garde-fou » à un état « fonctionnel avec authentification admin dual-path, rate limiting distribué KV, validations strictes et vérifications de lignes affectées » — mais plusieurs dépendances externes (secrets Cloudflare, namespace KV, migrations SQL) restent à votre charge avant que ces protections soient actives en production.**

### 1.1 Tableau des fichiers API modifiés (état initial → final)

| Fichier | Δ lignes | Ce qu'il était au 13/08 | Ce qu'il est aujourd'hui |
|---|---|---|---|
| `src/routes/api-dashboard.ts` | +947/−380 | ~1 900 lignes, un seul gros router | ~2 700 lignes : +25 routes (suppléments, notifications, FCM, suppression compte, codes-promo) avec CSRF, purge R2, invalidation KV |
| `src/routes/api-admin-paiements.ts` | +502/−170 | 7 routes, middleware JWT simple | 10 routes, middleware **dual-path** (webhook secret OU JWT + table `admins`), pagination, anti-N+1, SLA urgents, flux suppressions de compte |
| `src/routes/api-commandes.ts` | +313/−250 | Recalcul prix basique | Suppléments généraux (recalcul prix serveur, recalcul montant total), garde RPC atomique code promo, tenant depuis slug URL, rollback register |
| `src/routes/api-auth.ts` | +270/−70 | Login/register/logout classiques | Rate limiting KV distribué, hash session SHA-256, révoquer sessions après change-password, rollback Auth au double register, vérif nouveau mdp ≠ ancien |
| `src/routes/api-newsletter.ts` | +183/−5 | 1 seule route (inscription brute) | 3 routes : inscription avec rate limit IP/email, **envoi de campagne réel Brevo** protégé dual-path, désinscription avec vérif existence |
| `src/routes/api-blog.ts` | +104/−10 | Routes admin ouvertes à tout utilisateur JWT | Routes admin protégées par **double filtre** (JWT + whitelist `admins`/`ADMIN_EMAILS`, fail-closed), validation UUID, vérif lignes affectées |
| `src/routes/api-tenants.ts` | +119/−50 | Menu simple | Menu enrichi `supplements` racine, pagination, filtres statut |
| `src/lib/brevo.ts` | +350/−10 | Stub minimal | Lib complète : templates (bienvenue, paiement, rappel, suppression, newsletter), timeouts 8s, URLs dynamiques `getBaseUrl()` |
| `src/lib/security.ts` | +79/−8 | Headers de base | `setSecurityHeaders()` avec nonces CSP, HSTS preload, COOP, rate limiting `checkRateLimit` (KV + fallback mémoire), `timingSafeEqual` |
| `src/routes/api-admin-tasks.ts` | +5/−2 | — | Relance manuelle des captures screenshots (secret header) |
| `src/routes/api-plans.ts` | inchangé | Lecture Supabase + cache KV | Identique (les plans sont quasi-statiques ; la gestion dynamique est conçue dans `docs/CONCEPTION-PLANS-FONCTIONNALITES-2026-08-17.md`, pas encore implémentée) |

---

## 2. Chronologie des transformations par session (ce qui a changé, dans l'ordre)

### 2.1 Session 3 (13–14/08) — Fondations fonctionnelles

Cinq commits ont posé les briques métier. `daff016` a ajouté le **rate limiting de la newsletter** (3 inscriptions/heure par IP + 2/24h par email via KV) et les migrations 015 (limite PDV) et 016 (suppression de compte). `4c323db` a branché les **emails transactionnels** sur tous les hooks (bienvenue, paiement soumis/confirmé/rejeté, rappel, suppression, newsletter) avec échappement anti-XSS dans les exports CSV. `72a12c6` a créé les **3 crons de rappels** d'expiration (J-5/J-2 essai + abonnement) et `08c4bbc`… et `0656ff2` a ajouté la **pagination** sur `/livreurs`, `/codes-promo` et `/menu` (dashboard), tandis que `46d909a` a remplacé le `allCommandes` par 3 requêtes `COUNT` SQL pour les stats et a ajouté le statut `inactif` aux filtres publics `/tenants/:slug` et `/tenants/:slug/menu`. `16b4e0a` a créé le **flux de suppression de compte** (demande → confirmation email → exécution soft-delete + purge R2 + `deleteUser` Supabase Auth) avec le miroir admin (`GET /suppressions`, `POST /suppressions/:tenant_id/executer`). `8799281` a rendu toutes les URLs des emails **dynamiques** via `getBaseUrl(env.PUBLIC_BASE_URL)`.

### 2.2 Session 5 (15/08) — Chasse aux bugs B-xxx

Une douzaine de commits a traité les bugs fonctionnels : vérifications de lignes affectées après chaque `UPDATE`/`DELETE` (`9b14b6c`, `84148a9`, `edbc3fa`, `2bd6784`, `cdf59d8`), consolidation de la validation MIME des uploads en `validerMimeImageUnifie` (magic bytes JPEG/PNG/WebP/GIF, 5 Mo), anti-N+1 dans les stats, jointure correcte des notifications, try/catch JSON sur les routes livreurs, validation UUID et HTTP 404 vs 500 corrects sur le blog (`4230528`), filtre de statut sur le QR code.

### 2.3 Session 6 (15/08) — Race condition codes promo (BLOQUANT métier)

`9955d50` est le commit le plus important côté financier : la race condition sur `validerCodePromo` (deux commandes simultanées dépassant `usage_max` du code promo et recevant toutes les deux la remise) a été corrigée par la **migration `017_fix_increment_promo_usage.sql`** (UPDATE atomique SQL qui retourne 0 si la limite est atteinte) couplée à une **garde backend** qui répond 409 « Code promo épuisé ou invalide » si la RPC retourne 0, avec log de l'anomalie. Le commit `219a52a` a ajouté la vérification de lignes sur `/rejeter`.

### 2.4 Session 7 (16/08 ~00h) — Audit sécurité « session-7 » (le virage sécurité)

C'est le basculement majeur de la plage, avec 9 commits trouvaille par trouvaille (FINDING-01 à FINDING-30) :

| Commit | Correction | Effet concret sur l'API |
|---|---|---|
| `1b75be0` | Nonces CSP activés | `setSecurityHeaders()` génère un nonce par requête |
| `9d72756` | Tenant dérivé du slug URL | `api-commandes` ne lit plus jamais `body.tenant_id` (anti-spoofing inter-tenant) — **impact direct sur l'app Flutter** qui doit envoyer le slug |
| `1a16ecd` | Révocation sessions après change-password | Toutes les sessions du tenant sont purgées du KV après changement de mot de passe |
| `ca148b3` | `timingSafeEqual` sur les secrets admin | Comparaison à temps constant (anti side-channel) |
| `8f156c8` | Rate limiting export CSV (10/h/tenant) | Anti-extraction massive de données |
| `e76fb82` | Timeout 8s sur Brevo | Lenteur Brevo ne bloque plus le Worker |
| `8c0e1ad` | **ADMIN_EMAILS sur blog admin** | Les routes blog `/admin/*` exigent en plus du JWT que l'email soit whitelisté |
| `e7580af` | KV passé à tous les rate limits auth | Rate limiting distribué (plusieurs workers simultanés) |
| `58528bd` | Hash SHA-256 des clés session KV | Les clés de session ne sont plus prévisibles par slice |
| `fd07054` | Migration **018** : suppression policy RLS `commandes_public_suivi` | Fermait une fuite publique (voir §5) |
| `48a20cb` | CORS restreint à monmenu.com | workers.dev bloqué en cross-origin |

### 2.5 Session 8 (16/08 ~15h) — Correctifs d'architecture critiques

`b458375` a **ajouté le binding `KV_CACHE` dans `wrangler.jsonc`** — sans ce binding, tous les rate limits et caches des sessions précédentes restaient **désactivés en production** (fallback mémoire, non distribué). `8beb47d` a supprimé le singleton Supabase (cause du **bug de login en production** lors des warm starts : le client partagé fuyait les sessions entre requêtes). `6353bed` a déplacé le middleware `ADMIN_EMAILS` **avant** les routes blog (BUG-01 : déclaré après, il ne s'appliquait jamais — **tout utilisateur JWT pouvait créer/modifier/supprimer des articles**). `08c4bbc` (BUG-16) a fait le lookup tenant par `adminClient` (bypass RLS) et **exclu les tokens JWT du body** pour les clients navigateur. `72d1377` a retiré `notes` et `metadata` du select public de la page de suivi (le code promo utilisé et les commentaires ne doivent pas être exposés publiquement). `50444cc` a corrigé le **débordement `setMonth()`** dans le calcul des dates de fin d'abonnement (29→31 du mois). `b8d6da7` a bloqué l'envoi de notifications aux **tenants bloqués**.

### 2.6 Session 9 (16/08 15h36) — Bouclage session 8

`3dd3ccc` a étendu le rate limiting KV aux commandes/promos, appliqué `timingSafeEqual` à `X-Admin-Secret` de la newsletter, et rate limité l'exécution de suppression de compte admin. `90741d8` a fait retourner 404 à la désinscription si l'email n'existe pas et ajouté les vérifications de lignes sur PATCH catégories/produits/supplements. `c9a892d` a validé les UUID sur `GET /preuve/:id` et corrigé le cron de vérification des abonnements. `0605e9c` a ajouté le **rollback Auth** au register (Supabase Auth sans tenant Supabase → suppression du compte Auth créé), et `ea4e3c4` a limité l'export CSV à 1 000 lignes.

### 2.7 Sessions 10–11 (16–17/08) — Reforces finales

La session 10 a ajouté COOP/COEP (`db193c0`), la vérification « nouveau mot de passe ≠ ancien » au reset-password (`b3e07ac`) et la **protection anti-injection CSV** des deux exports (`fc76fab`). La session 11 a fait l'authentification admin **dual-path** (`f8ff7b0` — `X-Admin-Secret` OU JWT + table `admins`, appliquée aux paiements **et** à la newsletter), centralisé l'auth dans `src/lib/auth.ts` (`ad8bfe2` + `fa87f11`), factorisé le PATCH statuts commandes dans `src/lib/commandes.ts` (`eaf038b`), limité le cache sitemap (`381b470`) et ajouté le CORS dev (`951cded`).

### 2.8 Chantier suppléments généraux (17/08)

`a93f158` + `3c0bb40` + docs ont implémenté la fonctionnalité **suppléments généraux par restaurant** : nouvelles routes `GET/POST /api/v1/dashboard/supplements`, `GET /limite`, `POST /:id/image`, migration **019** (idempotente : `produit_id` nullable, `photo_url`, `photo_r2_key`, colonnes `supplements_actifs`/`limite_supplements` sur `plans`, index, RLS), recalcul serveur du montant de commande avec les suppléments, intégration boutique (écran groupé au checkout), WhatsApp et notification FCM. Le guide app mobile est dans `docs/API-SUPPLEMENTS.md` (`GET /tenants/{slug}/menu` retourne désormais `supplements[]` à la racine — additif, aucun champ existant changé).

### 2.9 Correctif final (17/08 23h40)

`43e7424` a corrigé la **collision routing Hono** : `dashboardRouter` (monté ligne 199 d'`index.tsx` avant `supplementsRouter` ligne 209) interceptait PATCH/DELETE `/supplements/:id`. La route active dans `api-dashboard.ts` a été réécrite : adminClient, lecture de `photo_r2_key` avant modification, acceptation de `null` pour le retrait d'image, purge R2 sur PATCH null et DELETE, invalidation des deux clés KV (`menu:` + `supplements:`).

---

## 3. État actuel exact de chaque API (routes, fichier, ligne, protection)

### 3.1 Blog — API complète, admin à double protection

| Route | Fichier (ligne) | Rôle | Protection actuelle |
|---|---|---|---|
| `GET /api/v1/blog` | `api-blog.ts` l.79 | Liste articles publiés | Publique |
| `GET /api/v1/blog/:slug` | `api-blog.ts` l.96 | Un article | Publique |
| `POST /api/v1/blog/admin` | `api-blog.ts` l.116 | Créer article | JWT + `isAdminEmail` (table `admins` priorité, fallback `ADMIN_EMAILS`, fail-closed) |
| `PATCH /api/v1/blog/admin/:id` | `api-blog.ts` l.149 | Modifier | Idem + validation UUID regex l.152 |
| `DELETE /api/v1/blog/admin/:id` | `api-blog.ts` l.188 | Supprimer | Idem + UUID + `.select('id')` vérif lignes |

Au 13/08, **un simple JWT quelconque permettait de créer des articles** ; aujourd'hui il faut en plus être dans la whitelist (session 7 : `8c0e1ad` + session 8 : `6353bed`).

### 3.2 Newsletter — tri-composante (inscription / campagne / désinscription)

| Route | Fichier (ligne) | Rôle | Protection actuelle |
|---|---|---|---|
| `POST /api/v1/newsletter` | `api-newsletter.ts` l.22 | Inscription | Rate limit 3/h IP + 2/24h email (KV), réponse générique sur doublon |
| `POST /api/v1/newsletter/envoyer` | `api-newsletter.ts` l.67 | Campagne réelle Brevo, batchs de 50, échecs non bloquants | **Dual-path** : `X-Admin-Secret` (= `ADMIN_WEBHOOK_SECRET`, timing-safe) OU Bearer JWT + email dans table `admins` |
| `POST /api/v1/newsletter/desinscription` | `api-newsletter.ts` l.179 | Statut → `desinscrit` | Publique + vérif existence via `.select('id')` |

Au 13/08, la newsletter était **une seule route d'inscription sans aucune protection anti-spam** et il n'y avait **aucun envoi de campagne**.

### 3.3 Plans / fonctionnalités — lecture seule, gestion à implémenter

`GET /api/v1/plans` (`api-plans.ts` l.44) lit Supabase (pas D1), cache KV 600s, retourne le JSONB `fonctionnalites`. **Rien n'a été ajouté pour gérer les fonctionnalités** : pas de route admin, pas de contrôle backend par plan. La conception complète existe (`docs/CONCEPTION-PLANS-FONCTIONNALITES-2026-08-17.md`, commit `fb6bb96`) et attend vos **4 décisions** avant implémentation (voir §6.3).

### 3.4 Paiements admin — 10 routes, dual-path, SLA urgents

`GET /admin/paiements` (paginé, flag `urgent` si confirmation expire < 12h), `POST /confirmer` (email tenant, invalidation cache `tenants:public:12/24`, SLA), `POST /rejeter` (avec motif), `GET /preuve/:id` (UUID validé), `GET/POST/PATCH /moyens` (gestion complète des moyens de paiement avec code regex `[a-z0-9_]+`, 409 si doublon), `GET /suppressions`, `POST /suppressions/:tenant_id/executer` (rate limité, exécution du flux de suppression de compte). Toute la section est protégée par le middleware dual-path `f8ff7b0` — **avant ce commit, seuls les JWT admin y accédaient**.

### 3.5 Commandes — recalcul serveur intégral

`POST /` : prix lus **uniquement en base** (jamais côté client), suppléments recalculés serveur, `supplement_ids` max 10 UUID, rate limit KV commande/promo, tenant résolu depuis slug. `GET /suivi/:token` : sans `notes`/`metadata`. `PATCH /:id/statut` : factorisé dans `lib/commandes.ts`, statuts validés. `POST /valider-promo` : garde atomique (migration 017) — répond 409 si RPC retourne 0.

### 3.6 Auth — sessions révoquées, rollback, rate limiting distribué

`/login`, `/register` (rollback Auth si création tenant échoue, vérif `tenant_id`), `/logout`, `/refresh`, `/forgot-password`, `/verify-otp`, `/reset-password` (nouveau mdp ≠ ancien, **révocation de toutes les sessions** du tenant). Hash de session KV en SHA-256. Tous les rate limits passent par `checkRateLimit` avec `KV_CACHE` (distribué entre workers).

---

## 4. Les 6 migrations SQL ajoutées dans la plage — état et ordre d'application

| # | Fichier | Rôle | Danger si non appliquée | Statut |
|---|---|---|---|---|
| 1 | `supabase/migrations/014_fcm_tokens.sql` | Renommage pour conflits numérotation (013→014) | Conflit de migration | ⚠️ À vérifier appliquée |
| 2 | `supabase/migrations/015_limite_pdv_1.sql` | Contrainte PDV (cohérence données) | Limite PDV non imposée | ⚠️ À appliquer si absente |
| 3 | `supabase/migrations/016_suppression_compte.sql` | Colonnes du flux suppression (soft-delete, `deletion_requested_at`...) | **Flux suppression de compte cassé** | ⚠️ À appliquer si absente |
| 4 | `supabase/migrations/017_fix_increment_promo_usage.sql` | RPC atomique `increment_promo_usage` (garde `usage_actuel < usage_max` dans le WHERE) | **Remise promo doublement accordée (race condition) = perte d'argent** | 🔴 À appliquer en priorité |
| 5 | `supabase/migrations/018_fix_rls_commandes_public_suivi.sql` | Supprime `commandes_public_suivi` (fuite publique via `OR deleted_at IS NULL`), crée `commandes_tenant_owner_select` | **Fuite de données** : suivi public accessible même si le tenant est supprimé | 🔴 À appliquer en priorité + **rejouer sur staging** si déjà appliquée (ANOMALIE-33) |
| 6 | `supabase/migrations/019_supplements_generaux.sql` | Fonctionnalité suppléments généraux (produit_id nullable, photos R2, colonnes plans, RLS) | **Nouvelle fonctionnalité totalement inactive** | ⚠️ À appliquer (ou vérifier) |

La migration 017 est **idempotente et non destructive** (CREATE OR REPLACE FUNCTION + contraintes) ; la 018 est sans risque (DROP + CREATE de policies). Elles peuvent être appliquées en direct via la console Supabase → SQL Editor (copier-coller) ou `supabase db push`.

---

## 5. Ce que VOUS devez faire côté admin — récapitulatif ordonné et expliqué

### 5.1 🔴 Immédiat : débloquer le code déjà en place

| # | Action | Où / Comment | Rôle | Impact si non fait |
|---|---|---|---|---|
| 1 | **Redéployer le Worker** | `npm run build && npx wrangler deploy` | Met en production les 124 commits | Tout le code de la plage reste théorique — aucune correction n'est active en prod |
| 2 | **Appliquer les migrations 015→019** (ordre exact, une par une) | Console Supabase → SQL Editor, ou `supabase db push` | Active le flux suppression, l'atomicité promo, ferme la fuite RLS, active les suppléments | Codes promo doublés (perte d'argent), fuite de commandes, fonctionnalités mortes |
| 3 | **Créer le namespace KV** `monmenu-cache` et le lier au binding `KV_CACHE` | Cloudflare Dashboard → Workers → KV → Create (`KV_CACHE`) ; ou l'ID `21083c6b049349aca60411d19c8aeaba` déjà déclaré dans `wrangler.jsonc` | Rate limiting distribué + caches (30s menu, 600s plans, sitemap) | Sans lui : rate limits en Map mémoire locale (inefficace multi-workers) + **bug de login warm start déjà observé** |
| 4 | Créer `ADMIN_EMAILS` (liste d'emails séparés par virgules) | `npx wrangler secret put ADMIN_EMAILS` | Whitelist admin blog + protection blog `/admin/*` | **Blog admin inaccessibles (fail-closed)** — impossible de publier des articles |
| 5 | Créer `ADMIN_WEBHOOK_SECRET` | `npx wrangler secret put ADMIN_WEBHOOK_SECRET` | Voie webhook sécurisée `POST /newsletter/envoyer` + `/admin/paiements` | Seule la voie JWT/table `admins` reste active ; sans table `admins` peuplée : **aucun accès admin possible** |
| 6 | Peupler la table Supabase `public.admins` (colonne `email`) | Console Supabase → SQL : `INSERT INTO admins (email) VALUES ('votre@email.com');` | Voie 2 du dual-path admin (interface humaine) | Fallback nécessaire si `ADMIN_WEBHOOK_SECRET` absent |
| 7 | Vérifier `SUPABASE_SERVICE_ROLE_KEY` + `BREVO_API_KEY_*` | Cloudflare → Secrets (le nom exact dépend de `src/lib/supabase.ts` et `lib/brevo.ts` — `BREVO_API_KEY_ID`/`KEY_V3` optionnels depuis batch3 suite) | Accès Supabase service_role + envoi réel des emails Brevo | Aucun email transactionnel ne part |

### 5.2 🟠 Vérifications fonctionnelles post-déploiement (15–30 min)

| # | Test | Comment | But |
|---|---|---|---|
| 8 | Test rate limit newsletter | 4 inscriptions successives avec le même email → la 3e doit passer, la 4e générique | Valider KV actif |
| 9 | Test blog admin | JWT d'un utilisateur non-whitelisté → 403 sur `POST /api/v1/blog/admin` ; utilisateur whitelisté → 201 | Valider double filtre + fail-closed |
| 10 | Test supps (créer/éditer/retirer image/supprimer) | Dashboard → Suppléments, photo puis bouton « Retirer image », puis suppression | Valider le correctif `43e7424` (purge R2 + double invalidation KV) |
| 11 | Test migration 017 | Deux commandes simultanées avec un code promo `usage_max=1` → seule la 1re passe | Valider l'atomicité (le test simulé nécessite un script, optionnel) |
| 12 | Relance screenshots | `curl -H "X-Admin-Task-Secret: …" https://WORKER/api/v1/admin/tasks/screenshots` | Valider la route admin-tasks (nécessite le secret `ADMIN_TASK_SECRET` à créer aussi) |
| 13 | Test suppression compte | Dashboard → Paramètres → demander suppression | Valider flux 016 + emails Brevo |

### 5.3 🟡 Décisions et chantiers en attente de votre arbitrage

| # | Chantier | Décision attendue | Impact |
|---|---|---|---|
| 14 | **Plans / fonctionnalités** | Répondre aux **4 questions ouvertes** (§14 de `docs/CONCEPTION-PLANS-FONCTIONNALITES-2026-08-17.md`) : politique de suppression de plan avec tenants en essai ; `export_csv` unique ou double ; `produits_max`/`categories_max` dans le périmètre ; confirmation `MONMENU_BASE_URL` côté admin | Lance l'implémentation qui applique les fonctionnalités par plan (codes promo, export CSV, livreurs, suppléments) |
| 15 | Migration 018 sur **staging** | Si la 018 a déjà été appliquée en staging : la rejouer (`DROP` + `CREATE` idempotents) | ANOMALIE-33 : fuite résiduelle en staging |
| 16 | RLS critiques R1 + R11 | Donner le feu vert pour les 2 politiques SQL (INSERT commandes réservé service_role ; notifications `WITH CHECK` strict) | Ferme ANOMALIE-04 (clé anon dans HTML permet INSERT direct) et ANOMALIE-34 |
| 17 | Correctif MAJEUR-1 (suivi client) | Feu vert pour modifier `src/pages/suivi.ts` l.133–139 (afficher les suppléments sous chaque item) | Incohérence client/opérateur actuelle |
| 18 | Rate limit `newsletter/envoyer` (ANOMALIE-26) | Feu vert (1 ligne : `checkRateLimit('newsletter:envoyer', 1, 3600000)`) | Anti-spam DoS email (quota Brevo, réputation) |
| 19 | Slug pour l'app Flutter | Confirmer le basculement (commit `9d72756` : le tenant est dérivé du slug URL, plus du `body.tenant_id`) | L'app mobile actuelle qui envoie `tenant_id` dans le body **sera rejetée 403** tant que le slug n'est pas utilisé |
| 20 | `PUBLIC_BASE_URL` → domaine production | Basculer de `*.workers.dev` vers `monmenu.com` quand le domaine est branché | URLs des emails, sitemap, CORS et screenshots en production |

---

## 6. Anomalies résiduelles restantes sur les API (à corriger à votre demande)

| Réf | API concernée | Problème | Correctif proposé |
|---|---|---|---|
| ANOMALIE-04 🔴 | Commandes (RLS) | `SUPABASE_ANON_KEY` dans le HTML permet `INSERT` direct commandes + lecture produits sans passer par le Worker | Politique RLS `service_role` only (feu vert #16) |
| ANOMALIE-15 🟠 | Codes promo | Gap JS entre lecture `usage_actuel` et RPC `waitUntil` (migration 017 réduit mais n'élimine pas le risque si la RPC n'est pas appelée avant l'insert) | Appeler la RPC **avant** l'insert de la commande (1 ligne dans `api-commandes.ts`) |
| ANOMALIE-14 🟢 | Blog | Slug libre sans regex ni vérif de doublon | Regex `^[a-z0-9-]+$` + `.maybeSingle()` avant insert |
| ANOMALIE-13 🟢 | Blog | `isAdminEmail` fait 2 appels Auth par requête | Cache KV 1h sur le résultat |
| ANOMALIE-26 🟠 | Newsletter | `/envoyer` sans rate limit → DoS email | 1 campagne/h minimum (feu vert #18) |
| ANOMALIE-27 🟡 | Newsletter | `/desinscription` 200 vs 404 → énumération d'emails | Réponse 200 uniforme |
| ANOMALIE-24 🟡 | Paiement preuve | URL `cle_r2` exposée sans chiffrement/TTL réel | Presigner avec expiration ou proxy |
| ANOMALIE-25 🟠 | Paiement confirmer | `admin_id` fourni par le client au lieu d'être lié au compte authentifié | `admin_id` depuis la session, pas du body |
| ANOMALIE-02 🟢 | Blog | `getNomProjet` appelé deux fois sur 404 `/blog/:slug` | Dédupliquer |
| MINEUR-2 | Suppléments | `onclick="loadSupplements()"` inline bloqué CSP | `data-sup-action="recharger"` |
| MINEUR-3 | Suppléments | Routes PATCH/DELETE de `supplementsRouter` = code mort | Refactoring : un seul router |

---

## 7. Synthèse — votre feuille de route

1. **Aujourd'hui (bloquant)** : déploiement Worker + migrations 015→019 + secrets (`ADMIN_EMAILS`, `ADMIN_WEBHOOK_SECRET`, `ADMIN_TASK_SECRET`, `BREVO_API_KEY_*`, `SUPABASE_SERVICE_ROLE_KEY`) + vérification du KV `KV_CACHE` + table `admins` peuplée.
2. **Cette semaine** : les 6 tests fonctionnels (§5.2), la bascule slug Flutter (sinon l'app mobile sera coupée), et les feux verts R1/R11 (ANOMALIE-04/34) + MAJEUR-1.
3. **À votre arbitrage** : les 4 questions ouvertes de la conception des plans, qui débloqueront le chantier le plus stratégique du trimestre (fonctionnalités par plan).

L'état global à la fin de la plage : **le code est solide et audité** (37 anomalies recensées, 2 bloquantes corrigées, score sécurité passé d'un état critique à 48/100 avec un plan de remontée clair), mais **sa valeur réelle dépend entièrement des 7 éléments d'infrastructure de la section 5.1** qui ne peuvent être faits que par vous, l'administrateur du compte.

---

*Rapport produit le 2026-08-18 — audit de la plage `50add04` → `43e7424` (124 commits). Sources : lecture directe du code HEAD (`43e7424`) et de l'état initial (`50add04`) des fichiers `src/routes/api-*.ts`, `src/lib/brevo.ts`, `src/lib/security.ts`, des migrations `supabase/migrations/014–019`, de `wrangler.jsonc`, et des rapports de sessions 3→11 et contre-audits du 13→17/08 présents dans le dépôt.*
