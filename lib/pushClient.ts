'use client'

import { get as idbGet } from 'idb-keyval'
import { supabase } from '@/lib/supabase'

export type PushPlatform = 'ios-pwa' | 'android-pwa' | 'android-web' | 'desktop' | 'web'

export interface PushEnvironmentInfo {
  supported: boolean
  isIOS: boolean
  isAndroid: boolean
  isStandalone: boolean
  needsIosInstall: boolean
  permission: NotificationPermission | 'unsupported'
  platform: PushPlatform
  vapidConfigured: boolean
}

export interface PushPreferences {
  enabled: boolean
  morning_enabled: boolean
  evening_enabled: boolean
  endpoint: string | null
}

const VAPID_PUBLIC_KEY = (process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || '')
  .trim()
  .replace(/^['"]|['"]$/g, '')
  .replace(/\s+/g, '')
  .replace(/=+$/g, '')

export function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = window.atob(base64)
  const buffer = new ArrayBuffer(rawData.length)
  const outputArray = new Uint8Array(buffer)
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i)
  }
  return outputArray
}

export function detectPushEnvironment(): PushEnvironmentInfo {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') {
    return {
      supported: false,
      isIOS: false,
      isAndroid: false,
      isStandalone: false,
      needsIosInstall: false,
      permission: 'unsupported',
      platform: 'web',
      vapidConfigured: Boolean(VAPID_PUBLIC_KEY),
    }
  }

  const ua = navigator.userAgent || ''
  const isIOS =
    /iPad|iPhone|iPod/.test(ua) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  const isAndroid = /Android/i.test(ua)
  const isStandalone =
    window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as unknown as { standalone?: boolean }).standalone === true

  const needsIosInstall = isIOS && !isStandalone
  const hasPushApi =
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window

  const platform: PushPlatform = isIOS
    ? isStandalone
      ? 'ios-pwa'
      : 'web'
    : isAndroid
    ? isStandalone
      ? 'android-pwa'
      : 'android-web'
    : 'desktop'

  return {
    supported: hasPushApi && !needsIosInstall,
    isIOS,
    isAndroid,
    isStandalone,
    needsIosInstall,
    permission: 'Notification' in window ? Notification.permission : 'unsupported',
    platform,
    vapidConfigured: Boolean(VAPID_PUBLIC_KEY),
  }
}

async function getAccessToken(): Promise<string | null> {
  const { data } = await supabase.auth.getSession()
  return data.session?.access_token ?? null
}

/**
 * Lit l'année de campagne Hajj actuellement sélectionnée dans l'app (`selectedYear_hajj`).
 * Retourne `null` si l'utilisateur est sur "Toutes les années".
 */
export async function getSelectedHajjCampagne(): Promise<number | null> {
  if (typeof window === 'undefined') return null
  try {
    const saved = await idbGet('selectedYear_hajj')
    if (saved == null) return new Date().getFullYear()
    if (String(saved) === 'all') return null
    const parsed = parseInt(String(saved), 10)
    return Number.isFinite(parsed) && parsed > 2000 ? parsed : new Date().getFullYear()
  } catch {
    return new Date().getFullYear()
  }
}

async function ensureServiceWorkerReady(): Promise<ServiceWorkerRegistration> {
  if (!('serviceWorker' in navigator)) {
    throw new Error('Service Worker non supporté sur cet appareil.')
  }
  let reg = await navigator.serviceWorker.getRegistration('/')
  if (!reg) {
    reg = await navigator.serviceWorker.register('/sw.js', { scope: '/' })
  }
  return await navigator.serviceWorker.ready
}

export async function getCurrentBrowserSubscription(): Promise<PushSubscription | null> {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator) || !('PushManager' in window)) {
    return null
  }
  try {
    const reg = await navigator.serviceWorker.getRegistration('/')
    if (!reg) return null
    return await reg.pushManager.getSubscription()
  } catch {
    return null
  }
}

export async function fetchPushStatus(): Promise<PushPreferences> {
  const currentSub = await getCurrentBrowserSubscription()
  const token = await getAccessToken()
  if (!currentSub || !token) {
    return {
      enabled: false,
      morning_enabled: true,
      evening_enabled: true,
      endpoint: currentSub?.endpoint ?? null,
    }
  }

  try {
    const res = await fetch(
      `/api/push/subscribe?endpoint=${encodeURIComponent(currentSub.endpoint)}`,
      {
        method: 'GET',
        headers: { Authorization: `Bearer ${token}` },
      }
    )
    if (!res.ok) {
      return {
        enabled: true,
        morning_enabled: true,
        evening_enabled: true,
        endpoint: currentSub.endpoint,
      }
    }
    const json = await res.json()
    return {
      enabled: Boolean(json.enabled),
      morning_enabled: json.morning_enabled ?? true,
      evening_enabled: json.evening_enabled ?? true,
      endpoint: currentSub.endpoint,
    }
  } catch {
    return {
      enabled: Boolean(currentSub),
      morning_enabled: true,
      evening_enabled: true,
      endpoint: currentSub.endpoint,
    }
  }
}

