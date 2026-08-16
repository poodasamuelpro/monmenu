// Module sécurité : CSRF, rate limiting, validation, idempotency
//
// AJOUT — CommandeSchema.items[].supplement_ids : IDs des suppléments
// choisis par le client pour chaque ligne de commande. Le PRIX n'est
// jamais transmis ici — uniquement les UUID, dont le prix réel est
// recalculé côté serveur depuis la table `supplements` (voir
// api-commandes.ts), exactement comme le code promo existant.
//
// FIX CSP — connect-src ajoute désormais explicitement wss://*.supabase.co
// (en plus de https://*.supabase.co) pour autoriser la connexion
// WebSocket de Supabase Realtime, bloquée auparavant par la CSP
// (le navigateur ne fait pas d'upgrade implicite https -> wss dans le
// matching CSP). Sans ce correctif, initRealtimeCommandes() échouait en
// CHANNEL_ERROR et basculait systématiquement sur le fallback polling.

import { Context } from 'hono'
import { z } from 'zod'
import type { Env } from '../types/database'

// ---- Rate Limiting ----

interface RateLimitEntry {
  count: number
  resetAt: number
}

const _rateLimitStoreFallback = new Map<string, RateLimitEntry>()

export async function checkRateLimit(
  key: string,
  maxRequests: number = 30,
  windowMs: number = 60000,
  kv?: KVNamespace
): Promise<{ allowed: boolean; remaining: number; resetAt: number }> {
  const now = Date.now()

  if (kv) {
    const kvKey = `rl:${key}`
    const raw = await kv.get(kvKey, 'json') as RateLimitEntry | null

    if (!raw || now > raw.resetAt) {
      const resetAt = now + windowMs
      const ttlSeconds = Math.ceil(windowMs / 1000)
      await kv.put(kvKey, JSON.stringify({ count: 1, resetAt }), { expirationTtl: ttlSeconds })
      return { allowed: true, remaining: maxRequests - 1, resetAt }
    }

    if (raw.count >= maxRequests) {
      return { allowed: false, remaining: 0, resetAt: raw.resetAt }
    }

    const newCount = raw.count + 1
    const ttlSeconds = Math.ceil((raw.resetAt - now) / 1000)
    await kv.put(kvKey, JSON.stringify({ count: newCount, resetAt: raw.resetAt }), { expirationTtl: Math.max(ttlSeconds, 1) })
    return { allowed: true, remaining: maxRequests - newCount, resetAt: raw.resetAt }
  }

  const entry = _rateLimitStoreFallback.get(key)

  if (!entry || now > entry.resetAt) {
    const resetAt = now + windowMs
    _rateLimitStoreFallback.set(key, { count: 1, resetAt })
    return { allowed: true, remaining: maxRequests - 1, resetAt }
  }

  if (entry.count >= maxRequests) {
    return { allowed: false, remaining: 0, resetAt: entry.resetAt }
  }

  entry.count++
  return { allowed: true, remaining: maxRequests - entry.count, resetAt: entry.resetAt }
}

// ---- Idempotency Key ----
export async function checkIdempotency(
  key: string,
  kv: KVNamespace
): Promise<{ exists: boolean; data?: unknown }> {
  const existing = await kv.get(`idempotency:${key}`, 'json')
  return { exists: existing !== null, data: existing }
}

export async function storeIdempotency(
  key: string,
  data: unknown,
  kv: KVNamespace,
  ttlSeconds: number = 86400
): Promise<void> {
  await kv.put(`idempotency:${key}`, JSON.stringify(data), { expirationTtl: ttlSeconds })
}

// ---- Validation Zod ----

export const CommandeSchema = z.object({
  // FINDING-05 (session-7) — tenant_id n'est plus utilisé par le serveur pour
  // déterminer le tenant cible (le Worker le dérive du slug dans l'URL).
  // Le champ est conservé dans le schéma pour la rétrocompatibilité avec les
  // clients existants qui l'envoient encore, mais il est explicitement ignoré
  // côté route (voir api-commandes.ts, POST / et POST /valider-promo).
  tenant_id: z.string().uuid().optional(),
  point_de_vente_id: z.string().uuid(),
  client_nom: z.string().min(2).max(100).trim(),
  client_telephone: z.string().regex(/^\+?[0-9\s\-]{8,20}$/),
  client_adresse: z.string().max(500).optional().nullable(),
  client_latitude: z.number().min(-90).max(90).optional().nullable(),
  client_longitude: z.number().min(-180).max(180).optional().nullable(),
  items: z.array(z.object({
    produit_id: z.string().uuid(),
    quantite: z.number().int().min(1).max(50),
    variante_id: z.string().uuid().optional(),
    // AJOUT — suppléments choisis pour cette ligne (IDs uniquement, prix
    // jamais transmis par le client — recalculé serveur, voir api-commandes.ts)
    supplement_ids: z.array(z.string().uuid()).max(10).optional()
  })).min(1).max(30),
  mode_paiement: z.enum(['especes_livraison', 'mobile_money', 'carte_bancaire']),
  mode_livraison: z.enum(['livraison', 'emporter']).default('livraison'),
  code_promo: z.string().max(50).optional(),
  idempotency_key: z.string().uuid(),
  notes: z.string().max(500).optional().nullable()
})

