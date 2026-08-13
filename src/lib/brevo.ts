// Module d'envoi email Brevo avec rotation intelligente de clés API 
// Section 12 du cahier des charges
//
// AJOUT — L'expéditeur (email + nom) n'est plus codé en dur : il est lu
// dynamiquement depuis D1 config_globale (clés 'email_expediteur' et
// 'nom_expediteur', voir lib/supabase.ts), au même titre que nom_projet /
// whatsapp_support. Tant que 'email_expediteur' n'est pas configuré,
// l'expéditeur retombe automatiquement sur l'adresse de contact
// (email_contact) — ce qui fonctionne avec la vérification "expéditeur
// unique" de Brevo, sans authentification de domaine. Cela permet de
// changer de domaine (ex: passage de .app à .com) ou de reconfigurer
// Brevo sans aucune modification de code ni redéploiement.

import { getEmailExpediteur, getNomExpediteur, getEmailContact } from './supabase'

interface EmailPayload {
  to: Array<{ email: string; name?: string }>
  subject: string
  htmlContent: string
  textContent?: string
  sender?: { email: string; name: string }
}

interface KeyState {
  key: string
  errorCount: number
  lastError: number | null
  exhausted: boolean
}

// État global des clés (persist dans Worker isolate)
const keyStates: KeyState[] = []
let initialized = false

function initKeys(env: {
  BREVO_API_KEY_1: string
  BREVO_API_KEY_2: string
  BREVO_API_KEY_3: string
}): void {
  if (initialized) return
  keyStates.push(
    { key: env.BREVO_API_KEY_1, errorCount: 0, lastError: null, exhausted: false },
    { key: env.BREVO_API_KEY_2, errorCount: 0, lastError: null, exhausted: false },
    { key: env.BREVO_API_KEY_3, errorCount: 0, lastError: null, exhausted: false }
  )
  initialized = true
}

function getActiveKey(): KeyState | null {
  // Réinitialiser les clés épuisées après 1 heure
  const now = Date.now()
  for (const state of keyStates) {
    if (state.exhausted && state.lastError && now - state.lastError > 3600000) {
      state.exhausted = false
      state.errorCount = 0
    }
  }
  return keyStates.find((s) => !s.exhausted) ?? null
}

async function sendWithKey(
  state: KeyState,
  payload: EmailPayload,
  sender: { email: string; name: string }
): Promise<boolean> {
  try {
    const response = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        'api-key': state.key,
        'Content-Type': 'application/json',
        Accept: 'application/json'
      },
      body: JSON.stringify({
        sender,
        to: payload.to,
        subject: payload.subject,
        htmlContent: payload.htmlContent,
        textContent: payload.textContent
      })
    })

    if (response.ok) {
      state.errorCount = 0
      return true
    }

    const errorData = await response.json() as { code?: string }
    // Quota atteint ou clé invalide
    if (response.status === 429 || response.status === 402 || errorData.code === 'over_quota') {
      state.exhausted = true
      state.lastError = Date.now()
      console.error(`[Brevo] Clé épuisée (status ${response.status})`)
    } else {
      state.errorCount++
      if (state.errorCount >= 3) {
        state.exhausted = true
        state.lastError = Date.now()
      }
    }
    return false
  } catch (err) {
    state.errorCount++
    if (state.errorCount >= 3) {
      state.exhausted = true
      state.lastError = Date.now()
    }
    return false
  }
}

export async function sendEmail(
  payload: EmailPayload,
  env: {
    DB: D1Database
    KV_CACHE?: KVNamespace
    BREVO_API_KEY_1: string
    BREVO_API_KEY_2: string
    BREVO_API_KEY_3: string
  },
  senderOverride?: { email: string; name: string }
): Promise<{ success: boolean; error?: string }> {
  initKeys(env)

  // AJOUT — expéditeur dynamique (D1 config_globale) : plus aucune valeur
  // codée en dur ici. Voir lib/supabase.ts (getEmailExpediteur / getNomExpediteur).
  const sender = senderOverride ?? {
    email: await getEmailExpediteur(env),
    name: await getNomExpediteur(env)
  }

  // Tenter chaque clé disponible
  for (let i = 0; i < keyStates.length; i++) {
    const state = getActiveKey()
    if (!state) break

    const success = await sendWithKey(state, payload, sender)
    if (success) return { success: true }
  }

  // Toutes les clés épuisées
  console.error('[Brevo] Toutes les clés API sont épuisées. Email non envoyé.')
  return {
    success: false,
    error: 'Toutes les clés Brevo sont épuisées. Vérifier les quotas.'
  }
}

// AJOUT — Helper dédié à l'envoi du message du formulaire de contact public
// (voir routes/api-contact.ts) vers l'adresse de contact officielle
// MonMenu, configurée dynamiquement via D1 config_globale
// (getEmailContact — clé 'email_contact'). Aucune adresse codée en dur.
export async function envoyerEmailContact(
  env: {
    DB: D1Database
    KV_CACHE?: KVNamespace
    BREVO_API_KEY_1: string
    BREVO_API_KEY_2: string
    BREVO_API_KEY_3: string
  },
  formulaire: { nom: string; email: string; profil: string; sujet: string; message: string }
): Promise<{ success: boolean; error?: string }> {
  const emailContact = await getEmailContact(env)
  const nomExpediteurAffiche = await getNomExpediteur(env)

  const htmlContent = `
    <h2>Nouveau message — Formulaire de contact ${escapeHtml(nomExpediteurAffiche)}</h2>
    <p><strong>Nom :</strong> ${escapeHtml(formulaire.nom)}</p>
    <p><strong>Email/Téléphone :</strong> ${escapeHtml(formulaire.email)}</p>
    <p><strong>Profil :</strong> ${escapeHtml(formulaire.profil)}</p>
    <p><strong>Sujet :</strong> ${escapeHtml(formulaire.sujet)}</p>
    <p><strong>Message :</strong></p>
    <p>${escapeHtml(formulaire.message).replace(/\n/g, '<br>')}</p>
  `
  const textContent = `Nouveau message — Formulaire de contact ${nomExpediteurAffiche}
Nom : ${formulaire.nom}
Email/Téléphone : ${formulaire.email}
Profil : ${formulaire.profil}
Sujet : ${formulaire.sujet}
Message :
${formulaire.message}`

  return sendEmail(
    {
      to: [{ email: emailContact }],
      subject: `[Contact ${nomExpediteurAffiche}] ${formulaire.sujet} — ${formulaire.nom}`,
      htmlContent,
      textContent
    },
    env
  )
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}
