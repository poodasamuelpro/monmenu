// API Commandes - Route Cloudflare Worker
// ARCHITECTURE :
//   • D1 (Cloudflare) → SITE WEB uniquement : config_globale, pays, plans
//   • Supabase (PostgreSQL) → APPLICATION : commandes, tenants, produits, codes_promo, etc.
//
// POST /api/v1/commandes - Créer une commande
// GET  /api/v1/commandes/suivi/:token - Suivi commande (public)
// PATCH /api/v1/commandes/:id/statut - Mise à jour statut (AUTH REQUISE via dashboard)
// POST /api/v1/commandes/valider-promo - Vérifier un code promo
//
// FIX (cohérence avec whatsapp.ts) — genererMessageCommande() prend un
// paramètre "origin" (domaine dynamique) au lieu d'utiliser un domaine
// codé en dur. On construit cet origin ici avec new URL(c.req.url).origin,
// exactement comme déjà fait pour le QR code et les médias R2 ailleurs dans
// le code, pour que le lien de suivi WhatsApp pointe toujours vers le bon
// domaine (production, preview *.workers.dev, ou domaine personnalisé).
//
// CONFIRMÉ 2026-07-30 — Ce fichier est déjà compatible avec le nouveau
// gabarit de message (whatsapp.ts) : les deux canaux de notification sont
// câblés correctement pour la commande client → restaurant :
//   1) envoyerNotificationWhatsApp() — API WhatsApp Business officielle,
//      envoyée en arrière-plan via c.executionCtx.waitUntil() (best-effort,
//      ne bloque jamais la réponse HTTP).
//   2) lien_whatsapp — renvoyé dans la réponse JSON, utilisé par boutique.js
//      pour rediriger l'onglet WhatsApp ouvert au clic sur "Confirmer"
//      (garanti fonctionnel à 100%, indépendant de la config de l'API).
// Les liens Maps/Waze apparaissent désormais dans les deux canaux dès lors
// que client_latitude/client_longitude sont fournis — ce qui est maintenant
// garanti côté boutique.js (géolocalisation obligatoire en livraison).
//
// AJOUT (module FCM — push notifications mobile, 10/08) — En complément du
// canal WhatsApp existant, une notification push FCM est envoyée à TOUS
// les devices mobiles enregistrés du tenant (table fcm_tokens) dès qu'une
// nouvelle commande est créée. Best-effort, via c.executionCtx.waitUntil(),
// ne bloque jamais et ne fait jamais échouer la réponse HTTP — mêmes
// garanties que le canal WhatsApp existant. Voir src/lib/fcm.ts.

import { Hono } from 'hono'
import type { Env } from '../types/database'
import {
  CommandeSchema,
  checkRateLimit,
  checkIdempotency,
  storeIdempotency,
  generateTrackingToken,
  setSecurityHeaders
} from '../lib/security'
import {
  genererMessageCommande,
  genererLienWhatsApp,
  envoyerNotificationWhatsApp
} from '../lib/whatsapp'
import { calculerFraisLivraison } from '../lib/delivery'
import { sendEmail } from '../lib/brevo'
import { createSupabaseClient, createSupabaseClientWithToken, createSupabaseAdminClient } from '../lib/supabase'
import { sendFcmToTenant } from '../lib/fcm'

const commandesRouter = new Hono<{ Bindings: Env }>()

// ---- Helper auth dashboard ----
async function verifyRestaurantAuth(c: any): Promise<{ user_id: string; tenant_id: string } | null> {
  const authHeader = c.req.header('Authorization')
  if (!authHeader?.startsWith('Bearer ')) return null
  const token = authHeader.replace('Bearer ', '')
  if (!token || token.length < 20) return null

  try {
    const supabase = createSupabaseClient(c.env)
    const { data: { user }, error } = await supabase.auth.getUser(token)
    if (error || !user) return null

    // SUPABASE — lookup tenant (APPLICATION DATA)
    const supabaseToken = createSupabaseClientWithToken(c.env, token)
    const { data: utData, error: utError } = await supabaseToken
      .from('utilisateurs_tenant')
      .select('tenant_id, tenants!inner(id, statut, deleted_at)')
      .eq('auth_user_id', user.id)
      .is('tenants.deleted_at', null)
      .neq('tenants.statut', 'suspendu')
      .single()

    if (utError || !utData) return null
    return { user_id: user.id, tenant_id: utData.tenant_id }
  } catch { return null }
}

