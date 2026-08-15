// API Calcul livraison
// ARCHITECTURE :
//   • D1 (Cloudflare) → SITE WEB uniquement : config_globale, pays, plans
//   • Supabase (PostgreSQL) → APPLICATION : points_de_vente, tenants, etc.
import { Hono } from 'hono'
import type { Env } from '../types/database'
import { calculerFraisLivraison } from '../lib/delivery'
import { setSecurityHeaders } from '../lib/security'
import { createSupabaseAdminClient } from '../lib/supabase'

const livraisonRouter = new Hono<{ Bindings: Env }>()

// POST /api/v1/livraison/calcul
livraisonRouter.post('/calcul', async (c) => {
  setSecurityHeaders(c)

  // B-LIV-01 — fix session-5 : try/catch sur c.req.json() — un body invalide
  // provoquait une exception non catchée → 500 générique. Retour 400 propre.
  const body = await c.req.json<{
    pdv_id: string
    client_lat: number
    client_lon: number
  }>().catch(() => null)
  if (!body) return c.json({ error: 'Corps de requête JSON invalide.' }, 400)

  // §6.4 — Validation UUID sur pdv_id (Zod z.string().uuid())
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
  if (!body.pdv_id || !uuidRegex.test(body.pdv_id)) {
    return c.json({ error: 'pdv_id invalide : UUID v4 requis.' }, 400)
  }
  if (typeof body.client_lat !== 'number' || typeof body.client_lon !== 'number') {
    return c.json({ error: 'Paramètres manquants.' }, 400)
  }

  // SUPABASE — points_de_vente (APPLICATION DATA)
  const adminClient = createSupabaseAdminClient(c.env)

  const { data: pdv, error } = await adminClient
    .from('points_de_vente')
    .select('latitude, longitude')
    .eq('id', body.pdv_id)
    .eq('actif', true)
    .single()

  if (error || !pdv || !pdv.latitude || !pdv.longitude) {
    return c.json({ error: 'Point de vente introuvable.' }, 404)
  }

  const resultat = await calculerFraisLivraison({
    pdvLat: pdv.latitude,
    pdvLon: pdv.longitude,
    clientLat: body.client_lat,
    clientLon: body.client_lon,
    openweatherApiKey: c.env.OPENWEATHER_API_KEY
  })

  return c.json({
    frais_livraison: resultat.total,
    distance_km: resultat.distance_km,
    temps_estime_min: resultat.temps_estime_min,
    detail: resultat.detail,
    facteurs: resultat.facteurs
  })
})

export { livraisonRouter }
