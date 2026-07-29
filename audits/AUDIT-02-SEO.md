# AUDIT 02 — SEO Technique Complet
## MonMenu — Rapport complet

> **Dépôt audité** : `https://github.com/poodasamuelpro/monmenu`  
> **Date de l'audit** : 2026-07-29  
> **Auditeur** : Expert SEO Technique (40 ans d'expérience full-stack + SEO)  
> **Stack technique** : Hono v4 + TypeScript + Cloudflare Workers + Supabase (SSR)  
> **Rapport distinct de** : `AUDIT-01-I18N-DARKMODE-DESIGN.md` (audit i18n/dark mode/design séparé)

---

## RÉSUMÉ EXÉCUTIF

L'audit SEO de MonMenu révèle une implémentation **partiellement conforme** : des bases techniques solides existent (schema.org sur les pages clés, sitemap dynamique, robots.txt), mais de nombreuses lacunes critiques sont présentes — notamment l'absence de l'image Open Graph principale, des URLs canoniques incorrectes sur les articles, des pages importantes manquantes du sitemap, et l'absence totale de pages SEO programmatiques ville/besoin.

| Exigence SEO | Statut | Criticité |
|-------------|--------|-----------|
| **1. Meta tags / OG / Twitter Card** | ⚠️ Partiel | 🔴 Élevée |
| **2. Schema.org (Organization, Restaurant, BlogPosting)** | ⚠️ Partiel | 🟡 Moyenne |
| **3. Sitemap.xml global + boutiques** | ⚠️ Partiel | 🟡 Moyenne |
| **4. robots.txt public/admin différencié** | ✅ Conforme | 🟢 Faible |
| **5. URLs propres + redirections 301 + hreflang** | ❌ Non conforme | 🔴 Élevée |
| **6. Pages SEO programmatiques ville/besoin** | ❌ Absent | 🔴 Élevée |

**Priorité absolue** : (1) Créer l'image OG manquante `og-image.png` — utilisée partout mais absente du dépôt. (2) Corriger les URLs canoniques des articles. (3) Ajouter /tarifs et les articles de blog au sitemap.

**Dépendance critique** : Le point 5 (hreflang FR/EN) est directement lié à la décision d'internationalisation documentée dans `AUDIT-01-I18N-DARKMODE-DESIGN.md`. Si l'i18n est retirée, le hreflang doit l'être également dans le sitemap et dans `head.ts`.

---

## TABLEAU DE CONFORMITÉ GLOBAL

| # | Exigence | Statut | Pages concernées | Référence code |
|---|---------|--------|-----------------|----------------|
| 1.1 | Meta title unique par page | ✅ Implémenté | Toutes les pages | `head.ts:renderHead()` |
| 1.2 | Meta description unique par page | ✅ Implémenté | Toutes les pages | `head.ts:renderHead()` |
| 1.3 | Open Graph (og:title, og:description, og:type) | ⚠️ Partiel | home, article, boutique seulement | `head.ts:59-85` |
| 1.4 | og:image (1200×630px) existante et servie | ❌ Absent | TOUTES | `head.ts:34` — fichier manquant |
| 1.5 | og:locale correct par langue | ⚠️ Partiel | home, article, boutique | `head.ts:53` |
| 1.6 | Twitter Card (summary_large_image) | ⚠️ Partiel | Implémenté mais image manquante | `head.ts:118-123` |
| 2.1 | Schema.org Organization | ✅ Implémenté | home.ts | `head.ts:159-175` |
| 2.2 | Schema.org WebSite + SearchAction | ✅ Implémenté | home.ts | `head.ts:178-189` |
| 2.3 | Schema.org BlogPosting / Article | ✅ Implémenté | article.ts | `head.ts:192-222` |
| 2.4 | Schema.org Restaurant | ⚠️ Partiel | boutique.ts | `head.ts:224-265` — ville, tel manquants |
| 2.5 | Schema.org LocalBusiness | ❌ Absent | contact.ts, inscriptions | — |
| 3.1 | Sitemap.xml accessible et valide | ✅ Implémenté | `/sitemap.xml` | `index.tsx:181-253` |
| 3.2 | Sitemap inclut pages institutionnelles | ⚠️ Partiel | /tarifs et /fonctionnalites manquants | `index.tsx:220-248` |
| 3.3 | Sitemap inclut URLs boutiques dynamiques | ✅ Implémenté | `/:slug` | `index.tsx:193-199` |
| 3.4 | Sitemap inclut articles de blog | ❌ Absent | `/blog/:slug` | Non implémenté |
| 3.5 | Sitemap hreflang (si i18n maintenu) | ⚠️ Partiel | home + contact seulement | `index.tsx:209-218` |
| 4.1 | robots.txt accessible | ✅ Implémenté | `/robots.txt` | `index.tsx:277-288` |
| 4.2 | Routes admin exclues du crawl | ✅ Implémenté | `/dashboard/`, `/api/` | `index.tsx:281-282` |
| 4.3 | Routes privées non listées avec noindex | ⚠️ Partiel | /bienvenue, /suivi/ exposées | `bienvenue.ts:17`, `suivi.ts:30` |
| 5.1 | URLs propres (slugs, sans paramètres inutiles) | ✅ Conforme | Toutes routes | `index.tsx` routing |
| 5.2 | Redirections 301 sur anciennes routes | ❌ Absent / 302 | /fr et /en : 302 au lieu de 301 | `index.tsx:256-272` |
| 5.3 | Hreflang FR/EN valide | ❌ Partiel / Invalide | home seulement (17 pages sans) | `home.ts:52-56` |
| 5.4 | Canonical tag par page | ⚠️ Partiel | article.ts, boutique.ts seulement | `article.ts:38` |
| 6.1 | Pages SEO programmatiques ville | ❌ Absent | Aucune route ville | — |
| 6.2 | Pages SEO programmatiques besoin/type | ❌ Absent | Aucune route type cuisine | — |
| 6.3 | Contenu différencié non dupliqué | N/A | N/A (pages inexistantes) | — |

---

## POINT 1 — META TAGS, OPEN GRAPH, TWITTER CARD

### 1.1 Architecture du composant head.ts

**Fichier** : `src/components/head.ts`

Le composant `renderHead()` centralise la génération de toutes les balises `<head>`. Il accepte les paramètres suivants (extrait, lignes 42-60) :

```typescript
export function renderHead(
  title: string,              // <title> + og:title + twitter:title
  description: string,        // meta description + og:description + twitter:description
  nomProjet: string,          // og:site_name
  extra: string = '',         // balises supplémentaires (legacy)
  canonicalUrlLegacy: string, // canonical (legacy, remplacé par seoOptions)
  seoOptions: HeadSeoOptions  // toutes les options SEO avancées
): string
```

**Ce qui est toujours généré** (pour toutes les pages) :
- `<title>` ✅
- `<meta name="description">` ✅
- `<link rel="canonical">` ✅ (mais souvent avec URL par défaut `https://monmenu.app/`)
- `<meta property="og:title">` ✅
- `<meta property="og:description">` ✅
- `<meta property="og:type">` ✅ (par défaut `website`)
- `<meta property="og:url">` ✅
- `<meta property="og:image">` ⚠️ (pointe vers `og-image.png` manquante)
- `<meta property="og:locale">` ✅ (par défaut `fr_FR`)
- `<meta property="og:site_name">` ✅
- `<meta name="twitter:card" content="summary_large_image">` ✅
- `<meta name="twitter:site" content="@monmenu_app">` ✅
- `<meta name="twitter:title">` ✅
- `<meta name="twitter:description">` ✅
- `<meta name="twitter:image">` ⚠️ (même image manquante)

### 1.2 Problème critique — Image OG absente du dépôt

**Fichier** : `src/components/head.ts`, ligne 34

```typescript
const DEFAULT_OG_IMAGE = 'https://monmenu.app/static/img/og-image.png'
```

Cette URL est utilisée comme image par défaut sur **100% des pages** : meta `og:image`, `twitter:image`, logo Organization JSON-LD, logo Publisher JSON-LD, image Restaurant JSON-LD.

**Constat** : Le fichier `og-image.png` est **absent du dépôt**. Les fichiers présents dans `public/static/img/` sont :
- `dashboard-preview.jpg`
- `favicon.svg`
- `hero-app-mockup.jpg`
- `hero-illustration.jpg`
- `restaurant-owner.jpg`

**Impact** : Toutes les pages partagent sur les réseaux sociaux sans image d'aperçu. Les crawlers SEO (Google, Facebook, Twitter) ne peuvent pas charger l'image. Cela réduit significativement le Click-Through Rate (CTR) depuis les partages sociaux.

**Correction requise** :
1. Créer l'image `og-image.png` aux dimensions 1200×630px
2. La placer dans `public/static/img/og-image.png`
3. Format PNG, moins de 8MB (recommandé < 1MB)
4. Contenu suggéré : logo MonMenu + tagline + fond aux couleurs brand

### 1.3 État par page

#### Page d'accueil (`/`) — home.ts

```typescript
renderHead(
  isEn ? `${nomProjet} — Order online...` : `${nomProjet} — Commandez en ligne...`,
  description,
  nomProjet,
  '', '',
  {
    ogType: 'website',
    ogLocale: isEn ? 'en_US' : 'fr_FR',
    jsonLd: { Organization + WebSite },
    hreflangAlternates: [{ lang:'fr', url:'/?lang=fr' }, { lang:'en', url:'/?lang=en' }, { lang:'x-default', url:'/' }]
  }
)
```

| Balise | Présent | Valeur | Conformité |
|--------|---------|--------|------------|
| `<title>` | ✅ | Dynamique FR/EN | ✅ |
| `meta description` | ✅ | Dynamique FR/EN | ✅ |
| `og:type` | ✅ | `website` | ✅ |
| `og:image` | ✅ | `og-image.png` | ❌ Fichier manquant |
| `og:locale` | ✅ | `fr_FR` / `en_US` | ✅ |
| `canonical` | ✅ | `https://monmenu.app/` | ⚠️ URL vide → hérite défaut |
| `hreflang` | ✅ | fr + en + x-default | ⚠️ Voir section 5 |
| JSON-LD Organization | ✅ | Complet | ✅ |
| JSON-LD WebSite | ✅ | Avec SearchAction | ✅ |

> ⚠️ **Note** : Le `canonicalUrlLegacy` est passé comme chaîne vide `''` dans `home.ts`. La valeur par défaut dans `head.ts` est `${BASE_URL}/` = `https://monmenu.app/`. L'URL canonique est donc `https://monmenu.app/` — techniquement correct mais implicite.

#### Page blog (liste) (`/blog`) — blog.ts

```typescript
renderHead(
  `${t.blog.title} — ${nomProjet}`,
  t.blog.description,
  nomProjet
  // ← Pas de seoOptions : ogType=website (défaut), pas de canonical explicite, pas d'image personnalisée
)
```

| Balise | Présent | Valeur | Conformité |
|--------|---------|--------|------------|
| `<title>` | ✅ | `Blog — MonMenu` | ✅ |
| `meta description` | ✅ | Traduit FR/EN | ✅ |
| `og:type` | ⚠️ | `website` (défaut) | ⚠️ Devrait être `blog` ou `website` |
| `og:image` | ⚠️ | `og-image.png` (défaut) | ❌ Fichier manquant |
| `canonical` | ⚠️ | `https://monmenu.app/` (défaut!) | ❌ Devrait pointer vers `/blog` |
| `hreflang` | ❌ | Absent | ❌ |
| JSON-LD | ❌ | Absent | ❌ Manque BreadcrumbList/Blog |

> ❌ **Bug critique** : L'URL canonique du blog pointe vers `https://monmenu.app/` (la valeur par défaut) au lieu de `https://monmenu.app/blog`. Google peut interpréter `/blog` comme du contenu dupliqué de `/`.

#### Articles individuels (`/blog/:slug`) — article.ts

```typescript
const articleUrl = `https://monmenu.app/blog/${article.titre.toLowerCase().replace(/\s+/g, '-')}`
renderHead(
  `${article.titre} — ${nomProjet}`,
  article.extrait,
  nomProjet, '', articleUrl,
  {
    ogType: 'article',
    ogImage: article.image_url ?? undefined,
    ogLocale: locale === 'en' ? 'en_US' : 'fr_FR',
    canonicalUrl: articleUrl,
    articlePublishedTime: article.date_publication,
    articleAuthor: article.auteur,
    jsonLd: jsonLdArticle(...)
  }
)
```

| Balise | Présent | Valeur | Conformité |
|--------|---------|--------|------------|
| `<title>` | ✅ | Titre de l'article | ✅ |
| `meta description` | ✅ | Extrait | ✅ |
| `og:type` | ✅ | `article` | ✅ |
| `og:image` | ✅ | Image de l'article si disponible | ⚠️ Fallback vers og-image.png manquante |
| `canonical` | ✅ | Construit depuis le titre | ❌ **Bug — construit depuis titre, pas slug DB** |
| `article:published_time` | ✅ | Date publication | ✅ |
| `article:author` | ✅ | Auteur | ✅ |
| JSON-LD BlogPosting | ✅ | Complet | ✅ |

> ❌ **Bug critique** : L'URL canonique (`articleUrl`) est construite ainsi :
> ```typescript
> `https://monmenu.app/blog/${article.titre.toLowerCase().replace(/\s+/g, '-')}`
> ```
> Cette transformation du titre en slug peut diverger du vrai slug stocké en base de données. La requête Supabase ne récupère **pas le champ `slug`** — il est absent du `SELECT` (ligne 400 de `index.tsx`). Résultat : si un article a `titre = "Mon Restaurant Ouagadougou"`, l'URL canonique sera `/blog/mon-restaurant-ouagadougou` alors que le vrai slug DB peut être `/blog/mon-restaurant-ouaga-2024`. Google peut indexer deux URLs pour le même article.
>
> **Correction** : Ajouter `slug` dans la requête Supabase et passer le slug réel à `renderArticlePage()`.

#### Boutiques restaurants (`/:slug`) — boutique.ts

```typescript
renderHead(
  `${tenant.nom} — Commander en ligne | ${nomProjet}`,
  `Commandez en ligne chez ${tenant.nom}...`,
  nomProjet, '', boutiqueUrl,
  {
    ogImage: tenant.logo_url ?? tenant.banniere_url ?? undefined,
    ogType: 'website',
    ogLocale: 'fr_FR',
    canonicalUrl: boutiqueUrl,
    jsonLd: jsonLdRestaurant({...}),
    hreflangAlternates: [{ lang:'fr', url: boutiqueUrl }, { lang:'x-default', url: boutiqueUrl }]
  }
)
```

| Balise | Présent | Valeur | Conformité |
|--------|---------|--------|------------|
| `<title>` | ✅ | `{nom} — Commander en ligne \| MonMenu` | ✅ |
| `meta description` | ✅ | Dynamique | ✅ |
| `og:type` | ✅ | `website` (acceptable) | ✅ |
| `og:image` | ✅ | Logo du restaurant (si disponible) | ✅ |
| `canonical` | ✅ | URL absolue de la boutique | ✅ |
| `hreflang` | ✅ | fr + x-default | ✅ |
| JSON-LD Restaurant | ✅ | Présent | ⚠️ Voir section 2.4 |

#### Autres pages clés — Synthèse des lacunes

| Page | URL | title | description | og:type | og:image | canonical | JSON-LD |
|------|-----|-------|------------|---------|----------|-----------|---------|
| Tarifs | `/tarifs` | ✅ | ✅ | ❌ défaut | ❌ manquante | ❌ défaut `/` | ❌ |
| Contact | `/contact` | ✅ | ✅ | ❌ défaut | ❌ manquante | ❌ défaut `/` | ❌ |
| Inscription | `/inscription` | ✅ | ✅ | ❌ défaut | ❌ manquante | ❌ défaut `/` | ❌ |
| Légal CGU | `/legal/cgu` | ✅ | ✅ | ❌ défaut | ❌ manquante | ❌ défaut `/` | ❌ |
| Récup. MDP | `/mot-de-passe-oublie` | ✅ | ✅ | ❌ défaut | ❌ manquante | ✅ | ❌ |
| 404 | — | ✅ | ✅ | ❌ défaut | ❌ manquante | ❌ | ❌ |

> ❌ **Problème systémique** : L'URL canonique par défaut dans `renderHead()` est `https://monmenu.app/` pour toutes les pages qui ne passent pas explicitement `canonicalUrl`. Cela signifie que `/tarifs`, `/contact`, `/blog`, `/legal/cgu` ont toutes un `<link rel="canonical" href="https://monmenu.app/">` — ce qui indique à Google que ces pages sont des **duplicates de l'accueil**.

---

## POINT 2 — SCHEMA.ORG

### 2.1 Schema.org Organization

**Fichier** : `src/components/head.ts`, lignes 159-175

```json
{
  "@context": "https://schema.org",
  "@type": "Organization",
  "name": "MonMenu",
  "url": "https://monmenu.app",
  "logo": "https://monmenu.app/static/img/og-image.png",
  "contactPoint": {
    "@type": "ContactPoint",
    "contactType": "customer support",
    "availableLanguage": ["French", "English"]
  }
}
```

**Conformité** : ✅ Structure valide

**Améliorations recommandées** :
- `logo` : Pointe vers `og-image.png` manquante → à corriger
- `sameAs` : Tableau vide `[]` → ajouter les profils réseaux sociaux (Facebook, Instagram, LinkedIn, etc.)
- `telephone` : Absent → ajouter le numéro de support
- `foundingDate` : Absent
- `address` : Absent

### 2.2 Schema.org WebSite

**Fichier** : `src/components/head.ts`, lignes 178-189

```json
{
  "@context": "https://schema.org",
  "@type": "WebSite",
  "name": "MonMenu",
  "url": "https://monmenu.app",
  "potentialAction": {
    "@type": "SearchAction",
    "target": {
      "@type": "EntryPoint",
      "urlTemplate": "https://monmenu.app/blog?q={search_term_string}"
    },
    "query-input": "required name=search_term_string"
  }
}
```

**Conformité** : ✅ Structure valide

> ⚠️ **Observation** : Le `SearchAction` pointe vers `/blog?q=...`. Vérifier que cette fonctionnalité de recherche est réellement implémentée côté frontend. Si la page blog ne gère pas le paramètre `?q=`, le SearchAction est trompeur pour Google.

### 2.3 Schema.org BlogPosting (Articles)

**Fichier** : `src/components/head.ts`, lignes 192-222

```json
{
  "@context": "https://schema.org",
  "@type": "BlogPosting",
  "headline": "Titre de l'article",
  "description": "Extrait",
  "image": "URL image ou og-image.png",
  "datePublished": "2024-01-15",
  "author": { "@type": "Person", "name": "Auteur" },
  "publisher": {
    "@type": "Organization",
    "name": "MonMenu",
    "logo": { "@type": "ImageObject", "url": "og-image.png" }
  },
  "mainEntityOfPage": { "@type": "WebPage", "@id": "URL_canonique" }
}
```

**Conformité** : ✅ Structure valide, bonne richesse

**Problèmes** :
- `@id` de `mainEntityOfPage` utilise l'URL construite depuis le titre (bug canonical décrit section 1.3)
- `image` fallback vers `og-image.png` manquante
- `dateModified` absent (recommandé pour Google News/Discover)
- `articleBody` absent (optionnel mais améliore le Rich Snippet)

### 2.4 Schema.org Restaurant (Boutiques)

**Fichier** : `src/components/head.ts`, lignes 224-265

```json
{
  "@context": "https://schema.org",
  "@type": "Restaurant",
  "name": "Nom du restaurant",
  "description": "Description",
  "image": "logo_url ou og-image.png",
  "url": "https://monmenu.app/slug",
  "address": {
    "@type": "PostalAddress",
    "streetAddress": "adresse PDV",
    "addressLocality": null,  // ← ville NON PASSÉE
    "addressCountry": "BF"
  },
  "geo": { "@type": "GeoCoordinates", "latitude": ..., "longitude": ... },
  "servesCuisine": "Cuisine africaine",
  "acceptsReservations": false,
  "hasMenu": "URL_boutique",
  "paymentAccepted": "Cash, Mobile Money"
}
```

**Conformité** : ⚠️ Partiel

**Problèmes identifiés** :

| Champ manquant | Impact | Code concerné |
|----------------|--------|---------------|
| `addressLocality` (ville) | Moyen | `boutique.ts:177-185` — `ville` non passé à `jsonLdRestaurant()` |
| `telephone` | Moyen | `whatsapp_number` disponible dans `TenantBoutique` mais non inclus |
| `openingHours` | Moyen | `pdv_horaires` disponible mais non transformé en format schema.org |
| `addressCountry` hardcodé `'BF'` | Élevé | `head.ts:251` — Tous les restaurants = Burkina Faso même si CI, SN, etc. |
| `priceRange` | Faible | Non implémenté |
| `currenciesAccepted` | Faible | Non implémenté |

> ❌ **Bug critique** : `addressCountry` est hardcodé en `'BF'` pour **tous** les restaurants, même ceux de Côte d'Ivoire (`CI`), Sénégal (`SN`), Cameroun (`CM`), etc. Le pays devrait être récupéré depuis les données du tenant.

**Correction de la ville manquante** :

Le paramètre `ville` existe dans `jsonLdRestaurant()` (ligne 229 de `head.ts`) mais n'est **pas passé** dans l'appel de `boutique.ts` (lignes 177-185). La ville fait partie de `pdv_adresse` sous forme de texte libre, ou pourrait être extraite de la table `points_de_vente`.

```typescript
// boutique.ts — correction nécessaire ligne 177-184
jsonLd: jsonLdRestaurant({
  nom: tenant.nom,
  logoUrl: tenant.logo_url,
  adresse: tenant.pdv_adresse,
  ville: tenant.pdv_ville ?? null,  // ← À ajouter dans TenantBoutique interface
  latitude: tenant.pdv_latitude,
  longitude: tenant.pdv_longitude,
  horaires: typeof tenant.pdv_horaires === 'string' ? tenant.pdv_horaires : null,
  url: boutiqueUrl
})
```

### 2.5 Schema.org absent sur pages importantes

**Pages sans aucun JSON-LD** :

| Page | Type de schéma recommandé | Priorité |
|------|--------------------------|----------|
| `/contact` | `ContactPage` + `Organization` | 🟡 Moyenne |
| `/inscription` | `WebPage` (SoftwareApplication) | 🟢 Faible |
| `/tarifs` | `Product` ou `Offer` | 🟡 Moyenne |
| `/legal/cgu` | `WebPage` avec `breadcrumb` | 🟢 Faible |
| `/blog` | `Blog` + `BreadcrumbList` | 🟡 Moyenne |
| `/mot-de-passe-oublie` | Aucun (non indexé) | — |

---

## POINT 3 — SITEMAP.XML

### 3.1 Implémentation actuelle

**Fichier** : `src/index.tsx`, lignes 181-253

Le sitemap est **généré dynamiquement** à chaque requête `/sitemap.xml`. Il effectue une requête Supabase pour récupérer les slugs des restaurants actifs.

**Structure actuelle du sitemap** :

```xml
<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:xhtml="http://www.w3.org/1999/xhtml">
  <!-- Pages institutionnelles -->
  <url><loc>https://monmenu.app/</loc> + hreflang FR+EN</url>
  <url><loc>https://monmenu.app/contact</loc> + hreflang FR+EN</url>
  <url><loc>https://monmenu.app/inscription</loc></url>
  <url><loc>https://monmenu.app/blog</loc></url>
  <url><loc>https://monmenu.app/legal/cgu</loc></url>
  <url><loc>https://monmenu.app/legal/confidentialite</loc></url>
  <url><loc>https://monmenu.app/legal/mentions</loc></url>
  <url><loc>https://monmenu.app/legal/cookies</loc></url>
  <!-- Boutiques restaurants (dynamique) -->
  <url><loc>https://monmenu.app/{slug}</loc></url>
  ...
</urlset>
```

### 3.2 Problèmes identifiés

#### 3.2.1 Pages institutionnelles manquantes

| Page | URL | Dans sitemap ? | Priority suggérée |
|------|-----|----------------|-------------------|
| Tarifs | `/tarifs` | ❌ Absente | 0.8 |
| Fonctionnalités | `/fonctionnalites` | ❌ Absente | 0.7 |
| Blog (liste) | `/blog` | ✅ Présente | ✅ |
| Contact | `/contact` | ✅ Présente | ✅ |
| Inscription | `/inscription` | ✅ Présente | ✅ |
| CGU | `/legal/cgu` | ✅ Présente | ✅ |
| Confidentialité | `/legal/confidentialite` | ✅ Présente | ✅ |
| Mentions légales | `/legal/mentions` | ✅ Présente | ✅ |
| Cookies | `/legal/cookies` | ✅ Présente | ✅ |

> ❌ `/tarifs` et `/fonctionnalites` sont deux pages importantes pour le SEO commercial — elles ne sont pas dans le sitemap.

#### 3.2.2 Articles de blog absents du sitemap

**Impact** : Les articles de blog (`/blog/:slug`) ne sont **pas inclus** dans le sitemap. Google peut les découvrir via le crawl des liens depuis `/blog`, mais sans entrée dans le sitemap, il ne connaît pas leur date de publication (`lastmod`), leur fréquence de mise à jour ou leur priorité.

**Correction nécessaire** : Ajouter une requête Supabase pour récupérer les articles publiés et les inclure dans le sitemap :

```typescript
// À ajouter dans la route /sitemap.xml :
const { data: articlesData } = await adminClient
  .from('articles')
  .select('slug, date_publication')
  .eq('statut', 'publie')
  .order('date_publication', { ascending: false })
  .limit(1000)

const articleUrls = (articlesData ?? []).map(a =>
  `  <url>
    <loc>${baseUrl}/blog/${a.slug}</loc>
    <lastmod>${a.date_publication?.split('T')[0] ?? new Date().toISOString().split('T')[0]}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.6</priority>
  </url>`
).join('\n')
```

#### 3.2.3 Hreflang dans le sitemap — Incohérence

Dans le sitemap actuel, **seules 2 URLs** ont des balises `xhtml:link` hreflang :
- `https://monmenu.app/` (avec hreflang fr + en + x-default)
- `https://monmenu.app/contact` (avec hreflang fr + en)

Les autres URLs (`/inscription`, `/blog`, `/legal/*`, `/:slug`) n'ont pas de hreflang dans le sitemap.

> ⚠️ **Dépendance avec AUDIT-01** : Si l'i18n est retirée (Option A de `AUDIT-01-I18N-DARKMODE-DESIGN.md`), toutes les balises `xhtml:link` hreflang doivent être supprimées du sitemap. Si l'i18n est gelée (Option B), le hreflang peut rester mais ne doit pas être étendu.

#### 3.2.4 Fraîcheur des données sitemap

**Observation** : Le sitemap est généré à chaque requête avec une requête Supabase en temps réel. C'est techniquement correct (données toujours fraîches) mais peut être lent sous charge.

**Recommandation** : Mettre en cache le sitemap pendant 1h (Cloudflare Cache-Control) pour éviter une requête DB à chaque crawl bot :

```typescript
return c.text(sitemap, 200, {
  'Content-Type': 'application/xml; charset=utf-8',
  'Cache-Control': 'public, max-age=3600, stale-while-revalidate=86400'
})
```

#### 3.2.5 Limit 500 sur les boutiques

```typescript
// index.tsx ligne 188
.limit(500)
```

Si MonMenu dépasse 500 restaurants actifs, les boutiques restantes seront absentes du sitemap. À surveiller et adapter avec la croissance.

### 3.3 Sitemap dédié aux boutiques

Actuellement, boutiques et pages institutionnelles sont dans **un seul sitemap**. Pour les grandes plateformes avec de nombreuses boutiques, il est recommandé de créer un **sitemap index** pointant vers des sitemaps séparés :

```xml
<!-- /sitemap-index.xml (à créer) -->
<sitemapindex>
  <sitemap><loc>/sitemap-static.xml</loc></sitemap>
  <sitemap><loc>/sitemap-boutiques.xml</loc></sitemap>
  <sitemap><loc>/sitemap-blog.xml</loc></sitemap>
</sitemapindex>
```

**Priorité** : Faible pour l'instant (< 500 boutiques), à planifier pour la croissance.

---

## POINT 4 — ROBOTS.TXT

### 4.1 Implémentation actuelle

**Fichier** : `src/index.tsx`, lignes 277-288

```
User-agent: *
Allow: /
Disallow: /dashboard/
Disallow: /api/
Disallow: /_internal/

Sitemap: https://monmenu.app/sitemap.xml

# Admin subdomain indexé séparément avec interdiction totale
```

### 4.2 Évaluation de conformité

| Règle | Présente | Correcte | Commentaire |
|-------|---------|---------|-------------|
| Autorisation de toutes les routes publiques | ✅ `Allow: /` | ✅ | Correct |
| Exclusion du dashboard | ✅ `Disallow: /dashboard/` | ✅ | Correct |
| Exclusion des API | ✅ `Disallow: /api/` | ✅ | Correct |
| Exclusion des routes internes | ✅ `Disallow: /_internal/` | ✅ | Correct |
| Lien vers le sitemap | ✅ Dynamique | ✅ | Correct |
| Exclusion de /bienvenue | ❌ Absent | ❌ | Page post-inscription privée |
| Exclusion de /suivi/* | ❌ Absent | ❌ | Expose des tokens de commandes |
| Exclusion de /mot-de-passe-oublie | ❌ Absent | ⚠️ | Semi-publique, peu d'intérêt SEO |

**Statut global** : ✅ Conforme pour les routes admin/API — avec des lacunes sur les pages privées semi-techniques.

### 4.3 Problèmes résiduels

#### 4.3.1 `/suivi/:token` indexable et exposant des tokens

**Fichier** : `src/pages/suivi.ts` — Pas de `<meta name="robots" content="noindex">`

La page `/suivi/TOKEN_COMMANDE` est accessible publiquement et indexable par Google. Elle affiche le détail d'une commande client avec son token. Google peut indexer ces URLs, ce qui :
1. Expose potentiellement des informations de commandes privées aux moteurs de recherche
2. Crée du contenu dupliqué (des milliers de pages quasi-identiques)

**Correction requise** :
```typescript
// suivi.ts — ajouter dans renderHead()
`<meta name="robots" content="noindex, nofollow">`
```

Et dans `robots.txt` :
```
Disallow: /suivi/
```

#### 4.3.2 `/bienvenue` sans noindex malgré protection auth

La page `/bienvenue` est protégée par vérification du cookie JWT (redirection vers `/connexion` si non authentifié). Cependant, un bot non authentifié recevra une **redirection 302** et peut potentiellement indexer la cible de la redirection ou le contenu de la page bienvenue elle-même si le cookie est absent.

**Correction recommandée** :
```typescript
// bienvenue.ts — ajouter dans renderHead()
`<meta name="robots" content="noindex, nofollow">`
```

#### 4.3.3 Commentaire trompeur sur le sous-domaine admin

```
# Admin subdomain indexé séparément avec interdiction totale
```

Ce commentaire fait référence à un sous-domaine admin qui n'est pas documenté dans le code. Il n'existe pas de règle `User-agent` spécifique pour ce sous-domaine dans le `robots.txt`. Ce commentaire est ambigu et potentiellement trompeur.

---

## POINT 5 — URLs PROPRES, REDIRECTIONS 301, HREFLANG FR/EN

### 5.1 Structure des URLs

**URLs statiques** : Structure propre, sans paramètres superflus pour les pages institutionnelles. Slugs en minuscules avec tirets. Cohérent avec les bonnes pratiques SEO.

```
/ → accueil
/contact → contact
/blog → liste articles
/blog/mon-article-slug → article
/tarifs → tarifs
/fonctionnalites → fonctionnalités
/inscription → inscription
/legal/cgu → CGU
/:slug → boutique restaurant
```

**URLs dynamiques boutiques** : Structure `/:slug` (slug du tenant). Propre et crawlable. ✅

**Points d'attention** :

| Pattern URL | Conforme ? | Commentaire |
|------------|-----------|-------------|
| `/legal/cgu`, `/legal/confidentialite` | ✅ | Hiérarchie logique |
| `/suivi/:token` | ⚠️ | Token exposé dans URL, non masqué |
| `/dashboard/*` | ✅ | Route privée correctement protégée |
| `/?lang=en` | ⚠️ | Paramètre de locale dans URL publique — risque duplication |

### 5.2 Redirections 301 — Non conformes

**Fichier** : `src/index.tsx`, lignes 255-272

**Problème** : Les redirections existantes utilisent le code **302 (temporaire)** au lieu du **301 (permanent)** :

```typescript
app.get('/en', (c) => {
  c.header('Set-Cookie', 'monmenu-lang=en; ...')
  return c.redirect('/?lang=en', 302)  // ← 302 FAUX
})
app.get('/fr', (c) => {
  c.header('Set-Cookie', 'monmenu-lang=fr; ...')
  return c.redirect('/', 302)  // ← 302 FAUX
})
```

**Impact SEO** :
- Les redirections 302 ne transfèrent **pas le PageRank** d'une URL vers l'autre
- Si Google a indexé `/en` ou `/fr`, le PageRank de ces pages n'est pas transmis vers `/`
- Google peut continuer à crawler `/en` et `/fr` indéfiniment, gaspillant le crawl budget

**Correction** : Remplacer `302` par `301` dans les 4 routes (`/fr`, `/en`, `/fr/*`, `/en/*`).

### 5.3 Hreflang FR/EN — Implémentation fragmentée et invalide

#### 5.3.1 État d'implémentation

Le hreflang est implémenté à deux niveaux :

**Niveau 1 — Dans les balises `<head>` via `head.ts`** :
```html
<link rel="alternate" hreflang="fr" href="...">
<link rel="alternate" hreflang="en" href="...">
<link rel="alternate" hreflang="x-default" href="...">
```

**Pages avec hreflang dans `<head>`** :
- `home.ts` : ✅ FR + EN + x-default
- `boutique.ts` : ✅ FR + x-default (pas de version EN pour les boutiques — correct)
- Toutes les autres pages : ❌ Aucun hreflang

**Niveau 2 — Dans le sitemap.xml** :
- `https://monmenu.app/` : ✅ FR + EN + x-default
- `https://monmenu.app/contact` : ✅ FR + EN
- Toutes les autres pages : ❌ Aucun hreflang dans le sitemap

#### 5.3.2 Règle fondamentale du hreflang violée

**La règle Google hreflang exige la réciprocité** : Si la page A déclare hreflang vers la page B, la page B doit également déclarer hreflang vers la page A.

**Exemple de violation** : La page d'accueil (`/`) déclare :
```html
<link rel="alternate" hreflang="fr" href="/?lang=fr">
<link rel="alternate" hreflang="en" href="/?lang=en">
```

Mais la page `/?lang=en` ne déclare **pas** de hreflang en retour. Cette réciprocité est impossible avec l'approche actuelle `?lang=en` (paramètre de query string) car les deux versions FR et EN utilisent la **même URL de base** (`/`).

#### 5.3.3 Problème fondamental : hreflang par paramètre ?lang=

Le hreflang Google est conçu pour des **URLs distinctes** par langue. La stratégie MonMenu (même URL + `?lang=en`) est techniquement supportée mais fragile :

```html
<!-- Actuellement dans home.ts -->
<link rel="alternate" hreflang="fr" href="/?lang=fr">
<link rel="alternate" hreflang="en" href="/?lang=en">
```

**Problème** : Google considère `/?lang=fr` et `/?lang=en` comme des variations de la même URL `/`. Sans URLs distinctes (`/fr/...` et `/en/...`), le hreflang est ambigu et peut être ignoré.

#### 5.3.4 Lien avec l'audit Internationalisation

> ⚠️ **DÉPENDANCE DIRECTE** avec `AUDIT-01-I18N-DARKMODE-DESIGN.md` :
>
> - **Si Option A (retrait complet de l'i18n)** : Supprimer TOUS les hreflang du `<head>` (tous les appels `hreflangAlternates` dans `home.ts` et `boutique.ts`) ET supprimer les `xhtml:link` hreflang du `sitemap.xml` dans `index.tsx`.
>
> - **Si Option B (gel en FR)** : Conserver les hreflang existants mais ne plus les étendre. L'implémentation actuelle reste valide côté FR, et la version EN `?lang=en` devient inaccessible (cookie bloqué) mais les balises pointent vers des URLs qui redirigent.
>
> **Recommandation SEO** : Si l'i18n est retirée (Option A), retirer le hreflang est la décision correcte. Le hreflang incomplet (présent sur 2 pages seulement) est pire que son absence totale.

### 5.4 Canonical tags — Problème systémique

**Problème** : Le canonical par défaut dans `head.ts` est `https://monmenu.app/` pour toutes les pages qui ne passent pas explicitement `canonicalUrl` dans leurs options.

```typescript
// head.ts ligne 47
canonicalUrl = canonicalUrlLegacy,  // ← hérite de la valeur passée ou ''
// ...
// head.ts ligne 34 (défaut si non spécifié)
canonicalUrlLegacy: string = `${BASE_URL}/`  // = https://monmenu.app/
```

**Pages avec canonical incorrect** :

| Page | Canonical actuel | Canonical attendu |
|------|-----------------|-------------------|
| `/contact` | `https://monmenu.app/` | `https://monmenu.app/contact` |
| `/blog` | `https://monmenu.app/` | `https://monmenu.app/blog` |
| `/tarifs` | `https://monmenu.app/` | `https://monmenu.app/tarifs` |
| `/inscription` | `https://monmenu.app/` | `https://monmenu.app/inscription` |
| `/legal/cgu` | `https://monmenu.app/` | `https://monmenu.app/legal/cgu` |
| `/legal/confidentialite` | `https://monmenu.app/` | `https://monmenu.app/legal/confidentialite` |
| `/legal/mentions` | `https://monmenu.app/` | `https://monmenu.app/legal/mentions` |
| `/legal/cookies` | `https://monmenu.app/` | `https://monmenu.app/legal/cookies` |

**Impact** : Google peut déprécier ces pages dans l'index car elles "déclarent" être des duplicates de l'accueil.

**Correction** : Passer `canonicalUrl` explicitement pour chaque page dans leurs appels `renderHead()`.

---

## POINT 6 — PAGES SEO PROGRAMMATIQUES VILLE/BESOIN

### 6.1 État des lieux

**Constat** : Il n'existe **aucune page SEO programmatique ville/besoin** dans le code actuel. Aucune route ni page pour :
- `/restaurants/ouagadougou` — restaurants à Ouagadougou
- `/restaurants/bobo-dioulasso` — restaurants à Bobo-Dioulasso
- `/livraison/ouagadougou` — livraison à Ouagadougou
- `/restaurants/pizza` — restaurants pizza
- `/restaurants/africain` — cuisine africaine
- etc.

### 6.2 Opportunité SEO manquée

MonMenu dispose de **données riches** en base de données (tenants avec villes, types de cuisine potentiels) mais ne génère aucune page SEO de type "annuaire" permettant de capturer du trafic informationnel/navigationnel.

**Requêtes SEO potentielles non couvertes** :
- "Commander à manger Ouagadougou"
- "Restaurant livraison Burkina Faso"
- "Boutique en ligne restaurant [nom de ville]"
- "Menu restaurant [type cuisine] [ville]"

### 6.3 Recommandations pour les pages programmatiques

**Architecture suggérée** :

```
/restaurants                    → Liste tous les restaurants actifs
/restaurants/ouagadougou        → Restaurants à Ouagadougou
/restaurants/bobo-dioulasso     → Restaurants à Bobo-Dioulasso
/restaurants/[type-cuisine]     → Restaurants par type de cuisine
```

**Exigences SEO pour ces pages** :

1. **Contenu différencié** : Chaque page ville doit avoir un H1 unique, une description unique, et un contenu différenciant (nombre de restaurants, plats populaires, etc.)
2. **Pas de duplication** : Le contenu doit être unique par ville/besoin, pas simplement une liste filtrée avec le même template
3. **Indexabilité** : Pages incluses dans le sitemap avec `lastmod` dynamique
4. **JSON-LD ItemList** pour chaque page de liste
5. **Maillage interne** : Liens depuis les boutiques vers leur page ville respective

**Exemple de structure SEO pour une page ville** :

```typescript
// route : app.get('/restaurants/:ville', async (c) => {...})
renderHead(
  `Commander dans les restaurants de ${ville} | MonMenu`,
  `Découvrez ${nbRestaurants} restaurants à ${ville} sur MonMenu. Commander en ligne, livraison disponible.`,
  nomProjet,
  '', `https://monmenu.app/restaurants/${slugVille}`,
  {
    ogType: 'website',
    jsonLd: {
      '@context': 'https://schema.org',
      '@type': 'ItemList',
      name: `Restaurants à ${ville}`,
      itemListElement: restaurants.map((r, i) => ({
        '@type': 'ListItem',
        position: i + 1,
        item: {
          '@type': 'Restaurant',
          name: r.nom,
          url: `https://monmenu.app/${r.slug}`
        }
      }))
    }
  }
)
```

**Priorité** : 🔴 Élevée — C'est l'une des plus grandes opportunités SEO manquées pour une plateforme de type annuaire.

---

## PARTIE — RISQUES SEO IDENTIFIÉS

### Risques critiques (à traiter immédiatement)

| Risque | Localisation | Impact | Mitigation |
|--------|-------------|--------|------------|
| Image `og-image.png` absente | `head.ts:34`, tous les fichiers | ❌ Élevé — partage social cassé | Créer et déployer l'image |
| URL canonique par défaut `/` sur 8+ pages | `head.ts:47`, toutes pages sans canonical | ❌ Élevé — duplication perçue par Google | Passer canonical explicite sur chaque page |
| URL canonique article basée sur titre (pas slug) | `article.ts:27` | ❌ Élevé — double indexation articles | Ajouter `slug` dans SELECT + `renderArticlePage` |
| Pages `/tarifs` et `/fonctionnalites` absentes du sitemap | `index.tsx:220-248` | 🔴 Moyen — pages non prioritaires pour Google | Ajouter dans sitemap |
| Articles de blog `/blog/:slug` absents du sitemap | `index.tsx` — absent | 🔴 Moyen — discovery lente des articles | Ajouter requête articles dans sitemap |

### Risques moyens

| Risque | Localisation | Impact | Mitigation |
|--------|-------------|--------|------------|
| Redirections 302 au lieu de 301 sur /fr et /en | `index.tsx:256-272` | 🟡 Moyen — PageRank non transféré | Changer 302 → 301 |
| `/suivi/:token` indexable, expose tokens commandes | `suivi.ts` | 🟡 Moyen — données privées indexées | Ajouter `noindex` + `Disallow: /suivi/` |
| `addressCountry: 'BF'` hardcodé pour tous les pays | `head.ts:251` | 🟡 Moyen — données structurées incorrectes pour CI, SN, etc. | Récupérer le pays depuis données tenant |
| Contenu dupliqué `/inscription` vs `/creer-compte` | `inscription.ts`, `auth.ts` | 🟡 Moyen — deux pages de conversion similaires | Canonical de `/creer-compte` → `/inscription` |

### Risques faibles

| Risque | Localisation | Impact | Mitigation |
|--------|-------------|--------|------------|
| SearchAction blog (`?q=`) non fonctionnel | `head.ts:183` | 🟢 Faible — Schema trompeur | Implémenter la recherche ou retirer le SearchAction |
| `sameAs: []` vide dans Organization | `head.ts:169` | 🟢 Faible — opportunité ratée | Ajouter URLs réseaux sociaux |
| Hreflang incomplet (2 pages sur 19) | `home.ts`, sitemap | 🟢 Faible si i18n retirée | Retirer avec l'i18n (AUDIT-01) |
| Cache-Control absent sur sitemap.xml | `index.tsx:253` | 🟢 Faible | Ajouter `Cache-Control: max-age=3600` |
| `/bienvenue` sans noindex | `bienvenue.ts:17` | 🟢 Faible — accès protégé par auth | Ajouter noindex par sécurité |

---

## TABLEAU DE CONFORMITÉ DÉTAILLÉ PAR EXIGENCE

### Exigence 1 — Meta tags, OG, Twitter Card

| Page | title | description | og:title | og:desc | og:type | og:image | og:locale | twitter:card | Bilan |
|------|-------|------------|---------|---------|---------|----------|-----------|-------------|-------|
| `/` | ✅ | ✅ | ✅ | ✅ | ✅ website | ❌ manquante | ✅ fr_FR | ✅ | ⚠️ Partiel |
| `/blog` | ✅ | ✅ | ✅ | ✅ | ✅ website | ❌ manquante | ✅ fr_FR | ✅ | ⚠️ Partiel |
| `/blog/:slug` | ✅ | ✅ | ✅ | ✅ | ✅ article | ✅ (si image) | ✅ | ✅ | ✅ Bon |
| `/tarifs` | ✅ | ✅ | ✅ | ✅ | ⚠️ website | ❌ manquante | ✅ fr_FR | ✅ | ⚠️ Partiel |
| `/contact` | ✅ | ✅ | ✅ | ✅ | ⚠️ website | ❌ manquante | ✅ fr_FR | ✅ | ⚠️ Partiel |
| `/inscription` | ✅ | ✅ | ✅ | ✅ | ⚠️ website | ❌ manquante | ✅ fr_FR | ✅ | ⚠️ Partiel |
| `/:slug` | ✅ | ✅ | ✅ | ✅ | ✅ website | ✅ (logo) | ✅ fr_FR | ✅ | ✅ Bon |
| `/legal/*` | ✅ | ✅ | ✅ | ✅ | ⚠️ website | ❌ manquante | ✅ fr_FR | ✅ | ⚠️ Partiel |

**Verdict global Exigence 1** : ⚠️ **PARTIEL** — Bases présentes, image OG manquante sur toutes les pages, canonical incorrect sur 8+ pages.

### Exigence 2 — Schema.org

| Type de schéma | Page | Présent | Complet | Valide | Bilan |
|----------------|------|---------|---------|--------|-------|
| Organization | `/` | ✅ | ⚠️ sameAs vide, logo manquant | ✅ | ⚠️ Partiel |
| WebSite + SearchAction | `/` | ✅ | ⚠️ search non fonctionnel | ✅ | ⚠️ Partiel |
| BlogPosting | `/blog/:slug` | ✅ | ⚠️ URL canonique incorrecte | ✅ | ⚠️ Partiel |
| Restaurant | `/:slug` | ✅ | ❌ ville, tel, pays manquants | ⚠️ | ❌ Non conforme |
| Blog/ItemList | `/blog` | ❌ | — | — | ❌ Absent |
| ContactPage | `/contact` | ❌ | — | — | ❌ Absent |
| Offer/Product | `/tarifs` | ❌ | — | — | ❌ Absent |

**Verdict global Exigence 2** : ⚠️ **PARTIEL** — Schema présent sur les pages clés mais incomplet (données manquantes) et absent sur les pages secondaires importantes.

### Exigence 3 — Sitemap.xml

| Élément | Présent | Conforme | Bilan |
|---------|---------|---------|-------|
| Sitemap accessible `/sitemap.xml` | ✅ | ✅ | ✅ |
| Pages institutionnelles | ⚠️ | ❌ /tarifs et /fonctionnalites manquants | ⚠️ |
| Boutiques restaurants dynamiques | ✅ | ✅ (limit 500) | ✅ |
| Articles de blog | ❌ | ❌ | ❌ |
| hreflang dans sitemap (si i18n) | ⚠️ | ❌ Partiel (2/19 pages) | ❌ |
| `lastmod` sur les entrées | ✅ boutiques | ❌ absente sur institutionnelles | ⚠️ |
| Cache-Control | ❌ | ❌ | ❌ |

**Verdict global Exigence 3** : ⚠️ **PARTIEL** — Sitemap fonctionnel mais incomplet (pages et articles manquants).

### Exigence 4 — robots.txt

| Élément | Présent | Conforme | Bilan |
|---------|---------|---------|-------|
| `User-agent: *` | ✅ | ✅ | ✅ |
| `Allow: /` | ✅ | ✅ | ✅ |
| `Disallow: /dashboard/` | ✅ | ✅ | ✅ |
| `Disallow: /api/` | ✅ | ✅ | ✅ |
| `Disallow: /suivi/` | ❌ | ❌ | ❌ |
| `Disallow: /bienvenue` | ❌ | ❌ | ⚠️ |
| `Sitemap:` | ✅ | ✅ | ✅ |

**Verdict global Exigence 4** : ✅ **CONFORME** avec lacunes mineures sur /suivi/ et /bienvenue.

### Exigence 5 — URLs propres, redirections 301, hreflang

| Élément | Conforme | Problème | Bilan |
|---------|---------|---------|-------|
| Structure URLs propres | ✅ | — | ✅ |
| Slugs en minuscules | ✅ | — | ✅ |
| Redirections 302→301 sur /fr et /en | ❌ | 302 au lieu de 301 | ❌ |
| hreflang présent sur toutes pages | ❌ | 17/19 pages sans hreflang | ❌ |
| Canonical correct sur toutes pages | ❌ | 8+ pages avec canonical `/` | ❌ |

**Verdict global Exigence 5** : ❌ **NON CONFORME** — Multiple problèmes de redirections et de canonicals.

### Exigence 6 — Pages SEO programmatiques ville/besoin

| Élément | Présent | Bilan |
|---------|---------|-------|
| Route `/restaurants/:ville` | ❌ | ❌ |
| Route `/restaurants/:type` | ❌ | ❌ |
| Contenu différencié par ville | ❌ | ❌ |
| Maillage interne boutiques → villes | ❌ | ❌ |

**Verdict global Exigence 6** : ❌ **ABSENT** — Aucune page programmatique implémentée.

---

## FICHIERS À CRÉER OU MODIFIER

| Action | Fichier | Description | Priorité |
|--------|---------|-------------|---------|
| Créer | `public/static/img/og-image.png` | Image OG 1200×630px — critique pour tout le site | 🔴 |
| Modifier | `src/pages/article.ts` | Ajouter `slug` dans SELECT + passer slug à renderArticlePage | 🔴 |
| Modifier | `src/index.tsx` | Corriger canonical `/blog` → `https://monmenu.app/blog` | 🔴 |
| Modifier | `src/index.tsx` | Redirections 302 → 301 sur /fr et /en | 🔴 |
| Modifier | `src/index.tsx` | Ajouter /tarifs et /fonctionnalites dans sitemap | 🔴 |
| Modifier | `src/index.tsx` | Ajouter articles de blog dans sitemap | 🔴 |
| Modifier | `src/pages/suivi.ts` | Ajouter `<meta name="robots" content="noindex, nofollow">` | 🔴 |
| Modifier | `src/index.tsx` | Ajouter `Disallow: /suivi/` dans robots.txt | 🟡 |
| Modifier | `src/pages/contact.ts` | Passer canonical `https://monmenu.app/contact` | 🟡 |
| Modifier | `src/pages/tarifs.ts` | Passer canonical `https://monmenu.app/tarifs` | 🟡 |
| Modifier | `src/pages/blog.ts` | Passer canonical `https://monmenu.app/blog` | 🟡 |
| Modifier | `src/pages/legal.ts` | Passer canonical dynamique `/legal/{type}` | 🟡 |
| Modifier | `src/pages/inscription.ts` | Passer canonical `https://monmenu.app/inscription` | 🟡 |
| Modifier | `src/pages/auth.ts` (`/creer-compte`) | Ajouter canonical `/inscription` (éviter duplication) | 🟡 |
| Modifier | `src/components/head.ts` | `jsonLdOrganization()` : ajouter sameAs, corriger logo | 🟡 |
| Modifier | `src/components/head.ts` | `jsonLdRestaurant()` : passer pays dynamique (pas 'BF' hardcodé) | 🟡 |
| Modifier | `src/pages/boutique.ts` | Passer `ville` et `telephone` à `jsonLdRestaurant()` | 🟡 |
| Modifier | `src/pages/bienvenue.ts` | Ajouter `noindex, nofollow` | 🟢 |
| Modifier | `src/index.tsx` | Cache-Control sur sitemap.xml | 🟢 |
| Créer | `src/pages/restaurants.ts` | Pages SEO programmatiques ville | 🔴 Long terme |
| Modifier | `src/index.tsx` | Routes `/restaurants/:ville` + `/restaurants/:type` | 🔴 Long terme |

---

## DÉPENDANCE AVEC AUDIT-01-I18N-DARKMODE-DESIGN.md

> ⚠️ **Ce point doit être lu conjointement avec `AUDIT-01-I18N-DARKMODE-DESIGN.md`**

| Point SEO | Dépendance avec AUDIT-01 |
|-----------|--------------------------|
| Hreflang FR/EN sur home.ts | Si i18n retirée (Option A) : retirer les hreflangAlternates de home.ts et de boutique.ts |
| Hreflang dans sitemap.xml | Si i18n retirée (Option A) : retirer les `xhtml:link` du sitemap dans index.tsx |
| Redirections /fr et /en | Si i18n retirée (Option A) : conserver les redirections 301 (correction 302→301 requise) jusqu'à déindexation des URLs EN |
| `?lang=en` dans canonical | Si i18n retirée (Option A) : URL `/?lang=en` ne doit plus être générée nulle part |
| ogLocale en_US / fr_FR | Si i18n retirée (Option A) : forcer `ogLocale = 'fr_FR'` partout |

**Scénario recommandé** :
1. Appliquer Option B (gel FR) de AUDIT-01 — immédiat
2. Vérifier Google Search Console pour URLs EN indexées
3. Si URLs EN indexées : corriger 302 → 301, attendre déindexation
4. Appliquer Option A (retrait complet) + supprimer hreflang

---

## PLAN D'ACTION PRIORISÉ

### Phase 1 — Corrections critiques (< 1 semaine)

| # | Action | Effort | Impact SEO |
|---|--------|--------|------------|
| 1.1 | Créer `public/static/img/og-image.png` (1200×630px) | 2h | ❌→✅ Image OG partout |
| 1.2 | Corriger URL canonique articles (`slug` dans SELECT) | 1h | ❌→✅ Canonical articles |
| 1.3 | Corriger canonical par défaut sur toutes les pages | 2h | ❌→✅ Pas de duplication vers `/` |
| 1.4 | Ajouter /tarifs + /fonctionnalites dans sitemap.xml | 30min | ⚠️→✅ Pages indexables |
| 1.5 | Ajouter articles blog dans sitemap.xml | 1h | ❌→✅ Articles découvrables |
| 1.6 | Ajouter `noindex` sur `/suivi/:token` | 30min | ❌→✅ Tokens non indexés |
| 1.7 | Corriger redirections 302 → 301 sur /fr et /en | 15min | ❌→✅ PageRank préservé |

**Total Phase 1** : ~7 heures

### Phase 2 — Améliorations moyennes (1-2 semaines)

| # | Action | Effort | Impact SEO |
|---|--------|--------|------------|
| 2.1 | Ajouter `Disallow: /suivi/` dans robots.txt | 15min | Sécurité crawl |
| 2.2 | Corriger `addressCountry` dynamique dans JSON-LD Restaurant | 1h | Données structurées correctes |
| 2.3 | Ajouter `ville` et `telephone` à `jsonLdRestaurant()` | 1h | Rich Snippets améliorés |
| 2.4 | Ajouter `sameAs` dans Organization JSON-LD | 30min | E-A-T Google amélioré |
| 2.5 | Ajouter canonical explicite sur contact, tarifs, blog, legal | 1h | Déduplication complète |
| 2.6 | Ajouter schema `ContactPage` sur `/contact` | 1h | Rich Snippet contact |
| 2.7 | Ajouter `Cache-Control` sur sitemap.xml | 15min | Performance crawl |

**Total Phase 2** : ~5 heures

### Phase 3 — Développements SEO long terme (1-3 mois)

| # | Action | Effort | Impact SEO |
|---|--------|--------|------------|
| 3.1 | Créer pages SEO programmatiques ville (5-10 villes clés BF) | 3-5 jours | 🔴 Très élevé |
| 3.2 | Créer pages SEO programmatiques type cuisine | 2-3 jours | 🔴 Élevé |
| 3.3 | Implémenter sitemap index (static + boutiques + blog) | 1 jour | Moyen |
| 3.4 | Décision finale i18n + nettoyage hreflang (cf. AUDIT-01) | 1-4 jours | Dépend choix |
| 3.5 | Ajouter `dateModified` dans BlogPosting JSON-LD | 2h | Moyen (Google News) |

---

*Rapport généré le 2026-07-29 — Audit SEO technique complet du dépôt `poodasamuelpro/monmenu`*  
*Aucune modification de code n'a été effectuée dans le cadre de cet audit.*  
*À lire conjointement avec : `AUDIT-01-I18N-DARKMODE-DESIGN.md`*
