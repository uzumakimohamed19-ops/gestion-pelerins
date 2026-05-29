import './globals.css'
import MobileTopBar from '@/components/MobileTopBar' // Ajuste le chemin selon ton dossier components

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="fr">
      <body className="min-h-screen antialiased text-slate-900 bg-transparent">
        
        {/* 1. La Top Bar Fixe (visible uniquement sur mobile grâce au md:hidden) */}
        <MobileTopBar />

        {/* 2. Le reste de ton application */}
        {/* Le pt-16 laisse la place à la barre sur mobile, md:pt-0 remet l'affichage normal sur PC */}
        <main className="pt-16 md:pt-0">
          {children}
        </main>

      </body>
    </html>
  )
}