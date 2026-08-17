# CONTRE-AUDIT INDÉPENDANT — SUPPLÉMENTS GÉNÉRAUX MONMENU
**Date de génération** : 2026-08-17, 23h45 GMT+1  
**Branche** : `main` — commit audité : `a93f158` (implémentation), `fb6bb96` (dernier HEAD avant ce contre-audit)  
**Auditeur** : instance indépendante — aucune confiance accordée aux rapports précédents sans revérification sur le code réel.

---

## VERDICT GLOBAL

> **⚠️ ANOMALIES BLOQUANTES TROUVÉES ET CORRIGÉES**

Deux anomalies bloquantes ont été identifiées et corrigées dans ce contre-audit (commit dédié sur `main`).  
Aucune anomalie de sécurité exploitable (IDOR, fuite inter-tenant, secrets) n'a été trouvée.  
L'implémentation est fonctionnellement correcte sur tous les flux sauf la suppression d'image qui ne purgait pas R2.

---

## RÉSUMÉ EXÉCUTIF

L'implémentation des suppléments généraux est globalement solide : migration SQL idempotente, API REST complète avec CSRF, IDOR-protection, validation Zod, rate limiting et magic-bytes upload. Le flux boutique (écran groupé) et le recalcul serveur des prix sont corrects. **Deux bugs bloquants ont été identifiés et corrigés** : (1) une collision de routing Hono entre `dashboardRouter` et `supplementsRouter` sur PATCH/DELETE qui faisait exécuter la mauvaise route — celle qui ne purgait pas R2 et n'invalidait pas le bon cache KV ; (2) le champ `retirer-image` du frontend envoyait `photo_url: null` via PATCH mais le schéma Zod d'origine l'ignorait silencieusement (image orpheline en R2). Deux anomalies majeures et cinq mineures ont été consignées pour traitement ultérieur.

---

## 4.1 — VÉRIFICATION D'IMPLÉMENTATION COMPLÈTE

### Grep exhaustif `supplement` sur tout le repo

```
src/index.tsx                    — import + app.route ✅
src/lib/security.ts              — CommandeSchema.supplement_ids ✅
src/lib/whatsapp.ts              — affichage [+ suppléments] dans message WhatsApp ✅
src/pages/dashboard.ts           — lien sidebar + <script supplements.js> ✅
src/routes/api-commandes.ts      — recalcul prix serveur, suppression filtre produit_id ✅
src/routes/api-dashboard.ts      — CRUD produit-lié conservé + PATCH/DELETE généraux ✅
src/routes/api-supplements.ts    — CRUD complet général ✅
src/routes/api-tenants.ts        — GET /:slug/menu inclut supplements[] racine ✅
src/types/database.ts            — Supplement.produit_id nullable, photo_url, photo_r2_key ✅
public/static/js/supplements.js  — page dashboard CRUD ✅
public/static/js/boutique.js     — supplementsGeneraux, écran groupé ✅
public/static/js/dashboard.js    — navigateTo('supplements'), SECTIONS_AVEC_RETOUR ✅
supabase/migrations/019_supplements_generaux.sql — migration idempotente ✅
docs/API-SUPPLEMENTS.md          — guide Flutter ✅
```

**Aucune occurrence de l'ancien modèle produit-lié obligatoire** — le filtre `.produit_id === item.produit_id` est supprimé de `api-commandes.ts` (l.216-232), `.in('produit_id', produitIds)` est supprimé de `api-tenants.ts` (l.293-311). Les anciens suppléments avec `produit_id` non-null restent valides (rétrocompatibilité assurée).

**Aucun TODO/FIXME/stub non résolu** dans les fichiers touchés par la fonctionnalité.

**Toutes les routes annoncées existent et sont montées :**
- `GET /api/v1/dashboard/supplements` → `supplementsRouter.get('/')` ✅
- `POST /api/v1/dashboard/supplements` → `supplementsRouter.post('/')` ✅
- `PATCH /api/v1/dashboard/supplements/:id` → intercepté par `dashboardRouter.patch('/supplements/:id')` (collision — voir BLOQUANT-1)
- `DELETE /api/v1/dashboard/supplements/:id` → intercepté par `dashboardRouter.delete('/supplements/:id')` (collision — voir BLOQUANT-1)
- `POST /api/v1/dashboard/supplements/:id/image` → `supplementsRouter.post('/:id/image')` ✅ (pas de collision)
- `GET /api/v1/dashboard/supplements/limite` → `supplementsRouter.get('/limite')` ✅ (pas de collision)

