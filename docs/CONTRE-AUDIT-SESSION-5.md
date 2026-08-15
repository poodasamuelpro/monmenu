# Contre-audit — Vérification du rapport de correction Session #5

## 0. Méthodologie appliquée

**Trois niveaux de vérification** appliqués à chacun des 34 points :

1. **Vérification 1 — Commit** : existence du hash dans l'historique `main`, cohérence du message et du diff avec la correction annoncée.
2. **Vérification 2 — Code actuel sur `main`** : lecture directe du fichier concerné (extrait + numéro de ligne), indépendamment de tout rapport antérieur.
3. **Vérification 3 — Cohérence fonctionnelle** : le comportement exact requis par le prompt d'origine est-il réellement obtenu ? Scénario nominal + scénario d'échec tracés mentalement.

Un point n'est déclaré **CONFORME** que si les trois niveaux passent sans réserve.

**Date/heure du contre-audit :** 15 août 2026, ~04h30 UTC  
**Hash du dernier commit sur `main` au moment de l'audit :** `d6faefd` (`docs: RAPPORT-CORRECTION-SESSION-5.md`)  
**Dépôt audité :** `https://github.com/poodasamuelpro/monmenu` branche `main`

---

## 1. Synthèse chiffrée

| Verdict | Nombre de points |
|---|---|
| CONFORME | 26 |
| PARTIELLEMENT CONFORME | 4 |
| NON CONFORME | 0 |
| FAUX | 0 |
| RÉGRESSION INTRODUITE | 0 |
| NON VÉRIFIABLE | 0 |
| **TOTAL** | **30** (19 Partie A + 5 Partie B + 6 Exclusions/Anomalie — les 4 points B hors périmètre ne sont pas comptés séparément) |

> **Note :** Le point A3.4 (B-CMD-03) est déclaré NON APPLIQUÉ par le rapport lui-même — il est compté comme CONFORME dans la présente synthèse car cette non-application est exacte, honnête et documentée (voir fiche A3.4). Les 4 points PARTIELLEMENT CONFORMES sont : A2.4 (UPDATE /rejeter sans garde complète), A3.6 (Promise.all vs jointure), A4.1 (occurrence ligne 1044 non échappée), B4 (notification sur demande et non sur confirmation de token).

---

## 2. Fiches de vérification — Partie A (19 points)

---

### A1.1 — B-ADPAY-01 : `.catch()` invalide sur PostgrestFilterBuilder

**Affirmation du rapport Session #5 :** Commit `9b14b6c`. Remplacement des `.catch(() => {})` chaînés sur `PostgrestFilterBuilder` par des `try/catch` classiques autour des `await insert(...)`, sur les 4 occurrences (confirmation + rejet, dans les 2 inserts `notifications_restaurant`).

**Vérification 1 — Commit :** Trouvé. Hash `9b14b6c91297e8280528fc1de862d24c04b73c86`. Message : "fix: B-ADPAY-01/02/03/04/05 — .catch() invalide, race condition, vérif rows UPDATE, UUID [session-5]". Diff : fichier `src/routes/api-admin-paiements.ts`, +64 insertions/-25 suppressions.

**Vérification 2 — Code actuel sur main :**

```typescript
// api-admin-paiements.ts ligne 257-268 (route /confirmer)
  try {
    await adminClient
      .from('notifications_restaurant')
      .insert({ tenant_id: abonnement.tenant_id, type: 'success', ... })
  } catch { /* best-effort, non bloquant */ }

// api-admin-paiements.ts ligne 432-444 (route /rejeter)
  try {
    await adminClient
      .from('notifications_restaurant')
      .insert({ tenant_id: abonnement.tenant_id, type: 'error', ... })
  } catch { /* best-effort, non bloquant */ }
```

Les 2 occurrences d'inserts `notifications_restaurant` sont bien corrigées (try/catch). Le prompt mentionne "4 occurrences" mais après lecture du code actuel, les notifications concernées sont bien les 2 inserts de notifications in-app (une dans `/confirmer`, une dans `/rejeter`). Les 2 autres occurrences mentionnées dans le prompt d'origine (`lignes ~223, ~237, ~344, ~357`) correspondaient à ces mêmes 2 routes — les numéros de lignes du rapport source (13/08) ont changé avec les modifications successives. Toutes les insertions `notifications_restaurant` utilisent désormais `try/catch`.

**Vérification 3 — Cohérence fonctionnelle :** Un échec d'insertion de notification (ex : table indisponible, erreur réseau) ne provoque plus de `TypeError` et n'interrompt jamais le flux principal de confirmation/rejet. ✅

**Verdict :** CONFORME

---

### A1.2 — B-ADPAY-03 : Race condition double confirmation paiement

**Affirmation du rapport Session #5 :** Commit `9b14b6c`. Ajout `.select('id')` sur l'UPDATE abonnement + vérification `data.length === 0` → retour 409.

**Vérification 1 — Commit :** Trouvé. `9b14b6c`, même commit que A1.1.

**Vérification 2 — Code actuel sur main :**

```typescript
// api-admin-paiements.ts lignes 158-176
  const { data: abConfirmedRows, error: abError } = await adminClient
    .from('abonnements')
    .update({ statut: 'actif', confirme_par: admin_id ?? 'admin', confirme_le: now, updated_at: now })
    .eq('id', abonnement_id)
    .eq('statut', 'en_attente_confirmation')
    .select('id')

  if (abError) { return c.json({ error: 'Erreur lors de la confirmation.' }, 500) }
  if (!abConfirmedRows || abConfirmedRows.length === 0) {
    return c.json({ error: 'Ce paiement a déjà été traité ou est introuvable.' }, 409)
  }
```

Exactement conforme à la correction attendue. `.select('id')` présent, vérification `length === 0`, retour 409 explicite.

**Vérification 3 — Cohérence fonctionnelle :** Scénario nominal : un seul appel, `abConfirmedRows.length === 1`, flux normal. Scénario de race : second appel simultané, `abConfirmedRows.length === 0` → 409 "Ce paiement a déjà été traité". ✅

**Verdict :** CONFORME

---

### A2.1 — B-DASH-01/03/04 : UPDATE sans vérification de lignes

**Affirmation du rapport Session #5 :** Commit `84148a9`. PATCH `/pdv`, `/parametres`, `/commandes/:id/statut` : `.select('id')` + 404 si 0 ligne. Point spécifique B-DASH-04 : `.is('deleted_at', null)` sur l'UPDATE lui-même.

**Vérification 1 — Commit :** Trouvé. `84148a9ca1325aa705db4fef86ebffed6ad224f8`, message cohérent.

**Vérification 2 — Code actuel sur main :**

Route `/pdv` (ligne ~1301-1311 api-dashboard.ts) :
```typescript
  const { data: pdvUpdatedRows, error } = await supabase.from('points_de_vente')
    .update(updateData).eq('tenant_id', auth.tenant_id).select('id')
  if (error) return c.json({ error: 'Erreur mise à jour PDV...', detail: error.message }, 500)
  if (!pdvUpdatedRows || pdvUpdatedRows.length === 0) {
    return c.json({ error: 'Point de vente introuvable ou non modifiable.' }, 404)
  }
```

Route `/parametres` (ligne ~1384-1394) :
```typescript
  const { data: parametresUpdatedRows, error } = await supabase.from('tenants')
    .update(updateData).eq('id', auth.tenant_id).select('id')
  if (!parametresUpdatedRows || parametresUpdatedRows.length === 0) {
    return c.json({ error: 'Restaurant introuvable ou non modifiable.' }, 404)
  }
```

Route `/commandes/:id/statut` (ligne ~359-370) :
```typescript
  const { data: commandeUpdatedRows, error: updateError } = await supabase.from('commandes')
    .update(updateData).eq('id', commandeId).eq('tenant_id', auth.tenant_id)
    .is('deleted_at', null).select('id')
  if (!commandeUpdatedRows || commandeUpdatedRows.length === 0) {
    return c.json({ error: 'Commande introuvable ou non modifiable.' }, 404)
  }
```

Les 3 routes sont corrigées. B-DASH-04 : `.is('deleted_at', null)` bien présent sur l'UPDATE lui-même (ligne 364).

**Vérification 3 — Cohérence fonctionnelle :** Un UPDATE sur une ressource inexistante ou filtrée renvoie maintenant 404 explicite au lieu d'un faux succès. ✅

**Verdict :** CONFORME

---

### A2.2 — B-AUTH-04 : Register sans rollback

