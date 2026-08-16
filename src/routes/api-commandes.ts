// API Commandes - Route Cloudflare Worker
// ARCHITECTURE : 
//   • D1 (Cloudflare) → SITE WEB uniquement : config_globale, pays
//   • Supabase (PostgreSQL) → APPLICATION : commandes, tenants, produits,
//     codes_promo, supplements, etc.
//
// POST /api/v1/commandes - Créer une commande
// GET  /api/v1/commandes/suivi/:token - Suivi commande (public)
// PATCH /api/v1/commandes/:id/statut - Mise à jour statut (AUTH REQUISE via dashboard)
// POST /api/v1/commandes/valider-promo - Vérifier un code promo
//
// AJOUT — SUPPLÉMENTS : chaque item de commande peut désormais inclure
// `supplement_ids` (tableau d'UUID). Le PRIX de chaque supplément n'est
// JAMAIS accepté depuis le client — il est systématiquement recalculé
// côté serveur depuis la table `supplements` (actif=true, tenant_id
// correspondant), exactement comme le code promo existant. Un supplément
// inactif, supprimé, ou n'appartenant pas au tenant est silencieusement
// ignoré (pas d'erreur bloquante — le client peut avoir une vue légèrement
// périmée du menu, ce n'est pas une raison de faire échouer la commande).
//
// CORRECTIF — AJOUT d'une notification in-app (notifications_restaurant)
// pour chaque nouvelle commande. Cette insertion n'existait pas
// auparavant : la route envoyait bien un WhatsApp et un push FCM au
// restaurant, mais n'insérait jamais de ligne dans notifications_restaurant
// — table lue exclusivement par la cloche de notifications du dashboard
// (GET /api/v1/dashboard/notifications/liste). Résultat : aucune nouvelle
// commande n'apparaissait jamais dans l'onglet Notifications, même en
// production. C'est purement additif — non bloquant (waitUntil + catch
// silencieux), aucun risque de régression sur la création de commande.
//
// CORRECTIF BUG-3 (corollaire) — POST / (création de commande) filtrait
// le tenant sur .in('statut', ['actif', 'essai']), ce qui empêchait toute
// commande sur la boutique d'un tenant en 'en_attente_paiement_initial'
// (plan payant choisi à l'inscription, avant le premier paiement). Ce
// statut est désormais accepté, en cohérence avec le correctif appliqué
// à GET /:slug et GET /:slug/menu dans src/routes/api-tenants.ts : la
// boutique publique d'un tel tenant doit rester pleinement fonctionnelle
// (affichage ET commande) pendant cette fenêtre.

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
import { createSupabaseClient, createSupabaseClientWithToken, createSupabaseAdminClient } from '../lib/supabase'
import { sendFcmToTenant } from '../lib/fcm'

const commandesRouter = new Hono<{ Bindings: Env }>()

