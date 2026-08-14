// API Dashboard — Routes protégées pour le tableau de bord restaurant 
// ARCHITECTURE :
//   • D1 (Cloudflare) → SITE WEB uniquement : config_globale, pays
//   • Supabase (PostgreSQL) → APPLICATION : tenants, commandes, menu,
//     livreurs, plans, supplements, etc.
//
// §2 — Auth via cookie httpOnly "sb-access-token" (flux navigateur) OU
//      header Authorization: Bearer (clients API/mobile), cookie prioritaire.
// §2.CSRF — Protection CSRF sur les routes d'écriture (POST/PATCH/DELETE).
//
// MIGRATION PLANS — GET /profil et PATCH /parametres résolvent désormais
// le plan directement via chargerPlan() (src/lib/plans.ts, Supabase
// uniquement). Plus de résolution D1.
//
// AJOUT — SUPPLÉMENTS : CRUD complet par produit
//   GET    /produits/:id/supplements   — liste des suppléments d'un produit
//   POST   /produits/:id/supplements   — créer un supplément
//   PATCH  /supplements/:id            — modifier / activer / désactiver
//   DELETE /supplements/:id            — supprimer (soft delete)
//
// Livreurs : PATCH /livreurs/:id accepte déjà "actif", "nom" et
// "whatsapp_number" indépendamment (aucune régression, comportement
// inchangé — le frontend dashboard.js expose maintenant un bouton
// "Modifier" qui utilise cette route existante).
//
// CORRECTIF CRITIQUE (401 setup-restaurant / notifications) — Un tenant
// qui vient de choisir un PLAN PAYANT à l'inscription a le statut
// 'en_attente_paiement_initial' tant qu'il n'a pas soumis son premier
// paiement (voir src/lib/acces-tenant.ts : accesComplet=false,
// accesAbonnementSeul=true dans ce cas). verifyAuth() exige
// accesComplet STRICTEMENT, ce qui bloquait alors avec un 401 :
//   - POST /setup-restaurant (onboarding étapes 1-4 de /bienvenue)
//   - GET  /notifications et /notifications/liste (bandeau de rappel)
// ...alors même que ces routes sont indispensables AVANT tout paiement.
// GET /profil fonctionnait car elle a son propre check permissif déjà en
// place — d'où l'incohérence observée (profil OK, setup-restaurant KO).
// Nouvelle fonction verifyAuthOnboarding() : accepte accesComplet OU
// accesAbonnementSeul, appliquée UNIQUEMENT à ces 3 routes. Toutes les
// autres routes opérationnelles (commandes, menu, stats, etc.) restent
// strictement verifyAuth() / accesComplet, comme avant.
//
// CORRECTIF BUG-2 (logo/bannière non enregistrés depuis /bienvenue) —
// POST /setup-restaurant appelait c.env.R2_MEDIA.put(...) pour le logo
// et la bannière SANS AUCUN try/catch, contrairement à POST
// /upload-image (route utilisée par Dashboard > Apparence, qui elle
// fonctionne correctement et reste inchangée ci-dessous). Chaque upload
// logo/bannière est désormais isolé dans son propre try/catch.
//
// CORRECTIF BUG-UPLOAD-BIENVENUE (2026-08) — Le BUG-2 ci-dessus réglait
// l'upload R2 lui-même, mais PAS l'écriture en base. POST
// /setup-restaurant écrivait via createSupabaseClientWithToken() (client
// RLS-scopé), qui matchait 0 ligne pour un tenant en
// 'en_attente_paiement_initial' (policy RLS pensée pour 'actif'/'essai'),
// SANS lever d'erreur (un UPDATE à 0 ligne affectée n'est pas une erreur
// PostgREST). La route répondait donc success:true + logo_enregistre:true
// alors que rien n'était écrit en base — le fichier était bien uploadé
// sur R2, mais jamais rattaché au tenant. Fix : écriture via le client
// SERVICE ROLE (l'autorisation est déjà vérifiée nous-mêmes par
// verifyAuthOnboarding juste avant), et vérification explicite qu'une
// ligne a bien été affectée. Le PDV (adresse/horaires/GPS) est désormais
// créé s'il n'existe pas encore, au lieu d'un simple UPDATE qui échouait
// silencieusement sur un tout nouveau compte sans PDV.
//
// CORRECTIF BUG-PDV-INACTIF (2026-08) — Variante du bug ci-dessus, restée
// dans la branche "UPDATE" du PDV : la recherche d'un PDV existant ne
// filtrait pas par "actif", mais l'UPDATE qui suivait filtrait, lui, par
// .eq('actif', true). Un PDV existant mais inactif faisait donc matcher
// existingPdv (→ pas de création), puis l'UPDATE ne touchait 0 ligne SANS
// ERREUR (même piège PostgREST que BUG-UPLOAD-BIENVENUE). Fix : suppression
// du filtre "actif" sur l'UPDATE (aligné sur PATCH /pdv qui ne filtre déjà
// pas dessus) + vérification explicite des lignes affectées, avec message
// d'avertissement si 0 ligne touchée.
//
// CORRECTIF BUG-CHANGE-PASSWORD (2026-08) — POST /profil/change-password
// renvoyait un 500 systématique. auth.getUser() et auth.updateUser()
// appelés SANS ARGUMENT exigent une session GoTrue déjà posée via
// setSession() ; createSupabaseClientWithToken() ne fait que poser un
// header Authorization global (pour PostgREST), il ne pose AUCUNE
// session GoTrue → ces appels levaient "Auth session missing!", une
// exception non catchée → 500 générique (exactement le 500 observé en
// prod). Fix : passer explicitement le token à getUser() (comme le fait
// déjà verifyAuth() avec succès ailleurs dans ce fichier), et utiliser
// l'API admin (service role) pour updateUser, qui n'a pas besoin de
// session. La vérification du mot de passe actuel (signInWithPassword)
// utilise désormais un client Supabase FRAIS (non mis en cache), au lieu
// du singleton partagé entre toutes les requêtes de l'isolate Workers.
//
// CORRECTIF BUG-CATCH-NOTIF (2026-08) — POST /profil/change-password
// plantait ENCORE en 500 après le fix ci-dessus, mais APRÈS que le mot de
// passe ait déjà été changé avec succès côté Supabase Auth. Cause :
// l'insertion de la notification "Mot de passe modifié" utilisait
// `.insert({...}).catch(() => {})`. Le retour de `.insert()` sur le
// client supabase-js est un PostgrestFilterBuilder : c'est un objet
// "thenable" (il a `.then()`), mais PAS une vraie instance de Promise —
// il n'expose pas de méthode `.catch()`. Une fois minifié/bundlé, cet
// appel levait `TypeError: c2.from(...).insert(...).catch is not a
// function`, exception non catchée → 500 générique, alors que le mot de
// passe avait déjà été mis à jour avec succès (d'où la confusion : échec
// annoncé au frontend malgré une opération réussie côté base). Fix :
// remplacement du `.catch()` chaîné par un `try/catch` classique autour
// du `await`, seule méthode fiable pour ignorer une erreur non bloquante
// sur ce type de builder.

import { Hono } from 'hono'
import { getCookie } from 'hono/cookie'
import { createClient } from '@supabase/supabase-js'
import type { Env } from '../types/database'
import { createSupabaseClient, createSupabaseClientWithToken, createSupabaseAdminClient } from '../lib/supabase'
import { setSecurityHeaders, checkRateLimit } from '../lib/security'
import { genererMessageLivreur, genererLienWhatsApp, envoyerNotificationWhatsApp } from '../lib/whatsapp'
import { verifierAccesTenant } from '../lib/acces-tenant'
import { chargerPlan } from '../lib/plans'

const dashboardRouter = new Hono<{ Bindings: Env }>()

const ACCESS_TOKEN_COOKIE = 'sb-access-token'

dashboardRouter.use('*', async (c, next) => {
  const method = c.req.method.toUpperCase()
  if (!['POST', 'PATCH', 'PUT', 'DELETE'].includes(method)) {
    return next()
  }
  const hasBearerToken = c.req.header('Authorization')?.startsWith('Bearer ')
  if (hasBearerToken) return next()

  const xRequestedWith = c.req.header('X-Requested-With')
  if (xRequestedWith !== 'XMLHttpRequest') {
    return c.json({
      error: 'Requête refusée. Header X-Requested-With: XMLHttpRequest requis sur les opérations d\'écriture.',
      code: 'CSRF_PROTECTION'
    }, 403)
  }
  return next()
})

function extractToken(c: any): string | null {
  const cookieToken = getCookie(c, ACCESS_TOKEN_COOKIE)
  if (cookieToken && cookieToken.length >= 20) return cookieToken.trim()

  const authHeader = c.req.header('Authorization')
  if (authHeader?.startsWith('Bearer ')) {
    const headerToken = authHeader.replace('Bearer ', '').trim()
    if (headerToken.length >= 20) return headerToken
  }

  return null
}

// ---- Middleware d'authentification (STRICT — accès complet requis) ----
async function verifyAuth(c: any): Promise<{ user_id: string; tenant_id: string; tenant_slug: string; token: string } | null> {
  const token = extractToken(c)
  if (!token) return null

  try {
    const supabase = createSupabaseClient(c.env)
    const { data: { user }, error } = await supabase.auth.getUser(token)
    if (error || !user) return null

    const adminClient = createSupabaseAdminClient(c.env)
    const { data: utData, error: utError } = await adminClient
      .from('utilisateurs_tenant')
      .select('tenant_id, tenants!inner(id, slug, deleted_at)')
      .eq('auth_user_id', user.id)
      .is('tenants.deleted_at', null)
      .single()

    if (utError || !utData) return null

    const tenant = utData.tenants as any

    const resultat = await verifierAccesTenant(c.env, utData.tenant_id)
    if (!resultat.accesComplet) return null

    return { user_id: user.id, tenant_id: utData.tenant_id, tenant_slug: tenant.slug, token }
  } catch { return null }
}

// ---- Middleware d'authentification ONBOARDING (PERMISSIF) ----
// Accepte accesComplet OU accesAbonnementSeul. Réservé aux routes
// nécessaires AVANT le premier paiement d'un compte ayant choisi un plan
// payant : configuration initiale du restaurant (setup-restaurant) et
// affichage des rappels/notifications (essai qui expire, paiement en
// attente, etc.), qui doivent rester visibles/utilisables pendant toute
// la phase 'en_attente_paiement_initial' ou 'bloque'.
// NE JAMAIS utiliser cette variante pour les routes opérationnelles
// (commandes, menu, stats, livreurs...) — celles-ci doivent rester
// strictement verifyAuth() / accesComplet.
async function verifyAuthOnboarding(c: any): Promise<{ user_id: string; tenant_id: string; tenant_slug: string; token: string } | null> {
  const token = extractToken(c)
  if (!token) return null

  try {
    const supabase = createSupabaseClient(c.env)
    const { data: { user }, error } = await supabase.auth.getUser(token)
    if (error || !user) return null

    const adminClient = createSupabaseAdminClient(c.env)
    const { data: utData, error: utError } = await adminClient
      .from('utilisateurs_tenant')
      .select('tenant_id, tenants!inner(id, slug, deleted_at)')
      .eq('auth_user_id', user.id)
      .is('tenants.deleted_at', null)
      .single()

    if (utError || !utData) return null
    const tenant = utData.tenants as any

    const resultat = await verifierAccesTenant(c.env, utData.tenant_id)
    if (!resultat.accesComplet && !resultat.accesAbonnementSeul) return null

    return { user_id: user.id, tenant_id: utData.tenant_id, tenant_slug: tenant.slug, token }
  } catch { return null }
}

