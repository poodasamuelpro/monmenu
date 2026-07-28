// API Tenants (Restaurants) — gestion publique + dashboard
// ARCHITECTURE :
//   • D1 (Cloudflare) → SITE WEB uniquement : config_globale, pays, plans
//   • Supabase (PostgreSQL) → APPLICATION : tenants, menu, points_de_vente, etc.
//
// FIX URGENT (statut Ouvert/Fermé incohérent entre le bandeau et les
// produits) — GET /:slug ne sélectionnait pas et ne renvoyait pas le champ
// "horaires" du point de vente. boutique.js recharge les infos tenant côté
// CLIENT via cet endpoint pour recalculer le statut sur chaque carte produit
// (estOuvertMaintenant, rappelé toutes les 60s) — comme pdv_horaires n'était
// jamais transmis ici, ce calcul recevait toujours "undefined" et affichait
// "Fermé" sur tous les produits, même quand le bandeau du haut (calculé côté
// serveur au premier rendu, avec les bonnes données) affichait "Ouvert".
// Deux lignes changées : le select() du join points_de_vente, et l'objet
// "result" renvoyé en JSON — voir les commentaires "FIX" ci-dessous.

import { Hono } from 'hono'
import type { Env } from '../types/database'
import { setSecurityHeaders } from '../lib/security'
import { createSupabaseAdminClient } from '../lib/supabase'

const tenantsRouter = new Hono<{ Bindings: Env }>()

// =============================================================
// GET /api/v1/tenants — Liste publique des restaurants actifs
// AJOUT : cet endpoint n'existait pas. Il est nécessaire pour la
// section "Restaurants partenaires" de la page d'accueil (home.ts),
// qui affiche les vrais logos des restaurants actifs — jamais de
// données inventées (cahier des charges, section 1.1/13). Tant
// qu'aucun restaurant n'est actif, elle renvoie un tableau vide et
// le frontend affiche un état vide honnête plutôt que des données
// fictives.
// Ne renvoie QUE des champs publics (pas de whatsapp_number, pas de
// metadata interne) : ce endpoint n'est pas authentifié.
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

  // SUPABASE — restaurants actifs uniquement (APPLICATION DATA)
  // "essai" est volontairement exclu de cette liste publique : un
  // restaurant en période d'essai ne doit pas être présenté comme
  // preuve sociale tant qu'il n'a pas confirmé son abonnement.
  const adminClient = createSupabaseAdminClient(c.env)
  const { data: tenants, error } = await adminClient
    .from('tenants')
    .select('nom, slug, logo_url')
    .eq('statut', 'actif')
    .is('deleted_at', null)
    .not('logo_url', 'is', null)
    .order('updated_at', { ascending: false })
    .limit(limit)

  if (error) {
    console.error('[Tenants] Erreur Supabase (liste publique):', error.message)
    return c.json({ tenants: [] })
  }

  const result = { tenants: tenants ?? [] }

  // Cache 5 minutes — cohérent avec le cache déjà utilisé sur GET /:slug
  try { if (c.env.KV_CACHE) await c.env.KV_CACHE.put(cacheKey, JSON.stringify(result), { expirationTtl: 300 }) } catch {}

  return c.json(result)
})

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

  // SUPABASE — tenant info (APPLICATION DATA)
  const adminClient = createSupabaseAdminClient(c.env)

  // FIX : "horaires" ajouté au select du join points_de_vente — c'est ce
  // champ précis qui manquait et cassait le calcul d'ouverture côté client.
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

  // D1 — info pays (SITE WEB DATA — pays table)
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
    // FIX : champ manquant — boutique.js s'en sert pour recalculer
    // dynamiquement le statut Ouvert/Fermé côté client (estOuvertMaintenant),
    // rappelé toutes les 60 secondes. Sans lui, undefined => toujours "Fermé"
    // sur les cartes produits, quel que soit le vrai statut du restaurant.
    pdv_horaires: pdv?.horaires ?? null
  }

  // Mettre en cache 5 minutes
  try { if (c.env.KV_CACHE) await c.env.KV_CACHE.put(cacheKey, JSON.stringify(result), { expirationTtl: 300 }) } catch {}

  return c.json(result)
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

  // SUPABASE — lookup tenant_id depuis le slug (APPLICATION DATA)
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

  // SUPABASE — catégories + produits (APPLICATION DATA)
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

  // Regrouper produits par catégorie
  const produitsByCategorie = new Map<string, any[]>()
  for (const produit of (produits ?? [])) {
    const list = produitsByCategorie.get(produit.categorie_id) ?? []
    list.push(produit)
    produitsByCategorie.set(produit.categorie_id, list)
  }

  const menu = (categories ?? []).map((cat) => ({
    ...cat,
    produits: produitsByCategorie.get(cat.id) ?? []
  }))

  const result = { categories: menu }

  // Cache 2 minutes
  try { if (c.env.KV_CACHE) await c.env.KV_CACHE.put(cacheKey, JSON.stringify(result), { expirationTtl: 120 }) } catch {}

  return c.json(result)
})

