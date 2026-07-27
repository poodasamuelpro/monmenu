// src/routes/api-cron.ts — Handler Cron Cloudflare Workers (§1.8)
// Déclenché chaque nuit à 02h00 UTC via wrangler.jsonc "crons": ["0 2 * * *"]
// Calcule et stocke les stats journalières dans la table stats_journalieres (Supabase).

import type { Env } from '../types/database'
import { createSupabaseAdminClient } from '../lib/supabase'

// Point d'entrée appelé par Cloudflare Workers Cron
export async function handleScheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
  ctx.waitUntil(calculerStatsJournalieres(env, event.scheduledTime))
}

async function calculerStatsJournalieres(env: Env, scheduledTime: number): Promise<void> {
  const adminClient = createSupabaseAdminClient(env)

  // Date d'hier (le cron tourne à 02h UTC, donc "hier" = jour J-1)
  const date = new Date(scheduledTime)
  date.setUTCDate(date.getUTCDate() - 1)
  const dateStr = date.toISOString().split('T')[0] // YYYY-MM-DD
  const debutJour = `${dateStr}T00:00:00.000Z`
  const finJour = `${dateStr}T23:59:59.999Z`

  // Récupérer tous les tenants actifs
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

  // Pour chaque tenant, calculer ses stats du jour
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
  // Commandes du jour
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

  // Produits les plus commandés
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

  // Upsert : écrase si déjà calculé (en cas de relance)
  const { error: upsertError } = await adminClient
    .from('stats_journalieres')
    .upsert(statsData, { onConflict: 'tenant_id,date' })

  if (upsertError) throw new Error(`upsert stats: ${upsertError.message}`)
}
