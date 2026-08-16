/**
 * src/lib/auth.ts — Fonctions d'authentification centralisées (R3)
 *
 * Ce module regroupe les 4 helpers d'authentification précédemment définis
 * localement dans chaque route. Toute la logique est préservée à l'identique ;
 * seul le lieu de définition change.
 *
 * ┌─────────────────────────────────────────────────────────────────────────┐
 * │  extractToken(c)           — extrait le JWT (cookie OU Bearer header)   │
 * │  verifyAuth(c)             — dashboard strict : accesComplet requis      │
 * │  verifyAuthOnboarding(c)   — dashboard permissif : accesComplet OU       │
 * │                              accesAbonnementSeul (onboarding/notifs)     │
 * │  verifyAuthPaiement(c)     — module paiement : accesComplet OU           │
 * │                              accesAbonnementSeul ; retour enrichi         │
 * │  verifyRestaurantAuth(c)   — route commandes (Bearer only, pas cookie)   │
 * └─────────────────────────────────────────────────────────────────────────┘
 *
 * Règles de préservation strictes :
 *  - Aucun changement de comportement métier.
 *  - Les types de retour sont identiques à ceux des fonctions originales.
 *  - Les commentaires d'origine (B-CMD-01, S2-05, etc.) sont conservés.
 */

import { getCookie } from 'hono/cookie'
import type { Context } from 'hono'
import type { Env } from '../types/database'
import { createSupabaseClient, createSupabaseAdminClient } from './supabase'
import { verifierAccesTenant } from './acces-tenant'

// ── Constante partagée ─────────────────────────────────────────────────────
const ACCESS_TOKEN_COOKIE = 'sb-access-token'

// ── Types de retour ────────────────────────────────────────────────────────

export interface AuthResult {
  user_id: string
  tenant_id: string
  tenant_slug: string
  token: string
}

export interface AuthPaiementResult {
  user_id: string
  tenant_id: string
  tenant_slug: string
  tenant_nom: string
  tenant_statut: string
  mode_acces: string
  token: string
}

export interface AuthCommandesResult {
  user_id: string
  tenant_id: string
  tenant_statut: string
}

// ── extractToken ───────────────────────────────────────────────────────────
/**
 * Extrait le JWT depuis le cookie httpOnly `sb-access-token` (prioritaire)
 * ou depuis le header `Authorization: Bearer <token>`.
 * Retourne null si aucun token valide (longueur minimale 20 caractères).
 *
 * Utilisé par verifyAuth et verifyAuthOnboarding (dashboard).
 * verifyAuthPaiement et verifyRestaurantAuth ont leur propre extraction
 * pour préserver exactement le comportement d'origine.
 */
export function extractToken(c: Context<{ Bindings: Env }>): string | null {
  const cookieToken = getCookie(c, ACCESS_TOKEN_COOKIE)
  if (cookieToken && cookieToken.length >= 20) return cookieToken.trim()

  const authHeader = c.req.header('Authorization')
  if (authHeader?.startsWith('Bearer ')) {
    const headerToken = authHeader.replace('Bearer ', '').trim()
    if (headerToken.length >= 20) return headerToken
  }

  return null
}

// ── verifyAuth ─────────────────────────────────────────────────────────────
/**
 * Authentification STRICTE — dashboard opérationnel.
 *
 * Exige accesComplet (tenant actif ou essai valide ou fenêtre de grâce 72h).
 * Refus si accesAbonnementSeul uniquement (tenant en attente de 1er paiement
 * ou inactif sans grâce). Réservé aux routes commandes, menu, stats, livreurs…
 *
 * Token : cookie `sb-access-token` (prioritaire) ou `Authorization: Bearer`.
 * Retourne null → la route répond 401.
 */
