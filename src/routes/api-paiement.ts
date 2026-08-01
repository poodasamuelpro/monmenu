/**
 * src/routes/api-paiement.ts — Routes du module paiement manuel MonMenu
 *
 * CORRECTIONS CYCLE-4 :
 *   FIX-A — verifyAuthPaiement() remplacé par l'appel à la logique unique
 *           verifierAccesTenant() (src/lib/acces-tenant.ts), partagée avec
 *           api-dashboard.ts et index.ts. Avant : logique dupliquée et
 *           légèrement différente à 3 endroits → incohérences d'accès.
 *   FIX-B — Résolution du plan corrigée : tenant.plan_id / plan_initial_id
 *           sont des UUID Supabase, pas des id D1. On les résout désormais
 *           via resoudreIdD1DepuisPlanSupabase() avant d'interroger D1
 *           (voir src/lib/plans.ts). Avant, la requête D1 échouait toujours
 *           silencieusement (aucune ligne trouvée) → plan_initial_nom / prix
 *           toujours null côté client.
 *   FIX-C — /statut renvoie désormais `plan_initial_id_d1` (id D1) pour que
 *           le front puisse comparer correctement le plan "actuel" dans la
 *           grille de formules (avant : comparaison UUID Supabase vs id D1,
 *           qui ne matchait jamais).
 *   FIX-D — Tous les messages "38h" corrigés en "48h" (SLA admin annoncé),
 *           la fenêtre technique de 72h reste inchangée et clairement
 *           distinguée (voir src/lib/paiement.ts : SLA_ADMIN_HEURES / 
 *           FENETRE_ACCES_HEURES).
 *
 * Routes exposées :
 *   GET  /api/v1/paiement/statut        — Statut abonnement actuel + référence + délai
 *   GET  /api/v1/paiement/reference     — Génère ou retourne la référence active
 *   POST /api/v1/paiement/soumettre     — Upload preuve + création abonnement en_attente
 *   GET  /api/v1/paiement/historique    — Historique des abonnements du tenant
 *   GET  /api/v1/paiement/notifications — Notifications in-app paiement (bandeau)
 *
 * SÉCURITÉ (SEC-01 à SEC-09 appliquées) :
 *   - SEC-01 : statut jamais fourni par le client, toujours hardcodé
 *   - SEC-02 : validation MIME en 4 couches (extension, Content-Type, magic bytes, taille)
 *   - SEC-03 : IDOR impossible — toutes les requêtes filtrent par tenant_id du JWT
 *   - SEC-06 : URL R2 jamais exposée — clé R2 stockée en DB, URL signée 15min pour admin
 *   - SEC-07 : rate limiting 3 soumissions/heure par tenant
 *   - SEC-08 : idempotence — un seul en_attente_confirmation par tenant à la fois
 *   - SEC-09 : aucun nom de fichier ni référence brute dans les logs
 *
 * @module api-paiement
 */

import { Hono } from 'hono'
import { getCookie } from 'hono/cookie'
import type { Env } from '../types/database'
import { createSupabaseClient, createSupabaseAdminClient } from '../lib/supabase'
import { setSecurityHeaders, checkRateLimit } from '../lib/security'
import { verifierAccesTenant } from '../lib/acces-tenant'
import { resoudreIdD1DepuisPlanSupabase, chargerPlanD1 } from '../lib/plans'
import {
  genererReferencePaiement,
  calculerDeadlineConfirmation,
  heuresRestantesAvantDeadline,
  validerMimeImage,
  validerExtensionImage,
  validerContentTypeImage,
  construireCleR2Preuve,
  formaterDate,
  SLA_ADMIN_HEURES,
  FENETRE_ACCES_HEURES,
  messagePreuveRecue,
  messageEnAttenteConfirmation
} from '../lib/paiement'
import { notifierBlocageAutomatique } from '../lib/whatsapp'

const paiementRouter = new Hono<{ Bindings: Env }>()
const ACCESS_TOKEN_COOKIE = 'sb-access-token'
const MAX_PREUVE_SIZE = 5 * 1024 * 1024 // 5 Mo (SEC-02)
const RATE_LIMIT_UPLOAD = 3              // 3 soumissions max/heure (SEC-07)
const RATE_LIMIT_WINDOW = 3600000        // 1 heure en ms

