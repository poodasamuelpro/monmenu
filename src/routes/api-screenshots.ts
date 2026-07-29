// GET /api/v1/screenshots/:slug — Sert le dernier screenshot mobile
// capturé chaque nuit par le cron (voir api-cron.ts,
// capturerScreenshotsQuotidiens). Route publique, pas d'auth requise
// (comme les logos, ces images sont destinées à être affichées sur
// la page d'accueil).

import { Hono } from 'hono'
import type { Env } from '../types/database'
import { setSecurityHeaders } from '../lib/security'

const screenshotsRouter = new Hono<{ Bindings: Env }>()

screenshotsRouter.get('/:slug', async (c) => {
  setSecurityHeaders(c)
  const slug = c.req.param('slug')

  if (!/^[a-z0-9-]{1,64}$/i.test(slug)) {
    return c.json({ error: 'Slug invalide.' }, 400)
  }

  if (!c.env.R2_MEDIA) {
    return c.json({ error: 'Stockage médias non configuré.' }, 503)
  }

  const object = await c.env.R2_MEDIA.get(`screenshots/${slug}.jpg`)

  if (!object) {
    return c.json({ error: 'Aucun aperçu disponible pour cette boutique.' }, 404)
  }

  const etag = object.etag ?? ''
  const ifNoneMatch = c.req.header('If-None-Match')
  if (etag && ifNoneMatch === `"${etag}"`) {
    return new Response(null, { status: 304 })
  }

  return new Response(object.body, {
    status: 200,
    headers: {
      'Content-Type': 'image/jpeg',
      // Rafraîchi une fois par nuit — 12h de cache est un bon compromis
      // entre fraîcheur et charge sur R2/le CDN.
      'Cache-Control': 'public, max-age=43200',
      'ETag': etag ? `"${etag}"` : '',
      'X-Content-Type-Options': 'nosniff'
    }
  })
})

export { screenshotsRouter }