export async function verifyAuth(
  c: Context<{ Bindings: Env }>
): Promise<AuthResult | null> {
  const token = extractToken(c)
  if (!token) return null

  try {
    const supabase = createSupabaseClient(c.env)
    const { data: { user }, error } = await supabase.auth.getUser(token)
    if (error || !user) return null

    const adminClient = createSupabaseAdminClient(c.env)
    const { data: utData, error: utError } = await adminClient
      .from('utilisateurs_tenant')
      .select('tenant_id, tenants!inner(id, slug, deleted_at)')
      .eq('auth_user_id', user.id)
      .is('tenants.deleted_at', null)
      .single()

    if (utError || !utData) return null

    const tenant = utData.tenants as any

    const resultat = await verifierAccesTenant(c.env, utData.tenant_id)
    if (!resultat.accesComplet) return null

    return { user_id: user.id, tenant_id: utData.tenant_id, tenant_slug: tenant.slug, token }
  } catch { return null }
}

// ── verifyAuthOnboarding ───────────────────────────────────────────────────
/**
 * Authentification PERMISSIVE — onboarding / notifications.
 *
 * Accepte accesComplet OU accesAbonnementSeul. Réservé aux routes
 * indispensables avant le premier paiement (setup-restaurant, notifications,
 * rappels d'essai…). NE JAMAIS utiliser pour les routes opérationnelles.
 *
 * Token : même logique que verifyAuth (cookie prioritaire, puis Bearer).
 * Retourne null → la route répond 401.
 */
export async function verifyAuthOnboarding(
  c: Context<{ Bindings: Env }>
): Promise<AuthResult | null> {
  const token = extractToken(c)
  if (!token) return null

  try {
    const supabase = createSupabaseClient(c.env)
    const { data: { user }, error } = await supabase.auth.getUser(token)
    if (error || !user) return null

    const adminClient = createSupabaseAdminClient(c.env)
    const { data: utData, error: utError } = await adminClient
      .from('utilisateurs_tenant')
      .select('tenant_id, tenants!inner(id, slug, deleted_at)')
      .eq('auth_user_id', user.id)
      .is('tenants.deleted_at', null)
      .single()

    if (utError || !utData) return null
    const tenant = utData.tenants as any

    const resultat = await verifierAccesTenant(c.env, utData.tenant_id)
    if (!resultat.accesComplet && !resultat.accesAbonnementSeul) return null

    return { user_id: user.id, tenant_id: utData.tenant_id, tenant_slug: tenant.slug, token }
  } catch { return null }
}

// ── verifyAuthPaiement ─────────────────────────────────────────────────────
/**
 * Authentification module paiement.
 *
 * Accepte TOUT tenant authentifié dont le mode_acces n'est pas suspendu/
 * introuvable — y compris 'bloque', car ces routes sont précisément le moyen
 * de sortir de cet état en soumettant un nouveau paiement.
 *
 * Token : cookie `sb-access-token` (prioritaire) ou `Authorization: Bearer`.
 * Retourne un objet enrichi (tenant_nom, tenant_statut, mode_acces) ou null.
 *
 * Note : l'extraction de token est intentionnellement distincte de
 * extractToken() — comportement d'origine préservé (headerToken peut être
 * undefined, pas null, avant le fallback).
 */
export async function verifyAuthPaiement(
  c: Context<{ Bindings: Env }>
): Promise<AuthPaiementResult | null> {
  const cookieToken = getCookie(c, ACCESS_TOKEN_COOKIE)
  const headerToken = c.req.header('Authorization')?.replace('Bearer ', '').trim()
  const token = (cookieToken && cookieToken.length >= 20) ? cookieToken.trim() : (headerToken ?? null)
  if (!token) return null

  try {
    const supabase = createSupabaseClient(c.env)
    const { data: { user }, error } = await supabase.auth.getUser(token)
    if (error || !user) return null

    const adminClient = createSupabaseAdminClient(c.env)
    const { data: lien } = await adminClient
      .from('utilisateurs_tenant')
      .select('tenant_id')
      .eq('auth_user_id', user.id)
      .maybeSingle()

    if (!lien?.tenant_id) return null

    const { data: tenant } = await adminClient
      .from('tenants')
      .select('id, slug, nom, statut')
      .eq('id', lien.tenant_id)
      .is('deleted_at', null)
      .single()

    if (!tenant) return null

    const resultat = await verifierAccesTenant(c.env, tenant.id)
    if (!resultat.accesComplet && !resultat.accesAbonnementSeul) return null

    return {
      user_id: user.id,
      tenant_id: tenant.id,
      tenant_slug: tenant.slug,
      tenant_nom: tenant.nom,
      tenant_statut: tenant.statut,
      mode_acces: resultat.mode,
      token
    }
  } catch {
    return null
  }
}

