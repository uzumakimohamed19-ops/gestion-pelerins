import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import * as webpush from 'web-push'
import type { DigestPayload } from '@/lib/pushDigestEngine'

let vapidConfigured = false

function sanitizeVapidKey(raw: string | undefined): string {
  if (!raw) return ''
  let v = raw.trim().replace(/^['"]|['"]$/g, '').trim()
  const eqIdx = v.indexOf('=')
  if (eqIdx > 0 && /^[A-Z0-9_]+$/i.test(v.slice(0, eqIdx))) {
    v = v.slice(eqIdx + 1).trim().replace(/^['"]|['"]$/g, '').trim()
  }
  return v
    .replace(/\s+/g, '')
    .replace(/=+$/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
}

function sanitizeEnvText(raw: string | undefined, fallback: string): string {
  if (!raw) return fallback
  const cleaned = raw.trim().replace(/^['"]|['"]$/g, '').trim()
  return cleaned || fallback
}

export function isVapidConfigured(): boolean {
  return Boolean(
    sanitizeVapidKey(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY) &&
      sanitizeVapidKey(process.env.VAPID_PRIVATE_KEY)
  )
}

export function ensureVapidConfigured(): void {
  if (vapidConfigured) return
  const publicKey = sanitizeVapidKey(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY)
  const privateKey = sanitizeVapidKey(process.env.VAPID_PRIVATE_KEY)
  const subject = sanitizeEnvText(process.env.VAPID_SUBJECT, 'mailto:contact@agencepro.app')

  if (!publicKey || !privateKey) {
    throw new Error(
      'Clés VAPID manquantes : définissez NEXT_PUBLIC_VAPID_PUBLIC_KEY et VAPID_PRIVATE_KEY.'
    )
  }

  try {
    webpush.setVapidDetails(subject, publicKey, privateKey)
    vapidConfigured = true
  } catch (err: any) {
    throw new Error(
      `Clé VAPID invalide sur le serveur (longueur privée=${privateKey.length}, publique=${publicKey.length}). Vérifiez VAPID_PRIVATE_KEY dans Vercel : ${err?.message || err}`
    )
  }
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

export interface GlobalPushSettings {
  global_enabled: boolean
  morning_enabled: boolean
  evening_enabled: boolean
  inactivity_days_threshold: number
  updated_at?: string | null
}

export const DEFAULT_GLOBAL_PUSH_SETTINGS: GlobalPushSettings = {
  global_enabled: true,
  morning_enabled: true,
  evening_enabled: true,
  inactivity_days_threshold: 2,
}

/**
 * Vérifie que l'utilisateur connecté possède bien le rôle `admin` dans `public.profiles`.
 */
export async function requireAdminFromRequest(authHeader: string | null): Promise<{
  userId: string
  adminClient: SupabaseClient
} | null> {
  const auth = await getAuthenticatedUserFromRequest(authHeader)
  if (!auth) return null

  const adminClient = getSupabaseAdminClient()
  const { data: profile } = await adminClient
    .from('profiles')
    .select('role')
    .eq('id', auth.userId)
    .maybeSingle()

  if (profile?.role !== 'admin') return null
  return { userId: auth.userId, adminClient }
}

/**
 * Charge les réglages globaux de notification (avec repli sûr si la table n'existe pas encore).
 */
export async function getGlobalPushSettings(
  adminClient: SupabaseClient
): Promise<GlobalPushSettings> {
  try {
    const { data, error } = await adminClient
      .from('push_global_settings')
      .select('global_enabled, morning_enabled, evening_enabled, inactivity_days_threshold, updated_at')
      .eq('id', 1)
      .maybeSingle()

    if (error || !data) return { ...DEFAULT_GLOBAL_PUSH_SETTINGS }
    return {
      global_enabled: data.global_enabled ?? true,
      morning_enabled: data.morning_enabled ?? true,
      evening_enabled: data.evening_enabled ?? true,
      inactivity_days_threshold: Number(data.inactivity_days_threshold) || 2,
      updated_at: data.updated_at ?? null,
    }
  } catch {
    return { ...DEFAULT_GLOBAL_PUSH_SETTINGS }
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
  active_campagne?: number | null
  last_seen_at: string | null
  last_notified_at: string | null
  last_slot_sent: string | null
}

export type PushUrgency = 'very-low' | 'low' | 'normal' | 'high'

export interface SendPushOptions {
  /** 'high' = priorité haute FCM + APNs (réveille l'appareil même en veille / Doze) */
  urgency?: PushUrgency
  /** Durée de rétention sur les serveurs FCM/APNs si le téléphone est hors ligne (défaut: 24h) */
  ttlSeconds?: number
  /** Identifiant court (<= 32 car. alphanum/_/-) pour remplacer un ancien message non lu du même créneau */
  topic?: string
  /** Garde la notification visible jusqu'à interaction sur Android/Desktop */
  requireInteraction?: boolean
}

function sanitizeTopic(raw: string | undefined): string | undefined {
  if (!raw) return undefined
  const clean = raw.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 32)
  return clean || undefined
}

export async function sendWebPushNotification(
  sub: Pick<StoredPushSubscription, 'endpoint' | 'p256dh' | 'auth'>,
  payload: DigestPayload,
  options?: SendPushOptions
): Promise<{ ok: true } | { ok: false; expired: boolean; statusCode?: number; error: string }> {
  ensureVapidConfigured()

  const urgency: PushUrgency = options?.urgency ?? 'high'
  const ttlSeconds = options?.ttlSeconds ?? 60 * 60 * 24 // 24 heures (résiste au mode avion / hors-ligne)
  const topic = sanitizeTopic(options?.topic ?? payload.tag)
  const requireInteraction = options?.requireInteraction ?? urgency === 'high'

  const bodyJson = JSON.stringify({
    title: payload.title,
    body: payload.body,
    url: payload.url,
    tag: payload.tag,
    category: payload.category,
    priority: urgency,
    requireInteraction,
    icon: '/icon-192x192.png',
    badge: '/icon-192x192.png',
    timestamp: Date.now(),
  })

  const pushSubscription = {
    endpoint: sub.endpoint,
    keys: {
      p256dh: sub.p256dh,
      auth: sub.auth,
    },
  }

  const requestOptions: webpush.RequestOptions = {
    TTL: ttlSeconds,
    urgency,
    ...(topic ? { topic } : {}),
  }

  const maxAttempts = 2
  let lastStatusCode: number | undefined
  let lastError = 'Erreur inconnue Web Push'

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      await webpush.sendNotification(pushSubscription, bodyJson, requestOptions)
      return { ok: true }
    } catch (err: any) {
      const statusCode = typeof err?.statusCode === 'number' ? err.statusCode : undefined
      lastStatusCode = statusCode
      lastError = err?.body || err?.message || 'Erreur inconnue Web Push'

      // Abonnement définitivement révoqué/expiré : ne pas réessayer
      if (statusCode === 404 || statusCode === 410) {
        return { ok: false, expired: true, statusCode, error: lastError }
      }

      // Erreur client permanente (400/401/403/413) : ne pas réessayer
      if (statusCode && statusCode >= 400 && statusCode < 500 && statusCode !== 429) {
        return { ok: false, expired: false, statusCode, error: lastError }
      }

      // Erreur transitoire (429 / 5xx / réseau) : 1 retry court
      if (attempt < maxAttempts) {
        await new Promise((resolve) => setTimeout(resolve, 600 * attempt))
      }
    }
  }

  return {
    ok: false,
    expired: false,
    statusCode: lastStatusCode,
    error: lastError,
  }
}