// -----------------------------------------------------------------------
// Helper : Extraction et vérification du token JWT
// -----------------------------------------------------------------------

/**
 * Extrait et vérifie le token JWT depuis les cookies httpOnly ou le header
 * Authorization, puis délègue la décision d'accès à verifierAccesTenant()
 * (src/lib/acces-tenant.ts) — LOGIQUE UNIQUE partagée avec le reste de
 * l'app (FIX-A). Les routes /api/v1/paiement/* doivent rester accessibles
 * dans TOUS les modes d'accès valides : actif, essai, paiement_initial
 * (1ère preuve) et grace_confirmation (fenêtre de 72h).
 *
 * SEC-03 : le tenant_id retourné vient TOUJOURS du JWT, jamais du body/params.
 */
async function verifyAuthPaiement(c: any): Promise<{
  user_id: string
  tenant_id: string
  tenant_slug: string
  tenant_nom: string
  tenant_statut: string
  token: string
} | null> {
  const cookieToken = getCookie(c, ACCESS_TOKEN_COOKIE)
  const headerToken = c.req.header('Authorization')?.replace('Bearer ', '').trim()
  const token = (cookieToken && cookieToken.length >= 20) ? cookieToken.trim() : (headerToken ?? null)
  if (!token) return null

  try {
    const supabase = createSupabaseClient(c.env)
    const { data: { user }, error } = await supabase.auth.getUser(token)
    if (error || !user) return null

    const adminClient = createSupabaseAdminClient(c.env)
    const { data: lien } = await adminClient
      .from('utilisateurs_tenant')
      .select('tenant_id')
      .eq('auth_user_id', user.id)
      .is('deleted_at' as any, null)
      .single()

    if (!lien?.tenant_id) return null

    const { data: tenant } = await adminClient
      .from('tenants')
      .select('id, slug, nom, statut')
      .eq('id', lien.tenant_id)
      .is('deleted_at', null)
      .single()

    if (!tenant) return null

    // FIX-A : logique d'accès unique. Toutes les routes paiement acceptent
    // les 4 modes valides (paiement_initial inclus, puisque c'est
    // précisément le mode qui a besoin de ces routes pour soumettre la
    // première preuve).
    const resultat = await verifierAccesTenant(c.env, tenant.id)
    if (!resultat.acces) return null

    return {
      user_id: user.id,
      tenant_id: tenant.id,
      tenant_slug: tenant.slug,
      tenant_nom: tenant.nom,
      tenant_statut: tenant.statut,
      token
    }
  } catch {
    return null
  }
}

// -----------------------------------------------------------------------
// GET /api/v1/paiement/statut
// -----------------------------------------------------------------------

/**
 * Retourne le statut d'abonnement actuel du tenant authentifié.
 * Inclut : statut, référence active, heures restantes si en_attente_confirmation.
 *
 * SEC-03 : tenant_id issu du JWT uniquement.
 */
