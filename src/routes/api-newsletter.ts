// src/routes/api-newsletter.ts
import { Hono } from 'hono'
import type { Env } from '../types/database'
import { createSupabaseAdminClient } from '../lib/supabase'

export const newsletterRouter = new Hono<{ Bindings: Env }>()

// POST /api/v1/newsletter — inscription à la newsletter (depuis le footer)
newsletterRouter.post('/', async (c) => {
  const body = await c.req.json().catch(() => null)
  const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : ''

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  if (!email || !emailRegex.test(email)) {
    return c.json({ error: 'Adresse email invalide.' }, 400)
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

export default newsletterRouter
