// AJOUT — api-supplements.ts : Suppléments généraux par restaurant (tenant)
// Routes dashboard protégées — pattern identique à api-dashboard.ts.
//
// Un supplément général n'est PAS lié à un produit spécifique : il appartient
// au tenant et peut être proposé sur n'importe quel article commandé.
// Cette architecture remplace l'ancien modèle produit_id obligatoire.
//
// Routes :
//   GET    /api/v1/dashboard/supplements         — liste (actifs + inactifs)
//   POST   /api/v1/dashboard/supplements         — créer
//   PATCH  /api/v1/dashboard/supplements/:id     — modifier
//   DELETE /api/v1/dashboard/supplements/:id     — soft-delete + purge R2
//   POST   /api/v1/dashboard/supplements/:id/image — upload/remplacement image
//   GET    /api/v1/dashboard/supplements/limite  — scaffold plan/limite (lecture)
//
// Sécurité :
//   - Auth : cookie httpOnly `sb-access-token` (verifyAuth, identique aux
//     autres routes dashboard) — exemption Bearer pour l'app mobile.
//   - CSRF : middleware propre à ce router (double-submit cookie, identique à
//     dashboardRouter). Monté avant toutes les routes via supplementsRouter.use('*').
//     Émission cookie sur GET, vérification X-Requested-With + X-CSRF-Token sur
//     POST/PATCH/PUT/DELETE. Exemption Bearer pour l'app mobile.
//   - Rate limiting : checkRateLimit() de lib/security.ts, KV distribué.
//   - Upload image : validation magic bytes (validerMimeImageUnifie), clé R2
//     non devinable (UUID), purge R2 atomique (upload → DB → delete old).
//   - IDOR : chaque opération filtre sur id ET tenant_id.
//   - Jamais de prix client accepté — les prix sont SERVER-SIDE uniquement.
//   - Validation zod sur tous les payloads mutants.
//
// Scaffold plan/limite (5.7) :
//   - La logique de restriction est DÉSACTIVÉE par défaut (supplements_actifs
//     reste false en base). Activer la colonne suffira à activer la restriction
//     sans nouveau déploiement de code.

import { Hono } from 'hono'
import { getCookie, setCookie } from 'hono/cookie'
import { z } from 'zod'
import type { Env } from '../types/database'
import {
  checkRateLimit,
  setSecurityHeaders,
  generateCspNonce,
  timingSafeEqual
} from '../lib/security'
import { createSupabaseAdminClient, createSupabaseClientWithToken } from '../lib/supabase'
import { validerMimeImageUnifie as validerMimeImage } from '../lib/validation'
import { verifyAuth } from '../lib/auth'

// AJOUT — Router suppléments généraux, monté séparément dans index.tsx
// sous /api/v1/dashboard/supplements. Ce router embarque son propre middleware
// CSRF (double-submit cookie) identique à celui de dashboardRouter — car Hono
// ne propage pas les middlewares d'un router parent vers un router frère.
const supplementsRouter = new Hono<{ Bindings: Env }>()

// ── Nom du cookie CSRF (identique à dashboardRouter — non-httpOnly, lisible JS) ──
const CSRF_COOKIE = 'csrf-token'

