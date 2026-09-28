'use client'

import { useEffect } from 'react'
import Navbar from '../../components/Navbar'
import { usePathname } from 'next/navigation'
import { YearProvider } from '@/lib/YearContext'

const HAJJ_BLUE = '#2563eb'

export default function HajjLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()

  // 🔵 Synchronisation immédiate de l'encoche iOS & du document racine
  useEffect(() => {
    if (typeof document === 'undefined') return

    // Teinter html et body en bleu Hajj pour éviter tout flash blanc sous l'encoche
    document.documentElement.style.backgroundColor = HAJJ_BLUE
    document.body.style.backgroundColor = HAJJ_BLUE

    // Mettre à jour la meta theme-color pour Safari et Chrome
    const themeMetas = document.querySelectorAll('meta[name="theme-color"]')
    themeMetas.forEach(meta => meta.setAttribute('content', HAJJ_BLUE))

    return () => {
      // Nettoyage en quittant le module Hajj
      document.documentElement.style.backgroundColor = ''
      document.body.style.backgroundColor = ''
    }
  }, [pathname])

  return (
    <YearProvider scope="hajj">
      <div 
        className="min-h-screen antialiased flex flex-col w-full"
        style={{ backgroundColor: HAJJ_BLUE }}
      >
      
        {/* 🛡️ INJECTION CSS NATIVE : Verrouillage overscroll & pleine largeur PC */}
        <style dangerouslySetInnerHTML={{
          __html: `
            html, body {
              background-color: ${HAJJ_BLUE} !important;
              overscroll-behavior-y: contain !important;
              -webkit-overflow-scrolling: touch;
            }

            @media (min-width: 1024px) {
              .max-w-4xl, .max-w-5xl, .max-w-6xl, .max-w-7xl {
                max-width: 100% !important;
              }
              
              body, html {
                padding-top: 0px !important;
                margin-top: 0px !important;
              }

              .hajj-main-content {
                padding-top: 0px !important;
                margin-top: 0px !important;
              }
              
              nav + div, .hidden.lg\\:block.h-20 {
                height: 0px !important;
                display: none !important;
                margin: 0 !important;
                padding: 0 !important;
              }
            }
          `
        }} />

        {/* 📱 Bande physique d'encoche iOS (Fixée à top: 0, peinte en bleu Hajj) */}
        <div 
          className="fixed top-0 left-0 right-0 z-[9999] pointer-events-none transition-colors duration-150 lg:hidden"
          style={{ 
            height: 'env(safe-area-inset-top, 44px)',
            backgroundColor: HAJJ_BLUE
          }}
          aria-hidden="true"
        />

        {/* Barre de navigation Hajj */}
        <Navbar />
        
        {/* Contenu principal */}
        <main 
          className="flex-1 w-full flex flex-col relative hajj-main-content tauri-safe-area bg-slate-50"
          style={{ paddingTop: 'env(safe-area-inset-top)' }}
        >
          {children}
        </main>
        
      </div>
    </YearProvider>
  )
}