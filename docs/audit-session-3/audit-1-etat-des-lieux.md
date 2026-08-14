# Audit #1 — État des lieux avant correction (Session 3)

**Date** : 2026-08-14  
**Branche** : `fix/audit-session-3`  
**Méthode** : Lecture intégrale de chaque fichier concerné, grep exhaustif, vérification ligne par ligne  
**Périmètre** : Corrections 1 à 14 du prompt de session 3

---

## 1. Rate Limiting (Correction #1)

### État vérifié

**Pattern existant** : `checkRateLimit()` dans `src/lib/security.ts` — KV-backed avec fallback Map en mémoire.  
**Signature** : `checkRateLimit(key, maxRequests, windowMs, kv?)` — le paramètre `kv` est **optionnel**.

**Routes avec rate limiting KV correct (passent `c.env.KV_CACHE`)** :
- `api-auth.ts` L.107 → `auth_login:{ip}` — 5/15min ✅
- `api-auth.ts` L.131 → `auth_register:{ip}` — 15/1h ✅
- `api-auth.ts` L.213 → `auth_forgot-pwd:{ip}` + `auth_forgot-pwd-email:{email}` — 5/1h ✅
- `api-auth.ts` L.274 → `verify-otp:{ip}` + `verify-otp-email:{email}` — 10/15min ✅
- `api-dashboard.ts` L.1465 → `change-password:{user_id}` — 5/15min ✅
- `api-dashboard.ts` L.1761 → `upload:{tenant_id}` — 25/1h ✅
- `api-contact.ts` → (vérifié dans audit précédent : présent) ✅

**Routes SANS rate limiting (KV non passé → fallback mémoire non distribué)** :
- `api-newsletter.ts` L.9 — POST `/api/v1/newsletter` : **AUCUN rate limiting** ❌
- `api-auth.ts` → `forgot-password` passe KV ✅ mais `register` : KV passé ✅
- `api-paiement.ts` → upload preuve : `paiement_upload:{tenant_id}` — KV passé ✅

**Conclusion correction #1** : Seul le endpoint newsletter est sans rate limiting. Tous les autres endpoints sensibles sont protégés.

---

## 2. Fonctionnalité "domaine personnalisé" (Correction #2)

### Occurrences recensées (vérification exhaustive par grep)

**`src/index.tsx`** :
- L.66 : `fetchTenantAvecPdv(env, { colonne: 'slug' | 'domaine_perso' ...})` — type union inclut `domaine_perso`
- L.142-155 : Middleware custom domain — intercepte les requêtes sur des hosts non-plateforme et cherche un tenant par `domaine_perso`
- L.150 : `fetchTenantAvecPdv(c.env, { colonne: 'domaine_perso', valeur: host })`

**`src/routes/api-dashboard.ts`** :
- L.1303 : `let body: { nom?: string; whatsapp_number?: string; domaine_perso?: string | null }` — type body inclut `domaine_perso`
- L.1313-1331 : Bloc de vérification plan Mogho pour domaine personnalisé
- L.1327 : Message d'erreur "Le domaine personnalisé est réservé au plan Mogho."
- L.1336 : `if (body.domaine_perso !== undefined) updateData.domaine_perso = body.domaine_perso` — écriture en base
- L.1384 : `.select('...domaine_perso...')` dans GET /profil (client RLS)
- L.1390 : `.select('...domaine_perso...')` dans GET /profil (client admin fallback)

**`src/pages/home.ts`** :
- L.451 : `domaine_perso: 'Domaine personnalisé'` — description de feature dans les plans de la page d'accueil

**`src/pages/tarifs.ts`** :
- L.300 : `${features.domaine_perso ? '<li>...Domaine personnalisé</li>' : ''}` — affichage conditionnel feature

**`public/static/js/dashboard.js`** :
- L.1687 : `<input id="param-domaine" ... value="${escHtml(tenant.domaine_perso||'')}" placeholder="monrestaurant.com">` — champ formulaire
- L.1749 : `domaine_perso: document.getElementById('param-domaine')?.value?.trim() || null` — soumission