// ---- GET /api/v1/dashboard/notifications ----
dashboardRouter.get('/notifications', async (c) => {
  setSecurityHeaders(c)
  const auth = await verifyAuthOnboarding(c)
  if (!auth) return c.json({ error: 'Non authentifié.' }, 401)

  const adminClient = createSupabaseAdminClient(c.env)
  const notifications: Array<{
    id: string; type: string; titre: string; message: string;
    action?: { label: string; href: string }; created_at: string
  }> = []

  const { data: tenant } = await adminClient
    .from('tenants')
    .select('statut, essai_expire_le, paiement_en_attente_depuis')
    .eq('id', auth.tenant_id)
    .single()

  if (tenant) {
    if (tenant.statut === 'essai' && tenant.essai_expire_le) {
      const joursRestants = Math.ceil(
        (new Date(tenant.essai_expire_le).getTime() - Date.now()) / 86400000
      )
      if (joursRestants <= 5) {
        notifications.push({
          id: 'essai-expire',
          type: joursRestants <= 2 ? 'error' : 'warning',
          titre: joursRestants <= 0 ? 'Essai expiré' : `Essai expire dans ${joursRestants} jour(s)`,
          message: joursRestants <= 0
            ? 'Votre période d\'essai est terminée. Activez votre abonnement.'
            : `Il vous reste ${joursRestants} jour(s) d\'essai gratuit.`,
          action: { label: 'Voir les plans', href: '/dashboard/abonnement' },
          created_at: new Date().toISOString()
        })
      }
    }
    if (tenant.paiement_en_attente_depuis) {
      notifications.push({
        id: 'paiement-attente',
        type: 'info',
        titre: 'Paiement en cours de vérification',
        message: 'Votre preuve de paiement est en cours d\'examen. Confirmation sous 48h max (accès maintenu 72h).',
        action: { label: 'Suivre', href: '/dashboard/abonnement' },
        created_at: tenant.paiement_en_attente_depuis
      })
    }
  }

  const { data: notifsDb } = await adminClient
    .from('notifications_restaurant')
    .select('id, type, titre, message, lue, lien, created_at')
    .eq('tenant_id', auth.tenant_id)
    .eq('lue', false)
    .order('created_at', { ascending: false })
    .limit(10)

  const notifsMapped = (notifsDb ?? []).map((n: any) => ({
    id: n.id, type: n.type, titre: n.titre, message: n.message,
    action: n.lien ? { label: 'Voir', href: n.lien } : undefined,
    created_at: n.created_at
  }))

  const toutes = [...notifications, ...notifsMapped]
  return c.json({ notifications: toutes, count: toutes.length })
})

// ---- GET /api/v1/dashboard/commandes ----
dashboardRouter.get('/commandes', async (c) => {
  setSecurityHeaders(c)
  const auth = await verifyAuth(c)
  if (!auth) return c.json({ error: 'Non authentifié.' }, 401)

  const statut = c.req.query('statut')
  const page = parseInt(c.req.query('page') || '1')
  const limit = 50
  const offset = (page - 1) * limit

  const supabase = createSupabaseClientWithToken(c.env, auth.token)

  let query = supabase
    .from('commandes')
    .select('id, client_nom, client_telephone, client_adresse, items_json, montant_total, frais_livraison, mode_paiement, statut, token_suivi, notes, livreur_id, created_at, updated_at', { count: 'exact' })
    .eq('tenant_id', auth.tenant_id)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1)

  if (statut) query = query.eq('statut', statut)

  const { data: commandes, count, error } = await query

  if (error) return c.json({ error: 'Erreur récupération commandes.', detail: error.message }, 500)

  return c.json({
    commandes: commandes ?? [],
    page,
    limit,
    total: count ?? 0
  })
})

// ---- PATCH /api/v1/dashboard/commandes/:id/statut ----
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

  const supabase = createSupabaseClientWithToken(c.env, auth.token)

  const { data: commande, error: fetchError } = await supabase
    .from('commandes')
    .select('id, statut, client_nom, client_telephone, client_adresse, client_latitude, client_longitude, items_json, montant_total, frais_livraison, token_suivi, livreur_id')
    .eq('id', commandeId)
    .eq('tenant_id', auth.tenant_id)
    .is('deleted_at', null)
    .single()

  if (fetchError || !commande) return c.json({ error: 'Commande introuvable.' }, 404)

  const now = new Date().toISOString()

  const updateData: any = { statut: body.statut, updated_at: now }
  if (body.livreur_id) updateData.livreur_id = body.livreur_id

  const { error: updateError } = await supabase
    .from('commandes')
    .update(updateData)
    .eq('id', commandeId)
    .eq('tenant_id', auth.tenant_id)

  if (updateError) return c.json({ error: 'Erreur mise à jour statut.', detail: updateError.message }, 500)

  const adminClient = createSupabaseAdminClient(c.env)
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

  let lienWhatsappLivreur: string | null = null
  const livreurIdCible = body.livreur_id ?? null
  if (livreurIdCible && body.statut === 'en_preparation') {
    try {
      const { data: livreur } = await adminClient
        .from('livreurs')
        .select('id, nom, whatsapp_number')
        .eq('id', livreurIdCible)
        .eq('tenant_id', auth.tenant_id)
        .maybeSingle()

      const { data: tenantInfo } = await adminClient
        .from('tenants')
        .select('nom, slug')
        .eq('id', auth.tenant_id)
        .single()

      if (livreur?.whatsapp_number && tenantInfo) {
        const origin = new URL(c.req.url).origin
        const messageLivreur = genererMessageLivreur(commande as any, tenantInfo as any, origin)

        c.executionCtx.waitUntil(
          envoyerNotificationWhatsApp(livreur.whatsapp_number, messageLivreur, c.env).catch(() => {})
        )

        lienWhatsappLivreur = genererLienWhatsApp(livreur.whatsapp_number, messageLivreur)
      }
    } catch {
      // Ne jamais faire échouer la mise à jour de statut à cause d'une
      // erreur de notification livreur.
    }
  }

  return c.json({
    success: true,
    statut: body.statut,
    ...(lienWhatsappLivreur ? { lien_whatsapp_livreur: lienWhatsappLivreur } : {})
  })
})

