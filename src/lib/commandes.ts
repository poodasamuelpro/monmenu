/**
 * src/lib/commandes.ts — Helpers partagés pour la gestion des commandes (A-08)
 *
 * Ce module factorise la logique commune présente en double dans :
 *   - src/routes/api-commandes.ts  (PATCH /:id/statut — auth app mobile)
 *   - src/routes/api-dashboard.ts  (PATCH /commandes/:id/statut — auth dashboard)
 *
 * Seule la logique identique est factorisée :
 *   1. Validation du statut cible (liste des valeurs autorisées)
 *   2. UPDATE en base avec vérification de la ligne modifiée
 *   3. Insertion dans commandes_historique
 *
 * Ce qui reste dans chaque route (différences légitimes) :
 *   - Auth : verifyAuth vs verifyRestaurantAuth (comportements distincts)
 *   - SELECT initial : champs différents selon le besoin (dashboard enrichi,
 *     commandes minimal)
 *   - Notification WhatsApp livreur : uniquement dans api-dashboard.ts
 */

import type { SupabaseClient } from '@supabase/supabase-js'

// ── Constante partagée ─────────────────────────────────────────────────────
/** Statuts acceptables pour une mise à jour de commande. */
export const STATUTS_COMMANDE_VALIDES = [
  'confirmee',
  'en_preparation',
  'en_livraison',
  'livree',
  'annulee'
] as const

export type StatutCommande = typeof STATUTS_COMMANDE_VALIDES[number]

// ── Types ──────────────────────────────────────────────────────────────────

export interface UpdateStatutParams {
  /** UUID de la commande à mettre à jour */
  commandeId: string
  /** UUID du tenant (filtre IDOR) */
  tenantId: string
  /** Nouveau statut (déjà validé par l'appelant) */
  statut: StatutCommande
  /** Ancien statut (pour commandes_historique) */
  ancienStatut: string
  /** UUID du livreur à assigner (optionnel) */
  livreurId?: string | null
  /** Note libre pour commandes_historique (optionnelle) */
  note?: string | null
  /** Source de la mise à jour ('restaurant' dans les deux routes) */
  source?: string
}

export interface UpdateStatutResult {
  success: boolean
  /** Message d'erreur si success === false */
  error?: string
  /** Code HTTP suggéré (500, 404…) */
  status?: number
}

// ── Helper ─────────────────────────────────────────────────────────────────

/**
 * Effectue le UPDATE + insertion dans commandes_historique.
 *
 * @param adminClient  Client Supabase service-role (bypass RLS).
 *                     Les deux routes utilisent déjà createSupabaseAdminClient
 *                     pour cette étape — comportement identique préservé.
 * @param params       Paramètres de la mise à jour.
 * @returns            { success: true } ou { success: false, error, status }
 */
export async function mettreAJourStatutCommande(
  adminClient: SupabaseClient,
  params: UpdateStatutParams
): Promise<UpdateStatutResult> {
  const {
    commandeId,
    tenantId,
    statut,
    ancienStatut,
    livreurId,
    note,
    source = 'restaurant'
  } = params

  const now = new Date().toISOString()

  const updateData: Record<string, unknown> = { statut, updated_at: now }
  if (livreurId) updateData.livreur_id = livreurId

  const { data: updatedRows, error: updateError } = await adminClient
    .from('commandes')
    .update(updateData)
    .eq('id', commandeId)
    .eq('tenant_id', tenantId)
    .is('deleted_at', null)
    .select('id')

  if (updateError) {
    return { success: false, error: 'Erreur mise à jour statut.', status: 500 }
  }
  if (!updatedRows || updatedRows.length === 0) {
    return { success: false, error: 'Commande introuvable ou non modifiable.', status: 404 }
  }

  // Insertion dans l'historique — non bloquante (erreur ignorée silencieusement
  // pour ne pas faire échouer la mise à jour déjà effectuée).
  try {
    await adminClient
      .from('commandes_historique')
      .insert({
        id: crypto.randomUUID(),
        commande_id: commandeId,
        ancien_statut: ancienStatut,
        nouveau_statut: statut,
        timestamp: now,
        source,
        note: note ?? null
      })
  } catch {
    // Historique non critique — on continue.
  }

  return { success: true }
}