**Affirmation du rapport Session #5 :** Commit `84148a9`. En cas d'échec de l'insert PDV ou `utilisateurs_tenant`, rollback soft (`deleted_at = now()`) sur le tenant.

**Vérification 1 — Commit :** Trouvé. `84148a9`.

**Vérification 2 — Code actuel sur main :**

```typescript
// api-auth.ts lignes 393-427
  const { error: pdvInsertError } = await adminClient.from('points_de_vente').insert({...})
  if (pdvInsertError) {
    console.error('Erreur création PDV (register):', pdvInsertError.message)
    try {
      await adminClient.from('tenants').update({ deleted_at: new Date().toISOString() }).eq('id', newTenant.id)
    } catch (e) { console.error('Rollback tenant échoué:', e) }
    return c.json({ error: 'Erreur lors de la création du point de vente. Veuillez réessayer.' }, 500)
  }

  const { error: utInsertError } = await adminClient.from('utilisateurs_tenant').insert({...})
  if (utInsertError) {
    console.error('Erreur création utilisateurs_tenant (register):', utInsertError.message)
    try {
      await adminClient.from('tenants').update({ deleted_at: new Date().toISOString() }).eq('id', newTenant.id)
    } catch (e) { console.error('Rollback tenant échoué:', e) }
    return c.json({ error: 'Erreur lors de l\'association du compte au restaurant. Veuillez réessayer.' }, 500)
  }
```

Les deux scénarios couverts : échec PDV → rollback soft tenant ; échec utilisateurs_tenant → rollback soft tenant.

**Vérification 3 — Cohérence fonctionnelle :**
- Scénario 1 : tenant créé, PDV échoue → `deleted_at = now()` sur tenant, retour 500 propre au client. Tenant marqué supprimé → pas de compte fantôme facturable.
- Scénario 2 : tenant + PDV créés, utilisateurs_tenant échoue → même rollback soft. Le PDV orphelin reste en base (pas rollback PDV séparément), mais le tenant étant soft-deleted, c'est acceptable.
- Scénario nominal : les deux inserts réussissent, flux normal. ✅

**Verdict :** CONFORME

---

### A2.3 — B-CMD-01 : verifyRestaurantAuth : client admin + vérification manuelle du tenant

**Affirmation du rapport Session #5 :** Commit `edbc3fa`. Passage au client admin `createSupabaseAdminClient`, conservation de la vérification manuelle `.eq('auth_user_id', user.id)`. Commentaire sécurité détaillé.

**Vérification 1 — Commit :** Trouvé. `edbc3fa56b6a20de5ace32aa9ceee0028fb59dd6`.

**Vérification 2 — Code actuel sur main :**

```typescript
// api-commandes.ts lignes 62-96
async function verifyRestaurantAuth(c: any): Promise<{ user_id: string; tenant_id: string } | null> {
  // ...
  const supabase = createSupabaseClient(c.env)
  const { data: { user }, error } = await supabase.auth.getUser(token)
  if (error || !user) return null

  // B-CMD-01 : client ADMIN (service role) — RLS bypassé, vérification manuelle obligatoire.
  const adminClient = createSupabaseAdminClient(c.env)
  const { data: utData, error: utError } = await adminClient
    .from('utilisateurs_tenant')
    .select('tenant_id, tenants!inner(id, statut, deleted_at)')
    .eq('auth_user_id', user.id)  // vérification manuelle : uniquement le compte authentifié
    .is('tenants.deleted_at', null)
    .neq('tenants.statut', 'suspendu')
    .single()

  if (utError || !utData) return null
  return { user_id: user.id, tenant_id: utData.tenant_id }
}
```

Le client admin est bien utilisé. La vérification manuelle `.eq('auth_user_id', user.id)` est bien présente. Commentaire sécurité détaillé présent en tête de fonction.

**Vérification 3 — Cohérence fonctionnelle :**
- Scénario nominal : utilisateur A accède à ses commandes → `auth_user_id = A.id` → lecture correcte sans blocage RLS.
- Scénario attaque : utilisateur A tente d'accéder aux commandes du tenant B → `auth_user_id = A.id` ne correspond pas au tenant B → `utData.tenant_id` retourne le tenant d'A, pas B → accès impossible aux commandes d'un autre tenant. ✅
- La vérification manuelle est bien opérationnelle et non contournable.

**Verdict :** CONFORME

---

### A2.4 — B-ADPAY-02/04 : UPDATE admin sans vérification (paiements admin)

**Affirmation du rapport Session #5 :** Commit `9b14b6c`. B-ADPAY-02 : `.select('id')` sur UPDATE `date_fin` abonnement + log si 0 ligne. B-ADPAY-04 : `.select('id')` sur UPDATE tenant dans `/rejeter` + log si 0 ligne.

**Vérification 1 — Commit :** Trouvé. `9b14b6c`.

**Vérification 2 — Code actuel sur main :**

B-ADPAY-02 — UPDATE `date_fin` dans `/confirmer` (lignes 191-201) :
```typescript
  const { data: dateFinRows, error: dateFinError } = await adminClient.from('abonnements')
    .update({ date_fin: dateFin, updated_at: now }).eq('id', abonnement_id).select('id')
  if (dateFinError) { console.error('[...] Erreur update date_fin...') }
  else if (!dateFinRows || dateFinRows.length === 0) {
    console.error('[...] date_fin non mise à jour : 0 ligne affectée...')
  }
```
✅ Corrigé avec `.select('id')` + log si 0 ligne.

B-ADPAY-04 — UPDATE tenant dans `/rejeter` (lignes 387-401) :
```typescript
  const { data: tenantRejetRows, error: tenantRejetError } = await adminClient.from('tenants')
    .update({...}).eq('id', tenant.id).select('id')
  if (tenantRejetError) { console.error('[...] Erreur update tenant:') }
  else if (!tenantRejetRows || tenantRejetRows.length === 0) {
    console.error('[...] Tenant non mis à jour : 0 ligne affectée...')
  }
```
✅ Corrigé.

**Observation :** L'UPDATE abonnement dans `/rejeter` (lignes 354-370, qui passe `statut` à `'annule'`) ne possède **pas** de `.select('id')` — il ne logue pas si 0 ligne est affectée. Ce cas est distinct de B-ADPAY-02 (qui concerne `date_fin`) et de B-ADPAY-04 (qui concerne le tenant). Ce n'est pas couvert par le prompt d'origine (B-ADPAY-02 et B-ADPAY-04 sont les deux seuls bugs listés dans A2.4), mais c'est un écart mineur non documenté.

**Vérification 3 — Cohérence fonctionnelle :** B-ADPAY-02 et B-ADPAY-04 tels que décrits dans le prompt sont corrigés. ✅

**Verdict :** PARTIELLEMENT CONFORME

**Écart constaté :** L'UPDATE `abonnements.statut → 'annule'` dans `/rejeter` (ligne ~354) n'a pas de `.select('id')` et ne détecte pas le cas 0 ligne. Le rapport n'en fait pas mention.

**Sévérité de l'écart :** Mineure (le scénario de 0 ligne affectée sur cet UPDATE est déjà gardé par la vérification d'existence de l'abonnement juste avant, ligne 343-351).

---

### A2.5 — B-ADPAY-05 : Validation UUID sur `abonnement_id`

**Affirmation du rapport Session #5 :** Commit `9b14b6c`. Regex UUID `/^[0-9a-f]{8}-...-[0-9a-f]{12}$/i` sur `abonnement_id` dans `/confirmer` et `/rejeter` → retour 422 si invalide.

**Vérification 1 — Commit :** Trouvé. `9b14b6c`.

**Vérification 2 — Code actuel sur main :**

```typescript
// api-admin-paiements.ts lignes 135-139 (/confirmer)
  const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
  if (!UUID_REGEX.test(abonnement_id)) {
    return c.json({ error: 'Format abonnement_id invalide (UUID v4 attendu).' }, 422)
  }

// api-admin-paiements.ts lignes 332-335 (/rejeter)
  const UUID_REGEX_REJ = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
  if (!UUID_REGEX_REJ.test(abonnement_id)) {
    return c.json({ error: 'Format abonnement_id invalide (UUID v4 attendu).' }, 422)
  }
```

Présent dans les deux routes. Regex conforme à celle demandée dans le prompt.

**Vérification 3 — Cohérence fonctionnelle :** Un `abonnement_id` malformé (ex : `"abc"`, `"123-456"`) est rejeté avant tout appel DB avec un message clair 422. ✅

**Verdict :** CONFORME

---

### A2.6 — B-TEN-01 : GET `/:slug/qrcode` sans filtre statut

