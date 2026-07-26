import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { logger } from 'hono/logger'
import { serveStatic } from 'hono/cloudflare-workers'
import type { Env } from './types/database'
import { commandesRouter } from './routes/api-commandes'
import { tenantsRouter } from './routes/api-tenants'
import { livraisonRouter } from './routes/api-livraison'
import { plansRouter } from './routes/api-plans'
import { setSecurityHeaders } from './lib/security'
import { getNomProjet } from './lib/supabase'

const app = new Hono<{ Bindings: Env }>()

// ---- Middleware globaux ----
app.use('*', logger())

app.use('/api/*', cors({
  origin: ['https://monmenu.app', 'http://localhost:5173', 'http://localhost:3000'],
  allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization', 'X-Idempotency-Key'],
  exposeHeaders: ['X-Cache', 'X-RateLimit-Remaining']
}))

// ---- Fichiers statiques ----
app.use('/static/*', serveStatic({ root: './' }))
app.use('/favicon.ico', serveStatic({ path: './favicon.ico' }))

// ---- Routes API ----
app.route('/api/v1/commandes', commandesRouter)
app.route('/api/v1/tenants', tenantsRouter)
app.route('/api/v1/livraison', livraisonRouter)
app.route('/api/v1/plans', plansRouter)

// ---- Sitemap dynamique ----
app.get('/sitemap.xml', async (c) => {
  const tenants = await c.env.DB
    .prepare("SELECT slug, updated_at FROM tenants WHERE statut = 'actif' AND deleted_at IS NULL")
    .all<{ slug: string; updated_at: string }>()

  const baseUrl = 'https://monmenu.app'
  const restaurantUrls = tenants.results.map((t) =>
    `  <url>
    <loc>${baseUrl}/${t.slug}</loc>
    <lastmod>${t.updated_at.split('T')[0]}</lastmod>
    <changefreq>daily</changefreq>
    <priority>0.7</priority>
  </url>`
  ).join('\n')

  const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:xhtml="http://www.w3.org/1999/xhtml">
  <url>
    <loc>${baseUrl}/</loc>
    <changefreq>weekly</changefreq>
    <priority>1.0</priority>
    <xhtml:link rel="alternate" hreflang="fr" href="${baseUrl}/fr/"/>
    <xhtml:link rel="alternate" hreflang="en" href="${baseUrl}/en/"/>
  </url>
  <url>
    <loc>${baseUrl}/fonctionnalites</loc>
    <changefreq>monthly</changefreq>
    <priority>0.9</priority>
  </url>
  <url>
    <loc>${baseUrl}/tarifs</loc>
    <changefreq>weekly</changefreq>
    <priority>0.9</priority>
  </url>
  <url>
    <loc>${baseUrl}/contact</loc>
    <changefreq>monthly</changefreq>
    <priority>0.6</priority>
  </url>
  <url>
    <loc>${baseUrl}/blog</loc>
    <changefreq>weekly</changefreq>
    <priority>0.8</priority>
  </url>
${restaurantUrls}
</urlset>`

  return c.text(sitemap, 200, { 'Content-Type': 'application/xml; charset=utf-8' })
})

// ---- robots.txt ----
app.get('/robots.txt', (c) => {
  return c.text(`User-agent: *
Allow: /
Disallow: /dashboard/
Disallow: /api/
Disallow: /_internal/

Sitemap: https://monmenu.app/sitemap.xml

# Admin subdomain indexé séparément avec interdiction totale
`)
})

// ---- Page de suivi commande ----
app.get('/suivi/:token', async (c) => {
  setSecurityHeaders(c)
  const token = c.req.param('token')
  const nomProjet = await getNomProjet(c.env)
  return c.html(renderSuiviPage(token, nomProjet))
})

// ---- Page boutique restaurant ----
app.get('/:slug', async (c) => {
  setSecurityHeaders(c)
  const slug = c.req.param('slug')

  if (['fr', 'en', 'blog', 'contact', 'tarifs', 'fonctionnalites', 'legal'].includes(slug)) {
    return c.notFound()
  }

  // Vérifier que le restaurant existe
  const tenant = await c.env.DB
    .prepare("SELECT id, nom, slug, logo_url, banniere_url, couleur_primaire, couleur_secondaire, whatsapp_number FROM tenants WHERE slug = ? AND statut IN ('actif', 'essai') AND deleted_at IS NULL")
    .bind(slug)
    .first<{
      id: string; nom: string; slug: string; logo_url: string | null
      banniere_url: string | null; couleur_primaire: string; couleur_secondaire: string
      whatsapp_number: string
    }>()

  if (!tenant) {
    return c.html(render404Page(), 404)
  }

  const nomProjet = await getNomProjet(c.env)
  return c.html(renderBoutiquePage(tenant, nomProjet))
})

// ---- Page d'accueil ----
app.get('/', async (c) => {
  setSecurityHeaders(c)
  const nomProjet = await getNomProjet(c.env)
  return c.html(renderHomePage(nomProjet))
})

// ---- Pages institutionnelles ----
app.get('/fonctionnalites', async (c) => {
  setSecurityHeaders(c)
  const nomProjet = await getNomProjet(c.env)
  return c.html(renderFonctionnalitesPage(nomProjet))
})

app.get('/tarifs', async (c) => {
  setSecurityHeaders(c)
  const nomProjet = await getNomProjet(c.env)
  return c.html(renderTarifsPage(nomProjet))
})

app.get('/contact', async (c) => {
  setSecurityHeaders(c)
  const nomProjet = await getNomProjet(c.env)
  return c.html(renderContactPage(nomProjet))
})

app.get('/dashboard', async (c) => {
  setSecurityHeaders(c)
  const nomProjet = await getNomProjet(c.env)
  return c.html(renderDashboardLoginPage(nomProjet))
})

app.get('/dashboard/*', async (c) => {
  setSecurityHeaders(c)
  const nomProjet = await getNomProjet(c.env)
  return c.html(renderDashboardPage(nomProjet))
})

// ---- 404 ----
app.notFound((c) => {
  return c.html(render404Page(), 404)
})

// ---- Erreurs globales ----
app.onError((err, c) => {
  console.error('[MonMenu Error]', err)
  return c.json({ error: 'Erreur interne du serveur.' }, 500)
})

// ==============================
// RENDUS HTML
// ==============================

function renderHead(title: string, description: string, nomProjet: string, extra: string = ''): string {
  return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  <meta name="description" content="${description}">
  <meta property="og:title" content="${title}">
  <meta property="og:description" content="${description}">
  <meta property="og:type" content="website">
  <meta property="og:image" content="https://monmenu.app/static/img/og-image.png">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${title}">
  <meta name="twitter:description" content="${description}">
  <link rel="canonical" href="https://monmenu.app/">
  <link rel="icon" type="image/svg+xml" href="/static/img/favicon.svg">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@fortawesome/fontawesome-free@6.5.0/css/all.min.css">
  <script src="https://cdn.tailwindcss.com"></script>
  <link rel="stylesheet" href="/static/css/main.css">
  ${extra}
  <script>
    tailwind.config = {
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
</head>`
}

function renderNav(nomProjet: string, activePage: string = ''): string {
  return `
<header class="bg-white border-b border-gray-100 sticky top-0 z-50 shadow-sm">
  <nav class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
    <div class="flex items-center justify-between h-16">
      <a href="/" class="flex items-center gap-2 font-bold text-xl text-red-600">
        <i class="fa-solid fa-utensils"></i>
        <span>${nomProjet}</span>
      </a>
      
      <div class="hidden md:flex items-center gap-6">
        <a href="/fonctionnalites" class="text-sm font-medium ${activePage === 'fonctionnalites' ? 'text-red-600' : 'text-gray-600 hover:text-gray-900'} transition-colors">Fonctionnalités</a>
        <a href="/tarifs" class="text-sm font-medium ${activePage === 'tarifs' ? 'text-red-600' : 'text-gray-600 hover:text-gray-900'} transition-colors">Tarifs</a>
        <a href="/blog" class="text-sm font-medium ${activePage === 'blog' ? 'text-red-600' : 'text-gray-600 hover:text-gray-900'} transition-colors">Blog</a>
        <a href="/contact" class="text-sm font-medium ${activePage === 'contact' ? 'text-red-600' : 'text-gray-600 hover:text-gray-900'} transition-colors">Contact</a>
      </div>
      
      <div class="flex items-center gap-3">
        <a href="/dashboard" class="hidden sm:inline-flex items-center gap-1.5 text-sm font-medium text-gray-700 hover:text-gray-900 transition-colors">
          <i class="fa-regular fa-circle-user text-base"></i>
          <span>Connexion</span>
        </a>
        <a href="/inscription" class="inline-flex items-center gap-1.5 bg-red-600 hover:bg-red-700 text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors">
          <i class="fa-solid fa-store text-xs"></i>
          <span>Créer ma boutique</span>
        </a>
        <button id="menu-toggle" class="md:hidden p-2 rounded-lg text-gray-600 hover:bg-gray-100 transition-colors">
          <i class="fa-solid fa-bars"></i>
        </button>
      </div>
    </div>
    
    <!-- Mobile menu -->
    <div id="mobile-menu" class="hidden md:hidden pb-4">
      <div class="flex flex-col gap-1 pt-2 border-t border-gray-100">
        <a href="/fonctionnalites" class="px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 rounded-lg">Fonctionnalités</a>
        <a href="/tarifs" class="px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 rounded-lg">Tarifs</a>
        <a href="/blog" class="px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 rounded-lg">Blog</a>
        <a href="/contact" class="px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 rounded-lg">Contact</a>
        <a href="/dashboard" class="px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 rounded-lg">Connexion</a>
      </div>
    </div>
  </nav>
</header>`
}

function renderFooter(nomProjet: string): string {
  const year = new Date().getFullYear()
  return `
<footer class="bg-gray-900 text-gray-300">
  <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
    <div class="grid grid-cols-2 md:grid-cols-4 gap-8">
      <div class="col-span-2 md:col-span-1">
        <a href="/" class="flex items-center gap-2 text-white font-bold text-lg mb-3">
          <i class="fa-solid fa-utensils text-red-500"></i>
          <span>${nomProjet}</span>
        </a>
        <p class="text-sm text-gray-400 leading-relaxed">La plateforme de commande en ligne pour les restaurants d'Afrique de l'Ouest et Centrale.</p>
        <div class="flex gap-3 mt-4">
          <a href="#" aria-label="Facebook" class="w-8 h-8 bg-gray-800 hover:bg-blue-600 rounded-lg flex items-center justify-center transition-colors">
            <i class="fa-brands fa-facebook-f text-xs"></i>
          </a>
          <a href="#" aria-label="Instagram" class="w-8 h-8 bg-gray-800 hover:bg-pink-600 rounded-lg flex items-center justify-center transition-colors">
            <i class="fa-brands fa-instagram text-xs"></i>
          </a>
          <a href="#" aria-label="WhatsApp" class="w-8 h-8 bg-gray-800 hover:bg-green-600 rounded-lg flex items-center justify-center transition-colors">
            <i class="fa-brands fa-whatsapp text-xs"></i>
          </a>
          <a href="#" aria-label="LinkedIn" class="w-8 h-8 bg-gray-800 hover:bg-blue-700 rounded-lg flex items-center justify-center transition-colors">
            <i class="fa-brands fa-linkedin-in text-xs"></i>
          </a>
        </div>
      </div>
      
      <div>
        <h3 class="text-white font-semibold text-sm mb-3">Produit</h3>
        <ul class="space-y-2 text-sm">
          <li><a href="/fonctionnalites" class="hover:text-white transition-colors">Fonctionnalités</a></li>
          <li><a href="/tarifs" class="hover:text-white transition-colors">Tarifs</a></li>
          <li><a href="/inscription" class="hover:text-white transition-colors">Créer ma boutique</a></li>
          <li><a href="/blog" class="hover:text-white transition-colors">Blog</a></li>
        </ul>
      </div>
      
      <div>
        <h3 class="text-white font-semibold text-sm mb-3">Pays</h3>
        <ul class="space-y-2 text-sm">
          <li><a href="/burkina-faso" class="hover:text-white transition-colors">Burkina Faso</a></li>
          <li><a href="/cote-divoire" class="hover:text-white transition-colors">Côte d'Ivoire</a></li>
          <li><a href="/cameroun" class="hover:text-white transition-colors">Cameroun</a></li>
          <li><a href="/mali" class="hover:text-white transition-colors">Mali</a></li>
        </ul>
      </div>
      
      <div>
        <h3 class="text-white font-semibold text-sm mb-3">Légal</h3>
        <ul class="space-y-2 text-sm">
          <li><a href="/legal/cgu" class="hover:text-white transition-colors">CGU</a></li>
          <li><a href="/legal/confidentialite" class="hover:text-white transition-colors">Confidentialité</a></li>
          <li><a href="/legal/mentions" class="hover:text-white transition-colors">Mentions légales</a></li>
          <li><a href="/legal/cookies" class="hover:text-white transition-colors">Cookies</a></li>
          <li><a href="/contact" class="hover:text-white transition-colors">Contact</a></li>
        </ul>
      </div>
    </div>
    
    <div class="border-t border-gray-800 mt-10 pt-6 flex flex-col sm:flex-row justify-between items-center gap-4">
      <p class="text-xs text-gray-500">&copy; ${year} ${nomProjet}. Tous droits réservés.</p>
      <p class="text-xs text-gray-500">Fait avec rigueur pour l'Afrique</p>
    </div>
  </div>
</footer>`
}

// ==============================
// PAGE D'ACCUEIL
// ==============================
function renderHomePage(nomProjet: string): string {
  return `${renderHead(
    `${nomProjet} — Commandez en ligne dans vos restaurants préférés`,
    `${nomProjet} est la plateforme de commande en ligne pour les restaurants d'Afrique de l'Ouest. Créez votre boutique en quelques minutes. Sans commission.`,
    nomProjet
  )}
<body class="font-sans bg-white text-gray-900">
  ${renderNav(nomProjet, 'accueil')}
  
  <!-- HERO -->
  <section class="bg-gradient-to-br from-red-50 via-white to-blue-50 py-20 lg:py-28">
    <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
      <div class="grid lg:grid-cols-2 gap-12 items-center">
        <div>
          <div class="inline-flex items-center gap-2 bg-red-100 text-red-700 text-xs font-semibold px-3 py-1.5 rounded-full mb-6">
            <i class="fa-solid fa-location-dot"></i>
            <span>Disponible au Burkina Faso — Côte d'Ivoire bientôt</span>
          </div>
          <h1 class="text-4xl sm:text-5xl lg:text-6xl font-extrabold text-gray-900 leading-tight mb-6">
            Votre restaurant,<br>
            <span class="text-red-600">en ligne</span> en<br>
            quelques minutes
          </h1>
          <p class="text-lg text-gray-600 leading-relaxed mb-8 max-w-lg">
            Créez votre boutique de commande en ligne, gérez vos commandes en temps réel et recevez des notifications WhatsApp instantanées. Sans commission. Abonnement fixe.
          </p>
          <div class="flex flex-col sm:flex-row gap-3">
            <a href="/inscription" class="inline-flex items-center justify-center gap-2 bg-red-600 hover:bg-red-700 text-white font-semibold px-6 py-3.5 rounded-xl transition-colors text-base shadow-lg shadow-red-200">
              <i class="fa-solid fa-store"></i>
              <span>Créer ma boutique gratuitement</span>
            </a>
            <a href="#demo" class="inline-flex items-center justify-center gap-2 bg-white hover:bg-gray-50 text-gray-700 font-semibold px-6 py-3.5 rounded-xl border border-gray-200 transition-colors text-base">
              <i class="fa-regular fa-circle-play"></i>
              <span>Voir la démonstration</span>
            </a>
          </div>
          <div class="flex items-center gap-6 mt-8 text-sm text-gray-500">
            <div class="flex items-center gap-1.5">
              <i class="fa-solid fa-check text-green-500"></i>
              <span>Sans engagement</span>
            </div>
            <div class="flex items-center gap-1.5">
              <i class="fa-solid fa-check text-green-500"></i>
              <span>Prêt en 5 min</span>
            </div>
            <div class="flex items-center gap-1.5">
              <i class="fa-solid fa-check text-green-500"></i>
              <span>Support en français</span>
            </div>
          </div>
        </div>
        
        <div class="relative">
          <div class="bg-white rounded-2xl shadow-2xl border border-gray-100 overflow-hidden max-w-sm mx-auto lg:ml-auto">
            <!-- Mockup boutique -->
            <div class="h-2 bg-gradient-to-r from-red-500 to-orange-400"></div>
            <div class="p-5">
              <div class="flex items-center gap-3 mb-4">
                <div class="w-12 h-12 bg-red-100 rounded-xl flex items-center justify-center">
                  <i class="fa-solid fa-drumstick-bite text-red-600 text-lg"></i>
                </div>
                <div>
                  <div class="font-bold text-gray-900">Restaurant Chez Fatou</div>
                  <div class="text-xs text-green-600 flex items-center gap-1">
                    <i class="fa-solid fa-circle text-xs"></i> Ouvert maintenant
                  </div>
                </div>
              </div>
              <!-- Item produit -->
              <div class="bg-gray-50 rounded-xl p-3 mb-3">
                <div class="flex justify-between items-start">
                  <div>
                    <div class="font-semibold text-sm text-gray-900">Thiéboudienne</div>
                    <div class="text-xs text-gray-500 mt-0.5">Riz au poisson sénégalais</div>
                    <div class="text-sm font-bold text-red-600 mt-1.5">2 500 FCFA</div>
                  </div>
                  <div class="w-14 h-14 bg-orange-100 rounded-lg flex items-center justify-center text-2xl">
                    <i class="fa-solid fa-bowl-rice text-orange-500"></i>
                  </div>
                </div>
                <button class="mt-2 w-full bg-red-600 text-white text-xs font-semibold py-1.5 rounded-lg flex items-center justify-center gap-1">
                  <i class="fa-solid fa-plus text-xs"></i> Ajouter
                </button>
              </div>
              <!-- Panier -->
              <div class="bg-blue-50 border border-blue-100 rounded-xl p-3">
                <div class="flex justify-between items-center mb-1">
                  <span class="text-xs font-semibold text-blue-800">Votre panier (2 articles)</span>
                  <span class="text-sm font-bold text-blue-900">5 500 FCFA</span>
                </div>
                <div class="text-xs text-blue-600 mb-2">+ 500 FCFA livraison</div>
                <button class="w-full bg-blue-700 text-white text-xs font-semibold py-2 rounded-lg flex items-center justify-center gap-1">
                  <i class="fa-brands fa-whatsapp"></i> Commander via WhatsApp
                </button>
              </div>
            </div>
          </div>
          <div class="absolute -bottom-4 -right-4 w-24 h-24 bg-red-100 rounded-full opacity-50 -z-10"></div>
          <div class="absolute -top-4 -left-4 w-16 h-16 bg-blue-100 rounded-full opacity-50 -z-10"></div>
        </div>
      </div>
    </div>
  </section>

  <!-- STATISTIQUES - Données réelles ou marquées exemple -->
  <section class="bg-white border-y border-gray-100 py-10">
    <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
      <div class="grid grid-cols-2 md:grid-cols-4 gap-8 text-center">
        <div>
          <div class="text-3xl font-extrabold text-red-600 mb-1">—</div>
          <div class="text-sm text-gray-500">Restaurants actifs</div>
          <div class="text-xs text-gray-400 mt-0.5">(données réelles à venir)</div>
        </div>
        <div>
          <div class="text-3xl font-extrabold text-red-600 mb-1">—</div>
          <div class="text-sm text-gray-500">Commandes traitées</div>
          <div class="text-xs text-gray-400 mt-0.5">(données réelles à venir)</div>
        </div>
        <div>
          <div class="text-3xl font-extrabold text-red-600 mb-1">4</div>
          <div class="text-sm text-gray-500">Pays couverts</div>
          <div class="text-xs text-gray-400 mt-0.5">(en cours de déploiement)</div>
        </div>
        <div>
          <div class="text-3xl font-extrabold text-red-600 mb-1">0%</div>
          <div class="text-sm text-gray-500">Commission sur ventes</div>
        </div>
      </div>
    </div>
  </section>

  <!-- FONCTIONNALITÉS -->
  <section class="py-20 bg-gray-50" id="fonctionnalites">
    <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
      <div class="text-center mb-14">
        <h2 class="text-3xl sm:text-4xl font-extrabold text-gray-900 mb-4">Tout ce dont votre restaurant a besoin</h2>
        <p class="text-lg text-gray-600 max-w-2xl mx-auto">Une plateforme complète pensée pour le contexte africain, simple à utiliser au quotidien.</p>
      </div>
      
      <div class="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
        ${[
          { icon: 'fa-mobile-screen-button', title: 'Boutique en ligne', desc: 'Votre menu accessible via un lien ou QR code. Aucune application à télécharger.', color: 'text-red-600 bg-red-50' },
          { icon: 'fa-brands fa-whatsapp', title: 'Notifications WhatsApp', desc: 'Recevez chaque commande instantanément sur WhatsApp. Votre numéro existant suffit.', color: 'text-green-600 bg-green-50' },
          { icon: 'fa-chart-line', title: 'Tableau de bord', desc: 'Statistiques claires, historique complet, gestion des commandes en temps réel.', color: 'text-blue-600 bg-blue-50' },
          { icon: 'fa-location-dot', title: 'Géolocalisation', desc: 'Le client positionne sa livraison sur une carte. Frais calculés automatiquement.', color: 'text-orange-600 bg-orange-50' },
          { icon: 'fa-qrcode', title: 'QR Code imprimable', desc: "Générez et téléchargez votre QR code en HD pour l'afficher en salle ou sur supports.", color: 'text-purple-600 bg-purple-50' },
          { icon: 'fa-palette', title: 'Personnalisation', desc: 'Couleurs, logo, bannière. Votre boutique à votre image, sans toucher au code.', color: 'text-pink-600 bg-pink-50' },
          { icon: 'fa-globe', title: 'Multi-pays', desc: 'Burkina Faso, Côte d\'Ivoire, Cameroun. Architecture prête pour toute l\'Afrique.', color: 'text-teal-600 bg-teal-50' },
          { icon: 'fa-shield-halved', title: 'Sécurisé', desc: 'Données isolées par restaurant. Chiffrement TLS. Protection contre les abus.', color: 'text-gray-600 bg-gray-100' },
          { icon: 'fa-motorcycle', title: 'Gestion livreurs', desc: 'Assignez un livreur à chaque commande. Il reçoit l\'itinéraire par WhatsApp.', color: 'text-yellow-600 bg-yellow-50' },
        ].map(f => `
          <div class="bg-white rounded-xl p-6 border border-gray-100 hover:shadow-md transition-shadow">
            <div class="w-11 h-11 ${f.color} rounded-xl flex items-center justify-center mb-4">
              <i class="fa-solid ${f.icon} text-lg"></i>
            </div>
            <h3 class="font-bold text-gray-900 mb-2">${f.title}</h3>
            <p class="text-sm text-gray-600 leading-relaxed">${f.desc}</p>
          </div>
        `).join('')}
      </div>
    </div>
  </section>

  <!-- PARCOURS COMMANDE -->
  <section class="py-20 bg-white" id="demo">
    <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
      <div class="text-center mb-14">
        <h2 class="text-3xl sm:text-4xl font-extrabold text-gray-900 mb-4">Comment ça fonctionne ?</h2>
        <p class="text-gray-600">Simple pour vos clients. Efficace pour vous.</p>
      </div>
      <div class="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
        ${[
          { num: '01', icon: 'fa-qrcode', title: 'Scan ou lien', desc: 'Le client scanne votre QR code ou ouvre votre lien personnel.' },
          { num: '02', icon: 'fa-basket-shopping', title: 'Choisit ses plats', desc: 'Il parcourt votre menu et ajoute ses plats au panier, sans inscription.' },
          { num: '03', icon: 'fa-location-crosshairs', title: 'Confirme sa position', desc: "Il positionne son adresse sur la carte, voit les frais de livraison calculés." },
          { num: '04', icon: 'fa-brands fa-whatsapp', title: 'Commande via WhatsApp', desc: 'La commande arrive sur votre WhatsApp avec tous les détails.' },
        ].map(s => `
          <div class="relative">
            <div class="bg-red-600 text-white text-xs font-bold w-7 h-7 rounded-full flex items-center justify-center mb-4">${s.num}</div>
            <div class="w-12 h-12 bg-gray-50 rounded-xl flex items-center justify-center mb-3 border border-gray-100">
              <i class="fa-solid ${s.icon} text-gray-700 text-lg"></i>
            </div>
            <h3 class="font-bold text-gray-900 mb-1">${s.title}</h3>
            <p class="text-sm text-gray-600 leading-relaxed">${s.desc}</p>
          </div>
        `).join('')}
      </div>
    </div>
  </section>

  <!-- TARIFS DYNAMIQUES -->
  <section class="py-20 bg-gray-50" id="tarifs">
    <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
      <div class="text-center mb-10">
        <h2 class="text-3xl sm:text-4xl font-extrabold text-gray-900 mb-4">Tarifs transparents</h2>
        <p class="text-gray-600 mb-6">Sans commission sur vos ventes. Forfait fixe mensuel.</p>
        <div class="inline-flex items-center gap-3 bg-white border border-gray-200 rounded-xl p-1">
          <button id="btn-devise-fcfa" onclick="changerDevise('FCFA')" class="devise-btn active-devise px-4 py-1.5 rounded-lg text-sm font-semibold transition-colors">FCFA</button>
          <button id="btn-devise-eur" onclick="changerDevise('EUR')" class="devise-btn px-4 py-1.5 rounded-lg text-sm font-semibold transition-colors text-gray-500">EUR</button>
          <button id="btn-devise-usd" onclick="changerDevise('USD')" class="devise-btn px-4 py-1.5 rounded-lg text-sm font-semibold transition-colors text-gray-500">USD</button>
        </div>
      </div>
      <div id="plans-container" class="grid sm:grid-cols-2 lg:grid-cols-3 gap-6 max-w-5xl mx-auto">
        <!-- Chargé dynamiquement via JS -->
        <div class="animate-pulse bg-gray-200 rounded-xl h-64"></div>
        <div class="animate-pulse bg-gray-200 rounded-xl h-64"></div>
        <div class="animate-pulse bg-gray-200 rounded-xl h-64"></div>
      </div>
    </div>
  </section>

  <!-- FAQ -->
  <section class="py-20 bg-white">
    <div class="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
      <div class="text-center mb-12">
        <h2 class="text-3xl font-extrabold text-gray-900 mb-3">Questions fréquentes</h2>
      </div>
      <div class="space-y-3" id="faq">
        ${[
          { q: 'Les clients doivent-ils créer un compte pour commander ?', a: "Non. Vos clients commandent directement sans inscription, sans mot de passe, sans email obligatoire. C'est votre boutique, pas une marketplace qui monopolise vos clients." },
          { q: 'Combien prenez-vous par commande ?', a: "Aucune commission sur vos ventes. Vous payez uniquement un abonnement mensuel fixe. Au-delà du quota de commandes incluses, des frais fixes très faibles s'appliquent par commande." },
          { q: 'Comment les clients paient-ils ?', a: "En version initiale : espèces à la livraison. Mobile Money et carte bancaire seront activés progressivement selon les pays." },
          { q: 'Mes données sont-elles isolées des autres restaurants ?', a: "Oui. Chaque restaurant est un tenant isolé. Aucune donnée ne peut être accessible par un autre restaurant. Sécurité testée et validée." },
          { q: 'Puis-je personnaliser l\'apparence de ma boutique ?', a: "Oui : logo, couleurs, bannière, photos des plats. Tout se configure depuis votre tableau de bord, sans intervention technique." },
        ].map((item, i) => `
          <div class="border border-gray-100 rounded-xl overflow-hidden">
            <button class="w-full text-left px-5 py-4 flex items-center justify-between gap-3 hover:bg-gray-50 transition-colors" onclick="toggleFaq(${i})">
              <span class="font-semibold text-gray-900 text-sm">${item.q}</span>
              <i id="faq-icon-${i}" class="fa-solid fa-chevron-down text-gray-400 text-xs flex-shrink-0 transition-transform"></i>
            </button>
            <div id="faq-content-${i}" class="hidden px-5 pb-4">
              <p class="text-sm text-gray-600 leading-relaxed">${item.a}</p>
            </div>
          </div>
        `).join('')}
      </div>
    </div>
  </section>

  <!-- CTA FINAL -->
  <section class="bg-red-600 py-16">
    <div class="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
      <h2 class="text-3xl sm:text-4xl font-extrabold text-white mb-4">Prêt à digitaliser votre restaurant ?</h2>
      <p class="text-red-100 text-lg mb-8 max-w-2xl mx-auto">Créez votre boutique en quelques minutes. Premier mois offert. Support en français inclus.</p>
      <div class="flex flex-col sm:flex-row gap-4 justify-center">
        <a href="/inscription" class="inline-flex items-center justify-center gap-2 bg-white text-red-600 font-bold px-8 py-4 rounded-xl hover:bg-red-50 transition-colors text-base shadow-lg">
          <i class="fa-solid fa-store"></i>
          <span>Créer ma boutique gratuitement</span>
        </a>
        <a href="https://wa.me/226XXXXXXXX?text=Bonjour%2C%20je%20souhaite%20en%20savoir%20plus%20sur%20MonMenu" target="_blank" rel="noopener noreferrer" class="inline-flex items-center justify-center gap-2 bg-green-500 hover:bg-green-600 text-white font-bold px-8 py-4 rounded-xl transition-colors text-base">
          <i class="fa-brands fa-whatsapp"></i>
          <span>Contacter sur WhatsApp</span>
        </a>
      </div>
    </div>
  </section>

  ${renderFooter(nomProjet)}
  
  <!-- Cookie banner -->
  <div id="cookie-banner" class="fixed bottom-0 left-0 right-0 bg-gray-900 text-white p-4 z-50 hidden">
    <div class="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
      <p class="text-sm text-gray-300">Nous utilisons des cookies techniques essentiels au fonctionnement du site. <a href="/legal/cookies" class="text-blue-400 hover:underline">En savoir plus</a></p>
      <div class="flex gap-3">
        <button onclick="acceptCookies()" class="bg-white text-gray-900 text-sm font-semibold px-4 py-2 rounded-lg hover:bg-gray-100 transition-colors">Accepter</button>
        <button onclick="rejectCookies()" class="border border-gray-600 text-gray-300 text-sm px-4 py-2 rounded-lg hover:border-gray-400 transition-colors">Refuser</button>
      </div>
    </div>
  </div>

  <script src="/static/js/main.js"></script>
  <script>
    // Chargement dynamique des plans
    let deviseCourante = 'FCFA';
    async function changerDevise(devise) {
      deviseCourante = devise;
      document.querySelectorAll('.devise-btn').forEach(b => {
        b.classList.remove('active-devise', 'bg-red-600', 'text-white');
        b.classList.add('text-gray-500');
      });
      const btn = document.getElementById('btn-devise-' + devise.toLowerCase());
      if (btn) { btn.classList.add('active-devise', 'bg-red-600', 'text-white'); btn.classList.remove('text-gray-500'); }
      await chargerPlans(devise);
    }
    async function chargerPlans(devise = 'FCFA') {
      try {
        const res = await fetch('/api/v1/plans?devise=' + devise);
        const data = await res.json();
        renderPlans(data.plans, data.devise);
      } catch(e) { console.error('Erreur plans', e); }
    }
    function renderPlans(plans, devise) {
      const container = document.getElementById('plans-container');
      if (!plans || !plans.length) { container.innerHTML = '<p class="text-gray-500 col-span-3 text-center">Tarifs bientôt disponibles</p>'; return; }
      container.innerHTML = plans.map(plan => {
        const highlight = plan.nom && plan.nom.toLowerCase().includes('pro');
        return '<div class="bg-white rounded-xl border ' + (highlight ? 'border-red-500 shadow-lg shadow-red-100' : 'border-gray-100') + ' p-6 relative">' +
          (highlight ? '<div class="absolute -top-3 left-1/2 -translate-x-1/2 bg-red-600 text-white text-xs font-bold px-3 py-1 rounded-full">Recommandé</div>' : '') +
          '<div class="mb-4"><div class="font-bold text-lg text-gray-900">' + plan.nom + '</div>' +
          '<div class="text-3xl font-extrabold text-gray-900 mt-2">' + (plan.prix_mensuel_converti || 0).toLocaleString('fr-FR') + ' <span class="text-base font-normal text-gray-500">' + devise + '/mois</span></div>' +
          (plan.economie_annuelle > 0 ? '<div class="text-xs text-green-600 mt-1">Économisez ' + plan.economie_annuelle.toLocaleString('fr-FR') + ' ' + devise + ' avec l\'annuel</div>' : '') + '</div>' +
          '<ul class="space-y-2 mb-6 text-sm text-gray-600">' +
          '<li class="flex items-center gap-2"><i class="fa-solid fa-check text-green-500 text-xs"></i>' + (plan.commandes_incluses || 0) + ' commandes/mois incluses</li>' +
          '<li class="flex items-center gap-2"><i class="fa-solid fa-check text-green-500 text-xs"></i>' + (plan.limite_pdv || 1) + ' point(s) de vente</li>' +
          '</ul>' +
          '<a href="/inscription" class="block w-full text-center ' + (highlight ? 'bg-red-600 hover:bg-red-700 text-white' : 'bg-gray-50 hover:bg-gray-100 text-gray-900') + ' font-semibold py-2.5 rounded-xl transition-colors text-sm">Commencer</a>' +
          '</div>';
      }).join('');
    }
    document.addEventListener('DOMContentLoaded', () => { changerDevise('FCFA'); });
    
    // FAQ toggle
    function toggleFaq(i) {
      const content = document.getElementById('faq-content-' + i);
      const icon = document.getElementById('faq-icon-' + i);
      content.classList.toggle('hidden');
      icon.classList.toggle('rotate-180');
    }
  </script>
</body>
</html>`
}

// ==============================
// PAGE BOUTIQUE RESTAURANT
// ==============================
function renderBoutiquePage(tenant: {
  id: string; nom: string; slug: string; logo_url: string | null
  banniere_url: string | null; couleur_primaire: string; couleur_secondaire: string
  whatsapp_number: string
}, nomProjet: string): string {
  const primaryColor = tenant.couleur_primaire || '#DC2626'
  const secondaryColor = tenant.couleur_secondaire || '#1D4ED8'

  return `${renderHead(
    `${tenant.nom} — Commander en ligne`,
    `Commandez vos plats chez ${tenant.nom} sur ${nomProjet}. Livraison ou retrait sur place.`,
    nomProjet
  )}
<body class="font-sans bg-gray-50">
  <style>
    :root { --color-primary: ${primaryColor}; --color-secondary: ${secondaryColor}; }
    .btn-primary { background-color: var(--color-primary); }
    .btn-primary:hover { filter: brightness(0.9); }
    .text-primary { color: var(--color-primary); }
    .border-primary { border-color: var(--color-primary); }
    .bg-primary { background-color: var(--color-primary); }
  </style>

  <!-- En-tête boutique -->
  <header class="bg-white shadow-sm">
    ${tenant.banniere_url ? `<div class="h-32 bg-cover bg-center" style="background-image:url('${tenant.banniere_url}')"></div>` : ''}
    <div class="max-w-3xl mx-auto px-4 py-4 flex items-center gap-4">
      ${tenant.logo_url ? 
        `<img src="${tenant.logo_url}" alt="${tenant.nom}" class="w-14 h-14 rounded-xl object-cover border border-gray-100 shadow-sm">` :
        `<div class="w-14 h-14 rounded-xl flex items-center justify-center text-white font-bold text-xl" style="background-color:${primaryColor}">${tenant.nom.charAt(0)}</div>`
      }
      <div>
        <h1 class="font-bold text-xl text-gray-900">${tenant.nom}</h1>
        <div class="flex items-center gap-1.5 text-xs text-green-600">
          <i class="fa-solid fa-circle text-xs"></i>
          <span>Ouvert — Commande en ligne</span>
        </div>
      </div>
    </div>
    <!-- Catégories sticky -->
    <div class="border-t border-gray-100 overflow-x-auto">
      <nav class="max-w-3xl mx-auto px-4 flex gap-1 py-2" id="categories-nav"></nav>
    </div>
  </header>

  <!-- Menu -->
  <main class="max-w-3xl mx-auto px-4 py-6 pb-32" id="menu-content">
    <div class="space-y-2" id="menu-skeleton">
      ${Array(4).fill('<div class="animate-pulse bg-gray-200 rounded-xl h-20"></div>').join('')}
    </div>
  </main>

  <!-- Panier flottant -->
  <div id="cart-btn" class="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 hidden">
    <button onclick="openCart()" class="btn-primary text-white font-bold px-6 py-3.5 rounded-2xl shadow-xl flex items-center gap-3 min-w-[260px] justify-between">
      <div class="flex items-center gap-2">
        <div id="cart-count" class="bg-white text-xs font-bold w-6 h-6 rounded-full flex items-center justify-center" style="color:${primaryColor}">0</div>
        <span>Voir le panier</span>
      </div>
      <span id="cart-total" class="font-bold">0 FCFA</span>
    </button>
  </div>

  <!-- Modal Panier -->
  <div id="cart-modal" class="fixed inset-0 z-50 hidden">
    <div class="absolute inset-0 bg-black/50" onclick="closeCart()"></div>
    <div class="absolute bottom-0 left-0 right-0 bg-white rounded-t-2xl max-h-[85vh] overflow-y-auto">
      <div class="sticky top-0 bg-white border-b border-gray-100 px-4 py-4 flex items-center justify-between">
        <h2 class="font-bold text-lg text-gray-900">Votre commande</h2>
        <button onclick="closeCart()" class="p-2 hover:bg-gray-100 rounded-lg transition-colors">
          <i class="fa-solid fa-xmark text-gray-600"></i>
        </button>
      </div>
      <div id="cart-items" class="px-4 py-4 divide-y divide-gray-100"></div>
      <div id="cart-footer" class="sticky bottom-0 bg-white border-t border-gray-100 p-4"></div>
    </div>
  </div>

  <!-- Modal Checkout -->
  <div id="checkout-modal" class="fixed inset-0 z-50 hidden">
    <div class="absolute inset-0 bg-black/50" onclick="closeCheckout()"></div>
    <div class="absolute bottom-0 left-0 right-0 bg-white rounded-t-2xl max-h-[95vh] overflow-y-auto">
      <div class="sticky top-0 bg-white border-b border-gray-100 px-4 py-4 flex items-center gap-3">
        <button onclick="closeCheckout()" class="p-2 hover:bg-gray-100 rounded-lg transition-colors">
          <i class="fa-solid fa-arrow-left text-gray-600"></i>
        </button>
        <h2 class="font-bold text-lg text-gray-900">Finaliser la commande</h2>
      </div>
      <form id="checkout-form" class="px-4 py-6 space-y-5" onsubmit="submitOrder(event)">
        <div>
          <label class="block text-sm font-semibold text-gray-700 mb-1.5">Votre prénom et nom <span class="text-red-500">*</span></label>
          <input id="client-nom" type="text" required minlength="2" maxlength="100" class="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-red-200 focus:border-red-400" placeholder="Fatou Traoré">
        </div>
        <div>
          <label class="block text-sm font-semibold text-gray-700 mb-1.5">Téléphone <span class="text-red-500">*</span></label>
          <input id="client-tel" type="tel" required class="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-red-200 focus:border-red-400" placeholder="+226 70 00 00 00">
        </div>
        
        <div>
          <div class="flex items-center justify-between mb-2">
            <label class="block text-sm font-semibold text-gray-700">Mode de livraison <span class="text-red-500">*</span></label>
          </div>
          <div class="grid grid-cols-2 gap-3">
            <label class="border border-gray-200 rounded-xl p-3 cursor-pointer hover:border-red-300 transition-colors has-[:checked]:border-red-500 has-[:checked]:bg-red-50">
              <input type="radio" name="livraison-type" value="livraison" class="sr-only" checked>
              <div class="flex flex-col gap-1">
                <i class="fa-solid fa-motorcycle text-gray-500 text-sm"></i>
                <span class="text-sm font-semibold text-gray-900">Livraison</span>
                <span class="text-xs text-gray-500">À domicile</span>
              </div>
            </label>
            <label class="border border-gray-200 rounded-xl p-3 cursor-pointer hover:border-red-300 transition-colors has-[:checked]:border-red-500 has-[:checked]:bg-red-50">
              <input type="radio" name="livraison-type" value="emporter" class="sr-only">
              <div class="flex flex-col gap-1">
                <i class="fa-solid fa-bag-shopping text-gray-500 text-sm"></i>
                <span class="text-sm font-semibold text-gray-900">À emporter</span>
                <span class="text-xs text-gray-500">Sur place</span>
              </div>
            </label>
          </div>
        </div>

        <div id="map-section">
          <label class="block text-sm font-semibold text-gray-700 mb-1.5">Votre adresse de livraison <span class="text-red-500">*</span></label>
          <div class="relative mb-2">
            <i class="fa-solid fa-location-dot absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"></i>
            <input id="client-adresse" type="text" class="w-full border border-gray-200 rounded-xl pl-9 pr-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-red-200 focus:border-red-400" placeholder="Quartier, rue, repère...">
          </div>
          <div id="carte-livraison" class="w-full h-48 bg-gray-100 rounded-xl border border-gray-200 flex items-center justify-center text-gray-500 text-sm">
            <div class="text-center">
              <i class="fa-solid fa-map text-3xl text-gray-300 mb-2 block"></i>
              <span>Carte de livraison (Mapbox)</span><br>
              <button type="button" onclick="geolocaliser()" class="mt-2 text-xs text-blue-600 hover:underline flex items-center gap-1 mx-auto">
                <i class="fa-solid fa-location-crosshairs"></i> Utiliser ma position
              </button>
            </div>
          </div>
          <div id="frais-livraison-detail" class="mt-2 text-xs text-gray-500"></div>
        </div>

        <div>
          <label class="block text-sm font-semibold text-gray-700 mb-1.5">Notes (facultatif)</label>
          <textarea id="client-notes" maxlength="500" rows="2" class="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-red-200 focus:border-red-400 resize-none" placeholder="Instructions particulières, étage, code..."></textarea>
        </div>

        <!-- Récapitulatif -->
        <div class="bg-gray-50 rounded-xl p-4">
          <div class="flex justify-between text-sm mb-1">
            <span class="text-gray-600">Sous-total</span>
            <span id="recap-sous-total" class="font-semibold">0 FCFA</span>
          </div>
          <div class="flex justify-between text-sm mb-3">
            <span class="text-gray-600">Frais de livraison</span>
            <span id="recap-livraison" class="font-semibold">— FCFA</span>
          </div>
          <div class="flex justify-between font-bold text-base border-t border-gray-200 pt-2">
            <span>Total</span>
            <span id="recap-total" class="text-primary">— FCFA</span>
          </div>
        </div>

        <button type="submit" id="submit-btn" class="btn-primary w-full text-white font-bold py-4 rounded-xl flex items-center justify-center gap-2 text-base transition-all">
          <i class="fa-brands fa-whatsapp"></i>
          <span>Confirmer et envoyer sur WhatsApp</span>
        </button>
        <p class="text-xs text-gray-400 text-center">En confirmant, vous serez redirigé vers WhatsApp pour finaliser avec le restaurant.</p>
      </form>
    </div>
  </div>

  <script src="/static/js/boutique.js"></script>
  <script>
    const TENANT_ID = '${tenant.id}';
    const TENANT_SLUG = '${tenant.slug}';
    const WHATSAPP_NUMBER = '${tenant.whatsapp_number}';
    const PRIMARY_COLOR = '${primaryColor}';
    initBoutique(TENANT_ID, TENANT_SLUG);
  </script>
</body>
</html>`
}

// ==============================
// PAGE FONCTIONNALITÉS
// ==============================
function renderFonctionnalitesPage(nomProjet: string): string {
  return `${renderHead(
    `Fonctionnalités — ${nomProjet}`,
    `Découvrez toutes les fonctionnalités de ${nomProjet} : menu en ligne, commandes WhatsApp, géolocalisation, QR code, tableau de bord, et plus.`,
    nomProjet
  )}
<body class="font-sans bg-white text-gray-900">
  ${renderNav(nomProjet, 'fonctionnalites')}
  <section class="py-20 bg-gradient-to-b from-gray-50 to-white">
    <div class="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
      <div class="text-center mb-16">
        <h1 class="text-4xl sm:text-5xl font-extrabold text-gray-900 mb-4">Fonctionnalités complètes</h1>
        <p class="text-xl text-gray-600">Une plateforme pensée pour les restaurants africains.</p>
      </div>
      <div class="space-y-16">
        ${[
          {
            icon: 'fa-store', title: 'Boutique en ligne personnalisée',
            items: ['URL unique (monmenu.app/votre-restaurant)', 'Logo, couleurs et bannière configurables', 'Mode clair et sombre automatique', 'Responsive mobile-first'],
            color: 'text-red-600 bg-red-50'
          },
          {
            icon: 'fa-basket-shopping', title: 'Commande sans inscription',
            items: ['Aucun compte requis pour commander', 'Panier persistant (localStorage)', 'Variantes de produits', 'Codes promotionnels (à venir)'],
            color: 'text-blue-600 bg-blue-50'
          },
          {
            icon: 'fa-location-dot', title: 'Géolocalisation et livraison',
            items: ['Carte interactive (Mapbox)', 'Calcul automatique des frais de livraison', 'Majoration heure de pointe et météo', 'Lien Google Maps et Waze pour le livreur'],
            color: 'text-green-600 bg-green-50'
          },
          {
            icon: 'fa-brands fa-whatsapp', title: 'Notifications WhatsApp instantanées',
            items: ['Message structuré à la confirmation', 'Récapitulatif complet pour le restaurant', 'Notification au livreur avec itinéraire', 'API WhatsApp Business Cloud'],
            color: 'text-green-700 bg-green-50'
          },
          {
            icon: 'fa-chart-bar', title: 'Tableau de bord restaurant',
            items: ['Commandes en temps réel (Supabase Realtime)', 'Historique complet filtrable et exportable CSV', 'Statistiques journalières', 'Gestion du menu et des catégories'],
            color: 'text-purple-600 bg-purple-50'
          },
          {
            icon: 'fa-qrcode', title: 'QR Code haute résolution',
            items: ['Généré automatiquement par boutique', 'Personnalisable (couleur, logo)', 'Téléchargeable en PNG et SVG', 'Prêt pour impression table/support'],
            color: 'text-orange-600 bg-orange-50'
          },
        ].map(feature => `
          <div class="grid md:grid-cols-2 gap-8 items-center">
            <div>
              <div class="w-12 h-12 ${feature.color} rounded-xl flex items-center justify-center mb-4">
                <i class="fa-solid ${feature.icon} text-lg"></i>
              </div>
              <h2 class="text-2xl font-bold text-gray-900 mb-3">${feature.title}</h2>
              <ul class="space-y-2">
                ${feature.items.map(item => `<li class="flex items-center gap-2 text-gray-600 text-sm"><i class="fa-solid fa-check text-green-500 flex-shrink-0"></i>${item}</li>`).join('')}
              </ul>
            </div>
            <div class="bg-gray-50 rounded-2xl p-8 flex items-center justify-center min-h-32">
              <i class="fa-solid ${feature.icon} text-8xl opacity-10 text-gray-400"></i>
            </div>
          </div>
        `).join('')}
      </div>
    </div>
  </section>
  ${renderFooter(nomProjet)}
  <script src="/static/js/main.js"></script>
</body>
</html>`
}

// ==============================
// PAGE TARIFS
// ==============================
function renderTarifsPage(nomProjet: string): string {
  return `${renderHead(
    `Tarifs — ${nomProjet}`,
    `Tarifs transparents sans commission pour votre restaurant. Choisissez votre forfait.`,
    nomProjet
  )}
<body class="font-sans bg-white text-gray-900">
  ${renderNav(nomProjet, 'tarifs')}
  <section class="py-20">
    <div class="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
      <div class="text-center mb-12">
        <h1 class="text-4xl sm:text-5xl font-extrabold text-gray-900 mb-4">Tarifs simples et transparents</h1>
        <p class="text-xl text-gray-600 mb-8">Aucune commission sur vos ventes. Forfait fixe mensuel ou annuel.</p>
        <div class="inline-flex items-center gap-3 bg-gray-50 border border-gray-200 rounded-xl p-1">
          <button onclick="changerDevise('FCFA')" class="devise-btn active px-4 py-2 rounded-lg text-sm font-semibold bg-white shadow-sm transition-all">FCFA</button>
          <button onclick="changerDevise('EUR')" class="devise-btn px-4 py-2 rounded-lg text-sm font-semibold text-gray-500 hover:text-gray-900 transition-all">EUR</button>
          <button onclick="changerDevise('USD')" class="devise-btn px-4 py-2 rounded-lg text-sm font-semibold text-gray-500 hover:text-gray-900 transition-all">USD</button>
        </div>
      </div>
      <div id="plans-grid" class="grid sm:grid-cols-2 lg:grid-cols-3 gap-6"></div>
      <div class="mt-12 bg-gray-50 rounded-2xl p-8">
        <h2 class="text-xl font-bold text-gray-900 mb-6">Comparaison des fonctionnalités</h2>
        <div id="features-table"></div>
      </div>
    </div>
  </section>
  ${renderFooter(nomProjet)}
  <script src="/static/js/main.js"></script>
  <script>
    async function chargerPlans(devise = 'FCFA') {
      const res = await fetch('/api/v1/plans?devise=' + devise);
      const data = await res.json();
      renderPlansGrid(data.plans, data.devise);
    }
    function renderPlansGrid(plans, devise) {
      if (!plans) return;
      document.getElementById('plans-grid').innerHTML = plans.map(p => {
        const isPro = p.nom && p.nom.toLowerCase().includes('pro');
        return '<div class="bg-white rounded-xl border ' + (isPro ? 'border-red-500 shadow-lg' : 'border-gray-100') + ' p-6">' +
          '<div class="font-bold text-xl mb-2">' + p.nom + '</div>' +
          '<div class="text-3xl font-extrabold mb-1">' + (p.prix_mensuel_converti||0).toLocaleString('fr-FR') + ' <span class="text-sm font-normal text-gray-500">' + devise + '/mois</span></div>' +
          '<div class="text-sm text-gray-500 mb-6">' + (p.commandes_incluses||0) + ' commandes incluses</div>' +
          '<a href="/inscription" class="block text-center ' + (isPro ? 'bg-red-600 text-white' : 'bg-gray-50 text-gray-900') + ' font-semibold py-3 rounded-xl hover:opacity-90 transition-opacity">Démarrer</a>' +
          '</div>';
      }).join('');
    }
    document.querySelectorAll('.devise-btn').forEach(b => b.addEventListener('click', function() {
      document.querySelectorAll('.devise-btn').forEach(x => x.classList.remove('active', 'bg-white', 'shadow-sm'));
      this.classList.add('active', 'bg-white', 'shadow-sm');
    }));
    chargerPlans('FCFA');
  </script>
</body>
</html>`
}

// ==============================
// PAGE CONTACT
// ==============================
function renderContactPage(nomProjet: string): string {
  return `${renderHead(
    `Contact — ${nomProjet}`,
    `Contactez l'équipe ${nomProjet}. Support en français, réponse rapide par WhatsApp.`,
    nomProjet
  )}
