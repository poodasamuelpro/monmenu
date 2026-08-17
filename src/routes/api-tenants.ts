// API Tenants (Restaurants) — gestion publique + dashboard 
// ARCHITECTURE :
//   • D1 (Cloudflare) → SITE WEB uniquement : config_globale, pays
//   • Supabase (PostgreSQL) → APPLICATION : tenants, menu, points_de_vente,
//     plans, supplements, etc.
//
// MIGRATION PLANS — POST / (création tenant, route legacy conservée pour
// compatibilité) résout désormais le plan Gratuit directement dans
// Supabase via chargerPlanGratuit() (src/lib/plans.ts). Plus aucune
// requête D1 pour les plans.
//
// AJOUT — GET /:slug/menu inclut désormais les suppléments actifs de
// chaque produit (table `supplements`), pour que la boutique publique
// puisse les proposer au client à l'ajout au panier.
//
// CORRECTIF BUG-3 (statut) — GET /:slug et GET /:slug/menu filtraient
// uniquement sur .in('statut', ['actif', 'essai']). Or un tenant qui
// vient de choisir un plan PAYANT à l'inscription reçoit le statut
// 'en_attente_paiement_initial' (voir api-auth.ts, POST /register) tant
// qu'il n'a pas soumis son premier paiement. Ce statut est désormais
// inclus dans les deux requêtes.
//
// CORRECTIF BUG-3-BIS (CAUSE RÉELLE DU 404 PERSISTANT, y compris pour des
// restaurants EXISTANTS et actifs) — GET /:slug utilisait
// `points_de_vente!inner(...)` dans son .select(). `!inner` impose une
// JOINTURE INTERNE côté PostgREST/Supabase : si le tenant n'a AUCUNE
// ligne correspondante dans `points_de_vente` avec la condition demandée
// (ou si son unique PDV a `actif = false` / a été supprimé), la requête
// ne retourne PAS le tenant du tout — quel que soit son statut
// ('actif', 'essai', peu importe). Le correctif sur la liste des statuts
// ci-dessus ne pouvait donc RIEN changer pour ce cas : le problème n'est
// pas le filtre `statut`, c'est le filtre implicite introduit par la
// jointure interne sur une table qui peut légitimement être vide (PDV
// jamais configuré depuis /dashboard/pdv, ou désactivé).
// Correctif : la requête tenant ne fait plus AUCUNE jointure sur
// points_de_vente. Le PDV est récupéré séparément (comme le fait déjà
// GET /profil dans api-dashboard.ts), et son absence ne bloque plus
// l'affichage du tenant — la boutique s'affiche simplement sans
// pdv_id/pdv_latitude/etc (l'UI boutique.js gère déjà pdvData === null,
// elle désactive juste le calcul de frais de livraison GPS).

import { Hono } from 'hono'
import type { Env } from '../types/database'
import { setSecurityHeaders } from '../lib/security'
import { createSupabaseAdminClient } from '../lib/supabase'
import { ESSAI_DUREE_JOURS } from '../lib/constants'
import { chargerPlanGratuit } from '../lib/plans'

const tenantsRouter = new Hono<{ Bindings: Env }>()

// =============================================================
// GET /api/v1/tenants — Liste publique des restaurants partenaires
// =============================================================
tenantsRouter.get('/', async (c) => {
  setSecurityHeaders(c)

  const limitParam = parseInt(c.req.query('limit') ?? '12', 10)
  const limit = Number.isFinite(limitParam) ? Math.min(Math.max(limitParam, 1), 24) : 12

  const cacheKey = `tenants:public:${limit}`
  try {
    if (c.env.KV_CACHE) {
      const cached = await c.env.KV_CACHE.get(cacheKey, 'json')
      if (cached) {
        c.header('X-Cache', 'HIT')
        return c.json(cached)
      }
    }
  } catch { /* KV non disponible en local dev */ }

  const nowIso = new Date().toISOString()
  const adminClient = createSupabaseAdminClient(c.env)

  const { data: tenants, error } = await adminClient
    .from('tenants')
    .select('nom, slug, logo_url, statut')
    .in('statut', ['actif', 'essai'])
    .is('deleted_at', null)
    .not('logo_url', 'is', null)
    .or(`statut.eq.actif,essai_expire_le.gt.${nowIso},essai_expire_le.is.null`)
    .order('statut', { ascending: true })
    .order('updated_at', { ascending: false })
    .limit(limit)

  if (error) {
    console.error('[Tenants] Erreur Supabase (liste publique):', error.message)
    return c.json({ tenants: [] })
  }

  const result = { tenants: tenants ?? [] }

  try { if (c.env.KV_CACHE) await c.env.KV_CACHE.put(cacheKey, JSON.stringify(result), { expirationTtl: 300 }) } catch {}

  return c.json(result)
})

