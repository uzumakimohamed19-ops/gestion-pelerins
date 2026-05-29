import './globals.css'
import { Suspense } from 'react'
import MobileTopBar from '@/components/MobileTopBar' 
import PwaInstaller from '@/components/PwaInstaller'

// Méthode recommandée par Next.js pour injecter le manifest proprement sans casser ton code
export const metadata = {
  manifest: '/manifest.json',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="fr">
      <body className="min-h-screen antialiased text-slate-900 bg-transparent">
        
        {/* 1. La Top Bar Fixe (visible uniquement sur mobile grâce au md:hidden) */}
        <Suspense fallback={null}>
          <MobileTopBar />
        </Suspense>

        {/* 2. Le reste de ton application */}
        <main className="pt-16 md:pt-0">
          {children}
        </main>

        {/* Gestionnaire d'installation PWA et du Service Worker */}
        <PwaInstaller />

      </body>
    </html>
  )
}