'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { usePowerSync } from '@powersync/react'
import { getPersistedSupabaseUserId, getSession } from '@/lib/supabase'
import { Lock } from 'lucide-react'

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

  return (
    <main className="fixed inset-0 z-50 bg-[#F4F6F8] flex flex-col items-center justify-center p-6 select-none">
      <div className="relative flex items-center justify-center">
        <div className="absolute w-44 h-44 sm:w-56 sm:h-56 rounded-full bg-blue-400/10 blur-2xl animate-pulse" />
        <div className="relative w-36 h-36 sm:w-44 sm:h-44 rounded-full border-2 border-dashed border-blue-200/80 animate-[spin_10s_linear_infinite] flex items-center justify-center">
          <div className="absolute -top-2 left-1/2 -translate-x-1/2 w-3.5 h-3.5 rounded-full bg-blue-600 shadow-md shadow-blue-500/50" />
          <div className="absolute top-1/2 -right-1.5 -translate-y-1/2 w-2 h-2 rounded-full bg-blue-400" />
          <div className="absolute -bottom-1.5 left-1/3 w-2.5 h-2.5 rounded-full bg-blue-500/70" />
          <div className="absolute top-1/3 -left-1.5 w-2 h-2 rounded-full bg-blue-300" />
        </div>
        <div className="absolute w-28 h-28 sm:w-32 sm:h-32 rounded-full border-2 border-t-blue-600 border-r-blue-400 border-b-transparent border-l-transparent animate-[spin_1.8s_linear_infinite]" />
        <div className="relative w-16 h-16 sm:w-20 sm:h-20 rounded-full bg-white shadow-xl shadow-blue-900/10 border border-blue-50 flex items-center justify-center">
          <Lock className="text-blue-600 animate-pulse" size={24} />
        </div>
      </div>
      <p className="mt-8 text-xs font-black uppercase tracking-widest text-slate-500">
        Ouverture de votre espace...
      </p>
    </main>
  )
}
