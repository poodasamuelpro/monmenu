// Module sécurité : CSRF, rate limiting, validation, idempotency
// Section 11 du cahier des charges
//
// FIX (correctif QR code) — api.qrserver.com ajouté à img-src ET connect-src
// de la CSP, au même titre que mapbox/openstreetmap. Le dashboard charge
// désormais l'image QR directement depuis qrserver.com (pas de proxy serveur),
// donc le navigateur doit être autorisé à charger cette origine.

import { Context } from 'hono'
import { z } from 'zod'
import type { Env } from '../types/database'

// ---- Rate Limiting ----
// §6.1 — Rate limiting distribué via Cloudflare KV (remplace Map in-memory)
// La Map in-memory est non distribuée : chaque isolate Cloudflare a son propre état,
// ce qui rend le rate limiting inefficace en production multi-isolate.
// Avec KV + TTL, le compteur est partagé entre tous les isolates.

interface RateLimitEntry {
  count: number
  resetAt: number
}

/**
 * §6.1 — Rate limiting distribué via KV.
 * Fallback sur in-memory si KV_CACHE absent (§8 — KV_CACHE optionnel).
 */
const _rateLimitStoreFallback = new Map<string, RateLimitEntry>()

export async function checkRateLimit(
  key: string,
  maxRequests: number = 30,
  windowMs: number = 60000,
  kv?: KVNamespace
): Promise<{ allowed: boolean; remaining: number; resetAt: number }> {
  const now = Date.now()

  // --- KV distribué (prioritaire) ---
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

  // --- Fallback in-memory (si KV_CACHE absent) ---
  // §8 — warning loggé au niveau supérieur si KV absent
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
  ttlSeconds: number = 86400 // 24h
): Promise<void> {
  await kv.put(`idempotency:${key}`, JSON.stringify(data), { expirationTtl: ttlSeconds })
}

// ---- Validation Zod ----

export const CommandeSchema = z.object({
  tenant_id: z.string().uuid(),
  point_de_vente_id: z.string().uuid(),
  client_nom: z.string().min(2).max(100).trim(),
  client_telephone: z.string().regex(/^\+?[0-9\s\-]{8,20}$/),
  client_adresse: z.string().max(500).optional().nullable(),
  client_latitude: z.number().min(-90).max(90).optional().nullable(),
  client_longitude: z.number().min(-180).max(180).optional().nullable(),
  items: z.array(z.object({
    produit_id: z.string().uuid(),
    quantite: z.number().int().min(1).max(50),
    variante_id: z.string().uuid().optional()
  })).min(1).max(30),
  mode_paiement: z.enum(['especes_livraison', 'mobile_money', 'carte_bancaire']),
  // §1.9 — Mode livraison : livraison à domicile ou retrait sur place
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
/**
 * §6.2 — Génère un nonce CSP cryptographiquement aléatoire.
 * À appeler une fois par requête et passer aux templates SSR pour les <script> inline.
 */
export function generateCspNonce(): string {
  const array = new Uint8Array(16)
  crypto.getRandomValues(array)
  return btoa(String.fromCharCode(...array))
}

export function setSecurityHeaders(c: Context, nonce?: string): void {
  // §6.2 — Utiliser un nonce si fourni, sinon 'unsafe-inline' en fallback de développement
  const scriptSrcDirective = nonce
    ? `'nonce-${nonce}' cdn.tailwindcss.com cdn.jsdelivr.net api.mapbox.com`
    : `'unsafe-inline' cdn.tailwindcss.com cdn.jsdelivr.net api.mapbox.com`

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
    // FIX QR code : api.qrserver.com ajouté (image du QR chargée directement
    // par le dashboard, comme mapbox/openstreetmap déjà autorisés ici).
    `img-src 'self' data: blob: *.mapbox.com *.openstreetmap.org *.supabase.co *.tile.openstreetmap.org api.qrserver.com; ` +
    `connect-src 'self' *.supabase.co api.mapbox.com events.mapbox.com api.openweathermap.org graph.facebook.com nominatim.openstreetmap.org api.qrserver.com; ` +
    `font-src 'self' fonts.gstatic.com cdn.jsdelivr.net; ` +
    `frame-ancestors 'none';`
  )
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
    .replace(/[\u0300-\u036f]/g, '') // supprimer accents
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 50)
}
