import SidebarAgence from '@/components/SidebarAgence'


export default function AgenceLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-[#FBFBFB]">
      {/* Navbar en haut */}
      <SidebarAgence />
      
      {/* Contenu en dessous */}
      <main className="max-w-7xl mx-auto py-8">
        {children}
      </main>
    </div>
  )
}