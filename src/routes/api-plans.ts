// API Plans/Forfaits — MIGRATION : lecture Supabase UNIQUEMENT.
//
// D1 n'est plus consulté ici. Supabase `plans` est la source de vérité
// unique (nom, prix, fonctionnalités), avec son UUID natif utilisé par
// tout le reste de l'application (inscription, paiement, admin,
// dashboard) — voir src/lib/plans.ts pour le détail de la migration.
//
// Tous les prix sont retournés en FCFA bruts (pas de conversion devise,
// conservé du comportement précédent CYCLE-3).

import { Hono } from 'hono'
import type { Env } from '../types/database'
import { setSecurityHeaders } from '../lib/security'
import { createSupabaseAdminClient } from '../lib/supabase'

const plansRouter = new Hono<{ Bindings: Env }>()

type FonctionnalitesPlan = {
  sous_titre?: string
  cible?: string
  recommande?: boolean
  produits_max?: number
  categories_max?: number
  [cle: string]: boolean | number | string | undefined
}

function parseFonctionnalites(raw: unknown): FonctionnalitesPlan {
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

// GET /api/v1/plans — Liste des plans actifs, triés, prix en FCFA bruts.
// MIGRATION : lit désormais Supabase (adminClient.from('plans')) au lieu
// de D1. Le `id` renvoyé pour chaque plan est l'UUID Supabase natif —
// c'est cet id qui doit être utilisé tel quel par tous les formulaires
// (inscription, soumission de preuve de paiement, changement de plan).
plansRouter.get('/', async (c) => {
  setSecurityHeaders(c)

  const cacheKey = 'plans:FCFA'

  try {
    if (c.env.KV_CACHE) {
      const cached = await c.env.KV_CACHE.get(cacheKey, 'json')
      if (cached) {
        c.header('X-Cache', 'HIT')
        return c.json(cached)
      }
    }
  } catch { /* KV non disponible en local dev */ }

  const adminClient = createSupabaseAdminClient(c.env)
  const { data: plansData, error } = await adminClient
    .from('plans')
    .select('id, nom, description, prix_mensuel, prix_annuel, devise, commandes_incluses, frais_par_commande, limite_pdv, fonctionnalites, actif, ordre_affichage')
    .eq('actif', true)
    .order('ordre_affichage', { ascending: true })

  if (error) {
    console.error('[Plans] Erreur Supabase:', error.message)
    return c.json({ plans: [], devise: 'FCFA' })
  }

  const plans = (plansData ?? []).map((plan) => {
    const fonctionnalites = parseFonctionnalites(plan.fonctionnalites)
    return {
      ...plan,
      fonctionnalites,
      devise: 'FCFA',
      commandes_incluses_affichage:
        plan.commandes_incluses === -1 ? 'Illimitées' : plan.commandes_incluses,
      limite_pdv_affichage: plan.limite_pdv === -1 ? 'Illimités' : plan.limite_pdv,
    }
  })

  const result = { plans, devise: 'FCFA' }

  try {
    if (c.env.KV_CACHE) {
      await c.env.KV_CACHE.put(cacheKey, JSON.stringify(result), { expirationTtl: 600 })
    }
  } catch { /* KV non disponible */ }

  return c.json(result)
})

export { plansRouter }
