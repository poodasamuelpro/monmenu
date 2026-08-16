/**
 * src/routes/api-admin-paiements.ts — Administration des paiements manuels 
 *
 * MIGRATION PLANS — abonnement.plan_id EST désormais directement l'UUID
 * Supabase natif (stocké tel quel par POST /api/v1/paiement/soumettre).
 * Plus de résolution D1 → Supabase à la confirmation : tenant.plan_id
 * reçoit directement abonnement.plan_id, sans passer par
 * resoudreIdSupabaseDepuisPlanD1(). Ce changement supprime définitivement
 * le mode d'échec historique de ce fichier (CYCLE-5 FIX-E) : il ne peut
 * plus y avoir de "correspondance manquante" puisqu'il n'y a plus qu'un
 * seul id à transporter.
 *
 * Ce router est monté dans src/index.ts sous /api/v1/admin/paiements.
 *
 *   GET  /api/v1/admin/paiements              — Liste des paiements en attente
 *   POST /api/v1/admin/paiements/confirmer    — Confirmer un paiement (active le tenant)
 *   POST /api/v1/admin/paiements/rejeter      — Rejeter un paiement (avec motif)
 *   GET  /api/v1/admin/paiements/preuve/:id   — URL signée R2 (15 min) de la preuve
 *   GET  /api/v1/admin/paiements/moyens       — Liste des moyens de paiement
 *   POST /api/v1/admin/paiements/moyens       — Créer/modifier un moyen de paiement
 *   PATCH /api/v1/admin/paiements/moyens/:id  — Mettre à jour un moyen de paiement
 *
 * SÉCURITÉ :
 *   - Authentification : header X-Admin-Secret (jamais en query string)
 *   - URL R2 signée, jamais d'URL publique directe
 *   - Audit trail (confirme_par, confirme_le, rejete_par, rejete_le)
 *   - Quand un paiement est confirmé :
 *       tenant.plan_id      ← UUID Supabase de abonnement.plan_id (identique)
 *       tenant.statut       ← 'actif'
 *       tenant.essai_expire_le ← null
 *
 * @module api-admin-paiements
 */

import { Hono } from 'hono'
import type { Env } from '../types/database'
import { createSupabaseAdminClient } from '../lib/supabase'
import { setSecurityHeaders, timingSafeEqual, checkRateLimit } from '../lib/security'
import { formaterDate, SLA_ADMIN_HEURES, FENETRE_ACCES_HEURES } from '../lib/paiement'
import { chargerPlan } from '../lib/plans'
import { notifierPaiementConfirme, notifierPaiementRejete } from '../lib/whatsapp'
import { sendFcmToTenant } from '../lib/fcm'
import { envoyerEmailPaiementConfirme, envoyerEmailPaiementRejete } from '../lib/brevo'

const adminPaiementsRouter = new Hono<{ Bindings: Env }>()

// ── Middleware d'authentification admin ─────────────────────────────────────
adminPaiementsRouter.use('*', async (c, next) => {
  setSecurityHeaders(c)

  const secret = c.req.header('X-Admin-Secret')

  if (!c.env.ADMIN_WEBHOOK_SECRET) {
    return c.json({ error: 'Administration non configurée.' }, 503)
  }

  // A-7 (FINDING-23, session-7) — comparaison timing-safe (remplace !==)
  if (!secret || !timingSafeEqual(secret, c.env.ADMIN_WEBHOOK_SECRET)) {
    return c.json({ error: 'Non autorisé.' }, 401)
  }

  return next()
})

