// API Auth — Supabase Auth (connexion, inscription, déconnexion restaurant)
// ARCHITECTURE :
//   • Supabase Auth  → authentification (signIn, signUp, JWT, refresh)
//   • Supabase DB    → tenants, utilisateurs_tenant, points_de_vente, plans (APPLICATION)
//   • D1 Cloudflare  → pays, config_globale (SITE WEB uniquement — PLUS de plans)
//
// Cookies httpOnly + Secure + SameSite=Lax posés à login/register. Le corps
// JSON renvoie aussi les tokens en clair pour les clients API/mobile sans
// cookies (rétrocompatibilité).
//
// MIGRATION PLANS — body.plan_id est désormais l'UUID Supabase NATIF du
// plan choisi (le front le récupère directement depuis GET /api/v1/plans,
// qui lit maintenant Supabase — voir api-plans.ts). Il n'y a plus de
// résolution via `plans.d1_plan_id` : on cherche directement par `id`.
//
// CORRECTIF LOGIN (historique) — la requête sur utilisateurs_tenant juste
// après signInWithPassword() utilisait un client explicitement lié au
// token de la session qui vient d'être ouverte (createSupabaseClientWithToken),
// au lieu du client singleton partagé (createSupabaseClient), pour éviter
// une race condition sur le singleton.
//
// CORRECTIF BUG-4 (nouveau, remplace le correctif ci-dessus) — malgré le
// correctif historique, un tenant au statut 'essai' ou
// 'en_attente_paiement_initial' pouvait recevoir "Aucun restaurant
// associé à ce compte" à la RECONNEXION, alors que le compte, le tenant
// et le lien utilisateurs_tenant existaient bel et bien en base (visibles
// juste après l'inscription, et de nouveau visibles après un rafraîchissement
// de la page /dashboard une fois reconnecté autrement). La cause la plus
// probable est une policy RLS Supabase sur `tenants` et/ou
// `utilisateurs_tenant` qui restreint la lecture selon des conditions non
// remplies pour un tenant qui n'est pas encore 'actif' (ex: policy basée
// sur le statut). Le client utilisé pour CETTE requête précise
// (`supabaseAvecToken`, scopé au JWT utilisateur) est soumis à ces
// policies RLS ; le client ADMIN (rôle service) ne l'est pas.
// Cette unique requête de lookup post-authentification passe désormais
// par le client ADMIN. Cela ne réduit AUCUNE sécurité : l'utilisateur
// vient de prouver son identité avec succès via
// supabase.auth.signInWithPassword() (ligne juste au-dessus), et la
// requête reste strictement filtrée par .eq('auth_user_id', data.user.id)
// — elle ne peut donc renvoyer que le(s) tenant(s) réellement lié(s) à cet
// utilisateur, jamais les données d'un autre compte.
//
// CORRECTIF REGISTER — la redirection post-inscription est désormais
// TOUJOURS '/bienvenue', quel que soit le plan choisi (gratuit ou payant).
// La page bienvenue.ts gère déjà nativement les deux cas (étape 5 pour les
// plans payants avec formulaire de preuve de paiement intégré).
//
// ============================================================
// CORRECTIF RESET PASSWORD (nouveau) — le flow était cassé à 3 niveaux :
//
// 1) /forgot-password appelait supabase.auth.signInWithOtp(), qui envoie
//    l'email via le template Supabase "Magic Link" (flow de CONNEXION),
//    pas le template "Reset Password" (flow de RÉCUPÉRATION). Or le
//    template "Magic Link" du dashboard ne contient par défaut que
//    {{ .ConfirmationURL }} (un lien cliquable) et AUCUN {{ .Token }} —
//    donc aucun code n'était jamais envoyé, et /verify-otp ne pouvait
//    jamais matcher quoi que ce soit. Remplacé par
//    supabase.auth.resetPasswordForEmail(), qui utilise le template dédié
//    "Reset Password" (type Supabase = 'recovery').
//
// 2) /verify-otp vérifiait le code avec type:'email' (le type du flow
//    Magic Link), incohérent avec le nouveau flow 'recovery' utilisé par
//    resetPasswordForEmail(). Corrigé en type:'recovery'.
//
// 3) /reset-password appelait supabase.auth.updateUser({password}) sur le
//    client anon SINGLETON, qui n'a jamais de session active en mémoire
//    dans ce contexte (persistSession:false, pas de setSession() appelé
//    nulle part) : updateUser() a besoin d'une session active pour savoir
//    QUEL utilisateur modifier, cet appel échouait donc silencieusement
//    ("Auth session missing"). Remplacé par admin.updateUserById(), qui
//    modifie directement l'utilisateur ciblé via son ID (vérifié juste
//    avant par getUser(token)) sans dépendre d'un état de session client.
//
// Longueur du code — désormais 8 chiffres (réglé côté Supabase Dashboard,
// Authentication > Emails > Email OTP Length = 8 ; ce réglage s'applique
// à tous les emails OTP du projet, dont le flow "Reset Password"). Le
// code applicatif ci-dessous vérifie la regex /^\d{8}$/ en conséquence.
//
// Rate limiting — ajout d'une limite secondaire PAR EMAIL (en plus de
// celle par IP déjà existante) sur /forgot-password et /verify-otp, pour
// empêcher un attaquant de cibler un compte précis en changeant d'IP.
//
// Déconnexion globale après reset — une fois le mot de passe changé,
// TOUTES les sessions actives de l'utilisateur sont révoquées (autres
// appareils/navigateurs inclus) via admin.signOut(jwt, 'global'), et le
// cookie du navigateur courant est également effacé : une reconnexion
// explicite avec le nouveau mot de passe est requise partout.
// ============================================================

