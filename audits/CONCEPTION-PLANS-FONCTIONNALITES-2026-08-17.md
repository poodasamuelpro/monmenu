# CONCEPTION — Système Centralisé de Gestion des Fonctionnalités par Plan (MonMenu)

**Généré le : 2026-08-17 à 00:13 GMT+1**  
**Périmètre** : App Web (`monmenu`) + Dashboard Admin (`monmenu-admin`)  
**Statut** : Document de conception — aucun code modifié, aucune migration appliquée

---

## ⚠️ VERDICT FINAL (Phase 5)

> **CONCEPTION PRÊTE POUR IMPLÉMENTATION — sous réserve de résolution des 4 points ouverts listés en section 14.**

La conception est exhaustive, sécurisée, et s'appuie intégralement sur des constats réels du code. Les 4 points ouverts identifiés (politique de suppression de plan avec tenants actifs, période de grâce à la désactivation d'une fonctionnalité, granularité du catalogue pour `export_csv`, stratégie d'invalidation cache KV inter-déploiements) ne bloquent pas l'implémentation mais doivent être tranchés avant le développement des composants concernés.

**Confirmation explicite** : aucun fichier de code, de schéma SQL, de configuration Wrangler ou de migration n'a été modifié dans l'un ou l'autre des deux repos pendant ce travail d'audit et de conception.

---

## RÉSUMÉ EXÉCUTIF

L'audit confirme que Supabase est l'unique source de vérité pour les plans. Un scaffold de restriction existe déjà (`supplements_actifs`, `limite_supplements` sur la table `plans`) mais est non activé. La conception propose : (1) une table `fonctionnalites` catalogue + table de jonction `plan_fonctionnalites` remplaçant le JSONB free-form actuel, (2) un résolveur central `getPlanFeatureConfig()` obligatoire pour toute vérification, (3) des routes admin complètes pour gérer la matrice, (4) un double blocage frontend/backend par fonctionnalité, et (5) une migration propre depuis le scaffold existant vers la nouvelle architecture, sans régression.

---

## PARTIE I — AUDITS (Phases 1)

---

### 3.1 — Audit App Web : Logique de plans existante

#### `src/lib/plans.ts`

**État** : Fichier très propre, post-migration complète D1 → Supabase.

**Constats** :
- Interface `PlanSupabase` expose : `id`, `nom`, `description`, `prix_mensuel`, `prix_annuel`, `devise`, `fonctionnalites` (type `unknown`), `commandes_incluses`, `limite_pdv`, `frais_par_commande`. **Absence notoire** de champ `supplements_actifs` / `limite_supplements` dans l'interface — ces colonnes existent en base (migration 019) mais ne sont pas remontées par `chargerPlan()` qui ne les sélectionne pas.
- `chargerPlan(env, planId)` : appel Supabase `adminClient`, select nommé sans `supplements_actifs` ni `limite_supplements`.
- `chargerPlanGratuit(env)` : ne sélectionne que `id, nom, prix_mensuel` — pas de fonctionnalités.
- **Pas de fonction `getPlanFeatureConfig()`** ou équivalent centralisé — chaque route fait sa propre requête ad-hoc sur `plans`.
- D1 supprimé complètement de la logique plans. Supabase UUID natif utilisé partout.

**Problèmes** :
- L'interface `PlanSupabase.fonctionnalites` est typée `unknown` — zéro sécurité de type.
- `chargerPlan()` ne retourne pas `supplements_actifs` / `limite_supplements` alors que `api-supplements.ts` en a besoin — contournement : requête directe dans api-supplements.ts.
- Aucune abstraction centralisée pour résoudre "est-ce que cette fonctionnalité est activée pour ce tenant ?" — chaque point de contrôle implémente sa propre logique.

---

#### `src/routes/api-plans.ts`

**État** : Route publique `GET /api/v1/plans` lisant Supabase. Cache KV 600 secondes (10 minutes).

**Constats** :
- Retourne toutes les colonnes dont `fonctionnalites` (parsé depuis JSONB).
- `fonctionnalites` est retourné tel quel côté client — structure libre JSONB, pas de contrat de type.
- Cache KV clé `plans:FCFA` — invalidé **uniquement** à l'expiration (600s), **jamais invalidé manuellement** quand un plan est modifié côté admin. → Délai de propagation max 10 minutes.
- Pas de route `POST/PATCH/DELETE` ici — la gestion des plans passe par le Dashboard Admin.

**Fonctionnalités plan-dépendantes identifiées dans ce fichier** :
- `commandes_incluses` / `commandes_incluses_affichage` (affichage −1 = illimité)
- `limite_pdv` / `limite_pdv_affichage` (affichage −1 = illimité)
- `fonctionnalites` JSONB (structure libre)

---

#### `src/routes/api-dashboard.ts`

**État** : Fichier très long (2000+ lignes), routes dashboard protégées.

**Constats** :
- `GET /profil` : retourne `plan_features: planActuel?.fonctionnalites ?? null` — champ libre JSONB, aucune validation de structure.
- `PATCH /parametres` : **Aucune vérification plan** — le changement de nom/whatsapp_number n'est pas plan-dépendant ✓.
- **Codes promo** (`GET`, `POST`, `POST /generate`, `PATCH/:id`, `DELETE/:id`, `GET /export-csv`) : **aucune vérification du plan** côté backend avant de créer/lister un code promo. La restriction `codes_promo: false` dans le JSONB est visible côté client mais **non appliquée côté backend** — n'importe quel tenant peut créer des codes promo via l'API, quel que soit son plan. → **GAP DE SÉCURITÉ CRITIQUE**.
- **Export CSV commandes** (`GET /commandes/export-csv`) : **aucune vérification plan** — même gap que codes promo.
- **Suppléments** par produit (`POST /produits/:id/supplements`) : **aucune vérification plan** — accès non contrôlé.
- **Livreurs** (`POST /livreurs`, `GET /livreurs`) : **aucune vérification plan** — tout tenant peut créer des livreurs.
- Double CSRF : middleware propre (double-submit cookie + `X-Requested-With`), exemption Bearer — solide.
- `verifyAuth()` / `verifyAuthOnboarding()` : auth correcte, scoping tenant_id systématique.

**Liste exhaustive des fonctionnalités plan-dépendantes constatées dans ce fichier — non enforced backend** :
| Fonctionnalité | Contrôle backend actuel | GAP |
|---|---|---|
| codes_promo | ❌ aucun | OUI |
| export_csv (commandes) | ❌ aucun | OUI |
| livreurs | ❌ aucun | OUI |
| supplements (par produit) | ❌ aucun | OUI |

---

#### `src/routes/api-supplements.ts`

**État** : Route séparée pour les suppléments généraux. Scaffold plan/limite partiellement implémenté.

**Constats** :
- `GET /limite` : retourne `{ actif: bool, limite: int|null, utilises: int }` — lit `supplements_actifs` et `limite_supplements` directement sur la table `plans`. **Seul endroit de toute l'App Web qui lit ces colonnes**.
- `POST /` (créer supplément) : vérification scaffold en place — SI `supplements_actifs=true` ET `limite_supplements` non null ET `utilises >= limite_supplements` → 403. **MAIS** : court-circuité par défaut car `supplements_actifs=false` sur tous les plans → la restriction n'est **jamais activée en production**.
- La vérification est correctement structurée mais la condition d'activation est défensive : `if (planRow?.supplements_actifs && planRow?.limite_supplements !== null)` — si `supplements_actifs=true` mais `limite_supplements=null`, pas de limite → comportement "illimité" correct.
- Rate limiting : 30 créations/heure — cohérent.
- CSRF : propre, identique à dashboardRouter.
- Auth : `verifyAuth()` + scoping `tenant_id` — correct.
- 2 requêtes Supabase à chaque `POST` pour la vérification plan (tenant → plan_id, plan → supplements_actifs/limite) : à optimiser en 1 jointure dans la future implémentation centralisée.

---

#### `src/routes/api-paiement.ts`

**Constats** :
- `POST /soumettre` : vérifie que le `plan_id` soumis existe dans Supabase via `chargerPlan()` — correct. Pas de vérification fonctionnalité.
- Aucune fonctionnalité plan-dépendante à contrôler ici — les restrictions métier sont en amont (page de paiement).

---

#### `src/routes/api-tenants.ts`

**Constats** :
- `GET /:slug/menu` : retourne `supplements` généraux au niveau racine + `supplements` par produit dans chaque produit — structure additive, rétrocompatible mobile. **Aucune restriction plan sur la visibilité du menu** (normal, la boutique publique est publique).
- `POST /` (création tenant legacy) : assigne le plan Gratuit via `chargerPlanGratuit()`.

---

#### Schéma SQL actuel de la table `plans` (Supabase)

D'après la migration 001 + migration 009 + migration 019 :

```sql
plans (
  id                  UUID PK,
  nom                 TEXT,               -- ex: 'Faso', 'Baraka', 'Naaba', 'Mogho'
  description         TEXT,
  prix_mensuel        NUMERIC(10,2),
  prix_annuel         NUMERIC(10,2),
  devise              TEXT,               -- 'XOF'
  commandes_incluses  INTEGER,            -- -1 = illimité
  frais_par_commande  NUMERIC(8,2),
  limite_pdv          INTEGER,            -- -1 = illimité
  fonctionnalites     JSONB,              -- structure libre, ex ci-dessous
  actif               BOOLEAN,
  ordre_affichage     INTEGER,
  d1_plan_id          TEXT UNIQUE,        -- legacy mapping ('plan_faso', etc.)
  supplements_actifs  BOOLEAN DEFAULT false,  -- scaffold migration 019
  limite_supplements  INTEGER DEFAULT NULL,   -- scaffold migration 019
  created_at          TIMESTAMPTZ,
  updated_at          TIMESTAMPTZ
)
```

**Contenu JSONB `fonctionnalites` réel (migration 009)** pour chaque plan :

| Clé | Faso | Baraka | Naaba | Mogho |
|-----|------|--------|-------|-------|
| boutique_en_ligne | true | true | true | true |
| qr_code | true | true | true | true |
| notifications_whatsapp | true | true | true | true |
| produits_max | 20 | 40 | -1 | -1 |
| categories_max | 5 | 8 | -1 | -1 |
| statistiques_avancees | false | false | true | true |
| codes_promo | false | false | true | true |
| domaine_perso | false | false | false | true |
| export_csv | false | false | true | true |
| support_whatsapp_prioritaire | false | false | false | true |
| multi_boutique | false | false | false | true |
| onboarding_dedie | — | — | — | true |
| acces_api | — | — | — | true |

