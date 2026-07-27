// src/middleware/auth.ts
// §1bis — Middleware d'authentification Hono réutilisable (JWT Supabase)
//
// Usage :
//   import { authMiddleware, type AuthContext } from '../middleware/auth'
//   router.use('/admin/*', authMiddleware)
//   router.get('/admin/foo', (c) => {
//     const auth = c.get('auth') as AuthContext
//     // auth.user_id, auth.tenant_id, auth.tenant_slug, auth.token
//   })

import type { MiddlewareHandler } from 'hono'
import { createMiddleware } from 'hono/factory'
import type { Env } from '../types/database'
import { createSupabaseClient, createSupabaseClientWithToken } from '../lib/supabase'

export interface AuthContext {
  user_id: string
  tenant_id: string | null
  tenant_slug: string | null
  token: string
}

// Variables Hono pour typage strict de c.get/c.set
type AuthVariables = { auth: AuthContext }

/**
 * Middleware Hono : vérifie le JWT Supabase (header Authorization: Bearer <token>)
 * et hydrate c.get('auth') avec { user_id, tenant_id, tenant_slug, token }.
 * Retourne 401 si le token est absent, invalide ou révoqué.
 * Retourne 403 si le tenant est suspendu ou supprimé.
 */
export const authMiddleware: MiddlewareHandler<{ Bindings: Env; Variables: AuthVariables }> = async (c, next) => {
  const authHeader = c.req.header('Authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return c.json({ error: 'Non authentifié. Jeton Bearer requis.' }, 401)
  }

  const token = authHeader.replace('Bearer ', '').trim()
  if (!token || token.length < 20) {
    return c.json({ error: 'Non authentifié. Jeton invalide.' }, 401)
  }

  try {
    // 1. Valider le JWT auprès de Supabase Auth
    const supabase = createSupabaseClient(c.env)
    const { data: { user }, error: authError } = await supabase.auth.getUser(token)
    if (authError || !user) {
      return c.json({ error: 'Non authentifié. Jeton expiré ou invalide.' }, 401)
    }

    // 2. Résoudre le tenant associé à cet utilisateur
    const supabaseToken = createSupabaseClientWithToken(c.env, token)
    const { data: utData, error: utError } = await supabaseToken
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
    ;(c as any).set('auth', {
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
  const authHeader = c.req.header('Authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return c.json({ error: 'Non authentifié. Jeton Bearer requis.' }, 401)
  }

  const token = authHeader.replace('Bearer ', '').trim()
  if (!token || token.length < 20) {
    return c.json({ error: 'Non authentifié. Jeton invalide.' }, 401)
  }

  try {
    const supabase = createSupabaseClient(c.env)
    const { data: { user }, error: authError } = await supabase.auth.getUser(token)
    if (authError || !user) {
      return c.json({ error: 'Non authentifié. Jeton expiré ou invalide.' }, 401)
    }

    ;(c as any).set('auth', {
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
