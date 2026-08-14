// src/routes/api-cron.ts — Handler Cron Cloudflare Workers (§1.8)
//
// CORRECTIONS CYCLE-5 :
//   FIX-G — Messages harmonisés avec SLA_ADMIN_HEURES (48h, engagement
//           annoncé au client) / FENETRE_ACCES_HEURES (72h, coupure
//           technique réelle), importés depuis src/lib/paiement.ts.
//   FIX-H — verifierEssaisExpires() : le filtre qui protège un tenant
//           ayant un abonnement 'en_attente_confirmation' encore valide
//           vérifie désormais AUSSI que la deadline n'est pas déjà
//           dépassée (.gt('delai_confirmation_expire_le', nowIso)),
//           cohérent avec la même vérification faite par
//           verifierAccesTenant() (src/lib/acces-tenant.ts). Avant, un
//           tenant dont la fenêtre de 72h était techniquement expirée
//           (mais pas encore traité par bloquerPaiementsExpires, qui ne
//           tourne que toutes les 6h) pouvait être compté comme "protégé"
//           par erreur pendant que verifierAccesTenant() lui refusait déjà
//           l'accès — pas un problème de sécurité (l'accès réel reste
//           strictement déterminé par verifierAccesTenant à chaque
//           requête), mais une incohérence d'affichage/timing à corriger.
//
// NOTE — Pourquoi bloquerPaiementsExpires() reste nécessaire malgré le
// calcul d'accès "live" de verifierAccesTenant() :
//   1. Sans le passage à statut='expire', la ligne resterait visible comme
//      "en attente" dans le panel admin (GET /api/v1/admin/paiements)
//      indéfiniment.
//   2. Sans ce passage, POST /api/v1/paiement/soumettre bloquerait à tort
//      une NOUVELLE soumission avec un 409 "déjà en cours" — CYCLE-5 a
//      corrigé ce cas précis côté /soumettre (filtre .gt() ajouté), donc
//      ce n'est plus un problème bloquant même si le cron a du retard,
//      mais le nettoyage explicite reste la bonne pratique.
//
// AJOUT (fiabilité) — les tâches nocturnes tournent en 4 déclenchements
// cron distincts (voir wrangler.jsonc "crons") pour que chacune ait son
// propre budget de temps et ses propres logs.
//
// Déclenchements (wrangler.jsonc, heures UTC) :
//   "0 2 * * *"    → stats journalières
//   "10 2 * * *"   → vérification essais expirés (essai → inactif)
//   "20 2 * * *"   → capture des screenshots boutique (thum.io → R2)
//   "30 */6 * * *" → blocage paiements en_attente_confirmation expirés

import type { Env } from '../types/database'
import { createSupabaseAdminClient } from '../lib/supabase'
import { capturerScreenshotBoutique } from '../lib/screenshot'
import { notifierBlocageAutomatique } from '../lib/whatsapp'
import { SLA_ADMIN_HEURES, FENETRE_ACCES_HEURES } from '../lib/paiement'
import { envoyerEmailRappelExpiration } from '../lib/brevo'

const MAX_SCREENSHOTS_PAR_EXECUTION = 30

export async function handleScheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
  switch (event.cron) {
    case '0 2 * * *':
      ctx.waitUntil(calculerStatsJournalieres(env, event.scheduledTime))
      break
    case '10 2 * * *':
      ctx.waitUntil(verifierEssaisExpires(env))
      break
    case '20 2 * * *':
      ctx.waitUntil(capturerScreenshotsQuotidiens(env))
      break
    case '30 */6 * * *':
      ctx.waitUntil(bloquerPaiementsExpires(env))
      break
    // [session-3] Nouveaux crons
    case '0 8 * * *':
      ctx.waitUntil(envoyerRappelsExpiration(env, 5))
      break
    case '0 9 * * *':
      ctx.waitUntil(envoyerRappelsExpiration(env, 2))
      break
    case '40 2 * * *':
      ctx.waitUntil(verifierAbonnementsExpires(env))
      break
    default:
      console.warn(`[CRON] Déclenchement non reconnu: ${event.cron}`)
  }
}

