/**
 * src/routes/api-admin-paiements.ts — Administration des paiements manuels
 *
 * CORRECTIONS CYCLE-5 :
 *   FIX-E — POST /confirmer écrivait `tenant.plan_id = abonnement.plan_id`
 *           directement. Or abonnement.plan_id est un id D1 (stocké tel
 *           quel par POST /api/v1/paiement/soumettre), alors que
 *           tenants.plan_id doit contenir l'UUID Supabase (c'est ce que
 *           /profil et /statut résolvent ensuite via
 *           resoudreIdD1DepuisPlanSupabase). Sans cette correction, un
 *           tenant fraîchement activé se retrouvait avec un plan_id
 *           invalide → son plan actif redevenait introuvable dans le
 *           dashboard (même bug que celui corrigé en CYCLE-4, mais réopéré
 *           ici depuis un angle différent). Résolu via la nouvelle fonction
 *           resoudreIdSupabaseDepuisPlanD1() (src/lib/plans.ts).
 *   FIX-F — Messages harmonisés avec SLA_ADMIN_HEURES (48h) /
 *           FENETRE_ACCES_HEURES (72h), au lieu de texte "72h" en dur.
 *
 * AJOUT FCM (2026-08-10) :
 *   Push notification au restaurant (app mobile MonMenu Manager) en
 *   complément du canal WhatsApp existant, sur confirmation et rejet de
 *   paiement. Best-effort, non-bloquant (waitUntil + .catch), ne peut pas
 *   faire échouer la réponse HTTP. Voir src/lib/fcm.ts.
 *   ⚠️ Nécessite que Env (src/types/database.ts) expose bien
 *   FCM_PROJECT_ID / FCM_CLIENT_EMAIL / FCM_PRIVATE_KEY — à ajouter
 *   séparément si ce n'est pas déjà fait, sinon le fichier ne compilera
 *   pas (c.env n'aura pas ces propriétés).
 *
 * NOTE IMPORTANTE (déjà correct AVANT cette correction, pas d'action requise) :
 *   Le rejet (POST /rejeter) passe déjà l'abonnement en statut 'annule'
 *   IMMÉDIATEMENT (pas d'attente du cron), ET redescend tenant.statut à
 *   'essai' ou 'inactif' immédiatement. Combiné à verifierAccesTenant()
 *   (src/lib/acces-tenant.ts) qui ne considère QUE les abonnements encore
 *   au statut 'en_attente_confirmation', un rejet coupe donc bien l'accès
 *   dès la requête suivante, sans attendre les 72h — c'est exactement le
 *   comportement demandé.
 *
 * Ce router est monté dans src/index.ts sous /api/v1/admin/paiements.
 * Il expose les endpoints de gestion des paiements côté admin :
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
 *   - Authentification : header X-Admin-Secret (JAMAIS en query string — BUG-012)
 *   - SEC-06 : URL R2 signée, jamais d'URL publique directe
 *   - SEC-04 : audit trail (confirme_par, confirme_le, rejete_par, rejete_le)
 *   - Quand un paiement est confirmé :
 *       tenant.plan_id      ← UUID Supabase résolu depuis l'id D1 de l'abonnement
 *       tenant.statut       ← 'actif'
 *       tenant.essai_expire_le ← null
 *
 * @module api-admin-paiements
 */

import { Hono } from 'hono'
import type { Env } from '../types/database'
import { createSupabaseAdminClient } from '../lib/supabase'
import { setSecurityHeaders } from '../lib/security'
import { formaterDate, SLA_ADMIN_HEURES, FENETRE_ACCES_HEURES } from '../lib/paiement'
import { resoudreIdSupabaseDepuisPlanD1 } from '../lib/plans'
import { notifierPaiementConfirme, notifierPaiementRejete } from '../lib/whatsapp'
import { sendFcmToTenant } from '../lib/fcm'

const adminPaiementsRouter = new Hono<{ Bindings: Env }>()

