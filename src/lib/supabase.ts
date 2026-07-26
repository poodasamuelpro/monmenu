// =====================================================================
// MonMenu — Client Supabase
// ARCHITECTURE :
//   • D1 (Cloudflare) → SITE WEB uniquement : config_globale, pays, plans
//   • Supabase (PostgreSQL) → APPLICATION : tenants, commandes, menu,
//     livreurs, codes_promo, utilisateurs_tenant, points_de_vente, etc.
// =====================================================================

import { createClient, SupabaseClient } from '@supabase/supabase-js'

// Cache module-level (Workers isolate — réinitialisé à chaque cold start)
let _client: SupabaseClient | null = null
let _adminClient: SupabaseClient | null = null

export type SupabaseEnv = {
  SUPABASE_URL: string
  SUPABASE_ANON_KEY: string
  SUPABASE_SERVICE_ROLE_KEY?: string
}

/**
 * Client Supabase ANON (utilisé pour les opérations publiques + JWT verification).
 * Supabase Auth + toutes les données applicatives via .from()
 */
export function createSupabaseClient(env: SupabaseEnv): SupabaseClient {
  if (!_client) {
    _client = createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
      auth: {
        autoRefreshToken: false,
        persistSession: false // Workers sont stateless
      },
      db: { schema: 'public' }
    })
  }
  return _client
}

/**
 * Client Supabase SERVICE ROLE (opérations privilegiées côté serveur uniquement).
 * JAMAIS exposé côté client.
 */
export function createSupabaseAdminClient(env: SupabaseEnv): SupabaseClient {
  if (!_adminClient && env.SUPABASE_SERVICE_ROLE_KEY) {
    _adminClient = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      },
      db: { schema: 'public' }
    })
  }
  // Fallback sur anon si pas de service role key (dev local)
  return _adminClient ?? createSupabaseClient(env)
}

/**
 * Client Supabase avec un JWT utilisateur (pour requêtes RLS-aware).
 * Crée un nouveau client non mis en cache.
 */
export function createSupabaseClientWithToken(env: SupabaseEnv, accessToken: string): SupabaseClient {
  const client = createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    },
    db: { schema: 'public' },
    global: {
      headers: {
        Authorization: `Bearer ${accessToken}`
      }
    }
  })
  return client
}

// Alias pour compatibilité ascendante
export const getSupabaseClient = createSupabaseClient

// =============================================================
// Helpers D1 (SITE WEB UNIQUEMENT)
// =============================================================

/**
 * Lire une valeur de config_globale depuis D1 (site web config uniquement).
 * Toujours resilient — ne crash jamais, retourne null si D1 indisponible.
 */
export async function getConfigGlobale(
  key: string,
  env: { DB: D1Database; KV_CACHE?: KVNamespace }
): Promise<string | null> {
  try {
    // 1. Essayer le KV cache (optionnel)
    try {
      if (env.KV_CACHE) {
        const cached = await env.KV_CACHE.get(`config:${key}`)
        if (cached !== null) return cached
      }
    } catch { /* KV non disponible */ }

    // 2. Fallback sur D1 (seule table autorisée : config_globale)
    const result = await env.DB
      .prepare('SELECT valeur FROM config_globale WHERE cle = ?')
      .bind(key)
      .first<{ valeur: string }>()

    if (result) {
      try {
        if (env.KV_CACHE) {
          await env.KV_CACHE.put(`config:${key}`, result.valeur, { expirationTtl: 3600 })
        }
      } catch { /* KV non disponible */ }
      return result.valeur
    }
  } catch { /* D1 non disponible — migration non appliquée */ }

  return null
}

/**
 * Récupérer le nom du projet depuis D1 config_globale.
 * Fallback 'MonMenu' si D1 indisponible.
 */
export async function getNomProjet(
  env: { DB: D1Database; KV_CACHE?: KVNamespace }
): Promise<string> {
  return (await getConfigGlobale('nom_projet', env)) ?? 'MonMenu'
}

/**
 * Récupérer le numéro WhatsApp support depuis D1.
 * Fallback vide si D1 indisponible.
 */
export async function getWhatsAppSupport(
  env: { DB: D1Database; KV_CACHE?: KVNamespace }
): Promise<string> {
  return (await getConfigGlobale('whatsapp_support', env)) ?? ''
}
