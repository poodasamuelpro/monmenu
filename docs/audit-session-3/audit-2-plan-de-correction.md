# Audit #2 — Plan de correction détaillé (Session 3)

**Date** : 2026-08-14  
**Basé sur** : audit-1-etat-des-lieux.md  
**Principe** : chaque correction est planifiée avec fichiers impactés, dépendances, risques de régression et stratégie de mitigation.

---

## Correction #1 — Rate limiting newsletter

**Fichiers impactés** : `src/routes/api-newsletter.ts`  
**Dépendances** : `src/lib/security.ts` (checkRateLimit) — existant, aucune modification  
**Risques de régression** : Aucun — ajout pur, pas de modification de comportement existant  
**Plan** :
1. Ajouter `import { checkRateLimit } from '../lib/security'`
2. Ajouter rate limit par IP : `newsletter:{ip}` — 3 requêtes / 1 heure — **avec `c.env.KV_CACHE`**
3. Ajouter rate limit par email : `newsletter-email:{email}` — 2 requêtes / 24h — **avec `c.env.KV_CACHE`**
4. Renvoyer 429 si dépassé

---

## Correction #2 — Suppression complète domaine_perso

**Fichiers impactés** :
- `src/index.tsx` — supprimer middleware custom domain + simplifier signature `fetchTenantAvecPdv`
- `src/routes/api-dashboard.ts` — supprimer gestion `domaine_perso` dans PATCH /parametres + GET /profil select
- `src/pages/home.ts` — retirer `domaine_perso` de la liste de features
- `src/pages/tarifs.ts` — retirer affichage conditionnel `domaine_perso`
- `public/static/js/dashboard.js` — supprimer champ formulaire + envoi dans saveParametres
- `src/types/database.ts` — conserver la propriété (colonne reste en base) mais la marquer `@deprecated`
- `supabase/migrations/009_sync_plans_depuis_d1.sql` — migration historique, pas de modification

**Colonne en base** : `domaine_perso TEXT UNIQUE` reste dans la table `tenants` — **non supprimée** (migration destructive risquée)

**Risques de régression** :
- La suppression du middleware dans `index.tsx` ne doit pas affecter le routing normal — vérifier que les routes API et les pages fonctionnent toujours
- La simplification de `fetchTenantAvecPdv` (suppression du type union `slug | domaine_perso`) doit être répercutée sur tous les appels existants (L.150 index.tsx)

**Plan** :
1. `index.tsx` : simplifier `fetchTenantAvecPdv(env, slug: string)` — plus de filtre objet, toujours sur `slug`
2. `index.tsx` : supprimer le middleware custom domain (bloc L.143-156)
3. `api-dashboard.ts` PATCH /parametres : retirer les lignes 1303, 1313-1331, 1336 liées à `domaine_perso`
4. `api-dashboard.ts` GET /profil : retirer `domaine_perso` des deux `.select()` L.1384 et 1390
5. `home.ts` : retirer la clé `domaine_perso` de la config features L.451
6. `tarifs.ts` : retirer la ligne affichant `Domaine personnalisé` L.300
7. `dashboard.js` : supprimer le bloc formulaire (L.1685-1691) et la clé `domaine_perso` dans saveParametres (L.1749)

---

## Correction #3 — limite_pdv = 1 partout

**Fichiers impactés** : nouvelle migration SQL  
**Dépendances** : aucune — migration non-destructive UPDATE  
**Risques de régression** : si un tenant a actuellement plusieurs PDV, la `limite_pdv` en base sera 1 mais aucun code ne vérifie cette limite → aucun comportement changé pour l'utilisateur  
**Plan** :
1. Créer `supabase/migrations/015_limite_pdv_1.sql` : `UPDATE plans SET limite_pdv = 1;`

---

## Correction #5 — Emails manquants

**Fichiers impactés** :
- `src/lib/brevo.ts` — ajouter les fonctions d'envoi email métier
- `src/routes/api-auth.ts` — appel email bienvenue après `register`
- `src/routes/api-paiement.ts` — appel email accusé réception paiement soumis
- `src/routes/api-admin-paiements.ts` — appel emails confirmation/rejet admin
- `src/routes/api-cron.ts` — emails rappel fin essai + fin abonnement
- `src/routes/api-newsletter.ts` — envoi réel de newsletter aux abonnés

**Principe fondamental** : tous les envois email sont dans des `try/catch` non bloquants. L'action métier principale réussit même si Brevo échoue.

