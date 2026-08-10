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
import { adminTasksRouter } from './routes/api-admin-tasks'
import { adminPaiementsRouter } from './routes/api-admin-paiements'
// AJOUT — Route publique du formulaire de contact (envoi email réel via Brevo)
import { contactRouter } from './routes/api-contact'
import { setSecurityHeaders } from './lib/security'
import { getNomProjet, getWhatsAppSupport, createSupabaseAdminClient, createSupabaseClient } from './lib/supabase'
// CYCLE-4 — logique d'accès unifiée (voir src/lib/acces-tenant.ts)
import { verifierAccesTenant } from './lib/acces-tenant'

// ---- Imports composants & pages ----
import { renderHomePage } from './pages/home'
import { renderContactPage } from './pages/contact'
import { renderBlogPage } from './pages/blog'
import { renderArticlePage } from './pages/article'
import { renderInscriptionPage } from './pages/inscription'
import { renderLegalPage } from './pages/legal'
import { renderConnexionPage } from './pages/auth'
import { renderForgotPasswordPage } from './pages/forgot-password'
import { renderDashboardPage } from './pages/dashboard'
import { renderSuiviPage } from './pages/suivi'
import { renderBoutiquePage, type TenantBoutique } from './pages/boutique'
import { render404Page } from './pages/not-found'
import { renderBienvenuePage } from './pages/bienvenue'
import { renderCompteInactifPage } from './pages/compte-inactif'
import { renderTarifsPage } from './pages/tarifs'

const app = new Hono<{ Bindings: Env }>()

// Nom du cookie httpOnly — doit rester identique à celui posé dans api-auth.ts
const ACCESS_TOKEN_COOKIE = 'sb-access-token'

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

// ---- Middleware custom domain : résolution de domaine_perso vers boutique ----
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
app.route('/api/v1/paiement', paiementRouter)
app.route('/api/v1/admin/tasks', adminTasksRouter)
app.route('/api/v1/admin/paiements', adminPaiementsRouter)
// AJOUT — Formulaire de contact public (envoi email réel)
app.route('/api/v1/contact', contactRouter)

// ─── Endpoint PUBLIC GET /api/v1/moyens-paiement ──────────────────
app.get('/api/v1/moyens-paiement', async (c) => {
  setSecurityHeaders(c)
  try {
    const supabase = createSupabaseClient(c.env)
    const { data, error } = await supabase
      .from('moyens_paiement')
      .select('id, code, nom, description, instructions, numero, logo_url, actif')
      .eq('actif', true)
      .order('ordre_affichage', { ascending: true })
    if (error) throw error
    return c.json({ moyens: data ?? [] })
  } catch (err: any) {
    return c.json({ moyens: [], error: 'Moyens de paiement temporairement indisponibles.' }, 200)
  }
})

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
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>${baseUrl}/</loc>
    <changefreq>weekly</changefreq>
    <priority>1.0</priority>
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
- Accueil : https://monmenu.com/
- Blog : https://monmenu.com/blog
- Contact : https://monmenu.com/contact
- Inscription restaurant : https://monmenu.com/inscription
- Connexion dashboard : https://monmenu.com/connexion

## Pages légales
- CGU : https://monmenu.com/legal/cgu
- Confidentialité : https://monmenu.com/legal/confidentialite
- Mentions légales : https://monmenu.com/legal/mentions
- Cookies : https://monmenu.com/legal/cookies

## Boutiques restaurants
Chaque restaurant inscrit dispose d'une boutique publique accessible via :
https://monmenu.com/{slug-du-restaurant}

## API publique
- Commandes : POST /api/v1/commandes
- Suivi commande : GET /api/v1/commandes/suivi/{token}
- Blog (lecture) : GET /api/v1/blog, GET /api/v1/blog/{slug}

## Technologies
- Backend : Hono v4 sur Cloudflare Workers
- Base de données : Supabase PostgreSQL + Cloudflare D1
- Paiements : Mobile Money, espèces, carte bancaire (selon disponibilité du restaurant)
- Notifications : WhatsApp Business API

## Langue
Français uniquement

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
  return c.html(renderSuiviPage(token, nomProjet))
})

// ---- Page d'accueil ----
app.get('/', async (c) => {
  setSecurityHeaders(c)
  const nomProjet = await getNomProjet(c.env)
  return c.html(renderHomePage(nomProjet))
})

// ---- Pages institutionnelles ----
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

// ---- Page Tarifs ----
app.get('/tarifs', async (c) => {
  setSecurityHeaders(c)
  const nomProjet = await getNomProjet(c.env)
  return c.html(renderTarifsPage(nomProjet))
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
    return c.html(render404Page(nomP), 404)
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
  return c.redirect('/inscription', 301)
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

// CYCLE-4 — FIX : le middleware utilisait tenants.statut === 'en_attente_confirmation',
// un statut qui n'existe en réalité que sur la table `abonnements`, jamais
// sur `tenants` → cette branche ne se déclenchait donc jamais, ce qui
// coupait l'accès complet pendant la fenêtre de 72h de vérification d'un
// paiement (alors même que verifyAuthPaiement() l'autorisait déjà côté API).
// Remplacé par verifierAccesTenant(), LOGIQUE UNIQUE partagée avec
// api-dashboard.ts et api-paiement.ts.
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
        .select('tenant_id')
        .eq('auth_user_id', user.id)
        .single()

      if (!ut?.tenant_id) {
        return c.redirect('/dashboard/compte-inactif', 302)
      }

      const resultat = await verifierAccesTenant(c.env, ut.tenant_id)

      // CYCLE-6 : 'bloque' (inactif, récupérable) redirige désormais vers
      // /dashboard/abonnement au même titre que 'paiement_initial' — un
      // tenant inactif doit TOUJOURS pouvoir revoir son statut et payer.
      // Seul 'suspendu' (et 'introuvable') va vers compte-inactif, un vrai
      // mur non contournable sans intervention admin.
      if (resultat.mode === 'paiement_initial' || resultat.mode === 'bloque') {
        if (!c.req.path.startsWith('/dashboard/abonnement')) {
          return c.redirect('/dashboard/abonnement', 302)
        }
      } else if (!resultat.accesComplet) {
        return c.redirect('/dashboard/compte-inactif', 302)
      }
      // 'actif' / 'essai' / 'grace_confirmation' → accès complet au dashboard
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
    return c.html(render404Page(nomP), 404)
  }

  const nomProjet = await getNomProjet(c.env)
  return c.html(renderBoutiquePage(tenant, nomProjet))
})

// ---- 404 ----
app.notFound(async (c) => {
  const nomP = await getNomProjet(c.env).catch(() => 'MonMenu')
  return c.html(render404Page(nomP), 404)
})

// ---- Erreurs globales ----
app.onError((err, c) => {
  const message = err instanceof Error ? err.message : String(err)
  const stack = err instanceof Error ? err.stack : undefined
  console.error('[MonMenu Error]', message, stack ? `\n${stack}` : '')
  return c.json({ error: 'Erreur interne du serveur.' }, 500)
})

import { handleScheduled } from './routes/api-cron'

export default {
  fetch: app.fetch.bind(app),
  scheduled: handleScheduled
}
