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
    // -> Fond blanc naturel avec icônes impérativement sombres/noires
    return { topBarBg: '#FFFFFF', isDarkBg: false }
  }, [pathname])

  useEffect(() => {
    if (typeof window === 'undefined') return

    // 0. Neutralisation stricte du color-scheme système (empêche les icônes blanches fantômes)
    document.documentElement.style.setProperty('color-scheme', 'light', 'important')
    document.body.style.setProperty('color-scheme', 'light', 'important')

    let metaColorScheme = document.querySelector('meta[name="color-scheme"]')
    if (!metaColorScheme) {
      metaColorScheme = document.createElement('meta')
      metaColorScheme.setAttribute('name', 'color-scheme')
      document.head.appendChild(metaColorScheme)
    }
    metaColorScheme.setAttribute('content', 'light')

    // A. TEINTE DU DOCUMENT (PWA iOS Safari & Android Chrome)
    document.documentElement.style.backgroundColor = topBarBg
    document.body.style.backgroundColor = topBarBg

    // B. BALISES META WEB & PWA
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
    // "black-translucent" quand fond coloré, "default" force les icônes sombres sur iOS
    appleMeta.setAttribute('content', isDarkBg ? 'black-translucent' : 'default')

    // C. CONTRÔLE CAPACITOR NATIF (Android & iOS)
    if (Capacitor.isNativePlatform()) {
      const applyNativeStatusBar = async () => {
        try {
          await StatusBar.setOverlaysWebView({ overlay: false })
          await StatusBar.setBackgroundColor({ color: topBarBg })

          // CORRECTION DES ICÔNES :
          // - Fond sombre/bleu (Hajj & Agence) -> Style.Dark (force les icônes en BLANC)
          // - Fond blanc (Toutes les autres pages) -> Style.Light (force les icônes en NOIR / SOMBRE, même si le téléphone de l'utilisateur est en mode sombre)
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