**`src/types/database.ts`** :
- L.69 : `domaine_perso: string | null` — dans interface `Tenant`

**`supabase/migrations/001_initial_schema.sql`** :
- L.83, L.86 : `"domaine_perso": true` dans les fonctionnalités JSON des plans Pro et Premium
- L.103 : `domaine_perso TEXT UNIQUE` — colonne dans la table `tenants`

**`supabase/migrations/009_sync_plans_depuis_d1.sql`** :
- L.83, 102, 120 : `"domaine_perso": false` dans les seeds plans
- L.138 : `"domaine_perso": true` dans le seed plan Mogho

**Conclusions** :
- La colonne `domaine_perso TEXT UNIQUE` existe bien dans la table `tenants` (migration 001)
- Le middleware de résolution est actif dans `index.tsx`
- Le formulaire dashboard expose et envoie le champ
- Les pages home et tarifs affichent la feature
- Le type TypeScript `Tenant` inclut le champ
- **Aucun SELECT `domaine_perso` dans `api-tenants.ts`** (API publique) — la colonne n'est pas exposée publiquement ✅
- **CORS** : pas de logique domaine custom dans la config CORS — déjà propre ✅

---

## 3. Limite de PDV (Correction #3)

### État vérifié

**`supabase/migrations/001_initial_schema.sql`** (L.75-88) :
```
Gratuit : limite_pdv = 1
Starter : limite_pdv = 1
Pro     : limite_pdv = 3   ← À remettre à 1
Premium : limite_pdv = 10  ← À remettre à 1
```

**`supabase/migrations/009_sync_plans_depuis_d1.sql`** : pas de colonne `limite_pdv` visible dans ce fichier (seeds sans cette colonne).