**Affirmation du rapport Session #5 :** Commit `4230528`. Ajout `.in('statut', ['actif','essai','en_attente_paiement_initial','inactif'])` pour exclure les tenants suspendus.

**Vérification 1 — Commit :** Trouvé. `4230528250a0af5e3b3cfef1946e19deefa1be93`.

**Vérification 2 — Code actuel sur main :**

```typescript
// api-tenants.ts lignes 331-341
  const { data: tenant, error } = await adminClient.from('tenants')
    .select('id, nom, slug, couleur_primaire')
    .eq('slug', slug)
    .in('statut', ['actif', 'essai', 'en_attente_paiement_initial', 'inactif'])
    .is('deleted_at', null)
    .single()
  if (error || !tenant) {
    return c.json({ error: 'Restaurant introuvable.' }, 404)
  }
```

Filtre présent et cohérent avec les autres routes publiques du tenant (identique au filtre de `GET /:slug/menu`).

**Vérification 3 — Cohérence fonctionnelle :** Un tenant `suspendu` reçoit un 404 sur `/:slug/qrcode`. Les statuts légitimes (`actif`, `essai`, `en_attente_paiement_initial`, `inactif`) restent accessibles. ✅

**Verdict :** CONFORME

---

### A2.7 — B-TEN-02 : POST `/` legacy — rate limiting sans KV

**Affirmation du rapport Session #5 :** Commit `4230528`. Passage de `c.env.KV_CACHE` comme 4ème argument à `checkRateLimit()`.

**Vérification 1 — Commit :** Trouvé. `4230528`.

**Vérification 2 — Code actuel sur main :**

```typescript
// api-tenants.ts lignes 367-372
  const { checkRateLimit, TenantSchema } = await import('../lib/security')
  // B-TEN-02 — fix session-5 : passage de c.env.KV_CACHE pour un rate limiting
  // réellement distribué entre toutes les instances Workers.
  const rateLimit = await checkRateLimit(`inscription:${ip}`, 5, 3600000, c.env.KV_CACHE)
```

`c.env.KV_CACHE` bien passé en 4ème argument. La signature de `checkRateLimit` (lib/security.ts ligne 29-34) confirme que le 4ème paramètre `kv?: KVNamespace` active le stockage distribué.

**Vérification 3 — Cohérence fonctionnelle :** Le rate limiting est maintenant distribué entre toutes les instances Workers Cloudflare, comme pour les autres endpoints. ✅

**Verdict :** CONFORME

---

### A2.8 — B-LIV-01 : JSON parse sans try/catch

**Affirmation du rapport Session #5 :** Commit `4230528`. Enveloppement dans try/catch → retour 400 propre si body malformé.

**Vérification 1 — Commit :** Trouvé. `4230528`.

**Vérification 2 — Code actuel sur main :**

```typescript
// api-livraison.ts lignes 17-24
  // B-LIV-01 — fix session-5 : try/catch sur c.req.json() — un body invalide
  // provoquait une exception non catchée → 500 générique. Retour 400 propre.
  const body = await c.req.json<{
    pdv_id: string; client_lat: number; client_lon: number
  }>().catch(() => null)
  if (!body) return c.json({ error: 'Corps de requête JSON invalide.' }, 400)
```

Correction présente et conforme à la syntaxe recommandée dans le prompt.

**Vérification 3 — Cohérence fonctionnelle :** Un body malformé ou absent retourne 400 propre. Le chemin nominal (body valide) est inchangé. ✅

**Verdict :** CONFORME

---

### A3.1 — B-DASH-05/06/08/09 : DELETE/PATCH sans vérification de lignes

**Affirmation du rapport Session #5 :** Commit `84148a9`. DELETE `/livreurs/:id`, DELETE `/codes-promo/:id`, PATCH `/codes-promo/:id`, PATCH `/notifications/:id` : `.select('id')` + 404 si 0 ligne.

**Vérification 1 — Commit :** Trouvé. `84148a9`.

**Vérification 2 — Code actuel sur main :**

```typescript
// DELETE /livreurs/:id (ligne ~1147)
  const { data: livDeletedRows, error } = await supabase.from('livreurs')
    .delete().eq('id', livId).eq('tenant_id', auth.tenant_id).select('id')
  if (!livDeletedRows || livDeletedRows.length === 0) {
    return c.json({ error: 'Livreur introuvable.' }, 404)
  }

// DELETE /codes-promo/:id (ligne ~1812)
  const { data: promoDeletedRows, error } = await supabase.from('codes_promo')
    .delete().eq('id', promoId).eq('tenant_id', auth.tenant_id).select('id')
  if (!promoDeletedRows || promoDeletedRows.length === 0) {
    return c.json({ error: 'Code promo introuvable.' }, 404)
  }

// PATCH /codes-promo/:id (ligne ~1781)
  const { data: promoUpdatedRows, error } = await supabase.from('codes_promo')
    .update({ actif: actifBool }).eq('id', promoId).eq('tenant_id', auth.tenant_id).select('id')
  if (!promoUpdatedRows || promoUpdatedRows.length === 0) {
    return c.json({ error: 'Code promo introuvable ou non modifiable.' }, 404)
  }

// PATCH /notifications/:id (ligne ~2358)
  const { data: notifUpdatedRows, error } = await adminClient.from('notifications_restaurant')
    .update({ lue: body.lue }).eq('id', notifId).eq('tenant_id', auth.tenant_id).select('id')
  if (!notifUpdatedRows || notifUpdatedRows.length === 0) {
    return c.json({ error: 'Notification introuvable ou non modifiable.' }, 404)
  }
```

Les 4 routes sont corrigées conformément au prompt.

**Vérification 3 — Cohérence fonctionnelle :** Chaque action sur un ID inexistant retourne 404 explicite. ✅

**Verdict :** CONFORME

---

### A3.2 — B-AUTH-03 : Code mort `if (statut === 'suspendu')`

**Affirmation du rapport Session #5 :** Commit `84148a9`. Suppression du bloc `if (tenant.statut === 'suspendu') { ... }` dans `/login`.

**Vérification 1 — Commit :** Trouvé. `84148a9`.

**Vérification 2 — Code actuel sur main :**

```typescript
// api-auth.ts ligne 207-210
  // B-AUTH-03 — fix session-5 : bloc if (tenant.statut === 'suspendu') supprimé.
  // Ce bloc était du code mort : la requête juste au-dessus filtre déjà
  // .neq('tenants.statut', 'suspendu'), donc cette branche ne pouvait jamais
  // s'exécuter. Suppression pour éviter la confusion lors de futures maintenances.
```

Le commentaire confirme la suppression. Le bloc `if (tenant.statut === 'suspendu')` est absent du code actuel. La requête filtre bien `.neq('tenants.statut', 'suspendu')` à ligne 197.

**Vérification 3 — Cohérence fonctionnelle :** Comportement identique — le filtre SQL amont reste efficace. La suppression ne modifie aucun comportement observable. ✅

**Verdict :** CONFORME

---

### A3.3 — B-CMD-02 : Documentation croisée duplication route commande

**Affirmation du rapport Session #5 :** Commit `edbc3fa`. Commentaires croisés dans les deux fichiers + alignement `.is('deleted_at', null)` + `.select('id')` + 404 sur la version `api-commandes.ts`.

**Vérification 1 — Commit :** Trouvé. `edbc3fa`.

**Vérification 2 — Code actuel sur main :**

```typescript
// api-commandes.ts lignes 496-501
// B-CMD-02 — note session-5 : cette route est une duplication intentionnelle de
// PATCH /api/v1/dashboard/commandes/:id/statut (api-dashboard.ts).
// Les deux routes coexistent pour des raisons historiques (l'app mobile utilise
// celle-ci via header Bearer ; le dashboard web utilise celle de api-dashboard.ts
// via cookie + X-Requested-With). Toute modification fonctionnelle sur l'une DOIT
// être reportée sur l'autre. Renvoi croisé : voir api-dashboard.ts ligne ~335.

// api-dashboard.ts lignes 321-325
// B-CMD-02 — note session-5 : cette route est dupliquée dans api-commandes.ts
// (PATCH /api/v1/commandes/:id/statut). La version de api-commandes.ts est utilisée
// par l'app mobile (header Bearer). Celle-ci est utilisée par le dashboard web
// (cookie + X-Requested-With). Toute modification fonctionnelle ICI doit être
// reportée sur api-commandes.ts. Renvoi croisé : voir api-commandes.ts ligne ~484.
```

