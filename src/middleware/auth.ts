// src/middleware/auth.ts
// §1bis — Middleware d'authentification Hono réutilisable (JWT Supabase)
// §2 — Supporte désormais le cookie httpOnly "sb-access-token" en plus
//       du header Authorization: Bearer (rétrocompatibilité pour les
//       clients API tiers / mobile qui n'utilisent pas de cookies).
//
// Usage :
//   import { authMiddleware, type AuthContext } from '../middleware/auth'
//   router.use('/admin/*', authMiddleware)
//   router.get('/admin/foo', (c) => {
//     const auth = c.get('auth') as AuthContext
//     // auth.user_id, auth.tenant_id, auth.tenant_slug, auth.token
//   })

import type { MiddlewareHandler } from 'hono'
import { getCookie } from 'hono/cookie'
import type { Env } from '../types/database'
import { createSupabaseClient, createSupabaseClientWithToken, createSupabaseAdminClient } from '../lib/supabase'

export interface AuthContext {
  user_id: string
  tenant_id: string | null
  tenant_slug: string | null
  token: string
}

// Variables Hono pour typage strict de c.get/c.set
type AuthVariables = { auth: AuthContext }

// Nom du cookie httpOnly posé par /api/v1/auth/login et /register.
// DOIT rester strictement identique au nom utilisé dans api-auth.ts
// (setCookie / deleteCookie), sinon aucune requête ne sera authentifiée.
export const ACCESS_TOKEN_COOKIE = 'sb-access-token'

/**
 * Extrait le token JWT depuis, par ordre de priorité :
 *   1. Le cookie httpOnly "sb-access-token" (flux navigateur / dashboard web)
 *   2. Le header "Authorization: Bearer <token>" (clients API / app mobile)
 * Retourne null si aucune source valide n'est trouvée.
 */
function extractToken(c: any): string | null {
  const cookieToken = getCookie(c, ACCESS_TOKEN_COOKIE)
  if (cookieToken && cookieToken.length >= 20) return cookieToken.trim()

  const authHeader = c.req.header('Authorization')
  if (authHeader?.startsWith('Bearer ')) {
    const headerToken = authHeader.replace('Bearer ', '').trim()
    if (headerToken.length >= 20) return headerToken
  }

  return null
}

/**
 * Middleware Hono : vérifie le JWT Supabase (cookie ou header)
 * et hydrate c.get('auth') avec { user_id, tenant_id, tenant_slug, token }.
 * Retourne 401 si le token est absent, invalide ou révoqué.
 * Retourne 403 si le tenant est suspendu ou supprimé.
 */
export const authMiddleware: MiddlewareHandler<{ Bindings: Env; Variables: AuthVariables }> = async (c, next) => {
  const token = extractToken(c)
  if (!token) {
    return c.json({ error: 'Non authentifié. Session ou jeton requis.' }, 401)
  }

  try {
    // 1. Valider le JWT auprès de Supabase Auth
    const supabase = createSupabaseClient(c.env)
    const { data: { user }, error: authError } = await supabase.auth.getUser(token)
    if (authError || !user) {
      return c.json({ error: 'Non authentifié. Session expirée ou invalide.' }, 401)
    }

    // 2. Résoudre le tenant associé à cet utilisateur
    // BUG-16 CORRIGÉ — utiliser adminClient (service role) pour bypasser les RLS
    // qui pourraient masquer un tenant en 'en_attente_paiement_initial' ou 'essai'.
    // Même correctif que api-auth.ts et api-dashboard.ts. La requête reste filtrée
    // sur auth_user_id — impossible de lire les données d'un autre utilisateur.
    const adminClientForLookup = createSupabaseAdminClient(c.env)
    const { data: utData, error: utError } = await adminClientForLookup
      .from('utilisateurs_tenant')
      .select('tenant_id, tenants!inner(id, slug, statut, deleted_at)')
      .eq('auth_user_id', user.id)
      .is('tenants.deleted_at', null)
      .neq('tenants.statut', 'suspendu')
      .single()

    if (utError || !utData) {
      return c.json({ error: 'Accès refusé. Tenant introuvable ou suspendu.' }, 403)
    }

    const tenant = utData.tenants as any

    // 3. Hydrate le contexte Hono
    c.set('auth', {
      user_id: user.id,
      tenant_id: utData.tenant_id,
      tenant_slug: tenant.slug,
      token
    } satisfies AuthContext)

    return next()
  } catch (err) {
    console.error('[authMiddleware] Erreur:', err)
    return c.json({ error: 'Non authentifié.' }, 401)
  }
}

/**
 * Version allégée pour les routes qui n'ont PAS besoin du tenant
 * (ex: routes super-admin du blog qui appartiennent à la plateforme,
 *  pas à un tenant spécifique). Vérifie uniquement la validité du JWT.
 */
export const authMiddlewarePlatform: MiddlewareHandler<{ Bindings: Env; Variables: AuthVariables }> = async (c, next) => {
  const token = extractToken(c)
  if (!token) {
    return c.json({ error: 'Non authentifié. Session ou jeton requis.' }, 401)
  }

  try {
    const supabase = createSupabaseClient(c.env)
    const { data: { user }, error: authError } = await supabase.auth.getUser(token)
    if (authError || !user) {
      return c.json({ error: 'Non authentifié. Session expirée ou invalide.' }, 401)
    }

    c.set('auth', {
      user_id: user.id,
      tenant_id: null,
      tenant_slug: null,
      token
    })

    return next()
  } catch (err) {
    console.error('[authMiddlewarePlatform] Erreur:', err)
    return c.json({ error: 'Non authentifié.' }, 401)
  }
}
