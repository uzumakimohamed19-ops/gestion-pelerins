'use client'

import { useEffect, useMemo, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { supabase, getSession, isOfflineMode } from '@/lib/supabase'
import { Lock } from 'lucide-react'

// Timeout de sécurité pour éviter de bloquer l'écran sur "Vérification..." si Supabase ne répond pas
function withTimeout<T>(promise: Promise<T>, ms = 6000): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) => setTimeout(() => reject(new Error('Timeout session')), ms)),
  ])
}

export default function AuthGuard({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const [ready, setReady] = useState(false)
  const [authenticated, setAuthenticated] = useState(false)

  // 🌓 Détection du thème sombre pour l'écran de chargement
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

  // 1. Souscription unique à la session Supabase
  useEffect(() => {
    let mounted = true

    const applySession = (hasSession: boolean) => {
      if (!mounted) return
      setAuthenticated(hasSession)
      setReady(true)
    }

    // Récupération initiale avec timeout anti-blocage
    withTimeout(getSession())
      .then(({ data: { session } }) => {
        applySession(Boolean(session?.user) || (isOfflineMode() && Boolean(session)))
      })
      .catch(() => {
        applySession(false)
      })

    // Écouteur de changement d'état d'authentification
    const { data: authListener } = supabase.auth.onAuthStateChange((event, session) => {
      if (!mounted) return
      const hasSession = Boolean(session?.user)

      if (event === 'SIGNED_OUT') {
        setAuthenticated(false)
        setReady(true)
        if (!isPublicRoute) {
          router.replace('/login')
        }
        return
      }

      setAuthenticated(hasSession)
      setReady(true)
    })

    return () => {
      mounted = false
      authListener.subscription.unsubscribe()
    }
  }, [isPublicRoute, router])

  // 2. Redirection vers /login si non authentifié sur une route privée
  useEffect(() => {
    if (!ready || isPublicRoute) return
    if (!authenticated) {
      router.replace('/login')
    }
  }, [authenticated, isPublicRoute, ready, router])

  // Si on est sur une route publique (ex: /login), affichage direct sans bloquer
  if (isPublicRoute) return <>{children}</>

  // Écran d'attente animé adapté au Dark Mode
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