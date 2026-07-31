# AUDIT-VERIFICATION-2.md — Cycle 3 MonMenu
**Date** : 2026-07-31  
**Branche** : `main`  
**Build** : ✅ `dist/index.js 642.64 kB │ gzip: 157.19 kB`

---

## Résumé des corrections Cycle 3

### Point 1 — `plan_id` obligatoire + machine d'états tenant

| Fichier | Correction | Statut |
|---|---|---|
| `src/routes/api-auth.ts` | `plan_id` obligatoire (422 si absent) ; statut conditionnel `essai` / `en_attente_paiement_initial` ; `plan_initial_id` stocké | ✅ |
| `src/routes/api-dashboard.ts` | `verifyAuth()` : liste blanche `.in(['actif', 'essai'])` — bloque `en_attente_paiement_initial` | ✅ |
| `src/routes/api-paiement.ts` | `verifyAuthPaiement()` : autorise `en_attente_paiement_initial` (c'est précisément pour soumettre la preuve) | ✅ |
| `src/index.tsx` | Middleware `/dashboard/*` : redirige vers `/dashboard/abonnement` si `en_attente_paiement_initial` | ✅ |
| `src/pages/inscription.ts` | Bouton submit désactivé sans plan ; activé après `selectionnerPlan()` | ✅ |
| `supabase/migrations/013_cycle3_paiement.sql` | **Ajout contrainte CHECK** `tenants.statut` : `en_attente_paiement_initial` inclus | ✅ |

**Machine d'états** :
```
inscription plan payant → en_attente_paiement_initial
    ↓ (soumettre preuve)
en_attente_confirmation
    ↓ (admin confirme)
actif
```

---

### Point 2 — Suppression abonnement annuel

| Fichier | Correction | Statut |
|---|---|---|
| `supabase/migrations/013_cycle3_paiement.sql` | `periodicite TEXT NOT NULL DEFAULT 'mensuel' CHECK (periodicite IN ('mensuel'))` | ✅ |
| `src/routes/api-paiement.ts` | `periodicite = 'mensuel'` hardcodé, branche annuelle supprimée | ✅ |
| `src/routes/api-plans.ts` | `prix_annuel_converti`, `economie_annuelle` supprimés | ✅ |
| `public/static/js/dashboard-paiement.js` | Toggle mensuel/annuel supprimé, interface 100% mensuel | ✅ |
| `src/types/database.ts` | `periodicite?: 'mensuel' \| null` | ✅ |

---

### Point 3 — Suppression taux de conversion devise

| Fichier | Correction | Statut |
|---|---|---|
| `src/routes/api-plans.ts` | `getTauxConversion()` supprimé, `TAUX_CONVERSION_DEFAUT` supprimé, `?devise=` ignoré | ✅ |
| `src/routes/api-plans.ts` | Cache KV clé fixe `'plans:FCFA'` (plus de clé dynamique) | ✅ |
| `src/routes/api-plans.ts` | Réponse : prix FCFA bruts, `devise: 'FCFA'` constant | ✅ |

---

### Point 4 — Routes admin : endpoints orphelins (documentation)

Les routes `/api/v1/admin/paiements/*` (confirmer, rejeter, voir-preuve) sont des **endpoints sans interface frontend dédiée**. Ils existent et fonctionnent mais s'utilisent uniquement via Postman/cURL avec le header `X-Admin-Secret`. Aucune page admin n'est liée à ces routes dans le projet actuel. Ce n'est pas un bug, c'est une lacune de livraison intentionnellement documentée ici.

Routes concernées :
- `POST /api/v1/admin/paiements/:id/confirmer`
- `POST /api/v1/admin/paiements/:id/rejeter`
- `GET  /api/v1/admin/paiements/:id/preuve`

---

### Point 5 — Réparation section abonnement dashboard

| Cause racine | Correction | Statut |
|---|---|---|
| Colonne `type` inexistante → `{ moyens: [] }` | `src/index.tsx` : `SELECT id, code, nom, description, ...` (sans `type`) | ✅ |
| `verifyAuthPaiement()` bloquait `en_attente_paiement_initial` | Ajout à la liste blanche dans `api-paiement.ts` | ✅ |
| Import dynamique redondant `createSupabaseClient` | Supprimé dans `src/index.tsx` | ✅ |

---

### Correctifs hérités Cycle 2

| Bug | Fichier | Correction | Statut |
|---|---|---|---|
| `type→code` SELECT moyens_paiement | `src/index.tsx` | Colonnes réelles migration 012 | ✅ |
| RLS INSERT `notifications_restaurant` trop permissive | `supabase/migrations/013` | `WITH CHECK (false)` — seul service_role via adminClient peut insérer | ✅ |
| JWT claim admin invalide | `supabase/migrations/013` | `auth.jwt() -> 'app_metadata' ->> 'role' = 'admin'` | ✅ |
| Import dynamique redondant | `src/index.tsx` | Import statique ligne 23 | ✅ |

---

### Correction Cycle 3 — BUG CRITIQUE `features.slice is not a function`

**Fichier** : `src/pages/inscription.ts`  
**Cause** : `plan.fonctionnalites` retourné par `/api/v1/plans` est un **objet JSON** `{cle: bool|string|number}`, pas un tableau. L'appel `.slice(0, 4)` sur un objet échoue avec `TypeError: features.slice is not a function`.

**Correction** :
```javascript
// AVANT (incorrect) :
features = plan.fonctionnalites || []  // ← objet, pas tableau
features.slice(0, 4)                   // ← CRASH

// APRÈS (correct) :
var fonc = typeof plan.fonctionnalites === 'string'
  ? JSON.parse(plan.fonctionnalites)
  : (plan.fonctionnalites || {})
// Extraire les clés booléennes à true, exclure les méta-clés
features = Object.entries(fonc)
  .filter(e => e[1] === true && !excluFonc.includes(e[0]))
  .map(e => e[0].replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()))
features.slice(0, 4)  // ← OK : tableau de strings
```

---

### Correction critique — Contrainte CHECK `tenants.statut`

**Fichier** : `supabase/migrations/013_cycle3_paiement.sql`  
**Cause** : La contrainte CHECK de `migration 001` liste `('essai', 'actif', 'inactif', 'suspendu')`. Le nouveau statut `en_attente_paiement_initial` **n'était pas inclus** → l'INSERT du tenant lors de l'inscription plan payant aurait échoué en production Supabase.

**Correction ajoutée dans 013** :
```sql
ALTER TABLE tenants DROP CONSTRAINT IF EXISTS tenants_statut_check;
ALTER TABLE tenants
  ADD CONSTRAINT tenants_statut_check
  CHECK (statut IN ('essai', 'actif', 'inactif', 'suspendu', 'en_attente_paiement_initial'));
```

---

## Migration D1 — Cohérence schéma

| Table D1 | Colonnes | Statut |
|---|---|---|
| `plans` | `id, nom, prix_mensuel, prix_annuel, devise, commandes_incluses, frais_par_commande, limite_pdv, fonctionnalites, ordre_affichage, actif` | ✅ aligné avec 0002_seed_plans_faso.sql |

Les plans dans D1 sont insérés par `0002_seed_plans_faso.sql` (Faso 0, Baraka 8000, Naaba 18000, Mogho 35000 FCFA).

---

## Tests de validation

| Test | Résultat |
|---|---|
| `GET /api/v1/plans` | ✅ 200 — 4 plans FCFA |
| `GET /inscription` | ✅ 200 |
| `GET /api/v1/moyens-paiement` | ✅ 200 |
| `POST /api/v1/auth/register` sans `plan_id` | ✅ 422 |
| Build vite | ✅ 642.64 kB |
| `features.slice` sur objet fonctionnalites | ✅ corrigé |

---

## Fichiers modifiés (ce cycle)

| Fichier | Type |
|---|---|
| `src/pages/inscription.ts` | Correction `features.slice` |
| `src/routes/api-auth.ts` | plan_id obligatoire, statut conditionnel |
| `src/routes/api-dashboard.ts` | verifyAuth liste blanche |
| `src/routes/api-paiement.ts` | verifyAuthPaiement + D1 pour plans |
| `src/routes/api-plans.ts` | Suppression devise/conversion |
| `src/index.tsx` | Fix type→code, import statique |
| `src/types/database.ts` | Nouveaux statuts/champs |
| `public/static/js/dashboard-paiement.js` | Toggle annuel supprimé |
| `migrations/001_initial_schema.sql` | Colonnes devise/frais/limite_pdv |
| `supabase/migrations/013_cycle3_paiement.sql` | CHECK statut, periodicite, plan_initial_id, RLS, JWT |
| `ecosystem.config.cjs` | wrangler dev --local |
