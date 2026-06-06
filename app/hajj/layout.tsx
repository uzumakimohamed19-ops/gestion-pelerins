'use client' // On passe le layout en Client Component pour écouter l'URL en temps réel sans bug

import '../globals.css'
import Navbar from '../../components/Navbar'
import { usePathname } from 'next/navigation'

export default function HajjLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()

  // On vérifie si on est STRICTEMENT sur le dashboard du hajj
  // Ajuste le texte si ton URL exacte est différente (ex: '/hajj/dashboard')
  const isDashboard = pathname === '/hajj' || pathname === '/hajj/dashboard'

  return (
    <div className="min-h-screen antialiased flex flex-col w-full bg-slate-50">
      
      {/* Ta Navbar existante reste ici */}
      <Navbar />
      
      {/* Le pt-[env(safe-area-inset-top)] protège ton texte ("AB VOYAGE") sur toutes les pages */}
      <main className="flex-1 w-full flex flex-col relative pt-[env(safe-area-inset-top)]">
        
        {/* La barre s'allume en bleu 600 uniquement si isDashboard est vrai, sinon elle reste transparente */}
        <div 
          className={`shadow-none fixed top-0 left-0 w-full z-[9999] pointer-events-none transition-colors duration-200`}
          style={{ 
            height: 'env(safe-area-inset-top)',
            backgroundColor: isDashboard ? '#2563eb' : 'transparent'
          }}
        />

        {children}
      </main>
      
    </div>
  )
}