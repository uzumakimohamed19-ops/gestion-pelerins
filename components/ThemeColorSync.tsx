'use client'

import { useEffect } from 'react'
import { usePathname } from 'next/navigation'
import { Capacitor } from '@capacitor/core'
import { StatusBar, Style } from '@capacitor/status-bar'

const HAJJ_THEME = '#2563eb'
const AGENCE_THEME = '#1e293b'
const DEFAULT_LIGHT = '#FFFFFF'

export default function ThemeColorSync() {
  const pathname = usePathname()

  useEffect(() => {
    if (typeof window === 'undefined') return

    const syncStatus = async () => {
      const isHajj = pathname === '/hajj' || pathname === '/hajj/dashboard'
      const isAgence = pathname === '/agence' || pathname === '/agence/dashboard'

      let color = DEFAULT_LIGHT
      let isDarkBg = false

      if (isHajj) {
        color = HAJJ_THEME
        isDarkBg = true
      } else if (isAgence) {
        color = AGENCE_THEME
        isDarkBg = true
      }

      document.documentElement.style.backgroundColor = color
      document.body.style.backgroundColor = color

      if (Capacitor.isNativePlatform()) {
        try {
          await StatusBar.setBackgroundColor({ color })
          // Style.Light force les icônes noires sur fond clair
          await StatusBar.setStyle({ style: isDarkBg ? Style.Dark : Style.Light })
        } catch {}
      }
    }

    syncStatus()
  }, [pathname])

  return null
}