// ── GET /api/v1/admin/paiements ─────────────────────────────────────────────
adminPaiementsRouter.get('/', async (c) => {
  const adminClient = createSupabaseAdminClient(c.env)
  const statut = c.req.query('statut') ?? 'en_attente_confirmation'
  const page  = Math.max(1, parseInt(c.req.query('page')  ?? '1'))
  const limit = Math.min(50, Math.max(1, parseInt(c.req.query('limit') ?? '20')))
  const offset = (page - 1) * limit

  const { data: abonnements, error, count } = await adminClient
    .from('abonnements')
    .select(`
      id, statut, plan_id, tenant_id, montant_paye, devise,
      methode_paiement, numero_expediteur, reference_paiement, soumis_le,
      delai_confirmation_expire_le, preuve_paiement_url, created_at,
      confirme_le, rejete_le, motif_rejet,
      tenants!inner ( id, nom, slug, whatsapp_number, statut )
    `, { count: 'exact' })
    .eq('statut', statut)
    .order('soumis_le', { ascending: true })
    .range(offset, offset + limit - 1)

  if (error) {
    console.error('[admin-paiements] Erreur liste:', error.message)
    return c.json({ error: 'Erreur lors de la récupération.' }, 500)
  }

  // Corr#14.2 — Anti-N+1 : charger tous les plans distincts en une requête .in()
  // au lieu de N appels chargerPlan individuels dans Promise.all.
  const planIds = [...new Set((abonnements ?? []).map((ab: any) => ab.plan_id).filter(Boolean))]
  const plansMap = new Map<string, string>()
  if (planIds.length > 0) {
    const { data: plansData } = await adminClient
      .from('plans')
      .select('id, nom')
      .in('id', planIds)
    for (const p of (plansData ?? [])) {
      plansMap.set(p.id, p.nom)
    }
  }

  const enrichis = (abonnements ?? []).map((ab: any) => {
    const plan_nom = ab.plan_id ? (plansMap.get(ab.plan_id) ?? null) : null
    const heuresRestantes = ab.delai_confirmation_expire_le
      ? Math.ceil((new Date(ab.delai_confirmation_expire_le).getTime() - Date.now()) / 3600000)
      : null
    const urgent = heuresRestantes !== null && heuresRestantes < 12
    return { ...ab, plan_nom, heures_restantes: heuresRestantes, urgent }
  })

  return c.json({
    paiements: enrichis,
    total: count ?? 0,
    page,
    limit,
    total_pages: Math.ceil((count ?? 0) / limit),
    sla_admin_heures: SLA_ADMIN_HEURES,
    fenetre_acces_heures: FENETRE_ACCES_HEURES
  })
})

