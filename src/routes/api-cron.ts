// src/routes/api-cron.ts — Handler Cron Cloudflare Workers (§1.8)
//
// AJOUT (fiabilité) — les 3 tâches nocturnes tournaient auparavant dans
// la même invocation via ctx.waitUntil(). Séparées en 3 déclenchements
// cron distincts (voir wrangler.jsonc "crons") pour que chacune ait son
// propre budget de temps et ses propres logs — une tâche lente ou en
// échec n'affecte plus les deux autres, et si Cloudflare interrompt une
// exécution on sait immédiatement laquelle (event.cron identifie le
// déclencheur exact qui a démarré l'invocation).
//
// Déclenchements (wrangler.jsonc, heures UTC) :
//   "0 2 * * *"  → stats journalières
//   "10 2 * * *" → vérification essais expirés (essai → inactif)
//   "20 2 * * *" → capture des screenshots boutique (thum.io → R2)

import type { Env } from '../types/database'
import { createSupabaseAdminClient } from '../lib/supabase'
import { capturerScreenshotBoutique } from '../lib/screenshot'

// Plafond de sécurité : borne la durée max de l'exécution de capture
// ET protège le quota de l'API de capture (thum.io), même si le nombre
// de restaurants actifs grandit beaucoup. Au-delà de ce nombre, les
// tenants excédentaires ne sont pas ignorés définitivement : voir la
// rotation par paquets plus bas (capturerScreenshotsQuotidiens).
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
      const { data: abonnementActif } = await adminClient
        .from('abonnements')
        .select('id')
        .eq('tenant_id', tenant.id)
        .eq('statut', 'actif')
        .or(`date_fin.is.null,date_fin.gt.${nowIso}`)
        .maybeSingle()

      if (abonnementActif) {
        console.warn(`[CRON:essais] Tenant ${tenant.id} a un abonnement actif mais statut=essai expiré. Update manquant côté paiement ?`)
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

      try { if (env.KV_CACHE) await env.KV_CACHE.delete(`tenant:${tenant.slug}`) } catch {}

      console.log(`[CRON:essais] Tenant ${tenant.id} (${tenant.slug}) passé essai → inactif.`)
    } catch (err) {
      console.error(`[CRON:essais] Erreur traitement tenant ${tenant.id}:`, err)
    }
  }
}

// =====================================================================
// AJOUT — Capture nocturne des screenshots boutique (format mobile),
// via thum.io (lib/screenshot.ts). Un screenshot par tenant actif/essai
// avec logo, stocké dans R2 sous screenshots/{slug}.jpg. Consommé par
// GET /api/v1/screenshots/:slug (api-screenshots.ts) et affiché dans le
// carrousel iPhone de la page d'accueil (home.ts).
//
// AJOUT (rotation) — plafonné à MAX_SCREENSHOTS_PAR_EXECUTION (30) pour
// borner la durée ET préserver le quota de l'API de capture. Si le
// nombre de restaurants éligibles dépasse ce plafond, on ne prend plus
// toujours les mêmes : la liste complète est découpée en paquets de 30
// (ordre stable par "id"), et chaque nuit on avance d'un paquet, en
// bouclant automatiquement une fois le dernier atteint. Aucun état à
// stocker : le numéro du jour (depuis l'epoch) modulo le nombre de
// paquets détermine seul quel paquet est traité ce soir.
// =====================================================================
async function capturerScreenshotsQuotidiens(env: Env): Promise<void> {
  if (!env.R2_MEDIA) {
    console.warn('[CRON:screenshots] R2_MEDIA non configuré — capture ignorée.')
    return
  }

  const adminClient = createSupabaseAdminClient(env)

  // Requête légère (id + slug seulement) sur TOUS les tenants éligibles,
  // pas seulement les 30 premiers : la rotation a besoin du total pour
  // savoir sur combien de paquets répartir.
  const { data: tousTenants, error } = await adminClient
    .from('tenants')
    .select('id, slug')
    .in('statut', ['actif', 'essai'])
    .is('deleted_at', null)
    .not('logo_url', 'is', null)
    .order('id', { ascending: true }) // ordre stable, indispensable pour une rotation cohérente d'une nuit à l'autre

  if (error || !tousTenants) {
    console.error('[CRON:screenshots] Erreur récupération tenants:', error?.message)
    return
  }

  if (tousTenants.length === 0) {
    console.log('[CRON:screenshots] Aucun tenant éligible.')
    return
  }

  const nbPaquets = Math.ceil(tousTenants.length / MAX_SCREENSHOTS_PAR_EXECUTION)
  const jourEpoch = Math.floor(Date.now() / 86_400_000) // jour absolu, stable pour toute la journée
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
}
