'use client'

import { useEffect, useState, useMemo } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { supabase, getSession, getUser } from '@/lib/supabase'
import { Lock } from 'lucide-react'

export default function AuthGuard({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const [ready, setReady] = useState(false)
  const [authenticated, setAuthenticated] = useState(false)

  // Routes publiques exemptées de vérification
  const isPublicRoute = useMemo(() => {
    if (!pathname) return false
    return pathname === '/login' || pathname.startsWith('/auth')
  }, [pathname])

  useEffect(() => {
    let mounted = true

    const checkSession = async () => {
      try {
        const sessionResult = await Promise.race([
          getSession(),
          new Promise<null>((resolve) => setTimeout(() => resolve(null), 3000)),
        ])

        if (!mounted) return

        if (sessionResult?.data.session?.user) {
          setAuthenticated(true)
          setReady(true)

          // 2. Validation asynchrone en arrière-plan avec timeout strict de 3s
          const userCheck = await Promise.race([getUser(), new Promise<null>((resolve) => setTimeout(() => resolve(null), 3000))])

          // Si le token a été révoqué côté serveur
          if (userCheck && 'error' in userCheck && userCheck.error) {
            if (mounted) {
              // Une erreur réseau ne doit pas invalider la session locale.
              setAuthenticated(true)
            }
          }
        } else {
          // Aucun token valide trouvé
          setAuthenticated(false)
          setReady(true)
          if (!isPublicRoute && navigator.onLine) {
            router.replace('/login')
          }
        }
      } catch (err) {
        console.error('[AuthGuard] Erreur vérification session:', err)
        if (!mounted) return
        setAuthenticated(!navigator.onLine)
        setReady(true)
        if (!isPublicRoute && navigator.onLine) {
          router.replace('/login')
        }
      }
    }

    void checkSession()

    // Écouteur en temps réel des changements d'état de session
    const { data: authListener } = supabase.auth.onAuthStateChange((event, session) => {
      if (!mounted) return

      const hasSession = Boolean(session?.user)
      setAuthenticated(hasSession)
      setReady(true)

      if (event === 'SIGNED_OUT' && !isPublicRoute) {
        router.replace('/login')
      }
    })

    return () => {
      mounted = false
      authListener.subscription.unsubscribe()
    }
  }, [isPublicRoute, pathname, router])

  // Si on est sur la page de connexion ou une route publique, on affiche directement
  if (isPublicRoute) return <>{children}</>

  // ANIMATION ORBITALE BLANC & BLEU PENDANT LA VÉRIFICATION (Zéro écran figé)
  if (!ready || !authenticated) {
    return (
      <main className="fixed inset-0 z-50 bg-[#F4F6F8] flex flex-col items-center justify-center p-6 select-none">
        <div className="relative flex items-center justify-center">
          {/* Halo d'arrière-plan */}
          <div className="absolute w-44 h-44 sm:w-56 sm:h-56 rounded-full bg-blue-500/15 blur-2xl animate-pulse" />

          {/* Cercle orbital avec bulles */}
          <div className="relative w-36 h-36 sm:w-44 sm:h-44 rounded-full border-2 border-dashed border-blue-200 animate-[spin_8s_linear_infinite] flex items-center justify-center">
            <div className="absolute -top-2 left-1/2 -translate-x-1/2 w-3.5 h-3.5 rounded-full bg-blue-600 shadow-lg shadow-blue-600/50" />
            <div className="absolute top-1/2 -right-1.5 -translate-y-1/2 w-2.5 h-2.5 rounded-full bg-blue-400" />
            <div className="absolute -bottom-1.5 left-1/3 w-3 h-3 rounded-full bg-blue-500" />
            <div className="absolute top-1/3 -left-1.5 w-2 h-2 rounded-full bg-blue-300" />
          </div>

          <div className="absolute w-28 h-28 sm:w-32 sm:h-32 rounded-full border-2 border-t-blue-600 border-r-blue-400 border-b-transparent border-l-transparent animate-[spin_1.5s_linear_infinite]" />
          <div className="absolute w-20 h-20 sm:w-24 sm:h-24 rounded-full border border-blue-400/40 animate-ping opacity-60" />

          <div className="relative w-16 h-16 sm:w-20 sm:h-20 rounded-full bg-white shadow-xl shadow-blue-900/10 border border-blue-50 flex items-center justify-center">
            <Lock className="text-blue-600 animate-pulse" size={24} />
            <div className="absolute top-1.5 right-2 w-1.5 h-1.5 rounded-full bg-blue-400 animate-ping" />
          </div>
        </div>

        <p className="mt-8 text-xs font-black uppercase tracking-widest text-slate-500">
          Vérification de session...
        </p>

        <div className="mt-3 flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-blue-600 animate-bounce [animation-delay:-0.3s]" />
          <span className="w-2 h-2 rounded-full bg-blue-500 animate-bounce [animation-delay:-0.15s]" />
          <span className="w-2 h-2 rounded-full bg-blue-400 animate-bounce" />
        </div>
      </main>
    )
  }

  return <>{children}</>
}