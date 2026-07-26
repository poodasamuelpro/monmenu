// Module d'envoi email Brevo avec rotation intelligente de clés API
// Section 12 du cahier des charges

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
    BREVO_API_KEY_1: string
    BREVO_API_KEY_2: string
    BREVO_API_KEY_3: string
  },
  senderOverride?: { email: string; name: string }
): Promise<{ success: boolean; error?: string }> {
  initKeys(env)

  const sender = senderOverride ?? {
    email: 'noreply@monmenu.app',
    name: 'MonMenu'
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
