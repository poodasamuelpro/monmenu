# Rapport d'audit des commits 50add04 → fb6bb96 — Tâches manuelles et migrations Supabase à effectuer

**Dépôt** : [poodasamuelpro/monmenu](https://github.com/poodasamuelpro/monmenu) — branche `main`
**Plage auditée** : `50add04` (2026-08-13 13h20 UTC) → `fb6bb96` (2026-08-17 22h32 UTC, dernier commit d'aujourd'hui)
**Nombre de commits audités** : **123 commits**
**Date du rapport** : 2026-08-18
**Auteur** : Manus AI

---

## 1. Résumé exécutif

Tous les fichiers de code, de rapports et de documentation des 123 commits ont été lus et analysés. Le résultat est le suivant :

> **La grande majorité du travail de cette période est du code déjà écrit et poussé sur GitHub.** Ce qui reste à faire par vous-même se résume à un nombre limité d'**actes manuels d'infrastructure** (Cloudflare, Supabase SQL, secrets), dont **5 migrations SQL Supabase dans un ordre chronologique strict**, et à un ensemble de **décisions et chantiers en attente** documentés par les audits.

### Les actes manuels vitaux (à faire en priorité)

| # | Acte | Urgence | Où |
|---|------|---------|-----|
| 1 | Créer le namespace KV `monmenu-cache` dans Cloudflare + lier son ID dans `wrangler.jsonc` (si pas déjà fait en production) | 🔴 Critique | Cloudflare |
| 2 | Appliquer les 5 migrations SQL **015 → 016 → 017 → 018 → 019** dans cet ordre sur Supabase | 🔴 Critique | Console Supabase |
| 3 | Rejouer la **migration 018** sur tout environnement où la migration 002 seule a été appliquée (staging) | 🟠 Élevée | Supabase |
| 4 | Exécuter `npx wrangler deploy` (déploiement Workers) après chaque changement de `wrangler.jsonc` | 🟠 Élevée | Terminal |
| 5 | Créer le secret Cloudflare `ADMIN_EMAILS` (`wrangler secret put ADMIN_EMAILS`) | 🟠 Élevée | Terminal |
| 6 | Vérifier que `KV_CACHE` pointe bien sur le bon namespace en production (ID `21083c6b049349aca60411d19c8aeaba` inscrit dans `wrangler.jsonc`) | 🟠 Élevée | Cloudflare |
| 7 | Trancher les **4 points ouverts** de la conception des plans avant de développer le chantier plans | 🟡 Moyenne | Décision humaine |
| 8 | Redéployer l'app mobile Flutter pour le changement de contrat API `tenant_id` → `slug` (`POST /api/v1/commandes`) | 🟡 Moyenne | Dépôt monmenu-mobile |
| 9 | Basculer `PUBLIC_BASE_URL` de `monmenu.poodasamuelpro.workers.dev` vers `https://monmenu.com` quand le domaine définitif sera branché | 🟡 Moyenne | wrangler.jsonc + Brevo |
| 10 | Mettre en place les 2 migrations RLS critiques proposées (R1 + R11) de l'audit du 17/08 21h00 | 🟡 Moyenne | Supabase |

**Risque principal si rien n'est fait** : le code de sécurité critique (rate limiting distribué, migrations RLS 017/018/019) est **écrit mais ne protège personne tant qu'il n'est pas appliqué en production**. Le code est sur GitHub, pas dans votre base de données ni dans votre Worker Cloudflare.

---

## 2. Chronologie globale des 123 commits

La période se décompose en **7 sessions de correction** et 3 phases d'audit final. Chaque bloc est décrit ci-dessous avec ses commits, son rôle et ce qu'il exige de vous.

| Période | Bloc | Commits | Nature |
|---|---|---|---|
| 13/08 13h20–16h43 | Rapports de bugs initiaux (3 audits) + correctifs manuels `brevo.ts`, `api-auth.ts`, `forgot-password.ts` | `50add04` → `9fe2a0b` (6 commits) | Documentation + patches manuels |
| 14/08 13h50–15h53 | **Session 3** : 15 corrections (sécurité, emails, suppression de compte) | `354b77e` → `3784823` + merge + 2 commits post-PR | Code + 2 migrations (015, 016) |
| 14/08 19h03–19h19 | Post-PR session 3 : cron fusionné, invalidation KV | `8292ae2`, `b3371e1`, `ec9a404` | Code |
| 15/08 03h27–04h56 | **Sessions 5 + 6** : 28 corrections backend (écritures silencieuses, XSS, emails) + migration 017 | `9b14b6c` → `01c6760` (13 commits) | Code + 1 migration (017) |
| 16/08 00h40–01h01 | **Session 7** : 11 corrections sécurité (RLS, tenant spoofing, nonces CSP) + migration 018 | `fd07054` → `5db05bc` (12 commits) | Code + 1 migration (018) |
| 16/08 01h54–16h12 | Rapports + **Sessions 8, 9, 10, 11** : 35+ corrections (login, crons, CSV, CORS, refactors) | `60a7e57` → `951cded` (33 commits) | Code + renommage migration 013→014 |
| 16/08 17h12–18h07 | Batch TypeScript (4 batchs) + CSP nonces + fix régression | `5145fdb` → `a4d2a0c` (10 commits) | Code |
| 17/08 02h14–03h36 | **CSP Level 3** : migration de 100+ handlers inline → zéro handler inline | `dfa747a` → `4b8cdfd` (17 commits) | Code |
| 17/08 18h36–22h32 | Audit 18h36 (2 bugs) + contre-audit 19h54 + **suppléments généraux** (migration 019) + audit sécurité 21h00 (37 anomalies) + **conception plans** | `88f53b8` → `fb6bb96` (11 commits) | Code + 1 migration (019) |

---

## 3. Les 5 migrations Supabase — ordre chronologique STRICT

Ces 5 fichiers se trouvent dans le dépôt sous `supabase/migrations/`. Ils doivent être appliqués **dans cet ordre exact**, car chaque migration peut dépendre de la précédente (exemple : la 019 s'appuie sur le schéma établi par la 016/018 ; la 017 remplace une RPC créée dans la 004). **Aucun code exécuté par les Workers ne déclenchera ces migrations** : elles sont uniquement dans le dépôt GitHub — **vous devez les exécuter manuellement sur Supabase**.

### Migration n°1 — `015_limite_pdv_1.sql` (session 3, commit `daff016`, 14/08)

- **Chemin** : `supabase/migrations/015_limite_pdv_1.sql`
- **Rôle** : harmonise `plans.limite_pdv = 1` pour tous les plans (Pro était à 3, Premium à 10) pour cohérence de données, car la fonctionnalité multi-PDV n'existe pas.
- **But** : les données reflètent la réalité du produit (1 PDV par restaurant).
- **Impact** : aucune vérification runtime de cette limite n'existe — aucun comportement utilisateur ne change.
- **Risque si non fait** : tableau des plans incohérent (Pro afficherait "3 PDV inclus" sans que ce soit fonctionnel) ; risque faible mais données inexactes.
- **Risques d'exécution** : nul — simple UPDATE non destructif, réversible.

### Migration n°2 — `016_suppression_compte.sql` (session 3, commit `daff016`, 14/08)

- **Chemin** : `supabase/migrations/016_suppression_compte.sql`
- **Rôle** : ajoute 4 colonnes à `tenants` (`suppression_demandee_le`, `suppression_prevue_le`, `suppression_token`, `suppression_token_expire_le`) + 2 index partiels, pour le flux de suppression de compte validé par admin (soft-delete programmé 30 jours).
- **But** : rendre opérationnelles les 3 nouvelles routes `POST /compte/demander-suppression`, `GET /compte/confirmer-suppression`, `POST /compte/annuler-suppression` et les routes admin.
- **Impact** : sans ces colonnes, ces routes plantent (erreur 500 / colonne manquante) — le flux de suppression est **cassé en production tant que cette migration n'est pas appliquée**.
- **Risque si non fait** : le restaurateur qui demande la suppression de son compte obtient une erreur ; aucune donnée n'est perdue mais la fonctionnalité est morte.
- **Risques d'exécution** : non destructif (ADD COLUMN), `IF NOT EXISTS` — sans risque.

### Migration n°3 — `017_fix_increment_promo_usage.sql` (session 6, commit `9955d50`, 15/08)

- **Chemin** : `supabase/migrations/017_fix_increment_promo_usage.sql`
- **Rôle** : remplace la RPC `increment_promo_usage` (créée en 004) : passe de `LANGUAGE sql / RETURNS void` à `LANGUAGE plpgsql / RETURNS INTEGER`, avec la garde `COALESCE(usage_actuel,0) < usage_max` intégrée dans le UPDATE — vérification **atomique** (corrige la race condition critique B-CMD-03 où deux clients pouvaient consommer le dernier usage d'un code promo simultanément). Retourne 1 si incrémenté, 0 si limite atteinte.
- **But** : sécuriser l'application des codes promo contre le double usage concurrent.
- **Impact** : le backend (`src/routes/api-commandes.ts`, commit `9955d50`) inspecte `rpcResult === 0` → 409. Le code backend est déjà en place et **attend la nouvelle signature de la RPC**.
- **Risque si non fait** : **avec l'ancienne RPC, le backend reçoit une RPC void et la logique `rpcResult === 0` est inopérante — la race condition critique N° 1 des codes promo demeure ouverte**. C'est la migration la plus critique du lot car le code backend est déjà déployé sans le support SQL.
- **Risques d'exécution** : remplace une fonction (DROP + CREATE) — sans perte de données. Vérifier post-application : `SELECT prosrc FROM pg_proc WHERE proname='increment_promo_usage';`

### Migration n°4 — `018_fix_rls_commandes_public_suivi.sql` (session 7, commit `fd07054`, 16/08)

- **Chemin** : `supabase/migrations/018_fix_rls_commandes_public_suivi.sql`
- **Rôle** : supprime la policy RLS `commandes_public_suivi` contenant `OR deleted_at IS NULL` qui rendait **toutes les commandes non supprimées de tous les tenants lisibles publiquement par quiconque possède la clé anon Supabase** (visible dans le HTML) — anomalie **critique**. La remplace par `commandes_tenant_owner_select` stricte (propriétaire uniquement).
- **But** : corriger une fuite de données complète (commandes, montants, clients de tous les restaurants accessibles en direct sur PostgREST).
- **Impact** : aucune perte fonctionnelle — le suivi public passe intégralement par le Worker (`api-commandes.ts`), la policy était superflue.
- **Risque si non fait** : **fuite de données massives et continue** — n'importe quel visiteur peut lire toutes les commandes du site via l'API Supabase directe. C'est la migration de sécurité la plus urgente après la 017.
- **Risque d'exécution** : DROP + CREATE policy. ⚠️ Si un environnement (staging) n'applique que la 002 sans la 018, il reste exposé — voir tâche 3 du chapitre 4.

### Migration n°5 — `019_supplements_generaux.sql` (session suppléments, commit `a93f158`, 17/08)

- **Chemin** : `supabase/migrations/019_supplements_generaux.sql`
- **Rôle** : transforme les suppléments de "liés à un produit" (`produit_id` NOT NULL) en "suppléments généraux par restaurant" (`produit_id` nullable), ajoute `photo_url`/`photo_r2_key`, ajoute le **scaffold plan** `plans.supplements_actifs` + `plans.limite_supplements`, ajoute 3 index, active RLS sur `supplements` avec policies tenant-scoped. Idempotent (rejouable sans effet de bord), rollback documenté en fin de fichier.
- **But** : rendre opérationnelles les nouvelles routes `/api/v1/dashboard/supplements` (CRUD), le champ additif `supplements` dans `GET /:slug/menu`, et l'écran groupé de suppléments côté boutique.
- **Impact** : sans cette migration, la nouvelle page Suppléments du dashboard et l'API correspondante plantent ; le champ `supplements` n'apparaît pas dans le menu public (le reste de l'app reste fonctionnel — champ additif).
- **Risque si non fait** : fonctionnalité suppléments généraux morte en production ; badges de limite plan incohérents.
- **Risques d'exécution** : faible — idempotent, non destructif (nullable, ADD COLUMN), données historiques préservées. Le rapport officiel (`RAPPORT-SUPPLEMENTS-2026-08-17.md`, §11) précise que c'est la **seule étape manuelle** de tout ce chantier.

### Vérifications post-application (à exécuter après les 5 migrations)

```bash
# Ordre de vérification recommandé, depuis la console Supabase (SQL Editor)
-- 1. Présence des colonnes de suppression
SELECT column_name FROM information_schema.columns WHERE table_name='tenants' AND column_name LIKE 'suppression%';
-- 2. Signature plpgsql de la RPC promo
SELECT prorettype::regtype FROM pg_proc WHERE proname='increment_promo_usage';
-- 3. La policy dangereuse n'existe plus
SELECT policyname FROM pg_policies WHERE tablename='commandes' AND policyname='commandes_public_suivi'; -- doit être vide
-- 4. Supplements : colonne nullable et scaffold plan
SELECT column_name, is_nullable FROM information_schema.columns WHERE table_name='supplements';
SELECT supplements_actifs, limite_supplements FROM plans;
```

---

## 4. Tâches manuelles hors migrations — ordre de priorité

### 4.1 🔴 Critique — Namespace KV Cloudflare (créé en code, à lier en production)

- **Fichiers concernés** : `wrangler.jsonc` (binding `KV_CACHE`, ID `21083c6b049349aca60411d19c8aeaba`, commit `e97ad88`) + `src/routes/api-auth.ts`, `api-commandes.ts`, `api-newsletter.ts`, `api-paiement.ts`, `api-dashboard.ts`
- **Contexte** : la session 8 (`RAPPORT-CORRECTION-SESSION-8.md`) a identifié que l'**absence de KV lié** était une des deux causes racines du **bug de login en production** et de la **page d'accueil sans restaurants/plans/logos**. Le code du binding est poussé, l'ID réel inscrit, mais le namespace doit exister côté Cloudflare.
- **Action** :
```bash
npx wrangler kv namespace create monmenu-cache
# Copier l'ID retourné dans wrangler.jsonc (l'ID actuel 21083c6b... est celui inscrit par le commit e97ad88 — vérifier qu'il correspond bien à votre namespace réel)
npm run build && npx wrangler deploy
```
- **Rôle** : activer le rate limiting distribué (login, register, newsletter, commandes), le cache boutique/home/sitemap, les sessions KV, les anti-doublons de rappels.
- **Impact** : tout le mécanisme de protection par IP/email tombe en Map mémoire locale par isolate si absent.
- **Risque si non fait** : bug de login récurrent en warm start (boucle de redirect), rate limiting inefficace en production multi-isolate, home vide de temps en temps.

### 4.2 🔴 Critique — Déploiement Workers après chaque changement wrangler

- **Fichiers concernés** : `wrangler.jsonc` (5 commits le modifient : `72a12c6`, `b458375`, `b3371e1`, `e97ad88`)
- **Action** : `npm run build && npx wrangler deploy`
- **Rôle** : `wrangler.jsonc` porte les 5 cron triggers (stats 02h, tenants expirés 02h10, screenshots 02h20, blocage paiements toutes les 6h, rappels J-5/J-2 08h — fusionnés de 7 à 5 pour respecter la limite du plan Free), le binding KV et les bindings D1/R2.
- **Risque si non fait** : les crons de désactivation d'abonnements expirés et de rappels d'expiration ne tournent pas — des restaurants gardent un accès complet après expiration de paiement ; les secrets/bindings nouveaux ne sont pas pris en compte.

### 4.3 🟠 Élevée — Secret ADMIN_EMAILS (fail-closed)

- **Fichiers concernés** : `src/routes/api-blog.ts` (commit `8c0e1ad`, session 7), type `Env` dans `951cded`
- **Action** : `npx wrangler secret put ADMIN_EMAILS` → valeur `"email1@example.com,email2@example.com"` (vos adresses admin)
- **Rôle** : le middleware `/api/v1/blog/admin/*` vérifie que le JWT appartient à une de ces adresses — avant cela, **tout restaurateur authentifié pouvait créer/modifier/supprimer des articles du blog de la plateforme**.
- **Comportement fail-closed** : si la variable est absente, les routes admin blog retournent **503** (accessibles par personne) — pas de fail-open.
- **Risque si non fait** : aucun accès blog admin possible (503) ou, si vous aviez un ancien système secret statique, surface d'attaque élargie.

### 4.4 🟠 Élevée — Rejouer la 018 sur les environnements partiels (staging)

- **Contexte** : l'audit du 17/08 21h00 (ANOMALIE-33) signale qu'un environnement qui a appliqué la 002 mais pas encore la 018 reste exposé à la policy dangereuse `commandes_public_suivi`.
- **Action** : appliquer la 018 sur **chaque** environnement Supabase existant (production ET staging), pas seulement production.
- **Risque si non fait** : la fuite de données critique (chapitre 3, migration 018) persiste sur cet environnement.

### 4.5 🟠 Élevée — Migrations RLS critiques proposées par l'audit final (ANOMALIE-04/R1 + R11)

- **Fichiers concernés** : `supabase/migrations/002_rls_policies.sql` (policy `commandes_public_insert` `WITH CHECK (true)`), `supabase/migrations/011_rls_notifications.sql` (policy `notif_restaurant_insert_service` `WITH CHECK (true)`)
- **Actions SQL** (à exécuter en SQL Editor Supabase, **après** la migration 018) :
```sql
-- R1 : bloquer l'INSERT public direct sur commandes (contourne validation prix/stocks/rate limiting)
DROP POLICY IF EXISTS "commandes_public_insert" ON commandes;
CREATE POLICY "commandes_insert_service_only" ON commandes
  FOR INSERT WITH CHECK (
    current_setting('request.jwt.claims', true)::json->>'role' = 'service_role'
  );

-- R11 : restreindre l'INSERT de notifications au service_role (anti-spam inter-tenants)
DROP POLICY IF EXISTS "notif_restaurant_insert_service" ON notifications_restaurant;
CREATE POLICY "notif_restaurant_insert_service_role_only" ON notifications_restaurant
  FOR INSERT WITH CHECK (
    current_setting('request.jwt.claims', true)::json->>'role' = 'service_role'
  );
```
- **Rôle** : fermer les 2 dernières policy `WITH CHECK (true)` découvertes par l'audit.
- **Impact** : n'importe qui avec la clé anon peut actuellement **insérer des commandes directement en base** (sans validation prix/stocks/rate limiting) et **injecter des notifications dans le dashboard d'un autre restaurateur**.
- **Risque si non fait** : fraude de commande (commande insérée à prix manipulé), spam de notifications, données corrompues.
- **⚠️ Précaution** : vérifier que l'app mobile Flutter envoie ses commandes **via le Worker** (`POST /api/v1/commandes`) et non directement via PostgREST — sinon cette migration bloquerait l'app mobile. Consulter `docs/API-SUPPLEMENTS.md` et `docs/audit-session-3/IMPACT-API-MOBILE.md`.

### 4.6 🟡 Moyenne — App mobile Flutter : changement de contrat API (commit `9d72756`, session 7)

- **Chemin** : `src/routes/api-commandes.ts`, `src/index.tsx` (CORS), `public/static/js/boutique.js`
- **Changement** : `POST /api/v1/commandes` et `POST /commandes/valider-promo` ne lisent plus `body.tenant_id` (falsifiable) — le tenant est résolu depuis le header `X-Tenant-Slug` ou le champ `slug` du body.
- **Action** : mettre à jour et republier l'app mobile (`monmenu-mobile`) pour envoyer `slug`/`X-Tenant-Slug` au lieu de `tenant_id`.
- **Risque si non fait** : l'ancienne app mobile peut pointer les commandes vers un autre restaurant (spoofing `tenant_id`). Le code serveur ignore désormais ce champ — la création de commande depuis une vieille app échouera (tenant non résolu).

### 4.7 🟡 Moyenne — Bascule du domaine définitif (commentée dans `wrangler.jsonc`)

- **Fichier** : `wrangler.jsonc` → `vars.PUBLIC_BASE_URL` actuellement `https://monmenu.poodasamuelpro.workers.dev`
- **Action** : une fois le domaine `monmenu.com` acheté et branché (DNS Cloudflare + Custom Domain sur le Worker + authentification du domaine côté Brevo), passer `PUBLIC_BASE_URL` à `https://monmenu.com` et redéployer.
- **Rôle** : les emails transactionnels (Brevo) contiennent des liens vers cette URL ; les screenshots home (thum.io) captureront le bon domaine ; le CORS workers.dev exact (`WORKERS_DEV_URL_PROJET`) restera valide.
- **Risque si non fait** : emails avec liens workers.dev au lieu de monmenu.com ; rien de cassant.

### 4.8 🟡 Moyenne — Les 4 points ouverts de la conception des plans (commit `fb6bb96`)

La conception `docs/CONCEPTION-PLANS-FONCTIONNALITES-2026-08-17.md` (et son homologue `audits/CONCEPTION-PLANS-FONCTIONNALITES-2026-08-17.md`) est validée **sous réserve** de 4 décisions humaines avant toute implémentation du chantier plans :

| # | Décision à prendre | Impact si non tranchée |
|---|---|---|
| 1 | Politique de suppression d'un plan avec des tenants **en essai** dessus : refuser / migrer vers Gratuit / laisser jusqu'à fin d'essai | Bloque l'implémentation de `DELETE /api/admin/plans/:id` |
| 2 | `export_csv` : unique pour commandes + codes promo, ou deux fonctionnalités distinctes (`export_csv_codes_promo`) | Bloque le catalogue de fonctionnalités |
| 3 | `produits_max` / `categories_max` (limites quantitatives du JSONB) : dans ce chantier ou un chantier séparé ? | Bloque la migration JSONB |
| 4 | Confirmer que `MONMENU_BASE_URL` est bien configurée en production côté Admin (webhook d'invalidation cache KV inter-déploiements) | Le webhook d'invalidation ne fonctionnerait pas |

**Risque si non fait** : le chantier plans (qui ferme les gaps critiques identifiés : codes promo sans blocage backend, export CSV sans blocage backend, livreurs sans blocage backend) reste théorique ; l'application continue d'accepter les codes promo et exports CSV de tout tenant quel que soit son plan.

### 4.9 🟢 Bas — Vérification de cohérence des clés frontend/backend

- **Constat** (conception plans, §3.1) : les clés JSONB Supabase réelles (`statistiques_avancees`, `qr_code`) ne correspondent pas aux clés frontend (`stats_avancees`, `qrcode`, `livreurs` absent de la migration 009).
- **Action** : à traiter lors du chantier plans (harmonisation prévue au catalogue, section 4.1 de la conception) — sinon les pages tarifs/home affichent des fonctionnalités avec des clés qui ne trouvent jamais de valeur.
- **Risque si non fait** : affichage incohérent des fonctionnalités par plan sur le site public.

---

## 5. Ce qui a déjà été fait automatiquement par le code (aucune action requise)

Pour éviter de dupliquer des efforts, voici les actions manuelles annoncées dans les rapports **qui sont désormais absorbées** par des commits ultérieurs et ne nécessitent plus rien de votre part :

| Tâche annoncée | Absorbée par | Statut |
|---|---|---|
| Créer KV namespace + lier ID (session 8) | Commit `e97ad88` — ID réel `21083c6b...` inscrit dans `wrangler.jsonc` | ✅ Code prêt — reste seulement à vérifier l'existence du namespace côté Cloudflare (4.1) |
| Cron fusionné 7→5 triggers | Commits `8292ae2` + `b3371e1` (API + triggers) | ✅ En place après déploiement |
| Invalidations KV `tenants:public:12/24` dans `bloquerPaiementsExpires()` (annoncé session 4) | Commit `ec9a404` | ✅ En place |
| Email annulation suppression (manquant session 4) | Commit `3b3fe5a` (session 5) | ✅ En place |
| Nettoyage R2 lors suppression définitive (manquant session 4) | Commit `2bd6784` (B2, session 5) | ✅ En place |
| Nettoyage R2 automatique au remplacement d'image (manquant session 4) | Commit `97975fa` (B1, session 5) | ✅ En place |
| Anti-doublon rappels KV (manquant session 4) | Commit `c48b2d5` (B6, session 5) | ✅ En place |
| Rate limiting login/register KV (annoncé session 5) | Commit `e7580af` (session 7) | ✅ En place |
| CSRF double-submit cookie dashboard (annoncé session 8) | Commit `783a0ac` (session 11) | ✅ En place |
| Auth admin dual-path (annoncé session 8) | Commit `f8ff7b0` (session 11) | ✅ En place |
| Consolidation validerMimeImage (manquant session 4) | Commits `ad02220` + `f89c4fa` | ✅ En place |
| Injection CSV, XSS confirmer-suppression, COOP/COEP (session 10) | Commits `db193c0`, `518bda3`, `fc76fab` | ✅ En place |
| SRI CDN, nonces CSP SSR, CORS localhost conditionnel, ENVIRONMENT (P7) | Commits `5145fdb`, `e15d490`, `951cded` + batchs TS | ✅ En place |
| Refactor R3 `lib/auth.ts` (annoncé session 8) | Commits `ad8bfe2` + `fa87f11` | ✅ En place |
| Factorisation `lib/commandes.ts` (annoncé session 8) | Commit `eaf038b` | ✅ En place |
| Migration nonces CSP page par page (annoncé session 7) | 17 commits CSP du 17/08 (zéro handler inline) | ✅ En place |
| Renommage 013→014 (annoncé session 9) | Commit `c81f897` | ✅ En place |
| `detail: error.message` conditionnel, SRI, CORS localhost | Batchs TS `3471516`→`a4d2a0c` | ✅ En place |
| Migration migration 019 + guide API Flutter | Commits `a93f158` + `3c0bb40` | ✅ Code prêt — migration SQL à appliquer (4.1 migration n°5) |

---

## 6. Chantiers ouverts restants (non urgents mais documentés)

Les audits ont identifié des chantiers de fond **non bloquants** que vous pourrez confier à de futures sessions. Aucun n'exige d'action manuelle immédiate :

| Chantier | Source | Priorité |
|---|---|---|
| Système centralisé des fonctionnalités par plan (conception déjà prête, 4 points ouverts à trancher) | `docs/CONCEPTION-PLANS-FONCTIONNALITES-2026-08-17.md`, plan de migration Phases 1→7 | 🟠 Haute (ferme 4 gaps critiques) |
| Supprimer les singletons `keyStates` de `brevo.ts` (R2) | Audit `audits/audit-complet-2026-08-17-21h00.md` | 🟡 Moyenne |
| Authentifier `GET /api/v1/dashboard/media/:key` (R3) | Audit 21h00 | 🟡 Moyenne |
| Valider MIME dans `POST /setup-restaurant` (R4) | Audit 21h00 | 🟡 Moyenne |
| URLs temporaires `GET /media/:key` (R7) | Audit 21h00 | 🟢 Basse |
| Invalidations sessions Supabase au logout (R10) | Audit 21h00 | 🟡 Moyenne |
| Monitoring/alerting Cloudflare (taux 500 paiement, 429 login, volume Brevo) (R14) | Audit 21h00 | 🟡 Moyenne |
| Runbook de migration RLS systématique (R13) | Audit 21h00 | 🟢 Basse |
| Vérifier `domaine_perso` dans l'app mobile (reste FAQ orpheline `home.ts`) | Rapport session 4, §5.9 | 🟢 Basse |
| Supprimer la branche distante `fix/audit-session-3` après fusion | Rapport session 4, §5.10 | Cosmétique |
| Re-vérification exhaustive des items "conformes" sessions 1-11 (P8/P9) | Session 11 | 🟢 Basse |

---

## 7. Checklist finale ordonnée (à exécuter dans cet ordre)

| Étape | Action | Fichier / Commande | Risque si sautée |
|---|---|---|---|
| 1 | Vérifier/créer le namespace KV `monmenu-cache` dans le dashboard Cloudflare | Dashboard Cloudflare > KV | Rate limiting + cache + sessions inopérants |
| 2 | Appliquer migration **015** | `supabase/migrations/015_limite_pdv_1.sql` | Faible (données incohérentes) |
| 3 | Appliquer migration **016** | `supabase/migrations/016_suppression_compte.sql` | Flux suppression de compte cassé |
| 4 | Appliquer migration **017** | `supabase/migrations/017_fix_increment_promo_usage.sql` | **Race condition codes promo ouverte** |
| 5 | Appliquer migration **018** (production + staging) | `supabase/migrations/018_fix_rls_commandes_public_suivi.sql` | **Fuite de données commandes critique** |
| 6 | Appliquer migration **019** | `supabase/migrations/019_supplements_generaux.sql` | Suppléments généraux morts |
| 7 | Appliquer migrations RLS R1 + R11 (SQL Editor) | Voir §4.5 | INSERT public direct possible |
| 8 | Vérifications SQL post-migrations | Voir §3 (requêtes de vérification) | — |
| 9 | Déployer le Worker | `npm run build && npx wrangler deploy` | Crons et bindings non pris en compte |
| 10 | Créer le secret `ADMIN_EMAILS` | `npx wrangler secret put ADMIN_EMAILS` | Blog admin inaccessible (503) |
| 11 | Mettre à jour + republier l'app mobile Flutter (slug) | Dépôt monmenu-mobile | Spoofing tenant_id / échec commandes |
| 12 | Trancher les 4 points ouverts de la conception plans | `docs/CONCEPTION-PLANS-FONCTIONNALITES-2026-08-17.md` §14 | Chantier plans bloqué |
| 13 | Basculer `PUBLIC_BASE_URL` → monmenu.com (quand le domaine est actif) | `wrangler.jsonc` + Brevo | Liens emails en workers.dev |
| 14 | Vérifier les 37 anomalies de l'audit 21h00 et lancer les chantiers §6 | `audits/audit-complet-2026-08-17-21h00.md` | Score sécurité 48/100 |

---

## 8. Annexe A — Cartographie complète des 123 commits

| # | Commit | Date (UTC) | Rôle | Tâche manuelle associée |
|---|---|---|---|---|
| 1 | `50add04` | 13/08 13:20 | Audit sécurité complet (web, pentest, performance) | Aucun (documentation) |
| 2 | `cf14792` | 13/08 13:23 | Rapport audit #2 (cache KV, cycle vie, emails, plans, domaine perso) | Aucun |
| 3 | `68ed8df` | 13/08 13:38 | Rapport chronologique #4 (historique 36h) | Aucun |
| 4 | `012678b` | 13/08 13:58 | Rapport exhaustif : 34 bugs (3 critiques, 16 majeurs, 12 mineurs, 3 info) | Aucun |
| 5 | `109ad33` | 13/08 13:58 | Merge `main` distant | Aucun |
| 6 | `754f3e3` | 13/08 15:28 | Patch manuel `brevo.ts` | Aucun |
| 7 | `54c2e01` | 13/08 15:31 | Patch manuel `api-auth.ts` | Aucun |
| 8 | `9fe2a0b` | 13/08 15:43 | Patch manuel `forgot-password.ts` | Aucun |
| 9 | `354b77e` | 14/08 13:50 | Docs session 3 : audit-1 état des lieux + audit-2 plan de correction | Aucun |
| 10 | `daff016` | 14/08 13:54 | Corr #1 (rate limiting newsletter) + **migration 015** + **migration 016** | ⚠️ Appliquer 015 + 016 |
| 11 | `5d1f682` | 14/08 13:57 | Corr #2 : suppression complète domaine_perso | Aucun |
| 12 | `c0a4ad0` | 14/08 14:04 | HSTS header | Aucun |
| 13 | `4c323db` | 14/08 14:08 | Corr #5+#6 : emails transactionnels + anti-XSS export | Aucun |
| 14 | `72a12c6` | 14/08 14:10 | Corr #7+#10a : crons rappels J-5/J-2 + actifs→inactifs + 3 triggers wrangler | ⚠️ Redéployer (crons) |
| 15 | `08124c5` | 14/08 14:11 | Corr #8a/#8b/#8c+#14.1 : RLS apparence, invalidations KV, cache 30s | Aucun |
| 16 | `0656ff2` | 14/08 14:12 | Corr #9 : pagination livreurs/codes-promo/menu | Aucun |
| 17 | `8799281` | 14/08 14:32 | URLs dynamiques emails (getBaseUrl) | Aucun |
| 18 | `46d909a` | 14/08 14:33 | Corr #9-fin/#14.3/#14.4/#14.6 : COUNT SQL, Promise.all, filtres statut | Aucun |
| 19 | `5024e5c` | 14/08 14:34 | Corr #10b : essai expiré vérifié en temps réel | Aucun |
| 20 | `16b4e0a` | 14/08 14:36 | Corr #11 : flux suppression de compte (dashboard + admin) | ⚠️ Requiert migration 016 |
| 21 | `0e61cec` | 14/08 14:37 | Corr #12 : magic bytes + try/catch R2 + suppression ancienne clé | Aucun |
| 22 | `d296223` | 14/08 14:39 | Corr #14.2 : anti-N+1 stats cron + paiements admin | Aucun |
| 23 | `3784823` | 14/08 14:41 | Docs session 3 : audit-3 + audit-4 + CHANGELOG + IMPACT + SECURITE | Aucun |
| 24 | `a2d4d16` | 14/08 14:53 | Merge PR #1 fix/audit-session-3 | Aucun |
| 25 | `8292ae2` | 14/08 18:18 | Fusion 7→5 crons (limite plan Free) dans `api-cron.ts` | ⚠️ Redéployer |
| 26 | `b3371e1` | 14/08 18:19 | Triggers cron correspondants `wrangler.jsonc` | ⚠️ Redéployer |
| 27 | `ec9a404` | 14/08 19:03 | Corr #8b complété + rapport session 4 | Aucun |
| 28 | `9b14b6c` | 15/08 03:27 | Session 5 : B-ADPAY-01..05 (catch invalide, race, UUID) | Aucun |
| 29 | `84148a9` | 15/08 03:29 | Session 5 : B-DASH-01..09 + B-AUTH-03/04 (vérif rows, rollback register) | Aucun |
| 30 | `edbc3fa` | 15/08 03:30 | Session 5 : B-CMD-01..03 (admin client, doc duplication, RPC race) | ⚠️ Requiert migration 017 |
| 31 | `4230528` | 15/08 03:31 | Session 5 : B-LIV/TEN/BLOG-01..02 (try/catch, QR, UUID, 404) | Aucun |
| 32 | `cdf59d8` | 15/08 03:31 | Session 5 : B-PAY-01 (vérif rows GET /reference) | Aucun |
| 33 | `905ed9f` | 15/08 03:44 | Session 5 : B-FRONT-01 (escHtml upData.url) | Aucun |
| 34 | `ad02220` | 15/08 03:46 | Session 5 : B8 consolidation validerMimeImage en `lib/validation.ts` | Aucun |
| 35 | `97975fa` | 15/08 03:48 | Session 5 : B1/B7/B-PAY-02 (R2 cleanup auto, pagination menu, Promise.all) | Aucun |
| 36 | `2bd6784` | 15/08 03:49 | Session 5 : B2/B4 (R2 suppression compte, notif admin demande) | Aucun |
| 37 | `3b3fe5a` | 15/08 03:50 | Session 5 : B5 — email confirmation annulation suppression | Aucun |
| 38 | `c48b2d5` | 15/08 03:51 | Session 5 : B3/B6 — email+notif expiration + KV anti-doublon rappels | Aucun |
| 39 | `d6faefd` | 15/08 03:54 | Rapport session 5 (28 corrections) | Aucun |
| 40 | `868ac50` | 15/08 04:25 | Contre-audit session 5 (30 points, 26 conformes) | Aucun |
| 41 | `9955d50` | 15/08 04:49 | **Migration 017** + garde atomique RPC (`api-commandes.ts`) | ⚠️ Appliquer 017 |
| 42 | `219a52a` | 15/08 04:49 | C2 : vérif lignes dans /rejeter | Aucun |
| 43 | `817d973` | 15/08 04:51 | C3 : commentaire Promise.all corrigé | Aucun |
| 44 | `f460517` | 15/08 04:51 | C4 : escHtml seconde occurrence ligne 1044 | Aucun |
| 45 | `86c3bf0` | 15/08 04:53 | C5 : notif admin déplacée dans /confirmer-suppression | Aucun |
| 46 | `01c6760` | 15/08 04:56 | Rapport session 6 (5 corrections) | Aucun |
| 47 | `fd07054` | 16/08 00:40 | **Migration 018** : drop policy RLS trop permissive | ⚠️ Appliquer 018 |
| 48 | `9d72756` | 16/08 00:44 | A-3 : tenant depuis slug, plus de body.tenant_id | ⚠️ Mettre à jour app mobile |
| 49 | `1a16ecd` | 16/08 00:45 | A-4 : révocation sessions après change-password | Aucun |
| 50 | `1b75be0` | 16/08 00:46 | A-5 : nonces CSP activés | Aucun |
| 51 | `48a20cb` | 16/08 00:47 | A-6 : CORS workers.dev URL exacte | Aucun |
| 52 | `ca148b3` | 16/08 00:47 | A-7 : timingSafeEqual secrets admin | Aucun |
| 53 | `8f156c8` | 16/08 00:48 | A-9 : rate limiting export CSV 10/h | Aucun |
| 54 | `e76fb82` | 16/08 00:48 | A-10 : timeout 8s Brevo | Aucun |
| 55 | `8c0e1ad` | 16/08 00:48 | A-11 : middleware ADMIN_EMAILS blog | ⚠️ Créer secret ADMIN_EMAILS |
| 56 | `e7580af` | 16/08 00:49 | B-6 : KV_CACHE sur les 6 checkRateLimit api-auth | ⚠️ Requiert namespace KV |
| 57 | `58528bd` | 16/08 00:58 | A-8 : hashSessionKey SHA-256 | Aucun |
| 58 | `5db05bc` | 16/08 01:01 | Rapport session 7 | Aucun |
| 59 | `60a7e57` | 16/08 01:54 | Audit bugs logiques et écritures silencieuses | Aucun |
| 60 | `7914589` | 16/08 02:17 | Rapport sécurité #3 (23 findings, 3 critiques) | Aucun |
| 61 | `b458375` | 16/08 15:19 | A-03 : binding KV_CACHE dans wrangler.jsonc | ⚠️ Redéployer + lier namespace |
| 62 | `8beb47d` | 16/08 15:21 | BUG-14 P0 : suppression singleton Supabase (cause du bug login) | ⚠️ Redéployer |
| 63 | `e088b9b` | 16/08 15:22 | S9-03 : timeout 15s thum.io | Aucun |
| 64 | `50444cc` | 16/08 15:22 | BUG-13 P1 : setMonth débordement + réabonnement anticipé | Aucun |
| 65 | `b8d6da7` | 16/08 15:23 | BUG-06/S7-04/S2-05 : cron statuts, rate limit conditionnel, tenant bloqué | Aucun |
| 66 | `72d1377` | 16/08 15:24 | S2-02 : retrait notes/metadata du suivi public | Aucun |
| 67 | `6353bed` | 16/08 15:24 | BUG-01/02 : middleware ADMIN_EMAILS en tête + validation UUID DELETE | ⚠️ Créer secret ADMIN_EMAILS |
| 68 | `08c4bbc` | 16/08 15:25 | BUG-16/S1-05 : adminClient lookup tenant + tokens hors body | Aucun |
| 69 | `8ff0346` | 16/08 15:27 | Rapport session 8 (8 corrections) | Aucun |
| 70 | `e97ad88` | 16/08 15:36 | KV_CACHE : ID réel `21083c6b...` dans wrangler.jsonc | ⚠️ Vérifier existence namespace |
| 71 | `3dd3ccc` | 16/08 15:38 | P4 : checkRateLimit KV commandes+promo, timingSafeEqual, rate limit suppressions | ⚠️ Requiert namespace KV |
| 72 | `90741d8` | 16/08 15:40 | P5 : 404 newsletter inexistante + vérif rows PATCH | Aucun |
| 73 | `c9a892d` | 16/08 15:41 | P5 : vérif lignes crons + UUID /preuve/:id | Aucun |
| 74 | `0605e9c` | 16/08 15:43 | P6 : rollback register Auth, batch paiements, Content-Length | Aucun |
| 75 | `ea4e3c4` | 16/08 15:44 | P6 : export CSV limit 1000 | Aucun |
| 76 | `986481b` | 16/08 15:45 | Rapport session 9 (14 corrections) | Aucun |
| 77 | `db193c0` | 16/08 15:57 | P3/S5-01/02 : COOP/COEP, retrait X-XSS-Protection | Aucun |
| 78 | `518bda3` | 16/08 15:58 | P3/BUG-10 : escHtml tenant.nom confirmer-suppression | Aucun |
| 79 | `fc76fab` | 16/08 15:59 | P3/S3-03 : neutralisation injection CSV (2 exports) | Aucun |
| 80 | `cb4fad3` | 16/08 16:00 | Rapport session 10 (3 corrections P3) | Aucun |
| 81 | `b3e07ac` | 16/08 16:05 | P2/S1-03 : nouveau mdp ≠ ancien sur /reset-password | Aucun |
| 82 | `783a0ac` | 16/08 16:07 | P2/S1-04 : CSRF double-submit cookie + dashFetch | Aucun |
| 83 | `f8ff7b0` | 16/08 16:09 | P2/S2-03 : auth admin dual-path (secret OU JWT+table admins) | Aucun |
| 84 | `381b470` | 16/08 16:10 | P6/S9-05 : cache KV sitemap.xml TTL 1h | Aucun |
| 85 | `f89c4fa` | 16/08 16:10 | P6/A-04 : validerMimeImage → validerMimeImageUnifie | Aucun |
| 86 | `fc2eb98` | 16/08 16:11 | P6/A-05 : `lib/constants.ts` (statuts + rate limits centralisés) | Aucun |
| 87 | `c81f897` | 16/08 16:11 | Renommage 013→014 (conflit numérotation) | ⚠️ Vérifier ordre des migrations |
| 88 | `951cded` | 16/08 16:12 | P7/S5-03 + ADMIN_EMAILS : CORS localhost conditionnel + type Env | ⚠️ Créer secret ADMIN_EMAILS |
| 89 | `ad8bfe2` | 16/08 16:28 | R3 : création `src/lib/auth.ts` (centralisation auth) | Aucun |
| 90 | `fa87f11` | 16/08 16:28 | R3 : suppression fonctions auth locales | Aucun |
| 91 | `eaf038b` | 16/08 16:30 | A-08 : factorisation PATCH /commandes/:id/statut en `lib/commandes.ts` | Aucun |
| 92 | `4103237` | 16/08 17:12 | S6-02+A-05 : detail conditionnel + ESSAI_DUREE_JOURS=14 | Aucun |
| 93 | `5145fdb` | 16/08 17:14 | S6-03 : SRI integrity sur 5 scripts CDN | Aucun |
| 94 | `e15d490` | 16/08 17:22 | S3-02 : nonces CSP injectés dans 11 routes SSR | Aucun |
| 95 | `3471516` | 16/08 17:38 | TS batch1 (security/boutique/legal/api-blog) | Aucun |
| 96 | `cb9c086` | 16/08 17:39 | TS batch2-partial (Promise.resolve inserts) | Aucun |
| 97 | `d2ed703` | 16/08 17:40 | TS batch2-cron (dateStr, try/catch cron) | Aucun |
| 98 | `5158d25` | 16/08 17:41 | TS batch3 (BREVO_API_KEY_* optionnelles) | ⚠️ Vérifier secrets Brevo présents |
| 99 | `2dfaa99` | 16/08 17:58 | RÉGRESSION fix : unsafe-inline conservé + COEP retiré | Aucun |
| 100 | `a4d2a0c` | 16/08 18:05 | TS batch3-suite (initKeys ?? '') | ⚠️ Vérifier secrets Brevo présents |
| 101 | `86edbb2` | 16/08 18:07 | TS batch4 (admin-paiements + dashboard, 0 erreur tsc) | Aucun |
| 102 | `dfa747a` | 16/08 19:24 | CSP-BUG : nonce footer + handlers login/register | Aucun |
| 103 | `28d8362` | 16/08 19:28 | CSP-BUG : contact/inscription/forgot-password | Aucun |
| 104 | `3cff1ab` | 17/08 02:14 | CSP dashboard : 8 onclick SSR → addEventListener | Aucun |
| 105 | `b94efed` | 17/08 02:14 | Sélecteur filtrerCommandes → data-statut | Aucun |
| 106 | `39770b3` | 17/08 02:16 | Rapport FIX-DASHBOARD-BLOQUE | Aucun |
| 107 | `6552475` | 17/08 03:13 | CSP dashboard.js : 63 handlers inline → data-action + dispatcher | Aucun |
| 108 | `b54d054` | 17/08 03:25 | CSP : paiement/boutique/notifications.js — zéro handler | Aucun |
| 109 | `d8b9c53` | 17/08 03:30 | CSP : bienvenue.ts (13 handlers) | Aucun |
| 110 | `cf7c7c3` | 17/08 03:31 | CSP : boutique.ts (9 handlers) | Aucun |
| 111 | `d8c8db4` | 17/08 03:32 | CSP : tarifs.ts (5 handlers + FAQ) | Aucun |
| 112 | `9a94c93` | 17/08 03:33 | CSP : blog.ts (2 handlers) | Aucun |
| 113 | `b63f522` | 17/08 03:34 | CSP : cookies.ts + legal.ts | Aucun |
| 114 | `749c171` | 17/08 03:35 | CSP : suivi.ts | Aucun |
| 115 | `bf4753e` | 17/08 03:35 | CSP : footer.ts (newsletter + cookies) | Aucun |
| 116 | `4b8cdfd` | 17/08 03:36 | Rapport FIX-CSP-EXHAUSTIF (migration complète 0 handler inline) | Aucun |
| 117 | `88f53b8` | 17/08 18:36 | CSP : onerror inline loadQRCode → assignation JS | Aucun |
| 118 | `2680920` | 17/08 18:36 | BUG-LIVREUR-PATCH : vérif lignes + maybeSingle | Aucun |
| 119 | `b2abee6` | 17/08 18:38 | Rapport audit exhaustif session 17 | Aucun |
| 120 | `79d25fa` | 17/08 18:59 | Contre-audit complet 19h54 | Aucun |
| 121 | `a93f158` | 17/08 21:17 | **Suppléments généraux complets + migration 019** | ⚠️ Appliquer 019 + redéployer |
| 122 | `3c0bb40` | 17/08 21:22 | Rapport suppléments + guide API Flutter (`docs/API-SUPPLEMENTS.md`) | Aucun |
| 123 | `6eef0e1` | 17/08 21:51 | Audit exhaustif sécurité : 37 anomalies, score 48/100 | Aucun |
| 124 | `fb6bb96` | 17/08 22:32 | **Conception système centralisé des plans** (aucun code modifié) | ⚠️ Trancher 4 points ouverts |

---

## 9. Annexe B — Avertissement de sécurité

Un token GitHub personnel et la configuration de votre infrastructure (IDs de namespace, URLs workers.dev) circulent dans cette session. Deux actions sont recommandées :

1. **Révoquer le token GitHub** partagé dans la session précédente sur [github.com/settings/tokens](https://github.com/settings/tokens) et en générer un nouveau à usage unique.
2. Ne jamais committer `.env`, `.dev.vars` ou les secrets Cloudflare — le `.gitignore` du dépôt est correct, mais vérifiez que `wrangler secret put` a bien été utilisé (et non des valeurs en clair dans `wrangler.jsonc`).

---

*Rapport produit le 2026-08-18 — audit de la plage `50add04` → `fb6bb96` (123 commits) du dépôt poodasamuelpro/monmenu. Sources : historique git, rapports de sessions 3→11, audits du 13/08→17/08, fichiers de migration SQL et configuration wrangler.jsonc du dépôt.*
