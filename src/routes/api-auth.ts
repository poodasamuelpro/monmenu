// API Auth — Supabase Auth (connexion, inscription, déconnexion restaurant)
// ARCHITECTURE :
//   • Supabase Auth  → authentification (signIn, signUp, JWT, refresh)
//   • Supabase DB    → tenants, utilisateurs_tenant, points_de_vente  (APPLICATION)
//   • D1 Cloudflare  → plans, pays  (SITE WEB — lecture uniquement pour inscription)

import { Hono } from 'hono'
import type { Env } from '../types/database'
import { checkRateLimit, setSecurityHeaders } from '../lib/security'
import { createSupabaseClient, createSupabaseAdminClient } from '../lib/supabase'

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

  // Récupérer le tenant lié à cet utilisateur — SUPABASE (application)
  const { data: tenantData, error: tenantError } = await supabase
    .from('utilisateurs_tenant')
    .select(`
      tenant_id,
      tenants!inner (id, nom, slug, statut, plan_id, couleur_primaire)
    `)
    .eq('auth_user_id', data.user.id)
    .is('tenants.deleted_at', null)
    .neq('tenants.statut', 'suspendu')
    .limit(1)
    .single()

  if (tenantError || !tenantData) {
    return c.json({ error: 'Aucun restaurant associé à ce compte.' }, 404)
  }

  const tenant = tenantData.tenants as any

  if (tenant.statut === 'suspendu') {
    return c.json({ error: 'Votre compte est suspendu. Contactez le support.' }, 403)
  }

  // Stocker token dans KV_CACHE avec TTL 1h (optionnel)
  if (c.env.KV_CACHE) {
    const sessionKey = `session:${data.session.access_token.slice(-20)}`
    try {
      await c.env.KV_CACHE.put(sessionKey, JSON.stringify({
        user_id: data.user.id,
        tenant_id: tenant.id,
        tenant_slug: tenant.slug,
        email: data.user.email,
        exp: Date.now() + 3600000
      }), { expirationTtl: 3600 })
    } catch { /* KV optionnel */ }
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

// POST /api/v1/auth/register — Inscription restaurant
// Auth Supabase + tenant/utilisateur créés dans Supabase (application)
// Plans/pays lus depuis D1 (site web) pour la copie des métadonnées
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

  const supabase = createSupabaseClient(c.env)
  const adminClient = createSupabaseAdminClient(c.env)

  // Vérifier unicité du slug dans Supabase (APPLICATION)
  const { data: existingSlug } = await supabase
    .from('tenants')
    .select('id')
    .eq('slug', slug)
    .limit(1)
    .single()

  if (existingSlug) {
    slug = slug + '-' + Date.now().toString(36).slice(-4)
  }

  // Créer compte Supabase Auth
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

  // Récupérer plan gratuit depuis D1 (SITE WEB) — lecture uniquement pour nom du plan
  const planGratuit = await c.env.DB
    .prepare("SELECT id, nom FROM plans WHERE nom = 'Gratuit' OR ordre_affichage = 0 LIMIT 1")
    .first<{ id: string; nom: string }>()

  // Récupérer ID pays Burkina Faso depuis D1 (SITE WEB) — lecture uniquement
  const pays = await c.env.DB
    .prepare("SELECT id FROM pays WHERE code_iso = 'BF' LIMIT 1")
    .first<{ id: string }>()

  const now = new Date().toISOString()

  // Créer le tenant dans SUPABASE (APPLICATION)
  const { data: newTenant, error: tenantInsertError } = await adminClient
    .from('tenants')
    .insert({
      pays_id: pays?.id ?? null,
      nom: nom_restaurant,
      slug,
      whatsapp_number: whatsapp_number.replace(/\s/g, ''),
      couleur_primaire: '#DC2626',
      couleur_secondaire: '#1D4ED8',
      statut: 'essai',
      plan_id: planGratuit?.id ?? null,
      metadata: {}
    })
    .select('id, slug')
    .single()

  if (tenantInsertError || !newTenant) {
    console.error('Erreur création tenant Supabase:', tenantInsertError)
    return c.json({ error: 'Erreur lors de la création du restaurant.' }, 500)
  }

  // Créer point de vente principal dans SUPABASE (APPLICATION)
  await adminClient
    .from('points_de_vente')
    .insert({
      tenant_id: newTenant.id,
      nom: 'Point de vente principal',
      adresse: '',
      actif: true
    })

  // Lier utilisateur Supabase Auth au tenant dans SUPABASE (APPLICATION)
  await adminClient
    .from('utilisateurs_tenant')
    .insert({
      tenant_id: newTenant.id,
      auth_user_id: authData.user.id,
      role: 'proprietaire',
      nom: nom_gerant
    })

  // Session auto si email confirmation non requise
  let sessionData: { access_token?: string; refresh_token?: string } = {}
  if (authData.session) {
    sessionData = {
      access_token: authData.session.access_token,
      refresh_token: authData.session.refresh_token
    }
  }

  return c.json({
    success: true,
    message: authData.session
      ? 'Compte créé avec succès. Vous êtes connecté.'
      : 'Compte créé. Vérifiez votre email pour confirmer votre inscription.',
    slug: newTenant.slug,
    tenant_id: newTenant.id,
    boutique_url: `https://monmenu.app/${newTenant.slug}`,
    ...(authData.session ? {
      tenant: {
        id: newTenant.id,
        nom: nom_restaurant,
        slug: newTenant.slug,
        statut: 'essai',
        couleur_primaire: '#DC2626'
      }
    } : {}),
    ...sessionData
  }, 201)
})

// POST /api/v1/auth/logout — Déconnexion
authRouter.post('/logout', async (c) => {
  setSecurityHeaders(c)
  const authHeader = c.req.header('Authorization')
  const token = authHeader?.replace('Bearer ', '')

  if (token && c.env.KV_CACHE) {
    const sessionKey = `session:${token.slice(-20)}`
    try { await c.env.KV_CACHE.delete(sessionKey) } catch {}
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
