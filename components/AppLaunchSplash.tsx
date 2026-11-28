'use client'

import { useEffect, useState } from 'react'
import AppSplashScreen from '@/components/AppSplashScreen'

const SPLASH_SESSION_KEY = 'agencepro_launch_splash_done'

/**
 * Séquence d'ouverture signature (style Disney+ / Netflix) :
 * jouée UNE SEULE FOIS au lancement à froid (~2,5 s pour profiter de la chorégraphie
 * complète du logo et des bulles Pèlerin · Avion · Agence, puis fondu de sortie fluide).
 */
export default function AppLaunchSplash() {
  const [visible, setVisible] = useState(false)
  const [exiting, setExiting] = useState(false)

  useEffect(() => {
    try {
      if (sessionStorage.getItem(SPLASH_SESSION_KEY) === '1') {
        return
      }
      sessionStorage.setItem(SPLASH_SESSION_KEY, '1')
    } catch {}

    setVisible(true)

    const startExitTimer = window.setTimeout(() => {
      setExiting(true)
    }, 2450)

    const unmountTimer = window.setTimeout(() => {
      setVisible(false)
    }, 2880)

    return () => {
      window.clearTimeout(startExitTimer)
      window.clearTimeout(unmountTimer)
    }
  }, [])

  if (!visible) return null

  return <AppSplashScreen exiting={exiting} />
}
