# AUDIT COMPLET — ESPACE ADMIN & APPLICATION WEB MonMenu
## Rapport d'architecture, sécurité, fonctionnalités et restructuration

> **Dépôts audités** :  
> - `https://github.com/poodasamuelpro/monmenu-admin` (tableau de bord administrateur)  
> - `https://github.com/poodasamuelpro/monmenu` (application web publique + dashboard restaurant)  
> **Référentiel** : Cahier des charges technique et fonctionnel `Cahier_des_charges_MonMenu.docx`  
> **Date de l'audit** : 2026-07-29  
> **Auditeur** : Expert backend/architecture logicielle — rôle auditeur senior  
> **Méthodologie** : Lecture intégrale ligne par ligne des deux dépôts + comparaison exhaustive avec le CDC  

---

## SOMMAIRE

1. [Résumé exécutif](#1-résumé-exécutif)
2. [Cartographie complète du dépôt Admin](#2-cartographie-complète-du-dépôt-admin-monmenu-admin)
3. [Cartographie complète du dépôt WebApp](#3-cartographie-complète-du-dépôt-webapp-monmenu)
4. [Risques identifiés — Sécurité](#4-risques-identifiés--sécurité)
5. [Analyse CRUD sécurisé](#5-analyse-crud-sécurisé)
6. [État du module Blog](#6-état-du-module-blog)
7. [Gestion des paiements et forfaits](#7-gestion-des-paiements-et-forfaits)
8. [Comparaison fonctionnelle avec le CDC](#8-comparaison-fonctionnelle-avec-le-cdc)
9. [Arborescence cible recommandée — Admin](#9-arborescence-cible-recommandée--admin)
10. [Plan de migration](#10-plan-de-migration)
11. [Fonctionnalités à implémenter en priorité](#11-fonctionnalités-à-implémenter-en-priorité)
12. [Recommandations priorisées](#12-recommandations-priorisées)

---

## 1. RÉSUMÉ EXÉCUTIF

### Tableau de synthèse

| Critère | Admin (`monmenu-admin`) | WebApp (`monmenu`) |
|---------|------------------------|-------------------|
| **Structure du code** | 🔴 Monolithique — 2 fichiers | 🟢 Bien structurée — séparation des responsabilités |
| **Sécurité authentification** | 🔴 Critique — route `/api/admin/auth/login` ABSENTE | 🟢 Solide (cookie httpOnly, CSRF, rate limit) |
| **CRUD sécurisé** | 🟡 Partiel — filtre sur champs, pas de validation Zod | 🟢 Complet avec Zod, rate limiting, idempotency |
| **Module Blog** | 🔴 Absent dans l'admin | 🟢 Présent dans la webapp (API + pages) |
| **Gestion paiements/forfaits** | 🟡 Lecture/modification prix uniquement | 🟡 Abonnements présents en DB, logique manquante |
| **Conformité CDC** | 🟡 ~35% des fonctionnalités admin requises | 🟢 ~70% du périmètre public |
| **Urgence de restructuration** | 🔴 HAUTE — déploiement bloquant en prod | 🟡 MOYENNE — améliorations progressives |

### Conclusion principale

**Le dépôt `monmenu-admin` est dans un état critique et non déployable en production sécurisée.** Le fichier `src/index.tsx` (399 lignes) mélange dans un seul fichier : les routes API, le HTML de la SPA, les middlewares et la logique business. La vulnérabilité la plus grave est **l'absence totale de la route `/api/admin/auth/login`** : le frontend appelle cette route pour authentifier l'administrateur, mais elle n'existe pas côté serveur. Le KV ne peut donc jamais stocker de session valide, rendant l'espace admin inaccessible ou bypassable.

**Le dépôt `monmenu` (webapp) est bien structuré** avec une séparation claire des responsabilités (routes, pages, lib, middleware, i18n). Des audits antérieurs existent (AUDIT-01-I18N, AUDIT-02-SEO) mais les corrections identifiées n'ont pas encore été appliquées. Des fonctionnalités métier importantes restent à implémenter : gestion complète des abonnements, confirmation de paiement, tableau de bord paiements dans l'admin, gestion des newsletter subscribers.

---

## 2. CARTOGRAPHIE COMPLÈTE DU DÉPÔT ADMIN (`monmenu-admin`)

### 2.1 Structure actuelle

```
monmenu-admin/
├── src/
│   └── index.tsx          ← FICHIER MONOLITHIQUE (399 lignes)
├── public/
│   └── static/js/
│       └── admin.js       ← SPA JavaScript client (206 lignes)
├── package.json
├── tsconfig.json
├── vite.config.ts
├── wrangler.jsonc
└── .gitignore
```

**Total : 2 fichiers de code significatifs. Aucune séparation des responsabilités.**

### 2.2 Contenu bloc par bloc de `src/index.tsx`

| Lignes | Bloc | Responsabilité |
|--------|------|----------------|
| 1–18 | Déclarations types `AdminEnv` | Types Cloudflare Worker |
| 19–22 | Route `GET /robots.txt` | SEO/sécurité |
| 23–24 | `serveStatic` | Fichiers statiques |
| 26–41 | Middleware auth `/api/*` | **Authentification (incomplet — voir §4.1)** |
| 43–80 | `GET /api/admin/tenants` | API : liste tenants |
| 81–100 | `GET /api/admin/tenants/:id` | API : détail tenant |
| 101–127 | `PATCH /api/admin/tenants/:id` | API : modifier tenant |
| 128–165 | `GET /api/admin/stats` | API : statistiques globales |
| 166–185 | `GET /api/admin/plans` | API : liste plans |
| 186–211 | `PATCH /api/admin/plans/:id` | API : modifier plan |
| 212–234 | `PATCH /api/admin/config/:cle` | API : config globale |
| 235–239 | Route fallback `*` | Rendu SPA |
| 240–399 | Fonction `renderAdminApp()` | **HTML complet de la SPA injecté dans le Worker** |

### 2.3 Contenu de `public/static/js/admin.js`

| Lignes | Fonction | Rôle |
|--------|----------|------|
| 1–53 | `adminLogin()` | Appel POST `/api/admin/auth/login` (route inexistante) |
| 54–65 | `adminLogout()` | Suppression sessionStorage |
| 66–95 | `showSection()` | Navigation SPA |
| 96–104 | `getHeaders()` | Headers Authorization |
| 105–121 | `loadDashboardStats()` | Fetch stats |
| 122–155 | `loadTenants()` | Fetch + rendu liste restaurants |
| 156–163 | `changerStatutTenant()` | PATCH statut |
| 164–196 | `loadPlans()` | Fetch + rendu plans |
| 197–200 | `updatePlan()` | PATCH plan |
| 201–217 | `sauvegarderConfig()` | PATCH config |
| 218–221 | `esc()` | Échappement HTML |
| 223–231 | `DOMContentLoaded` | Auto-login depuis sessionStorage |

---

## 3. CARTOGRAPHIE COMPLÈTE DU DÉPÔT WEBAPP (`monmenu`)

### 3.1 Structure actuelle

```
monmenu/
├── src/
│   ├── index.tsx              # Point d'entrée principal (609 lignes)
│   ├── index.ts               # Doublon quasi-identique (574 lignes) ⚠️
│   ├── renderer.tsx           # Renderer JSX Hono
│   ├── types/
│   │   └── database.ts        # Types TypeScript DB
│   ├── lib/
│   │   ├── brevo.ts           # Envoi emails (rotation clés)
│   │   ├── constants.ts       # Constantes (ESSAI_DUREE_JOURS...)
│   │   ├── delivery.ts        # Calcul livraison (Haversine + météo)
│   │   ├── screenshot.ts      # Capture screenshot via thum.io → R2
│   │   ├── security.ts        # CSRF, rate limiting, Zod, CSP headers
│   │   ├── supabase.ts        # Clients Supabase (anon, admin, token)
│   │   └── whatsapp.ts        # API WhatsApp Business Cloud
│   ├── middleware/
│   │   └── auth.ts            # Middleware JWT Supabase réutilisable
│   ├── routes/
│   │   ├── api-auth.ts        # Auth : login, register, logout, refresh (493 lignes)
│   │   ├── api-blog.ts        # Blog : CRUD articles + admin (124 lignes)
│   │   ├── api-commandes.ts   # Commandes : create, suivi, statut (516 lignes)
│   │   ├── api-cron.ts        # Cron Workers : stats, essais, screenshots (280 lignes)
│   │   ├── api-dashboard.ts   # Dashboard restaurant : menu, stats, profil... (1542 lignes)
│   │   ├── api-livraison.ts   # Calcul frais livraison (63 lignes)
│   │   ├── api-newsletter.ts  # Newsletter : inscription (35 lignes)
│   │   ├── api-plans.ts       # Plans : liste avec conversion devise (96 lignes)
│   │   ├── api-screenshots.ts # Screenshots R2 (49 lignes)
│   │   └── api-tenants.ts     # Tenants : liste publique + menu (330 lignes)
│   ├── pages/
│   │   ├── article.ts         # Page article de blog
│   │   ├── auth.ts            # Pages connexion / création de compte
│   │   ├── bienvenue.ts       # Onboarding restaurant
│   │   ├── blog.ts            # Liste articles blog
│   │   ├── boutique.ts        # Boutique restaurant (client final)
│   │   ├── cgu.ts             # CGU
│   │   ├── compte-inactif.ts  # Page essai expiré
│   │   ├── confidentialite.ts # Politique de confidentialité
│   │   ├── contact.ts         # Page contact
│   │   ├── cookies.ts         # Politique cookies
│   │   ├── dashboard.ts       # Dashboard restaurant (SPA)
│   │   ├── forgot-password.ts # Mot de passe oublié
│   │   ├── home.ts            # Page d'accueil
│   │   ├── inscription.ts     # Inscription restaurant
│   │   ├── legal.ts           # Pages légales (routeur)
│   │   ├── mentions.ts        # Mentions légales
│   │   ├── not-found.ts       # 404
│   │   ├── suivi.ts           # Suivi commande
│   │   └── tarifs.ts          # Page tarifs
│   ├── i18n/
│   │   ├── fr.json            # 200+ clés FR
│   │   ├── en.json            # 200+ clés EN
│   │   └── index.ts           # Helpers i18n
│   └── components/
│       ├── head.ts            # <head> SEO complet
│       ├── nav.ts             # Navigation
│       └── footer.ts          # Pied de page
├── public/static/
│   ├── css/
│   │   ├── main.css
│   │   └── styles.css
│   ├── img/                   # 5 images statiques (manque og-image.png)
│   └── js/
│       ├── boutique.js        # Panier / commande client (496 lignes)
│       ├── dashboard.js       # SPA dashboard restaurant
│       └── main.js            # Scripts page accueil
├── supabase/migrations/       # 7 migrations Supabase
├── migrations/                # 2 migrations D1 Cloudflare
├── audits/                    # Audits existants (i18n, dark mode, SEO)
├── wrangler.jsonc
├── package.json
└── ecosystem.config.cjs       # PM2 config
```

### 3.2 Routes API disponibles dans la webapp

| Route | Méthode | Auth | Description |
|-------|---------|------|-------------|
| `/api/v1/auth/register` | POST | ❌ | Inscription restaurant |
| `/api/v1/auth/login` | POST | ❌ | Connexion restaurant |
| `/api/v1/auth/logout` | POST | ✅ Cookie/Bearer | Déconnexion |
| `/api/v1/auth/refresh` | POST | ✅ | Refresh token |
| `/api/v1/tenants` | GET | ❌ | Liste publique restaurants |
| `/api/v1/tenants/:slug/menu` | GET | ❌ | Menu public restaurant |
| `/api/v1/tenants/:slug/categories` | GET | ❌ | Catégories menu |
| `/api/v1/tenants/:id/qrcode` | GET | ❌ | QR code public |
| `/api/v1/commandes` | POST | ❌ | Créer commande |
| `/api/v1/commandes/suivi/:token` | GET | ❌ | Suivi commande |
| `/api/v1/commandes/:id/statut` | PATCH | ✅ | Maj statut |
| `/api/v1/commandes/valider-promo` | POST | ❌ | Valider code promo |
| `/api/v1/livraison/calcul` | POST | ❌ | Calcul frais livraison |
| `/api/v1/plans` | GET | ❌ | Liste plans (avec devise) |
| `/api/v1/blog` | GET | ❌ | Liste articles publiés |
| `/api/v1/blog/:slug` | GET | ❌ | Article publié |
| `/api/v1/blog/admin` | POST | ✅ Platform | Créer article |
| `/api/v1/blog/admin/:id` | PUT | ✅ Platform | Modifier article |
| `/api/v1/blog/admin/:id` | DELETE | ✅ Platform | Supprimer article |
| `/api/v1/newsletter` | POST | ❌ | Inscription newsletter |
| `/api/v1/dashboard/commandes` | GET | ✅ | Commandes restaurant |
| `/api/v1/dashboard/commandes/:id/statut` | PATCH | ✅ | Statut commande |
| `/api/v1/dashboard/commandes/export-csv` | GET | ✅ | Export CSV |
| `/api/v1/dashboard/stats` | GET | ✅ | Statistiques |
| `/api/v1/dashboard/stats-journalieres` | GET | ✅ | Stats historique |
| `/api/v1/dashboard/menu` | GET | ✅ | Menu complet |
| `/api/v1/dashboard/categories` | POST/PATCH/DELETE | ✅ | CRUD catégories |
| `/api/v1/dashboard/produits` | POST/PATCH/DELETE | ✅ | CRUD produits |
| `/api/v1/dashboard/livreurs` | GET/POST/PATCH/DELETE | ✅ | CRUD livreurs |
| `/api/v1/dashboard/pdv` | GET/PATCH | ✅ | Points de vente |
| `/api/v1/dashboard/apparence` | PATCH | ✅ | Couleurs/logo |
| `/api/v1/dashboard/parametres` | PATCH | ✅ | Paramètres restaurant |
| `/api/v1/dashboard/profil` | GET | ✅ | Profil restaurateur |
| `/api/v1/dashboard/profil/change-password` | POST | ✅ | Changer mot de passe |
| `/api/v1/dashboard/codes-promo` | GET/POST/DELETE | ✅ | CRUD codes promo |
| `/api/v1/dashboard/codes-promo/generate` | POST | ✅ | Auto-génération promo |
| `/api/v1/dashboard/codes-promo/export-csv` | GET | ✅ | Export CSV |
| `/api/v1/dashboard/upload-image` | POST | ✅ | Upload vers R2 |
| `/api/v1/dashboard/media/:key` | GET | ✅ | Accès médias R2 |
| `/api/v1/dashboard/qrcode` | GET | ✅ | QR code restaurant |
| `/api/v1/dashboard/setup-restaurant` | POST | ✅ | Onboarding |
| `/api/v1/screenshots/:slug` | GET | ❌ | Aperçu boutique |

---

## 4. RISQUES IDENTIFIÉS — SÉCURITÉ

### 4.1 🔴 CRITIQUE — Route `/api/admin/auth/login` absente dans l'admin

**Description** : Le fichier `admin.js` (ligne 11) appelle `POST /api/admin/auth/login` pour authentifier l'administrateur. Cette route n'existe **nulle part** dans `src/index.tsx`. Le KV ne peut donc jamais stocker une session `{ valid: true }`.

**Conséquence** :
- Soit l'admin ne peut pas se connecter (appel échoue en 404/405).
- Soit en développement local, si le middleware est contourné (ex: erreur de réseau ignorée), l'accès est obtenu sans authentification réelle.
- Le token stocké dans `sessionStorage` est de fabrication, jamais validé par le Worker.

**Code problématique** (`admin.js` lignes 11–25) :
```javascript
const res = await fetch('/api/admin/auth/login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email, password })
});
// Route inexistante → 404 → data.token jamais reçu
```

**Middleware admin** (`index.tsx` lignes 28–41) :
```typescript
// Vérifie KV_ADMIN.get(`session:${sessionToken}`)
// Mais sessionToken vient d'un token fabriqué côté client
// jamais posé par un vrai handler de login
```

**Correction requise** : Créer la route `POST /api/admin/auth/login` qui :
1. Vérifie l'email/mot de passe via Supabase Auth (`signInWithPassword`)
2. Génère un token de session aléatoire (crypto.randomUUID)
3. Stocke `{ valid: true, user_id, email, created_at }` dans KV_ADMIN avec TTL 8h
4. Retourne `{ token }` au client

### 4.2 🔴 CRITIQUE — `sessionStorage` pour le token admin

**Description** : Le token admin est stocké dans `sessionStorage` (accessible par JavaScript, non protégé).

**Risque** : XSS → exfiltration du token admin → accès complet à l'administration.

**Correction requise** : Migrer vers un cookie `httpOnly; Secure; SameSite=Strict` posé par le Worker (comme déjà fait dans la webapp pour le dashboard restaurant).

### 4.3 🔴 CRITIQUE — Aucune validation d'entrée Zod dans l'admin

**Description** : Les routes `PATCH /api/admin/plans/:id` et `PATCH /api/admin/config/:cle` acceptent n'importe quel corps JSON sans validation.

**Code problématique** (`index.tsx` ligne 188) :
```typescript
const body = await c.req.json()
// body n'est pas validé — peut contenir n'importe quelle clé
const res = await fetch(`${SUPABASE_URL}/rest/v1/plans?id=eq.${id}`, {
  body: JSON.stringify({ ...body, updated_at: ... }) // Injection potentielle
})
```

**Risque** : Un admin malveillant (ou un token compromis) peut injecter des champs non attendus (ex : `actif: false` sur tous les plans, `deleted_at` sur un tenant).

**Correction** : Whitelisting strict + validation Zod sur tous les corps de requête.

### 4.4 🟡 MOYEN — Injection via paramètre `search` non sanitisé

**Description** : Route `GET /api/admin/tenants` (`index.tsx` ligne 50) :
```typescript
(search ? `&nom=ilike.*${encodeURIComponent(search)}*` : '')
```
`encodeURIComponent` encode les caractères URL mais pas les wildcards PostgREST (`*`, `.`). Un attaquant peut injecter `*` pour faire une recherche générale ou exploiter des patterns non anticipés.

**Correction** : Sanitiser le paramètre `search` avec une regex `[a-zA-Z0-9 \-_]`.

### 4.5 🟡 MOYEN — Absence de CSP (Content Security Policy) dans l'admin

**Description** : La webapp possède une CSP complète dans `security.ts` (`setSecurityHeaders`). L'admin ne l'implémente pas — vulnérable au XSS via Tailwind CDN ou autres ressources externes.

**Correction** : Appliquer `setSecurityHeaders()` sur toutes les routes admin.

### 4.6 🟡 MOYEN — Admin auth basée sur KV (pas Supabase Auth pour l'admin)

**Description** : Le CDC (§3.2) précise que le tableau de bord admin doit avoir une "authentification forte". L'implémentation actuelle utilise un système maison (KV sessions) sans multi-facteur ni intégration avec Supabase Auth.

**Recommandation** : Ajouter Cloudflare Access en couche devant l'URL admin pour une MFA robuste, ou implémenter une vraie authentification Supabase service_role pour l'admin.

### 4.7 🟡 MOYEN — Doublon `src/index.tsx` / `src/index.ts` dans la webapp

**Description** : Les deux fichiers sont quasi-identiques (574 vs 609 lignes). `index.ts` est légèrement plus ancien et manque de `renderCompteInactifPage`. L'un des deux est le vrai point d'entrée selon `wrangler.jsonc` (`main: ./dist/index.js`), mais l'existence des deux crée un risque de divergence silencieuse.

**Correction** : Supprimer `src/index.ts` et ne garder que `src/index.tsx`.

### 4.8 🟡 MOYEN — Debug temporaire en production dans `supabase.ts`

**Description** : `src/lib/supabase.ts` (lignes 28–36) contient un bloc `console.error('[DEBUG ENV]', ...)` explicitement marqué "à retirer" :
```typescript
// ---- DEBUG TEMPORAIRE — à retirer une fois le bug "supabaseUrl is required" résolu ----
console.error('[DEBUG ENV]', {
  hasUrl: !!env.SUPABASE_URL,
  urlLength: env.SUPABASE_URL?.length ?? 0,
  hasAnonKey: !!env.SUPABASE_ANON_KEY,
  ...
})
```
Ce log révèle la présence/absence des variables d'environnement dans les logs Cloudflare, visible par toute personne ayant accès aux logs Workers.

**Correction** : Retirer immédiatement ce bloc.

### 4.9 🟡 MOYEN — Taux de conversion devises codés en dur

**Description** : `src/routes/api-plans.ts` contient des taux de conversion statiques (EUR : 0.00152, USD : 0.00168...) qui peuvent devenir obsolètes silencieusement.

**Recommandation** : Les déplacer dans `config_globale` ou intégrer une API temps réel (exchangerate.host).

### 4.10 🟢 BON — Points positifs sécurité webapp

- **CSRF** : Protection sur toutes les routes d'écriture via `X-Requested-With: XMLHttpRequest`
- **Cookies** : `httpOnly; Secure; SameSite=Lax` sur access/refresh tokens
- **Rate limiting** : Distribué via KV (fallback in-memory si KV absent)
- **Idempotency** : Clés idempotency sur la création de commandes (double-submit prevention)
- **Zod** : Validation stricte des corps de requête pour les commandes
- **RLS** : Activé sur toutes les tables sensibles Supabase
- **UUID** : Tous les IDs en UUID (pas d'autoincrement exposable)
- **Soft delete** : `deleted_at` sur toutes les tables métier

---

## 5. ANALYSE CRUD SÉCURISÉ

### 5.1 Admin (`monmenu-admin`) — État du CRUD

| Opération | Route | Validation | Auth | Statut |
|-----------|-------|-----------|------|--------|
| Lire tenants | `GET /api/admin/tenants` | ✅ Params paginés | ✅ KV session | 🟡 Partiel |
| Lire tenant | `GET /api/admin/tenants/:id` | ❌ Pas de validation UUID | ✅ KV session | 🔴 Risqué |
| Modifier tenant | `PATCH /api/admin/tenants/:id` | 🟡 Whitelist champs | ✅ KV session | 🟡 Partiel |
| Stats | `GET /api/admin/stats` | ✅ Cache KV | ✅ KV session | 🟢 OK |
| Lire plans | `GET /api/admin/plans` | ✅ N/A | ✅ KV session | 🟢 OK |
| Modifier plan | `PATCH /api/admin/plans/:id` | ❌ Aucune validation | ✅ KV session | 🔴 Risqué |
| Modifier config | `PATCH /api/admin/config/:cle` | 🟡 Valeur non vide | ✅ KV session | 🟡 Partiel |

**Manques critiques dans l'admin :**
- ❌ `POST /api/admin/tenants` (création manuelle de restaurant)
- ❌ `DELETE /api/admin/tenants/:id` (soft delete)
- ❌ `POST /api/admin/auth/login` (critique — voir §4.1)
- ❌ `POST /api/admin/auth/logout`
- ❌ `GET /api/admin/paiements` (suivi paiements)
- ❌ `POST /api/admin/plans` (création plan)
- ❌ `DELETE /api/admin/plans/:id` (désactivation plan)
- ❌ `GET /api/admin/blog` (gestion articles)
- ❌ `POST /api/admin/blog` (créer article)
- ❌ `GET /api/admin/newsletter` (liste inscrits)
- ❌ `GET /api/admin/audit-log` (journal d'audit)
- ❌ `GET /api/admin/commandes` (commandes cross-tenant)
- ❌ `GET /api/admin/pays` (gestion pays)

### 5.2 Webapp (`monmenu`) — État du CRUD

**Dashboard Restaurant — Bien implémenté :**
- ✅ CRUD complet catégories (POST/PATCH/DELETE avec auth + validation)
- ✅ CRUD complet produits (POST/PATCH/DELETE avec upload R2)
- ✅ CRUD livreurs (GET/POST/PATCH/DELETE)
- ✅ Mise à jour PDV, apparence, paramètres
- ✅ CRUD codes promo (avec génération auto + export CSV)
- ✅ Export CSV des commandes
- ✅ Upload images vers R2 avec validation type/taille
- ✅ QR code personnalisable

**Points faibles webapp CRUD :**
- 🟡 `api-dashboard.ts` trop volumineuse (1542 lignes) — refactoring recommandé
- 🔴 Absence de route d'inscription newsletter côté admin (lecture seule de la liste)
- 🔴 Pas de DELETE sur les produits en cascade (variantes orphelines)

---

## 6. ÉTAT DU MODULE BLOG

### 6.1 Dans la webapp (`monmenu`) — Fonctionnel

**API disponibles** (`src/routes/api-blog.ts` — 124 lignes) :
```
GET    /api/v1/blog          → Liste articles publiés (public)
GET    /api/v1/blog/:slug    → Article par slug (public)
POST   /api/v1/blog/admin    → Créer article (auth platform JWT)
PUT    /api/v1/blog/admin/:id → Modifier article (auth platform JWT)
DELETE /api/v1/blog/admin/:id → Supprimer article (auth platform JWT)
```

**Schéma DB** (migration `migration-blog-newsletter.sql`) :
```sql
articles (
  id UUID, slug TEXT UNIQUE, titre TEXT, extrait TEXT,
  contenu TEXT, categorie TEXT, temps_lecture TEXT,
  image_url TEXT, statut TEXT ('brouillon'|'publie'),
  auteur TEXT, date_publication TIMESTAMPTZ, ...
)
```

**RLS** : Lecture publique uniquement sur `statut = 'publie'`. Écriture réservée `service_role`.

**Pages web** : `src/pages/blog.ts` (liste), `src/pages/article.ts` (article individuel) avec Schema.org `BlogPosting`.

**État global** : ✅ **Fonctionnel côté webapp**

### 6.2 Dans l'admin (`monmenu-admin`) — Absent

L'admin ne possède **aucune interface** pour :
- Lister les articles (brouillons + publiés)
- Créer/modifier/publier un article
- Gérer l'image de couverture
- Planifier la publication

**Impact** : Les articles de blog ne peuvent être créés qu'en appelant directement l'API `/api/v1/blog/admin` avec un token valide — pas d'interface utilisateur disponible. C'est une lacune fonctionnelle majeure pour les besoins opérationnels.

**Fichiers à créer pour combler cette lacune :**
- `src/routes/admin-blog.ts` — routes blog dans l'admin (voir §9)
- Section "Blog" dans la sidebar admin + HTML dans `renderAdminApp()` → migrer vers fichiers séparés

### 6.3 Recommandations pour le blog

1. Ajouter la route `POST /api/admin/auth/login` (prérequis absolu)
2. Créer un écran "Blog" dans l'admin avec formulaire de création d'article (titre, slug auto-généré, extrait, contenu Markdown/HTML, catégorie, image, statut)
3. Lier l'écran à l'API webapp existante `/api/v1/blog/admin`
4. Ajouter un champ `auteur_id` pour tracer qui a écrit quoi

---

## 7. GESTION DES PAIEMENTS ET FORFAITS

### 7.1 État actuel dans l'admin

**Ce qui existe :**
- `GET /api/admin/plans` → lecture des plans
- `PATCH /api/admin/plans/:id` → modification prix, commandes incluses, frais/commande
- Interface de modification des prix dans la SPA admin (formulaire inline)

**Ce qui manque :**
- ❌ **Vue des paiements / abonnements par restaurant** : aucune route ni interface pour voir si un restaurant a payé, quand son abonnement expire, ses historiques de paiement
- ❌ **Confirmation manuelle de paiement** : pour valider un paiement Mobile Money (Orange Money, Moov Money, MTN) reçu hors ligne
- ❌ **Gestion des abonnements** : activer/prolonger/résilier un abonnement depuis l'admin
- ❌ **Statistiques de revenus** : CA total par plan, par pays, par période
- ❌ **Alertes renouvellement** : liste des restaurants dont l'abonnement expire dans les 7 jours
- ❌ **Création d'un nouveau plan** : l'admin ne peut que modifier les plans existants

### 7.2 État dans la webapp — Schéma DB

**Table `abonnements`** (définie dans migration 001) :
```sql
abonnements (
  id UUID, tenant_id UUID, plan_id UUID,
  date_debut TIMESTAMPTZ, date_fin TIMESTAMPTZ,
  statut TEXT ('actif'|'expire'|'annule')
)
```

**Problème** : Cette table est créée en base mais **aucune logique applicative ne l'utilise**. Ni l'inscription d'un restaurant, ni le cron ne créent/mettent à jour les abonnements. La gestion de la période d'essai fonctionne via `tenants.essai_expire_le` (migration 006) et le cron `verifierEssaisExpires()`, mais le passage à un abonnement payant n'est pas implémenté.

### 7.3 Recommandations paiements/forfaits (priorisées)

**Phase 1 — Urgence opérationnelle :**
1. Créer `GET /api/admin/abonnements` : liste des abonnements avec statut + dates + restaurant associé
2. Créer `POST /api/admin/abonnements/confirmer` : confirmation manuelle de paiement (côté admin, le gestionnaire valide un virement reçu)
3. Créer `GET /api/admin/tenants?filtre=expiration_proche` : restaurants à relancer
4. Ajouter l'écran "Paiements" dans la sidebar admin

**Phase 2 — Automatisation :**
5. Intégrer CinetPay (leader Afrique de l'Ouest) ou Orange Money API pour paiement automatique
6. Cron mensuel de facturation (table `factures`) déjà mentionné dans le CDC
7. Notifications WhatsApp automatiques à J-7 / J-3 / J0 avant expiration

---

## 8. COMPARAISON FONCTIONNELLE AVEC LE CDC

### 8.1 Tableau de conformité global (admin + webapp)

| # | Exigence CDC | Admin | Webapp | Statut global |
|---|-------------|-------|--------|---------------|
| 1.1 | Client final sans compte | N/A | ✅ Implémenté | ✅ |
| 1.2 | Nom projet depuis DB | ✅ PATCH config | ✅ `getNomProjet()` | ✅ |
| 2.1 | Stack Hono + CF Workers | ✅ | ✅ | ✅ |
| 2.3 | Supabase Auth + RLS | ❌ Partiel | ✅ Complet | 🟡 |
| 3.1 | Dépôt 1 — app publique | N/A | ✅ | ✅ |
| 3.2 | Dépôt 2 — admin isolé | 🟡 Déployé séparé | N/A | 🟡 |
| 3.2 | Admin : clé service_role côté Worker | ✅ | N/A | ✅ |
| 3.2 | Admin : robots.txt noindex | ✅ | N/A | ✅ |
| 4.2 | RLS sur toutes les tables | N/A | ✅ | ✅ |
| 4.3 | UUID partout | ✅ | ✅ | ✅ |
| 4.3 | Soft delete (deleted_at) | N/A | ✅ | ✅ |
| 4.3 | items_json figé à la commande | N/A | ✅ | ✅ |
| 4.4 | Historique commandes (frise chronologique) | N/A | 🟡 API présente, UI à améliorer | 🟡 |
| 5.1 | Charte rouge/bleu | 🟢 Dark + rouge | 🟢 Rouge dominant | ✅ |
| 5.2 | Thème dynamique par restaurant | N/A | ✅ Variables CSS | ✅ |
| 5.3 | Mode clair/sombre | ❌ Dark only | ❌ Retiré (audit-01) | 🔴 |
| 6.2 | Page accueil complète | N/A | 🟡 Partiel (chiffres manquants) | 🟡 |
| 7.1 | Parcours commande sans compte | N/A | ✅ | ✅ |
| 7.1 | Lien suivi unique (token_suivi) | N/A | ✅ | ✅ |
| 7.2 | Tableau de bord restaurant | N/A | ✅ | ✅ |
| 7.2 | Notifications WhatsApp temps réel | N/A | ✅ (API + cron) | ✅ |
| 8.1 | Carte interactive Mapbox/Google Maps | N/A | ❌ Absent | 🔴 |
| 8.2 | Calcul livraison dynamique (distance + météo) | N/A | ✅ Haversine + OpenWeather | ✅ |
| 8.3 | Redirection WhatsApp client | N/A | ✅ | ✅ |
| 8.4 | Forfaits dynamiques depuis DB | ✅ PATCH plans | ✅ Lecture fonctionnalités JSONB | ✅ |
| 8.5 | QR code téléchargeable | N/A | ✅ PNG/SVG | ✅ |
| 8.6 | Prix depuis DB (pas codés en dur) | ✅ | ✅ | ✅ |
| 8.7 | Codes promo | ❌ Absent admin | ✅ Dashboard restaurant | 🟡 |
| 8.7 | Avis clients | ❌ | ❌ | 🔴 |
| 8.7 | Programme fidélité | ❌ | ❌ | 🔴 |
| 9 | SEO meta/OG/Twitter | N/A | 🟡 Partiel (image OG manquante) | 🟡 |
| 9 | Sitemap dynamique | N/A | 🟡 Incomplet (blog absent) | 🟡 |
| 9 | Pages SEO ville/besoin | N/A | ❌ Absent | 🔴 |
| 10 | Déploiement GitHub Actions | ❌ | ❌ | 🔴 |
| 11 | Protection SQL injection | ✅ PostgREST | ✅ SDK Supabase | ✅ |
| 11 | Protection CSRF | ❌ Absent admin | ✅ X-Requested-With | 🟡 |
| 11 | Rate limiting | ❌ Absent admin | ✅ KV distribué | 🟡 |
| 11 | Headers sécurité (CSP, HSTS...) | ❌ Absent admin | ✅ setSecurityHeaders() | 🟡 |
| 11 | Audit log | ❌ Interface manquante | ✅ Table + triggers | 🟡 |

### 8.2 Score de conformité

| Dépôt | Fonctionnalités implémentées | Score |
|-------|------------------------------|-------|
| **Admin** | ~10/28 fonctionnalités attendues | **~35%** |
| **Webapp** | ~28/40 fonctionnalités attendues | **~70%** |
| **Global** | ~38/68 exigences CDC | **~56%** |

---

## 9. ARBORESCENCE CIBLE RECOMMANDÉE — ADMIN

La structure cible suit le principe de **séparation stricte des responsabilités**. Chaque fichier a une responsabilité unique et bien délimitée.

```
monmenu-admin/
├── src/
│   ├── index.tsx                      # Point d'entrée : montage des routes UNIQUEMENT
│   │
│   ├── types/
│   │   └── admin.ts                   # Types TypeScript AdminEnv, AdminSession, etc.
│   │
│   ├── lib/
│   │   ├── supabase-admin.ts          # Client Supabase service_role (jamais exposé)
│   │   ├── session.ts                 # Gestion sessions KV (create, verify, revoke)
│   │   └── security.ts               # CSP headers, rate limiting, sanitisation
│   │
│   ├── middleware/
│   │   ├── auth.ts                    # Middleware auth : verify session KV → 401
│   │   └── rate-limit.ts             # Rate limiting par IP sur les routes sensibles
│   │
│   ├── routes/
│   │   ├── auth.ts                    # POST /login, POST /logout, GET /session
│   │   ├── tenants.ts                 # GET|POST|PATCH|DELETE /tenants, GET /tenants/:id
│   │   ├── plans.ts                   # GET|POST|PATCH|DELETE /plans
│   │   ├── paiements.ts              # GET /abonnements, POST /confirmer, GET /stats-revenus
│   │   ├── blog.ts                    # GET|POST|PUT|DELETE /blog (articles)
│   │   ├── newsletter.ts              # GET /newsletter/subscribers, POST /newsletter/envoyer
│   │   ├── config.ts                  # GET|PATCH /config
│   │   ├── audit-log.ts               # GET /audit-log (journal d'audit)
│   │   ├── commandes.ts               # GET /commandes (cross-tenant, stats)
│   │   └── pays.ts                    # GET|PATCH /pays
│   │
│   └── views/                         # HTML séparé du code serveur
│       ├── layout.ts                  # Layout HTML commun (head, sidebar, nav)
│       ├── login.ts                   # Page de connexion
│       ├── dashboard.ts              # Page tableau de bord
│       ├── restaurants.ts            # Page liste restaurants
│       ├── plans.ts                   # Page plans & forfaits
│       ├── paiements.ts              # Page suivi paiements/abonnements
│       ├── blog.ts                    # Page gestion blog
│       ├── newsletter.ts              # Page abonnés newsletter
│       ├── config.ts                  # Page configuration globale
│       └── audit.ts                   # Page journal d'audit
│
├── public/
│   ├── static/
│   │   ├── js/
│   │   │   ├── admin-core.js          # Utilitaires partagés (fetch helper, esc, nav)
│   │   │   ├── admin-auth.js          # Login/logout
│   │   │   ├── admin-restaurants.js   # CRUD restaurants
│   │   │   ├── admin-plans.js         # CRUD plans
│   │   │   ├── admin-paiements.js    # Gestion paiements
│   │   │   ├── admin-blog.js          # Éditeur d'articles
│   │   │   ├── admin-newsletter.js    # Gestion abonnés
│   │   │   └── admin-config.js        # Configuration globale
│   │   └── css/
│   │       └── admin.css              # Styles admin (variables CSS, override Tailwind)
│
├── wrangler.jsonc
├── package.json
├── tsconfig.json
└── vite.config.ts
```

### 9.1 Nouveau `src/index.tsx` (rôle unique : montage des routes)

```typescript
// src/index.tsx — UNIQUEMENT routage et montage
import { Hono } from 'hono'
import { serveStatic } from 'hono/cloudflare-workers'
import type { AdminEnv } from './types/admin'

import { authRouter } from './routes/auth'
import { tenantsRouter } from './routes/tenants'
import { plansRouter } from './routes/plans'
import { paiementsRouter } from './routes/paiements'
import { blogAdminRouter } from './routes/blog'
import { newsletterAdminRouter } from './routes/newsletter'
import { configRouter } from './routes/config'
import { auditLogRouter } from './routes/audit-log'

import { authMiddleware } from './middleware/auth'
import { renderLoginPage } from './views/login'
import { renderAdminShell } from './views/layout'

const app = new Hono<{ Bindings: AdminEnv }>()

app.get('/robots.txt', (c) => c.text('User-agent: *\nDisallow: /\n'))
app.use('/static/*', serveStatic({ root: './' }))

// Routes publiques
app.route('/api/admin/auth', authRouter)

// Routes protégées
app.use('/api/admin/*', authMiddleware)
app.route('/api/admin/tenants', tenantsRouter)
app.route('/api/admin/plans', plansRouter)
app.route('/api/admin/paiements', paiementsRouter)
app.route('/api/admin/blog', blogAdminRouter)
app.route('/api/admin/newsletter', newsletterAdminRouter)
app.route('/api/admin/config', configRouter)
app.route('/api/admin/audit-log', auditLogRouter)

app.get('/login', (c) => c.html(renderLoginPage()))
app.get('*', (c) => c.html(renderAdminShell()))

export default app
```

---

## 10. PLAN DE MIGRATION

### 10.1 Ordre de migration (éviter les régressions)

#### Étape 1 — CRITIQUE (bloquer les risques de sécurité) — 1 jour

| Action | Fichier source | Destination cible |
|--------|---------------|-------------------|
| Extraire types `AdminEnv` | `index.tsx` lignes 10–18 | `src/types/admin.ts` |
| Créer `src/lib/session.ts` | Nouveau | Logique create/verify/revoke session KV |
| **Créer la route `POST /api/admin/auth/login`** | ❌ Inexistante | `src/routes/auth.ts` |
| Créer `POST /api/admin/auth/logout` | ❌ Inexistante | `src/routes/auth.ts` |
| Migrer cookies httpOnly | `sessionStorage` admin.js | Cookie `admin-session; httpOnly; SameSite=Strict` |
| Retirer debug `console.error` | `supabase.ts` webapp lignes 28–36 | Suppression pure |

#### Étape 2 — Restructuration admin (séparation des responsabilités) — 2-3 jours

| Action | Fichier source | Destination cible |
|--------|---------------|-------------------|
| Extraire route `GET /api/admin/tenants` | `index.tsx` lignes 43–80 | `src/routes/tenants.ts` |
| Extraire route `GET /api/admin/tenants/:id` | `index.tsx` lignes 81–100 | `src/routes/tenants.ts` |
| Extraire route `PATCH /api/admin/tenants/:id` | `index.tsx` lignes 101–127 | `src/routes/tenants.ts` |
| Extraire route `GET /api/admin/stats` | `index.tsx` lignes 128–165 | `src/routes/tenants.ts` ou `src/routes/stats.ts` |
| Extraire routes plans | `index.tsx` lignes 166–211 | `src/routes/plans.ts` |
| Extraire route config | `index.tsx` lignes 212–234 | `src/routes/config.ts` |
| Extraire `renderAdminApp()` | `index.tsx` lignes 240–399 | `src/views/layout.ts` + views séparées |
| Séparer JS client | `admin.js` | 7 fichiers par domaine métier |
| Créer `src/middleware/auth.ts` | `index.tsx` lignes 28–41 | Fichier dédié |

#### Étape 3 — Ajout des fonctionnalités manquantes — 5-7 jours

| Fonctionnalité | Fichiers à créer | Priorité |
|----------------|-----------------|----------|
| Module Blog admin | `src/routes/blog.ts` + `src/views/blog.ts` + `public/static/js/admin-blog.js` | 🔴 Haute |
| Suivi paiements/abonnements | `src/routes/paiements.ts` + UI | 🔴 Haute |
| Confirmation paiement manuel | Dans `src/routes/paiements.ts` | 🔴 Haute |
| Journal d'audit | `src/routes/audit-log.ts` + UI | 🟡 Moyenne |
| Gestion newsletter | `src/routes/newsletter.ts` + UI | 🟡 Moyenne |
| Gestion pays | `src/routes/pays.ts` | 🟡 Moyenne |
| CRUD plan complet (create/delete) | Compléter `src/routes/plans.ts` | 🟡 Moyenne |

#### Étape 4 — Corrections webapp — 2 jours

| Action | Fichier | Correction |
|--------|---------|-----------|
| Supprimer `src/index.ts` | Doublon | Garder uniquement `src/index.tsx` |
| Retirer debug supabase.ts | `src/lib/supabase.ts` | Supprimer bloc DEBUG TEMPORAIRE |
| Corriger redirections 302 → 301 | `src/index.tsx` routes `/fr`, `/en` | SEO (audit-02) |
| Ajouter og-image.png | `public/static/img/` | SEO critique |
| Ajouter articles au sitemap | `src/index.tsx` `/sitemap.xml` | SEO |
| Corriger carte interactive | `src/pages/boutique.ts` | CDC §8.1 manquant |

---

## 11. FONCTIONNALITÉS À IMPLÉMENTER EN PRIORITÉ

### 11.1 Admin — Fonctionnalités critiques manquantes

#### A. Route d'authentification admin (BLOQUANT)

```typescript
// src/routes/auth.ts
import { Hono } from 'hono'
import { setCookie } from 'hono/cookie'
import type { AdminEnv } from '../types/admin'
import { createSessionToken, storeSession } from '../lib/session'

const authRouter = new Hono<{ Bindings: AdminEnv }>()

authRouter.post('/login', async (c) => {
  const { email, password } = await c.req.json()

  if (!email || !password) {
    return c.json({ error: 'Email et mot de passe requis.' }, 400)
  }

  // Vérifier via Supabase Auth service_role
  const res = await fetch(`${c.env.SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: {
      'apikey': c.env.SUPABASE_SERVICE_ROLE_KEY,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ email, password })
  })

  if (!res.ok) {
    return c.json({ error: 'Identifiants incorrects.' }, 401)
  }

  const authData = await res.json() as { access_token: string; user: { id: string; email: string } }

  // Vérifier que l'utilisateur a le rôle 'admin' dans la table admins
  // (table à créer dans Supabase — liste des admins de la plateforme)
  const sessionToken = crypto.randomUUID()
  await c.env.KV_ADMIN.put(
    `session:${sessionToken}`,
    JSON.stringify({ valid: true, user_id: authData.user.id, email, created_at: Date.now() }),
    { expirationTtl: 8 * 3600 }  // 8 heures
  )

  // Cookie httpOnly (remplace sessionStorage)
  setCookie(c, 'admin-session', sessionToken, {
    httpOnly: true,
    secure: true,
    sameSite: 'Strict',
    maxAge: 8 * 3600,
    path: '/'
  })

  return c.json({ success: true })
})

export { authRouter }
```

#### B. Module paiements/abonnements

```typescript
// src/routes/paiements.ts
// GET /api/admin/paiements/abonnements — liste avec statut + expiration
// GET /api/admin/paiements/alertes      — restaurants à expiration proche
// POST /api/admin/paiements/confirmer   — confirmation manuelle paiement
// GET /api/admin/paiements/stats        — CA par plan / pays / mois
```

#### C. Module blog admin

```typescript
// src/routes/blog.ts dans l'admin
// Les routes appellent directement l'API webapp /api/v1/blog/admin
// avec le token service_role admin, ou on duplique la logique
// (recommandé : appel cross-service avec un token partagé sécurisé)
```

### 11.2 Webapp — Fonctionnalités manquantes critiques

#### A. Carte interactive (CDC §8.1)

La boutique ne propose pas de carte Mapbox/Google Maps pour la localisation du client. Il faut ajouter dans `public/static/js/boutique.js` une intégration Mapbox GL ou Leaflet.js + OpenStreetMap (gratuit).

```javascript
// À ajouter dans boutique.js
function initMapSelection(containerId, onLocationSelected) {
  const map = new mapboxgl.Map({
    container: containerId,
    style: 'mapbox://styles/mapbox/streets-v12',
    center: [-1.5353, 12.3569], // Ouagadougou par défaut
    zoom: 13
  })
  // ... géolocalisation auto + drag marker
}
```

#### B. Gestion complète des abonnements

Ajouter la logique de passage d'essai → payant avec création d'un enregistrement `abonnements` :

```typescript
// src/routes/api-auth.ts — après inscription, créer l'abonnement essai
await adminClient.from('abonnements').insert({
  tenant_id: newTenant.id,
  plan_id: planGratuit.id,
  statut: 'actif',
  date_debut: new Date().toISOString(),
  date_fin: essaiFin.toISOString()
})
```

#### C. Suppression `src/index.ts` (doublon)

Le fichier `src/index.ts` doit être supprimé. Le build Vite utilise `src/index.tsx` selon `wrangler.jsonc`. La présence des deux crée de la confusion et un risque de divergence.

### 11.3 Tableau de bord admin — Sections manquantes dans la sidebar

La sidebar actuelle (5 sections) doit être étendue :

| Section actuelle | Nouvelles sections à ajouter |
|-----------------|------------------------------|
| Tableau de bord | → Ajouter CA réel, abonnements actifs, alertes |
| Restaurants | → Ajouter filtre par statut/plan/expiration |
| Plans & Forfaits | → Ajouter création + désactivation plan |
| Configuration | ✅ OK |
| Journal d'audit | → Rendre fonctionnel (lecture DB via API) |
| ❌ **Paiements** | Nouveau : suivi abonnements + confirmation |
| ❌ **Blog** | Nouveau : éditeur d'articles |
| ❌ **Newsletter** | Nouveau : liste abonnés + envoi |
| ❌ **Commandes** | Nouveau : vue cross-tenant (support) |

---

## 12. RECOMMANDATIONS PRIORISÉES

### Priorité 1 — BLOQUANT (sécurité) — À traiter avant tout déploiement en production

1. **Créer `POST /api/admin/auth/login`** dans l'admin (voir §11.1.A)
2. **Migrer le token admin de `sessionStorage` vers cookie `httpOnly`**
3. **Retirer le bloc debug `console.error` dans `supabase.ts`** de la webapp
4. **Ajouter validation Zod** sur `PATCH /api/admin/plans/:id` et `PATCH /api/admin/config/:cle`
5. **Sanitiser le paramètre `search`** dans `GET /api/admin/tenants`

### Priorité 2 — FONCTIONNEL (opérationnel) — 1–2 semaines

6. **Supprimer le doublon `src/index.ts`** dans la webapp
7. **Créer la section Paiements/Abonnements** dans l'admin
8. **Créer la section Blog** dans l'admin (interface d'édition d'articles)
9. **Créer le journal d'audit** accessible (lecture table `audit_log` dans l'admin)
10. **Ajouter la carte interactive** dans la page boutique (Mapbox GL / Leaflet)

### Priorité 3 — SEO & QUALITÉ — 2–4 semaines

11. **Créer `og-image.png`** (1200×630px) — utilisée partout mais absente du dépôt
12. **Corriger les redirections `/fr`, `/en`** de 302 vers 301
13. **Ajouter les articles de blog au sitemap**
14. **Ajouter balises `noindex`** sur `/bienvenue`, `/suivi/*`, `/compte-inactif`
15. **Corriger URLs canoniques** des articles de blog

### Priorité 4 — ÉVOLUTION — 1–3 mois

16. **Implémenter la logique d'abonnements** (passage essai → payant)
17. **Intégrer CinetPay ou Orange Money API** pour paiement automatique
18. **Pages SEO programmatiques** par ville et par type de cuisine
19. **Mode clair/sombre** (retrait du dark-only, implémentation du toggle)
20. **Programme de fidélité** (table déjà présente dans le CDC — à créer en DB + UI)
21. **Avis clients modérables** (CRUD + modération admin)
22. **Webhooks sortants** (intégrations logiciels de caisse)
23. **GitHub Actions** pour déploiement continu automatique (CI/CD)

---

## ANNEXE A — Fichiers à créer dans l'admin (liste complète)

| Fichier | Description | Lignes estimées |
|---------|-------------|----------------|
| `src/types/admin.ts` | Types TypeScript admin | ~50 |
| `src/lib/supabase-admin.ts` | Client Supabase service_role | ~40 |
| `src/lib/session.ts` | Gestion sessions KV | ~80 |
| `src/lib/security.ts` | CSP, rate limit, sanitisation | ~100 |
| `src/middleware/auth.ts` | Vérification session middleware | ~50 |
| `src/routes/auth.ts` | Login / logout | ~120 |
| `src/routes/tenants.ts` | CRUD tenants | ~200 |
| `src/routes/plans.ts` | CRUD plans | ~150 |
| `src/routes/paiements.ts` | Gestion abonnements | ~200 |
| `src/routes/blog.ts` | CRUD articles | ~150 |
| `src/routes/newsletter.ts` | Abonnés newsletter | ~80 |
| `src/routes/config.ts` | Config globale | ~80 |
| `src/routes/audit-log.ts` | Journal d'audit | ~60 |
| `src/views/layout.ts` | HTML layout admin | ~150 |
| `src/views/login.ts` | Page login | ~80 |
| `src/views/dashboard.ts` | Page tableau de bord | ~100 |
| `src/views/restaurants.ts` | Page restaurants | ~150 |
| `src/views/plans.ts` | Page plans | ~120 |
| `src/views/paiements.ts` | Page paiements | ~150 |
| `src/views/blog.ts` | Page blog (éditeur) | ~200 |
| `src/views/newsletter.ts` | Page newsletter | ~100 |
| `src/views/config.ts` | Page configuration | ~120 |
| `src/views/audit.ts` | Page journal | ~80 |
| `public/static/js/admin-core.js` | Utilitaires partagés | ~80 |
| `public/static/js/admin-auth.js` | Login/logout | ~60 |
| `public/static/js/admin-restaurants.js` | CRUD restaurants | ~150 |
| `public/static/js/admin-plans.js` | CRUD plans | ~100 |
| `public/static/js/admin-paiements.js` | Paiements UI | ~150 |
| `public/static/js/admin-blog.js` | Éditeur articles | ~200 |
| `public/static/js/admin-newsletter.js` | Newsletter UI | ~100 |
| `public/static/js/admin-config.js` | Config UI | ~80 |
| `public/static/css/admin.css` | Styles admin | ~150 |

**Total estimé : ~3 380 lignes** réparties dans 31 fichiers (vs 605 lignes actuelles en 2 fichiers)

---

## ANNEXE B — Fichiers à modifier dans la webapp

| Fichier | Action | Raison |
|---------|--------|--------|
| `src/index.tsx` | Supprimer routes `/fr`, `/en` ou corriger en 301 | SEO |
| `src/index.tsx` | Ajouter articles de blog au sitemap | SEO |
| `src/index.ts` | **SUPPRIMER** — doublon de `index.tsx` | Cohérence |
| `src/lib/supabase.ts` | Retirer bloc DEBUG TEMPORAIRE lignes 28–36 | Sécurité |
| `src/pages/boutique.ts` | Intégrer carte interactive Mapbox | CDC §8.1 |
| `src/routes/api-auth.ts` | Créer abonnement essai à l'inscription | Logique métier |
| `src/routes/api-plans.ts` | Déplacer taux conversion vers config_globale | Maintenabilité |
| `public/static/img/` | Créer `og-image.png` (1200×630px) | SEO critique |
| `src/pages/bienvenue.ts` | Ajouter meta noindex | SEO |
| `src/pages/suivi.ts` | Ajouter meta noindex | SEO |
| `src/pages/compte-inactif.ts` | Ajouter meta noindex | SEO |

---

*Rapport rédigé le 2026-07-29. Ce rapport doit être relu et validé par le commanditaire avant toute implémentation. Les estimations de temps sont indicatives et supposent un développeur solo expérimenté sur la stack Hono + Cloudflare Workers + Supabase.*