// ── Middleware CSRF double-submit cookie (S1-04) ─────────────────────────────
// CORRECTIF SÉCURITÉ — Ce middleware est OBLIGATOIRE car supplementsRouter est
// monté séparément dans index.tsx et ne bénéficie PAS du middleware CSRF de
// dashboardRouter. Pattern identique : émission cookie sur GET/HEAD/OPTIONS,
// vérification X-Requested-With + X-CSRF-Token sur mutations. Bearer exempté.
supplementsRouter.use('*', async (c, next) => {
  const method = c.req.method.toUpperCase()

  // GET / HEAD / OPTIONS : émettre ou renouveler le cookie CSRF si absent
  if (!['POST', 'PATCH', 'PUT', 'DELETE'].includes(method)) {
    const existingCsrf = getCookie(c, CSRF_COOKIE)
    if (!existingCsrf) {
      const csrfToken = generateCspNonce()  // 16 octets, 128 bits d'entropie
      setCookie(c, CSRF_COOKIE, csrfToken, {
        httpOnly: false,       // intentionnellement lisible par JS (double-submit pattern)
        secure: true,
        sameSite: 'Strict',
        path: '/',
        maxAge: 86400          // 24h — même durée que la session dashboard
      })
    }
    return next()
  }

  // Requêtes Bearer (API mobile/clients API) — exemptées du CSRF cookie
  const hasBearerToken = c.req.header('Authorization')?.startsWith('Bearer ')
  if (hasBearerToken) return next()

  // Couche 1 : X-Requested-With (protection de base)
  const xRequestedWith = c.req.header('X-Requested-With')
  if (xRequestedWith !== 'XMLHttpRequest') {
    return c.json({
      error: 'Requête refusée. Header X-Requested-With: XMLHttpRequest requis sur les opérations d\'écriture.',
      code: 'CSRF_PROTECTION'
    }, 403)
  }

  // Couche 2 : double-submit cookie CSRF (S1-04)
  const cookieCsrf = getCookie(c, CSRF_COOKIE)
  const headerCsrf = c.req.header('X-CSRF-Token')

  if (!cookieCsrf || !headerCsrf || !timingSafeEqual(cookieCsrf, headerCsrf)) {
    return c.json({
      error: 'Requête refusée. Token CSRF invalide ou manquant (X-CSRF-Token).',
      code: 'CSRF_TOKEN_MISMATCH'
    }, 403)
  }

  return next()
})

// ── Schémas Zod ──────────────────────────────────────────────────────────────

const SupplementCreateSchema = z.object({
  nom:    z.string().min(1).max(100).trim(),
  prix:   z.number().min(0).max(999999).finite(),
  actif:  z.boolean().default(true),
  ordre:  z.number().int().min(0).default(0)
})

const SupplementUpdateSchema = z.object({
  nom:    z.string().min(1).max(100).trim().optional(),
  prix:   z.number().min(0).max(999999).finite().optional(),
  actif:  z.boolean().optional(),
  ordre:  z.number().int().min(0).optional()
})

// ── Constante upload ─────────────────────────────────────────────────────────
const MAX_IMAGE_SIZE = 5 * 1024 * 1024 // 5 Mo (cohérent avec /upload-image)

// ── Helper invalidation cache KV ──────────────────────────────────────────────
async function invaliderCacheSupplements(env: Env, tenantSlug: string): Promise<void> {
  try {
    if (env.KV_CACHE) {
      // Invalider le cache menu (GET /:slug/menu inclut désormais les suppléments généraux)
      await env.KV_CACHE.delete(`menu:${tenantSlug}`)
      // Invalider le cache de la liste des suppléments du dashboard
      await env.KV_CACHE.delete(`supplements:${tenantSlug}`)
    }
  } catch { /* KV non disponible en dev — non bloquant */ }
}

// ============================================================
// GET /api/v1/dashboard/supplements
// ============================================================
// AJOUT — Liste tous les suppléments généraux du tenant connecté
// (actifs ET inactifs), triés par ordre_affichage.
// Cache KV court (30s) : invalidé dès qu'une mutation a lieu.
supplementsRouter.get('/', async (c) => {
  setSecurityHeaders(c)
  const auth = await verifyAuth(c)
  if (!auth) return c.json({ error: 'Non authentifié.' }, 401)

  // Rate limiting lecture : 60 requêtes / minute par tenant
  const rateLimit = await checkRateLimit(
    `supplements-list:${auth.tenant_id}`, 60, 60000, c.env.KV_CACHE
  )
  if (!rateLimit.allowed) {
    return c.json({ error: 'Trop de requêtes. Réessayez dans un instant.' }, 429)
  }

  // Cache KV court : invalider après toute mutation (create/patch/delete/image)
  const cacheKey = `supplements:${auth.tenant_slug}`
  try {
    if (c.env.KV_CACHE) {
      const cached = await c.env.KV_CACHE.get(cacheKey, 'json')
      if (cached) {
        c.header('X-Cache', 'HIT')
        return c.json(cached)
      }
    }
  } catch { /* KV indisponible — continuer sans cache */ }

  const supabase = createSupabaseClientWithToken(c.env, auth.token)

  const { data: supplements, error } = await supabase
    .from('supplements')
    .select('id, nom, prix, photo_url, photo_r2_key, actif, ordre_affichage, created_at, updated_at')
    .eq('tenant_id', auth.tenant_id)
    .is('deleted_at', null)
    .order('ordre_affichage', { ascending: true })

  if (error) {
    return c.json({
      error: 'Erreur récupération suppléments.',
      ...(c.env.ENVIRONMENT !== 'production' ? { detail: error.message } : {})
    }, 500)
  }

  const result = { supplements: supplements ?? [] }

  // Écrire en cache KV (TTL 30s — invalidé explicitement à chaque mutation)
  try {
    if (c.env.KV_CACHE) {
      await c.env.KV_CACHE.put(cacheKey, JSON.stringify(result), { expirationTtl: 30 })
    }
  } catch { /* non bloquant */ }

  return c.json(result)
})