import { Hono } from 'hono'
import { setCookie, deleteCookie, getCookie } from 'hono/cookie'
import type { Env } from '../types/database'
import { checkRateLimit, setSecurityHeaders, sanitizeSlug, hashSessionKey } from '../lib/security'
import { createSupabaseClient, createSupabaseClientWithToken, createSupabaseAdminClient } from '../lib/supabase'
import { envoyerEmailBienvenue } from '../lib/brevo'

const authRouter = new Hono<{ Bindings: Env }>()

const ACCESS_TOKEN_COOKIE = 'sb-access-token'
const REFRESH_TOKEN_COOKIE = 'sb-refresh-token'

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

const ACCESS_TOKEN_MAX_AGE = 3600
const REFRESH_TOKEN_MAX_AGE = 60 * 60 * 24 * 30

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

  const rateLimit = await checkRateLimit(`auth_login:${ip}`, 5, 900000, c.env.KV_CACHE)
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

  // CORRECTIF BUG-4 — client ADMIN (rôle service) utilisé pour ce lookup
  // interne post-authentification, au lieu du client scopé au token
  // utilisateur. Voir explication détaillée en tête de fichier : ceci
  // évite qu'une policy RLS sur `tenants` / `utilisateurs_tenant`
  // (par exemple restreinte aux tenants au statut 'actif') ne bloque
  // silencieusement la lecture pour un tenant en 'essai' ou
  // 'en_attente_paiement_initial', ce qui provoquait le faux "Aucun
  // restaurant associé à ce compte" observé à la reconnexion. La requête
  // reste strictement filtrée sur l'utilisateur qui vient de s'authentifier
  // avec succès (.eq('auth_user_id', data.user.id)) : aucune perte de
  // sécurité, uniquement une lecture fiable des données qui appartiennent
  // déjà à cet utilisateur.
  const adminClientLogin = createSupabaseAdminClient(c.env)

  const { data: tenantData, error: tenantError } = await adminClientLogin
    .from('utilisateurs_tenant')
    .select(`
      tenant_id,
      tenants!inner (id, nom, slug, statut, plan_id, couleur_primaire, deleted_at)
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

  // B-AUTH-03 — fix session-5 : bloc if (tenant.statut === 'suspendu') supprimé.
  // Ce bloc était du code mort : la requête juste au-dessus filtre déjà
  // .neq('tenants.statut', 'suspendu'), donc cette branche ne pouvait jamais
  // s'exécuter. Suppression pour éviter la confusion lors de futures maintenances.

  setAuthCookies(c, data.session.access_token, data.session.refresh_token)

  if (c.env.KV_CACHE) {
    // A-8/FINDING-03 (session-7) : clé KV hashée SHA-256 — remplace slice(-20) prévisible
    const sessionKey = await hashSessionKey(data.session.access_token)
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

  // S1-05 CORRIGÉ — Tokens JWT renvoyés en clair dans le body uniquement pour
  // les clients API (header Authorization: Bearer présent = client mobile/API).
  // Pour les clients navigateur (formulaire web avec cookies httpOnly), ne pas
  // exposer les tokens dans le body JSON — ils vivent déjà dans les cookies httpOnly,
  // inaccessibles à JavaScript → réduit la surface d'exfiltration en cas de XSS.
  const isApiClient = !!c.req.header('Authorization')?.startsWith('Bearer ')

  return c.json({
    success: true,
    ...(isApiClient ? {
      access_token: data.session.access_token,
      refresh_token: data.session.refresh_token
    } : {}),
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
//
// MIGRATION PLANS — plan_id (OBLIGATOIRE dans le body) est désormais
// l'UUID Supabase natif du plan choisi (le front l'a récupéré directement
// depuis GET /api/v1/plans, Supabase). Recherche directe par `id`, plus
// aucune résolution via `d1_plan_id`.
//   - plan payant (prix_mensuel > 0) → statut tenant = 'en_attente_paiement_initial'
//   - plan gratuit (prix_mensuel = 0) → statut tenant = 'essai'
authRouter.post('/register', async (c) => {
  setSecurityHeaders(c)
  const ip = c.req.header('CF-Connecting-IP') ?? 'unknown'

  const rateLimit = await checkRateLimit(`auth_register:${ip}`, 15, 3600000, c.env.KV_CACHE)
  if (!rateLimit.allowed) {
    return c.json({ error: 'Trop de tentatives. Réessayez dans une heure.' }, 429)
  }

  let body: {
    email?: string; password?: string; nom_restaurant?: string
    whatsapp_number?: string; nom_gerant?: string
    plan_id?: string  // UUID Supabase natif du plan choisi (obligatoire)
  }
  try { body = await c.req.json() }
  catch { return c.json({ error: 'JSON invalide.' }, 400) }

  const { email, password, nom_restaurant, whatsapp_number, nom_gerant } = body

  if (!email || !password || !nom_restaurant || !whatsapp_number || !nom_gerant) {
    return c.json({ error: 'Tous les champs sont requis.' }, 422)
  }

  if (!body.plan_id || typeof body.plan_id !== 'string' || body.plan_id.trim().length === 0) {
    return c.json({ error: 'Veuillez choisir un plan pour continuer.' }, 422)
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

  const { data: existingSlug } = await supabase
    .from('tenants')
    .select('id')
    .eq('slug', slug)
    .limit(1)
    .single()

  if (existingSlug) {
    slug = slug + '-' + Date.now().toString(36).slice(-4)
  }

  // MIGRATION — recherche directe par l'UUID Supabase natif du plan.
  // Plus de lookup via `d1_plan_id` : body.plan_id EST déjà l'id Supabase.
  let planChoisi: { id: string; nom: string; prix_mensuel: number } | null = null
  try {
    const { data: planRow, error: planError } = await adminClient
      .from('plans')
      .select('id, nom, prix_mensuel')
      .eq('id', body.plan_id.trim())
      .eq('actif', true)
      .limit(1)
      .maybeSingle()

    if (planError) {
      console.error('Erreur lookup plan Supabase:', planError.message)
      return c.json({ error: 'Erreur lors de la vérification du plan.' }, 500)
    }
    planChoisi = planRow
  } catch {
    return c.json({ error: 'Erreur lors de la vérification du plan.' }, 500)
  }

  if (!planChoisi) {
    return c.json({ error: 'Plan invalide ou inactif. Veuillez choisir un plan valide.' }, 422)
  }

  const estPlanGratuit = planChoisi.prix_mensuel === 0
  const statutInitial = estPlanGratuit ? 'essai' : 'en_attente_paiement_initial'

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

  const { data: paysSupabase } = await adminClient
    .from('pays')
    .select('id')
    .eq('code_iso', 'BF')
    .limit(1)
    .maybeSingle()

  const now = new Date().toISOString()

  const { data: newTenant, error: tenantInsertError } = await adminClient
    .from('tenants')
    .insert({
      pays_id: paysSupabase?.id ?? null,
      nom: nom_restaurant,
      slug,
      whatsapp_number: whatsapp_number.replace(/\s/g, ''),
      couleur_primaire: '#DC2626',
      couleur_secondaire: '#1D4ED8',
      statut: statutInitial,
      plan_id: estPlanGratuit ? planChoisi.id : null,
      plan_initial_id: planChoisi.id,
      metadata: {}
    })
    .select('id, slug')
    .single()

  if (tenantInsertError || !newTenant) {
    console.error('Erreur création tenant Supabase:', tenantInsertError?.message, tenantInsertError?.details)
    return c.json({ error: 'Erreur lors de la création du restaurant.' }, 500)
  }

  // B-AUTH-04 — fix session-5 : vérification du résultat des insertions PDV et
  // utilisateurs_tenant. En cas d'échec, rollback soft du tenant (deleted_at = now())
  // pour éviter un compte fantôme facturable mais inutilisable.
  const { error: pdvInsertError } = await adminClient
    .from('points_de_vente')
    .insert({
      tenant_id: newTenant.id,
      nom: 'Point de vente principal',
      adresse: '',
      actif: true
    })

  if (pdvInsertError) {
    console.error('Erreur création PDV (register):', pdvInsertError.message)
    // BUG-11 CORRIGÉ — Rollback complet : soft-delete tenant + deleteUser Auth
    // (sans deleteUser, un user orphelin reste dans auth.users — non facturable
    // mais gên exploitable pour un re-register de cet email)
    try {
      await adminClient.from('tenants').update({ deleted_at: new Date().toISOString() }).eq('id', newTenant.id)
    } catch (e) { console.error('Rollback tenant échoué:', e) }
    try {
      await adminClient.auth.admin.deleteUser(authData.user.id)
    } catch (e) { console.error('Rollback deleteUser Auth échoué (PDV):', e) }
    return c.json({ error: 'Erreur lors de la création du point de vente. Veuillez réessayer.' }, 500)
  }

  const { error: utInsertError } = await adminClient
    .from('utilisateurs_tenant')
    .insert({
      tenant_id: newTenant.id,
      auth_user_id: authData.user.id,
      role: 'proprietaire',
      nom: nom_gerant
    })

  if (utInsertError) {
    console.error('Erreur création utilisateurs_tenant (register):', utInsertError.message)
    // BUG-11 CORRIGÉ — Rollback complet : soft-delete tenant + deleteUser Auth
    try {
      await adminClient.from('tenants').update({ deleted_at: new Date().toISOString() }).eq('id', newTenant.id)
    } catch (e) { console.error('Rollback tenant échoué:', e) }
    try {
      await adminClient.auth.admin.deleteUser(authData.user.id)
    } catch (e) { console.error('Rollback deleteUser Auth échoué (utilisateurs_tenant):', e) }
    return c.json({ error: 'Erreur lors de l\'association du compte au restaurant. Veuillez réessayer.' }, 500)
  }

  let sessionData: { access_token?: string; refresh_token?: string } = {}
  if (authData.session) {
    sessionData = {
      access_token: authData.session.access_token,
      refresh_token: authData.session.refresh_token
    }
    setAuthCookies(c, authData.session.access_token, authData.session.refresh_token)
  }

  // [session-3] Email de bienvenue non-bloquant
  try {
    if (authData.user.email) {
      envoyerEmailBienvenue(c.env, {
        email: authData.user.email,
        nom_restaurant: nom_restaurant.trim()
      }).catch(() => {})
    }
  } catch {}

  // CORRECTIF — toujours rediriger vers /bienvenue, quel que soit le plan
  // choisi. bienvenue.ts (étape 5) gère déjà l'affichage du plan payant
  // + formulaire de soumission de preuve de paiement intégré.
  const redirectTo = '/bienvenue'

  return c.json({
    success: true,
    message: authData.session
      ? (estPlanGratuit
          ? 'Compte créé avec succès. Vous êtes connecté.'
          : 'Compte créé. Veuillez soumettre votre preuve de paiement pour activer votre compte.')
      : 'Compte créé. Vérifiez votre email pour confirmer votre inscription.',
    slug: newTenant.slug,
    tenant_id: newTenant.id,
    boutique_url: `/${newTenant.slug}`,
    redirect_to: redirectTo,
    statut_initial: statutInitial,
    plan_choisi: { id: planChoisi.id, nom: planChoisi.nom, est_gratuit: estPlanGratuit },
    ...(authData.session ? {
      tenant: {
        id: newTenant.id,
        nom: nom_restaurant,
        slug: newTenant.slug,
        statut: statutInitial,
        couleur_primaire: '#DC2626'
      }
    } : {}),
    ...sessionData
  }, 201)
})

// POST /api/v1/auth/logout — Déconnexion
authRouter.post('/logout', async (c) => {
  setSecurityHeaders(c)

  const cookieToken = getCookie(c, ACCESS_TOKEN_COOKIE)
  const authHeader = c.req.header('Authorization')
  const headerToken = authHeader?.replace('Bearer ', '')
  const token = cookieToken || headerToken

  if (token && c.env.KV_CACHE) {
    // A-8/FINDING-03 (session-7) : clé KV hashée SHA-256 — cohérence avec /login
    const sessionKey = await hashSessionKey(token)
    try { await c.env.KV_CACHE.delete(sessionKey) } catch {}
  }

  clearAuthCookies(c)

  return c.json({ success: true })
})

// POST /api/v1/auth/refresh — Refresh token Supabase
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

  setAuthCookies(c, data.session.access_token, data.session.refresh_token)

  return c.json({
    access_token: data.session.access_token,
    refresh_token: data.session.refresh_token
  })
})

// ============================================================
// Récupération mot de passe par OTP 8 chiffres (Supabase) — flow 'recovery'
// ============================================================

// POST /api/v1/auth/forgot-password
authRouter.post('/forgot-password', async (c) => {
  setSecurityHeaders(c)
  const ip = c.req.header('CF-Connecting-IP') ?? 'unknown'

  const rateLimit = await checkRateLimit(`auth_forgot-pwd:${ip}`, 5, 3600000, c.env.KV_CACHE)
  if (!rateLimit.allowed) {
    return c.json({ error: 'Trop de tentatives. Réessayez plus tard.' }, 429)
  }

  let body: { email?: string }
  try { body = await c.req.json() } catch { return c.json({ error: 'JSON invalide.' }, 400) }

  if (!body.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email)) {
    // Réponse générique volontaire : ne jamais révéler si l'email existe.
    return c.json({ message: "Si ce compte existe, un code de récupération a été envoyé." })
  }

  const emailNormalise = body.email.toLowerCase().trim()

  // Rate limit secondaire PAR EMAIL, en plus de celui par IP ci-dessus —
  // empêche un attaquant de cibler un compte précis en changeant d'IP.
  const rateLimitEmail = await checkRateLimit(`auth_forgot-pwd-email:${emailNormalise}`, 5, 3600000, c.env.KV_CACHE)
  if (!rateLimitEmail.allowed) {
    return c.json({ message: "Si ce compte existe, un code de récupération a été envoyé." })
  }

  const supabase = createSupabaseClient(c.env)

  // CORRECTIF — resetPasswordForEmail() (flow "recovery" dédié) au lieu
  // de signInWithOtp() (flow "magic link" de connexion). Voir explication
  // complète en tête de fichier. Le template Supabase "Reset Password"
  // doit contenir {{ .Token }} pour afficher le code à 8 chiffres (voir
  // gabarit HTML fourni séparément pour ce template).
  try {
    await supabase.auth.resetPasswordForEmail(emailNormalise)
  } catch (err) {
    console.error('Erreur resetPasswordForEmail:', err instanceof Error ? err.message : err)
    // On ne renvoie jamais l'erreur brute au client : réponse générique.
  }

  return c.json({ message: "Si ce compte existe, un code de récupération à 8 chiffres a été envoyé à votre adresse." })
})

// POST /api/v1/auth/verify-otp
authRouter.post('/verify-otp', async (c) => {
  setSecurityHeaders(c)
  const ip = c.req.header('CF-Connecting-IP') ?? 'unknown'
  const rateLimit = await checkRateLimit(`verify-otp:${ip}`, 10, 900000, c.env.KV_CACHE)
  if (!rateLimit.allowed) return c.json({ error: 'Trop de tentatives. Réessayez dans 15 minutes.' }, 429)

  let body: { email?: string; token?: string }
  try { body = await c.req.json() } catch { return c.json({ error: 'JSON invalide.' }, 400) }

  // CORRECTIF — 8 chiffres (réglage Supabase Dashboard : Authentication >
  // Emails > Email OTP Length = 8), au lieu de 6 précédemment.
  if (!body.email || !body.token || !/^\d{8}$/.test(body.token)) {
    return c.json({ error: 'Email et code à 8 chiffres requis.' }, 422)
  }

  const emailNormalise = body.email.toLowerCase().trim()

  // Rate limit secondaire PAR EMAIL — un code à 8 chiffres est déjà bien
  // plus résistant au brute force qu'un code à 6 (10^8 vs 10^6
  // combinaisons), mais on limite aussi les tentatives par compte ciblé,
  // pas seulement par IP (qui peut être contournée).
  const rateLimitEmail = await checkRateLimit(`verify-otp-email:${emailNormalise}`, 10, 900000, c.env.KV_CACHE)
  if (!rateLimitEmail.allowed) {
    return c.json({ error: 'Trop de tentatives pour ce compte. Réessayez dans 15 minutes.' }, 429)
  }

  const supabase = createSupabaseClient(c.env)

  // CORRECTIF — type:'recovery' (au lieu de 'email') pour matcher le flow
  // resetPasswordForEmail() utilisé dans /forgot-password ci-dessus.
  const { data, error } = await supabase.auth.verifyOtp({
    email: emailNormalise,
    token: body.token,
    type: 'recovery'
  })

  if (error || !data.session) return c.json({ error: 'Code invalide ou expiré.' }, 401)

  setAuthCookies(c, data.session.access_token, data.session.refresh_token)

  return c.json({
    access_token: data.session.access_token,
    refresh_token: data.session.refresh_token,
    message: 'Code valide. Définissez votre nouveau mot de passe.'
  })
})

// POST /api/v1/auth/reset-password
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

  const supabase = createSupabaseClient(c.env)
  const { data: userData, error: userError } = await supabase.auth.getUser(token)
  if (userError || !userData.user) {
    clearAuthCookies(c)
    return c.json({ error: 'Session invalide ou expirée.' }, 401)
  }

  // CORRECTIF (bug racine du reset password) — l'ancien code appelait
  // supabase.auth.updateUser({password}) sur le client anon SINGLETON, qui
  // n'a jamais de session active en mémoire ici (persistSession:false,
  // aucun setSession() appelé) : updateUser() a besoin d'une session
  // active pour savoir QUEL utilisateur modifier, donc cet appel échouait
  // silencieusement ("Auth session missing"). Remplacé par
  // admin.updateUserById(), qui modifie directement l'utilisateur ciblé
  // via son ID (déjà vérifié juste au-dessus par getUser(token)), sans
  // dépendre d'un état de session côté client.
  const adminClient = createSupabaseAdminClient(c.env)
  const { error: updateError } = await adminClient.auth.admin.updateUserById(
    userData.user.id,
    { password: body.password }
  )
  if (updateError) {
    return c.json({ error: 'Erreur changement mot de passe.', detail: updateError.message }, 500)
  }

  // AJOUT — déconnexion globale après reset : révoque TOUTES les sessions
  // actives de l'utilisateur (autres appareils/navigateurs inclus) via
  // l'API admin signOut(jwt, 'global'). Non bloquant pour la réponse : le
  // mot de passe est déjà changé avec succès à ce stade, une erreur ici
  // n'annule pas l'opération.
  try {
    await adminClient.auth.admin.signOut(token, 'global')
  } catch (err) {
    console.error('Erreur signOut global post-reset:', err instanceof Error ? err.message : err)
  }

  // Le cookie de CE navigateur est également invalidé côté serveur, pour
  // forcer une reconnexion explicite avec le nouveau mot de passe partout,
  // y compris ici.
  clearAuthCookies(c)

  return c.json({ success: true, message: 'Mot de passe mis à jour avec succès. Veuillez vous reconnecter.' })
})

export { authRouter }
