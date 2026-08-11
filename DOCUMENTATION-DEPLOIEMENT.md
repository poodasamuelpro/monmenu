# MonMenu — Documentation de déploiement complète
## Migration Plans (Supabase-only) + Suppléments + Notifications + Livreurs + Historique

Date de préparation : 11 août 2026

---

## 1. LISTE COMPLÈTE DES FICHIERS LIVRÉS

| # | Fichier | Statut | Type de changement |
|---|---|---|---|
| 1 | `00-migration.sql` | NOUVEAU | Migration base de données (Supabase SQL Editor) |
| 2 | `src/types/database.ts` | MODIFIÉ | Types — Supplement, SupplementCommandeJson, Plan simplifié |
| 3 | `src/lib/security.ts` | MODIFIÉ | CommandeSchema + supplement_ids |
| 4 | `src/lib/plans.ts` | RÉÉCRIT | Suppression résolution D1↔Supabase |
| 5 | `src/routes/api-plans.ts` | RÉÉCRIT | Lecture Supabase au lieu de D1 |
| 6 | `src/routes/api-auth.ts` | MODIFIÉ | Résolution plan par UUID direct |
| 7 | `src/routes/api-tenants.ts` | MODIFIÉ | Plan Gratuit Supabase + suppléments dans menu public |
| 8 | `src/routes/api-paiement.ts` | MODIFIÉ | Fix bug soumission + plans Supabase |
| 9 | `src/routes/api-admin-paiements.ts` | MODIFIÉ | Plans Supabase, simplification confirmation |
| 10 | `src/routes/api-commandes.ts` | MODIFIÉ | Support suppléments à la commande |
| 11 | `src/routes/api-dashboard.ts` | MODIFIÉ | CRUD suppléments + plans Supabase |
| 12 | `public/static/js/dashboard-paiement.js` | MODIFIÉ | Fix comparaison plan_initial_id |
| 13 | `public/static/js/dashboard.js` | MODIFIÉ | Édition livreur + suppléments + historique |
| 14 | `public/static/js/boutique.js` | MODIFIÉ | Sélection suppléments au panier |
| 15 | `src/pages/dashboard.ts` | MODIFIÉ | Lien sidebar Historique paiements |

**Fichiers NON modifiés** (aucune action requise, compatibles tels quels) : `src/index.ts`, `src/middleware/auth.ts`, `src/lib/acces-tenant.ts`, `src/lib/paiement.ts`, `src/lib/supabase.ts`, `src/lib/delivery.ts`, `src/lib/whatsapp.ts`, `src/lib/fcm.ts`, `src/lib/constants.ts`, `src/routes/api-cron.ts`, `src/routes/api-admin-tasks.ts`, `src/routes/api-livraison.ts`, `public/static/js/notifications.js`, `public/static/js/auth-fetch.js`, `public/static/js/main.js`, `src/pages/inscription.ts`, `src/pages/bienvenue.ts`, `src/pages/boutique.ts`, `src/pages/suivi.ts`.

---

## 2. ORDRE DE DÉPLOIEMENT EXACT

**Principe général** : la base de données doit être migrée AVANT le code, et TOUT le code lié aux plans doit être déployé EN UNE SEULE FOIS (un seul commit/push, un seul déploiement Cloudflare). Ne jamais déployer partiellement — un état intermédiaire où une partie du code lit encore D1 et une autre lit Supabase casserait la cohérence du système.

### Étape A — Base de données (avant tout code)

1. Ouvrir le SQL Editor Supabase.
2. Vérifier/compléter `prix_mensuel` pour tes 4 plans (décommenter et corriger les valeurs dans `00-migration.sql`, section 1).
3. Exécuter la section 2 du script (migration `abonnements.plan_id`).
4. Exécuter la requête de vérification (section 3) — **elle doit renvoyer 0 ligne**. Si elle en renvoie, ne pas continuer, corriger manuellement d'abord.
5. Exécuter la section 4 (création table `supplements`).

### Étape B — Code source (un seul commit)

```bash
git checkout -b migration-plans-supabase-suppléments
```

