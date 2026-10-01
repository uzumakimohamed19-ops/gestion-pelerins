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
    statusBarStyle: 'default',
    title: 'Agence Pro',
  },
}

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#FFFFFF' },
    { media: '(prefers-color-scheme: dark)', color: '#000000' },
  ],
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="fr" suppressHydrationWarning className="overscroll-y-contain">
      <head>
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-title" content="Agence Pro" />

        <style dangerouslySetInnerHTML={{
          __html: `
            /* 1. Verrouillage du scroll et des rebonds */
            html, body {
              overscroll-behavior-y: contain !important;
              -webkit-overflow-scrolling: touch;
              margin: 0 !important;
              padding: 0 !important;
              min-height: 100vh;
              min-height: -webkit-fill-available;
              touch-action: pan-x pan-y !important;
              -webkit-text-size-adjust: 100% !important;
            }

            /* 2. Empêcher la sélection accidentelle */
            body {
              -webkit-touch-callout: none;
              -webkit-user-select: none;
              user-select: none;
            }

            input, textarea {
              -webkit-user-select: text !important;
              user-select: text !important;
            }

            @media screen and (-webkit-min-device-pixel-ratio: 0) {
              select:focus,
              textarea:focus,
              input:focus {
                font-size: 16px !important;
              }
            }
          `
        }} />

        <script dangerouslySetInnerHTML={{
          __html: `try {
            document.addEventListener('gesturestart', function(e) { e.preventDefault(); }, { passive: false });
            document.addEventListener('gesturechange', function(e) { e.preventDefault(); }, { passive: false });
            document.addEventListener('gestureend', function(e) { e.preventDefault(); }, { passive: false });

            document.addEventListener('touchstart', function(e) {
              if (e.touches.length > 1) e.preventDefault();
            }, { passive: false });

            var lastTouchEnd = 0;
            document.addEventListener('touchend', function(e) {
              var now = (new Date()).getTime();
              if (now - lastTouchEnd <= 300) e.preventDefault();
              lastTouchEnd = now;
            }, false);
          } catch (_) {}`
        }} />
      </head>
      
      <body className="min-h-screen m-0 p-0 antialiased text-slate-900 flex flex-col overscroll-y-contain bg-white dark:bg-[#000000]">
        <AppUpdateBanner />
        <AppCacheGuard />
        <ClientPowerSyncWrapper>
          <ProfileProvider>
            <AuthGuard>
              <ProfileRouteGuard>
                <UIProvider>
                  <NativeBackButton />
                  <ThemeColorSync />

                  {/* Bandeau d'arrière-plan sans décalage de contenu */}
                  <TopBarContainer />

                  <main className="flex-1 flex flex-col min-h-screen lg:pl-64">
                    {children}
                  </main>

                  <PwaInstaller />
                </UIProvider>
              </ProfileRouteGuard>
            </AuthGuard>
          </ProfileProvider>
        </ClientPowerSyncWrapper>
      </body>
    </html>
  )
}