**Fonctions à créer dans `src/lib/brevo.ts`** :
- `envoyerEmailBienvenue(env, {email, nom, nomRestaurant, slug, estPlanPayant})` 
- `envoyerEmailPaiementSoumis(env, {email, nom, reference, montant, planNom})`
- `envoyerEmailPaiementConfirme(env, {email, nom, planNom, dateFin})`
- `envoyerEmailPaiementRejete(env, {email, nom, motif})`
- `envoyerEmailRappelEssai(env, {email, nom, joursRestants})`
- `envoyerEmailRappelAbonnement(env, {email, nom, planNom, dateFin, joursRestants})`
- `envoyerEmailDemandeSuppressionConfirm(env, {email, nom, tokenConfirm, lienConfirm})`
- `envoyerEmailSuppression30j(env, {email, nom, dateSuppression})`
- `envoyerNewsletterCampagne(env, campaign: {sujet, htmlContent, textContent}, subscribers: string[])` — batch avec gestion erreurs

**Sécurité XSS** : `escapeHtml()` (déjà dans brevo.ts) obligatoire sur tout contenu utilisateur dans les templates.

**Risques de régression** : 
- Les envois en `try/catch` non bloquants ne peuvent pas casser les actions existantes
- Vérifier que les variables `email` des utilisateurs sont bien récupérées dans api-auth.ts (via `authData.user.email`)
- Pour api-admin-paiements, récupérer l'email du tenant via jointure ou requête supplémentaire

---

## Correction #7 — Notifications de rappel (cron)

**Fichiers impactés** :
- `src/routes/api-cron.ts` — étendre `verifierEssaisExpires()` pour envoyer des rappels J-5 et J-2 avant expiration + ajouter logique de rappel abonnement payant
- `wrangler.jsonc` — ajouter un cron dédié aux rappels (ex: `"0 8 * * *"` — matin quotidien)

**Logique anti-spam** :
- Stocker dans KV la date du dernier rappel par tenant : `rappel-essai:{tenant_id}:{jours}` 
- Ne pas envoyer si déjà envoyé dans les dernières 20h

**Plan** :
1. Nouvelle fonction `envoyerRappelsEchéances(env)` dans api-cron.ts
2. Recherche des essais expirant dans J-5 et J-2 (filtre `essai_expire_le BETWEEN now+4j AND now+6j` et `BETWEEN now+1j AND now+3j`)
3. Recherche des abonnements payants (`statut = 'actif'`, `date_fin BETWEEN now+4j AND now+6j`)
4. Pour chaque tenant trouvé : envoyer email + notif in-app (non bloquants, séparés)
5. Stocker clé KV anti-doublon avec TTL 20h

---

## Correction #8 — Invalidations cache KV manquantes

**Fichiers impactés** : `src/routes/api-dashboard.ts`, `src/routes/api-admin-paiements.ts`, `src/routes/api-cron.ts`, `src/lib/supabase.ts` (si cache config)

**Plan correction par bug** :

### 8a. Bug RLS silencieux PATCH /apparence
1. Remplacer `createSupabaseClientWithToken` par `createSupabaseAdminClient` pour la mise à jour
2. Conserver la vérification applicative (tenant_id du token = tenant ciblé) — déjà garantie par `verifyAuth()`
3. Ajouter `.select('id')` après `.update()` pour compter les lignes affectées
4. Si 0 ligne : retourner 422 + logguer anomalie + **NE PAS invalider le cache**
5. Si erreur : retourner 500
6. Si succès : invalider `tenant:{slug}` ET `tenants:public:{limit}` (apparence visible publiquement)

### 8b. Invalider `tenants:public:{limit}` partout où le statut change
Ajout d'invalidation aux endroits suivants (en plus de `tenant:{slug}`) :
- `api-admin-paiements.ts` POST /confirmer (statut → actif)
- `api-admin-paiements.ts` POST /rejeter (statut peut changer)
- `api-cron.ts` verifierEssaisExpires (statut → inactif)
- `api-cron.ts` bloquerPaiementsExpires (statut → inactif)
- Nouvelle fonction cron actif→inactif (point 10)

**Problème** : la clé `tenants:public:{limit}` est dynamique (valeur de `limit` variable). Stratégie : invalider les clés les plus courantes `tenants:public:12` et `tenants:public:24` (les limites par défaut et maximum dans api-tenants.ts).

