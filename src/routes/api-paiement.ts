/**
 * src/routes/api-paiement.ts — Routes du module paiement manuel MonMenu 
 *
 * MIGRATION PLANS — tous les plans sont désormais lus depuis Supabase
 * uniquement (chargerPlan(), src/lib/plans.ts). Plus de résolution D1 ↔
 * Supabase : le `plan_id` reçu du formulaire (peuplé depuis GET
 * /api/v1/plans, qui lit maintenant Supabase) est l'UUID Supabase natif,
 * utilisé tel quel pour vérifier le plan ET pour le stocker dans
 * abonnements.plan_id. C'est CE changement qui corrige le bug
 * "Erreur lors de la vérification du plan." — l'ancienne requête D1
 * échouait silencieusement car le plan_id envoyé ne correspondait plus au
 * schéma attendu.
 *
 * CORRECTIF — la mise à jour de `tenants` juste après l'insertion de
 * l'abonnement est désormais protégée par un try/catch non bloquant.
 * Avant ce correctif, une erreur transitoire sur cette seule ligne faisait
 * planter TOUTE la requête (500 "Erreur interne du serveur") alors que
 * l'abonnement était déjà enregistré en base — et empêchait surtout
 * l'insertion de la notification "Preuve de paiement reçue" juste en
 * dessous, qui ne s'exécutait donc jamais.
 *
 * Routes exposées :
 *   GET  /api/v1/paiement/statut        — Statut abonnement actuel + référence + délai
 *   GET  /api/v1/paiement/reference     — Génère ou retourne la référence active
 *   POST /api/v1/paiement/soumettre     — Upload preuve + création abonnement en_attente
 *   GET  /api/v1/paiement/historique    — Historique des abonnements du tenant
 *   GET  /api/v1/paiement/notifications — Notifications in-app paiement (bandeau)
 *
 * SÉCURITÉ (inchangée) :
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
import { chargerPlan } from '../lib/plans'
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

const paiementRouter = new Hono<{ Bindings: Env }>()
const ACCESS_TOKEN_COOKIE = 'sb-access-token'
const MAX_PREUVE_SIZE = 5 * 1024 * 1024
const RATE_LIMIT_UPLOAD = 3
const RATE_LIMIT_WINDOW = 3600000

// -----------------------------------------------------------------------
// Helper : Extraction et vérification du token JWT
// -----------------------------------------------------------------------

/**
 * Extrait et vérifie le token JWT (cookie httpOnly ou header Authorization),
 * puis délègue la décision d'accès à verifierAccesTenant().
 *
 * Les routes /api/v1/paiement/* acceptent TOUT tenant authentifié dont
 * l'accès n'est pas explicitement 'suspendu' ou 'introuvable' — y compris
 * le mode 'bloque' (inactif, sans abonnement en attente), car ces routes
 * sont précisément le moyen de sortir de cet état en soumettant un
 * nouveau paiement.
 */
async function verifyAuthPaiement(c: any): Promise<{
  user_id: string
  tenant_id: string
  tenant_slug: string
  tenant_nom: string
  tenant_statut: string
  mode_acces: string
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
      .maybeSingle()

    if (!lien?.tenant_id) return null

    const { data: tenant } = await adminClient
      .from('tenants')
      .select('id, slug, nom, statut')
      .eq('id', lien.tenant_id)
      .is('deleted_at', null)
      .single()

    if (!tenant) return null

    const resultat = await verifierAccesTenant(c.env, tenant.id)
    if (!resultat.accesComplet && !resultat.accesAbonnementSeul) return null

    return {
      user_id: user.id,
      tenant_id: tenant.id,
      tenant_slug: tenant.slug,
      tenant_nom: tenant.nom,
      tenant_statut: tenant.statut,
      mode_acces: resultat.mode,
      token
    }
  } catch {
    return null
  }
}

