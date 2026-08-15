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

// ─────────────────────────────────────────────────────────────────────────────
// Emails transactionnels [session-3] — 7 fonctions, toutes anti-XSS via
// escapeHtml(). Toutes non-bloquantes (try/catch externe dans l'appelant).
// URLs dynamiques via env.PUBLIC_BASE_URL (Cloudflare var) — fallback monmenu.com
// ─────────────────────────────────────────────────────────────────────────────

type BrevoEnv = {
  DB: D1Database
  KV_CACHE?: KVNamespace
  BREVO_API_KEY_1: string
  BREVO_API_KEY_2: string
  BREVO_API_KEY_3: string
  PUBLIC_BASE_URL?: string
}

/** URL de base de l'application — lue depuis PUBLIC_BASE_URL (Cloudflare var).
 *  Fallback : https://monmenu.com (domaine officiel).
 *  Ne jamais hardcoder une URL ici — toujours passer par cette fonction. */
function getBaseUrl(env: BrevoEnv): string {
  const url = env.PUBLIC_BASE_URL?.trim()
  if (url && url.startsWith('http')) return url.replace(/\/$/, '')
  return 'https://monmenu.com'
}

// 1. Email de bienvenue — envoyé après inscription réussie
export async function envoyerEmailBienvenue(
  env: BrevoEnv,
  destinataire: { email: string; nom_restaurant: string }
): Promise<{ success: boolean; error?: string }> {
  const nomApp = await getNomExpediteur(env)
  const baseUrl = getBaseUrl(env)
  const nom = escapeHtml(destinataire.nom_restaurant)

  const htmlContent = `
    <div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px;">
      <h2 style="color:#DC2626;">Bienvenue sur ${escapeHtml(nomApp)} 🎉</h2>
      <p>Bonjour,</p>
      <p>Votre restaurant <strong>${nom}</strong> est maintenant créé. Votre période d'essai gratuite a démarré.</p>
      <p>Connectez-vous à votre tableau de bord pour configurer votre boutique en ligne, ajouter vos produits et partager votre QR code.</p>
      <p style="margin-top:24px;">
        <a href="${baseUrl}/dashboard" style="background:#DC2626;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:bold;">
          Accéder à mon dashboard
        </a>
      </p>
      <p style="color:#6B7280;font-size:13px;margin-top:32px;">L'équipe ${escapeHtml(nomApp)}</p>
    </div>`

  return sendEmail(
    {
      to: [{ email: destinataire.email, name: destinataire.nom_restaurant }],
      subject: `Bienvenue sur ${nomApp} — votre restaurant est prêt !`,
      htmlContent,
      textContent: `Bienvenue sur ${nomApp} ! Votre restaurant ${destinataire.nom_restaurant} est créé. Connectez-vous sur ${baseUrl}/dashboard`
    },
    env
  )
}

// 2. Email confirmation paiement soumis (côté restaurant)
export async function envoyerEmailPaiementSoumis(
  env: BrevoEnv,
  destinataire: { email: string; nom_restaurant: string },
  details: { plan_nom: string; reference: string; delai_confirmation_iso: string }
): Promise<{ success: boolean; error?: string }> {
  const nomApp = await getNomExpediteur(env)
  const nom = escapeHtml(destinataire.nom_restaurant)
  const planNom = escapeHtml(details.plan_nom)
  const ref = escapeHtml(details.reference)
  const delai = new Date(details.delai_confirmation_iso).toLocaleString('fr-FR', { timeZone: 'Africa/Ouagadougou' })

  const htmlContent = `
    <div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px;">
      <h2 style="color:#DC2626;">Preuve de paiement reçue ✅</h2>
      <p>Bonjour <strong>${nom}</strong>,</p>
      <p>Votre preuve de paiement pour le plan <strong>${planNom}</strong> a bien été reçue.</p>
      <table style="border-collapse:collapse;width:100%;margin:16px 0;">
        <tr><td style="padding:8px;border:1px solid #E5E7EB;font-weight:bold;">Référence</td><td style="padding:8px;border:1px solid #E5E7EB;">${ref}</td></tr>
        <tr><td style="padding:8px;border:1px solid #E5E7EB;font-weight:bold;">Délai de confirmation</td><td style="padding:8px;border:1px solid #E5E7EB;">${escapeHtml(delai)}</td></tr>
      </table>
      <p>Vous recevrez un email dès que votre paiement sera validé par notre équipe.</p>
      <p style="color:#6B7280;font-size:13px;margin-top:32px;">L'équipe ${escapeHtml(nomApp)}</p>
    </div>`

  return sendEmail(
    {
      to: [{ email: destinataire.email, name: destinataire.nom_restaurant }],
      subject: `[${nomApp}] Preuve reçue — en attente de confirmation`,
      htmlContent,
      textContent: `Votre preuve de paiement pour ${details.plan_nom} (réf. ${details.reference}) a été reçue. Délai de confirmation : ${delai}.`
    },
    env
  )
}