// ── POST /api/v1/admin/paiements/confirmer ──────────────────────────────────
adminPaiementsRouter.post('/confirmer', async (c) => {
  let body: { abonnement_id?: string; admin_id?: string; note?: string }
  try { body = await c.req.json() }
  catch { return c.json({ error: 'JSON invalide.' }, 400) }

  const { abonnement_id, admin_id, note } = body

  if (!abonnement_id) {
    return c.json({ error: 'abonnement_id requis.' }, 422)
  }
  // B-ADPAY-05 — fix session-5 : validation format UUID avant tout appel DB
  const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
  if (!UUID_REGEX.test(abonnement_id)) {
    return c.json({ error: 'Format abonnement_id invalide (UUID v4 attendu).' }, 422)
  }

  const adminClient = createSupabaseAdminClient(c.env)
  const now = new Date().toISOString()

  const { data: abonnement } = await adminClient
    .from('abonnements')
    .select('id, tenant_id, plan_id, montant_paye, devise, methode_paiement, reference_paiement')
    .eq('id', abonnement_id)
    .eq('statut', 'en_attente_confirmation')
    .single()

  if (!abonnement) {
    return c.json({ error: 'Abonnement introuvable ou déjà traité.' }, 404)
  }

  // 1. Confirmer l'abonnement (audit trail)
  // B-ADPAY-03 — fix session-5 : ajout de .select('id') pour détecter 0 lignes affectées
  // (race condition : un second appel simultané renvoyait 0 ligne sans erreur).
  const { data: abConfirmedRows, error: abError } = await adminClient
    .from('abonnements')
    .update({
      statut: 'actif',
      confirme_par: admin_id ?? 'admin',
      confirme_le: now,
      updated_at: now
    })
    .eq('id', abonnement_id)
    .eq('statut', 'en_attente_confirmation')
    .select('id')

  if (abError) {
    console.error('[admin-paiements/confirmer] Erreur update abonnement:', abError.message)
    return c.json({ error: 'Erreur lors de la confirmation.' }, 500)
  }
  if (!abConfirmedRows || abConfirmedRows.length === 0) {
    return c.json({ error: 'Ce paiement a déjà été traité ou est introuvable.' }, 409)
  }

  // 2. Récupérer le plan Supabase + abonnement actif existant pour calculer date_fin
  let dateFin: string | null = null
  let planNom: string | null = null
  const planRow = await chargerPlan(c.env, abonnement.plan_id)
  if (planRow) {
    planNom = planRow.nom

    // BUG-13 CORRIGÉ — setMonth() déborde en fin de mois (ex: 31 jan + 1 mois = 3 mars).
    // Méthode sûre : aller au 1er du mois suivant, puis reposer au bon jour
    // (min entre le jour original et le dernier jour du mois cible).
    //
    // RÉABONNEMENT ANTICIPÉ — si le tenant a déjà un abonnement actif avec une
    // date_fin future, on calcule la nouvelle date_fin à partir de cette date
    // existante (pas depuis now()), pour ne pas faire perdre de jours payés.
    let baseDate = new Date()

    // Chercher l'abonnement actif existant avec date_fin future
    const { data: abActif } = await adminClient
      .from('abonnements')
      .select('date_fin')
      .eq('tenant_id', abonnement.tenant_id)
      .eq('statut', 'actif')
      .gt('date_fin', now)
      .order('date_fin', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (abActif?.date_fin) {
      // Réabonnement anticipé : partir de l'ancienne date_fin pour ne pas perdre de jours
      baseDate = new Date(abActif.date_fin)
      console.log(`[admin-paiements/confirmer] Réabonnement anticipé — base = ${abActif.date_fin}`)
    }

    const jourDuMois = baseDate.getDate()
    const finCalc = new Date(baseDate)
    finCalc.setDate(1)              // Aller au 1er du mois courant (base)
    finCalc.setMonth(finCalc.getMonth() + 1) // Passer au 1er du mois suivant
    // Reposer sur le bon jour (min entre le jour original et le dernier jour du mois cible)
    const dernierJourMoisSuivant = new Date(finCalc.getFullYear(), finCalc.getMonth() + 1, 0).getDate()
    finCalc.setDate(Math.min(jourDuMois, dernierJourMoisSuivant))
    dateFin = finCalc.toISOString()

    // B-ADPAY-02 — fix session-5 : ajout de .select('id') pour détecter un UPDATE à 0 ligne.
    // Non bloquant : l'abonnement est déjà confirmé (étape 1), l'absence de date_fin
    // est une anomalie loggée mais ne doit pas faire échouer la réponse principale.
    const { data: dateFinRows, error: dateFinError } = await adminClient
      .from('abonnements')
      .update({ date_fin: dateFin, updated_at: now })
      .eq('id', abonnement_id)
      .select('id')

    if (dateFinError) {
      console.error('[admin-paiements/confirmer] Erreur update date_fin abonnement:', dateFinError.message)
    } else if (!dateFinRows || dateFinRows.length === 0) {
      console.error('[admin-paiements/confirmer] date_fin non mise à jour : 0 ligne affectée pour abonnement_id =', abonnement_id)
    }
  }

  // MIGRATION — abonnement.plan_id EST déjà l'UUID Supabase natif : plus
  // de résolution nécessaire, écriture directe. C'est ce qui élimine
  // définitivement l'ancien mode d'échec "aucune correspondance trouvée".
  const { data: tenant, error: tenantError } = await adminClient
    .from('tenants')
    .update({
      plan_id: abonnement.plan_id,
      statut: 'actif',
      essai_expire_le: null,
      paiement_en_attente_depuis: null,
      updated_at: now
    })
    .eq('id', abonnement.tenant_id)
    .select('id, slug, nom, whatsapp_number')
    .single()

  if (tenantError) {
    console.error('[admin-paiements/confirmer] Erreur update tenant:', tenantError.message)
    return c.json({
      error: 'Abonnement confirmé mais erreur lors de l\'activation du tenant. Vérifiez manuellement.',
      abonnement_id
    }, 500)
  }

  // 4. Invalider cache KV
  if (c.env.KV_CACHE && tenant?.slug) {
    try { await c.env.KV_CACHE.delete(`tenant:${tenant.slug}`) } catch {}
  }

  // 5. Notification WhatsApp au restaurant (non-bloquant)
  if (tenant?.whatsapp_number) {
    notifierPaiementConfirme(c.env, {
      nom: tenant.nom,
      whatsapp_number: tenant.whatsapp_number,
      reference: abonnement.reference_paiement ?? ''
    }).catch((err) => {
      console.warn('[admin-paiements/confirmer] WhatsApp échoué:', err?.message)
    })
  }

  // Push FCM à l'app mobile (best-effort, non-bloquant)
  c.executionCtx.waitUntil(
    sendFcmToTenant(c.env, adminClient, abonnement.tenant_id, {
      title: '✅ Paiement confirmé !',
      body: `Votre abonnement${planNom ? ` ${planNom}` : ''} est maintenant actif.`,
      data: { type: 'paiement', statut: 'actif', abonnement_id },
      channelId: 'payment_channel'
    }).catch(() => {})
  )

  // 6. Notification in-app restaurant
  // B-ADPAY-01 — fix session-5 : PostgrestFilterBuilder n'a pas de .catch() natif garanti ;
  // remplacement par try/catch classique autour du await (best-effort, non bloquant).
  try {
    await adminClient
      .from('notifications_restaurant')
      .insert({
        tenant_id: abonnement.tenant_id,
        type: 'success',
        titre: 'Paiement confirmé — Abonnement activé !',
        message: `Votre paiement pour le plan ${planNom ?? ''} a été confirmé. Votre abonnement est maintenant actif${dateFin ? ` jusqu'au ${formaterDate(dateFin)}` : ''}.`,
        lien: '/dashboard/abonnement',
        payload: { abonnement_id, confirme_le: now }
      })
  } catch { /* best-effort, non bloquant */ }

  // [session-3] Email paiement confirmé — non-bloquant
  try {
    if (tenant?.id) {
      adminClient
        .from('utilisateurs_tenant')
        .select('auth_user_id')
        .eq('tenant_id', tenant.id)
        .limit(1)
        .maybeSingle()
        .then(({ data: ut }) => {
          if (ut?.auth_user_id) {
            return adminClient.auth.admin.getUserById(ut.auth_user_id)
          }
        })
        .then((res: any) => {
          const email = res?.data?.user?.email
          if (email && tenant?.nom) {
            envoyerEmailPaiementConfirme(c.env, {
              email,
              nom_restaurant: tenant.nom
            }, {
              plan_nom: planNom ?? '',
              reference: abonnement.reference_paiement ?? '',
              date_fin_iso: dateFin ?? undefined
            }).catch(() => {})
          }
        })
        .catch(() => {})
    }
  } catch {}

  // [session-3] Invalider aussi tenants:public dans KV
  if (c.env.KV_CACHE) {
    try {
      await Promise.allSettled([
        c.env.KV_CACHE.delete('tenants:public:12'),
        c.env.KV_CACHE.delete('tenants:public:24')
      ])
    } catch {}
  }

  console.log(`[admin-paiements] Paiement confirmé — tenant: ${abonnement.tenant_id.slice(0, 8)}... abonnement: ${abonnement_id.slice(0, 8)}...`)

  return c.json({
    success: true,
    message: `Paiement confirmé. Tenant ${tenant?.nom} activé sur le plan.`,
    abonnement_id,
    tenant_id: abonnement.tenant_id,
    statut_tenant: 'actif'
  })
})

// ── POST /api/v1/admin/paiements/rejeter ────────────────────────────────────
adminPaiementsRouter.post('/rejeter', async (c) => {
  let body: { abonnement_id?: string; motif?: string; admin_id?: string }
  try { body = await c.req.json() }
  catch { return c.json({ error: 'JSON invalide.' }, 400) }

  const { abonnement_id, motif, admin_id } = body

  if (!abonnement_id) return c.json({ error: 'abonnement_id requis.' }, 422)
  // B-ADPAY-05 — fix session-5 : validation format UUID avant tout appel DB
  const UUID_REGEX_REJ = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
  if (!UUID_REGEX_REJ.test(abonnement_id)) {
    return c.json({ error: 'Format abonnement_id invalide (UUID v4 attendu).' }, 422)
  }
  if (!motif || motif.trim().length < 5) {
    return c.json({ error: 'motif requis (5 caractères minimum).' }, 422)
  }

  const adminClient = createSupabaseAdminClient(c.env)
  const now = new Date().toISOString()

  const { data: abonnement } = await adminClient
    .from('abonnements')
    .select('id, tenant_id, plan_id, reference_paiement')
    .eq('id', abonnement_id)
    .eq('statut', 'en_attente_confirmation')
    .single()

  if (!abonnement) {
    return c.json({ error: 'Abonnement introuvable ou déjà traité.' }, 404)
  }

  // C2 — session-6 : ajout de .select('id') pour détecter 0 lignes affectées,
  // en cohérence avec le pattern déjà appliqué sur la route /confirmer (session-5).
  const { data: abRejetRows, error: abError } = await adminClient
    .from('abonnements')
    .update({
      statut: 'annule',
      rejete_par: admin_id ?? 'admin',
      rejete_le: now,
      motif_rejet: motif.trim().slice(0, 500),
      updated_at: now
    })
    .eq('id', abonnement_id)
    .eq('statut', 'en_attente_confirmation')
    .select('id')

  if (abError) {
    console.error('[admin-paiements/rejeter] Erreur update abonnement:', abError.message)
    return c.json({ error: 'Erreur lors du rejet.' }, 500)
  }
  if (!abRejetRows || abRejetRows.length === 0) {
    console.error('[admin-paiements/rejeter] Abonnement non mis à jour : 0 ligne affectée pour abonnement_id =', abonnement_id)
    return c.json({ error: 'Ce paiement a déjà été traité ou est introuvable.' }, 409)
  }

  const { data: tenant } = await adminClient
    .from('tenants')
    .select('id, slug, nom, whatsapp_number, statut, essai_expire_le')
    .eq('id', abonnement.tenant_id)
    .single()

  if (tenant) {
    const essaiEncore = tenant.essai_expire_le
      ? new Date(tenant.essai_expire_le).getTime() > Date.now()
      : false

    const nouveauStatut =
      tenant.statut === 'actif' ? 'actif' :
      essaiEncore ? 'essai' : 'inactif'

    // B-ADPAY-04 — fix session-5 : ajout de .select('id') pour détecter un UPDATE à 0 ligne.
    const { data: tenantRejetRows, error: tenantRejetError } = await adminClient
      .from('tenants')
      .update({
        paiement_en_attente_depuis: null,
        statut: nouveauStatut,
        updated_at: now
      })
      .eq('id', tenant.id)
      .select('id')

    if (tenantRejetError) {
      console.error('[admin-paiements/rejeter] Erreur update tenant:', tenantRejetError.message)
    } else if (!tenantRejetRows || tenantRejetRows.length === 0) {
      console.error('[admin-paiements/rejeter] Tenant non mis à jour : 0 ligne affectée pour tenant.id =', tenant.id)
    }

    if (c.env.KV_CACHE && tenant.slug) {
      try { await c.env.KV_CACHE.delete(`tenant:${tenant.slug}`) } catch {}
    }

    if (tenant.whatsapp_number) {
      notifierPaiementRejete(c.env, {
        nom: tenant.nom,
        whatsapp_number: tenant.whatsapp_number,
        reference: abonnement.reference_paiement ?? '',
        motif: motif.trim()
      }).catch((err) => {
        console.warn('[admin-paiements/rejeter] WhatsApp échoué:', err?.message)
      })
    }

    c.executionCtx.waitUntil(
      sendFcmToTenant(c.env, adminClient, abonnement.tenant_id, {
        title: '❌ Preuve de paiement rejetée',
        body: 'Veuillez soumettre une nouvelle preuve de paiement.',
        data: {
          type: 'paiement',
          statut: 'rejete',
          abonnement_id,
          motif: motif.trim().slice(0, 200)
        },
        channelId: 'payment_channel'
      }).catch(() => {})
    )

    // B-ADPAY-01 — fix session-5 : try/catch classique, PostgrestFilterBuilder n'a pas .catch() natif.
    try {
      await adminClient
        .from('notifications_restaurant')
        .insert({
          tenant_id: abonnement.tenant_id,
          type: 'error',
          titre: 'Paiement non confirmé',
          message: `Votre preuve de paiement n'a pas pu être validée. Motif : ${motif.trim()}. Contactez le support ou soumettez une nouvelle preuve.`,
          lien: '/dashboard/abonnement',
          payload: { abonnement_id, rejete_le: now, motif }
        })
    } catch { /* best-effort, non bloquant */ }
  }

  // [session-3] Email paiement rejeté — non-bloquant
  try {
    if (tenant?.id) {
      adminClient
        .from('utilisateurs_tenant')
        .select('auth_user_id')
        .eq('tenant_id', tenant.id)
        .limit(1)
        .maybeSingle()
        .then(({ data: ut }: any) => {
          if (ut?.auth_user_id) return adminClient.auth.admin.getUserById(ut.auth_user_id)
        })
        .then((res: any) => {
          const email = res?.data?.user?.email
          if (email && tenant?.nom) {
            envoyerEmailPaiementRejete(c.env, {
              email,
              nom_restaurant: tenant.nom
            }, {
              plan_nom: '',
              reference: abonnement.reference_paiement ?? '',
              motif: motif.trim()
            }).catch(() => {})
          }
        })
        .catch(() => {})
    }
  } catch {}

  // [session-3] Invalider tenants:public dans KV
  if (c.env.KV_CACHE) {
    try {
      await Promise.allSettled([
        c.env.KV_CACHE.delete('tenants:public:12'),
        c.env.KV_CACHE.delete('tenants:public:24')
      ])
    } catch {}
  }

  console.log(`[admin-paiements] Paiement rejeté — tenant: ${abonnement.tenant_id.slice(0, 8)}... motif: ${motif.slice(0, 30)}...`)

  return c.json({
    success: true,
    message: 'Paiement rejeté. Le restaurant a été notifié, son accès est immédiatement restreint.',
    abonnement_id
  })
})

// ── GET /api/v1/admin/paiements/preuve/:id ───────────────────────────────────
adminPaiementsRouter.get('/preuve/:id', async (c) => {
  const abonnementId = c.req.param('id')
  if (!abonnementId) return c.json({ error: 'id requis.' }, 422)

  const adminClient = createSupabaseAdminClient(c.env)

  const { data: abonnement } = await adminClient
    .from('abonnements')
    .select('id, preuve_paiement_url, tenant_id, statut')
    .eq('id', abonnementId)
    .single()

  if (!abonnement?.preuve_paiement_url) {
    return c.json({ error: 'Preuve introuvable pour cet abonnement.' }, 404)
  }

  if (!c.env.R2_MEDIA) {
    return c.json({ error: 'Stockage non configuré.' }, 503)
  }

  try {
    const signedUrl = await c.env.R2_MEDIA.createSignedUrl(
      abonnement.preuve_paiement_url,
      900
    )
    return c.json({
      url: signedUrl,
      expires_in: 900,
      expires_at: new Date(Date.now() + 900000).toISOString(),
      abonnement_id: abonnementId,
      tenant_id: abonnement.tenant_id
    })
  } catch (err) {
    console.error('[admin-paiements/preuve] Erreur URL signée R2:', err)
    return c.json({ error: 'Impossible de générer l\'URL d\'accès à la preuve.' }, 500)
  }
})

// ── GET /api/v1/admin/paiements/moyens ────────────────────────────────────────
adminPaiementsRouter.get('/moyens', async (c) => {
  const adminClient = createSupabaseAdminClient(c.env)

  const { data, error } = await adminClient
    .from('moyens_paiement')
    .select('*')
    .order('ordre_affichage', { ascending: true })

  if (error) {
    return c.json({ error: 'Erreur lors de la récupération des moyens de paiement.' }, 500)
  }

  return c.json({ moyens: data ?? [] })
})

// ── POST /api/v1/admin/paiements/moyens ───────────────────────────────────────
adminPaiementsRouter.post('/moyens', async (c) => {
  let body: {
    code?: string; nom?: string; description?: string; instructions?: string
    numero?: string; nom_compte?: string; logo_url?: string; ordre_affichage?: number
  }
  try { body = await c.req.json() }
  catch { return c.json({ error: 'JSON invalide.' }, 400) }

  const { code, nom, description, instructions, numero, nom_compte, logo_url, ordre_affichage } = body

  if (!code || !nom) return c.json({ error: 'code et nom sont requis.' }, 422)
  if (!/^[a-z0-9_]+$/.test(code)) {
    return c.json({ error: 'code invalide : uniquement lettres minuscules, chiffres et underscore.' }, 422)
  }

  const adminClient = createSupabaseAdminClient(c.env)

  const { data, error } = await adminClient
    .from('moyens_paiement')
    .insert({
      code,
      nom: nom.trim(),
      description: description?.trim() ?? '',
      instructions: instructions?.trim() ?? '',
      numero: numero?.trim() ?? null,
      nom_compte: nom_compte?.trim() ?? null,
      logo_url: logo_url?.trim() ?? null,
      ordre_affichage: ordre_affichage ?? 0,
      actif: true
    })
    .select()
    .single()

  if (error) {
    if (error.code === '23505') {
      return c.json({ error: `Le code '${code}' est déjà utilisé.` }, 409)
    }
    return c.json({ error: 'Erreur lors de la création.' }, 500)
  }

  return c.json({ success: true, moyen: data }, 201)
})

// ── PATCH /api/v1/admin/paiements/moyens/:id ──────────────────────────────────
adminPaiementsRouter.patch('/moyens/:id', async (c) => {
  const id = c.req.param('id')
  let body: Record<string, unknown>
  try { body = await c.req.json() }
  catch { return c.json({ error: 'JSON invalide.' }, 400) }

  const allowed = ['nom', 'description', 'instructions', 'numero', 'nom_compte', 'logo_url', 'actif', 'ordre_affichage']
  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }

  for (const key of allowed) {
    if (key in body) updates[key] = body[key]
  }

  if (Object.keys(updates).length <= 1) {
    return c.json({ error: 'Aucun champ valide à mettre à jour.' }, 422)
  }

  const adminClient = createSupabaseAdminClient(c.env)

  const { data, error } = await adminClient
    .from('moyens_paiement')
    .update(updates)
    .eq('id', id)
    .select()
    .single()

  if (error) {
    return c.json({ error: 'Erreur lors de la mise à jour.' }, 500)
  }
  if (!data) {
    return c.json({ error: 'Moyen de paiement introuvable.' }, 404)
  }

  return c.json({ success: true, moyen: data })
})

