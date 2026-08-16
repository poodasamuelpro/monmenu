/**
 * src/lib/constants.ts — Constantes partagées de l'application MonMenu
 *
 * A-05 (session-11) — Centralisation des constantes statuts tenant et modes
 * d'accès pour éviter la duplication de chaînes littérales dans toute la
 * codebase. Import depuis ce fichier remplace les magic strings dispersées.
 *
 * Usage :
 *   import { TENANT_STATUT, ABONNEMENT_STATUT } from '../lib/constants'
 *   if (tenant.statut === TENANT_STATUT.ACTIF) { ... }
 */

// ── Statuts d'un tenant (colonne `tenants.statut`) ──────────────────────────
export const TENANT_STATUT = {
  ACTIF: 'actif',
  INACTIF: 'inactif',
  SUSPENDU: 'suspendu',
  ESSAI: 'essai',
  EN_ATTENTE_PAIEMENT_INITIAL: 'en_attente_paiement_initial',
  BLOQUE: 'bloque'
} as const

export type TenantStatut = typeof TENANT_STATUT[keyof typeof TENANT_STATUT]

// ── Statuts d'un abonnement (colonne `abonnements.statut`) ──────────────────
export const ABONNEMENT_STATUT = {
  ACTIF: 'actif',
  EN_ATTENTE_CONFIRMATION: 'en_attente_confirmation',
  EXPIRE: 'expire',
  ANNULE: 'annule',
  REJETE: 'rejete'
} as const

export type AbonnementStatut = typeof ABONNEMENT_STATUT[keyof typeof ABONNEMENT_STATUT]

// ── Statuts d'une commande (colonne `commandes.statut`) ─────────────────────
export const COMMANDE_STATUT = {
  EN_ATTENTE: 'en_attente',
  CONFIRMEE: 'confirmee',
  EN_PREPARATION: 'en_preparation',
  EN_LIVRAISON: 'en_livraison',
  LIVREE: 'livree',
  ANNULEE: 'annulee'
} as const

export type CommandeStatut = typeof COMMANDE_STATUT[keyof typeof COMMANDE_STATUT]

// ── Statuts valides pour PATCH commande (liste utilisée dans les routes) ─────
export const STATUTS_COMMANDE_VALIDES: CommandeStatut[] = [
  COMMANDE_STATUT.CONFIRMEE,
  COMMANDE_STATUT.EN_PREPARATION,
  COMMANDE_STATUT.EN_LIVRAISON,
  COMMANDE_STATUT.LIVREE,
  COMMANDE_STATUT.ANNULEE
]

// ── Statuts tenant donnant accès complet (réutilisable dans les guards) ─────
export const TENANT_STATUTS_ACCES_COMPLET: TenantStatut[] = [
  TENANT_STATUT.ACTIF,
  TENANT_STATUT.ESSAI
]

// ── Statuts tenant permettant l'abonnement (grace + paiement initial) ────────
export const TENANT_STATUTS_ACCES_ABONNEMENT: TenantStatut[] = [
  TENANT_STATUT.ACTIF,
  TENANT_STATUT.ESSAI,
  TENANT_STATUT.EN_ATTENTE_PAIEMENT_INITIAL,
  TENANT_STATUT.INACTIF,
  TENANT_STATUT.BLOQUE
]

// ── Limites et TTL ────────────────────────────────────────────────────────────
export const RATE_LIMIT = {
  COMMANDE_PAR_IP: { max: 10, windowMs: 60_000 },
  PROMO_CHECK_PAR_IP: { max: 20, windowMs: 60_000 },
  EXPORT_CSV_PAR_TENANT: { max: 10, windowMs: 3_600_000 },
  NEWSLETTER_PAR_IP: { max: 3, windowMs: 3_600_000 },
  NEWSLETTER_PAR_EMAIL: { max: 2, windowMs: 86_400_000 },
  ADMIN_SUPPRESS_PAR_IP: { max: 10, windowMs: 3_600_000 }
} as const

export const CACHE_TTL = {
  SITEMAP_SECONDES: 3_600,     // 1h
  BOUTIQUE_SECONDES: 300,      // 5 min
  HOME_SECONDES: 300           // 5 min
} as const