paiementRouter.get('/statut', async (c) => {
  setSecurityHeaders(c)
  const auth = await verifyAuthPaiement(c)
  if (!auth) return c.json({ error: 'Non authentifié.' }, 401)

  const adminClient = createSupabaseAdminClient(c.env)

  // Tenant courant — inclut plan_initial_id (CYCLE-3)
  const { data: tenant } = await adminClient
    .from('tenants')
    .select('statut, plan_id, plan_initial_id, essai_expire_le, paiement_en_attente_depuis, reference_paiement_active')
    .eq('id', auth.tenant_id)
    .single()

  if (!tenant) return c.json({ error: 'Tenant introuvable.' }, 404)

  // Abonnement actuel (le plus récent non annulé)
  const { data: abonnement } = await adminClient
    .from('abonnements')
    .select('id, statut, date_fin, plan_id, soumis_le, delai_confirmation_expire_le, reference_paiement, methode_paiement, periodicite')
    .eq('tenant_id', auth.tenant_id)
    .in('statut', ['actif', 'en_attente_confirmation'])
    .order('created_at', { ascending: false })
    .maybeSingle()

  let heuresRestantes: number | null = null
  if (abonnement?.statut === 'en_attente_confirmation' && abonnement.delai_confirmation_expire_le) {
    heuresRestantes = heuresRestantesAvantDeadline(new Date(abonnement.delai_confirmation_expire_le))
  }

  // Jours d'essai restants
  let joursEssaiRestants: number | null = null
  if (tenant.statut === 'essai' && tenant.essai_expire_le) {
    joursEssaiRestants = Math.ceil(
      (new Date(tenant.essai_expire_le).getTime() - Date.now()) / 86400000
    )
  }

  // FIX-B — Résolution correcte UUID Supabase → id D1 → ligne D1.
  // tenant.plan_initial_id est prioritaire sur tenant.plan_id pour
  // l'affichage "plan choisi" avant confirmation (CYCLE-3).
  const idD1PlanInitial = await resoudreIdD1DepuisPlanSupabase(c.env, tenant.plan_initial_id)
  const idD1PlanActuel = await resoudreIdD1DepuisPlanSupabase(c.env, tenant.plan_id)
  const idD1AResoudre = idD1PlanInitial ?? idD1PlanActuel
  const planRow = await chargerPlanD1(c.env, idD1AResoudre)

  return c.json({
    statut_tenant: tenant.statut,
    plan_initial_id: tenant.plan_initial_id,
    // FIX-C : id D1 exposé pour que le front compare correctement le plan
    // "actuel" dans la grille de formules (voir dashboard-paiement.js).
    plan_initial_id_d1: idD1AResoudre,
    plan_initial_nom: planRow?.nom ?? null,
    plan_initial_prix_mensuel: planRow?.prix_mensuel ?? null,
    abonnement: abonnement ? {
      id: abonnement.id,
      statut: abonnement.statut,
      date_fin: abonnement.date_fin,
      plan_id: abonnement.plan_id,
      periodicite: abonnement.periodicite ?? 'mensuel',
      reference_paiement: abonnement.reference_paiement,
      soumis_le: abonnement.soumis_le,
      delai_confirmation_expire_le: abonnement.delai_confirmation_expire_le,
      heures_restantes_confirmation: heuresRestantes,
      // FIX-D : message unifié 48h (SLA) / 72h (fenêtre technique)
      message_confirmation: abonnement.statut === 'en_attente_confirmation'
        ? messageEnAttenteConfirmation()
        : null
    } : null,
    essai_expire_le: tenant.essai_expire_le,
    jours_essai_restants: joursEssaiRestants,
    reference_active: tenant.reference_paiement_active,
    sla_admin_heures: SLA_ADMIN_HEURES,
    fenetre_acces_heures: FENETRE_ACCES_HEURES
  })
})

// -----------------------------------------------------------------------
// GET /api/v1/paiement/reference
// -----------------------------------------------------------------------

/**
 * Retourne la référence de paiement active du tenant, ou en génère une nouvelle.
 *
 * La référence est un aide-mémoire de rapprochement uniquement (SEC-10).
 * Elle est stockée dans tenants.reference_paiement_active pour être réutilisée.
 */
paiementRouter.get('/reference', async (c) => {
  setSecurityHeaders(c)
  const auth = await verifyAuthPaiement(c)
  if (!auth) return c.json({ error: 'Non authentifié.' }, 401)

  const adminClient = createSupabaseAdminClient(c.env)

  // Récupérer ou générer la référence active
  const { data: tenant } = await adminClient
    .from('tenants')
    .select('reference_paiement_active')
    .eq('id', auth.tenant_id)
    .single()

  let reference = tenant?.reference_paiement_active

  if (!reference) {
    reference = genererReferencePaiement(auth.tenant_slug)
    await adminClient
      .from('tenants')
      .update({ reference_paiement_active: reference, updated_at: new Date().toISOString() })
      .eq('id', auth.tenant_id)
  }

  return c.json({
    reference,
    instructions: [
      'Indiquez cette référence dans votre virement ou paiement Mobile Money.',
      'Elle nous permet d\'identifier votre paiement rapidement.',
      'Après paiement, uploadez votre preuve via le bouton "J\'ai payé".'
    ]
  })
})

// -----------------------------------------------------------------------
// POST /api/v1/paiement/soumettre
// -----------------------------------------------------------------------

