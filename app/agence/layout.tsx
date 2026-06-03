import SidebarAgence from '@/components/SidebarAgence'

export default function AgenceLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-[#FBFBFB]">
      {/* Navbar en haut */}
      <SidebarAgence />
      
      {/* Correction ici : pt-0 élimine l'espace du haut pour coller le bloc au navigateur */}
      <main className="max-w-7xl mx-auto pt-0 pb-8">
        {children}
      </main>
    </div>
  )
}