'use client'

import { useEffect } from 'react'
import { usePathname } from 'next/navigation'

const HAJJ_THEME = '#2563eb'
const AGENCE_DASHBOARD_THEME = '#1e293b'
const DARK_THEME = '#000000'
const LIGHT_DEFAULT = '#ffffff'

export default function ThemeColorSync() {
  const pathname = usePathname()

  useEffect(() => {
    if (typeof window === 'undefined') return

    const updateStatusBarColor = () => {
      const isDark = localStorage.getItem('compta_theme_dark') === 'true'
      const isAgence = pathname.startsWith('/agence')
      const isAgenceDashboard = pathname === '/agence' || pathname === '/agence/dashboard'
      const isHajj = pathname.startsWith('/hajj')
      const isHajjDashboard = pathname === '/hajj' || pathname === '/hajj/dashboard'

      let color = LIGHT_DEFAULT

      if (isDark && isAgence) {
        color = DARK_THEME
      } else if (isAgenceDashboard) {
        color = AGENCE_DASHBOARD_THEME
      } else if (isHajjDashboard || isHajj) {
        color = HAJJ_THEME
      } else {
        color = LIGHT_DEFAULT
      }

      // 1. Mise à jour pour Android Chrome
      const themeMetas = document.querySelectorAll('meta[name="theme-color"]')
      if (themeMetas.length > 0) {
        themeMetas.forEach(meta => meta.setAttribute('content', color))
      } else {
        const newMeta = document.createElement('meta')
        newMeta.name = 'theme-color'
        newMeta.content = color
        document.head.appendChild(newMeta)
      }

      // 2. CORRECTION CRITIQUE POUR IPHONE (PWA Standalone & Safari) :
      // On colore directement le html et le body avec la couleur active.
      // Sur iOS, l'encoche adopte immédiatement la couleur du document sous-jacent.
      document.documentElement.style.backgroundColor = color
      document.body.style.backgroundColor = color

      // 3. Barre de statut iOS :
      // Utiliser 'default' permet à iOS d'adapter le contraste des icônes (heure, batterie)
      // automatiquement selon la couleur claire ou foncée.
      let appleMeta = document.querySelector('meta[name="apple-mobile-web-app-status-bar-style"]') as HTMLMetaElement | null
      if (!appleMeta) {
        appleMeta = document.createElement('meta')
        appleMeta.name = 'apple-mobile-web-app-status-bar-style'
        document.head.appendChild(appleMeta)
      }
      appleMeta.content = isDark || isAgenceDashboard || isHajjDashboard ? 'black-translucent' : 'default'
    }

    updateStatusBarColor()

    window.addEventListener('storage', updateStatusBarColor)
    window.addEventListener('theme-change', updateStatusBarColor)

    return () => {
      window.removeEventListener('storage', updateStatusBarColor)
      window.removeEventListener('theme-change', updateStatusBarColor)
    }
  }, [pathname])

  return null
}