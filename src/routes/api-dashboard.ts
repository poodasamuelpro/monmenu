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
    const supabase = createSupabaseClient(c.env)
    const { data: { user }, error } = await supabase.auth.getUser(token)
    if (error || !user) return null

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
           statut, token_suivi, notes, livreur_id, created_at, updated_at
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

  // Total count
  let countQuery = 'SELECT COUNT(*) as cnt FROM commandes WHERE tenant_id = ? AND deleted_at IS NULL'
  const countParams: any[] = [auth.tenant_id]
  if (statut) { countQuery += ' AND statut = ?'; countParams.push(statut) }
  const countRow = await c.env.DB.prepare(countQuery).bind(...countParams).first<{ cnt: number }>()

  return c.json({
    commandes: commandes.results,
    page,
    limit,
    total: countRow?.cnt ?? 0
  })
})

// ---- PATCH /api/v1/dashboard/commandes/:id/statut — Mise à jour statut (AUTH REQUISE) ----
dashboardRouter.patch('/commandes/:id/statut', async (c) => {
  setSecurityHeaders(c)
  const auth = await verifyAuth(c)
  if (!auth) return c.json({ error: 'Non authentifié.' }, 401)

  const commandeId = c.req.param('id')
  let body: { statut?: string; livreur_id?: string; note?: string }
  try { body = await c.req.json() } catch { return c.json({ error: 'JSON invalide.' }, 400) }

  const statutsValides = ['confirmee', 'en_preparation', 'en_livraison', 'livree', 'annulee']
  if (!body.statut || !statutsValides.includes(body.statut)) {
    return c.json({ error: 'Statut invalide.' }, 422)
  }

  // Vérifier que la commande appartient bien au tenant authentifié
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

// ---- GET /api/v1/dashboard/commandes/export-csv ----
dashboardRouter.get('/commandes/export-csv', async (c) => {
  setSecurityHeaders(c)
  const auth = await verifyAuth(c)
  if (!auth) return c.json({ error: 'Non authentifié.' }, 401)

  const dateDebut = c.req.query('date_debut') ?? new Date(Date.now() - 30 * 86400000).toISOString().split('T')[0]
  const dateFin = c.req.query('date_fin') ?? new Date().toISOString().split('T')[0]

  const commandes = await c.env.DB.prepare(`
    SELECT id, client_nom, client_telephone, client_adresse,
           items_json, montant_total, frais_livraison, mode_paiement,
           statut, token_suivi, notes, created_at
    FROM commandes
    WHERE tenant_id = ? AND deleted_at IS NULL
      AND date(created_at) >= ? AND date(created_at) <= ?
    ORDER BY created_at DESC
    LIMIT 5000
  `).bind(auth.tenant_id, dateDebut, dateFin).all<any>()

  // Construire CSV
  const headers = ['ID', 'Date', 'Client', 'Téléphone', 'Adresse', 'Montant (FCFA)', 'Frais livraison', 'Paiement', 'Statut', 'Produits', 'Notes', 'Token suivi']
  const rows = commandes.results.map(cmd => {
    let produits = ''
    try {
      const items = JSON.parse(cmd.items_json)
      produits = items.map((it: any) => `${it.nom} x${it.quantite}`).join(' | ')
    } catch {}
    return [
      cmd.id,
      cmd.created_at,
      cmd.client_nom,
      cmd.client_telephone,
      cmd.client_adresse ?? '',
      cmd.montant_total,
      cmd.frais_livraison,
      cmd.mode_paiement,
      cmd.statut,
      produits,
      cmd.notes ?? '',
      cmd.token_suivi
    ].map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')
  })

  const csv = [headers.join(','), ...rows].join('\n')
  const filename = `commandes_${auth.tenant_slug}_${dateDebut}_${dateFin}.csv`

  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'X-Content-Type-Options': 'nosniff'
    }
  })
})

