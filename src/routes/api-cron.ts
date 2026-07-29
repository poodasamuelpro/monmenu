
// src/routes/api-cron.ts — Handler Cron Cloudflare Workers (§1.8)
// Déclenché chaque nuit à 02h00 UTC via wrangler.jsonc "crons": ["0 2 * * *"]
// 1. Calcule et stocke les stats journalières dans stats_journalieres.
// 2. AJOUT — vérifie les essais expirés et passe les tenants concernés
//    de 'essai' à 'inactif' (voir verifierEssaisExpires ci-dessous).

import type { Env } from '../types/database'
import { createSupabaseAdminClient } from '../lib/supabase'

// Point d'entrée appelé par Cloudflare Workers Cron
export async function handleScheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
  ctx.waitUntil(calculerStatsJournalieres(env, event.scheduledTime))
  ctx.waitUntil(verifierEssaisExpires(env))
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
    console.error('[CRON] Erreur récupération tenants:', tenantError?.message)
    return
  }

  console.log(`[CRON] Calcul stats pour ${tenants.length} tenants — date: ${dateStr}`)

  for (const tenant of tenants) {
    try {
      await calculerStatsUnTenant(adminClient, tenant.id, dateStr, debutJour, finJour)
    } catch (err) {
      console.error(`[CRON] Erreur tenant ${tenant.id}:`, err)
    }
  }

  console.log(`[CRON] Stats journalières ${dateStr} terminées.`)
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

// =====================================================================
// AJOUT — §5 : passage automatique essai → inactif
// Pour chaque tenant en essai dont essai_expire_le est dépassée :
//   - si un abonnement 'actif' existe déjà (paiement confirmé mais le
//     statut tenant n'a pas encore été mis à jour) → on log un warning
//     et on ne touche à rien (filet de sécurité, cas censé être rare).
//   - sinon → passage à 'inactif' + invalidation du cache KV.
// =====================================================================
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
    console.error('[CRON] Erreur récupération essais expirés:', error.message)
    return
  }

  if (!essaisExpires || essaisExpires.length === 0) {
    console.log('[CRON] Aucun essai expiré à traiter.')
    return
  }

  console.log(`[CRON] ${essaisExpires.length} essai(s) expiré(s) à traiter.`)

  for (const tenant of essaisExpires) {
    try {
      const { data: abonnementActif } = await adminClient
        .from('abonnements')
        .select('id')
        .eq('tenant_id', tenant.id)
        .eq('statut', 'actif')
        .or(`date_fin.is.null,date_fin.gt.${nowIso}`)
        .maybeSingle()

      if (abonnementActif) {
        console.warn(`[CRON] Tenant ${tenant.id} a un abonnement actif mais statut=essai expiré. Update manquant côté paiement ?`)
        continue
      }

      const { error: updateError } = await adminClient
        .from('tenants')
        .update({ statut: 'inactif', updated_at: nowIso })
        .eq('id', tenant.id)
        .eq('statut', 'essai') // ne pas écraser si changé entre-temps

      if (updateError) {
        console.error(`[CRON] Erreur passage inactif tenant ${tenant.id}:`, updateError.message)
        continue
      }

      try { if (env.KV_CACHE) await env.KV_CACHE.delete(`tenant:${tenant.slug}`) } catch {}

      console.log(`[CRON] Tenant ${tenant.id} (${tenant.slug}) passé essai → inactif.`)
    } catch (err) {
      console.error(`[CRON] Erreur traitement tenant ${tenant.id}:`, err)
    }
  }
}
