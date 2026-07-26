// API Dashboard — Routes protégées pour le tableau de bord restaurant
// Toutes les routes nécessitent un JWT Supabase valide

import { Hono } from 'hono'
import type { Env } from '../types/database'
import { createSupabaseClient } from '../lib/supabase'
import { setSecurityHeaders, checkRateLimit } from '../lib/security'

const dashboardRouter = new Hono<{ Bindings: Env }>()

// ---- Middleware d'authentification ----
async function verifyAuth(c: any): Promise<{ user_id: string; tenant_id: string; tenant_slug: string } | null> {
  const authHeader = c.req.header('Authorization')
  if (!authHeader?.startsWith('Bearer ')) return null

  const token = authHeader.replace('Bearer ', '')
  if (!token || token.length < 20) return null

  try {
    // Vérifier le token Supabase
    const supabase = createSupabaseClient(c.env)
    const { data: { user }, error } = await supabase.auth.getUser(token)
    if (error || !user) return null

    // Récupérer le tenant lié
    const tenant = await c.env.DB
      .prepare(`
        SELECT t.id, t.slug FROM utilisateurs_tenant ut
        JOIN tenants t ON t.id = ut.tenant_id
        WHERE ut.auth_user_id = ? AND t.deleted_at IS NULL AND t.statut != 'suspendu'
        LIMIT 1
      `)
      .bind(user.id)
      .first<{ id: string; slug: string }>()

    if (!tenant) return null
    return { user_id: user.id, tenant_id: tenant.id, tenant_slug: tenant.slug }
  } catch { return null }
}

// ---- GET /api/v1/dashboard/commandes ----
dashboardRouter.get('/commandes', async (c) => {
  setSecurityHeaders(c)
  const auth = await verifyAuth(c)
  if (!auth) return c.json({ error: 'Non authentifié.' }, 401)

  const statut = c.req.query('statut')
  const page = parseInt(c.req.query('page') || '1')
  const limit = 50
  const offset = (page - 1) * limit

  let query = `
    SELECT id, client_nom, client_telephone, client_adresse,
           items_json, montant_total, frais_livraison, mode_paiement,
           statut, token_suivi, notes, created_at, updated_at
    FROM commandes
    WHERE tenant_id = ? AND deleted_at IS NULL
  `
  const params: any[] = [auth.tenant_id]

  if (statut) {
    query += ' AND statut = ?'
    params.push(statut)
  }

  query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?'
  params.push(limit, offset)

  const commandes = await c.env.DB.prepare(query).bind(...params).all()
  return c.json({ commandes: commandes.results, page, limit })
})

// ---- GET /api/v1/dashboard/stats ----
dashboardRouter.get('/stats', async (c) => {
  setSecurityHeaders(c)
  const auth = await verifyAuth(c)
  if (!auth) return c.json({ error: 'Non authentifié.' }, 401)

  const today = new Date().toISOString().split('T')[0]
  const monthStart = today.substring(0, 7) + '-01'

  const [statToday, statMonth, statTaux, statsJours] = await Promise.all([
    c.env.DB.prepare(`
      SELECT COUNT(*) as cnt, COALESCE(SUM(montant_total), 0) as total
      FROM commandes WHERE tenant_id = ? AND date(created_at) = ? AND deleted_at IS NULL
    `).bind(auth.tenant_id, today).first<{ cnt: number; total: number }>(),

    c.env.DB.prepare(`
      SELECT COUNT(*) as cnt FROM commandes
      WHERE tenant_id = ? AND date(created_at) >= ? AND deleted_at IS NULL
    `).bind(auth.tenant_id, monthStart).first<{ cnt: number }>(),

    c.env.DB.prepare(`
      SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN statut = 'livree' THEN 1 ELSE 0 END) as livrees
      FROM commandes WHERE tenant_id = ? AND deleted_at IS NULL
    `).bind(auth.tenant_id).first<{ total: number; livrees: number }>(),

    c.env.DB.prepare(`
      SELECT date(created_at) as jour, COUNT(*) as cnt
      FROM commandes WHERE tenant_id = ? AND date(created_at) >= date('now', '-29 days') AND deleted_at IS NULL
      GROUP BY date(created_at) ORDER BY jour ASC
    `).bind(auth.tenant_id).all<{ jour: string; cnt: number }>()
  ])

  // Construire séries 30 jours
  const labels: string[] = []
  const values: number[] = []
  const mapJours = new Map(statsJours.results.map(r => [r.jour, r.cnt]))
  for (let i = 29; i >= 0; i--) {
    const d = new Date()
    d.setDate(d.getDate() - i)
    const key = d.toISOString().split('T')[0]
    labels.push(key.slice(5)) // MM-DD
    values.push(mapJours.get(key) ?? 0)
  }

  const taux = statTaux && statTaux.total > 0
    ? Math.round((statTaux.livrees / statTaux.total) * 100)
    : 0

  return c.json({
    today: statToday?.cnt ?? 0,
    ca_today: statToday?.total ?? 0,
    month: statMonth?.cnt ?? 0,
    taux_livraison: taux,
    labels,
    values
  })
})