// ---- Helper validation code promo (Supabase) ----
async function validerCodePromo(
  supabase: any,
  tenantId: string,
  code: string,
  sousTotal: number
): Promise<{ valide: boolean; remise: number; message?: string; promo_id?: string }> {
  const { data: promo } = await supabase
    .from('codes_promo')
    .select('id, type, valeur, date_fin, usage_max, usage_actuel, actif')
    .eq('tenant_id', tenantId)
    .eq('code', code.toUpperCase())
    .eq('actif', true)
    .maybeSingle()

  if (!promo) return { valide: false, remise: 0, message: 'Code promo invalide.' }
  if (!promo.actif) return { valide: false, remise: 0, message: 'Code promo désactivé.' }
  if (promo.date_fin && new Date(promo.date_fin) < new Date()) {
    return { valide: false, remise: 0, message: 'Code promo expiré.' }
  }
  if (promo.usage_max !== null && promo.usage_actuel >= promo.usage_max) {
    return { valide: false, remise: 0, message: 'Code promo épuisé.' }
  }

  let remise = 0
  if (promo.type === 'pourcentage') {
    remise = Math.round(sousTotal * (promo.valeur / 100))
  } else if (promo.type === 'montant_fixe') {
    remise = Math.min(promo.valeur, sousTotal)
  }

  return { valide: true, remise, promo_id: promo.id }
}

