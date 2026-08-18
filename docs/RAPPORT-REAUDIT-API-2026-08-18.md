# Ré-audit API — Fonctionnalités, Blog, Newsletter et côté Admin

**Dépôt** : [poodasamuelpro/monmenu](https://github.com/poodasamuelpro/monmenu) — branche `main`
**Plage ré-auditée** : `fb6bb96` (17/08 22h32) → `43e7424` (dernier commit : 17/08 23h40 UTC)
**Fichiers modifiés depuis le dernier audit** : `src/routes/api-dashboard.ts`, `CONTRE-AUDIT-SUPPLEMENTS-2026-08-17.md` (1 commit)
**Périmètre élargi** : inventaire complet des API fonctionnalités / blog / newsletter / admin, avec l'état actuel du code et tout ce qui doit être fait de votre côté
**Date du rapport** : 2026-08-18 — **Auteur** : Manus AI

---

## 1. Résumé exécutif

Un seul **nouveau commit** (`43e7424`) a été poussé depuis l'audit précédent. Il corrige **deux bugs bloquants** découverts par le contre-audit du 17/08 23h45 sur les routes PATCH/DELETE des suppléments : la collision de routing Hono (qui faisait exécuter la mauvaise route) et le retrait d'image silencieusement non fonctionnel. La correction a été appliquée directement dans la route active de `api-dashboard.ts` — elle est **fonctionnelle immédiatement après déploiement**, sans migration SQL supplémentaire (la 019 reste à appliquer de votre côté).

Concernant votre question de fond — **« les fonctionnalités ne sont pas assez développées côté API »** : le constat est **partiellement exact**. La partie lecture des fonctionnalités existe (`GET /api/v1/plans`), mais la **gestion administrative des fonctionnalités par plan n'existe pas encore** — elle est conçue en détail dans le document `docs/CONCEPTION-PLANS-FONCTIONNALITES-2026-08-17.md` (commit `fb6bb96`) et **attend vos 4 décisions** avant d'être implémentée. Ce rapport documente l'état exact de chaque API, ce qui est prêt, ce qui est conçu, et ce que vous devez faire.

---

## 2. Le nouveau commit `43e7424` en détail

### 2.1 Le bug trouvé (collision routing Hono)

Dans `src/index.tsx`, `dashboardRouter` (monté ligne 199) est enregistré **avant** `supplementsRouter` (monté ligne 209). Hono évalue les routes dans l'ordre d'enregistrement : les routes `PATCH /supplements/:id` et `DELETE /supplements/:id` définies dans `api-dashboard.ts` (lignes ~988 et ~1063) interceptaient donc **toutes** les requêtes PATCH/DELETE de suppléments **avant** celles du nouveau `api-supplements.ts`.

**Conséquences concrètes avant correctif** :

| Requête | Effet réel (bug) | Effet attendu |
|---|---|---|
| `PATCH /api/v1/dashboard/supplements/:id` | Validait mais **ignorait silencieusement** `photo_url: null` (bouton "Retirer image") ; n'invalide que `menu:{slug}` | Retrait d'image effectif + purge R2 + invalidation `supplements:{slug}` |
| `DELETE /api/v1/dashboard/supplements/:id` | Soft-delete DB mais **aucune purge R2** (image orpheline permanente) ; cache `supplements:{slug}` périmé 30s | Suppression propre : DB + R2 + cache |
| `GET /`, `POST /`, `POST /:id/image`, `GET /limite` | ✅ Passaient par `supplementsRouter` (pas de collision) | Identique |

### 2.2 La correction appliquée (`api-dashboard.ts`)

La route active (celle dans `dashboardRouter`) a été réécrite pour faire le même travail que celle prévue dans `api-supplements.ts` :

1. **`createSupabaseAdminClient`** à la place du client RLS (cohérence avec `api-supplements.ts`)
2. **Lecture de `photo_r2_key` avant toute modification** (pour pouvoir purger R2 si l'image est retirée)
3. **`PATCH` accepte désormais `photo_url: null` et `photo_r2_key: null`** — le bouton "Retirer image" du frontend fonctionne enfin
4. **Purge R2** (`c.env.R2_MEDIA.delete`) si `photo_r2_key` est mis à `null` (PATCH) ou si une image existe (DELETE)
5. **Invalidation des deux clés KV** : `menu:{slug}` ET `supplements:{slug}`

**Rôle de ce commit** : rendre fonctionnel le CRUD des suppléments généraux (surtout la gestion des images).
**Impact** : zéro changement d'API pour le frontend ou l'app mobile — mêmes URLs, mêmes réponses.
**Risque si non déployé** : les corrections restent sur GitHub mais pas dans le Worker — images orphelines R2 (frais de stockage croissants), liste suppléments périmée au dashboard, bouton "Retirer image" inutile.
**Action requise de vous** :
```bash
npm run build && npx wrangler deploy
```

### 2.3 Points restants consignés par le contre-audit

| Réf | Description | Priorité | Statut |
|---|---|---|---|
| MAJEUR-1 | Page suivi client (`src/pages/suivi.ts` l.133–139) : les suppléments commandés ne sont **pas affichés** sous chaque item (le client ne voit pas ses suppléments sur sa page de suivi, alors que l'opérateur et WhatsApp les voient) | Haute | ❌ À corriger |
| MINEUR-1 | Migration **019** à vérifier appliquée en production (`supabase db diff` ou console Supabase) | Haute | ⚠️ À faire par vous |
| MINEUR-2 | `supplements.js` l.152 : `onclick="loadSupplements()"` inline (bloqué par CSP Level 3) → bouton "Réessayer" inutilisable | Moyenne | ❌ Refactoring futur |
| MINEUR-3 | Les routes PATCH/DELETE de `supplementsRouter` (l.357–487) sont du **code mort** (jamais atteintes à cause de la collision) | Basse | Refactoring futur — consolider en un seul router |
| MINEUR-4 | Double validation PATCH (Zod dans `api-supplements.ts` vs manuelle dans `api-dashboard.ts`) | Basse | Refactoring futur |
| MINEUR-5 | Rate limiting `supplements-list` : fallback Map mémoire si KV indisponible (comportement général du projet) | Basse | Dépend du KV Cloudflare (voir rapport précédent §4.1) |

---

## 3. État de l'API « Fonctionnalités / Plans » — ce qui existe et ce qui manque

### 3.1 Ce qui existe aujourd'hui (lecture seule)

| Route | Fichier | Rôle | Sécurité |
|---|---|---|---|
| `GET /api/v1/plans` | `src/routes/api-plans.ts` l.44 | Liste des plans actifs avec `fonctionnalites` JSONB (clé `plans:FCFA` en cache KV 600s), ID = UUID Supabase | Publique (lecture seule) |
| `GET /api/v1/dashboard/supplements/limite` | `src/routes/api-supplements.ts` l.205 | Retourne `{ actif, limite, utilises }` depuis les colonnes scaffold `plans.supplements_actifs`/`limite_supplements` | Auth restaurateur |

Le comportement fonctionnalités du produit est aujourd'hui :
- **Codé en dur en partie** : `src/lib/plans.ts` et les pages `home.ts`, `inscription.ts`, `tarifs.ts` lisent le JSONB `fonctionnalites` avec des **clés divergentes** entre frontend (`stats_avancees`, `qrcode`) et Supabase (`statistiques_avancees`, `qr_code`)
- **Aucun contrôle backend** : aucune route ne bloque un tenant selon son plan pour les codes promo, l'export CSV ou les livreurs — c'est le gap critique identifié
- **Aucune interface admin** pour gérer les fonctionnalités d'un plan (pas de `POST/PUT /api/admin/plans/:id/fonctionnalites`)
- **`GET /api/v1/plans` n'est modifiable que directement en base Supabase** (les plans sont quasi-statiques, TTL 600s — design assumé)

### 3.2 Ce qui est CONÇU et prêt à être implémenté (attend votre feu vert)

Le document `docs/CONCEPTION-PLANS-FONCTIONNALITES-2026-08-17.md` (et sa copie dans `audits/`) spécifie entièrement un **système centralisé des fonctionnalités par plan**, validé sécurité (Zod partout, CSRF admin, RLS service_role, aucun prix côté client). Il reste **4 décisions humaines bloquantes** (section 14 du document) avant de lancer l'implémentation :

| # | Décision à prendre | Effet sur l'implémentation |
|---|---|---|
| 1 | Plan avec des tenants **en essai** dessus : refuser la désactivation / migrer vers Gratuit / laisser jusqu'à fin d'essai | Bloque `DELETE /api/admin/plans/:id` |
| 2 | `export_csv` : unique ou deux fonctionnalités (`export_csv` + `export_csv_codes_promo`) | Bloque le catalogue |
| 3 | `produits_max`/`categories_max` (20 produits Faso, etc.) : dans ce chantier ou séparé ? | Bloque la migration JSONB |
| 4 | Confirmer `MONMENU_BASE_URL` configurée côté Admin (webhook invalidation cache KV) | Webhook d'invalidation |

**Plan de migration prévu** (7 phases, déjà spécifié dans le document) :
1. Créer les tables `fonctionnalites` + `plan_fonctionnalites` dans Supabase, peupler les 13 fonctionnalités, migrer le JSONB existant → tables
2. Backend App Web : `getPlanFeatureConfig()` + checks dans `/codes-promo`, `/export-csv`, `/livreurs`, `/supplements`
3. Backend Admin : `GET/PUT /api/admin/plans/:id/fonctionnalites/:code`, matrice, webhook invalidation
4. Frontend App Web : sections sidebar conditionnées, page de paiement dynamique, retrait des clés hardcodées
5. Frontend Admin : matrice graphique à la place de la textarea JSON
6. App mobile Flutter (coordination)
7. Nettoyage : suppression des colonnes `supplements_actifs`/`limite_supplements` et du JSONB

**Rôle** : fermer les 4 gaps critiques (codes promo, export CSV, livreurs, suppléments appliqués à tous les tenants sans contrôle de plan).
**Risque si non fait** : n'importe quel tenant, même plan Faso, peut utiliser les codes promo, exporter le CSV et créer des livreurs — pas de différenciation réelle entre plans.
**Action requise** : répondre aux 4 questions ci-dessus (vous pouvez le faire dans le chat, un nouveau chantier pourra alors implémenter les 7 phases).

---

## 4. État de l'API Blog — complet mais avec 2 points à corriger

### 4.1 Inventaire des routes (lecture directe du code)

| Route | Fichier | Rôle | Protection |
|---|---|---|---|
| `GET /api/v1/blog` | `api-blog.ts` l.79 | Liste des articles publiés | Publique |
| `GET /api/v1/blog/:slug` | `api-blog.ts` l.96 | Un article publié | Publique |
| `POST /api/v1/blog/admin` | `api-blog.ts` l.116 | Créer un article (brouillon/publié) | Middleware JWT + whitelist admin (dual-path : table `admins` **ou** variable `ADMIN_EMAILS`) |
| `PATCH /api/v1/blog/admin/:id` | `api-blog.ts` l.149 | Modifier un article (slug, statut, catégorie...) | Idem + validation UUID regex l.152 |
| `DELETE /api/v1/blog/admin/:id` | `api-blog.ts` l.188 | Supprimer un article | Idem + validation UUID + vérif lignes (B-BLOG-01/02) |

### 4.2 Sécurité actuelle (corrigée en sessions 7 et 8)

Le middleware `isAdminEmail` (l.29–50) suit une chaîne de priorités : table Supabase `admins` d'abord, puis la variable `ADMIN_EMAILS`, puis **fail-closed** (personne n'est admin si rien n'est configuré). L'ordre de déclaration a été corrigé (BUG-01 : le middleware était déclaré après les routes, il ne s'appliquait donc jamais).

### 4.3 Anomalies résiduelles (audit 17/08 21h00) — à votre charge

| Réf | Problème | Correctif proposé | Priorité |
|---|---|---|---|
| ANOMALIE-14 | `POST /admin` : slug libre sans regex ni vérification de doublon (message d'erreur "slug déjà utilisé ?" non déterministe) | Regex `^[a-z0-9-]+$` + vérification `.maybeSingle()` avant insert | Faible |
| ANOMALIE-13 | `isAdminEmail` fait **deux appels Supabase Auth** par requête admin blog (getUser puis getUser) | Mettre en cache le résultat (cache KV 1h) | Faible |
| ANOMALIE-02 | `getNomProjet` appelé deux fois dans `/blog/:slug` sur route 404 | Dédupliquer l'appel | Faible |
| S3-02 | CSP : retirer `unsafe-inline` en injectant les nonces dans les templates blog SSR | Déjà amorcé le 16/08 (commits nonces) — à étendre aux templates restants | Moyenne |

**Rôle global du blog** : articles marketing publiés sur la home (`/blog`) — la partie admin blog est aujourd'hui **fonctionnelle et protégée**, sous réserve de votre configuration `ADMIN_EMAILS` (voir tâche du chapitre 6).
**Risque si `ADMIN_EMAILS` non configuré** : routes admin blog inaccessibles (503 — fail-closed). Aucune perte de données, mais impossible de publier un article tant que ce n'est pas fait.

---

## 5. État de l'API Newsletter — complète, avec 1 anomalie DoS et 1 d'énumération

### 5.1 Inventaire des routes

| Route | Fichier | Rôle | Protection |
|---|---|---|---|
| `POST /api/v1/newsletter` | `api-newsletter.ts` l.22 | Inscription (footer) : upsert `newsletter_subscribers` | Rate limit 3/h par IP + 2/24h par email (KV), réponse générique en cas de doublon |
| `POST /api/v1/newsletter/envoyer` | `api-newsletter.ts` l.67 | Envoi de campagne aux abonnés actifs (batchs de 50, échecs non bloquants) | **Deux voies admin** : (a) header `X-Admin-Secret` (= `ADMIN_WEBHOOK_SECRET`), (b) Bearer JWT + email dans table `admins` |
| `POST /api/v1/newsletter/desinscription` | `api-newsletter.ts` l.179 | Désabonnement → statut `desinscrit` | Publique, vérif `.select('id')` (BUG-04 corrigé) |

### 5.2 Anomalies résiduelles (audit 17/08 21h00)

| Réf | Problème | Correctif proposé | Priorité |
|---|---|---|---|
| ANOMALIE-26 | **Pas de rate limiting sur `/envoyer`** : un attaquant authentifié peut spammer les abonnés (DoS email — quota Brevo, coût, réputation SPF/DKIM) | `checkRateLimit('newsletter:envoyer', 1, 3600000, c.env.KV_CACHE)` — 1 envoi/h minimum | **Haute** |
| ANOMALIE-27 | `/desinscription` retourne 404 si l'email n'existe pas → **énumération d'emails** possible (les attaquants testent des emails en observant 200 vs 404) | Retourner 200 uniforme dans tous les cas | Moyenne |
| BUG-03 (hérité) | Comparaison `!==` au lieu de `timingSafeEqual` pour `X-Admin-Secret` dans certaines versions — vérifier que la version en production utilise `timingSafeEqual` (l.80 OK dans le code actuel) | Audit post-déploiement | Faible |

**Rôle global** : la newsletter est **fonctionnelle de bout en bout** (inscription, campagne réelle via Brevo, désabonnement) — elle nécessite toutefois les secrets Cloudflare `BREVO_API_KEY_*` + `ADMIN_WEBHOOK_SECRET` (voir chapitre 6).
**Risque si non fait** : aucune campagne ne peut partir sans `BREVO_API_KEY_*` ; si `ADMIN_WEBHOOK_SECRET` est absent, seule la voie JWT/table `admins` fonctionne (acceptable si la table `admins` est peuplée).

---

## 6. Tout ce qui doit être fait côté ADMIN — récapitulatif ordonné

C'est la partie "admin" au sens large : vos actions d'administrateur de la plateforme. Elles sont reprises de l'audit précédent (toujours valables, rien n'a changé dans le code sur ces points) plus les nouvelles constatations de ce ré-audit.

### 6.1 🔴 Déploiement immédiat (à faire aujourd'hui)

| # | Action | Commande / Où | Pourquoi |
|---|---|---|---|
| 1 | **Redéployer le Worker** | `npm run build && npx wrangler deploy` | Le commit `43e7424` (correctif suppléments bloquants) est sur GitHub mais pas encore en production |
| 2 | **Appliquer la migration 019** si pas encore fait | Console Supabase → SQL Editor → coller `supabase/migrations/019_supplements_generaux.sql` | Les suppléments généraux (nouvelle fonctionnalité) ne fonctionnent pas sans elle |
| 3 | Créer le secret `ADMIN_EMAILS` | `npx wrangler secret put ADMIN_EMAILS` (liste d'emails séparés par virgules) | Blog admin et routes protégées en fail-closed sans cela |
| 4 | Créer `ADMIN_WEBHOOK_SECRET` | `npx wrangler secret put ADMIN_WEBHOOK_SECRET` | Voie webhook sécurisée pour `POST /newsletter/envoyer` (et potentiellement `admin-tasks`) |
| 5 | Créer `ADMIN_TASK_SECRET` | `npx wrangler secret put ADMIN_TASK_SECRET` | Relance manuelle des captures de screenshots via `GET /api/v1/admin/tasks/screenshots` |
| 6 | Vérifier `BREVO_API_KEY_*` et `SUPABASE_SERVICE_ROLE_KEY` | Dashboard Cloudflare → Secrets (et la table `admins` peuplée côté Supabase) | Emails + voie admin JWT |

### 6.2 🟠 Actions admin dans l'interface (une fois déployé)

| # | Action | Où | Effet |
|---|---|---|---|
| 7 | Vérifier la page **Suppléments** du dashboard (restaurant test) : créer, éditer, retirer image, supprimer | Dashboard → Suppléments | Valider le correctif `43e7424` de bout en bout |
| 8 | Publier un article blog test | `POST /api/v1/blog/admin` (ou via votre frontend admin) | Valider la chaîne JWT + whitelist |
| 9 | Envoyer une campagne newsletter test | `POST /api/v1/newsletter/envoyer` avec `X-Admin-Secret` | Valider Brevo + batching |
| 10 | Relancer la capture des screenshots boutique | `curl -H "X-Admin-Task-Secret: …" https://…/api/v1/admin/tasks/screenshots` | Mettre à jour les images de la home |
| 11 | Vérifier la page de suivi client après une commande avec suppléments | `/suivi/:token` | Constater le gap MAJEUR-1 (suppléments non affichés) — à signaler pour correction |

### 6.3 🟡 Décisions et chantiers à ouvrir (ce qui bloque le développement futur)

| # | Chantier | Ce qu'il faut de vous | Impact |
|---|---|---|---|
| 12 | **Répondre aux 4 points ouverts de la conception plans** | Répondre aux 4 questions du chapitre 3.2 (dans le chat suffit) | Lance le chantier qui sécurise codes promo / export CSV / livreurs / suppléments par plan |
| 13 | **Corriger MAJEUR-1** : suppléments absents de la page suivi client | Donner le feu vert pour modifier `src/pages/suivi.ts` l.133–139 | Cohérence client/opérateur |
| 14 | Refactoring MINEUR-3/4 : consolider PATCH/DELETE suppléments en un seul router + validation Zod unique | Feu vert | Supprime le code mort et la double validation |
| 15 | ANOMALIE-26 : rate limiting sur `/newsletter/envoyer` | Feu vert (1 ligne + dépend du KV) | Anti-spam DoS email |
| 16 | Migrations RLS critiques R1 + R11 (annoncées au rapport précédent) | Feu vert SQL Supabase | Ferme INSERT public direct commandes et notifications |

---

## 7. Carte complète actuelle des routes API (état réel, post-correction)

| Fichier | Routes | État |
|---|---|---|
| `api-plans.ts` | `GET /` (plans + JSONB fonctionnalités) | ✅ Fonctionnel — lecture seule |
| `api-blog.ts` | `GET /`, `GET /:slug`, `POST /admin`, `PATCH /admin/:id`, `DELETE /admin/:id` | ✅ Fonctionnel — admin protégé dual-path |
| `api-newsletter.ts` | `POST /`, `POST /envoyer`, `POST /desinscription` | ✅ Fonctionnel — 2 anomalies résiduelles (ANOMALIE-26, -27) |
| `api-auth.ts` | `/login`, `/register`, `/logout`, `/refresh`, `/forgot-password`, `/verify-otp`, `/reset-password` | ✅ Fonctionnel (KV requis pour rate limiting distribué) |
| `api-tenants.ts` | `GET /`, `GET /:slug`, `GET /:slug/menu` (+ `supplements` racine), `GET /:slug/qrcode`, `POST /` | ✅ Fonctionnel |
| `api-commandes.ts` | `POST /` (suppléments IDs + recalcul prix serveur), `GET /suivi/:token`, `PATCH /:id/statut`, `POST /valider-promo` | ✅ Fonctionnel — race condition résiduelle ANOMALIE-15 (dépend migration 017) |
| `api-dashboard.ts` | ~25 routes (commandes, menu CRUD, catégories, produits, livreurs, PDV, apparence, paramètres, codes-promo, upload, media, QR, stats, notifications, FCM, suppression compte) | ✅ Post-correction `43e7424` — PATCH/DELETE suppléments corrects |
| `api-supplements.ts` | `GET /`, `GET /limite`, `POST /`, `POST /:id/image`, **PATCH /DELETE /:id (CODE MORT — jamais atteint)** | ⚠️ Partiel — code mort MINEUR-3 |
| `api-admin-paiements.ts` | `GET /` (liste paginée + urgents), `POST /confirmer`, `POST /rejeter`, `GET /preuve/:id`, `GET|POST|PATCH /moyens`, `GET /suppressions`, `POST /suppressions/:id/executer` | ✅ Fonctionnel |
| `api-admin-tasks.ts` | `GET /screenshots` (X-Admin-Task-Secret) | ✅ Fonctionnel — secret à configurer |
| `api-paiement.ts` | `/statut`, `/reference`, `/soumettre`, `/historique`, `/notifications` | ✅ Fonctionnel |
| `api-livraison.ts` | `POST /calcul` | ✅ Fonctionnel |
| `api-contact.ts` | `POST /` | ✅ Fonctionnel |

---

## 8. Réponse directe à votre constat : « fonctionnalités pas assez développées côté API »

Votre intuition est correcte et voici la hiérarchie exacte :

1. **Ce qui existe** : la *lecture* des fonctionnalités par plan (`GET /api/v1/plans` avec JSONB), le *scaffold* suppléments (`/supplements/limite`), et les limites fixes (20 produits Faso, etc. dans le JSONB).
2. **Ce qui manque réellement** : (a) **aucun contrôle backend par plan** sur les codes promo, export CSV, livreurs et suppléments ; (b) **aucune interface/route admin** pour gérer le catalogue de fonctionnalités d'un plan ; (c) des **clés JSONB incohérentes** frontend/Supabase ; (d) `produits_max`/`categories_max` non appliqués en runtime.
3. **Pourquoi c'est bloqué** : pas par manque de capacité technique — la conception complète (tables, routes, middleware `getPlanFeatureConfig`, plan de migration en 7 phases, checklist sécurité validée) est **déjà rédigée et audite** dans `docs/CONCEPTION-PLANS-FONCTIONNALITES-2026-08-17.md`. Elle attend **vos 4 réponses** (chapitre 3.2 de ce rapport) avant de passer en phase d'implémentation, qui ne modifiera alors aucun comportement existant (transition en parallèle documentée).
4. **La prochaine étape concrète** : répondez aux 4 questions, et le chantier plans pourra démarrer avec une spécification déjà validée de bout en bout.

---

## 9. Annexe — Preuve de lecture des fichiers clés

Les affirmations de ce rapport proviennent de la lecture directe des fichiers suivants sur la branche `main` au commit `43e7424` :

| Fichier | Lignes consultées | Ce qu'elles confirment |
|---|---|---|
| `src/routes/api-dashboard.ts` | 980–1110 | PATCH/DELETE suppléments réécrits (adminClient, purge R2, double invalidation KV) |
| `CONTRE-AUDIT-SUPPLEMENTS-2026-08-17.md` | 1–376 | BLOQUANT-1/2 corrigés + 6 anomalies consignées |
| `src/routes/api-blog.ts` | 1–213 | Dual-path admin, validations UUID, fail-closed |
| `src/routes/api-newsletter.ts` | 1–215 | Rate limits, batching 50, deux voies auth |
| `src/routes/api-plans.ts` | 1–120 | Lecture Supabase, cache KV 600s, JSONB fonctionnalités |
| `src/routes/api-supplements.ts` | 1–560 | CRUD suppléments généraux + code mort PATCH/DELETE |
| `src/routes/api-admin-paiements.ts` | 73–740 | Paiements, moyens de paiement, suppressions |
| `src/routes/api-admin-tasks.ts` | 1–45 | Screenshot à la demande, secret header |
| `src/index.tsx` | 194–220 | Ordre de montage des 13 routers (cause collision) |
| `src/middleware/auth.ts` | 1–60 | `authMiddlewarePlatform`, cookie + Bearer |
| `docs/CONCEPTION-PLANS-FONCTIONNALITES-2026-08-17.md` | 300–1160, 1300–1338 | Conception plans + 4 points ouverts |
| `audits/audit-complet-2026-08-17-21h00.md` | 96–1032 | 37 anomalies détaillées |

---

*Rapport produit le 2026-08-18 — ré-audit de la plage `fb6bb96` → `43e7424` + inventaire complet des API fonctionnalités/blog/newsletter/admin du dépôt poodasamuelpro/monmenu. Sources : lecture directe du code sur `main` au commit `43e7424` et des rapports d'audit du 17/08.*
