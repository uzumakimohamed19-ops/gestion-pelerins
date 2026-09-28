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
    title: 'Agence Pro',
  },
}

// 🔒 VERROUILLAGE TOTAL DU VIEWPORT (Échelle fixe 1.0)
export const viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#FAFBFD' },
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
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="Agence Pro" />

        <style dangerouslySetInnerHTML={{
          __html: `
            /* 1. Verrouillage du scroll élastique et désactivation du double-tap zoom */
            html, body {
              overscroll-behavior-y: contain !important;
              -webkit-overflow-scrolling: touch;
              min-height: 100vh;
              min-height: -webkit-fill-available;
              touch-action: pan-x pan-y !important;
              -webkit-text-size-adjust: 100% !important;
            }

            /* 2. Empêcher la sélection de texte accidentelle comme une vraie app native */
            body {
              -webkit-touch-callout: none;
              -webkit-user-select: none;
              user-select: none;
            }

            /* Permettre la sélection uniquement dans les champs de saisie */
            input, textarea {
              -webkit-user-select: text !important;
              user-select: text !important;
            }

            /* 3. VERROU ANTI-ZOOM FOCUS : Sur iOS, toute police < 16px sur un input provoque un zoom */
            @media screen and (-webkit-min-device-pixel-ratio: 0) {
              select:focus,
              textarea:focus,
              input:focus {
                font-size: 16px !important;
              }
            }
          `
        }} />

        {/* 4. SCRIPT ULTRA-RAPIDE : Interception des gestes pinch-to-zoom Safari iOS */}
        <script dangerouslySetInnerHTML={{
          __html: `try {
            // A. Verrouillage de la couleur de fond instantanée
            var isDark = localStorage.getItem('compta_theme_dark') === 'true' || localStorage.getItem('app-theme') === 'dark';
            document.documentElement.style.backgroundColor = isDark ? '#000000' : '#FAFBFD';
            if (isDark) document.documentElement.classList.add('dark');

            // B. Bloquer le geste de pincement iOS (Pinch-to-zoom)
            document.addEventListener('gesturestart', function(e) {
              e.preventDefault();
            }, { passive: false });
            document.addEventListener('gesturechange', function(e) {
              e.preventDefault();
            }, { passive: false });
            document.addEventListener('gestureend', function(e) {
              e.preventDefault();
            }, { passive: false });

            // C. Bloquer le zoom multi-touch à 2 doigts
            document.addEventListener('touchstart', function(e) {
              if (e.touches.length > 1) {
                e.preventDefault();
              }
            }, { passive: false });

            // D. Bloquer le double tap rapide pour zoomer
            var lastTouchEnd = 0;
            document.addEventListener('touchend', function(e) {
              var now = (new Date()).getTime();
              if (now - lastTouchEnd <= 300) {
                e.preventDefault();
              }
              lastTouchEnd = now;
            }, false);
          } catch (_) {}`
        }} />
      </head>
      
      <body className="min-h-screen m-0 p-0 antialiased text-slate-900 flex flex-col overscroll-y-contain bg-[#FAFBFD] dark:bg-[#000000]">
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

                  <main className="flex-1 flex flex-col min-h-screen lg:pl-64">
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