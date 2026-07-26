// API Commandes - Route Cloudflare Worker
// POST /api/v1/commandes - Créer une commande
// GET  /api/v1/commandes/:token - Suivi commande

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

const commandesRouter = new Hono<{ Bindings: Env }>()

// POST /api/v1/commandes — Créer une commande
commandesRouter.post('/', async (c) => {
  setSecurityHeaders(c)

  const ip = c.req.header('CF-Connecting-IP') ?? 'unknown'

  // Rate limiting : 10 commandes / minute par IP
  const rateLimit = await checkRateLimit(`commande:${ip}`, 10, 60000)
  if (!rateLimit.allowed) {
    return c.json(
      { error: 'Trop de requêtes. Veuillez patienter avant de réessayer.' },
      429
    )
  }

  // Parse + validation stricte côté serveur
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
  const idempotencyCheck = await checkIdempotency(data.idempotency_key, env.KV_CACHE)
  if (idempotencyCheck.exists) {
    return c.json(idempotencyCheck.data, 200) // Commande déjà créée
  }

  // Vérifier que le tenant existe et est actif
  const tenantRow = await env.DB
    .prepare('SELECT * FROM tenants WHERE id = ? AND statut IN (\'actif\', \'essai\') AND deleted_at IS NULL')
    .bind(data.tenant_id)
    .first<Tenant>()

  if (!tenantRow) {
    return c.json({ error: 'Restaurant introuvable ou inactif.' }, 404)
  }

  // Vérifier point de vente
  const pdvRow = await env.DB
    .prepare('SELECT * FROM points_de_vente WHERE id = ? AND tenant_id = ? AND actif = 1')
    .bind(data.point_de_vente_id, data.tenant_id)
    .first<PointDeVente>()

  if (!pdvRow) {
    return c.json({ error: 'Point de vente invalide.' }, 404)
  }

  // Récupérer les produits + calculer le total
  const produitIds = data.items.map((i) => i.produit_id)
  const placeholders = produitIds.map(() => '?').join(',')
  const produitsRows = await env.DB
    .prepare(
      `SELECT * FROM produits WHERE id IN (${placeholders}) AND tenant_id = ? AND disponible = 1`
    )
    .bind(...produitIds, data.tenant_id)
    .all<Produit>()

  if (produitsRows.results.length !== produitIds.length) {
    return c.json({ error: 'Un ou plusieurs produits sont indisponibles.' }, 422)
  }

  const produitMap = new Map(produitsRows.results.map((p) => [p.id, p]))

  // Construire items_json (figés au moment de la commande)
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

  const montantTotal = sousTotal + fraisLivraison
  const tokenSuivi = generateTrackingToken()
  const commandeId = crypto.randomUUID()
  const now = new Date().toISOString()

  // Insérer la commande (requête paramétrée — aucune concaténation SQL)
  await env.DB.prepare(`
    INSERT INTO commandes (
      id, tenant_id, point_de_vente_id, client_nom, client_telephone,
      client_adresse, client_latitude, client_longitude, items_json,
      montant_total, frais_livraison, mode_paiement, statut,
      token_suivi, idempotency_key, notes, metadata, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'en_attente', ?, ?, ?, '{}', ?, ?)
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
      now,
      now
    )
    .run()

  // Historique initial
  await env.DB.prepare(`
    INSERT INTO commandes_historique (id, commande_id, ancien_statut, nouveau_statut, timestamp, source)
    VALUES (?, ?, 'en_attente', 'en_attente', ?, 'client')
  `)
    .bind(crypto.randomUUID(), commandeId, now)
    .run()

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

  // Générer le message WhatsApp pour le restaurant
  const messageWhatsApp = genererMessageCommande(
    commandeComplete as Commande,
    tenantRow
  )
  const lienWhatsApp = genererLienWhatsApp(tenantRow.whatsapp_number, messageWhatsApp)

  // Notification WhatsApp API (async, ne bloque pas la réponse)
  c.executionCtx.waitUntil(
    envoyerNotificationWhatsApp(tenantRow.whatsapp_number, messageWhatsApp, env)
  )

  // Stocker idempotency
  const responseData = {
    success: true,
    commande_id: commandeId,
    token_suivi: tokenSuivi,
    montant_total: montantTotal,
    frais_livraison: fraisLivraison,
    lien_whatsapp: lienWhatsApp,
    url_suivi: `/suivi/${tokenSuivi}`
  }

  c.executionCtx.waitUntil(
    storeIdempotency(data.idempotency_key, responseData, env.KV_CACHE)
  )

  return c.json(responseData, 201)
})

// GET /api/v1/commandes/:token — Suivi public (sans auth)
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
             c.token_suivi, c.created_at, c.updated_at,
             t.nom as restaurant_nom, t.logo_url, t.couleur_primaire
      FROM commandes c
      JOIN tenants t ON t.id = c.tenant_id
      WHERE c.token_suivi = ? AND c.deleted_at IS NULL
    `)
    .bind(token)
    .first()

  if (!commande) {
    return c.json({ error: 'Commande introuvable.' }, 404)
  }

  const historique = await c.env.DB
    .prepare(`
      SELECT ancien_statut, nouveau_statut, timestamp, source
      FROM commandes_historique
      WHERE commande_id = (
        SELECT id FROM commandes WHERE token_suivi = ?
      )
      ORDER BY timestamp ASC
    `)
    .bind(token)
    .all()

  return c.json({ commande, historique: historique.results })
})

// PATCH /api/v1/commandes/:id/statut — Mise à jour statut (auth restaurant)
commandesRouter.patch('/:id/statut', async (c) => {
  setSecurityHeaders(c)

  const commandeId = c.req.param('id')
  const body = await c.req.json<{ statut: string; livreur_id?: string; note?: string }>()

  const statutsValides = [
    'confirmee', 'en_preparation', 'en_livraison', 'livree', 'annulee'
  ]
  if (!statutsValides.includes(body.statut)) {
    return c.json({ error: 'Statut invalide.' }, 422)
  }

  const commande = await c.env.DB
    .prepare('SELECT * FROM commandes WHERE id = ?')
    .bind(commandeId)
    .first<Commande>()

  if (!commande) {
    return c.json({ error: 'Commande introuvable.' }, 404)
  }

  const now = new Date().toISOString()

  await c.env.DB.prepare(`
    UPDATE commandes SET statut = ?, livreur_id = COALESCE(?, livreur_id), updated_at = ?
    WHERE id = ?
  `)
    .bind(body.statut, body.livreur_id ?? null, now, commandeId)
    .run()

  await c.env.DB.prepare(`
    INSERT INTO commandes_historique (id, commande_id, ancien_statut, nouveau_statut, timestamp, source, note)
    VALUES (?, ?, ?, ?, ?, 'restaurant', ?)
  `)
    .bind(crypto.randomUUID(), commandeId, commande.statut, body.statut, now, body.note ?? null)
    .run()

  return c.json({ success: true, statut: body.statut })
})

export { commandesRouter }
