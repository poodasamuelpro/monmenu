// src/routes/api-blog.ts
import { Hono } from 'hono'
import type { Env } from '../types/database'
import { createSupabaseAdminClient } from '../lib/supabase'
import { authMiddlewarePlatform } from '../middleware/auth'

export const blogRouter = new Hono<{ Bindings: Env }>()

// §1 — Toutes les routes /admin/* sont protégées par JWT Supabase.
// CORS seul ne constitue PAS une protection d'authentification :
// il ne bloque que les requêtes cross-origin browser, pas curl/Postman/scripts.
blogRouter.use('/admin/*', authMiddlewarePlatform)

// GET /api/v1/blog — liste des articles publiés (public)
blogRouter.get('/', async (c) => {
  const adminClient = createSupabaseAdminClient(c.env)
  const { data, error } = await adminClient
    .from('articles')
    .select('slug, titre, extrait, categorie, temps_lecture, image_url, date_publication')
    .eq('statut', 'publie')
    .order('date_publication', { ascending: false })

  if (error) {
    console.error('[Blog] Erreur récupération articles:', error)
    return c.json({ error: 'Erreur lors de la récupération des articles.' }, 500)
  }

  return c.json({ articles: data ?? [] })
})

// GET /api/v1/blog/:slug — un article publié (public)
blogRouter.get('/:slug', async (c) => {
  const slug = c.req.param('slug')
  const adminClient = createSupabaseAdminClient(c.env)
  const { data, error } = await adminClient
    .from('articles')
    .select('*')
    .eq('slug', slug)
    .eq('statut', 'publie')
    .maybeSingle()

  if (error || !data) {
    return c.json({ error: 'Article introuvable.' }, 404)
  }

  return c.json({ article: data })
})

// POST /api/v1/blog/admin — créer un article
blogRouter.post('/admin', async (c) => {
  const body = await c.req.json().catch(() => null)
  if (!body?.titre || !body?.slug || !body?.extrait || !body?.contenu) {
    return c.json({ error: 'Champs requis manquants (titre, slug, extrait, contenu).' }, 400)
  }

  const adminClient = createSupabaseAdminClient(c.env)
  const { data, error } = await adminClient
    .from('articles')
    .insert({
      slug: body.slug,
      titre: body.titre,
      extrait: body.extrait,
      contenu: body.contenu,
      categorie: body.categorie ?? 'Guide',
      temps_lecture: body.temps_lecture ?? null,
      image_url: body.image_url ?? null,
      statut: body.statut === 'publie' ? 'publie' : 'brouillon',
      auteur: body.auteur ?? null,
      date_publication: body.statut === 'publie' ? new Date().toISOString() : null
    })
    .select()
    .single()

  if (error) {
    console.error('[Blog admin] Erreur création article:', error)
    return c.json({ error: "Impossible de créer l'article (slug déjà utilisé ?)." }, 500)
  }

  return c.json({ article: data }, 201)
})

// PATCH /api/v1/blog/admin/:id — modifier un article
blogRouter.patch('/admin/:id', async (c) => {
  const id = c.req.param('id')
  // B-BLOG-01 — fix session-5 : validation UUID sur l'id avant tout appel DB.
  const UUID_BLOG_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
  if (!UUID_BLOG_REGEX.test(id)) {
    return c.json({ error: 'Format id invalide (UUID v4 attendu).' }, 422)
  }
  const body = await c.req.json().catch(() => ({}))

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }
  for (const field of ['titre', 'slug', 'extrait', 'contenu', 'categorie', 'temps_lecture', 'image_url', 'auteur']) {
    if (body[field] !== undefined) updates[field] = body[field]
  }
  if (body.statut === 'publie' || body.statut === 'brouillon') {
    updates.statut = body.statut
    if (body.statut === 'publie') updates.date_publication = new Date().toISOString()
  }

  const adminClient = createSupabaseAdminClient(c.env)
  const { data, error } = await adminClient
    .from('articles')
    .update(updates)
    .eq('id', id)
    .select()
    .maybeSingle()

  // B-BLOG-02 — fix session-5 : maybeSingle() retourne data=null si aucune ligne trouvée
  // (404) — traité différemment d'une vraie erreur serveur (500).
  if (error) {
    return c.json({ error: "Impossible de modifier l'article." }, 500)
  }
  if (!data) {
    return c.json({ error: 'Article introuvable.' }, 404)
  }

  return c.json({ article: data })
})

// DELETE /api/v1/blog/admin/:id — supprimer un article
blogRouter.delete('/admin/:id', async (c) => {
  const id = c.req.param('id')
  const adminClient = createSupabaseAdminClient(c.env)
  const { error } = await adminClient.from('articles').delete().eq('id', id)

  if (error) {
    return c.json({ error: "Impossible de supprimer l'article." }, 500)
  }

  return c.json({ success: true })
})

export default blogRouter

// ── Middleware de vérification de rôle plateforme (A-11/FINDING-06, session-7)
// authMiddlewarePlatform vérifie le JWT mais pas si l'email est dans ADMIN_EMAILS.
// Ce middleware secondaire ajoute la vérification de liste blanche d'emails.
// PRÉREQUIS : la variable d'environnement ADMIN_EMAILS doit être configurée
// (wrangler secret put ADMIN_EMAILS) sous la forme "email1@ex.com,email2@ex.com".
// Si ADMIN_EMAILS est vide/absente, TOUTES les routes /admin/* sont bloquées
// par mesure de sécurité (fail-closed — personne ne peut y accéder).
blogRouter.use('/admin/*', async (c, next) => {
  const auth = c.get('auth') as any
  const adminEmails = (c.env.ADMIN_EMAILS ?? '').split(',').map((e: string) => e.trim()).filter(Boolean)
  if (adminEmails.length === 0) {
    return c.json({ error: 'Administration blog non configurée (ADMIN_EMAILS manquant).' }, 503)
  }
  const supabase = (await import('../lib/supabase')).createSupabaseClient(c.env)
  const { data: { user } } = await supabase.auth.getUser(auth.token)
  if (!user?.email || !adminEmails.includes(user.email)) {
    return c.json({ error: 'Accès réservé aux administrateurs de la plateforme.' }, 403)
  }
  return next()
})