/**
 * Soumet une preuve de paiement.
 *
 * Corps attendu : multipart/form-data avec :
 *   - preuve     : Fichier image (JPEG ou PNG, max 5 Mo)
 *   - plan_id    : id D1 du plan choisi (cohérent avec /api/v1/plans, D1)
 *   - methode_paiement : Chaîne (ex: "Mobile Money", "Virement bancaire")
 *   (CYCLE-3 : periodicite supprimé — tous les abonnements sont exclusivement mensuels)
 *
 * Sécurité :
 *   - SEC-01 : statut hardcodé à 'en_attente_confirmation', jamais du body
 *   - SEC-02 : validation en 4 couches
 *   - SEC-07 : rate limiting 3/h
 *   - SEC-08 : idempotence — un seul en_attente par tenant
 */
paiementRouter.post('/soumettre', async (c) => {
  setSecurityHeaders(c)
  const auth = await verifyAuthPaiement(c)
  if (!auth) return c.json({ error: 'Non authentifié.' }, 401)

  // SEC-07 : Rate limiting 3 soumissions/heure par tenant
  if (c.env.KV_CACHE) {
    const rateKey = `paiement_upload:${auth.tenant_id}`
    const rateLimit = await checkRateLimit(rateKey, RATE_LIMIT_UPLOAD, RATE_LIMIT_WINDOW, c.env.KV_CACHE)
    if (!rateLimit.allowed) {
      return c.json({ error: 'Trop de soumissions. Veuillez réessayer dans 1 heure.' }, 429)
    }
  }

  // Vérification R2 configuré
  if (!c.env.R2_MEDIA) {
    return c.json({ error: 'Stockage de preuves non configuré. Contactez le support.' }, 503)
  }

  // Parsing multipart/form-data
  let formData: FormData
  try {
    formData = await c.req.formData()
  } catch {
    return c.json({ error: 'Format de requête invalide. Utilisez multipart/form-data.' }, 400)
  }

  const preuveFile = formData.get('preuve') as File | null
  const planId = formData.get('plan_id') as string | null
  const methodePaiement = formData.get('methode_paiement') as string | null
  // CYCLE-3 : periodicite supprimé — tous les abonnements sont exclusivement mensuels
  const periodicite = 'mensuel'

  if (!preuveFile || !(preuveFile instanceof File)) {
    return c.json({ error: 'Champ "preuve" manquant (fichier image requis).' }, 400)
  }
  if (!planId) {
    return c.json({ error: 'Champ "plan_id" manquant.' }, 400)
  }
  if (!methodePaiement) {
    return c.json({ error: 'Champ "methode_paiement" manquant.' }, 400)
  }
  // SEC-02 Couche 1 : Extension
  if (!validerExtensionImage(preuveFile.name)) {
    return c.json({ error: 'Format non autorisé. JPEG ou PNG uniquement.' }, 400)
  }

  // SEC-02 Couche 2 : Content-Type déclaré
  if (!validerContentTypeImage(preuveFile.type)) {
    return c.json({ error: 'Type MIME non autorisé. image/jpeg ou image/png requis.' }, 400)
  }

  // SEC-02 Couche 4 : Taille max
  if (preuveFile.size > MAX_PREUVE_SIZE) {
    return c.json({ error: `Fichier trop grand. Maximum ${MAX_PREUVE_SIZE / 1024 / 1024} Mo.` }, 400)
  }

  // SEC-02 Couche 3 : Magic bytes (validation principale)
  const buffer = await preuveFile.arrayBuffer()
  const mimeResult = await validerMimeImage(buffer)
  if (!mimeResult.valide) {
    return c.json({ error: 'Fichier non reconnu comme image valide (vérification octets).' }, 400)
  }

  const adminClient = createSupabaseAdminClient(c.env)

  // planId reçu du front est un id D1 (le select du formulaire est peuplé
  // depuis /api/v1/plans, qui lit D1) — cohérent avec la vérification D1
  // ci-dessous. Ce plan_id (D1) est celui qui sera stocké dans
  // abonnements.plan_id, PAS l'UUID Supabase (voir src/lib/plans.ts pour
  // le pourquoi de cette distinction).
  let plan: { id: string; nom: string; prix_mensuel: number; devise: string } | null = null
  try {
    plan = await c.env.DB
      .prepare('SELECT id, nom, prix_mensuel, devise FROM plans WHERE id = ? AND actif = 1 LIMIT 1')
      .bind(planId)
      .first<{ id: string; nom: string; prix_mensuel: number; devise: string }>()
  } catch {
    return c.json({ error: 'Erreur lors de la vérification du plan.' }, 500)
  }

  if (!plan) {
    return c.json({ error: 'Plan introuvable ou inactif.' }, 404)
  }

  // SEC-08 : Idempotence — vérifier qu'il n'y a pas déjà un paiement en attente.
  // CYCLE-5 FIX : on ignore désormais un abonnement 'en_attente_confirmation'
  // dont la deadline (delai_confirmation_expire_le) est déjà dépassée. Sans
  // ce filtre, un tenant bloqué par sa fenêtre de 72h expirée (accès déjà
  // coupé via verifierAccesTenant) recevait quand même un 409 "paiement déjà
  // en cours" en tentant de soumettre une NOUVELLE preuve — alors que le
  // cron api-cron.ts (bloquerPaiementsExpires, toutes les 6h) n'avait pas
  // encore eu le temps de basculer la ligne en statut 'expire'.
  const { data: abonnementExistant } = await adminClient
    .from('abonnements')
    .select('id, soumis_le, reference_paiement')
    .eq('tenant_id', auth.tenant_id)
    .eq('statut', 'en_attente_confirmation')
    .gt('delai_confirmation_expire_le', new Date().toISOString())
    .maybeSingle()

  if (abonnementExistant) {
    return c.json({
      success: false,
      error: 'Un paiement est déjà en cours de vérification.',
      abonnement_id: abonnementExistant.id,
      soumis_le: abonnementExistant.soumis_le,
      reference: abonnementExistant.reference_paiement
    }, 409)
  }

  // Récupérer ou générer la référence
  const { data: tenantData } = await adminClient
    .from('tenants')
    .select('reference_paiement_active')
    .eq('id', auth.tenant_id)
    .single()

  const reference = tenantData?.reference_paiement_active ?? genererReferencePaiement(auth.tenant_slug)

  // SEC-02 / SEC-09 : Clé R2 construite côté serveur, jamais dépendante du nom client
  const cleR2 = construireCleR2Preuve(auth.tenant_id, mimeResult.type!)

  // Upload dans R2 (bucket privé — jamais d'URL publique directe)
  try {
    await c.env.R2_MEDIA.put(cleR2, buffer, {
      httpMetadata: {
        contentType: mimeResult.type === 'png' ? 'image/png' : 'image/jpeg',
        contentDisposition: 'inline'
      },
      customMetadata: {
        tenant_id: auth.tenant_id,
        uploaded_at: new Date().toISOString()
        // SEC-09 : NE PAS stocker le nom original du fichier
      }
    })
  } catch (err) {
    // SEC-09 : ne pas logger la clé R2 complète
    console.error(`[PAIEMENT] Erreur R2 upload — tenant: ${auth.tenant_id.slice(0, 8)}...`)
    return c.json({ error: 'Erreur lors de l\'upload de la preuve.' }, 500)
  }

  const now = new Date()
  const deadline = calculerDeadlineConfirmation(now)
  // CYCLE-3 : montant toujours mensuel — pas de branche annuelle
  const montantPaye = plan.prix_mensuel

  // SEC-01 : statut hardcodé, jamais du body
  const { data: abonnement, error: abError } = await adminClient
    .from('abonnements')
    .insert({
      tenant_id: auth.tenant_id,        // SEC-03 : du JWT, jamais du body
      plan_id: planId,                  // id D1 — cohérent avec /historique
      statut: 'en_attente_confirmation', // SEC-01 : hardcodé
      preuve_paiement_url: cleR2,        // Clé R2 (pas l'URL publique — SEC-06)
      reference_paiement: reference,
      soumis_le: now.toISOString(),
      delai_confirmation_expire_le: deadline.toISOString(),
      methode_paiement: methodePaiement.slice(0, 100),
      montant_paye: montantPaye,
      devise: plan.devise ?? 'XOF',
      periodicite: 'mensuel',            // CYCLE-3 : toujours mensuel
      date_debut: now.toISOString(),
      created_at: now.toISOString()
    })
    .select('id')
    .single()

  if (abError || !abonnement) {
    console.error(`[PAIEMENT] Erreur insert abonnement — tenant: ${auth.tenant_id.slice(0, 8)}...`)
    // Rollback : supprimer l'objet R2
    try { await c.env.R2_MEDIA.delete(cleR2) } catch {}
    return c.json({ error: 'Erreur lors de l\'enregistrement du paiement.' }, 500)
  }

  // Mettre à jour le tenant
  await adminClient
    .from('tenants')
    .update({
      paiement_en_attente_depuis: now.toISOString(),
      reference_paiement_active: reference,
      updated_at: now.toISOString()
    })
    .eq('id', auth.tenant_id)

  // Invalider cache KV
  if (c.env.KV_CACHE) {
    try { await c.env.KV_CACHE.delete(`tenant:${auth.tenant_slug}`) } catch {}
  }

  // Créer notification admin (table notifications_admin)
  await adminClient
    .from('notifications_admin')
    .insert({
      type: 'warning',
      titre: `Nouveau paiement à confirmer — ${auth.tenant_nom}`,
      message: `Plan ${plan.nom} — Soumis le ${formaterDate(now.toISOString())}. SLA : ${SLA_ADMIN_HEURES}h (fenêtre technique ${FENETRE_ACCES_HEURES}h).`,
      lien: '#paiements',
      payload: {
        tenant_id: auth.tenant_id,
        abonnement_id: abonnement.id,
        plan_id: planId,
        soumis_le: now.toISOString()
      }
    })
    .catch(() => {}) // Non bloquant

  // Créer notification restaurant (confirmation de réception)
  await adminClient
    .from('notifications_restaurant')
    .insert({
      tenant_id: auth.tenant_id,
      type: 'info',
      titre: 'Preuve de paiement reçue',
      message: `Votre preuve de paiement pour le plan ${plan.nom} a bien été reçue. ${messagePreuveRecue()}`,
      lien: '/dashboard/abonnement',
      payload: { abonnement_id: abonnement.id, reference }
    })
    .catch(() => {})

  // SEC-09 : log minimaliste (pas de référence brute, pas de clé R2)
  console.log(`[PAIEMENT] Preuve soumise — tenant: ${auth.tenant_id.slice(0, 8)}... plan: ${planId.slice(0, 8)}...`)

  return c.json({
    success: true,
    abonnement_id: abonnement.id,
    reference,
    delai_confirmation: deadline.toISOString(),
    heures_delai: FENETRE_ACCES_HEURES,
    sla_admin_heures: SLA_ADMIN_HEURES,
    message: messagePreuveRecue(),
    plan: { nom: plan.nom, montant: montantPaye, devise: plan.devise ?? 'XOF' }
  })
})