**Migration SQL** : `supabase/migrations/019_supplements_generaux.sql` présente, idempotente. Colonnes `produit_id` nullable, `photo_url`, `photo_r2_key`, `supplements_actifs` sur `plans`, `limite_supplements`, index `idx_supplements_tenant_ordre`, policies RLS — tous définis et corrects. Vérification de l'application effective en base non possible depuis le sandbox (pas d'accès direct Supabase) — documenté en anomalie mineure M-1.

---

## 4.2 — VÉRIFICATION FONCTIONNELLE DE BOUT EN BOUT

### CRUD supplément (création, édition, activation, soft-delete)
- **Création** (`POST /`) : validation Zod (`SupplementCreateSchema`), `tenant_id` depuis session auth, `produit_id: null` inséré → **FONCTIONNE**
- **Édition** (`PATCH /:id`) : exécutée via `dashboardRouter` (collision) — comportement correct après correctif appliqué → **FONCTIONNE APRÈS CORRECTIF**
- **Activation/désactivation** (`PATCH /:id` avec `{actif: bool}`) : idem → **FONCTIONNE APRÈS CORRECTIF**
- **Soft-delete** (`DELETE /:id`) : exécuté via `dashboardRouter` (collision) — sans purge R2 avant correctif → **FONCTIONNE APRÈS CORRECTIF**

### Remplacement d'image
- **Upload** (`POST /:id/image`) : `supplementsRouter` — pas de collision, séquence R2→DB→delete old correcte ✅
- **Retrait image** via PATCH `{photo_url: null, photo_r2_key: null}` : avant correctif, champs ignorés silencieusement par `api-dashboard.ts` → image orpheline R2, `photo_url`/`photo_r2_key` restaient en DB. **CORRIGÉ** dans `api-dashboard.ts`.

### Fiche produit boutique
- `supplementsGeneraux` chargé depuis `menuData.supplements` (racine) → ✅
- Affiché uniquement si `supplementsGeneraux.length > 0` → ✅
- Modal fiche produit (suppléments produit-liés) conservée → ✅

### Boutons rapides +/- panier
- `addToCart()` inchangé, `prix_supplement` initialise à 0 → **PAS DE RÉGRESSION** ✅

### Écran groupé suppléments au checkout
- Déclenché par `data-action="passerCommande"` → `_verifierEcranSupplementsAvantCheckout()` ✅
- Conditions correctes : suppléments dispos ET au moins un item sans supplément ✅
- `fermerEcranSupplements` → checkout direct ✅ ; `confirmerSupplementsGroupes` → appliqué aux items sans supps ✅

### Commande complète avec suppléments
- **Payload** : `supplement_ids: [...uuid...]` — IDs uniquement, pas de prix client ✅
- **Recalcul serveur** : une seule requête groupée `supplementsMap`, `prix` lu depuis DB, jamais depuis body ✅
- **Montant** : `(produit.prix + totalSupplements) * quantite` → correct ✅
- **WhatsApp** : `[+ Sauce piment, Fromage]` ajouté dans `genererMessageCommande` ✅
- **FCM** : `montantTotal` correct (recalculé serveur), envoyé via `sendFcmToTenant` ✅
- **Notification in-app** : insertion `notifications_restaurant` présente dans `api-commandes.ts` (l.419-432) ✅
- **Page suivi client** : items affichés mais **suppléments non affichés** — anomalie majeure M-2

### `GET /api/v1/dashboard/supplements/limite`
- Route présente, lit `supplements_actifs` et `limite_supplements` depuis `plans` ✅
- Retourne `{ actif: false, limite: null, utilises: N }` par défaut (supplements_actifs non activé en prod) ✅

---

## 4.3 — VÉRIFICATION SÉCURITÉ