// ─────────────────────────────────────────────────────────────────────────────
// Corr#11 — Routes admin suppression de compte
// ─────────────────────────────────────────────────────────────────────────────

// GET /api/v1/admin/suppressions — Liste des suppressions programmées
adminPaiementsRouter.get('/suppressions', async (c) => {
  const adminClient = createSupabaseAdminClient(c.env)

  const { data: tenants, error } = await adminClient
    .from('tenants')
    .select('id, nom, slug, statut, suppression_demandee_le, suppression_prevue_le')
    .not('suppression_prevue_le', 'is', null)
    .is('deleted_at', null)
    .order('suppression_prevue_le', { ascending: true })

  if (error) {
    console.error('[Admin/Suppressions] Erreur liste:', error.message)
    return c.json({ error: 'Erreur récupération suppressions.' }, 500)
  }

  return c.json({ suppressions: tenants ?? [] })
})

// POST /api/v1/admin/suppressions/:tenant_id/executer
// Exécute la suppression définitive : soft-delete tenants + deleteUser Auth.
// Conditions : suppression_prevue_le doit être passée (sinon 422).
adminPaiementsRouter.post('/suppressions/:tenant_id/executer', async (c) => {
  // A-07 CORRIGÉ — Rate limiting : max 10 suppressions/heure par tenant_id admin.
  // La route est déjà protégée par X-Admin-Secret (middleware global du router),
  // mais une boucle d'appels accidentels ou malveillants pourrait provoquer des
  // suppressions irréversibles répétées. On limite à 10/h pour la route entière.
  const ip = c.req.header('CF-Connecting-IP') ?? 'unknown'
  const rlSuppress = await checkRateLimit(`admin-suppress:${ip}`, 10, 3600000, c.env.KV_CACHE)
  if (!rlSuppress.allowed) {
    return c.json({ error: 'Trop de suppressions en peu de temps. Réessayez dans une heure.' }, 429)
  }

  const tenantId = c.req.param('tenant_id')
  if (!tenantId) return c.json({ error: 'tenant_id requis.' }, 422)

  const adminClient = createSupabaseAdminClient(c.env)

  const { data: tenant, error: fetchError } = await adminClient
    .from('tenants')
    .select('id, nom, suppression_prevue_le')
    .eq('id', tenantId)
    .is('deleted_at', null)
    .maybeSingle()

  if (fetchError || !tenant) {
    return c.json({ error: 'Tenant introuvable ou déjà supprimé.' }, 404)
  }

  if (!tenant.suppression_prevue_le) {
    return c.json({ error: 'Aucune suppression programmée pour ce tenant.' }, 422)
  }

  if (new Date(tenant.suppression_prevue_le) > new Date()) {
    return c.json({
      error: 'Suppression non encore exigible.',
      suppression_prevue_le: tenant.suppression_prevue_le
    }, 422)
  }

  // 1. Récupérer l'auth_user_id et les URLs médias avant le soft-delete
  const [{ data: utRow }, { data: tenantMedia }] = await Promise.all([
    adminClient
      .from('utilisateurs_tenant')
      .select('auth_user_id')
      .eq('tenant_id', tenantId)
      .maybeSingle(),
    adminClient
      .from('tenants')
      .select('logo_url, banniere_url')
      .eq('id', tenantId)
      .maybeSingle()
  ])

  // 2. Soft-delete tenant (deleted_at = now) — les FK CASCADE suppriment
  //    les tables enfants selon la configuration Supabase.
  const { error: softDeleteError } = await adminClient
    .from('tenants')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', tenantId)

  if (softDeleteError) {
    console.error('[Admin/Suppressions] Erreur soft-delete:', softDeleteError.message)
    return c.json({ error: 'Erreur lors de la suppression.' }, 500)
  }

  // 3. Suppression Auth Supabase (non bloquante — ne doit pas faire échouer
  //    la suppression si le user Auth est déjà absent)
  if (utRow?.auth_user_id) {
    try {
      await adminClient.auth.admin.deleteUser(utRow.auth_user_id)
    } catch (e: any) {
      console.warn('[Admin/Suppressions] deleteUser Auth échoué (non bloquant):', e?.message ?? e)
    }
  }

  // B2 — session-5 : Nettoyage R2 des médias orphelins après suppression compte.
  // On supprime logo_url et banniere_url stockés dans R2.
  // Stratégie : on liste les objets du bucket avec le préfixe tenantId/
  // et on les supprime tous — garantit que TOUS les uploads du tenant sont
  // effacés, pas seulement logo et bannière.
  // Non bloquant : un échec R2 ne doit pas invalider la suppression DB.
  if (c.env.R2_MEDIA) {
    try {
      // 3a. Suppression ciblée logo + bannière (URLs connues)
      const clesMedias: string[] = []
      const origin = new URL(c.req.url).origin
      const mediaPrefix = `${origin}/api/v1/dashboard/media/`
      for (const urlField of [tenantMedia?.logo_url, tenantMedia?.banniere_url]) {
        if (!urlField) continue
        if (urlField.startsWith(mediaPrefix)) {
          try {
            const cle = decodeURIComponent(urlField.slice(mediaPrefix.length))
            if (cle && !cle.includes('..') && !cle.startsWith('/')) clesMedias.push(cle)
          } catch {}
        }
      }
      if (clesMedias.length > 0) {
        await Promise.allSettled(clesMedias.map((cle) => c.env.R2_MEDIA!.delete(cle)))
      }

      // 3b. Nettoyage exhaustif : lister et supprimer TOUS les objets du tenant
      //     (preuves de paiement, images produits, etc.) via list({prefix})
      const listed = await c.env.R2_MEDIA.list({ prefix: `${tenantId}/`, limit: 1000 })
      if (listed.objects.length > 0) {
        await Promise.allSettled(
          listed.objects.map((obj) => c.env.R2_MEDIA!.delete(obj.key))
        )
        console.log(`[Admin/Suppressions] R2 : ${listed.objects.length} objet(s) supprimé(s) pour tenant ${tenantId.slice(0, 8)}...`)
      }
      // Nettoyage preuves de paiement (préfixe différent)
      const listedPaiements = await c.env.R2_MEDIA.list({ prefix: `paiements/${tenantId}/`, limit: 1000 })
      if (listedPaiements.objects.length > 0) {
        await Promise.allSettled(
          listedPaiements.objects.map((obj) => c.env.R2_MEDIA!.delete(obj.key))
        )
        console.log(`[Admin/Suppressions] R2 paiements : ${listedPaiements.objects.length} objet(s) supprimé(s) pour tenant ${tenantId.slice(0, 8)}...`)
      }
    } catch (r2Err: any) {
      console.warn('[Admin/Suppressions] Nettoyage R2 échoué (non bloquant):', r2Err?.message ?? r2Err)
    }
  }

  return c.json({
    success: true,
    message: `Compte "${tenant.nom}" supprimé définitivement.`,
    tenant_id: tenantId
  })
})

export { adminPaiementsRouter }