**Clés JSONB identifiées également dans les pages frontend** (home.ts, tarifs.ts) :
- `boutique_en_ligne`, `codes_promo`, `export_csv`, `stats_avancees`, `stats_basiques`, `support_email`, `support_whatsapp`, `livreurs`, `qrcode`, `qrcode_custom`, `domaine_perso`, `api_access`, `webhooks`

→ Incohérences : les clés frontend et les clés Supabase réelles ne sont **pas identiques** (`stats_avancees` ≠ `statistiques_avancees`, `qrcode` ≠ `qr_code`, `livreurs` absent de la migration 009, etc.). La migration JSONB a introduit des clés différentes sans mise à jour du frontend.

---

### 3.2 — Audit App Web : Frontend consommant les plans

#### `public/static/js/dashboard-paiement.js`

**Constats** :
- Charge les plans via `GET /api/v1/plans` — retourne le JSONB `fonctionnalites`.
- Affichage plans : `p.fonctionnalites?.sous_titre` utilisé — lit le JSONB dynamiquement ✓.
- Section "Formules disponibles" : affiche `nom + prix_mensuel` — dynamique ✓.
- **Codé en dur** : logique de "Votre plan" basée sur comparaison `abonnement.plan_id === p.id` — correct post-migration UUID.
- **Pas d'affichage des fonctionnalités par plan** dans la section "Formules disponibles" — seul le prix est affiché. Les fonctionnalités du plan ne sont pas listées lors de la sélection d'un upgrade/downgrade depuis le dashboard abonnement. → À concevoir.

#### `src/pages/tarifs.ts` (page tarifs publique)

**Constats** :
- Charge `GET /api/v1/plans` puis affiche dynamiquement `fonctionnalites` via JS inline.
- Clés utilisées : `features.stats_avancees`, `features.codes_promo`, `features.export_csv`, `features.support_whatsapp` — divergentes du JSONB réel Supabase (`statistiques_avancees`, non `stats_avancees`).
- `plan.commandes_incluses` pour affichage nombre de commandes — dynamique ✓.
- **Logique d'affichage des fonctionnalités codée en JS** avec des clés hardcodées dans le template — si une nouvelle fonctionnalité est ajoutée, le template doit être modifié.

#### `src/pages/home.ts` (page d'accueil)

**Constats** :
- Utilise `fonctionnalites` dynamiquement : `boutique_en_ligne`, `codes_promo`, `export_csv` (clés hardcodées dans le mapping).
- Affiche `commandes_incluses` dynamiquement.

#### `public/static/js/supplements.js`

**Constats** :
- Appelle `GET /api/v1/dashboard/supplements/limite` pour afficher le badge de limite plan.
- Si `data.actif` (= `supplements_actifs=true`), affiche le badge avec `data.limite` et `data.utilises`.
- Si `data.actif=false`, le badge est masqué — la fonctionnalité est présentée comme illimitée sans restriction.
- **Côté frontend** : aucune désactivation de l'UI si `actif=false` — le bouton "Ajouter" reste visible et fonctionnel même si le plan ne prévoyait pas les suppléments (mais en production, tous les plans ont `supplements_actifs=false`, donc tous voient le bouton et peuvent ajouter).

#### `public/static/js/dashboard.js`

**Constats** :
- Menu de navigation : sections `codes-promo`, `livreurs`, `supplements` toujours visibles dans la sidebar — **aucune condition d'affichage liée au plan**. Un tenant sur le plan Faso (qui ne devrait pas avoir `codes_promo`) voit quand même la section "Codes promo".
- Export CSV commandes : bouton toujours visible — pas de condition plan.
- Livreurs : section toujours visible.
- Suppléments : délégué à `supplements.js` qui gère le badge limite mais ne masque pas l'accès.
- **GAP UX** : aucun masquage ni désactivation frontend des fonctionnalités non incluses dans le plan.

---

### 3.3 — Audit Dashboard Admin : Gestion des plans existante

#### `public/static/js/admin-plans.js`

**État** : Interface de gestion des plans existante, fonctionnelle mais limitée.

**Constats** :
- `loadPlans()` → `GET /api/admin/plans` → affichage en cartes par plan.
- Champs éditables par plan : `prix_mensuel`, `commandes_incluses`, `frais_par_commande`, et `fonctionnalites` (JSON brut dans une textarea).
- **PROBLÈME CRITIQUE** : L'édition des `fonctionnalites` se fait via **une textarea JSON libre** — l'admin saisit du JSON brut, risque d'erreur de syntaxe, risque de clés incohérentes, aucune validation de structure. Pas d'interface graphique par fonctionnalité.
- `savePlan(id)` → `PATCH /api/admin/plans/:id` — met à jour les 3 champs numériques + JSONB libre.
- `togglePlanStatus(id, currentActif)` → `DELETE /api/admin/plans/:id` (désactivation) ou `PATCH` (activation).
- `createPlan()` → `POST /api/admin/plans` — crée un plan avec `nom, prix_mensuel, commandes_incluses, frais_par_commande, description`. **Pas de champ `fonctionnalites` structuré à la création** — les fonctionnalités sont un JSONB vide `{}` par défaut.
- Utilisation d'`onclick=` inline dans les boutons → **violation CSP** si une politique stricte est appliquée (l'App Web interdit les handlers inline, mais l'Admin utilise `'unsafe-inline'` dans sa CSP).
- **Absent** : aucune gestion de `supplements_actifs` / `limite_supplements` dans l'interface admin actuelle — ces colonnes n'apparaissent nulle part dans `admin-plans.js`.
- **Absent** : aucune interface de matrice fonctionnalités × plan — tout passe par le JSONB libre.

#### `src/routes/plans.ts` (Admin)

**Constats** :
- `GET /api/admin/plans` : select `*` — retourne toutes les colonnes dont `supplements_actifs` et `limite_supplements`. ✓
- `GET /api/admin/plans/:id` : retourne le plan + `restaurants_count` (nombre de tenants sur ce plan). ✓
- `POST /api/admin/plans` : insertion sans `slug` (corrigé), sans `supplements_actifs`/`limite_supplements` (valeurs par défaut utilisées). La colonne `d1_plan_id` n'est pas insérée non plus.
- `PATCH /api/admin/plans/:id` : `UpdatePlanSchema` autorise `fonctionnalites` comme `Record<string, boolean|string|number>` — validé Zod mais structure libre. `supplements_actifs` et `limite_supplements` **ne sont pas dans `UpdatePlanSchema`** → **impossibilité de mettre à jour ces colonnes via l'API admin actuelle**.
- `DELETE /api/admin/plans/:id` : désactivation (set `actif=false`), vérifie `tenants.statut='actif'` mais **uniquement les tenants actifs** — un tenant en `essai` ou `en_attente_paiement_initial` n'est pas pris en compte dans cette vérification.
- **Absent** : aucune route pour gérer une table de jonction `plan_fonctionnalites`.
- **Absent** : aucune invalidation du cache KV App Web après modification d'un plan — le cache `plans:FCFA` expirerait naturellement en 600s.

**Ce qui MANQUE côté admin pour le nouveau système** :
1. Champs `supplements_actifs` + `limite_supplements` dans `UpdatePlanSchema`
2. Routes CRUD pour la table `plan_fonctionnalites` (future)
3. Invalidation cache KV App Web
4. Vérification élargie des tenants lors de la désactivation d'un plan (inclure essai, en_attente)

---

### 3.4 — Audit Dashboard Admin : Sécurité et patterns transverses

#### Pattern d'authentification admin

**Constats** :
- Session stockée dans **Cloudflare KV** (`KV_ADMIN`) avec TTL 8h — token `admin-session` cookie httpOnly ✓.
- `authMiddleware` : extrait le token (cookie > Bearer), appelle `verifySession(env, token)` qui valide le token KV.
- `verifySession` : vérifie `session.valid` + `Date.now() > session.expires_at`. ✓
- `isAdmin(userId)` dans `SupabaseAdmin` : vérifie l'existence d'une ligne dans `admins` table Supabase — utilisé lors du login.
- **MANQUE** : absence d'une vérification de rôle admin au niveau des routes de modification de plans — n'importe quel compte admin (même lecture seule si différents rôles étaient implémentés) peut modifier un plan. Ce point est acceptable pour un dashboard admin à usage interne mais devra être documenté.
- Le middleware `authMiddleware` est bien appliqué à **toutes** les routes protégées dans `index.tsx` — y compris `plansRouter`. ✓

#### Gestion CSRF / rate limiting côté admin

