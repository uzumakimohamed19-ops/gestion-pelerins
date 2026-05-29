import './globals.css'
import { Suspense } from 'react'
import MobileTopBar from '@/components/MobileTopBar' // Ajuste le chemin selon ton dossier components
import PwaInstaller from '@/components/PwaInstaller' // Importation du système d'installation PWA

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
        {/* Le pt-16 laisse la place à la barre sur mobile, md:pt-0 remet l'affichage normal sur PC */}
        <main className="pt-16 md:pt-0">
          {children}
        </main>

        {/* Gestionnaire d'installation PWA et du Service Worker */}
        <PwaInstaller />

      </body>
    </html>
  )
}