// ---- GET /api/v1/dashboard/stats ----
dashboardRouter.get('/stats', async (c) => {
  setSecurityHeaders(c)
  const auth = await verifyAuth(c)
  if (!auth) return c.json({ error: 'Non authentifié.' }, 401)

  const today = new Date().toISOString().split('T')[0]
  const monthStart = today.substring(0, 7) + '-01'

  const [statToday, statMonth, statTaux, statsJours, topProduits, caParStatut] = await Promise.all([
    c.env.DB.prepare(`
      SELECT COUNT(*) as cnt, COALESCE(SUM(montant_total), 0) as total
      FROM commandes WHERE tenant_id = ? AND date(created_at) = ? AND deleted_at IS NULL
    `).bind(auth.tenant_id, today).first<{ cnt: number; total: number }>(),

    c.env.DB.prepare(`
      SELECT COUNT(*) as cnt, COALESCE(SUM(montant_total), 0) as total
      FROM commandes
      WHERE tenant_id = ? AND date(created_at) >= ? AND deleted_at IS NULL
    `).bind(auth.tenant_id, monthStart).first<{ cnt: number; total: number }>(),

    c.env.DB.prepare(`
      SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN statut = 'livree' THEN 1 ELSE 0 END) as livrees,
        SUM(CASE WHEN statut = 'annulee' THEN 1 ELSE 0 END) as annulees
      FROM commandes WHERE tenant_id = ? AND deleted_at IS NULL
    `).bind(auth.tenant_id).first<{ total: number; livrees: number; annulees: number }>(),

    c.env.DB.prepare(`
      SELECT date(created_at) as jour, COUNT(*) as cnt, COALESCE(SUM(montant_total), 0) as ca
      FROM commandes WHERE tenant_id = ? AND date(created_at) >= date('now', '-29 days') AND deleted_at IS NULL
      GROUP BY date(created_at) ORDER BY jour ASC
    `).bind(auth.tenant_id).all<{ jour: string; cnt: number; ca: number }>(),

    // Top 5 produits (approximation via parsing items_json non possible en SQL pur — retourner nb commandes par jour)
    c.env.DB.prepare(`
      SELECT statut, COUNT(*) as cnt FROM commandes
      WHERE tenant_id = ? AND deleted_at IS NULL
      GROUP BY statut
    `).bind(auth.tenant_id).all<{ statut: string; cnt: number }>(),

    c.env.DB.prepare(`
      SELECT COUNT(*) as nb_produits FROM produits WHERE tenant_id = ? AND deleted_at IS NULL
    `).bind(auth.tenant_id).first<{ nb_produits: number }>()
  ])

  // Séries 30 jours
  const labels: string[] = []
  const values: number[] = []
  const caValues: number[] = []
  const mapJours = new Map(statsJours.results.map(r => [r.jour, { cnt: r.cnt, ca: r.ca }]))
  for (let i = 29; i >= 0; i--) {
    const d = new Date()
    d.setDate(d.getDate() - i)
    const key = d.toISOString().split('T')[0]
    labels.push(key.slice(5))
    const jour = mapJours.get(key)
    values.push(jour?.cnt ?? 0)
    caValues.push(jour?.ca ?? 0)
  }

  const taux = statTaux && statTaux.total > 0
    ? Math.round((statTaux.livrees / statTaux.total) * 100) : 0
  const tauxAnnulation = statTaux && statTaux.total > 0
    ? Math.round((statTaux.annulees / statTaux.total) * 100) : 0

  // Répartition par statut
  const statutsMap: Record<string, number> = {}
  for (const s of (topProduits.results || [])) { statutsMap[s.statut] = s.cnt }

  return c.json({
    today: statToday?.cnt ?? 0,
    ca_today: statToday?.total ?? 0,
    month: statMonth?.cnt ?? 0,
    ca_month: statMonth?.total ?? 0,
    taux_livraison: taux,
    taux_annulation: tauxAnnulation,
    nb_produits: (caParStatut as any)?.nb_produits ?? 0,
    statuts: statutsMap,
    labels,
    values,
    ca_values: caValues
  })
})

// ---- GET /api/v1/dashboard/menu — Liste catégories + produits ----
dashboardRouter.get('/menu', async (c) => {
  setSecurityHeaders(c)
  const auth = await verifyAuth(c)
  if (!auth) return c.json({ error: 'Non authentifié.' }, 401)

  const categories = await c.env.DB.prepare(`
    SELECT id, nom, description, ordre_affichage, actif, created_at
    FROM categories_menu
    WHERE tenant_id = ?
    ORDER BY ordre_affichage ASC, nom ASC
  `).bind(auth.tenant_id).all<any>()

  const produits = await c.env.DB.prepare(`
    SELECT p.id, p.categorie_id, p.nom, p.description, p.prix,
           p.photo_url, p.disponible, p.ordre_affichage, p.stock_actuel, p.created_at,
           c.nom as categorie_nom
    FROM produits p
    LEFT JOIN categories_menu c ON c.id = p.categorie_id
    WHERE p.tenant_id = ? AND p.deleted_at IS NULL
    ORDER BY p.ordre_affichage ASC, p.nom ASC
  `).bind(auth.tenant_id).all<any>()

  // Regrouper par catégorie
  const produitsByCategorie = new Map<string, any[]>()
  for (const p of produits.results) {
    const list = produitsByCategorie.get(p.categorie_id) ?? []
    list.push(p)
    produitsByCategorie.set(p.categorie_id, list)
  }

  const menuComplet = categories.results.map(cat => ({
    ...cat,
    produits: produitsByCategorie.get(cat.id) ?? []
  }))

  return c.json({
    categories: menuComplet,
    stats: {
      nb_categories: categories.results.length,
      nb_produits: produits.results.length
    }
  })
})

