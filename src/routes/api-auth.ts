// API Auth — Supabase Auth (connexion, inscription, déconnexion restaurant)
import { Hono } from 'hono'
import type { Env } from '../types/database'
import { checkRateLimit, setSecurityHeaders } from '../lib/security'
import { createSupabaseClient } from '../lib/supabase'

const authRouter = new Hono<{ Bindings: Env }>()

// POST /api/v1/auth/login — Connexion restaurant via Supabase Auth
authRouter.post('/login', async (c) => {
  setSecurityHeaders(c)
  const ip = c.req.header('CF-Connecting-IP') ?? 'unknown'

  // Rate limiting strict : 5 tentatives / 15 min par IP
  const rateLimit = await checkRateLimit(`auth_login:${ip}`, 5, 900000)
  if (!rateLimit.allowed) {
    return c.json({ error: 'Trop de tentatives de connexion. Réessayez dans 15 minutes.' }, 429)
  }

  let body: { email?: string; password?: string }
  try { body = await c.req.json() }
  catch { return c.json({ error: 'JSON invalide.' }, 400) }

  const { email, password } = body
  if (!email || !password || typeof email !== 'string' || typeof password !== 'string') {
    return c.json({ error: 'Email et mot de passe requis.' }, 422)
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return c.json({ error: 'Email invalide.' }, 422)
  }

  const supabase = createSupabaseClient(c.env)
  const { data, error } = await supabase.auth.signInWithPassword({ email, password })

  if (error || !data.session) {
    return c.json({ error: 'Identifiants incorrects.' }, 401)
  }

  // Récupérer le tenant lié à cet utilisateur Supabase
  const tenant = await c.env.DB
    .prepare(`
      SELECT t.id, t.nom, t.slug, t.statut, t.plan_id, t.couleur_primaire
      FROM utilisateurs_tenant ut
      JOIN tenants t ON t.id = ut.tenant_id
      WHERE ut.auth_user_id = ? AND t.deleted_at IS NULL
      LIMIT 1
    `)
    .bind(data.user.id)
    .first<{ id: string; nom: string; slug: string; statut: string; plan_id: string; couleur_primaire: string }>()

  if (!tenant) {
    return c.json({ error: 'Aucun restaurant associé à ce compte.' }, 404)
  }

  if (tenant.statut === 'suspendu') {
    return c.json({ error: 'Votre compte est suspendu. Contactez le support.' }, 403)
  }

  // Stocker token dans KV_CACHE avec TTL 1h
  const sessionKey = `session:${data.session.access_token.slice(-20)}`
  if (c.env.KV_CACHE) {
    await c.env.KV_CACHE.put(sessionKey, JSON.stringify({
      user_id: data.user.id,
      tenant_id: tenant.id,
      tenant_slug: tenant.slug,
      email: data.user.email,
      exp: Date.now() + 3600000
    }), { expirationTtl: 3600 })
  }

  return c.json({
    success: true,
    access_token: data.session.access_token,
    refresh_token: data.session.refresh_token,
    tenant: {
      id: tenant.id,
      nom: tenant.nom,
      slug: tenant.slug,
      statut: tenant.statut,
      couleur_primaire: tenant.couleur_primaire
    }
  })
})