// ---- GET /api/v1/dashboard/commandes/export-csv ----
dashboardRouter.get('/commandes/export-csv', async (c) => {
  setSecurityHeaders(c)
  const auth = await verifyAuth(c)
  if (!auth) return c.json({ error: 'Non authentifié.' }, 401)

  const dateDebut = c.req.query('date_debut') ?? new Date(Date.now() - 30 * 86400000).toISOString().split('T')[0]
  const dateFin = c.req.query('date_fin') ?? new Date().toISOString().split('T')[0]

  const supabase = createSupabaseClientWithToken(c.env, auth.token)

  const { data: commandes, error } = await supabase
    .from('commandes')
    .select('id, client_nom, client_telephone, client_adresse, items_json, montant_total, frais_livraison, mode_paiement, statut, token_suivi, notes, created_at')
    .eq('tenant_id', auth.tenant_id)
    .is('deleted_at', null)
    .gte('created_at', `${dateDebut}T00:00:00Z`)
    .lte('created_at', `${dateFin}T23:59:59Z`)
    .order('created_at', { ascending: false })
    .limit(5000)

  if (error) return c.json({ error: 'Erreur export CSV.', detail: error.message }, 500)

  const headers = ['ID', 'Date', 'Client', 'Téléphone', 'Adresse', 'Montant (FCFA)', 'Frais livraison', 'Paiement', 'Statut', 'Produits', 'Notes', 'Token suivi']
  const rows = (commandes ?? []).map(cmd => {
    let produits = ''
    try {
      const items = typeof cmd.items_json === 'string' ? JSON.parse(cmd.items_json) : cmd.items_json
      produits = items.map((it: any) => {
        const supp = it.supplements?.length ? ` (+ ${it.supplements.map((s: any) => s.nom).join(', ')})` : ''
        return `${it.nom}${supp} x${it.quantite}`
      }).join(' | ')
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
    ].map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(',')
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

  const supabase = createSupabaseClientWithToken(c.env, auth.token)

  const today = new Date().toISOString().split('T')[0]
  const monthStart = today.substring(0, 7) + '-01'
  const thirtyDaysAgo = new Date(Date.now() - 29 * 86400000).toISOString().split('T')[0]

  const [
    { data: allCommandes },
    { data: todayCommandes },
    { data: monthCommandes },
    { data: last30Days },
    { data: nbProduits }
  ] = await Promise.all([
    supabase
      .from('commandes')
      .select('statut, montant_total')
      .eq('tenant_id', auth.tenant_id)
      .is('deleted_at', null),

    supabase
      .from('commandes')
      .select('montant_total')
      .eq('tenant_id', auth.tenant_id)
      .is('deleted_at', null)
      .gte('created_at', `${today}T00:00:00Z`)
      .lte('created_at', `${today}T23:59:59Z`),

    supabase
      .from('commandes')
      .select('montant_total')
      .eq('tenant_id', auth.tenant_id)
      .is('deleted_at', null)
      .gte('created_at', `${monthStart}T00:00:00Z`),

    supabase
      .from('commandes')
      .select('created_at, montant_total')
      .eq('tenant_id', auth.tenant_id)
      .is('deleted_at', null)
      .gte('created_at', `${thirtyDaysAgo}T00:00:00Z`)
      .order('created_at', { ascending: true }),

    supabase
      .from('produits')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', auth.tenant_id)
      .is('deleted_at', null)
  ])

  const caToday = (todayCommandes ?? []).reduce((s, c) => s + (c.montant_total ?? 0), 0)
  const caMonth = (monthCommandes ?? []).reduce((s, c) => s + (c.montant_total ?? 0), 0)

  const totalAll = (allCommandes ?? []).length
  const livrees = (allCommandes ?? []).filter(c => c.statut === 'livree').length
  const annulees = (allCommandes ?? []).filter(c => c.statut === 'annulee').length
  const statutsMap: Record<string, number> = {}
  for (const c of (allCommandes ?? [])) {
    statutsMap[c.statut] = (statutsMap[c.statut] ?? 0) + 1
  }

  const labels: string[] = []
  const values: number[] = []
  const caValues: number[] = []
  const dayMap = new Map<string, { cnt: number; ca: number }>()
  for (const cmd of (last30Days ?? [])) {
    const jour = cmd.created_at.split('T')[0]
    const prev = dayMap.get(jour) ?? { cnt: 0, ca: 0 }
    dayMap.set(jour, { cnt: prev.cnt + 1, ca: prev.ca + (cmd.montant_total ?? 0) })
  }
  for (let i = 29; i >= 0; i--) {
    const d = new Date()
    d.setDate(d.getDate() - i)
    const key = d.toISOString().split('T')[0]
    labels.push(key.slice(5))
    const jour = dayMap.get(key)
    values.push(jour?.cnt ?? 0)
    caValues.push(jour?.ca ?? 0)
  }

  return c.json({
    today: todayCommandes?.length ?? 0,
    ca_today: caToday,
    month: monthCommandes?.length ?? 0,
    ca_month: caMonth,
    taux_livraison: totalAll > 0 ? Math.round((livrees / totalAll) * 100) : 0,
    taux_annulation: totalAll > 0 ? Math.round((annulees / totalAll) * 100) : 0,
    nb_produits: nbProduits ?? 0,
    statuts: statutsMap,
    labels,
    values,
    ca_values: caValues
  })
})

// ---- GET /api/v1/dashboard/menu ----
dashboardRouter.get('/menu', async (c) => {
  setSecurityHeaders(c)
  const auth = await verifyAuth(c)
  if (!auth) return c.json({ error: 'Non authentifié.' }, 401)

  // [session-3] Corr#9 — Pagination au niveau des produits
  const page = Math.max(1, parseInt(c.req.query('page') ?? '1'))
  const limit = Math.min(100, Math.max(1, parseInt(c.req.query('limit') ?? '100')))
  const offset = (page - 1) * limit

  const supabase = createSupabaseClientWithToken(c.env, auth.token)

  const [{ data: categories, error: catError }, { data: produits, error: prodError, count: prodCount }] = await Promise.all([
    supabase
      .from('categories_menu')
      .select('id, nom, description, ordre_affichage, actif, created_at')
      .eq('tenant_id', auth.tenant_id)
      .order('ordre_affichage', { ascending: true }),

    supabase
      .from('produits')
      .select('id, categorie_id, nom, description, prix, photo_url, disponible, ordre_affichage, created_at, categories_menu!inner(nom)', { count: 'exact' })
      .eq('tenant_id', auth.tenant_id)
      .is('deleted_at', null)
      .order('ordre_affichage', { ascending: true })
      .range(offset, offset + limit - 1)
  ])

  if (catError) return c.json({ error: 'Erreur récupération menu.', detail: catError.message }, 500)

  const produitsByCategorie = new Map<string, any[]>()
  for (const p of (produits ?? [])) {
    const categorie_nom = (p.categories_menu as any)?.nom ?? ''
    const produitFormatted = { ...p, categorie_nom }
    delete produitFormatted.categories_menu
    const list = produitsByCategorie.get(p.categorie_id) ?? []
    list.push(produitFormatted)
    produitsByCategorie.set(p.categorie_id, list)
  }

  const menuComplet = (categories ?? []).map(cat => ({
    ...cat,
    produits: produitsByCategorie.get(cat.id) ?? []
  }))

  return c.json({
    categories: menuComplet,
    stats: {
      nb_categories: categories?.length ?? 0,
      nb_produits: produits?.length ?? 0
    },
    pagination: { page, limit, total: prodCount ?? 0, pages: Math.ceil((prodCount ?? 0) / limit) }
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

  const supabase = createSupabaseClientWithToken(c.env, auth.token)

  const { count } = await supabase
    .from('categories_menu')
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', auth.tenant_id)

  const catId = crypto.randomUUID()
  const now = new Date().toISOString()

  const { error } = await supabase
    .from('categories_menu')
    .insert({
      id: catId,
      tenant_id: auth.tenant_id,
      nom: body.nom.trim(),
      description: body.description?.trim() ?? null,
      ordre_affichage: count ?? 0,
      actif: true,
      created_at: now,
      updated_at: now
    })

  if (error) return c.json({ error: 'Erreur création catégorie.', detail: error.message }, 500)

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

  const supabase = createSupabaseClientWithToken(c.env, auth.token)

  const { data: cat } = await supabase
    .from('categories_menu')
    .select('id')
    .eq('id', catId)
    .eq('tenant_id', auth.tenant_id)
    .single()

  if (!cat) return c.json({ error: 'Catégorie introuvable.' }, 404)

  const updateData: any = { updated_at: new Date().toISOString() }
  if (body.nom !== undefined) updateData.nom = body.nom.trim()
  if (body.description !== undefined) updateData.description = body.description?.trim() ?? null
  if (body.actif !== undefined) updateData.actif = body.actif
  if (body.ordre_affichage !== undefined) updateData.ordre_affichage = body.ordre_affichage

  const { error } = await supabase
    .from('categories_menu')
    .update(updateData)
    .eq('id', catId)
    .eq('tenant_id', auth.tenant_id)

  if (error) return c.json({ error: 'Erreur mise à jour catégorie.', detail: error.message }, 500)

  try { if (c.env.KV_CACHE) await c.env.KV_CACHE.delete(`menu:${auth.tenant_slug}`) } catch {}

  return c.json({ success: true })
})

// ---- DELETE /api/v1/dashboard/categories/:id ----
dashboardRouter.delete('/categories/:id', async (c) => {
  setSecurityHeaders(c)
  const auth = await verifyAuth(c)
  if (!auth) return c.json({ error: 'Non authentifié.' }, 401)

  const catId = c.req.param('id')
  const supabase = createSupabaseClientWithToken(c.env, auth.token)

  const { count: prodCount } = await supabase
    .from('produits')
    .select('id', { count: 'exact', head: true })
    .eq('categorie_id', catId)
    .eq('tenant_id', auth.tenant_id)
    .is('deleted_at', null)

  if ((prodCount ?? 0) > 0) {
    return c.json({ error: 'Impossible de supprimer : la catégorie contient des produits.' }, 409)
  }

  const { error } = await supabase
    .from('categories_menu')
    .delete()
    .eq('id', catId)
    .eq('tenant_id', auth.tenant_id)

  if (error) return c.json({ error: 'Erreur suppression catégorie.', detail: error.message }, 500)

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

  const supabase = createSupabaseClientWithToken(c.env, auth.token)

  const { data: cat } = await supabase
    .from('categories_menu')
    .select('id')
    .eq('id', body.categorie_id)
    .eq('tenant_id', auth.tenant_id)
    .single()

  if (!cat) return c.json({ error: 'Catégorie introuvable.' }, 404)

  const { count } = await supabase
    .from('produits')
    .select('id', { count: 'exact', head: true })
    .eq('categorie_id', body.categorie_id)
    .eq('tenant_id', auth.tenant_id)

  const prodId = crypto.randomUUID()
  const now = new Date().toISOString()

  const { error } = await supabase
    .from('produits')
    .insert({
      id: prodId,
      tenant_id: auth.tenant_id,
      categorie_id: body.categorie_id,
      nom: body.nom.trim(),
      description: body.description?.trim() ?? null,
      prix: body.prix,
      photo_url: body.photo_url ?? null,
      disponible: body.disponible !== false,
      ordre_affichage: count ?? 0,
      created_at: now,
      updated_at: now
    })

  if (error) return c.json({ error: 'Erreur création produit.', detail: error.message }, 500)

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

  const supabase = createSupabaseClientWithToken(c.env, auth.token)

  const { data: prod } = await supabase
    .from('produits')
    .select('id')
    .eq('id', prodId)
    .eq('tenant_id', auth.tenant_id)
    .is('deleted_at', null)
    .single()

  if (!prod) return c.json({ error: 'Produit introuvable.' }, 404)

  if (body.prix !== undefined && (typeof body.prix !== 'number' || body.prix < 0 || body.prix > 9999999)) {
    return c.json({ error: 'Prix invalide.' }, 422)
  }

  const updateData: any = { updated_at: new Date().toISOString() }
  if (body.nom !== undefined) updateData.nom = body.nom.trim()
  if (body.description !== undefined) updateData.description = body.description?.trim() ?? null
  if (body.prix !== undefined) updateData.prix = body.prix
  if (body.photo_url !== undefined) updateData.photo_url = body.photo_url
  if (body.disponible !== undefined) updateData.disponible = body.disponible
  if (body.ordre_affichage !== undefined) updateData.ordre_affichage = body.ordre_affichage
  if (body.categorie_id !== undefined) updateData.categorie_id = body.categorie_id

  const { error } = await supabase
    .from('produits')
    .update(updateData)
    .eq('id', prodId)
    .eq('tenant_id', auth.tenant_id)

  if (error) return c.json({ error: 'Erreur mise à jour produit.', detail: error.message }, 500)

  try { if (c.env.KV_CACHE) await c.env.KV_CACHE.delete(`menu:${auth.tenant_slug}`) } catch {}

  return c.json({ success: true })
})

// ---- DELETE /api/v1/dashboard/produits/:id ----
dashboardRouter.delete('/produits/:id', async (c) => {
  setSecurityHeaders(c)
  const auth = await verifyAuth(c)
  if (!auth) return c.json({ error: 'Non authentifié.' }, 401)

  const prodId = c.req.param('id')
  const supabase = createSupabaseClientWithToken(c.env, auth.token)

  const { error, data } = await supabase
    .from('produits')
    .update({ deleted_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq('id', prodId)
    .eq('tenant_id', auth.tenant_id)
    .is('deleted_at', null)
    .select('id')

  if (error) return c.json({ error: 'Erreur suppression produit.', detail: error.message }, 500)
  if (!data || data.length === 0) return c.json({ error: 'Produit introuvable.' }, 404)

  try { if (c.env.KV_CACHE) await c.env.KV_CACHE.delete(`menu:${auth.tenant_slug}`) } catch {}

  return c.json({ success: true })
})

// ============================================================
// AJOUT — SUPPLÉMENTS (CRUD par produit)
// ============================================================

// ---- GET /api/v1/dashboard/produits/:id/supplements ----
dashboardRouter.get('/produits/:id/supplements', async (c) => {
  setSecurityHeaders(c)
  const auth = await verifyAuth(c)
  if (!auth) return c.json({ error: 'Non authentifié.' }, 401)

  const produitId = c.req.param('id')
  const supabase = createSupabaseClientWithToken(c.env, auth.token)

  const { data: produit } = await supabase
    .from('produits')
    .select('id')
    .eq('id', produitId)
    .eq('tenant_id', auth.tenant_id)
    .is('deleted_at', null)
    .single()
  if (!produit) return c.json({ error: 'Produit introuvable.' }, 404)

  const { data: supplements, error } = await supabase
    .from('supplements')
    .select('id, nom, prix, actif, ordre_affichage')
    .eq('produit_id', produitId)
    .eq('tenant_id', auth.tenant_id)
    .is('deleted_at', null)
    .order('ordre_affichage', { ascending: true })

  if (error) return c.json({ error: 'Erreur récupération suppléments.', detail: error.message }, 500)
  return c.json({ supplements: supplements ?? [] })
})

// ---- POST /api/v1/dashboard/produits/:id/supplements ----
dashboardRouter.post('/produits/:id/supplements', async (c) => {
  setSecurityHeaders(c)
  const auth = await verifyAuth(c)
  if (!auth) return c.json({ error: 'Non authentifié.' }, 401)

  const produitId = c.req.param('id')
  let body: { nom?: string; prix?: number }
  try { body = await c.req.json() } catch { return c.json({ error: 'JSON invalide.' }, 400) }

  if (!body.nom || body.nom.trim().length < 1 || body.nom.trim().length > 100) {
    return c.json({ error: 'Nom du supplément invalide (1 à 100 caractères).' }, 422)
  }
  if (typeof body.prix !== 'number' || body.prix < 0 || body.prix > 999999) {
    return c.json({ error: 'Prix invalide.' }, 422)
  }

  const supabase = createSupabaseClientWithToken(c.env, auth.token)

  const { data: produit } = await supabase
    .from('produits')
    .select('id')
    .eq('id', produitId)
    .eq('tenant_id', auth.tenant_id)
    .is('deleted_at', null)
    .single()
  if (!produit) return c.json({ error: 'Produit introuvable.' }, 404)

  const { count } = await supabase
    .from('supplements')
    .select('id', { count: 'exact', head: true })
    .eq('produit_id', produitId)
    .is('deleted_at', null)

  const supId = crypto.randomUUID()
  const now = new Date().toISOString()

  const { error } = await supabase
    .from('supplements')
    .insert({
      id: supId,
      tenant_id: auth.tenant_id,
      produit_id: produitId,
      nom: body.nom.trim(),
      prix: body.prix,
      actif: true,
      ordre_affichage: count ?? 0,
      created_at: now,
      updated_at: now
    })

  if (error) return c.json({ error: 'Erreur création supplément.', detail: error.message }, 500)

  try { if (c.env.KV_CACHE) await c.env.KV_CACHE.delete(`menu:${auth.tenant_slug}`) } catch {}
  return c.json({ success: true, id: supId }, 201)
})

// ---- PATCH /api/v1/dashboard/supplements/:id — modifier / activer / désactiver ----
dashboardRouter.patch('/supplements/:id', async (c) => {
  setSecurityHeaders(c)
  const auth = await verifyAuth(c)
  if (!auth) return c.json({ error: 'Non authentifié.' }, 401)

  const supId = c.req.param('id')
  let body: { nom?: string; prix?: number; actif?: boolean; ordre_affichage?: number }
  try { body = await c.req.json() } catch { return c.json({ error: 'JSON invalide.' }, 400) }

  if (body.nom !== undefined && (body.nom.trim().length < 1 || body.nom.trim().length > 100)) {
    return c.json({ error: 'Nom invalide (1 à 100 caractères).' }, 422)
  }
  if (body.prix !== undefined && (typeof body.prix !== 'number' || body.prix < 0 || body.prix > 999999)) {
    return c.json({ error: 'Prix invalide.' }, 422)
  }

  const supabase = createSupabaseClientWithToken(c.env, auth.token)

  const { data: sup } = await supabase
    .from('supplements')
    .select('id')
    .eq('id', supId)
    .eq('tenant_id', auth.tenant_id)
    .is('deleted_at', null)
    .single()
  if (!sup) return c.json({ error: 'Supplément introuvable.' }, 404)

  const updateData: any = { updated_at: new Date().toISOString() }
  if (body.nom !== undefined) updateData.nom = body.nom.trim()
  if (body.prix !== undefined) updateData.prix = body.prix
  if (body.actif !== undefined) updateData.actif = body.actif
  if (body.ordre_affichage !== undefined) updateData.ordre_affichage = body.ordre_affichage

  const { error } = await supabase
    .from('supplements')
    .update(updateData)
    .eq('id', supId)
    .eq('tenant_id', auth.tenant_id)

  if (error) return c.json({ error: 'Erreur mise à jour supplément.', detail: error.message }, 500)

  try { if (c.env.KV_CACHE) await c.env.KV_CACHE.delete(`menu:${auth.tenant_slug}`) } catch {}
  return c.json({ success: true })
})

// ---- DELETE /api/v1/dashboard/supplements/:id ----
dashboardRouter.delete('/supplements/:id', async (c) => {
  setSecurityHeaders(c)
  const auth = await verifyAuth(c)
  if (!auth) return c.json({ error: 'Non authentifié.' }, 401)

  const supId = c.req.param('id')
  const supabase = createSupabaseClientWithToken(c.env, auth.token)

  const { error, data } = await supabase
    .from('supplements')
    .update({ deleted_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq('id', supId)
    .eq('tenant_id', auth.tenant_id)
    .is('deleted_at', null)
    .select('id')

  if (error) return c.json({ error: 'Erreur suppression supplément.', detail: error.message }, 500)
  if (!data || data.length === 0) return c.json({ error: 'Supplément introuvable.' }, 404)

  try { if (c.env.KV_CACHE) await c.env.KV_CACHE.delete(`menu:${auth.tenant_slug}`) } catch {}
  return c.json({ success: true })
})

// ---- GET /api/v1/dashboard/livreurs ----
dashboardRouter.get('/livreurs', async (c) => {
  setSecurityHeaders(c)
  const auth = await verifyAuth(c)
  if (!auth) return c.json({ error: 'Non authentifié.' }, 401)

  // [session-3] Corr#9 — Pagination ajoutée
  const page = Math.max(1, parseInt(c.req.query('page') ?? '1'))
  const limit = Math.min(50, Math.max(1, parseInt(c.req.query('limit') ?? '50')))
  const offset = (page - 1) * limit

  const supabase = createSupabaseClientWithToken(c.env, auth.token)

  const { data: livreurs, error, count } = await supabase
    .from('livreurs')
    .select('id, nom, whatsapp_number, actif, created_at', { count: 'exact' })
    .eq('tenant_id', auth.tenant_id)
    .order('nom', { ascending: true })
    .range(offset, offset + limit - 1)

  if (error) return c.json({ error: 'Erreur récupération livreurs.', detail: error.message }, 500)

  return c.json({
    livreurs: livreurs ?? [],
    pagination: { page, limit, total: count ?? 0, pages: Math.ceil((count ?? 0) / limit) }
  })
})

// ---- POST /api/v1/dashboard/livreurs ----
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

  const supabase = createSupabaseClientWithToken(c.env, auth.token)
  const livId = crypto.randomUUID()
  const now = new Date().toISOString()

  const { error } = await supabase
    .from('livreurs')
    .insert({
      id: livId,
      tenant_id: auth.tenant_id,
      nom: body.nom.trim(),
      whatsapp_number: body.whatsapp_number.replace(/\s/g, ''),
      actif: true,
      created_at: now,
      updated_at: now
    })

  if (error) return c.json({ error: 'Erreur création livreur.', detail: error.message }, 500)

  return c.json({ success: true, id: livId }, 201)
})

// ---- DELETE /api/v1/dashboard/livreurs/:id ----
dashboardRouter.delete('/livreurs/:id', async (c) => {
  setSecurityHeaders(c)
  const auth = await verifyAuth(c)
  if (!auth) return c.json({ error: 'Non authentifié.' }, 401)

  const livId = c.req.param('id')
  const supabase = createSupabaseClientWithToken(c.env, auth.token)

  const { error } = await supabase
    .from('livreurs')
    .delete()
    .eq('id', livId)
    .eq('tenant_id', auth.tenant_id)

  if (error) return c.json({ error: 'Erreur suppression livreur.', detail: error.message }, 500)

  return c.json({ success: true })
})

// ---- PATCH /api/v1/dashboard/livreurs/:id — Modifier / Activer / désactiver ----
// Accepte, de façon indépendante : "actif", "nom" et/ou "whatsapp_number".
// Chaque champ n'est mis à jour que s'il est fourni dans le body.
dashboardRouter.patch('/livreurs/:id', async (c) => {
  setSecurityHeaders(c)
  const auth = await verifyAuth(c)
  if (!auth) return c.json({ error: 'Non authentifié.' }, 401)

  const livId = c.req.param('id')
  let body: { actif?: number | boolean; nom?: string; whatsapp_number?: string }
  try { body = await c.req.json() } catch { return c.json({ error: 'JSON invalide.' }, 400) }

  if (body.actif === undefined && body.nom === undefined && body.whatsapp_number === undefined) {
    return c.json({ error: 'Au moins un champ à modifier est requis (actif, nom ou whatsapp_number).' }, 422)
  }
  if (body.nom !== undefined && body.nom.trim().length < 2) {
    return c.json({ error: 'Nom invalide (2 caractères minimum).' }, 422)
  }
  if (body.whatsapp_number !== undefined && !/^\+?[0-9\s\-]{8,20}$/.test(body.whatsapp_number)) {
    return c.json({ error: 'Numéro WhatsApp invalide.' }, 422)
  }

  const supabase = createSupabaseClientWithToken(c.env, auth.token)

  const { data: livreur } = await supabase
    .from('livreurs')
    .select('id')
    .eq('id', livId)
    .eq('tenant_id', auth.tenant_id)
    .single()

  if (!livreur) return c.json({ error: 'Livreur introuvable.' }, 404)

  const updateData: any = { updated_at: new Date().toISOString() }
  if (body.actif !== undefined) updateData.actif = body.actif === 1 || body.actif === true
  if (body.nom !== undefined) updateData.nom = body.nom.trim()
  if (body.whatsapp_number !== undefined) updateData.whatsapp_number = body.whatsapp_number.replace(/\s/g, '')

  const { error } = await supabase
    .from('livreurs')
    .update(updateData)
    .eq('id', livId)
    .eq('tenant_id', auth.tenant_id)

  if (error) return c.json({ error: 'Erreur mise à jour livreur.', detail: error.message }, 500)

  return c.json({
    success: true,
    ...(updateData.actif !== undefined ? { actif: updateData.actif ? 1 : 0 } : {}),
    ...(updateData.nom !== undefined ? { nom: updateData.nom } : {}),
    ...(updateData.whatsapp_number !== undefined ? { whatsapp_number: updateData.whatsapp_number } : {})
  })
})

// ---- GET /api/v1/dashboard/pdv ----
dashboardRouter.get('/pdv', async (c) => {
  setSecurityHeaders(c)
  const auth = await verifyAuth(c)
  if (!auth) return c.json({ error: 'Non authentifié.' }, 401)

  const supabase = createSupabaseClientWithToken(c.env, auth.token)

  const { data: pdv, error } = await supabase
    .from('points_de_vente')
    .select('id, nom, adresse, latitude, longitude, tarif_livraison_base, tarif_par_km, horaires, actif')
    .eq('tenant_id', auth.tenant_id)
    .eq('actif', true)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()

  if (error) return c.json({ error: 'Erreur récupération PDV.', detail: error.message }, 500)

  return c.json({ pdv: pdv ?? null })
})

// ---- PATCH /api/v1/dashboard/pdv ----
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

  const supabase = createSupabaseClientWithToken(c.env, auth.token)
  const now = new Date().toISOString()

  const { data: existingPdv } = await supabase
    .from('points_de_vente')
    .select('id')
    .eq('tenant_id', auth.tenant_id)
    .limit(1)
    .maybeSingle()

  if (!existingPdv) {
    const pdvId = crypto.randomUUID()
    const { error } = await supabase
      .from('points_de_vente')
      .insert({
        id: pdvId,
        tenant_id: auth.tenant_id,
        nom: body.nom ?? 'Mon restaurant',
        adresse: body.adresse ?? '',
        latitude: body.latitude ?? null,
        longitude: body.longitude ?? null,
        tarif_livraison_base: body.tarif_livraison_base ?? 500,
        tarif_par_km: body.tarif_par_km ?? 200,
        horaires: body.horaires ?? null,
        actif: true,
        created_at: now,
        updated_at: now
      })

    if (error) return c.json({ error: 'Erreur création PDV.', detail: error.message }, 500)
    try { if (c.env.KV_CACHE) await c.env.KV_CACHE.delete(`tenant:${auth.tenant_slug}`) } catch {}
    return c.json({ success: true, pdv_id: pdvId, created: true })
  }

  const updateData: any = { updated_at: now }
  if (body.nom !== undefined) updateData.nom = body.nom.trim()
  if (body.adresse !== undefined) updateData.adresse = body.adresse.trim()
  if (body.latitude !== undefined) updateData.latitude = body.latitude
  if (body.longitude !== undefined) updateData.longitude = body.longitude
  if (body.tarif_livraison_base !== undefined) updateData.tarif_livraison_base = body.tarif_livraison_base
  if (body.tarif_par_km !== undefined) updateData.tarif_par_km = body.tarif_par_km
  if (body.horaires !== undefined) updateData.horaires = body.horaires

  const { error } = await supabase
    .from('points_de_vente')
    .update(updateData)
    .eq('tenant_id', auth.tenant_id)

  if (error) return c.json({ error: 'Erreur mise à jour PDV.', detail: error.message }, 500)

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

  // [session-3] Corr#8a — switch vers adminClient (bypass RLS) + vérification rowCount
  // Le client RLS (createSupabaseClientWithToken) retournait succès silencieux si la
  // politique RLS bloquait l'update (0 lignes modifiées, pas d'erreur).
  const adminClient = createSupabaseAdminClient(c.env)

  const updateData: any = { updated_at: new Date().toISOString() }
  if (body.couleur_primaire !== undefined) updateData.couleur_primaire = body.couleur_primaire
  if (body.couleur_secondaire !== undefined) updateData.couleur_secondaire = body.couleur_secondaire
  if (body.logo_url !== undefined) updateData.logo_url = body.logo_url
  if (body.banniere_url !== undefined) updateData.banniere_url = body.banniere_url

  const { data: updated, error } = await adminClient
    .from('tenants')
    .update(updateData)
    .eq('id', auth.tenant_id)
    .is('deleted_at', null)
    .select('id')

  if (error) return c.json({ error: 'Erreur mise à jour apparence.', detail: error.message }, 500)
  if (!updated || updated.length === 0) return c.json({ error: 'Restaurant introuvable ou accès refusé.' }, 404)

  try { if (c.env.KV_CACHE) await c.env.KV_CACHE.delete(`tenant:${auth.tenant_slug}`) } catch {}

  return c.json({ success: true })
})

// ---- PATCH /api/v1/dashboard/parametres ----
// MIGRATION — vérification du plan "Mogho" via chargerPlan() (Supabase),
// plus de résolution D1.
dashboardRouter.patch('/parametres', async (c) => {
  setSecurityHeaders(c)
  const auth = await verifyAuth(c)
  if (!auth) return c.json({ error: 'Non authentifié.' }, 401)

  let body: { nom?: string; whatsapp_number?: string }
  try { body = await c.req.json() } catch { return c.json({ error: 'JSON invalide.' }, 400) }

  if (!body.nom || body.nom.trim().length < 2) return c.json({ error: 'Nom invalide.' }, 422)
  if (body.whatsapp_number && !/^\+?[0-9]{10,15}$/.test(body.whatsapp_number)) {
    return c.json({ error: 'Numéro WhatsApp invalide.' }, 422)
  }

  const supabase = createSupabaseClientWithToken(c.env, auth.token)

  // [session-3] domaine_perso supprimé — toute logique de validation/mise à jour retirée

  const updateData: any = { nom: body.nom.trim(), updated_at: new Date().toISOString() }
  if (body.whatsapp_number !== undefined) updateData.whatsapp_number = body.whatsapp_number

  const { error } = await supabase
    .from('tenants')
    .update(updateData)
    .eq('id', auth.tenant_id)

  if (error) return c.json({ error: 'Erreur mise à jour paramètres.', detail: error.message }, 500)

  try { if (c.env.KV_CACHE) await c.env.KV_CACHE.delete(`tenant:${auth.tenant_slug}`) } catch {}

  return c.json({ success: true })
})

// ---- GET /api/v1/dashboard/profil ----
// MIGRATION — résolution du plan via chargerPlan() (Supabase uniquement,
// UUID natif de tenant.plan_id), plus de résolution D1.
dashboardRouter.get('/profil', async (c) => {
  setSecurityHeaders(c)

  const token = extractToken(c)
  if (!token) return c.json({ error: 'Non authentifié.' }, 401)

  const supabase = createSupabaseClient(c.env)
  const { data: { user }, error: userError } = await supabase.auth.getUser(token)
  if (userError || !user) return c.json({ error: 'Non authentifié.' }, 401)

  const adminClient = createSupabaseAdminClient(c.env)
  const { data: utData, error: utError } = await adminClient
    .from('utilisateurs_tenant')
    .select('tenant_id, tenants!inner(slug, deleted_at)')
    .eq('auth_user_id', user.id)
    .is('tenants.deleted_at', null)
    .single()

  if (utError || !utData) return c.json({ error: 'Restaurant introuvable.' }, 404)

  // /profil est une lecture inoffensive (nom, couleurs, logo) — accessible
  // dans TOUS les cas où le tenant est résolu, y compris 'bloque' et
  // 'suspendu', pour que la sidebar affiche toujours le nom du restaurant.
  const resultat = await verifierAccesTenant(c.env, utData.tenant_id)
  if (resultat.mode === 'introuvable') return c.json({ error: 'Compte inactif.' }, 403)

  const tenantId = utData.tenant_id
  const supabaseToken = createSupabaseClientWithToken(c.env, token)

  const { data: tenant, error: tenantError } = await supabaseToken
    .from('tenants')
    .select('id, nom, slug, logo_url, banniere_url, couleur_primaire, couleur_secondaire, whatsapp_number, statut, created_at, plan_id')
    .eq('id', tenantId)
    .maybeSingle()

  const tenantFinal = tenant ?? (await adminClient
    .from('tenants')
    .select('id, nom, slug, logo_url, banniere_url, couleur_primaire, couleur_secondaire, whatsapp_number, statut, created_at, plan_id')
    .eq('id', tenantId)
    .maybeSingle()).data

  if (!tenantFinal) return c.json({ error: 'Restaurant introuvable.' }, 404)

  // MIGRATION — chargerPlan() lit directement Supabase (plus de D1)
  const planActuel = await chargerPlan(c.env, tenantFinal.plan_id)

  const { data: pdv } = await adminClient
    .from('points_de_vente')
    .select('id, nom, adresse, latitude, longitude, horaires')
    .eq('tenant_id', tenantId)
    .eq('actif', true)
    .limit(1)
    .maybeSingle()

  const { count: totalCommandes } = await adminClient
    .from('commandes')
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', tenantId)
    .is('deleted_at', null)

  return c.json({
    ...tenantFinal,
    plan_nom: planActuel?.nom ?? null,
    plan_features: planActuel?.fonctionnalites ?? null,
    commandes_incluses: planActuel?.commandes_incluses ?? null,
    prix_mensuel: planActuel?.prix_mensuel ?? null,
    pdv_id: pdv?.id ?? null,
    pdv_nom: pdv?.nom ?? null,
    pdv_adresse: pdv?.adresse ?? null,
    pdv_latitude: pdv?.latitude ?? null,
    pdv_longitude: pdv?.longitude ?? null,
    horaires: pdv?.horaires ?? null,
    boutique_url: `/${tenantFinal.slug}`,
    total_commandes: totalCommandes ?? 0,
    mode_acces: resultat.mode
  })
})

// ---- POST /api/v1/dashboard/profil/change-password ----
// Le restaurant change lui-même son mot de passe depuis /dashboard/parametres,
// en fournissant son mot de passe actuel (ré-authentification) + le nouveau.
//
// CORRECTIF (2026-08) — voir le commentaire détaillé en tête de fichier
// ("CORRECTIF BUG-CHANGE-PASSWORD"). Résumé :
//   1. getUser() est appelé avec le token explicitement (au lieu de sans
//      argument), sinon "Auth session missing!" non catché → 500.
//   2. Le mot de passe est mis à jour via l'API admin
//      (auth.admin.updateUserById), qui n'exige aucune session — au lieu
//      de auth.updateUser() qui a le même problème que getUser() ci-dessus.
//   3. La vérification du mot de passe actuel (signInWithPassword)
//      utilise un client Supabase FRAIS et non partagé, pour ne jamais
//      poser de session sur le singleton mis en cache au niveau du module
//      (risque de fuite entre requêtes concurrentes dans la même isolate).
//   4. Rate limiting ajouté (5 tentatives / 15 min par utilisateur) —
//      cette route ré-authentifie via signInWithPassword et n'avait
//      auparavant AUCUNE limite, contrairement à /upload-image : un
//      compte déjà connecté pouvait tenter de deviner le mot de passe
//      actuel sans restriction.
//
// CORRECTIF BUG-CATCH-NOTIF (2026-08) — voir le commentaire détaillé en
// tête de fichier ("CORRECTIF BUG-CATCH-NOTIF"). Résumé : le
// PostgrestFilterBuilder retourné par .insert() n'a pas de méthode
// .catch() propre ; le `.catch(() => {})` chaîné après l'insert de la
// notification "Mot de passe modifié" levait donc un TypeError non
// catché → 500, alors que le mot de passe était déjà changé avec succès.
// Remplacé par un try/catch classique autour du await, qui ne fait
// jamais échouer la route en cas d'erreur d'insertion de notification.
dashboardRouter.post('/profil/change-password', async (c) => {
  setSecurityHeaders(c)
  const auth = await verifyAuth(c)
  if (!auth) return c.json({ error: 'Non authentifié.' }, 401)

  const rateLimit = await checkRateLimit(`change-password:${auth.user_id}`, 5, 900000, c.env.KV_CACHE)
  if (!rateLimit.allowed) {
    const secsRemaining = Math.ceil((rateLimit.resetAt - Date.now()) / 1000)
    return c.json({
      error: 'Trop de tentatives. Réessayez plus tard.',
      retry_after_seconds: secsRemaining
    }, 429)
  }

  let body: { current_password?: string; new_password?: string }
  try { body = await c.req.json() } catch { return c.json({ error: 'JSON invalide.' }, 400) }

  if (!body.current_password || !body.new_password) {
    return c.json({ error: 'Mot de passe actuel et nouveau mot de passe requis.' }, 422)
  }
  if (body.new_password.length < 8) {
    return c.json({ error: 'Nouveau mot de passe trop court (8 caractères minimum).' }, 422)
  }
  if (body.new_password === body.current_password) {
    return c.json({ error: 'Le nouveau mot de passe doit être différent de l\'ancien.' }, 422)
  }

  // Client frais, non caché : évite de poser la session de cet utilisateur
  // sur le singleton partagé de lib/supabase.ts, et permet de passer le
  // token explicitement à getUser() (voir correctif ci-dessus).
  const supabaseFrais = createClient(c.env.SUPABASE_URL, c.env.SUPABASE_ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false }
  })

  const { data: { user: currentUser }, error: getUserError } = await supabaseFrais.auth.getUser(auth.token)
  if (getUserError || !currentUser?.email) return c.json({ error: 'Utilisateur introuvable.' }, 404)

  const { error: signInError } = await supabaseFrais.auth.signInWithPassword({
    email: currentUser.email,
    password: body.current_password
  })
  if (signInError) return c.json({ error: 'Mot de passe actuel incorrect.' }, 401)

  const adminClient = createSupabaseAdminClient(c.env)
  const { error: updateError } = await adminClient.auth.admin.updateUserById(auth.user_id, {
    password: body.new_password
  })
  if (updateError) return c.json({ error: 'Erreur lors du changement de mot de passe.', detail: updateError.message }, 500)

  // FIX BUG-CATCH-NOTIF — try/catch classique au lieu de .catch() chaîné
  // (le builder Supabase n'expose pas de vraie méthode .catch()). Une
  // erreur ici est volontairement ignorée : elle ne doit jamais faire
  // échouer la réponse, le mot de passe étant déjà changé avec succès.
  try {
    await adminClient
      .from('notifications_restaurant')
      .insert({
        tenant_id: auth.tenant_id,
        type: 'info',
        titre: 'Mot de passe modifié',
        message: 'Votre mot de passe a été changé avec succès. Si vous n\'êtes pas à l\'origine de cette action, contactez le support immédiatement.',
        lien: '/dashboard/parametres'
      })
  } catch {
    // Non bloquant : le changement de mot de passe a déjà réussi.
  }

  return c.json({ success: true, message: 'Mot de passe mis à jour.' })
})

// ---- GET /api/v1/dashboard/codes-promo ----
dashboardRouter.get('/codes-promo', async (c) => {
  setSecurityHeaders(c)
  const auth = await verifyAuth(c)
  if (!auth) return c.json({ error: 'Non authentifié.' }, 401)

  // [session-3] Corr#9 — Pagination ajoutée
  const page = Math.max(1, parseInt(c.req.query('page') ?? '1'))
  const limit = Math.min(50, Math.max(1, parseInt(c.req.query('limit') ?? '20')))
  const offset = (page - 1) * limit

  const supabase = createSupabaseClientWithToken(c.env, auth.token)

  const { data: codes, error, count } = await supabase
    .from('codes_promo')
    .select('id, code, type, valeur, date_debut, date_fin, usage_max, usage_actuel, actif, created_at', { count: 'exact' })
    .eq('tenant_id', auth.tenant_id)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1)

  if (error) return c.json({ error: 'Erreur récupération codes promo.', detail: error.message }, 500)

  return c.json({
    codes: codes ?? [],
    pagination: { page, limit, total: count ?? 0, pages: Math.ceil((count ?? 0) / limit) }
  })
})

// ---- GET /api/v1/dashboard/codes-promo/export-csv ----
dashboardRouter.get('/codes-promo/export-csv', async (c) => {
  setSecurityHeaders(c)
  const auth = await verifyAuth(c)
  if (!auth) return c.json({ error: 'Non authentifié.' }, 401)

  const supabase = createSupabaseClientWithToken(c.env, auth.token)

  const { data: codes, error } = await supabase
    .from('codes_promo')
    .select('code, type, valeur, date_debut, date_fin, usage_max, usage_actuel, actif, created_at')
    .eq('tenant_id', auth.tenant_id)
    .order('created_at', { ascending: false })

  if (error) return c.json({ error: 'Erreur export codes promo.', detail: error.message }, 500)

  const headers = ['Code', 'Type', 'Valeur', 'Date début', 'Date fin', 'Usage max', 'Usage actuel', 'Actif', 'Créé le']
  const rows = (codes ?? []).map(p => {
    const valeurFormatee = p.type === 'pourcentage' ? `${p.valeur}%` : `${p.valeur} FCFA`
    return [
      p.code,
      p.type === 'pourcentage' ? 'Pourcentage' : 'Montant fixe',
      valeurFormatee,
      p.date_debut ?? '',
      p.date_fin ?? 'Sans expiration',
      p.usage_max ?? 'Illimité',
      p.usage_actuel ?? 0,
      p.actif ? 'Oui' : 'Non',
      p.created_at ?? ''
    ].map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(',')
  })

  const csv = [headers.join(','), ...rows].join('\n')
  const filename = `codes-promo_${auth.tenant_slug}.csv`

  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'X-Content-Type-Options': 'nosniff'
    }
  })
})

