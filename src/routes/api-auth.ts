// API Auth — Supabase Auth (connexion, inscription, déconnexion restaurant)
// ARCHITECTURE :
//   • Supabase Auth  → authentification (signIn, signUp, JWT, refresh)
//   • Supabase DB    → tenants, utilisateurs_tenant, points_de_vente  (APPLICATION)
//   • D1 Cloudflare  → plans, pays  (SITE WEB — lecture uniquement pour inscription)
//
// §2 — Migration cookies httpOnly : login/register posent désormais des
// cookies httpOnly + Secure + SameSite=Lax contenant access/refresh token.
// Le corps JSON continue de renvoyer les tokens en clair pour les clients
// API/mobile qui n'utilisent pas de cookies (rétrocompatibilité).

import { Hono } from 'hono'
import { setCookie, deleteCookie, getCookie } from 'hono/cookie'
import type { Env } from '../types/database'
import { checkRateLimit, setSecurityHeaders, sanitizeSlug } from '../lib/security'
import { createSupabaseClient, createSupabaseAdminClient } from '../lib/supabase'

const authRouter = new Hono<{ Bindings: Env }>()

// Noms de cookies — DOIVENT être strictement identiques à ceux lus dans
// src/middleware/auth.ts et src/routes/api-dashboard.ts.
const ACCESS_TOKEN_COOKIE = 'sb-access-token'
const REFRESH_TOKEN_COOKIE = 'sb-refresh-token'

// §2.CSRF — Middleware CSRF sur les routes sensibles de ce router (logout, refresh).
// login et register sont exemptés : un CSRF sur login ne compromet pas le compte
// (le navigateur n'envoie pas les credentials du site cible). logout et refresh
// changent l'état de session, donc nécessitent la protection.
// Les clients API/mobile avec Bearer token sont toujours exemptés.
authRouter.use('/logout', async (c, next) => {
  const hasBearerToken = c.req.header('Authorization')?.startsWith('Bearer ')
  if (hasBearerToken) return next()
  const xRequestedWith = c.req.header('X-Requested-With')
  if (xRequestedWith !== 'XMLHttpRequest') {
    return c.json({ error: 'Header X-Requested-With: XMLHttpRequest requis.', code: 'CSRF_PROTECTION' }, 403)
  }
  return next()
})

authRouter.use('/refresh', async (c, next) => {
  const hasBearerToken = c.req.header('Authorization')?.startsWith('Bearer ')
  if (hasBearerToken) return next()
  const xRequestedWith = c.req.header('X-Requested-With')
  if (xRequestedWith !== 'XMLHttpRequest') {
    return c.json({ error: 'Header X-Requested-With: XMLHttpRequest requis.', code: 'CSRF_PROTECTION' }, 403)
  }
  return next()
})

// Durées de vie des cookies (en secondes). L'access token Supabase expire
// généralement après 1h côté serveur — le cookie peut avoir une durée un
// peu plus longue sans risque : Supabase invalidera de toute façon le JWT
// expiré lors de auth.getUser().
const ACCESS_TOKEN_MAX_AGE = 3600 // 1 heure
const REFRESH_TOKEN_MAX_AGE = 60 * 60 * 24 * 30 // 30 jours

function cookieOptions(maxAge: number) {
  return {
    httpOnly: true,
    secure: true,
    sameSite: 'Lax' as const,
    path: '/',
    maxAge
  }
}

function setAuthCookies(c: any, accessToken: string, refreshToken: string) {
  setCookie(c, ACCESS_TOKEN_COOKIE, accessToken, cookieOptions(ACCESS_TOKEN_MAX_AGE))
  setCookie(c, REFRESH_TOKEN_COOKIE, refreshToken, cookieOptions(REFRESH_TOKEN_MAX_AGE))
}

