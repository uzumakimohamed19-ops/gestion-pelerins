'use client'

import { usePathname } from 'next/navigation'

export default function TopBarContainer() {
  const pathname = usePathname()

  const isDark = typeof window !== 'undefined' && localStorage.getItem('compta_theme_dark') === 'true'
  const isAgenceDashboard = pathname === '/agence' || pathname === '/agence/dashboard'
  const isHajj = pathname.startsWith('/hajj')

  // Couleur exacte de la barre selon la section
  const barColor = isDark 
    ? '#161618' 
    : isAgenceDashboard 
    ? '#FAFBFD' 
    : isHajj 
    ? '#2563eb' 
    : '#ffffff'

  return (
    <div 
      className="fixed top-0 left-0 w-full z-[9999] pointer-events-none transition-colors duration-150"
      style={{
        height: 'env(safe-area-inset-top)',
        backgroundColor: barColor
      }}
    />
  )
}