// ---- POST /api/v1/dashboard/codes-promo ----
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

  const supabase = createSupabaseClientWithToken(c.env, auth.token)

  const { data: existing } = await supabase
    .from('codes_promo')
    .select('id')
    .eq('tenant_id', auth.tenant_id)
    .eq('code', body.code.toUpperCase())
    .maybeSingle()

  if (existing) return c.json({ error: 'Ce code promo existe déjà.' }, 409)

  const promoId = crypto.randomUUID()
  const now = new Date().toISOString()

  const { error } = await supabase
    .from('codes_promo')
    .insert({
      id: promoId,
      tenant_id: auth.tenant_id,
      code: body.code.toUpperCase(),
      type: body.type,
      valeur: body.valeur,
      date_debut: now,
      date_fin: body.date_fin ?? null,
      usage_max: body.usage_max ?? null,
      usage_actuel: 0,
      actif: true,
      created_at: now
    })

  if (error) return c.json({ error: 'Erreur création code promo.', detail: error.message }, 500)

  return c.json({ success: true, id: promoId, code: body.code.toUpperCase() }, 201)
})

// ---- POST /api/v1/dashboard/codes-promo/generate ----
dashboardRouter.post('/codes-promo/generate', async (c) => {
  setSecurityHeaders(c)
  const auth = await verifyAuth(c)
  if (!auth) return c.json({ error: 'Non authentifié.' }, 401)

  let body: { type?: string; valeur?: number; usage_max?: number | null; date_fin?: string | null }
  try { body = await c.req.json() } catch { return c.json({ error: 'JSON invalide.' }, 400) }

  if (!body.type || !['pourcentage', 'montant_fixe'].includes(body.type)) {
    return c.json({ error: 'Type invalide.' }, 422)
  }
  if (!body.valeur || typeof body.valeur !== 'number' || body.valeur <= 0) {
    return c.json({ error: 'Valeur invalide.' }, 422)
  }

  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  const randomPart = Array.from(crypto.getRandomValues(new Uint8Array(6)))
    .map(b => chars[b % chars.length]).join('')
  const code = `PROMO${randomPart}`

  const supabase = createSupabaseClientWithToken(c.env, auth.token)
  const promoId = crypto.randomUUID()
  const now = new Date().toISOString()

  const { error } = await supabase.from('codes_promo').insert({
    id: promoId,
    tenant_id: auth.tenant_id,
    code,
    type: body.type,
    valeur: body.valeur,
    date_debut: now,
    date_fin: body.date_fin ?? null,
    usage_max: body.usage_max ?? null,
    usage_actuel: 0,
    actif: true,
    created_at: now
  })

  if (error) return c.json({ error: 'Erreur génération code promo.', detail: error.message }, 500)
  return c.json({ success: true, id: promoId, code }, 201)
})

