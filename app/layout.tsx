import './globals.css'
import Navbar from '../components/Navbar'

export const metadata = {
  title: 'Gestion Pèlerins',
  description: 'Application de gestion pour agence de voyage',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="fr">
      <body 
        className="min-h-screen antialiased"
        style={{ 
          backgroundColor: '#ffffff', 
          color: '#171717',
          // Motif géométrique discret (Arabesque) sur toute la page
          backgroundImage: `linear-gradient(rgba(255, 255, 255, 0.96), rgba(255, 255, 255, 0.96)), url('https://www.transparenttextures.com/patterns/arabesque.png')`,
          backgroundAttachment: 'fixed'
        }}
      >
        {/* FILIGRANE ISLAMIQUE DISCRET (KAABA) */}
        <div style={{
          position: 'fixed',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          width: '100%',
          height: '100%',
          backgroundImage: "url('https://www.svgrepo.com/show/272330/kaaba-mecca.svg')",
          backgroundRepeat: 'no-repeat',
          backgroundPosition: 'center',
          backgroundSize: '500px', // Taille du motif au centre
          opacity: 0.03, // Très léger (3%) pour ne pas gêner la lecture
          pointerEvents: 'none',
          zIndex: 0
        }} />

        {/* On affiche la Navbar */}
        <div className="relative z-20">
          <Navbar />
        </div>
        
        {/* Contenu de la page */}
        <main className="relative z-10">
          {children}
        </main>
      </body>
    </html>
  )
}