// =============================================================
// COMPOSANT HEAD — <head> commun à toutes les pages
// Mise à jour : passage du dark mode en stratégie "class" (Tailwind)
// + script anti-flash (FOUC) exécuté avant tout rendu visible.
// Voir notes/INTEGRATION-DARK-MODE.md pour le détail de ce choix.
// §4 Phase 3 : SEO étendu (OG complet, Twitter Card, JSON-LD, hreflang)
// =============================================================

export interface HeadSeoOptions {
  /** URL canonique absolue (ex: https://monmenu.app/blog/mon-article) */
  canonicalUrl?: string
  /** URL de l'image Open Graph (1200×630 recommandé) */
  ogImage?: string
  /** Type Open Graph (ex: 'website', 'article', 'restaurant') */
  ogType?: string
  /** Locale OG (ex: 'fr_FR', 'en_US') */
  ogLocale?: string
  /** JSON-LD schema.org sérialisé (objet JS — sera JSON.stringify-é) */
  jsonLd?: Record<string, unknown>
  /** Paires hreflang : [{ lang: 'fr', url: '...' }, { lang: 'en', url: '...' }] */
  hreflangAlternates?: Array<{ lang: string; url: string }>
  /** Balise robots (ex: 'noindex, nofollow' pour le dashboard) */
  robots?: string
  /** Balises <meta> ou <script> supplémentaires à insérer dans le <head> */
  extra?: string
  /** Twitter handle (ex: '@monmenu_app') */
  twitterSite?: string
  /** URL de publication article (pour og:article:published_time) */
  articlePublishedTime?: string
  /** Auteur de l'article */
  articleAuthor?: string
}

const DEFAULT_OG_IMAGE = 'https://monmenu.app/static/img/og-image.png'
const DEFAULT_TWITTER_SITE = '@monmenu_app'
const BASE_URL = 'https://monmenu.app'

export function renderHead(
  title: string,
  description: string,
  nomProjet: string,
  /** @deprecated Utiliser seoOptions.extra à la place. Conservé pour compatibilité. */
  extra: string = '',
  /** @deprecated Utiliser seoOptions.canonicalUrl à la place. Conservé pour compatibilité. */
  canonicalUrlLegacy: string = `${BASE_URL}/`,
  seoOptions: HeadSeoOptions = {}
): string {
  const {
    canonicalUrl = canonicalUrlLegacy,
    ogImage = DEFAULT_OG_IMAGE,
    ogType = 'website',
    ogLocale = 'fr_FR',
    jsonLd,
    hreflangAlternates = [],
    robots,
    twitterSite = DEFAULT_TWITTER_SITE,
    articlePublishedTime,
    articleAuthor
  } = seoOptions

  const extraContent = seoOptions.extra ?? extra

  // --- JSON-LD ---
  const jsonLdTag = jsonLd
    ? `<script type="application/ld+json">${JSON.stringify(jsonLd)}</script>`
    : ''

  // --- hreflang ---
  const hreflangTags = hreflangAlternates
    .map((h) => `  <link rel="alternate" hreflang="${h.lang}" href="${h.url}">`)
    .join('\n')

  // --- Balises article (og:article) ---
  const articleTags = ogType === 'article'
    ? [
        articlePublishedTime ? `  <meta property="article:published_time" content="${articlePublishedTime}">` : '',
        articleAuthor ? `  <meta property="article:author" content="${articleAuthor}">` : ''
      ].filter(Boolean).join('\n')
    : ''

  return `<!DOCTYPE html>
<html lang="${ogLocale.slice(0, 2)}">
<head>
  <meta charset="UTF-8">

  <!-- Anti-flash (FOUC) — DOIT rester tout en haut du <head>, avant tout
       CSS/contenu visible, pour appliquer le thème sombre avant le premier
       rendu si l'utilisateur l'a choisi (ou si son OS est en sombre). -->
  <script>
    (function() {
      var t = localStorage.getItem('monmenu-theme') || 'system';
      var sombre = t === 'dark' || (t === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
      if (sombre) document.documentElement.classList.add('dark');
    })();
  </script>

  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  ${robots ? `<meta name="robots" content="${robots}">` : ''}
  <title>${title}</title>
  <meta name="description" content="${description}">

  <!-- Canonical -->
  <link rel="canonical" href="${canonicalUrl}">

  <!-- hreflang §3 i18n -->
${hreflangTags}

  <!-- Open Graph -->
  <meta property="og:title" content="${title}">
  <meta property="og:description" content="${description}">
  <meta property="og:type" content="${ogType}">
  <meta property="og:url" content="${canonicalUrl}">
  <meta property="og:image" content="${ogImage}">
  <meta property="og:locale" content="${ogLocale}">
  <meta property="og:site_name" content="${nomProjet}">
${articleTags}

  <!-- Twitter Card -->
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:site" content="${twitterSite}">
  <meta name="twitter:title" content="${title}">
  <meta name="twitter:description" content="${description}">
  <meta name="twitter:image" content="${ogImage}">

  <!-- JSON-LD Schema.org -->
${jsonLdTag}

  <link rel="icon" type="image/svg+xml" href="/static/img/favicon.svg">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@fortawesome/fontawesome-free@6.5.0/css/all.min.css">

  <!-- Config Tailwind : DOIT être déclarée avant le <script src="...tailwindcss.com">
       pour que darkMode:'class' soit pris en compte (sinon Tailwind retombe sur
       la stratégie "media" basée uniquement sur l'OS, ce qui casse le bouton
       de bascule manuelle #dark-toggle géré par static/js/main.js). -->
  <script>
    tailwind.config = {
      darkMode: 'class',
      theme: {
        extend: {
          colors: {
            brand: { red: '#DC2626', 'red-dark': '#B91C1C', blue: '#1D4ED8', 'blue-dark': '#1E40AF' },
            neutral: { 50: '#FAFAFA', 900: '#111827' }
          },
          fontFamily: { sans: ['Inter', 'sans-serif'] }
        }
      }
    }
  </script>
  <script src="https://cdn.tailwindcss.com"></script>
  <link rel="stylesheet" href="/static/css/main.css">
  ${extraContent}
</head>`
}

