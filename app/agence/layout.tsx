'use client'

import SidebarAgence from '@/components/SidebarAgence'
import { usePathname } from 'next/navigation'

export default function AgenceLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()

  // La barre s'active toujours uniquement sur le dashboard
  const isDashboard = pathname === '/agence' || pathname === '/agence/dashboard'

  return (
    <div className="w-full min-h-screen bg-[#FBFBFB] flex flex-col">
      
      {/* INJECTION CSS NATIVE ET INCASSABLE : 
          Ceci neutralise les limites de largeur de toutes tes pages (max-w-5xl, 7xl...) 
          UNIQUEMENT sur les écrans d'ordinateur (>= 1024px). Le mobile reste 100% intact. */}
      <style dangerouslySetInnerHTML={{
        __html: `
          @media (min-width: 1024px) {
            .max-w-4xl, .max-w-5xl, .max-w-6xl, .max-w-7xl {
              max-width: 100% !important;
            }
          }
        `
      }} />

      {/* Barre unie slate-800 en haut (uniquement pour le dashboard) */}
      <div 
        className="fixed top-0 left-0 w-full z-[9999] pointer-events-none"
        style={{ 
          height: 'env(safe-area-inset-top)',
          backgroundColor: isDashboard ? '#1e293b' : 'transparent' // #1e293b = slate-800
        }}
      />

      {/* Navbar en haut */}
      <SidebarAgence />
      
      {/* Conteneur principal 
          -> J'ai supprimé les px-4 md:px-12 d'ici car tes pages internes ont DÉJÀ leurs propres marges. 
          Cela évite l'effet de "double marge" qui écrasait ton application au milieu ! */}
      <main 
        className="w-full flex-1 pb-24 md:pb-8"
        style={{ 
          paddingTop: 'env(safe-area-inset-top)' 
        }}
      >
        {children}
      </main>
    </div>
  )
}