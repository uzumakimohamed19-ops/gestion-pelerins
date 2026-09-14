'use client'

import { useEffect } from 'react'
import { usePathname } from 'next/navigation'

const HAJJ_THEME = '#2563eb'
const AGENCE_THEME = '#0f172a'

export default function ThemeColorSync() {
  const pathname = usePathname()

  useEffect(() => {
    const isAgenceDashboard = pathname === '/agence' || pathname === '/agence/dashboard'
    const isHajjDashboard = pathname === '/hajj' || pathname === '/hajj/dashboard'
    const color = isAgenceDashboard ? AGENCE_THEME : isHajjDashboard ? HAJJ_THEME : '#ffffff'

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
    appleMeta.setAttribute('content', isAgenceDashboard ? 'black-translucent' : 'default')

  }, [pathname])

  return null
}