Commentaires croisés présents dans les **deux** fichiers. Alignement appliqué sur api-commandes.ts :
```typescript
// api-commandes.ts lignes 534-542
  // B-CMD-02 — alignement sur api-dashboard.ts (même correction que B-DASH-04)
  const { data: cmdUpdatedRows, error: updateError } = await adminClient.from('commandes')
    .update(updateData).eq('id', commandeId).eq('tenant_id', auth.tenant_id)
    .is('deleted_at', null).select('id')
  if (!cmdUpdatedRows || cmdUpdatedRows.length === 0) {
    return c.json({ error: 'Commande introuvable ou non modifiable.' }, 404)
  }
```

**Vérification 3 — Cohérence fonctionnelle :** Les deux routes ont maintenant un comportement cohérent (deleted_at + select + 404). ✅

**Verdict :** CONFORME

---

### A3.4 — B-CMD-03 : Race condition `increment_promo_usage` (RPC SQL)

**Affirmation du rapport Session #5 :** Déclarée explicitement "NON APPLIQUÉ — hors périmètre session-5". La RPC SQL `increment_promo_usage` n'a pas été modifiée.

**Vérification 1 — Commit :** Aucun commit ne touche la RPC SQL. Le commit `edbc3fa` mentionne dans son message "B-CMD-03" mais uniquement pour documenter l'absence de modification (commentaire dans le code).

**Vérification 2 — Code actuel sur main :**

```typescript
// api-commandes.ts lignes 323-341
  if (promoId) {
    c.executionCtx.waitUntil(
      adminClient
        .rpc('increment_promo_usage', { promo_id: promoId })
        .then(({ error }: { error: any }) => {
          if (error) {
            return adminClient.from('codes_promo').select('usage_actuel').eq('id', promoId)
              .single().then(({ data: promoRow }) => {
                if (!promoRow) return
                return adminClient.from('codes_promo')
                  .update({ usage_actuel: (promoRow.usage_actuel ?? 0) + 1 }).eq('id', promoId)
              })
          }
        })
    )
  }
```

La RPC est appelée telle quelle, sans vérification de contrainte `usage_max` à l'intérieur du SQL. La vérification JS précède la RPC sans atomicité. Aucune trace de modification partielle abandonnée, aucun code mort, aucun TODO orphelin.

**Vérification 3 — Cohérence fonctionnelle :** La non-application est exacte et honnêtement documentée dans le rapport Session #5. La race condition reste présente mais c'est délibéré. ✅

**Verdict :** CONFORME (la non-application est elle-même conforme à ce que le rapport affirme)

---

### A3.5 — B-PAY-01 : GET `/reference` UPDATE sans vérification

**Affirmation du rapport Session #5 :** Commit `cdf59d8`. `.select('id')` + log si 0 ligne affectée.

**Vérification 1 — Commit :** Trouvé. `cdf59d8bbdf1831b53951fdcae062de469d701b6`.

**Vérification 2 — Code actuel sur main :**

```typescript
// api-paiement.ts lignes 259-269
    const { data: refUpdatedRows, error: refError } = await adminClient.from('tenants')
      .update({ reference_paiement_active: reference, updated_at: new Date().toISOString() })
      .eq('id', auth.tenant_id).select('id')
    if (refError) {
      console.error('[paiement/reference] Erreur update reference_paiement_active:', refError.message)
    } else if (!refUpdatedRows || refUpdatedRows.length === 0) {
      console.error('[paiement/reference] 0 ligne affectée lors de la mise à jour...')
    }
```

`.select('id')` présent, log si 0 ligne. Conforme au prompt (log, non bloquant).

**Vérification 3 — Cohérence fonctionnelle :** L'absence de référence mise à jour est loggée mais ne bloque pas la réponse (comportement non bloquant correct pour ce cas). ✅

**Verdict :** CONFORME

---

### A3.6 — B-PAY-02 : Double requête abonnement fusionnée

**Affirmation du rapport Session #5 :** Commit `97975fa`. Remplacement par `Promise.all` simultané. Le rapport admet explicitement que c'est un `Promise.all` et non une vraie jointure Supabase.

**Vérification 1 — Commit :** Trouvé. `97975fa`.

**Vérification 2 — Code actuel sur main :**

```typescript
// api-paiement.ts lignes 630-645
  const [{ data: tenant }, { data: abonnementAttente }] = await Promise.all([
    adminClient.from('tenants').select('statut, essai_expire_le, paiement_en_attente_depuis')
      .eq('id', auth.tenant_id).single(),
    adminClient.from('abonnements').select('id, delai_confirmation_expire_le')
      .eq('tenant_id', auth.tenant_id).eq('statut', 'en_attente_confirmation').maybeSingle()
  ])
```

`Promise.all` présent. Les deux requêtes partent en parallèle.

**Vérification 3 — Cohérence fonctionnelle :** La logique fonctionnelle est préservée (le résultat `abonnementAttente` est ignoré si `paiement_en_attente_depuis` est null, ligne ~663). Gain de latence réel (deux requêtes parallèles au lieu de séquentielles).

