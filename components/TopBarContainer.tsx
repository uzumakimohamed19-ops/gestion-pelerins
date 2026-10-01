'use client'

import { usePathname } from 'next/navigation'
import { useEffect, useMemo } from 'react'
import { Capacitor } from '@capacitor/core'
import { StatusBar, Style } from '@capacitor/status-bar'

export default function TopBarContainer() {
  const pathname = usePathname()

  // Configuration stricte selon la page active
  const { topBarBg, isDarkBg } = useMemo(() => {
    if (!pathname) {
      return { topBarBg: '#FFFFFF', isDarkBg: false }
    }

    // 1. Dashboard Hajj -> Bleu royal #2563eb, icônes blanches
    if (pathname === '/hajj' || pathname === '/hajj/dashboard') {
      return { topBarBg: '#2563eb', isDarkBg: true }
    }

    // 2. Dashboard Agence -> Graphite #1e293b, icônes blanches
    if (pathname === '/agence' || pathname === '/agence/dashboard') {
      return { topBarBg: '#1e293b', isDarkBg: true }
    }

    // 3. Toutes les autres pages (comptabilité, listes, configs, etc.)
    // -> Fond blanc naturel avec icônes sombres bien visibles
    return { topBarBg: '#FFFFFF', isDarkBg: false }
  }, [pathname])

  useEffect(() => {
    if (typeof window === 'undefined') return

    // 0. Neutralisation absolue du mode sombre système sur la WebView / document
    document.documentElement.style.colorScheme = 'light'
    document.body.style.colorScheme = 'light'

    // A. TEINTE DU DOCUMENT (PWA iOS Safari & Android Chrome)
    document.documentElement.style.backgroundColor = topBarBg
    document.body.style.backgroundColor = topBarBg

    // B. BALISES META WEB & PWA (Suppression des déclinaisons media dark)
    const existingThemedMetas = document.querySelectorAll('meta[name="theme-color"]')
    existingThemedMetas.forEach((meta) => meta.remove())

    const newMeta = document.createElement('meta')
    newMeta.name = 'theme-color'
    newMeta.content = topBarBg
    document.head.appendChild(newMeta)

    let appleMeta = document.querySelector('meta[name="apple-mobile-web-app-status-bar-style"]')
    if (!appleMeta) {
      appleMeta = document.createElement('meta')
      appleMeta.setAttribute('name', 'apple-mobile-web-app-status-bar-style')
      document.head.appendChild(appleMeta)
    }
    appleMeta.setAttribute('content', isDarkBg ? 'black-translucent' : 'default')

    // C. CONTRÔLE CAPACITOR NATIF (Android & iOS)
    if (Capacitor.isNativePlatform()) {
      const applyNativeStatusBar = async () => {
        try {
          // 1. Assurer que la barre système n'écrase pas le contenu
          await StatusBar.setOverlaysWebView({ overlay: false })
          // 2. Définir la couleur matérielle exacte (indifférente au dark mode du téléphone)
          await StatusBar.setBackgroundColor({ color: topBarBg })
          // 3. Style des icônes :
          // Style.Dark  => Icônes blanches (pour fond #2563eb et #1e293b)
          // Style.Light => Icônes noires / sombres (pour fond #FFFFFF)
          await StatusBar.setStyle({
            style: isDarkBg ? Style.Dark : Style.Light,
          })
        } catch (e) {
          console.warn('StatusBar native error:', e)
        }
      }

      applyNativeStatusBar()
    }
  }, [topBarBg, isDarkBg])

  return null
}