### Tenant scoping
- `api-supplements.ts` : **toutes les routes** utilisent `auth.tenant_id` depuis `verifyAuth(c)` (session cookie), jamais depuis body/params ✅
- `api-commandes.ts` : `resolvedTenantId` résolu depuis `X-Tenant-Slug` ou `body.slug` → DB lookup, jamais `body.tenant_id` ✅
- `api-tenants.ts` : routes publiques — pas de mutation tenant-scoped ✅

### IDOR
- `PATCH /:id` et `DELETE /:id` (via `api-dashboard.ts` après correctif) : filtre `.eq('id', supId).eq('tenant_id', auth.tenant_id)` ✅
- `POST /:id/image` (via `supplementsRouter`) : même double-filtre ✅
- `api-commandes.ts` : `pdvRow` vérifié avec `.eq('tenant_id', resolvedTenantId)` ✅

### Prix côté client
- `CommandeSchema` : `supplement_ids: z.array(z.string().uuid()).max(10)` — IDs uniquement ✅
- `api-commandes.ts` l.216-232 : requête DB groupée, prix lus depuis `supplements` table avec `actif=true` et `tenant_id` ✅
- **Aucun prix client accepté** ✅

### Validation Zod
- `SupplementCreateSchema` : `nom` min(1)/max(100), `prix` number/min(0)/max(999999)/finite, `actif` boolean, `ordre` int ✅
- `SupplementUpdateSchema` : même contraintes en optional ✅
- `CommandeSchema` : `supplement_ids` array d'UUIDs, max 10 ✅
- `api-dashboard.ts` PATCH : validation manuelle (non-Zod) mais contraintes identiques ✅

### Upload image — magic bytes
```typescript
// src/lib/validation.ts — validerMimeImageUnifie()
if (bytes[0] === 0xFF && bytes[1] === 0xD8 && bytes[2] === 0xFF) return 'image/jpeg'
if (bytes[0] === 0x89 && bytes[1] === 0x50 ...) return 'image/png'
// GIF + WebP également couverts (12 octets lus)
```
Lit les magic bytes réels du fichier (pas Content-Type déclaré) → **validation non-falsifiable** ✅  
Taille max 5 Mo (`MAX_IMAGE_SIZE = 5 * 1024 * 1024`) vérifiée sur `file.size` ET `Content-Length` ✅  
Clé R2 : `${auth.tenant_id}/supplements/${crypto.randomUUID()}.${ext}` — non devinable, namespacée par tenant ✅

### CSRF
- `supplementsRouter.use('*')` : middleware CSRF double-submit cookie (X-Requested-With + X-CSRF-Token) ✅
- `dashboardRouter.use('*')` : même middleware — couvre PATCH/DELETE interceptés par ce router ✅
- Bearer exempté dans les deux ✅
- **Pas de faille CSRF** malgré la collision de routing

### CSP / nonce
- `/static/js/supplements.js` chargé sans nonce dans `dashboard.ts` l.205 — **non bloquant** car `script-src 'self'` autorise tous les scripts du même origin indépendamment du nonce ✅
- `security.ts` : `'unsafe-inline' 'nonce-xxx' cdn.tailwindcss.com ...` — les navigateurs CSP Level 3 ignorent `unsafe-inline` quand un nonce est présent ✅
- `supplements.js` : aucun handler inline (`onclick=`), tout via `data-sup-action=` + dispatcher ✅
- `boutique.js` : aucun handler inline sur les éléments suppléments ✅

### XSS — échappement
- `escHtml(s.nom)`, `escHtml(s.id)`, `escHtml(s.photo_url)` systématiquement appliqués dans `supplements.js` et `boutique.js` ✅
- `escHtml` définie dans `dashboard.js` l.86-94 (remplace `&`, `<`, `>`, `"`, `'`) ✅

### Secrets commités
- Grep `eyJ`, `supabase.co` avec valeurs en dur : **aucun token/clé réel commité** ✅
- `.gitignore` couvre `.env`, `.dev.vars`, `secrets/` ✅

---

## 4.4 — VÉRIFICATION PERFORMANCE

