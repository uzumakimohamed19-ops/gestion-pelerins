'use client'

import { useEffect, useState } from 'react'
import SidebarAgence from '@/components/SidebarAgence'
import { usePathname } from 'next/navigation'
import { YearProvider } from '@/lib/YearContext'

export default function AgenceLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const isDashboard = pathname === '/agence' || pathname === '/agence/dashboard'

  // 🌓 Écoute et synchronisation dynamique du Dark Mode
  const [isDark, setIsDark] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('compta_theme_dark') === 'true'
    }
    return false
  })

  useEffect(() => {
    const syncTheme = () => {
      const darkActive = localStorage.getItem('compta_theme_dark') === 'true'
      setIsDark(darkActive)

      if (typeof document !== 'undefined') {
        const bg = darkActive ? '#000000' : (isDashboard ? '#1e293b' : '#FAFBFD')
        document.documentElement.style.backgroundColor = bg
        document.body.style.backgroundColor = bg

        // Mise à jour de la balise theme-color pour iOS Safari
        const metaTheme = document.querySelector('meta[name="theme-color"]')
        if (metaTheme) {
          metaTheme.setAttribute('content', bg)
        }
      }
    }

    window.addEventListener('storage', syncTheme)
    window.addEventListener('theme-change', syncTheme)

    syncTheme()

    return () => {
      window.removeEventListener('storage', syncTheme)
      window.removeEventListener('theme-change', syncTheme)
    }
  }, [isDashboard])

  // Détermination de la couleur exacte de l'encoche iPhone
  const statusBarColor = isDark 
    ? (isDashboard ? '#161618' : '#000000') 
    : (isDashboard ? '#1e293b' : '#FAFBFD')

  return (
    <YearProvider scope="agence">
      <div 
        className={`w-full min-h-[100dvh] flex flex-col transition-colors duration-150 ${
          isDark ? 'bg-[#000000] text-[#F5F5F7]' : 'bg-[#FAFBFD] text-slate-900'
        }`}
        style={{
          backgroundColor: isDark ? '#000000' : (isDashboard ? '#1e293b' : '#FAFBFD')
        }}
      >
        <style dangerouslySetInnerHTML={{
          __html: `
            html, body {
              background-color: ${statusBarColor} !important;
              overscroll-behavior-y: contain !important;
            }
            @media (min-width: 1024px) {
              .max-w-4xl, .max-w-5xl, .max-w-6xl, .max-w-7xl {
                max-width: 100% !important;
              }
            }
          `
        }} />

        {/* 📱 Encoche iPhone : peinte directement avec la couleur du dashboard */}
        <div 
          className="fixed top-0 left-0 right-0 z-[9999] pointer-events-none transition-colors duration-150"
          style={{ 
            height: 'env(safe-area-inset-top)',
            backgroundColor: statusBarColor
          }}
          aria-hidden="true"
        />

        <SidebarAgence />
        
        <main 
          className="w-full flex-1 pb-28 md:pb-8 tauri-safe-area"
          style={{ 
            paddingTop: isDashboard ? '0px' : 'env(safe-area-inset-top)' 
          }}
        >
          {children}
        </main>

        <div 
          className="fixed bottom-0 left-0 w-full pointer-events-none z-[80] md:hidden transition-colors duration-150"
          style={{
            height: 'env(safe-area-inset-bottom)',
            backgroundColor: isDark ? '#1C1C1E' : '#ffffff'
          }}
        />
      </div>
    </YearProvider>
  )
}