// -----------------------------------------------------------------------
// GET /api/v1/paiement/historique
// -----------------------------------------------------------------------

/**
 * Retourne l'historique des abonnements du tenant authentifié.
 * Paginé, trié du plus récent au plus ancien.
 *
 * SEC-03 : filtre exclusivement par tenant_id du JWT.
 */
paiementRouter.get('/historique', async (c) => {
  setSecurityHeaders(c)
  const auth = await verifyAuthPaiement(c)
  if (!auth) return c.json({ error: 'Non authentifié.' }, 401)

  const page = Math.max(1, parseInt(c.req.query('page') ?? '1'))
  const limit = Math.min(20, Math.max(1, parseInt(c.req.query('limit') ?? '10')))
  const offset = (page - 1) * limit

  const adminClient = createSupabaseAdminClient(c.env)

  const { data: abonnements, error, count } = await adminClient
    .from('abonnements')
    .select('id, statut, plan_id, date_debut, date_fin, montant_paye, devise, methode_paiement, reference_paiement, soumis_le, confirme_le, rejete_le, motif_rejet, created_at', { count: 'exact' })
    .eq('tenant_id', auth.tenant_id) // SEC-03 : toujours filtrer par tenant_id du JWT
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1)

  if (error) {
    console.error(`[PAIEMENT] Erreur historique — tenant: ${auth.tenant_id.slice(0, 8)}...`)
    return c.json({ error: 'Erreur lors de la récupération de l\'historique.' }, 500)
  }

  // abonnements.plan_id est un id D1 (stocké tel quel par /soumettre) —
  // résolution directe, sans passer par resoudreIdD1DepuisPlanSupabase().
  const abonnementsAvecNomPlan = await Promise.all(
    (abonnements ?? []).map(async (ab: any) => {
      if (!ab.plan_id) return { ...ab, plan_nom: null }
      const plan = await chargerPlanD1(c.env, ab.plan_id)
      return { ...ab, plan_nom: plan?.nom ?? null, plan_prix_mensuel: plan?.prix_mensuel ?? null }
    })
  )

  return c.json({
    abonnements: abonnementsAvecNomPlan,
    total: count ?? 0,
    page,
    limit,
    total_pages: Math.ceil((count ?? 0) / limit)
  })
})

