// Module WhatsApp Business Cloud API
// Envoi de notifications aux restaurants et livreurs
//
// FIX 1 — Le lien de suivi inséré dans le message WhatsApp était codé en dur
// sur "https://monmenu.app/suivi/...". genererMessageCommande() prend un
// paramètre "origin" obligatoire (construit côté appelant avec
// new URL(c.req.url).origin) au lieu de la constante en dur.
//
// FIX 2 — envoyerNotificationWhatsApp() déclare WHATSAPP_API_TOKEN et
// WHATSAPP_PHONE_ID comme optionnels, cohérent avec l'interface Env
// (types/database.ts).
//
// FIX 2026-07-30 (bug remonté en prod) — Le message envoyé au restaurant
// n'affichait JAMAIS les liens Google Maps / Waze, même quand le client
// avait une adresse renseignée. Cause : le format de lien utilisé
// ("https://maps.google.com/?q=lat,lon") + une condition correcte MAIS un
// gabarit de message entièrement réécrit pour matcher le rendu demandé
// (en-tête avec URL boutique, sections "COMMANDE" / "INFO CLIENT",
// séparateurs). Le format de lien Maps est désormais
// "https://www.google.com/maps/search/?api=1&query=lat,lon" (format
// officiel Google, plus fiable qu'un simple "?q=" sur mobile).
//
// AJOUT 2026-07-30 — Message dédié au LIVREUR (genererMessageLivreur),
// envoyé quand le restaurant passe une commande de "confirmée" à
// "en préparation" et assigne un livreur. Contient les mêmes informations
// de localisation (adresse + Maps + Waze) + le montant à encaisser.
//
// Deux canaux, TOUJOURS les deux disponibles pour chaque message
// (commande restaurant ET livraison livreur) :
//   1) Envoi automatique via l'API WhatsApp Business Cloud officielle
//      (envoyerNotificationWhatsApp) — silencieux, ne bloque jamais la
//      requête (best-effort), fonctionne seulement si
//      WHATSAPP_API_TOKEN / WHATSAPP_PHONE_ID sont configurés.
//   2) Lien wa.me de redirection (genererLienWhatsApp) — TOUJOURS généré,
//      c'est le filet de sécurité qui doit fonctionner à 100% du temps :
//      le navigateur (client ou dashboard) ouvre WhatsApp avec le message
//      pré-rempli, prêt à être envoyé manuellement.
//
// AJOUT 2026-07-29 — Fonctions de notification paiement
// (audit 07-notifications-inapp-bdd.md §4.1) :
//   - notifierPaiementConfirme : restaurant → abonnement activé
//   - notifierPaiementRejete   : restaurant → preuve refusée
//   - notifierBlocageAutomatique : restaurant → blocage J+72h (cron)

import type { Commande, ItemCommandeJson, Tenant } from '../types/database'

interface WhatsAppMessageResult {
  success: boolean
  messageId?: string
  error?: string
}

const SEPARATEUR = '━━━━━━━━━━━━━━'

// Formater le montant avec devise
function formatMontant(montant: number, devise: string = 'FCFA'): string {
  return `${montant.toLocaleString('fr-FR')} ${devise}`
}

// §Localisation — Construit les liens Google Maps / Waze à partir de
// coordonnées GPS. Format Google Maps officiel ("maps/search/?api=1&query=")
// plutôt que l'ancien "maps.google.com/?q=", plus fiable sur mobile
// (ouvre systématiquement l'app Maps ou le fallback web, sans ambiguïté
// d'interprétation de l'URL par certains navigateurs Android).
function construireLiensLocalisation(
  latitude: number | null | undefined,
  longitude: number | null | undefined
): { mapsUrl: string; wazeUrl: string } {
  if (latitude === null || latitude === undefined || longitude === null || longitude === undefined) {
    return { mapsUrl: '', wazeUrl: '' }
  }
  return {
    mapsUrl: `https://www.google.com/maps/search/?api=1&query=${latitude},${longitude}`,
    wazeUrl: `https://waze.com/ul?ll=${latitude},${longitude}&navigate=yes`
  }
}