async function calculerStatsJournalieres(env: Env, scheduledTime: number): Promise<void> {
  const adminClient = createSupabaseAdminClient(env)

  const date = new Date(scheduledTime)
  date.setUTCDate(date.getUTCDate() - 1)
  const dateStr = date.toISOString().split('T')[0]
  const debutJour = `${dateStr}T00:00:00.000Z`
  const finJour = `${dateStr}T23:59:59.999Z`

  const { data: tenants, error: tenantError } = await adminClient
    .from('tenants')
    .select('id')
    .in('statut', ['actif', 'essai'])
    .is('deleted_at', null)

  if (tenantError || !tenants) {
    console.error('[CRON:stats] Erreur récupération tenants:', tenantError?.message)
    return
  }

  console.log(`[CRON:stats] Calcul stats pour ${tenants.length} tenants — date: ${dateStr}`)

  for (const tenant of tenants) {
    try {
      await calculerStatsUnTenant(adminClient, tenant.id, dateStr, debutJour, finJour)
    } catch (err) {
      console.error(`[CRON:stats] Erreur tenant ${tenant.id}:`, err)
    }
  }

  console.log(`[CRON:stats] Stats journalières ${dateStr} terminées.`)
}

async function calculerStatsUnTenant(
  adminClient: any,
  tenantId: string,
  dateStr: string,
  debutJour: string,
  finJour: string
): Promise<void> {
  const { data: commandes, error: cmdError } = await adminClient
    .from('commandes')
    .select('id, montant_total, frais_livraison, statut')
    .eq('tenant_id', tenantId)
    .gte('created_at', debutJour)
    .lte('created_at', finJour)
    .is('deleted_at', null)

  if (cmdError) throw new Error(`commandes: ${cmdError.message}`)

  const commandesListe = commandes ?? []
  const totalCommandes = commandesListe.length
  const commandesLivrees = commandesListe.filter((c: any) => c.statut === 'livree').length
  const commandesAnnulees = commandesListe.filter((c: any) => c.statut === 'annulee').length
  const chiffreAffaires = commandesListe
    .filter((c: any) => c.statut !== 'annulee')
    .reduce((sum: number, c: any) => sum + (c.montant_total ?? 0), 0)
  const totalFraisLivraison = commandesListe
    .filter((c: any) => c.statut !== 'annulee')
    .reduce((sum: number, c: any) => sum + (c.frais_livraison ?? 0), 0)

  const { data: itemsData } = await adminClient
    .from('commandes')
    .select('items_json')
    .eq('tenant_id', tenantId)
    .gte('created_at', debutJour)
    .lte('created_at', finJour)
    .is('deleted_at', null)
    .neq('statut', 'annulee')

  const produitsCount: Record<string, { nom: string; quantite: number }> = {}
  for (const cmd of (itemsData ?? [])) {
    const items = Array.isArray(cmd.items_json) ? cmd.items_json : []
    for (const item of items) {
      if (!produitsCount[item.produit_id]) {
        produitsCount[item.produit_id] = { nom: item.nom ?? '', quantite: 0 }
      }
      produitsCount[item.produit_id].quantite += item.quantite ?? 1
    }
  }
  const top3Produits = Object.entries(produitsCount)
    .sort(([, a], [, b]) => b.quantite - a.quantite)
    .slice(0, 3)
    .map(([id, { nom, quantite }]) => ({ produit_id: id, nom, quantite }))

  const statsData = {
    tenant_id: tenantId,
    date: dateStr,
    nb_commandes: totalCommandes,
    nb_commandes_livrees: commandesLivrees,
    nb_commandes_annulees: commandesAnnulees,
    chiffre_affaires: chiffreAffaires,
    frais_livraison_total: totalFraisLivraison,
    top_produits: top3Produits,
    updated_at: new Date().toISOString()
  }

  const { error: upsertError } = await adminClient
    .from('stats_journalieres')
    .upsert(statsData, { onConflict: 'tenant_id,date' })

  if (upsertError) throw new Error(`upsert stats: ${upsertError.message}`)
}