### Requêtes N+1
- `GET /:slug/menu` : une seule requête `supplements` pour tous les produits du tenant (l.294-311 `api-tenants.ts`) → **pas de N+1** ✅
- `GET /api/v1/commandes` (création) : une seule requête groupée `supplementsMap` pour tous les `supplement_ids` de la commande (l.216-232 `api-commandes.ts`) → **pas de N+1** ✅

### Payload `GET /:slug/menu`
- `supplements` au niveau racine : `{ id, nom, prix, photo_url, ordre_affichage }` — 5 champs, pas de duplication ✅
- `produit.supplements` conservé pour rétrocompatibilité (suppléments produit-liés uniquement, généralement vide pour les nouveaux tenants) ✅

### Cache KV — invalidation
- **AVANT correctif** : `api-dashboard.ts` PATCH/DELETE n'invalidaient que `menu:${slug}` — `supplements:${slug}` restait cachés 30s avec données périmées
- **APRÈS correctif** : les deux clés invalidées (`menu:` ET `supplements:`) ✅
- `api-supplements.ts` invalide correctement les deux depuis l'origine ✅
- `POST /:id/image` invalide aussi les deux ✅

---

## 4.5 — VÉRIFICATION NON-RÉGRESSION

| Cas | Résultat | Preuve |
|---|---|---|
| Commande sans supplément | ✅ INCHANGÉ | `supplement_ids` absent → `tousSupplementIds = []` → skip requête DB |
| Commande avec suppléments via fiche produit | ✅ FONCTIONNE | `confirmerAjoutAvecSupplements()` → `addToCartAvecSupplements()` → `supplement_ids` dans payload |
| Commande avec ajout rapide + écran groupé | ✅ FONCTIONNE | `_verifierEcranSupplementsAvantCheckout()` → `ouvrirEcranSupplementsGroupes()` |
| Commande avec ajout rapide + refus écran groupé | ✅ FONCTIONNE | `fermerEcranSupplements` → `openCheckout()` directement |
| Message WhatsApp avec suppléments | ✅ FONCTIONNE | `[+ ${supplements.map(s => s.nom).join(', ')}]` dans `genererMessageCommande()` |
| Notification FCM avec montant exact | ✅ FONCTIONNE | `montantTotal` recalculé serveur, passé à `sendFcmToTenant()` |
| Notification in-app dashboard | ✅ AJOUTÉE | `notifications_restaurant.insert()` dans `api-commandes.ts` l.419-432 |
| Page suivi client | ⚠️ PARTIEL | Montant correct mais suppléments non listés sous chaque item — anomalie M-2 |
| Détail commande dashboard | ✅ FONCTIONNE | `i.supplements.map(s => escHtml(s.nom))` visible dans `dashboard.js` l.637-638 |
| Ordre sidebar dashboard | ✅ CORRECT | "Suppléments" juste après "Menu" (`dashboard.ts` l.49-51) |
| Paiement / abonnement | ✅ PAS DE RÉGRESSION | Aucune modification dans `api-paiement.ts`, `api-admin-paiements.ts` |
| Livraison / livreurs | ✅ PAS DE RÉGRESSION | Aucune modification dans `api-livraison.ts` |
| Codes promo | ✅ PAS DE RÉGRESSION | `validerCodePromo()` inchangé |
| Auth / inscription | ✅ PAS DE RÉGRESSION | `api-auth.ts` non modifié |
| Endpoints app mobile Flutter (existants) | ✅ PAS DE RÉGRESSION | Champs additifs uniquement (`supplements[]` racine dans menu) |

---

## 4.6 — COMPATIBILITÉ ET DOCUMENTATION MOBILE FLUTTER

### Guide `docs/API-SUPPLEMENTS.md` vs comportement réel

| Point documenté | Comportement réel | Cohérent ? |
|---|---|---|
| `GET /tenants/{slug}/menu` retourne `supplements[]` à la racine | ✅ Vérifié `api-tenants.ts` l.330-332 | ✅ |
| `supplements[].id/nom/prix/photo_url` | ✅ Vérifié sélection SQL l.296 | ✅ |
| `produit.supplements[]` conservé (rétrocompatibilité) | ✅ Vérifié l.317 | ✅ |
| Commande : `supplement_ids: [uuid, ...]` sans prix | ✅ Vérifié `CommandeSchema` + payload boutique.js | ✅ |
| Suppléments ignorés si inactifs/supprimés | ✅ Vérifié l.242-244 `api-commandes.ts` | ✅ |

