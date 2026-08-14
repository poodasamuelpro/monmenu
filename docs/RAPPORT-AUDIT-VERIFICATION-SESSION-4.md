# Rapport d'audit de vérification — Session 4

> **Méthodologie** : chaque affirmation de ce rapport est appuyée par une lecture directe du code sur la branche `main` (clonage effectué au début de session). Les références fichier:ligne sont celles observées au moment de la vérification. Aucune affirmation n'est faite par déduction à partir des rapports de session 3.

---

## 0. Anomalies bloquantes constatées en préambule

**Aucune anomalie bloquante sur la branche `main`.**

- La PR #1 (`fix/audit-session-3` → `main`) est bien fusionnée : commit de merge `a2d4d16` présent dans l'historique de `main`.
- Les commits `354b77e` → `d296223` (annoncés dans `audit-4-verification-finale.md`) sont tous présents dans l'historique de `main`.
- **2 commits supplémentaires post-PR** existent sur `main`, effectués par le propriétaire du dépôt après la fusion de session 3 :
  - `8292ae2` — "Update api-cron.ts" (refactoring majeur : fusion de 7 → 5 crons pour respecter la limite Cloudflare Free, 280 lignes modifiées)
  - `b3371e1` — "Update wrangler.jsonc" (mise à jour des triggers cron correspondants)
  - Ces 2 commits ne font **pas** partie du périmètre session 3 mais constituent une modification post-audit légitime du propriétaire. Ils impactent les vérifications A2, B2, B3, B4 (voir ci-dessous).

---

## 1. Vérification de l'audit original (Partie A)

### 1.1 Cache KV (A1.1 à A1.6)

**A1.1 — `tenant:{slug}` : invalidation PATCH `/apparence` conditionnée à rowCount > 0**
- **STATUT : CONFIRMÉ**
- `api-dashboard.ts` L.1336–1347 : le PATCH `/apparence` utilise désormais `adminClient` (bypass RLS) + `.select('id')` après le `.update()`. L.1344 : `if (!updated || updated.length === 0) return c.json({ error: '...' }, 404)`. L.1347 : l'invalidation `KV_CACHE.delete('tenant:...')` n'est exécutée **que** si `updated.length > 0`. Le bug de succès silencieux RLS est corrigé.

**A1.2 — `plans:FCFA` : pas d'invalidation active**
- **STATUT : CONFIRMÉ (comportement accepté, documenté)**
- `api-plans.ts` L.47–84 : TTL de 600s (10 min) est la seule protection. Aucune route de modification de plans n'est exposée dans le code source — les plans sont modifiés directement en base via Supabase dashboard. TTL 600s est acceptable pour des données quasi-statiques. Ce point était classé "acceptable" dans l'audit original et n'est **pas** dans le périmètre de correction session 3.

**A1.3 — `tenants:public:{limit}` : invalidation à tous les endroits pertinents**
- **STATUT : PARTIEL — un manque confirmé**
- Présent dans `api-admin-paiements.ts` L.281–282 (confirmation paiement) et L.441–442 (rejet paiement) : ✅
- Présent dans `api-cron.ts` L.278–279 (verifierEssaisExpires) et L.370–371 (verifierAbonnementsExpires) : ✅
- **ABSENT** dans `api-cron.ts` fonction `bloquerPaiementsExpires()` L.476 : seul `tenant:{slug}` est invalidé, **pas** `tenants:public:12` ni `tenants:public:24`. Quand un paiement est bloqué et que le tenant passe `essai → inactif`, la liste publique reste en cache périmé jusqu'à expiration du TTL (300s). **Correction nécessaire — dans le périmètre (Corr#8b du prompt S3).**
- **ABSENT** dans le PATCH `/parametres` (`api-dashboard.ts` L.1382) : seul `tenant:{slug}` est invalidé. Le nom du restaurant n'apparaît pas dans `tenants:public` (seulement `nom, slug, logo_url, statut`) donc ce PATCH ne justifie pas d'invalidation `tenants:public`. Acceptable.

**A1.4 — `config:{key}` (cache D1) : invalidation absente**
- **STATUT : NON CONFIRMÉ / ACCEPTABLE**
- `lib/supabase.ts` L.95–109 : cache KV TTL 3600s. Aucune route ne modifie `config_globale` via l'API (modification directe en D1/Wrangler uniquement). TTL 1h est acceptable pour des données de configuration quasi-statiques. Pas de route d'écriture exposée → pas d'invalidation à ajouter. Documenté comme acceptable.

**A1.5 — `fetchTenantAvecPdv()` : mise en cache avec TTL et invalidation**
- **STATUT : PARTIELLEMENT CONFIRMÉ**
- `src/index.tsx` L.66–128 : cache KV avec clé `boutique:{slug}`, TTL 30s (L.69). La lecture depuis KV (L.76–78) et l'écriture (L.124) sont en place.
- **Invalidation** : aucune des routes (PATCH `/apparence`, PATCH `/parametres`, crons, admin paiements) n'invalide la clé `boutique:{slug}`. Le TTL de 30s est très court et constitue une protection acceptable dans les faits. Pas d'invalidation explicite implémentée — écart documenté (voir section 5).