// ---- POST /api/v1/dashboard/categories ----
dashboardRouter.post('/categories', async (c) => {
  setSecurityHeaders(c)
  const auth = await verifyAuth(c)
  if (!auth) return c.json({ error: 'Non authentifié.' }, 401)

  let body: { nom?: string; description?: string }
  try { body = await c.req.json() } catch { return c.json({ error: 'JSON invalide.' }, 400) }

  if (!body.nom || body.nom.trim().length < 2) {
    return c.json({ error: 'Nom de catégorie invalide (2 caractères minimum).' }, 422)
  }

  const count = await c.env.DB
    .prepare('SELECT COUNT(*) as cnt FROM categories_menu WHERE tenant_id = ?')
    .bind(auth.tenant_id).first<{ cnt: number }>()

  const catId = crypto.randomUUID()
  const now = new Date().toISOString()

  await c.env.DB.prepare(`
    INSERT INTO categories_menu (id, tenant_id, nom, description, ordre_affichage, actif, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, 1, ?, ?)
  `).bind(catId, auth.tenant_id, body.nom.trim(), body.description?.trim() ?? null, (count?.cnt ?? 0), now, now).run()

  try { if (c.env.KV_CACHE) await c.env.KV_CACHE.delete(`menu:${auth.tenant_slug}`) } catch {}

  return c.json({ success: true, id: catId, nom: body.nom.trim() }, 201)
})

// ---- PATCH /api/v1/dashboard/categories/:id ----
dashboardRouter.patch('/categories/:id', async (c) => {
  setSecurityHeaders(c)
  const auth = await verifyAuth(c)
  if (!auth) return c.json({ error: 'Non authentifié.' }, 401)

  const catId = c.req.param('id')
  let body: { nom?: string; description?: string; actif?: boolean; ordre_affichage?: number }
  try { body = await c.req.json() } catch { return c.json({ error: 'JSON invalide.' }, 400) }

  const cat = await c.env.DB
    .prepare('SELECT id FROM categories_menu WHERE id = ? AND tenant_id = ?')
    .bind(catId, auth.tenant_id).first()

  if (!cat) return c.json({ error: 'Catégorie introuvable.' }, 404)

  const now = new Date().toISOString()
  await c.env.DB.prepare(`
    UPDATE categories_menu SET
      nom = COALESCE(?, nom),
      description = COALESCE(?, description),
      actif = COALESCE(?, actif),
      ordre_affichage = COALESCE(?, ordre_affichage),
      updated_at = ?
    WHERE id = ? AND tenant_id = ?
  `).bind(
    body.nom?.trim() ?? null,
    body.description?.trim() ?? null,
    body.actif !== undefined ? (body.actif ? 1 : 0) : null,
    body.ordre_affichage ?? null,
    now, catId, auth.tenant_id
  ).run()

  try { if (c.env.KV_CACHE) await c.env.KV_CACHE.delete(`menu:${auth.tenant_slug}`) } catch {}

  return c.json({ success: true })
})

// ---- DELETE /api/v1/dashboard/categories/:id ----
dashboardRouter.delete('/categories/:id', async (c) => {
  setSecurityHeaders(c)
  const auth = await verifyAuth(c)
  if (!auth) return c.json({ error: 'Non authentifié.' }, 401)

  const catId = c.req.param('id')

  // Vérifier si des produits existent dans cette catégorie
  const prodCount = await c.env.DB
    .prepare('SELECT COUNT(*) as cnt FROM produits WHERE categorie_id = ? AND tenant_id = ? AND deleted_at IS NULL')
    .bind(catId, auth.tenant_id).first<{ cnt: number }>()

  if ((prodCount?.cnt ?? 0) > 0) {
    return c.json({ error: 'Impossible de supprimer : la catégorie contient des produits.' }, 409)
  }

  await c.env.DB.prepare('DELETE FROM categories_menu WHERE id = ? AND tenant_id = ?')
    .bind(catId, auth.tenant_id).run()

  try { if (c.env.KV_CACHE) await c.env.KV_CACHE.delete(`menu:${auth.tenant_slug}`) } catch {}

  return c.json({ success: true })
})

