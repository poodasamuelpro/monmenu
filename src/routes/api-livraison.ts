// API Calcul livraison
import { Hono } from 'hono'
import type { Env } from '../types/database'
import { calculerFraisLivraison } from '../lib/delivery'
import { setSecurityHeaders } from '../lib/security'

const livraisonRouter = new Hono<{ Bindings: Env }>()

// POST /api/v1/livraison/calcul
livraisonRouter.post('/calcul', async (c) => {
  setSecurityHeaders(c)

  const body = await c.req.json<{
    pdv_id: string
    client_lat: number
    client_lon: number
  }>()

  if (!body.pdv_id || typeof body.client_lat !== 'number' || typeof body.client_lon !== 'number') {
    return c.json({ error: 'Paramètres manquants.' }, 400)
  }

  const pdv = await c.env.DB
    .prepare('SELECT latitude, longitude FROM points_de_vente WHERE id = ? AND actif = 1')
    .bind(body.pdv_id)
    .first<{ latitude: number; longitude: number }>()

  if (!pdv || !pdv.latitude || !pdv.longitude) {
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