### 8c. Cache `fetchTenantAvecPdv()`
Ajouter cache KV TTL 30s avec clé `boutique-pdv:{slug}` dans `index.tsx`.
Invalider ce cache dans les mêmes points que `tenant:{slug}`.

### 8d. Cache `config:{key}` (D1)
Vérifier si `lib/supabase.ts` implémente un cache D1 — chercher `config:` dans le code et ajouter invalidation si nécessaire.

---

## Correction #9 — Pagination

**Fichiers impactés** : `src/routes/api-dashboard.ts`, `src/routes/api-tenants.ts`

**Pattern** : `page` (défaut 1) + `limit` (défaut 50, max 200) + `.range(offset, offset+limit-1)`

**Plan** :
1. `GET /api/v1/dashboard/livreurs` : ajouter `page`/`limit` avec défaut 100
2. `GET /api/v1/dashboard/codes-promo` : ajouter `page`/`limit` avec défaut 100
3. `GET /api/v1/dashboard/menu` : remplacer `.limit(5000)` par `page`/`limit` défaut 200 — **avec valeur de retour `total` pour pagination UI**
4. `GET /api/v1/tenants/:slug/menu` : ajouter `limit` sur produits (défaut 200) — attention à ne pas casser le menu mobile
5. `GET /api/v1/dashboard/stats` : limiter la requête `allCommandes` (voir code L.470+) — ajouter limit 1000 pour éviter les OOM

**Risque de régression** : si le frontend mobile ou dashboard.js attend une liste complète sans pagination. **Stratégie** : valeurs par défaut élevées (100-200) pour que le comportement perçu soit identique si l'appelant ne précise pas de paramètre.

---

## Correction #10 — Cron actif→inactif + vérif à la volée essai

**Fichiers impactés** :
- `src/routes/api-cron.ts` — nouvelle fonction `verifierAbonnementsExpires()`
- `src/lib/acces-tenant.ts` — corriger la vérification essai en temps réel
- `wrangler.jsonc` — ajouter un déclenchement cron (ex: `"0 3 * * *"`)

### 10a. Nouvelle fonction cron actif→inactif
```
verifierAbonnementsExpires(env):
  1. Recherche tenants statut='actif' sans abonnement actif valide (date_fin < now)
  2. Pour chaque tenant trouvé:
     a. Vérifier qu'il n'y a pas d'abonnement en_attente_confirmation valide (fenêtre grâce)
     b. Passer tenant.statut → 'inactif'
     c. Invalider cache KV: tenant:{slug} + tenants:public:12 + tenants:public:24
     d. Envoyer notification in-app (try/catch non bloquant)
     e. Envoyer email de notification (try/catch non bloquant)
```

### 10b. Correction verifierAccesTenant() pour essai
Dans `src/lib/acces-tenant.ts` L.85-86 :
```typescript
// AVANT (dangereux)
if (tenant.statut === 'essai') {
  return { accesComplet: true, ... mode: 'essai' }
}
// APRÈS (vérifie la date en temps réel)
if (tenant.statut === 'essai') {
  // Vérification en temps réel de la date d'expiration
  if (tenant.essai_expire_le && new Date(tenant.essai_expire_le) < new Date()) {
    // L'essai est expiré mais le cron n'est pas encore passé → accès refusé
    return { accesComplet: false, accesAbonnementSeul: true, mode: 'bloque', ... }
  }
  return { accesComplet: true, ... mode: 'essai' }
}
```
**Attention** : le select sur `tenants` doit inclure `essai_expire_le` — vérifier L.70-75 de acces-tenant.ts.

---

## Correction #11 — Suppression de compte (flux validé admin)

**Fichiers impactés** :
- `src/routes/api-dashboard.ts` — nouvelles routes restaurateur
- `src/routes/api-admin-paiements.ts` — nouvelles routes admin gestion suppressions
- `src/lib/brevo.ts` — emails liés à la suppression
- `supabase/migrations/016_suppression_compte.sql` — nouveaux champs

### Schéma des nouvelles colonnes dans `tenants`
```sql
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS suppression_demandee_le TIMESTAMPTZ;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS suppression_prevue_le TIMESTAMPTZ;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS suppression_token TEXT UNIQUE;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS suppression_token_expire_le TIMESTAMPTZ;
```

