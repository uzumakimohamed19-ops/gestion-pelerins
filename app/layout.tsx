import './globals.css'
import PwaInstaller from '@/components/PwaInstaller'
import { UIProvider } from '@/lib/UIContext'
import TopBarContainer from '@/components/TopBarContainer'
import ThemeColorSync from '@/components/ThemeColorSync'
import NativeBackButton from '@/components/NativeBackButton'
import ClientPowerSyncWrapper from '@/components/ClientPowerSyncWrapper'
import AppCacheGuard from '@/components/AppCacheGuard'
import AuthGuard from '@/components/AuthGuard'
import ProfileProvider, { ProfileRouteGuard } from '@/lib/ProfileContext'
import AppUpdateBanner from '@/components/AppUpdateBanner'

export const metadata = {
  title: 'Agence Pro',
  description: 'Gestion des opérations et des pèlerins',
  manifest: '/manifest.json',
  icons: {
    icon: '/icon-192x192.png',
    apple: '/icon-192x192.png',
  },
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
    <html lang="fr" suppressHydrationWarning className="overscroll-y-contain">
      <head>
        {/* 🛡️ VERROUILLAGE GLOBAL DU PULL-TO-REFRESH & DE L'OVERSCROLL BLANC */}
        <style dangerouslySetInnerHTML={{
          __html: `
            html, body {
              overscroll-behavior-y: contain !important;
              -webkit-overflow-scrolling: touch;
            }
          `
        }} />

        {/* Initialisation instantanée du thème pour éviter tout flash blanc */}
        <script dangerouslySetInnerHTML={{
          __html: "try { const w = window; const isDark = localStorage.getItem('compta_theme_dark') === 'true' || localStorage.getItem('app-theme') === 'dark'; if (isDark) { document.documentElement.classList.add('dark'); document.documentElement.style.backgroundColor = '#000000'; } if (w.location.protocol.startsWith('tauri') || w.location.hostname === 'tauri.localhost' || '__TAURI_INTERNALS__' in w || '__TAURI__' in w) document.documentElement.dataset.tauri = 'true'; } catch (_) {}"
        }} />
      </head>
      <body className="min-h-screen m-0 p-0 antialiased text-slate-900 bg-transparent flex flex-col overscroll-y-contain">
        
        {/* 🚀 BANNIÈRE DE MISE À JOUR DISPONIBLE (Affichage prioritaire z-[999999]) */}
        <AppUpdateBanner />

        <AppCacheGuard />
        <ClientPowerSyncWrapper>
          <AuthGuard>
            <ProfileProvider>
              <ProfileRouteGuard>
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
              </ProfileRouteGuard>
            </ProfileProvider>
          </AuthGuard>
        </ClientPowerSyncWrapper>
      </body>
    </html>
  )
}