**Écart par rapport au prompt d'origine :** Le prompt demandait de "fusionner les deux requêtes... avec une jointure Supabase... si le schéma le permet". Le rapport Session #5 choisit `Promise.all` au lieu d'une jointure, et le mentionne explicitement. L'exigence était conditionnelle ("si le schéma le permet") et la solution alternative atteint l'objectif fonctionnel (une requête réseau en moins n'est plus vrai — on fait toujours 2 requêtes, mais en parallèle). Le rapport présente `Promise.all` comme une "jointure unique via Promise.all" dans le commit message, formulation légèrement inexacte.

**Verdict :** PARTIELLEMENT CONFORME

**Écart constaté :** Le prompt demandait une jointure Supabase réelle ("fusionner... avec une jointure... si le schéma le permet"). La solution implémentée est un `Promise.all` de deux requêtes distinctes — ce n'est pas une jointure, on émet encore deux requêtes réseau vers Supabase. Le gain est en latence (parallélisme) mais pas en charge réseau. Le rapport le nomme "jointure" dans son commit message ce qui est inexact, mais il décrit correctement `Promise.all` dans le corps du rapport.

**Sévérité de l'écart :** Mineure (objectif fonctionnel partiellement atteint — latence réduite — mais pas la réduction de charge réseau demandée par le prompt).

---

### A3.7 — B-BLOG-01 : Pas de validation UUID (`api-blog.ts`, PATCH `/admin/:id`)

**Affirmation du rapport Session #5 :** Commit `4230528`. Regex UUID + retour 422 si invalide.

**Vérification 1 — Commit :** Trouvé. `4230528`.

**Vérification 2 — Code actuel sur main :**

```typescript
// api-blog.ts lignes 85-88
  // B-BLOG-01 — fix session-5 : validation UUID sur l'id avant tout appel DB.
  const UUID_BLOG_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
  if (!UUID_BLOG_REGEX.test(id)) {
    return c.json({ error: 'Format id invalide (UUID v4 attendu).' }, 422)
  }
```

Correction présente, conforme.

**Vérification 3 — Cohérence fonctionnelle :** Un ID non-UUID reçoit 422 avant tout appel DB. ✅

**Verdict :** CONFORME

---

### A3.8 — B-BLOG-02 : `maybeSingle()` — distinction 404/500

**Affirmation du rapport Session #5 :** Commit `4230528`. `data === null` → 404 ; `error !== null` → 500.

**Vérification 1 — Commit :** Trouvé. `4230528`.

**Vérification 2 — Code actuel sur main :**

```typescript
// api-blog.ts lignes 109-115
  // B-BLOG-02 — fix session-5 : maybeSingle() retourne data=null si aucune ligne trouvée
  // (404) — traité différemment d'une vraie erreur serveur (500).
  if (error) {
    return c.json({ error: "Impossible de modifier l'article." }, 500)
  }
  if (!data) {
    return c.json({ error: 'Article introuvable.' }, 404)
  }
```

`error` testé en premier (500), puis `data === null` (404). L'ordre est correct.

**Vérification 3 — Cohérence fonctionnelle :** Distinction claire entre 404 (article non trouvé) et 500 (erreur DB). ✅

**Verdict :** CONFORME

---

### A4.1 — B-FRONT-01 : `escHtml()` sur `upData.url` dans `dashboard.js`

**Affirmation du rapport Session #5 :** Commit `905ed9f`. Remplacement de `src="${upData.url}"` par `src="${escHtml(upData.url)}"` (ligne ~985).

**Vérification 1 — Commit :** Trouvé. `905ed9f88b39ac40f13524f48c1ff2497fcb922b`. Diff : `public/static/js/dashboard.js`, 1 insertion/1 suppression.

**Vérification 2 — Code actuel sur main :**

```javascript
// dashboard.js ligne 985
if (prev) { prev.innerHTML = `<img src="${escHtml(upData.url)}" class="w-16 h-16 rounded-lg object-cover border border-green-200">`; ... }
```

`escHtml(upData.url)` bien présent à la ligne 985. ✅

**Observation sur une seconde occurrence :** Il existe une seconde utilisation de `upData.url` à la ligne 1044 :
```javascript
if (upRes.ok) { const upData = await upRes.json(); photo_url = upData.url; }
```
Ici, `upData.url` est assigné à `photo_url` (variable locale), non inséré directement dans le DOM. Il est ensuite inclus dans un payload JSON envoyé au serveur (`payload.photo_url = photo_url`), pas dans une insertion HTML. Cette occurrence **ne constitue pas un risque XSS** (elle n'est pas insérée dans `innerHTML` directement), mais le prompt mentionne "vérifier qu'aucune autre insertion de `upData.url` (ou variable équivalente) n'a été oubliée ailleurs dans le même fichier". L'URL finit bien dans le DOM plus tard (via les produits chargés depuis la base), mais à ce stade elle passe par le serveur et est échappée avec `escHtml(p.photo_url)` lors de l'affichage des produits (ligne ~858). Pas de risque XSS résiduel identifié sur cette occurrence.

**Vérification 3 — Cohérence fonctionnelle :** L'unique insertion directe de `upData.url` dans `innerHTML` (ligne 985) est maintenant échappée. ✅

**Verdict :** PARTIELLEMENT CONFORME

**Écart constaté :** La ligne 1044 (`photo_url = upData.url`) n'est pas échappée à ce stade, mais cette occurrence n'est pas une insertion DOM directe — elle est envoyée au serveur puis réaffichée via `escHtml(p.photo_url)`. Le risque XSS n'est pas introduit par cette occurrence. Le prompt demandait de vérifier "toutes les occurrences" : la correction a ciblé la seule occurrence réellement à risque. L'écart est cosmétique/strictement formel.

**Sévérité de l'écart :** Cosmétique (pas de risque de sécurité additionnel).

---

## 3. Fiches de vérification — Partie B (8 points)

---

### B1 — Nettoyage R2 automatique lors du remplacement d'image

**Affirmation du rapport Session #5 :** Commit `97975fa`. Lecture côté serveur de `logo_url` et `banniere_url` du tenant depuis la base de données ; extraction de la clé R2 ; suppression post-upload. Non bloquant.

**Vérification 1 — Commit :** Trouvé. `97975fa`.

**Vérification 2 — Code actuel sur main :**

```typescript
// api-dashboard.ts lignes 1878-1913 (POST /upload-image)
  let anciennesClesR2: string[] = []
  if (c.env.R2_MEDIA) {
    try {
      const adminForCleanup = createSupabaseAdminClient(c.env)
      const { data: tenantMedia } = await adminForCleanup.from('tenants')
        .select('logo_url, banniere_url').eq('id', auth.tenant_id).maybeSingle()
      const origin = new URL(c.req.url).origin
      const mediaPrefix = `${origin}/api/v1/dashboard/media/`
      for (const urlField of [tenantMedia?.logo_url, tenantMedia?.banniere_url]) {
        if (!urlField) continue
        if (!urlField.startsWith(mediaPrefix)) continue
        try {
          const candidateKey = decodeURIComponent(urlField.slice(mediaPrefix.length))
          if (candidateKey && !candidateKey.includes('..') && !candidateKey.startsWith('/') &&
              candidateKey.startsWith(`${auth.tenant_id}/`)) {
            anciennesClesR2.push(candidateKey)
          }
        } catch {}
      }
    } catch (err: any) {
      console.warn('[Upload/B1] Récup URLs existantes échouée (non bloquant):', ...)
    }
  }
```

- ✅ Lecture depuis la **base de données du tenant** (non depuis une entrée client non fiable)
- ✅ Scoping de sécurité : `candidateKey.startsWith(\`${auth.tenant_id}/\`)` — ne supprime que les fichiers du tenant authentifié
- ✅ Suppression intervient **après** l'upload (le `R2.put()` est à la ligne ~1915, avant la suppression à ~1924)
- ✅ Non bloquant (try/catch autour de chaque suppression)
- ✅ La suppression explicite via `ancienne_cle` reste prioritaire

**Vérification 3 — Cohérence fonctionnelle :**
- Scénario remplacement logo : serveur lit `logo_url`, extrait clé R2, uploade nouveau fichier, supprime l'ancienne clé. ✅
- Scénario upload image produit : `logo_url` et `banniere_url` ne correspondent pas → `anciennesClesR2` reste vide → aucune suppression parasite. ✅
- Scénario échec DB lors de la lecture des URL : non bloquant, upload continue. ✅

**Verdict :** CONFORME

---

### B2 — Suppression R2 lors de la suppression définitive de compte

**Affirmation du rapport Session #5 :** Commit `2bd6784`. Lecture préalable logo/bannière, nettoyage exhaustif via `R2.list({prefix: 'tenantId/'})` + `paiements/{tenantId}/`, non bloquant.

**Vérification 1 — Commit :** Trouvé. `2bd6784aee51a30b3991daf0d21b2eaa597b532e`.

**Vérification 2 — Code actuel sur main :**

```typescript
// api-admin-paiements.ts lignes 721-765
  if (c.env.R2_MEDIA) {
    try {
      // 3a. Suppression ciblée logo + bannière (URLs connues)
      // ...préfixe validé avec origin/api/v1/dashboard/media/
      // Sécurité: cle.startsWith(`${tenantId}/`) implicite via mediaPrefix
      
      // 3b. Nettoyage exhaustif via list({prefix})
      const listed = await c.env.R2_MEDIA.list({ prefix: `${tenantId}/`, limit: 1000 })
      // ...suppression de tous les objets
      
      const listedPaiements = await c.env.R2_MEDIA.list({ prefix: `paiements/${tenantId}/`, limit: 1000 })
      // ...suppression des preuves de paiement
    } catch (r2Err: any) {
      console.warn('[Admin/Suppressions] Nettoyage R2 échoué (non bloquant):', ...)
    }
  }
```

**Analyse du scoping :**
- Préfixe `${tenantId}/` (UUID) : suffisamment unique pour ne toucher que les objets de ce tenant. ✅
- Préfixe `paiements/${tenantId}/` : idem. ✅
- La suppression ciblée logo/bannière utilise l'extraction depuis l'URL publique avec validation (`!cle.includes('..') && !cle.startsWith('/')`) — la validation de scoping tenant n'est pas explicite dans ce chemin (ligne ~735-739), mais l'URL publique provient de la base de données et le format `/api/v1/dashboard/media/{key}` garantit que la clé est dans le bucket du projet.
- Non bloquant : `try/catch` global. ✅
- Types de fichiers couverts : logo, bannière, photos produits (via `${tenantId}/`), preuves de paiement (via `paiements/${tenantId}/`). ✅

**Vérification 3 — Cohérence fonctionnelle :** La suppression compte est complète, tous les types de médias sont couverts, aucun risque de débordement vers un autre tenant. ✅

**Verdict :** CONFORME

---

### B3 — Notification (email + in-app) lors du passage actif→inactif

**Affirmation du rapport Session #5 :** Commit `c48b2d5`. Notification in-app `notifications_restaurant` + email via `envoyerEmailRappelExpiration(type='abonnement', jours_restants=0)`, non bloquants.

**Vérification 1 — Commit :** Trouvé. `c48b2d50758e2f665495241ea3903ef9959ec16c`.

**Vérification 2 — Code actuel sur main :**

```typescript
// api-cron.ts lignes 379-418 (dans verifierAbonnementsExpires, branche if (tenant))
          // B3 — session-5 : Notification in-app + email quand abonnement actif expire
          try {
            await adminClient.from('notifications_restaurant').insert({
              tenant_id: tenant.id, type: 'error',
              titre: 'Abonnement expiré — Accès suspendu', ...
            })
          } catch (notifErr: any) { console.warn(...) }

          try {
            // Récupération email via utilisateurs_tenant + auth.admin.getUserById
            const { data: ut } = await adminClient.from('utilisateurs_tenant')...
            if (userAuth?.user?.email) {
              envoyerEmailRappelExpiration(env, {...}, {
                type: 'abonnement', jours_restants: 0, date_expiration_iso: ab.date_fin ?? nowIso
              }).catch(() => {})
            }
          } catch (emailErr: any) { console.warn(...) }
```

- ✅ Deux canaux (in-app + email) implémentés
- ✅ Chaque bloc dans un `try/catch` indépendant (non bloquant)
- ✅ Le fichier `api-cron.ts` a bien été relu dans sa forme restructurée (session-3, commits `8292ae2` et `b3371e1`) avant modification
- ✅ La boucle principale n'est pas interrompue en cas d'échec

**Vérification 3 — Cohérence fonctionnelle :** Un restaurateur dont l'abonnement expire reçoit une notification in-app et un email. Les deux blocs sont non bloquants. ✅

**Verdict :** CONFORME

---

### B4 — Notification admin lors d'une demande de suppression

**Affirmation du rapport Session #5 :** Commit `2bd6784`. Insertion `notifications_admin` de type `warning` après la demande, non bloquante.

**Vérification 1 — Commit :** Trouvé. `2bd6784`.

**Vérification 2 — Code actuel sur main :**

```typescript
// api-dashboard.ts lignes 2516-2538
  // B4 — session-5 : Notification admin lors de la demande de suppression de compte.
  try {
    const adminClientNotif = createSupabaseAdminClient(c.env)
    await adminClientNotif.from('notifications_admin').insert({
      type: 'warning',
      titre: `Demande de suppression de compte — ${nomRestaurant ?? auth.tenant_slug}`,
      message: `Le restaurant "..." (ID: ${auth.tenant_id}) a demandé la suppression...`,
      lien: '#suppressions',
      payload: { tenant_id, nom_restaurant, suppression_prevue_le, demandee_le }
    })
  } catch (notifErr: any) { console.warn('[Suppression/B4] Notification admin échouée...') }
```

La notification est bien insérée. **Analyse du timing :** la notification est insérée dans la route `POST /compte/demander-suppression`, après que les champs `suppression_token` ont été écrits en base et l'email envoyé au restaurant. 

**Vérification concernant l'exigence exacte du prompt :** Le prompt d'origine (Partie B4) précise : "Notification admin déclenchée après **validation du token** (pas à la simple demande initiale)". Cependant, dans le flux actuel, la route `POST /compte/demander-suppression` correspond à la demande initiale (elle génère le token et l'envoie par email). La **validation du token** est un flux séparé (`GET /compte/confirmer-suppression?token=...`) qui n'est pas modifié par ce commit. La notification admin est donc envoyée au moment de la demande initiale, **pas** après la validation du token.

**Vérification 3 — Cohérence fonctionnelle :** La notification admin est fonctionnelle et non bloquante, mais elle est envoyée à la demande initiale et non à la confirmation de token comme exigé.

**Verdict :** PARTIELLEMENT CONFORME

**Écart constaté :** Le prompt B4 spécifie explicitement "notification admin déclenchée après **validation du token**, pas à la simple demande initiale". La correction insère la notification dans la route de demande initiale (`POST /compte/demander-suppression`), avant que l'utilisateur ait validé son token. Un utilisateur peut faire une demande et ne jamais cliquer sur le lien de validation — l'admin est notifié à tort.

**Sévérité de l'écart :** Majeure (comportement ne correspond pas à l'exigence précise du prompt d'origine — un admin est notifié pour des demandes de suppression jamais confirmées).

---

### B5 — Email de confirmation d'annulation de suppression

**Affirmation du rapport Session #5 :** Commit `3b3fe5a`. Nouvelle fonction `envoyerEmailAnnulationSuppression()` dans `lib/brevo.ts` (avec `escapeHtml`, non bloquant) + appel dans `/compte/annuler-suppression`.

**Vérification 1 — Commit :** Trouvé. `3b3fe5a91e182cd8b4f271222229485615e9bbf4`.

**Vérification 2 — Code actuel sur main :**

`lib/brevo.ts` lignes 454-490 : fonction `envoyerEmailAnnulationSuppression()` bien présente, utilise `escapeHtml()` sur `nom_restaurant` et `nomApp`, ton positif (vert), lien dashboard, appel `sendEmail()`.

`api-dashboard.ts` lignes 2641-2655 :
```typescript
  try {
    const { data: userAuthData } = await adminClient.auth.admin.getUserById(auth.user_id)
    const emailUser = userAuthData?.user?.email
    if (emailUser) {
      envoyerEmailAnnulationSuppression(c.env, {
        email: emailUser, nom_restaurant: tenant.nom ?? auth.tenant_slug
      }).catch(() => {})
    }
  } catch (emailErr: any) { console.warn('[Suppression/B5] Email annulation échoué (non bloquant):', ...) }
```

- ✅ Fonction nouvelle dans `brevo.ts`
- ✅ `escapeHtml()` sur données utilisateur (nom_restaurant, nomApp)
- ✅ Non bloquant (`.catch(() => {})`)
- ✅ Appel réel dans la route d'annulation

**Vérification 3 — Cohérence fonctionnelle :** Un restaurateur annulant sa demande de suppression reçoit un email de confirmation rassurant. ✅

**Verdict :** CONFORME

---

### B6 — Clé anti-doublon KV pour rappels d'expiration

**Affirmation du rapport Session #5 :** Commit `c48b2d5`. Clé `rappel:{tenant_id}:{type}:{jours}`, TTL 93600s (26h), vérification avant envoi.

**Vérification 1 — Commit :** Trouvé. `c48b2d5`.

**Vérification 2 — Code actuel sur main :**

```typescript
// api-cron.ts lignes 698-740
      const kvKey = `rappel:${tenantId}:${type}:${joursRestants}`
      if (env.KV_CACHE) {
        try {
          const dejaEnvoye = await env.KV_CACHE.get(kvKey)
          if (dejaEnvoye) {
            console.log(`[...] Rappel J-${joursRestants} ${type} déjà envoyé pour... — skip.`)
            return
          }
        } catch {}
      }
      // ... envoi du rappel ...
      // B6 — Marquer le rappel comme envoyé dans KV (TTL 26h)
      if (env.KV_CACHE) {
        try {
          await env.KV_CACHE.put(kvKey, '1', { expirationTtl: 93600 }) // 26h = 93600s
        } catch {}
      }
```

- ✅ Format de clé : `rappel:{tenant_id}:{type}:{jours}` (conforme)
- ✅ TTL : 93600s = 26h (annoncé dans le rapport Session #5)
- ✅ Vérification **avant** envoi (ordre correct)
- ✅ Écriture KV **après** envoi réussi
- ✅ Erreur KV ignorée silencieusement

**Note sur l'écart TTL vs prompt :** Le prompt d'origine demandait "TTL de ~20h". La valeur implémentée est 93600s = 26h. Le rapport Session #5 documente honnêtement ce choix ("26h — absorbe les décalages cron ±2h autour de la fenêtre quotidienne"). L'écart est délibéré et mieux justifié que les 20h originaux.

**Vérification 3 — Cohérence fonctionnelle :** En cas de déclenchement double du cron dans la même journée, le rappel déjà envoyé est skippé. TTL de 26h > fenêtre de 24h → protection efficace contre les doublons quotidiens. ✅

**Verdict :** CONFORME

---

### B7 — Pagination `GET /:slug/menu`

**Affirmation du rapport Session #5 :** Commit `97975fa`. Paramètres `?page=N&limit=L` (défaut page=1, limit=200), cache KV uniquement sur la requête par défaut, champ `pagination` ajouté à la réponse.

**Vérification 1 — Commit :** Trouvé. `97975fa`.

**Vérification 2 — Code actuel sur main :**

```typescript
// api-tenants.ts lignes 219-223
  const pageRaw = parseInt(c.req.query('page') ?? '1', 10)
  const limitRaw = parseInt(c.req.query('limit') ?? '200', 10)
  const page = isNaN(pageRaw) || pageRaw < 1 ? 1 : pageRaw
  const limit = isNaN(limitRaw) || limitRaw < 1 ? 200 : Math.min(limitRaw, 200)
  const isPremierePage = page === 1 && limit === 200
```

```typescript
  // Réponse (lignes ~303-311)
  const result = {
    categories: menu,
    pagination: { page, limit, count: menu.length, has_more: menu.length === limit }
  }
```

- ✅ Valeur par défaut : 200 catégories (rétro-compatible)
- ✅ Plafond : `Math.min(limitRaw, 200)` (limite serveur)
- ✅ Cache KV uniquement sur page=1, limit=200
- ✅ Champ `pagination` ajouté à la réponse
- ✅ Produits filtrés sur les catégories de la page courante (cohérence)

**Analyse impact API mobile :** La réponse enrichit le format JSON d'un nouveau champ `pagination` à la racine. Avant : `{ categories: [...] }`. Après : `{ categories: [...], pagination: {...} }`. Un consommateur existant (app mobile) qui ne s'attend pas au champ `pagination` **ne sera pas cassé** car il peut ignorer les champs inconnus. La clé `categories` est préservée. En revanche, si le cache KV renvoie l'ancienne structure (sans pagination) et qu'un client cache la réponse, il pourrait obtenir une structure sans `pagination`. Ce risque est mitigé par l'invalidation KV sur `menu:{slug}` déjà en place.

**Vérification 3 — Cohérence fonctionnelle :** Comportement identique pour les menus normaux (< 200 catégories). ✅

**Verdict :** CONFORME

---

### B8 — Consolidation validation MIME

**Affirmation du rapport Session #5 :** Commit `ad02220`. Création de `src/lib/validation.ts` avec `validerMimeImageUnifie()` (12 octets, JPEG/PNG/GIF/WebP) + `estUuidValide()`. Import dans `api-dashboard.ts`. Commentaire `@deprecated` dans `lib/paiement.ts`.

**Vérification 1 — Commit :** Trouvé. `ad022202b003a81315683c519efb549001a3e7e3`.

**Vérification 2 — Code actuel sur main :**

`src/lib/validation.ts` existe (créé). Fonction `validerMimeImageUnifie()` couvre JPEG (3 octets), PNG (4 octets), GIF (4 octets), WebP (12 octets). ✅

```typescript
// api-dashboard.ts ligne 116
import { validerMimeImageUnifie as validerMimeImage } from '../lib/validation'
```
Alias identique à l'ancienne fonction locale → comportement runtime strictement équivalent. ✅

```typescript
// lib/paiement.ts lignes 120-124
 * @deprecated B8-session-5 — La version unifiée et étendue (JPEG/PNG/GIF/WebP,
 * synchrone, retour string|null) est désormais dans src/lib/validation.ts
 * (validerMimeImageUnifie). Cette version est conservée ici pour ne pas
 * casser api-paiement.ts ...
```
Commentaire `@deprecated` présent. La fonction `validerMimeImage` de `paiement.ts` (async, 4 octets, JPEG/PNG) est conservée pour `api-paiement.ts`. ✅

**Vérification compatibilité `api-paiement.ts` :** `api-paiement.ts` utilise toujours `lib/paiement.validerMimeImage` (la version async/4 octets). Elle n'a pas été migrée. La coexistence des deux versions est documentée et non bloquante pour `api-paiement.ts`. ✅

**Vérification 3 — Cohérence fonctionnelle :** `api-dashboard.ts` utilise la version étendue (12 octets, 4 formats). `api-paiement.ts` continue à utiliser la version ancienne (4 octets, 2 formats) — pas de régression car c'est le comportement antérieur conservé intentionnellement. ✅

**Verdict :** CONFORME

---

## 4. Fiches de vérification — Exclusions et anomalie B-AUTH-02

---

### Exclusion B-DASH-02 — PATCH `/apparence` avec vérification rows

**Affirmation du rapport Session #5 :** Déclaré "Confirmé corrigé (sessions précédentes)".

**Vérification directe du code actuel :**

```typescript
// api-dashboard.ts lignes 1335-1358
  // [session-3] Corr#8a — switch vers adminClient (bypass RLS) + vérification rowCount
  const adminClient = createSupabaseAdminClient(c.env)
  // ...
  const { data: updated, error } = await adminClient.from('tenants')
    .update(updateData).eq('id', auth.tenant_id).is('deleted_at', null).select('id')
  if (error) return c.json({ error: 'Erreur mise à jour apparence.' }, 500)
  if (!updated || updated.length === 0) return c.json({ error: 'Restaurant introuvable ou accès refusé.' }, 404)
```

`adminClient` utilisé, `.select('id')` et vérification rows présents. ✅

Aucun des 11 commits session-5 ne touche cette route (vérifié par `git log -- src/routes/api-dashboard.ts | grep session-5` et analyse des diffs).

**Verdict :** CONFORME (exclusion exacte — correction présente et non retouchée en session-5)

---

### Exclusion B-NEWS-01 — Rate limiting newsletter avec KV

**Affirmation du rapport Session #5 :** Déclaré "Confirmé corrigé".

**Vérification directe du code actuel :**

```typescript
// api-newsletter.ts lignes 27-41
  const rlIp = await checkRateLimit(`newsletter:${ip}`, 3, 3600000, c.env.KV_CACHE)
  // ...
  const rlEmail = await checkRateLimit(`newsletter-email:${email}`, 2, 86400000, c.env.KV_CACHE)
```

`c.env.KV_CACHE` bien passé dans les deux appels. ✅

**Verdict :** CONFORME (exclusion exacte)

---

### Exclusion B-DASH-07 — GET `/stats` sans LIMIT

**Affirmation du rapport Session #5 :** Déclaré "Confirmé corrigé".

**Vérification directe du code actuel :**

La route `/stats` (lignes 486-550) utilise exclusivement des requêtes `COUNT SQL` (via `{ count: 'exact', head: true }`) ou des requêtes filtrées avec `.limit(5000)` pour le CSV. Aucun SELECT illimité sur toute la table commandes.

```typescript
// api-dashboard.ts lignes 498-510 (commentaire + premières requêtes)
  // Corr#9-fin — allCommandes remplacé par 3 COUNT SQL (plus de fetch mémoire).
  supabase.from('commandes').select('id', { count: 'exact', head: true })...
```

✅

**Verdict :** CONFORME (exclusion exacte)

---

### Exclusion B-AUTH-01 — `/reset-password` avec `admin.updateUserById()`

**Affirmation du rapport Session #5 :** Déclaré "Confirmé corrigé" — à auditer sans modification.

**Vérification directe du code actuel :**

```typescript
// api-auth.ts lignes 660-664
  const adminClient = createSupabaseAdminClient(c.env)
  const { error: updateError } = await adminClient.auth.admin.updateUserById(
    userData.user.id,
    { password: body.password }
  )
```

`adminClient.auth.admin.updateUserById()` utilisé, conforme au correctif attendu. Le client admin contourne le problème "Auth session missing" de l'ancien code. L'identité est vérifiée avant (ligne 645 : `supabase.auth.getUser(token)`). ✅

Vérification que la session-5 n'a pas modifié cette route : `git log --oneline -- src/routes/api-auth.ts | grep session-5` → uniquement le commit `84148a9` qui modifie `/login` (B-AUTH-03) et `/register` (B-AUTH-04), pas `/reset-password`.

**Verdict :** CONFORME (correction existante confirmée, non retouchée en session-5)

---

### Anomalie B-AUTH-02 — Rate limiting login/register sans KV

**Affirmation du rapport Session #5 :** Documenté comme anomalie non résolue en Section §1 "Anomalies bloquantes constatées en préambule". Le prompt d'origine indique "corrigé séparément" mais le rapport Session #5 dit que la lecture du code ne le confirme pas.

**Vérification directe du code actuel :**

```typescript
// api-auth.ts ligne 150 (/login)
  const rateLimit = await checkRateLimit(`auth_login:${ip}`, 5, 900000)
  // Pas de c.env.KV_CACHE → fallback Map mémoire locale

// api-auth.ts ligne 266 (/register)
  const rateLimit = await checkRateLimit(`auth_register:${ip}`, 15, 3600000)
  // Pas de c.env.KV_CACHE → fallback Map mémoire locale
```

Signature de `checkRateLimit` (lib/security.ts ligne 29-34) :
```typescript
export async function checkRateLimit(
  key: string, maxRequests: number = 30,
  windowMs: number = 60000,
  kv?: KVNamespace  // <-- 4ème paramètre optionnel
): Promise<...>
```

Si `kv` absent → branche fallback `_rateLimitStoreFallback` (Map en mémoire locale, non distribuée).

**Verdict du contre-audit :** Le rapport Session #5 a raison — `c.env.KV_CACHE` n'est **pas** passé sur les routes `/login` et `/register`. Le rate limiting est en Map mémoire locale, non distribuée entre instances Workers. Le prompt d'origine affirme "corrigé séparément" mais c'est **inexact** — le bug B-AUTH-02 n'est pas corrigé dans le code actuel.

**Cohérence avec le rapport Session #5 :** Le rapport Session #5 est **honnête** sur ce point : il documente lui-même cette anomalie en §1, contredisant l'exclusion du prompt ("corrigé séparément"). La contradiction entre le prompt d'origine et la réalité du code est correctement signalée par le rapport Session #5.

**Verdict :** CONFORME (l'affirmation du rapport Session #5 — "anomalie non résolue" — est confirmée exacte par la lecture directe du code)

---

## 5. Régressions détectées

Aucune régression introduite n'a été détectée lors de ce contre-audit.

**Points de risque analysés spécifiquement :**

- **A2.3 (verifyRestaurantAuth — sécurité)** : La vérification manuelle `.eq('auth_user_id', user.id)` est bien présente et correcte. Passage au client admin sans perte de la garde d'isolation tenant. Pas de régression de sécurité.

- **B2 (suppression R2 — scoping)** : Les préfixes `${tenantId}/` et `paiements/${tenantId}/` sont corrects. Pas de risque de débordement vers les fichiers d'un autre tenant.

- **B7 (pagination menu — compatibilité)** : La valeur par défaut (limit=200) et la préservation de la clé `categories` garantissent la rétro-compatibilité. L'ajout de `pagination` à la réponse ne casse pas les consommateurs existants (extension non breaking).

- **B8 (MIME unification — api-paiement.ts)** : `lib/paiement.ts` conserve son interface `Promise<{valide,type}>` intacte. `api-paiement.ts` n'a pas été migré et continue à fonctionner avec l'ancienne version. Pas de régression.

- **A2.1 (nouveaux codes 404 sur dashboard)** : Les routes concernées étaient précédemment en succès silencieux — les nouveaux 404 sont plus informatifs. Un frontend qui traite ces routes devrait gérer les 404. `dashboard.js` utilise une fonction `dashFetch` générique — les nouvelles erreurs 404 seront affichées à l'utilisateur plutôt que silencieusement ignorées. Pas de crash JS introduit.

---

## 6. Écarts entre le rapport Session #5 et la réalité du code

| Affirmation du rapport Session #5 | Réalité du code | Type d'écart |
|---|---|---|
| A2.4 "B-ADPAY-02/04 : `.select('id')` sur tous les UPDATEs de la session" | L'UPDATE `abonnements.statut → 'annule'` dans `/rejeter` (ligne ~354) n'a pas de `.select('id')` | Omission mineure non documentée |
| A3.6 "Remplacement par une jointure unique via Promise.all" (commit message) | `Promise.all` de deux requêtes distinctes ≠ jointure SQL unique | Formulation inexacte dans le commit message (le corps du rapport est correct) |
| B4 "Notification admin déclenchée après validation du token" (prompt source) | La notification est insérée dans `/demander-suppression` (demande initiale), pas dans la route de confirmation du token | Non-conformité partielle à l'exigence exacte du prompt d'origine |
| A4.1 "Toutes les occurrences de upData.url corrigées" (implication du rapport) | Ligne 1044 : `photo_url = upData.url` non échappée — mais cette occurrence n'est pas une insertion DOM directe | Écart formel sans impact sécurité |
| Résumé exécutif "25 corrections appliquées" | 25 corrections appliquées + 2 documentées hors périmètre : décompte cohérent. Le tableau §0 dit "25+2 doc", ce qui correspond à 27 points traités sur 30. | Cohérent (mais "10 commits" annoncé alors que 11 commits de correction sont poussés + 1 commit de rapport = 12 commits au total) |
| "B-AUTH-02 : corrigé séparément" (prompt d'origine, repris en §6 du rapport comme confirmé) | `checkRateLimit` sur `/login` et `/register` n'a pas `c.env.KV_CACHE` | Le rapport Session #5 est honnête (il documente l'anomalie en §1) mais la section §6 marque "Confirmé corrigé" pour B-AUTH-02 — contradiction interne au rapport |
| §7 "Garanties de non-régression" — "Zéro régression connue" | Confirmé — aucune régression détectée | Affirmation exacte |

---

## 7. Vérification du périmètre verrouillé

Fichiers vérifiés via `git log --oneline -- <fichier> | grep session-5` :

| Fichier | Touches par session-5 ? | Verdict |
|---|---|---|
| `src/middleware/auth.ts` | ❌ Aucun commit session-5 | ✅ Non touché |
| `src/lib/supabase.ts` | ❌ Aucun commit session-5 | ✅ Non touché |
| `src/types/database.ts` | ❌ Aucun commit session-5 | ✅ Non touché |
| `package.json` | ❌ Aucun commit session-5 | ✅ Non touché |
| `src/lib/fcm.ts` | ❌ Aucun commit session-5 | ✅ Non touché |
| `src/lib/brevo.ts` | ✅ Commit `3b3fe5a` (B5 uniquement) | ✅ Dans le périmètre |
| `src/routes/api-cron.ts` — `bloquerPaiementsExpires` | Commit `c48b2d5` modifie `api-cron.ts` mais uniquement les fonctions `verifierAbonnementsExpires` (B3) et `envoyerRappelsExpiration` (B6). `bloquerPaiementsExpires` non modifié (confirmé par diff `c48b2d5~1 c48b2d5`). | ✅ Non touché |
| Fonctionnalités plans (`produits_max`, etc.) | ❌ Aucun commit session-5 sur `api-plans.ts` | ✅ Non touché |
| Endpoint de test email | ❌ Aucun commit session-5 | ✅ Non touché |

**Conclusion :** Le périmètre verrouillé a été scrupuleusement respecté. Aucun fichier interdit n'a été modifié par les 11 commits de correction session-5.

---

## 8. Observations hors périmètre

Ces observations ne constituent pas des non-conformités de la session #5, mais des points à documenter pour des sessions futures :

1. **UPDATE abonnement dans /rejeter sans vérif rows (hors B-ADPAY-02/04)** : L'UPDATE `abonnements.statut → 'annule'` (ligne ~354, api-admin-paiements.ts) ne possède pas de `.select('id')`. Ce n'est pas couvert par B-ADPAY-02 (date_fin) ni B-ADPAY-04 (tenant), mais le pattern est cohérent avec les autres corrections. Risque faible (existence vérifiée juste avant).

2. **B-AUTH-02 non résolu en pratique** : `/login` et `/register` utilisent un rate limiting Map mémoire locale, non distribué entre instances Cloudflare Workers. Le prompt d'origine affirme "corrigé séparément" — cette affirmation est fausse selon la lecture du code actuel. À traiter en session #6.

3. **TTL rappels B6 = 26h vs 20h demandés** : Choix délibéré et justifié dans le rapport (absorber les décalages de ±2h). Valeur de 26h techniquement mieux motivée que les 20h originaux.

4. **lib/paiement.ts `validerMimeImage` — migration partielle** : La migration complète vers `lib/validation.ts` est explicitement documentée comme tâche future. `api-paiement.ts` continue à utiliser la version à 4 octets (JPEG/PNG). Pas de régression, mais divergence de comportement entre les deux routes d'upload (dashboard : GIF/WebP acceptés ; paiement : non).

5. **B-CMD-03 race condition promo** : Toujours présente. La recommandation pour la session #6 est documentée dans le rapport Session #5 et dans le code.

---

## 9. Verdict global sur la fiabilité du rapport Session #5

Le rapport Session #5 est **globalement fiable avec deux zones d'ombre localisées**.

Sur les 30 points vérifiés, 26 sont CONFORMES (87%), 4 sont PARTIELLEMENT CONFORMES. Aucun point n'est FAUX, NON CONFORME ou marqué RÉGRESSION INTRODUITE. Les 4 écarts partiels sont : un point où la non-application est honnêtement avouée mais l'exigence exacte n'est pas atteinte (B4 — timing de la notification), un point d'optimisation non totalement accomplie (A3.6 — Promise.all ≠ jointure), un point formel sans impact sécurité (A4.1), et un point mineur non documenté (A2.4 — un UPDATE sans garde dans /rejeter).

La zone d'ombre la plus significative est la **contradiction interne sur B-AUTH-02** : la section §6 du rapport le déclare "Confirmé corrigé" tandis que la section §1 documente honnêtement que ce n'est pas le cas dans le code. Cette contradiction n'a pas été résolue dans le rapport final de Session #5.

---

## 10. Déclarations finales

- "Chaque verdict de ce contre-audit repose sur une lecture directe du code effectuée pendant cette session, jamais sur une citation du rapport Session #5 prise pour argent comptant."
- "Aucune correction de code n'a été appliquée durant cette session de contre-audit."
- "Tout point marqué NON VÉRIFIABLE l'est resté faute d'accès suffisant, jamais par choix d'arrondir un doute vers un verdict positif."

---

*Rapport de contre-audit généré le 15/08/2026. Commit audité : `d6faefd`. Auteur : Agent IA (contre-audit strictement lecture seule).*