**`src/routes/api-dashboard.ts`** : aucune vérification `limite_pdv` dans le flux de création de PDV — comportement actuel : pas de limite applicative. ✅ (conforme à la correction #3 — ne pas ajouter de blocage, juste corriger la valeur en base)

**Conclusion** : Correction simple — migration SQL pour `UPDATE plans SET limite_pdv = 1` sur tous les plans. Aucun code à modifier.

---

## 4. Fonctionnalités plans (Correction #4) — État actuel non sécurisé

**Confirmé** : Aucun contrôle serveur sur `produits_max`, `categories_max`, `statistiques_avancees`, `codes_promo`, `export_csv`, `commandes_incluses`. Ces limites sont dans le JSON `fonctionnalites` mais **jamais vérifiées côté backend**. **Laissé de côté per spec #4.**

---

## 5. Emails — État des lieux (Correction #5)

### Infrastructure existante
- `src/lib/brevo.ts` : `sendEmail()` avec rotation 3 clés + `escapeHtml()` ✅
- `envoyerEmailContact()` : opérationnel pour le formulaire de contact ✅

### Emails manquants (confirmés absents par recherche exhaustive)

| Email | Déclenché par | État |
|-------|--------------|------|
| Bienvenue à l'inscription | `POST /api/v1/auth/register` | ❌ ABSENT |
| Confirmation paiement soumis | `POST /api/v1/paiement/soumettre` | ❌ ABSENT |
| Confirmation paiement validé | `POST /api/v1/admin/paiements/confirmer` | ❌ ABSENT |
| Paiement rejeté | `POST /api/v1/admin/paiements/rejeter` | ❌ ABSENT |
| Rappel avant fin essai (J-5, J-2) | Cron nocturne | ❌ ABSENT |
| Rappel avant fin abonnement (J-5, J-2) | Cron (à créer) | ❌ ABSENT |
| Demande suppression reçue | Route à créer | N/A |
| Newsletter envoi réel | Route admin à créer | ❌ ABSENT |

### Ce qui existe
- Notifications **in-app** (table `notifications_restaurant`) ✅
- Notifications **WhatsApp** (`lib/whatsapp.ts`) pour confirmation/rejet ✅
- Notifications **FCM push** (`lib/fcm.ts`) ✅
- Email formulaire de contact ✅

---

## 6. Sécurisation emails XSS (Correction #6)

### État vérifié

**`src/lib/brevo.ts`** : `escapeHtml()` définie L.146-153. Utilisée dans `envoyerEmailContact()` pour tous les champs. ✅

**Templates à créer (point 5)** : devront utiliser `escapeHtml()` pour tout contenu utilisateur.

---

## 7 & 10. Notifications de rappel / Cron abonnement expiré (Corrections #7 et #10)

### État vérifié

**Cron existant (essai → inactif)** : `verifierEssaisExpires()` dans `api-cron.ts` L.173-246 ✅
- Passe `statut = 'inactif'` ✅
- Invalide cache KV `tenant:{slug}` ✅
- **PAS d'email envoyé** — notification in-app seulement ❌
- **Rappels avant expiration (J-5, J-2)** : absents ❌

**Cron MANQUANT (actif → inactif pour abonnement payant expiré)** :
- **N'existe pas** — confirmé par lecture complète de `api-cron.ts` ❌
- La colonne `abonnements.date_fin` est calculée à la confirmation mais **jamais vérifiée ultérieurement** par un cron
- Un tenant actif avec `abonnements.date_fin < now` reste `statut = 'actif'` indéfiniment

**`verifierAccesTenant()`** (`src/lib/acces-tenant.ts`) :
- Pour `statut = 'actif'` : retourne `accesComplet = true` **sans vérifier `date_fin`** (L.81-83) ❌
- La vérification `essai_expire_le < now` n'est pas non plus faite en temps réel pour le mode 'essai' (L.85-86) — retourne accesComplet sans vérifier la date ❌

---

## 8. Invalidations de cache KV (Correction #8)

### État vérifié

**Clés KV identifiées dans le code** :
| Clé | TTL | Invalidée où |
|-----|-----|-------------|
| `tenant:{slug}` | 300s | api-dashboard.ts (apparence, parametres, PDV), api-paiement.ts (soumettre), api-admin-paiements.ts (confirmer, rejeter), api-cron.ts (essais, bloquer) |
| `menu:{slug}` | 120s | api-dashboard.ts (mutations produits, catégories, suppléments) |
| `tenants:public:{limit}` | 300s | **JAMAIS INVALIDÉ** ❌ |
| `session:{token}` | 3600s | api-auth.ts (logout) |
| `rl:{key}` | windowMs | auto-expire |
| `config:{key}` | 3600s (D1 cache) | **JAMAIS INVALIDÉ** ❌ |
| Clé cache `fetchTenantAvecPdv()` | aucune | Pas de cache sur cette fonction ❌ |

**Bug RLS silencieux PATCH /apparence** (`api-dashboard.ts` L.1283-1290) :
```typescript
const { error } = await supabase  // client RLS-scopé (token user)
  .from('tenants')
  .update(updateData)
  .eq('id', auth.tenant_id)
// Pas de .select() → impossible de savoir si 0 lignes affectées
// Pas de vérification count → succès silencieux si RLS bloque
```
Cache invalidé même si 0 lignes modifiées (L.1290) ❌

---

## 9. Pagination (Correction #9)

### Routes sans pagination confirmées

| Route | Fichier | Lignes affectées |
|-------|---------|-----------------|
| `GET /api/v1/dashboard/livreurs` | api-dashboard.ts L.1028-1044 | Aucun limit/offset |
| `GET /api/v1/dashboard/codes-promo` | api-dashboard.ts L.1531-1548 | Aucun limit/offset |
| `GET /api/v1/dashboard/menu` | api-dashboard.ts L.375-436 | `.limit(5000)` hardcodé L.428 |
| `GET /api/v1/tenants/:slug/menu` | api-tenants.ts | SELECT * sans limit produits |
| `GET /api/v1/dashboard/stats` — allCommandes | api-dashboard.ts L.470+ | SELECT sans LIMIT |
| Notifications restaurant | api-dashboard.ts L.~267-313 | `.limit(10)` ✅ mais liste complète sans pagination |

**Routes avec pagination OK** :
- `GET /api/v1/dashboard/commandes` L.289-311 : page/limit avec range ✅
- `GET /api/v1/admin/paiements` L.66-115 : page/limit ✅

---

## 11. Suppression de compte (Correction #11)

### État vérifié

**Aucune route de suppression de compte n'existe** dans le code :
- Grep exhaustif sur `suppression`, `delete.*tenant`, `DELETE.*compte`, `deleted_at.*update` → rien côté restaurateur
- `dashboard.js` L.~1745 : bouton "Demander la suppression du compte" → appelle `confirmerSuppression()` — fonction qui fait quoi ? Voyons :

```javascript
// dashboard.js (grep)
grep -n "confirmerSuppression" → L.1742 bouton + définition à chercher
```

- **Champs `deleted_at`** : présent dans la table `tenants` (migration 001) mais **aucune route ne le positionne**
- **Champs à ajouter** pour le flux demandé : `suppression_demandee_le`, `suppression_prevue_le`

---

## 12. Suppression R2 orphelins + sécurisation uploads (Correction #12)

### État vérifié

**Upload-image** (`api-dashboard.ts` L.1751-1810) :
- Validation : `allowedTypes` (array Content-Type) ✅
- Validation taille max 5MB ✅
- **PAS de magic bytes** — `validerMimeImage()` de `lib/paiement.ts` NON utilisée ❌
- `R2_MEDIA.put()` sans try/catch ❌

**Upload logo/bannière** (POST /setup-restaurant, api-dashboard.ts L.1987-2030) :
- Chaque upload dans son propre try/catch ✅ (correctif BUG-2 mentionné)

**Suppression R2 orphelins** :
- Lors du remplacement d'une image : **l'ancienne clé R2 n'est JAMAIS supprimée** ❌
- Lors de soft-delete produit : **fichier R2 non supprimé** ❌
- Seul cas de suppression R2 : `api-paiement.ts` L.437 (rollback si insert échoue) ✅

---

## 13. CASCADE DELETE Supabase Auth (Correction #13)

### État vérifié par lecture des migrations

**Liens `auth.users`** : **AUCUNE foreign key vers `auth.users`** trouvée dans les migrations. Confirmé par grep exhaustif — aucun `REFERENCES auth.users`. La colonne `utilisateurs_tenant.auth_user_id` est de type `UUID` simple, **sans contrainte référentielle vers `auth.users`**.

**Cascade depuis `tenants(id)` vers les tables enfants** :
| Table enfant | Cascade | Migration |
|-------------|---------|-----------|
| `utilisateurs_tenant` | ❌ PAS de FK vers auth.users, pas de cascade | 001 L.~117 |
| `points_de_vente` | `ON DELETE CASCADE` depuis `tenants` | 001 L.121 |
| `categories_menu` | `ON DELETE CASCADE` depuis `tenants` | 001 L.139 |
| `produits` | `ON DELETE CASCADE` depuis `tenants` | 001 L.160 |
| `variantes_produit` | `ON DELETE CASCADE` depuis `produits` | 001 L.176-177 |
| `supplements` | `ON DELETE CASCADE` depuis `produits` | 001 L.201 |
| `commandes` | `ON DELETE CASCADE` depuis `tenants` | 001 L.268 |
| `commandes_items` | `ON DELETE CASCADE` depuis `commandes` | 001 L.289 |
| `livreurs` | `ON DELETE CASCADE` depuis `tenants` | 001 L.341 |
| `notifications_restaurant` | `ON DELETE CASCADE` depuis `tenants` | 008 L.21 |
| `fcm_tokens` | `ON DELETE CASCADE` depuis `tenants` | 013 L.8 |
| `abonnements` | ❓ À vérifier | 007 |
| `stats_journalieres` | ❓ À vérifier | 010 |
| `codes_promo` | ❓ À vérifier | 001 |
| `audit_log` | ❓ À vérifier | 001b |

**Conclusion** :
- Si on `DELETE FROM tenants WHERE id = X`, la plupart des données enfant sont supprimées en cascade
- **`utilisateurs_tenant.auth_user_id` n'a PAS de FK vers `auth.users`** → la suppression du tenant ne supprime PAS automatiquement le compte Supabase Auth
- La suppression Supabase Auth doit être faite explicitement via `adminClient.auth.admin.deleteUser(uid)`

---

## 14. Performances (Correction #14)

### État vérifié

**14.1 `fetchTenantAvecPdv()`** (`src/index.tsx` L.66-90) :
- Appelée à chaque requête sur `/{slug}` **et** dans le middleware custom domain
- **Aucun cache** — requête Supabase fraîche à chaque fois ❌

**14.2 N+1 dans `calculerStatsJournalieres()`** (`api-cron.ts` L.91-97) :
- Boucle `for (const tenant of tenants)` avec `await calculerStatsUnTenant()` pour chaque tenant
- Chaque itération fait 2 requêtes Supabase (commandes + items) — N+1 confirmé ❌

**14.3 N+1 dans GET /admin/paiements** (`api-admin-paiements.ts` L.91-104) :
- `Promise.all()` avec `chargerPlan()` pour chaque abonnement — parallélisé mais toujours N requêtes
- N+1 réel mais atténué par `Promise.all` ⚠️

**14.4 `select('*')` dans `api-commandes.ts` L.166** : à vérifier précisément

**14.5 Appels séquentiels dans GET /dashboard/profil** (`api-dashboard.ts` L.1353+) :
- `getUser(token)` puis `adminClient.from('utilisateurs_tenant')...` puis `verifierAccesTenant()` puis tenant + PDV + commandes — séquentiels ❌

**14.6 Incohérence `grace_confirmation`** :
- `api-tenants.ts` GET /:slug filtre `.in('statut', ['actif', 'essai', 'en_attente_paiement_initial'])` — n'inclut pas un tenant `inactif` en `grace_confirmation` ❌
- La page HTML de boutique (via `index.tsx` + `verifierAccesTenant()`) est accessible pour ce cas
- **Incohérence confirmée** : API publique retourne 404 mais page HTML est visible ❌

---

## 15. Sécurité transverse — HSTS & CSP (Hors corrections individuelles)

**HSTS** : grep exhaustif → `Strict-Transport-Security` **ABSENT** du code ❌

**CSP** : présent dans `setSecurityHeaders()` (`security.ts` L.155-167) ✅

**CORS** : configuration dans `index.tsx` L.107-117 — filtre sur domaines racines `monmenu.app/com/bf` + `workers.dev` + localhost. **Aucune logique domaine_perso dans CORS** ✅ (la suppression #2 n'impacte pas CORS)

---

## Résumé — Points confirmés avant correction

| # | Correction | État avant correction |
|---|-----------|----------------------|
| 1 | Rate limiting newsletter | ❌ ABSENT sur newsletter |
| 2 | Suppression domaine_perso | ❌ Présent en 8 fichiers (index.tsx, api-dashboard.ts x5, home.ts, tarifs.ts, dashboard.js x2, database.ts, migrations x3) |
| 3 | limite_pdv = 1 partout | ❌ Pro=3, Premium=10 en base |
| 4 | Fonctionnalités plans | Non sécurisé — laissé de côté |
| 5 | Emails manquants | ❌ 7 emails absents |
| 6 | Anti-XSS emails | `escapeHtml()` présente mais à appliquer aux nouveaux templates |
| 7 | Rappels cron | ❌ Absents |
| 8 | Invalidations cache KV | ❌ `tenants:public`, `config:` non invalidés; bug RLS apparence |
| 9 | Pagination | ❌ Absente sur livreurs, codes-promo, menu |
| 10 | Cron actif→inactif | ❌ ABSENT; vérif à la volée `essai_expire_le` absente |
| 11 | Suppression compte | ❌ Aucune route existante |
| 12 | R2 orphelins + MIME | ❌ Pas de delete R2, pas de magic bytes sur upload-image |
| 13 | CASCADE DELETE | ✅ Existe pour la plupart des tables enfant; auth.users nécessite suppression explicite |
| 14 | Performances | ❌ fetchTenantAvecPdv non caché, N+1 stats cron, incohérence grace_confirmation |
| HSTS | Header sécurité | ❌ ABSENT |