// GET /api/v1/tenants/:slug — Info publique boutique restaurant
tenantsRouter.get('/:slug', async (c) => {
  setSecurityHeaders(c)
  const slug = c.req.param('slug')

  const cacheKey = `tenant:${slug}`
  try {
    if (c.env.KV_CACHE) {
      const cached = await c.env.KV_CACHE.get(cacheKey, 'json')
      if (cached) {
        c.header('X-Cache', 'HIT')
        return c.json(cached)
      }
    }
  } catch { /* KV non disponible en local dev */ }

  const adminClient = createSupabaseAdminClient(c.env)

  // CORRECTIF BUG-3 — 'en_attente_paiement_initial' ajouté : un tenant
  // ayant choisi un plan payant à l'inscription doit rester visible sur
  // sa boutique publique tant qu'il est dans cette fenêtre (avant son
  // premier paiement), exactement comme un tenant en 'essai'.
  // Corr#14.6 — 'inactif' ajouté : grace_confirmation — un tenant inactif
  // (essai expiré ou abonnement expiré) peut entrer dans une fenêtre de
  // grace côté front, la boutique doit rester résolvable pour l'afficher.
  //
  // CORRECTIF BUG-3-BIS — plus AUCUNE jointure sur points_de_vente ici
  // (voir commentaire en tête de fichier). On ne sélectionne QUE les
  // colonnes du tenant lui-même : une absence de PDV actif ne peut plus
  // faire disparaître le tenant de la réponse.
  const { data: tenant, error } = await adminClient
    .from('tenants')
    .select(`
      id, nom, slug, logo_url, banniere_url,
      couleur_primaire, couleur_secondaire,
      whatsapp_number, metadata, statut, pays_id
    `)
    .eq('slug', slug)
    .in('statut', ['actif', 'essai', 'en_attente_paiement_initial', 'inactif'])
    .is('deleted_at', null)
    .limit(1)
    .maybeSingle()

  if (error) {
    console.error('[Tenants] Erreur Supabase (GET /:slug):', error.message)
    return c.json({ error: 'Erreur lors de la récupération du restaurant.' }, 500)
  }

  if (!tenant) {
    return c.json({ error: 'Restaurant introuvable.' }, 404)
  }

  // CORRECTIF BUG-3-BIS — requête PDV séparée, non bloquante. Si aucun
  // PDV actif n'existe pour ce tenant, pdv reste simplement `null` et la
  // boutique s'affiche quand même (sans calcul de frais de livraison
  // GPS tant que le PDV n'est pas configuré depuis /dashboard/pdv).
  const { data: pdv } = await adminClient
    .from('points_de_vente')
    .select('id, nom, adresse, latitude, longitude, horaires')
    .eq('tenant_id', tenant.id)
    .eq('actif', true)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()

  let paysInfo: any = null
  if (tenant.pays_id) {
    try {
      paysInfo = await c.env.DB
        .prepare('SELECT nom, devise, symbole_devise FROM pays WHERE id = ?')
        .bind(tenant.pays_id)
        .first()
    } catch { /* pays table may not exist yet */ }
  }

  const result = {
    id: tenant.id,
    nom: tenant.nom,
    slug: tenant.slug,
    logo_url: tenant.logo_url,
    banniere_url: tenant.banniere_url,
    couleur_primaire: tenant.couleur_primaire,
    couleur_secondaire: tenant.couleur_secondaire,
    whatsapp_number: tenant.whatsapp_number,
    metadata: tenant.metadata,
    statut: tenant.statut,
    pays_nom: paysInfo?.nom ?? null,
    devise: paysInfo?.devise ?? 'XOF',
    symbole_devise: paysInfo?.symbole_devise ?? 'FCFA',
    pdv_id: pdv?.id ?? null,
    pdv_nom: pdv?.nom ?? null,
    pdv_adresse: pdv?.adresse ?? null,
    pdv_latitude: pdv?.latitude ?? null,
    pdv_longitude: pdv?.longitude ?? null,
    pdv_horaires: pdv?.horaires ?? null
  }

  // Non bloquant : on ne met en cache que si le tenant a bien été trouvé,
  // jamais un 404 (évite de figer une absence temporaire en cache 5 min).
  try { if (c.env.KV_CACHE) await c.env.KV_CACHE.put(cacheKey, JSON.stringify(result), { expirationTtl: 300 }) } catch {}

  return c.json(result)
})

