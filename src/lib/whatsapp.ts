// Module WhatsApp Business Cloud API
// Envoi de notifications aux restaurants et livreurs
//
// FIX 1 — Le lien de suivi inséré dans le message WhatsApp était codé en dur
// sur "https://monmenu.app/suivi/...". Sur un environnement de preview
// (*.workers.dev) ou un domaine personnalisé, ce lien pointe vers un domaine
// qui n'a rien à voir avec le site réel : le restaurant clique dessus et
// tombe sur une erreur. genererMessageCommande() prend désormais un paramètre
// "origin" obligatoire (à construire côté appelant avec
// new URL(c.req.url).origin, comme déjà fait ailleurs dans le code pour les
// médias R2 et le QR code) au lieu de la constante en dur.
//
// FIX 2 — envoyerNotificationWhatsApp() déclarait WHATSAPP_API_TOKEN et
// WHATSAPP_PHONE_ID comme des champs REQUIS dans son type d'entrée, alors que
// l'interface Env (types/database.ts) les déclare optionnels (WHATSAPP_API_TOKEN?:
// string). Résultat : passer l'objet "env" complet (comme fait dans
// api-commandes.ts) provoque une erreur de compilation TypeScript
// ("string | undefined n'est pas assignable à string"). Les deux champs sont
// désormais optionnels ici aussi, cohérent avec Env.

import type { Commande, ItemCommandeJson, Tenant } from '../types/database'

interface WhatsAppMessageResult {
  success: boolean
  messageId?: string
  error?: string
}

// Formater le montant avec devise
function formatMontant(montant: number, devise: string = 'FCFA'): string {
  return `${montant.toLocaleString('fr-FR')} ${devise}`
}

// §1.9 — Générer le résumé de commande pour WhatsApp (livraison OU à emporter)
// FIX : "origin" doit être fourni par l'appelant (ex: new URL(c.req.url).origin
// dans le handler Hono) pour que le lien de suivi pointe vers le bon domaine
// quel que soit l'environnement (production, preview, domaine personnalisé).
export function genererMessageCommande(
  commande: Commande,
  tenant: Tenant,
  origin: string,
  modeLivraison: 'livraison' | 'emporter' = 'livraison'
): string {
  const items = commande.items_json as ItemCommandeJson[]
  const lignesItems = items
    .map((item) => {
      let ligne = `  - ${item.nom}`
      if (item.variante_nom) ligne += ` (${item.variante_nom})`
      ligne += ` x${item.quantite} = ${formatMontant(item.sous_total)}`
      return ligne
    })
    .join('\n')

  const isEmporter = modeLivraison === 'emporter'

  const mapsUrl = !isEmporter && commande.client_latitude && commande.client_longitude
    ? `https://maps.google.com/?q=${commande.client_latitude},${commande.client_longitude}`
    : ''
  const wazeUrl = !isEmporter && commande.client_latitude && commande.client_longitude
    ? `https://waze.com/ul?ll=${commande.client_latitude},${commande.client_longitude}&navigate=yes`
    : ''

  // En-tête avec mode de commande
  let message = `*Nouvelle commande #${commande.id.slice(0, 8).toUpperCase()}*\n`
  message += `Mode : *${isEmporter ? '🛍️ À emporter' : '🛵 Livraison'}*\n`
  message += `Restaurant : *${tenant.nom}*\n\n`
  message += `*Client :* ${commande.client_nom}\n`
  message += `*Tel :* ${commande.client_telephone}\n`

  if (isEmporter) {
    // Mode à emporter : pas d'adresse ni de carte
    message += `*Retrait :* À récupérer sur place\n`
  } else {
    // Mode livraison : adresse + liens cartographiques
    if (commande.client_adresse) {
      message += `*Adresse :* ${commande.client_adresse}\n`
    }
    if (mapsUrl) message += `*Google Maps :* ${mapsUrl}\n`
    if (wazeUrl) message += `*Waze :* ${wazeUrl}\n`
  }

  message += `\n*Commande :*\n${lignesItems}\n\n`

  const sousTotal = commande.montant_total - (isEmporter ? 0 : commande.frais_livraison)
  message += `*Sous-total :* ${formatMontant(sousTotal)}\n`

  if (!isEmporter && commande.frais_livraison > 0) {
    message += `*Frais livraison :* ${formatMontant(commande.frais_livraison)}\n`
  }

  message += `*TOTAL :* ${formatMontant(commande.montant_total)}\n`
  message += `*Paiement :* ${isEmporter ? 'Espèces / Mobile money sur place' : 'Espèces à la livraison'}\n`
  // FIX : domaine dynamique au lieu de "https://monmenu.app" en dur.
  message += `\n*Suivi :* ${origin}/suivi/${commande.token_suivi}`

  return message
}

// URL WhatsApp pré-remplie pour le client
export function genererLienWhatsApp(numero: string, message: string): string {
  const numeroNettoye = numero.replace(/\D/g, '')
  return `https://wa.me/${numeroNettoye}?text=${encodeURIComponent(message)}`
}

// Envoyer via API WhatsApp Business Cloud
// FIX : champs optionnels pour matcher l'interface Env réelle (voir en-tête de fichier).
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
