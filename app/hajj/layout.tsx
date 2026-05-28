import '../globals.css'
import Navbar from '../../components/Navbar'
 
export const metadata = {
  title: 'Gestion Pèlerins',
  description: 'Application de gestion pour agence de voyage',
}
 
export default function HajjLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen antialiased">
      <Navbar />
      <main>
        {children}
      </main>
    </div>
  )
}