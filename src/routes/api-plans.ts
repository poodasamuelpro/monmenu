// API Plans/Forfaits — Prix dynamiques depuis la DB
// Section 8.6 du cahier des charges
import { Hono } from 'hono'
import type { Env, Plan } from '../types/database'
import { setSecurityHeaders } from '../lib/security'

const plansRouter = new Hono<{ Bindings: Env }>()

// Taux de conversion CFA → autres devises (à remplacer par API temps réel)
const TAUX_CONVERSION: Record<string, number> = {
  'FCFA': 1,
  'EUR': 0.00152,
  'USD': 0.00168,
  'XOF': 1,
  'XAF': 1,
  'MAD': 0.0165,
  'GHS': 0.019
}

// GET /api/v1/plans — Liste des plans avec conversion devise
plansRouter.get('/', async (c) => {
  setSecurityHeaders(c)

  const deviseParam = c.req.query('devise') ?? 'FCFA'
  const cacheKey = `plans:${deviseParam}`

  const cached = await c.env.KV_CACHE.get(cacheKey, 'json')
  if (cached) {
    c.header('X-Cache', 'HIT')
    return c.json(cached)
  }

  const plans = await c.env.DB
    .prepare('SELECT * FROM plans WHERE actif = 1 ORDER BY ordre_affichage ASC')
    .all<Plan>()

  const taux = TAUX_CONVERSION[deviseParam] ?? TAUX_CONVERSION['FCFA']!

  const plansConverted = plans.results.map((plan) => ({
    ...plan,
    prix_mensuel_converti: Math.round(plan.prix_mensuel * taux),
    prix_annuel_converti: Math.round(plan.prix_annuel * taux),
    devise_affichage: deviseParam,
    economie_annuelle: Math.round((plan.prix_mensuel * 12 - plan.prix_annuel) * taux)
  }))

  const result = { plans: plansConverted, devise: deviseParam }

  // Cache 10 minutes
  await c.env.KV_CACHE.put(cacheKey, JSON.stringify(result), { expirationTtl: 600 })

  return c.json(result)
})

export { plansRouter }