<body class="font-sans bg-white text-gray-900">
  ${renderNav(nomProjet, 'contact')}
  <section class="py-20">
    <div class="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
      <div class="text-center mb-12">
        <h1 class="text-4xl font-extrabold text-gray-900 mb-4">Contactez-nous</h1>
        <p class="text-gray-600">Notre équipe répond en français. Délai habituel : moins de 24 heures.</p>
      </div>
      <div class="grid sm:grid-cols-2 gap-6 mb-10">
        <a href="https://wa.me/226XXXXXXXX?text=Bonjour%20MonMenu" target="_blank" rel="noopener noreferrer" class="border border-green-200 bg-green-50 rounded-xl p-6 flex items-center gap-4 hover:shadow-md transition-shadow group">
          <div class="w-12 h-12 bg-green-500 rounded-xl flex items-center justify-center text-white flex-shrink-0">
            <i class="fa-brands fa-whatsapp text-2xl"></i>
          </div>
          <div>
            <div class="font-bold text-gray-900 mb-0.5">WhatsApp</div>
            <div class="text-sm text-gray-600">Réponse rapide recommandée</div>
            <div class="text-sm text-green-600 font-medium mt-1 group-hover:underline">Ouvrir la conversation</div>
          </div>
        </a>
        <a href="mailto:support@monmenu.app" class="border border-blue-200 bg-blue-50 rounded-xl p-6 flex items-center gap-4 hover:shadow-md transition-shadow group">
          <div class="w-12 h-12 bg-blue-600 rounded-xl flex items-center justify-center text-white flex-shrink-0">
            <i class="fa-regular fa-envelope text-xl"></i>
          </div>
          <div>
            <div class="font-bold text-gray-900 mb-0.5">Email</div>
            <div class="text-sm text-gray-600">support@monmenu.app</div>
            <div class="text-sm text-blue-600 font-medium mt-1 group-hover:underline">Envoyer un email</div>
          </div>
        </a>
      </div>
      
      <div class="bg-gray-50 rounded-2xl p-8">
        <h2 class="text-xl font-bold text-gray-900 mb-6">Formulaire de contact</h2>
        <form id="contact-form" class="space-y-4" onsubmit="submitContact(event)">
          <div class="grid sm:grid-cols-2 gap-4">
            <div>
              <label class="block text-sm font-semibold text-gray-700 mb-1.5">Prénom et nom</label>
              <input id="contact-nom" type="text" required class="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-red-200 bg-white">
            </div>
            <div>
              <label class="block text-sm font-semibold text-gray-700 mb-1.5">Email ou téléphone</label>
              <input id="contact-email" type="text" required class="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-red-200 bg-white">
            </div>
          </div>
          <div>
            <label class="block text-sm font-semibold text-gray-700 mb-1.5">Je suis</label>
            <select id="contact-profil" class="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-red-200 bg-white">
              <option value="restaurant">Un restaurant</option>
              <option value="client">Un client final</option>
              <option value="autre">Autre</option>
            </select>
          </div>
          <div>
            <label class="block text-sm font-semibold text-gray-700 mb-1.5">Message</label>
            <textarea id="contact-message" required rows="4" class="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-red-200 bg-white resize-none"></textarea>
          </div>
          <button type="submit" class="w-full bg-red-600 hover:bg-red-700 text-white font-bold py-3 rounded-xl transition-colors">
            Envoyer le message
          </button>
          <p id="contact-feedback" class="text-sm text-center hidden"></p>
        </form>
      </div>
    </div>
  </section>
  ${renderFooter(nomProjet)}
  <script src="/static/js/main.js"></script>
  <script>
    function submitContact(e) {
      e.preventDefault();
      const btn = e.target.querySelector('button[type=submit]');
      btn.textContent = 'Envoi en cours...';
      btn.disabled = true;
      setTimeout(() => {
        document.getElementById('contact-feedback').textContent = 'Message envoyé. Nous vous répondrons dans les 24 heures.';
        document.getElementById('contact-feedback').classList.remove('hidden');
        document.getElementById('contact-feedback').classList.add('text-green-600');
        e.target.reset();
        btn.textContent = 'Envoyer le message';
        btn.disabled = false;
      }, 1200);
    }
  </script>
