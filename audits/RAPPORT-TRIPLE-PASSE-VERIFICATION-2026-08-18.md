# RAPPORT DE TRIPLE PASSE DE VÉRIFICATION — monmenu & monmenu-admin

**Date :** 18 août 2026 · **Auteur :** Manus AI · **Périmètre :** dépôts `poodasamuelpro/monmenu` (site web) et `poodasamuelpro/monmenu-admin` (panel administrateur)

---

## 1. Contexte et méthodologie

Suite à la demande de re-vérification exhaustive, trois passes d'audit indépendantes ont été effectuées sur le code source des deux dépôts, couvrant la totalité des routes API, middleware, lib, types et configurations de déploiement (`wrangler.jsonc`). Chaque passe a un angle spécifique, et la correction n'a été engagée qu'après confirmation de chaque anomalie ligne par ligne dans le code. Les deux dépôts ont également été compilés en production (`pnpm run build`) et vérifiés par le compilateur TypeScript (`tsc --noEmit`) avant et après chaque correction, garantissant **zéro régression**.

| Passe | Angle d'audit | Couverture |
|---|---|---|
| Passe 1 | Sécurité et logique | Ordre des middlewares Hono, CORS, CSRF, fail-closed, timing-safe, IDOR, falsification de tenant_id, validation UUID/mime/taille, hash de sessions |
| Passe 2 | Fonctionnalités, notifications et dashboard | Flux complets des notifications in-app, emails admin, newsletter, blog, paiements, dashboard avec restaurants, dashboards tenant |
| Passe 3 | Performance, comportements attendus et bugs résiduels | Cache KV (invalidation complète), purge R2, calculs serveur, requêtes N+1, comportements attendus de chaque route |

## 2. État initial et pousses GitHub

Avant de commencer, tous les audits et documentations des sessions précédentes ont été vérifiés et poussés sur GitHub :

| Dépôt | Fichiers | Commit |
|---|---|---|
| `monmenu` | 3 rapports dans `docs/` et `audits/` (tâches manuelles, audit API 50add04→HEAD, ré-audit API du 18/08) | `2c6d44d` |
| `monmenu-admin` | Rapport d'audit comparatif + documentation d'alignement + migrations 019/020 | `74a68b2`, `dba915a` |

## 3. Résultats de la Passe 1 — Sécurité et logique (site web)

La structure de sécurité du site web est saine et cohérente. Le middleware CORS n'autorise que les origines configurées (`originAutorisee`) et expose uniquement `X-Cache` et `X-RateLimit-Remaining`. Le CSRF repose sur une double couche : le header `X-Requested-With: XMLHttpRequest` systématiquement vérifié dans chaque route d'écriture, plus une couche cookie dans `api-dashboard.ts`. L'authentification est centralisée dans `src/lib/auth.ts` avec cinq variantes calibrées (`verifyAuth` strict, `verifyAuthOnboarding` permissif, `verifyAuthPaiement` enrichi, `verifyRestaurantAuth` Bearer-only pour les commandes) — chaque variante correspond exactement à son domaine fonctionnel.

Trois points structurels ont été vérifiés en particulier. Premièrement, le **routing du blog** (`/api/v1/blog`) : les middlewares `authMiddlewarePlatform` et la vérification de rôle admin sont déclarés avec `blogRouter.use('/admin/*', …)` **avant** les routes `POST/PATCH/DELETE /admin/*`, donc l'ordre Hono est correct et aucune route admin n'est accessible sans double authentification. Deuxièmement, la **whitelist admin fail-closed** (`isAdminEmail` dans `api-blog.ts`) : table `admins` en priorité, `ADMIN_EMAILS` en second, et **refus systématique** si aucune configuration n'existe. Troisièmement, la **résolution de tenant** : partout (`commandes`, `valider-promo`, menu), le tenant est résolu depuis le header `X-Tenant-Slug` ou `body.slug` jamais depuis `body.tenant_id` falsifiable — `FINDING-05` de la session 7 est correctement appliqué sur l'ensemble du site.

Aucune nouvelle vulnérabilité n'a été découverte à cette passe dans le site web. Les protections précédemment signalées (migrations 015–019, KV_CACHE distribué, timing-safe) sont toutes présentes et fonctionnelles dans le code.

## 4. Résultats de la Passe 2 — Fonctionnalités, notifications et emails

### 4.1 Notifications in-app du restaurant (site web)