// ---- POST /api/v1/dashboard/produits ----
dashboardRouter.post('/produits', async (c) => {
  setSecurityHeaders(c)
  const auth = await verifyAuth(c)
  if (!auth) return c.json({ error: 'Non authentifié.' }, 401)

  let body: { categorie_id?: string; nom?: string; description?: string; prix?: number; disponible?: boolean; photo_url?: string | null }
  try { body = await c.req.json() } catch { return c.json({ error: 'JSON invalide.' }, 400) }

  if (!body.categorie_id || !body.nom || body.prix === undefined) {
    return c.json({ error: 'categorie_id, nom et prix sont requis.' }, 422)
  }
  if (typeof body.prix !== 'number' || body.prix < 0 || body.prix > 9999999) {
    return c.json({ error: 'Prix invalide.' }, 422)
  }

  const cat = await c.env.DB
    .prepare('SELECT id FROM categories_menu WHERE id = ? AND tenant_id = ?')
    .bind(body.categorie_id, auth.tenant_id).first()

  if (!cat) return c.json({ error: 'Catégorie introuvable.' }, 404)

  const count = await c.env.DB
    .prepare('SELECT COUNT(*) as cnt FROM produits WHERE categorie_id = ? AND tenant_id = ?')
    .bind(body.categorie_id, auth.tenant_id).first<{ cnt: number }>()

  const prodId = crypto.randomUUID()
  const now = new Date().toISOString()

  await c.env.DB.prepare(`
    INSERT INTO produits (id, tenant_id, categorie_id, nom, description, prix, photo_url, disponible, ordre_affichage, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    prodId, auth.tenant_id, body.categorie_id,
    body.nom.trim(), body.description?.trim() ?? null,
    body.prix,
    body.photo_url ?? null,
    body.disponible !== false ? 1 : 0,
    count?.cnt ?? 0, now, now
  ).run()

  try { if (c.env.KV_CACHE) await c.env.KV_CACHE.delete(`menu:${auth.tenant_slug}`) } catch {}

  return c.json({ success: true, id: prodId }, 201)
})

// ---- PATCH /api/v1/dashboard/produits/:id ----
dashboardRouter.patch('/produits/:id', async (c) => {
  setSecurityHeaders(c)
  const auth = await verifyAuth(c)
  if (!auth) return c.json({ error: 'Non authentifié.' }, 401)

  const prodId = c.req.param('id')
  let body: { nom?: string; description?: string; prix?: number; disponible?: boolean; photo_url?: string | null; ordre_affichage?: number; categorie_id?: string }
  try { body = await c.req.json() } catch { return c.json({ error: 'JSON invalide.' }, 400) }

  const prod = await c.env.DB
    .prepare('SELECT id FROM produits WHERE id = ? AND tenant_id = ? AND deleted_at IS NULL')
    .bind(prodId, auth.tenant_id).first()

  if (!prod) return c.json({ error: 'Produit introuvable.' }, 404)

  if (body.prix !== undefined && (typeof body.prix !== 'number' || body.prix < 0 || body.prix > 9999999)) {
    return c.json({ error: 'Prix invalide.' }, 422)
  }

  const now = new Date().toISOString()
  await c.env.DB.prepare(`
    UPDATE produits SET
      nom = COALESCE(?, nom),
      description = COALESCE(?, description),
      prix = COALESCE(?, prix),
      photo_url = COALESCE(?, photo_url),
      disponible = COALESCE(?, disponible),
      ordre_affichage = COALESCE(?, ordre_affichage),
      categorie_id = COALESCE(?, categorie_id),
      updated_at = ?
    WHERE id = ? AND tenant_id = ?
  `).bind(
    body.nom?.trim() ?? null,
    body.description?.trim() ?? null,
    body.prix ?? null,
    body.photo_url !== undefined ? (body.photo_url ?? null) : null,
    body.disponible !== undefined ? (body.disponible ? 1 : 0) : null,
    body.ordre_affichage ?? null,
    body.categorie_id ?? null,
    now, prodId, auth.tenant_id
  ).run()

  try { if (c.env.KV_CACHE) await c.env.KV_CACHE.delete(`menu:${auth.tenant_slug}`) } catch {}

  return c.json({ success: true })
})

// ---- DELETE /api/v1/dashboard/produits/:id ----
dashboardRouter.delete('/produits/:id', async (c) => {
  setSecurityHeaders(c)
  const auth = await verifyAuth(c)
  if (!auth) return c.json({ error: 'Non authentifié.' }, 401)

  const prodId = c.req.param('id')
  const now = new Date().toISOString()

  // Soft delete
  const result = await c.env.DB.prepare(`
    UPDATE produits SET deleted_at = ?, updated_at = ?
    WHERE id = ? AND tenant_id = ? AND deleted_at IS NULL
  `).bind(now, now, prodId, auth.tenant_id).run()

  if (result.meta.changes === 0) return c.json({ error: 'Produit introuvable.' }, 404)

  try { if (c.env.KV_CACHE) await c.env.KV_CACHE.delete(`menu:${auth.tenant_slug}`) } catch {}

  return c.json({ success: true })
})

// ---- GET/POST /api/v1/dashboard/livreurs ----
dashboardRouter.get('/livreurs', async (c) => {
  setSecurityHeaders(c)
  const auth = await verifyAuth(c)
  if (!auth) return c.json({ error: 'Non authentifié.' }, 401)

  const livreurs = await c.env.DB
    .prepare('SELECT id, nom, whatsapp_number, actif, created_at FROM livreurs WHERE tenant_id = ? ORDER BY nom ASC')
    .bind(auth.tenant_id).all()

  return c.json({ livreurs: livreurs.results })
})

dashboardRouter.post('/livreurs', async (c) => {
  setSecurityHeaders(c)
  const auth = await verifyAuth(c)
  if (!auth) return c.json({ error: 'Non authentifié.' }, 401)

  let body: { nom?: string; whatsapp_number?: string }
  try { body = await c.req.json() } catch { return c.json({ error: 'JSON invalide.' }, 400) }

  if (!body.nom || body.nom.trim().length < 2) return c.json({ error: 'Nom invalide.' }, 422)
  if (!body.whatsapp_number || !/^\+?[0-9\s\-]{8,20}$/.test(body.whatsapp_number)) {
    return c.json({ error: 'Numéro WhatsApp invalide.' }, 422)
  }

  const livId = crypto.randomUUID()
  const now = new Date().toISOString()

  await c.env.DB.prepare(`
    INSERT INTO livreurs (id, tenant_id, nom, whatsapp_number, actif, created_at, updated_at)
    VALUES (?, ?, ?, ?, 1, ?, ?)
  `).bind(livId, auth.tenant_id, body.nom.trim(), body.whatsapp_number.replace(/\s/g, ''), now, now).run()

  return c.json({ success: true, id: livId }, 201)
})

dashboardRouter.delete('/livreurs/:id', async (c) => {
  setSecurityHeaders(c)
  const auth = await verifyAuth(c)
  if (!auth) return c.json({ error: 'Non authentifié.' }, 401)

  const livId = c.req.param('id')
  await c.env.DB.prepare('DELETE FROM livreurs WHERE id = ? AND tenant_id = ?')
    .bind(livId, auth.tenant_id).run()

  return c.json({ success: true })
})

// ---- PATCH /api/v1/dashboard/livreurs/:id — Activer / désactiver un livreur ----
dashboardRouter.patch('/livreurs/:id', async (c) => {
  setSecurityHeaders(c)
  const auth = await verifyAuth(c)
  if (!auth) return c.json({ error: 'Non authentifié.' }, 401)

  const livId = c.req.param('id')
  let body: { actif?: number }
  try { body = await c.req.json() } catch { return c.json({ error: 'JSON invalide.' }, 400) }

  if (body.actif === undefined || ![0, 1].includes(body.actif)) {
    return c.json({ error: 'Champ actif requis (0 ou 1).' }, 422)
  }

  // Vérifier appartenance au tenant
  const livreur = await c.env.DB
    .prepare('SELECT id FROM livreurs WHERE id = ? AND tenant_id = ?')
    .bind(livId, auth.tenant_id).first()

  if (!livreur) return c.json({ error: 'Livreur introuvable.' }, 404)

  const now = new Date().toISOString()
  await c.env.DB.prepare('UPDATE livreurs SET actif = ?, updated_at = ? WHERE id = ? AND tenant_id = ?')
    .bind(body.actif, now, livId, auth.tenant_id).run()

  return c.json({ success: true, actif: body.actif })
})

// ---- GET /api/v1/dashboard/pdv — Récupérer point de vente ----
dashboardRouter.get('/pdv', async (c) => {
  setSecurityHeaders(c)
  const auth = await verifyAuth(c)
  if (!auth) return c.json({ error: 'Non authentifié.' }, 401)

  const pdv = await c.env.DB.prepare(`
    SELECT id, nom, adresse, latitude, longitude,
           tarif_livraison_base, tarif_par_km, horaires, actif
    FROM points_de_vente
    WHERE tenant_id = ? AND actif = 1
    ORDER BY created_at ASC
    LIMIT 1
  `).bind(auth.tenant_id).first<any>()

  return c.json({ pdv: pdv ?? null })
})

// ---- PATCH /api/v1/dashboard/pdv — Configurer point de vente ----
dashboardRouter.patch('/pdv', async (c) => {
  setSecurityHeaders(c)
  const auth = await verifyAuth(c)
  if (!auth) return c.json({ error: 'Non authentifié.' }, 401)

  let body: {
    nom?: string; adresse?: string;
    latitude?: number | null; longitude?: number | null;
    tarif_livraison_base?: number; tarif_par_km?: number;
    horaires?: string
  }
  try { body = await c.req.json() } catch { return c.json({ error: 'JSON invalide.' }, 400) }

  // Valider coordonnées si fournies
  if (body.latitude !== undefined && body.latitude !== null) {
    if (typeof body.latitude !== 'number' || body.latitude < -90 || body.latitude > 90) {
      return c.json({ error: 'Latitude invalide (-90 à 90).' }, 422)
    }
  }
  if (body.longitude !== undefined && body.longitude !== null) {
    if (typeof body.longitude !== 'number' || body.longitude < -180 || body.longitude > 180) {
      return c.json({ error: 'Longitude invalide (-180 à 180).' }, 422)
    }
  }

  const now = new Date().toISOString()

  // Vérifier si PDV existe
  const existingPdv = await c.env.DB
    .prepare('SELECT id FROM points_de_vente WHERE tenant_id = ? LIMIT 1')
    .bind(auth.tenant_id).first<{ id: string }>()

  if (!existingPdv) {
    // Créer un nouveau PDV
    const pdvId = crypto.randomUUID()
    await c.env.DB.prepare(`
      INSERT INTO points_de_vente (id, tenant_id, nom, adresse, latitude, longitude,
        tarif_livraison_base, tarif_par_km, horaires, actif, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
    `).bind(
      pdvId, auth.tenant_id,
      body.nom ?? 'Mon restaurant', body.adresse ?? '',
      body.latitude ?? null, body.longitude ?? null,
      body.tarif_livraison_base ?? 500, body.tarif_par_km ?? 200,
      body.horaires ?? null, now, now
    ).run()

    // Mettre à jour la commande avec le PDV
    try { if (c.env.KV_CACHE) await c.env.KV_CACHE.delete(`tenant:${auth.tenant_slug}`) } catch {}
    return c.json({ success: true, pdv_id: pdvId, created: true })
  }

  await c.env.DB.prepare(`
    UPDATE points_de_vente SET
      nom = COALESCE(?, nom),
      adresse = COALESCE(?, adresse),
      latitude = COALESCE(?, latitude),
      longitude = COALESCE(?, longitude),
      tarif_livraison_base = COALESCE(?, tarif_livraison_base),
      tarif_par_km = COALESCE(?, tarif_par_km),
      horaires = COALESCE(?, horaires),
      updated_at = ?
    WHERE tenant_id = ?
  `).bind(
    body.nom?.trim() ?? null, body.adresse?.trim() ?? null,
    body.latitude ?? null, body.longitude ?? null,
    body.tarif_livraison_base ?? null, body.tarif_par_km ?? null,
    body.horaires ?? null, now, auth.tenant_id
  ).run()

  try { if (c.env.KV_CACHE) await c.env.KV_CACHE.delete(`tenant:${auth.tenant_slug}`) } catch {}

  return c.json({ success: true })
})

// ---- PATCH /api/v1/dashboard/apparence ----
dashboardRouter.patch('/apparence', async (c) => {
  setSecurityHeaders(c)
  const auth = await verifyAuth(c)
  if (!auth) return c.json({ error: 'Non authentifié.' }, 401)

  let body: { couleur_primaire?: string; couleur_secondaire?: string; logo_url?: string | null; banniere_url?: string | null }
  try { body = await c.req.json() } catch { return c.json({ error: 'JSON invalide.' }, 400) }

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
    body.couleur_primaire ?? null, body.couleur_secondaire ?? null,
    body.logo_url !== undefined ? body.logo_url : null,
    body.banniere_url !== undefined ? body.banniere_url : null,
    now, auth.tenant_id
  ).run()

  try { if (c.env.KV_CACHE) await c.env.KV_CACHE.delete(`tenant:${auth.tenant_slug}`) } catch {}

  return c.json({ success: true })
})

// ---- PATCH /api/v1/dashboard/parametres ----
dashboardRouter.patch('/parametres', async (c) => {
  setSecurityHeaders(c)
  const auth = await verifyAuth(c)
  if (!auth) return c.json({ error: 'Non authentifié.' }, 401)

  let body: { nom?: string; whatsapp_number?: string; domaine_perso?: string | null }
  try { body = await c.req.json() } catch { return c.json({ error: 'JSON invalide.' }, 400) }

  if (!body.nom || body.nom.trim().length < 2) return c.json({ error: 'Nom invalide.' }, 422)
  if (body.whatsapp_number && !/^\+?[0-9]{10,15}$/.test(body.whatsapp_number)) {
    return c.json({ error: 'Numéro WhatsApp invalide.' }, 422)
  }

  const now = new Date().toISOString()
  await c.env.DB.prepare(`
    UPDATE tenants SET
      nom = ?,
      whatsapp_number = COALESCE(?, whatsapp_number),
      domaine_perso = COALESCE(?, domaine_perso),
      updated_at = ?
    WHERE id = ?
  `).bind(body.nom.trim(), body.whatsapp_number ?? null, body.domaine_perso ?? null, now, auth.tenant_id).run()

  try { if (c.env.KV_CACHE) await c.env.KV_CACHE.delete(`tenant:${auth.tenant_slug}`) } catch {}

  return c.json({ success: true })
})

// ---- GET /api/v1/dashboard/profil — Info tenant + plan actuel ----
dashboardRouter.get('/profil', async (c) => {
  setSecurityHeaders(c)
  const auth = await verifyAuth(c)
  if (!auth) return c.json({ error: 'Non authentifié.' }, 401)

  const tenant = await c.env.DB.prepare(`
    SELECT t.id, t.nom, t.slug, t.logo_url, t.banniere_url,
           t.couleur_primaire, t.couleur_secondaire,
           t.whatsapp_number, t.domaine_perso, t.statut, t.created_at,
           pl.nom as plan_nom, pl.fonctionnalites as plan_features,
           pl.commandes_incluses, pl.prix_mensuel,
           pdv.id as pdv_id, pdv.nom as pdv_nom, pdv.adresse as pdv_adresse,
           pdv.latitude as pdv_latitude, pdv.longitude as pdv_longitude
    FROM tenants t
    LEFT JOIN plans pl ON pl.id = t.plan_id
    LEFT JOIN points_de_vente pdv ON pdv.tenant_id = t.id AND pdv.actif = 1
    WHERE t.id = ?
  `).bind(auth.tenant_id).first<any>()

  if (!tenant) return c.json({ error: 'Restaurant introuvable.' }, 404)

  // Stats rapides
  const stats = await c.env.DB.prepare(`
    SELECT COUNT(*) as total_commandes
    FROM commandes WHERE tenant_id = ? AND deleted_at IS NULL
  `).bind(auth.tenant_id).first<{ total_commandes: number }>()

  return c.json({
    ...tenant,
    boutique_url: `https://monmenu.app/${tenant.slug}`,
    total_commandes: stats?.total_commandes ?? 0
  })
})