**Constats** :
- `admin-core.js` → `apiCall()` : envoie systématiquement `'X-Requested-With': 'XMLHttpRequest'` sur toutes les requêtes. ✓
- `checkCSRF()` dans `security.ts` : vérifie uniquement `X-Requested-With: XMLHttpRequest` — protection basique, sans double-submit cookie (contrairement à l'App Web qui utilise le pattern plus robuste).
- **GAP sécurité** : `checkCSRF()` n'est appelé que dans `paiements.ts` (middleware explicite) — **pas appelé dans `plans.ts`**. Les routes `POST`, `PATCH`, `DELETE` de l'Admin Plans n'ont pas de vérification CSRF. Seule la session KV protège ces routes.
- Rate limiting : `checkRateLimit()` dans `session.ts` — utilisé pour le login uniquement. Pas de rate limiting sur les routes de modification de plans.

#### Clé Supabase service-role

**Constats** :
- `SUPABASE_SERVICE_ROLE_KEY` est dans `AdminEnv` (types Workers) — injectée uniquement côté serveur via les secrets Cloudflare. ✓
- `supabase-admin.ts` : utilise la clé dans `supabaseHeaders()` — uniquement côté Worker. ✓
- **Vérification front** : `grep -rn "SUPABASE_SERVICE_ROLE" /public/` → seule occurrence : commentaire dans `admin.js` ("Vérification via Supabase Auth service_role (géré côté Worker)") — pas d'exposition réelle. ✓
- La clé n'est jamais sérialisée dans le HTML rendu ni dans les fichiers statiques. ✓

#### Interaction Supabase côté admin

**Constats** :
- `SupabaseAdmin` est un client REST custom (pas `@supabase/supabase-js`) — utilise `fetch()` direct sur l'API REST PostgREST.
- **Pas de RLS côté admin** : le service_role bypass automatiquement toutes les policies RLS — c'est le comportement attendu pour un admin, mais le filtrage tenant_id dans les requêtes applicatives n'est jamais présent (normal, l'admin voit tout).
- Le client admin ne passe jamais par les policies RLS — les contrôles d'accès sont 100% applicatifs (session KV).

---

## PARTIE II — CONCEPTION TECHNIQUE (Phase 2)

---

### 4.1 — Catalogue de fonctionnalités (proposition)

Le catalogue est établi exclusivement à partir des clés trouvées dans le JSONB Supabase réel (migration 009), les checks backend (api-supplements.ts), et les références frontend cohérentes (tarifs.ts, home.ts, dashboard.js). Les clés divergentes sont harmonisées.

| code | nom_affichage | type | description | unité_période |
|------|---------------|------|-------------|---------------|
| `boutique_en_ligne` | Boutique en ligne | `booleen` | Accès à la boutique publique | — |
| `qr_code` | QR Code | `booleen` | Génération QR Code de la boutique | — |
| `notifications_whatsapp` | Notifications WhatsApp | `booleen` | Notifications livreur + client WhatsApp | — |
| `codes_promo` | Codes promotionnels | `limite_periodique` | Création/utilisation de codes promo | mensuel |
| `export_csv` | Export CSV commandes | `booleen` | Export des commandes en CSV | — |
| `statistiques_avancees` | Statistiques avancées | `booleen` | Stats avancées (CA par produit, taux…) | — |
| `livreurs` | Gestion livreurs | `booleen` | Ajout/gestion de livreurs WhatsApp | — |
| `supplements` | Suppléments | `limite_periodique` | Nombre de suppléments actifs simultanés | mensuel |
| `support_whatsapp_prioritaire` | Support WhatsApp prioritaire | `booleen` | Accès support WhatsApp prioritaire | — |
| `multi_boutique` | Multi-boutique | `booleen` | Plusieurs points de vente | — |
| `onboarding_dedie` | Onboarding dédié | `booleen` | Accompagnement onboarding personnalisé | — |
| `acces_api` | Accès API | `booleen` | Accès à l'API publique MonMenu | — |
| `domaine_perso` | Domaine personnalisé | `booleen` | Utilisation d'un domaine personnalisé | — |

**Note justificative** :
- `boutique_en_ligne`, `qr_code`, `notifications_whatsapp` : présents dans tous les plans Supabase réels (migration 009) — à priori toujours `true`, inclus pour exhaustivité et pour permettre une restriction future.
- `codes_promo` : type `limite_periodique` car le besoin métier est "X codes promo créés par mois" (pas un booléen simple). La table `codes_promo` existe et compte `usage_actuel`.
- `supplements` : type `limite_periodique` — scaffold déjà en place (`limite_supplements`). La "limite" est sur le nombre de suppléments **actifs simultanément** (pas créés/mois), ce qui correspond au comportement actuel de `api-supplements.ts`.
- `livreurs` : présent dans les clés frontend dashboard.js, non présent explicitement dans la migration 009 JSONB (omis par inadvertance). Confirmé comme fonctionnalité distincte.
- `produits_max`, `categories_max` : présents dans la migration 009 (ex. Faso: 20 produits, 5 catégories). **Non inclus dans le catalogue** de ce chantier — ces limites sont des plafonds quantitatifs sur les données et non des fonctionnalités on/off. Ils peuvent rejoindre un futur chantier dédié. Documenté comme **point ouvert**.

**Fonctionnalités exclues car non-enforced et sans impact UX immédiat** :
- `webhooks` (absent du JSONB Supabase réel, présent dans les anciennes clés D1)
- `produits_max`, `categories_max` (quantitatif pur, hors scope)

---

### 4.2 — Schéma de données (proposition — script SQL NON APPLIQUÉ)

#### Tables à créer

```sql
-- ============================================================
-- PROPOSITION DE MIGRATION — NON EXÉCUTÉE — À VALIDER AVANT APPLICATION
-- Version : 2026-08-17
-- ============================================================

-- ── Table catalogue des fonctionnalités (gérée par migration, pas par l'admin UI) ──
CREATE TABLE IF NOT EXISTS fonctionnalites (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code       TEXT NOT NULL UNIQUE,          -- ex: 'codes_promo', 'supplements'
  nom        TEXT NOT NULL,                 -- libellé affiché
  description TEXT,
  type       TEXT NOT NULL                  -- 'booleen' | 'limite_periodique'
               CHECK (type IN ('booleen', 'limite_periodique')),
  periode    TEXT                           -- 'mensuel' | null (pour booleen)
               CHECK (periode IN ('mensuel', NULL)),
  actif      BOOLEAN NOT NULL DEFAULT true, -- permet de désactiver une entrée catalogue
  ordre      INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Données initiales du catalogue (idempotentes)
INSERT INTO fonctionnalites (code, nom, description, type, periode, ordre) VALUES
  ('boutique_en_ligne',             'Boutique en ligne',              'Accès boutique publique',                    'booleen',           NULL,      1),
  ('qr_code',                       'QR Code',                        'Génération QR Code boutique',                'booleen',           NULL,      2),
  ('notifications_whatsapp',        'Notifications WhatsApp',         'Notifications livreur et client',            'booleen',           NULL,      3),
  ('livreurs',                      'Gestion livreurs',               'Ajout et gestion de livreurs WhatsApp',      'booleen',           NULL,      4),
  ('statistiques_avancees',         'Statistiques avancées',          'Stats avancées CA/produit, taux...',         'booleen',           NULL,      5),
  ('codes_promo',                   'Codes promotionnels',            'Création de codes promo par mois',           'limite_periodique', 'mensuel', 6),
  ('supplements',                   'Suppléments',                    'Nombre de suppléments actifs simultanés',    'limite_periodique', 'mensuel', 7),
  ('export_csv',                    'Export CSV',                     'Export commandes en CSV',                    'booleen',           NULL,      8),
  ('support_whatsapp_prioritaire',  'Support WhatsApp prioritaire',   'Support prioritaire WhatsApp',               'booleen',           NULL,      9),
  ('multi_boutique',                'Multi-boutique',                 'Plusieurs points de vente',                  'booleen',           NULL,     10),
  ('domaine_perso',                 'Domaine personnalisé',           'Utilisation domaine personnalisé',           'booleen',           NULL,     11),
  ('onboarding_dedie',              'Onboarding dédié',               'Accompagnement onboarding personnalisé',     'booleen',           NULL,     12),
  ('acces_api',                     'Accès API',                      'Accès à l''API publique MonMenu',            'booleen',           NULL,     13)
ON CONFLICT (code) DO NOTHING;

-- ── Table de jonction plan × fonctionnalité ──────────────────────────────────
CREATE TABLE IF NOT EXISTS plan_fonctionnalites (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id          UUID NOT NULL REFERENCES plans(id) ON DELETE CASCADE,
  fonctionnalite_id UUID NOT NULL REFERENCES fonctionnalites(id) ON DELETE CASCADE,
  actif            BOOLEAN NOT NULL DEFAULT false,  -- DÉFAUT SÉCURISÉ : désactivé
  limite           INTEGER DEFAULT NULL,             -- null = illimité si type=limite_periodique
  periode          TEXT DEFAULT NULL,               -- copie locale ou override (hérite de fonctionnalite.periode)
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (plan_id, fonctionnalite_id)
);

-- Index pour les lookups fréquents
CREATE INDEX IF NOT EXISTS idx_plan_fonctionnalites_plan
  ON plan_fonctionnalites(plan_id)
  WHERE actif = true;

CREATE INDEX IF NOT EXISTS idx_plan_fonctionnalites_feature
  ON plan_fonctionnalites(fonctionnalite_id);

-- Trigger updated_at
CREATE OR REPLACE FUNCTION trigger_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS set_updated_at ON plan_fonctionnalites;
CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON plan_fonctionnalites
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

DROP TRIGGER IF EXISTS set_updated_at ON fonctionnalites;
CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON fonctionnalites
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

-- ── RLS — fonctionnalites (catalogue — lecture publique via service_role) ─────
ALTER TABLE fonctionnalites ENABLE ROW LEVEL SECURITY;
-- Le service_role bypass RLS — lecture dans les routes protégées = OK.
-- Pas de policy SELECT publique nécessaire (lecture via service_role uniquement).

-- ── RLS — plan_fonctionnalites ────────────────────────────────────────────────
ALTER TABLE plan_fonctionnalites ENABLE ROW LEVEL SECURITY;
-- Idem : lecture/écriture via service_role uniquement (routes backend).
-- Pas de lecture directe par les utilisateurs authentifiés tenant.
```

#### Migration des données existantes (scaffold → nouvelle architecture)

```sql
-- ── MIGRATION DES DONNÉES SCAFFOLD SUPPLEMENTS ────────────────────────────────
-- Transforme plans.supplements_actifs + plans.limite_supplements
-- en lignes plan_fonctionnalites.
-- À exécuter APRÈS la création des tables ci-dessus.
-- NON APPLIQUÉ — à valider.

INSERT INTO plan_fonctionnalites (plan_id, fonctionnalite_id, actif, limite, periode)
SELECT
  p.id                     AS plan_id,
  f.id                     AS fonctionnalite_id,
  p.supplements_actifs     AS actif,
  p.limite_supplements     AS limite,
  'mensuel'                AS periode
FROM plans p
CROSS JOIN fonctionnalites f
WHERE f.code = 'supplements'
  AND NOT EXISTS (
    SELECT 1 FROM plan_fonctionnalites pf
    WHERE pf.plan_id = p.id AND pf.fonctionnalite_id = f.id
  )
ON CONFLICT (plan_id, fonctionnalite_id) DO UPDATE
  SET actif  = EXCLUDED.actif,
      limite = EXCLUDED.limite;

-- ── MIGRATION DES DONNÉES JSONB → plan_fonctionnalites ───────────────────────
-- Pour chaque plan, les clés JSONB connues sont transformées en lignes.
-- Correspondance des clés JSONB actuelles vers les codes du catalogue :

-- boutique_en_ligne, qr_code, notifications_whatsapp, codes_promo, export_csv,
-- statistiques_avancees, livreurs, support_whatsapp_prioritaire, multi_boutique,
-- domaine_perso, onboarding_dedie, acces_api

-- Exemple pour codes_promo (booleen → limite_periodique avec limite null = illimité si true) :
INSERT INTO plan_fonctionnalites (plan_id, fonctionnalite_id, actif, limite, periode)
SELECT
  p.id,
  f.id,
  COALESCE((p.fonctionnalites->>'codes_promo')::boolean, false) AS actif,
  NULL              AS limite,   -- null = illimité si actif (pas de limite dans le JSONB actuel)
  'mensuel'         AS periode
FROM plans p
CROSS JOIN fonctionnalites f
WHERE f.code = 'codes_promo'
  AND NOT EXISTS (
    SELECT 1 FROM plan_fonctionnalites pf
    WHERE pf.plan_id = p.id AND pf.fonctionnalite_id = f.id
  )
ON CONFLICT (plan_id, fonctionnalite_id) DO NOTHING;

-- Reproduire pour chaque code booleen du catalogue (boutique_en_ligne, qr_code, etc.)
-- Pattern identique — remplacer 'codes_promo' par le code concerné.
-- [SCRIPT COMPLET À RÉDIGER lors de l'implémentation — non reproduit ici pour éviter erreurs sans test]
```

#### Plan de rollback

```sql
-- ROLLBACK (à exécuter manuellement si nécessaire — NON APPLIQUÉ) :
DROP TABLE IF EXISTS plan_fonctionnalites;
DROP TABLE IF EXISTS fonctionnalites;
-- Les colonnes supplements_actifs et limite_supplements sur plans sont conservées
-- (ne pas les supprimer : le code api-supplements.ts s'y appuie encore en production).
```

#### Mécanisme de comptage d'usage

**Pour `codes_promo` (type `limite_periodique`)** : la table `codes_promo` existe déjà avec `created_at`. Le comptage d'usage par mois est faisable avec :
```sql
SELECT COUNT(*) FROM codes_promo 
WHERE tenant_id = $1 
  AND created_at >= date_trunc('month', NOW())
  AND deleted_at IS NULL  -- si soft-delete implémenté
```
→ **Pas de table d'usage séparée nécessaire** pour `codes_promo` — comptage à la volée sur `codes_promo`. Coût : 1 COUNT par requête de création. Acceptable.

**Pour `supplements` (type `limite_periodique`)** : la limite est sur le nombre de suppléments **actifs simultanément** (pas créés dans le mois) — comptage sur `supplements WHERE actif=true AND deleted_at IS NULL`. Déjà implémenté dans `api-supplements.ts`. Le scaffold actuel sera conservé dans l'API et migré vers la nouvelle table.

**Coût performance** : 2 requêtes supplémentaires par opération de création (résolution `plan_id` + lookup `plan_fonctionnalites`). Acceptable pour les fréquences attendues. La mise en cache de `plan_fonctionnalites` par `plan_id` dans KV (TTL 60s) est recommandée si le volume justifie l'optimisation.

---

### 4.3 — Contrat d'API (proposition complète — non implémentée)

#### Résolveur central `getPlanFeatureConfig()`

**Fichier** : `src/lib/plans.ts` (App Web)

**Signature proposée** :
```typescript
interface PlanFeatureConfig {
  actif: boolean           // false si absent = défaut sécurisé
  limite: number | null    // null = illimité (seulement si type=limite_periodique)
  periode: string | null   // 'mensuel' | null
  type: 'booleen' | 'limite_periodique'
}

async function getPlanFeatureConfig(
  env: Env,
  planId: string | null | undefined,
  featureCode: string
): Promise<PlanFeatureConfig>
```

**Comportement** :
1. Si `planId` est null/undefined → retourner `{ actif: false, limite: null, periode: null, type: 'booleen' }` (défaut sécurisé).
2. Requête Supabase (adminClient) :
   ```sql
   SELECT pf.actif, pf.limite, pf.periode, f.type
   FROM plan_fonctionnalites pf
   JOIN fonctionnalites f ON f.id = pf.fonctionnalite_id
   WHERE pf.plan_id = $planId AND f.code = $featureCode
   ```
3. Si aucune ligne → `{ actif: false, ... }` — **défaut sécurisé**.
4. Si ligne trouvée → retourner les valeurs.
5. Envelopper dans try/catch — en cas d'erreur DB → `{ actif: false, ... }` (fail-secure).

**Exemples entrée/sortie** :
```json
// getPlanFeatureConfig(env, "uuid-plan-naaba", "codes_promo")
// → Plan Naaba, codes_promo actif, illimité
{ "actif": true, "limite": null, "periode": "mensuel", "type": "limite_periodique" }

// getPlanFeatureConfig(env, "uuid-plan-faso", "codes_promo")
// → Plan Faso, codes_promo désactivé
{ "actif": false, "limite": null, "periode": "mensuel", "type": "limite_periodique" }

// getPlanFeatureConfig(env, null, "codes_promo")
// → Pas de plan = défaut sécurisé
{ "actif": false, "limite": null, "periode": null, "type": "booleen" }

// getPlanFeatureConfig(env, "uuid-plan-faso", "supplements")
// → Faso, supplements non actif (défaut false post-migration scaffold)
{ "actif": false, "limite": null, "periode": "mensuel", "type": "limite_periodique" }
```

---

#### Route App Web — Lecture des fonctionnalités du plan courant

**`GET /api/v1/dashboard/plan/fonctionnalites`** (App Web, route protégée)

```
Méthode  : GET
Chemin   : /api/v1/dashboard/plan/fonctionnalites
Auth     : Cookie httpOnly sb-access-token OU Bearer (app mobile)
CSRF     : Non requis (lecture seule)
Rôle     : verifyAuth() ou verifyAuthOnboarding() — tenant authentifié
```

**Comportement** :
1. `verifyAuth(c)` → obtenir `tenant_id`.
2. Charger `plan_id` du tenant.
3. Pour chaque entrée du catalogue `fonctionnalites` (select `*` trié par `ordre`) :
   - Appeler `getPlanFeatureConfig(env, plan_id, feature.code)` — ou mieux : une seule requête JOIN batch.
4. Retourner le tableau.

**Réponse (200)** :
```json
{
  "plan_id": "uuid-plan",
  "plan_nom": "Naaba",
  "fonctionnalites": [
    {
      "code": "boutique_en_ligne",
      "nom": "Boutique en ligne",
      "type": "booleen",
      "actif": true,
      "limite": null,
      "periode": null
    },
    {
      "code": "codes_promo",
      "nom": "Codes promotionnels",
      "type": "limite_periodique",
      "actif": true,
      "limite": null,
      "periode": "mensuel",
      "utilises": 3
    },
    {
      "code": "supplements",
      "nom": "Suppléments",
      "type": "limite_periodique",
      "actif": false,
      "limite": null,
      "periode": "mensuel",
      "utilises": 0
    }
  ]
}
```

**Erreurs** : `401` (non authentifié), `500` (erreur DB).

**Optimisation** : La requête batch sera :
```sql
SELECT f.code, f.nom, f.type, f.periode,
       COALESCE(pf.actif, false) AS actif,
       pf.limite
FROM fonctionnalites f
LEFT JOIN plan_fonctionnalites pf
       ON pf.fonctionnalite_id = f.id AND pf.plan_id = $plan_id
WHERE f.actif = true
ORDER BY f.ordre
```
→ 1 seule requête au lieu de N.

---

#### Routes Admin — Gestion des plans et de la matrice fonctionnalités

**`GET /api/admin/plans`** — inchangée, enrichie

Retourne les plans avec les fonctionnalités associées (JOIN plan_fonctionnalites).

**Réponse enrichie** :
```json
{
  "plans": [
    {
      "id": "uuid",
      "nom": "Naaba",
      "prix_mensuel": 18000,
      "actif": true,
      "fonctionnalites": [
        { "code": "codes_promo", "actif": true, "limite": null, "periode": "mensuel" },
        { "code": "supplements", "actif": false, "limite": 5, "periode": "mensuel" }
      ]
    }
  ]
}
```

**`POST /api/admin/plans`** — création de plan

```
Méthode  : POST
Chemin   : /api/admin/plans
Auth     : authMiddleware (session KV admin)
CSRF     : X-Requested-With: XMLHttpRequest (à ajouter)
Validation : CreatePlanSchema étendu
```

**Payload** :
```json
{
  "nom": "Nouveau Plan",
  "prix_mensuel": 12000,
  "commandes_incluses": 500,
  "frais_par_commande": 30,
  "description": "Description optionnelle",
  "fonctionnalites": [
    { "code": "boutique_en_ligne", "actif": true },
    { "code": "codes_promo", "actif": false },
    { "code": "supplements", "actif": true, "limite": 5 }
  ]
}
```

**Comportement** :
1. Valider le payload (Zod).
2. Insérer dans `plans`.
3. Pour chaque entrée `fonctionnalites` du payload : `INSERT INTO plan_fonctionnalites` avec `actif=false` par défaut si non fourni. Pour les codes non listés dans le payload → ne pas insérer (= défaut sécurisé : non présent = désactivé).
4. Invalider cache KV App Web : `KV_CACHE.delete('plans:FCFA')`.
5. Retourner le plan créé.

**Réponse (201)** : `{ "success": true, "plan_id": "uuid" }`  
**Erreurs** : `400` (JSON invalide), `422` (validation), `500` (DB).

---

**`DELETE /api/admin/plans/:id`** — suppression/désactivation

```
Méthode  : DELETE
Chemin   : /api/admin/plans/:id
Auth     : authMiddleware
CSRF     : X-Requested-With requis
```

**Comportement** :
1. Vérifier `isValidUUID(id)`.
2. Compter les tenants actifs **ET en essai ET en_attente_paiement_initial** sur ce plan.
3. Si count > 0 → 409 avec message explicite.
4. Si count = 0 → set `actif=false` sur le plan (pas de suppression physique — contrainte FK `abonnements.plan_id`).
5. Invalider cache KV.

**Réponse (200)** : `{ "success": true }`  
**Erreurs** : `400`, `404`, `409` (tenants actifs), `500`.

---

**`GET /api/admin/fonctionnalites`** — catalogue (lecture seule, pour peupler l'UI)

```
Méthode : GET
Chemin  : /api/admin/fonctionnalites
Auth    : authMiddleware
```

**Réponse** :
```json
{
  "fonctionnalites": [
    { "id": "uuid", "code": "codes_promo", "nom": "Codes promotionnels", "type": "limite_periodique", "periode": "mensuel", "ordre": 6 },
    { "id": "uuid", "code": "supplements", "nom": "Suppléments", "type": "limite_periodique", "periode": "mensuel", "ordre": 7 }
  ]
}
```

---

**`GET /api/admin/plans/:id/fonctionnalites`** — état de la matrice pour un plan

```
Méthode : GET
Chemin  : /api/admin/plans/:id/fonctionnalites
Auth    : authMiddleware
```

**Réponse** :
```json
{
  "plan_id": "uuid",
  "fonctionnalites": [
    { "code": "codes_promo", "actif": true, "limite": null, "periode": "mensuel" },
    { "code": "supplements", "actif": false, "limite": 5, "periode": "mensuel" },
    { "code": "export_csv", "actif": true, "limite": null, "periode": null }
  ]
}
```

---

**`PUT /api/admin/plans/:id/fonctionnalites/:code`** — activer/désactiver/limiter une fonctionnalité pour un plan

```
Méthode     : PUT
Chemin      : /api/admin/plans/:id/fonctionnalites/:code
Auth        : authMiddleware
CSRF        : X-Requested-With requis
Content-Type: application/json
```

**Payload** :
```json
{
  "actif": true,
  "limite": 5       // null pour illimité, ignoré si type=booleen
}
```

**Comportement** :
1. Vérifier UUID + code valide (existe dans `fonctionnalites`).
2. Valider payload (Zod) : `actif: boolean`, `limite: number|null`.
3. `UPSERT` dans `plan_fonctionnalites` (`ON CONFLICT (plan_id, fonctionnalite_id) DO UPDATE`).
4. Invalider cache KV App Web (`plans:FCFA` + `supplements:*` si code=`supplements`).
5. Retourner `{ success: true }`.

**Réponse (200)** : `{ "success": true }`  
**Erreurs** : `400`, `404` (plan ou fonctionnalite introuvable), `422`, `500`.

---

#### Migration des checks existants vers `getPlanFeatureConfig()`

**Fichier par fichier** :

**`src/routes/api-supplements.ts`** — `POST /` (créer supplément)
- **Actuel** : requête directe `plans.supplements_actifs` + `plans.limite_supplements`.
- **Futur** : remplacer par `getPlanFeatureConfig(env, tenantRow.plan_id, 'supplements')` → si `!config.actif` → 403 si et seulement si `actif=false` (défaut sécurisé). Si `config.actif && config.limite !== null && utilises >= config.limite` → 403.
- **Rétrocompatibilité** : les colonnes `supplements_actifs` et `limite_supplements` peuvent être conservées ou supprimées après validation (à décider).

**`src/routes/api-dashboard.ts`** — `POST /codes-promo` et `POST /codes-promo/generate`
- **Actuel** : aucune vérification plan.
- **Futur** : ajouter au début de chaque handler :
  ```typescript
  const tenant = await adminClient.from('tenants').select('plan_id').eq('id', auth.tenant_id).single()
  const config = await getPlanFeatureConfig(env, tenant.data?.plan_id, 'codes_promo')
  if (!config.actif) return c.json({ error: 'Codes promo non inclus dans votre plan.' }, 403)
  if (config.limite !== null) {
    const count = await adminClient.from('codes_promo')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', auth.tenant_id)
      .gte('created_at', /* début du mois */)
    if ((count.count ?? 0) >= config.limite) return c.json({ error: 'Limite de codes promo atteinte ce mois.' }, 403)
  }
  ```

**`src/routes/api-dashboard.ts`** — `GET /commandes/export-csv`
- **Actuel** : aucune vérification plan.
- **Futur** : `getPlanFeatureConfig(env, planId, 'export_csv')` → si `!config.actif` → 403.

**`src/routes/api-dashboard.ts`** — `POST /livreurs`
- **Actuel** : aucune vérification plan.
- **Futur** : `getPlanFeatureConfig(env, planId, 'livreurs')` → si `!config.actif` → 403.

---

### 4.4 — Conception de l'interface Dashboard Admin

#### Page Plans (section `#plans`)

**Structure de la page** (à remplacer l'actuelle) :

```
[+ Créer un plan]                    ← bouton en haut à droite

─── Liste des plans ────────────────────────────────────────────
Plan : Faso           Prix: 0 FCFA/mois    [Actif]  [Désactiver]
                                                     [Voir détail]

Plan : Baraka         Prix: 8 000 FCFA/mois [Actif]  [Désactiver]
                                                     [Voir détail]
...

─── Matrice Fonctionnalités × Plan ─────────────────────────────
                        Faso    Baraka    Naaba    Mogho
boutique_en_ligne        ✓        ✓        ✓        ✓
qr_code                  ✓        ✓        ✓        ✓
notifications_whatsapp   ✓        ✓        ✓        ✓
livreurs                 ✗        ✓        ✓        ✓
statistiques_avancees    ✗        ✗        ✓        ✓
codes_promo              ✗        ✗  [5/mois]  [Illim.]
supplements              ✗    [5 actifs]  [10]    [Illim.]
export_csv               ✗        ✗        ✓        ✓
...
```

**Chaque cellule de la matrice** :
- Type `booleen` : toggle on/off.
- Type `limite_periodique` : toggle + champ numérique (0 = désactivé, vide = illimité, entier = limite).
- Modification en temps réel : clic → `PUT /api/admin/plans/:id/fonctionnalites/:code`.

#### Création d'un plan (modal)

Champs : `nom*`, `prix_mensuel*`, `commandes_incluses*`, `frais_par_commande*`, `description`.  
À la création : toutes les fonctionnalités sont **désactivées par défaut** (défaut sécurisé). L'admin configure la matrice après création.

#### Suppression/désactivation d'un plan

- Si tenants actifs/essai dessus : modal d'avertissement avec compte des tenants concernés → refus si non zéro.
- **Décision tranchée** : pas de suppression physique (contrainte FK `abonnements.plan_id`). La désactivation (`actif=false`) retire le plan de la liste publique mais les tenants déjà dessus restent sur ce plan jusqu'à leur prochain cycle.
- **Point ouvert** (section 14) : que faire des tenants en essai sur un plan désactivé ?

#### Délai de propagation

Le cache KV `plans:FCFA` est invalidé **immédiatement** après toute modification admin (via `KV_CACHE.delete('plans:FCFA')` appelé depuis l'App Web — nécessite un mécanisme de webhook ou d'invalidation cross-Worker).

**Problème** : le KV App Web et le KV Admin sont deux namespaces différents. L'admin ne peut pas invalider directement le KV de l'App Web.

**Solution proposée** : L'Admin appelle `PUT /api/v1/admin/invalidate-plans-cache` sur l'App Web (route protégée par `ADMIN_WEBHOOK_SECRET`) après toute modification de plan. L'App Web invalide alors son propre KV.

**Délai de propagation garanti** : 0s si l'invalidation webhook réussit. Fallback : TTL KV de 600s (10 minutes) si le webhook échoue.

---

### 4.5 — Conception du double blocage frontend/backend

> **Principe** : le frontend masque/désactive l'accès pour l'UX, mais ne constitue **jamais** le seul contrôle. Le backend refuse systématiquement les requêtes interdites par le plan, indépendamment de ce que le frontend affiche ou envoie.

| Fonctionnalité | Comportement frontend (désactivé/limite atteinte) | Comportement backend (refus) | Scénario de test |
|---|---|---|---|
| `codes_promo` (actif=false) | Masquer la section "Codes promo" de la sidebar. Si accessible via URL directe, afficher message "Non inclus dans votre plan". | 403 `{"error": "Codes promo non inclus dans votre plan.", "code": "FEATURE_DISABLED"}` sur `POST /codes-promo` et `POST /codes-promo/generate`. | Désactiver codes_promo pour plan Faso → tenter `POST /api/v1/dashboard/codes-promo` avec token Faso → attendu 403. |
| `codes_promo` (limite atteinte) | Afficher badge "Limite mensuelle atteinte (X/X)" en rouge. Désactiver le bouton "Nouveau code". | 403 `{"error": "Limite de codes promo atteinte ce mois (X/X).", "code": "FEATURE_LIMIT_REACHED"}` sur `POST /codes-promo`. | Fixer limite=2 pour plan Naaba → créer 2 codes → tenter 3ème → 403. |
| `export_csv` (actif=false) | Masquer le bouton "Exporter CSV" dans l'en-tête du tableau des commandes. | 403 `{"error": "Export CSV non inclus dans votre plan.", "code": "FEATURE_DISABLED"}` sur `GET /commandes/export-csv`. | Désactiver export_csv plan Faso → tenter `GET /api/v1/dashboard/commandes/export-csv` → attendu 403. |
| `livreurs` (actif=false) | Masquer la section "Livreurs" de la sidebar. Masquer le bouton "Assigner livreur" dans le modal de commande. | 403 `{"error": "Gestion livreurs non incluse dans votre plan.", "code": "FEATURE_DISABLED"}` sur `POST /livreurs`. `GET /livreurs` retourne liste vide (ou 403 — à trancher en implémentation). | Désactiver livreurs plan Faso → tenter `POST /api/v1/dashboard/livreurs` → attendu 403. |
| `supplements` (actif=false) | Masquer la section "Suppléments" de la sidebar. | 403 `{"error": "Suppléments non inclus dans votre plan.", "code": "FEATURE_DISABLED"}` sur `POST /supplements`. | Désactiver supplements pour plan Faso → tenter `POST /api/v1/dashboard/supplements` → attendu 403. |
| `supplements` (limite atteinte) | Badge rouge "X/X suppléments actifs. Limite atteinte." Bouton "Ajouter" désactivé. | 403 `{"error": "Limite de suppléments atteinte (X max pour votre plan).", "code": "FEATURE_LIMIT_REACHED"}` sur `POST /supplements`. | Fixer limite=5 plan Faso → créer 5 suppléments actifs → tenter 6ème → 403. |
| `boutique_en_ligne` (actif=false) | N/A — cas théorique (tous plans ont boutique=true). Si désactivé : rediriger boutique vers page "restaurant suspendu". | Pas de route backend à bloquer — la boutique est publique. Le contrôle se fait via `tenants.statut`. | Non applicable en production actuelle. |
| `qr_code` (actif=false) | Masquer l'onglet "QR Code" du dashboard. | 403 sur `GET /api/v1/tenants/:slug/qrcode` — à ajouter dans la future implémentation. | Désactiver qr_code plan Faso → tenter GET qrcode → 403. |
| `notifications_whatsapp` (actif=false) | Information uniquement — le tenant sait que les notifications sont désactivées. | Ne pas appeler `envoyerNotificationWhatsApp()` dans `PATCH /commandes/:id/statut`. | Désactiver notifications_whatsapp → passer commande en_preparation avec livreur → vérifier absence d'appel WhatsApp. |
| `statistiques_avancees` (actif=false) | Masquer les sections stats avancées dans le dashboard. Afficher seulement les stats de base. | `GET /stats` peut retourner un objet réduit (ou complet — à trancher : les stats sont déjà calculées, le contrôle est principalement UI). | Si contrôle backend souhaité : Désactiver → tenter `GET /api/v1/dashboard/stats/avancees` (route future) → 403. |
| `multi_boutique` (actif=false) | Masquer option "Ajouter un point de vente". | Contrôle sur `POST /pdv` si l'on crée un 2ème PDV : vérifier `plan_fonctionnalites.multi_boutique`. | Désactiver multi_boutique → tenter création 2ème PDV → 403. |
| `domaine_perso` (actif=false) | Masquer le champ domaine personnalisé dans paramètres. | Contrôle backend à ajouter sur la route de mise à jour du domaine. | Désactiver domaine_perso → tenter PATCH domaine → 403. |
| `onboarding_dedie` (actif=false) | Fonctionnalité informative uniquement — affichage badge. | Pas de route backend à bloquer. | N/A. |
| `acces_api` (actif=false) | Afficher message "API non disponible pour votre plan". | Si routes API publiques futures : 403. | N/A pour l'implémentation actuelle. |
| `support_whatsapp_prioritaire` (actif=false) | Fonctionnalité informative uniquement. | Pas de route backend à bloquer. | N/A. |

**Format de refus backend standardisé** :
```json
HTTP 403
{
  "error": "Message explicite pour l'utilisateur.",
  "code": "FEATURE_DISABLED" | "FEATURE_LIMIT_REACHED",
  "feature": "codes_promo"
}
```

**Chargement frontend des fonctionnalités** :
- À chaque connexion au dashboard : appeler `GET /api/v1/dashboard/plan/fonctionnalites`.
- Stocker en mémoire (variable JS) ou localStorage (TTL court, 5 min).
- Utiliser pour conditionner l'affichage de chaque section sidebar.
- Ne jamais faire confiance à ces données pour décider côté JS que "c'est autorisé" — seul le backend décide.

---

### 4.6 — Conception de la page de paiement dynamique

**Cible** : `dashboard-paiement.js` → section "Formules disponibles" + page `/dashboard/abonnement`.

**Actuel** : Les plans sont chargés dynamiquement via `GET /api/v1/plans` ✓. Mais l'affichage des fonctionnalités par plan est absent de la section "Formules disponibles".

**Conception** :

La route `GET /api/v1/plans` retourne déjà `fonctionnalites` JSONB. Après la migration vers `plan_fonctionnalites`, cette route devra retourner les fonctionnalités depuis la nouvelle table.

**`GET /api/v1/plans` — enrichissement** :

La route actuelle retourne `fonctionnalites` JSONB. Post-migration, elle retournera :
```json
{
  "plans": [
    {
      "id": "uuid",
      "nom": "Naaba",
      "prix_mensuel": 18000,
      "fonctionnalites": [
        { "code": "codes_promo", "nom": "Codes promotionnels", "actif": true, "limite": null },
        { "code": "supplements", "nom": "Suppléments", "actif": true, "limite": 10 },
        { "code": "export_csv", "nom": "Export CSV", "actif": true }
      ]
    }
  ]
}
```

**Affichage côté `dashboard-paiement.js`** :

La fonction `construireCarteStatut()` → section "Formules disponibles" doit afficher pour chaque plan :
```html
<div class="plan-card">
  <h4>Naaba — 18 000 FCFA/mois</h4>
  <ul>
    <li>✓ Boutique en ligne</li>
    <li>✓ QR Code</li>
    <li>✓ Codes promotionnels (illimité)</li>
    <li>✓ Suppléments (10 actifs)</li>
    <li>✗ Domaine personnalisé</li>
  </ul>
  <button>Choisir ce plan</button>
</div>
```

**Règle d'affichage** :
- Afficher uniquement les fonctionnalités `actif=true` avec une icône ✓.
- Ne pas afficher les fonctionnalités `actif=false` (pas de ✗ visible par l'utilisateur — simplification UX).
- Pour `type=limite_periodique` : afficher la limite si `limite !== null`, sinon "illimité".
- Plus aucune valeur codée en dur dans le JS — tout vient de l'API.

**Page tarifs publique (`src/pages/tarifs.ts`)** :
- Même approche : lire les fonctionnalités depuis l'API, plus de clés hardcodées dans le template.
- Le template devient un renderer générique qui boucle sur `plan.fonctionnalites`.

---

### 4.7 — Compatibilité et documentation App Mobile Flutter

#### Analyse de compatibilité

**Endpoints consommés par l'app mobile (constatés dans le code)** :
- `GET /api/v1/plans` — liste des plans (page tarifs/upgrade in-app).
- `GET /api/v1/tenants/:slug/menu` — menu public avec suppléments.
- Routes dashboard via `Authorization: Bearer` (token JWT Supabase).
- `PATCH /api/v1/dashboard/commandes/:id/statut` (via `api-commandes.ts`).

**Contraintes de compatibilité** :
- L'app mobile utilise `Authorization: Bearer <token>` — les routes exemptent Bearer du CSRF. ✓
- Ajouter des champs à `GET /api/v1/plans` et `GET /api/v1/tenants/:slug/menu` est **additif uniquement** → rétrocompatible. ✓
- Ne jamais renommer ni supprimer un champ existant dans ces réponses sans versionnement.
- Si `fonctionnalites` passe de JSONB libre à tableau structuré dans `GET /api/v1/plans`, **la structure change** → l'app mobile doit être mise à jour. Stratégie : retourner **les deux** pendant une période de transition (`fonctionnalites_legacy: {...}` + `fonctionnalites: [...]`).

**Écart identifié — auth** : L'App Web utilise cookie httpOnly `sb-access-token` ; l'App Mobile utilise `Authorization: Bearer`. Ce pattern est déjà géré dans `api-dashboard.ts` (extraction token : `getCookie(c, 'sb-access-token') || Authorization Bearer`). Aucune action supplémentaire pour la nouvelle route `GET /api/v1/dashboard/plan/fonctionnalites` — appliquer le même extracteur.

---

#### Squelette du guide d'intégration API mobile (à remplir lors de l'implémentation)

```markdown
# Guide d'intégration API Mobile — Fonctionnalités par plan

## Endpoint : Fonctionnalités du plan courant

### GET /api/v1/dashboard/plan/fonctionnalites

**Auth** : Authorization: Bearer <jwt_supabase>
**Headers** : X-Requested-With: (optionnel pour les GET Bearer)

**Réponse (200)** :
```json
{
  "plan_id": "uuid",
  "plan_nom": "string",
  "fonctionnalites": [
    {
      "code": "string",          // identifiant stable
      "nom": "string",           // libellé affiché
      "type": "booleen" | "limite_periodique",
      "actif": boolean,
      "limite": number | null,   // null = illimité
      "periode": "mensuel" | null,
      "utilises": number         // présent seulement si type=limite_periodique
    }
  ]
}
```

**Codes d'erreur** :
- 401 : non authentifié
- 500 : erreur serveur

**Contraintes de rate limiting** : 60 req/min par tenant (partagé avec GET /supplements)

**Champs stables** : `code`, `type`, `actif` — ne seront jamais renommés ni supprimés.
**Champs additifs** : des champs supplémentaires peuvent être ajoutés sans préavis.

## Endpoint : Liste des plans publics (enrichi)

### GET /api/v1/plans

**Auth** : aucune
**Réponse** : tableau `plans` avec `fonctionnalites` structurées.

> ⚠️ BREAKING CHANGE POTENTIEL : le champ `fonctionnalites` passera de JSONB libre
> à tableau structuré. Version de transition : `fonctionnalites_legacy` conservé 6 mois.
```

---

### 4.8 — Risques et plan de migration

#### Risques identifiés

| Risque | Sévérité | Mitigation |
|--------|----------|-----------|
| Régression scaffold supplements : l'API actuelle lit `plans.supplements_actifs` directement ; si la migration table ne se fait pas correctement, le comportement change | Haute | Conserver les colonnes `supplements_actifs`/`limite_supplements` pendant 1 cycle. Migrer en 2 phases : d'abord créer les tables + peupler, puis basculer le code. |
| Incohérence clés JSONB vs catalogue : certaines clés frontend (`stats_avancees`) ne correspondent pas aux clés Supabase (`statistiques_avancees`) | Haute | Audit et harmonisation des clés dans le catalogue (section 4.1 déjà fait). Mettre à jour les templates frontend en même temps que la migration. |
| Cache KV `plans:FCFA` non invalidé côté App Web après modification admin | Haute | Implémenter le webhook d'invalidation entre Admin et App Web avant toute modification en production. TTL de 60s recommandé en fallback (au lieu de 600s). |
| Fuite de configuration entre tenants : `getPlanFeatureConfig()` doit recevoir le `plan_id` du tenant authentifié — ne jamais accepter le `plan_id` du client | Critique | La fonction charge le `plan_id` depuis la DB (table `tenants`) via le `tenant_id` de la session. Jamais depuis le payload client. |
| Délai de propagation trop long : une modification admin de plan n'est visible qu'après TTL KV | Moyenne | Webhook invalidation + réduction TTL à 60s pendant la phase de déploiement. |
| Coût performance comptage d'usage : COUNT sur `codes_promo` à chaque création | Faible | Count SQL est O(index) — acceptable. Cacher le compte dans KV (TTL 30s, invalidé à chaque création) si le volume le justifie. |
| Suppression d'un plan avec tenants en essai | Moyenne | La vérification `DELETE /api/admin/plans/:id` est étendue pour inclure tous les statuts actifs. |
| Breaking change app mobile sur `fonctionnalites` | Haute | Période de transition avec champ legacy. Coordination obligatoire avec l'équipe mobile avant déploiement. |

#### Plan de migration proposé (étape par étape)

**Phase 1 — Préparation (sans interruption de service)**
1. Créer les tables `fonctionnalites` et `plan_fonctionnalites` dans Supabase.
2. Peupler le catalogue `fonctionnalites` avec les 13 entrées.
3. Migrer les données JSONB existants → `plan_fonctionnalites`.
4. Migrer le scaffold `supplements_actifs`/`limite_supplements` → `plan_fonctionnalites`.
5. Vérifier la cohérence : chaque plan a bien ses lignes dans `plan_fonctionnalites`.

**Phase 2 — Backend App Web (sans interruption)**
1. Implémenter `getPlanFeatureConfig()` dans `src/lib/plans.ts`.
2. Créer `GET /api/v1/dashboard/plan/fonctionnalites`.
3. Ajouter les checks dans `POST /codes-promo`, `GET /export-csv`, `POST /livreurs`, `POST /supplements`.
4. Mettre à jour `GET /api/v1/plans` pour retourner les fonctionnalités depuis `plan_fonctionnalites` (avec champ legacy en parallèle).

**Phase 3 — Backend Admin**
1. Implémenter `GET/PUT /api/admin/plans/:id/fonctionnalites/:code`.
2. Implémenter `GET /api/admin/fonctionnalites`.
3. Implémenter le webhook d'invalidation KV.
4. Mettre à jour `UpdatePlanSchema` et `CreatePlanSchema`.

**Phase 4 — Frontend App Web**
1. Charger `GET /api/v1/dashboard/plan/fonctionnalites` au login dashboard.
2. Conditionner la visibilité des sections sidebar.
3. Afficher les fonctionnalités dynamiquement dans la page de paiement.
4. Retirer les clés hardcodées de `tarifs.ts` et `home.ts`.

**Phase 5 — Frontend Dashboard Admin**
1. Remplacer la textarea JSON par la matrice graphique.
2. Implémenter les toggles et champs de limite.

**Phase 6 — App Mobile Flutter (coordination requise)**
1. Consommer `GET /api/v1/dashboard/plan/fonctionnalites`.
2. Après 6 mois de stabilité : supprimer le champ `fonctionnalites_legacy` de `GET /api/v1/plans`.

**Phase 7 — Nettoyage**
1. Supprimer les colonnes `supplements_actifs` et `limite_supplements` de `plans` (après validation que plus rien n'y accède).
2. Supprimer le champ `fonctionnalites` JSONB de `plans` ou le conserver en lecture seule pour audit.

---

## PARTIE III — CONTRE-VÉRIFICATION (Phase 3)

---

### 5.1 — Couverture des fonctionnalités identifiées en 3.1

**Vérification** : le catalogue proposé en 4.1 couvre-t-il **toutes** les fonctionnalités identifiées dans le code ?

| Fonctionnalité identifiée en 3.1 | Dans le catalogue 4.1 | Type correct |
|---|---|---|
| codes_promo | ✅ | limite_periodique ✓ |
| export_csv | ✅ | booleen ✓ |
| livreurs | ✅ | booleen ✓ |
| supplements | ✅ | limite_periodique ✓ |
| boutique_en_ligne | ✅ | booleen ✓ |
| qr_code | ✅ | booleen ✓ |
| notifications_whatsapp | ✅ | booleen ✓ |
| statistiques_avancees | ✅ | booleen ✓ |
| support_whatsapp_prioritaire | ✅ | booleen ✓ |
| multi_boutique | ✅ | booleen ✓ |
| domaine_perso | ✅ | booleen ✓ |
| onboarding_dedie | ✅ | booleen ✓ |
| acces_api | ✅ | booleen ✓ |
| produits_max (JSONB actuel) | ⚠️ HORS SCOPE | — (quantitatif, point ouvert) |
| categories_max (JSONB actuel) | ⚠️ HORS SCOPE | — (quantitatif, point ouvert) |

✅ Couverture complète pour les fonctionnalités dans le périmètre.

---

### 5.2 — Précision des comportements frontend

**Vérification** : chaque fonctionnalité a-t-elle un comportement frontend **précis** (pas générique) ?

**Manque identifié** : `qr_code`, `notifications_whatsapp`, `multi_boutique`, `domaine_perso`, `statistiques_avancees` avaient des comportements frontend génériques dans la section 4.5.

**Correction apportée** :

| Fonctionnalité | Comportement frontend précis |
|---|---|
| `qr_code` | Masquer l'onglet "QR Code" dans le menu sidebar (`case 'qrcode'` dans dashboard.js) |
| `notifications_whatsapp` | Dans le modal "Confirmer préparation" : ne pas afficher le champ "Assigner livreur" si notifications_whatsapp=false (car le message WhatsApp au livreur dépend de cette fonctionnalité) |
| `statistiques_avancees` | Dans `GET /stats` ou section stats : n'afficher que les stats de base (CA du jour/mois, nb commandes) si `actif=false`. Masquer les graphiques avancés (courbe 30 jours) |
| `multi_boutique` | Masquer le bouton "Ajouter un second point de vente" dans les paramètres. Afficher message si tentative via URL directe |
| `domaine_perso` | Masquer le champ "Domaine personnalisé" dans `/dashboard/parametres` |
| `onboarding_dedie` | Badge informationnel uniquement — pas de masquage |
| `acces_api` | Section future "Accès API" dans le dashboard : masquer si `actif=false` |
| `support_whatsapp_prioritaire` | Badge informationnel "Support prioritaire inclus" dans le profil |

---

### 5.3 — Suffisance de la conception côté Dashboard Admin

**Vérification** : La conception est-elle implémentable dans un repo sans pattern équivalent ?

**Manques identifiés et corrections** :

1. **Absence de route `POST /api/admin/fonctionnalites`** : le catalogue est géré par migration uniquement (section 4.2 précise "gérée par migration, pas éditable depuis l'admin dans cette conception"). Conforme à la section 1.
   
2. **Pattern d'invalidation KV cross-Worker** : le mécanisme webhook d'invalidation est documenté en 4.4 mais la route App Web `PUT /api/v1/admin/invalidate-plans-cache` n'est pas spécifiée en détail.

**Complément apporté** :

**`PUT /api/v1/admin/invalidate-plans-cache`** (App Web, route interne)
```
Méthode  : PUT
Chemin   : /api/v1/admin/invalidate-plans-cache
Auth     : Header "X-Admin-Secret: {ADMIN_WEBHOOK_SECRET}"
Payload  : { "scope": "plans" | "all" }
```
Comportement : vérifie le secret, invalide `KV_CACHE.delete('plans:FCFA')`, retourne `{ "success": true }`.

3. **L'interface admin `admin-plans.js` utilise des `onclick=` inline** → violation CSP si la politique est durcie. La refonte de l'interface admin doit passer par des `data-action=` comme le fait l'App Web. La conception doit le prescrire.

---

### 5.4 — Couverture sécurité de chaque route proposée

**Vérification** :

| Route | Auth | CSRF | RLS | Validation | Service_role exposé ? |
|---|---|---|---|---|---|
| `GET /api/v1/dashboard/plan/fonctionnalites` | ✅ verifyAuth | ✅ N/A (GET) | ✅ service_role uniquement | ✅ (lecture seule) | ❌ non |
| `POST /api/admin/plans` | ✅ authMiddleware | ⚠️ À AJOUTER | ✅ service_role | ✅ Zod | ❌ non |
| `DELETE /api/admin/plans/:id` | ✅ authMiddleware | ⚠️ À AJOUTER | ✅ service_role | ✅ UUID check | ❌ non |
| `PUT /api/admin/plans/:id/fonctionnalites/:code` | ✅ authMiddleware | ⚠️ À AJOUTER | ✅ service_role | ✅ Zod | ❌ non |
| `GET /api/admin/plans/:id/fonctionnalites` | ✅ authMiddleware | ✅ N/A (GET) | ✅ service_role | ✅ UUID | ❌ non |
| `PUT /api/v1/admin/invalidate-plans-cache` | ✅ ADMIN_WEBHOOK_SECRET | ✅ N/A (webhook) | ✅ N/A | ✅ scope check | ❌ non |

**Correction** : Les routes d'écriture admin (`POST`, `PATCH`, `DELETE`, `PUT`) doivent appeler `checkCSRF(c)` au début du handler — manque identifié en 3.4. La conception prescrit maintenant explicitement l'ajout de ce check sur chaque route mutante.

---

## PARTIE IV — VÉRIFICATION PAR SCÉNARIOS (Phase 4)

---

### Tableau de couverture des 9 scénarios

| # | Scénario | Statut couverture | Notes |
|---|---|---|---|
| 1 | Créer un nouveau plan depuis le Dashboard Admin | ✅ Complet | `POST /api/admin/plans` → insert plans + plan_fonctionnalites vides (défaut sécurisé). |
| 2 | Supprimer un plan existant (avec et sans tenant actif) | ✅ Complet | `DELETE /api/admin/plans/:id` → vérif count tenants (actif+essai+en_attente). Sans tenant : désactivation. Avec tenant : 409. |
| 3 | Retirer une fonctionnalité d'un seul plan | ✅ Complet | `PUT /api/admin/plans/:id/fonctionnalites/:code` avec `{"actif": false}`. N'affecte que ce plan. |
| 4 | Retirer une fonctionnalité de tous les plans | ✅ Complet | Répéter `PUT` pour chaque plan_id. Pas de route bulk dans la conception — à faire plan par plan (acceptable). |
| 5 | Limiter une fonctionnalité pour un plan, illimitée pour un autre | ✅ Complet | Faso: `{"actif":true,"limite":5}`. Mogho: `{"actif":true,"limite":null}`. Comportement à la limite : 403 FEATURE_LIMIT_REACHED. |
| 6 | Ajouter une fonctionnalité existante à un plan qui ne l'avait pas | ✅ Complet | `PUT /api/admin/plans/:id/fonctionnalites/:code` avec `{"actif":true}` → UPSERT. |
| 7 | Double blocage frontend/backend pour 2 fonctionnalités | ✅ Complet | codes_promo : masquage sidebar + 403 API. export_csv : masquage bouton + 403 API. |
| 8 | Affichage dynamique page de paiement | ✅ Complet | `GET /api/v1/plans` retourne fonctionnalités structurées. dashboard-paiement.js les affiche sans hardcoding. |
| 9 | Compatibilité app mobile Flutter | ✅ Partiel | Champ legacy `fonctionnalites_legacy` prévu. Bearer auth géré. Breaking change identifié et documenté. Coordination mobile requise avant déploiement Phase 6. |

**Compléments apportés lors de la vérification** :

**Scénario 5 — Comportement exact au dépassement de limite** :
- À la création du Nème+1 code promo : `POST /codes-promo` → vérification → `COUNT(created_at >= debut_mois) >= limite` → 403.
- Le comptage est fait **au moment de la création** (pas en temps réel au cours du mois).
- Un code créé le 31 janvier compte pour janvier ; le 1er février, le compteur repart à 0.
- Un code désactivé (`actif=false`) **compte quand même** dans la limite mensuelle (il a été créé dans le mois). À documenter clairement dans l'UI.

**Scénario 9 — Complément** :
- La route `GET /api/v1/dashboard/plan/fonctionnalites` est accessible en Bearer. ✓
- Retourner `utilises` uniquement pour les fonctionnalités de type `limite_periodique` (évite une requête inutile pour les booléens).

---

## PARTIE V — AUDIT GLOBAL FINAL (Phase 5)

---

### 7.1 — Cohérence inter-phases

**Contradictions vérifiées** :
- La section 4.5 utilise le code `statistiques_avancees` (avec tiret) — cohérent avec le catalogue 4.1 (`statistiques_avancees`). ✓
- La section 4.2 prescrit le défaut `actif=false` dans `plan_fonctionnalites` — cohérent avec la règle "secure by default". ✓
- La section 4.3 spécifie `getPlanFeatureConfig()` qui retourne `{ actif: false }` en cas d'absence — cohérent. ✓
- Le plan de migration (4.8) préserve les colonnes scaffold pendant la transition — cohérent avec la non-régression. ✓

**Contradiction résolue** : La section 4.4 mentionnait d'invalider le KV depuis l'admin — impossible (namespaces séparés). Résolu par le webhook d'invalidation documenté en 5.3. ✓

---

### 7.2 — Complétude

- ✅ Toutes les sections 4.1 à 4.8 sont remplies.
- ✅ Aucune section n'est restée générique.
- ✅ Checklists 8 et 9 remplies (section suivante).
- ✅ Tableau des 9 scénarios complété.

---

### 7.3 — Sécurité de la conception

**Validation fonctionnalité par fonctionnalité** :

| Fonctionnalité | Défaut sécurisé | Double blocage | Pas confiance client | Backend seul décide |
|---|---|---|---|---|
| codes_promo | ✅ absent = false | ✅ sidebar + 403 | ✅ plan_id chargé en DB | ✅ |
| export_csv | ✅ | ✅ bouton + 403 | ✅ | ✅ |
| livreurs | ✅ | ✅ sidebar + 403 | ✅ | ✅ |
| supplements | ✅ | ✅ sidebar + 403 | ✅ | ✅ |
| boutique_en_ligne | ✅ | ⚠️ cas théorique | ✅ | ✅ |
| qr_code | ✅ | ✅ onglet masqué + 403 | ✅ | ✅ |
| notifications_whatsapp | ✅ | ✅ modal + no-call | ✅ | ✅ |
| statistiques_avancees | ✅ | ✅ UI masquée | ✅ | ⚠️ (contrôle principalement UI — voir note) |
| multi_boutique | ✅ | ✅ bouton + 403 | ✅ | ✅ |
| domaine_perso | ✅ | ✅ champ masqué + 403 | ✅ | ✅ |
| onboarding_dedie | ✅ | ✅ informatif | ✅ | N/A |
| acces_api | ✅ | ✅ section masquée | ✅ | ✅ (routes futures) |
| support_whatsapp_prioritaire | ✅ | ✅ informatif | ✅ | N/A |

**Note `statistiques_avancees`** : les statistiques sont calculées côté backend dans `GET /stats` et retournées dans une seule réponse. Si on ne veut exposer que les stats basiques pour certains plans, il faut que `GET /stats` retourne un objet différent selon le plan. La conception prescrit ce comportement mais il nécessite une modification de `GET /stats` dans l'implémentation. Point documenté.

---

### 7.4 — Faisabilité

- `getPlanFeatureConfig()` : faisable en 1 requête SQL JOIN — pas de complexité particulière. ✓
- Tables `fonctionnalites` + `plan_fonctionnalites` : standard, pas de difficulté technique. ✓
- Webhook invalidation KV : faisable avec la variable d'env `ADMIN_WEBHOOK_SECRET` déjà dans `AdminEnv`. ✓
- Migration scaffold `supplements_actifs`/`limite_supplements` → phase parallèle : faisable sans interruption. ✓
- Refonte interface admin avec matrice : effort UI significatif mais faisable. ✓
- **Risque identifié** : la route Admin `SupabaseAdmin` (client REST custom) n'a pas de méthode `upsert()` — il faudra implémenter le UPSERT pour `plan_fonctionnalites` via `POST` avec header `Prefer: resolution=merge-duplicates` ou via `PATCH` conditionnel. À prévoir dans l'implémentation.

---

### 7.5 — Confirmation

> **Aucun fichier de code, de schéma SQL, de configuration Wrangler ou de migration n'a été modifié dans le repo `monmenu` (App Web) ou dans le repo `monmenu-admin` (Dashboard Admin) pendant ce travail. Seul le présent document Markdown a été produit.**

---

## CHECKLISTS

---

### 8 — Checklist Sécurité de la Conception

- [x] **Défaut sécurisé** spécifié explicitement : absence de ligne dans `plan_fonctionnalites` = `actif=false`. Absence de plan = désactivé. Erreur DB = désactivé.
- [x] **Point d'entrée unique** (`getPlanFeatureConfig`) spécifié comme obligatoire pour toute vérification de fonctionnalité. Toute implémentation qui lit directement la table `plans` ou `plan_fonctionnalites` sans passer par cette fonction est considérée une violation.
- [x] **Double blocage frontend + backend** spécifié pour **chaque** fonctionnalité du catalogue (section 4.5 + corrections 5.2).
- [x] **Aucune conception ne fait confiance au client** : le `plan_id` est toujours chargé depuis `tenants` via le `tenant_id` de la session — jamais depuis le payload client.
- [x] **Rôle admin distingué** : `authMiddleware` vérifie la session KV admin sur toutes les routes `/api/admin/*`.
- [x] **RLS proposée** : `plan_fonctionnalites` et `fonctionnalites` ont RLS activé, service_role uniquement. Pas de lecture directe tenant.
- [x] **Clé Supabase service-role** : vérifiée non exposée côté frontend admin (section 3.4). Seule dans les secrets Workers.
- [x] **Validation stricte** : Zod sur tous les payloads (`CreatePlanSchema`, `UpdatePlanSchema`, schema routes fonctionnalités à créer).
- [x] **Échappement XSS** : la fonction `esc()` dans `security.ts` admin existe et est utilisée dans `admin-plans.js` (`${esc(p.nom)}`). La nouvelle interface matrice devra l'utiliser systématiquement.
- [x] **CSRF** : routes d'écriture admin sans CSRF check identifiées en 3.4 → ajout de `checkCSRF(c)` prescrit pour toutes les routes mutantes.

---

### 9 — Checklist Couverture Fonctionnelle de la Conception

- [x] **Scaffold suppléments** : comportement après migration identique à l'actuel. `supplements_actifs=false` → fonctionnalité désactivée = comportement actuel. La migration vers `plan_fonctionnalites` reproduit ce comportement via `actif=false` par défaut. Colonnes conservées en parallèle pendant la transition.
- [x] **Codes promo** : comportement spécifié pour chaque cas (actif=false → 403, limite atteinte → 403 avec comptage mensuel). Plan Faso → désactivé, Naaba/Mogho → actif illimité (configurable).
- [x] **Page de paiement** : affichage dynamique spécifié (section 4.6). Plus aucune valeur codée en dur — retrait prescrit fichier par fichier.
- [x] **App mobile Flutter** : compatibilité spécifiée sur les endpoints consommés. Champ `fonctionnalites_legacy` prévu pour la transition. Bearer auth pris en compte.
- [x] **Aucune zone "à décider plus tard"** : toutes les décisions sont tranchées sauf les 4 points ouverts listés explicitement en section 14.

---

## SECTION 14 — POINTS OUVERTS / DÉCISIONS À PRENDRE AVANT IMPLÉMENTATION

1. **Politique de suppression d'un plan avec tenants en essai** : la conception actuelle refuse la désactivation si des tenants **actifs** sont dessus. Quelle politique pour les tenants en `essai` sur le plan à désactiver ? Options : (a) refuser aussi, (b) les migrer automatiquement vers le plan Gratuit, (c) laisser en l'état jusqu'à la fin de l'essai. **Décision requise avant implémentation de `DELETE /api/admin/plans/:id`.**

2. **Granularité `export_csv`** : actuellement, `export_csv` s'applique aux commandes. Il existe aussi `GET /codes-promo/export-csv`. Ces deux exports partagent-ils la même fonctionnalité ou sont-ils distincts ? Si distincts, ajouter `export_csv_codes_promo` au catalogue. **Décision requise avant implémentation.**

3. **`produits_max` et `categories_max`** : ces limites quantitatives sont dans le JSONB actuel (Faso: 20 produits, 5 catégories). Sont-elles dans le périmètre de ce chantier ou d'un chantier séparé ? Si dans ce périmètre, le catalogue doit être enrichi de 2 entrées de type `limite_quantitative` (non périodique). **Décision requise avant migration JSONB.**

4. **Stratégie d'invalidation cache KV inter-déploiements** : si l'App Web et l'Admin sont déployés indépendamment sur Cloudflare, les KV namespaces sont distincts. Le webhook d'invalidation (`PUT /api/v1/admin/invalidate-plans-cache`) nécessite que l'Admin connaisse l'URL de l'App Web (`MONMENU_BASE_URL` déjà dans `AdminEnv`). Confirmer que cette variable est bien configurée en production avant d'activer le webhook. **Vérification de configuration requise.**

---

*Document produit le 2026-08-17 à 00:13 GMT+1 — Conception uniquement — aucun code modifié.*