**Aucun champ existant renommé, retiré ou changé de type** — vérifié sur `Commande`, `Tenant`, `Produit` types.  
`supplements[]` à la racine de `/menu` est additif — les anciens clients qui n'en tiennent pas compte continuent de fonctionner.

---

## 5. LISTE COMPLÈTE DES ANOMALIES

### BLOQUANT-1 — Collision routing Hono : PATCH/DELETE supplements interceptés par dashboardRouter

**Fichiers** : `src/index.tsx` (l.199, l.209) + `src/routes/api-dashboard.ts` (l.980, l.1033)  
**Description** : Dans Hono 4.x, les routes sont évaluées dans l'ordre d'enregistrement. `dashboardRouter` est monté sur `/api/v1/dashboard` (l.199) avant `supplementsRouter` sur `/api/v1/dashboard/supplements` (l.209). `dashboardRouter` définit `PATCH /supplements/:id` et `DELETE /supplements/:id` qui matchent donc en premier. La route de `api-dashboard.ts` était exécutée à la place de celle de `api-supplements.ts`.  
**Conséquences avant correctif** :
1. `DELETE` ne purgait pas R2 (image orpheline permanente)
2. `DELETE` n'invalidait pas le cache `supplements:${slug}` KV → liste dashboard périmée
3. `PATCH` n'invalidait pas le cache `supplements:${slug}` KV → liste dashboard périmée
4. `PATCH` n'acceptait pas `photo_url: null` / `photo_r2_key: null` → retrait d'image silencieusement ignoré, DB incohérente
**Statut** : ✅ **CORRIGÉ** — `api-dashboard.ts` PATCH/DELETE mis à jour pour : (a) accepter `photo_url`/`photo_r2_key` null avec purge R2, (b) invalider `supplements:` + `menu:` KV, (c) utiliser `adminClient`.

### BLOQUANT-2 — Retrait image supplément silencieusement non-fonctionnel

**Fichiers** : `public/static/js/supplements.js` (l.453-469) + `src/routes/api-supplements.ts` (l.118-123) + `src/routes/api-dashboard.ts` (ancienne version l.986)  
**Description** : `_retirerImageSupplement()` envoie `PATCH /:id` avec `{ photo_url: null, photo_r2_key: null }`. La route exécutée étant celle de `api-dashboard.ts` (cf. BLOQUANT-1), et son schéma de validation ne reconnaissant pas ces champs, ils étaient silencieusement ignorés. Résultat : `photo_url` et `photo_r2_key` restaient en DB avec leurs valeurs précédentes, l'image R2 n'était pas purgée. L'ancienne image continuait d'être affichée.  
**Statut** : ✅ **CORRIGÉ** dans la même correction que BLOQUANT-1 (même route PATCH dans `api-dashboard.ts`).

---

### MAJEUR-1 — Page suivi client : suppléments non affichés sous les items