// ---- GET /api/v1/dashboard/codes-promo — Liste codes promo ----
dashboardRouter.get('/codes-promo', async (c) => {
  setSecurityHeaders(c)
  const auth = await verifyAuth(c)
  if (!auth) return c.json({ error: 'Non authentifié.' }, 401)

  const codes = await c.env.DB.prepare(`
    SELECT id, code, type, valeur, date_debut, date_fin,
           usage_max, usage_actuel, actif, created_at
    FROM codes_promo
    WHERE tenant_id = ?
    ORDER BY created_at DESC
  `).bind(auth.tenant_id).all<any>()

  return c.json({ codes: codes.results })
})

// ---- POST /api/v1/dashboard/codes-promo — Créer un code promo ----
dashboardRouter.post('/codes-promo', async (c) => {
  setSecurityHeaders(c)
  const auth = await verifyAuth(c)
  if (!auth) return c.json({ error: 'Non authentifié.' }, 401)

  let body: { code?: string; type?: string; valeur?: number; date_fin?: string | null; usage_max?: number | null }
  try { body = await c.req.json() } catch { return c.json({ error: 'JSON invalide.' }, 400) }

  if (!body.code || !/^[A-Z0-9\-]{3,20}$/i.test(body.code)) {
    return c.json({ error: 'Code promo invalide (3-20 caractères alphanumériques/tirets).' }, 422)
  }
  if (!body.type || !['pourcentage', 'montant_fixe'].includes(body.type)) {
    return c.json({ error: 'Type invalide (pourcentage ou montant_fixe).' }, 422)
  }
  if (body.valeur === undefined || typeof body.valeur !== 'number' || body.valeur <= 0) {
    return c.json({ error: 'Valeur invalide.' }, 422)
  }
  if (body.type === 'pourcentage' && body.valeur > 100) {
    return c.json({ error: 'Pourcentage ne peut dépasser 100.' }, 422)
  }

  // Vérifier unicité
  const existing = await c.env.DB
    .prepare('SELECT id FROM codes_promo WHERE tenant_id = ? AND code = ?')
    .bind(auth.tenant_id, body.code.toUpperCase()).first()
  if (existing) return c.json({ error: 'Ce code promo existe déjà.' }, 409)

  const promoId = crypto.randomUUID()
  const now = new Date().toISOString()

  await c.env.DB.prepare(`
    INSERT INTO codes_promo (id, tenant_id, code, type, valeur, date_debut, date_fin, usage_max, usage_actuel, actif, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, 1, ?)
  `).bind(promoId, auth.tenant_id, body.code.toUpperCase(), body.type, body.valeur,
    now, body.date_fin ?? null, body.usage_max ?? null, now).run()

  return c.json({ success: true, id: promoId, code: body.code.toUpperCase() }, 201)
})

