// Capture d'écran mobile réelle de la page boutique, via l'API gratuite
// thum.io (aucune librairie navigateur à héberger, aucun coût Workers
// supplémentaire — un simple fetch() HTTP vers un service externe).
//
// Format utilisé : viewport 390x844 (taille d'un iPhone 13/14) — la
// capture montre donc déjà la boutique telle qu'elle apparaît sur un
// vrai téléphone. Le cadre "iPhone" (encoche, bords arrondis, bouton
// latéral) est ensuite ajouté en CSS pur côté page d'accueil (home.ts).
//
// thum.io est utilisable gratuitement sans compte pour un usage
// raisonnable (limite de débit). Pour plus de fiabilité/quota, un
// compte gratuit sur https://www.thum.io fournit une clé à mettre dans
// le secret Worker THUMIO_API_KEY — entièrement optionnel, la fonction
// marche aussi sans (voir wrangler secret put THUMIO_API_KEY).
//
// CORRECTION 2026-07-30 — ajout d'un paramètre _cachebust unique (timestamp)
// sur l'URL cible capturée. thum.io met en cache ses captures par URL ;
// sans ce paramètre, une capture ratée une fois (ex: pendant que
// PUBLIC_BASE_URL pointait vers un domaine cassé) restait servie en cache
// indéfiniment, même après correction du domaine. Le paramètre force
// thum.io à traiter chaque appel comme une URL inédite et donc à
// effectuer une vraie nouvelle capture à chaque exécution du cron.

import type { Env } from '../types/database'

const VIEWPORT_WIDTH = 390
const VIEWPORT_HEIGHT = 844

export async function capturerScreenshotBoutique(
  env: Env,
  slug: string,
  baseUrl: string
): Promise<ArrayBuffer | null> {
  const cible = `${baseUrl}/${slug}?_cachebust=${Date.now()}`

  // Segments de l'URL thum.io — voir https://www.thum.io/documentation
  // width/crop définissent le viewport mobile ; noanimate désactive les
  // transitions CSS pour une capture nette, prise dès le premier rendu.
  const segments = [
    'get',
    `width/${VIEWPORT_WIDTH}`,
    `crop/${VIEWPORT_HEIGHT}`,
    `viewportWidth/${VIEWPORT_WIDTH}`,
    'noanimate'
  ]

  if (env.THUMIO_API_KEY) {
    segments.push(`auth/${env.THUMIO_API_KEY}`)
  }

  const thumioUrl = `https://image.thum.io/${segments.join('/')}/${cible}`

  try {
    // S9-03 — Timeout explicite 15s sur thum.io (service tiers externe).
    // Sans timeout, un service lent ou indisponible bloque le cron entier.
    const res = await fetch(thumioUrl, {
      headers: { 'User-Agent': 'MonMenu-ScreenshotBot/1.0' },
      signal: AbortSignal.timeout(15000)
    })

    if (!res.ok) {
      console.warn(`[Screenshot] thum.io a répondu ${res.status} pour ${slug}`)
      return null
    }

    const contentType = res.headers.get('content-type') ?? ''
    if (!contentType.startsWith('image/')) {
      console.warn(`[Screenshot] Réponse non-image pour ${slug} (${contentType})`)
      return null
    }

    return await res.arrayBuffer()
  } catch (err) {
    console.error(`[Screenshot] Erreur capture ${slug}:`, err)
    return null
  }
}
