'use client'

import { useEffect } from 'react'
import { usePathname } from 'next/navigation'

const HAJJ_THEME = '#2563eb'
const AGENCE_THEME = '#0f172a'

export default function ThemeColorSync() {
  const pathname = usePathname()

  useEffect(() => {
    const isAgence = pathname?.startsWith('/agence')
    const color = isAgence ? AGENCE_THEME : HAJJ_THEME

    let themeMeta = document.querySelector('meta[name="theme-color"]') as HTMLMetaElement | null
    if (!themeMeta) {
      themeMeta = document.createElement('meta')
      themeMeta.setAttribute('name', 'theme-color')
      document.head.appendChild(themeMeta)
    }
    themeMeta.setAttribute('content', color)

    let appleMeta = document.querySelector('meta[name="apple-mobile-web-app-status-bar-style"]') as HTMLMetaElement | null
    if (!appleMeta) {
      appleMeta = document.createElement('meta')
      appleMeta.setAttribute('name', 'apple-mobile-web-app-status-bar-style')
      document.head.appendChild(appleMeta)
    }
    appleMeta.setAttribute('content', isAgence ? 'black-translucent' : 'default')

    document.documentElement.style.setProperty('--app-theme-color', color)
    document.documentElement.style.setProperty('color-scheme', isAgence ? 'dark' : 'light')
  }, [pathname])

  return null
}