// GET /api/v1/tenants/:slug/menu — Menu public complet
// AJOUT — chaque produit inclut désormais son tableau `supplements`
// (uniquement ceux actifs, non supprimés), en une seule requête groupée
// (pas de N+1 par produit).
// CORRECTIF BUG-3 — même ajout de 'en_attente_paiement_initial' que pour
// GET /:slug ci-dessus, pour que le menu reste chargeable pendant cette
// fenêtre. Cette route ne faisait déjà PAS de jointure inner sur
// points_de_vente — elle n'était donc pas affectée par le bug 3-bis
// décrit en tête de fichier, seul le filtre statut était en cause ici.
//
// AJOUT — Suppléments généraux : la réponse inclut désormais un tableau
// `supplements` au niveau racine (suppléments actifs du tenant, sans lien
// produit obligatoire). Compatible mobile Flutter : champs additifs uniquement,
// aucun champ existant n'est renommé, retiré ou changé de type.
// L'ancienne structure `produit.supplements` (par produit) reste inchangée
// pour la rétrocompatibilité ; les suppléments généraux sont en parallèle.
tenantsRouter.get('/:slug/menu', async (c) => {
  setSecurityHeaders(c)
  const slug = c.req.param('slug')

  // B7 — session-5 : Pagination par catégorie avec ?page=N&limit=L.
  // Défaut : page=1, limit=200 (rétro-compatible — les clients sans pagination
  // reçoivent jusqu'à 200 catégories, identique à l'ancien comportement illimité).
  // Le cache KV n'est activé que pour la page 1 avec le limit par défaut
  // afin d'éviter une explosion du cache (N pages × M limits possibles).
  const pageRaw = parseInt(c.req.query('page') ?? '1', 10)
  const limitRaw = parseInt(c.req.query('limit') ?? '200', 10)
  const page = isNaN(pageRaw) || pageRaw < 1 ? 1 : pageRaw
  const limit = isNaN(limitRaw) || limitRaw < 1 ? 200 : Math.min(limitRaw, 200)
  const isPremierePage = page === 1 && limit === 200

  const cacheKey = `menu:${slug}`
  if (isPremierePage) {
    try {
      if (c.env.KV_CACHE) {
        const cached = await c.env.KV_CACHE.get(cacheKey, 'json')
        if (cached) { c.header('X-Cache', 'HIT'); return c.json(cached) }
      }
    } catch {}
  }

  const adminClient = createSupabaseAdminClient(c.env)

  // Corr#14.6 — 'inactif' ajouté au filtre statut (grace_confirmation).
  const { data: tenantRow, error: tenantError } = await adminClient
    .from('tenants')
    .select('id')
    .eq('slug', slug)
    .in('statut', ['actif', 'essai', 'en_attente_paiement_initial', 'inactif'])
    .is('deleted_at', null)
    .single()

  if (tenantError || !tenantRow) {
    return c.json({ error: 'Restaurant introuvable.' }, 404)
  }

  // B7 — Offset de pagination sur les catégories.
  const offset = (page - 1) * limit

  const [{ data: categories, error: catError }, { data: produits, error: prodError }] = await Promise.all([
    adminClient
      .from('categories_menu')
      .select('id, nom, description, ordre_affichage')
      .eq('tenant_id', tenantRow.id)
      .eq('actif', true)
      .order('ordre_affichage', { ascending: true })
      .range(offset, offset + limit - 1),

    adminClient
      .from('produits')
      .select('id, categorie_id, nom, description, prix, photo_url, disponible, ordre_affichage')
      .eq('tenant_id', tenantRow.id)
      .is('deleted_at', null)
      .order('ordre_affichage', { ascending: true })
  ])

  if (catError) return c.json({ error: 'Erreur récupération menu.', ...(c.env.ENVIRONMENT !== 'production' ? { detail: catError.message } : {}) }, 500)

  // AJOUT — suppléments actifs, groupés par produit (rétrocompatibilité mobile),
  // ET suppléments généraux du tenant (sans lien produit — nouveau modèle).
  // Une seule requête groupée pour tous les suppléments (actif=true, deleted_at null).
  // Les suppléments produit-liés gardent leur champ produit_id pour la rétrocompatibilité.
  // Les suppléments généraux (produit_id IS NULL) sont exposés au niveau racine.
  const catIds = new Set((categories ?? []).map((cat: any) => cat.id))
  const produitsFiltres = (produits ?? []).filter((p: any) => catIds.has(p.categorie_id))
  const produitIds = produitsFiltres.map((p: any) => p.id)
  const supplementsByProduit = new Map<string, Array<{ id: string; nom: string; prix: number }>>()
  // AJOUT — suppléments généraux (tenant-level, produit_id IS NULL)
  const supplementsGeneraux: Array<{ id: string; nom: string; prix: number; photo_url: string | null }> = []

  // Une seule requête pour tous les suppléments actifs du tenant :
  // - ceux liés à un produit (produit_id non null) → groupés par produit
  // - ceux généraux (produit_id null) → tableau racine `supplements`
  const { data: supplementsData } = await adminClient
    .from('supplements')
    .select('id, produit_id, nom, prix, photo_url, ordre_affichage')
    .eq('tenant_id', tenantRow.id)
    .eq('actif', true)
    .is('deleted_at', null)
    .order('ordre_affichage', { ascending: true })

  for (const s of (supplementsData ?? [])) {
    if (s.produit_id && produitIds.includes(s.produit_id)) {
      // Supplément lié à un produit (ancien modèle — rétrocompatibilité)
      const list = supplementsByProduit.get(s.produit_id) ?? []
      list.push({ id: s.id, nom: s.nom, prix: s.prix })
      supplementsByProduit.set(s.produit_id, list)
    } else if (!s.produit_id) {
      // AJOUT — Supplément général (nouveau modèle — sans produit associé)
      supplementsGeneraux.push({ id: s.id, nom: s.nom, prix: s.prix, photo_url: s.photo_url ?? null })
    }
  }

  const produitsByCategorie = new Map<string, any[]>()
  for (const produit of produitsFiltres) {
    const list = produitsByCategorie.get(produit.categorie_id) ?? []
    list.push({ ...produit, supplements: supplementsByProduit.get(produit.id) ?? [] })
    produitsByCategorie.set(produit.categorie_id, list)
  }

  const menu = (categories ?? []).map((cat: any) => ({
    ...cat,
    produits: produitsByCategorie.get(cat.id) ?? []
  }))

  // B7 — Métadonnées de pagination dans la réponse.
  // AJOUT — `supplements` au niveau racine (suppléments généraux du tenant).
  // Champ additif : ne casse pas les clients existants (Flutter, etc.).
  const result = {
    categories: menu,
    supplements: supplementsGeneraux, // AJOUT — tableau racine suppléments généraux
    pagination: {
      page,
      limit,
      count: menu.length,
      has_more: menu.length === limit
    }
  }

  // Cache KV uniquement pour la page par défaut (rétro-compatible).
  if (isPremierePage) {
    try { if (c.env.KV_CACHE) await c.env.KV_CACHE.put(cacheKey, JSON.stringify(result), { expirationTtl: 120 }) } catch {}
  }

  return c.json(result)
})