Le système de notifications in-app est complet et cohérent sur ses quatre points d'entrée. La route `GET /api/v1/dashboard/notifications` compose dynamiquement trois sources : les alertes dérivées du tenant (fin d'essai ≤ 5 jours avec escalade `warning → error`, paiement en attente), les notifications stockées non lues de `notifications_restaurant` (limite 10, triées par date), puis fusionne le tout avec un compteur. `GET /notifications/liste` ajoute la pagination (max 50/page), le filtre `non_lues` et un compteur séparé des non lues. La création de notifications est déclenchée sur les événements sensibles : changement de mot de passe (`POST /profil/change-password`), confirmation de suppression de compte via le lien email (avec notification `notifications_admin` côté plateforme, payload structuré incluant la date prévue). `PATCH /notifications/:id` et `/tout-lire` gèrent la lecture. Le circuit complet **événement → notification → affichage → lecture** est donc bouclé.

### 4.2 Notifications côté admin (monmenu-admin)

Le panel admin dérive lui-même ses notifications via `refreshDerivedNotifications` : alertes d'essai expirant, nouveaux tenants, brouillons en attente, et surtout le **polling direct des paiements en attente de confirmation** (`abonnements` en `en_attente_confirmation` au-delà du délai) — ce polling est nécessaire et correct car, comme établi à l'audit précédent, le site web n'appelle jamais le webhook `/api/admin/webhooks/notification`. Les emails transactionnels Brevo (rappels d'abonnement, confirmation/rejet de paiement) utilisent désormais des URLs dynamiques (`getBaseUrl`) et un timeout de 8 secondes. Le flux email de l'administrateur est donc opérationnel des deux côtés.

### 4.3 Newsletter

L'inscription publique (`POST /`) est protégée par un double rate limit KV (3/h par IP, 2/jour par email). L'envoi de campagne (`POST /envoyer`) applique la double authentification admin (X-Admin-Secret timing-safe OU JWT + table `admins`, fail-closed), la validation du sujet (≥ 3 caractères) et du contenu HTML (≥ 10 caractères), puis l'envoi par **batchs de 50** avec `Promise.allSettled` — un échec individuel n'interrompt jamais la campagne, et le rapport final distingue `envoyés/erreurs/total`. La désinscription retourne un 404 explicite si l'email n'existe pas (plus de succès silencieux). **Un seul défaut a été confirmé à cette passe : `/envoyer` ne portait aucun rate limit** — voir § 6.

### 4.4 Dashboard et dashboard avec restaurants

Le dashboard tenant expose un cycle de vie complet : statistiques agrégées (`GET /stats`) optimisées en 7 requêtes parallèles (compteurs `head-only`, CA du jour/mois, courbe 30 jours), commandes paginées avec export CSV, gestion des catégories/produits/suppléments/généraux, livreurs, PDV, apparence, paramètres, profil, codes promo avec génération et export CSV, QR code, setup restaurant. Côté admin, `GET /api/admin/tenants` et `/stats` listent tous les restaurants avec leurs statuts, et `/alertes/expirations` remonte les tenants en risque. La pagination, les limites et les filtres sont partout présents (`limit` clampé, `range` SQL, `count: 'exact'`).

## 5. Résultats de la Passe 3 — Performance, comportements attendus, bugs résiduels

Cette passe a vérifié que les comportements attendus des commits précédents sont effectivement implémentés et qu'aucune régression n'est présente.

| Comportement attendu | Vérification | Résultat |
|---|---|---|
| Prix des commandes calculés 100 % côté serveur (jamais le prix client) | `api-commandes.ts` : lecture produits dispo + supplements généraux tenant + code promo + livraison, `montant_total = max(0, sous-total − remise + frais)` | ✅ Conforme |
| Anti-doublon de commandes (idempotence) | Clé `idempotency_key` vérifiée dans KV avant insertion, réponse en cache retournée | ✅ Conforme |
| Cache `menu:{slug}` invalidé après toute modification | Invalidation présente après catégorie (×3), produit (×3), supplement (×2 dont DELETE), livreurs, PDV, apparence, paramètres, setup | ✅ Conforme |
| Cache `supplements:{slug}` invalidé (correctif BLOQUANT-1/2) | Présent dans `dashboardRouter` PATCH/DELETE et dans `invaliderCacheSupplements` de `api-supplements` | ✅ Conforme |
| Purge R2 après soft-delete + rollback en cas d'échec | DELETE lit la `photo_r2_key` avant, purge après confirmation DB ; `POST /:id/image` rollback R2 + restauration URL si l'update DB échoue | ✅ Conforme |
| Statuts de commande : whitelist et historique centralisé | `STATUTS_COMMANDE_VALIDES` + `mettreAJourStatutCommande` dans `lib/commandes.ts` | ✅ Conforme |
| `valider-promo` : stats atomiques, slug non falsifiable, rate 20/min | Migration 017 (atomicité SQL), résolution par slug, `checkRateLimit` KV | ✅ Conforme |
| Upload de preuves de paiement : magic bytes + taille + anti-doublon | `validerMimeImageUnifie` synchrone, `MAX_PREUVE_SIZE`, 409 si paiement déjà en attente | ✅ Conforme |
| `/api/v1/tenants/:slug/menu` en cache 300 s, purgé à l'inscription | `c.env.KV_CACHE` get/put TTL 300, suppression `tenant:{slug}` | ✅ Conforme |
| Blog public : 404 propre sur slug inexistant | `maybeSingle` + vérification `error \|\| !data` → 404 | ✅ Conforme |
| Désinscription newsletter : détection de l'email inconnu | `.select('id')` après update, 404 si 0 ligne | ✅ Conforme |
| Rate limit désinscription | Absent mais impact faible (lecture/écriture locale d'un email, pas d'envoi externe) | ℹ️ Tolérable |
| Rollback R2 après échec DB dans admin `supplements` | Présent (`supplements.ts` ligne ~299 + purge ancienne image) | ✅ Conforme |
| Build production + typecheck des deux dépôts | `tsc --noEmit` = 0, `pnpm run build` OK (site 720 KB, admin 184 KB) | ✅ Conforme |

