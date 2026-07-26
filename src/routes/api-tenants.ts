// API Tenants (Restaurants) — gestion publique + dashboard
import { Hono } from 'hono'
import type { Env, Tenant, Produit, CategorieMenu } from '../types/database'
import { setSecurityHeaders } from '../lib/security'

const tenantsRouter = new Hono<{ Bindings: Env }>()

// GET /api/v1/tenants/:slug — Info publique boutique restaurant
tenantsRouter.get('/:slug', async (c) => {
  setSecurityHeaders(c)
  const slug = c.req.param('slug')

  // Essayer le cache KV (graceful fallback si KV non configuré)
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

  const tenant = await c.env.DB
    .prepare(`
      SELECT t.id, t.nom, t.slug, t.logo_url, t.banniere_url,
             t.couleur_primaire, t.couleur_secondaire,
             t.whatsapp_number, t.metadata, t.statut,
             p.nom as pays_nom, p.devise, p.symbole_devise,
             pdv.id as pdv_id, pdv.nom as pdv_nom, pdv.adresse as pdv_adresse,
             pdv.latitude as pdv_latitude, pdv.longitude as pdv_longitude
      FROM tenants t
      LEFT JOIN pays p ON p.id = t.pays_id
      LEFT JOIN points_de_vente pdv ON pdv.tenant_id = t.id AND pdv.actif = 1
      WHERE t.slug = ? AND t.statut IN ('actif', 'essai') AND t.deleted_at IS NULL
      LIMIT 1
    `)
    .bind(slug)
    .first()

  if (!tenant) {
    return c.json({ error: 'Restaurant introuvable.' }, 404)
  }

  // Mettre en cache 5 minutes (graceful fallback)
  try { if (c.env.KV_CACHE) await c.env.KV_CACHE.put(cacheKey, JSON.stringify(tenant), { expirationTtl: 300 }) } catch {}

  return c.json(tenant)
})

// GET /api/v1/tenants/:slug/menu — Menu public complet
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

  // Récupérer tenant_id depuis le slug
  const tenantRow = await c.env.DB
    .prepare('SELECT id FROM tenants WHERE slug = ? AND statut IN (\'actif\', \'essai\') AND deleted_at IS NULL')
    .bind(slug)
    .first<{ id: string }>()

  if (!tenantRow) {
    return c.json({ error: 'Restaurant introuvable.' }, 404)
  }

  // Catégories + produits en une requête
  const categories = await c.env.DB
    .prepare(`
      SELECT id, nom, description, ordre_affichage
      FROM categories_menu
      WHERE tenant_id = ? AND actif = 1
      ORDER BY ordre_affichage ASC
    `)
    .bind(tenantRow.id)
    .all<CategorieMenu>()

  const produits = await c.env.DB
    .prepare(`
      SELECT id, categorie_id, nom, description, prix, photo_url,
             disponible, ordre_affichage
      FROM produits
      WHERE tenant_id = ? AND deleted_at IS NULL
      ORDER BY ordre_affichage ASC
    `)
    .bind(tenantRow.id)
    .all<Produit>()

  // Regrouper produits par catégorie
  const produitsByCategorie = new Map<string, Produit[]>()
  for (const produit of produits.results) {
    const list = produitsByCategorie.get(produit.categorie_id) ?? []
    list.push(produit)
    produitsByCategorie.set(produit.categorie_id, list)
  }

  const menu = categories.results.map((cat) => ({
    ...cat,
    produits: produitsByCategorie.get(cat.id) ?? []
  }))

  const result = { categories: menu }

  // Cache 2 minutes (graceful fallback)
  try { if (c.env.KV_CACHE) await c.env.KV_CACHE.put(cacheKey, JSON.stringify(result), { expirationTtl: 120 }) } catch {}

  return c.json(result)
})

// GET /api/v1/tenants/:slug/qrcode — Info QR code
tenantsRouter.get('/:slug/qrcode', async (c) => {
  setSecurityHeaders(c)
  const slug = c.req.param('slug')

  const tenant = await c.env.DB
    .prepare('SELECT id, nom, slug, couleur_primaire FROM tenants WHERE slug = ? AND deleted_at IS NULL')
    .bind(slug)
    .first<Pick<Tenant, 'id' | 'nom' | 'slug' | 'couleur_primaire'>>()

  if (!tenant) {
    return c.json({ error: 'Restaurant introuvable.' }, 404)
  }

  const url = `https://monmenu.app/${slug}`
  return c.json({
    url,
    nom: tenant.nom,
    couleur: tenant.couleur_primaire,
    qr_api_url: `https://api.qrserver.com/v1/create-qr-code/?size=400x400&data=${encodeURIComponent(url)}&color=${tenant.couleur_primaire.replace('#', '')}&bgcolor=ffffff`
  })
})

// POST /api/v1/tenants — Créer un tenant (inscription restaurant)
tenantsRouter.post('/', async (c) => {
  setSecurityHeaders(c)

  const ip = c.req.header('CF-Connecting-IP') ?? 'unknown'
  const { checkRateLimit, TenantSchema, sanitizeSlug } = await import('../lib/security')
  const rateLimit = await checkRateLimit(`inscription:${ip}`, 5, 3600000) // 5/heure
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

  // Vérifier unicité du slug
  const existingSlug = await c.env.DB
    .prepare('SELECT id FROM tenants WHERE slug = ?')
    .bind(data.slug)
    .first()

  if (existingSlug) {
    return c.json({ error: 'Ce nom de boutique est déjà utilisé.' }, 409)
  }

  // Plan gratuit par défaut
  const planGratuit = await c.env.DB
    .prepare('SELECT id FROM plans WHERE nom = \'Gratuit\' OR ordre_affichage = 0 LIMIT 1')
    .first<{ id: string }>()

  // Pays Burkina Faso par défaut
  const pays = await c.env.DB
    .prepare('SELECT id FROM pays WHERE code_iso = \'BF\' LIMIT 1')
    .first<{ id: string }>()

  const tenantId = crypto.randomUUID()
  const now = new Date().toISOString()

  await c.env.DB.prepare(`
    INSERT INTO tenants (
      id, pays_id, nom, slug, whatsapp_number,
      couleur_primaire, couleur_secondaire,
      statut, plan_id, metadata, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, 'essai', ?, '{}', ?, ?)
  `)
    .bind(
      tenantId,
      pays?.id ?? null,
      data.nom,
      data.slug,
      data.whatsapp_number,
      data.couleur_primaire,
      data.couleur_secondaire,
      planGratuit?.id ?? null,
      now,
      now
    )
    .run()

  // Invalider cache (graceful fallback)
  try { if (c.env.KV_CACHE) await c.env.KV_CACHE.delete(`tenant:${data.slug}`) } catch {}

  return c.json({ success: true, tenant_id: tenantId, slug: data.slug }, 201)
})

export { tenantsRouter }
