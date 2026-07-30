// src/routes/api-admin-tasks.ts — Déclenchement manuel de tâches cron
//
// AJOUT 2026-07-30 — Cloudflare Workers n'offre pas de bouton "exécuter
// maintenant" pour un cron trigger en production. Cette route permet de
// relancer la capture des screenshots boutique à la demande (ex: après
// avoir corrigé PUBLIC_BASE_URL, sans attendre le prochain passage du
// cron à 2h20 UTC), en appelant directement la même fonction que le cron
// (capturerScreenshotsQuotidiens, exportée depuis api-cron.ts).
//
// Protection : GET simple avec secret en query string (pas de POST/outil
// nécessaire — on peut coller l'URL directement dans un navigateur).
// Le secret est comparé à la variable d'environnement ADMIN_TASK_SECRET,
// à définir dans Cloudflare → Workers & Pages → Variables and Secrets.
// Ne JAMAIS committer cette valeur dans le dépôt.

import { Hono } from 'hono'
import type { Env } from '../types/database'
import { setSecurityHeaders } from '../lib/security'
import { capturerScreenshotsQuotidiens } from './api-cron'

const adminTasksRouter = new Hono<{ Bindings: Env }>()

adminTasksRouter.get('/screenshots', async (c) => {
  setSecurityHeaders(c)

  const secret = c.req.query('secret')

  if (!c.env.ADMIN_TASK_SECRET) {
    console.error('[admin-tasks] ADMIN_TASK_SECRET non configuré côté serveur.')
    return c.json({ error: 'Tâche non configurée côté serveur.' }, 503)
  }

  if (!secret || secret !== c.env.ADMIN_TASK_SECRET) {
    return c.json({ error: 'Non autorisé.' }, 401)
  }

  try {
    const resultat = await capturerScreenshotsQuotidiens(c.env)
    return c.json({
      ok: true,
      message: `Capture relancée : ${resultat.reussies}/${resultat.total} screenshot(s) réussi(s).`,
      ...resultat
    })
  } catch (err) {
    console.error('[admin-tasks] Erreur capture manuelle:', err)
    return c.json({ error: 'Échec de la capture. Voir les logs du Worker.' }, 500)
  }
})

export { adminTasksRouter }
