'use client'

import SidebarAgence from '@/components/SidebarAgence'
import { usePathname } from 'next/navigation'

export default function AgenceLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()

  // La barre s'active toujours uniquement sur le dashboard
  const isDashboard = pathname === '/agence' || pathname === '/agence/dashboard'

  return (
    <div className="min-h-screen bg-[#FBFBFB]">
      
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
      
      {/* MISE À JOUR : 
          Le padding-top de sécurité "env(safe-area-inset-top)" est maintenant appliqué 
          à TOUTES les pages de l'agence pour protéger tes textes partout. */}
      <main 
        className="max-w-7xl mx-auto pb-8"
        style={{ 
          paddingTop: 'env(safe-area-inset-top)' 
        }}
      >
        {children}
      </main>
    </div>
  )
}