// ---- PATCH /api/v1/dashboard/codes-promo/:id — Activer / désactiver ----
dashboardRouter.patch('/codes-promo/:id', async (c) => {
  setSecurityHeaders(c)
  const auth = await verifyAuth(c)
  if (!auth) return c.json({ error: 'Non authentifié.' }, 401)

  const promoId = c.req.param('id')
  let body: { actif?: number | boolean }
  try { body = await c.req.json() } catch { return c.json({ error: 'JSON invalide.' }, 400) }

  if (body.actif === undefined) {
    return c.json({ error: 'Champ actif requis (0/1 ou true/false).' }, 422)
  }

  const actifBool = body.actif === 1 || body.actif === true

  const supabase = createSupabaseClientWithToken(c.env, auth.token)

  const { data: promo } = await supabase
    .from('codes_promo')
    .select('id')
    .eq('id', promoId)
    .eq('tenant_id', auth.tenant_id)
    .single()

  if (!promo) return c.json({ error: 'Code promo introuvable.' }, 404)

  const { error } = await supabase
    .from('codes_promo')
    .update({ actif: actifBool })
    .eq('id', promoId)
    .eq('tenant_id', auth.tenant_id)

  if (error) return c.json({ error: 'Erreur mise à jour code promo.', detail: error.message }, 500)

  return c.json({ success: true, actif: actifBool ? 1 : 0 })
})