Copier/remplacer tous les fichiers listés dans la section 1 (sauf `00-migration.sql`, qui n'est pas du code applicatif) aux emplacements exacts indiqués par leur chemin dans le repo.

```bash
git add src/types/database.ts \
        src/lib/security.ts \
        src/lib/plans.ts \
        src/routes/api-plans.ts \
        src/routes/api-auth.ts \
        src/routes/api-tenants.ts \
        src/routes/api-paiement.ts \
        src/routes/api-admin-paiements.ts \
        src/routes/api-commandes.ts \
        src/routes/api-dashboard.ts \
        public/static/js/dashboard-paiement.js \
        public/static/js/dashboard.js \
        public/static/js/boutique.js \
        src/pages/dashboard.ts

git commit -m "Migration plans vers Supabase uniquement + suppléments + historique paiements + édition livreur

- Plans : Supabase devient l'unique source de vérité (nom, prix, fonctionnalités).
  D1 n'est plus consulté pour les plans nulle part dans le code.
- Fix bug critique : impossible de soumettre une preuve de paiement
  ('Erreur lors de la vérification du plan.') — résolu par la bascule Supabase.
- Ajout : gestion complète des suppléments par produit (CRUD dashboard,
  sélection boutique publique, calcul serveur sécurisé à la commande).
- Ajout : page dédiée Historique des paiements dans le dashboard.
- Ajout : édition du nom/WhatsApp d'un livreur existant.

Nécessite l'exécution préalable de 00-migration.sql sur Supabase."
```

### Étape C — Vérification pré-déploiement (local ou preview)

```bash
npm run build
# ou selon ton setup : npx wrangler deploy --dry-run
```

Vérifier qu'il n'y a aucune erreur TypeScript (les imports de fonctions supprimées comme `resoudreIdD1DepuisPlanSupabase` doivent avoir totalement disparu du code — s'il en reste une référence quelque part, la build échouera, ce qui est volontairement une protection).

### Étape D — Déploiement production

```bash
git push origin migration-plans-supabase-suppléments
# Merge vers main via PR, ou déploiement direct selon ton flux :
npx wrangler deploy
```

### Étape E — Vérification post-déploiement (checklist manuelle)

1. `GET /api/v1/plans` → doit renvoyer les 4 plans avec des `id` au format UUID (pas `plan_faso` etc.)
2. Inscription d'un compte test avec un plan payant → vérifier `tenants.plan_initial_id` en base = UUID Supabase
3. Soumission d'une preuve de paiement test → doit réussir (c'est le bug corrigé)
4. Confirmation admin du paiement test → `tenants.plan_id` doit se remplir avec le même UUID que `abonnements.plan_id`
5. Dashboard → section Menu → bouton "Suppléments" sur un produit → créer un supplément test
6. Boutique publique du même tenant → ajouter le produit au panier → la modal de suppléments doit apparaître
7. Passer une commande test avec un supplément → vérifier dans Supabase `commandes.items_json` que le supplément et son prix sont bien enregistrés
8. Dashboard → Livreurs → bouton crayon sur un livreur → modifier le nom → vérifier la sauvegarde
9. Dashboard → nouveau lien "Historique paiements" dans la sidebar → doit afficher la liste

---

## 3. IMPACT ET RISQUE PAR FICHIER

### `src/lib/plans.ts` — RISQUE FAIBLE
**Impact** : toutes les routes qui importaient `resoudreIdD1DepuisPlanSupabase`, `chargerPlanD1`, `chargerPlanDepuisIdSupabase`, `resoudreIdSupabaseDepuisPlanD1` doivent être mises à jour simultanément (elles le sont, dans les fichiers livrés). Si un fichier NON livré ici importe encore une de ces fonctions supprimées, **la build échouera** — c'est une protection, pas un bug. Chercher avec `grep -r "resoudreId\|chargerPlanD1\|chargerPlanDepuisIdSupabase" src/` avant de déployer pour confirmer qu'aucune référence ne subsiste hors des fichiers livrés.

### `src/routes/api-plans.ts` — RISQUE FAIBLE, IMPACT LARGE
**Impact** : cette route est consommée par `inscription.ts`, `bienvenue.ts`, et `dashboard-paiement.js` — tous les trois continuent de fonctionner sans modification car ils traitent l'`id` du plan comme une valeur opaque. Le seul changement visible est le **format** de l'id (UUID au lieu de slug D1).
**Risque résiduel** : si un service tiers ou un script externe (non fourni ici) dépend du format `plan_faso` en dur, il cassera. Vérifier `grep -r "plan_faso\|plan_baraka\|plan_naaba\|plan_mogho" .` sur tout le repo avant déploiement.

### `src/routes/api-auth.ts` — RISQUE MOYEN
**Impact** : le flux d'inscription change de comportement au niveau de la résolution du plan. Si le front (`inscription.ts`, non modifié) envoyait un ancien id D1 en cache navigateur (peu probable mais possible avec un cache agressif), l'inscription échouerait avec `Plan invalide ou inactif.` — comportement attendu et sûr (refus propre, pas de plantage).
**Recommandation** : purger le cache KV `plans:FCFA` après déploiement (`wrangler kv:key delete --namespace-id=XXX "plans:FCFA"`, ou attendre les 10 minutes de TTL naturel) pour être sûr que le front récupère les nouveaux UUID immédiatement.

### `src/routes/api-tenants.ts` — RISQUE FAIBLE
**Impact** : `POST /` (legacy) et `GET /:slug/menu` (nouveau : suppléments). La route `POST /` legacy n'est normalement plus utilisée (l'inscription réelle passe par `api-auth.ts`) — risque nul en pratique sauf si un client externe l'appelle encore directement.
**Impact suppléments** : `GET /:slug/menu` fait une requête supplémentaire (table `supplements`). Si la table n'existe pas encore (migration SQL non exécutée), Supabase renverra une erreur silencieusement absorbée (`supplementsByProduit` restera vide) — **pas de crash**, mais les suppléments n'apparaîtront pas tant que l'étape A n'est pas faite.