// POST /api/v1/commandes — Créer une commande
commandesRouter.post('/', async (c) => {
  setSecurityHeaders(c)

  const ip = c.req.header('CF-Connecting-IP') ?? 'unknown'

  // Rate limiting : 10 commandes / minute par IP
  const rateLimit = await checkRateLimit(`commande:${ip}`, 10, 60000)
  if (!rateLimit.allowed) {
    return c.json({ error: 'Trop de requêtes. Veuillez patienter avant de réessayer.' }, 429)
  }

  let body: unknown
  try {
    body = await c.req.json()
  } catch {
    return c.json({ error: 'Corps de requête JSON invalide.' }, 400)
  }

  const parseResult = CommandeSchema.safeParse(body)
  if (!parseResult.success) {
    return c.json(
      { error: 'Données invalides.', details: parseResult.error.flatten().fieldErrors },
      422
    )
  }

  const data = parseResult.data
  const env = c.env

  // Vérification idempotency key
  if (env.KV_CACHE) {
    const idempotencyCheck = await checkIdempotency(data.idempotency_key, env.KV_CACHE)
    if (idempotencyCheck.exists) {
      return c.json(idempotencyCheck.data, 200)
    }
  }

  // SUPABASE — toutes les requêtes sur données applicatives
  const adminClient = createSupabaseAdminClient(env)

  // Vérifier que le tenant existe et est actif (APPLICATION DATA)
  const { data: tenantRow, error: tenantError } = await adminClient
    .from('tenants')
    .select('*')
    .eq('id', data.tenant_id)
    .in('statut', ['actif', 'essai'])
    .is('deleted_at', null)
    .single()

  if (tenantError || !tenantRow) return c.json({ error: 'Restaurant introuvable ou inactif.' }, 404)

  // Vérifier point de vente (APPLICATION DATA)
  const { data: pdvRow, error: pdvError } = await adminClient
    .from('points_de_vente')
    .select('*')
    .eq('id', data.point_de_vente_id)
    .eq('tenant_id', data.tenant_id)
    .eq('actif', true)
    .single()

  if (pdvError || !pdvRow) return c.json({ error: 'Point de vente invalide.' }, 404)

  // Récupérer les produits (APPLICATION DATA)
  const produitIds = data.items.map((i) => i.produit_id)

  const { data: produitsRows, error: prodsError } = await adminClient
    .from('produits')
    .select('*')
    .in('id', produitIds)
    .eq('tenant_id', data.tenant_id)
    .eq('disponible', true)
    .is('deleted_at', null)

  if (prodsError || !produitsRows || produitsRows.length !== produitIds.length) {
    return c.json({ error: 'Un ou plusieurs produits sont indisponibles.' }, 422)
  }

  const produitMap = new Map(produitsRows.map((p: any) => [p.id, p]))

  let sousTotal = 0
  const itemsJson = data.items.map((item) => {
    const produit = produitMap.get(item.produit_id) as any
    const sous_total = produit.prix * item.quantite
    sousTotal += sous_total
    return {
      produit_id: item.produit_id,
      nom: produit.nom,
      prix_unitaire: produit.prix,
      quantite: item.quantite,
      sous_total
    }
  })

  // Valider code promo si fourni (APPLICATION DATA via Supabase)
  let remisePromo = 0
  let promoId: string | undefined
  if (data.code_promo) {
    const promoResult = await validerCodePromo(adminClient, data.tenant_id, data.code_promo, sousTotal)
    if (!promoResult.valide) {
      return c.json({ error: promoResult.message ?? 'Code promo invalide.' }, 422)
    }
    remisePromo = promoResult.remise
    promoId = promoResult.promo_id
  }

  // Calculer les frais de livraison
  let fraisLivraison = 0
  if (data.client_latitude && data.client_longitude && pdvRow.latitude && pdvRow.longitude) {
    const calcul = await calculerFraisLivraison({
      pdvLat: pdvRow.latitude,
      pdvLon: pdvRow.longitude,
      clientLat: data.client_latitude,
      clientLon: data.client_longitude,
      openweatherApiKey: env.OPENWEATHER_API_KEY
    })
    fraisLivraison = calcul.total
  }

  const montantTotal = Math.max(0, sousTotal - remisePromo + fraisLivraison)
  const tokenSuivi = generateTrackingToken()
  const commandeId = crypto.randomUUID()
  const now = new Date().toISOString()

  const metadata = data.code_promo
    ? JSON.stringify({ code_promo: data.code_promo, remise_promo: remisePromo })
    : '{}'

  // SUPABASE — Insérer la commande (APPLICATION DATA)
  const { error: insertError } = await adminClient
    .from('commandes')
    .insert({
      id: commandeId,
      tenant_id: data.tenant_id,
      point_de_vente_id: data.point_de_vente_id,
      client_nom: data.client_nom,
      client_telephone: data.client_telephone,
      client_adresse: data.client_adresse ?? null,
      client_latitude: data.client_latitude ?? null,
      client_longitude: data.client_longitude ?? null,
      items_json: JSON.stringify(itemsJson),
      montant_total: montantTotal,
      frais_livraison: fraisLivraison,
      mode_paiement: data.mode_paiement,
      statut: 'en_attente',
      token_suivi: tokenSuivi,
      idempotency_key: data.idempotency_key,
      notes: data.notes ?? null,
      metadata,
      created_at: now,
      updated_at: now
    })

  if (insertError) {
    return c.json({ error: 'Erreur création commande.', detail: insertError.message }, 500)
  }

  // SUPABASE — Incrémenter usage code promo (async)
  // §1.3 — Incrément atomique via RPC Postgres (évite race condition)
  if (promoId) {
    c.executionCtx.waitUntil(
      adminClient
        .rpc('increment_promo_usage', { promo_id: promoId })
        .then(({ error }: { error: any }) => {
          if (error) {
            // Fallback si la RPC n'existe pas encore : lecture puis update non-atomique
            return adminClient
              .from('codes_promo')
              .select('usage_actuel')
              .eq('id', promoId)
              .single()
              .then(({ data: promoRow }: { data: any }) => {
                if (!promoRow) return
                return adminClient
                  .from('codes_promo')
                  .update({ usage_actuel: (promoRow.usage_actuel ?? 0) + 1 })
                  .eq('id', promoId)
              })
          }
        })
        .catch(() => {})
    )
  }

  // SUPABASE — Historique initial (APPLICATION DATA)
  c.executionCtx.waitUntil(
    adminClient
      .from('commandes_historique')
      .insert({
        id: crypto.randomUUID(),
        commande_id: commandeId,
        ancien_statut: 'en_attente',
        nouveau_statut: 'en_attente',
        timestamp: now,
        source: 'client'
      })
      .then(() => {})
      .catch(() => {})
  )

  const commandeComplete = {
    id: commandeId,
    tenant_id: data.tenant_id,
    client_nom: data.client_nom,
    client_telephone: data.client_telephone,
    client_adresse: data.client_adresse ?? null,
    client_latitude: data.client_latitude ?? null,
    client_longitude: data.client_longitude ?? null,
    items_json: itemsJson,
    montant_total: montantTotal,
    frais_livraison: fraisLivraison,
    mode_paiement: data.mode_paiement,
    statut: 'en_attente',
    token_suivi: tokenSuivi,
    created_at: now
  }

  // §1.9 — WhatsApp notification avec mode livraison / à emporter
  // Origin dynamique passé à genererMessageCommande (voir whatsapp.ts) pour
  // que le lien de suivi + le lien "boutique" en en-tête du message soient
  // toujours corrects, quel que soit le domaine sur lequel tourne le Worker.
  const origin = new URL(c.req.url).origin
  const modeLivraison = (data.mode_livraison ?? 'livraison') as 'livraison' | 'emporter'
  const messageWhatsApp = genererMessageCommande(commandeComplete as any, tenantRow as any, origin, modeLivraison)
  const lienWhatsApp = genererLienWhatsApp(tenantRow.whatsapp_number, messageWhatsApp)

  // Canal 1 — API WhatsApp Business officielle (best-effort, silencieux,
  // ne bloque jamais la réponse HTTP renvoyée au client).
  c.executionCtx.waitUntil(
    envoyerNotificationWhatsApp(tenantRow.whatsapp_number, messageWhatsApp, env)
  )

  // AJOUT — Canal 3 : push FCM à tous les devices mobiles du tenant, en
  // complément du canal WhatsApp ci-dessus. Best-effort, ne bloque jamais
  // la réponse HTTP et ne fait jamais échouer la création de commande
  // même si FCM n'est pas configuré ou si l'envoi échoue (voir
  // fcmConfigure() dans lib/fcm.ts, qui retourne silencieusement si
  // FCM_PROJECT_ID/FCM_CLIENT_EMAIL/FCM_PRIVATE_KEY sont absents).
  c.executionCtx.waitUntil(
    sendFcmToTenant(env, adminClient, data.tenant_id, {
      title: `🛒 Nouvelle commande — ${data.client_nom}`,
      body: `${montantTotal.toLocaleString('fr-FR')} FCFA`,
      data: {
        type: 'commande',
        commandeId: commandeId,
        client: data.client_nom,
        montant: String(montantTotal)
      },
      channelId: 'commandes_channel'
    }).catch(() => {})
  )

  // Canal 2 — lien de redirection wa.me, TOUJOURS renvoyé : c'est lui que
  // boutique.js utilise pour rediriger l'onglet WhatsApp ouvert au clic sur
  // "Confirmer" (garanti fonctionnel indépendamment de la config API).
  const responseData = {
    success: true,
    commande_id: commandeId,
    token_suivi: tokenSuivi,
    montant_total: montantTotal,
    frais_livraison: fraisLivraison,
    remise_promo: remisePromo,
    sous_total: sousTotal,
    lien_whatsapp: lienWhatsApp,
    url_suivi: `/suivi/${tokenSuivi}`
  }

  if (env.KV_CACHE) {
    c.executionCtx.waitUntil(
      storeIdempotency(data.idempotency_key, responseData, env.KV_CACHE)
    )
  }

  return c.json(responseData, 201)
})