// ---- DELETE /api/v1/dashboard/codes-promo/:id ----
dashboardRouter.delete('/codes-promo/:id', async (c) => {
  setSecurityHeaders(c)
  const auth = await verifyAuth(c)
  if (!auth) return c.json({ error: 'Non authentifié.' }, 401)

  const promoId = c.req.param('id')
  const supabase = createSupabaseClientWithToken(c.env, auth.token)

  const { error } = await supabase
    .from('codes_promo')
    .delete()
    .eq('id', promoId)
    .eq('tenant_id', auth.tenant_id)

  if (error) return c.json({ error: 'Erreur suppression code promo.', detail: error.message }, 500)

  return c.json({ success: true })
})

// ---- POST /api/v1/dashboard/upload-image ----
dashboardRouter.post('/upload-image', async (c) => {
  setSecurityHeaders(c)
  const auth = await verifyAuth(c)
  if (!auth) return c.json({ error: 'Non authentifié.' }, 401)

  if (!c.env.R2_MEDIA) {
    return c.json({ error: 'Stockage médias non configuré.' }, 503)
  }

  const rateLimit = await checkRateLimit(`upload:${auth.tenant_id}`, 25, 3600000, c.env.KV_CACHE)
  if (!rateLimit.allowed) {
    const secsRemaining = Math.ceil((rateLimit.resetAt - Date.now()) / 1000)
    const minsRemaining = Math.ceil(secsRemaining / 60)
    const tempsMsg = minsRemaining > 1 ? `dans ${minsRemaining} minutes` : `dans ${secsRemaining} secondes`
    return c.json({
      error: `Limite d'uploads atteinte (25/heure). Réessayez ${tempsMsg}.`,
      retry_after_seconds: secsRemaining
    }, 429)
  }

  let formData: FormData
  try {
    formData = await c.req.formData()
  } catch {
    return c.json({ error: 'Formulaire multipart invalide.' }, 400)
  }

  const file = formData.get('file') as File | null
  if (!file) return c.json({ error: 'Fichier manquant (champ "file" requis).' }, 400)

  const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif']
  if (!allowedTypes.includes(file.type)) {
    return c.json({ error: 'Format non supporté. Utilisez JPEG, PNG, WebP ou GIF.' }, 415)
  }

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

  const origin = new URL(c.req.url).origin
  const publicUrl = `${origin}/api/v1/dashboard/media/${encodeURIComponent(key)}`

  return c.json({ success: true, url: publicUrl, key }, 201)
})

