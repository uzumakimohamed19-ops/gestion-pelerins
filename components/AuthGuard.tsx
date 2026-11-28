'use client'

import { useEffect, useMemo, useState, useRef } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import {
  supabase,
  getSession,
  hasPersistedSupabaseSession,
  isOfflineMode,
} from '@/lib/supabase'
import { clearAllLocalSessionArtifacts } from '@/lib/sessionCleanup'
import AppSplashScreen from '@/components/AppSplashScreen'

function withTimeout<T>(promise: Promise<T>, ms = 3000): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('Timeout réseau session')), ms)
    ),
  ])
}

export default function AuthGuard({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const [ready, setReady] = useState(false)
  const [authenticated, setAuthenticated] = useState(false)
  const [isDark, setIsDark] = useState(false)

  const isRedirectingRef = useRef(false)

  const isPublicRoute = useMemo(() => {
    if (!pathname) return false
    return pathname === '/login' || pathname.startsWith('/auth')
  }, [pathname])

  const isPublicRouteRef = useRef(isPublicRoute)
  isPublicRouteRef.current = isPublicRoute

  // Synchronisation du thème après hydratation SSR (zéro hydration mismatch)
  useEffect(() => {
    const syncTheme = () => {
      try {
        setIsDark(localStorage.getItem('compta_theme_dark') === 'true')
      } catch {}
    }
    syncTheme()
    window.addEventListener('storage', syncTheme)
    window.addEventListener('theme-change', syncTheme)
    return () => {
      window.removeEventListener('storage', syncTheme)
      window.removeEventListener('theme-change', syncTheme)
    }
  }, [])

  // 1. Abonnement unique (ne se réexécute plus à chaque changement de route)
  useEffect(() => {
    let mounted = true

    // Lecture instantanée (0 ms) d'un VRAI jeton Supabase persisté — jamais de bypass aveugle offline
    const hasRealStoredToken = hasPersistedSupabaseSession()
    if (hasRealStoredToken) {
      setAuthenticated(true)
      setReady(true)
    }

    withTimeout(getSession())
      .then(({ data: { session } }) => {
        if (!mounted) return
        const hasSession = Boolean(session?.user)
        // Hors-ligne uniquement : accepter un vrai jeton Supabase persisté
        const isAuthed = hasSession || (isOfflineMode() && hasPersistedSupabaseSession())
        setAuthenticated(isAuthed)
        setReady(true)
      })
      .catch(() => {
        if (!mounted) return
        // Timeout réseau : uniquement si un vrai jeton Supabase existe dans le stockage local
        setAuthenticated(hasPersistedSupabaseSession())
        setReady(true)
      })

    const { data: authListener } = supabase.auth.onAuthStateChange((event, session) => {
      if (!mounted) return

      if (event === 'SIGNED_OUT') {
        clearAllLocalSessionArtifacts()
        setAuthenticated(false)
        setReady(true)
        if (!isPublicRouteRef.current && !isRedirectingRef.current) {
          isRedirectingRef.current = true
          router.replace('/login')
        }
        return
      }

      const hasSession = Boolean(session?.user)
      setAuthenticated(hasSession || (isOfflineMode() && hasPersistedSupabaseSession()))
      setReady(true)
    })

    // Déconnexion synchronisée entre onglets si le jeton Supabase est supprimé ailleurs
    const onStorageChange = (e: StorageEvent) => {
      if (!mounted || !e.key) return
      if (e.key.startsWith('sb-') && e.key.endsWith('-auth-token') && !e.newValue) {
        setAuthenticated(false)
        if (!isPublicRouteRef.current && !isRedirectingRef.current) {
          isRedirectingRef.current = true
          router.replace('/login')
        }
      }
    }
    window.addEventListener('storage', onStorageChange)

    return () => {
      mounted = false
      authListener.subscription.unsubscribe()
      window.removeEventListener('storage', onStorageChange)
    }
  }, [router])

  // 2. Redirection propre vers /login si non authentifié sur une route protégée
  useEffect(() => {
    if (!ready || isPublicRoute) {
      isRedirectingRef.current = false
      return
    }

    if (!authenticated && !isRedirectingRef.current) {
      isRedirectingRef.current = true
      router.replace('/login')
    }
  }, [authenticated, isPublicRoute, ready, router])

  // Route publique : rendu immédiat sans aucun écran d'attente
  if (isPublicRoute) return <>{children}</>

  if (!ready || !authenticated) {
    return <AppSplashScreen darkOverride={isDark} />
  }

  return <>{children}</>
}
