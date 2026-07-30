import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { logger } from 'hono/logger'
import { serveStatic } from 'hono/cloudflare-workers'
import { getCookie } from 'hono/cookie'
import type { Env } from './types/database'
import { commandesRouter } from './routes/api-commandes'
import { tenantsRouter } from './routes/api-tenants'
import { livraisonRouter } from './routes/api-livraison'
import { plansRouter } from './routes/api-plans'
import { authRouter } from './routes/api-auth'
import { dashboardRouter } from './routes/api-dashboard'
import { blogRouter } from './routes/api-blog'
import { newsletterRouter } from './routes/api-newsletter'
import { screenshotsRouter } from './routes/api-screenshots'
import { paiementRouter } from './routes/api-paiement'
// AJOUT 2026-07-30 — route admin pour déclencher manuellement les tâches
// cron (ex: relancer la capture des screenshots sans attendre 2h20 UTC).
import { adminTasksRouter } from './routes/api-admin-tasks'
import { setSecurityHeaders } from './lib/security'
import { getNomProjet, getWhatsAppSupport, createSupabaseAdminClient, createSupabaseClient } from './lib/supabase'
import { detectLocale, getTranslations } from './i18n'

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
import { renderBoutiquePage, type TenantBoutique } from './pages/boutique'
import { render404Page } from './pages/not-found'
import { renderBienvenuePage } from './pages/bienvenue'
import { renderCompteInactifPage } from './pages/compte-inactif'

const app = new Hono<{ Bindings: Env }>()

// Nom du cookie httpOnly — doit rester identique à celui posé dans api-auth.ts
const ACCESS_TOKEN_COOKIE = 'sb-access-token'

// §3 — Résolution de locale : ?lang=en/fr > cookie monmenu-lang > Accept-Language header > 'fr' par défaut
function resolveLocale(c: any): string {
  const langParam = c.req.query('lang')
  if (langParam === 'en' || langParam === 'fr') return langParam

  const langCookie = getCookie(c, 'monmenu-lang')
  if (langCookie === 'en' || langCookie === 'fr') return langCookie

  const acceptLang = c.req.header('Accept-Language') ?? null
  return detectLocale(acceptLang)
}

// FIX (2026-07-28) — Récupération d'un tenant + son PDV actif via un vrai join
// sur points_de_vente (les colonnes pdv_nom/pdv_adresse/... N'EXISTENT PAS sur
// la table tenants — elles vivent dans points_de_vente). Factorisé ici pour que
// la route /:slug ET le middleware domaine personnalisé utilisent EXACTEMENT
// la même logique.
async function fetchTenantAvecPdv(env: Env, filtre: { colonne: 'slug' | 'domaine_perso'; valeur: string }): Promise<TenantBoutique | null> {
  const adminClient = createSupabaseAdminClient(env)
  const { data: tenantRaw } = await adminClient
    .from('tenants')
    .select(`
      id, nom, slug, logo_url, banniere_url,
      couleur_primaire, couleur_secondaire, whatsapp_number,
      points_de_vente(nom, adresse, horaires, latitude, longitude, actif)
    `)
    .eq(filtre.colonne, filtre.valeur)
    .in('statut', ['actif', 'essai'])
    .is('deleted_at', null)
    .limit(1)
    .maybeSingle()

  if (!tenantRaw) return null

  const pdvArr = Array.isArray(tenantRaw.points_de_vente) ? tenantRaw.points_de_vente : []
  const pdv = pdvArr.find((p: any) => p.actif) ?? pdvArr[0] ?? null

  return {
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

// ---- Middleware globaux ----
app.use('*', logger())

// Domaines/sous-domaines autorisés à appeler l'API
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
  allowHeaders: ['Content-Type', 'Authorization', 'X-Idempotency-Key', 'X-Requested-With'],
  exposeHeaders: ['X-Cache', 'X-RateLimit-Remaining'],
  credentials: true
}))

// ---- Fichiers statiques ----
app.use('/static/*', serveStatic({ root: './' }))
app.use('/favicon.ico', serveStatic({ path: './favicon.ico' }))