export async function subscribeToPush(options?: {
  morning_enabled?: boolean
  evening_enabled?: boolean
}): Promise<PushPreferences> {
  const env = detectPushEnvironment()
  if (env.needsIosInstall) {
    throw new Error("Installez d'abord l'application sur votre écran d'accueil iOS.")
  }
  if (!env.supported) {
    throw new Error('Les notifications push ne sont pas supportées par ce navigateur.')
  }
  if (!VAPID_PUBLIC_KEY) {
    throw new Error('Clé VAPID publique manquante (NEXT_PUBLIC_VAPID_PUBLIC_KEY).')
  }

  // Important iOS : requestPermission() doit être appelé directement dans le geste utilisateur
  const permission = await Notification.requestPermission()
  if (permission !== 'granted') {
    throw new Error(
      permission === 'denied'
        ? "Notifications bloquées. Autorisez-les dans les réglages de l'appareil."
        : 'Autorisation de notification non accordée.'
    )
  }

  const reg = await ensureServiceWorkerReady()
  let subscription = await reg.pushManager.getSubscription()
  if (!subscription) {
    subscription = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
    })
  }

  const subJson = subscription.toJSON()
  const p256dh = subJson.keys?.p256dh
  const auth = subJson.keys?.auth
  if (!subscription.endpoint || !p256dh || !auth) {
    throw new Error('Abonnement push incomplet renvoyé par le navigateur.')
  }

  const token = await getAccessToken()
  if (!token) {
    throw new Error('Connectez-vous pour enregistrer les notifications.')
  }

  const timezone =
    Intl.DateTimeFormat().resolvedOptions().timeZone || 'Africa/Bamako'
  const activeCampagne = await getSelectedHajjCampagne()

  const res = await fetch('/api/push/subscribe', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      endpoint: subscription.endpoint,
      p256dh,
      auth,
      platform: env.platform,
      user_agent: navigator.userAgent.slice(0, 240),
      morning_enabled: options?.morning_enabled ?? true,
      evening_enabled: options?.evening_enabled ?? true,
      timezone,
      active_campagne: activeCampagne,
    }),
  })

  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error(data.error || "Impossible d'enregistrer l'abonnement push.")
  }

  return {
    enabled: true,
    morning_enabled: data.morning_enabled ?? options?.morning_enabled ?? true,
    evening_enabled: data.evening_enabled ?? options?.evening_enabled ?? true,
    endpoint: subscription.endpoint,
  }
}

export async function updatePushPreferences(prefs: {
  morning_enabled: boolean
  evening_enabled: boolean
}): Promise<void> {
  const sub = await getCurrentBrowserSubscription()
  const token = await getAccessToken()
  if (!sub || !token) return

  const subJson = sub.toJSON()
  const res = await fetch('/api/push/subscribe', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      endpoint: sub.endpoint,
      p256dh: subJson.keys?.p256dh,
      auth: subJson.keys?.auth,
      platform: detectPushEnvironment().platform,
      morning_enabled: prefs.morning_enabled,
      evening_enabled: prefs.evening_enabled,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'Africa/Bamako',
    }),
  })

  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    throw new Error(data.error || 'Échec de mise à jour des préférences.')
  }
}

export async function unsubscribeFromPush(): Promise<void> {
  const sub = await getCurrentBrowserSubscription()
  const token = await getAccessToken()

  if (sub && token) {
    await fetch('/api/push/subscribe', {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ endpoint: sub.endpoint }),
    }).catch(() => {})
  }

  if (sub) {
    await sub.unsubscribe().catch(() => {})
  }
}

export async function sendTestPushNotification(): Promise<{ title: string; body: string }> {
  const token = await getAccessToken()
  if (!token) throw new Error('Session utilisateur introuvable.')

  const sub = await getCurrentBrowserSubscription()
  const res = await fetch('/api/push/test', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ endpoint: sub?.endpoint ?? null }),
  })

  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error(data.error || "Impossible d'envoyer la notification de test.")
  }

  return { title: data.title, body: data.body }
}

const LAST_PING_STORAGE_KEY = 'agencepro_push_last_ping_ms'
const PING_THROTTLE_MS = 30 * 60 * 1000 // 30 minutes

export async function pingPushActivityIfNeeded(options?: {
  force?: boolean
  activeCampagne?: number | null
}): Promise<void> {
  if (typeof window === 'undefined' || !navigator.onLine) return
  try {
    const last = Number(localStorage.getItem(LAST_PING_STORAGE_KEY) || '0')
    if (!options?.force && Date.now() - last < PING_THROTTLE_MS) return

    const token = await getAccessToken()
    if (!token) return

    const sub = await getCurrentBrowserSubscription()
    const activeCampagne =
      options && 'activeCampagne' in options
        ? options.activeCampagne
        : await getSelectedHajjCampagne()

    localStorage.setItem(LAST_PING_STORAGE_KEY, String(Date.now()))

    await fetch('/api/push/ping', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        endpoint: sub?.endpoint ?? null,
        active_campagne: activeCampagne,
      }),
    }).catch(() => {})
  } catch {
    // Silencieux : ne jamais perturber l'ouverture de l'app
  }
}
