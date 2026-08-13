# Audit chronologique MonMenu — Historique des changements du 2026-08-12 10:03:25 au 2026-08-13 04:00:15

---

**Date et heure de génération du rapport :** 2026-08-13T13:32:23+00:00 (14h32 heure Paris)

**Commit de départ (exclu, convention `git log A..B`) :** `966e8f59fb8dfdbb32dd1646c1f49c56f51f8495`
(2026-08-12 09:49:19 +0100 — "Update dashboard.js")

**Commit de fin (inclus) :** `f9c1ece567908eec032fb108c2111140577c5201`
(2026-08-13 04:00:15 +0100 — "Update api-dashboard.ts")

**Signataire :** Agent d'audit automatisé Genspark — analyse diff-par-diff sur dépôt cloné

---

## Table des matières

1. [Résumé exécutif](#1-résumé-exécutif)
2. [Partie 1 — Journal chronologique commit par commit](#2-partie-1--journal-chronologique-commit-par-commit)
3. [Partie 2 — Synthèse thématique et trajectoires de correction](#3-partie-2--synthèse-thématique-et-trajectoires-de-correction)
4. [Partie 3 — Impact sur les contrats API](#4-partie-3--impact-sur-les-contrats-api)
5. [Partie 4 — Points d'attention pour la comparaison avec l'app mobile](#5-partie-4--points-dattention-pour-la-comparaison-avec-lapp-mobile)

---

## 1. Résumé exécutif

| Métrique | Valeur |
|---|---|
| Nombre total de commits audités | **30** |
| Période couverte | 2026-08-12 10:03:25 → 2026-08-13 04:00:15 (+0100) |
| Durée totale | ~18 heures |
| Fichiers backend modifiés | 8 fichiers TypeScript distincts |
| Fichiers frontend modifiés | 2 fichiers JavaScript distincts |
| Commits vides (tree identique au parent) | **2** (`a38b0bc` dashboard-paiement.js ; `0c5ed87` api-paiement.ts) |
| Nouvelles fonctionnalités backend | 3 (verifyAuthOnboarding, notification commande, changement mdp) |
| Failles / bugs critiques corrigés | **10 bugs numérotés** (voir Partie 2) |
| Changements entièrement annulés | 0 (aucun revert complet) |
| Changements retravaillés en plusieurs passes | **6 thèmes** (acces-tenant, api-auth login, setup-restaurant, boutique visible, change-password, notifications) |

### Observation préalable importante — commits vides

Deux commits de la plage ont un `git diff-tree` vide, c'est-à-dire qu'ils pointent vers **exactement le même tree** que leur commit parent :

- `a38b0bc` (2026-08-12 10:03:25) — "Update dashboard-paiement.js" : le fichier `public/static/js/dashboard-paiement.js` avait déjà été modifié au commit `0a251f2` (2026-08-12 00:11:16, hors plage). Ce commit ne contient **aucun changement réel**.
- `0c5ed87` (2026-08-12 10:05:27) — "Update api-paiement.ts" : idem, aucun diff réel.

Ces deux commits sont probablement des re-push ou des commits accidentels sans modification. Ils sont documentés mais n'ont aucun impact sur le code.

---

## 2. Partie 1 — Journal chronologique commit par commit

> Convention : la plage utilisée est `966e8f59..f9c1ece5` (commit de départ **exclu**, commit de fin **inclus**). La liste ci-dessous est **du plus ancien au plus récent**.

---

### C01 — `a38b0bc` | 2026-08-12 10:03:25 | "Update dashboard-paiement.js"

**Fichiers touchés :** aucun (commit vide — tree identique à `966e8f59`)

**Analyse :** Aucun changement de code. Le message est trompeur. Le fichier `public/static/js/dashboard-paiement.js` existait déjà avec ses modifications (appliquées au commit `0a251f2` du 12/08 à 00h11, hors plage). Ce commit est sans effet.

---

### C02 — `0c5ed87` | 2026-08-12 10:05:27 | "Update api-paiement.ts"

**Fichiers touchés :** aucun (commit vide — tree identique à `a38b0bc`)

**Analyse :** Idem C01. Aucun changement réel.

---

### C03 — `c0ad702` | 2026-08-12 10:16:53 | "Update boutique.ts"

**Fichiers touchés :** `src/pages/boutique.ts`

**Changements réels :**
- Suppression du bloc HTML `<!-- Action rapide WhatsApp -->` situé en haut à droite de la bannière de la boutique publique : un bouton rond vert (`<a href="https://wa.me/...">`) avec icône WhatsApp, positionné en `absolute top-3 right-3`.
- Ajout d'un commentaire expliquant la décision : le contact WhatsApp reste disponible via le footer (section Contact), le bouton flottant sur la bannière est retiré pour des raisons de design/UX.
- Changement purement cosmétique côté rendu HTML, aucune route API affectée.

---

### C04 — `e2b5dc3` | 2026-08-12 10:51:28 | "Update plans.ts"

**Fichiers touchés :** `src/lib/plans.ts`

**Changements réels :**
- Ajout d'un espace de fin de ligne sur la première ligne (`// src/lib/plans.ts ` au lieu de `// src/lib/plans.ts`). Diff = **1 caractère espace**. Changement purement cosmétique.

---

### C05 — `6e22bf3` | 2026-08-12 10:51:44 | "Update api-admin-paiements.ts"

**Fichiers touchés :** `src/routes/api-admin-paiements.ts`

**Changements réels :**
- Ajout d'un espace de fin de ligne dans le commentaire du JSDoc en tête de fichier. Changement purement cosmétique, aucune logique modifiée.

---

### C06 — `2fd9aa4` | 2026-08-12 10:51:57 | "Update api-auth.ts"

**Fichiers touchés :** `src/routes/api-auth.ts`

**Changements réels :**
- Ajout d'un espace de fin de ligne sur la première ligne du fichier. Changement purement cosmétique.

---

### C07 — `cbf480f` | 2026-08-12 10:52:17 | "Update api-paiement.ts"

**Fichiers touchés :** `src/routes/api-paiement.ts`

**Changements réels :**
- Ajout d'un espace de fin de ligne dans le JSDoc. Changement purement cosmétique.

---

### C08 — `afb6b6b` | 2026-08-12 10:52:31 | "Update api-dashboard.ts"

**Fichiers touchés :** `src/routes/api-dashboard.ts`

**Changements réels :**
- Ajout d'un espace de fin de ligne dans le commentaire en tête de fichier. Changement purement cosmétique.

---

### C09 — `86c1347` | 2026-08-12 10:52:49 | "Update api-commandes.ts"

**Fichiers touchés :** `src/routes/api-commandes.ts`

**Changements réels :**
- Ajout d'un espace de fin de ligne dans le commentaire `// ARCHITECTURE :`. Changement purement cosmétique.

---

### C10 — `f45fd53` | 2026-08-12 10:53:33 | "Update api-plans.ts"

**Fichiers touchés :** `src/routes/api-plans.ts`

**Changements réels :**
- Ajout d'un espace de fin de ligne dans le commentaire en tête de fichier. Changement purement cosmétique.

---

### C11 — `ae7b10b` | 2026-08-12 10:53:44 | "Update api-tenants.ts"

**Fichiers touchés :** `src/routes/api-tenants.ts`

**Changements réels :**
- Ajout d'un espace de fin de ligne dans le commentaire en tête de fichier. Changement purement cosmétique.

**Note :** Les commits C04 à C11 constituent une série de 8 commits cosmétiques effectués en ~2 minutes (10:51–10:53). Ils semblent être le résultat d'une opération de nettoyage ou de formatage automatique de fichiers, sans impact sur le comportement.

---

### C12 — `fcfbb59` | 2026-08-12 11:22:03 | "Update security.ts"

**Fichiers touchés :** `src/lib/security.ts`

**Changements réels :**
- **Correction CSP (Content Security Policy)** : dans la directive `connect-src`, remplacement de `*.supabase.co` par `https://*.supabase.co wss://*.supabase.co`.
- **Raison documentée :** Le navigateur ne fait pas d'upgrade implicite `https → wss` dans le matching CSP. Sans `wss://*.supabase.co`, la connexion WebSocket de Supabase Realtime était bloquée par la CSP, causant un `CHANNEL_ERROR` dans `initRealtimeCommandes()` et un bascule systématique vers le fallback polling.
- **Impact :** Correction de sécurité/fonctionnalité affectant le temps réel des commandes dans le dashboard.

---

### C13 — `1eb2712` | 2026-08-12 21:46:41 | "Update acces-tenant.ts"

**Fichiers touchés :** `src/lib/acces-tenant.ts`

**Changements réels — refonte de l'ordre de priorité dans `verifierAccesTenant()` :**

Avant ce commit (version "CYCLE-6"), l'ordre d'évaluation était :
1. `actif` → accesComplet
2. `essai` non expiré → accesComplet
3. `en_attente_paiement_initial` → accesAbonnementSeul (**bloquant avant la vérification de la fenêtre de grâce**)
4. `suspendu` → aucun accès
5. Vérification fenêtre de grâce (abonnement `en_attente_confirmation` < 72h) → accesComplet
6. `inactif` → accesAbonnementSeul

Après ce commit (état final) :
1. `actif` → accesComplet
2. `essai` non expiré → accesComplet
3. `suspendu` → aucun accès (**remonté en 3e position**)
4. **Vérification fenêtre de grâce en 4e position** (avant `en_attente_paiement_initial`)
5. `en_attente_paiement_initial` sans fenêtre de grâce → accesAbonnementSeul
6. `inactif` ou autre → accesAbonnementSeul

**Bug corrigé :** Un tenant en `en_attente_paiement_initial` qui venait de soumettre son tout premier paiement (statut abonnement = `en_attente_confirmation`, valide < 72h) n'obtenait jamais la fenêtre de grâce, car la branche `en_attente_paiement_initial` retournait `accesAbonnementSeul` AVANT que la requête de vérification de l'abonnement ne soit faite.

---

### C14 — `5ff7fa4` | 2026-08-12 21:50:15 | "Update api-paiement.ts"

**Fichiers touchés :** `src/routes/api-paiement.ts`

**Changements réels dans `POST /api/v1/paiement/soumettre` :**
- L'`await adminClient.from('tenants').update({...}).eq('id', auth.tenant_id)` (mise à jour de `paiement_en_attente_depuis`, `reference_paiement_active`, `updated_at`) est enveloppé dans un `try/catch` non bloquant.
- **Raison documentée :** Une erreur transitoire sur cette ligne faisait planter toute la requête (HTTP 500) alors que l'abonnement était **déjà enregistré en base**, et empêchait l'insertion de la notification restaurant qui se trouvait juste après.
- Nettoyage de commentaires verbeux dans le header JSDoc.

---

### C15 — `c771390` | 2026-08-12 21:54:28 | "Update api-auth.ts"

**Fichiers touchés :** `src/routes/api-auth.ts`

**Changements réels :**

**1. `POST /api/v1/auth/login` :**
- Remplacement du client `supabaseAvecToken` (créé avec `createSupabaseClientWithToken`) par `adminClientLogin` (créé avec `createSupabaseAdminClient`) pour la requête de lookup post-authentification sur `utilisateurs_tenant`.
- Ajout de `deleted_at` dans la sélection du tenant retourné.
- **Raison documentée :** Suspicion de policy RLS Supabase sur `tenants`/`utilisateurs_tenant` restreignant la lecture aux tenants au statut `actif` — ce qui pouvait bloquer silencieusement la lecture pour un tenant en `essai` ou `en_attente_paiement_initial`, causant le faux "Aucun restaurant associé à ce compte" à la reconnexion.

**2. `POST /api/v1/auth/register` :**
- La variable `redirectTo` change de valeur conditionnelle (`estPlanGratuit ? '/bienvenue' : '/dashboard/abonnement'`) à valeur fixe `'/bienvenue'` quel que soit le plan.
- **Raison documentée :** La page `/bienvenue` gère déjà les deux cas (plan gratuit et plan payant à l'étape 5).

---

### C16 — `5ee21cf` | 2026-08-12 22:00:42 | "Update api-commandes.ts"

**Fichiers touchés :** `src/routes/api-commandes.ts`

**Changements réels dans `POST /api/v1/commandes` :**
- Ajout d'une insertion dans `notifications_restaurant` après chaque nouvelle commande créée :
  ```json
  {
    "tenant_id": "...",
    "type": "info",
    "titre": "Nouvelle commande reçue",
    "message": "Commande de {client_nom} — {montant} FCFA.",
    "lien": "/dashboard/commandes",
    "payload": { "commande_id": ..., "montant": ..., "client": ... }
  }
  ```
- Exécution via `c.executionCtx.waitUntil(...)` + `.catch(() => {})` (non bloquant).
- **Raison documentée :** Aucune notification in-app n'était créée à la réception d'une commande, malgré l'envoi WhatsApp et FCM. La cloche de notifications du dashboard (GET `/api/v1/dashboard/notifications/liste`) ne montrait donc jamais de nouvelle commande.

---

### C17 — `15efcba` | 2026-08-13 01:19:42 | "Update api-dashboard.ts"

**Fichiers touchés :** `src/routes/api-dashboard.ts`

**Changements réels — deux ajouts majeurs :**

**1. Nouvelle fonction `verifyAuthOnboarding()` :**
- Clone de `verifyAuth()` mais avec une condition de succès différente : accepte `accesComplet OU accesAbonnementSeul` (au lieu de `accesComplet` uniquement).
- Appliquée à 3 routes spécifiques : `GET /notifications`, `POST /setup-restaurant`, `GET /notifications/liste`.
- **Raison documentée :** Un tenant en `en_attente_paiement_initial` (plan payant, pas encore payé) avait `accesComplet = false`, ce qui bloquait ces 3 routes avec 401 alors qu'elles sont nécessaires avant le premier paiement.

**2. Enrichissement de `POST /profil/change-password` :**
- Ajout d'une insertion dans `notifications_restaurant` après un changement de mot de passe réussi (notification "Mot de passe modifié" avec message d'alerte si l'action n'est pas initiée par l'utilisateur).
- Ajout d'un commentaire de documentation sur la route.

---

### C18 — `c993e22` | 2026-08-13 02:02:33 | "Update api-paiement.ts"

**Fichiers touchés :** `src/routes/api-paiement.ts`

**Changements réels — refonte complète de la séquence post-insertion dans `POST /soumettre` :**

Avant : les insertions dans `notifications_admin` et `notifications_restaurant` utilisaient `.catch(() => {})` chaîné directement sur l'objet retourné par `.insert()` — ce qui est incorrect (voir C30 pour la suite de ce problème sur un autre builder), mais qui ici concernait surtout l'absence de protection autour de la construction des objets à insérer.

Après :
- Calcul de `messageConfirmation` isolé dans un `try/catch` (était appelé deux fois auparavant — une fois dans la construction de l'objet d'insertion, une fois dans la réponse JSON).
- Les deux insertions (`notifications_admin`, `notifications_restaurant`) sont chacune dans un `try/catch` explicite.
- Commentaire de section clair séparant "abonnement enregistré" du reste de la séquence.
- Réponse JSON finale utilise `messageConfirmation` (variable) au lieu d'appeler `messagePreuveRecue()` une deuxième fois.
- **Bug corrigé :** Si `messagePreuveRecue()` levait une exception, celle-ci remontait jusqu'au handler Hono et produisait un 500 alors que l'abonnement était déjà enregistré.

---

### C19 — `c854304` | 2026-08-13 02:04:39 | "Update api-tenants.ts"

**Fichiers touchés :** `src/routes/api-tenants.ts`

**Changements réels :**

**`GET /api/v1/tenants/:slug` :**
- Ajout de `'en_attente_paiement_initial'` dans le filtre `.in('statut', [...])` (était : `['actif', 'essai']`, devient : `['actif', 'essai', 'en_attente_paiement_initial']`).
- **Raison documentée :** Un tenant qui choisit un plan payant à l'inscription reçoit ce statut et ne devait pas être invisible sur sa boutique publique.

**`GET /api/v1/tenants/:slug/menu` :**
- Même ajout de `'en_attente_paiement_initial'` dans le filtre `.in('statut', [...])`.

---

### C20 — `a964963` | 2026-08-13 02:05:55 | "Update api-commandes.ts"

**Fichiers touchés :** `src/routes/api-commandes.ts`

**Changements réels dans `POST /api/v1/commandes` :**
- Ajout de `'en_attente_paiement_initial'` dans le filtre `.in('statut', ['actif', 'essai'])` → `['actif', 'essai', 'en_attente_paiement_initial']` sur la requête de vérification du tenant.
- **Raison documentée :** Cohérence avec C19 — la boutique étant visible pour ce statut, les commandes doivent aussi être acceptables. Sans ce correctif, la boutique s'affichait mais toute tentative de commande échouait avec "Restaurant introuvable ou inactif".

---

### C21 — `7d20e1a` | 2026-08-13 02:07:34 | "Update api-auth.ts"

**Fichiers touchés :** `src/routes/api-auth.ts`

**Changements réels dans `POST /api/v1/auth/login` :**
- Le correctif C15 (client `supabaseAvecToken` → client `adminClientLogin`) est conservé et clarifié, mais la raison documentée évolue : la v1 du correctif supposait une race condition sur le singleton ; la v2 (C21) identifie la **cause réelle** comme une policy RLS Supabase sur `tenants`/`utilisateurs_tenant` qui restreint la lecture aux tenants `actif` — bloquant silencieusement les tenants `essai` ou `en_attente_paiement_initial`.
- Le commentaire de tête de fichier remplace "CORRECTIF LOGIN" par "CORRECTIF BUG-4".
- Aucun changement de logique par rapport à C15 : le client admin est toujours utilisé, seule la justification est mise à jour.

---

### C22 — `a26ebbb` | 2026-08-13 02:29:39 | "Update api-dashboard.ts"

**Fichiers touchés :** `src/routes/api-dashboard.ts`

**Changements réels majeurs dans `POST /api/v1/dashboard/setup-restaurant` :**

**Problème identifié (BUG-2) :**
- L'appel `c.env.R2_MEDIA.put(...)` pour le logo et la bannière n'était pas dans un `try/catch`. En cas d'erreur, toute la requête plantait AVANT même de mettre à jour `tenants` et `points_de_vente`.

**Corrections apportées :**
- Upload logo isolé dans son propre `try/catch` ; variable `logoErreur` ajoutée.
- Upload bannière isolé dans son propre `try/catch` ; variable `banniereErreur` ajoutée.
- Vérification de `c.env.R2_MEDIA` avant d'appeler le binding.
- Réponse JSON enrichie : `logo_enregistre: boolean`, `banniere_enregistree: boolean`, `logo_erreur?: string`, `banniere_erreur?: string`.
- Le client utilisé reste `createSupabaseClientWithToken` à ce stade (ce problème sera corrigé au commit suivant C23).

---

### C23 — `9fadd91` | 2026-08-13 02:33:54 | "Update dashboard.js" (v2.1.0)

**Fichiers touchés :** `public/static/js/dashboard.js`

**Changements réels :**

**Suppression du code tronqué :** Le fichier précédent se terminait brutalement au milieu de `showAddCodePromoModal()` (fin de fichier sans terminaison), avec du code manquant. Ce commit supprime ce code tronqué.

**Ajout BUG-5 — Formulaire de changement de mot de passe :**
- Dans `loadParametres()` : remplacement du bouton "Demander un lien de réinitialisation" (qui appelait `demanderResetPassword()`, laquelle ne faisait qu'un `alert('Contactez le support...')`) par un formulaire réel avec 3 champs (mot de passe actuel, nouveau, confirmation).
- Nouvelle fonction `saveChangementMdp(e)` :
  - Validations client : longueur ≥ 8, les deux nouveaux identiques, nouveau ≠ ancien.
  - Appel `POST /api/v1/dashboard/profil/change-password` avec `{ current_password, new_password }`.
  - Gestion des états bouton (disabled pendant l'envoi), feedback visuel inline.
  - Rafraîchissement du badge de notifications si succès.
- Suppression de la fonction `demanderResetPassword()`.
- Versionnement du fichier : `v2.0.0` → `v2.1.0`.

---

### C24 — `28d0f11` | 2026-08-13 02:38:39 | "Update api-tenants.ts"

**Fichiers touchés :** `src/routes/api-tenants.ts`

**Changements réels — correction profonde du BUG-3-BIS dans `GET /api/v1/tenants/:slug` :**

**Problème identifié (BUG-3-BIS) :**
- Le correctif C19 avait ajouté `en_attente_paiement_initial` dans le filtre de statut, mais n'avait pas résolu le vrai problème : la requête utilisait `points_de_vente!inner(...)` (jointure INTERNE PostgREST). Si un tenant n'avait **aucun** point de vente actif (nouveau compte, PDV désactivé), la jointure interne ne retournait pas le tenant du tout → 404 quel que soit le statut.

**Corrections apportées :**
- Suppression complète de la jointure sur `points_de_vente` dans la requête principale sur `tenants` (on ne sélectionne plus que les colonnes du tenant lui-même).
- Ajout d'une requête **séparée et non bloquante** pour récupérer le PDV : `adminClient.from('points_de_vente').select(...).eq('tenant_id', ...).eq('actif', true).order('created_at', asc).limit(1).maybeSingle()`.
- Si aucun PDV actif n'existe → `pdv = null`, mais la boutique s'affiche quand même (l'UI gère déjà `pdv === null`).
- Ajout de la gestion explicite de l'erreur Supabase (avant : absence de vérification de `error`).
- Cache KV : on ne met plus en cache que si le tenant est trouvé (évite de figer un 404 temporaire).
- `GET /api/v1/tenants/:slug/menu` : non affecté par ce sous-bug (ne faisait déjà pas de jointure inner sur PDV).

---

### C25 — `84692095` | 2026-08-13 02:41:37 | "Add promo code form and related functions"

**Fichiers touchés :** `public/static/js/dashboard.js`

**Changements réels :**
- Le commit C23 avait supprimé le code tronqué de `showAddCodePromoModal()`. Ce commit restaure la fin manquante du formulaire + toutes les fonctions associées :
  - Fin du HTML du formulaire de création de code promo (champs Type, Valeur, Date d'expiration, Utilisations max, bouton submit).
  - `updatePromoValeurMax()` : adapte les contraintes du champ Valeur selon le type (pourcentage/montant_fixe).
  - `submitAddCodePromo(e)` : soumet `POST /api/v1/dashboard/codes-promo`.
  - `supprimerCodePromo(promoId)` : appelle `DELETE /api/v1/dashboard/codes-promo/:id`.
  - `copierCodePromo(code, silencieux)` : copie dans le presse-papiers avec toast de confirmation.
  - `exportCodesPromo()` : télécharge `GET /api/v1/dashboard/codes-promo/export-csv` en fichier `.csv`.
  - `loadPdv()`, `parsePdvHoraires()`, `renderPdvConfig()`, `renderPdvHorairesEditor()` : section Point de Vente complète du dashboard.

**Note :** C23 + C25 constituent en réalité un seul changement en deux passes (C23 a nettoyé le fichier tronqué, C25 a ré-ajouté le code manquant correctement).

---

### C26 — `f6bc9b3` | 2026-08-13 03:24:13 | "Update api-dashboard.ts"

**Fichiers touchés :** `src/routes/api-dashboard.ts`

**Changements réels — deux corrections majeures :**

**1. BUG-UPLOAD-BIENVENUE dans `POST /setup-restaurant` :**
- **Problème :** Le C22 avait corrigé le crash lors de l'upload R2, mais pas le problème d'écriture en base. La route utilisait `createSupabaseClientWithToken()` (client RLS-scopé) pour la mise à jour de `tenants`. Or la policy RLS est pensée pour les tenants `actif`/`essai` — un tenant `en_attente_paiement_initial` ne matchait aucune ligne (`UPDATE` à 0 ligne sans erreur PostgREST), causant un faux `success: true` alors que rien n'était écrit.
- **Fix :**
  - Remplacement de `createSupabaseClientWithToken` par `createSupabaseAdminClient` (service role) pour toutes les écritures dans cette route.
  - Ajout de `.select('id')` sur l'`UPDATE tenants` + vérification explicite que `tenantUpdatedRows.length > 0` (erreur 404 si 0 ligne affectée).
  - Création du PDV si inexistant (`INSERT` au lieu d'`UPDATE` échouant silencieusement) : logique "créer si absent, sinon mettre à jour" (`upsert` manuel).

**2. BUG-CHANGE-PASSWORD dans `POST /profil/change-password` :**
- **Problème :** La route produisait un HTTP 500 systématique. `auth.getUser()` et `auth.updateUser()` appelés **sans argument** exigent une session GoTrue préalablement posée via `setSession()` ; `createSupabaseClientWithToken()` ne fait que poser un header `Authorization` pour PostgREST — aucune session GoTrue → exception `"Auth session missing!"` non catchée → 500.
- **Fix :**
  - `getUser()` est appelé avec le token explicite : `supabaseFrais.auth.getUser(auth.token)`.
  - Création d'un `supabaseFrais` via `createClient()` direct (non partagé, `persistSession: false, autoRefreshToken: false`).
  - La mise à jour du mot de passe passe par `adminClient.auth.admin.updateUserById(auth.user_id, { password })` (API admin, pas de session nécessaire).
  - Utilisation de `supabaseFrais` pour `signInWithPassword` (vérification du mot de passe actuel) pour éviter la contamination du singleton partagé.
- Import de `createClient` from `@supabase/supabase-js` ajouté en tête de fichier.

---

### C27 — `158d349` | 2026-08-13 03:29:53 | "Update index.tsx" (v1)

**Fichiers touchés :** `src/index.tsx`

**Changements réels dans `fetchTenantAvecPdv()` :**
- Introduction d'une constante `STATUTS_BOUTIQUE_VISIBLE = ['actif', 'essai', 'en_attente_paiement_initial']`.
- Remplacement du filtre `.in('statut', ['actif', 'essai'])` par `.in('statut', STATUTS_BOUTIQUE_VISIBLE)`.
- **Raison documentée :** Cohérence avec les correctifs C19/C20 sur api-tenants et api-commandes — la page boutique SSR (rendue côté serveur par index.tsx) retournait 404 pour un tenant en `en_attente_paiement_initial`, même si api-tenants.ts permettait désormais la requête JSON.

---

### C28 — `1af0dab` | 2026-08-13 03:44:33 | "Update index.tsx" (v2)

**Fichiers touchés :** `src/index.tsx`

**Changements réels — remplacement de la logique de C27 :**
- Suppression de la constante `STATUTS_BOUTIQUE_VISIBLE` et du filtre `.in('statut', ...)`.
- **Raison documentée :** La v1 (C27) ignorait la fenêtre de grâce de 72h définie dans `acces-tenant.ts`. Un tenant en renouvellement (`inactif`, pas `en_attente_paiement_initial`) qui venait de soumettre un paiement avait `accesComplet = true` côté dashboard, mais sa boutique publique restait 404.
- **Fix définitif :** La requête Supabase ne filtre plus par statut du tout. À la place, après récupération du tenant brut, un appel à `verifierAccesTenant(env, tenantRaw.id)` détermine la visibilité :
  ```typescript
  const acces = await verifierAccesTenant(env, tenantRaw.id)
  const boutiqueVisible = acces.accesComplet || acces.mode === 'paiement_initial'
  if (!boutiqueVisible) return null
  ```
- **Source de vérité unique :** `src/lib/acces-tenant.ts` gère désormais la logique de visibilité boutique ET dashboard en un seul endroit.

---

### C29 — `a918776` | 2026-08-13 03:45:05 | "Update api-dashboard.ts"

**Fichiers touchés :** `src/routes/api-dashboard.ts`

**Changements réels — deux ajouts :**

**1. BUG-PDV-INACTIF dans `POST /setup-restaurant` :**
- **Problème :** La recherche d'un PDV existant (`existingPdv`) ne filtrait pas par `actif`, mais l'`UPDATE` qui suivait filtrait par `.eq('actif', true)`. Un PDV existant mais `actif = false` faisait matcher `existingPdv` (→ pas de création), mais l'UPDATE touchait 0 ligne SANS erreur PostgREST (même piège que BUG-UPLOAD-BIENVENUE).
- **Fix :** Suppression du filtre `.eq('actif', true)` sur l'`UPDATE` PDV existant + ciblage par `id` au lieu de `tenant_id` + ajout de `.select('id')` + vérification que `pdvUpdatedRows.length > 0`.

**2. Rate limiting sur `POST /profil/change-password` :**
- Ajout de `checkRateLimit('change-password:{user_id}', 5, 900000, KV_CACHE)` (5 tentatives / 15 minutes par utilisateur).
- Réponse 429 avec `retry_after_seconds` si limite atteinte.
- **Raison documentée :** La route ré-authentifie via `signInWithPassword` et n'avait aucune limite, permettant de deviner le mot de passe actuel sans restriction.

---

### C30 — `f9c1ece` | 2026-08-13 04:00:15 | "Update api-dashboard.ts" [COMMIT FINAL]

**Fichiers touchés :** `src/routes/api-dashboard.ts`

**Changements réels dans `POST /profil/change-password` :**

**BUG-CATCH-NOTIF :**
- **Problème :** Après les corrections de C26/C29, la route produisait ENCORE un 500, mais **après** que le mot de passe ait déjà été changé avec succès. Cause identifiée : l'insertion de la notification "Mot de passe modifié" utilisait `.catch(() => {})` chaîné sur l'objet retourné par `.insert()`. Le builder Supabase (`PostgrestFilterBuilder`) est "thenable" (possède `.then()`), mais **n'expose pas de méthode `.catch()`** — l'appel levait donc `TypeError: .catch is not a function` en production (post-minification), exception non catchée → 500 générique.
- **Fix :** Remplacement du `.catch(() => {})` chaîné par un bloc `try { await adminClient.from(...).insert({...}) } catch { /* non bloquant */ }`.

---

## 3. Partie 2 — Synthèse thématique et trajectoires de correction

---

### Thème A — Commits cosmétiques (nettoyage de fin de ligne)

**Commits :** C04, C05, C06, C07, C08, C09, C10, C11 (10:51–10:53)

**Trajectoire :** Série de 8 commits quasi-simultanés. Chacun ajoute un espace de fin de ligne dans un commentaire en tête de fichier. Aucun impact fonctionnel.

**État final :** Purement cosmétique. Zéro impact métier.

**Fichiers :** `src/lib/plans.ts`, `src/routes/api-admin-paiements.ts`, `src/routes/api-auth.ts`, `src/routes/api-paiement.ts`, `src/routes/api-dashboard.ts`, `src/routes/api-commandes.ts`, `src/routes/api-plans.ts`, `src/routes/api-tenants.ts`

**Sévérité/impact :** Cosmétique

---

### Thème B — Icône WhatsApp flottante supprimée (boutique publique)

**Commits :** C03

**Trajectoire :** Correction unique, non retravaillée.

**Avant :** Bouton rond vert WhatsApp en `absolute top-3 right-3` sur la bannière de la boutique publique.

**État final :** Bouton supprimé. Le contact WhatsApp reste accessible via le footer.

**Fichiers :** `src/pages/boutique.ts`

**Sévérité/impact :** Cosmétique (UI)

---

### Thème C — Correction CSP WebSocket Supabase Realtime

**Commits :** C12

**Trajectoire :** Correction unique, non retravaillée.

**Avant :** `connect-src ... *.supabase.co ...` (générique, ne couvre pas `wss://`).

**État final :** `connect-src ... https://*.supabase.co wss://*.supabase.co ...` — les deux protocoles sont explicitement autorisés.

**Impact :** Supabase Realtime WebSocket (commandes temps réel dans le dashboard) fonctionnait en mode dégradé (fallback polling) à cause du blocage CSP. Ce correctif rétablit le temps réel.

**Fichiers :** `src/lib/security.ts`

**Sévérité/impact :** Fonctionnalité (correction silencieuse d'une dégradation de performance)

---

### Thème D — Logique d'accès tenant (acces-tenant.ts) — 2 passes

**Commits :** C13

**Trajectoire :** Une seule itération dans la plage, mais la refonte porte sur un historique multi-cycles.

**Avant (CYCLE-6, pré-plage) :** La branche `en_attente_paiement_initial` retournait `accesAbonnementSeul` AVANT la vérification de la fenêtre de grâce de 72h, empêchant l'accès complet immédiatement après soumission d'un premier paiement.

**État final :** L'ordre des vérifications est modifié : `suspendu` est vérifié avant la fenêtre de grâce, et la fenêtre de grâce est vérifiée AVANT `en_attente_paiement_initial`. Un tenant qui vient de soumettre son tout premier paiement obtient `accesComplet` pendant 72h.

**Fichiers :** `src/lib/acces-tenant.ts`

**Sévérité/impact :** Sécurité / Fonctionnalité critique — un bug de logique d'accès qui bloquait le flux de paiement initial

---

### Thème E — Route POST /paiement/soumettre — 2 passes (C14 → C18)

**Commits :** C14, C18

**Trajectoire complète :**

**C14 (21h50)** — Première protection non bloquante : l'`UPDATE tenants` post-insertion abonnement enveloppé dans `try/catch`.

**C18 (02h02)** — Correction plus complète : identification d'une seconde cause du 500 — `messagePreuveRecue()` appelée deux fois, dont une fois dans la construction d'un objet passé à `.insert()` sans aucun `try/catch` sur la construction elle-même. Refactoring complet de la séquence post-insertion :
- `messageConfirmation` calculé une seule fois, protégé.
- Chaque notification (`notifications_admin`, `notifications_restaurant`) dans son propre `try/catch`.
- Séparateur de code clair ("À PARTIR D'ICI : l'abonnement est déjà enregistré").

**État final :** Toute erreur survenant après l'enregistrement de l'abonnement (update tenant, invalidation cache, notifications) est non bloquante et ne peut plus transformer la réponse en 500.

**Fichiers :** `src/routes/api-paiement.ts`

**Sévérité/impact :** Critique — un 500 était systématiquement renvoyé dans certaines conditions alors que l'abonnement était bien enregistré (expérience utilisateur catastrophique)

---

### Thème F — Authentification login (api-auth.ts) — 2 passes (C15 → C21)

**Commits :** C15, C21

**Trajectoire complète :**

**C15 (21h54)** — Première hypothèse : race condition sur le singleton partagé `createSupabaseClient`. Correction : utilisation de `createSupabaseClientWithToken` scopé au token de la session.

**C21 (02h07)** — Révision de l'hypothèse : la vraie cause identifiée est une **policy RLS Supabase** sur `tenants`/`utilisateurs_tenant` qui restreint la lecture aux tenants `actif`. Le client token-scopé est soumis à la RLS → blocage pour les tenants `essai` ou `en_attente_paiement_initial`. La correction définitive : utilisation du **client admin (service role)** pour ce lookup interne post-authentification, filtré strictement sur `.eq('auth_user_id', data.user.id)`.

**Important :** La correction C15 (client avec token) a été remplacée par C21 (client admin). Le correctif C15 n'est PAS actif dans l'état final — c'est C21 qui est en place.

**Également dans C15 :** Redirection post-inscription fixée sur `/bienvenue` (inchangée par C21).

**État final :** Login utilise `createSupabaseAdminClient` pour le lookup tenant. La redirection post-inscription est toujours `/bienvenue`.

**Fichiers :** `src/routes/api-auth.ts`

**Sévérité/impact :** Critique — "Aucun restaurant associé à ce compte" intermittent à la reconnexion pour les tenants non `actif`

---

### Thème G — Notification in-app commandes (api-commandes.ts) — 1 passe

**Commits :** C16, C20

**Trajectoire :**

**C16 (22h00)** — Ajout de l'insertion dans `notifications_restaurant` pour chaque nouvelle commande.

**C20 (02h05)** — Ajout de `en_attente_paiement_initial` dans le filtre de statut tenant (correctif BUG-3 corollaire).

**État final :** Chaque nouvelle commande crée une notification in-app dans `notifications_restaurant` + le tenant en `en_attente_paiement_initial` peut recevoir des commandes.

**Fichiers :** `src/routes/api-commandes.ts`

**Sévérité/impact :** Fonctionnalité (notifications manquantes) + Fonctionnalité (commandes bloquées pour un statut valide)

---

### Thème H — Nouvelles routes dashboard (verifyAuthOnboarding) + changement mdp backend

**Commits :** C17

**Trajectoire :** Une seule itération dans la plage pour la création de `verifyAuthOnboarding`. La route `change-password` sera retravaillée aux commits C26, C29, C30.

**État final de verifyAuthOnboarding :** Fonction existante, appliquée aux routes `GET /notifications`, `POST /setup-restaurant`, `GET /notifications/liste`.

**Fichiers :** `src/routes/api-dashboard.ts`

**Sévérité/impact :** Critique — onboarding impossible pour les tenants ayant choisi un plan payant

---

### Thème I — Boutique publique et statuts acceptés — 3 passes (C19/C20 → C24 → C27 → C28)

**Commits :** C19, C20, C24, C27, C28

**Trajectoire complète :**

**C19 (02h04)** — Première passe sur `api-tenants.ts` : ajout de `en_attente_paiement_initial` dans les filtres de `GET /:slug` et `GET /:slug/menu`.

**C20 (02h05)** — Passe corollaire sur `api-commandes.ts` : même ajout pour `POST /`.

**C24 (02h38)** — **Correction de la cause réelle du 404** (BUG-3-BIS) : la jointure `points_de_vente!inner(...)` dans `GET /:slug` rendait invisible tout tenant sans PDV actif, indépendamment du statut. Refactoring complet : requête tenant sans jointure + requête PDV séparée non bloquante.

**C27 (03h29)** — Passe sur `src/index.tsx` : ajout de `en_attente_paiement_initial` dans le filtre de `fetchTenantAvecPdv()`.

**C28 (03h44)** — **Correction définitive sur `src/index.tsx`** : remplacement du filtre par statut par un appel à `verifierAccesTenant()` (source de vérité unique). Gère aussi la fenêtre de grâce des renouvellements (`inactif` avec abonnement en attente).

**État final :** La boutique publique est visible si `acces.accesComplet === true` OU `acces.mode === 'paiement_initial'`. Toutes les autres routes API (api-tenants, api-commandes) acceptent aussi `en_attente_paiement_initial`.

**Fichiers :** `src/routes/api-tenants.ts`, `src/routes/api-commandes.ts`, `src/index.tsx`

**Sévérité/impact :** Critique — boutique en 404 pour les nouveaux comptes payants

---

### Thème J — setup-restaurant (onboarding) — 3 passes (C22 → C26 → C29)

**Commits :** C22, C26, C29

**Trajectoire complète :**

**C22 (02h29)** — BUG-2 : isolation des uploads R2 dans `try/catch` + enrichissement de la réponse avec `logo_enregistre`/`banniere_enregistree`. **Problème non résolu :** l'écriture en base utilise encore le client RLS-scopé (0 ligne affectée en silence).

**C26 (03h24)** — BUG-UPLOAD-BIENVENUE : correction de l'écriture en base (client admin au lieu de token-scopé) + vérification explicite des lignes affectées + logique "créer le PDV si absent". **Problème non résolu :** PDV inactif existant court-circuite la création sans que l'UPDATE ne touche quoi que ce soit.

**C29 (03h45)** — BUG-PDV-INACTIF : correction de la branche UPDATE (suppression du filtre `actif = true` + ciblage par `id` + vérification des lignes affectées).

**État final :** `POST /setup-restaurant` est robuste à : erreur R2, absence de PDV, PDV inactif existant, tenant en `en_attente_paiement_initial`. La réponse expose `logo_enregistre`, `banniere_enregistree`, et éventuellement les erreurs d'image.

**Fichiers :** `src/routes/api-dashboard.ts`

**Sévérité/impact :** Critique — onboarding cassé silencieusement pour tous les nouveaux comptes payants

---

### Thème K — Changement de mot de passe dashboard — 4 passes (C17 → C23 → C26 → C29 → C30)

**Commits :** C17 (backend notification), C23 (frontend formulaire), C26 (fix 500 GoTrue), C29 (rate limiting), C30 (fix catch-notif)

**Trajectoire complète :**

**C17 (01h19)** — Backend déjà fonctionnel (selon le commentaire), ajout de la notification in-app.

**C23 (02h33)** — BUG-5 : le bouton frontend "Demander un lien de réinitialisation" ne faisait qu'un `alert()`. Remplacement par un vrai formulaire appelant `POST /profil/change-password`.

**C26 (03h24)** — BUG-CHANGE-PASSWORD : la route produisait un 500 systématique à cause de `auth.getUser()` et `auth.updateUser()` sans session GoTrue. Fix : client frais + `getUser(token)` + `admin.updateUserById()`.

**C29 (03h45)** — Ajout du rate limiting (5 tentatives / 15 min par utilisateur via KV_CACHE).

**C30 (04h00)** — BUG-CATCH-NOTIF : après le fix de C26, la route produisait ENCORE un 500 après changement réussi. Cause : `.catch()` chaîné sur un `PostgrestFilterBuilder` (n'est pas une vraie Promise). Fix : `try/catch` classique.

**État final :** `POST /api/v1/dashboard/profil/change-password` fonctionne correctement : ré-authentification (mot de passe actuel), mise à jour via API admin, notification in-app, rate limiting 5/15min.

**Fichiers :** `src/routes/api-dashboard.ts`, `public/static/js/dashboard.js`

**Sévérité/impact :** Critique (500 systématique) + Fonctionnalité (formulaire manquant côté web) + Sécurité (rate limiting manquant)

---

### Thème L — Formulaire codes promo dashboard (split C23/C25)

**Commits :** C23, C25

**Trajectoire :**

**C23 (02h33)** — Le code de `showAddCodePromoModal()` était tronqué (fin de fichier au milieu du HTML). C23 supprime ce code tronqué.

**C25 (02h41)** — Restauration du code complet : fin du formulaire de création + fonctions CRUD codes promo + section PDV complète.

**État final :** Le dashboard dispose du formulaire de création de codes promo et de la section Point de Vente. Ces fonctionnalités existaient probablement avant mais avaient été accidentellement tronquées lors d'un commit précédent (hors plage).

**Fichiers :** `public/static/js/dashboard.js`

**Sévérité/impact :** Fonctionnalité (codes promo et PDV inopérants côté web)

---

## 4. Partie 3 — Impact sur les contrats API

### 4.1 Endpoints modifiés (comportement ou réponse changés)

#### `POST /api/v1/auth/login`

| Aspect | Avant (début de plage) | État final |
|---|---|---|
| Client lookup tenant | `createSupabaseClientWithToken` (RLS-scopé) | `createSupabaseAdminClient` (service role) |
| Champ sélectionné | `tenants!inner(id, nom, slug, statut, plan_id, couleur_primaire)` | + `deleted_at` |
| Comportement pour tenant non-actif | Pouvait retourner "Aucun restaurant associé" de façon intermittente | Retourne correctement les données |
| Commit | C15 → C21 | C21 |

**Impact mobile :** Aucun changement de contrat JSON visible. Correction silencieuse d'une intermittence.

---

#### `POST /api/v1/auth/register`

| Aspect | Avant | État final |
|---|---|---|
| Champ `redirect` dans la réponse | `/bienvenue` (plan gratuit) ou `/dashboard/abonnement` (plan payant) | Toujours `/bienvenue` |
| Commit | C15 | C15 |

**Impact mobile :** Si l'app mobile utilise le champ `redirect` de la réponse JSON pour naviguer, elle recevra toujours `/bienvenue` — y compris pour un plan payant. À vérifier côté mobile.

**Réponse JSON concernée :**
```json
{
  "success": true,
  "user_id": "...",
  "tenant_id": "...",
  "redirect": "/bienvenue"
}
```

---

#### `POST /api/v1/paiement/soumettre`

| Aspect | Avant | État final |
|---|---|---|
| Comportement en cas d'erreur post-insertion | HTTP 500 (si `messagePreuveRecue()` ou notifications échouaient) | HTTP 200 — abonnement déjà enregistré, erreurs non bloquantes |
| Champ `message` dans la réponse | Résultat direct de `messagePreuveRecue()` (pouvait manquer) | Variable `messageConfirmation` calculée préalablement avec fallback |
| Commit | C14 → C18 | C18 |

**Réponse JSON finale (état final) :**
```json
{
  "success": true,
  "abonnement_id": "...",
  "reference": "...",
  "delai_confirmation": "ISO8601",
  "heures_delai": 72,
  "sla_admin_heures": 48,
  "message": "Votre preuve de paiement a bien été reçue. Elle sera vérifiée sous peu.",
  "plan": { "nom": "...", "montant": 0, "devise": "FCFA" }
}
```

**Impact mobile :** Si l'app mobile gère le 500 en affichant un message d'erreur alors que l'abonnement a bien été enregistré, ce comportement ne se reproduira plus. La réponse est maintenant toujours 200 si l'insertion DB a réussi.

---

#### `GET /api/v1/tenants/:slug`

| Aspect | Avant | État final |
|---|---|---|
| Statuts tenant retournant des données | `['actif', 'essai']` | `['actif', 'essai', 'en_attente_paiement_initial']` |
| Jointure PDV | `points_de_vente!inner(...)` (bloquant si aucun PDV actif) | Requête séparée, PDV = null si absent |
| Champ `pdv_id`, `pdv_latitude`, etc. | Pouvait retourner null seulement si PDV absent avec jointure | Retourne null si aucun PDV actif (nouveau comportement garanti) |
| Commit | C19 → C24 | C24 |

**Impact mobile :** L'app mobile doit gérer `pdv_id: null`, `pdv_latitude: null`, `pdv_longitude: null` dans la réponse — la boutique peut désormais exister sans PDV configuré.

---

#### `GET /api/v1/tenants/:slug/menu`

| Aspect | Avant | État final |
|---|---|---|
| Statuts tenant retournant des données | `['actif', 'essai']` | `['actif', 'essai', 'en_attente_paiement_initial']` |
| Commit | C19 | C19 |

**Impact mobile :** Aucun changement de structure JSON. Uniquement une extension de la plage de tenants qui retournent un menu.

---

#### `POST /api/v1/commandes`

| Aspect | Avant | État final |
|---|---|---|
| Statuts tenant acceptés | `['actif', 'essai']` | `['actif', 'essai', 'en_attente_paiement_initial']` |
| Création notification in-app | Non | Oui (non bloquant, `waitUntil`) |
| Commit | C16, C20 | C20 |

**Impact mobile :** Aucun changement de structure de la réponse JSON. L'app mobile verra désormais des commandes apparaître dans les notifications restaurant du dashboard.

**Réponse JSON (inchangée) :**
```json
{
  "success": true,
  "commande_id": "..."
}
```

---

#### `GET /api/v1/dashboard/notifications` et `GET /api/v1/dashboard/notifications/liste`

| Aspect | Avant | État final |
|---|---|---|
| Auth requise | `verifyAuth()` (accesComplet strict) | `verifyAuthOnboarding()` (accesComplet OU accesAbonnementSeul) |
| Accessible pour tenant `en_attente_paiement_initial` | Non (401) | Oui |
| Commit | C17 | C17 |

**Impact mobile :** Si l'app mobile appelle ces endpoints avec un compte en attente de premier paiement, elle obtiendra désormais 200 au lieu de 401.

---

#### `POST /api/v1/dashboard/setup-restaurant`

| Aspect | Avant | État final |
|---|---|---|
| Auth requise | `verifyAuth()` (accesComplet strict) | `verifyAuthOnboarding()` |
| Client d'écriture | RLS-scopé (0 ligne affectée en silence pour `en_attente_paiement_initial`) | Admin service role |
| Vérification mise à jour tenant | Aucune (0 ligne = faux succès) | Explicite (`tenantUpdatedRows.length > 0`) |
| Création PDV | `UPDATE` seulement (échouait silencieusement si PDV absent) | `SELECT` + `INSERT` si absent, `UPDATE` si existant |
| Champs de réponse | `{ success, message, redirect, warning? }` | `{ success, message, redirect, logo_enregistre, banniere_enregistree, logo_erreur?, banniere_erreur?, warning? }` |
| Commit | C17 → C22 → C26 → C29 | C29 |

**Impact mobile :** Si l'app mobile consomme cet endpoint (onboarding), elle doit lire les nouveaux champs `logo_enregistre` et `banniere_enregistree` pour informer l'utilisateur en cas d'échec partiel d'upload.

**Réponse JSON finale :**
```json
{
  "success": true,
  "message": "Restaurant configuré avec succès.",
  "redirect": "/dashboard/home",
  "logo_enregistre": true,
  "banniere_enregistree": false,
  "banniere_erreur": "Erreur inconnue.",
  "warning": null
}
```

---

#### `POST /api/v1/dashboard/profil/change-password`

| Aspect | Avant | État final |
|---|---|---|
| Fonctionnement réel | HTTP 500 systématique (GoTrue sans session) | Fonctionnel |
| Rate limiting | Aucun | 5 tentatives / 15 minutes par utilisateur |
| Réponse si limite atteinte | N/A | `{ "error": "...", "retry_after_seconds": N }` HTTP 429 |
| Notification in-app | Insérait via `.catch()` (TypeError non catché → 500) | `try/catch` correct, non bloquant |
| Commit | C17 → C26 → C29 → C30 | C30 |

**Impact mobile :** L'endpoint est désormais utilisable. L'app mobile doit gérer le code HTTP 429 avec `retry_after_seconds`.

**Corps de requête :**
```json
{ "current_password": "...", "new_password": "..." }
```

**Réponse succès :**
```json
{ "success": true, "message": "Mot de passe mis à jour." }
```

**Réponse rate-limit (HTTP 429) :**
```json
{ "error": "Trop de tentatives. Réessayez plus tard.", "retry_after_seconds": 847 }
```

---

### 4.2 Endpoints créés (nouveaux dans la plage)

Aucun endpoint **nouveau** n'a été créé dans cette plage. Les modifications portent sur des endpoints existants.

---

### 4.3 Endpoints supprimés ou dépréciés

Aucun.

---

### 4.4 Changements de sécurité / autorisation

| Changement | Fichier | Commit | Impact client externe |
|---|---|---|---|
| CSP : ajout `wss://*.supabase.co` | `src/lib/security.ts` | C12 | Navigateur uniquement — sans impact sur les clients API |
| `POST /profil/change-password` : rate limiting 5/15min | `src/routes/api-dashboard.ts` | C29 | L'app mobile doit gérer HTTP 429 |
| `POST /login` : lookup tenant via client admin | `src/routes/api-auth.ts` | C21 | Correction silencieuse — pas de changement de contrat |
| `verifyAuthOnboarding()` : accès élargi à 3 routes | `src/routes/api-dashboard.ts` | C17 | Moins de 401 pour les tenants en attente de paiement initial |

---

### 4.5 Nouvelles fonctionnalités backend sans équivalent mobile connu

| Fonctionnalité | Endpoint | Commit | Description |
|---|---|---|---|
| Notification in-app commandes | `notifications_restaurant` (lecture via `GET /notifications/liste`) | C16 | Une nouvelle commande crée désormais une notification dans la cloche du dashboard |
| Notification in-app changement mdp | `notifications_restaurant` | C17 | Changement de mot de passe → notification "Mot de passe modifié" |
| Changement de mot de passe dashboard | `POST /profil/change-password` | C23, C26, C29, C30 | Route fonctionnelle pour la première fois |
| Réponse `logo_enregistre/banniere_enregistree` | `POST /setup-restaurant` | C22 | Nouveaux champs booléens dans la réponse |
| Rate limiting change-password | `POST /profil/change-password` | C29 | 429 avec `retry_after_seconds` |

---

## 5. Partie 4 — Points d'attention pour la comparaison avec l'app mobile

> Classés par ordre de risque décroissant.

---

### 🔴 CRITIQUE — P1 : Redirection post-inscription vers `/bienvenue` (rupture potentielle)

**Commit :** C15

**Fichier :** `src/routes/api-auth.ts`

**Ce qui a changé :** `POST /api/v1/auth/register` renvoie désormais TOUJOURS `redirect: '/bienvenue'`, même pour un plan payant (était `/dashboard/abonnement` avant).

**Risque mobile :** Si l'app mobile utilise le champ `redirect` pour naviguer après l'inscription, elle naviguerait vers `/bienvenue` au lieu de l'écran de paiement. **À vérifier en priorité.**

**Action recommandée :** Confirmer que l'app mobile ne dépend pas du champ `redirect` pour décider de la navigation post-inscription, ou mettre à jour la logique de navigation mobile pour pointer vers l'écran d'onboarding/bienvenue.

---

### 🔴 CRITIQUE — P2 : Boutique visible pour tenants `en_attente_paiement_initial` et fenêtre de grâce

**Commits :** C19, C20, C24, C27, C28

**Fichiers :** `api-tenants.ts`, `api-commandes.ts`, `src/index.tsx`

**Ce qui a changé :** `GET /:slug`, `GET /:slug/menu`, `POST /commandes` acceptent désormais les tenants `en_attente_paiement_initial`. La boutique SSR est également visible pour ce statut (et pour les tenants en fenêtre de grâce).

**Risque mobile :** Si l'app mobile vérifie le statut du tenant avant d'afficher la boutique ou d'autoriser une commande, elle pourrait encore bloquer pour ce statut. La logique côté serveur est désormais plus permissive que ce que l'app mobile anticipe peut-être.

**Action recommandée :** Vérifier que l'app mobile n'effectue pas de filtrage client sur le statut du tenant reçu, ou qu'elle gère correctement `en_attente_paiement_initial` comme un statut valide pour la boutique.

---

### 🔴 CRITIQUE — P3 : `GET /api/v1/tenants/:slug` — PDV peut être null

**Commit :** C24

**Fichier :** `api-tenants.ts`

**Ce qui a changé :** Avant, l'absence de PDV actif cachait entièrement le tenant (jointure inner → 404). Maintenant, le tenant est retourné avec `pdv_id: null`, `pdv_latitude: null`, `pdv_longitude: null`, etc.

**Risque mobile :** Si l'app mobile supposait que `pdv_latitude` et `pdv_longitude` sont toujours non-null quand le tenant existe, elle peut produire une NPE ou un calcul erroné de frais de livraison.

**Action recommandée :** Vérifier que l'app mobile gère correctement `pdv_*` à null, désactivant le calcul GPS et les frais de livraison.

---

### 🟠 IMPORTANT — P4 : Rate limiting sur `POST /profil/change-password` (HTTP 429)

**Commit :** C29

**Fichier :** `api-dashboard.ts`

**Ce qui a changé :** La route renvoie désormais HTTP 429 avec `{ "error": "...", "retry_after_seconds": N }` si l'utilisateur dépasse 5 tentatives en 15 minutes.

**Risque mobile :** Si l'app mobile ne gère pas le code 429, elle affichera une erreur générique ou plantera.

**Action recommandée :** Ajouter la gestion du code 429 dans l'app mobile, avec affichage du délai `retry_after_seconds`.

---

### 🟠 IMPORTANT — P5 : `POST /setup-restaurant` — nouveaux champs de réponse

**Commit :** C22

**Fichier :** `api-dashboard.ts`

**Ce qui a changé :** La réponse inclut `logo_enregistre: boolean`, `banniere_enregistree: boolean`, `logo_erreur?: string`, `banniere_erreur?: string`.

**Risque mobile :** Si l'app mobile consomme cet endpoint pour l'onboarding, elle doit lire ces champs pour informer l'utilisateur en cas d'échec partiel d'upload d'image.

**Action recommandée :** Mettre à jour l'app mobile pour lire et afficher ces champs si l'onboarding passe par cette route.

---

### 🟠 IMPORTANT — P6 : `POST /paiement/soumettre` — 500 remplacé par 200 en cas d'erreur non bloquante

**Commits :** C14, C18

**Fichier :** `api-paiement.ts`

**Ce qui a changé :** La route renvoie désormais 200 même si les notifications ou l'update tenant échouent, tant que l'abonnement est enregistré.

**Risque mobile :** Bonne nouvelle — les faux 500 disparaissent. Mais si l'app mobile avait implémenté une logique de retry automatique sur 500, elle peut maintenant traiter deux fois un abonnement qui semble avoir échoué. **Vérifier l'idempotence côté mobile.**

---

### 🟡 À VÉRIFIER — P7 : Endpoints `GET /notifications` et `GET /notifications/liste` accessibles pour `en_attente_paiement_initial`

**Commit :** C17

**Fichier :** `api-dashboard.ts`

**Ce qui a changé :** Ces deux endpoints acceptent désormais les tenants avec `accesAbonnementSeul`.

**Risque mobile :** Si l'app mobile a un écran de notifications qui dépend de ces endpoints, il fonctionnera maintenant pour les nouveaux comptes payants.

**Action recommandée :** Opportunité — l'app mobile peut afficher les notifications pour les tenants en attente de premier paiement. À exploiter si un tel écran existe ou est prévu.

---

### 🟡 À VÉRIFIER — P8 : Notification in-app sur `POST /commandes`

**Commit :** C16

**Fichier :** `api-commandes.ts`

**Ce qui a changé :** Chaque commande crée maintenant une ligne dans `notifications_restaurant`. `GET /api/v1/dashboard/notifications/liste` retournera donc des entrées "Nouvelle commande reçue".

**Risque mobile :** Si l'app mobile affiche les notifications et ne gérait pas ce type, le badge de notification du dashboard sera désormais incrémenté à chaque commande.

---

### 🟢 INFORMATIF — P9 : Supabase Realtime WebSocket (CSP)

**Commit :** C12

**Fichier :** `src/lib/security.ts`

**Ce qui a changé :** `wss://*.supabase.co` autorisé dans la CSP.

**Impact mobile :** Les apps mobiles ne sont pas concernées par la CSP du navigateur. Ce correctif est purement web-dashboard.

---

### 🟢 INFORMATIF — P10 : Icône WhatsApp retirée de la bannière boutique

**Commit :** C03

**Fichier :** `src/pages/boutique.ts`

**Impact mobile :** Changement visuel sur la page boutique web uniquement. L'app mobile ne rend pas cette page — aucun impact.

---

*Fin du rapport*

---

**Généré par :** Agent d'audit automatisé Genspark
**Dépôt audité :** `https://github.com/poodasamuelpro/monmenu`
**Branche :** `main`
**Outil :** `git log --reverse -p 966e8f59..f9c1ece5`
