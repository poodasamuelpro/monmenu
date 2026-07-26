// API Commandes - Route Cloudflare Worker
// POST /api/v1/commandes - Créer une commande
// GET  /api/v1/commandes/suivi/:token - Suivi commande (public)
// PATCH /api/v1/commandes/:id/statut - Mise à jour statut (AUTH REQUISE via dashboard)

import { Hono } from 'hono'
import type { Env, Commande, Produit, Tenant, PointDeVente } from '../types/database'
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
import { createSupabaseClient } from '../lib/supabase'

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

    const tenant = await c.env.DB
      .prepare(`
        SELECT t.id FROM utilisateurs_tenant ut
        JOIN tenants t ON t.id = ut.tenant_id
        WHERE ut.auth_user_id = ? AND t.deleted_at IS NULL AND t.statut != 'suspendu'
        LIMIT 1
      `)
      .bind(user.id).first<{ id: string }>()

    if (!tenant) return null
    return { user_id: user.id, tenant_id: tenant.id }
  } catch { return null }
}

// ---- Helper validation code promo ----
async function validerCodePromo(
  db: D1Database,
  tenantId: string,
  code: string,
  sousTotal: number
): Promise<{ valide: boolean; remise: number; message?: string; promo_id?: string }> {
  const promo = await db.prepare(`
    SELECT id, type, valeur, date_fin, usage_max, usage_actuel, actif
    FROM codes_promo
    WHERE tenant_id = ? AND code = ? AND actif = 1
  `).bind(tenantId, code.toUpperCase()).first<any>()

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

  // Vérification idempotency key (optionnel)
  if (env.KV_CACHE) {
    const idempotencyCheck = await checkIdempotency(data.idempotency_key, env.KV_CACHE)
    if (idempotencyCheck.exists) {
      return c.json(idempotencyCheck.data, 200)
    }
  }

  // Vérifier que le tenant existe et est actif
  const tenantRow = await env.DB
    .prepare('SELECT * FROM tenants WHERE id = ? AND statut IN (\'actif\', \'essai\') AND deleted_at IS NULL')
    .bind(data.tenant_id)
    .first<Tenant>()

  if (!tenantRow) return c.json({ error: 'Restaurant introuvable ou inactif.' }, 404)

  // Vérifier point de vente
  const pdvRow = await env.DB
    .prepare('SELECT * FROM points_de_vente WHERE id = ? AND tenant_id = ? AND actif = 1')
    .bind(data.point_de_vente_id, data.tenant_id)
    .first<PointDeVente>()

  if (!pdvRow) return c.json({ error: 'Point de vente invalide.' }, 404)

  // Récupérer les produits + calculer le total
  const produitIds = data.items.map((i) => i.produit_id)
  const placeholders = produitIds.map(() => '?').join(',')
  const produitsRows = await env.DB
    .prepare(`SELECT * FROM produits WHERE id IN (${placeholders}) AND tenant_id = ? AND disponible = 1`)
    .bind(...produitIds, data.tenant_id)
    .all<Produit>()

  if (produitsRows.results.length !== produitIds.length) {
    return c.json({ error: 'Un ou plusieurs produits sont indisponibles.' }, 422)
  }

  const produitMap = new Map(produitsRows.results.map((p) => [p.id, p]))

  let sousTotal = 0
  const itemsJson = data.items.map((item) => {
    const produit = produitMap.get(item.produit_id)!
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

  // Valider code promo si fourni
  let remisePromo = 0
  let promoId: string | undefined
  if (data.code_promo) {
    const promoResult = await validerCodePromo(env.DB, data.tenant_id, data.code_promo, sousTotal)
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

  // Insérer la commande
  const metadata = data.code_promo
    ? JSON.stringify({ code_promo: data.code_promo, remise_promo: remisePromo })
    : '{}'

  await env.DB.prepare(`
    INSERT INTO commandes (
      id, tenant_id, point_de_vente_id, client_nom, client_telephone,
      client_adresse, client_latitude, client_longitude, items_json,
      montant_total, frais_livraison, mode_paiement, statut,
      token_suivi, idempotency_key, notes, metadata, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'en_attente', ?, ?, ?, ?, ?, ?)
  `)
    .bind(
      commandeId,
      data.tenant_id,
      data.point_de_vente_id,
      data.client_nom,
      data.client_telephone,
      data.client_adresse ?? null,
      data.client_latitude ?? null,
      data.client_longitude ?? null,
      JSON.stringify(itemsJson),
      montantTotal,
      fraisLivraison,
      data.mode_paiement,
      tokenSuivi,
      data.idempotency_key,
      data.notes ?? null,
      metadata,
      now, now
    )
    .run()

  // Incrémenter usage code promo (async)
  if (promoId) {
    c.executionCtx.waitUntil(
      env.DB.prepare('UPDATE codes_promo SET usage_actuel = usage_actuel + 1 WHERE id = ?')
        .bind(promoId).run()
    )
  }

  // Historique initial
  await env.DB.prepare(`
    INSERT INTO commandes_historique (id, commande_id, ancien_statut, nouveau_statut, timestamp, source)
    VALUES (?, ?, 'en_attente', 'en_attente', ?, 'client')
  `).bind(crypto.randomUUID(), commandeId, now).run()

  const commandeComplete: Partial<Commande> = {
    id: commandeId,
    tenant_id: data.tenant_id,
    client_nom: data.client_nom,
    items_json: itemsJson,
    montant_total: montantTotal,
    frais_livraison: fraisLivraison,
    mode_paiement: data.mode_paiement,
    statut: 'en_attente',
    token_suivi: tokenSuivi,
    created_at: now
  }

  // WhatsApp notification
  const messageWhatsApp = genererMessageCommande(commandeComplete as Commande, tenantRow)
  const lienWhatsApp = genererLienWhatsApp(tenantRow.whatsapp_number, messageWhatsApp)

  c.executionCtx.waitUntil(
    envoyerNotificationWhatsApp(tenantRow.whatsapp_number, messageWhatsApp, env)
  )

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

  const commande = await c.env.DB
    .prepare(`
      SELECT c.id, c.client_nom, c.items_json, c.montant_total,
             c.frais_livraison, c.mode_paiement, c.statut,
             c.token_suivi, c.notes, c.metadata, c.created_at, c.updated_at,
             t.nom as restaurant_nom, t.logo_url, t.couleur_primaire, t.slug as restaurant_slug
      FROM commandes c
      JOIN tenants t ON t.id = c.tenant_id
      WHERE c.token_suivi = ? AND c.deleted_at IS NULL
    `)
    .bind(token)
    .first<any>()

  if (!commande) return c.json({ error: 'Commande introuvable.' }, 404)

  const historique = await c.env.DB
    .prepare(`
      SELECT ancien_statut, nouveau_statut, timestamp, source, note
      FROM commandes_historique
      WHERE commande_id = (SELECT id FROM commandes WHERE token_suivi = ?)
      ORDER BY timestamp ASC
    `)
    .bind(token)
    .all()

  // Parser items_json
  let items = []
  try { items = JSON.parse(commande.items_json) } catch {}

  return c.json({
    commande: { ...commande, items },
    historique: historique.results
  })
})

// PATCH /api/v1/commandes/:id/statut — Mise à jour statut (AUTH JWT REQUISE)
commandesRouter.patch('/:id/statut', async (c) => {
  setSecurityHeaders(c)

  // Authentification obligatoire — route protégée restaurant
  const auth = await verifyRestaurantAuth(c)
  if (!auth) return c.json({ error: 'Authentification requise.' }, 401)

  const commandeId = c.req.param('id')
  let body: { statut?: string; livreur_id?: string; note?: string }
  try { body = await c.req.json() } catch { return c.json({ error: 'JSON invalide.' }, 400) }

  const statutsValides = ['confirmee', 'en_preparation', 'en_livraison', 'livree', 'annulee']
  if (!body.statut || !statutsValides.includes(body.statut)) {
    return c.json({ error: 'Statut invalide.' }, 422)
  }

  // Vérifier que la commande appartient au tenant authentifié
  const commande = await c.env.DB
    .prepare('SELECT id, statut FROM commandes WHERE id = ? AND tenant_id = ? AND deleted_at IS NULL')
    .bind(commandeId, auth.tenant_id)
    .first<{ id: string; statut: string }>()

  if (!commande) return c.json({ error: 'Commande introuvable.' }, 404)

  const now = new Date().toISOString()

  await c.env.DB.prepare(`
    UPDATE commandes SET statut = ?, livreur_id = COALESCE(?, livreur_id), updated_at = ?
    WHERE id = ? AND tenant_id = ?
  `).bind(body.statut, body.livreur_id ?? null, now, commandeId, auth.tenant_id).run()

  await c.env.DB.prepare(`
    INSERT INTO commandes_historique (id, commande_id, ancien_statut, nouveau_statut, timestamp, source, note)
    VALUES (?, ?, ?, ?, ?, 'restaurant', ?)
  `).bind(crypto.randomUUID(), commandeId, commande.statut, body.statut, now, body.note ?? null).run()

  return c.json({ success: true, statut: body.statut })
})

// POST /api/v1/commandes/valider-promo — Vérifier un code promo côté boutique (sans créer de commande)
commandesRouter.post('/valider-promo', async (c) => {
  setSecurityHeaders(c)

  const ip = c.req.header('CF-Connecting-IP') ?? 'unknown'
  const rateLimit = await checkRateLimit(`promo-check:${ip}`, 20, 60000)
  if (!rateLimit.allowed) return c.json({ error: 'Trop de tentatives. Réessayez dans une minute.' }, 429)

  let body: { tenant_id?: string; code?: string; sous_total?: number }
  try { body = await c.req.json() } catch { return c.json({ error: 'JSON invalide.' }, 400) }

  if (!body.tenant_id || !body.code) return c.json({ error: 'tenant_id et code requis.' }, 422)
  const sousTotal = typeof body.sous_total === 'number' ? body.sous_total : 0

  // Récupérer les infos du code promo pour la réponse enrichie
  const promo = await c.env.DB.prepare(`
    SELECT id, code, type, valeur, date_fin, usage_max, usage_actuel, actif
    FROM codes_promo
    WHERE tenant_id = ? AND code = ? AND actif = 1
  `).bind(body.tenant_id, body.code.toUpperCase()).first<any>()

  if (!promo) return c.json({ valide: false, error: 'Code promo invalide ou introuvable.' })
  if (promo.date_fin && new Date(promo.date_fin) < new Date()) {
    return c.json({ valide: false, error: 'Code promo expiré.' })
  }
  if (promo.usage_max !== null && promo.usage_actuel >= promo.usage_max) {
    return c.json({ valide: false, error: 'Code promo épuisé (limite d\'utilisation atteinte).' })
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
