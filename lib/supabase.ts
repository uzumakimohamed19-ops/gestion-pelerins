import { createClient } from '@supabase/supabase-js'
import {
  OfflineWriteBlockedError,
  isAppOffline,
  notifyNetworkFailure,
  notifyOfflineWriteBlocked,
} from '@/lib/offlineGuard'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

const SUPABASE_REQUEST_TIMEOUT_MS = 15000
const AUTH_LOOKUP_TIMEOUT_MS = 4000
const SESSION_LOOKUP_TIMEOUT_MS = 4000

const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE'])

const fetchWithTimeout: typeof fetch = async (input, init = {}) => {
  const method = (init.method || (input instanceof Request ? input.method : 'GET')).toUpperCase()
  const urlStr = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url

  // Modèle WhatsApp (lecture seule hors-ligne) : bloquer toute écriture Supabase sans Internet
  if (
    MUTATING_METHODS.has(method) &&
    isAppOffline() &&
    !urlStr.includes('/auth/v1/logout') &&
    !urlStr.includes('/auth/v1/token')
  ) {
    notifyOfflineWriteBlocked('Connectez-vous pour enregistrer')
    throw new OfflineWriteBlockedError()
  }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), SUPABASE_REQUEST_TIMEOUT_MS)
  const signal = init.signal
  const abortFromCaller = () => controller.abort()
  signal?.addEventListener('abort', abortFromCaller, { once: true })

  try {
    return await fetch(input, { ...init, signal: controller.signal })
  } catch (err) {
    if (err instanceof TypeError) {
      notifyNetworkFailure()
    }
    throw err
  } finally {
    clearTimeout(timeout)
    signal?.removeEventListener('abort', abortFromCaller)
  }
}

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('Attention : Les clés Supabase ne sont pas configurées dans .env.local')
}

export const supabase = createClient(supabaseUrl || '', supabaseAnonKey || '', {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
  global: { fetch: fetchWithTimeout },
})

// Auto-refresh propre au retour au premier plan sur PWA / mobile
let visibilityRefreshRegistered = false
if (typeof document !== 'undefined' && !visibilityRefreshRegistered) {
  visibilityRefreshRegistered = true
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      supabase.auth.startAutoRefresh()
    } else {
      supabase.auth.stopAutoRefresh()
    }
  })
}

export function requireSupabaseRows<T>(
  data: T[] | null,
  error: { message: string } | null,
  operation: string,
  expectedRows = 1
): T[] {
  if (error) throw error
  if (!data || data.length < expectedRows) {
    throw new Error(
      `Supabase a confirmé ${data?.length ?? 0} ligne(s) sur ${expectedRows} pour l'opération « ${operation} ».`
    )
  }
  return data
}

let supabaseUserPromise: Promise<any> | null = null
let supabaseSessionPromise: Promise<any> | null = null

export function isOfflineMode(): boolean {
  return isAppOffline()
}

function getSupabaseStorageKey(): string | null {
  if (!supabaseUrl) return null
  try {
    const host = new URL(supabaseUrl).hostname
    const projectRef = host.split('.')[0]
    return projectRef ? `sb-${projectRef}-auth-token` : null
  } catch {
    return null
  }
}

/**
 * Lecture synchrone (0 ms) du jeton Supabase v2 réellement persisté dans localStorage.
 * Ne dépend jamais de marqueurs factices ni du seul état hors-ligne.
 */
export function getPersistedSupabaseSession(): {
  access_token: string
  user: { id: string; email?: string }
  expires_at?: number
} | null {
  if (typeof window === 'undefined') return null
  try {
    const expectedKey = getSupabaseStorageKey()
    let raw = expectedKey ? localStorage.getItem(expectedKey) : null

    if (!raw) {
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i)
        if (k && k.startsWith('sb-') && k.endsWith('-auth-token')) {
          raw = localStorage.getItem(k)
          if (raw) break
        }
      }
    }

    if (!raw) return null
    const parsed = JSON.parse(raw)
    const sessionObj = parsed?.currentSession ?? parsed
    if (
      sessionObj &&
      typeof sessionObj.access_token === 'string' &&
      sessionObj.access_token.length > 20 &&
      sessionObj.user &&
      typeof sessionObj.user.id === 'string' &&
      sessionObj.user.id.length > 0
    ) {
      return sessionObj
    }
    return null
  } catch {
    return null
  }
}