// §5 — passage automatique essai → inactif
async function verifierEssaisExpires(env: Env): Promise<void> {
  const adminClient = createSupabaseAdminClient(env)
  const nowIso = new Date().toISOString()

  const { data: essaisExpires, error } = await adminClient
    .from('tenants')
    .select('id, slug')
    .eq('statut', 'essai')
    .lt('essai_expire_le', nowIso)
    .is('deleted_at', null)

  if (error) {
    console.error('[CRON:essais] Erreur récupération essais expirés:', error.message)
    return
  }

  if (!essaisExpires || essaisExpires.length === 0) {
    console.log('[CRON:essais] Aucun essai expiré à traiter.')
    return
  }

  console.log(`[CRON:essais] ${essaisExpires.length} essai(s) expiré(s) à traiter.`)

  for (const tenant of essaisExpires) {
    try {
      // FIX-H — CYCLE-5 : on vérifie maintenant aussi que la deadline de
      // l'abonnement 'en_attente_confirmation' n'est pas déjà dépassée
      // (.gt(...)), cohérent avec verifierAccesTenant(). Un abonnement
      // 'actif' n'a pas cette contrainte de deadline (date_fin gère sa
      // propre expiration, déjà couvert par le .or() ci-dessous).
      const { data: abonnementActif } = await adminClient
        .from('abonnements')
        .select('id, statut')
        .eq('tenant_id', tenant.id)
        .eq('statut', 'actif')
        .or(`date_fin.is.null,date_fin.gt.${nowIso}`)
        .maybeSingle()

      const { data: abonnementEnAttenteValide } = await adminClient
        .from('abonnements')
        .select('id, statut')
        .eq('tenant_id', tenant.id)
        .eq('statut', 'en_attente_confirmation')
        .gt('delai_confirmation_expire_le', nowIso)
        .maybeSingle()

      if (abonnementActif) {
        console.warn(`[CRON:essais] Tenant ${tenant.id} a un abonnement actif mais statut=essai expiré. Mise à jour manquante côté paiement ?`)
        continue
      }
      if (abonnementEnAttenteValide) {
        console.log(`[CRON:essais] Tenant ${tenant.id} a un paiement en attente valide — non bloqué (fenêtre ${FENETRE_ACCES_HEURES}h en cours).`)
        continue
      }

      const { error: updateError } = await adminClient
        .from('tenants')
        .update({ statut: 'inactif', updated_at: nowIso })
        .eq('id', tenant.id)
        .eq('statut', 'essai')

      if (updateError) {
        console.error(`[CRON:essais] Erreur passage inactif tenant ${tenant.id}:`, updateError.message)
        continue
      }

      try {
        if (env.KV_CACHE) {
          await Promise.allSettled([
            env.KV_CACHE.delete(`tenant:${tenant.slug}`),
            env.KV_CACHE.delete('tenants:public:12'),
            env.KV_CACHE.delete('tenants:public:24')
          ])
        }
      } catch {}

      // [session-3] Email notification expiration essai — non-bloquant
      try {
        const { data: ut } = await adminClient
          .from('utilisateurs_tenant')
          .select('auth_user_id')
          .eq('tenant_id', tenant.id)
          .limit(1)
          .maybeSingle()
        if (ut?.auth_user_id) {
          const { data: userAuth } = await adminClient.auth.admin.getUserById(ut.auth_user_id)
          if (userAuth?.user?.email) {
            envoyerEmailRappelExpiration(env, {
              email: userAuth.user.email,
              nom_restaurant: tenant.slug
            }, {
              type: 'essai',
              jours_restants: 0,
              date_expiration_iso: nowIso
            }).catch(() => {})
          }
        }
      } catch {}

      console.log(`[CRON:essais] Tenant ${tenant.id} (${tenant.slug}) passé essai → inactif.`)
    } catch (err) {
      console.error(`[CRON:essais] Erreur traitement tenant ${tenant.id}:`, err)
    }
  }
}

// -----------------------------------------------------------------------
// Blocage automatique des paiements expirés (72h)
// -----------------------------------------------------------------------

/**
 * Bloque automatiquement les paiements 'en_attente_confirmation' dont la
 * deadline de FENETRE_ACCES_HEURES (72h) est dépassée.
 *
 * Pour chaque abonnement expiré :
 * 1. Passe abonnement.statut → 'expire'
 * 2. Passe tenant.statut → 'inactif' (sauf si abonnement actif parallèle)
 * 3. Envoie notification WhatsApp au restaurant
 * 4. Crée notification_restaurant (in-app)
 * 5. Crée notification_admin
 * 6. Invalide cache KV
 *
 * Le cron est idempotent : une double exécution ne crée pas de doublons
 * (le filtre .eq('statut', 'en_attente_confirmation') exclut les déjà traités).
 *
 * NOTE — un tenant en 'en_attente_paiement_initial' n'est jamais démoté
 * ici (le guard .eq('statut', 'essai') plus bas l'exclut) : c'est
 * intentionnel. Ce statut limite déjà l'accès à la seule page Abonnement
 * quelle que soit la deadline (voir verifierAccesTenant()), donc rien à
 * couper de plus — et /soumettre reste ouvert pour une nouvelle tentative.
 */
