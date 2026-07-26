// Client Supabase - utilise la clé anon publique + RLS
// Ne jamais utiliser service_role ici

import { createClient, SupabaseClient } from '@supabase/supabase-js'

let _client: SupabaseClient | null = null

export function getSupabaseClient(supabaseUrl: string, supabaseAnonKey: string): SupabaseClient {
  if (!_client) {
    _client = createClient(supabaseUrl, supabaseAnonKey, {
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

// Helper : lire la config globale depuis KV ou DB
export async function getConfigGlobale(
  key: string,
  env: { DB: D1Database; KV_CACHE: KVNamespace }
): Promise<string | null> {
  // 1. Essayer le KV cache
  const cached = await env.KV_CACHE.get(`config:${key}`)
  if (cached !== null) return cached

  // 2. Fallback sur D1
  const result = await env.DB
    .prepare('SELECT valeur FROM config_globale WHERE cle = ?')
    .bind(key)
    .first<{ valeur: string }>()

  if (result) {
    // Mettre en cache 1 heure
    await env.KV_CACHE.put(`config:${key}`, result.valeur, { expirationTtl: 3600 })
    return result.valeur
  }

  return null
}

// Helper : récupérer le nom du projet depuis la DB
export async function getNomProjet(
  env: { DB: D1Database; KV_CACHE: KVNamespace }
): Promise<string> {
  return (await getConfigGlobale('nom_projet', env)) ?? 'MonMenu'
}