// -----------------------------------------------------------------------
// GET /api/v1/paiement/statut
// -----------------------------------------------------------------------
paiementRouter.get('/statut', async (c) => {
  setSecurityHeaders(c)
  const auth = await verifyAuthPaiement(c)
  if (!auth) return c.json({ error: 'Non authentifié.' }, 401)

  const adminClient = createSupabaseAdminClient(c.env)

  const { data: tenant } = await adminClient
    .from('tenants')
    .select('statut, plan_id, plan_initial_id, essai_expire_le, paiement_en_attente_depuis, reference_paiement_active')
    .eq('id', auth.tenant_id)
    .single()

  if (!tenant) return c.json({ error: 'Tenant introuvable.' }, 404)

  const { data: abonnement } = await adminClient
    .from('abonnements')
    .select('id, statut, date_fin, plan_id, soumis_le, delai_confirmation_expire_le, reference_paiement, methode_paiement, numero_expediteur, periodicite')
    .eq('tenant_id', auth.tenant_id)
    .in('statut', ['actif', 'en_attente_confirmation'])
    .order('created_at', { ascending: false })
    .maybeSingle()

  let heuresRestantes: number | null = null
  if (abonnement?.statut === 'en_attente_confirmation' && abonnement.delai_confirmation_expire_le) {
    heuresRestantes = heuresRestantesAvantDeadline(new Date(abonnement.delai_confirmation_expire_le))
  }

  let joursEssaiRestants: number | null = null
  if (tenant.statut === 'essai' && tenant.essai_expire_le) {
    joursEssaiRestants = Math.ceil(
      (new Date(tenant.essai_expire_le).getTime() - Date.now()) / 86400000
    )
  }

  // MIGRATION — plan_initial_id est prioritaire sur plan_id pour
  // l'affichage "plan choisi" avant confirmation, mais les deux sont
  // maintenant le MÊME type d'id (UUID Supabase natif) — un seul appel
  // à chargerPlan() suffit, plus de résolution D1 en deux temps.
  const planIdAResoudre = tenant.plan_initial_id ?? tenant.plan_id
  const planRow = await chargerPlan(c.env, planIdAResoudre)

  return c.json({
    statut_tenant: tenant.statut,
    plan_initial_id: tenant.plan_initial_id,
    plan_initial_nom: planRow?.nom ?? null,
    plan_initial_prix_mensuel: planRow?.prix_mensuel ?? null,
    abonnement: abonnement ? {
      id: abonnement.id,
      statut: abonnement.statut,
      date_fin: abonnement.date_fin,
      plan_id: abonnement.plan_id,
      periodicite: abonnement.periodicite ?? 'mensuel',
      reference_paiement: abonnement.reference_paiement,
      methode_paiement: abonnement.methode_paiement,
      numero_expediteur: abonnement.numero_expediteur,
      soumis_le: abonnement.soumis_le,
      delai_confirmation_expire_le: abonnement.delai_confirmation_expire_le,
      heures_restantes_confirmation: heuresRestantes,
      message_confirmation: abonnement.statut === 'en_attente_confirmation'
        ? messageEnAttenteConfirmation()
        : null
    } : null,
    essai_expire_le: tenant.essai_expire_le,
    jours_essai_restants: joursEssaiRestants,
    reference_active: tenant.reference_paiement_active,
    sla_admin_heures: SLA_ADMIN_HEURES,
    fenetre_acces_heures: FENETRE_ACCES_HEURES,
    mode_acces: auth.mode_acces
  })
})

