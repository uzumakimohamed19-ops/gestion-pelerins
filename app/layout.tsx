import './globals.css'
import PwaInstaller from '@/components/PwaInstaller'
import { UIProvider } from '@/lib/UIContext'
import TopBarContainer from '@/components/TopBarContainer'
import ThemeColorSync from '@/components/ThemeColorSync'

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
          {/* CORRECTION ICI : On enveloppe la TopBar pour la masquer sur PC (lg:hidden) 
              car la barre est maintenant verticale sur le côté. Le mobile la garde intacte. */}
          <ThemeColorSync />

          <div className="lg:hidden">
            <TopBarContainer />
          </div>

          {/* CHANGEMENT md:pl-64 en lg:pl-64 : 
              On s'aligne sur le breakpoint 'lg' (1024px) utilisé par la Navbar pour éviter 
              un décalage bizarre sur les tablettes et écrans intermédiaires. */}
          <main className="flex-1 flex flex-col min-h-screen lg:pl-64 transition-all duration-300">
            {children}
          </main>

          <PwaInstaller />
        </UIProvider>
      </body>
    </html>
  )
}