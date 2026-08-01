// src/lib/plans.ts
// ─────────────────────────────────────────────────────────────────────────
// BUG CORRIGÉ : tenants.plan_id et tenants.plan_initial_id (Supabase)
// stockent l'UUID de la ligne Supabase `plans` (résolu à l'inscription via
// `plans.d1_plan_id` — voir api-auth.ts). Mais D1 reste la SEULE source de
// vérité pour le nom/prix/fonctionnalités affichés (table `plans` de D1).
//
// Plusieurs endroits (GET /api/v1/dashboard/profil, GET /api/v1/paiement/statut)
// interrogeaient D1 DIRECTEMENT avec cet UUID Supabase — qui ne correspond à
// AUCUNE ligne D1 → résultat toujours null → "Plan actuel" et "plan choisi"
// ne s'affichaient jamais dans le dashboard.
//
// Ce module centralise la résolution UUID Supabase → id D1 → ligne D1,
// pour que ce bug ne soit corrigé qu'à un seul endroit.
// ─────────────────────────────────────────────────────────────────────────

import { createSupabaseAdminClient } from './supabase'
import type { Env } from '../types/database'

/**
 * Résout l'id D1 d'un plan à partir de son UUID Supabase.
 * Retourne null si planIdSupabase est vide ou si aucune correspondance
 * n'est trouvée (ex: plan supprimé côté Supabase).
 */
export async function resoudreIdD1DepuisPlanSupabase(
  env: Env,
  planIdSupabase: string | null | undefined
): Promise<string | null> {
  if (!planIdSupabase) return null
  try {
    const adminClient = createSupabaseAdminClient(env)
    const { data } = await adminClient
      .from('plans')
      .select('d1_plan_id')
      .eq('id', planIdSupabase)
      .maybeSingle()
    return data?.d1_plan_id ?? null
  } catch {
    return null
  }
}

export interface PlanD1 {
  id: string
  nom: string
  prix_mensuel: number
  devise?: string
  fonctionnalites?: unknown
  commandes_incluses?: number
}

/**
 * Charge une ligne de plan depuis D1 par son id D1 (pas l'UUID Supabase).
 */
export async function chargerPlanD1(env: Env, idD1: string | null | undefined): Promise<PlanD1 | null> {
  if (!idD1) return null
  try {
    const row = await env.DB
      .prepare('SELECT id, nom, prix_mensuel, devise, fonctionnalites, commandes_incluses FROM plans WHERE id = ? LIMIT 1')
      .bind(idD1)
      .first<PlanD1>()
    return row ?? null
  } catch {
    return null
  }
}

/**
 * Raccourci : UUID Supabase → ligne D1 complète, en une seule fonction.
 */
export async function chargerPlanDepuisIdSupabase(env: Env, planIdSupabase: string | null | undefined): Promise<PlanD1 | null> {
  const idD1 = await resoudreIdD1DepuisPlanSupabase(env, planIdSupabase)
  return chargerPlanD1(env, idD1)
}