// -----------------------------------------------------------------------
// GET /api/v1/paiement/reference
// -----------------------------------------------------------------------
paiementRouter.get('/reference', async (c) => {
  setSecurityHeaders(c)
  const auth = await verifyAuthPaiement(c)
  if (!auth) return c.json({ error: 'Non authentifié.' }, 401)

  const adminClient = createSupabaseAdminClient(c.env)

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
 * MIGRATION — plan_id reçu du formulaire est désormais l'UUID Supabase
 * natif (peuplé depuis /api/v1/plans, Supabase). Vérifié via chargerPlan()
 * au lieu d'une requête D1 directe.
 */
paiementRouter.post('/soumettre', async (c) => {
  setSecurityHeaders(c)
  const auth = await verifyAuthPaiement(c)
  if (!auth) return c.json({ error: 'Non authentifié.' }, 401)

  if (c.env.KV_CACHE) {
    const rateKey = `paiement_upload:${auth.tenant_id}`
    const rateLimit = await checkRateLimit(rateKey, RATE_LIMIT_UPLOAD, RATE_LIMIT_WINDOW, c.env.KV_CACHE)
    if (!rateLimit.allowed) {
      return c.json({ error: 'Trop de soumissions. Veuillez réessayer dans 1 heure.' }, 429)
    }
  }

  if (!c.env.R2_MEDIA) {
    return c.json({ error: 'Stockage de preuves non configuré. Contactez le support.' }, 503)
  }

  let formData: FormData
  try {
    formData = await c.req.formData()
  } catch {
    return c.json({ error: 'Format de requête invalide. Utilisez multipart/form-data.' }, 400)
  }

  const preuveFile = formData.get('preuve') as File | null
  const planId = formData.get('plan_id') as string | null
  const methodePaiement = formData.get('methode_paiement') as string | null
  const numeroExpediteurBrut = formData.get('numero_expediteur') as string | null

  if (!preuveFile || !(preuveFile instanceof File)) {
    return c.json({ error: 'Champ "preuve" manquant (fichier image requis).' }, 400)
  }
  if (!planId) {
    return c.json({ error: 'Champ "plan_id" manquant.' }, 400)
  }
  if (!methodePaiement) {
    return c.json({ error: 'Champ "methode_paiement" manquant.' }, 400)
  }
  const numeroExpediteur = (numeroExpediteurBrut ?? '').replace(/[^0-9+]/g, '')
  if (!numeroExpediteur || numeroExpediteur.replace(/\D/g, '').length < 8) {
    return c.json({ error: 'Le numéro utilisé pour le paiement est requis (8 chiffres minimum).' }, 400)
  }
  if (!validerExtensionImage(preuveFile.name)) {
    return c.json({ error: 'Format non autorisé. JPEG ou PNG uniquement.' }, 400)
  }
  if (!validerContentTypeImage(preuveFile.type)) {
    return c.json({ error: 'Type MIME non autorisé. image/jpeg ou image/png requis.' }, 400)
  }
  if (preuveFile.size > MAX_PREUVE_SIZE) {
    return c.json({ error: `Fichier trop grand. Maximum ${MAX_PREUVE_SIZE / 1024 / 1024} Mo.` }, 400)
  }

  const buffer = await preuveFile.arrayBuffer()
  const mimeResult = await validerMimeImage(buffer)
  if (!mimeResult.valide) {
    return c.json({ error: 'Fichier non reconnu comme image valide (vérification octets).' }, 400)
  }

  const adminClient = createSupabaseAdminClient(c.env)

  // MIGRATION — vérification du plan directement en Supabase (UUID natif),
  // plus de requête D1.
  const planRow = await chargerPlan(c.env, planId)
  if (!planRow) {
    return c.json({ error: 'Plan introuvable ou inactif.' }, 404)
  }
  const plan = { id: planRow.id, nom: planRow.nom, prix_mensuel: planRow.prix_mensuel, devise: planRow.devise ?? 'FCFA' }

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

  const { data: tenantData } = await adminClient
    .from('tenants')
    .select('reference_paiement_active')
    .eq('id', auth.tenant_id)
    .single()

  const reference = tenantData?.reference_paiement_active ?? genererReferencePaiement(auth.tenant_slug)

  const cleR2 = construireCleR2Preuve(auth.tenant_id, mimeResult.type!)

  try {
    await c.env.R2_MEDIA.put(cleR2, buffer, {
      httpMetadata: {
        contentType: mimeResult.type === 'png' ? 'image/png' : 'image/jpeg',
        contentDisposition: 'inline'
      },
      customMetadata: {
        tenant_id: auth.tenant_id,
        uploaded_at: new Date().toISOString()
      }
    })
  } catch (err) {
    console.error(`[PAIEMENT] Erreur R2 upload — tenant: ${auth.tenant_id.slice(0, 8)}...`)
    return c.json({ error: 'Erreur lors de l\'upload de la preuve.' }, 500)
  }

  const now = new Date()
  const deadline = calculerDeadlineConfirmation(now)
  const montantPaye = plan.prix_mensuel

  // MIGRATION — plan_id stocké = UUID Supabase natif (cohérent partout
  // désormais : tenants.plan_id, tenants.plan_initial_id, abonnements.plan_id)
  const { data: abonnement, error: abError } = await adminClient
    .from('abonnements')
    .insert({
      tenant_id: auth.tenant_id,
      plan_id: planId,
      statut: 'en_attente_confirmation',
      preuve_paiement_url: cleR2,
      reference_paiement: reference,
      soumis_le: now.toISOString(),
      delai_confirmation_expire_le: deadline.toISOString(),
      methode_paiement: methodePaiement.slice(0, 100),
      numero_expediteur: numeroExpediteur,
      montant_paye: montantPaye,
      devise: plan.devise,
      periodicite: 'mensuel',
      date_debut: now.toISOString(),
      created_at: now.toISOString()
    })
    .select('id')
    .single()

  if (abError || !abonnement) {
    console.error(`[PAIEMENT] Erreur insert abonnement — tenant: ${auth.tenant_id.slice(0, 8)}...`)
    try { await c.env.R2_MEDIA.delete(cleR2) } catch {}
    return c.json({ error: 'Erreur lors de l\'enregistrement du paiement.' }, 500)
  }

  // CORRECTIF CRITIQUE — cette mise à jour est désormais protégée par un
  // try/catch NON BLOQUANT. Avant, une erreur ici (même transitoire)
  // faisait planter toute la requête (500 "Erreur interne du serveur")
  // alors que l'abonnement était déjà enregistré, ET empêchait surtout
  // l'insertion de la notification restaurant juste en dessous de
  // s'exécuter. L'abonnement étant l'information faisant foi (déjà en
  // base à ce stade), on ne bloque plus jamais la réponse pour cette
  // mise à jour secondaire.
  try {
    await adminClient
      .from('tenants')
      .update({
        paiement_en_attente_depuis: now.toISOString(),
        reference_paiement_active: reference,
        updated_at: now.toISOString()
      })
      .eq('id', auth.tenant_id)
  } catch (err) {
    console.error(`[PAIEMENT] Erreur non bloquante update tenant — tenant: ${auth.tenant_id.slice(0, 8)}...`, err instanceof Error ? err.message : err)
  }

  if (c.env.KV_CACHE) {
    try { await c.env.KV_CACHE.delete(`tenant:${auth.tenant_slug}`) } catch {}
  }

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
    .catch(() => {})

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

  console.log(`[PAIEMENT] Preuve soumise — tenant: ${auth.tenant_id.slice(0, 8)}... plan: ${planId.slice(0, 8)}...`)

  return c.json({
    success: true,
    abonnement_id: abonnement.id,
    reference,
    delai_confirmation: deadline.toISOString(),
    heures_delai: FENETRE_ACCES_HEURES,
    sla_admin_heures: SLA_ADMIN_HEURES,
    message: messagePreuveRecue(),
    plan: { nom: plan.nom, montant: montantPaye, devise: plan.devise }
  })
})

// -----------------------------------------------------------------------
// GET /api/v1/paiement/historique
// -----------------------------------------------------------------------
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
    .select('id, statut, plan_id, date_debut, date_fin, montant_paye, devise, methode_paiement, numero_expediteur, reference_paiement, soumis_le, confirme_le, rejete_le, motif_rejet, created_at', { count: 'exact' })
    .eq('tenant_id', auth.tenant_id)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1)

  if (error) {
    console.error(`[PAIEMENT] Erreur historique — tenant: ${auth.tenant_id.slice(0, 8)}...`)
    return c.json({ error: 'Erreur lors de la récupération de l\'historique.' }, 500)
  }

  // MIGRATION — abonnements.plan_id est désormais l'UUID Supabase natif,
  // résolu directement via chargerPlan() (plus de résolution D1).
  const abonnementsAvecNomPlan = await Promise.all(
    (abonnements ?? []).map(async (ab: any) => {
      if (!ab.plan_id) return { ...ab, plan_nom: null }
      const plan = await chargerPlan(c.env, ab.plan_id)
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

  const { data: notifsDb } = await adminClient
    .from('notifications_restaurant')
    .select('id, type, titre, message, lue, lien, created_at')
    .eq('tenant_id', auth.tenant_id)
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