</body>
</html>`
}

// ==============================
// PAGE SUIVI COMMANDE
// ==============================
function renderSuiviPage(token: string, nomProjet: string): string {
  return `${renderHead(
    `Suivi de commande — ${nomProjet}`,
    `Suivez votre commande en temps réel.`,
    nomProjet
  )}
<body class="font-sans bg-gray-50 min-h-screen">
  <header class="bg-white border-b border-gray-100 px-4 py-4">
    <div class="max-w-lg mx-auto flex items-center gap-2 text-red-600 font-bold text-lg">
      <i class="fa-solid fa-utensils"></i>
      <span>${nomProjet}</span>
    </div>
  </header>
  <main class="max-w-lg mx-auto px-4 py-8">
    <div class="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 mb-4">
      <h1 class="text-xl font-bold text-gray-900 mb-1">Suivi de commande</h1>
      <p class="text-xs text-gray-500 font-mono">Token : ${token}</p>
    </div>
    <div id="suivi-content">
      <div class="animate-pulse space-y-3">
        <div class="h-16 bg-gray-200 rounded-xl"></div>
        <div class="h-32 bg-gray-200 rounded-xl"></div>
      </div>
    </div>
  </main>
  <script>
    const TRACKING_TOKEN = '${token}';
    const STATUTS = {
      'en_attente': { label: 'Commande reçue', icon: 'fa-clock', color: 'text-yellow-600' },
      'confirmee': { label: 'Confirmée', icon: 'fa-circle-check', color: 'text-blue-600' },
      'en_preparation': { label: 'En préparation', icon: 'fa-fire-burner', color: 'text-orange-600' },
      'en_livraison': { label: 'En livraison', icon: 'fa-motorcycle', color: 'text-purple-600' },
      'livree': { label: 'Livrée', icon: 'fa-check-double', color: 'text-green-600' },
      'annulee': { label: 'Annulée', icon: 'fa-xmark', color: 'text-red-600' }
    };
    async function chargerSuivi() {
      try {
        const res = await fetch('/api/v1/commandes/suivi/' + TRACKING_TOKEN);
        if (!res.ok) { document.getElementById('suivi-content').innerHTML = '<div class="bg-red-50 border border-red-100 rounded-xl p-6 text-center"><i class="fa-solid fa-circle-exclamation text-red-500 text-2xl mb-2 block"></i><p class="text-gray-700 font-semibold">Commande introuvable</p><p class="text-sm text-gray-500 mt-1">Vérifiez le lien reçu.</p></div>'; return; }
        const data = await res.json();
        const c = data.commande;
        const statut = STATUTS[c.statut] || { label: c.statut, icon: 'fa-circle', color: 'text-gray-600' };
        let html = '<div class="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 mb-4">';
        html += '<div class="flex items-center gap-3 mb-4"><div class="w-10 h-10 rounded-xl bg-gray-100 flex items-center justify-center"><i class="fa-solid ' + statut.icon + ' ' + statut.color + '"></i></div><div><div class="font-bold text-gray-900">' + statut.label + '</div><div class="text-xs text-gray-500">Commande du ' + new Date(c.created_at).toLocaleDateString('fr-FR', {day:'numeric',month:'long',hour:'2-digit',minute:'2-digit'}) + '</div></div></div>';
        html += '<div class="text-sm font-bold text-gray-900 mb-2">Détail de la commande</div>';
        const items = typeof c.items_json === 'string' ? JSON.parse(c.items_json) : c.items_json;
        html += '<div class="space-y-1 mb-4">' + items.map(i => '<div class="flex justify-between text-sm"><span class="text-gray-700">' + i.nom + ' x' + i.quantite + '</span><span class="font-semibold">' + i.sous_total.toLocaleString('fr-FR') + ' FCFA</span></div>').join('') + '</div>';
        html += '<div class="border-t border-gray-100 pt-3 flex justify-between font-bold"><span>Total</span><span class="text-red-600">' + (c.montant_total||0).toLocaleString('fr-FR') + ' FCFA</span></div>';
        html += '</div>';
        if (data.historique && data.historique.length) {
          html += '<div class="bg-white rounded-2xl shadow-sm border border-gray-100 p-6"><div class="font-bold text-gray-900 mb-4">Historique</div><div class="space-y-3">';
          html += data.historique.map(h => '<div class="flex items-start gap-3"><div class="w-2 h-2 rounded-full bg-red-500 mt-1.5 flex-shrink-0"></div><div><div class="text-sm font-semibold text-gray-900">' + (STATUTS[h.nouveau_statut]?.label || h.nouveau_statut) + '</div><div class="text-xs text-gray-500">' + new Date(h.timestamp).toLocaleString('fr-FR') + '</div></div></div>').join('');
          html += '</div></div>';
        }
        document.getElementById('suivi-content').innerHTML = html;
      } catch(e) { console.error(e); }
    }
    chargerSuivi();
    setInterval(chargerSuivi, 30000); // Rafraichir toutes les 30s
  </script>