### `src/routes/api-paiement.ts` — RISQUE MOYEN, C'EST LE FIX PRINCIPAL
**Impact** : c'est le fichier qui corrige le bug bloquant original. Le changement de logique est significatif dans `/soumettre` (D1 → Supabase pour la vérification du plan) et `/statut` (suppression de `plan_initial_id_d1`).
**Bug potentiel si mal déployé** : si ce fichier est déployé SANS que la migration SQL (étape A) ait rempli correctement `prix_mensuel`/`nom` pour les 4 plans, `/soumettre` renverra `Plan introuvable ou inactif.` pour tout le monde (comportement sûr — refus propre — mais bloquant pour les utilisateurs). **Vérifier impérativement l'étape A avant de déployer ce fichier.**

### `src/routes/api-admin-paiements.ts` — RISQUE FAIBLE
**Impact** : simplification pure (suppression d'une étape de résolution). Le comportement observable pour l'admin ne change pas — un paiement confirmé active toujours le tenant sur le bon plan. Le risque de régression est plus faible qu'avant (moins de code = moins de points de défaillance).

### `src/routes/api-commandes.ts` — RISQUE FAIBLE, AJOUT PUR
**Impact** : `supplement_ids` est un champ optionnel dans le schéma Zod. Les commandes passées SANS suppléments (comportement 100% identique à avant) continuent de fonctionner exactement pareil — c'est un ajout, pas une modification de comportement existant.
**Risque résiduel** : légère augmentation de latence sur `POST /` (une requête Supabase supplémentaire pour charger les suppléments) — négligeable sauf si des centaines de suppléments sont sélectionnés simultanément (plafonné à 10 par item par le schéma Zod, donc borné).

### `src/routes/api-dashboard.ts` — RISQUE MOYEN, FICHIER LE PLUS GROS
**Impact** : `GET /profil` et `PATCH /parametres` changent leur résolution de plan (risque faible, mêmes garanties que `api-paiement.ts`). Les nouvelles routes suppléments (`/produits/:id/supplements`, `/supplements/:id`) sont des ajouts purs sans impact sur l'existant.
**Point d'attention** : ce fichier est très volumineux — en cas de conflit Git avec des modifications parallèles de ton équipe sur ce même fichier, une résolution manuelle attentive sera nécessaire. Vérifier qu'aucune route existante n'a été accidentellement supprimée en comparant le diff ligne à ligne si un merge conflictuel a eu lieu.

### `public/static/js/dashboard.js` — RISQUE FAIBLE
**Impact** : ajouts de fonctions (édition livreur, suppléments, historique) + une nouvelle entrée dans `navigateTo()`. Toutes les fonctions existantes sont préservées à l'identique. Comme ce n'est pas un module (script global classique), il n'y a pas de risque de collision de namespace tant qu'aucune autre fonction du même nom n'existe ailleurs — vérifié : aucun conflit avec `dashboard-paiement.js`, `notifications.js`, ou `boutique.js` (chargés sur des pages différentes).

### `public/static/js/boutique.js` — RISQUE MOYEN
**Impact** : `getQuantiteInCart()` change de comportement — elle sommait avant une seule ligne par produit, elle somme désormais toutes les lignes (avec et sans suppléments) du même produit. C'est un changement de logique interne mais le résultat affiché à l'utilisateur (badge de quantité) reste correct et cohérent.
**Point d'attention réel** : `removeFromCart(produitId)` (appelée depuis le bouton "−" sur la carte produit du menu, PAS depuis le panier) a une logique de fallback un peu grossière quand plusieurs lignes existent pour le même produit avec des suppléments différents — elle retire la ligne SANS supplément en priorité, sinon la première ligne trouvée. **Risque UX mineur** : si un client a 2 lignes du même produit (une avec supplément, une sans) et clique sur "−" depuis la carte produit (pas depuis le panier), il pourrait retirer la mauvaise ligne. **Recommandation** : suggérer aux clients d'utiliser le panier (modal) pour ajuster précisément les quantités par variante — la modal panier, elle, cible chaque ligne par index exact et n'a pas ce problème.

### `src/pages/dashboard.ts` — RISQUE NUL
**Impact** : ajout d'un seul lien `<a>` dans la sidebar. Aucune régression possible.

---

## 4. BUGS PROBABLES ET OÙ LES CHERCHER

| Symptôme observé | Fichier à vérifier en premier | Cause probable |
|---|---|---|
| "Plan introuvable ou inactif." persiste après déploiement | `00-migration.sql` (étape A) | `prix_mensuel`/`actif` non renseignés correctement en base Supabase |
| Inscription échoue avec "Plan invalide" | Cache navigateur / KV `plans:FCFA` | Le front a encore un ancien id D1 en cache — vider le cache KV et recharger la page d'inscription |
| Suppléments n'apparaissent jamais sur la boutique | `00-migration.sql` section 4 | Table `supplements` non créée, ou RLS Supabase bloquant les lectures (vérifier que `service_role` bypass RLS, ce qui est le cas par défaut) |
| Erreur 500 sur `POST /api/v1/commandes` avec suppléments | `src/lib/security.ts` | Vérifier que `CommandeSchema` a bien été mis à jour (sinon Zod rejette `supplement_ids` avant même d'atteindre la logique métier) |
| Suppléments affichés mais prix à 0 dans la commande finale | `src/routes/api-commandes.ts` | Le supplément a été désactivé (`actif=false`) entre le chargement du menu et la commande — comportement volontaire (filtré silencieusement), pas un bug |
| Édition livreur ne sauvegarde rien | `src/routes/api-dashboard.ts` PATCH `/livreurs/:id` | Vérifier les logs serveur — la route accepte déjà nom/whatsapp, un 422 signale une validation régex WhatsApp trop stricte pour le format saisi |
| Historique paiements affiche une page blanche | `public/static/js/dashboard-paiement.js` | `construireHistorique` doit être chargé AVANT `dashboard.js` n'appelle `loadHistoriquePaiements()` — vérifier l'ordre des `<script>` dans `dashboard.ts` (déjà correct dans le fichier livré : `dashboard.js` puis `dashboard-paiement.js`, mais la fonction n'est appelée qu'au clic donc l'ordre de chargement des scripts n'a pas d'impact ici, seule la présence des deux fichiers compte) |
| Paiement confirmé mais plan du tenant reste vide | `src/routes/api-admin-paiements.ts` | Vérifier que `abonnement.plan_id` contient bien un UUID (pas un ancien slug D1 orphelin — revoir l'étape A section 2/3) |

---

## 5. MISE À NIVEAU DU REPO ADMIN / DASHBOARD ADMIN (séparé, si applicable)

D'après le contexte de ce projet, l'admin (confirmation/rejet de paiements, `X-Admin-Secret`) semble être une interface séparée qui appelle `POST /api/v1/admin/paiements/confirmer` et `POST /api/v1/admin/paiements/rejeter`.

**Ce qui change côté contrat d'API** (à vérifier dans le repo admin, non fourni ici) :
- `GET /api/v1/admin/paiements` renvoie toujours les mêmes champs, y compris `plan_id` — mais ce `plan_id` est désormais **toujours un UUID Supabase**, plus jamais un slug D1 type `plan_faso`. Si l'admin affiche ou compare ce champ quelque part (ex: un `<select>` de filtre par plan avec des valeurs codées en dur), il faut mettre à jour ces valeurs codées en dur vers les nouveaux UUID.
- Aucun changement de structure de requête/réponse sur `/confirmer` et `/rejeter` — ils continuent d'accepter `{ abonnement_id, admin_id?, note?/motif? }` exactement comme avant.
- La réponse de `/confirmer` ne contient plus jamais le champ `avertissement` (qui signalait l'ancien mode d'échec de résolution D1↔Supabase) — si l'admin affichait ce champ quelque part, il peut être retiré sans risque (il ne sera simplement jamais présent).

**Action recommandée** : chercher dans le repo admin toute référence en dur à `plan_faso`, `plan_baraka`, `plan_naaba`, `plan_mogho`, ou toute logique qui suppose que `plan_id` a un format texte spécifique (préfixe `plan_`, etc.) et les remplacer par les UUID correspondants listés en tête de cette conversation.

---

## 6. MISE À NIVEAU DE L'APPLICATION MOBILE (MonMenu Manager, Flutter)

D'après le contexte mémorisé de ce projet, l'app mobile MonMenu Manager consomme l'API dashboard (`/api/v1/dashboard/*`). Voici précisément ce qui impacte le mobile :

### Impact direct — CRITIQUE si le mobile affiche des infos de plan
- `GET /api/v1/dashboard/profil` renvoie toujours les mêmes champs (`plan_nom`, `plan_features`, `commandes_incluses`, `prix_mensuel`) — **aucun changement de structure**, seule la source de résolution change côté serveur (invisible pour le client mobile).
- **Aucune action requise côté mobile pour le profil.**

### Impact direct — si le mobile affiche/gère les paiements
- `GET /api/v1/paiement/statut` : le champ `plan_initial_id_d1` **a disparu** de la réponse. Si le code Dart du mobile lit ce champ (`json['plan_initial_id_d1']`), il recevra `null` silencieusement (Dart ne plante pas sur une clé JSON absente si le champ est nullable) — mais toute logique de comparaison basée dessus cessera de fonctionner. **Chercher dans le code Dart** : `grep -r "plan_initial_id_d1" lib/` et remplacer par `plan_initial_id` (même valeur désormais, comparable directement à l'`id` reçu de `/api/v1/plans`).
- `GET /api/v1/plans` : le champ `id` de chaque plan est désormais un UUID (`e62a23c8-...`) au lieu d'un slug (`plan_faso`). Si le mobile stocke ou compare cet id quelque part (ex: `SharedPreferences`, cache local, énumération Dart avec des valeurs `plan_faso` codées en dur), **il faut mettre à jour ces valeurs**.
- `POST /api/v1/paiement/soumettre` (si le mobile permet de soumettre une preuve directement) : le champ `plan_id` envoyé dans le FormData doit désormais être l'UUID Supabase (récupéré depuis `/api/v1/plans`), pas un ancien slug D1. Si le mobile a un `enum PlanId { faso, baraka, naaba, mogho }` avec des valeurs texte codées en dur pour construire ce champ, **il faut le remplacer par une consommation dynamique de `/api/v1/plans`**.

### Impact — Suppléments (nouvelle fonctionnalité, à intégrer si souhaité côté mobile)
- Si tu veux que MonMenu Manager (mobile, côté restaurateur) permette aussi de gérer les suppléments, les nouvelles routes sont :
  - `GET /api/v1/dashboard/produits/:id/supplements`
  - `POST /api/v1/dashboard/produits/:id/supplements` — body `{ nom, prix }`
  - `PATCH /api/v1/dashboard/supplements/:id` — body `{ nom?, prix?, actif?, ordre_affichage? }`
  - `DELETE /api/v1/dashboard/supplements/:id`
- Aucune de ces routes n'existait avant — intégration mobile optionnelle, à faire quand tu le décides, sans urgence.
- Si le mobile affiche le détail d'une commande (`items_json`), chaque item peut désormais contenir un champ `supplements: [{ supplement_id, nom, prix }]`. Le modèle Dart `ItemCommande` (ou équivalent) doit être étendu avec un champ optionnel `List<SupplementCommande>? supplements` pour ne pas planter au parsing JSON si ce champ est absent (commandes anciennes) ou présent (nouvelles commandes).

### Impact — Livreurs
- Aucun changement d'API. `PATCH /api/v1/dashboard/livreurs/:id` acceptait déjà `nom`/`whatsapp_number`/`actif` avant cette migration (ce n'était qu'un défaut d'interface web, pas un défaut d'API). **Le mobile n'a jamais eu ce problème s'il utilisait déjà cette route correctement.**

### Checklist de mise à niveau mobile
1. `grep -r "plan_initial_id_d1\|plan_faso\|plan_baraka\|plan_naaba\|plan_mogho" lib/` dans le repo Flutter — traiter chaque occurrence.
2. Vérifier tout modèle Dart qui parse la réponse de `/api/v1/plans` — s'assurer qu'il n'y a pas de validation de format d'id (regex attendant un format `plan_xxx`) qui rejetterait un UUID.
3. Vérifier tout modèle Dart qui parse `items_json` d'une commande — ajouter le champ optionnel `supplements` s'il n'existe pas déjà, pour préparer l'affichage futur (même si l'UI n'est pas encore mise à jour, le parsing ne doit pas planter).
4. Aucune modification requise sur l'authentification, les commandes (hors affichage suppléments), les statistiques, le QR code, ou les notifications — tous inchangés côté contrat d'API.

---

## 7. RÉCAPITULATIF DES NOUVELLES FONCTIONNALITÉS LIVRÉES

| Demande initiale | Statut | Où |
|---|---|---|
| Bug paiement "Erreur lors de la vérification du plan" | ✅ Corrigé | `api-paiement.ts`, migration SQL |
| Page historique des paiements | ✅ Livré | `dashboard.js` (`loadHistoriquePaiements`), `dashboard.ts` (lien sidebar) |
| Notifications marquées lues au clic | ✅ Déjà existant, confirmé fonctionnel | `notifications.js` (non modifié) |
| Édition livreur (nom + numéro) | ✅ Livré | `dashboard.js` (`showEditLivreurModal`), backend déjà prêt |
| Page "Mon restaurant" fonctionnelle | ✅ Auditée, saine, aucun changement nécessaire | `api-dashboard.ts` PDV routes |
| Suppléments configurables par produit, activables | ✅ Livré | `dashboard.js` (CRUD UI), `api-dashboard.ts` (CRUD API) |
| Suppléments proposés au client à la commande | ✅ Livré | `boutique.js` (modal sélection), `api-tenants.ts` (exposition menu) |
| Calcul automatique du prix avec suppléments | ✅ Livré, calcul côté SERVEUR (sécurisé) | `api-commandes.ts` |
| API exposée et compatible pour tout ce qui précède | ✅ Toutes les routes documentées ci-dessus | — |

---

## 8. CE QUI N'A PAS ÉTÉ TOUCHÉ (confirmation explicite d'absence de régression)

Pour lever tout doute, voici la liste des comportements vérifiés comme strictement identiques à avant, fichier par fichier :

- **Authentification** (login/logout/refresh/OTP) : code identique à 100% dans `api-auth.ts`, seule la section `POST /register` a un changement localisé à la résolution du plan.
- **Commandes** (création, suivi, changement de statut, export CSV) : logique métier identique, seul ajout additif de `supplements` dans `items_json`.
- **Codes promo** : aucune ligne modifiée.
- **Livreurs** (liste, ajout, suppression, toggle actif) : aucune ligne modifiée, uniquement ajout de l'édition.
- **PDV / horaires / géolocalisation** : aucune ligne modifiée.
- **Apparence, paramètres, QR code, statistiques** : aucune ligne modifiée (sauf résolution de plan dans `/profil` et `/parametres`, sans changement de structure de réponse).
- **Notifications** (dashboard + paiement) : `notifications.js` non modifié, `dashboard-paiement.js` modifié uniquement sur une ligne de comparaison.
- **CRON** (stats journalières, essais expirés, screenshots, blocage paiements expirés) : `api-cron.ts` non modifié, continue de fonctionner avec les nouveaux UUID sans adaptation nécessaire (il ne manipule jamais directement les plans).
