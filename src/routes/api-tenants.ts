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

  const { data: tenant, error } = await adminClient
    .from('tenants')
    .select(`
      id, nom, slug, logo_url, banniere_url,
      couleur_primaire, couleur_secondaire,
      whatsapp_number, metadata, statut, pays_id,
      points_de_vente!inner(id, nom, adresse, latitude, longitude, horaires)
    `)
    .eq('slug', slug)
    .in('statut', ['actif', 'essai'])
    .is('deleted_at', null)
    .limit(1)
    .maybeSingle()

  if (!tenant) {
    return c.json({ error: 'Restaurant introuvable.' }, 404)
  }

  let paysInfo: any = null
  if (tenant.pays_id) {
    try {
      paysInfo = await c.env.DB
        .prepare('SELECT nom, devise, symbole_devise FROM pays WHERE id = ?')
        .bind(tenant.pays_id)
        .first()
    } catch { /* pays table may not exist yet */ }
  }

  const pdv = Array.isArray(tenant.points_de_vente)
    ? tenant.points_de_vente[0]
    : tenant.points_de_vente

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

  try { if (c.env.KV_CACHE) await c.env.KV_CACHE.put(cacheKey, JSON.stringify(result), { expirationTtl: 300 }) } catch {}

  return c.json(result)
})

// GET /api/v1/tenants/:slug/menu — Menu public complet
// AJOUT — chaque produit inclut désormais son tableau `supplements`
// (uniquement ceux actifs, non supprimés), en une seule requête groupée
// (pas de N+1 par produit).
tenantsRouter.get('/:slug/menu', async (c) => {
  setSecurityHeaders(c)
  const slug = c.req.param('slug')

  const cacheKey = `menu:${slug}`
  try {
    if (c.env.KV_CACHE) {
      const cached = await c.env.KV_CACHE.get(cacheKey, 'json')
      if (cached) { c.header('X-Cache', 'HIT'); return c.json(cached) }
    }
  } catch {}

  const adminClient = createSupabaseAdminClient(c.env)

  const { data: tenantRow, error: tenantError } = await adminClient
    .from('tenants')
    .select('id')
    .eq('slug', slug)
    .in('statut', ['actif', 'essai'])
    .is('deleted_at', null)
    .single()

  if (tenantError || !tenantRow) {
    return c.json({ error: 'Restaurant introuvable.' }, 404)
  }

  const [{ data: categories, error: catError }, { data: produits, error: prodError }] = await Promise.all([
    adminClient
      .from('categories_menu')
      .select('id, nom, description, ordre_affichage')
      .eq('tenant_id', tenantRow.id)
      .eq('actif', true)
      .order('ordre_affichage', { ascending: true }),

    adminClient
      .from('produits')
      .select('id, categorie_id, nom, description, prix, photo_url, disponible, ordre_affichage')
      .eq('tenant_id', tenantRow.id)
      .is('deleted_at', null)
      .order('ordre_affichage', { ascending: true })
  ])

  if (catError) return c.json({ error: 'Erreur récupération menu.', detail: catError.message }, 500)

  // AJOUT — suppléments actifs, groupés par produit, une seule requête.
  const produitIds = (produits ?? []).map((p: any) => p.id)
  const supplementsByProduit = new Map<string, Array<{ id: string; nom: string; prix: number }>>()
  if (produitIds.length > 0) {
    const { data: supplementsData } = await adminClient
      .from('supplements')
      .select('id, produit_id, nom, prix, ordre_affichage')
      .in('produit_id', produitIds)
      .eq('actif', true)
      .is('deleted_at', null)
      .order('ordre_affichage', { ascending: true })

    for (const s of (supplementsData ?? [])) {
      const list = supplementsByProduit.get(s.produit_id) ?? []
      list.push({ id: s.id, nom: s.nom, prix: s.prix })
      supplementsByProduit.set(s.produit_id, list)
    }
  }

  const produitsByCategorie = new Map<string, any[]>()
  for (const produit of (produits ?? [])) {
    const list = produitsByCategorie.get(produit.categorie_id) ?? []
    list.push({ ...produit, supplements: supplementsByProduit.get(produit.id) ?? [] })
    produitsByCategorie.set(produit.categorie_id, list)
  }

  const menu = (categories ?? []).map((cat) => ({
    ...cat,
    produits: produitsByCategorie.get(cat.id) ?? []
  }))

  const result = { categories: menu }

  try { if (c.env.KV_CACHE) await c.env.KV_CACHE.put(cacheKey, JSON.stringify(result), { expirationTtl: 120 }) } catch {}

  return c.json(result)
})

// GET /api/v1/tenants/:slug/qrcode — Info QR code
tenantsRouter.get('/:slug/qrcode', async (c) => {
  setSecurityHeaders(c)
  const slug = c.req.param('slug')

  const adminClient = createSupabaseAdminClient(c.env)

  const { data: tenant, error } = await adminClient
    .from('tenants')
    .select('id, nom, slug, couleur_primaire')
    .eq('slug', slug)
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
  const rateLimit = await checkRateLimit(`inscription:${ip}`, 5, 3600000)
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
    return c.json({ error: 'Erreur création restaurant.', detail: insertError.message }, 500)
  }

  try { if (c.env.KV_CACHE) await c.env.KV_CACHE.delete(`tenant:${data.slug}`) } catch {}

  return c.json({ success: true, tenant_id: tenantId, slug: data.slug }, 201)
})

export { tenantsRouter }
