import './globals.css'
import PwaInstaller from '@/components/PwaInstaller' // 1. Remise de l'installateur PWA

// 2. Remise de la configuration pour que Chrome détecte le manifest en production
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
        
        <main>
          {children}
        </main>

        {/* 3. Remise du composant qui gère le Service Worker et l'affichage du pop-up */}
        <PwaInstaller />

      </body>
    </html>
  )
}