// POST /api/v1/auth/register — Inscription restaurant (crée auth Supabase + tenant D1)
authRouter.post('/register', async (c) => {
  setSecurityHeaders(c)
  const ip = c.req.header('CF-Connecting-IP') ?? 'unknown'

  // Rate limiting : 3 inscriptions / heure par IP
  const rateLimit = await checkRateLimit(`auth_register:${ip}`, 3, 3600000)
  if (!rateLimit.allowed) {
    return c.json({ error: 'Trop de tentatives. Réessayez dans une heure.' }, 429)
  }

  let body: {
    email?: string; password?: string; nom_restaurant?: string
    whatsapp_number?: string; nom_gerant?: string
  }
  try { body = await c.req.json() }
  catch { return c.json({ error: 'JSON invalide.' }, 400) }

  const { email, password, nom_restaurant, whatsapp_number, nom_gerant } = body

  if (!email || !password || !nom_restaurant || !whatsapp_number || !nom_gerant) {
    return c.json({ error: 'Tous les champs sont requis.' }, 422)
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return c.json({ error: 'Email invalide.' }, 422)
  }
  if (password.length < 8) {
    return c.json({ error: 'Mot de passe trop court (8 caractères minimum).' }, 422)
  }
  if (!/^\+?[0-9]{10,15}$/.test(whatsapp_number.replace(/\s/g, ''))) {
    return c.json({ error: 'Numéro WhatsApp invalide.' }, 422)
  }

  // Générer le slug depuis le nom
  const { sanitizeSlug } = await import('../lib/security')
  let slug = sanitizeSlug(nom_restaurant)
  if (!slug) slug = 'restaurant-' + Date.now().toString(36)

  // Vérifier unicité du slug
  const existingSlug = await c.env.DB
    .prepare('SELECT id FROM tenants WHERE slug = ?')
    .bind(slug)
    .first()
  if (existingSlug) {
    slug = slug + '-' + Date.now().toString(36).slice(-4)
  }

  // Vérifier unicité email dans D1
  const existingUser = await c.env.DB
    .prepare('SELECT id FROM utilisateurs_tenant WHERE auth_user_id IN (SELECT auth_user_id FROM utilisateurs_tenant)')
    .first()

  // Créer compte Supabase Auth
  const supabase = createSupabaseClient(c.env)
  const { data: authData, error: authError } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { nom_restaurant, nom_gerant }
    }
  })

  if (authError || !authData.user) {
    if (authError?.message?.includes('already registered')) {
      return c.json({ error: 'Cet email est déjà utilisé.' }, 409)
    }
    return c.json({ error: authError?.message ?? 'Erreur lors de la création du compte.' }, 500)
  }

  // Récupérer plan gratuit et pays par défaut
  const planGratuit = await c.env.DB
    .prepare("SELECT id FROM plans WHERE nom = 'Gratuit' OR ordre_affichage = 0 LIMIT 1")
    .first<{ id: string }>()

  const pays = await c.env.DB
    .prepare("SELECT id FROM pays WHERE code_iso = 'BF' LIMIT 1")
    .first<{ id: string }>()

  const tenantId = crypto.randomUUID()
  const utilisateurId = crypto.randomUUID()
  const now = new Date().toISOString()

  // Créer tenant dans D1
  await c.env.DB.prepare(`
    INSERT INTO tenants (id, pays_id, nom, slug, whatsapp_number,
      couleur_primaire, couleur_secondaire, statut, plan_id, metadata, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, '#DC2626', '#1D4ED8', 'essai', ?, '{}', ?, ?)
  `)
    .bind(tenantId, pays?.id ?? null, nom_restaurant, slug,
      whatsapp_number.replace(/\s/g, ''), planGratuit?.id ?? null, now, now)
    .run()

  // Créer point de vente principal
  const pdvId = crypto.randomUUID()
  await c.env.DB.prepare(`
    INSERT INTO points_de_vente (id, tenant_id, nom, adresse, actif, created_at, updated_at)
    VALUES (?, ?, ?, '', 1, ?, ?)
  `)
    .bind(pdvId, tenantId, 'Point de vente principal', now, now)
    .run()

  // Lier utilisateur Supabase au tenant
  await c.env.DB.prepare(`
    INSERT INTO utilisateurs_tenant (id, tenant_id, auth_user_id, role, nom, created_at)
    VALUES (?, ?, ?, 'proprietaire', ?, ?)
  `)
    .bind(utilisateurId, tenantId, authData.user.id, nom_gerant, now)
    .run()

  return c.json({
    success: true,
    message: 'Compte créé avec succès. Vérifiez votre email pour confirmer votre inscription.',
    slug,
    tenant_id: tenantId
  }, 201)
})

// POST /api/v1/auth/logout — Déconnexion
authRouter.post('/logout', async (c) => {
  setSecurityHeaders(c)
  const authHeader = c.req.header('Authorization')
  const token = authHeader?.replace('Bearer ', '')

  if (token && c.env.KV_CACHE) {
    const sessionKey = `session:${token.slice(-20)}`
    await c.env.KV_CACHE.delete(sessionKey)
  }

  return c.json({ success: true })
})

// POST /api/v1/auth/refresh — Refresh token Supabase
authRouter.post('/refresh', async (c) => {
  setSecurityHeaders(c)
  let body: { refresh_token?: string }
  try { body = await c.req.json() }
  catch { return c.json({ error: 'JSON invalide.' }, 400) }

  if (!body.refresh_token) {
    return c.json({ error: 'refresh_token requis.' }, 422)
  }

  const supabase = createSupabaseClient(c.env)
  const { data, error } = await supabase.auth.refreshSession({ refresh_token: body.refresh_token })

  if (error || !data.session) {
    return c.json({ error: 'Session expirée. Reconnectez-vous.' }, 401)
  }

  return c.json({
    access_token: data.session.access_token,
    refresh_token: data.session.refresh_token
  })
})

export { authRouter }