export function hasPersistedSupabaseSession(): boolean {
  return Boolean(getPersistedSupabaseSession())
}

export function getPersistedSupabaseUserId(): string | null {
  return getPersistedSupabaseSession()?.user?.id ?? null
}

function isHardAuthRevocationError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false
  const status = 'status' in error ? Number((error as { status?: unknown }).status) : 0
  const msg = String((error as { message?: unknown }).message || '').toLowerCase()

  if (status === 401 || status === 403) return true
  if (
    msg.includes('user from sub claim in jwt does not exist') ||
    msg.includes('user_not_found') ||
    msg.includes('session_not_found') ||
    msg.includes('invalid refresh token') ||
    msg.includes('refresh token not found') ||
    msg.includes('jwt expired') ||
    msg.includes('invalid jwt') ||
    msg.includes('bad_jwt')
  ) {
    return true
  }
  return false
}

export function getSession() {
  if (!supabaseSessionPromise) {
    supabaseSessionPromise = Promise.race([
      supabase.auth.getSession(),
      new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error('SESSION_LOOKUP_TIMEOUT')), SESSION_LOOKUP_TIMEOUT_MS)
      }),
    ])
      .catch((error) => {
        if (error instanceof Error && error.message === 'SESSION_LOOKUP_TIMEOUT') {
          const fallback = getPersistedSupabaseSession()
          return { data: { session: fallback }, error: null, timedOut: true }
        }
        return { data: { session: null }, error, timedOut: false }
      })
      .finally(() => {
        supabaseSessionPromise = null
      })
  }
  return supabaseSessionPromise
}

/**
 * Vérifie le token en ligne et distingue :
 * - Erreur réseau / mode hors-ligne → conserve la session locale persistée.
 * - Révocation / 401 / 403 réelle → tente 1 refresh, puis invalide proprement la session si révoquée.
 */
export function getUser() {
  if (!supabaseUserPromise) {
    supabaseUserPromise = (async () => {
      try {
        const { data: sessionData } = await getSession()
        const localSession = sessionData?.session ?? getPersistedSupabaseSession()

        if (!localSession) {
          return { data: { user: null }, error: null }
        }

        // Hors-ligne : on garde l'utilisateur issu du vrai jeton Supabase persisté
        if (isOfflineMode()) {
          return { data: { user: localSession.user }, error: null }
        }

        const result = await Promise.race([
          supabase.auth.getUser(),
          new Promise<never>((_, reject) => {
            setTimeout(() => reject(new Error('AUTH_LOOKUP_TIMEOUT')), AUTH_LOOKUP_TIMEOUT_MS)
          }),
        ])

        if (result.data?.user) {
          return result
        }

        if (result.error && isHardAuthRevocationError(result.error)) {
          // Tentative unique de rafraîchissement du token avant de déclarer la session révoquée
          try {
            const refreshed = await Promise.race([
              supabase.auth.refreshSession(),
              new Promise<never>((_, reject) => {
                setTimeout(() => reject(new Error('REFRESH_TIMEOUT')), AUTH_LOOKUP_TIMEOUT_MS)
              }),
            ])
            if (refreshed.data?.user) {
              return { data: { user: refreshed.data.user }, error: null }
            }
          } catch {
            // Si le refresh échoue pour raison réseau, ne pas déconnecter brutalement
            if (isOfflineMode()) {
              return { data: { user: localSession.user }, error: null }
            }
          }

          return { data: { user: null }, error: result.error, revoked: true }
        }

        // Erreur réseau transitoire : préserver la session locale
        if (localSession?.user) {
          return { data: { user: localSession.user }, error: null }
        }

        return result
      } catch (error) {
        const fallback = getPersistedSupabaseSession()
        if (fallback?.user) {
          return { data: { user: fallback.user }, error: null }
        }
        return { data: { user: null }, error }
      }
    })().finally(() => {
      supabaseUserPromise = null
    })
  }
  return supabaseUserPromise
}
