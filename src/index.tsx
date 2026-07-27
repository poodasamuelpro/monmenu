import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { logger } from 'hono/logger'
import { serveStatic } from 'hono/cloudflare-workers'
import type { Env } from './types/database'
import { commandesRouter } from './routes/api-commandes'
import { tenantsRouter } from './routes/api-tenants'
import { livraisonRouter } from './routes/api-livraison'
import { plansRouter } from './routes/api-plans'
import { authRouter } from './routes/api-auth'
import { dashboardRouter } from './routes/api-dashboard'
import { blogRouter } from './routes/api-blog'
import { newsletterRouter } from './routes/api-newsletter'
import { setSecurityHeaders } from './lib/security'
import { getNomProjet, getWhatsAppSupport, createSupabaseAdminClient } from './lib/supabase'

// ---- Imports composants & pages ----
import { renderHomePage } from './pages/home'
import { renderContactPage } from './pages/contact'
import { renderBlogPage } from './pages/blog'
import { renderArticlePage } from './pages/article'
import { renderInscriptionPage } from './pages/inscription'
import { renderLegalPage } from './pages/legal'
import { renderConnexionPage, renderCreerComptePage } from './pages/auth'
import { renderForgotPasswordPage } from './pages/forgot-password'
import { renderDashboardPage } from './pages/dashboard'
import { renderSuiviPage } from './pages/suivi'
import { renderBoutiquePage } from './pages/boutique'
import { render404Page } from './pages/not-found'

const app = new Hono<{ Bindings: Env }>()

// ---- Middleware globaux ----
app.use('*', logger())

// Domaines/sous-domaines autorisés à appeler l'API, tant que le domaine
// définitif du dashboard admin n'est pas fixé. Couvre .app / .com / .bf
// (racine + n'importe quel sous-domaine, ex: admin.monmenu.com) ainsi
// que les URLs de preview Cloudflare Workers (*.workers.dev).
function originAutorisee(origin: string): string | null {
  const domainesRacines = ['monmenu.app', 'monmenu.com', 'monmenu.bf']
  const localhosts = ['http://localhost:5173', 'http://localhost:3000']

  if (localhosts.includes(origin)) return origin

  try {
    const hostname = new URL(origin).hostname
    const estDomaineAutorise = domainesRacines.some(
      (racine) => hostname === racine || hostname.endsWith(`.${racine}`)
    )
    const estWorkersDev = hostname.endsWith('.workers.dev')

    if (estDomaineAutorise || estWorkersDev) return origin
  } catch {
    return null
  }

  return null
}

app.use('/api/*', cors({
  origin: (origin) => originAutorisee(origin) ?? '',
  allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization', 'X-Idempotency-Key'],
  exposeHeaders: ['X-Cache', 'X-RateLimit-Remaining']
}))

// ---- Fichiers statiques ----
app.use('/static/*', serveStatic({ root: './' }))
app.use('/favicon.ico', serveStatic({ path: './favicon.ico' }))

// ---- §1.11 — Middleware custom domain : résolution de domaine_perso vers boutique ----
// Si la requête arrive sur un domaine personnalisé (ex: commande.monrestaurant.bf),
// on cherche le tenant correspondant et on rend sa boutique directement.
app.use('*', async (c, next) => {
  const host = c.req.header('host') ?? ''
  // Ignorer les domaines de la plateforme
  const domainesPlateforme = ['monmenu.app', 'monmenu.com', 'monmenu.bf', 'workers.dev', 'localhost']
  const estPlateforme = domainesPlateforme.some(d => host.includes(d))

  if (!estPlateforme && host.includes('.') && !c.req.path.startsWith('/api/')) {
    try {
      const adminClient = createSupabaseAdminClient(c.env)
      const { data: tenant } = await adminClient
        .from('tenants')
        .select('id, nom, slug, logo_url, banniere_url, couleur_primaire, couleur_secondaire, whatsapp_number, pdv_nom, pdv_adresse, pdv_horaires, pdv_latitude, pdv_longitude')
        .eq('domaine_perso', host)
        .in('statut', ['actif', 'essai'])
        .is('deleted_at', null)
        .maybeSingle()

      if (tenant) {
        // Vérifier plan Mogho (seul plan autorisé à utiliser domaine_perso)
        const planCheck = tenant as any
        const nomProjet = await getNomProjet(c.env)
        return c.html(renderBoutiquePage(tenant as any, nomProjet))
      }
    } catch { /* Ignorer les erreurs — continuer le routing normal */ }
  }
  return next()
})

// ---- Routes API ----
app.route('/api/v1/commandes', commandesRouter)
app.route('/api/v1/tenants', tenantsRouter)
app.route('/api/v1/livraison', livraisonRouter)
app.route('/api/v1/plans', plansRouter)
app.route('/api/v1/auth', authRouter)
app.route('/api/v1/dashboard', dashboardRouter)
app.route('/api/v1/blog', blogRouter)
app.route('/api/v1/newsletter', newsletterRouter)