// ---- POST /api/v1/dashboard/categories ----
dashboardRouter.post('/categories', async (c) => {
  setSecurityHeaders(c)
  const auth = await verifyAuth(c)
  if (!auth) return c.json({ error: 'Non authentifié.' }, 401)

  let body: { nom?: string }
  try { body = await c.req.json() } catch { return c.json({ error: 'JSON invalide.' }, 400) }

  if (!body.nom || body.nom.trim().length < 2) {
    return c.json({ error: 'Nom de catégorie invalide (2 caractères minimum).' }, 422)
  }

  // Compter les catégories existantes
  const count = await c.env.DB
    .prepare('SELECT COUNT(*) as cnt FROM categories_menu WHERE tenant_id = ?')
    .bind(auth.tenant_id)
    .first<{ cnt: number }>()

  const catId = crypto.randomUUID()
  const now = new Date().toISOString()

  await c.env.DB.prepare(`
    INSERT INTO categories_menu (id, tenant_id, nom, ordre_affichage, actif, created_at, updated_at)
    VALUES (?, ?, ?, ?, 1, ?, ?)
  `).bind(catId, auth.tenant_id, body.nom.trim(), (count?.cnt ?? 0), now, now).run()

  // Invalider cache
  try { if (c.env.KV_CACHE) await c.env.KV_CACHE.delete(`menu:${auth.tenant_slug}`) } catch {}

  return c.json({ success: true, id: catId }, 201)
})

