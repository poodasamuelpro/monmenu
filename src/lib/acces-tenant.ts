// src/lib/acces-tenant.ts
// ─────────────────────────────────────────────────────────────────────────
// CYCLE-6 — REFONTE : le contrat de cette fonction change.
//
// BUG TROUVÉ (le vrai responsable de "session expirée" affiché en boucle
// sur /dashboard/abonnement) : la version CYCLE-4 renvoyait un simple
// booléen `acces`, utilisé TEL QUEL par verifyAuthPaiement() (paiement) et
// verifyAuth() (dashboard complet) pour la MÊME décision. Résultat : un
// tenant 'inactif' (essai expiré, jamais payé, aucun abonnement en attente)
// se voyait refuser jusqu'aux routes /api/v1/paiement/* — alors que ce sont
// PRÉCISÉMENT les routes qui doivent lui permettre de sortir du blocage en
// soumettant un paiement. Un tenant bloqué ne pouvait donc plus jamais
// revoir le détail de son abonnement ni payer : verrouillage définitif
// (déjà repéré comme "Bug 2" dans l'audit initial, mais seule la
// redirection de PAGE avait été corrigée, pas l'accès à l'API elle-même).
//
// NOUVEAU CONTRAT — deux niveaux d'accès distincts, plus un statut
// explicite pour les comptes suspendus (qui eux restent un vrai mur, non
// contournable par un paiement) :
//
//   accesComplet        → dashboard entier (commandes, menu, stats...)
//   accesAbonnementSeul  → uniquement /dashboard/abonnement (page ET API
//                          /api/v1/paiement/*) : consulter le statut,
//                          l'historique, ET soumettre une nouvelle preuve.
//
// RÈGLES MÉTIER :
//   1. tenant.statut = 'actif'                      → accesComplet
//   2. tenant.statut = 'essai' (non expiré)          → accesComplet
//   3. tenant.statut = 'en_attente_paiement_initial' → accesAbonnementSeul
//      (jamais payé — doit soumettre sa 1ère preuve)
//   4. Abonnement 'en_attente_confirmation' valide (< 72h) existe          → accesComplet
//      (fenêtre de grâce, quel que soit le statut tenant par ailleurs,
//      SAUF 'suspendu' — voir règle 6)
//   5. tenant.statut = 'inactif' (ou autre statut non reconnu), SANS
//      fenêtre de grâce valide → accesAbonnementSeul (peut revoir son
//      statut et soumettre un NOUVEAU paiement à tout moment — c'est le
//      seul moyen de sortir de cet état)
//   6. tenant.statut = 'suspendu' → AUCUN accès, ni complet ni abonnement.
//      Un blocage manuel par un admin n'est jamais contournable par un
//      simple paiement — nécessite une action admin explicite.
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
    .select('statut, deleted_at')
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
    return { accesComplet: true, accesAbonnementSeul: false, mode: 'essai', tenant_statut: tenant.statut }
  }

  if (tenant.statut === 'en_attente_paiement_initial') {
    return { accesComplet: false, accesAbonnementSeul: true, mode: 'paiement_initial', tenant_statut: tenant.statut }
  }

  if (tenant.statut === 'suspendu') {
    return { accesComplet: false, accesAbonnementSeul: false, mode: 'suspendu', tenant_statut: tenant.statut }
  }

  // Ici : 'inactif' ou tout autre statut non reconnu — vérifier la fenêtre
  // de grâce de 72h AVANT de conclure au blocage simple.
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

  // CYCLE-6 : plus de blocage total ici. Un tenant inactif garde le droit
  // de consulter /dashboard/abonnement et de soumettre un nouveau paiement.
  return { accesComplet: false, accesAbonnementSeul: true, mode: 'bloque', tenant_statut: tenant.statut }
}