// ============================================================
// GET /api/v1/dashboard/supplements/limite
// ============================================================
// AJOUT (5.7) — Scaffold plan/limite : lit l'état de la fonctionnalité
// suppléments pour le tenant connecté (actif dans son plan, limite, utilisés).
// Non activé en production tant que supplements_actifs reste false par défaut.
supplementsRouter.get('/limite', async (c) => {
  setSecurityHeaders(c)
  const auth = await verifyAuth(c)
  if (!auth) return c.json({ error: 'Non authentifié.' }, 401)

  const adminClient = createSupabaseAdminClient(c.env)

  // Récupérer le plan du tenant
  const { data: tenantRow } = await adminClient
    .from('tenants')
    .select('plan_id')
    .eq('id', auth.tenant_id)
    .single()

  let supplementsActifs = false
  let limiteSupplements: number | null = null

  if (tenantRow?.plan_id) {
    const { data: planRow } = await adminClient
      .from('plans')
      .select('supplements_actifs, limite_supplements')
      .eq('id', tenantRow.plan_id)
      .maybeSingle()

    if (planRow) {
      supplementsActifs = planRow.supplements_actifs ?? false
      limiteSupplements = planRow.limite_supplements ?? null
    }
  }

  // Compter les suppléments actifs utilisés par ce tenant
  const { count: utilises } = await adminClient
    .from('supplements')
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', auth.tenant_id)
    .eq('actif', true)
    .is('deleted_at', null)

  return c.json({
    actif: supplementsActifs,
    limite: limiteSupplements,
    utilises: utilises ?? 0
  })
})

// ============================================================
// POST /api/v1/dashboard/supplements
// ============================================================
// AJOUT — Créer un supplément général (sans produit_id).
// Validation zod stricte, rate limiting, vérification plan si actif.
supplementsRouter.post('/', async (c) => {
  setSecurityHeaders(c)
  const auth = await verifyAuth(c)
  if (!auth) return c.json({ error: 'Non authentifié.' }, 401)

  // Rate limiting écriture : 30 créations / heure par tenant
  const rateLimit = await checkRateLimit(
    `supplements-create:${auth.tenant_id}`, 30, 3600000, c.env.KV_CACHE
  )
  if (!rateLimit.allowed) {
    const secsRemaining = Math.ceil((rateLimit.resetAt - Date.now()) / 1000)
    return c.json({
      error: 'Limite de créations atteinte. Réessayez plus tard.',
      retry_after_seconds: secsRemaining
    }, 429)
  }

  let body: unknown
  try { body = await c.req.json() } catch {
    return c.json({ error: 'Corps de requête JSON invalide.' }, 400)
  }

  const parseResult = SupplementCreateSchema.safeParse(body)
  if (!parseResult.success) {
    return c.json({
      error: 'Données invalides.',
      details: parseResult.error.flatten().fieldErrors
    }, 422)
  }

  const data = parseResult.data
  const adminClient = createSupabaseAdminClient(c.env)

  // AJOUT (5.7) — Vérification scaffold plan/limite (désactivée tant que
  // supplements_actifs reste false — contrôle court-circuité par défaut).
  const { data: tenantRow } = await adminClient
    .from('tenants')
    .select('plan_id')
    .eq('id', auth.tenant_id)
    .single()

  if (tenantRow?.plan_id) {
    const { data: planRow } = await adminClient
      .from('plans')
      .select('supplements_actifs, limite_supplements')
      .eq('id', tenantRow.plan_id)
      .maybeSingle()

    // Si la fonctionnalité est explicitement activée ET une limite est définie
    if (planRow?.supplements_actifs && planRow?.limite_supplements !== null) {
      const { count: utilises } = await adminClient
        .from('supplements')
        .select('id', { count: 'exact', head: true })
        .eq('tenant_id', auth.tenant_id)
        .eq('actif', true)
        .is('deleted_at', null)

      if ((utilises ?? 0) >= (planRow.limite_supplements ?? Infinity)) {
        return c.json({
          error: `Limite de suppléments atteinte (${planRow.limite_supplements} max pour votre plan). Désactivez ou supprimez un supplément existant.`
        }, 403)
      }
    }
  }

  const supId = crypto.randomUUID()
  const now = new Date().toISOString()

  // CORRECTIF — utiliser adminClient (service role) pour l'INSERT afin
  // d'éviter la race condition RLS si le tenant est en statut atypique.
  const { error: insertError } = await adminClient
    .from('supplements')
    .insert({
      id: supId,
      tenant_id: auth.tenant_id,
      produit_id: null, // AJOUT — général : pas de produit associé
      nom: data.nom,
      prix: data.prix,
      actif: data.actif,
      ordre_affichage: data.ordre,
      created_at: now,
      updated_at: now
    })

  if (insertError) {
    return c.json({
      error: 'Erreur création supplément.',
      ...(c.env.ENVIRONMENT !== 'production' ? { detail: insertError.message } : {})
    }, 500)
  }

  // Invalider les caches KV (menu + liste dashboard)
  await invaliderCacheSupplements(c.env, auth.tenant_slug)

  return c.json({ success: true, id: supId }, 201)
})