async function bloquerPaiementsExpires(env: Env): Promise<void> {
  const adminClient = createSupabaseAdminClient(env)
  const nowIso = new Date().toISOString()

  const { data: abonnementsExpires, error } = await adminClient
    .from('abonnements')
    .select('id, tenant_id, plan_id, reference_paiement, delai_confirmation_expire_le')
    .eq('statut', 'en_attente_confirmation')
    .lt('delai_confirmation_expire_le', nowIso)

  if (error) {
    console.error('[CRON:paiements] Erreur récupération paiements expirés:', error.message)
    return
  }

  if (!abonnementsExpires || abonnementsExpires.length === 0) {
    console.log('[CRON:paiements] Aucun paiement en attente expiré.')
    return
  }

  console.log(`[CRON:paiements] ${abonnementsExpires.length} paiement(s) à bloquer (fenêtre ${FENETRE_ACCES_HEURES}h dépassée, SLA annoncé ${SLA_ADMIN_HEURES}h).`)

  for (const abonnement of abonnementsExpires) {
    try {
      const { error: abError } = await adminClient
        .from('abonnements')
        .update({ statut: 'expire', updated_at: nowIso })
        .eq('id', abonnement.id)
        .eq('statut', 'en_attente_confirmation') // Guard idempotence

      if (abError) {
        console.error(`[CRON:paiements] Erreur update abonnement ${abonnement.id}:`, abError.message)
        continue
      }

      const { data: tenant } = await adminClient
        .from('tenants')
        .select('id, slug, nom, statut, whatsapp_number')
        .eq('id', abonnement.tenant_id)
        .is('deleted_at', null)
        .single()

      if (!tenant) continue

      const { data: autreActif } = await adminClient
        .from('abonnements')
        .select('id')
        .eq('tenant_id', abonnement.tenant_id)
        .eq('statut', 'actif')
        .or(`date_fin.is.null,date_fin.gt.${nowIso}`)
        .maybeSingle()

      if (!autreActif) {
        await adminClient
          .from('tenants')
          .update({
            statut: 'inactif',
            paiement_en_attente_depuis: null,
            updated_at: nowIso
          })
          .eq('id', tenant.id)
          .eq('statut', 'essai') // Ne toucher que les tenants en essai (pas actif, pas paiement_initial — voir note ci-dessus)

        if (env.KV_CACHE) {
          try { await env.KV_CACHE.delete(`tenant:${tenant.slug}`) } catch {}
        }
      }

      if (tenant.whatsapp_number) {
        notifierBlocageAutomatique(env, {
          nom: tenant.nom,
          whatsapp_number: tenant.whatsapp_number
        }).catch((err) => {
          console.warn(`[CRON:paiements] WhatsApp non bloquant échoué — tenant: ${tenant.id.slice(0, 8)}...`, err?.message)
        })
      }

      await adminClient
        .from('notifications_restaurant')
        .insert({
          tenant_id: tenant.id,
          type: 'error',
          titre: 'Accès bloqué — délai de vérification dépassé',
          message: `Votre paiement n'a pas été confirmé dans les ${FENETRE_ACCES_HEURES}h. Votre accès est suspendu. Vous pouvez soumettre une nouvelle preuve à tout moment, ou contacter le support.`,
          lien: '/dashboard/abonnement',
          payload: { abonnement_id: abonnement.id }
        })
        .catch(() => {})

      await adminClient
        .from('notifications_admin')
        .insert({
          type: 'error',
          titre: `Paiement bloqué automatiquement — ${tenant.nom}`,
          message: `Le délai de ${FENETRE_ACCES_HEURES}h est dépassé sans confirmation (SLA annoncé : ${SLA_ADMIN_HEURES}h). Tenant passé en inactif.`,
          lien: '#paiements',
          payload: {
            tenant_id: tenant.id,
            abonnement_id: abonnement.id
          }
        })
        .catch(() => {})

      console.log(`[CRON:paiements] Paiement bloqué — tenant: ${tenant.id.slice(0, 8)}...`)
    } catch (err) {
      console.error(`[CRON:paiements] Erreur traitement abonnement ${abonnement.id}:`, err)
    }
  }

  console.log(`[CRON:paiements] Traitement terminé : ${abonnementsExpires.length} paiement(s) traité(s).`)
}

