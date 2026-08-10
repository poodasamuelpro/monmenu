// src/routes/api-contact.ts — Formulaire de contact public
// POST /api/v1/contact
//
// AJOUT — Cette route n'existait pas : le formulaire de la page /contact
// affichait un faux message de succès après un simple setTimeout, sans
// jamais envoyer le message nulle part. Elle envoie désormais réellement
// le message par email (Brevo) vers l'adresse de contact officielle
// MonMenu, configurée dynamiquement via D1 config_globale (voir
// lib/email.ts et lib/supabase.ts — aucune adresse codée en dur ici).

import { Hono } from 'hono'
import { z } from 'zod'
import type { Env } from '../types/database'
import { setSecurityHeaders, checkRateLimit } from '../lib/security'
import { envoyerEmailContact } from '../lib/email'

export const contactRouter = new Hono<{ Bindings: Env }>()

const ContactSchema = z.object({
  nom: z.string().min(2).max(100).trim(),
  email: z.string().min(3).max(150).trim(),
  profil: z.string().max(50).optional().default('restaurant'),
  sujet: z.string().max(50).optional().default('autre'),
  message: z.string().min(5).max(3000).trim()
})

contactRouter.post('/', async (c) => {
  setSecurityHeaders(c)

  // Rate limit — 5 messages / heure / IP, protège contre le spam du formulaire
  const ip = c.req.header('cf-connecting-ip') ?? c.req.header('x-forwarded-for') ?? 'inconnu'
  const rl = await checkRateLimit(`contact:${ip}`, 5, 3600000, c.env.KV_CACHE)
  if (!rl.allowed) {
    return c.json({ error: 'Trop de messages envoyés. Réessayez plus tard.' }, 429)
  }

  let body: unknown
  try {
    body = await c.req.json()
  } catch {
    return c.json({ error: 'Requête invalide.' }, 400)
  }

  const parsed = ContactSchema.safeParse(body)
  if (!parsed.success) {
    return c.json({ error: 'Champs invalides. Vérifiez le formulaire.' }, 422)
  }

  const resultat = await envoyerEmailContact(c.env, parsed.data)

  if (!resultat.success) {
    console.error('[Contact] Échec envoi email:', resultat.error)
    return c.json(
      { error: "Le message n'a pas pu être envoyé. Réessayez ou contactez-nous directement par WhatsApp." },
      502
    )
  }

  return c.json({ success: true })
})