// ============================================================
// PATCH /api/v1/dashboard/supplements/:id
// ============================================================
// AJOUT — Modifier un supplément général (nom, prix, actif, ordre).
// Protection IDOR : filtre sur id ET tenant_id.
supplementsRouter.patch('/:id', async (c) => {
  setSecurityHeaders(c)
  const auth = await verifyAuth(c)
  if (!auth) return c.json({ error: 'Non authentifié.' }, 401)

  const supId = c.req.param('id')

  let body: unknown
  try { body = await c.req.json() } catch {
    return c.json({ error: 'Corps de requête JSON invalide.' }, 400)
  }

  const parseResult = SupplementUpdateSchema.safeParse(body)
  if (!parseResult.success) {
    return c.json({
      error: 'Données invalides.',
      details: parseResult.error.flatten().fieldErrors
    }, 422)
  }

  const data = parseResult.data
  if (Object.keys(data).length === 0) {
    return c.json({ error: 'Au moins un champ à modifier est requis.' }, 422)
  }

  const adminClient = createSupabaseAdminClient(c.env)

  // Vérifier existence + appartenance tenant (protection IDOR)
  const { data: sup } = await adminClient
    .from('supplements')
    .select('id')
    .eq('id', supId)
    .eq('tenant_id', auth.tenant_id)
    .is('deleted_at', null)
    .maybeSingle()

  if (!sup) return c.json({ error: 'Supplément introuvable.' }, 404)

  const updateData: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (data.nom !== undefined) updateData.nom = data.nom
  if (data.prix !== undefined) updateData.prix = data.prix
  if (data.actif !== undefined) updateData.actif = data.actif
  if (data.ordre !== undefined) updateData.ordre_affichage = data.ordre

  // BUG-09/A-09 — .select('id') pour détecter les 0 lignes affectées
  const { data: updatedRows, error } = await adminClient
    .from('supplements')
    .update(updateData)
    .eq('id', supId)
    .eq('tenant_id', auth.tenant_id)
    .select('id')

  if (error) {
    return c.json({
      error: 'Erreur mise à jour supplément.',
      ...(c.env.ENVIRONMENT !== 'production' ? { detail: error.message } : {})
    }, 500)
  }

  if (!updatedRows || updatedRows.length === 0) {
    console.warn('[supplements/PATCH] 0 lignes affectées — tenant:', auth.tenant_id, 'sup:', supId)
    return c.json({ error: 'Supplément introuvable ou supprimé entre-temps.' }, 404)
  }

  await invaliderCacheSupplements(c.env, auth.tenant_slug)
  return c.json({ success: true })
})