// =====================================================================
// Capture nocturne des screenshots boutique (inchangé)
// =====================================================================
export async function capturerScreenshotsQuotidiens(env: Env): Promise<{ reussies: number; total: number }> {
  if (!env.R2_MEDIA) {
    console.warn('[CRON:screenshots] R2_MEDIA non configuré — capture ignorée.')
    return { reussies: 0, total: 0 }
  }

  const adminClient = createSupabaseAdminClient(env)

  const { data: tousTenants, error } = await adminClient
    .from('tenants')
    .select('id, slug')
    .in('statut', ['actif', 'essai'])
    .is('deleted_at', null)
    .not('logo_url', 'is', null)
    .order('id', { ascending: true })

  if (error || !tousTenants) {
    console.error('[CRON:screenshots] Erreur récupération tenants:', error?.message)
    return { reussies: 0, total: 0 }
  }

  if (tousTenants.length === 0) {
    console.log('[CRON:screenshots] Aucun tenant éligible.')
    return { reussies: 0, total: 0 }
  }

  const nbPaquets = Math.ceil(tousTenants.length / MAX_SCREENSHOTS_PAR_EXECUTION)
  const jourEpoch = Math.floor(Date.now() / 86_400_000)
  const paquetIndex = jourEpoch % nbPaquets
  const debut = paquetIndex * MAX_SCREENSHOTS_PAR_EXECUTION
  const tenants = tousTenants.slice(debut, debut + MAX_SCREENSHOTS_PAR_EXECUTION)

  const baseUrl = env.PUBLIC_BASE_URL ?? 'https://monmenu.app'
  console.log(`[CRON:screenshots] Rotation jour ${jourEpoch} — paquet ${paquetIndex + 1}/${nbPaquets} — ${tenants.length}/${tousTenants.length} tenant(s).`)

  let reussies = 0
  for (const tenant of tenants) {
    try {
      const image = await capturerScreenshotBoutique(env, tenant.slug, baseUrl)
      if (!image) {
        console.warn(`[CRON:screenshots] Screenshot vide pour ${tenant.slug}, ignoré.`)
        continue
      }

      await env.R2_MEDIA.put(`screenshots/${tenant.slug}.jpg`, image, {
        httpMetadata: { contentType: 'image/jpeg' },
        customMetadata: { captured_at: new Date().toISOString() }
      })
      reussies++
    } catch (err) {
      console.error(`[CRON:screenshots] Erreur capture ${tenant.slug}:`, err)
    }
  }

  console.log(`[CRON:screenshots] Terminé : ${reussies}/${tenants.length} capture(s) réussie(s).`)
  return { reussies, total: tenants.length }
}

