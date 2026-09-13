'use client'

import { useEffect, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

export default function AuthGuard({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const [ready, setReady] = useState(false)
  const [authenticated, setAuthenticated] = useState(false)

  useEffect(() => {
    let mounted = true

    const checkSession = async () => {
      const { data } = await supabase.auth.getSession()
      if (!mounted) return

      const hasSession = Boolean(data.session)
      setAuthenticated(hasSession)
      setReady(true)

      if (!hasSession && pathname !== '/login') {
        router.replace('/login')
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