// ---- §1.11 — Middleware custom domain : résolution de domaine_perso vers boutique ----
app.use('*', async (c, next) => {
  const host = c.req.header('host') ?? ''
  const domainesPlateforme = ['monmenu.app', 'monmenu.com', 'monmenu.bf', 'workers.dev', 'localhost']
  const estPlateforme = domainesPlateforme.some(d => host.includes(d))

  if (!estPlateforme && host.includes('.') && !c.req.path.startsWith('/api/')) {
    try {
      const tenant = await fetchTenantAvecPdv(c.env, { colonne: 'domaine_perso', valeur: host })
      if (tenant) {
        const nomProjet = await getNomProjet(c.env)
        return c.html(renderBoutiquePage(tenant, nomProjet))
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
app.route('/api/v1/screenshots', screenshotsRouter)
// Module paiement manuel — audit 04-plan-implementation.md §B
app.route('/api/v1/paiement', paiementRouter)
// AJOUT 2026-07-30 — déclenchement manuel des tâches cron (ex: screenshots)
app.route('/api/v1/admin/tasks', adminTasksRouter)

// ---- Sitemap dynamique ----
app.get('/sitemap.xml', async (c) => {
  const adminClient = createSupabaseAdminClient(c.env)
  const { data: tenantsData } = await adminClient
    .from('tenants')
    .select('slug, updated_at')
    .eq('statut', 'actif')
    .is('deleted_at', null)
    .limit(500)

  const baseUrl = new URL(c.req.url).origin
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
    <xhtml:link rel="alternate" hreflang="fr" href="${baseUrl}/"/>
    <xhtml:link rel="alternate" hreflang="en" href="${baseUrl}/?lang=en"/>
    <xhtml:link rel="alternate" hreflang="x-default" href="${baseUrl}/"/>
  </url>
  <url>
    <loc>${baseUrl}/contact</loc>
    <changefreq>monthly</changefreq>
    <priority>0.6</priority>
    <xhtml:link rel="alternate" hreflang="fr" href="${baseUrl}/contact"/>
    <xhtml:link rel="alternate" hreflang="en" href="${baseUrl}/contact?lang=en"/>
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

// ---- §3 — Routes i18n /fr et /en ----
app.get('/fr', (c) => {
  c.header('Set-Cookie', 'monmenu-lang=fr; Path=/; Max-Age=31536000; SameSite=Lax')
  return c.redirect('/', 302)
})
app.get('/en', (c) => {
  c.header('Set-Cookie', 'monmenu-lang=en; Path=/; Max-Age=31536000; SameSite=Lax')
  return c.redirect('/?lang=en', 302)
})
app.get('/fr/*', (c) => {
  const path = c.req.path.replace(/^\/fr/, '') || '/'
  c.header('Set-Cookie', 'monmenu-lang=fr; Path=/; Max-Age=31536000; SameSite=Lax')
  return c.redirect(path, 302)
})
app.get('/en/*', (c) => {
  const path = c.req.path.replace(/^\/en/, '') || '/'
  c.header('Set-Cookie', 'monmenu-lang=en; Path=/; Max-Age=31536000; SameSite=Lax')
  return c.redirect(path + (path.includes('?') ? '&' : '?') + 'lang=en', 302)
})

// ---- robots.txt ----
app.get('/robots.txt', (c) => {
  const origin = new URL(c.req.url).origin
  return c.text(`User-agent: *
Allow: /
Disallow: /dashboard/
Disallow: /api/
Disallow: /_internal/

Sitemap: ${origin}/sitemap.xml

# Admin subdomain indexé séparément avec interdiction totale
`)
})

// ---- llms.txt (convention LLM/IA) ----
app.get('/llms.txt', (c) => {
  const content = `# MonMenu

## Description
MonMenu est une plateforme SaaS de commande en ligne pour les restaurants d'Afrique de l'Ouest et Centrale.
Elle permet aux restaurateurs de créer leur boutique digitale en quelques minutes, de gérer leur menu,
et de recevoir les commandes directement sur WhatsApp — sans commission.

## Sections principales
- Accueil : https://monmenu.app/
- Blog : https://monmenu.app/blog
- Contact : https://monmenu.app/contact
- Inscription restaurant : https://monmenu.app/inscription
- Connexion dashboard : https://monmenu.app/connexion

## Pages légales
- CGU : https://monmenu.app/legal/cgu
- Confidentialité : https://monmenu.app/legal/confidentialite
- Mentions légales : https://monmenu.app/legal/mentions
- Cookies : https://monmenu.app/legal/cookies

## Boutiques restaurants
Chaque restaurant inscrit dispose d'une boutique publique accessible via :
https://monmenu.app/{slug-du-restaurant}

## API publique
- Commandes : POST /api/v1/commandes
- Suivi commande : GET /api/v1/commandes/suivi/{token}
- Blog (lecture) : GET /api/v1/blog, GET /api/v1/blog/{slug}

## Technologies
- Backend : Hono v4 sur Cloudflare Workers
- Base de données : Supabase PostgreSQL + Cloudflare D1
- Paiements : Mobile Money, espèces, carte bancaire (selon disponibilité du restaurant)
- Notifications : WhatsApp Business API

## Langues supportées
Français (défaut), Anglais

## Note pour les agents IA
Les boutiques restaurants sont des pages publiques accessibles sans authentification.
Le dashboard restaurant (/dashboard) est privé et nécessite une authentification Supabase
via cookie httpOnly (session navigateur).
`
  return c.text(content, 200, { 'Content-Type': 'text/plain; charset=utf-8' })
})

// ---- Page de suivi commande ----
app.get('/suivi/:token', async (c) => {
  setSecurityHeaders(c)
  const token = c.req.param('token')
  const nomProjet = await getNomProjet(c.env)
  const locale = resolveLocale(c)
  return c.html(renderSuiviPage(token, nomProjet, locale))
})

// ---- Page d'accueil ----
app.get('/', async (c) => {
  setSecurityHeaders(c)
  const locale = resolveLocale(c)
  if (c.req.query('lang') === 'en' || c.req.query('lang') === 'fr') {
    c.header('Set-Cookie', `monmenu-lang=${locale}; Path=/; Max-Age=31536000; SameSite=Lax`)
  }
  const nomProjet = await getNomProjet(c.env)
  return c.html(renderHomePage(nomProjet, locale))
})

// ---- Pages institutionnelles ----
// IMPORTANT : ces routes DOIVENT être définies AVANT /:slug
// sinon Hono capture tout avec le paramètre générique

app.get('/contact', async (c) => {
  setSecurityHeaders(c)
  const locale = resolveLocale(c)
  if (c.req.query('lang') === 'en' || c.req.query('lang') === 'fr') {
    c.header('Set-Cookie', `monmenu-lang=${locale}; Path=/; Max-Age=31536000; SameSite=Lax`)
  }
  const [nomProjet, whatsappSupport] = await Promise.all([
    getNomProjet(c.env),
    getWhatsAppSupport(c.env)
  ])
  return c.html(renderContactPage(nomProjet, whatsappSupport, locale))
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

  let articles: Awaited<ReturnType<typeof getArticlesPublies>> = []
  try {
    articles = await getArticlesPublies(c.env)
  } catch (err) {
    console.error('[Blog] Erreur récupération articles:', err instanceof Error ? err.message : err)
  }

  const locale = resolveLocale(c)
  if (c.req.query('lang') === 'en' || c.req.query('lang') === 'fr') {
    c.header('Set-Cookie', `monmenu-lang=${locale}; Path=/; Max-Age=31536000; SameSite=Lax`)
  }
  return c.html(renderBlogPage(nomProjet, articles, locale))
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
    console.error('[Blog] Erreur récupération article:', err instanceof Error ? err.message : err)
  }

  if (!article) {
    const nomP = await getNomProjet(c.env)
    return c.html(render404Page(nomP, 'fr'), 404)
  }

  const locale = resolveLocale(c)
  return c.html(renderArticlePage(nomProjet, article, locale))
})

// ---- Pages légales ----
app.get('/legal/cgu', async (c) => {
  setSecurityHeaders(c)
  const nomProjet = await getNomProjet(c.env)
  const locale = resolveLocale(c)
  return c.html(renderLegalPage('cgu', nomProjet, locale))
})
app.get('/legal/confidentialite', async (c) => {
  setSecurityHeaders(c)
  const nomProjet = await getNomProjet(c.env)
  const locale = resolveLocale(c)
  return c.html(renderLegalPage('confidentialite', nomProjet, locale))
})
app.get('/legal/mentions', async (c) => {
  setSecurityHeaders(c)
  const nomProjet = await getNomProjet(c.env)
  const locale = resolveLocale(c)
  return c.html(renderLegalPage('mentions', nomProjet, locale))
})
app.get('/legal/cookies', async (c) => {
  setSecurityHeaders(c)
  const nomProjet = await getNomProjet(c.env)
  const locale = resolveLocale(c)
  return c.html(renderLegalPage('cookies', nomProjet, locale))
})

// ---- Connexion & Création de compte ----
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

app.get('/dashboard/compte-inactif', async (c) => {
  setSecurityHeaders(c)
  const nomProjet = await getNomProjet(c.env)
  return c.html(renderCompteInactifPage(nomProjet))
})

app.get('/dashboard/*', async (c) => {
  setSecurityHeaders(c)

  const token = getCookie(c, ACCESS_TOKEN_COOKIE)
  if (!token) {
    return c.redirect('/dashboard', 302)
  }

  try {
    const supabase = createSupabaseClient(c.env)
    const { data: { user }, error } = await supabase.auth.getUser(token)
    if (error || !user) {
      return c.redirect('/dashboard', 302)
    }

    if (!c.req.path.startsWith('/dashboard/compte-inactif')) {
      const adminClient = createSupabaseAdminClient(c.env)
      const { data: ut } = await adminClient
        .from('utilisateurs_tenant')
        .select('tenants!inner(statut)')
        .eq('auth_user_id', user.id)
        .single()

      const statutTenant = (ut?.tenants as any)?.statut
      // en_attente_confirmation : fenêtre de 72h — le tenant reste accessible (audit 06-sync §8)
      if (!statutTenant || !['actif', 'essai', 'en_attente_confirmation'].includes(statutTenant)) {
        return c.redirect('/dashboard/compte-inactif', 302)
      }
    }
  } catch {
    return c.redirect('/dashboard', 302)
  }

  const nomProjet = await getNomProjet(c.env)
  return c.html(renderDashboardPage(nomProjet, c.env.SUPABASE_URL, c.env.SUPABASE_ANON_KEY))
})

// ---- Page Bienvenue — onboarding post-inscription (page PRIVÉE, auth requise) ----
app.get('/bienvenue', async (c) => {
  setSecurityHeaders(c)

  const token = getCookie(c, ACCESS_TOKEN_COOKIE)
  if (!token) {
    return c.redirect('/connexion', 302)
  }

  try {
    const supabase = createSupabaseClient(c.env)
    const { data: { user }, error } = await supabase.auth.getUser(token)
    if (error || !user) {
      return c.redirect('/connexion', 302)
    }
  } catch {
    return c.redirect('/connexion', 302)
  }

  const nomProjet = await getNomProjet(c.env)
  return c.html(renderBienvenuePage(nomProjet))
})

// ---- Page boutique restaurant (DOIT être EN DERNIER — route générique) ----
app.get('/:slug', async (c) => {
  setSecurityHeaders(c)
  const slug = c.req.param('slug')

  const tenant = await fetchTenantAvecPdv(c.env, { colonne: 'slug', valeur: slug })

  if (!tenant) {
    const nomP = await getNomProjet(c.env)
    return c.html(render404Page(nomP, 'fr'), 404)
  }

  const nomProjet = await getNomProjet(c.env)
  return c.html(renderBoutiquePage(tenant, nomProjet))
})

// ---- 404 ----
app.notFound(async (c) => {
  const nomP = await getNomProjet(c.env).catch(() => 'MonMenu')
  return c.html(render404Page(nomP, 'fr'), 404)
})

// ---- Erreurs globales ----
app.onError((err, c) => {
  const message = err instanceof Error ? err.message : String(err)
  const stack = err instanceof Error ? err.stack : undefined
  console.error('[MonMenu Error]', message, stack ? `\n${stack}` : '')
  return c.json({ error: 'Erreur interne du serveur.' }, 500)
})

// §1.8 — Export objet Worker complet avec handler scheduled (Cron Triggers)
import { handleScheduled } from './routes/api-cron'

export default {
  fetch: app.fetch.bind(app),
  scheduled: handleScheduled
}
