import './globals.css'
import PwaInstaller from '@/components/PwaInstaller'
import { YearProvider } from '@/lib/YearContext'
import { UIProvider } from '@/lib/UIContext'

// 1. Configuration des métadonnées (Standard et Apple) gérées proprement par Next.js
export const metadata = {
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent', // Permet l'immersion (le site monte tout en haut)
  },
}

// 2. Configuration du Viewport séparée (OBLIGATOIRE sur Next.js pour valider le viewport-fit=cover)
export const viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover', // CASSE LA BANDE BLANCHE : Demande à iOS d'occuper tout l'écran
  themeColor: '#2563eb', // Couleur pour Android
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="fr">
      {/* On a ENLEVÉ le <head> manuel qui provoquait le bug de conflit avec Next.js */}
      <body className="min-h-screen antialiased text-slate-900 bg-transparent">
        <UIProvider>
          <YearProvider>
            <main>
              {children}
            </main>

            <PwaInstaller />
          </YearProvider>
        </UIProvider>
      </body>
    </html>
  )
}