import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import webpush from 'web-push'
import type { DigestPayload } from '@/lib/pushDigestEngine'

let vapidConfigured = false

export function isVapidConfigured(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY &&
      process.env.VAPID_PRIVATE_KEY
  )
}

export function ensureVapidConfigured(): void {
  if (vapidConfigured) return
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
  const privateKey = process.env.VAPID_PRIVATE_KEY
  const subject = process.env.VAPID_SUBJECT || 'mailto:contact@agencepro.app'

  if (!publicKey || !privateKey) {
    throw new Error(
      'Clés VAPID manquantes : définissez NEXT_PUBLIC_VAPID_PUBLIC_KEY et VAPID_PRIVATE_KEY.'
    )
  }

  webpush.setVapidDetails(subject, publicKey, privateKey)
  vapidConfigured = true
}

/**
 * Client Supabase côté serveur avec la clé secrète (`sb_secret_...` ou ancienne `service_role`).
 * Ne jamais exposer SUPABASE_SECRET_KEY / SUPABASE_SERVICE_ROLE_KEY au navigateur.
 */
export function getSupabaseAdminClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const secretKey =
    process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !secretKey) {
    throw new Error(
      'Configuration serveur Supabase incomplète : définissez NEXT_PUBLIC_SUPABASE_URL et SUPABASE_SECRET_KEY (sb_secret_...) ou SUPABASE_SERVICE_ROLE_KEY.'
    )
  }

  return createClient(url, secretKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  })
}

/**
 * Client Supabase authentifié au nom de l'utilisateur courant via son JWT Bearer.
 */
export async function getAuthenticatedUserFromRequest(authHeader: string | null): Promise<{
  userId: string
  accessToken: string
  userClient: SupabaseClient
} | null> {
  if (!authHeader || !authHeader.startsWith('Bearer ')) return null
  const accessToken = authHeader.slice(7).trim()
  if (!accessToken) return null

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !anonKey) return null

  const userClient = createClient(url, anonKey, {
    global: {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  })

  const { data, error } = await userClient.auth.getUser(accessToken)
  if (error || !data?.user?.id) return null

  return {
    userId: data.user.id,
    accessToken,
    userClient,
  }
}

export interface StoredPushSubscription {
  id: string
  user_id: string
  agence_id: string | null
  endpoint: string
  p256dh: string
  auth: string
  platform: string
  enabled: boolean
  morning_enabled: boolean
  evening_enabled: boolean
  timezone: string
  last_seen_at: string | null
  last_notified_at: string | null
  last_slot_sent: string | null
}

export async function sendWebPushNotification(
  sub: Pick<StoredPushSubscription, 'endpoint' | 'p256dh' | 'auth'>,
  payload: DigestPayload
): Promise<{ ok: true } | { ok: false; expired: boolean; statusCode?: number; error: string }> {
  ensureVapidConfigured()

  try {
    await webpush.sendNotification(
      {
        endpoint: sub.endpoint,
        keys: {
          p256dh: sub.p256dh,
          auth: sub.auth,
        },
      },
      JSON.stringify({
        title: payload.title,
        body: payload.body,
        url: payload.url,
        tag: payload.tag,
        category: payload.category,
        icon: '/icon-192x192.png',
        badge: '/icon-192x192.png',
      }),
      {
        TTL: 60 * 60 * 6, // 6 heures
        urgency: 'normal',
      }
    )
    return { ok: true }
  } catch (err: any) {
    const statusCode = typeof err?.statusCode === 'number' ? err.statusCode : undefined
    const expired = statusCode === 404 || statusCode === 410
    return {
      ok: false,
      expired,
      statusCode,
      error: err?.body || err?.message || 'Erreur inconnue Web Push',
    }
  }
}