// GET /api/v1/tenants/:slug/qrcode — Info QR code
tenantsRouter.get('/:slug/qrcode', async (c) => {
  setSecurityHeaders(c)
  const slug = c.req.param('slug')

  const adminClient = createSupabaseAdminClient(c.env)

  // B-TEN-01 — fix session-5 : ajout filtre statut pour exclure les tenants suspendus.
  // Un tenant suspendu ne doit pas pouvoir générer son QR code (clients continueraient
  // à commander chez un restaurant volontairement mis hors service).
  const { data: tenant, error } = await adminClient
    .from('tenants')
    .select('id, nom, slug, couleur_primaire')
    .eq('slug', slug)
    .in('statut', ['actif', 'essai', 'en_attente_paiement_initial', 'inactif'])
    .is('deleted_at', null)
    .single()

  if (error || !tenant) {
    return c.json({ error: 'Restaurant introuvable.' }, 404)
  }

  const url = `${new URL(c.req.url).origin}/${slug}`
  const color = (tenant.couleur_primaire ?? '#DC2626').replace('#', '')

  return c.json({
    url,
    nom: tenant.nom,
    couleur: tenant.couleur_primaire,
    qr_api_url: `https://api.qrserver.com/v1/create-qr-code/?size=400x400&data=${encodeURIComponent(url)}&color=${color}&bgcolor=ffffff`
  })
})