// §1.9 — Générer le résumé de commande pour WhatsApp (livraison OU à emporter)
// Gabarit aligné sur la maquette validée : en-tête avec numéro + URL boutique,
// sections "COMMANDE" et "INFO CLIENT" séparées par des lignes horizontales,
// liens Maps/Waze toujours présents dès que des coordonnées existent.
export function genererMessageCommande(
  commande: Commande,
  tenant: Tenant,
  origin: string,
  modeLivraison: 'livraison' | 'emporter' = 'livraison'
): string {
  const items = commande.items_json as ItemCommandeJson[]
  const isEmporter = modeLivraison === 'emporter'

  const lignesItems = items
    .map((item) => {
      let ligne = `• ${item.nom}`
      if (item.variante_nom) ligne += ` (${item.variante_nom})`
      ligne += ` ×${item.quantite} — ${formatMontant(item.sous_total)}`
      return ligne
    })
    .join('\n')

  const { mapsUrl, wazeUrl } = !isEmporter
    ? construireLiensLocalisation(commande.client_latitude, commande.client_longitude)
    : { mapsUrl: '', wazeUrl: '' }

  const numeroCommande = commande.id.slice(0, 8).toUpperCase()
  const boutiqueUrl = `${origin}/${tenant.slug}`
  const suiviUrl = `${origin}/suivi/${commande.token_suivi}`

  const fraisLivraisonLigne =
    !isEmporter && commande.frais_livraison > 0
      ? `\n_(dont frais de livraison : ${formatMontant(commande.frais_livraison)})_`
      : ''

  const libellePaiement = isEmporter
    ? 'Espèces / Mobile money sur place'
    : 'Espèces à la livraison'

  let message = `*COMMANDE #${numeroCommande}*\n${boutiqueUrl}\n\n`
  message += `${SEPARATEUR}\n`
  message += `*COMMANDE*\n`
  message += `*Mode :* ${isEmporter ? '🛍️ À emporter' : '🛵 Livraison'}\n\n`
  message += `${lignesItems}\n\n`
  message += `*Total : ${formatMontant(commande.montant_total)}*${fraisLivraisonLigne}\n`
  message += `*Paiement :* ${libellePaiement}\n\n`

  message += `${SEPARATEUR}\n`
  message += `*INFO CLIENT*\n`
  message += `*Client :* ${commande.client_nom}\n`
  message += `*Tél :* ${commande.client_telephone}\n`

  if (isEmporter) {
    message += `*Retrait :* À récupérer sur place\n`
  } else {
    if (commande.client_adresse) {
      message += `*Adresse :* ${commande.client_adresse}\n`
    }
    // FIX — les liens Maps/Waze ne sont ajoutés QUE si des coordonnées GPS
    // existent réellement (cf. construireLiensLocalisation). Si le client
    // n'a fourni ni géolocalisation ni position sur la carte, ces lignes
    // sont absentes — voir boutique.js où la géolocalisation est désormais
    // rendue obligatoire pour la livraison, précisément pour éviter ce cas.
    if (mapsUrl) message += `*Maps :* ${mapsUrl}\n`
    if (wazeUrl) message += `*Waze :* ${wazeUrl}\n`
  }

  message += `\n${SEPARATEUR}\n`
  message += `*Suivi :* ${suiviUrl}`

  return message
}

// AJOUT — Message dédié au LIVREUR, envoyé quand le restaurant passe une
// commande de "confirmée" à "en préparation" avec un livreur assigné.
// Contient les informations nécessaires à la livraison uniquement : contact
// client, adresse + Maps + Waze, contenu de la commande, montant à encaisser.
export function genererMessageLivreur(
  commande: Commande,
  tenant: Tenant,
  origin: string
): string {
  const items = commande.items_json as ItemCommandeJson[]
  const lignesItems = items
    .map((item) => {
      let ligne = `• ${item.nom}`
      if (item.variante_nom) ligne += ` (${item.variante_nom})`
      ligne += ` ×${item.quantite}`
      return ligne
    })
    .join('\n')

  const { mapsUrl, wazeUrl } = construireLiensLocalisation(commande.client_latitude, commande.client_longitude)
  const numeroCommande = commande.id.slice(0, 8).toUpperCase()
  const boutiqueUrl = `${origin}/${tenant.slug}`

  let message = `*🛵 LIVRAISON À EFFECTUER — Commande #${numeroCommande}*\n`
  message += `Restaurant : *${tenant.nom}* (${boutiqueUrl})\n\n`

  message += `${SEPARATEUR}\n`
  message += `*INFO CLIENT*\n`
  message += `*Client :* ${commande.client_nom}\n`
  message += `*Tél :* ${commande.client_telephone}\n`
  if (commande.client_adresse) {
    message += `*Adresse :* ${commande.client_adresse}\n`
  }
  if (mapsUrl) message += `*Maps :* ${mapsUrl}\n`
  if (wazeUrl) message += `*Waze :* ${wazeUrl}\n`

  message += `\n${SEPARATEUR}\n`
  message += `*CONTENU DE LA COMMANDE*\n`
  message += `${lignesItems}\n\n`
  message += `*Montant à encaisser : ${formatMontant(commande.montant_total)}*\n`
  message += `*Paiement :* Espèces à la livraison\n`

  message += `\n${SEPARATEUR}\n`
  message += `Merci de confirmer la prise en charge auprès du restaurant.`

  return message
}