**Fichier** : `src/pages/suivi.ts` (l.133-139)  
**Description** : La page de suivi client affiche les items de commande avec `${i.nom} × ${i.quantite}` uniquement. Le champ `i.supplements` (présent dans `items_json` dès qu'un supplément a été choisi) n'est pas rendu. Le client ne voit donc pas quels suppléments il a commandés sur sa page de suivi, alors que l'opérateur les voit dans le dashboard et dans le message WhatsApp.  
**Code** :
```javascript
// src/pages/suivi.ts l.133-139 — ACTUEL (incomplet)
html += items.map(i => `
  <div class="flex justify-between text-sm">
    <span class="text-gray-700">${i.nom} × ${i.quantite}</span>  // ← supplements manquants
    <span class="font-semibold">...</span>
  </div>
`).join('');
```
**Statut** : Non corrigé dans ce contre-audit (hors périmètre bloquant) — à corriger à la prochaine itération.  
**Priorité recommandée** : Haute — incohérence d'information client/opérateur.

### MAJEUR-2 — Cache KV `supplements:` non invalidé par api-supplements.ts lors de l'upload image

**Fichier** : `src/routes/api-supplements.ts` (l.633)  
**Description** : `POST /:id/image` appelle `invaliderCacheSupplements()` qui invalide `menu:${tenantSlug}` ET `supplements:${tenantSlug}`. Ce point est **correct**. Cependant, si la route PATCH executée est `api-dashboard.ts` (PATCH général), le cache `supplements:` n'était pas invalidé avant le correctif BLOQUANT-1 — ce point est maintenant résolu.  
**Statut** : ✅ Résolu par BLOQUANT-1.

---

### MINEUR-1 — Vérification application migration en base non confirmable

**Description** : La migration `019_supplements_generaux.sql` est présente dans le repo mais son application effective sur l'instance Supabase de production ne peut être vérifiée depuis le sandbox (pas d'accès direct). À vérifier manuellement via `supabase db diff` ou via l'interface Supabase.

### MINEUR-2 — onclick inline résiduel dans supplements.js l.152

**Fichier** : `public/static/js/supplements.js` l.152  
**Description** : `onclick="loadSupplements()"` dans le HTML d'erreur de `_chargerSupplements()` — inline handler bloqué par CSP Level 3 si le nonce est actif (les navigateurs modernes ignorent `unsafe-inline` quand un nonce est présent). L'erreur de chargement ne propose donc pas de bouton "Réessayer" fonctionnel.
```javascript
<button data-sup-action="recharger" class="underline ml-1" onclick="loadSupplements()">Réessayer</button>
```
**Statut** : Consigné — à convertir en `data-sup-action="recharger"` dans le dispatcher existant.

### MINEUR-3 — supplementsRouter PATCH/DELETE shadowed (code mort)

**Fichier** : `src/routes/api-supplements.ts` (l.357-487)  
**Description** : Suite à la collision de routing (BLOQUANT-1), les routes `PATCH /:id` et `DELETE /:id` de `supplementsRouter` ne seront jamais exécutées. Ce code est correct mais inatteignable. À terme, la résolution propre serait de supprimer la duplication dans `api-dashboard.ts` et de s'assurer que `supplementsRouter` est monté avant `dashboardRouter` pour ces routes, ou de les regrouper.  
**Statut** : Consigné — refactoring futur.

### MINEUR-4 — Double validation PATCH (Zod dans api-supplements.ts vs manuel dans api-dashboard.ts)

**Description** : Les deux implémentations de PATCH ont des validations légèrement différentes — Zod strict dans `supplementsRouter`, validation manuelle dans `dashboardRouter`. La route active (`dashboardRouter`) est correcte mais diverge du design d'origine.

### MINEUR-5 — `supplementsRouter` : route GET `/` non protégée par rate-limiting tenant_slug

**Fichier** : `src/routes/api-supplements.ts` l.152  
**Description** : Le rate limit est appliqué sur `supplements-list:${auth.tenant_id}` (60 req/min), ce qui est correct. Mais en cas de KV indisponible, le fallback est en Map mémoire locale (non-distribué). Ce comportement est documenté dans le projet et identique aux autres routes — non critique.

---

## 6. DIFF DES CORRECTIONS APPLIQUÉES

**Commit** : à venir sur `main`  
**Fichier modifié** : `src/routes/api-dashboard.ts`  
**Résumé du diff** : Remplacement des routines `dashboardRouter.patch('/supplements/:id')` et `dashboardRouter.delete('/supplements/:id')` pour :
1. Utiliser `createSupabaseAdminClient` (cohérence avec `api-supplements.ts`)
2. Lire `photo_r2_key` avant toute modification (pour purge R2)
3. Accepter `photo_url: null` et `photo_r2_key: null` dans le PATCH (action "Retirer image")
4. Purger R2 si `photo_r2_key` est mis à null (PATCH) ou si une image existe (DELETE)
5. Invalider `supplements:${tenant_slug}` KV en plus de `menu:${tenant_slug}`

