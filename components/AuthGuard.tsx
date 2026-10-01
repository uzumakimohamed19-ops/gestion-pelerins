'use client'

import { useEffect, useMemo, useState, useRef } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { supabase, getSession, isOfflineMode } from '@/lib/supabase'
import { Lock } from 'lucide-react'
import { useWorkProfile } from '@/lib/ProfileContext'

// Timeout court pour ne jamais bloquer l'écran si Supabase ne répond pas hors-ligne
function withTimeout<T>(promise: Promise<T>, ms = 3000): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) => setTimeout(() => reject(new Error('Timeout réseau session')), ms)),
  ])
}

// Hook sécurisé évitant les crashs si le provider s'initialise
function useSafeWorkProfile() {
  try {
    return useWorkProfile()
  } catch {
    return { currentProfile: null, loading: false }
  }
}

export default function AuthGuard({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const [ready, setReady] = useState(false)
  const [authenticated, setAuthenticated] = useState(false)
  const isRedirectingRef = useRef(false)

  // 🛡️ Récupération du profil de travail actif
  const { currentProfile, loading: profileLoading } = useSafeWorkProfile()

  // 🌓 Détection du thème sombre pour l'écran d'attente
  const [isDark, setIsDark] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('compta_theme_dark') === 'true'
    }
    return false
  })

  useEffect(() => {
    if (typeof window === 'undefined') return
    const syncTheme = () => {
      setIsDark(localStorage.getItem('compta_theme_dark') === 'true')
    }
    window.addEventListener('storage', syncTheme)
    window.addEventListener('theme-change', syncTheme)
    return () => {
      window.removeEventListener('storage', syncTheme)
      window.removeEventListener('theme-change', syncTheme)
    }
  }, [])

  const isPublicRoute = useMemo(() => {
    if (!pathname) return false
    return pathname === '/login' || pathname.startsWith('/auth')
  }, [pathname])

  // 1. Souscription et vérification de la session avec résilience 100% hors-ligne
  useEffect(() => {
    let mounted = true

    const hasLocalAuthMarker = () => {
      try {
        return (
          localStorage.getItem('auth_verified_offline_marker') === 'true' ||
          localStorage.getItem('has_created_profile_marker') === 'true' ||
          Boolean(localStorage.getItem('supabase.auth.token')) ||
          isOfflineMode()
        )
      } catch {
        return false
      }
    }

    const applySession = (hasSession: boolean) => {
      if (!mounted) return
      // Si une session est trouvée OU si l'appareil a déjà été connecté une première fois (Offline Mode)
      const isAuthenticated = hasSession || hasLocalAuthMarker()
      
      if (hasSession && typeof window !== 'undefined') {
        localStorage.setItem('auth_verified_offline_marker', 'true')
      }

      setAuthenticated(isAuthenticated)
      setReady(true)
    }

    // Tentative de récupération session Supabase
    withTimeout(getSession())
      .then(({ data: { session } }) => {
        applySession(Boolean(session?.user))
      })
      .catch(() => {
        // En cas d'erreur de réseau, timeout ou absence totale d'Internet :
        // ON NE DÉCONNECTE PAS, on valide via le cache local
        applySession(hasLocalAuthMarker())
      })

    const { data: authListener } = supabase.auth.onAuthStateChange((event, session) => {
      if (!mounted) return

      // Déconnexion manuelle explicite uniquement
      if (event === 'SIGNED_OUT') {
        try {
          localStorage.removeItem('auth_verified_offline_marker')
        } catch {}
        setAuthenticated(false)
        setReady(true)
        if (!isPublicRoute && !isRedirectingRef.current) {
          isRedirectingRef.current = true
          router.replace('/login')
        }
        return
      }

      const hasSession = Boolean(session?.user)
      if (hasSession && typeof window !== 'undefined') {
        localStorage.setItem('auth_verified_offline_marker', 'true')
      }

      setAuthenticated(hasSession || hasLocalAuthMarker())
      setReady(true)
    })

    return () => {
      mounted = false
      authListener.subscription.unsubscribe()
    }
  }, [isPublicRoute, router])

  // 2. Redirection sécurisée si non authentifié sur route protégée
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

  // 3. 🛡️ CONTRÔLE DES ACCÈS DU PROFIL INTERMÉDIAIRE
  useEffect(() => {
    if (!ready || !authenticated || !pathname || profileLoading) return

    const profileType = currentProfile?.profile_type as string | undefined

    if (profileType === 'intermediaire') {
      const isComptaAgence = pathname.startsWith('/agence/compta')
      const isComptaHajj = pathname.startsWith('/hajj/comptabilite')

      // A. Autorisé mais avec restriction des fonctionnalités
      if (isComptaAgence || isComptaHajj) {
        if (localStorage.getItem('compta_access_level') !== 'restricted') {
          localStorage.setItem('compta_access_level', 'restricted')
        }
      }

      // B. Pages strictement bloquées pour l'intermédiaire
      const isBlockedJournal = pathname.startsWith('/agence/journal')
      const isBlockedHajjEtatGeneral = 
        pathname.includes('/etat-general') || 
        pathname.startsWith('/hajj/etat-general') ||
        pathname.startsWith('/agence/hajj/etat-general')

      if (isBlockedJournal || isBlockedHajjEtatGeneral) {
        router.replace('/agence/dashboard')
      }
    } else if (profileType === 'direction') {
      if (localStorage.getItem('compta_access_level') !== 'full') {
        localStorage.setItem('compta_access_level', 'full')
      }
    }
  }, [currentProfile, pathname, ready, authenticated, profileLoading, router])

  // Route publique : rendu immédiat
  if (isPublicRoute) return <>{children}</>

  // Écran d'attente animé
  if (!ready || !authenticated) {
    return (
      <main className={`fixed inset-0 z-50 flex flex-col items-center justify-center p-6 select-none transition-colors duration-150 ${
        isDark ? 'bg-[#000000] text-[#F5F5F7]' : 'bg-[#F4F6F8] text-slate-800'
      }`}>
        <div className="relative flex items-center justify-center">
          <div className="absolute w-44 h-44 sm:w-56 sm:h-56 rounded-full bg-blue-500/15 blur-2xl animate-pulse" />
          <div className={`relative w-36 h-36 sm:w-44 sm:h-44 rounded-full border-2 border-dashed animate-[spin_8s_linear_infinite] flex items-center justify-center ${
            isDark ? 'border-slate-800' : 'border-blue-200'
          }`}>
            <div className="absolute -top-2 left-1/2 -translate-x-1/2 w-3.5 h-3.5 rounded-full bg-blue-600 shadow-lg shadow-blue-600/50" />
            <div className="absolute top-1/2 -right-1.5 -translate-y-1/2 w-2.5 h-2.5 rounded-full bg-blue-400" />
            <div className="absolute -bottom-1.5 left-1/3 w-3 h-3 rounded-full bg-blue-500" />
            <div className="absolute top-1/3 -left-1.5 w-2 h-2 rounded-full bg-blue-300" />
          </div>
          <div className="absolute w-28 h-28 sm:w-32 sm:h-32 rounded-full border-2 border-t-blue-600 border-r-blue-400 border-b-transparent border-l-transparent animate-[spin_1.5s_linear_infinite]" />
          <div className={`relative w-16 h-16 sm:w-20 sm:h-20 rounded-full shadow-xl flex items-center justify-center border ${
            isDark ? 'bg-[#1C1C1E] border-[#2C2C2E] shadow-black/50' : 'bg-white border-blue-50 shadow-blue-900/10'
          }`}>
            <Lock className="text-blue-600 animate-pulse" size={24} />
          </div>
        </div>
        <p className={`mt-8 text-xs font-black uppercase tracking-widest ${
          isDark ? 'text-[#8E8E93]' : 'text-slate-400'
        }`}>
          Vérification de session...
        </p>
      </main>
    )
  }

  return <>{children}</>
}