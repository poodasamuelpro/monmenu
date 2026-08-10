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

/**
 * AJOUT — Récupérer l'adresse email de contact officielle MonMenu depuis
 * D1 config_globale (clé 'email_contact'). Aucune adresse codée en dur
 * dans le reste du code : tout passe par cette fonction, modifiable à
 * tout moment depuis la config_globale sans redéploiement.
 * Fallback sur l'adresse Gmail officielle actuelle tant qu'un domaine
 * propre (.com) n'est pas configuré.
 */
export async function getEmailContact(
  env: { DB: D1Database; KV_CACHE?: KVNamespace }
): Promise<string> {
  return (await getConfigGlobale('email_contact', env)) ?? 'contact.monmenu@gmail.com'
}

/**
 * AJOUT — Récupérer l'adresse email d'expéditeur (utilisée par Brevo pour
 * l'envoi des emails transactionnels) depuis D1 config_globale (clé
 * 'email_expediteur'). Si non configurée, retombe sur l'adresse de contact
 * (getEmailContact) — ce qui fonctionne avec la vérification "expéditeur
 * unique" de Brevo, sans nécessiter l'authentification complète d'un
 * domaine (SPF/DKIM). Une fois le domaine .com vérifié dans Brevo, il
 * suffit de renseigner 'email_expediteur' dans config_globale (ex:
 * noreply@monmenu.com) — aucun changement de code requis.
 */
export async function getEmailExpediteur(
  env: { DB: D1Database; KV_CACHE?: KVNamespace }
): Promise<string> {
  const configuree = await getConfigGlobale('email_expediteur', env)
  if (configuree) return configuree
  return getEmailContact(env)
}

/**
 * AJOUT — Récupérer le nom affiché de l'expéditeur (Brevo) depuis D1
 * config_globale (clé 'nom_expediteur'). Fallback sur le nom du projet
 * (getNomProjet) si non configuré.
 */
export async function getNomExpediteur(
  env: { DB: D1Database; KV_CACHE?: KVNamespace }
): Promise<string> {
  const configure = await getConfigGlobale('nom_expediteur', env)
  if (configure) return configure
  return getNomProjet(env)
}

/**
 * §6.5 — Masque les détails d'erreur Supabase en production.
 * En développement, retourne le message complet pour faciliter le débogage.
 * En production, log côté serveur uniquement et retourne un message générique.
 */
export function safeSupabaseError(error: { message?: string } | null, context: string, env?: { ENVIRONMENT?: string }): string {
  const isProduction = env?.ENVIRONMENT === 'production'
  if (error?.message) {
    console.error(`[Supabase] ${context}:`, error.message)
  }
  return isProduction ? 'Erreur de base de données.' : (error?.message ?? 'Erreur inconnue.')
}

/**
 * §8 — Log un warning si KV_CACHE n'est pas configuré.
 * Appelé au premier accès pour être visible en observabilité.
 */
let _kvWarningLogged = false
export function warnIfKvCacheAbsent(kv?: KVNamespace): void {
  if (!kv && !_kvWarningLogged) {
    _kvWarningLogged = true
    console.warn('[MonMenu] ⚠️  KV_CACHE non configuré. Le rate limiting distribué et le cache KV sont désactivés. Configurez KV_CACHE dans wrangler.jsonc pour de meilleures performances en production.')
  }
}