// ---- DELETE /api/v1/dashboard/codes-promo/:id ----
dashboardRouter.delete('/codes-promo/:id', async (c) => {
  setSecurityHeaders(c)
  const auth = await verifyAuth(c)
  if (!auth) return c.json({ error: 'Non authentifié.' }, 401)

  const promoId = c.req.param('id')
  await c.env.DB.prepare('DELETE FROM codes_promo WHERE id = ? AND tenant_id = ?')
    .bind(promoId, auth.tenant_id).run()

  return c.json({ success: true })
})

// ---- POST /api/v1/dashboard/upload-image — Upload image vers R2 ----
dashboardRouter.post('/upload-image', async (c) => {
  setSecurityHeaders(c)
  const auth = await verifyAuth(c)
  if (!auth) return c.json({ error: 'Non authentifié.' }, 401)

  if (!c.env.R2_MEDIA) {
    return c.json({ error: 'Stockage médias non configuré.' }, 503)
  }

  // Rate limit upload : 20/heure par tenant
  const rateLimit = await checkRateLimit(`upload:${auth.tenant_id}`, 20, 3600000)
  if (!rateLimit.allowed) return c.json({ error: 'Trop de téléversements. Réessayez dans une heure.' }, 429)

  let formData: FormData
  try {
    formData = await c.req.formData()
  } catch {
    return c.json({ error: 'Formulaire multipart invalide.' }, 400)
  }

  const file = formData.get('file') as File | null
  if (!file) return c.json({ error: 'Fichier manquant (champ "file" requis).' }, 400)

  // Validation type MIME
  const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif']
  if (!allowedTypes.includes(file.type)) {
    return c.json({ error: 'Format non supporté. Utilisez JPEG, PNG, WebP ou GIF.' }, 415)
  }

  // Taille max : 5 MB
  const MAX_SIZE = 5 * 1024 * 1024
  if (file.size > MAX_SIZE) {
    return c.json({ error: 'Fichier trop volumineux (max 5 MB).' }, 413)
  }

  const ext = file.type.split('/')[1].replace('jpeg', 'jpg')
  const key = `${auth.tenant_id}/${Date.now()}-${crypto.randomUUID().slice(0, 8)}.${ext}`

  const buffer = await file.arrayBuffer()

  await c.env.R2_MEDIA.put(key, buffer, {
    httpMetadata: { contentType: file.type },
    customMetadata: { tenant_id: auth.tenant_id, uploaded_at: new Date().toISOString() }
  })

  // URL publique (configure ton domaine R2 ou utilise l'API publique)
  const publicUrl = `https://media.monmenu.app/${key}`

  return c.json({ success: true, url: publicUrl, key }, 201)
})