export const TenantSchema = z.object({
  nom: z.string().min(2).max(100).trim(),
  slug: z.string().min(2).max(50).regex(/^[a-z0-9-]+$/).trim(),
  whatsapp_number: z.string().regex(/^\+?[0-9]{10,15}$/),
  couleur_primaire: z.string().regex(/^#[0-9A-Fa-f]{6}$/).default('#E02020'),
  couleur_secondaire: z.string().regex(/^#[0-9A-Fa-f]{6}$/).default('#1A56DB')
})

export const ProduitSchema = z.object({
  categorie_id: z.string().uuid(),
  nom: z.string().min(2).max(200).trim(),
  description: z.string().max(1000).optional().nullable(),
  prix: z.number().positive().max(9999999),
  disponible: z.boolean().default(true),
  ordre_affichage: z.number().int().min(0).default(0)
})

// ---- Headers sécurité ----
export function generateCspNonce(): string {
  const array = new Uint8Array(16)
  crypto.getRandomValues(array)
  return btoa(String.fromCharCode(...array))
}

// setSecurityHeaders retourne désormais le nonce utilisé pour que l'appelant
// puisse l'injecter dans les balises <script nonce="…"> de ses templates SSR.
// A-5 (FINDING-18, session-7) : si un nonce est fourni par l'appelant, il est
// utilisé dans la CSP (mode strict, sans unsafe-inline) ; sinon la fonction
// génère automatiquement un nonce et le retourne avec 'unsafe-inline' en
// fallback de migration (les navigateurs CSP Level 3 ignorent unsafe-inline si
// un nonce est présent et que les scripts portent le bon nonce — mais pour les
// navigateurs plus anciens ou les templates pas encore migrés, unsafe-inline
// garantit la non-régression pendant la migration progressive).
// Migration : une fois tous les templates mis à jour avec nonce="...", supprimer
// 'unsafe-inline' de cette directive.
export function setSecurityHeaders(c: Context, nonce?: string): string {
  const usedNonce = nonce ?? generateCspNonce()
  // Inclure 'unsafe-inline' uniquement si aucun nonce explicite n'est fourni
  // par l'appelant (migration progressive — les templates non encore mis à jour
  // continuent de fonctionner). Quand un nonce est explicitement fourni ET injecté
  // dans les templates, supprimer 'unsafe-inline' de cette ligne.
  const scriptSrcDirective = nonce
    ? `'nonce-${usedNonce}' cdn.tailwindcss.com cdn.jsdelivr.net api.mapbox.com`
    : `'unsafe-inline' 'nonce-${usedNonce}' cdn.tailwindcss.com cdn.jsdelivr.net api.mapbox.com`

  c.header('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload')
  c.header('X-Content-Type-Options', 'nosniff')
  c.header('X-Frame-Options', 'DENY')
  c.header('X-XSS-Protection', '1; mode=block')
  c.header('Referrer-Policy', 'strict-origin-when-cross-origin')
  c.header('Permissions-Policy', 'geolocation=(self), microphone=()')
  c.header(
    'Content-Security-Policy',
    `default-src 'self'; ` +
    `script-src 'self' ${scriptSrcDirective}; ` +
    `style-src 'self' 'unsafe-inline' cdn.tailwindcss.com cdn.jsdelivr.net api.mapbox.com fonts.googleapis.com; ` +
    `img-src 'self' data: blob: *.mapbox.com *.openstreetmap.org *.supabase.co *.tile.openstreetmap.org api.qrserver.com image.thum.io; ` +
    `connect-src 'self' https://*.supabase.co wss://*.supabase.co api.mapbox.com events.mapbox.com api.openweathermap.org graph.facebook.com nominatim.openstreetmap.org api.qrserver.com; ` +
    `font-src 'self' fonts.gstatic.com cdn.jsdelivr.net; ` +
    `frame-ancestors 'none';`
  )
  return usedNonce
}

// ---- UUID v4 ----
export function generateUUID(): string {
  return crypto.randomUUID()
}

// ---- Token de suivi commande ----
export function generateTrackingToken(): string {
  const array = new Uint8Array(12)
  crypto.getRandomValues(array)
  return Array.from(array, (b) => b.toString(16).padStart(2, '0'))
    .join('')
    .toUpperCase()
}

// ---- Sanitisation slug ----
export function sanitizeSlug(input: string): string {
  return input
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 50)
}

// ---- Comparaison timing-safe (A-7/FINDING-23, session-7) ----
// Remplace l'égalité simple (secret !== envSecret) qui expose une timing attack
// théorique permettant de deviner le secret caractère par caractère.
export function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  const aBytes = new TextEncoder().encode(a)
  const bBytes = new TextEncoder().encode(b)
  let result = 0
  for (let i = 0; i < aBytes.length; i++) result |= aBytes[i] ^ bBytes[i]
  return result === 0
}