</body>
</html>`
}

// ==============================
// PAGE DASHBOARD CONNEXION
// ==============================
function renderDashboardLoginPage(nomProjet: string): string {
  return `${renderHead(
    `Connexion — ${nomProjet}`,
    `Accédez à votre tableau de bord restaurant.`,
    nomProjet
  )}
<body class="font-sans bg-gray-50 min-h-screen flex items-center justify-center">
  <div class="w-full max-w-md px-4">
    <div class="text-center mb-8">
      <a href="/" class="inline-flex items-center gap-2 text-red-600 font-bold text-2xl">
        <i class="fa-solid fa-utensils"></i>
        <span>${nomProjet}</span>
      </a>
      <p class="text-gray-600 mt-2">Espace restaurant</p>
    </div>
    <div class="bg-white rounded-2xl shadow-sm border border-gray-100 p-8">
      <h1 class="text-xl font-bold text-gray-900 mb-6">Connexion</h1>
      <form id="login-form" class="space-y-4" onsubmit="handleLogin(event)">
        <div>
          <label class="block text-sm font-semibold text-gray-700 mb-1.5">Email</label>
          <input id="login-email" type="email" required class="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-red-200 focus:border-red-400">
        </div>
        <div>
          <label class="block text-sm font-semibold text-gray-700 mb-1.5">Mot de passe</label>
          <div class="relative">
            <input id="login-password" type="password" required class="w-full border border-gray-200 rounded-xl px-4 py-3 pr-10 text-sm focus:outline-none focus:ring-2 focus:ring-red-200 focus:border-red-400">
            <button type="button" onclick="togglePassword()" class="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
              <i id="pwd-icon" class="fa-regular fa-eye text-sm"></i>
            </button>
          </div>
        </div>
        <p id="login-error" class="text-xs text-red-600 hidden"></p>
        <button type="submit" id="login-btn" class="w-full bg-red-600 hover:bg-red-700 text-white font-bold py-3 rounded-xl transition-colors">
          Se connecter
        </button>
      </form>
      <div class="mt-6 pt-6 border-t border-gray-100 text-center">
        <p class="text-sm text-gray-600">Pas encore de compte ?</p>
        <a href="/inscription" class="text-sm text-red-600 font-semibold hover:underline">Créer ma boutique gratuitement</a>
      </div>
    </div>
  </div>
  <script>
    function togglePassword() {
      const input = document.getElementById('login-password');
      const icon = document.getElementById('pwd-icon');
      input.type = input.type === 'password' ? 'text' : 'password';
      icon.className = input.type === 'password' ? 'fa-regular fa-eye text-sm' : 'fa-regular fa-eye-slash text-sm';
    }
    async function handleLogin(e) {
      e.preventDefault();
      const btn = document.getElementById('login-btn');
      const errEl = document.getElementById('login-error');
      btn.disabled = true; btn.textContent = 'Connexion...';
      errEl.classList.add('hidden');
      const email = document.getElementById('login-email').value;
      const password = document.getElementById('login-password').value;
      try {
        const res = await fetch('/api/v1/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password })
        });
        const data = await res.json();
        if (res.ok && data.success) { window.location.href = '/dashboard/commandes'; }
        else { errEl.textContent = data.error || 'Identifiants incorrects.'; errEl.classList.remove('hidden'); }
      } catch { errEl.textContent = 'Erreur de connexion. Réessayez.'; errEl.classList.remove('hidden'); }
      finally { btn.disabled = false; btn.textContent = 'Se connecter'; }
    }
  </script>