// GET /api/v1/commandes/suivi/:token — Suivi public (sans auth)
commandesRouter.get('/suivi/:token', async (c) => {
  setSecurityHeaders(c)
  const token = c.req.param('token')

  if (!token || token.length < 20) {
    return c.json({ error: 'Token invalide.' }, 400)
  }

  // SUPABASE — commande + tenant info (APPLICATION DATA)
  const adminClient = createSupabaseAdminClient(c.env)

  const { data: commande, error: cmdError } = await adminClient
    .from('commandes')
    .select(`
      id, client_nom, items_json, montant_total,
      frais_livraison, mode_paiement, statut,
      token_suivi, notes, metadata, created_at, updated_at,
      tenants!inner(nom, logo_url, couleur_primaire, slug)
    `)
    .eq('token_suivi', token)
    .is('deleted_at', null)
    .single()

  if (cmdError || !commande) return c.json({ error: 'Commande introuvable.' }, 404)

  const tenantInfo = commande.tenants as any

  // SUPABASE — historique (APPLICATION DATA)
  const { data: historique } = await adminClient
    .from('commandes_historique')
    .select('ancien_statut, nouveau_statut, timestamp, source, note')
    .eq('commande_id', commande.id)
    .order('timestamp', { ascending: true })

  // Parser items_json
  let items = []
  try {
    items = typeof commande.items_json === 'string'
      ? JSON.parse(commande.items_json)
      : commande.items_json
  } catch {}

  return c.json({
    commande: {
      ...commande,
      items,
      restaurant_nom: tenantInfo?.nom,
      logo_url: tenantInfo?.logo_url,
      couleur_primaire: tenantInfo?.couleur_primaire,
      restaurant_slug: tenantInfo?.slug,
      tenants: undefined
    },
    historique: historique ?? []
  })
})