// ---- POST /api/v1/dashboard/produits ----
dashboardRouter.post('/produits', async (c) => {
  setSecurityHeaders(c)
  const auth = await verifyAuth(c)
  if (!auth) return c.json({ error: 'Non authentifié.' }, 401)

  let body: { categorie_id?: string; nom?: string; description?: string; prix?: number; disponible?: boolean }
  try { body = await c.req.json() } catch { return c.json({ error: 'JSON invalide.' }, 400) }

  if (!body.categorie_id || !body.nom || body.prix === undefined) {
    return c.json({ error: 'categorie_id, nom et prix sont requis.' }, 422)
  }
  if (body.prix < 0 || body.prix > 9999999) {
    return c.json({ error: 'Prix invalide.' }, 422)
  }

  // Vérifier que la catégorie appartient au tenant
  const cat = await c.env.DB
    .prepare('SELECT id FROM categories_menu WHERE id = ? AND tenant_id = ?')
    .bind(body.categorie_id, auth.tenant_id)
    .first()

  if (!cat) return c.json({ error: 'Catégorie introuvable.' }, 404)

  const count = await c.env.DB
    .prepare('SELECT COUNT(*) as cnt FROM produits WHERE categorie_id = ? AND tenant_id = ?')
    .bind(body.categorie_id, auth.tenant_id)
    .first<{ cnt: number }>()

  const prodId = crypto.randomUUID()
  const now = new Date().toISOString()

  await c.env.DB.prepare(`
    INSERT INTO produits (id, tenant_id, categorie_id, nom, description, prix, disponible, ordre_affichage, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    prodId, auth.tenant_id, body.categorie_id,
    body.nom.trim(), body.description?.trim() ?? null,
    body.prix, body.disponible ? 1 : 1,
    count?.cnt ?? 0, now, now
  ).run()

  // Invalider cache
  try { if (c.env.KV_CACHE) await c.env.KV_CACHE.delete(`menu:${auth.tenant_slug}`) } catch {}

  return c.json({ success: true, id: prodId }, 201)
})

// ---- GET/POST /api/v1/dashboard/livreurs ----
dashboardRouter.get('/livreurs', async (c) => {
  setSecurityHeaders(c)
  const auth = await verifyAuth(c)
  if (!auth) return c.json({ error: 'Non authentifié.' }, 401)

  const livreurs = await c.env.DB
    .prepare('SELECT id, nom, telephone, actif FROM livreurs WHERE tenant_id = ? ORDER BY nom ASC')
    .bind(auth.tenant_id)
    .all()

  return c.json({ livreurs: livreurs.results })
})

dashboardRouter.post('/livreurs', async (c) => {
  setSecurityHeaders(c)
  const auth = await verifyAuth(c)
  if (!auth) return c.json({ error: 'Non authentifié.' }, 401)

  let body: { nom?: string; telephone?: string }
  try { body = await c.req.json() } catch { return c.json({ error: 'JSON invalide.' }, 400) }

  if (!body.nom || body.nom.trim().length < 2) {
    return c.json({ error: 'Nom invalide.' }, 422)
  }
  if (!body.telephone || !/^\+?[0-9\s\-]{8,20}$/.test(body.telephone)) {
    return c.json({ error: 'Numéro de téléphone invalide.' }, 422)
  }

  const livId = crypto.randomUUID()
  const now = new Date().toISOString()

  await c.env.DB.prepare(`
    INSERT INTO livreurs (id, tenant_id, nom, telephone, actif, created_at, updated_at)
    VALUES (?, ?, ?, ?, 1, ?, ?)
  `).bind(livId, auth.tenant_id, body.nom.trim(), body.telephone.replace(/\s/g, ''), now, now).run()

  return c.json({ success: true, id: livId }, 201)
})

// ---- PATCH /api/v1/dashboard/apparence ----
dashboardRouter.patch('/apparence', async (c) => {
  setSecurityHeaders(c)
  const auth = await verifyAuth(c)
  if (!auth) return c.json({ error: 'Non authentifié.' }, 401)

  let body: { couleur_primaire?: string; couleur_secondaire?: string; logo_url?: string | null; banniere_url?: string | null }
  try { body = await c.req.json() } catch { return c.json({ error: 'JSON invalide.' }, 400) }

  // Validation couleurs
  const colorRegex = /^#[0-9A-Fa-f]{6}$/
  if (body.couleur_primaire && !colorRegex.test(body.couleur_primaire)) {
    return c.json({ error: 'Couleur primaire invalide (format #RRGGBB).' }, 422)
  }
  if (body.couleur_secondaire && !colorRegex.test(body.couleur_secondaire)) {
    return c.json({ error: 'Couleur secondaire invalide (format #RRGGBB).' }, 422)
  }

  const now = new Date().toISOString()
  await c.env.DB.prepare(`
    UPDATE tenants SET 
      couleur_primaire = COALESCE(?, couleur_primaire),
      couleur_secondaire = COALESCE(?, couleur_secondaire),
      logo_url = COALESCE(?, logo_url),
      banniere_url = COALESCE(?, banniere_url),
      updated_at = ?
    WHERE id = ?
  `).bind(
    body.couleur_primaire ?? null,
    body.couleur_secondaire ?? null,
    body.logo_url ?? null,
    body.banniere_url ?? null,
    now, auth.tenant_id
  ).run()

  // Invalider cache
  try { if (c.env.KV_CACHE) await c.env.KV_CACHE.delete(`tenant:${auth.tenant_slug}`) } catch {}

  return c.json({ success: true })
})

// ---- PATCH /api/v1/dashboard/parametres ----
dashboardRouter.patch('/parametres', async (c) => {
  setSecurityHeaders(c)
  const auth = await verifyAuth(c)
  if (!auth) return c.json({ error: 'Non authentifié.' }, 401)

  let body: { nom?: string; whatsapp_number?: string }
  try { body = await c.req.json() } catch { return c.json({ error: 'JSON invalide.' }, 400) }

  if (!body.nom || body.nom.trim().length < 2) {
    return c.json({ error: 'Nom invalide.' }, 422)
  }
  if (body.whatsapp_number && !/^\+?[0-9]{10,15}$/.test(body.whatsapp_number)) {
    return c.json({ error: 'Numéro WhatsApp invalide.' }, 422)
  }

  const now = new Date().toISOString()
  await c.env.DB.prepare(`
    UPDATE tenants SET nom = ?, whatsapp_number = COALESCE(?, whatsapp_number), updated_at = ?
    WHERE id = ?
  `).bind(body.nom.trim(), body.whatsapp_number ?? null, now, auth.tenant_id).run()

  // Invalider cache
  try { if (c.env.KV_CACHE) await c.env.KV_CACHE.delete(`tenant:${auth.tenant_slug}`) } catch {}

  return c.json({ success: true })
})

export { dashboardRouter }
