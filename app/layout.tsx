import './globals.css'
import PwaInstaller from '@/components/PwaInstaller'
import { YearProvider } from '@/lib/YearContext'
import { UIProvider } from '@/lib/UIContext'

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