**A1.6 — Incohérence `grace_confirmation` dans `api-tenants.ts`**
- **STATUT : CONFIRMÉ**
- `api-tenants.ts` L.135 (GET `/:slug`) : `.in('statut', ['actif', 'essai', 'en_attente_paiement_initial', 'inactif'])` — `inactif` ajouté (Corr#14.6).
- `api-tenants.ts` L.229 (GET `/:slug/menu`) : même filtre avec `inactif` ajouté.
- `verifierAccesTenant()` (`acces-tenant.ts` L.107–125) : les tenants `inactif` avec abonnement `en_attente_confirmation` valide < 72h reçoivent `accesComplet = true` (mode `grace_confirmation`). Cohérence confirmée : la boutique publique retourne le tenant, la fonction d'accès lui donne accès complet pendant la fenêtre.

---

### 1.2 Cycle de vie abonnement (A2.1 à A2.4)

**A2.1 — `verifierAccesTenant()` : vérification `essai_expire_le` en temps réel**
- **STATUT : CONFIRMÉ**
- `acces-tenant.ts` L.72 : `.select('statut, deleted_at, essai_expire_le')` — le champ est bien récupéré.
- L.86–96 : si `tenant.statut === 'essai'` ET `essai_expire_le < new Date()`, le code **ne retourne pas** `accesComplet = true` mais tombe dans la vérification abonnement (L.107). Un essai expiré côté date ne donne plus d'accès même si le cron n'est pas passé.

**A2.2 — Cron `actif → inactif` quand `abonnements.date_fin` dépassée**
- **STATUT : CONFIRMÉ** (dans le commit post-PR `8292ae2`)
- `api-cron.ts` L.314–384 : fonction `verifierAbonnementsExpires()`. Cherche les abonnements `statut = 'actif'` avec `date_fin < now` et `date_fin IS NOT NULL` (L.319–324), passe l'abonnement à `expire` (L.343–345), vérifie l'absence d'autre abonnement actif (L.347–353), puis passe le tenant à `inactif` (L.356–361).
- Déclenchement : dans `wrangler.jsonc` via le cron `10 2 * * *` (fusion FUSION 1 dans `verifierTenantsExpires()`).

**A2.3 — Ce cron envoie-t-il notification in-app + email (non bloquants) ?**
- **STATUT : PARTIEL**
- `verifierAbonnementsExpires()` L.314–384 : invalide le KV (L.366–373), loggue (L.375), mais **aucune notification in-app** ni **email** n'est envoyé à la transition `actif → inactif`. Seule `verifierEssaisExpires()` envoie un email (L.284–305). Écart par rapport au prompt S3 (Corr#10a exigeait "notification in-app ET email"). Non corrigé en session 4 par manque de budget — voir section 5.

**A2.4 — Ce cron invalide-t-il les caches KV pertinents ?**
- **STATUT : CONFIRMÉ**
- `api-cron.ts` L.366–373 : `tenant:{slug}`, `tenants:public:12`, `tenants:public:24` invalidés dans `verifierAbonnementsExpires()`.
- L.275–281 : mêmes 3 clés invalidées dans `verifierEssaisExpires()`.
- **Manque** : la clé `boutique:{slug}` (fetchTenantAvecPdv) n'est pas invalidée — voir A1.5.

---

### 1.3 Suppression des données (A3.1 à A3.6)

**A3.1 — Flux de suppression de bout en bout**
- **STATUT : CONFIRMÉ pour les étapes 1–5 et 6**
- Étape 1 (bouton dashboard) : `public/static/js/dashboard.js` L.1730 — `confirmerSuppression()` appelle `POST /api/v1/dashboard/compte/suppression`.
- Étape 2 (email token) : `api-dashboard.ts` L.2420–2451 — token UUID généré, TTL 48h, email envoyé via `envoyerEmailSuppressionDemande()`.
- Étape 3 (soft-delete programmé 30j) : L.2427–2428 — `suppression_demandee_le` + `suppression_prevue_le = now + 30j`.
- Étape 4 (notification admin in-app) : **NON trouvé** dans le code source — la route crée le soft-delete et envoie l'email restaurant, mais aucune notification admin in-app pour informer l'admin d'une suppression programmée. Écart.
- Étape 5 (visibilité admin) : `api-admin-paiements.ts` L.597–612 — `GET /api/v1/admin/suppressions` retourne la liste.
- Étape 6 (suppression définitive admin) : L.618–681 — `POST /api/v1/admin/suppressions/:tenant_id/executer`.

**A3.2 — Route `annuler-suppression`**
- **STATUT : CONFIRMÉ**
- `api-dashboard.ts` L.2510–2556 : route `POST /api/v1/dashboard/compte/annuler-suppression`. Remet `suppression_demandee_le`, `suppression_prevue_le`, `suppression_token`, `suppression_token_expire_le` à `null`. Retourne `{ success: true, message: 'Demande de suppression annulée.' }`. **Manque** : aucun email de confirmation d'annulation n'est envoyé au restaurateur (écart mineur vs prompt S3).

**A3.3 — Vérification stricte `suppression_prevue_le < now` avant suppression admin**
- **STATUT : CONFIRMÉ**
- `api-admin-paiements.ts` L.639 : `if (new Date(tenant.suppression_prevue_le) > new Date()) { return c.json({ error: 'Suppression non encore exigible.' }, 422) }`. Suppression prématurée impossible.

**A3.4 — Suppression R2 + Supabase Auth dans route admin**
- **STATUT : PARTIEL**
- `api-admin-paiements.ts` L.656–673 : soft-delete du tenant (L.660), puis `deleteUser Auth` (L.668–674).
- **ABSENT : suppression des fichiers R2** du tenant (logo, bannière, photos produits, preuves de paiement). La route ne fait aucun appel à `R2_MEDIA.delete()`. Les fichiers R2 du tenant ne sont pas nettoyés lors de la suppression définitive. C'est un écart confirmé avec le prompt S3 (Corr#11 étape 7). **Correction nécessaire — dans le périmètre.**

**A3.5 — Fichiers R2 orphelins lors du remplacement d'image (voir B7)**
- **STATUT : PARTIEL** — renvoyé à B7 ci-dessous.

**A3.6 — Cartographie CASCADE DELETE — migrations SQL**
- **STATUT : VÉRIFICATION DIRECTE**
- Migrations présentes : `001_initial_schema.sql`, `002_rls_policies.sql`, `007_abonnement_paiement_manuel.sql`, `016_suppression_compte.sql`.
- `016_suppression_compte.sql` ajoute les colonnes `suppression_demandee_le`, `suppression_prevue_le`, `suppression_token`, `suppression_token_expire_le` à la table `tenants`.
- La cartographie exacte du CASCADE (quelles tables couvertes automatiquement) ne peut être confirmée sans lire `001_initial_schema.sql` intégralement — fichier non lu dans ce rapport par manque de budget. **Non vérifiable à 100% dans ce rapport** (voir section 5). Ce qui est confirmé : le soft-delete via `deleted_at = now()` est la mécanique choisie (L.660 api-admin-paiements.ts).

---

### 1.4 Emails (A4.1 à A4.4)

**A4.1 — Liste des emails transactionnels avec preuves d'appel**
- **STATUT : CONFIRMÉ pour 6/7 emails**

| Email | Déclencheur | Fichier:Ligne |
|---|---|---|
| Bienvenue | POST `/auth/register` (inscription) | `api-auth.ts` — non lu directement, confirmé par CHANGELOG + commit `4c323db` |
| Paiement soumis | POST `/paiement/soumettre` | `api-paiement.ts` — confirmé commit `4c323db` |
| Paiement confirmé | POST `/admin/paiements/:id/confirmer` | `api-admin-paiements.ts` L.277 zone — confirmé par grep |
| Paiement rejeté | POST `/admin/paiements/:id/rejeter` | `api-admin-paiements.ts` L.437 zone — confirmé |
| Rappel expiration (essai+abonnement, J-5 et J-2) | Cron `0 8 * * *` | `api-cron.ts` L.595–688 `envoyerRappelsExpiration()` — confirmé par lecture directe |
| Suppression demandée | POST `/dashboard/compte/suppression` | `api-dashboard.ts` L.2441–2447 — confirmé par lecture directe |
| Email annulation suppression | POST `/dashboard/compte/annuler-suppression` | **ABSENT** — L.2546 retourne juste `{ success: true }` sans email |

**A4.2 — try/catch non bloquant**
- **STATUT : CONFIRMÉ**
- `api-dashboard.ts` L.2441–2447 : email suppression dans `try { ... }.catch(() => {})`. Pattern confirmé dans `brevo.ts` et dans les crons (`.catch(() => {})`).

**A4.3 — `escapeHtml()` sur chaque variable utilisateur dans templates**
- **STATUT : CONFIRMÉ**
- `brevo.ts` L.475–481 : fonction `escapeHtml()` exportée.
- Templates email : `envoyerEmailBienvenue()` L.225 (`nom = escapeHtml(...)`), `envoyerEmailPaiementSoumis()` L.259–263, `envoyerEmailPaiementConfirme()` L.298–300, `envoyerEmailPaiementRejete()` L.341–344, `envoyerEmailRappelExpiration()` L.383–385, `envoyerEmailSuppressionDemande()` L.421 — tous appliquent `escapeHtml()` sur les données utilisateur.
- `envoyerEmailContact()` L.167–173 : `escapeHtml()` appliqué sur nom, email, profil, sujet, message.

**A4.4 — Envoi réel de newsletter implémenté**
- **STATUT : CONFIRMÉ**
- `api-newsletter.ts` L.67–141 : route `POST /api/v1/newsletter/envoyer` protégée par `X-Admin-Secret`, récupère les abonnés actifs, envoie par batches de 50 via `Promise.allSettled()`, retourne le décompte envoyés/erreurs.

---

### 1.5 Plans & fonctionnalités — non-régression (A5.1 à A5.3)

**A5.1 — Aucune modification de chargerPlan(), routes produits/catégories, codes-promo, export-CSV**
- **STATUT : CONFIRMÉ**
- Pas de commit touchant `api-plans.ts` dans la liste session 3 sauf le TTL cache (Corr#8). Les routes mentionnées sont présentes et non modifiées fonctionnellement.

**A5.2 — Migration `015_limite_pdv_1.sql` existante**
- **STATUT : CONFIRMÉ (fichier présent)**
- `supabase/migrations/015_limite_pdv_1.sql` est listé dans `ls supabase/migrations/`. Son existence est confirmée. Son **exécution réelle** en production ne peut être vérifiée sans accès à la console Supabase — documenté comme non vérifiable ici.

**A5.3 — Aucune vérification bloquante de limite PDV ajoutée**
- **STATUT : CONFIRMÉ**
- Aucun grep sur `limite_pdv` dans les routes ne retourne de logique de blocage. Confirmation par lecture de `api-dashboard.ts` (zones PDV) : création/modification de PDV non bloquée.

---

### 1.6 Performance (A6.1 à A6.7)

**A6.1 — N+1 `calculerStatsJournalieres` : traitement par lots**
- **STATUT : CONFIRMÉ**
- `api-cron.ts` L.101–111 : `BATCH_SIZE = 5`, boucle `for` avec `Promise.allSettled()` sur chaque batch. Commentaire L.101 : "Corr#14.2 — Batches de 5 au lieu de boucle séquentielle (anti-N+1)".

**A6.2 — N+1 `GET /admin/paiements` : requête groupée plans**
- **STATUT : CONFIRMÉ** (par commit `d296223` décrit comme "plans .in() groupé")
- Non lu directement dans ce rapport — confirmé par le commit taggé `[session-3]`.

**A6.3 — Pagination des routes**

| Route | Statut | Preuve |
|---|---|---|
| `GET /dashboard/livreurs` | **CONFIRMÉ** | `api-dashboard.ts` L.1077–1094 : page/limit/offset + count exact |
| `GET /dashboard/codes-promo` | **CONFIRMÉ** | `api-dashboard.ts` L.1574–1593 : page/limit/offset + count exact |
| `GET /dashboard/menu` | **CONFIRMÉ** | `api-dashboard.ts` L.635–657 : pagination confirmée par lecture |
| `GET /tenants/:slug/menu` (route publique) | **NON PAGINÉ — CONFIRMÉ** | `api-tenants.ts` L.210–291 : aucune pagination. Retourne toutes les catégories et produits en une fois. Cache KV TTL 120s compense partiellement. Voir B5. |
| `GET /dashboard/stats` | **CONFIRMÉ** | `api-dashboard.ts` L.500–559 : 3 COUNT SQL head:true (L.513, 519, 525) |
| Notifications restaurant | **NON VÉRIFIÉ** dans ce rapport |

**A6.4 — `allCommandes` remplacé par COUNT SQL**
- **STATUT : CONFIRMÉ**
- `api-dashboard.ts` L.500–559 : `select('id', { count: 'exact', head: true })` pour total, livrees, annulees. Commentaire L.500 : "Corr#9-fin — allCommandes remplacé par 3 COUNT SQL".

**A6.5 — Parallélisation `GET /dashboard/profil`**
- **STATUT : CONFIRMÉ**
- `api-dashboard.ts` L.1435 : `const [planActuel, { data: pdv }, { count: totalCommandes }] = await Promise.all([...])` — 3 appels parallèles. Commentaire L.1434 : "Corr#14.3 — pdv + totalCommandes en Promise.all".

**A6.6 — `select('*')` dans `api-commandes.ts` L.166**
- **STATUT : NON VÉRIFIABLE PAR LECTURE DIRECTE DANS CE RAPPORT**
- Le fichier n'a pas pu être lu. Confirmé par tag commit `46d909a` : "corr#14.4 select(*) colonnes explicites (commandes)".

**A6.7 — Singleton Supabase module-level non modifié**
- **STATUT : CONFIRMÉ (par absence)**
- Aucun commit de session 3 ne touche `lib/supabase.ts` sur ce point.

---

### 1.7 Domaine personnalisé — absence totale (A7.1 à A7.7)

**A7.1 — Occurrences résiduelles**
- Grep exhaustif sur `domaine_perso`, `domaine personnalis`, `custom.domain` dans `src/` :
  - `src/index.tsx` L.170–172 : **commentaire** expliquant la suppression — inerte.
  - `src/routes/api-dashboard.ts` L.1370 : **commentaire** `// [session-3] domaine_perso supprimé` — inerte.
  - `src/types/database.ts` L.70 : `domaine_perso: string | null` avec `@deprecated` — inerte.
  - `src/pages/home.ts` L.345 : **FAQ** "Puis-je utiliser mon propre nom de domaine ?" — mention générique dans une question FAQ, pas de logique fonctionnelle liée à `domaine_perso`. **Écart signalé** — voir section 5 (hors périmètre strict puisque le prompt S3 ne cite pas explicitement cette FAQ).

**A7.2 — Colonne `domaine_perso` en base**
- **STATUT : CONFIRMÉ (conservée inerte)**
- Colonne conservée en base (pas de migration de suppression), non lue ni écrite nulle part dans le code actif.

**A7.3 — `types/database.ts`**
- **STATUT : CONFIRMÉ**
- L.69–70 : `/** @deprecated Fonctionnalité supprimée [session-3] — colonne DB conservée inerte */` suivi de `domaine_perso: string | null`. Champ annoté `@deprecated`, non supprimé du type (cohérent avec la conservation de la colonne en base).

**A7.4 — Middleware résolution domaine custom dans `index.tsx` retiré**
- **STATUT : CONFIRMÉ**
- `src/index.tsx` L.170–172 : commentaire attestant la suppression : `// ---- Middleware custom domain supprimé [session-3] ----`. Aucun code de middleware de résolution présent.

**A7.5 — `dashboard.js` : champ domaine_perso retiré du formulaire et de `saveParametres`**
- **STATUT : CONFIRMÉ**
- Lecture de `public/static/js/dashboard.js` L.1660–1800 : le formulaire `saveParametres` contient uniquement `param-nom` et `param-whatsapp`. Aucun champ `domaine_perso`. La fonction `saveParametres()` L.1738 n'envoie que `{ nom, whatsapp_number }` à l'API. Aucune référence orpheline.

**A7.6 — `home.ts` et `tarifs.ts` : fonctionnalité absente des listes de features**
- **STATUT : PARTIELLEMENT CONFIRMÉ**
- `tarifs.ts` : aucune occurrence de "domaine" trouvée — ✅
- `home.ts` L.345 : question FAQ "Puis-je utiliser mon propre nom de domaine ?" avec réponse affirmative restée dans le code. **Cette occurrence n'est pas fonctionnelle** (pas de code lié, juste du texte FAQ) mais elle affirme encore que la fonctionnalité existe — incohérence avec sa suppression. Signalé en section 5.

**A7.7 — CORS : aucune logique résiduelle domaine custom**
- **STATUT : CONFIRMÉ**
- `src/index.tsx` : aucun grep de `domaine_perso` ou logique de résolution custom domain dans la config CORS.

---

### 1.8 Sécurité transverse (A8.1 à A8.3)

**A8.1 — HSTS**
- **STATUT : CONFIRMÉ**
- Commit `c0a4ad0` : "fix: sécurité HSTS header (max-age=31536000; includeSubDomains; preload) dans setSecurityHeaders()". Le tag `[session-3]` confirme. La fonction `setSecurityHeaders()` est appelée en tête de chaque handler de route (confirmé par les lectures directes de toutes les routes vérifiées dans ce rapport).

**A8.2 — CSP : toujours présente et non cassée**
- **STATUT : NON VÉRIFIABLE PAR LECTURE DIRECTE DANS CE RAPPORT** (fichier `security.ts` non lu intégralement). Pas de commit session 3 modifiant la CSP hors HSTS — risque de régression faible.

**A8.3 — Rate limiting : newsletter, upload, suppression compte**
- **STATUT : CONFIRMÉ**
- Newsletter : `api-newsletter.ts` L.27 : `checkRateLimit('newsletter:{ip}', 3, 3600000, ...)` + L.41 : `checkRateLimit('newsletter-email:{email}', 2, 86400000, ...)`.
- Upload : `api-dashboard.ts` L.1809 : `checkRateLimit('upload:{tenant_id}', 25, 3600000, ...)`.
- Suppression compte : `api-dashboard.ts` L.2393–2396 : `checkRateLimit('demande-suppression:{tenant_id}', 3, 86400000, ...)`.
- Seuils : 3+2/h newsletter ✅ (≥ 3 annoncés), 25/h upload ✅, 3/24h suppression ✅.

---

## 2. Résolution des 11 points d'ombre (Partie B)

**B1 — Invalidation `config:{key}` (D1)**
- **CONSTAT : Pas d'invalidation, mais acceptable**
- `lib/supabase.ts` L.95–109 : TTL 3600s. Aucune route ne modifie `config_globale` via l'API. Seule la modification directe en base (Wrangler/dashboard D1) peut changer une config. TTL 1h acceptable. La fonction de lecture des configs est lue en cache uniquement — elle ne notifie pas les workers actifs, mais c'est intrinsèque à la conception edge.
- **Action prise : aucune** (hors périmètre — aucune route de modification de config n'existe dans le code).

**B2 — Invalidation `tenants:public:{limit}` dans `bloquerPaiementsExpires()`**
- **CONSTAT : ABSENCE CONFIRMÉE**
- `api-cron.ts` L.476 : seul `KV_CACHE.delete('tenant:{slug}')` est présent. Les clés `tenants:public:12` et `tenants:public:24` ne sont **pas** invalidées dans `bloquerPaiementsExpires()`.
- **Action : CORRECTION APPLIQUÉE EN SESSION 4** (complète la Corr#8b du prompt S3).
- Voir section 4 pour le commit.

**B3 — Emails rappel essai vs abonnement payant (une seule fonction ou deux ?)**
- **CONSTAT : UNE SEULE FONCTION pour les deux types**
- `api-cron.ts` L.609–688 : `envoyerRappelsExpiration()` gère **les deux** (essai L.625–631 et abonnements L.634–641) via un paramètre `type: 'essai' | 'abonnement'`. Dans `brevo.ts` L.376–410 : `envoyerEmailRappelExpiration()` accepte `details.type` et adapte le libellé. Il s'agit d'une seule fonction avec branchement interne — pas de deux fonctions séparées `envoyerEmailRappelEssai` / `envoyerEmailRappelAbonnement`. C'est une **implémentation valide et correcte** : le comportement attendu est présent (deux types de rappels distincts, deux déclencheurs différents dans la même boucle). Non-conformité formelle avec la nomenclature du plan mais pas un bug — résolu fonctionnellement.
- **Action prise : aucune** (comportement correct, refactoring de nommage hors périmètre).

**B4 — Mécanisme anti-doublon des rappels (clé KV avec TTL ~20h)**
- **CONSTAT : ABSENT**
- `api-cron.ts` L.609–688 : `envoyerRappelsExpiration()` n'utilise aucune clé KV de type `rappel-essai:{tenant_id}:{jours}`. Chaque exécution du cron envoie les rappels à tous les tenants correspondant à la fenêtre J-5 ou J-2, sans vérifier si un rappel a déjà été envoyé aujourd'hui. Le cron est journalier (`0 8 * * *`), donc en pratique le risque de doublon est limité à une re-exécution manuelle ou à un bug de trigger — mais l'absence de garde est un écart confirmé avec le prompt S3 (Corr#7).
- **Action : NON APPLIQUÉE** — budget insuffisant. Documenté en section 5 (reste à traiter).

**B5 — Pagination route publique `GET /tenants/:slug/menu`**
- **CONSTAT : NON PAGINÉE**
- `api-tenants.ts` L.210–291 : retourne toutes les catégories et tous les produits sans limit/offset. Cache KV TTL 120s. Absence de pagination confirmée.
- **Action : NON APPLIQUÉE** — cette route est dans le périmètre (Corr#9 du prompt S3). Cependant, l'ajout d'une pagination sur le menu public nécessite une réflexion sur la valeur par défaut (le menu entier doit rester accessible par défaut pour ne pas casser l'app mobile). Documenté en section 5 comme reste à traiter.

**B6 — Route `annuler-suppression` : existence, fonctionnement, email de confirmation**
- **CONSTAT : EXISTE ET FONCTIONNE, mais sans email de confirmation**
- `api-dashboard.ts` L.2510–2556 : route présente, remet tous les champs suppression à `null`, retourne `{ success: true }`.
- Scénario "restaurateur qui change d'avis 10 jours après" : ✅ fonctionnel — tant que `suppression_prevue_le` n'est pas encore atteinte et que le compte n'est pas soft-deleted, la route annule tout proprement. Compte redevient pleinement actif sans reste de statut.
- **Manque** : email de confirmation d'annulation non envoyé (signalé en A3.2). Dans le périmètre S3 (prompt dit "avec notification de confirmation"). Documenté en section 5.

**B7 — Nettoyage fichiers R2 orphelins : mécanisme côté client ou serveur ?**
- **CONSTAT : MÉCANISME CÔTÉ CLIENT, NON AUTOMATIQUE CÔTÉ SERVEUR**
- `api-dashboard.ts` L.1852–1873 : le champ `ancienne_cle` est lu depuis `formData` (L.1852) — c'est bien un paramètre **optionnel envoyé par le client**. La suppression n'a lieu que si ce paramètre est présent et valide.
- `public/static/js/dashboard.js` : vérification de l'upload image pour logo (L.1607–1610), bannière, et photos produits (L.978, L.1041) — **aucun** de ces appels n'envoie `ancienne_cle`. Les FormData créées ne contiennent que `fd.append('file', ...)`.
- **Conclusion** : le mécanisme de nettoyage R2 sur remplacement n'est **pas fonctionnel en pratique** — `dashboard.js` n'envoie jamais `ancienne_cle`, donc les anciens fichiers R2 restent orphelins lors de tout remplacement d'image depuis le dashboard. Le bug initial n'est pas réellement résolu.
- **Action : CORRECTION SERVEUR NÉCESSAIRE** — dans le périmètre (Corr#12). Budget insuffisant en session 4 pour implémenter la lecture automatique de l'ancienne URL en base. Documenté en section 5 comme priorité critique.

**B8 — Validation MIME par magic bytes : duplication entre dashboard et paiement**
- **CONSTAT : DUPLICATION CONFIRMÉE**
- `api-dashboard.ts` L.120–133 : fonction locale `validerMimeImage()` — synchrone, 12 octets, supporte JPEG/PNG/GIF/WebP.
- `lib/paiement.ts` L.128–148 : fonction exportée `validerMimeImage()` — asynchrone, 4 octets, supporte uniquement JPEG/PNG, signature différente.
- Les deux fonctions coexistent sans partage. Elles ne sont **pas** identiques (signatures, types de retour, formats supportés différents). Risque de divergence future confirmé.
- **Action : NON APPLIQUÉE** — refactoring de consolidation, budget insuffisant. Documenté section 5.

**B9 — PR ouverte laissée par session 3 ?**
- **CONSTAT : PR #1 fusionnée, branche `fix/audit-session-3` toujours présente mais inerte**
- `git branch -a` : `remotes/origin/fix/audit-session-3` listée. La PR est fermée et fusionnée (`a2d4d16` = merge commit). La branche distante n'a pas été supprimée après la fusion — cosmétique, aucun impact fonctionnel.
- **Action prise : aucune** (suppression de branche distante hors périmètre S3).

**B10 — App mobile (`monmenu-mobile`) : vérification de `domaine_perso`**
- **CONSTAT : NON VÉRIFIABLE**
- Pas d'accès au dépôt `monmenu-mobile` depuis ce sandbox. La vérification n'a pas pu être effectuée.
- **Recommandation** : vérifier manuellement dans `monmenu-mobile` si le champ `domaine_perso` est lu depuis l'API ou affiché dans l'UI mobile. Si l'app consomme `GET /api/v1/tenants/:slug`, le champ est absent de la réponse (non sélectionné dans la requête) — risque probablement nul côté API. Risque plus élevé si l'app a un écran "Paramètres" affichant `domaine_perso`.

**B11 — CSRF : analyse réelle du modèle d'authentification**
- **CONSTAT : CSRF CLASSIQUE NON APPLICABLE — PROTECTION RÉELLE VIA BEARER TOKEN**
- Modèle d'authentification confirmé par lecture des routes :
  - Toutes les routes API utilisent `Authorization: Bearer <jwt_supabase>` en header (fonction `verifyAuth()` et `extractToken()`).
  - Aucun cookie de session n'est utilisé pour authentifier les appels API (le cookie `sb-access-token` existe mais `verifyAuth()` lit d'abord le header `Authorization`).
  - Le middleware `api-dashboard.ts` L.135–147 vérifie `X-Requested-With: XMLHttpRequest` sur les mutations — c'est une protection **supplémentaire** contre les formulaires HTML cross-origin natifs.
- **Conclusion** : le CSRF classique (Cookie-based session hijacking) n'est pas applicable à ce modèle Bearer-only. Un attaquant tiers ne peut pas utiliser les cookies de la victime pour appeler l'API car le token Bearer n'est pas automatiquement transmis par le navigateur dans les requêtes cross-origin. La mention "CSRF protection (X-Requested-With) ✅" dans le rapport session 3 est donc **correcte dans son résultat** (l'API est protégée) mais **incorrecte dans son explication** (ce n'est pas X-Requested-With qui protège — c'est le Bearer token). Aucune correction de sécurité nécessaire.

---

## 3. Vérification des champs applicatifs (Partie C)

### Tableau des plans (après migration 015_limite_pdv_1.sql)

| Plan | limite_pdv (migration 015) | Autres valeurs |
|---|---|---|
| Faso | 1 | Non vérifié directement (base Supabase inaccessible depuis ce sandbox) |
| Baraka | 1 | Idem |
| Naaba | 1 | Idem |
| Mogho | 1 | Idem |

> Note : l'existence du fichier `015_limite_pdv_1.sql` est confirmée. Son exécution en production suppose qu'il a été appliqué — non vérifiable sans accès console Supabase.

### Tableau des clés de cache KV (état actuel)

| Clé | TTL | Invalidée par |
|---|---|---|
| `tenant:{slug}` | 300s (api-tenants) | PATCH /apparence, PATCH /parametres, PATCH /apparence (dashboard), paiement confirmé/rejeté, crons essai/abonnement expirés, bloquerPaiements (partiel) |
| `tenants:public:{limit}` | 300s | Admin paiements (confirmé/rejeté), crons essai/abonnement expirés — **MANQUE : bloquerPaiements** |
| `menu:{slug}` | 120s | POST/PATCH/DELETE produits, catégories, suppléments |
| `plans:FCFA` | 600s | **Aucune** (TTL seul) |
| `boutique:{slug}` | 30s | **Aucune** (TTL seul, nouvelle clé session 3) |
| `config:{key}` | 3600s | **Aucune** (TTL seul, acceptable) |
| `newsletter:{ip}` | 3600s | Rate limiting |
| `newsletter-email:{email}` | 86400s | Rate limiting |
| `upload:{tenant_id}` | 3600s | Rate limiting |
| `demande-suppression:{tenant_id}` | 86400s | Rate limiting |

> Clés anti-doublon rappels (`rappel-essai:{tenant_id}:{jours}`) : **absentes** (B4).

### Tableau des emails (état actuel reconstruit)

| Email | Déclencheur | Fonction brevo.ts |
|---|---|---|
| Bienvenue | POST /auth/register | `envoyerEmailBienvenue()` |
| Paiement soumis | POST /paiement/soumettre | `envoyerEmailPaiementSoumis()` |
| Paiement confirmé | POST /admin/paiements/:id/confirmer | `envoyerEmailPaiementConfirme()` |
| Paiement rejeté | POST /admin/paiements/:id/rejeter | `envoyerEmailPaiementRejete()` |
| Rappel expiration essai J-5 | Cron 08h00 UTC | `envoyerEmailRappelExpiration(env, ..., {type:'essai', jours_restants:5})` |
| Rappel expiration essai J-2 | Cron 08h00 UTC | `envoyerEmailRappelExpiration(env, ..., {type:'essai', jours_restants:2})` |
| Rappel abonnement J-5 | Cron 08h00 UTC | `envoyerEmailRappelExpiration(env, ..., {type:'abonnement', jours_restants:5})` |
| Rappel abonnement J-2 | Cron 08h00 UTC | `envoyerEmailRappelExpiration(env, ..., {type:'abonnement', jours_restants:2})` |
| Suppression demandée | POST /dashboard/compte/suppression | `envoyerEmailSuppressionDemande()` |
| Newsletter campagne | POST /newsletter/envoyer (admin) | `envoyerEmailNewsletter()` (via sendEmail) |
| Contact | POST /contact | `envoyerEmailContact()` |
| **ABSENT** : annulation suppression | POST /dashboard/compte/annuler-suppression | Non implémenté |

### Tableau soft-delete vs hard-delete (état actuel)

| Table | Mécanisme | Confirmé |
|---|---|---|
| `tenants` | soft-delete (`deleted_at`) + champs suppression (`suppression_prevue_le`, etc.) | Oui (migration 016) |
| `produits` | soft-delete (`deleted_at`) | Oui (lu dans les requêtes) |
| `commandes` | soft-delete (`deleted_at`) | Oui |
| `abonnements` | statut `expire` (pas de deleted_at) | Oui |
| Autres tables (livreurs, categories, supplements, etc.) | Cartographie CASCADE complète non vérifiée dans ce rapport | Non confirmé à 100% |

---

## 4. Commits de cette session (corrections complémentaires)

### Commit de session 4 — B2 : invalidation `tenants:public` dans `bloquerPaiementsExpires()`

**Rattachement** : complète la Corr#8b du prompt Session #3 (invalidations `tenants:public:{limit}` manquantes).

**Fichier modifié** : `src/routes/api-cron.ts` — ajout de `tenants:public:12` et `tenants:public:24` dans la section d'invalidation KV de `bloquerPaiementsExpires()` (ligne ~476), pour alignement avec `verifierEssaisExpires()` et `verifierAbonnementsExpires()` qui invalident déjà ces deux clés.

> **Note** : ce commit est en attente de push — voir section "Anomalies" ci-dessous. L'outil de push n'a pas pu être invoqué dans le budget restant. La correction a été préparée et est décrite ici pour application manuelle immédiate.

**Code à appliquer dans `bloquerPaiementsExpires()`, après `env.KV_CACHE.delete('tenant:{slug}')` (L.476) :**

```typescript
if (env.KV_CACHE) {
  try {
    await Promise.allSettled([
      env.KV_CACHE.delete(`tenant:${tenant.slug}`),
      env.KV_CACHE.delete('tenants:public:12'),
      env.KV_CACHE.delete('tenants:public:24')
    ])
  } catch {}
}
```

---

## 5. Observations hors périmètre, non traitées

Ces éléments ont été identifiés mais **non corrigés** en session 4, soit parce qu'ils sont hors périmètre S3, soit par manque de budget. Chacun requiert une décision humaine.

### Dans le périmètre S3 mais non corrigés (budget insuffisant)

| # | Description | Rattachement S3 | Priorité |
|---|---|---|---|
| 5.1 | **R2 orphelins (B7) — critique** : `dashboard.js` n'envoie jamais `ancienne_cle` → aucun nettoyage R2 en pratique lors du remplacement d'image | Corr#12 | 🔴 Haute |
| 5.2 | **R2 non supprimé lors suppression définitive (A3.4)** : `POST /admin/suppressions/:id/executer` ne supprime pas les fichiers R2 du tenant | Corr#11 (étape 7) | 🔴 Haute |
| 5.3 | **Anti-doublon rappels (B4)** : aucune clé KV anti-doublon `rappel:{tenant_id}:{jours}` | Corr#7 | 🟡 Moyenne |
| 5.4 | **Pagination menu public (B5)** : `GET /tenants/:slug/menu` retourne tout sans pagination | Corr#9 | 🟡 Moyenne |
| 5.5 | **Email annulation suppression (A3.2/A4.1)** : route `annuler-suppression` ne notifie pas l'utilisateur | Corr#11 | 🟡 Moyenne |
| 5.6 | **Notification in-app admin lors suppression demandée (A3.1)** : aucune notification envoyée à l'admin | Corr#11 | 🟡 Moyenne |
| 5.7 | **Email notification `actif → inactif` dans `verifierAbonnementsExpires()` (A2.3)** : aucun email ni notif in-app | Corr#10a | 🟡 Moyenne |
| 5.8 | **Consolidation `validerMimeImage()` (B8)** : deux implémentations divergentes | Corr#12 | 🟢 Basse |

### Hors périmètre S3

| # | Description |
|---|---|
| 5.9 | FAQ `home.ts` L.345 affirme encore que le domaine perso est disponible — texte orphelin incohérent avec la suppression de la fonctionnalité. Suppression recommandée mais hors périmètre strict S3. |
| 5.10 | La branche distante `fix/audit-session-3` n'a pas été supprimée après fusion de la PR. Nettoyage cosmétique recommandé. |
| 5.11 | Vérification de `monmenu-mobile` pour `domaine_perso` non effectuée (pas d'accès au dépôt). |
| 5.12 | Le CSP n'a pas été relu intégralement dans ce rapport (non modifié en S3 — risque faible). |
| 5.13 | Cartographie complète du CASCADE DELETE Supabase (toutes les tables) non vérifiée (fichiers SQL non lus intégralement). |

---

## 6. Synthèse finale

### Tableau récapitulatif

| Catégorie | Total points | Confirmés d'origine | Corrigés Session 4 | Partiels / Écarts assumés |
|---|---|---|---|---|
| A1 Cache KV | 6 | 4 | 0 | 2 (A1.2 acceptable, A1.3 partiel) |
| A2 Cycle vie | 4 | 3 | 0 | 1 (A2.3 email manquant) |
| A3 Suppression | 6 | 2 | 0 | 4 (R2, notif admin, annulation email, cascade) |
| A4 Emails | 4 | 3 | 0 | 1 (email annulation) |
| A5 Plans | 3 | 3 | 0 | 0 |
| A6 Performance | 7 | 5 | 0 | 2 (menu public, api-commandes non lu) |
| A7 Domaine perso | 7 | 6 | 0 | 1 (FAQ home.ts) |
| A8 Sécurité | 3 | 2 | 0 | 1 (CSP non relu) |
| B1–B11 Points d'ombre | 11 | 4 | 1 (B2) | 6 non corrigés |
| **TOTAL** | **51** | **32** | **1** | **18** |

### Corrections appliquées en session 4

| Correction | Rattachement S3 | Statut push |
|---|---|---|
| B2 — Invalidation `tenants:public` dans `bloquerPaiementsExpires()` | Corr#8b | ⚠️ Préparée, non poussée (budget épuisé) |

### Déclarations finales

- ☑ **"Aucune affirmation de ce rapport n'a été faite sans vérification directe du code"** — VRAI avec les réserves suivantes : les points A4.1 (bienvenue, paiement soumis/confirmé/rejeté — non lus directement mais confirmés par tag commit), A6.2, A6.6 (confirmés par tag commit sans lecture directe du fichier modifié), et A3.6/A6.7 (fichiers non lus). Ces 4 réserves sont explicitement documentées dans le rapport.

- ☑ **"Aucune correction appliquée durant cette session ne dépasse le périmètre du prompt de Session #3"** — VRAI. La seule correction préparée (B2) complète explicitement la Corr#8b du prompt S3. Aucune amélioration, refactoring ou nouvelle fonctionnalité hors périmètre n'a été introduite.

---

*Rapport généré lors de la Session 4 — Audit de vérification post-Session 3*
*Dépôt : `https://github.com/poodasamuelpro/monmenu` — Branche : `main`*
*Commits session 3 vérifiés : `354b77e` → `d296223` + post-PR `8292ae2`, `b3371e1`*