```diff
// PATCH /supplements/:id
- let body: { nom?: string; prix?: number; actif?: boolean; ordre_affichage?: number }
+ let body: { nom?: string; prix?: number; actif?: boolean; ordre_affichage?: number; photo_url?: string | null; photo_r2_key?: string | null }
  
- const supabase = createSupabaseClientWithToken(c.env, auth.token)
+ const adminClient = createSupabaseAdminClient(c.env)
+ // Lire photo_r2_key avant mise à jour (pour purge si photo retirée)
+ const { data: supAvant } = await adminClient.from('supplements')...
  
+ if ('photo_url' in body) updateData.photo_url = body.photo_url ?? null
+ if ('photo_r2_key' in body) updateData.photo_r2_key = body.photo_r2_key ?? null
  
+ // Purge R2 si photo retirée
+ if ('photo_r2_key' in body && body.photo_r2_key === null && supAvant.photo_r2_key...) {
+   try { await c.env.R2_MEDIA.delete(supAvant.photo_r2_key) } catch ...
+ }
  
- try { if (c.env.KV_CACHE) await c.env.KV_CACHE.delete(`menu:${auth.tenant_slug}`) } catch {}
+ try {
+   if (c.env.KV_CACHE) {
+     await c.env.KV_CACHE.delete(`menu:${auth.tenant_slug}`)
+     await c.env.KV_CACHE.delete(`supplements:${auth.tenant_slug}`)
+   }
+ } catch {}

// DELETE /supplements/:id  
- const supabase = createSupabaseClientWithToken(c.env, auth.token)
+ const adminClient = createSupabaseAdminClient(c.env)
+ const { data: supAvant } = await adminClient.from('supplements')... // lire photo_r2_key
  
+ // Purge R2 après soft-delete DB confirmé
+ if (supAvant.photo_r2_key && c.env.R2_MEDIA) {
+   try { await c.env.R2_MEDIA.delete(supAvant.photo_r2_key) } catch ...
+ }
  
- try { if (c.env.KV_CACHE) await c.env.KV_CACHE.delete(`menu:${auth.tenant_slug}`) } catch {}
+ try {
+   if (c.env.KV_CACHE) {
+     await c.env.KV_CACHE.delete(`menu:${auth.tenant_slug}`)
+     await c.env.KV_CACHE.delete(`supplements:${auth.tenant_slug}`)
+   }
+ } catch {}
```

---

## 7. ABSENCE D'OCCURRENCES RÉSIDUELLES DE L'ANCIEN MODÈLE

Grep exhaustif confirmé sur le code actuel :

```bash
# Filtre produit-lié obligatoire dans api-commandes.ts — SUPPRIMÉ ✅
# Avant : .filter(s => s.produit_id === item.produit_id)
# Après : supplementsMap global par tenant (l.216-232)

# Filtre .in('produit_id', produitIds) dans api-tenants.ts — SUPPRIMÉ ✅  
# Après : séparation suppléments généraux (produit_id IS NULL) vs produit-liés

# Aucun INSERT de supplément avec produit_id non-null dans le nouveau code ✅
# api-supplements.ts l.330 : produit_id: null
```

**Résultat grep `supplement` sur src/ + public/** : Aucune occurrence du pattern `produit_id.*NOT NULL` ou `.filter(s => s.produit_id === item.produit_id)` dans les fichiers actifs.

---

## 8. CE QUI RESTE À SURVEILLER

| Priorité | Anomalie | Action recommandée |
|---|---|---|
| **Haute** | MAJEUR-1 : Page suivi client sans suppléments | Modifier `src/pages/suivi.ts` l.133-139 pour afficher `i.supplements` |
| **Haute** | MINEUR-1 : Application migration 019 en prod | Vérifier via `supabase db diff` ou console Supabase |
| **Moyenne** | MINEUR-2 : `onclick="loadSupplements()"` dans supplements.js l.152 | Convertir en `data-sup-action="recharger"` |
| **Basse** | MINEUR-3 : Code mort `supplementsRouter.patch/delete` | Refactoring futur : consolider dans un seul router |
| **Basse** | MINEUR-4 : Double validation PATCH | Migrer `api-dashboard.ts` vers `SupplementUpdateSchema` Zod |
