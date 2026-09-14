'use client'

import { useEffect, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { supabase, getUser } from '@/lib/supabase'

export default function AuthGuard({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const [ready, setReady] = useState(false)
  const [authenticated, setAuthenticated] = useState(false)

  useEffect(() => {
    let mounted = true

    const checkSession = async () => {
      try {
        const result = await Promise.race([
          getUser(),
          new Promise<null>((resolve) => setTimeout(() => resolve(null), 5000)),
        ])
        if (!mounted) return

        const hasSession = result === null
          ? !navigator.onLine
          : Boolean(result.data?.user)
        setAuthenticated(hasSession)
        setReady(true)

        if (!hasSession && pathname !== '/login' && navigator.onLine) {
          router.replace('/login')
        }
      } catch {
        if (!mounted) return
        // Une panne réseau ne doit jamais laisser le garde en chargement infini.
        setReady(true)
      }
    }

    void checkSession()

    const { data: authListener } = supabase.auth.onAuthStateChange((event, session) => {
      if (!mounted) return

      const hasSession = Boolean(session)
      setAuthenticated(hasSession)
      setReady(true)

      if (event === 'SIGNED_OUT' && pathname !== '/login') {
        router.replace('/login')
      }
    })

    return () => {
      mounted = false
      authListener.subscription.unsubscribe()
    }
  }, [pathname, router])

  if (pathname === '/login') return <>{children}</>

  if (!ready || !authenticated) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 text-sm font-bold text-slate-500">
        Vérification de la session...
      </div>
    )
  }

  return <>{children}</>
}