// -----------------------------------------------------------------------
// GET /api/v1/paiement/notifications
// -----------------------------------------------------------------------

/**
 * Retourne les notifications in-app liées au paiement pour le tenant.
 * Combinaison de notifications dynamiques (statut, essai) et persistantes (DB).
 *
 * Utilisé par le bandeau de notifications du dashboard restaurant.
 * SEC-03 : filtre par tenant_id du JWT.
 */
paiementRouter.get('/notifications', async (c) => {
  setSecurityHeaders(c)
  const auth = await verifyAuthPaiement(c)
  if (!auth) return c.json({ error: 'Non authentifié.' }, 401)

  const adminClient = createSupabaseAdminClient(c.env)
  const notifications: Array<{
    id: string
    type: string
    titre: string
    message: string
    action?: { label: string; href: string }
    created_at: string
  }> = []

  // 1. Statut tenant — notifications dynamiques
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
            ? 'Votre période d\'essai est terminée. Activez votre abonnement pour continuer.'
            : `Il vous reste ${joursRestants} jour(s) d\'essai gratuit.`,
          action: { label: 'Voir les plans', href: '/dashboard/abonnement' },
          created_at: new Date().toISOString()
        })
      }
    }

    if (tenant.paiement_en_attente_depuis) {
      // Vérifier qu'un abonnement en_attente_confirmation est encore actif
      const { data: abonnementAttente } = await adminClient
        .from('abonnements')
        .select('id, delai_confirmation_expire_le')
        .eq('tenant_id', auth.tenant_id)
        .eq('statut', 'en_attente_confirmation')
        .maybeSingle()

      if (abonnementAttente) {
        const heuresRestantes = abonnementAttente.delai_confirmation_expire_le
          ? heuresRestantesAvantDeadline(new Date(abonnementAttente.delai_confirmation_expire_le))
          : null
        notifications.push({
          id: 'paiement-attente',
          type: heuresRestantes !== null && heuresRestantes < 10 ? 'warning' : 'info',
          titre: 'Paiement en cours de vérification',
          message: `${messageEnAttenteConfirmation()}${heuresRestantes !== null ? ` (${heuresRestantes}h restantes avant coupure automatique)` : ''}`,
          action: { label: 'Voir le suivi', href: '/dashboard/abonnement' },
          created_at: tenant.paiement_en_attente_depuis
        })
      }
    }
  }

  // 2. Notifications persistantes depuis notifications_restaurant (non lues)
  const { data: notifsDb } = await adminClient
    .from('notifications_restaurant')
    .select('id, type, titre, message, lue, lien, created_at')
    .eq('tenant_id', auth.tenant_id) // SEC-03
    .eq('lue', false)
    .order('created_at', { ascending: false })
    .limit(10)

  const notifsMapped = (notifsDb ?? []).map((n: any) => ({
    id: n.id,
    type: n.type,
    titre: n.titre,
    message: n.message,
    action: n.lien ? { label: 'Voir', href: n.lien } : undefined,
    created_at: n.created_at
  }))

  const toutes = [...notifications, ...notifsMapped]

  return c.json({
    notifications: toutes,
    count: toutes.length,
    non_lues: toutes.length
  })
})

export { paiementRouter }