// GET /api/v1/tenants/:slug/qrcode — Info QR code
tenantsRouter.get('/:slug/qrcode', async (c) => {
  setSecurityHeaders(c)
  const slug = c.req.param('slug')

  // SUPABASE — tenant info (APPLICATION DATA)
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

  // §4 — URL dynamique via l'origine du Worker
  const url = `${new URL(c.req.url).origin}/${slug}`
  const color = (tenant.couleur_primaire ?? '#DC2626').replace('#', '')

  return c.json({
    url,
    nom: tenant.nom,
    couleur: tenant.couleur_primaire,
    qr_api_url: `https://api.qrserver.com/v1/create-qr-code/?size=400x400&data=${encodeURIComponent(url)}&color=${color}&bgcolor=ffffff`
  })
})

// POST /api/v1/tenants — Créer un tenant (inscription restaurant)
// NOTE: Ce endpoint est conservé pour compatibilité mais l'inscription principale
//       passe par api-auth.ts (POST /api/v1/auth/register) qui crée Supabase Auth + tenant
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
  const adminClient = createSupabaseAdminClient(c.env)

  // SUPABASE — Vérifier unicité du slug (APPLICATION DATA)
  const { data: existingSlug } = await adminClient
    .from('tenants')
    .select('id')
    .eq('slug', data.slug)
    .maybeSingle()

  if (existingSlug) {
    return c.json({ error: 'Ce nom de boutique est déjà utilisé.' }, 409)
  }

  // D1 — Plan gratuit par défaut (SITE WEB DATA — plans table)
  let planId: string | null = null
  let paysId: string | null = null
  try {
    const planGratuit = await c.env.DB
      .prepare("SELECT id FROM plans WHERE nom = 'Gratuit' OR ordre_affichage = 0 LIMIT 1")
      .first<{ id: string }>()
    planId = planGratuit?.id ?? null
  } catch { /* plans table may not exist yet */ }

  // D1 — Pays Burkina Faso par défaut (SITE WEB DATA — pays table)
  try {
    const pays = await c.env.DB
      .prepare("SELECT id FROM pays WHERE code_iso = 'BF' LIMIT 1")
      .first<{ id: string }>()
    paysId = pays?.id ?? null
  } catch { /* pays table may not exist yet */ }

  const tenantId = crypto.randomUUID()
  const now = new Date().toISOString()

  // SUPABASE — Créer le tenant (APPLICATION DATA)
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
      plan_id: planId,
      metadata: '{}',
      created_at: now,
      updated_at: now
    })

  if (insertError) {
    return c.json({ error: 'Erreur création restaurant.', detail: insertError.message }, 500)
  }

  // Invalider cache
  try { if (c.env.KV_CACHE) await c.env.KV_CACHE.delete(`tenant:${data.slug}`) } catch {}

  return c.json({ success: true, tenant_id: tenantId, slug: data.slug }, 201)
})

export { tenantsRouter }