// ============================================================
// DELETE /api/v1/dashboard/supplements/:id
// ============================================================
// AJOUT — Soft-delete d'un supplément général.
// Si une image R2 est associée, elle est purgée APRÈS la mise à jour DB.
// (Jamais l'inverse — évite d'avoir une DB incohérente si la purge R2 échoue.)
supplementsRouter.delete('/:id', async (c) => {
  setSecurityHeaders(c)
  const auth = await verifyAuth(c)
  if (!auth) return c.json({ error: 'Non authentifié.' }, 401)

  const supId = c.req.param('id')
  const adminClient = createSupabaseAdminClient(c.env)

  // Lire la clé R2 avant le soft-delete (pour purge post-DB)
  const { data: supAvant } = await adminClient
    .from('supplements')
    .select('id, photo_r2_key')
    .eq('id', supId)
    .eq('tenant_id', auth.tenant_id)
    .is('deleted_at', null)
    .maybeSingle()

  if (!supAvant) return c.json({ error: 'Supplément introuvable.' }, 404)

  const now = new Date().toISOString()

  // Soft-delete (jamais de DELETE physique)
  const { data: deletedRows, error } = await adminClient
    .from('supplements')
    .update({ deleted_at: now, updated_at: now })
    .eq('id', supId)
    .eq('tenant_id', auth.tenant_id)
    .is('deleted_at', null)
    .select('id')

  if (error) {
    return c.json({
      error: 'Erreur suppression supplément.',
      ...(c.env.ENVIRONMENT !== 'production' ? { detail: error.message } : {})
    }, 500)
  }

  if (!deletedRows || deletedRows.length === 0) {
    return c.json({ error: 'Supplément introuvable.' }, 404)
  }

  // AJOUT — Purge R2 de l'image associée (APRÈS confirmation DB réussie).
  // Non bloquant : une erreur R2 est loggée mais ne fait pas échouer la route.
  if (supAvant.photo_r2_key && c.env.R2_MEDIA) {
    try {
      await c.env.R2_MEDIA.delete(supAvant.photo_r2_key)
    } catch (r2Err: any) {
      console.warn(
        `[supplements/DELETE] Purge R2 échouée pour supplément ${supId} — clé: ${supAvant.photo_r2_key}:`,
        r2Err?.message ?? r2Err
      )
    }
  }

  await invaliderCacheSupplements(c.env, auth.tenant_slug)
  return c.json({ success: true })
})