// ─────────────────────────────────────────────────────────────────────────────
// [session-3] Corr#7 — Rappels expiration J-5 et J-2
// Envoyés à 08h00 UTC (J-5) et 09h00 UTC (J-2)
// ─────────────────────────────────────────────────────────────────────────────
async function envoyerRappelsExpiration(env: Env, joursRestants: number): Promise<void> {
  const adminClient = createSupabaseAdminClient(env)
  const now = new Date()

  // Fenêtre cible : expire exactement dans `joursRestants` jours (±12h)
  const debut = new Date(now)
  debut.setDate(debut.getDate() + joursRestants)
  debut.setHours(0, 0, 0, 0)
  const fin = new Date(debut)
  fin.setHours(23, 59, 59, 999)

  const debutIso = debut.toISOString()
  const finIso = fin.toISOString()

  console.log(`[CRON:rappels] J-${joursRestants} — fenêtre: ${debutIso} → ${finIso}`)

  // 1. Essais expirant dans joursRestants jours
  const { data: essais } = await adminClient
    .from('tenants')
    .select('id, slug, nom, essai_expire_le')
    .eq('statut', 'essai')
    .gte('essai_expire_le', debutIso)
    .lte('essai_expire_le', finIso)
    .is('deleted_at', null)

  // 2. Abonnements actifs expirant dans joursRestants jours
  const { data: abonnements } = await adminClient
    .from('abonnements')
    .select('id, tenant_id, date_fin, tenants!inner(id, slug, nom, statut, deleted_at)')
    .eq('statut', 'actif')
    .gte('date_fin', debutIso)
    .lte('date_fin', finIso)
    .is('tenants.deleted_at', null)

  const traiter = async (tenantId: string, tenantNom: string, type: 'essai' | 'abonnement', dateIso: string, planNom?: string) => {
    try {
      const { data: ut } = await adminClient
        .from('utilisateurs_tenant')
        .select('auth_user_id')
        .eq('tenant_id', tenantId)
        .limit(1)
        .maybeSingle()
      if (!ut?.auth_user_id) return
      const { data: userAuth } = await adminClient.auth.admin.getUserById(ut.auth_user_id)
      if (!userAuth?.user?.email) return
      await envoyerEmailRappelExpiration(env, {
        email: userAuth.user.email,
        nom_restaurant: tenantNom
      }, {
        type,
        jours_restants: joursRestants,
        date_expiration_iso: dateIso,
        plan_nom: planNom
      })
    } catch (err) {
      console.error(`[CRON:rappels] Erreur tenant ${tenantId}:`, err)
    }
  }

  const taches: Promise<void>[] = []

  for (const essai of (essais ?? [])) {
    if (essai.essai_expire_le) {
      taches.push(traiter(essai.id, essai.nom ?? essai.slug, 'essai', essai.essai_expire_le))
    }
  }

  for (const ab of (abonnements ?? [])) {
    const tenant = Array.isArray(ab.tenants) ? ab.tenants[0] : ab.tenants as any
    if (ab.date_fin && tenant?.id) {
      taches.push(traiter(tenant.id, tenant.nom ?? tenant.slug, 'abonnement', ab.date_fin))
    }
  }

  // Traiter en batches de 10 pour éviter de dépasser les limites Workers
  for (let i = 0; i < taches.length; i += 10) {
    await Promise.allSettled(taches.slice(i, i + 10))
  }

  console.log(`[CRON:rappels] J-${joursRestants} terminé — ${taches.length} rappel(s) envoyé(s).`)
}

// ─────────────────────────────────────────────────────────────────────────────
// [session-3] Corr#10a — Vérification abonnements payants expirés (actif → inactif)
// Tourne à 02h40 UTC chaque nuit
// ─────────────────────────────────────────────────────────────────────────────
async function verifierAbonnementsExpires(env: Env): Promise<void> {
  const adminClient = createSupabaseAdminClient(env)
  const nowIso = new Date().toISOString()

  // Trouver les abonnements actifs dont date_fin est dépassée
  const { data: abExpires, error } = await adminClient
    .from('abonnements')
    .select('id, tenant_id, date_fin')
    .eq('statut', 'actif')
    .not('date_fin', 'is', null)
    .lt('date_fin', nowIso)

  if (error) {
    console.error('[CRON:abonnements-expires] Erreur récupération:', error.message)
    return
  }

  if (!abExpires || abExpires.length === 0) {
    console.log('[CRON:abonnements-expires] Aucun abonnement expiré.')
    return
  }

  console.log(`[CRON:abonnements-expires] ${abExpires.length} abonnement(s) expiré(s) à traiter.`)

  for (const ab of abExpires) {
    try {
      // Passer l'abonnement à 'expire'
      await adminClient
        .from('abonnements')
        .update({ statut: 'expire', updated_at: nowIso })
        .eq('id', ab.id)
        .eq('statut', 'actif')

      // Passer le tenant à 'inactif' si toujours 'actif' et aucun autre abonnement actif
      const { data: autreActif } = await adminClient
        .from('abonnements')
        .select('id')
        .eq('tenant_id', ab.tenant_id)
        .eq('statut', 'actif')
        .maybeSingle()

      if (!autreActif) {
        const { data: tenant } = await adminClient
          .from('tenants')
          .update({ statut: 'inactif', updated_at: nowIso })
          .eq('id', ab.tenant_id)
          .eq('statut', 'actif')
          .select('id, slug, nom')
          .maybeSingle()

        if (tenant) {
          // Invalider KV cache
          try {
            if (env.KV_CACHE) {
              await Promise.allSettled([
                env.KV_CACHE.delete(`tenant:${tenant.slug}`),
                env.KV_CACHE.delete('tenants:public:12'),
                env.KV_CACHE.delete('tenants:public:24')
              ])
            }
          } catch {}
          console.log(`[CRON:abonnements-expires] Tenant ${tenant.slug} passé actif → inactif.`)
        }
      }
    } catch (err) {
      console.error(`[CRON:abonnements-expires] Erreur tenant ${ab.tenant_id}:`, err)
    }
  }

  console.log('[CRON:abonnements-expires] Terminé.')
}
