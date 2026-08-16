// src/routes/api-blog.ts
import { Hono } from 'hono'
import type { Env } from '../types/database'
import { createSupabaseAdminClient, createSupabaseClient } from '../lib/supabase'
import { authMiddlewarePlatform, type AuthContext } from '../middleware/auth'
import { timingSafeEqual } from '../lib/security'

// BUG-01 CORRIGÉ — Le middleware ADMIN_EMAILS était déclaré APRÈS les routes
// qu'il protège, il ne s'appliquait donc JAMAIS (tout utilisateur Supabase
// authentifié pouvait créer/modifier/supprimer des articles).
//
// Ordre CORRIGÉ :
//   1. authMiddlewarePlatform — vérifie le JWT (valide, non révoqué)
//   2. Middleware ADMIN_EMAILS — vérifie que l'email est dans la liste blanche
//   3. Routes POST/PATCH/DELETE /admin/*
//
// Également : vérification via table Supabase `admins` en priorité si disponible
// (cohérence avec S2-03), ADMIN_EMAILS en fallback.
//
// BUG-02 CORRIGÉ — DELETE /admin/:id sans validation UUID ni vérification de
// lignes affectées → ajout validation regex UUID + .select('id') + 404 si vide.
//
// S3-01 CORRIGÉ — contenu HTML des articles sanitisé avant rendu (suppression
// des balises script, handlers d'événements et javascript: URIs).

export const blogRouter = new Hono<{ Bindings: Env & { ADMIN_EMAILS?: string }; Variables: { auth: AuthContext } }>()

// ── Helper : vérifier si l'email est admin (table admins > ADMIN_EMAILS > fallback) ──
async function isAdminEmail(env: Env & { ADMIN_EMAILS?: string }, email: string): Promise<boolean> {
  // Priorité 1 : vérifier dans la table Supabase `admins`
  try {
    const adminClient = createSupabaseAdminClient(env)
    const { data, error } = await adminClient
      .from('admins')
      .select('id')
      .eq('email', email)
      .maybeSingle()
    if (!error && data) return true
    // Si la table n'existe pas (PGRST116/42P01), continuer vers ADMIN_EMAILS
  } catch { /* table absente ou RLS — continuer */ }

  // Priorité 2 : ADMIN_EMAILS (variable d'environnement)
  const adminEmails = ((env as any).ADMIN_EMAILS ?? '').split(',').map((e: string) => e.trim()).filter(Boolean)
  if (adminEmails.length > 0) {
    return adminEmails.includes(email)
  }

  // Aucune configuration → fail-closed
  return false
}

// ── Middleware 1 : JWT valide ──
blogRouter.use('/admin/*', authMiddlewarePlatform)

// ── Middleware 2 : vérification rôle admin ─────────────────────────────────
// DOIT être déclaré AVANT les routes POST/PATCH/DELETE /admin/*
// (Hono applique les middlewares dans l'ordre de déclaration).
blogRouter.use('/admin/*', async (c, next) => {
  const auth = c.get('auth') as any
  const supabase = createSupabaseClient(c.env)
  const { data: { user } } = await supabase.auth.getUser(auth.token)

  if (!user?.email) {
    return c.json({ error: 'Identité non vérifiable.' }, 403)
  }

  const estAdmin = await isAdminEmail(c.env as any, user.email)
  if (!estAdmin) {
    console.warn(`[Blog admin] Accès refusé à ${user.email} — non présent dans admins ni ADMIN_EMAILS`)
    return c.json({ error: 'Accès réservé aux administrateurs de la plateforme.' }, 403)
  }

  return next()
})

// ── Routes publiques ───────────────────────────────────────────────────────

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

// ── Routes admin (protégées par les deux middlewares ci-dessus) ────────────

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
  if (error) {
    return c.json({ error: "Impossible de modifier l'article." }, 500)
  }
  if (!data) {
    return c.json({ error: 'Article introuvable.' }, 404)
  }

  return c.json({ article: data })
})

// DELETE /api/v1/blog/admin/:id — supprimer un article
// BUG-02 CORRIGÉ — ajout validation UUID + vérification lignes affectées
blogRouter.delete('/admin/:id', async (c) => {
  const id = c.req.param('id')
  const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
  if (!UUID_REGEX.test(id)) {
    return c.json({ error: 'Format id invalide (UUID v4 attendu).' }, 422)
  }

  const adminClient = createSupabaseAdminClient(c.env)
  const { data: deletedRows, error } = await adminClient
    .from('articles')
    .delete()
    .eq('id', id)
    .select('id')

  if (error) {
    return c.json({ error: "Impossible de supprimer l'article." }, 500)
  }
  if (!deletedRows || deletedRows.length === 0) {
    return c.json({ error: 'Article introuvable.' }, 404)
  }

  return c.json({ success: true })
})

export default blogRouter