### Nouvelles routes restaurateur (api-dashboard.ts)
1. `POST /api/v1/dashboard/compte/demander-suppression` — génère token + envoie email + marque `suppression_demandee_le = now`
2. `GET /api/v1/dashboard/compte/confirmer-suppression?token=XXX` — valide token + marque `suppression_prevue_le = now + 30j` + notifie admin
3. `POST /api/v1/dashboard/compte/annuler-suppression` — annule `suppression_prevue_le` si dans les 30j

### Nouvelles routes admin (api-admin-paiements.ts ou nouveau fichier)
4. `GET /api/v1/admin/suppressions` — liste des suppressions en attente
5. `POST /api/v1/admin/suppressions/:tenant_id/executer` — suppression définitive (après 30j ou avant si admin le juge)

### Logique suppression définitive
```
1. Récupérer tous fichiers R2 du tenant → supprimer
2. Supprimer les données Supabase (ou laisser CASCADE)
3. Supprimer le compte Supabase Auth (adminClient.auth.admin.deleteUser)
4. Invalider tous les caches KV liés au tenant
5. Logguer l'action (qui, quand, tenant_id)
6. Retourner confirmation
```

---

## Correction #12 — R2 orphelins + sécurisation uploads

### 12a. Magic bytes sur upload-image (api-dashboard.ts)
**Plan** :
1. Importer `validerMimeImage` depuis `../lib/paiement`
2. Ajouter validation dans `POST /upload-image` après `file.arrayBuffer()`
3. Si invalide : refuser avec 415
4. Si erreur technique de validation : logguer + laisser passer (try/catch autour de la validation)
5. Ajouter try/catch autour de `R2_MEDIA.put()`

### 12b. Suppression ancienne image lors du remplacement
**Stratégie** :
- Avant d'uploader le nouveau fichier, lire l'ancienne URL R2 du tenant
- Après confirmation que le nouveau fichier est uploadé ET que la base est à jour → supprimer l'ancien objet R2
- try/catch non bloquant autour de la suppression (une image orpheline est moins grave qu'une erreur)

### 12c. Suppression images lors de soft-delete produit
- Ne pas supprimer immédiatement (le produit peut être restauré)
- Documenter : les images R2 sont supprimées lors de la suppression définitive du compte (point 11)

---

## Correction #14 — Performances

### 14.1 Cache fetchTenantAvecPdv (30s TTL)
Modifier `src/index.tsx` :
```typescript
async function fetchTenantAvecPdv(env: Env, slug: string): Promise<TenantBoutique | null> {
  const cacheKey = `boutique-pdv:${slug}`
  if (env.KV_CACHE) {
    const cached = await env.KV_CACHE.get(cacheKey, 'json') as TenantBoutique | null
    if (cached) return cached
  }
  // ... logique existante ...
  if (result && env.KV_CACHE) {
    await env.KV_CACHE.put(cacheKey, JSON.stringify(result), { expirationTtl: 30 })
  }
  return result
}
```

### 14.2 N+1 stats journalières — parallélisation
Remplacer la boucle `for...await` séquentielle par `Promise.allSettled()` par lots de 10.

### 14.3 N+1 admin/paiements — jointure plans
Remplacer les appels `chargerPlan()` répétés par une requête groupée sur tous les `plan_id` distincts, puis map.

### 14.4 select('*') api-commandes.ts L.166
Remplacer par les colonnes exactes nécessaires.

### 14.5 Paralléliser GET /profil
```typescript
const [tenantResult, pdvResult, commandesCount] = await Promise.all([
  adminClient.from('tenants').select(...).eq('id', tenantId).maybeSingle(),
  adminClient.from('points_de_vente').select(...).eq('tenant_id', tenantId)...,
  adminClient.from('commandes').select('id', {count:'exact',head:true})...
])
```

### 14.6 Cohérence grace_confirmation dans api-tenants.ts
Dans GET /:slug et GET /:slug/menu, remplacer le filtre statut hardcodé par une logique qui inclut les tenants `inactif` ayant un abonnement `en_attente_confirmation` valide.

**Risque** : cette requête devient plus complexe. Stratégie alternative : ajouter `'inactif'` à la liste des statuts acceptés dans GET /:slug, et déléguer la décision finale à `verifierAccesTenant()` (comme le fait déjà `index.tsx`).

---

## Sécurité transverse — HSTS

**Fichier impacté** : `src/lib/security.ts` — `setSecurityHeaders()`  
**Plan** : Ajouter `c.header('Strict-Transport-Security', 'max-age=31536000; includeSubDomains')` dans `setSecurityHeaders()`.  
**Pas de risque de régression** — ajout d'un header.
