// Client Supabase - utilise la clé anon publique + RLS
// Ne jamais utiliser service_role ici

import { createClient, SupabaseClient } from '@supabase/supabase-js'

// Cache module-level (Workers isolate — réinitialisé à chaque cold start)
let _client: SupabaseClient | null = null

/**
 * Crée (ou réutilise) un client Supabase avec la clé anon.
 * Utilisé par api-auth et api-dashboard pour la vérification JWT.
 */
export function createSupabaseClient(env: { SUPABASE_URL: string; SUPABASE_ANON_KEY: string }): SupabaseClient {
  if (!_client) {
    _client = createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
      auth: {
        autoRefreshToken: true,
        persistSession: false // Workers sont stateless
      },
      db: {
        schema: 'public'
      }
    })
  }
  return _client
}

// Alias pour compatibilité ascendante
export const getSupabaseClient = createSupabaseClient

// Helper : lire la config globale depuis KV ou DB
export async function getConfigGlobale(
  key: string,
  env: { DB: D1Database; KV_CACHE?: KVNamespace }
): Promise<string | null> {
  // 1. Essayer le KV cache (optionnel — pas disponible en dev local)
  try {
    if (env.KV_CACHE) {
      const cached = await env.KV_CACHE.get(`config:${key}`)
      if (cached !== null) return cached
    }
  } catch { /* KV non disponible */ }

  // 2. Fallback sur D1
  const result = await env.DB
    .prepare('SELECT valeur FROM config_globale WHERE cle = ?')
    .bind(key)
    .first<{ valeur: string }>()

  if (result) {
    // Mettre en cache 1 heure si KV disponible
    try {
      if (env.KV_CACHE) {
        await env.KV_CACHE.put(`config:${key}`, result.valeur, { expirationTtl: 3600 })
      }
    } catch { /* KV non disponible */ }
    return result.valeur
  }

  return null
}

// Helper : récupérer le nom du projet depuis la DB
export async function getNomProjet(
  env: { DB: D1Database; KV_CACHE?: KVNamespace }
): Promise<string> {
  return (await getConfigGlobale('nom_projet', env)) ?? 'MonMenu'
}
