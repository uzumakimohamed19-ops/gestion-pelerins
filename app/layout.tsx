import './globals.css'
import PwaInstaller from '@/components/PwaInstaller'
import { YearProvider } from '@/lib/YearContext'

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
        <YearProvider>
          <main>
            {children}
          </main>

          <PwaInstaller />
        </YearProvider>
      </body>
    </html>
  )
}