function clearAuthCookies(c: any) {
  deleteCookie(c, ACCESS_TOKEN_COOKIE, { path: '/' })
  deleteCookie(c, REFRESH_TOKEN_COOKIE, { path: '/' })
}

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

  // §2 — Pose des cookies httpOnly (source d'authentification principale pour le dashboard web)
  setAuthCookies(c, data.session.access_token, data.session.refresh_token)

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

  // §1.6 — Audit log connexion (async, non bloquant)
  const adminClient = createSupabaseAdminClient(c.env)
  c.executionCtx.waitUntil(
    adminClient.from('audit_log').insert({
      id: crypto.randomUUID(),
      tenant_id: tenant.id,
      action: 'LOGIN',
      table_name: 'auth',
      record_id: data.user.id,
      changes: { email: data.user.email, ip: c.req.header('CF-Connecting-IP') ?? 'unknown' },
      created_at: new Date().toISOString()
    }).then(() => {}).catch(() => {})
  )

  return c.json({
    success: true,
    // Conservés pour compatibilité clients API/mobile sans cookies.
    // Le dashboard web n'a plus besoin de les stocker : le cookie httpOnly suffit.
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
// Plan gratuit : nom lu depuis D1 (site web), mais pays_id doit être lu
// depuis SUPABASE (pas D1) car la contrainte FK tenants_pays_id_fkey
// pointe vers la table "pays" de Supabase, pas celle de D1. Les deux
// bases ont des UUID générés indépendamment — un ID D1 ne peut jamais
// satisfaire une contrainte FK Supabase. (CORRIGÉ — bug identifié le 27/07)
authRouter.post('/register', async (c) => {
  setSecurityHeaders(c)
  const ip = c.req.header('CF-Connecting-IP') ?? 'unknown'

  // Rate limiting : 15 inscriptions / heure par IP
  const rateLimit = await checkRateLimit(`auth_register:${ip}`, 15, 3600000)
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

  // Récupérer plan gratuit depuis D1 (SITE WEB) — lecture uniquement pour nom du plan.
  const planGratuit = await c.env.DB
    .prepare("SELECT id, nom FROM plans WHERE nom = 'Gratuit' OR ordre_affichage = 0 LIMIT 1")
    .first<{ id: string; nom: string }>()

  // pays_id lu depuis SUPABASE (pas D1), car c'est la table Supabase "pays"
  // que la contrainte FK tenants_pays_id_fkey vérifie.
  const { data: paysSupabase } = await adminClient
    .from('pays')
    .select('id')
    .eq('code_iso', 'BF')
    .limit(1)
    .maybeSingle()

  const now = new Date().toISOString()

  // Créer le tenant dans SUPABASE (APPLICATION)
  const { data: newTenant, error: tenantInsertError } = await adminClient
    .from('tenants')
    .insert({
      pays_id: paysSupabase?.id ?? null,
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
    console.error('Erreur création tenant Supabase:', tenantInsertError?.message, tenantInsertError?.details)
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
    // §2 — Pose des cookies httpOnly dès l'inscription si la session est immédiate
    setAuthCookies(c, authData.session.access_token, authData.session.refresh_token)
  }

  return c.json({
    success: true,
    message: authData.session
      ? 'Compte créé avec succès. Vous êtes connecté.'
      : 'Compte créé. Vérifiez votre email pour confirmer votre inscription.',
    slug: newTenant.slug,
    tenant_id: newTenant.id,
    boutique_url: `/${newTenant.slug}`,
    redirect_to: '/bienvenue',
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

  // Le token peut venir du cookie ou du header, selon le client
  const cookieToken = getCookie(c, ACCESS_TOKEN_COOKIE)
  const authHeader = c.req.header('Authorization')
  const headerToken = authHeader?.replace('Bearer ', '')
  const token = cookieToken || headerToken

  if (token && c.env.KV_CACHE) {
    const sessionKey = `session:${token.slice(-20)}`
    try { await c.env.KV_CACHE.delete(sessionKey) } catch {}
  }

  // §2 — Effacer les cookies httpOnly côté navigateur
  clearAuthCookies(c)

  return c.json({ success: true })
})

// POST /api/v1/auth/refresh — Refresh token Supabase
// §2 — Accepte le refresh token depuis le cookie httpOnly en priorité,
// avec fallback sur le body JSON pour les clients API/mobile.
authRouter.post('/refresh', async (c) => {
  setSecurityHeaders(c)

  const cookieRefreshToken = getCookie(c, REFRESH_TOKEN_COOKIE)

  let bodyRefreshToken: string | undefined
  try {
    const body = await c.req.json() as { refresh_token?: string }
    bodyRefreshToken = body?.refresh_token
  } catch { /* body absent — normal si appel initié uniquement via cookie */ }

  const refreshToken = cookieRefreshToken || bodyRefreshToken
  if (!refreshToken) {
    return c.json({ error: 'refresh_token requis (cookie ou body).' }, 422)
  }

  const supabase = createSupabaseClient(c.env)
  const { data, error } = await supabase.auth.refreshSession({ refresh_token: refreshToken })

  if (error || !data.session) {
    clearAuthCookies(c)
    return c.json({ error: 'Session expirée. Reconnectez-vous.' }, 401)
  }

  // §2 — Reposer les cookies avec les nouveaux tokens
  setAuthCookies(c, data.session.access_token, data.session.refresh_token)

  return c.json({
    access_token: data.session.access_token,
    refresh_token: data.session.refresh_token
  })
})

// ============================================================
// §1.7 — Récupération mot de passe par OTP 6 chiffres (Supabase)
// ============================================================

// POST /api/v1/auth/forgot-password
authRouter.post('/forgot-password', async (c) => {
  setSecurityHeaders(c)
  const ip = c.req.header('CF-Connecting-IP') ?? 'unknown'
  const rateLimit = await checkRateLimit(`forgot-pwd:${ip}`, 5, 3600000)
  if (!rateLimit.allowed) return c.json({ error: 'Trop de tentatives. Réessayez plus tard.' }, 429)

  let body: { email?: string }
  try { body = await c.req.json() } catch { return c.json({ error: 'JSON invalide.' }, 400) }

  // Réponse générique — ne jamais confirmer l'existence d'un compte
  if (!body.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email)) {
    return c.json({ message: "Si ce compte existe, un code OTP a été envoyé." })
  }

  const supabase = createSupabaseClient(c.env)
  // signInWithOtp envoie un OTP 6 chiffres par email (shouldCreateUser:false = pas de création)
  await supabase.auth.signInWithOtp({
    email: body.email.toLowerCase().trim(),
    options: { shouldCreateUser: false }
  })

  return c.json({ message: "Si ce compte existe, un code OTP à 6 chiffres a été envoyé à votre adresse." })
})

// POST /api/v1/auth/verify-otp
authRouter.post('/verify-otp', async (c) => {
  setSecurityHeaders(c)
  const ip = c.req.header('CF-Connecting-IP') ?? 'unknown'
  const rateLimit = await checkRateLimit(`verify-otp:${ip}`, 10, 900000)
  if (!rateLimit.allowed) return c.json({ error: 'Trop de tentatives. Réessayez dans 15 minutes.' }, 429)

  let body: { email?: string; token?: string }
  try { body = await c.req.json() } catch { return c.json({ error: 'JSON invalide.' }, 400) }
  if (!body.email || !body.token || !/^\d{6}$/.test(body.token)) {
    return c.json({ error: 'Email et code OTP à 6 chiffres requis.' }, 422)
  }

  const supabase = createSupabaseClient(c.env)
  const { data, error } = await supabase.auth.verifyOtp({
    email: body.email.toLowerCase().trim(),
    token: body.token,
    type: 'email'
  })

  if (error || !data.session) return c.json({ error: 'Code OTP invalide ou expiré.' }, 401)

  // §2 — Session temporaire posée en cookie également, pour que
  // reset-password (étape suivante) fonctionne sans dépendre du localStorage.
  setAuthCookies(c, data.session.access_token, data.session.refresh_token)

  return c.json({
    access_token: data.session.access_token,
    refresh_token: data.session.refresh_token,
    message: 'Code valide. Définissez votre nouveau mot de passe.'
  })
})

// POST /api/v1/auth/reset-password  (token issu de verify-otp, via cookie ou Bearer)
authRouter.post('/reset-password', async (c) => {
  setSecurityHeaders(c)

  const cookieToken = getCookie(c, ACCESS_TOKEN_COOKIE)
  const authHeader = c.req.header('authorization') ?? ''
  const headerToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : undefined
  const token = cookieToken || headerToken

  if (!token) return c.json({ error: "Session requise (cookie ou jeton Bearer)." }, 401)

  let body: { password?: string }
  try { body = await c.req.json() } catch { return c.json({ error: 'JSON invalide.' }, 400) }
  if (!body.password || body.password.length < 8) {
    return c.json({ error: 'Mot de passe trop court (8 caractères minimum).' }, 422)
  }

  // Créer un client supabase avec le token de l'utilisateur
  const supabase = createSupabaseClient(c.env)
  const { error: userError } = await supabase.auth.getUser(token)
  if (userError) {
    clearAuthCookies(c)
    return c.json({ error: 'Session invalide ou expirée.' }, 401)
  }

  const { error } = await supabase.auth.updateUser({ password: body.password })
  if (error) return c.json({ error: 'Erreur changement mot de passe.', detail: error.message }, 500)

  return c.json({ success: true, message: 'Mot de passe mis à jour avec succès.' })
})

export { authRouter }
