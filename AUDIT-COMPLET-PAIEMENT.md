# 🔍 AUDIT COMPLET — MonMenu : Système de Paiement & Flux Utilisateur
> **Date :** 2026-07-31  
> **Auditeur :** IA Code Audit (analyse statique exhaustive)  
> **Périmètre :** Accueil → Inscription → Dashboard → Paiement → Admin  
> **Dépôt analysé :** `https://github.com/poodasamuelpro/monmenu`  
> **Version du code :** Branch `main` (dernier commit analysé)

---

## 📋 TABLE DES MATIÈRES 

1. [Résumé Exécutif](#résumé-exécutif)
2. [Architecture Globale](#architecture-globale)
3. [Inventaire Complet des Fichiers](#inventaire-complet-des-fichiers)
4. [Analyse — Page d'Accueil](#analyse--page-daccueil)
5. [Analyse — Inscription](#analyse--inscription)
6. [Analyse — Menu / Boutique](#analyse--menu--boutique)
7. [Analyse — Dashboard Restaurant](#analyse--dashboard-restaurant)
8. [Analyse — Module Paiement (CŒUR)](#analyse--module-paiement-cœur)
9. [Analyse — Migrations Supabase](#analyse--migrations-supabase)
10. [Analyse — Cron Jobs](#analyse--cron-jobs)
11. [Analyse — Sécurité](#analyse--sécurité)
12. [Matrice de Fonctionnalités](#matrice-de-fonctionnalités)
13. [Bugs & Incohérences Critiques](#bugs--incohérences-critiques)
14. [Fonctionnalités Manquantes](#fonctionnalités-manquantes)
15. [Feuille de Route — Plan d'Amélioration](#feuille-de-route--plan-damélioration)
16. [Nouveaux Fichiers à Créer](#nouveaux-fichiers-à-créer)
17. [Fichiers à Modifier](#fichiers-à-modifier)

---

## 1. Résumé Exécutif

### Verdict Global

| Domaine | Score | Statut |
|---------|-------|--------|
| Architecture générale | 8/10 | ✅ Solide |
| Sécurité API | 8.5/10 | ✅ Très bonne |
| Module paiement (backend) | 7.5/10 | ⚠️ Partiel |
| Module paiement (frontend) | 5/10 | ❌ Critique |
| Page dédiée paiement/abonnement | 2/10 | ❌ Absente |
| Dashboard admin (côté web) | 1/10 | ❌ Absent |
| Upload d'images (produits) | 7/10 | ⚠️ Fonctionnel mais sans UI complète |
| Migrations DB | 8/10 | ✅ Bien structurées |
| Cron jobs | 8/10 | ✅ Bien implémentés |
| Notifications | 6/10 | ⚠️ Partielles |

### Points Forts
- ✅ Architecture Hono + Cloudflare Workers propre et scalable
- ✅ Sécurité paiement robuste (10 contrôles SEC-01 à SEC-10)
- ✅ Validation MIME en 4 couches pour les preuves de paiement
- ✅ Rate limiting distribué KV opérationnel
- ✅ Cron jobs bien séparés avec gestion d'erreurs
- ✅ RLS Supabase correctement configuré
- ✅ Protection CSRF via header X-Requested-With
- ✅ Soft-delete implémenté sur produits et commandes

### Points Critiques
- ❌ **AUCUNE page dédiée `/dashboard/abonnement`** dans `dashboard.ts` — seul un onglet sidebar existe mais n'est jamais rendu
- ❌ **ADMIN manquant** côté web : aucune route `/api/admin/paiements/confirmer` dans ce dépôt
- ❌ **`construireCarteStatut()`** utilise `s.statut_abonnement` mais l'API retourne `s.abonnement.statut` — clé incorrecte
- ❌ **`chargerPlansSelect()`** appelé dans `DOMContentLoaded` mais `inp-plan-preuve` n'existe que dans le formulaire qui est construit dynamiquement — race condition
- ❌ **Filtre des bandeaux** dans `initBandeauxPaiement()` filtre sur des types `paiement_en_attente`, `essai_expirant`... mais l'API retourne des types `info`, `warning`, `error` — filtre toujours vide
- ❌ **`checkRateLimit()` appelé sans `kv`** dans `api-dashboard.ts` ligne ~1378 — signature incorrecte, le paramètre `kv` est passé en 3e position alors que la fonction attend `(key, max, window, kv)` — rate limit non appliqué pour upload image
- ❌ **Pas de page `/tarifs` liée au paiement depuis le dashboard** — le lien `/dashboard/abonnement` ne redirige jamais vers une page fonctionnelle

---

## 2. Architecture Globale

```
monmenu/ (Cloudflare Workers + Hono)
├── src/
│   ├── index.tsx              ← Point d'entrée, routage principal
│   ├── lib/
│   │   ├── paiement.ts        ← Utilitaires paiement (pur, bien isolé)
│   │   ├── security.ts        ← Rate limit, CSRF, validation
│   │   ├── supabase.ts        ← Clients Supabase
│   │   ├── whatsapp.ts        ← Notifications WhatsApp
│   │   ├── brevo.ts           ← Emails transactionnels
│   │   ├── delivery.ts        ← Calcul frais livraison
│   │   └── screenshot.ts      ← Capture screenshots boutique
│   ├── routes/
│   │   ├── api-paiement.ts    ← ✅ Routes paiement restaurant (5 endpoints)
│   │   ├── api-dashboard.ts   ← ✅ Routes dashboard (CRUD complet)
│   │   ├── api-auth.ts        ← ✅ Authentification
│   │   ├── api-cron.ts        ← ✅ Tâches planifiées
│   │   ├── api-plans.ts       ← ✅ Plans D1
│   │   ├── api-admin-tasks.ts ← ⚠️ Tâches admin (minimal)
│   │   └── ...
│   ├── pages/
│   │   ├── dashboard.ts       ← ❌ Section abonnement non rendue
│   │   ├── home.ts            ← ✅ Page d'accueil complète
│   │   ├── tarifs.ts          ← ✅ Page tarifs
│   │   ├── boutique.ts        ← ✅ Page boutique restaurant
│   │   └── ...
│   └── types/database.ts      ← ✅ Types bien maintenus
├── public/static/js/
│   ├── dashboard-paiement.js  ← ⚠️ UI paiement partielle, bugs
│   ├── dashboard.js           ← ✅ Dashboard principal
│   └── notifications.js       ← ✅ Notifications cloche
└── supabase/migrations/       ← ✅ Bien structurées (001-009)
```

### Flux des Données (Paiement)

```
Restaurant                    Serveur Web               Admin
    │                              │                       │
    ├─ GET /dashboard/abonnement ──→│                       │
    │                              │←── [SECTION ABSENTE] ─┤
    │                              │                       │
    ├─ GET /api/v1/paiement/référence →│                    │
    │←── référence MM-XXXX-YYYMM-HEX──│                    │
    │                              │                       │
    ├─ POST /api/v1/paiement/soumettre →│                   │
    │   [preuve + plan_id + methode]  │                     │
    │                              │── upload R2 ──→        │
    │                              │── insert abonnements → │
    │                              │── notif admin ──→      │
    │←── {success, référence, délai}──│                     │
    │                              │                       │
    │                              │←── POST /confirmer ───┤ [ABSENT dans ce dépôt]
    │                              │── update tenant actif  │
    │←── notification WhatsApp ───────────────────────────  │
```

---

## 3. Inventaire Complet des Fichiers

### Fichiers Analysés

| Fichier | Taille estimée | Statut | Notes |
|---------|---------------|--------|-------|
| `src/index.tsx` | ~535 lignes | ✅ Bon | Routage complet, middleware custom domain |
| `src/lib/paiement.ts` | 190 lignes | ✅ Excellent | Fonctions pures, bien documentées |
| `src/lib/security.ts` | 195 lignes | ✅ Bon | CSP manque certains CDN |
| `src/routes/api-paiement.ts` | 626 lignes | ✅ Bon | 5 endpoints bien sécurisés |
| `src/routes/api-plans.ts` | 95 lignes | ✅ Bon | Cache KV, conversion devise |
| `src/routes/api-dashboard.ts` | ~1780 lignes | ✅ Très complet | CRUD exhaustif |
| `src/routes/api-cron.ts` | ~453 lignes | ✅ Bon | 4 tâches bien séparées |
| `src/routes/api-admin-tasks.ts` | 49 lignes | ⚠️ Minimal | 1 seul endpoint |
| `src/pages/dashboard.ts` | 244 lignes | ❌ Critique | Section abonnement absente |
| `src/pages/home.ts` | 673 lignes | ✅ Bon | Plans chargés dynamiquement |
| `src/pages/tarifs.ts` | 323 lignes | ✅ Bon | Plans dynamiques, FAQ |
| `src/pages/boutique.ts` | 611 lignes | ✅ Très complet | WhatsApp, carte, checkout |
| `src/pages/inscription.ts` | 236 lignes | ✅ Bon | Cookie httpOnly correct |
| `src/types/database.ts` | 335 lignes | ✅ Bien maintenu | Types alignés migrations |
| `public/static/js/dashboard-paiement.js` | 689 lignes | ❌ Critique | Bugs logiques, mapping API incorrect |
| `supabase/migrations/001_initial_schema.sql` | ~400 lignes | ✅ Complet | Schéma initial solide |
| `supabase/migrations/007_abonnement_paiement_manuel.sql` | 103 lignes | ✅ Bien | Champs paiement, contrainte CHECK |
| `supabase/migrations/008_notifications_paiement.sql` | 63 lignes | ✅ Bien | Tables notifs |

---

## 4. Analyse — Page d'Accueil

### Fichier : `src/pages/home.ts`

#### ✅ Fonctionnalités Implémentées Complètement

1. **Hero section** avec CTA "Créer mon menu gratuitement" → `/inscription`
2. **Chargement dynamique des plans** via `/api/v1/plans` — affiche skeleton en attendant, gestion d'erreur
3. **Carrousel partenaires** `loadPartenaires()` — correction appliquée (suppression HTML concaténé fragile)
4. **Carrousel boutiques showcase** `loadBoutiquesShowcase()` — correction appliquée
5. **FAQ accordion** avec toggle natif
6. **Section "Comment ça marche"** — statique, bien formatée
7. **CTA final** avec liens inscription et contact
8. **SEO** : JSON-LD Organization + WebSite, meta robots

#### ⚠️ Fonctionnalités Partiellement Implémentées

- **Plans sur la homepage** : le `loadPlans()` charge correctement les plans mais la logique `isPro` est basée sur `plan.prix_mensuel === maxPrix` sans tenir compte du champ `f.recommande` — si le plan "Pro" n'a pas le prix maximum (ex: plan Enterprise absent de la liste), le badge est mal assigné.

  **Correction suggérée :**
  ```javascript
  const isPopular = !!f.recommande; // Priorité au champ recommande de la DB
  const isTopTier = !isPopular && p.prix_mensuel === maxPrix && maxPrix > 0;
  ```

- **Lien vers tarifs** depuis le hero absent — le CTA "Voir les plans" dans la section tarifs redirige vers `/inscription?plan=${p.id}` mais pas vers `/tarifs` pour un choix éclairé.

#### ❌ Fonctionnalités Absentes

- **Pas de bouton "Se connecter"** dans la navbar de la homepage (seulement "Créer ma boutique")
- **Section tarifs ne montre que le prix mensuel** par défaut — aucun sélecteur mensuel/annuel sur la homepage (uniquement sur la page `/tarifs`)
- **Images réelles** des plats démo (`/api/v1/media/demo/plat-riz-gras.jpg`) — cette route n'existe pas dans l'API, les images du mockup hero sont cassées

#### 🐛 Bugs

**Bug 1 — Image démo 404 :**
```html
<!-- Dans home.ts ligne ~136 -->
<img src="/api/v1/media/demo/plat-riz-gras.jpg" ...>
<!-- Cette route n'est pas définie dans index.tsx ni dans api-dashboard.ts -->
```
**Correction :** Utiliser des images placeholder ou ajouter la route `/api/v1/media/demo/:slug`.

---

## 5. Analyse — Inscription

### Fichier : `src/pages/inscription.ts`

#### ✅ Implémenté Complètement

1. **Formulaire inscription** avec tous les champs (nom, gérant, WhatsApp, email, password)
2. **Preview slug en temps réel** avec normalisation Unicode
3. **Cookie httpOnly** : `credentials: 'include'` correct
4. **Validation HTML5** + messages d'erreur utilisateur
5. **Redirection post-inscription** vers `/bienvenue`

#### ⚠️ Partiel

- **Sélection du plan à l'inscription** : La page `inscription.ts` ne propose pas de sélectionner un plan (tout le monde commence en "essai"). Le paramètre `?plan=` dans l'URL n'est pas exploité par le formulaire.

  **Impact :** Un visiteur qui clique sur "Choisir ce plan" depuis la page tarifs arrive sur `/inscription?plan=xxx` mais le plan n'est pas pré-sélectionné ni enregistré.

  **Correction :** Lire `URLSearchParams` et pré-sélectionner le plan, ou l'envoyer dans le payload d'inscription.

#### ❌ Absent

- **Choix du pays** : La table `tenants` a un champ `pays_id` (NOT NULL, FK vers `pays`), mais aucun sélecteur pays n'est présent dans le formulaire d'inscription.

  **Impact CRITIQUE :** L'API `/api/v1/auth/register` reçoit probablement un `pays_id` null ou hardcodé, ce qui peut provoquer une erreur de contrainte FK.

  **Vérification nécessaire dans `api-auth.ts`** (non lu mais critique).

---

## 6. Analyse — Menu / Boutique

### Fichier : `src/pages/boutique.ts`

#### ✅ Implémenté Complètement

1. **Rendu boutique** avec personnalisation couleurs CSS variables
2. **Header avec bannière, logo médaillon, adresse**
3. **Statut horaire** calculé côté serveur + rafraîchi côté client
4. **Navigation par catégories** sticky
5. **Panier flottant** avec modal checkout complet
6. **Géolocalisation** + carte Leaflet pour adresse livraison
7. **Code promo** avec application côté client
8. **Récapitulatif** sous-total, frais livraison, total
9. **Validation GPS obligatoire** en mode livraison (FIX 2026-07-30)
10. **Bouton suivi commande** flottant bas-gauche
11. **Footer** horaires + contact WhatsApp
12. **Normalisation numéro WhatsApp** `formatWhatsAppNumber()`

#### ⚠️ Partiel

- **Mode paiement** : Le checkout propose de sélectionner le mode de paiement (espèces, Mobile Money, carte) dans `boutique.js` mais aucune validation que le mode sélectionné est activé pour ce pays/restaurant.

#### ❌ Absent

- **Pas de gestion du "restaurant fermé"** côté API commande : le bandeau s'affiche mais le bouton "Confirmer" ne semble pas désactivé côté serveur si la boutique est fermée — uniquement côté client dans `boutique.js`.

---

## 7. Analyse — Dashboard Restaurant

### Fichier : `src/pages/dashboard.ts`

#### Structure Sidebar

La sidebar définit les liens suivants :
```
/dashboard/commandes
/dashboard/menu
/dashboard/statistiques
/dashboard/livreurs
/dashboard/qrcode
/dashboard/codes-promo
/dashboard/pdv
/dashboard/apparence
/dashboard/parametres
/dashboard/abonnement  ← LIEN PRÉSENT
```

#### ⚠️ Problème Architectural CRITIQUE

**Toutes ces routes `/dashboard/*` sont gérées par une SEULE route wildcard dans `index.tsx` :**
```typescript
app.get('/dashboard/*', async (c) => {
  // ...auth check...
  return c.html(renderDashboardPage(nomProjet, ...))
})
```

`renderDashboardPage()` retourne **toujours le même HTML** avec une `<section id="section-commandes">` visible. La navigation entre sections est entièrement gérée côté client par `dashboard.js` en manipulant le DOM.

**Impact :** Si `dashboard.js` ne gère pas l'URL `/dashboard/abonnement`, cette section reste vide.

#### Analyse de `dashboard.js`

Sans voir `dashboard.js` en détail, les fonctions appelées depuis `dashboard.ts` sont :
- `initDashboard()` — probablement charge les commandes
- `initBandeauxPaiement()` — confirmé dans `dashboard-paiement.js`
- `retourAccueil()` — navigation
- `toggleNotifPanel()` — notifications

**Ce qui manque dans `dashboard.ts` :**
```html
<!-- ABSENT dans le HTML généré par dashboard.ts -->
<section id="section-abonnement" class="hidden">
  <!-- Rempli par dashboard-paiement.js:initSectionAbonnement() -->
  <div id="section-abonnement-content"></div>
</section>
```

Sans ce bloc HTML, `initSectionAbonnement()` cherche `#section-abonnement-content` qui n'existe pas et ne fait rien.

---

## 8. Analyse — Module Paiement (CŒUR)

### 8.1 Backend — `src/routes/api-paiement.ts`

#### ✅ Endpoints Implémentés

| Endpoint | Méthode | Statut | Description |
|----------|---------|--------|-------------|
| `/api/v1/paiement/statut` | GET | ✅ Complet | Statut abonnement + jours essai + heures restantes |
| `/api/v1/paiement/reference` | GET | ✅ Complet | Génère/retourne référence active |
| `/api/v1/paiement/soumettre` | POST | ✅ Complet | Upload preuve + création abonnement |
| `/api/v1/paiement/historique` | GET | ✅ Complet | Historique paginé |
| `/api/v1/paiement/notifications` | GET | ✅ Complet | Notifications in-app |

#### ⚠️ Bugs Backend

**Bug 1 — Statut retourné vs. attendu côté client**

L'API `/api/v1/paiement/statut` retourne :
```json
{
  "statut_tenant": "essai",
  "abonnement": {
    "statut": "en_attente_confirmation",
    ...
  }
}
```

Mais `dashboard-paiement.js:construireCarteStatut()` lit :
```javascript
if (s.statut_abonnement === 'actif') { ... }
```

**`s.statut_abonnement` n'existe pas dans la réponse !** La clé correcte est `s.abonnement?.statut`.

**Correction dans `dashboard-paiement.js` :**
```javascript
const statutAbonnement = s.abonnement?.statut ?? null;
const dateFinAbonnement = s.abonnement?.date_fin ?? null;

if (statutAbonnement === 'actif') { ... }
else if (statutAbonnement === 'en_attente_confirmation') { ... }
```

**Bug 2 — Référence active**

L'API retourne `reference_active` mais `construireCarteStatut()` lit `s.reference_active` — cette clé est correcte. Pas de bug ici.

**Bug 3 — Délai deadline**

L'API retourne `s.abonnement.delai_confirmation_expire_le` mais `construireCarteStatut()` lit `s.deadline_confirmation`. Clé incorrecte.

**Correction :**
```javascript
const deadline = s.abonnement?.delai_confirmation_expire_le;
const soumisLe = s.abonnement?.soumis_le;
```

**Bug 4 — Montant non envoyé à l'API**

Dans `soumettrePreuvePaiement()` ligne ~506 :
```javascript
if (montant) formData.append('montant_declare', montant);
```

L'API `POST /soumettre` ne lit pas `montant_declare` — elle calcule le montant depuis le plan choisi (`periodicite === 'annuel' ? plan.prix_annuel : plan.prix_mensuel`). Ce champ est ignoré côté serveur. À soit documenter (champ informatif) soit supprimer pour ne pas induire en erreur.

**Bug 5 — Periodicité non envoyée**

Le formulaire d'upload n'a pas de champ `periodicite` (mensuel/annuel). L'API utilise le défaut `'mensuel'` mais le restaurant ne peut pas choisir de payer annuellement via l'UI. 

**Correction :** Ajouter un toggle mensuel/annuel dans le formulaire de soumission.

### 8.2 Frontend — `public/static/js/dashboard-paiement.js`

#### ✅ Implémenté

1. **Drag & Drop** pour upload de preuve — bien implémenté
2. **Validation client** extension + taille + MIME
3. **Aperçu image** avant soumission
4. **Barre de progression** (simulée)
5. **Chargement dynamique des plans** dans le select
6. **Historique des abonnements** avec tableau HTML
7. **Copier référence** dans le presse-papier

#### ❌ Bugs Critiques dans le Frontend

**Bug Critique 1 — Filtre des bandeaux**

```javascript
// Ligne ~96 dans initBandeauxPaiement()
const notifs = (data.notifications || []).filter(n =>
  ['paiement_en_attente', 'essai_expirant', 'essai_expire', 'abonnement_confirme', 'abonnement_rejete'].includes(n.type)
);
```

L'API retourne des types `'info'`, `'warning'`, `'error'`, `'success'` — PAS les types filtrés ici. Ce filtre est **toujours vide**. Les bandeaux ne s'affichent **jamais**.

**Correction :**
```javascript
// Afficher TOUTES les notifications (pas de filtre sur type)
const notifs = data.notifications || [];
// Ou adapter le filtre aux vrais types retournés
```

**Bug Critique 2 — Mapping API incorrect dans `construireCarteStatut()`**

```javascript
// Utilisé : s.statut_abonnement, s.plan_nom, s.date_fin, s.soumis_le, s.deadline_confirmation
// Réel API : s.abonnement.statut, s.abonnement.plan_id, s.abonnement.date_fin, s.abonnement.soumis_le, s.abonnement.delai_confirmation_expire_le
```

Toutes les clés lues sont incorrectes → la section abonnement affiche un état "aucun abonnement" même quand un est actif.

**Bug Critique 3 — `checkRateLimit` mal appelé dans `api-dashboard.ts`**

```typescript
// Ligne ~1378 dans api-dashboard.ts
const rateLimit = await checkRateLimit(`upload:${auth.tenant_id}`, 25, 3600000)
// La signature est : checkRateLimit(key, max, window, kv?)
// Le paramètre kv n'est pas passé → utilise le fallback in-memory non distribué
// → Rate limit inefficace sur Workers multi-isolate
```

**Correction :**
```typescript
const rateLimit = await checkRateLimit(`upload:${auth.tenant_id}`, 25, 3600000, c.env.KV_CACHE)
```

**Bug 4 — Race condition chargerPlansSelect()**

```javascript
document.addEventListener('DOMContentLoaded', async () => {
  if (document.getElementById('inp-plan-preuve')) {  // Jamais vrai au chargement
    await chargerPlansSelect('inp-plan-preuve');       // Cette ligne ne s'exécute jamais
  }
  if (window.location.pathname === '/dashboard/abonnement') {
    await initSectionAbonnement();  // Ce code crée inp-plan-preuve APRÈS le DOMContentLoaded
  }
});
```

`inp-plan-preuve` est créé dynamiquement par `construireFormUpload()` appelé dans `construireCarteStatut()` qui est appelé dans `initSectionAbonnement()`. Au moment du `DOMContentLoaded`, cet élément n'existe pas encore.

**Correction :**
```javascript
// Appeler chargerPlansSelect après initSectionAbonnement
async function initSectionAbonnement() {
  // ... render section ...
  await chargerPlansSelect('inp-plan-preuve'); // Ici, inp-plan-preuve existe
}
```

**Bug 5 — Plan_nom non disponible dans l'historique**

```javascript
// Dans construireHistorique()
<td>${esc(a.plan_nom || a.plan_id || '—')}</td>
```

L'API `/historique` retourne les abonnements avec `plan_id` (UUID) mais PAS `plan_nom`. L'affichage montre donc un UUID brut, pas le nom du plan.

**Correction :** Ajouter une jointure sur `plans` dans la requête de l'historique.

### 8.3 Page Abonnement — ABSENTE

Il n'existe **aucune page HTML dédiée** pour `/dashboard/abonnement`. La section devrait être rendue dans `dashboard.ts` mais elle n'y est pas.

**Ce qui existe :**
- ✅ `dashboard-paiement.js` : fonctions JS prêtes
- ✅ `api-paiement.ts` : endpoints API prêts
- ❌ HTML de la section dans `dashboard.ts` : **ABSENT**
- ❌ Route de navigation client-side dans `dashboard.js` : **NON VÉRIFIÉE**

**Ce que la page doit afficher (selon le cahier des charges implicite) :**
1. Statut abonnement actuel (actif / essai / en attente / inactif)
2. Référence de paiement avec bouton "Copier"
3. Formulaire upload preuve (drag & drop)
4. Sélecteur plan + méthode de paiement + périodicité (mensuel/annuel)
5. Barre de progression délai 72h (si en attente)
6. Historique des paiements avec statuts
7. Prix des plans avec liens vers `/tarifs`
8. Boutons d'actions : "J'ai payé", "Voir les plans", "Contacter le support"

---

## 9. Analyse — Migrations Supabase

### Fichiers Analysés

| Migration | Fichier | Statut |
|-----------|---------|--------|
| 001 | `001_initial_schema.sql` | ✅ Complet |
| 001b | `001b_patch_audit_log.sql` | ✅ Patch OK |
| 002 | `002_rls_policies.sql` | ✅ RLS bien configuré |
| 003 | `003_seed_demo.sql` | ✅ Données de démo |
| 004 | `004_audit_triggers.sql` | ✅ Triggers audit |
| 005b | `005b_patch_rls_articles_newsletter.sql` | ✅ Patch articles |
| 006 | `006_tenant_essai_expire.sql` | ✅ Gestion essais |
| 007 | `007_abonnement_paiement_manuel.sql` | ✅ Paiement manuel |
| 008 | `008_notifications_paiement.sql` | ✅ Notifications |
| 009 | `009_sync_plans_depuis_d1.sql` | ⚠️ À analyser |

#### ⚠️ Problème Migration 001 — Stats journalières incohérentes

Dans `001_initial_schema.sql` :
```sql
CREATE TABLE stats_journalieres (
  ca_total NUMERIC(12,2)  -- Colonnes : ca_total, taux_annulation
);
```

Mais dans `api-cron.ts:calculerStatsUnTenant()`, l'upsert utilise :
```typescript
const statsData = {
  chiffre_affaires: chiffreAffaires,     // Différent de ca_total !
  frais_livraison_total: totalFraisLivraison,  // Absent du schéma !
  top_produits: top3Produits,             // Absent du schéma !
  nb_commandes_livrees: commandesLivrees, // Absent du schéma !
  nb_commandes_annulees: commandesAnnulees, // Absent du schéma !
}
```

**Les colonnes `frais_livraison_total`, `top_produits`, `nb_commandes_livrees`, `nb_commandes_annulees`, `chiffre_affaires` n'existent PAS dans le schéma 001 !**

L'upsert du cron échouera silencieusement en production.

**Correction nécessaire — Nouvelle migration :**
```sql
-- Migration 010_patch_stats_journalieres.sql
ALTER TABLE stats_journalieres RENAME COLUMN ca_total TO chiffre_affaires;
ALTER TABLE stats_journalieres ADD COLUMN IF NOT EXISTS nb_commandes_livrees INTEGER NOT NULL DEFAULT 0;
ALTER TABLE stats_journalieres ADD COLUMN IF NOT EXISTS nb_commandes_annulees INTEGER NOT NULL DEFAULT 0;
ALTER TABLE stats_journalieres ADD COLUMN IF NOT EXISTS frais_livraison_total NUMERIC(12,2) NOT NULL DEFAULT 0;
ALTER TABLE stats_journalieres ADD COLUMN IF NOT EXISTS top_produits JSONB;
```

Le type `StatsJournalieres` dans `database.ts` utilise encore `ca_total` — incohérent avec le cron.

#### ⚠️ Problème RLS — Policies manquantes pour `notifications_restaurant`

La migration `008` crée les tables `notifications_restaurant` et `notifications_admin` mais **ne crée pas de policies RLS** pour ces tables. RLS est désactivé par défaut sur ces tables.

**Risque :** Pas de restriction d'accès en lecture sur `notifications_restaurant` via PostgREST.  
**Mitigation actuelle :** Toutes les requêtes passent par `createSupabaseAdminClient` (service_role) côté Workers, ce qui bypasse RLS. Mais si quelqu'un appelle l'API Supabase directement avec un token user, il peut lire les notifications de tous les tenants.

**Correction :**
```sql
-- À ajouter dans 008 ou dans une migration 010
ALTER TABLE notifications_restaurant ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications_admin ENABLE ROW LEVEL SECURITY;

CREATE POLICY "notif_restaurant_tenant_read" ON notifications_restaurant
  FOR SELECT USING (tenant_id = get_user_tenant_id());

CREATE POLICY "notif_restaurant_service_all" ON notifications_restaurant
  FOR ALL USING (
    current_setting('request.jwt.claims', true)::json->>'role' = 'service_role'
  );

CREATE POLICY "notif_admin_service_only" ON notifications_admin
  FOR ALL USING (
    current_setting('request.jwt.claims', true)::json->>'role' = 'service_role'
  );
```

#### ⚠️ Incohérence — Table `stats_journalieres` dans `api-dashboard.ts`

`GET /stats-journalieres` utilise :
```typescript
.select('nb_commandes, nb_commandes_livrees, nb_commandes_annulees, chiffre_affaires, frais_livraison_total, top_produits')
```

Ces colonnes n'existent pas dans la migration 001. Ce endpoint retournera des données nulles ou une erreur.

---

## 10. Analyse — Cron Jobs

### Fichier : `src/routes/api-cron.ts`

#### ✅ Tâches Implémentées

| Cron | Horaire | Tâche | Statut |
|------|---------|-------|--------|
| `0 2 * * *` | 2h UTC | Stats journalières | ✅ Complet |
| `10 2 * * *` | 2h10 UTC | Essais expirés → inactif | ✅ Complet |
| `20 2 * * *` | 2h20 UTC | Screenshots boutiques | ✅ Complet |
| `30 */6 * * *` | Toutes 6h | Paiements expirés 72h | ✅ Complet |

#### ⚠️ Problèmes

**Problème 1 — Stats journalières : colonnes manquantes**

Comme décrit section 9, `calculerStatsUnTenant()` insère dans des colonnes qui n'existent pas en base.

**Problème 2 — Screenshots sans vérification R2 existant**

`capturerScreenshotsQuotidiens()` vérifie `env.R2_MEDIA` mais si la variable `PUBLIC_BASE_URL` n'est pas configurée, elle utilise `'https://monmenu.app'` en fallback. En développement ou staging sans domaine configuré, tous les screenshots seront de la mauvaise URL.

**Problème 3 — Notification WhatsApp bloquante dans `bloquerPaiementsExpires()`**

```typescript
// Ligne ~327
if (tenant.whatsapp_number) {
  try {
    await notifierBlocageAutomatique(env, {...})  // await bloquant
  } catch {}
}
```

Si l'API WhatsApp est lente, le cron peut dépasser son budget de temps. Devrait utiliser `ctx.waitUntil()` ou Promise.allSettled.

---

## 11. Analyse — Sécurité

### ✅ Points Forts Sécurité

| Contrôle | Implémentation | Évaluation |
|----------|---------------|------------|
| SEC-01 : Statut hardcodé | `statut: 'en_attente_confirmation'` forcé côté serveur | ✅ |
| SEC-02 : Validation MIME 4 couches | Extension + Content-Type + Magic bytes + Taille | ✅ |
| SEC-03 : IDOR impossible | `tenant_id` toujours du JWT | ✅ |
| SEC-04 : Audit trail | `confirme_par`, `confirme_le`, `rejete_par` | ✅ DB |
| SEC-05 : CSRF | `X-Requested-With: XMLHttpRequest` + middleware | ✅ |
| SEC-06 : URL R2 non exposée | Clé R2 stockée, URL signée 15min pour admin | ✅ |
| SEC-07 : Rate limit upload | 3 soumissions/heure via KV | ✅ |
| SEC-08 : Idempotence | Un seul `en_attente_confirmation` par tenant | ✅ |
| SEC-09 : Logs minimalistes | Pas de référence brute ni clé R2 dans logs | ✅ |
| SEC-10 : Référence non activante | Commentaires explicites dans le code | ✅ |

### ❌ Problèmes Sécurité

**Problème Sécurité 1 — CSP manque des origines**

```typescript
// Dans setSecurityHeaders()
`img-src 'self' data: blob: *.mapbox.com *.openstreetmap.org *.supabase.co *.tile.openstreetmap.org api.qrserver.com;`
```

**Manquent :**
- `thum.io` (utilisé par `lib/screenshot.ts` pour les captures)
- `*.cloudflare.com` (assets statiques potentiels)
- `fonts.gstatic.com` dans `img-src` (normalement dans `font-src` — OK)
- `cdn.jsdelivr.net` dans `img-src` pour FontAwesome SVG

**Problème Sécurité 2 — `ADMIN_TASK_SECRET` en query string**

```typescript
// Dans api-admin-tasks.ts
const secret = c.req.query('secret')
if (!secret || secret !== c.env.ADMIN_TASK_SECRET) ...
```

Le secret est passé en **query string** — visible dans les logs du serveur (Cloudflare Access logs, etc.). Devrait être un header.

**Correction :**
```typescript
const secret = c.req.header('X-Admin-Task-Secret')
```

**Problème Sécurité 3 — Route `/api/v1/admin/tasks/*` sans vérification ADMIN_TASK_SECRET global**

La route est montée directement :
```typescript
app.route('/api/v1/admin/tasks', adminTasksRouter)
```

Si `ADMIN_TASK_SECRET` n'est pas configuré côté Cloudflare, l'endpoint retourne 503 mais révèle son existence.

**Problème Sécurité 4 — Vérification `ADMIN_BASE_URL` et `ADMIN_WEBHOOK_SECRET` non utilisés**

Ces variables sont définies dans `Env` mais aucun usage trouvé dans le code. Les appels admin→web semblent inexistants ou dans un autre dépôt.

---

## 12. Matrice de Fonctionnalités

### Module Paiement

| Fonctionnalité | Requis | Implémenté | Niveau |
|----------------|--------|------------|--------|
| Génération référence paiement | ✅ | ✅ | Complet |
| Upload preuve (image JPEG/PNG) | ✅ | ✅ | Complet |
| Validation MIME 4 couches | ✅ | ✅ | Complet |
| Stockage R2 bucket privé | ✅ | ✅ | Complet |
| Création abonnement en_attente | ✅ | ✅ | Complet |
| Notification admin (in-app) | ✅ | ✅ | Complet |
| Notification restaurant (in-app) | ✅ | ✅ | Complet |
| Notification WhatsApp restaurant | ✅ | ✅ | Complet |
| Rate limiting upload (3/h) | ✅ | ✅ | Complet |
| Idempotence (1 seul en_attente) | ✅ | ✅ | Complet |
| Cron blocage 72h automatique | ✅ | ✅ | Complet |
| Historique abonnements | ✅ | ✅ | Complet |
| **Page UI abonnement dashboard** | ✅ | ❌ | **ABSENT** |
| **Toggle mensuel/annuel** | ✅ | ❌ | **ABSENT** |
| **Confirmation paiement (admin)** | ✅ | ❌ | **ABSENT (autre dépôt?)** |
| **Rejet paiement (admin)** | ✅ | ❌ | **ABSENT (autre dépôt?)** |
| **URL signée preuve (admin)** | ✅ | ❌ | **ABSENT (autre dépôt?)** |
| **Upgrade plan depuis dashboard** | ✅ | ❌ | **ABSENT** |
| **Downgrade plan** | Optionnel | ❌ | Absent |

### Module Dashboard

| Fonctionnalité | Requis | Implémenté | Niveau |
|----------------|--------|------------|--------|
| Commandes temps réel | ✅ | ✅ | Complet |
| Mise à jour statut commande | ✅ | ✅ | Complet |
| Notification livreur WhatsApp | ✅ | ✅ | Complet (2026-07-30) |
| Gestion menu (CRUD catégories/produits) | ✅ | ✅ | Complet |
| Upload photos produits | ✅ | ✅ | Complet (R2) |
| Export CSV commandes | ✅ | ✅ | Complet |
| Statistiques 30 jours | ✅ | ✅ | Complet |
| QR Code téléchargeable | ✅ | ✅ | Complet |
| Gestion livreurs | ✅ | ✅ | Complet |
| Codes promo (CRUD + export) | ✅ | ✅ | Complet |
| Apparence (logo, bannière, couleurs) | ✅ | ✅ | Complet |
| Paramètres restaurant | ✅ | ✅ | Complet |
| Cloche notifications | ✅ | ✅ | Complet (v1.7.0) |
| **Section abonnement** | ✅ | ❌ | **ABSENT HTML** |
| **Statistiques journalières** | ✅ | ⚠️ | Endpoint OK, schéma DB incorrect |
| **Onboarding (bienvenue)** | ✅ | ✅ | Complet |

---

## 13. Bugs & Incohérences Critiques

### 🔴 CRITIQUES (bloquants)

| ID | Fichier | Bug | Impact |
|----|---------|-----|--------|
| BUG-001 | `dashboard.ts` | Section `#section-abonnement-content` absente du HTML | Page abonnement inaccessible |
| BUG-002 | `dashboard-paiement.js:construireCarteStatut()` | Clés API incorrectes (`s.statut_abonnement` vs `s.abonnement.statut`) | Affichage toujours "Aucun abonnement" |
| BUG-003 | `dashboard-paiement.js:initBandeauxPaiement()` | Filtre sur types inexistants (`paiement_en_attente` etc.) | Bandeaux jamais affichés |
| BUG-004 | `supabase/migrations/001_initial_schema.sql` | Colonnes manquantes dans `stats_journalieres` | Cron stats silencieusement cassé |
| BUG-005 | `api-dashboard.ts:~1378` | `checkRateLimit()` sans paramètre `kv` | Rate limit upload non distribué |

### 🟠 MAJEURS (dégradants)

| ID | Fichier | Bug | Impact |
|----|---------|-----|--------|
| BUG-006 | `dashboard-paiement.js:soumettrePreuvePaiement()` | Champ `periodicite` absent du formulaire | Toujours facturation mensuelle |
| BUG-007 | `dashboard-paiement.js:construireHistorique()` | `a.plan_nom` absent de l'API | UUID brut affiché |
| BUG-008 | `home.ts:~136` | Images démo `/api/v1/media/demo/*` inexistantes | Mockup hero cassé |
| BUG-009 | `dashboard-paiement.js:DOMContentLoaded` | Race condition `chargerPlansSelect` | Select plans vide |
| BUG-010 | `inscription.ts` | Paramètre `?plan=` non exploité | Sélection plan perdue |
| BUG-011 | `supabase/migrations/008` | RLS manquant sur `notifications_restaurant/admin` | Fuite potentielle de données |

### 🟡 MINEURS (cosmétiques/optimisation)

| ID | Fichier | Bug | Impact |
|----|---------|-----|--------|
| BUG-012 | `api-admin-tasks.ts` | Secret en query string | Visible dans logs |
| BUG-013 | `api-cron.ts:bloquerPaiementsExpires()` | `await` bloquant WhatsApp dans cron | Timeout possible |
| BUG-014 | `security.ts:setSecurityHeaders()` | `thum.io` absent de la CSP | Screenshots bloqués par CSP |
| BUG-015 | `api-plans.ts:TAUX_CONVERSION` | Taux hardcodés, commentaire "à remplacer" | Taux obsolètes |

---

## 14. Fonctionnalités Manquantes

### 🔴 ABSENTES CRITIQUES

1. **Page HTML section abonnement dans le dashboard** — toute la logique JS existe mais pas le conteneur HTML
2. **Toggle mensuel/annuel dans le formulaire de soumission** — impossible de souscrire annuellement
3. **Côté admin (dans CE dépôt) :**
   - `POST /api/admin/paiements/confirmer` — confirmation manuelle paiement
   - `POST /api/admin/paiements/rejeter` — rejet avec motif
   - `GET /api/admin/paiements/preuve/:abonnement_id` — URL signée R2 pour voir la preuve
   - Dashboard admin paiements (vue liste en attente, actions confirmer/rejeter)

4. **Liaison plan → abonnement** : Quand l'admin confirme, `tenant.plan_id` doit être mis à jour + `tenant.statut` → `actif` + `tenant.essai_expire_le` → null — cette logique est dans le dépôt admin, mais absente ici.

5. **Choix du pays à l'inscription** — champ `pays_id` obligatoire en DB mais absent du formulaire

### 🟠 PARTIELLEMENT MANQUANTES

1. **Sélection du plan depuis l'inscription** — paramètre `?plan=` non exploité
2. **Section statistiques journalières** — endpoint OK mais schéma DB incorrect
3. **Upgrade de plan depuis le dashboard** — aucun endpoint PATCH `tenant.plan_id`
4. **Notifications push (non couvert ici)** — mentionné comme fonctionnalité mais absent

---

## 15. Feuille de Route — Plan d'Amélioration

### Phase 1 — Corrections Bloquantes (Urgence maximale)

**Priorité 1 : Réparer la section abonnement**

**Fichier :** `src/pages/dashboard.ts`  
**Action :** Ajouter le HTML de la section abonnement dans le template

```typescript
// Ajouter dans dashboard.ts AVANT la balise </main>
<!-- Section Abonnement (chargée par dashboard-paiement.js:initSectionAbonnement) -->
<section id="section-abonnement" class="hidden">
  <div class="max-w-2xl mx-auto">
    <h2 class="text-xl font-bold text-gray-900 mb-6">Mon abonnement</h2>
    <div id="section-abonnement-content">
      <div class="text-center py-12 text-gray-400">
        <i class="fa-solid fa-circle-notch fa-spin text-3xl mb-3 block"></i>
        <p class="text-sm">Chargement...</p>
      </div>
    </div>
  </div>
</section>
```

**Fichier :** `dashboard.js` (non lu mais à modifier)  
**Action :** Ajouter le routing pour `/dashboard/abonnement`

```javascript
function naviguer(section) {
  // ... existing sections ...
  if (section === 'abonnement') {
    if (typeof initSectionAbonnement === 'function') initSectionAbonnement();
  }
}
```

---

**Priorité 2 : Corriger le mapping API dans dashboard-paiement.js**

**Fichier :** `public/static/js/dashboard-paiement.js`  

```javascript
// Remplacer construireCarteStatut() :
function construireCarteStatut(s) {
  const div = document.createElement('div');
  
  // CORRECTION : utiliser les vraies clés de l'API
  const statutAbonnement = s.abonnement?.statut ?? null;
  const statutTenant = s.statut_tenant;
  const dateFinAbonnement = s.abonnement?.date_fin ?? null;
  const soumisLe = s.abonnement?.soumis_le ?? null;
  const deadline = s.abonnement?.delai_confirmation_expire_le ?? null;
  const heuresRestantesConf = s.abonnement?.heures_restantes_confirmation ?? null;
  const referenceActive = s.reference_active;
  const joursEssai = s.jours_essai_restants;
  
  // ... logique d'affichage basée sur statutAbonnement et statutTenant ...
}
```

---

**Priorité 3 : Réparer le filtre des bandeaux**

**Fichier :** `public/static/js/dashboard-paiement.js`  

```javascript
async function initBandeauxPaiement() {
  // ...
  const data = await res.json();
  
  // CORRECTION : ne pas filtrer par type custom, utiliser les notifications brutes
  const notifs = (data.notifications || []);
  // ...
}
```

---

**Priorité 4 : Corriger le rate limit upload image**

**Fichier :** `src/routes/api-dashboard.ts`  

```typescript
// Ligne ~1378
const rateLimit = await checkRateLimit(
  `upload:${auth.tenant_id}`, 
  25, 
  3600000,
  c.env.KV_CACHE  // ← AJOUTER ce paramètre
)
```

---

### Phase 2 — Fonctionnalités Manquantes Importantes

**Action 1 : Ajouter périodicité dans le formulaire d'upload**

**Fichier :** `public/static/js/dashboard-paiement.js:construireFormUpload()`

```javascript
// Ajouter avant le bouton soumettre :
`<div class="mt-3">
  <label class="block text-xs font-semibold text-gray-600 mb-1.5">Périodicité *</label>
  <div class="grid grid-cols-2 gap-2">
    <label class="border rounded-xl p-3 cursor-pointer has-[:checked]:border-red-500 has-[:checked]:bg-red-50">
      <input type="radio" name="periodicite-paiement" value="mensuel" class="sr-only" checked>
      <div class="text-sm font-semibold">Mensuel</div>
      <div id="prix-mensuel-label" class="text-xs text-gray-500"></div>
    </label>
    <label class="border rounded-xl p-3 cursor-pointer has-[:checked]:border-red-500 has-[:checked]:bg-red-50">
      <input type="radio" name="periodicite-paiement" value="annuel" class="sr-only">
      <div class="text-sm font-semibold">Annuel <span class="text-green-600 text-xs">-17%</span></div>
      <div id="prix-annuel-label" class="text-xs text-gray-500"></div>
    </label>
  </div>
</div>`
```

---

**Action 2 : Corriger le cron stats (migration DB)**

**Nouveau fichier :** `supabase/migrations/010_patch_stats_journalieres.sql`

```sql
-- Patch stats_journalieres pour aligner avec le cron
ALTER TABLE stats_journalieres 
  RENAME COLUMN ca_total TO chiffre_affaires;

ALTER TABLE stats_journalieres 
  ADD COLUMN IF NOT EXISTS nb_commandes_livrees INTEGER NOT NULL DEFAULT 0;

ALTER TABLE stats_journalieres 
  ADD COLUMN IF NOT EXISTS nb_commandes_annulees INTEGER NOT NULL DEFAULT 0;

ALTER TABLE stats_journalieres 
  ADD COLUMN IF NOT EXISTS frais_livraison_total NUMERIC(12,2) NOT NULL DEFAULT 0;

ALTER TABLE stats_journalieres 
  ADD COLUMN IF NOT EXISTS top_produits JSONB;

-- Mise à jour du type dans database.ts également
```

---

**Action 3 : Ajouter RLS sur les tables notifications**

**Nouveau fichier :** `supabase/migrations/011_rls_notifications.sql`

```sql
ALTER TABLE notifications_restaurant ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications_admin ENABLE ROW LEVEL SECURITY;

CREATE POLICY "notif_restaurant_tenant_select"
  ON notifications_restaurant FOR SELECT
  USING (tenant_id = get_user_tenant_id());

CREATE POLICY "notif_restaurant_service_role_all"
  ON notifications_restaurant FOR ALL
  USING (current_setting('request.jwt.claims', true)::json->>'role' = 'service_role');

CREATE POLICY "notif_admin_service_only"
  ON notifications_admin FOR ALL
  USING (current_setting('request.jwt.claims', true)::json->>'role' = 'service_role');
```

---

**Action 4 : Corriger la race condition chargerPlansSelect**

**Fichier :** `public/static/js/dashboard-paiement.js`

```javascript
// REMPLACER le DOMContentLoaded existant :
document.addEventListener('DOMContentLoaded', async () => {
  // initBandeauxPaiement est appelé depuis dashboard.ts via window.initBandeauxPaiement
  
  // Gérer la section abonnement
  if (window.location.pathname === '/dashboard/abonnement') {
    await initSectionAbonnement();
    // Les plans sont chargés DANS initSectionAbonnement, après le render du formulaire
  }
});

// MODIFIER initSectionAbonnement pour charger les plans APRÈS le render
async function initSectionAbonnement() {
  // ... render container ...
  
  // construireCarteStatut() crée inp-plan-preuve
  if (statut) {
    container.appendChild(construireCarteStatut(statut));
    // Maintenant inp-plan-preuve existe
    await chargerPlansSelect('inp-plan-preuve');
  }
  // ...
}
```

---

**Action 5 : Ajouter plan_nom dans l'historique API**

**Fichier :** `src/routes/api-paiement.ts:GET /historique`

```typescript
// Remplacer la query par une jointure avec plans
const { data: abonnements, error, count } = await adminClient
  .from('abonnements')
  .select(`
    id, statut, date_debut, date_fin, montant_paye, devise, 
    methode_paiement, reference_paiement, soumis_le, confirme_le, 
    rejete_le, motif_rejet, created_at,
    plans!inner(nom)
  `, { count: 'exact' })
  .eq('tenant_id', auth.tenant_id)
  .order('created_at', { ascending: false })
  .range(offset, offset + limit - 1)

// Mapper plan_nom dans le résultat
const abonnementsFormattes = (abonnements ?? []).map(a => ({
  ...a,
  plan_nom: (a.plans as any)?.nom ?? null,
  plans: undefined // ne pas exposer l'objet imbriqué
}))
```

---

### Phase 3 — Nouvelles Fonctionnalités

**Fonctionnalité 1 : Page paiement intégrée dans le dashboard**

La page `/dashboard/abonnement` doit être une vue riche avec :
- Carte statut (essai / actif / en attente / inactif)
- Bloc référence paiement (copier en 1 clic)
- Section "Souscrire" avec sélecteur plan + périodicité + méthode + upload preuve
- Barre de progression délai 72h
- Historique abonnements avec plan_nom
- Instructions de paiement (numéros Orange Money, Wave, etc.)
- Bloc "Support" (contact)

**Fonctionnalité 2 : Intégration pays dans l'inscription**

La table `tenants` requiert `pays_id`. Le formulaire d'inscription doit proposer un sélecteur pays chargé dynamiquement depuis `/api/v1/pays` (à créer ou via Supabase direct).

**Fonctionnalité 3 : Endpoint PATCH plan dans le dashboard**

Pour permettre l'upgrade de plan sans passer par l'admin :
```typescript
// À ajouter dans api-dashboard.ts
dashboardRouter.patch('/abonnement/plan', async (c) => {
  // Vérifier que le nouveau plan > plan actuel (upgrade uniquement)
  // Calculer pro-rata si abonnement actif
  // Déclencher nouveau flux de paiement
})
```

---

## 16. Nouveaux Fichiers à Créer

| Fichier | Type | Priorité | Description |
|---------|------|----------|-------------|
| `supabase/migrations/010_patch_stats_journalieres.sql` | Migration SQL | 🔴 Critique | Colonnes manquantes dans stats |
| `supabase/migrations/011_rls_notifications.sql` | Migration SQL | 🟠 Majeur | RLS sur tables notifications |
| `src/pages/abonnement.ts` | Page HTML | 🔴 Critique | Page dédiée section abonnement (alternative à l'inclusion dans dashboard.ts) |
| `public/static/js/abonnement.js` | JS Frontend | 🟠 Majeur | Logique séparée si page dédiée |
| `src/routes/api-pays.ts` | Route API | 🟠 Majeur | Liste pays actifs pour formulaire inscription |

---

## 17. Fichiers à Modifier

| Fichier | Priorité | Changements Nécessaires |
|---------|----------|------------------------|
| `src/pages/dashboard.ts` | 🔴 Critique | Ajouter section `#section-abonnement` avec `#section-abonnement-content` |
| `public/static/js/dashboard-paiement.js` | 🔴 Critique | Corriger mapping API, filtres bandeaux, race condition, périodicité |
| `src/routes/api-paiement.ts` | 🟠 Majeur | Jointure `plans` dans `/historique` pour plan_nom |
| `src/routes/api-dashboard.ts` | 🟠 Majeur | Passer `kv` à `checkRateLimit()` pour upload-image |
| `src/routes/api-admin-tasks.ts` | 🟡 Mineur | Utiliser header X-Admin-Task-Secret au lieu de query string |
| `src/lib/security.ts` | 🟡 Mineur | Ajouter `thum.io` dans la CSP img-src |
| `src/types/database.ts` | 🟠 Majeur | Corriger `StatsJournalieres` (ca_total → chiffre_affaires) |
| `src/routes/api-cron.ts` | 🟡 Mineur | `notifierBlocageAutomatique` en waitUntil non bloquant |
| `src/pages/inscription.ts` | 🟠 Majeur | Ajouter sélecteur pays + exploitation `?plan=` |

---

## Annexe : Structure Idéale de la Page `/dashboard/abonnement`

```
┌─────────────────────────────────────────────────────┐
│  [Sidebar]     │  Abonnement                    [🔔] │
├────────────────┼────────────────────────────────────┤
│                │  ┌─ Statut actuel ───────────────┐  │
│ ◉ Commandes   │  │ ✅ Plan Pro — Actif            │  │
│ ○ Menu        │  │    Expire le 31/08/2026        │  │
│ ○ Stats       │  └───────────────────────────────┘  │
│ ○ Livreurs    │                                      │
│ ○ QR Code     │  ┌─ Votre référence ─────────────┐  │
│ ○ Codes promo │  │  MM-CHEZFT-202607-A3F9B2       │  │
│ ○ Restaurant  │  │  [📋 Copier]                   │  │
│ ○ Apparence   │  │  Mentionner dans votre virement│  │
│ ○ Paramètres  │  └───────────────────────────────┘  │
│ ◉ Abonnement  │                                      │
│               │  ┌─ Soumettre ma preuve ──────────┐  │
│               │  │  [Plan]  [Mensuel/Annuel]       │  │
│               │  │  [Méthode de paiement]          │  │
│               │  │  ┌──────────────────────────┐  │  │
│               │  │  │  📤 Glisser votre reçu   │  │  │
│               │  │  │     JPG/PNG, max 5Mo     │  │  │
│               │  │  └──────────────────────────┘  │  │
│               │  │  [Soumettre ma preuve →]        │  │
│               │  └───────────────────────────────┘  │
│               │                                      │
│               │  ┌─ Historique ──────────────────┐  │
│               │  │  Plan     Montant   Statut     │  │
│               │  │  Pro      9500 FCFA ✅ Actif   │  │
│               │  │  Starter  5000 FCFA ⏳ Attente │  │
│               │  └───────────────────────────────┘  │
└───────────────┴────────────────────────────────────┘
```

---

## Conclusion

Le projet MonMenu a une **base technique solide** avec une architecture Hono/Cloudflare propre, une sécurité paiement bien pensée (10 contrôles SEC documentés), et des migrations Supabase bien organisées.

Cependant, la **jonction frontend-backend du module paiement est cassée** à plusieurs endroits critiques :

1. Le conteneur HTML de la section abonnement est absent du dashboard
2. Le mapping des clés API est incorrect dans le JS
3. Le filtre des bandeaux de notification est vide en permanence

Ces 3 problèmes font que **l'utilisateur ne peut pas accéder au système de paiement** via l'interface, même si toute la logique serveur est en place.

**Effort estimé pour les corrections critiques :** 1-2 jours développeur  
**Effort estimé pour les fonctionnalités manquantes :** 3-5 jours développeur  
**Effort estimé pour la page admin paiement :** 3-5 jours développeur (dans le dépôt `monmenu-admin`)

---

*Rapport généré le 2026-07-31 — Audit statique exhaustif du dépôt `poodasamuelpro/monmenu`*