// ── verifyRestaurantAuth ───────────────────────────────────────────────────
/**
 * Authentification route commandes (PATCH /commandes/:id/statut).
 *
 * Lit UNIQUEMENT le header `Authorization: Bearer` — pas de cookie.
 * Utilise le client admin Supabase (service role) pour bypasser RLS :
 * sécurisé car l'identité est vérifiée par auth.getUser() et le filtre
 * .eq('auth_user_id', user.id) empêche tout accès croisé entre tenants.
 *
 * B-CMD-01 — fix session-5 : client admin au lieu de createSupabaseClientWithToken
 * (RLS actif pouvait bloquer silencieusement un restaurateur légitime).
 *
 * S2-05 — 'bloque' refusé même via l'app mobile (cohérence avec dashboard).
 * 'inactif' toléré car le restaurant peut encore avoir des commandes en cours.
 *
 * Retourne { user_id, tenant_id, tenant_statut } ou null.
 */
export async function verifyRestaurantAuth(
  c: Context<{ Bindings: Env }>
): Promise<AuthCommandesResult | null> {
  const authHeader = c.req.header('Authorization')
  if (!authHeader?.startsWith('Bearer ')) return null
  const token = authHeader.replace('Bearer ', '')
  if (!token || token.length < 20) return null

  try {
    const supabase = createSupabaseClient(c.env)
    const { data: { user }, error } = await supabase.auth.getUser(token)
    if (error || !user) return null

    // B-CMD-01 : client ADMIN (service role) — RLS bypassé, vérification manuelle obligatoire.
    const adminClient = createSupabaseAdminClient(c.env)
    const { data: utData, error: utError } = await adminClient
      .from('utilisateurs_tenant')
      .select('tenant_id, tenants!inner(id, statut, deleted_at)')
      .eq('auth_user_id', user.id)  // vérification manuelle : uniquement le compte authentifié
      .is('tenants.deleted_at', null)
      .neq('tenants.statut', 'suspendu')
      .single()

    if (utError || !utData) return null
    const tenant = utData.tenants as any

    // S2-05 CORRIGÉ — verifyRestaurantAuth() ne vérifiait que 'suspendu', permettant
    // à un tenant 'inactif' ou 'bloque' de continuer via l'app mobile alors que le
    // dashboard web lui est bloqué (incohérence métier). On aligne sur verifierAccesTenant() :
    // seuls 'actif', 'essai', 'en_attente_paiement_initial' et 'inactif' (avec fenêtre de
    // grâce active — vérifiée via le statut) autorisent l'accès. 'bloque' et 'inactif'
    // hors grâce doivent être bloqués même via l'app mobile pour éviter le contournement.
    // Note : 'inactif' est toléré ici car verifierAccesTenant() le gère via la fenêtre de
    // grâce 72h — mais pour la route de mise à jour de statut commandes (opération légère),
    // on autorise 'inactif' car le restaurant peut encore avoir des commandes en cours.
    // La cohérence stricte est 'bloque' → refusé (abonnement expiré, sans grâce active).
    if (tenant.statut === 'bloque') return null

    return { user_id: user.id, tenant_id: utData.tenant_id, tenant_statut: tenant.statut }
  } catch { return null }
}