// ---- GET /api/v1/dashboard/media/:key — Serve une image depuis R2 ----
dashboardRouter.get('/media/:key{.+}', async (c) => {
  const rawKey = c.req.param('key')
  if (!rawKey) return c.json({ error: 'Clé manquante.' }, 400)

  let key: string
  try {
    key = decodeURIComponent(rawKey)
  } catch {
    return c.json({ error: 'Clé invalide.' }, 400)
  }

  if (key.includes('..') || key.startsWith('/')) {
    return c.json({ error: 'Clé non autorisée.' }, 403)
  }

  if (!c.env.R2_MEDIA) {
    return c.json({ error: 'Stockage médias non configuré.' }, 503)
  }

  const object = await c.env.R2_MEDIA.get(key)

  if (!object) {
    return c.json({ error: 'Image introuvable.' }, 404)
  }

  const contentType = object.httpMetadata?.contentType ?? 'application/octet-stream'
  const etag = object.etag ?? ''

  const ifNoneMatch = c.req.header('If-None-Match')
  if (etag && ifNoneMatch === `"${etag}"`) {
    return new Response(null, { status: 304 })
  }

  return new Response(object.body, {
    status: 200,
    headers: {
      'Content-Type': contentType,
      'Cache-Control': 'public, max-age=31536000, immutable',
      'ETag': etag ? `"${etag}"` : '',
      'X-Content-Type-Options': 'nosniff',
    }
  })
})

// ---- GET /api/v1/dashboard/qrcode ----
dashboardRouter.get('/qrcode', async (c) => {
  setSecurityHeaders(c)
  const auth = await verifyAuth(c)
  if (!auth) return c.json({ error: 'Non authentifié.' }, 401)

  const supabase = createSupabaseClientWithToken(c.env, auth.token)

  const { data: tenant, error } = await supabase
    .from('tenants')
    .select('nom, slug')
    .eq('id', auth.tenant_id)
    .single()

  if (error || !tenant) return c.json({ error: 'Restaurant introuvable.' }, 404)

  const origin = new URL(c.req.url).origin
  const boutiqueUrl = `${origin}/${tenant.slug}`
  const encodedUrl = encodeURIComponent(boutiqueUrl)

  return c.json({
    boutique_url: boutiqueUrl,
    slug: tenant.slug,
    nom: tenant.nom,
    qr_display: `https://api.qrserver.com/v1/create-qr-code/?size=400x400&data=${encodedUrl}&color=000000&bgcolor=ffffff&margin=10&qzone=1&format=png`,
    qr_download_png: `https://api.qrserver.com/v1/create-qr-code/?size=1000x1000&data=${encodedUrl}&color=000000&bgcolor=ffffff&margin=10&qzone=1&format=png`,
    qr_download_svg: `https://api.qrserver.com/v1/create-qr-code/?size=1000x1000&data=${encodedUrl}&color=000000&bgcolor=ffffff&margin=10&qzone=1&format=svg`
  })
})

// ---- GET /api/v1/dashboard/stats-journalieres ----
dashboardRouter.get('/stats-journalieres', async (c) => {
  setSecurityHeaders(c)
  const auth = await verifyAuth(c)
  if (!auth) return c.json({ error: 'Non authentifié.' }, 401)

  const jours = Math.min(parseInt(c.req.query('jours') || '30'), 90)
  const supabase = createSupabaseClientWithToken(c.env, auth.token)

  const { data: stats, error } = await supabase
    .from('stats_journalieres')
    .select('date, nb_commandes, nb_commandes_livrees, nb_commandes_annulees, chiffre_affaires, frais_livraison_total, top_produits')
    .eq('tenant_id', auth.tenant_id)
    .order('date', { ascending: false })
    .limit(jours)

  if (error) return c.json({ error: 'Erreur récupération stats.', detail: error.message }, 500)

  const liste = stats ?? []

  const totaux = {
    nb_commandes: liste.reduce((s: number, r: any) => s + (r.nb_commandes ?? 0), 0),
    chiffre_affaires: liste.reduce((s: number, r: any) => s + (r.chiffre_affaires ?? 0), 0),
    nb_jours_actifs: liste.filter((r: any) => (r.nb_commandes ?? 0) > 0).length,
    moyenne_journaliere: liste.length > 0
      ? Math.round(liste.reduce((s: number, r: any) => s + (r.chiffre_affaires ?? 0), 0) / liste.length)
      : 0
  }

  return c.json({ stats: liste, totaux, periode_jours: jours })
})

// ---- POST /api/v1/dashboard/setup-restaurant — Onboarding bienvenue ----
// CORRECTIF 401 — utilise désormais verifyAuthOnboarding() (permissif) au
// lieu de verifyAuth() (strict). Un tenant ayant choisi un plan PAYANT à
// l'inscription a le statut 'en_attente_paiement_initial' tant qu'il n'a
// pas soumis son 1er paiement (accesComplet=false). Cette route étant
// justement l'étape de configuration AVANT le paiement (étape 5 de
// /bienvenue), elle doit rester accessible dans cet état.
//
// CORRECTIF BUG-2 — chaque upload R2 (logo, bannière) est isolé dans son
// propre try/catch. Un échec d'upload d'image n'empêche plus l'enregistrement
// du reste du formulaire.
//
// CORRECTIF BUG-UPLOAD-BIENVENUE (2026-08) — voir le commentaire détaillé
// en tête de fichier. Résumé : l'écriture en base se fait désormais avec
// le client SERVICE ROLE (l'autorisation est déjà vérifiée par
// verifyAuthOnboarding juste au-dessus), le résultat de l'UPDATE tenants
// est vérifié explicitement (0 ligne affectée = erreur renvoyée, plus de
// faux "success:true"), et le point de vente est désormais CRÉÉ s'il
// n'existe pas encore.
//
// CORRECTIF BUG-PDV-INACTIF (2026-08) — voir commentaire en tête de
// fichier. La branche UPDATE du PDV existant ne filtre plus par "actif"
// (alignée sur existingPdv et sur PATCH /pdv) et vérifie explicitement
// les lignes affectées via .select('id').
dashboardRouter.post('/setup-restaurant', async (c) => {
  setSecurityHeaders(c)
  const auth = await verifyAuthOnboarding(c)
  if (!auth) return c.json({ error: 'Non authentifié.' }, 401)

  let formData: FormData
  try {
    formData = await c.req.formData()
  } catch {
    return c.json({ error: 'Formulaire multipart invalide.' }, 400)
  }

  // CORRECTIF BUG-UPLOAD-BIENVENUE — client service role pour l'écriture
  // (au lieu de createSupabaseClientWithToken, RLS-scopé, qui matchait 0
  // ligne en silence pour un tenant 'en_attente_paiement_initial').
  const supabase = createSupabaseAdminClient(c.env)
  const origin = new URL(c.req.url).origin

  const nom          = (formData.get('nom') as string | null)?.trim() || null
  const adresse      = (formData.get('adresse') as string | null)?.trim() || null
  const telephone    = (formData.get('telephone') as string | null)?.trim() || null
  const couleurPrim  = (formData.get('couleur_primaire') as string | null)?.trim() || '#DC2626'
  const couleurSec   = (formData.get('couleur_secondaire') as string | null)?.trim() || '#1D4ED8'
  const horairesRaw  = (formData.get('horaires') as string | null) || null

  let latitude: number | null = null
  let longitude: number | null = null
  const latRaw = (formData.get('latitude') as string | null)?.trim()
  const lngRaw = (formData.get('longitude') as string | null)?.trim()
  if (latRaw) {
    const parsed = parseFloat(latRaw)
    if (!Number.isNaN(parsed) && parsed >= -90 && parsed <= 90) latitude = parsed
  }
  if (lngRaw) {
    const parsed = parseFloat(lngRaw)
    if (!Number.isNaN(parsed) && parsed >= -180 && parsed <= 180) longitude = parsed
  }

  let horairesJson: Record<string, unknown> | null = null
  if (horairesRaw) {
    try { horairesJson = JSON.parse(horairesRaw) } catch { /* ignore */ }
  }

  // Upload logo isolé — un échec ici (réseau, R2 indisponible, fichier
  // invalide) est loggé mais NE FAIT PLUS échouer le reste de la requête.
  let logoUrl: string | null = null
  let logoErreur: string | null = null
  const logoFile = formData.get('logo') as File | null
  if (logoFile && logoFile.size > 0) {
    if (!c.env.R2_MEDIA) {
      logoErreur = 'Stockage médias non configuré.'
    } else {
      try {
        const ext = (logoFile.type.split('/')[1] || 'jpg').replace('jpeg', 'jpg')
        const key = `${auth.tenant_id}/logo-${Date.now()}.${ext}`
        const buffer = await logoFile.arrayBuffer()
        await c.env.R2_MEDIA.put(key, buffer, {
          httpMetadata: { contentType: logoFile.type },
          customMetadata: { tenant_id: auth.tenant_id }
        })
        logoUrl = `${origin}/api/v1/dashboard/media/${encodeURIComponent(key)}`
      } catch (err) {
        logoErreur = err instanceof Error ? err.message : 'Erreur inconnue.'
        console.error(`[setup-restaurant] Erreur upload logo (non bloquant) — tenant: ${auth.tenant_id.slice(0, 8)}...`, err)
      }
    }
  }

  // Upload bannière isolé, même logique que le logo.
  let banniereUrl: string | null = null
  let banniereErreur: string | null = null
  const banniereFile = formData.get('banniere') as File | null
  if (banniereFile && banniereFile.size > 0) {
    if (!c.env.R2_MEDIA) {
      banniereErreur = 'Stockage médias non configuré.'
    } else {
      try {
        const ext = (banniereFile.type.split('/')[1] || 'jpg').replace('jpeg', 'jpg')
        const key = `${auth.tenant_id}/banniere-${Date.now()}.${ext}`
        const buffer = await banniereFile.arrayBuffer()
        await c.env.R2_MEDIA.put(key, buffer, {
          httpMetadata: { contentType: banniereFile.type },
          customMetadata: { tenant_id: auth.tenant_id }
        })
        banniereUrl = `${origin}/api/v1/dashboard/media/${encodeURIComponent(key)}`
      } catch (err) {
        banniereErreur = err instanceof Error ? err.message : 'Erreur inconnue.'
        console.error(`[setup-restaurant] Erreur upload bannière (non bloquant) — tenant: ${auth.tenant_id.slice(0, 8)}...`, err)
      }
    }
  }

  const tenantUpdate: Record<string, unknown> = {
    couleur_primaire: couleurPrim,
    couleur_secondaire: couleurSec
  }
  if (nom) tenantUpdate.nom = nom
  if (logoUrl) tenantUpdate.logo_url = logoUrl
  if (banniereUrl) tenantUpdate.banniere_url = banniereUrl
  if (telephone) tenantUpdate.whatsapp_number = telephone

  // .select('id') + vérification explicite du nombre de lignes affectées.
  // Sans ça, un UPDATE à 0 ligne (RLS, tenant introuvable, etc.) ne
  // remonte AUCUNE erreur et la route répondrait success:true alors que
  // rien n'aurait été écrit.
  const { data: tenantUpdatedRows, error: errTenant } = await supabase
    .from('tenants')
    .update(tenantUpdate)
    .eq('id', auth.tenant_id)
    .select('id')

  if (errTenant) {
    return c.json({ error: 'Erreur mise à jour tenant.', detail: errTenant.message }, 500)
  }
  if (!tenantUpdatedRows || tenantUpdatedRows.length === 0) {
    return c.json({ error: 'Restaurant introuvable — mise à jour impossible.' }, 404)
  }

  // Création du PDV s'il n'existe pas encore, sinon mise à jour — même
  // logique "créer si absent, sinon mettre à jour" que PATCH
  // /api/v1/dashboard/pdv ci-dessus.
  //
  // FIX BUG-PDV-INACTIF — la recherche existingPdv ne filtre pas par
  // "actif" ; la branche UPDATE ne doit donc PAS filtrer dessus non plus
  // (sinon un PDV existant mais inactif matche existingPdv → pas de
  // création → puis l'UPDATE filtré sur actif=true ne touche 0 ligne
  // SANS ERREUR). On vérifie désormais explicitement les lignes affectées.
  let pdvWarning: string | null = null
  const donneesPdvFournies = !!(nom || adresse || horairesJson || latitude !== null || longitude !== null)
  if (donneesPdvFournies) {
    const { data: existingPdv } = await supabase
      .from('points_de_vente')
      .select('id')
      .eq('tenant_id', auth.tenant_id)
      .limit(1)
      .maybeSingle()

    if (!existingPdv) {
      const nowIso = new Date().toISOString()
      const { error: errPdvInsert } = await supabase
        .from('points_de_vente')
        .insert({
          id: crypto.randomUUID(),
          tenant_id: auth.tenant_id,
          nom: nom ?? 'Mon restaurant',
          adresse: adresse ?? '',
          latitude,
          longitude,
          horaires: horairesJson,
          tarif_livraison_base: 500,
          tarif_par_km: 200,
          actif: true,
          created_at: nowIso,
          updated_at: nowIso
        })

      if (errPdvInsert) {
        console.error('Erreur création PDV (onboarding):', errPdvInsert.message)
        pdvWarning = 'Adresse et/ou horaires non enregistrés : ' + errPdvInsert.message
      }
    } else {
      const pdvUpdate: Record<string, unknown> = {}
      if (nom) pdvUpdate.nom = nom
      if (adresse) pdvUpdate.adresse = adresse
      if (horairesJson) pdvUpdate.horaires = horairesJson
      if (latitude !== null) pdvUpdate.latitude = latitude
      if (longitude !== null) pdvUpdate.longitude = longitude

      const { error: errPdv, data: pdvUpdatedRows } = await supabase
        .from('points_de_vente')
        .update(pdvUpdate)
        .eq('id', existingPdv.id)
        .select('id')

      if (errPdv) {
        console.error('Erreur mise à jour PDV (onboarding):', errPdv.message)
        pdvWarning = 'Adresse et/ou horaires non enregistrés : ' + errPdv.message
      } else if (!pdvUpdatedRows || pdvUpdatedRows.length === 0) {
        console.error('Erreur mise à jour PDV (onboarding): 0 ligne affectée pour id=' + existingPdv.id)
        pdvWarning = 'Adresse et/ou horaires non enregistrés (PDV introuvable lors de la mise à jour).'
      }
    }
  }

  try { if (c.env.KV_CACHE) await c.env.KV_CACHE.delete(`tenant:${auth.tenant_slug}`) } catch {}

  return c.json({
    success: true,
    message: 'Restaurant configuré avec succès.',
    redirect: '/dashboard/home',
    logo_enregistre: !!logoUrl,
    banniere_enregistree: !!banniereUrl,
    ...(logoErreur ? { logo_erreur: logoErreur } : {}),
    ...(banniereErreur ? { banniere_erreur: banniereErreur } : {}),
    ...(pdvWarning ? { warning: pdvWarning } : {})
  })
})

