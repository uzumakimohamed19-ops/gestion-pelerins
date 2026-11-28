'use client'

import { useEffect, useState } from 'react'
import AppSplashScreen from '@/components/AppSplashScreen'

const SPLASH_SESSION_KEY = 'agencepro_launch_splash_done'

/**
 * Séquence d'ouverture signature (style ouverture cinéma Disney+ / Netflix) :
 * - Rendue dès le tout premier frame (SSR) pour éliminer tout flash intermédiaire.
 * - Masquée instantanément en CSS (<head>) si la session a déjà joué le splash.
 * - Durée généreuse (~3,85 s + fondu fluide de 550 ms) pour profiter de la chorégraphie complète.
 */
export default function AppLaunchSplash() {
  const [visible, setVisible] = useState(true)
  const [exiting, setExiting] = useState(false)

  useEffect(() => {
    try {
      if (sessionStorage.getItem(SPLASH_SESSION_KEY) === '1') {
        document.documentElement.setAttribute('data-ap-splash-done', '1')
        setVisible(false)
        return
      }
      sessionStorage.setItem(SPLASH_SESSION_KEY, '1')
    } catch {}

    const startExitTimer = window.setTimeout(() => {
      setExiting(true)
    }, 3850)

    const unmountTimer = window.setTimeout(() => {
      try {
        document.documentElement.setAttribute('data-ap-splash-done', '1')
      } catch {}
      setVisible(false)
    }, 4400)

    return () => {
      window.clearTimeout(startExitTimer)
      window.clearTimeout(unmountTimer)
    }
  }, [])

  if (!visible) return null

  return <AppSplashScreen id="ap-launch-splash" exiting={exiting} />
}
