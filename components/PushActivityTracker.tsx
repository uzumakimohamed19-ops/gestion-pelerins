'use client'

import { useEffect } from 'react'
import { pingPushActivityIfNeeded } from '@/lib/pushClient'

/**
 * Met à jour discrètement `last_seen_at` (au maximum toutes les 30 min)
 * afin que le serveur détecte les périodes d'inactivité ("Ça fait X jours...").
 */
export default function PushActivityTracker() {
  useEffect(() => {
    void pingPushActivityIfNeeded()

    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        void pingPushActivityIfNeeded()
      }
    }

    document.addEventListener('visibilitychange', handleVisibility)
    return () => document.removeEventListener('visibilitychange', handleVisibility)
  }, [])

  return null
}