// ── Middleware d'authentification admin ─────────────────────────────────────
adminPaiementsRouter.use('*', async (c, next) => {
  setSecurityHeaders(c)

  const secret = c.req.header('X-Admin-Secret')

  if (!c.env.ADMIN_WEBHOOK_SECRET) {
    return c.json({ error: 'Administration non configurée.' }, 503)
  }

  if (!secret || secret !== c.env.ADMIN_WEBHOOK_SECRET) {
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

  // Enrichir avec le nom du plan depuis D1 (abonnements.plan_id est déjà
  // un id D1 — pas de résolution UUID nécessaire ici, contrairement à
  // tenants.plan_id/plan_initial_id).
  const enrichis = await Promise.all(
    (abonnements ?? []).map(async (ab: any) => {
      let plan_nom = null
      if (ab.plan_id) {
        try {
          const plan = await c.env.DB
            .prepare('SELECT nom, prix_mensuel, devise FROM plans WHERE id = ? LIMIT 1')
            .bind(ab.plan_id)
            .first<{ nom: string; prix_mensuel: number; devise: string }>()
          plan_nom = plan?.nom ?? null
        } catch {}
      }
      const heuresRestantes = ab.delai_confirmation_expire_le
        ? Math.ceil((new Date(ab.delai_confirmation_expire_le).getTime() - Date.now()) / 3600000)
        : null
      const urgent = heuresRestantes !== null && heuresRestantes < 12
      return { ...ab, plan_nom, heures_restantes: heuresRestantes, urgent }
    })
  )

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

  // 1. Confirmer l'abonnement (SEC-04 : audit trail)
  const { error: abError } = await adminClient
    .from('abonnements')
    .update({
      statut: 'actif',
      confirme_par: admin_id ?? 'admin',
      confirme_le: now,
      updated_at: now
    })
    .eq('id', abonnement_id)
    .eq('statut', 'en_attente_confirmation') // Guard idempotence

  if (abError) {
    console.error('[admin-paiements/confirmer] Erreur update abonnement:', abError.message)
    return c.json({ error: 'Erreur lors de la confirmation.' }, 500)
  }

  // 2. Récupérer le plan D1 pour calculer date_fin + nom (affichage notif)
  let dateFin: string | null = null
  let planNom: string | null = null
  try {
    const plan = await c.env.DB
      .prepare('SELECT id, nom FROM plans WHERE id = ? LIMIT 1')
      .bind(abonnement.plan_id)
      .first<{ id: string; nom: string }>()

    if (plan) {
      planNom = plan.nom
      const fin = new Date()
      fin.setMonth(fin.getMonth() + 1)
      dateFin = fin.toISOString()

      await adminClient
        .from('abonnements')
        .update({ date_fin: dateFin, updated_at: now })
        .eq('id', abonnement_id)
    }
  } catch {}

  // FIX-E — CYCLE-5 : résoudre l'UUID Supabase correspondant à l'id D1
  // stocké dans abonnement.plan_id, AVANT de l'écrire dans tenants.plan_id.
  // Sans cette résolution, tenants.plan_id contenait un id D1 (ex:
  // "plan_faso") au lieu de l'UUID Supabase attendu par /profil et
  // /statut → le plan actif redevenait "introuvable" juste après activation.
  const planIdSupabase = await resoudreIdSupabaseDepuisPlanD1(c.env, abonnement.plan_id)

  // 3. Mettre à jour le tenant
  const { data: tenant, error: tenantError } = await adminClient
    .from('tenants')
    .update({
      plan_id: planIdSupabase, // UUID Supabase (ou null si résolution impossible — voir avertissement ci-dessous)
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

  // Avertissement explicite si la résolution UUID a échoué (plan D1 sans
  // correspondance dans la table Supabase `plans` — configuration
  // incohérente entre D1 et Supabase à corriger côté admin des plans).
  const avertissementPlan = (!planIdSupabase && abonnement.plan_id)
    ? `Attention : aucune correspondance Supabase trouvée pour le plan D1 "${abonnement.plan_id}" (colonne plans.d1_plan_id à vérifier). tenant.plan_id a été laissé vide.`
    : null
  if (avertissementPlan) console.warn(`[admin-paiements/confirmer] ${avertissementPlan}`)

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

  // AJOUT FCM — Push au restaurant (app mobile), en complément du WhatsApp
  // + de la notif in-app ci-dessous. Best-effort, ne bloque jamais la
  // réponse HTTP. Utilise c.executionCtx.waitUntil pour laisser l'envoi se
  // terminer après la réponse (même pattern que api-commandes.ts).
  c.executionCtx.waitUntil(
    sendFcmToTenant(c.env, adminClient, abonnement.tenant_id, {
      title: '✅ Paiement confirmé !',
      body: `Votre abonnement${planNom ? ` ${planNom}` : ''} est maintenant actif.`,
      data: { type: 'paiement', statut: 'actif', abonnement_id },
      channelId: 'payment_channel'
    }).catch(() => {})
  )

  // 6. Notification in-app restaurant
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
    .catch(() => {})

  console.log(`[admin-paiements] Paiement confirmé — tenant: ${abonnement.tenant_id.slice(0, 8)}... abonnement: ${abonnement_id.slice(0, 8)}...`)

  return c.json({
    success: true,
    message: `Paiement confirmé. Tenant ${tenant?.nom} activé sur le plan.`,
    abonnement_id,
    tenant_id: abonnement.tenant_id,
    statut_tenant: 'actif',
    ...(avertissementPlan ? { avertissement: avertissementPlan } : {})
  })
})

// ── POST /api/v1/admin/paiements/rejeter ────────────────────────────────────
adminPaiementsRouter.post('/rejeter', async (c) => {
  let body: { abonnement_id?: string; motif?: string; admin_id?: string }
  try { body = await c.req.json() }
  catch { return c.json({ error: 'JSON invalide.' }, 400) }

  const { abonnement_id, motif, admin_id } = body

  if (!abonnement_id) return c.json({ error: 'abonnement_id requis.' }, 422)
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

  // 1. Rejeter l'abonnement (SEC-04 : audit trail).
  // IMPORTANT : ce changement de statut (≠ 'en_attente_confirmation') est
  // ce qui coupe IMMÉDIATEMENT l'accès à la requête suivante, via
  // verifierAccesTenant() (src/lib/acces-tenant.ts) qui ne considère plus
  // cette ligne comme une fenêtre de grâce valide.
  const { error: abError } = await adminClient
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

  if (abError) {
    console.error('[admin-paiements/rejeter] Erreur update abonnement:', abError.message)
    return c.json({ error: 'Erreur lors du rejet.' }, 500)
  }

  // 2. Remettre le tenant en statut 'essai' (si était en essai) ou 'inactif'
  const { data: tenant } = await adminClient
    .from('tenants')
    .select('id, slug, nom, whatsapp_number, statut, essai_expire_le')
    .eq('id', abonnement.tenant_id)
    .single()

  if (tenant) {
    const essaiEncore = tenant.essai_expire_le
      ? new Date(tenant.essai_expire_le).getTime() > Date.now()
      : false

    // Un tenant déjà 'actif' (rejet d'une demande d'upgrade/downgrade, pas
    // d'un premier paiement) ne doit JAMAIS être redescendu — seul un
    // tenant en 'essai'/'en_attente_paiement_initial' peut être redescendu.
    const nouveauStatut =
      tenant.statut === 'actif' ? 'actif' :
      essaiEncore ? 'essai' : 'inactif'

    await adminClient
      .from('tenants')
      .update({
        paiement_en_attente_depuis: null,
        statut: nouveauStatut,
        updated_at: now
      })
      .eq('id', tenant.id)

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

    // AJOUT FCM — Push au restaurant, en complément du WhatsApp + notif
    // in-app ci-dessous. Placé hors du bloc `if (tenant.whatsapp_number)`
    // ci-dessus à dessein : le push ne dépend pas d'avoir un numéro
    // WhatsApp renseigné, seulement d'avoir un token FCM enregistré
    // (table fcm_tokens). Best-effort, ne bloque jamais la réponse HTTP.
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
      .catch(() => {})
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
      900 // 15 minutes
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

export { adminPaiementsRouter }