// URL WhatsApp pré-remplie (client → restaurant, ou restaurant → livreur).
// TOUJOURS générée : c'est le filet de sécurité garanti fonctionnel, même
// si l'API WhatsApp Business officielle n'est pas configurée ou échoue.
export function genererLienWhatsApp(numero: string, message: string): string {
  const numeroNettoye = numero.replace(/\D/g, '')
  return `https://wa.me/${numeroNettoye}?text=${encodeURIComponent(message)}`
}

// Envoyer via API WhatsApp Business Cloud (canal 1 — automatique, best-effort).
// Ne doit JAMAIS bloquer le flux principal : toujours appelé en
// c.executionCtx.waitUntil(...) par les routes qui l'utilisent.
export async function envoyerNotificationWhatsApp(
  numero: string,
  message: string,
  env: { WHATSAPP_API_TOKEN?: string; WHATSAPP_PHONE_ID?: string }
): Promise<WhatsAppMessageResult> {
  if (!env.WHATSAPP_API_TOKEN || !env.WHATSAPP_PHONE_ID) {
    return { success: false, error: 'WhatsApp API non configurée' }
  }

  const numeroNettoye = numero.replace(/\D/g, '')

  try {
    const response = await fetch(
      `https://graph.facebook.com/v18.0/${env.WHATSAPP_PHONE_ID}/messages`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${env.WHATSAPP_API_TOKEN}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          to: numeroNettoye,
          type: 'text',
          text: { body: message }
        })
      }
    )

    if (response.ok) {
      const data = await response.json() as { messages?: Array<{ id: string }> }
      return {
        success: true,
        messageId: data.messages?.[0]?.id
      }
    }

    const errorData = await response.json() as { error?: { message: string } }
    return {
      success: false,
      error: errorData.error?.message ?? 'Erreur WhatsApp API'
    }
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Erreur réseau WhatsApp'
    }
  }
}

// -----------------------------------------------------------------------
// Notifications paiement (audit 07-notifications-inapp-bdd.md §4.1)
// -----------------------------------------------------------------------

/**
 * Notifie le restaurant par WhatsApp que son abonnement a été confirmé.
 */
export async function notifierPaiementConfirme(
  env: { WHATSAPP_API_TOKEN?: string; WHATSAPP_PHONE_ID?: string },
  tenant: { nom: string; whatsapp_number: string },
  plan: { nom: string },
  dateFin: string
): Promise<WhatsAppMessageResult> {
  const dateFinFormatee = new Date(dateFin).toLocaleDateString('fr-FR', {
    day: 'numeric', month: 'long', year: 'numeric'
  })
  const message = [
    `✅ *${tenant.nom}* — Votre abonnement *${plan.nom}* a été activé avec succès.`,
    `📅 Valide jusqu'au ${dateFinFormatee}.`,
    ``,
    `Merci de votre confiance ! 🙏`,
    `— Équipe MonMenu`
  ].join('\n')
  return envoyerNotificationWhatsApp(tenant.whatsapp_number, message, env)
}

/**
 * Notifie le restaurant par WhatsApp que sa preuve de paiement a été rejetée.
 */
export async function notifierPaiementRejete(
  env: { WHATSAPP_API_TOKEN?: string; WHATSAPP_PHONE_ID?: string },
  tenant: { nom: string; whatsapp_number: string },
  motif?: string
): Promise<WhatsAppMessageResult> {
  const lignesMessage = [
    `⚠️ *${tenant.nom}* — Votre preuve de paiement n'a pas pu être vérifiée.`
  ]
  if (motif) lignesMessage.push(`Motif : ${motif}`)
  lignesMessage.push(``, `Veuillez soumettre une nouvelle preuve ou contacter le support.`)
  lignesMessage.push(`— Équipe MonMenu`)

  return envoyerNotificationWhatsApp(tenant.whatsapp_number, lignesMessage.join('\n'), env)
}

/**
 * Notifie le restaurant par WhatsApp du blocage automatique après 72h
 * sans confirmation de paiement (déclenché par le cron).
 */
export async function notifierBlocageAutomatique(
  env: { WHATSAPP_API_TOKEN?: string; WHATSAPP_PHONE_ID?: string },
  tenant: { nom: string; whatsapp_number: string }
): Promise<WhatsAppMessageResult> {
  const message = [
    `🔴 *${tenant.nom}* — Votre accès MonMenu a été temporairement suspendu.`,
    ``,
    `La confirmation de votre paiement n'a pas été reçue dans les 72 heures.`,
    `Contactez le support pour régulariser votre situation.`,
    `— Équipe MonMenu`
  ].join('\n')
  return envoyerNotificationWhatsApp(tenant.whatsapp_number, message, env)
}