</body>
</html>`
}

// ==============================
// PAGE DASHBOARD (SPA)
// ==============================
function renderDashboardPage(nomProjet: string): string {
  return `${renderHead(
    `Tableau de bord — ${nomProjet}`,
    `Gérez vos commandes et votre menu.`,
    nomProjet,
    `<meta name="robots" content="noindex, nofollow">`
  )}
<body class="font-sans bg-gray-50 min-h-screen">
  <div id="dashboard-app">
    <!-- Sidebar -->
    <aside id="sidebar" class="fixed left-0 top-0 h-full w-60 bg-gray-900 text-white flex flex-col z-40 -translate-x-full lg:translate-x-0 transition-transform">
      <div class="p-5 border-b border-gray-800">
        <a href="/" class="flex items-center gap-2 text-red-400 font-bold text-lg">
          <i class="fa-solid fa-utensils"></i>
          <span>${nomProjet}</span>
        </a>
      </div>
      <nav class="flex-1 p-4 space-y-1">
        <a href="/dashboard/commandes" class="nav-link flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-gray-300 hover:bg-gray-800 hover:text-white transition-colors">
          <i class="fa-solid fa-receipt w-4 text-center"></i> Commandes
        </a>
        <a href="/dashboard/menu" class="nav-link flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-gray-300 hover:bg-gray-800 hover:text-white transition-colors">
          <i class="fa-solid fa-book-open w-4 text-center"></i> Menu
        </a>
        <a href="/dashboard/statistiques" class="nav-link flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-gray-300 hover:bg-gray-800 hover:text-white transition-colors">
          <i class="fa-solid fa-chart-bar w-4 text-center"></i> Statistiques
        </a>
        <a href="/dashboard/livreurs" class="nav-link flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-gray-300 hover:bg-gray-800 hover:text-white transition-colors">
          <i class="fa-solid fa-motorcycle w-4 text-center"></i> Livreurs
        </a>
        <a href="/dashboard/qrcode" class="nav-link flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-gray-300 hover:bg-gray-800 hover:text-white transition-colors">
          <i class="fa-solid fa-qrcode w-4 text-center"></i> QR Code
        </a>
        <a href="/dashboard/apparence" class="nav-link flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-gray-300 hover:bg-gray-800 hover:text-white transition-colors">
          <i class="fa-solid fa-palette w-4 text-center"></i> Apparence
        </a>
        <a href="/dashboard/parametres" class="nav-link flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-gray-300 hover:bg-gray-800 hover:text-white transition-colors">
          <i class="fa-solid fa-gear w-4 text-center"></i> Paramètres
        </a>
      </nav>
      <div class="p-4 border-t border-gray-800">
        <button onclick="logout()" class="flex items-center gap-2 text-sm text-gray-400 hover:text-white transition-colors">
          <i class="fa-solid fa-arrow-right-from-bracket"></i> Déconnexion
        </button>
      </div>
    </aside>
    
    <!-- Main content -->
    <div class="lg:pl-60 min-h-screen">
      <header class="bg-white border-b border-gray-100 sticky top-0 z-30">
        <div class="px-4 py-3 flex items-center gap-4">
          <button onclick="toggleSidebar()" class="lg:hidden p-2 rounded-lg hover:bg-gray-100 text-gray-600">
            <i class="fa-solid fa-bars"></i>
          </button>
          <h1 id="page-title" class="font-bold text-gray-900 text-lg flex-1">Commandes</h1>
          <div class="flex items-center gap-2">
            <span id="realtime-indicator" class="flex items-center gap-1.5 text-xs text-green-600">
              <i class="fa-solid fa-circle text-xs animate-pulse"></i> Temps réel
            </span>
          </div>
        </div>
      </header>
      <main class="p-4 lg:p-6" id="dashboard-content">
        <!-- Section Commandes -->
        <section id="section-commandes">
          <!-- Filtres -->
          <div class="flex flex-wrap gap-3 mb-6">
            ${['en_attente', 'confirmee', 'en_preparation', 'en_livraison', 'livree', 'annulee'].map(s => `
              <button onclick="filtrerCommandes('${s}')" class="statut-btn px-3 py-1.5 rounded-lg text-xs font-semibold border border-gray-200 text-gray-600 hover:border-red-300 hover:text-red-600 transition-colors" data-statut="${s}">${s.replace('_', ' ')}</button>
            `).join('')}
            <button onclick="filtrerCommandes(null)" class="px-3 py-1.5 rounded-lg text-xs font-semibold bg-red-600 text-white">Toutes</button>
          </div>
          <div id="commandes-list" class="space-y-3">
            <div class="text-center py-12 text-gray-400">
              <i class="fa-solid fa-circle-notch fa-spin text-3xl mb-3 block"></i>
              <p class="text-sm">Chargement des commandes...</p>
            </div>
          </div>
        </section>
      </main>
    </div>
    
    <!-- Sidebar overlay mobile -->
    <div id="sidebar-overlay" class="fixed inset-0 bg-black/50 z-30 hidden lg:hidden" onclick="toggleSidebar()"></div>
  </div>

  <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
  <script src="/static/js/dashboard.js"></script>
  <script>
    function toggleSidebar() {
      const sidebar = document.getElementById('sidebar');
      const overlay = document.getElementById('sidebar-overlay');
      sidebar.classList.toggle('-translate-x-full');
      overlay.classList.toggle('hidden');
    }
    function logout() {
      if (confirm('Se déconnecter ?')) window.location.href = '/dashboard';
    }
    initDashboard();
  </script>
</body>
</html>`
}

function render404Page(): string {
  return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Page introuvable — MonMenu</title>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@fortawesome/fontawesome-free@6.5.0/css/all.min.css">
  <script src="https://cdn.tailwindcss.com"></script>
  <style>body { font-family: 'Inter', sans-serif; }</style>
</head>
<body class="bg-gray-50 flex items-center justify-center min-h-screen">
  <div class="text-center max-w-md px-4">
    <div class="text-8xl font-extrabold text-red-600 mb-4">404</div>
    <h1 class="text-2xl font-bold text-gray-900 mb-2">Page introuvable</h1>
    <p class="text-gray-600 mb-8">La page que vous cherchez n'existe pas ou le restaurant n'est plus disponible.</p>
    <a href="/" class="inline-flex items-center gap-2 bg-red-600 text-white font-semibold px-6 py-3 rounded-xl hover:bg-red-700 transition-colors">
      <i class="fa-solid fa-house"></i> Retour à l'accueil
    </a>
  </div>
</body>
</html>`
}

export default app
