'use client'

import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'

export default function TopBarContainer() {
  const pathname = usePathname()
  const [isDark, setIsDark] = useState(false)

  useEffect(() => {
    const checkTheme = () => {
      setIsDark(localStorage.getItem('compta_theme_dark') === 'true')
    }
    checkTheme()
    window.addEventListener('storage', checkTheme)
    window.addEventListener('theme-change', checkTheme)
    return () => {
      window.removeEventListener('storage', checkTheme)
      window.removeEventListener('theme-change', checkTheme)
    }
  }, [])

  const isHajj = pathname.startsWith('/hajj')
  const isHajjDashboard = pathname === '/hajj' || pathname === '/hajj/dashboard'
  const isAgence = pathname.startsWith('/agence')

  // Couleur de remplissage exacte de l'encoche
  let topBarBg = '#FAFBFD'

  if (isDark) {
    topBarBg = '#161618' // Noir graphite en mode sombre agence
  } else if (isHajjDashboard || isHajj) {
    topBarBg = '#2563eb' // Bleu royal Hajj
  } else if (isAgence) {
    topBarBg = '#FAFBFD' // Blanc cassé Agence
  } else {
    topBarBg = '#FFFFFF'
  }

  return (
    <div 
      className="fixed top-0 left-0 right-0 z-[99999] pointer-events-none transition-colors duration-150"
      style={{
        height: 'env(safe-area-inset-top, 44px)',
        backgroundColor: topBarBg
      }}
      aria-hidden="true"
    />
  )
}