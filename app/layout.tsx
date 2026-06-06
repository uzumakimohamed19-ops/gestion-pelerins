import './globals.css'
import PwaInstaller from '@/components/PwaInstaller'
import { YearProvider } from '@/lib/YearContext'
import { UIProvider } from '@/lib/UIContext'
import TopBarContainer from '@/components/TopBarContainer'

export const metadata = {
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent', 
  },
}

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover', 
  themeColor: '#2563eb', 
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="fr">
      {/* On force le html et le body à occuper tout l'écran, sans aucune marge */}
      <body className="min-h-screen m-0 p-0 antialiased text-slate-900 bg-transparent flex flex-col">
        <UIProvider>
          <YearProvider>
            
            <TopBarContainer />

            {/* En enlevant le padding-top, ton en-tête bleu (ou noir, ou rouge) 
                va monter DIRECTEMENT et naturellement sous le Dynamic Island. 
                C'est la couleur de ton composant qui va faire le fond ! */}
            <main className="flex-1 flex flex-col min-h-screen">
              {children}
            </main>

            <PwaInstaller />
          </YearProvider>
        </UIProvider>
      </body>
    </html>
  )
}