// ============================================================
// POST /api/v1/dashboard/supplements/:id/image
// ============================================================
// AJOUT — Upload ou remplacement de l'image d'un supplément général.
// Sécurité stricte :
//   - Vérification magic bytes (validerMimeImageUnifie) — jamais confiance au MIME déclaré.
//   - Taille max 5 Mo (cohérent avec /upload-image).
//   - Clé R2 non devinable : UUID namespacé par tenant.
//   - Atomicité : upload R2 → update DB (photo_url + photo_r2_key) → delete old R2.
//   - En cas d'échec DB : la nouvelle image est supprimée de R2 (rollback R2).
supplementsRouter.post('/:id/image', async (c) => {
  setSecurityHeaders(c)
  const auth = await verifyAuth(c)
  if (!auth) return c.json({ error: 'Non authentifié.' }, 401)

  if (!c.env.R2_MEDIA) {
    return c.json({ error: 'Stockage médias non configuré.' }, 503)
  }

  // Rate limiting upload : 25 uploads / heure par tenant (idem /upload-image)
  const rateLimit = await checkRateLimit(
    `upload:${auth.tenant_id}`, 25, 3600000, c.env.KV_CACHE
  )
  if (!rateLimit.allowed) {
    const secsRemaining = Math.ceil((rateLimit.resetAt - Date.now()) / 1000)
    return c.json({
      error: `Limite d'uploads atteinte (25/heure). Réessayez dans ${Math.ceil(secsRemaining / 60)} minutes.`,
      retry_after_seconds: secsRemaining
    }, 429)
  }

  const supId = c.req.param('id')

  // Vérification Content-Length avant lecture (évite de lire un body géant)
  const MAX_SIZE = MAX_IMAGE_SIZE
  const contentLengthHdr = parseInt(c.req.header('Content-Length') ?? '0', 10)
  if (contentLengthHdr > MAX_SIZE * 1.1) {
    return c.json({ error: 'Fichier trop volumineux (max 5 MB).' }, 413)
  }

  let formData: FormData
  try {
    formData = await c.req.formData()
  } catch {
    return c.json({ error: 'Formulaire multipart invalide.' }, 400)
  }

  const file = formData.get('file') as File | null
  if (!file) return c.json({ error: 'Fichier manquant (champ "file" requis).' }, 400)

  // Vérification taille déclarée
  if (file.size > MAX_SIZE) {
    return c.json({ error: 'Fichier trop volumineux (max 5 MB).' }, 413)
  }

  // Vérification type MIME déclaré (première couche — non suffisante seule)
  const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif']
  if (!allowedTypes.includes(file.type)) {
    return c.json({ error: 'Format non supporté. Utilisez JPEG, PNG, WebP ou GIF.' }, 415)
  }

  const buffer = await file.arrayBuffer()

  // AJOUT — Vérification magic bytes (anti-spoofing MIME)
  const validatedMime = validerMimeImage(buffer)
  if (!validatedMime) {
    return c.json({ error: 'Fichier invalide. Seuls les vrais JPEG, PNG, WebP et GIF sont acceptés.' }, 415)
  }

  const adminClient = createSupabaseAdminClient(c.env)

  // Vérifier existence + appartenance tenant (protection IDOR)
  const { data: supExistant } = await adminClient
    .from('supplements')
    .select('id, photo_r2_key')
    .eq('id', supId)
    .eq('tenant_id', auth.tenant_id)
    .is('deleted_at', null)
    .maybeSingle()

  if (!supExistant) return c.json({ error: 'Supplément introuvable.' }, 404)

  // Clé R2 non devinable : UUID namespacé par tenant
  const ext = validatedMime.split('/')[1]!.replace('jpeg', 'jpg')
  const nouvelleClé = `${auth.tenant_id}/supplements/${crypto.randomUUID()}.${ext}`
  const ancienneClé = supExistant.photo_r2_key ?? null

  // ÉTAPE 1 — Upload nouvelle image dans R2
  try {
    await c.env.R2_MEDIA.put(nouvelleClé, buffer, {
      httpMetadata: { contentType: validatedMime },
      customMetadata: {
        tenant_id: auth.tenant_id,
        supplement_id: supId,
        uploaded_at: new Date().toISOString()
      }
    })
  } catch (r2Err: any) {
    console.error('[supplements/image] Erreur R2.put:', r2Err?.message ?? r2Err)
    return c.json({ error: 'Erreur lors de l\'enregistrement de l\'image. Réessayez.' }, 502)
  }

  // Construire l'URL publique de la nouvelle image
  const origin = new URL(c.req.url).origin
  const nouvelleUrl = `${origin}/api/v1/dashboard/media/${encodeURIComponent(nouvelleClé)}`

  // ÉTAPE 2 — Mettre à jour photo_url + photo_r2_key en base
  const { data: updatedRows, error: dbError } = await adminClient
    .from('supplements')
    .update({
      photo_url: nouvelleUrl,
      photo_r2_key: nouvelleClé,
      updated_at: new Date().toISOString()
    })
    .eq('id', supId)
    .eq('tenant_id', auth.tenant_id)
    .select('id')

  if (dbError || !updatedRows || updatedRows.length === 0) {
    // Rollback R2 : supprimer la nouvelle image pour éviter un orphelin
    try { await c.env.R2_MEDIA.delete(nouvelleClé) } catch {}
    console.error(
      '[supplements/image] Erreur DB après upload R2 — rollback effectué:',
      dbError?.message ?? 'Aucune ligne affectée'
    )
    return c.json({
      error: 'Erreur lors de la mise à jour de la base de données.',
      ...(c.env.ENVIRONMENT !== 'production' ? { detail: dbError?.message } : {})
    }, 500)
  }

  // ÉTAPE 3 — Purger l'ancienne image R2 (APRÈS confirmation DB réussie)
  if (ancienneClé && ancienneClé !== nouvelleClé) {
    try {
      await c.env.R2_MEDIA.delete(ancienneClé)
    } catch (r2DelErr: any) {
      // Non bloquant : image orpheline tolérée (pire que la perte des deux)
      console.warn(
        `[supplements/image] Purge ancienne image R2 échouée — clé: ${ancienneClé}:`,
        r2DelErr?.message ?? r2DelErr
      )
    }
  }

  await invaliderCacheSupplements(c.env, auth.tenant_slug)

  return c.json({ success: true, url: nouvelleUrl, key: nouvelleClé }, 200)
})

export { supplementsRouter }