// =============================================================
// Helpers pour générer les JSON-LD spécifiques par type de page
// =============================================================

/** JSON-LD Organization pour la page d'accueil/institutionnelle */
export function jsonLdOrganization(nomProjet: string): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: nomProjet,
    url: 'https://monmenu.app',
    logo: 'https://monmenu.app/static/img/og-image.png',
    sameAs: [],
    contactPoint: {
      '@type': 'ContactPoint',
      contactType: 'customer support',
      availableLanguage: ['French', 'English']
    }
  }
}

/** JSON-LD WebSite avec SearchAction */
export function jsonLdWebSite(nomProjet: string): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: nomProjet,
    url: 'https://monmenu.app',
    potentialAction: {
      '@type': 'SearchAction',
      target: { '@type': 'EntryPoint', urlTemplate: 'https://monmenu.app/blog?q={search_term_string}' },
      'query-input': 'required name=search_term_string'
    }
  }
}

/** JSON-LD Article/BlogPosting pour les articles de blog */
export function jsonLdArticle(opts: {
  title: string
  description: string
  imageUrl: string | null
  datePublished: string | null
  author: string | null
  url: string
  nomProjet: string
}): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'BlogPosting',
    headline: opts.title,
    description: opts.description,
    image: opts.imageUrl ?? 'https://monmenu.app/static/img/og-image.png',
    datePublished: opts.datePublished ?? undefined,
    author: opts.author
      ? { '@type': 'Person', name: opts.author }
      : { '@type': 'Organization', name: opts.nomProjet },
    publisher: {
      '@type': 'Organization',
      name: opts.nomProjet,
      logo: { '@type': 'ImageObject', url: 'https://monmenu.app/static/img/og-image.png' }
    },
    mainEntityOfPage: { '@type': 'WebPage', '@id': opts.url }
  }
}

/** JSON-LD Restaurant pour les boutiques dynamiques */
export function jsonLdRestaurant(opts: {
  nom: string
  description?: string | null
  logoUrl?: string | null
  adresse?: string | null
  ville?: string | null
  latitude?: number | null
  longitude?: number | null
  horaires?: string | null
  url: string
}): Record<string, unknown> {
  const geo = opts.latitude && opts.longitude
    ? { '@type': 'GeoCoordinates', latitude: opts.latitude, longitude: opts.longitude }
    : undefined

  return {
    '@context': 'https://schema.org',
    '@type': 'Restaurant',
    name: opts.nom,
    description: opts.description ?? `Commandez en ligne chez ${opts.nom}`,
    image: opts.logoUrl ?? 'https://monmenu.app/static/img/og-image.png',
    url: opts.url,
    ...(opts.adresse || opts.ville ? {
      address: {
        '@type': 'PostalAddress',
        streetAddress: opts.adresse ?? undefined,
        addressLocality: opts.ville ?? undefined,
        addressCountry: 'BF'
      }
    } : {}),
    ...(geo ? { geo } : {}),
    servesCuisine: 'Cuisine africaine',
    acceptsReservations: false,
    hasMenu: opts.url,
    paymentAccepted: 'Cash, Mobile Money'
  }
}