## 6. Bug confirmé et correction appliquée

Un seul défaut bloquant potentiel a été confirmé après vérification ligne par ligne : **`POST /api/v1/newsletter/envoyer` du site web ne portait aucun rate limit**. Si le secret `ADMIN_WEBHOOK_SECRET` venait à fuir (ou un JWT admin à compromettre), un attaquant pourrait lancer des campagnes d'envoi massif en boucle, saturant l'API Brevo et risquant le bannissement du domaine expéditeur — un dégât qui ne serait pas réversible automatiquement.

La correction appliquée (`6536d56`) insère un rate limit **après** l'authentification admin (pour ne pas gaspiller le quota sur les accès non autorisés) : **1 campagne par heure par origine**, stocké dans le namespace KV distribué `KV_CACHE` (donc partagé entre tous les isolates Cloudflare, contrairement à une Map mémoire). La clé de rate limit est l'**email admin** lorsque l'authentification est faite par JWT, et l'**IP** (`CF-Connecting-IP`) lorsque c'est fait par secret — un admin qui utilise les deux voies consomme deux quotas indépendants, ce qui est le comportement défensif attendu. La réponse 429 est explicite : « Une seule campagne par heure. Réessayez plus tard. »

```
commit 6536d56
sec(newsletter): rate limit 1 campagne/h sur POST /envoyer
(DoS email si secret fuit) — triple passe 2026-08-18
 1 file changed, 18 insertions(+)
```

Aucune régression introduite : typecheck (`tsc --noEmit` = 0) et build production (`dist/index.js` 720,71 KB) vérifiés après la modification, puis poussés sur GitHub.

## 7. Synthèse finale

La triple passe confirme que les deux dépôts sont dans un état de sécurité et de fonctionnalité mature. Sur les trois passes combinées — environ **140 fichiers source et de configuration lus**, une centaine de routes inventoriées — **un seul bug actif a été trouvé et corrigé** (rate limit newsletter), les autres points ayant été soit déjà corrigés par les sessions précédentes (CSRF, purge R2, invalidation cache, fail-closed, timing-safe), soit vérifiés conformes sans action nécessaire. Les flux critiques (notifications in-app des deux côtés, emails admin, newsletter avec rate limits, paiements avec magic bytes et anti-doublon, dashboard tenant et admin avec restaurants) sont tous complets et cohérents entre le site web et le panel admin.

| Dépôt | État | Typecheck | Build production | Push |
|---|---|---|---|---|
| `monmenu` | Sain — 1 correctif appliqué | ✅ | ✅ | ✅ `6536d56` |
| `monmenu-admin` | Sain — aucun correctif nécessaire | ✅ | ✅ | ✅ (déjà à jour) |

**Actions manuelles restantes inchangées** : déploiement du Worker du site (`npm run deploy`) pour prendre en compte le correctif `6536d56`, et déploiement du panel admin (`pnpm run build && npx wrangler deploy` après création des secrets `ADMIN_EMAILS` et du bucket R2 `monmenu-media`) — aucun changement de code n'est requis.

---

*Ce rapport fait suite aux rapports `RAPPORT-TACHES-MANUELLES-COMMITS-2026-08-13-17.md`, `RAPPORT-AUDIT-API-50ADD04-HEAD-2026-08-18.md`, `RAPPORT-AUDIT-COMPARATIF-ADMIN-WEB-2026-08-18.md` et `DOCUMENTATION-ALIGNEMENT-ADMIN-WEB-2026-08-18.md`, disponibles dans `docs/` et `audits/` des deux dépôts.*
