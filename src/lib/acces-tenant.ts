// src/lib/acces-tenant.ts
// ─────────────────────────────────────────────────────────────────────────
// LOGIQUE UNIQUE ET UNIFIÉE de résolution d'accès au dashboard.
// Utilisée par :
//   - src/index.ts                 (middleware de rendu /dashboard/*)
//   - src/routes/api-dashboard.ts  (verifyAuth — API du dashboard restaurant)
//   - src/routes/api-paiement.ts   (verifyAuthPaiement — API paiement)
//
// AVANT cette correction, ces 3 endroits avaient CHACUN leur propre logique,
// légèrement différente → incohérences (ex: accès complet autorisé sur
// /api/v1/paiement/* pendant la fenêtre de 72h, mais refusé sur
// /api/v1/dashboard/* pendant cette même fenêtre).
//
// RÈGLES MÉTIER (source unique de vérité) :
//   1. tenant.statut = 'actif'                        → accès complet.
//   2. tenant.statut = 'essai'                         → accès complet
//      (le cron gère la bascule actif/inactif à J+14, mais l'accès réel
//      est de toute façon revérifié en direct ici, donc aucune dépendance
//      de timing avec le cron n'est nécessaire pour la SÉCURITÉ de l'accès).
//   3. tenant.statut = 'en_attente_paiement_initial'   → accès LIMITÉ,
//      uniquement à la page/API de soumission de preuve (mode
//      'paiement_initial'). Le tenant n'a encore jamais payé.
//   4. Il existe un abonnement avec statut='en_attente_confirmation' ET
//      delai_confirmation_expire_le > maintenant → accès COMPLET maintenu
//      (mode 'grace_confirmation'), quel que soit le statut du tenant par
//      ailleurs (y compris un essai déjà expiré). C'est la fenêtre de 72h.
//      → L'admin dispose de 48h annoncées au client (SLA), mais la coupure
//        technique réelle se fait à 72h (calculerDeadlineConfirmation()).
//   5. Sinon → accès bloqué (mode 'bloque').
//
// IMPORTANT — pourquoi un rejet admin coupe l'accès IMMÉDIATEMENT :
//   Cette fonction ne considère QUE les abonnements dont le statut est
//   ENCORE 'en_attente_confirmation'. Dès que l'admin confirme ou rejette
//   (api-admin-paiements.ts DOIT changer le statut de l'abonnement en
//   'actif' ou 'rejete'/'annule' à ce moment-là), cette fonction cesse de
//   trouver un abonnement en attente valide → l'accès est réévalué à la
//   requête suivante, sans dépendre du cron. Le cron ne sert donc plus qu'à
//   la notification/nettoyage à l'expiration des 72h, pas à la sécurité
//   d'accès elle-même.
// ─────────────────────────────────────────────────────────────────────────

import { createSupabaseAdminClient } from './supabase'
import type { Env } from '../types/database'

export type ModeAcces =
  | 'actif'
  | 'essai'
  | 'paiement_initial'     // limité à la soumission de preuve
  | 'grace_confirmation'   // accès complet, fenêtre 72h en cours
  | 'bloque'

export interface ResultatAcces {
  acces: boolean
  mode: ModeAcces
  tenant_statut: string | null
  // Rempli uniquement si mode === 'grace_confirmation'
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
    return { acces: false, mode: 'bloque', tenant_statut: null }
  }

  if (tenant.statut === 'actif') {
    return { acces: true, mode: 'actif', tenant_statut: tenant.statut }
  }

  if (tenant.statut === 'essai') {
    return { acces: true, mode: 'essai', tenant_statut: tenant.statut }
  }

  if (tenant.statut === 'en_attente_paiement_initial') {
    return { acces: true, mode: 'paiement_initial', tenant_statut: tenant.statut }
  }

  // Tout autre statut ('inactif', 'suspendu', ou futur statut inconnu) :
  // vérifier s'il existe une fenêtre de grâce de 72h en cours.
  // 'suspendu' reste volontairement exclu de la grâce : un compte suspendu
  // par un admin ne doit jamais être réactivé automatiquement par une
  // simple preuve de paiement en attente.
  if (tenant.statut === 'suspendu') {
    return { acces: false, mode: 'bloque', tenant_statut: tenant.statut }
  }

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
      acces: true,
      mode: 'grace_confirmation',
      tenant_statut: tenant.statut,
      abonnement_en_attente_id: abonnementAttente.id,
      delai_confirmation_expire_le: abonnementAttente.delai_confirmation_expire_le
    }
  }

  return { acces: false, mode: 'bloque', tenant_statut: tenant.statut }
}