// PATCH /api/v1/commandes/:id/statut — Mise à jour statut (AUTH JWT REQUISE)
// NOTE — Cette route est un doublon d'API pour clients externes/API/mobile
// (auth par header Authorization: Bearer uniquement). Le flux normal du
// dashboard web utilise plutôt PATCH /api/v1/dashboard/commandes/:id/statut
// (api-dashboard.ts), qui gère désormais aussi la notification livreur.
commandesRouter.patch('/:id/statut', async (c) => {
  setSecurityHeaders(c)

  const auth = await verifyRestaurantAuth(c)
  if (!auth) return c.json({ error: 'Authentification requise.' }, 401)

  const commandeId = c.req.param('id')
  let body: { statut?: string; livreur_id?: string; note?: string }
  try { body = await c.req.json() } catch { return c.json({ error: 'JSON invalide.' }, 400) }

  const statutsValides = ['confirmee', 'en_preparation', 'en_livraison', 'livree', 'annulee']
  if (!body.statut || !statutsValides.includes(body.statut)) {
    return c.json({ error: 'Statut invalide.' }, 422)
  }

  const adminClient = createSupabaseAdminClient(c.env)

  // SUPABASE — vérifier que la commande appartient au tenant (APPLICATION DATA)
  const { data: commande, error: fetchError } = await adminClient
    .from('commandes')
    .select('id, statut')
    .eq('id', commandeId)
    .eq('tenant_id', auth.tenant_id)
    .is('deleted_at', null)
    .single()

  if (fetchError || !commande) return c.json({ error: 'Commande introuvable.' }, 404)

  const now = new Date().toISOString()

  const updateData: any = { statut: body.statut, updated_at: now }
  if (body.livreur_id) updateData.livreur_id = body.livreur_id

  // SUPABASE — mettre à jour (APPLICATION DATA)
  const { error: updateError } = await adminClient
    .from('commandes')
    .update(updateData)
    .eq('id', commandeId)
    .eq('tenant_id', auth.tenant_id)

  if (updateError) return c.json({ error: 'Erreur mise à jour statut.', detail: updateError.message }, 500)

  // SUPABASE — historique (APPLICATION DATA)
  await adminClient
    .from('commandes_historique')
    .insert({
      id: crypto.randomUUID(),
      commande_id: commandeId,
      ancien_statut: commande.statut,
      nouveau_statut: body.statut,
      timestamp: now,
      source: 'restaurant',
      note: body.note ?? null
    })

  return c.json({ success: true, statut: body.statut })
})

// POST /api/v1/commandes/valider-promo — Vérifier un code promo côté boutique
commandesRouter.post('/valider-promo', async (c) => {
  setSecurityHeaders(c)

  const ip = c.req.header('CF-Connecting-IP') ?? 'unknown'
  const rateLimit = await checkRateLimit(`promo-check:${ip}`, 20, 60000)
  if (!rateLimit.allowed) return c.json({ error: 'Trop de tentatives. Réessayez dans une minute.' }, 429)

  let body: { tenant_id?: string; code?: string; sous_total?: number }
  try { body = await c.req.json() } catch { return c.json({ error: 'JSON invalide.' }, 400) }

  if (!body.tenant_id || !body.code) return c.json({ error: 'tenant_id et code requis.' }, 422)
  const sousTotal = typeof body.sous_total === 'number' ? body.sous_total : 0

  // SUPABASE — vérifier le code promo (APPLICATION DATA)
  const adminClient = createSupabaseAdminClient(c.env)

  const { data: promo, error: promoError } = await adminClient
    .from('codes_promo')
    .select('id, code, type, valeur, date_fin, usage_max, usage_actuel, actif')
    .eq('tenant_id', body.tenant_id)
    .eq('code', body.code.toUpperCase())
    .eq('actif', true)
    .maybeSingle()

  if (promoError || !promo) return c.json({ valide: false, error: 'Code promo invalide ou introuvable.' })
  if (promo.date_fin && new Date(promo.date_fin) < new Date()) {
    return c.json({ valide: false, error: 'Code promo expiré.' })
  }
  if (promo.usage_max !== null && promo.usage_actuel >= promo.usage_max) {
    return c.json({ valide: false, error: "Code promo épuisé (limite d'utilisation atteinte)." })
  }

  let remise = 0
  if (promo.type === 'pourcentage') {
    remise = Math.round(sousTotal * (promo.valeur / 100))
  } else if (promo.type === 'montant_fixe') {
    remise = Math.min(promo.valeur, sousTotal)
  }

  return c.json({
    valide: true,
    code: promo.code,
    type: promo.type,
    valeur: promo.valeur,
    remise
  })
})

export { commandesRouter }
