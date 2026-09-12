import './globals.css'
import PwaInstaller from '@/components/PwaInstaller'
import { UIProvider } from '@/lib/UIContext'
import TopBarContainer from '@/components/TopBarContainer'
import ThemeColorSync from '@/components/ThemeColorSync'
import NativeBackButton from '@/components/NativeBackButton'
import ClientPowerSyncWrapper from '@/components/ClientPowerSyncWrapper'

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
      <body className="min-h-screen m-0 p-0 antialiased text-slate-900 bg-transparent flex flex-col">
        <ClientPowerSyncWrapper>
          <UIProvider>
            <NativeBackButton />
            <ThemeColorSync />

            <div className="lg:hidden">
              <TopBarContainer />
            </div>

            <main className="flex-1 flex flex-col min-h-screen lg:pl-64 transition-all duration-300">
              {children}
            </main>

            <PwaInstaller />
          </UIProvider>
        </ClientPowerSyncWrapper>
      </body>
    </html>
  )
}