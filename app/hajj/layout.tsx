'use client' // On passe le layout en Client Component pour écouter l'URL en temps réel sans bug

import '../globals.css'
import Navbar from '../../components/Navbar'
import { usePathname } from 'next/navigation'
import { YearProvider } from '@/lib/YearContext'

export default function HajjLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()

  // On vérifie si on est STRICTEMENT sur le dashboard du hajj
  const isDashboard = pathname === '/hajj' || pathname === '/hajj/dashboard'

  return (
    <YearProvider scope="hajj">
      <div className="min-h-screen antialiased flex flex-col w-full bg-slate-50">
      
      {/* 🛡️ INJECTION CSS DE NETTOYAGE ABSOLU (Uniquement sur PC >= 1024px) */}
      <style dangerouslySetInnerHTML={{
        __html: `
          @media (min-width: 1024px) {
            /* 1. On neutralise les limites de largeur des pages */
            .max-w-4xl, .max-w-5xl, .max-w-6xl, .max-w-7xl {
              max-width: 100% !important;
            }
            
            /* 2. Élimination de TOUT padding/margin haut qui pourrait venir du body ou du layout global */
            body, html {
              padding-top: 0px !important;
              margin-top: 0px !important;
            }

            /* 3. On force le contenu principal à coller tout en haut */
            .hajj-main-content {
              padding-top: 0px !important;
              margin-top: 0px !important;
            }
            
            /* 4. On s'assure que la div résiduelle de la Navbar est bien écrasée */
            nav + div, .hidden.lg\\:block.h-20 {
              height: 0px !important;
              display: none !important;
              margin: 0 !important;
              padding: 0 !important;
            }
          }
        `
      }} />

      {/* Ta Navbar existante */}
      <Navbar />
      
      {/* Sur mobile : padding-top s'adapte aux encoches. 
          Sur PC : Le CSS injecté ci-dessus force tout à 0px. */}
      <main 
        className="flex-1 w-full flex flex-col relative hajj-main-content"
        style={{ paddingTop: 'env(safe-area-inset-top)' }}
      >
        
        {/* La barre supérieure mobile (masquée sur PC) */}
        <div 
          className="shadow-none fixed top-0 left-0 w-full z-[9999] pointer-events-none transition-colors duration-200 lg:hidden"
          style={{ 
            height: 'env(safe-area-inset-top)',
            backgroundColor: isDashboard ? '#2563eb' : 'transparent'
          }}
        />

        {children}
      </main>
      
      </div>
    </YearProvider>
  )
}