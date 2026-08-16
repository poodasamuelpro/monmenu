// src/routes/api-newsletter.ts
// Session 3 — Correction #1 (rate limiting KV) + Correction #5 (envoi réel newsletter)
//
// CHANGEMENTS :
//   - Rate limiting KV ajouté sur POST / (inscription) :
//       * par IP : 3 inscriptions / 1h
//       * par email : 2 inscriptions / 24h (anti-bot ciblé)
//   - Envoi réel de newsletter (POST /api/v1/newsletter/envoyer) protégé
//     par X-Admin-Secret, avec envoi par batch aux abonnés actifs.
//     Chaque envoi est non bloquant individuellement : un échec sur un
//     abonné ne stoppe pas l'envoi aux autres.

import { Hono } from 'hono'
import type { Env } from '../types/database'
import { createSupabaseAdminClient } from '../lib/supabase'
import { checkRateLimit, setSecurityHeaders, timingSafeEqual } from '../lib/security'
import { sendEmail } from '../lib/brevo'

export const newsletterRouter = new Hono<{ Bindings: Env }>()

// ── POST /api/v1/newsletter — Inscription à la newsletter (depuis le footer)
newsletterRouter.post('/', async (c) => {
  setSecurityHeaders(c)

  // ── Rate limiting par IP (KV distribué)
  const ip = c.req.header('CF-Connecting-IP') ?? 'unknown'
  const rlIp = await checkRateLimit(`newsletter:${ip}`, 3, 3600000, c.env.KV_CACHE)
  if (!rlIp.allowed) {
    return c.json({ error: 'Trop de tentatives. Réessayez dans une heure.' }, 429)
  }

  const body = await c.req.json().catch(() => null)
  const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : ''

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  if (!email || !emailRegex.test(email)) {
    return c.json({ error: 'Adresse email invalide.' }, 400)
  }

  // ── Rate limiting secondaire par email (anti-bot ciblé, indépendant de l'IP)
  const rlEmail = await checkRateLimit(`newsletter-email:${email}`, 2, 86400000, c.env.KV_CACHE)
  if (!rlEmail.allowed) {
    // Réponse générique : ne pas révéler si l'email est déjà dans la liste
    return c.json({ success: true, message: 'Inscription réussie.' })
  }

  const adminClient = createSupabaseAdminClient(c.env)

  const { error } = await adminClient
    .from('newsletter_subscribers')
    .upsert(
      { email, statut: 'actif', source: 'footer' },
      { onConflict: 'email' }
    )

  if (error) {
    console.error('[Newsletter] Erreur inscription:', error)
    return c.json({ error: 'Une erreur est survenue. Réessayez plus tard.' }, 500)
  }

  return c.json({ success: true, message: 'Inscription réussie.' })
})

// ── POST /api/v1/newsletter/envoyer — Envoi réel d'une campagne aux abonnés actifs
// Protégé par X-Admin-Secret. Envoi par batch de 50 avec gestion d'erreurs
// non bloquante par abonné.
newsletterRouter.post('/envoyer', async (c) => {
  setSecurityHeaders(c)

  // ── Authentification admin
  // BUG-03 CORRIGÉ — remplace !== par timingSafeEqual() évitant la timing attack
  // (comparaison caractère-à-caractère court-circuitée avec !==)
  const secret = c.req.header('X-Admin-Secret')
  if (!c.env.ADMIN_WEBHOOK_SECRET || !secret || !timingSafeEqual(secret, c.env.ADMIN_WEBHOOK_SECRET)) {
    return c.json({ error: 'Non autorisé.' }, 401)
  }

  let body: { sujet?: string; html_content?: string; text_content?: string }
  try { body = await c.req.json() }
  catch { return c.json({ error: 'JSON invalide.' }, 400) }

  if (!body.sujet || body.sujet.trim().length < 3) {
    return c.json({ error: 'Sujet requis (3 caractères minimum).' }, 422)
  }
  if (!body.html_content || body.html_content.trim().length < 10) {
    return c.json({ error: 'Contenu HTML requis.' }, 422)
  }

  const adminClient = createSupabaseAdminClient(c.env)

  // Récupérer tous les abonnés actifs
  const { data: subscribers, error: fetchError } = await adminClient
    .from('newsletter_subscribers')
    .select('email')
    .eq('statut', 'actif')

  if (fetchError) {
    console.error('[Newsletter/envoyer] Erreur récupération abonnés:', fetchError.message)
    return c.json({ error: 'Erreur récupération abonnés.' }, 500)
  }

  if (!subscribers || subscribers.length === 0) {
    return c.json({ success: true, message: 'Aucun abonné actif.', envoyes: 0, erreurs: 0 })
  }

  // Envoi par batch de 50 — non bloquant par abonné
  const BATCH_SIZE = 50
  let envoyes = 0
  let erreurs = 0

  for (let i = 0; i < subscribers.length; i += BATCH_SIZE) {
    const batch = subscribers.slice(i, i + BATCH_SIZE)

    await Promise.allSettled(
      batch.map(async (sub) => {
        try {
          const result = await sendEmail(
            {
              to: [{ email: sub.email }],
              subject: body.sujet!.trim(),
              htmlContent: body.html_content!,
              textContent: body.text_content
            },
            c.env as any
          )
          if (result.success) {
            envoyes++
          } else {
            erreurs++
            console.warn(`[Newsletter/envoyer] Échec envoi à ${sub.email}: ${result.error}`)
          }
        } catch (err) {
          erreurs++
          console.error(`[Newsletter/envoyer] Erreur inattendue pour ${sub.email}:`, err)
        }
      })
    )
  }

  console.log(`[Newsletter/envoyer] Campagne terminée — envoyés: ${envoyes}, erreurs: ${erreurs}, total: ${subscribers.length}`)

  return c.json({
    success: true,
    message: `Campagne envoyée. ${envoyes} email(s) envoyé(s), ${erreurs} erreur(s).`,
    envoyes,
    erreurs,
    total: subscribers.length
  })
})

// ── POST /api/v1/newsletter/desinscription — Désabonnement par email
newsletterRouter.post('/desinscription', async (c) => {
  setSecurityHeaders(c)

  const body = await c.req.json().catch(() => null)
  const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : ''

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return c.json({ error: 'Email invalide.' }, 400)
  }

  const adminClient = createSupabaseAdminClient(c.env)
  const { error } = await adminClient
    .from('newsletter_subscribers')
    .update({ statut: 'desinscrit' })
    .eq('email', email)

  if (error) {
    console.error('[Newsletter/desinscription] Erreur:', error.message)
    return c.json({ error: 'Erreur lors de la désinscription.' }, 500)
  }

  return c.json({ success: true, message: 'Désinscription enregistrée.' })
})

export default newsletterRouter