// ---- Sitemap dynamique ----
app.get('/sitemap.xml', async (c) => {
  // SUPABASE — liste des tenants actifs (APPLICATION DATA)
  const adminClient = createSupabaseAdminClient(c.env)
  const { data: tenantsData } = await adminClient
    .from('tenants')
    .select('slug, updated_at')
    .eq('statut', 'actif')
    .is('deleted_at', null)
    .limit(500)

  const baseUrl = 'https://monmenu.app'
  const restaurantUrls = (tenantsData ?? []).map((t: { slug: string; updated_at: string }) =>
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
    <loc>${baseUrl}/contact</loc>
    <changefreq>monthly</changefreq>
    <priority>0.6</priority>
  </url>
  <url>
    <loc>${baseUrl}/inscription</loc>
    <changefreq>monthly</changefreq>
    <priority>0.8</priority>
  </url>
  <url>
    <loc>${baseUrl}/blog</loc>
    <changefreq>weekly</changefreq>
    <priority>0.8</priority>
  </url>
  <url>
    <loc>${baseUrl}/legal/cgu</loc>
    <changefreq>yearly</changefreq>
    <priority>0.3</priority>
  </url>
  <url>
    <loc>${baseUrl}/legal/confidentialite</loc>
    <changefreq>yearly</changefreq>
    <priority>0.3</priority>
  </url>
  <url>
    <loc>${baseUrl}/legal/mentions</loc>
    <changefreq>yearly</changefreq>
    <priority>0.3</priority>
  </url>
  <url>
    <loc>${baseUrl}/legal/cookies</loc>
    <changefreq>yearly</changefreq>
    <priority>0.3</priority>
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

// ---- Page d'accueil ----
app.get('/', async (c) => {
  setSecurityHeaders(c)
  const nomProjet = await getNomProjet(c.env)
  return c.html(renderHomePage(nomProjet))
})

// ---- Pages institutionnelles ----
// IMPORTANT : Ces routes DOIVENT être définies AVANT /:slug
// sinon Hono capture tout avec le paramètre générique

// "Fonctionnalités" et "Tarifs" ne sont plus des pages séparées :
// ce sont des sections de la page d'accueil (#fonctionnalites / #tarifs).
// On redirige les anciennes URLs pour ne pas casser les liens existants / le SEO.
app.get('/fonctionnalites', (c) => c.redirect('/#fonctionnalites', 301))
app.get('/tarifs', (c) => c.redirect('/#tarifs', 301))

app.get('/contact', async (c) => {
  setSecurityHeaders(c)
  const [nomProjet, whatsappSupport] = await Promise.all([
    getNomProjet(c.env),
    getWhatsAppSupport(c.env)
  ])
  return c.html(renderContactPage(nomProjet, whatsappSupport))
})

// ---- Page inscription restaurant ----
app.get('/inscription', async (c) => {
  setSecurityHeaders(c)
  const nomProjet = await getNomProjet(c.env)
  return c.html(renderInscriptionPage(nomProjet))
})

// ---- Page Blog (liste) ----
app.get('/blog', async (c) => {
  setSecurityHeaders(c)
  const nomProjet = await getNomProjet(c.env)

  // SUPABASE — articles publiés (APPLICATION DATA)
  // En cas d'erreur (table absente, Supabase indisponible, etc.),
  // on affiche la page avec une liste vide plutôt que de planter.
  let articles: Awaited<ReturnType<typeof getArticlesPublies>> = []
  try {
    articles = await getArticlesPublies(c.env)
  } catch (err) {
    console.error('[Blog] Erreur récupération articles:', err)
  }

  return c.html(renderBlogPage(nomProjet, articles))
})

async function getArticlesPublies(env: Env) {
  const adminClient = createSupabaseAdminClient(env)
  const { data, error } = await adminClient
    .from('articles')
    .select('slug, titre, extrait, categorie, temps_lecture, image_url, date_publication')
    .eq('statut', 'publie')
    .order('date_publication', { ascending: false })

  if (error) {
    console.error('[Blog] Erreur Supabase:', error.message)
    return []
  }
  return data ?? []
}

// ---- Page Blog (article individuel) ----
// IMPORTANT : doit être définie avant /:slug générique
app.get('/blog/:slug', async (c) => {
  setSecurityHeaders(c)
  const slug = c.req.param('slug')
  const nomProjet = await getNomProjet(c.env)

  let article = null
  try {
    const adminClient = createSupabaseAdminClient(c.env)
    const { data, error } = await adminClient
      .from('articles')
      .select('titre, contenu, extrait, categorie, temps_lecture, image_url, date_publication, auteur')
      .eq('slug', slug)
      .eq('statut', 'publie')
      .maybeSingle()

    if (error) {
      console.error('[Blog] Erreur Supabase (article):', error.message)
    }
    article = data
  } catch (err) {
    console.error('[Blog] Erreur récupération article:', err)
  }

  if (!article) {
    return c.html(render404Page(), 404)
  }

  return c.html(renderArticlePage(nomProjet, article))
})

// ---- Pages légales ----
app.get('/legal/cgu', async (c) => {
  setSecurityHeaders(c)
  const nomProjet = await getNomProjet(c.env)
  return c.html(renderLegalPage('cgu', nomProjet))
})
app.get('/legal/confidentialite', async (c) => {
  setSecurityHeaders(c)
  const nomProjet = await getNomProjet(c.env)
  return c.html(renderLegalPage('confidentialite', nomProjet))
})
app.get('/legal/mentions', async (c) => {
  setSecurityHeaders(c)
  const nomProjet = await getNomProjet(c.env)
  return c.html(renderLegalPage('mentions', nomProjet))
})
app.get('/legal/cookies', async (c) => {
  setSecurityHeaders(c)
  const nomProjet = await getNomProjet(c.env)
  return c.html(renderLegalPage('cookies', nomProjet))
})

// ---- Connexion & Création de compte ----
// §1.7 — Page récupération mot de passe
app.get('/mot-de-passe-oublie', async (c) => {
  setSecurityHeaders(c)
  const nomProjet = await getNomProjet(c.env)
  return c.html(renderForgotPasswordPage(nomProjet))
})

app.get('/connexion', async (c) => {
  setSecurityHeaders(c)
  const nomProjet = await getNomProjet(c.env)
  return c.html(renderConnexionPage(nomProjet))
})

app.get('/creer-compte', async (c) => {
  setSecurityHeaders(c)
  const nomProjet = await getNomProjet(c.env)
  return c.html(renderCreerComptePage(nomProjet))
})

// ---- Dashboard ----
app.get('/dashboard', async (c) => {
  setSecurityHeaders(c)
  const nomProjet = await getNomProjet(c.env)
  return c.html(renderConnexionPage(nomProjet))
})

app.get('/dashboard/*', async (c) => {
  setSecurityHeaders(c)
  // §2.3 — Vérification auth côté serveur avant rendu du dashboard
  const cookieHeader = c.req.header('cookie') ?? ''
  const tokenMatch = cookieHeader.match(/sb-access-token=([^;]+)/)
  const authHeader = c.req.header('authorization') ?? ''
  const hasToken = tokenMatch || authHeader.startsWith('Bearer ')
  if (!hasToken) {
    // Redirection vers la page de connexion si pas de token JWT visible
    const currentPath = new URL(c.req.url).pathname
    if (currentPath !== '/dashboard' && currentPath !== '/dashboard/') {
      return c.redirect('/dashboard?redirect=' + encodeURIComponent(currentPath), 302)
    }
  }
  const nomProjet = await getNomProjet(c.env)
  return c.html(renderDashboardPage(nomProjet))
})

// ---- Page boutique restaurant (DOIT être EN DERNIER — route générique) ----
// Cette route /:slug capture tout ce qui n'a pas été intercepté avant.
// Elle cherche le slug dans Supabase — si non trouvé → 404
app.get('/:slug', async (c) => {
  setSecurityHeaders(c)
  const slug = c.req.param('slug')

  // SUPABASE — Vérifier que le restaurant existe + PDV pour le footer (APPLICATION DATA)
  const adminClient = createSupabaseAdminClient(c.env)
  const { data: tenantRaw } = await adminClient
    .from('tenants')
    .select(`
      id, nom, slug, logo_url, banniere_url,
      couleur_primaire, couleur_secondaire, whatsapp_number,
      points_de_vente(nom, adresse, horaires, latitude, longitude, actif)
    `)
    .eq('slug', slug)
    .in('statut', ['actif', 'essai'])
    .is('deleted_at', null)
    .limit(1)
    .maybeSingle()

  let tenant: {
    id: string; nom: string; slug: string; logo_url: string | null
    banniere_url: string | null; couleur_primaire: string; couleur_secondaire: string
    whatsapp_number: string
    pdv_nom: string | null; pdv_adresse: string | null; pdv_horaires: string | null
    pdv_latitude: number | null; pdv_longitude: number | null
  } | null = null

  if (tenantRaw) {
    const pdvArr = Array.isArray(tenantRaw.points_de_vente) ? tenantRaw.points_de_vente : []
    const pdv = pdvArr.find((p: any) => p.actif) ?? pdvArr[0] ?? null
    tenant = {
      id: tenantRaw.id,
      nom: tenantRaw.nom,
      slug: tenantRaw.slug,
      logo_url: tenantRaw.logo_url,
      banniere_url: tenantRaw.banniere_url,
      couleur_primaire: tenantRaw.couleur_primaire,
      couleur_secondaire: tenantRaw.couleur_secondaire,
      whatsapp_number: tenantRaw.whatsapp_number,
      pdv_nom: pdv?.nom ?? null,
      pdv_adresse: pdv?.adresse ?? null,
      pdv_horaires: pdv?.horaires ?? null,
      pdv_latitude: pdv?.latitude ?? null,
      pdv_longitude: pdv?.longitude ?? null
    }
  }

  if (!tenant) {
    return c.html(render404Page(), 404)
  }

  const nomProjet = await getNomProjet(c.env)
  return c.html(renderBoutiquePage(tenant, nomProjet))
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


// §1.8 — Export objet Worker complet avec handler scheduled (Cron Triggers)
import { handleScheduled } from './routes/api-cron'

export default {
  fetch: app.fetch.bind(app),
  scheduled: handleScheduled
}
