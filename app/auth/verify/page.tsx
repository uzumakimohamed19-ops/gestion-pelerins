'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { usePowerSync } from '@powersync/react'
import { getPersistedSupabaseUserId, getSession } from '@/lib/supabase'
import AppSplashScreen from '@/components/AppSplashScreen'

export default function AuthVerifyPage() {
  const router = useRouter()
  const db = usePowerSync()

  useEffect(() => {
    let isMounted = true

    async function checkUserAndProfiles() {
      try {
        const currentUserId =
          getPersistedSupabaseUserId() || (await getSession()).data?.session?.user?.id || null

        if (!currentUserId) {
          if (isMounted) router.replace('/login')
          return
        }

        let count = 0
        try {
          const result = await db.getAll<{ count: number }>(
            'SELECT COUNT(*) as count FROM account_profiles WHERE user_id = ?',
            [currentUserId]
          )
          count = result[0]?.count ?? 0
        } catch {
          count = 0
        }

        if (!isMounted) return

        if (count > 0) {
          router.replace('/profile-selection')
        } else {
          router.replace('/profile-selection?mode=create')
        }
      } catch (err) {
        console.error('[AuthVerify] Erreur aiguillage:', err)
        if (isMounted) router.replace('/profile-selection')
      }
    }

    void checkUserAndProfiles()

    return () => {
      isMounted = false
    }
  }, [db, router])

  return <AppSplashScreen />
}
