// src/lib/fcm.ts
// Helper Firebase Cloud Messaging v1 — Envoi de push via OAuth2 RS256
//
// Utilisé par :
//   - src/routes/api-commandes.ts (nouvelle commande → push restaurateur)
//   - src/routes/api-admin-paiements.ts (confirmation/rejet paiement)
//   - src/routes/api-dashboard.ts (enregistrement/suppression du token,
//     via POST/DELETE /api/v1/dashboard/fcm-token)
//
// Tokens stockés dans la table Supabase `fcm_tokens` (voir migration
// 013_fcm_tokens.sql), un par device mobile.
//
// Non-bloquant par conception : toute fonction échoue en silence (log
// uniquement) si FCM n'est pas configuré ou si l'envoi échoue — mêmes
// garanties que envoyerNotificationWhatsApp (lib/whatsapp.ts). Aucune route
// existante ne doit jamais échouer à cause d'un problème FCM.

export interface FcmEnv {
  FCM_PROJECT_ID?: string
  FCM_CLIENT_EMAIL?: string
  FCM_PRIVATE_KEY?: string
}

export interface FcmPayload {
  token: string
  title: string
  body: string
  data?: Record<string, string>
  channelId?: string
}

function fcmConfigure(env: FcmEnv): env is Required<FcmEnv> {
  return !!(env.FCM_PROJECT_ID && env.FCM_CLIENT_EMAIL && env.FCM_PRIVATE_KEY)
}

// Cache module-level de l'access token OAuth2 (un JWT signé dure 1h — on le
// régénère avec 60s de marge, pour éviter un aller-retour OAuth2 à chaque
// envoi). Comme pour les autres caches module-level du projet (voir
// lib/supabase.ts), il est réinitialisé à chaque cold start d'isolate
// Cloudflare Workers — comportement attendu et sans risque ici.
let _cachedToken: { token: string; expiresAt: number } | null = null

async function getFcmAccessToken(env: Required<FcmEnv>): Promise<string> {
  const now = Math.floor(Date.now() / 1000)

  if (_cachedToken && _cachedToken.expiresAt > now + 60) {
    return _cachedToken.token
  }

  const header = btoa(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')

  const payload = btoa(JSON.stringify({
    iss: env.FCM_CLIENT_EMAIL,
    scope: 'https://www.googleapis.com/auth/firebase.messaging',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600
  })).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')

  const privateKeyPem = env.FCM_PRIVATE_KEY.replace(/\\n/g, '\n')
  const keyContent = privateKeyPem
    .replace('-----BEGIN RSA PRIVATE KEY-----', '')
    .replace('-----END RSA PRIVATE KEY-----', '')
    .replace('-----BEGIN PRIVATE KEY-----', '')
    .replace('-----END PRIVATE KEY-----', '')
    .replace(/\s/g, '')

  const binaryKey = Uint8Array.from(atob(keyContent), c => c.charCodeAt(0))
  const cryptoKey = await crypto.subtle.importKey(
    'pkcs8',
    binaryKey,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign']
  )

  const signingInput = `${header}.${payload}`
  const signatureBuffer = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    cryptoKey,
    new TextEncoder().encode(signingInput)
  )

  const signature = btoa(String.fromCharCode(...new Uint8Array(signatureBuffer)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')

  const jwt = `${signingInput}.${signature}`

  const tokenResp = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${jwt}`
  })

  if (!tokenResp.ok) {
    const errText = await tokenResp.text().catch(() => '')
    throw new Error(`OAuth2 token request failed (${tokenResp.status}): ${errText}`)
  }

  const tokenData = await tokenResp.json() as { access_token: string; expires_in: number }
  _cachedToken = { token: tokenData.access_token, expiresAt: now + (tokenData.expires_in ?? 3600) }
  return tokenData.access_token
}

/**
 * Envoie une notification FCM à un device unique.
 * Retourne false (sans lever d'exception) si FCM n'est pas configuré ou
 * si l'envoi échoue — l'appelant peut toujours faire .catch(() => {})
 * par sécurité supplémentaire dans un c.executionCtx.waitUntil().
 */
export async function sendFcmNotification(env: FcmEnv, payload: FcmPayload): Promise<boolean> {
  if (!fcmConfigure(env)) {
    console.warn('[FCM] Non configuré (FCM_PROJECT_ID/FCM_CLIENT_EMAIL/FCM_PRIVATE_KEY manquants) — envoi ignoré.')
    return false
  }

  try {
    const accessToken = await getFcmAccessToken(env)
    const channelId = payload.channelId ?? 'commandes_channel'

    const fcmMessage = {
      message: {
        token: payload.token,
        notification: {
          title: payload.title,
          body: payload.body
        },
        data: payload.data ?? {},
        android: {
          priority: 'high',
          notification: {
            channel_id: channelId,
            sound: 'default',
            click_action: 'FLUTTER_NOTIFICATION_CLICK',
            icon: 'ic_launcher',
            color: '#DC2626'
          }
        }
      }
    }

    const resp = await fetch(
      `https://fcm.googleapis.com/v1/projects/${env.FCM_PROJECT_ID}/messages:send`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(fcmMessage)
      }
    )

    if (!resp.ok) {
      const err = await resp.text().catch(() => '')
      console.error(`[FCM] Erreur envoi (${resp.status}):`, err)
      return false
    }

    return true
  } catch (e) {
    console.error('[FCM] Exception sendFcmNotification:', e instanceof Error ? e.message : e)
    return false
  }
}

/**
 * Envoie une notification FCM à TOUS les devices enregistrés d'un tenant.
 * Lit la table fcm_tokens via le client Supabase fourni (généralement le
 * client admin/service role, pour bypasser RLS).
 */
export async function sendFcmToTenant(
  env: FcmEnv,
  supabase: any,
  tenantId: string,
  payload: Omit<FcmPayload, 'token'>
): Promise<{ sent: number; failed: number }> {
  if (!fcmConfigure(env)) {
    return { sent: 0, failed: 0 }
  }

  const { data: tokens, error } = await supabase
    .from('fcm_tokens')
    .select('token')
    .eq('tenant_id', tenantId)

  if (error) {
    console.error('[FCM] Erreur lecture fcm_tokens:', error.message)
    return { sent: 0, failed: 0 }
  }

  if (!tokens || tokens.length === 0) {
    return { sent: 0, failed: 0 }
  }

  let sent = 0
  let failed = 0

  await Promise.all(
    tokens.map(async (t: { token: string }) => {
      const ok = await sendFcmNotification(env, { ...payload, token: t.token })
      if (ok) sent++
      else failed++
    })
  )

  console.log(`[FCM] Tenant ${tenantId.slice(0, 8)}...: ${sent} envoyés, ${failed} échecs`)
  return { sent, failed }
}
