// API Plans/Forfaits — Prix dynamiques depuis la DB (D1, site web uniquement)
// Section 8.6 du cahier des charges — AUCUN prix codé en dur côté client.
import { Hono } from 'hono'
import type { Env, Plan } from '../types/database'
import { setSecurityHeaders } from '../lib/security'

const plansRouter = new Hono<{ Bindings: Env }>()

// Taux de conversion FCFA → autres devises
// BUG-015 FIX — les taux sont désormais lus depuis D1 config_globale (clé 'taux_conversion_json')
// Fallback sur les valeurs ci-dessous si la config D1 est absente ou invalide.
// Pour mettre à jour les taux : INSERT OR REPLACE INTO config_globale (cle, valeur)
// VALUES ('taux_conversion_json', '{"FCFA":1,"XOF":1,"XAF":1,"EUR":0.00152,"USD":0.00168,"MAD":0.0165,"GHS":0.019}');
const TAUX_CONVERSION_DEFAUT: Record<string, number> = {
  FCFA: 1,
  XOF: 1,
  XAF: 1,
  EUR: 0.00152,
  USD: 0.00168,
  MAD: 0.0165,
  GHS: 0.019,
}

async function getTauxConversion(env: any): Promise<Record<string, number>> {
  try {
    // Essayer D1 d'abord (config_globale)
    const row = await env.DB
      .prepare("SELECT valeur FROM config_globale WHERE cle = 'taux_conversion_json' LIMIT 1")
      .first<{ valeur: string }>()
    if (row?.valeur) {
      const taux = JSON.parse(row.valeur)
      // Toujours assurer FCFA/XOF = 1
      return { FCFA: 1, XOF: 1, ...taux }
    }
  } catch { /* D1 absent ou parsing raté — utiliser fallback */ }
  return TAUX_CONVERSION_DEFAUT
}

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

// GET /api/v1/plans — Liste des plans actifs, triés, avec conversion devise
plansRouter.get('/', async (c) => {
  setSecurityHeaders(c)

  const deviseParam = (c.req.query('devise') ?? 'FCFA').toUpperCase()
  const cacheKey = `plans:${deviseParam}`

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

  // BUG-015 FIX — lire taux depuis D1 config_globale avec fallback hardcodé
  const tauxConversion = await getTauxConversion(c.env)
  const taux = tauxConversion[deviseParam] ?? tauxConversion['FCFA'] ?? 1

  const plansConverted = plansResult.results.map((plan) => {
    const fonctionnalites = parseFonctionnalites(plan.fonctionnalites)
    return {
      ...plan,
      fonctionnalites,
      prix_mensuel_converti: Math.round(plan.prix_mensuel * taux),
      prix_annuel_converti: Math.round(plan.prix_annuel * taux),
      devise_affichage: deviseParam,
      economie_annuelle: Math.round((plan.prix_mensuel * 12 - plan.prix_annuel) * taux),
      // -1 en base = illimité : on normalise ici pour ne pas laisser le
      // front réinterpréter (et potentiellement mal afficher) un -1 brut.
      commandes_incluses_affichage:
        plan.commandes_incluses === -1 ? 'Illimitées' : plan.commandes_incluses,
      limite_pdv_affichage: plan.limite_pdv === -1 ? 'Illimités' : plan.limite_pdv,
    }
  })

  const result = { plans: plansConverted, devise: deviseParam }

  try {
    if (c.env.KV_CACHE) {
      await c.env.KV_CACHE.put(cacheKey, JSON.stringify(result), { expirationTtl: 600 })
    }
  } catch { /* KV non disponible */ }

  return c.json(result)
})

export { plansRouter }