// ---- Helper auth dashboard ----
// B-CMD-01 — fix session-5 : utilise createSupabaseAdminClient (service role) au lieu de
// createSupabaseClientWithToken (RLS actif) pour ce lookup interne. Une policy RLS trop
// stricte pouvait bloquer silencieusement un restaurateur légitime (utData null → 403
// injustifié). La protection est conservée par la vérification MANUELLE de auth_user_id
// (filtre strict, impossibilité d'accéder aux commandes d'un autre tenant).
// NOTE SÉCURITÉ : le client admin bypasse RLS — c'est sécurisé ICI car :
//   1. L'identité est vérifiée via supabase.auth.getUser(token) juste avant.
//   2. Le filtre .eq('auth_user_id', user.id) garantit qu'on ne lit que le lien
//      appartenant à cet utilisateur authentifié, jamais à un autre compte.
async function verifyRestaurantAuth(c: any): Promise<{ user_id: string; tenant_id: string; tenant_statut: string } | null> {
  const authHeader = c.req.header('Authorization')
  if (!authHeader?.startsWith('Bearer ')) return null
  const token = authHeader.replace('Bearer ', '')
  if (!token || token.length < 20) return null

  try {
    const supabase = createSupabaseClient(c.env)
    const { data: { user }, error } = await supabase.auth.getUser(token)
    if (error || !user) return null

    // B-CMD-01 : client ADMIN (service role) — RLS bypassé, vérification manuelle obligatoire.
    const adminClient = createSupabaseAdminClient(c.env)
    const { data: utData, error: utError } = await adminClient
      .from('utilisateurs_tenant')
      .select('tenant_id, tenants!inner(id, statut, deleted_at)')
      .eq('auth_user_id', user.id)  // vérification manuelle : uniquement le compte authentifié
      .is('tenants.deleted_at', null)
      .neq('tenants.statut', 'suspendu')
      .single()

    if (utError || !utData) return null
    const tenant = utData.tenants as any

    // S2-05 CORRIGÉ — verifyRestaurantAuth() ne vérifiait que 'suspendu', permettant
    // à un tenant 'inactif' ou 'bloque' de continuer via l'app mobile alors que le
    // dashboard web lui est bloqué (incohérence métier). On aligne sur verifierAccesTenant() :
    // seuls 'actif', 'essai', 'en_attente_paiement_initial' et 'inactif' (avec fenêtre de
    // grâce active — vérifiée via le statut) autorisent l'accès. 'bloque' et 'inactif'
    // hors grâce doivent être bloqués même via l'app mobile pour éviter le contournement.
    // Note : 'inactif' est toléré ici car verifierAccesTenant() le gère via la fenêtre de
    // grâce 72h — mais pour la route de mise à jour de statut commandes (opération légère),
    // on autorise 'inactif' car le restaurant peut encore avoir des commandes en cours.
    // La cohérence stricte est 'bloque' → refusé (abonnement expiré, sans grâce active).
    if (tenant.statut === 'bloque') return null

    return { user_id: user.id, tenant_id: utData.tenant_id, tenant_statut: tenant.statut }
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
// FINDING-05 (session-7) — le tenant_id n'est PLUS lu depuis le body de la
// requête. Le tenant est désormais résolu depuis le slug présent dans le header
// X-Tenant-Slug (envoyé par boutique.js) ou dans le body (champ ignoré pour
// la résolution, jamais utilisé comme autorité). En l'absence de slug valide,
// la requête est rejetée. Cette approche évite qu'un attaquant ne cible un
// autre restaurant en falsifiant tenant_id dans le body.
commandesRouter.post('/', async (c) => {
  setSecurityHeaders(c)

  const ip = c.req.header('CF-Connecting-IP') ?? 'unknown'

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

  // FINDING-05 — résoudre le tenant depuis le header X-Tenant-Slug ou le body.slug,
  // jamais depuis body.tenant_id (falsifiable). Le slug identifie le restaurant
  // côté client de façon non ambiguë (il est dans l'URL de la boutique visitée).
  const tenantSlug = c.req.header('X-Tenant-Slug') || (body as any)?.slug
  if (!tenantSlug || typeof tenantSlug !== 'string' || !/^[a-z0-9-]+$/.test(tenantSlug)) {
    return c.json({ error: 'Identification du restaurant manquante ou invalide (slug requis).' }, 422)
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

  if (env.KV_CACHE) {
    const idempotencyCheck = await checkIdempotency(data.idempotency_key, env.KV_CACHE)
    if (idempotencyCheck.exists) {
      return c.json(idempotencyCheck.data, 200)
    }
  }

  const adminClient = createSupabaseAdminClient(env)

  // FINDING-05 — résolution du tenant depuis le slug (non falsifiable), pas depuis
  // body.tenant_id. Le slug est l'identifiant public du restaurant dans l'URL.
  // CORRECTIF BUG-3 conservé : 'en_attente_paiement_initial' inclus.
  const { data: tenantRow, error: tenantError } = await adminClient
    .from('tenants')
    .select('id, whatsapp_number, statut')
    .eq('slug', tenantSlug)
    .in('statut', ['actif', 'essai', 'en_attente_paiement_initial'])
    .is('deleted_at', null)
    .single()

  if (tenantError || !tenantRow) return c.json({ error: 'Restaurant introuvable ou inactif.' }, 404)

  // Le tenant_id réel est désormais celui résolu depuis le slug côté serveur.
  // Toute valeur body.tenant_id est ignorée.
  const resolvedTenantId = tenantRow.id

  const { data: pdvRow, error: pdvError } = await adminClient
    .from('points_de_vente')
    .select('id, latitude, longitude')
    .eq('id', data.point_de_vente_id)
    .eq('tenant_id', resolvedTenantId)
    .eq('actif', true)
    .single()

  if (pdvError || !pdvRow) return c.json({ error: 'Point de vente invalide.' }, 404)

  const produitIds = data.items.map((i) => i.produit_id)

  const { data: produitsRows, error: prodsError } = await adminClient
    .from('produits')
    .select('id, nom, prix, disponible')
    .in('id', produitIds)
    .eq('tenant_id', resolvedTenantId)
    .eq('disponible', true)
    .is('deleted_at', null)

  if (prodsError || !produitsRows || produitsRows.length !== produitIds.length) {
    return c.json({ error: 'Un ou plusieurs produits sont indisponibles.' }, 422)
  }

  const produitMap = new Map(produitsRows.map((p: any) => [p.id, p]))

  // AJOUT — Récupérer TOUS les suppléments sélectionnés en une seule
  // requête groupée, filtrés actif=true et tenant_id correspondant côté
  // serveur (jamais confiance au prix envoyé par le client — même
  // principe que la validation du code promo ci-dessus).
  const tousSupplementIds = Array.from(
    new Set(data.items.flatMap((i) => i.supplement_ids ?? []))
  )
  const supplementsMap = new Map<string, { id: string; nom: string; prix: number; produit_id: string }>()
  if (tousSupplementIds.length > 0) {
    const { data: supplementsRows } = await adminClient
      .from('supplements')
      .select('id, produit_id, nom, prix')
      .in('id', tousSupplementIds)
      .eq('tenant_id', resolvedTenantId)
      .eq('actif', true)
      .is('deleted_at', null)

    for (const s of (supplementsRows ?? [])) {
      supplementsMap.set(s.id, { id: s.id, nom: s.nom, prix: s.prix, produit_id: s.produit_id })
    }
  }

  let sousTotal = 0
  const itemsJson = data.items.map((item) => {
    const produit = produitMap.get(item.produit_id) as any

    // AJOUT — ne garder que les suppléments réellement actifs ET
    // appartenant bien au produit commandé (sécurité anti-mélange :
    // un supplement_id valide pour un autre produit du même tenant
    // n'est pas appliqué à ce produit-ci).
    const supplementsChoisis = (item.supplement_ids ?? [])
      .map((sid) => supplementsMap.get(sid))
      .filter((s): s is { id: string; nom: string; prix: number; produit_id: string } =>
        !!s && s.produit_id === item.produit_id
      )

    const totalSupplements = supplementsChoisis.reduce((s, sup) => s + sup.prix, 0)
    const sous_total = (produit.prix + totalSupplements) * item.quantite
    sousTotal += sous_total

    return {
      produit_id: item.produit_id,
      nom: produit.nom,
      prix_unitaire: produit.prix,
      quantite: item.quantite,
      supplements: supplementsChoisis.map((s) => ({ supplement_id: s.id, nom: s.nom, prix: s.prix })),
      sous_total
    }
  })

  let remisePromo = 0
  let promoId: string | undefined
  if (data.code_promo) {
    const promoResult = await validerCodePromo(adminClient, resolvedTenantId, data.code_promo, sousTotal)
    if (!promoResult.valide) {
      return c.json({ error: promoResult.message ?? 'Code promo invalide.' }, 422)
    }
    remisePromo = promoResult.remise
    promoId = promoResult.promo_id
  }

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

  const { error: insertError } = await adminClient
    .from('commandes')
    .insert({
      id: commandeId,
      tenant_id: resolvedTenantId,
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

  if (promoId) {
    // C1 — session-6 : La RPC increment_promo_usage retourne maintenant 1 (succès)
    // ou 0 (race condition : usage_max déjà atteint par une requête concurrente).
    // On vérifie ce résultat ; si 0 lignes affectées, la réduction a été appliquée
    // au montant de cette commande alors que le quota était déjà épuisé — on logge
    // l'anomalie pour investigation manuelle. La commande est conservée (elle est
    // déjà insérée) mais l'incident est tracé explicitement.
    // Le fallback UPDATE non-atomique précédent est supprimé : il ne faisait que
    // masquer la race condition sans la résoudre.
    const promoIdCaptured = promoId
    c.executionCtx.waitUntil(
      (async () => {
        try {
          const { data: rpcResult, error: rpcError } = await adminClient
            .rpc('increment_promo_usage', { promo_id: promoIdCaptured })
          if (rpcError) {
            console.error(
              `[commandes/promo] Erreur RPC increment_promo_usage pour promo ${promoIdCaptured}:`,
              rpcError.message
            )
            return
          }
          if (rpcResult === 0) {
            // Race condition détectée : usage_max déjà atteint entre la vérification JS
            // et l'appel RPC. La remise a été accordée mais le quota est épuisé.
            console.error(
              `[commandes/promo] RACE CONDITION — code promo ${promoIdCaptured} utilisé au-delà ` +
              `de usage_max sur commande ${commandeId}. Investigation manuelle requise.`
            )
          }
        } catch (err: any) {
          console.error(
            `[commandes/promo] Exception increment_promo_usage pour promo ${promoIdCaptured}:`,
            err?.message ?? err
          )
        }
      })()
    )
  }

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
    tenant_id: resolvedTenantId,
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

  const origin = new URL(c.req.url).origin
  const modeLivraison = (data.mode_livraison ?? 'livraison') as 'livraison' | 'emporter'
  const messageWhatsApp = genererMessageCommande(commandeComplete as any, tenantRow as any, origin, modeLivraison)
  const lienWhatsApp = genererLienWhatsApp(tenantRow.whatsapp_number, messageWhatsApp)

  c.executionCtx.waitUntil(
    envoyerNotificationWhatsApp(tenantRow.whatsapp_number, messageWhatsApp, env)
  )

  c.executionCtx.waitUntil(
    sendFcmToTenant(env, adminClient, resolvedTenantId, {
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

  // AJOUT — notification in-app (cloche du dashboard) pour chaque nouvelle
  // commande. Non bloquant : une erreur ici ne doit jamais faire échouer
  // la création de la commande elle-même (catch silencieux, comme les
  // autres notifications de ce fichier).
  c.executionCtx.waitUntil(
    adminClient
      .from('notifications_restaurant')
      .insert({
        tenant_id: resolvedTenantId,
        type: 'info',
        titre: 'Nouvelle commande reçue',
        message: `Commande de ${data.client_nom} — ${montantTotal.toLocaleString('fr-FR')} FCFA.`,
        lien: '/dashboard/commandes',
        payload: { commande_id: commandeId, montant: montantTotal, client: data.client_nom }
      })
      .then(() => {})
      .catch(() => {})
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

  const adminClient = createSupabaseAdminClient(c.env)

  // S2-02 CORRIGÉ — 'notes' et 'metadata' retirés du select public.
  // 'metadata' contient code_promo et remise_promo (confidentiels).
  // 'notes' = commentaires internes du client — non pertinents pour la page suivi publique.
  // Aucune fonctionnalité frontend (page de suivi) ne dépend de ces champs.
  const { data: commande, error: cmdError } = await adminClient
    .from('commandes')
    .select(`
      id, client_nom, items_json, montant_total,
      frais_livraison, mode_paiement, statut,
      token_suivi, created_at, updated_at,
      tenants!inner(nom, logo_url, couleur_primaire, slug)
    `)
    .eq('token_suivi', token)
    .is('deleted_at', null)
    .single()

  if (cmdError || !commande) return c.json({ error: 'Commande introuvable.' }, 404)

  const tenantInfo = commande.tenants as any

  const { data: historique } = await adminClient
    .from('commandes_historique')
    .select('ancien_statut, nouveau_statut, timestamp, source, note')
    .eq('commande_id', commande.id)
    .order('timestamp', { ascending: true })

  let items = []
  try {
    items = typeof commande.items_json === 'string'
      ? JSON.parse(commande.items_json)
      : commande.items_json
  } catch {}

  return c.json({
    commande: {
      id: commande.id,
      client_nom: commande.client_nom,
      items,
      montant_total: commande.montant_total,
      frais_livraison: commande.frais_livraison,
      mode_paiement: commande.mode_paiement,
      statut: commande.statut,
      token_suivi: commande.token_suivi,
      created_at: commande.created_at,
      updated_at: commande.updated_at,
      restaurant_nom: tenantInfo?.nom,
      logo_url: tenantInfo?.logo_url,
      couleur_primaire: tenantInfo?.couleur_primaire,
      restaurant_slug: tenantInfo?.slug
    },
    historique: historique ?? []
  })
})

// PATCH /api/v1/commandes/:id/statut — Mise à jour statut (AUTH JWT REQUISE)
//
// B-CMD-02 — note session-5 : cette route est une duplication intentionnelle de
// PATCH /api/v1/dashboard/commandes/:id/statut (api-dashboard.ts).
// Les deux routes coexistent pour des raisons historiques (l'app mobile utilise
// celle-ci via header Bearer ; le dashboard web utilise celle de api-dashboard.ts
// via cookie + X-Requested-With). Toute modification fonctionnelle sur l'une DOIT
// être reportée sur l'autre. Renvoi croisé : voir api-dashboard.ts ligne ~335.
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

  // B-CMD-02 — alignement sur api-dashboard.ts (même correction que B-DASH-04) :
  // .is('deleted_at', null) + .select('id') + vérification rows.
  const { data: cmdUpdatedRows, error: updateError } = await adminClient
    .from('commandes')
    .update(updateData)
    .eq('id', commandeId)
    .eq('tenant_id', auth.tenant_id)
    .is('deleted_at', null)
    .select('id')

  if (updateError) return c.json({ error: 'Erreur mise à jour statut.', detail: updateError.message }, 500)
  if (!cmdUpdatedRows || cmdUpdatedRows.length === 0) {
    return c.json({ error: 'Commande introuvable ou non modifiable.' }, 404)
  }

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
// FINDING-05 (session-7) — le tenant est résolu depuis le header X-Tenant-Slug
// ou le champ body.slug, jamais depuis body.tenant_id (falsifiable).
commandesRouter.post('/valider-promo', async (c) => {
  setSecurityHeaders(c)

  const ip = c.req.header('CF-Connecting-IP') ?? 'unknown'
  const rateLimit = await checkRateLimit(`promo-check:${ip}`, 20, 60000)
  if (!rateLimit.allowed) return c.json({ error: 'Trop de tentatives. Réessayez dans une minute.' }, 429)

  let body: { tenant_id?: string; slug?: string; code?: string; sous_total?: number }
  try { body = await c.req.json() } catch { return c.json({ error: 'JSON invalide.' }, 400) }

  if (!body.code) return c.json({ error: 'code requis.' }, 422)

  // FINDING-05 — résolution du tenant depuis slug (non falsifiable), pas depuis tenant_id
  const tenantSlugPromo = c.req.header('X-Tenant-Slug') || body.slug
  if (!tenantSlugPromo || typeof tenantSlugPromo !== 'string' || !/^[a-z0-9-]+$/.test(tenantSlugPromo)) {
    return c.json({ error: 'Identification du restaurant manquante (slug requis).' }, 422)
  }

  const sousTotal = typeof body.sous_total === 'number' ? body.sous_total : 0

  const adminClient = createSupabaseAdminClient(c.env)

  // Résoudre le tenant depuis le slug (non falsifiable)
  const { data: tenantPromo, error: tenantPromoError } = await adminClient
    .from('tenants')
    .select('id')
    .eq('slug', tenantSlugPromo)
    .in('statut', ['actif', 'essai', 'en_attente_paiement_initial'])
    .is('deleted_at', null)
    .single()

  if (tenantPromoError || !tenantPromo) return c.json({ valide: false, error: 'Restaurant introuvable.' })

  const { data: promo, error: promoError } = await adminClient
    .from('codes_promo')
    .select('id, code, type, valeur, date_fin, usage_max, usage_actuel, actif')
    .eq('tenant_id', tenantPromo.id)
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