// 3. Email paiement confirmé (admin → restaurant)
export async function envoyerEmailPaiementConfirme(
  env: BrevoEnv,
  destinataire: { email: string; nom_restaurant: string },
  details: { plan_nom: string; reference: string; date_fin_iso?: string }
): Promise<{ success: boolean; error?: string }> {
  const nomApp = await getNomExpediteur(env)
  const baseUrl = getBaseUrl(env)
  const nom = escapeHtml(destinataire.nom_restaurant)
  const planNom = escapeHtml(details.plan_nom)
  const ref = escapeHtml(details.reference)
  const dateFin = details.date_fin_iso
    ? new Date(details.date_fin_iso).toLocaleDateString('fr-FR', { timeZone: 'Africa/Ouagadougou' })
    : null

  const htmlContent = `
    <div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px;">
      <h2 style="color:#16A34A;">Paiement confirmé — Abonnement activé ! 🎉</h2>
      <p>Bonjour <strong>${nom}</strong>,</p>
      <p>Votre paiement a été validé. Votre abonnement <strong>${planNom}</strong> est maintenant actif.</p>
      <table style="border-collapse:collapse;width:100%;margin:16px 0;">
        <tr><td style="padding:8px;border:1px solid #E5E7EB;font-weight:bold;">Plan</td><td style="padding:8px;border:1px solid #E5E7EB;">${planNom}</td></tr>
        <tr><td style="padding:8px;border:1px solid #E5E7EB;font-weight:bold;">Référence</td><td style="padding:8px;border:1px solid #E5E7EB;">${ref}</td></tr>
        ${dateFin ? `<tr><td style="padding:8px;border:1px solid #E5E7EB;font-weight:bold;">Valide jusqu'au</td><td style="padding:8px;border:1px solid #E5E7EB;">${escapeHtml(dateFin)}</td></tr>` : ''}
      </table>
      <p style="margin-top:24px;">
        <a href="${baseUrl}/dashboard" style="background:#16A34A;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:bold;">
          Accéder à mon dashboard
        </a>
      </p>
      <p style="color:#6B7280;font-size:13px;margin-top:32px;">L'équipe ${escapeHtml(nomApp)}</p>
    </div>`

  return sendEmail(
    {
      to: [{ email: destinataire.email, name: destinataire.nom_restaurant }],
      subject: `[${nomApp}] ✅ Paiement confirmé — Abonnement ${details.plan_nom} actif`,
      htmlContent,
      textContent: `Votre paiement pour ${details.plan_nom} (réf. ${details.reference}) a été confirmé. Votre abonnement est actif${dateFin ? ` jusqu'au ${dateFin}` : ''}.`
    },
    env
  )
}

// 4. Email paiement rejeté (admin → restaurant)
export async function envoyerEmailPaiementRejete(
  env: BrevoEnv,
  destinataire: { email: string; nom_restaurant: string },
  details: { plan_nom: string; reference: string; motif: string }
): Promise<{ success: boolean; error?: string }> {
  const nomApp = await getNomExpediteur(env)
  const emailContact = await getEmailContact(env)
  const baseUrl = getBaseUrl(env)
  const nom = escapeHtml(destinataire.nom_restaurant)
  const planNom = escapeHtml(details.plan_nom)
  const ref = escapeHtml(details.reference)
  const motif = escapeHtml(details.motif)

  const htmlContent = `
    <div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px;">
      <h2 style="color:#DC2626;">Preuve de paiement non validée ❌</h2>
      <p>Bonjour <strong>${nom}</strong>,</p>
      <p>Votre preuve de paiement pour le plan <strong>${planNom}</strong> (réf. <strong>${ref}</strong>) n'a pas pu être validée.</p>
      <div style="background:#FEF2F2;border:1px solid #FECACA;border-radius:8px;padding:16px;margin:16px 0;">
        <strong>Motif :</strong> ${motif}
      </div>
      <p>Vous pouvez soumettre une nouvelle preuve depuis votre tableau de bord ou contacter notre support.</p>
      <p style="margin-top:24px;">
        <a href="${baseUrl}/dashboard/abonnement" style="background:#DC2626;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:bold;">
          Soumettre une nouvelle preuve
        </a>
      </p>
      <p style="color:#6B7280;font-size:13px;margin-top:24px;">Besoin d'aide ? Répondez à cet email ou contactez-nous : ${escapeHtml(emailContact)}</p>
      <p style="color:#6B7280;font-size:13px;">L'équipe ${escapeHtml(nomApp)}</p>
    </div>`

  return sendEmail(
    {
      to: [{ email: destinataire.email, name: destinataire.nom_restaurant }],
      subject: `[${nomApp}] ❌ Preuve de paiement rejetée — action requise`,
      htmlContent,
      textContent: `Votre preuve de paiement pour ${details.plan_nom} (réf. ${details.reference}) a été rejetée. Motif : ${details.motif}. Soumettez une nouvelle preuve sur ${baseUrl}/dashboard/abonnement`
    },
    env
  )
}

// 5. Email rappel expiration (essai ou abonnement) — J-5 ou J-2
export async function envoyerEmailRappelExpiration(
  env: BrevoEnv,
  destinataire: { email: string; nom_restaurant: string },
  details: { type: 'essai' | 'abonnement'; jours_restants: number; date_expiration_iso: string; plan_nom?: string }
): Promise<{ success: boolean; error?: string }> {
  const nomApp = await getNomExpediteur(env)
  const baseUrl = getBaseUrl(env)
  const nom = escapeHtml(destinataire.nom_restaurant)
  const dateExp = new Date(details.date_expiration_iso).toLocaleDateString('fr-FR', { timeZone: 'Africa/Ouagadougou' })
  const typeLabel = details.type === 'essai' ? 'période d\'essai' : `abonnement ${escapeHtml(details.plan_nom ?? '')}`
  const urgence = details.jours_restants <= 2 ? '#DC2626' : '#D97706'

  const htmlContent = `
    <div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px;">
      <h2 style="color:${urgence};">⚠️ Votre ${typeLabel} expire dans ${details.jours_restants} jour${details.jours_restants > 1 ? 's' : ''}</h2>
      <p>Bonjour <strong>${nom}</strong>,</p>
      <p>Votre ${typeLabel} expire le <strong>${escapeHtml(dateExp)}</strong>. Sans renouvellement, votre boutique sera suspendue et vos clients ne pourront plus passer commande.</p>
      <p style="margin-top:24px;">
        <a href="${baseUrl}/dashboard/abonnement" style="background:${urgence};color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:bold;">
          Renouveler maintenant
        </a>
      </p>
      <p style="color:#6B7280;font-size:13px;margin-top:32px;">L'équipe ${escapeHtml(nomApp)}</p>
    </div>`

  return sendEmail(
    {
      to: [{ email: destinataire.email, name: destinataire.nom_restaurant }],
      subject: `[${nomApp}] ⚠️ Votre ${details.type === 'essai' ? 'essai' : 'abonnement'} expire dans ${details.jours_restants} jour${details.jours_restants > 1 ? 's' : ''} — ${nom}`,
      htmlContent,
      textContent: `Votre ${typeLabel} pour ${destinataire.nom_restaurant} expire le ${dateExp}. Renouvelez sur ${baseUrl}/dashboard/abonnement`
    },
    env
  )
}

// 6. Email confirmation demande de suppression de compte
export async function envoyerEmailSuppressionDemande(
  env: BrevoEnv,
  destinataire: { email: string; nom_restaurant: string },
  details: { token: string; date_suppression_iso: string }
): Promise<{ success: boolean; error?: string }> {
  const nomApp = await getNomExpediteur(env)
  const baseUrl = getBaseUrl(env)
  const nom = escapeHtml(destinataire.nom_restaurant)
  const dateSuppr = new Date(details.date_suppression_iso).toLocaleDateString('fr-FR', { timeZone: 'Africa/Ouagadougou' })
  const lienConfirmation = `${baseUrl}/api/v1/dashboard/compte/confirmer-suppression?token=${encodeURIComponent(details.token)}`

  const htmlContent = `
    <div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px;">
      <h2 style="color:#DC2626;">Demande de suppression de compte</h2>
      <p>Bonjour <strong>${nom}</strong>,</p>
      <p>Vous avez demandé la suppression de votre compte. Pour confirmer, cliquez sur le bouton ci-dessous.</p>
      <div style="background:#FEF2F2;border:1px solid #FECACA;border-radius:8px;padding:16px;margin:16px 0;">
        <strong>⚠️ Attention :</strong> Votre compte et toutes vos données seront définitivement supprimés le <strong>${escapeHtml(dateSuppr)}</strong> si vous ne l'annulez pas avant cette date.
      </div>
      <p style="margin-top:24px;">
        <a href="${lienConfirmation}" style="background:#DC2626;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:bold;">
          Confirmer la suppression
        </a>
      </p>
      <p>Pour annuler, connectez-vous à votre tableau de bord avant le ${escapeHtml(dateSuppr)}.</p>
      <p style="color:#6B7280;font-size:13px;margin-top:32px;">Si vous n'êtes pas à l'origine de cette demande, ignorez cet email ou contactez notre support immédiatement.</p>
      <p style="color:#6B7280;font-size:13px;">L'équipe ${escapeHtml(nomApp)}</p>
    </div>`

  return sendEmail(
    {
      to: [{ email: destinataire.email, name: destinataire.nom_restaurant }],
      subject: `[${nomApp}] Confirmation de suppression de compte — action requise`,
      htmlContent,
      textContent: `Vous avez demandé la suppression de votre compte ${destinataire.nom_restaurant}. Confirmez en cliquant : ${lienConfirmation}\nDate de suppression prévue : ${dateSuppr}. Pour annuler, connectez-vous à votre dashboard.`
    },
    env
  )
}

// 7. Email confirmation annulation de suppression de compte
// B5 — session-5 : Nouvelle fonction envoyée quand le restaurant annule
// sa demande de suppression depuis le dashboard. Rassure l'utilisateur et
// lui confirme que son compte est sauvegardé.
export async function envoyerEmailAnnulationSuppression(
  env: BrevoEnv,
  destinataire: { email: string; nom_restaurant: string }
): Promise<{ success: boolean; error?: string }> {
  const nomApp = await getNomExpediteur(env)
  const baseUrl = getBaseUrl(env)
  const nom = escapeHtml(destinataire.nom_restaurant)

  const htmlContent = `
    <div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px;">
      <h2 style="color:#16A34A;">Suppression annulée — Votre compte est conservé ✅</h2>
      <p>Bonjour <strong>${nom}</strong>,</p>
      <p>Votre demande de suppression de compte a bien été annulée. Votre compte, vos données et votre boutique en ligne sont intégralement conservés.</p>
      <p>Vous pouvez continuer à utiliser ${escapeHtml(nomApp)} normalement.</p>
      <p style="margin-top:24px;">
        <a href="${baseUrl}/dashboard" style="background:#16A34A;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:bold;">
          Accéder à mon dashboard
        </a>
      </p>
      <p style="color:#6B7280;font-size:13px;margin-top:32px;">Si vous n'êtes pas à l'origine de cette annulation, contactez immédiatement notre support.</p>
      <p style="color:#6B7280;font-size:13px;">L'équipe ${escapeHtml(nomApp)}</p>
    </div>`

  return sendEmail(
    {
      to: [{ email: destinataire.email, name: destinataire.nom_restaurant }],
      subject: `[${nomApp}] ✅ Suppression annulée — Votre compte est conservé`,
      htmlContent,
      textContent: `Votre demande de suppression du compte ${destinataire.nom_restaurant} a été annulée. Votre compte est intégralement conservé. Accédez à votre dashboard : ${baseUrl}/dashboard`
    },
    env
  )
}

// 8. Newsletter réelle — envoi en masse (appelé par POST /api/v1/newsletter/envoyer)
// Cette fonction est intentionnellement simple : elle envoie à UN destinataire à la fois.
// L'appelant (api-newsletter.ts) gère le batching par Promise.allSettled().
export async function envoyerEmailNewsletter(
  env: BrevoEnv,
  destinataire: { email: string; nom?: string },
  contenu: { sujet: string; corps_html: string; corps_texte: string }
): Promise<{ success: boolean; error?: string }> {
  // Contenu vient de l'admin (X-Admin-Secret) — pas d'escapeHtml sur le corps.
  return sendEmail(
    {
      to: [{ email: destinataire.email, name: destinataire.nom ?? destinataire.email }],
      subject: contenu.sujet,
      htmlContent: contenu.corps_html,
      textContent: contenu.corps_texte
    },
    env
  )
}

// ─────────────────────────────────────────────────────────────────────────────

export function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}
