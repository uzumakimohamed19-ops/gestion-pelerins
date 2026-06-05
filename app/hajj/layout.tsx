import '../globals.css'
import Navbar from '../../components/Navbar'

// On conserve uniquement le titre et la description. 
// Next.js va intelligemment les fusionner avec le manifest et le viewport du RootLayout sans rien casser.
export const metadata = {
  title: 'Gestion Pèlerins',
  description: 'Application de gestion pour agence de voyage',
}

export default function HajjLayout({ children }: { children: React.ReactNode }) {
  return (
    // On nettoie la structure en utilisant une flexbox verticale propre
    <div className="min-h-screen antialiased flex flex-col w-full bg-slate-50">
      
      {/* Ta Navbar existante reste ici */}
      <Navbar />
      
      {/* Le conteneur principal prend le reste de l'espace.
          C'est à l'intérieur de ce {children} que se trouve ton Dashboard 
          avec le <Header /> tout en haut qui va monter derrière la Dynamic Island. */}
      <main className="flex-1 w-full flex flex-col">
        {children}
      </main>
      
    </div>
  )
}