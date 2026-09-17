import { createClient } from '@supabase/supabase-js'

// On récupère les clés du fichier .env.local
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

const SUPABASE_REQUEST_TIMEOUT_MS = 15000
const AUTH_LOOKUP_TIMEOUT_MS = 4000
const SESSION_LOOKUP_TIMEOUT_MS = 4000

const fetchWithTimeout: typeof fetch = async (input, init = {}) => {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), SUPABASE_REQUEST_TIMEOUT_MS)
  const signal = init.signal
  const abortFromCaller = () => controller.abort()
  signal?.addEventListener('abort', abortFromCaller, { once: true })

  try {
    return await fetch(input, { ...init, signal: controller.signal })
  } finally {
    clearTimeout(timeout)
    signal?.removeEventListener('abort', abortFromCaller)
  }
}

// Petite vérification de sécurité pour éviter l'erreur "undefined"
if (!supabaseUrl || !supabaseAnonKey) {
  console.error("Attention : Les clés Supabase ne sont pas configurées dans .env.local")
}

// On exporte la constante pour qu'elle soit visible ailleurs
export const supabase = createClient(
  supabaseUrl || '', 
  supabaseAnonKey || '',
  { global: { fetch: fetchWithTimeout } },
)

let supabaseUserPromise: Promise<any> | null = null
let supabaseSessionPromise: Promise<any> | null = null

export function isOfflineMode() {
  return typeof navigator !== 'undefined' && !navigator.onLine
}

export function getSession() {
  if (!supabaseSessionPromise) {
    supabaseSessionPromise = Promise.race([
      supabase.auth.getSession(),
      new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error('SESSION_LOOKUP_TIMEOUT')), SESSION_LOOKUP_TIMEOUT_MS)
      }),
    ]).catch((error) => {
      if (error instanceof Error && error.message === 'SESSION_LOOKUP_TIMEOUT') {
        return { data: { session: null }, error: null }
      }

      return { data: { session: null }, error }
    }).finally(() => {
      supabaseSessionPromise = null
    })
  }
  return supabaseSessionPromise
}

/**
 * Vérifie le token en ligne, mais conserve la session locale si le réseau est
 * indisponible. Une panne réseau ne doit pas être interprétée comme SIGNED_OUT.
 */
export function getUser() {
  if (!supabaseUserPromise) {
    supabaseUserPromise = (async () => {
      try {
        const { data: sessionData } = await Promise.race([
          getSession(),
          new Promise<never>((_, reject) => {
            setTimeout(() => reject(new Error('SESSION_LOOKUP_TIMEOUT')), SESSION_LOOKUP_TIMEOUT_MS)
          }),
        ]).catch(() => ({ data: { session: null }, error: null }))

        const localSession = sessionData.session

        // Offline: on garde la session locale active, sans la considérer comme invalide.
        if (!localSession || isOfflineMode()) {
          return { data: { user: localSession?.user ?? null }, error: null }
        }

        const result = await Promise.race([
          supabase.auth.getUser(),
          new Promise<never>((_, reject) => {
            setTimeout(() => reject(new Error('AUTH_LOOKUP_TIMEOUT')), AUTH_LOOKUP_TIMEOUT_MS)
          }),
        ])
        if (result.data?.user || !result.error) return result

        if (localSession?.user) {
          return { data: { user: localSession.user }, error: null }
        }

        return result
      } catch (error) {
        try {
          const { data: sessionData } = await getSession()
          if (sessionData.session?.user) {
            return { data: { user: sessionData.session.user }, error: null }
          }
        } catch {
          // Les deux vérifications sont indisponibles: conserver l'état local inchangé.
        }

        return { data: { user: null }, error }
      }
    })().finally(() => {
      supabaseUserPromise = null
    })
  }
  return supabaseUserPromise
}