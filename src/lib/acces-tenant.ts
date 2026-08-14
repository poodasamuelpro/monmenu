// src/lib/acces-tenant.ts
// ─────────────────────────────────────────────────────────────────────────
// CORRECTIF CRITIQUE — la fenêtre de grâce (abonnement en_attente_confirmation
// valide < 72h) est désormais vérifiée AVANT toute décision liée au statut
// tenant, y compris pour 'en_attente_paiement_initial'. C'était le bug
// racine empêchant l'accès au dashboard juste après la soumission du tout
// premier paiement d'un nouveau compte : la branche 'en_attente_paiement_initial'
// retournait avant d'avoir eu la chance de voir l'abonnement fraîchement
// soumis.
//
// NOUVEAU CONTRAT — deux niveaux d'accès distincts, plus un statut
// explicite pour les comptes suspendus (qui eux restent un vrai mur, non
// contournable par un paiement) :
//
//   accesComplet         → dashboard entier (commandes, menu, stats...)
//   accesAbonnementSeul   → uniquement /dashboard/abonnement (page ET API
//                          /api/v1/paiement/*) : consulter le statut,
//                          l'historique, ET soumettre une nouvelle preuve.
//
// RÈGLES MÉTIER (ordre de priorité réel, appliqué dans le code) :
//   1. tenant.statut = 'actif'                      → accesComplet
//   2. tenant.statut = 'essai' (non expiré)          → accesComplet
//   3. tenant.statut = 'suspendu'                    → AUCUN accès (mur dur,
//      nécessite une action admin explicite — jamais contournable par un
//      simple paiement)
//   4. Abonnement 'en_attente_confirmation' valide (< 72h) existe → accesComplet
//      (fenêtre de grâce, quel que soit le statut tenant par ailleurs —
//      y compris 'en_attente_paiement_initial' pour un tout premier paiement,
//      et y compris 'inactif')
//   5. tenant.statut = 'en_attente_paiement_initial', SANS fenêtre de grâce
//      valide → accesAbonnementSeul (jamais payé — doit soumettre sa 1ère preuve)
//   6. tenant.statut = 'inactif' (ou autre statut non reconnu), SANS
//      fenêtre de grâce valide → accesAbonnementSeul (peut revoir son
//      statut et soumettre un NOUVEAU paiement à tout moment)
//
// Les routes /api/v1/paiement/* (src/routes/api-paiement.ts) doivent
// accepter accesComplet OU accesAbonnementSeul. Seul le mode 'suspendu'
// (ou 'introuvable') les bloque.
// Les routes /api/v1/dashboard/* (src/routes/api-dashboard.ts, sauf
// /profil) exigent accesComplet strictement.
// Le middleware de page /dashboard/* (src/index.ts) redirige vers
// /dashboard/abonnement si accesAbonnementSeul, vers
// /dashboard/compte-inactif si ni l'un ni l'autre.
// ─────────────────────────────────────────────────────────────────────────

import { createSupabaseAdminClient } from './supabase'
import type { Env } from '../types/database'

export type ModeAcces =
  | 'actif'
  | 'essai'
  | 'paiement_initial'     // jamais payé — limité à la page/API abonnement
  | 'grace_confirmation'   // accès complet, fenêtre 72h en cours
  | 'bloque'                // inactif, récupérable en soumettant un paiement
  | 'suspendu'              // bloqué dur par un admin, non récupérable seul
  | 'introuvable'           // tenant supprimé/inexistant

export interface ResultatAcces {
  accesComplet: boolean
  accesAbonnementSeul: boolean
  mode: ModeAcces
  tenant_statut: string | null
  abonnement_en_attente_id?: string
  delai_confirmation_expire_le?: string
}

export async function verifierAccesTenant(env: Env, tenantId: string): Promise<ResultatAcces> {
  const adminClient = createSupabaseAdminClient(env)

  const { data: tenant } = await adminClient
    .from('tenants')
    .select('statut, deleted_at, essai_expire_le')
    .eq('id', tenantId)
    .is('deleted_at', null)
    .maybeSingle()

  if (!tenant) {
    return { accesComplet: false, accesAbonnementSeul: false, mode: 'introuvable', tenant_statut: null }
  }

  if (tenant.statut === 'actif') {
    return { accesComplet: true, accesAbonnementSeul: false, mode: 'actif', tenant_statut: tenant.statut }
  }

  if (tenant.statut === 'essai') {
    // Corr#10b — vérification date real-time : le cron peut avoir du retard.
    // Si essai_expire_le est passé, l'accès est bloqué immédiatement.
    if (tenant.essai_expire_le && new Date(tenant.essai_expire_le) < new Date()) {
      // Pas de fenêtre de grâce pour un essai expiré : chute directe en bloqué
      // (le cron le passera en 'inactif' d'ici la prochaine exécution).
      // On ne retourne PAS ici : on laisse la vérification abonnement se
      // faire normalement en dessous (règle 4 du contrat métier en tête de fichier).
    } else {
      return { accesComplet: true, accesAbonnementSeul: false, mode: 'essai', tenant_statut: tenant.statut }
    }
  }

  if (tenant.statut === 'suspendu') {
    return { accesComplet: false, accesAbonnementSeul: false, mode: 'suspendu', tenant_statut: tenant.statut }
  }

  // CORRECTIF — cette vérification de la fenêtre de grâce de 72h est
  // désormais faite AVANT de statuer sur 'en_attente_paiement_initial' ou
  // 'inactif' (ou tout autre statut non reconnu) : un abonnement
  // 'en_attente_confirmation' valide donne accesComplet immédiatement après
  // la soumission d'une preuve, même pour un tout premier paiement.
  const { data: abonnementAttente } = await adminClient
    .from('abonnements')
    .select('id, delai_confirmation_expire_le')
    .eq('tenant_id', tenantId)
    .eq('statut', 'en_attente_confirmation')
    .gt('delai_confirmation_expire_le', new Date().toISOString())
    .order('created_at', { ascending: false })
    .maybeSingle()

  if (abonnementAttente) {
    return {
      accesComplet: true,
      accesAbonnementSeul: false,
      mode: 'grace_confirmation',
      tenant_statut: tenant.statut,
      abonnement_en_attente_id: abonnementAttente.id,
      delai_confirmation_expire_le: abonnementAttente.delai_confirmation_expire_le
    }
  }

  if (tenant.statut === 'en_attente_paiement_initial') {
    return { accesComplet: false, accesAbonnementSeul: true, mode: 'paiement_initial', tenant_statut: tenant.statut }
  }

  // Ici : 'inactif' ou tout autre statut non reconnu, sans fenêtre de grâce
  // valide — le tenant garde le droit de consulter /dashboard/abonnement et
  // de soumettre un nouveau paiement à tout moment.
  return { accesComplet: false, accesAbonnementSeul: true, mode: 'bloque', tenant_statut: tenant.statut }
}