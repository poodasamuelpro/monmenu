// API Plans/Forfaits — Prix dynamiques depuis la DB (D1, site web uniquement)
// Section 8.6 du cahier des charges — AUCUN prix codé en dur côté client.
// CYCLE-3 : Suppression intégrale de getTauxConversion(), TAUX_CONVERSION_DEFAUT,
//           paramètre ?devise=, prix_annuel_converti, economie_annuelle.
//           Tous les prix sont retournés en FCFA bruts (pas de conversion).
import { Hono } from 'hono'
import type { Env, Plan } from '../types/database'
import { setSecurityHeaders } from '../lib/security'

const plansRouter = new Hono<{ Bindings: Env }>()

type FonctionnalitesPlan = {
  sous_titre?: string
  cible?: string
  recommande?: boolean
  produits_max?: number
  categories_max?: number
  [cle: string]: boolean | number | string | undefined
}

function parseFonctionnalites(raw: Plan['fonctionnalites']): FonctionnalitesPlan {
  if (!raw) return {}
  if (typeof raw === 'string') {
    try {
      return JSON.parse(raw)
    } catch {
      return {}
    }
  }
  return raw as FonctionnalitesPlan
}

// GET /api/v1/plans — Liste des plans actifs, triés, prix en FCFA bruts
// CYCLE-3 : paramètre ?devise= ignoré — devise fixe FCFA.
//           getTauxConversion() supprimé, aucune conversion effectuée.
plansRouter.get('/', async (c) => {
  setSecurityHeaders(c)

  // CYCLE-3 : cache KV sans devise (clé unique 'plans:FCFA' immuable)
  const cacheKey = 'plans:FCFA'

  // Cache KV (optionnel, 10 min) — ne bloque jamais la requête si absent
  try {
    if (c.env.KV_CACHE) {
      const cached = await c.env.KV_CACHE.get(cacheKey, 'json')
      if (cached) {
        c.header('X-Cache', 'HIT')
        return c.json(cached)
      }
    }
  } catch { /* KV non disponible */ }

  const plansResult = await c.env.DB
    .prepare('SELECT * FROM plans WHERE actif = 1 ORDER BY ordre_affichage ASC')
    .all<Plan>()

  const plans = plansResult.results.map((plan) => {
    const fonctionnalites = parseFonctionnalites(plan.fonctionnalites)
    return {
      ...plan,
      fonctionnalites,
      // CYCLE-3 : prix bruts FCFA uniquement — pas de conversion devise
      devise: 'FCFA',
      // -1 en base = illimité : on normalise ici pour ne pas laisser le
      // front réinterpréter (et potentiellement mal afficher) un -1 brut.
      commandes_incluses_affichage:
        plan.commandes_incluses === -1 ? 'Illimitées' : plan.commandes_incluses,
      limite_pdv_affichage: plan.limite_pdv === -1 ? 'Illimités' : plan.limite_pdv,
    }
  })

  // CYCLE-3 : devise fixe FCFA dans la réponse (plus de paramètre dynamique)
  const result = { plans, devise: 'FCFA' }

  try {
    if (c.env.KV_CACHE) {
      await c.env.KV_CACHE.put(cacheKey, JSON.stringify(result), { expirationTtl: 600 })
    }
  } catch { /* KV non disponible */ }

  return c.json(result)
})

export { plansRouter }
