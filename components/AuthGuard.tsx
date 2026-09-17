'use client'

import { useEffect, useMemo, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { supabase, getSession, isOfflineMode } from '@/lib/supabase'
import { Lock } from 'lucide-react'

export default function AuthGuard({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const [ready, setReady] = useState(false)
  const [authenticated, setAuthenticated] = useState(false)

  const isPublicRoute = useMemo(() => {
    if (!pathname) return false
    return pathname === '/login' || pathname.startsWith('/auth')
  }, [pathname])

  // Une seule souscription globale. La recréer à chaque changement de route
  // provoquait des courses entre plusieurs vérifications de session.
  useEffect(() => {
    let mounted = true

    const applySession = (hasSession: boolean) => {
      if (!mounted) return
      setAuthenticated(hasSession)
      setReady(true)
    }

    void getSession().then(({ data: { session } }) => {
      // En mode hors ligne, Supabase peut encore fournir la session persistée.
      // On ne transforme jamais un timeout réseau en session authentifiée.
      applySession(Boolean(session?.user) || (isOfflineMode() && Boolean(session)))
    }).catch(() => {
      applySession(false)
    })

    const { data: authListener } = supabase.auth.onAuthStateChange((event, session) => {
      if (!mounted) return
      const hasSession = Boolean(session?.user)
      setAuthenticated(hasSession)
      setReady(true)

      if (event === 'SIGNED_OUT') {
        setAuthenticated(false)
      }
    })

    return () => {
      mounted = false
      authListener.subscription.unsubscribe()
    }
  }, [])

  // La redirection dépend de la route, mais pas de la création du listener.
  useEffect(() => {
    if (!ready || isPublicRoute) return
    if (!authenticated) router.replace('/login')
  }, [authenticated, isPublicRoute, pathname, ready, router])

  if (isPublicRoute) return <>{children}</>

  if (!ready || !authenticated) {
    return (
      <main className="fixed inset-0 z-50 bg-[#F4F6F8] flex flex-col items-center justify-center p-6 select-none">
        <div className="relative flex items-center justify-center">
          <div className="absolute w-44 h-44 sm:w-56 sm:h-56 rounded-full bg-blue-500/15 blur-2xl animate-pulse" />
          <div className="relative w-36 h-36 sm:w-44 sm:h-44 rounded-full border-2 border-dashed border-blue-200 animate-[spin_8s_linear_infinite] flex items-center justify-center">
            <div className="absolute -top-2 left-1/2 -translate-x-1/2 w-3.5 h-3.5 rounded-full bg-blue-600 shadow-lg shadow-blue-600/50" />
            <div className="absolute top-1/2 -right-1.5 -translate-y-1/2 w-2.5 h-2.5 rounded-full bg-blue-400" />
            <div className="absolute -bottom-1.5 left-1/3 w-3 h-3 rounded-full bg-blue-500" />
            <div className="absolute top-1/3 -left-1.5 w-2 h-2 rounded-full bg-blue-300" />
          </div>
          <div className="absolute w-28 h-28 sm:w-32 sm:h-32 rounded-full border-2 border-t-blue-600 border-r-blue-400 border-b-transparent border-l-transparent animate-[spin_1.5s_linear_infinite]" />
          <div className="relative w-16 h-16 sm:w-20 sm:h-20 rounded-full bg-white shadow-xl shadow-blue-900/10 border border-blue-50 flex items-center justify-center">
            <Lock className="text-blue-600 animate-pulse" size={24} />
          </div>
        </div>
        <p className="mt-8 text-xs font-black uppercase tracking-widest text-slate-500">Vérification de session...</p>
      </main>
    )
  }

  return <>{children}</>
}
