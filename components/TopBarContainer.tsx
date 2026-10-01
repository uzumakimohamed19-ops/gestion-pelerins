'use client'

import { usePathname } from 'next/navigation'
import { useEffect, useMemo } from 'react'
import { Capacitor } from '@capacitor/core'
import { StatusBar, Style } from '@capacitor/status-bar'

export default function TopBarContainer() {
  const pathname = usePathname()

  // Détection de la couleur du header selon la route
  const { topBarBg, isDarkBg } = useMemo(() => {
    if (!pathname) {
      return { topBarBg: '#FFFFFF', isDarkBg: false }
    }

    // 1. Dashboard Hajj -> Fond bleu (#2563eb) : icônes blanches
    if (pathname === '/hajj' || pathname === '/hajj/dashboard') {
      return { topBarBg: '#2563eb', isDarkBg: true }
    }

    // 2. Dashboard Agence -> Fond graphite (#2C2C2E) : icônes blanches
    if (pathname === '/agence' || pathname === '/agence/dashboard') {
      return { topBarBg: '#1e293b', isDarkBg: true }
    }

    // 3. Formulaires et écrans clairs -> Fond blanc/ivoire : icônes sombres/noires
    if (pathname.includes('/nouvelle-operation') || pathname.includes('/configuration')) {
      return { topBarBg: '#F4F6F8', isDarkBg: false }
    }

    // 4. Par défaut : Blanc pur, icônes sombres nettes
    return { topBarBg: '#FFFFFF', isDarkBg: false }
  }, [pathname])

  useEffect(() => {
    if (typeof window === 'undefined') return

    // --- Web & PWA (Android Chrome / Safari) ---
    const existingMetas = document.querySelectorAll('meta[name="theme-color"]')
    if (existingMetas.length > 0) {
      existingMetas.forEach((meta) => meta.setAttribute('content', topBarBg))
    } else {
      const meta = document.createElement('meta')
      meta.name = 'theme-color'
      meta.content = topBarBg
      document.head.appendChild(meta)
    }

    let appleMeta = document.querySelector('meta[name="apple-mobile-web-app-status-bar-style"]')
    if (!appleMeta) {
      appleMeta = document.createElement('meta')
      appleMeta.setAttribute('name', 'apple-mobile-web-app-status-bar-style')
      document.head.appendChild(appleMeta)
    }
    // "black-translucent" sur fond coloré (icônes blanches), "default" sur fond blanc (icônes noires)
    appleMeta.setAttribute('content', isDarkBg ? 'black-translucent' : 'default')

    // --- Application Native Capacitor (iOS & Android) ---
    if (Capacitor.isNativePlatform()) {
      StatusBar.setBackgroundColor({ color: topBarBg }).catch(() => {})

      // Règle Capacitor :
      // - isDarkBg = true (fond sombre/bleu)  => Style.Dark  (icônes blanches)
      // - isDarkBg = false (fond clair/blanc) => Style.Light (icônes noires bien visibles)
      StatusBar.setStyle({
        style: isDarkBg ? Style.Dark : Style.Light,
      }).catch(() => {})
    }
  }, [topBarBg, isDarkBg])

  // Rend le fond de l'encoche transparent pour épouser directement le header de la page
  return (
    <div
      className="fixed top-0 left-0 right-0 z-[99999] pointer-events-none transition-colors duration-150"
      style={{
        height: 'env(safe-area-inset-top, 0px)',
        backgroundColor: topBarBg,
      }}
      aria-hidden="true"
    />
  )
}