// POST /api/v1/tenants — Créer un tenant (inscription restaurant, route legacy)
// NOTE: Ce endpoint est conservé pour compatibilité mais l'inscription
// principale passe par api-auth.ts (POST /api/v1/auth/register).
//
// MIGRATION PLANS — résolution du plan Gratuit directement dans Supabase
// via chargerPlanGratuit() (src/lib/plans.ts). Plus de lookup D1.
tenantsRouter.post('/', async (c) => {
  setSecurityHeaders(c)

  const ip = c.req.header('CF-Connecting-IP') ?? 'unknown'
  const { checkRateLimit, TenantSchema } = await import('../lib/security')
  // B-TEN-02 — fix session-5 : passage de c.env.KV_CACHE pour un rate limiting
  // réellement distribué entre toutes les instances Workers (au lieu du fallback Map mémoire locale).
  const rateLimit = await checkRateLimit(`inscription:${ip}`, 5, 3600000, c.env.KV_CACHE)
  if (!rateLimit.allowed) {
    return c.json({ error: 'Trop de tentatives. Réessayez dans une heure.' }, 429)
  }

  let body: unknown
  try {
    body = await c.req.json()
  } catch {
    return c.json({ error: 'JSON invalide.' }, 400)
  }

  const parseResult = TenantSchema.safeParse(body)
  if (!parseResult.success) {
    return c.json({ error: 'Données invalides.', details: parseResult.error.flatten() }, 422)
  }

  const data = parseResult.data
  const adminClient = createSupabaseAdminClient(c.env)

  const { data: existingSlug } = await adminClient
    .from('tenants')
    .select('id')
    .eq('slug', data.slug)
    .maybeSingle()

  if (existingSlug) {
    return c.json({ error: 'Ce nom de boutique est déjà utilisé.' }, 409)
  }

  // MIGRATION — plan Gratuit résolu directement dans Supabase.
  const planGratuit = await chargerPlanGratuit(c.env)
  const planId = planGratuit?.id ?? null

  let paysId: string | null = null
  try {
    const pays = await c.env.DB
      .prepare("SELECT id FROM pays WHERE code_iso = 'BF' LIMIT 1")
      .first<{ id: string }>()
    paysId = pays?.id ?? null
  } catch { /* pays table may not exist yet */ }

  const tenantId = crypto.randomUUID()
  const now = new Date().toISOString()
  const essaiExpireLe = new Date(Date.now() + ESSAI_DUREE_JOURS * 86400000).toISOString()

  const { error: insertError } = await adminClient
    .from('tenants')
    .insert({
      id: tenantId,
      pays_id: paysId,
      nom: data.nom,
      slug: data.slug,
      whatsapp_number: data.whatsapp_number,
      couleur_primaire: data.couleur_primaire,
      couleur_secondaire: data.couleur_secondaire,
      statut: 'essai',
      essai_expire_le: essaiExpireLe,
      plan_id: planId,
      metadata: '{}',
      created_at: now,
      updated_at: now
    })

  if (insertError) {
    return c.json({ error: 'Erreur création restaurant.', ...(c.env.ENVIRONMENT !== 'production' ? { detail: insertError.message } : {}) }, 500)
  }

  try { if (c.env.KV_CACHE) await c.env.KV_CACHE.delete(`tenant:${data.slug}`) } catch {}

  return c.json({ success: true, tenant_id: tenantId, slug: data.slug }, 201)
})

export { tenantsRouter }
