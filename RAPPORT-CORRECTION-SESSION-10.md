# Rapport de correction — Session 10

**Date** : 2026-08-16  
**Dépôt** : `poodasamuelpro/monmenu`  
**Branche** : `main`  
**Commits pushés** : `db193c0`, `518bda3`, `fc76fab`  
**Dernier commit avant session** : `986481b`

---

## Corrections appliquées (3 commits)

### 1. S5-01 + S5-02 — `src/lib/security.ts` (`db193c0`)

**S5-01 — Retrait de `X-XSS-Protection` + ajout COOP/COEP**
- `X-XSS-Protection: 1; mode=block` retiré : en-tête déprécié, peut créer des vulnérabilités sur les navigateurs modernes (XSS Auditor désactivé dans Chrome depuis 2019)
- Ajout : `Cross-Origin-Opener-Policy: same-origin` — isole le contexte de navigation, empêche les attaques Spectre cross-origin
- Ajout : `Cross-Origin-Embedder-Policy: require-corp` — bloque le chargement de ressources cross-origin non explicitement permises

**S5-02 — Retrait de `graph.facebook.com` de `connect-src`**
- `graph.facebook.com` était dans la CSP `connect-src` sans pixel Facebook ni SDK FB intégré
- Retiré : réduit la surface d'attaque CSP, empêche exfiltration de données via FB si XSS

Fichier : `src/lib/security.ts` — ligne 170-183

---

### 2. BUG-10 — `src/routes/api-dashboard.ts` (`518bda3`)

**Problème** : Route `GET /api/v1/dashboard/compte/confirmer-suppression` renvoyait un template HTML SSR avec `${tenant.nom}` interpolé directement sans échappement. Un restaurant avec un nom contenant `<script>document.cookie</script>` ou similaire pouvait déclencher une exécution JS dans le navigateur de l'admin/tenant visitant le lien de confirmation.

**Corrections** :
1. Import de `escapeHtml` ajouté à l'import brevo existant (ligne 113)
2. `setSecurityHeaders(c)` → `const nonce = setSecurityHeaders(c)` (nonce capturé pour usage futur S3-02)
3. `${tenant.nom}` → `escapeHtml(tenant.nom ?? tenant.slug)` dans le template HTML
4. La date de suppression aussi échappée : `escapeHtml(datePreviewStr)`
5. Template HTML amélioré avec `<meta name="viewport">` et CSP inline minimale

Fichier : `src/routes/api-dashboard.ts` — lignes 113, 2585, 2655-2675

---

### 3. S3-03 — `src/routes/api-dashboard.ts` (`fc76fab`)

**Problème** : Les 2 exports CSV (`GET /commandes/export-csv` et `GET /codes-promo/export-csv`) généraient des cellules sans neutralisation des formules tableur. Une valeur commençant par `=`, `+`, `-` ou `@` est interprétée comme formule par Excel et LibreOffice Calc — injection CSV pouvant exécuter des commandes système.

**Correction** : Dans les 2 exports, la fonction de sérialisation CSV est remplacée par :
```typescript
].map(v => {
  const s = String(v ?? '').replace(/"/g, '""')
  const safe = /^[=+\-@]/.test(s) ? `'${s}` : s
  return `"${safe}"`
}).join(',')
```
Le préfixe `'` est reconnu par les tableurs comme marqueur "texte brut" — la valeur est affichée telle quelle sans interprétation de formule.

Fichiers : `src/routes/api-dashboard.ts` — lignes 475-481 et 1690-1696

---

## Items restants (non traités cette session)

### P2 haute priorité
- [ ] **S1-04** : CSRF double-submit cookie — ajouter cookie non-httpOnly `csrf-token` + header `X-CSRF-Token` + `timingSafeEqual` dans middleware dashboard (compléter l'existant X-Requested-With)
- [ ] **S2-03** : Auth admin — remplacer `X-Admin-Secret` par Supabase Auth + vérification table `admins` dans `api-admin-paiements.ts` et `api-newsletter.ts`
- [ ] **S1-03** : `/reset-password` — tenter `signInWithPassword(email, nouveauMdp)` avant `updateUserById` pour détecter si mot de passe identique à l'ancien
- [ ] **R3** : Centraliser `verifyAuth`, `verifyAuthOnboarding`, `verifyAuthPaiement`, `verifyRestaurantAuth` dans `src/lib/auth.ts`

### P6 priorité moyenne
- [ ] **S9-05** : Cache KV sitemap.xml TTL 1h dans `src/index.tsx` (route `/sitemap.xml` ligne 218) — clé `kv:sitemap`, TTL 3600s
- [ ] **A-04** : Migrer `api-paiement.ts` de `validerMimeImage` (deprecated, async, ligne 79+358) vers `validerMimeImageUnifie` (sync, `lib/validation.ts`)
- [ ] **A-05** : Créer `src/lib/constants.ts` avec constantes statuts tenant (`'actif'|'inactif'|'suspendu'|'essai'|'en_attente_paiement_initial'|'bloque'`)
- [ ] **A-08** : Factoriser `PATCH /commandes/:id/statut` — les 2 copies sont déjà documentées B-CMD-02 ; bloquer une régression en testant les deux routes
- [ ] **SQL** : Renommer `supabase/migrations/013_fcm_tokens.sql` → `014_fcm_tokens.sql`

### P7 priorité basse
- [ ] **S6-02** : `detail: error.message` conditionnel à `c.env.ENVIRONMENT !== 'production'` (grep tous les fichiers)
- [ ] **S6-03** : SRI (integrity + crossorigin) sur scripts CDN dans templates HTML inline
- [ ] **S5-03** : CORS localhost conditionnel à `ENVIRONMENT === 'development'` dans `src/index.tsx`
- [ ] **ADMIN_EMAILS** : Ajouter `ADMIN_EMAILS?: string` dans type `Env` de `src/types/database.ts` (ligne 370-394)

### P8/P9 basse priorité
- [ ] **S3-02** : Nonces CSP dans tous les templates SSR → retirer `unsafe-inline` — nécessite inventaire complet des `c.html()` dans tous les fichiers routes
- [ ] Re-vérification exhaustive items "conformes" sessions 1-9
- [ ] Relecture : `api-blog.ts`, `api-admin-tasks.ts`, `api-contact.ts`, `api-tenants.ts`, `api-livraison.ts`

---

## État git au terme de la session 10

```
fc76fab fix(P3/S3-03): api-dashboard.ts — neutralisation injection CSV (=+-@) dans les 2 exports CSV
518bda3 fix(P3/BUG-10): api-dashboard.ts — escapeHtml(tenant.nom) dans confirmer-suppression (XSS)
db193c0 fix(P3/S5-01/S5-02): security.ts — retirer X-XSS-Protection+graph.facebook.com, ajouter COOP/COEP
986481b docs: RAPPORT-CORRECTION-SESSION-9.md — 14 corrections P4/P5/P6 appliquées
```

## Fichiers modifiés cette session

| Fichier | Corrections |
|---------|-------------|
| `src/lib/security.ts` | S5-01 (X-XSS-Protection retiré, COOP/COEP ajoutés), S5-02 (graph.facebook.com retiré de connect-src) |
| `src/routes/api-dashboard.ts` | BUG-10 (escapeHtml tenant.nom confirmer-suppression), S3-03 (neutralisation injection CSV ×2) |

## Note sur interruption sandbox

La session a subi un gel du sandbox (~70-80% failure rate sur Bash et Read) qui a nécessité un `ResetSandbox`. Après reset, tous les fichiers ont été préservés et les corrections ont pu être appliquées normalement. Aucune perte de données.