// ---- GET /api/v1/dashboard/qrcode — Info QR code avec URL publique ----
dashboardRouter.get('/qrcode', async (c) => {
  setSecurityHeaders(c)
  const auth = await verifyAuth(c)
  if (!auth) return c.json({ error: 'Non authentifié.' }, 401)

  const tenant = await c.env.DB.prepare(`
    SELECT nom, slug, couleur_primaire FROM tenants WHERE id = ?
  `).bind(auth.tenant_id).first<{ nom: string; slug: string; couleur_primaire: string }>()

  if (!tenant) return c.json({ error: 'Restaurant introuvable.' }, 404)

  const boutiqueUrl = `https://monmenu.app/${tenant.slug}`
  const color = tenant.couleur_primaire.replace('#', '')

  return c.json({
    boutique_url: boutiqueUrl,
    slug: tenant.slug,
    nom: tenant.nom,
    couleur: tenant.couleur_primaire,
    qr_standard: `https://api.qrserver.com/v1/create-qr-code/?size=400x400&data=${encodeURIComponent(boutiqueUrl)}&bgcolor=ffffff`,
    qr_color: `https://api.qrserver.com/v1/create-qr-code/?size=400x400&data=${encodeURIComponent(boutiqueUrl)}&color=${color}&bgcolor=ffffff`,
    qr_download_png: `https://api.qrserver.com/v1/create-qr-code/?size=600x600&data=${encodeURIComponent(boutiqueUrl)}&color=${color}&bgcolor=ffffff&format=png`,
    qr_download_svg: `https://api.qrserver.com/v1/create-qr-code/?size=400x400&data=${encodeURIComponent(boutiqueUrl)}&color=${color}&bgcolor=ffffff&format=svg`
  })
})

export { dashboardRouter }
