'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { 
  LayoutDashboard, 
  Users, 
  UserPlus, 
  FileText, 
  BarChart3, 
  Settings,
  LogOut,
  Building2,
  ShieldCheck
} from 'lucide-react'

export default function Navbar() {
  const pathname = usePathname()
  const router = useRouter()
  const [nomAgence, setNomAgence] = useState<string>('Chargement...')
  const [userName, setUserName] = useState<string>('')
  const [role, setRole] = useState<string>('staff')

  useEffect(() => {
    async function getProfileAndAgence() {
      try {
        const { data: userData, error: userError } = await supabase.auth.getUser()
        if (userError) {
          console.error('[Navbar] user fetch error', userError)
          return
        }

        const user = userData?.user
        if (!user) {
          console.warn('[Navbar] no user in session')
          return
        }

        const { data: profile, error: profileError } = await supabase
          .from('profiles')
          .select(`
            role,
            full_name,
            agence_id,
            agences ( nom_agence )
          `)
          .eq('id', user.id)
          .single()

        if (profileError) {
          console.error('[Navbar] profile fetch error', profileError)
          return
        }

        if (profile) {
          setRole(profile.role || 'staff')
          setUserName(profile.full_name || '')

          // Supabase relation peut renvoyer un tableau pour 'agences'
          const profileAgences = (profile as any).agences
          const agencyName = Array.isArray(profileAgences)
            ? profileAgences[0]?.nom_agence
            : profileAgences?.nom_agence

          setNomAgence(agencyName || 'Mon Agence')
        }
      } catch (err) {
        console.error('[Navbar] unexpected error', err)
      }
    }
    getProfileAndAgence()
  }, [])

  const handleLogout = async () => {
    try {
      await supabase.auth.signOut()
      router.push('/login')
      router.refresh()
    } catch (err) {
      console.error('[Navbar] logout error', err)
    }
  }

  const navItems = [
    { name: 'Tableau de bord', href: '/', icon: LayoutDashboard },
    { name: 'Liste Pèlerins', href: '/liste-pelerins', icon: Users },
    { name: 'Ajouter', href: '/ajouter-pelerin', icon: UserPlus },
    { name: 'Documents', href: '#', icon: FileText },
    { name: 'Stats', href: '#', icon: BarChart3 },
  ]

  // Cacher la navbar sur la page login
  if (pathname === '/login') return null

  return (
    <nav className="bg-white border-b border-gray-200 sticky top-0 z-50 shadow-sm print:hidden">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-20">
          
          {/* Logo & Marque Dynamique (Nom de l'agence) */}
          <div className="flex items-center">
            <Link href="/" className="flex-shrink-0 flex items-center gap-3">
              <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center shadow-lg shadow-blue-200">
                <Building2 className="text-white" size={20} />
              </div>
              <div className="flex flex-col">
                <span className="text-lg font-black text-gray-900 uppercase leading-none tracking-tight">
                  {nomAgence}
                </span>
                <span className="text-[10px] font-bold text-blue-600 uppercase tracking-[0.2em]">Plateforme Hajj</span>
              </div>
            </Link>

            {/* Navigation principale (Desktop) */}
            <div className="hidden md:ml-10 md:flex md:space-x-4">
              {navItems.map((item) => {
                const isActive = pathname === item.href
                return (
                  <Link
                    key={item.name}
                    href={item.href}
                    className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition-all duration-200 ${
                      isActive 
                        ? 'bg-blue-50 text-blue-700' 
                        : 'text-gray-500 hover:bg-gray-50 hover:text-gray-900'
                    }`}
                  >
                    <item.icon size={18} strokeWidth={isActive ? 2.5 : 2} />
                    {item.name}
                  </Link>
                )
              })}
            </div>
          </div>

          {/* Côté droit */}
          <div className="flex items-center gap-3">
            
            {/* BOUTON ADMIN PANEL (Affiché uniquement si rôle === 'admin') */}
            {role === 'admin' && (
              <Link 
                href="/admin" 
                className="flex items-center gap-2 bg-amber-50 text-amber-700 px-4 py-2 rounded-xl font-black text-[10px] uppercase tracking-widest border border-amber-100 hover:bg-amber-100 transition-all"
              >
                <ShieldCheck size={16} />
                Admin Panel
              </Link>
            )}

            <div className="h-8 w-[1px] bg-gray-200 mx-2 hidden sm:block"></div>

            <div className="flex items-center gap-3 pl-2">
              <div className="text-right hidden sm:block">
                <p className="text-[10px] font-black text-gray-400 uppercase tracking-tighter leading-none">Utilisateur</p>
                <p className="text-xs font-bold text-gray-900">{userName || 'Agent'}</p>
              </div>
              
              <div className="w-10 h-10 rounded-full bg-gray-100 border-2 border-white shadow-sm flex items-center justify-center overflow-hidden">
                <img 
                  src={`https://ui-avatars.com/api/?name=${userName || nomAgence}&background=f3f4f6&color=1e40af`} 
                  alt="Avatar" 
                />
              </div>

              <button 
                onClick={handleLogout}
                className="ml-2 p-2 text-gray-400 hover:text-red-600 transition-colors"
                title="Déconnexion"
              >
                <LogOut size={20} />
              </button>
            </div>
          </div>

        </div>
      </div>
    </nav>
  )
}