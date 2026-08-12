// src/lib/plans.ts 
// ─────────────────────────────────────────────────────────────────────────
// MIGRATION — Supabase `plans` est désormais l'UNIQUE source de vérité
// pour les plans (nom, prix, fonctionnalités). D1 n'est plus consulté nulle
// part dans le code applicatif pour les plans.
//
// Le même UUID Supabase circule maintenant partout sans transformation :
//   - tenants.plan_id
//   - tenants.plan_initial_id
//   - abonnements.plan_id
//   - le `plan_id` envoyé par tous les formulaires front (inscription,
//     soumission de preuve de paiement, changement de plan)
//
// Toutes les anciennes fonctions de résolution D1 ↔ Supabase
// (resoudreIdD1DepuisPlanSupabase, resoudreIdSupabaseDepuisPlanD1,
// chargerPlanD1, chargerPlanDepuisIdSupabase) sont supprimées — il n'y a
// plus qu'un seul id à gérer, donc plus aucune résolution n'est nécessaire.
//
// D1 conserve son rôle pour `config_globale` et `pays` (site web
// uniquement) — ce module ne les concerne pas.
// ─────────────────────────────────────────────────────────────────────────

import { createSupabaseAdminClient } from './supabase'
import type { Env } from '../types/database'

export interface PlanSupabase {
  id: string
  nom: string
  description?: string | null
  prix_mensuel: number
  prix_annuel?: number
  devise?: string
  fonctionnalites?: unknown
  commandes_incluses?: number
  limite_pdv?: number
  frais_par_commande?: number
}

/**
 * Charge un plan Supabase par son UUID natif (colonne `id`).
 * Retourne null si planId est vide, invalide, ou introuvable.
 */
export async function chargerPlan(env: Env, planId: string | null | undefined): Promise<PlanSupabase | null> {
  if (!planId) return null
  try {
    const adminClient = createSupabaseAdminClient(env)
    const { data, error } = await adminClient
      .from('plans')
      .select('id, nom, description, prix_mensuel, prix_annuel, devise, fonctionnalites, commandes_incluses, limite_pdv, frais_par_commande')
      .eq('id', planId)
      .maybeSingle()
    if (error) {
      console.error('[Plans] Erreur chargement plan:', error.message)
      return null
    }
    return data ?? null
  } catch (err) {
    console.error('[Plans] Exception chargement plan:', err instanceof Error ? err.message : err)
    return null
  }
}

/**
 * Charge le plan gratuit par défaut (nom = 'Gratuit', actif).
 * Utilisé par la route legacy api-tenants.ts POST / uniquement.
 */
export async function chargerPlanGratuit(env: Env): Promise<PlanSupabase | null> {
  try {
    const adminClient = createSupabaseAdminClient(env)
    const { data, error } = await adminClient
      .from('plans')
      .select('id, nom, prix_mensuel')
      .eq('nom', 'Gratuit')
      .eq('actif', true)
      .maybeSingle()
    if (error) {
      console.error('[Plans] Erreur chargement plan gratuit:', error.message)
      return null
    }
    return data ?? null
  } catch {
    return null
  }
}