// ============================================================
// Routes notifications restaurant
// ============================================================

// ---- GET /api/v1/dashboard/notifications/liste ----
// CORRECTIF 401 — même raison que /setup-restaurant : cette route est
// utilisée par la page /bienvenue avant tout paiement, donc doit rester
// accessible en mode accesAbonnementSeul (voir verifyAuthOnboarding).
dashboardRouter.get('/notifications/liste', async (c) => {
  setSecurityHeaders(c)
  const auth = await verifyAuthOnboarding(c)
  if (!auth) return c.json({ error: 'Non authentifié.' }, 401)

  const page  = Math.max(1, parseInt(c.req.query('page')  || '1'))
  const limit = Math.min(50, Math.max(1, parseInt(c.req.query('limit') || '10')))
  const nonLuesSeulement = c.req.query('non_lues') === 'true'
  const offset = (page - 1) * limit

  const adminClient = createSupabaseAdminClient(c.env)

  let query = adminClient
    .from('notifications_restaurant')
    .select('id, type, titre, message, lue, lien, created_at', { count: 'exact' })
    .eq('tenant_id', auth.tenant_id)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1)

  if (nonLuesSeulement) query = query.eq('lue', false)

  const { data: notifications, count, error } = await query

  if (error) return c.json({ error: 'Erreur récupération notifications.', detail: error.message }, 500)

  const nbNonLues = nonLuesSeulement
    ? (count ?? 0)
    : await adminClient
        .from('notifications_restaurant')
        .select('id', { count: 'exact', head: true })
        .eq('tenant_id', auth.tenant_id)
        .eq('lue', false)
        .then(r => r.count ?? 0)

  return c.json({
    notifications: notifications ?? [],
    page,
    limit,
    total: count ?? 0,
    nb_non_lues: nbNonLues,
    has_more: (offset + limit) < (count ?? 0)
  })
})

// ---- PATCH /api/v1/dashboard/notifications/:id ----
dashboardRouter.patch('/notifications/:id', async (c) => {
  setSecurityHeaders(c)
  const auth = await verifyAuth(c)
  if (!auth) return c.json({ error: 'Non authentifié.' }, 401)

  const notifId = c.req.param('id')
  let body: { lue?: boolean }
  try { body = await c.req.json() } catch { return c.json({ error: 'JSON invalide.' }, 400) }

  if (body.lue === undefined) {
    return c.json({ error: 'Champ "lue" requis (true/false).' }, 422)
  }

  const adminClient = createSupabaseAdminClient(c.env)

  const { data: existing } = await adminClient
    .from('notifications_restaurant')
    .select('id')
    .eq('id', notifId)
    .eq('tenant_id', auth.tenant_id)
    .maybeSingle()

  if (!existing) return c.json({ error: 'Notification introuvable.' }, 404)

  const { error } = await adminClient
    .from('notifications_restaurant')
    .update({ lue: body.lue })
    .eq('id', notifId)
    .eq('tenant_id', auth.tenant_id)

  if (error) return c.json({ error: 'Erreur mise à jour notification.', detail: error.message }, 500)

  return c.json({ success: true, lue: body.lue })
})

// ---- PATCH /api/v1/dashboard/notifications/tout-lire ----
dashboardRouter.patch('/notifications/tout-lire', async (c) => {
  setSecurityHeaders(c)
  const auth = await verifyAuth(c)
  if (!auth) return c.json({ error: 'Non authentifié.' }, 401)

  const adminClient = createSupabaseAdminClient(c.env)

  const { error, count } = await adminClient
    .from('notifications_restaurant')
    .update({ lue: true })
    .eq('tenant_id', auth.tenant_id)
    .eq('lue', false)
    .select('id', { count: 'exact' })

  if (error) return c.json({ error: 'Erreur mise à jour notifications.', detail: error.message }, 500)

  return c.json({ success: true, nb_mises_a_jour: count ?? 0 })
})

// ============================================================
// Routes FCM — Push notifications mobile
// ============================================================

dashboardRouter.post('/fcm-token', async (c) => {
  setSecurityHeaders(c)
  const auth = await verifyAuth(c)
  if (!auth) return c.json({ error: 'Non authentifié.' }, 401)

  let body: { token?: string; platform?: string }
  try { body = await c.req.json() } catch { return c.json({ error: 'JSON invalide.' }, 400) }

  const { token, platform } = body
  if (!token || typeof token !== 'string' || token.length < 100) {
    return c.json({ error: 'Token FCM invalide.' }, 422)
  }
  const platformValide = ['android', 'ios', 'web'].includes(platform ?? '') ? (platform as string) : 'android'

  const adminClient = createSupabaseAdminClient(c.env)

  const { error } = await adminClient
    .from('fcm_tokens')
    .upsert({
      tenant_id: auth.tenant_id,
      token,
      platform: platformValide,
      updated_at: new Date().toISOString()
    }, { onConflict: 'token' })

  if (error) {
    console.error('[FCM] Erreur upsert token:', error.message)
    return c.json({ error: 'Erreur lors de l\'enregistrement du token.' }, 500)
  }

  return c.json({ success: true })
})

dashboardRouter.delete('/fcm-token', async (c) => {
  setSecurityHeaders(c)
  const auth = await verifyAuth(c)
  if (!auth) return c.json({ error: 'Non authentifié.' }, 401)

  const token = c.req.query('token')
  if (!token) return c.json({ error: 'Token requis (query param).' }, 422)

  const adminClient = createSupabaseAdminClient(c.env)

  const { error } = await adminClient
    .from('fcm_tokens')
    .delete()
    .eq('token', decodeURIComponent(token))
    .eq('tenant_id', auth.tenant_id)

  if (error) {
    console.error('[FCM] Erreur suppression token:', error.message)
    return c.json({ error: 'Erreur lors de la suppression du token.' }, 500)
  }

  return c.json({ success: true })
})

export { dashboardRouter }
