'use client'

import { useEffect, useState } from 'react'
import { supabase, getUser } from '@/lib/supabase' // Ajustez le chemin selon votre structure de projet
import Link from 'next/link'
import Image from 'next/image'
import { usePathname, useRouter } from 'next/navigation'
import { 
  LayoutDashboard, 
  PlusCircle, 
  ClipboardList, 
  PieChart, 
  LogOut,
  Building2,
  ShieldCheck,
  SquareArrowRight,
  Menu,
  X
} from 'lucide-react'

export default function NavbarAgence() {
  const pathname = usePathname()
  const router = useRouter()
  const [nomAgence, setNomAgence] = useState<string>('Chargement...')
  const [userName, setUserName] = useState<string>('')
  const [role, setRole] = useState<string>('staff')
  const [isMenuOpen, setIsMenuOpen] = useState(false)

  useEffect(() => {
    async function getProfileAndAgence() {
      try {
        const { data: userData, error: userError } = await getUser()
        if (userError) return

        const user = userData?.user
        if (!user) return

        const { data: profile, error: profileError } = await supabase
          .from('profiles')
          .select(`role, full_name, agence_id, agences ( nom_agence )`)
          .eq('id', user.id)
          .single()

        if (profile) {
          setRole(profile.role || 'staff')
          setUserName(profile.full_name || '')
          const agencyName = (profile.agences as any)?.nom_agence
          setNomAgence(agencyName || 'Mon Agence')
        }
      } catch (err) {
        console.error(err)
      }
    }
    getProfileAndAgence()
  }, [])

  const handleLogout = async () => {
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  // Vos liens d'origine de l'agence
  const menuItems = [
    { name: 'Dashboard', href: '/agence/dashboard', icon: LayoutDashboard },
    { name: 'Vendre', href: '/agence/nouvelle-operation', icon: PlusCircle },
    { name: 'Journal', href: '/agence/journal', icon: ClipboardList },
    { name: 'Comptabilité', href: '/agence/compta', icon: PieChart },
    { name: 'Quitter', href: '/', icon: SquareArrowRight },
  ]

  if (pathname === '/login') return null

  return (
    <>
      {/* --- DESKTOP NAVBAR --- */}
      <nav className="hidden md:block bg-white/80 backdrop-blur-md border-b border-gray-100 fixed top-0 left-0 right-0 z-50 shadow-sm print:hidden">
        <div className="max-w-7xl mx-auto px-8">
          <div className="flex justify-between items-center h-20">
            <Link href="/" className="flex items-center gap-3">
              <div className="w-10 h-10 bg-emerald-500 rounded-xl flex items-center justify-center shadow-lg shadow-emerald-500/20">
                <Building2 className="text-white w-5 h-5" />
              </div>
              <div className="flex flex-col">
                <span className="text-base font-black text-gray-900 tracking-tight leading-none uppercase">{nomAgence}</span>
                <span className="text-[9px] font-bold text-emerald-600 tracking-[0.15em] uppercase">Gestion Agence</span>
              </div>
            </Link>

            <div className="flex items-center gap-2">
              {/* Bouton Admin conditionnel - Desktop */}
              {role === 'admin' && (
                <Link href="/agence/admin" className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-black transition-all bg-amber-50 text-amber-700 hover:bg-amber-100 border border-amber-100/50 mr-2">
                  <ShieldCheck size={16} />
                  <span>Admin</span>
                </Link>
              )}

              {menuItems.map((item) => {
                const isActive = pathname === item.href
                return (
                  <Link 
                    key={item.name} 
                    href={item.href} 
                    className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-black transition-all ${
                      isActive 
                        ? 'bg-emerald-50 text-emerald-700' 
                        : 'text-gray-500 hover:bg-gray-50 hover:text-gray-900'
                    }`}
                  >
                    <item.icon size={16} className={isActive ? 'text-emerald-500' : 'text-gray-400'} />
                    <span>{item.name}</span>
                  </Link>
                )
              })}
            </div>

            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-gray-100 border border-gray-200 shadow-sm overflow-hidden">
                <Image src={`https://ui-avatars.com/api/?name=${userName || nomAgence}&background=f0fdf4&color=047857`} alt="Avatar" width={32} height={32} />
              </div>
              <button onClick={handleLogout} className="p-2 text-gray-400 hover:text-red-600 transition-colors">
                <LogOut size={18} />
              </button>
            </div>
          </div>
        </div>
      </nav>

      {/* --- MOBILE FLOATING UI --- */}
      <div className="md:hidden">
        <button 
          onClick={() => setIsMenuOpen(!isMenuOpen)}
          className="fixed bottom-6 right-6 z-[100] w-10 h-10 bg-emerald-600 text-white rounded-2xl shadow-2xl flex items-center justify-center transition-transform active:scale-90"
          aria-label="Toggle Menu"
        >
          {isMenuOpen ? <X size={28} /> : <Menu size={20} />}
        </button>

        {isMenuOpen && (
          <>
            <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[90]" onClick={() => setIsMenuOpen(false)} />
            <div className="fixed bottom-24 right-6 left-6 z-[95] bg-white rounded-[2.5rem] p-6 shadow-2xl border border-gray-100 animate-in fade-in zoom-in slide-in-from-bottom-10 duration-300">
              <div className="flex items-center gap-4 mb-8 pb-4 border-b border-gray-50">
                <div className="w-12 h-12 bg-emerald-50 rounded-2xl flex items-center justify-center">
                  <Building2 className="text-emerald-600" size={24} />
                </div>
                <div>
                  <p className="text-sm font-black text-gray-900 uppercase">{nomAgence}</p>
                  <p className="text-[10px] font-bold text-emerald-600 uppercase tracking-widest tracking-tighter">Menu Navigation</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                {/* Bouton Admin conditionnel - Mobile */}
                {role === 'admin' && (
                  <Link 
                    href="/agence/admin" 
                    onClick={() => setIsMenuOpen(false)}
                    className="flex flex-col items-center gap-3 p-4 rounded-3xl border bg-amber-50 border-amber-100 text-amber-700"
                  >
                    <ShieldCheck size={22} />
                    <span className="text-[10px] font-black uppercase text-center">Admin</span>
                  </Link>
                )}

                {menuItems.map((item) => {
                  const isActive = pathname === item.href
                  return (
                    <Link 
                      key={item.name} 
                      href={item.href} 
                      onClick={() => setIsMenuOpen(false)}
                      className={`flex flex-col items-center gap-3 p-4 rounded-3xl border transition-all ${
                        isActive 
                          ? 'bg-emerald-50 border-emerald-100 text-emerald-700' 
                          : 'bg-gray-50 border-transparent text-gray-500'
                      }`}
                    >
                      <item.icon size={22} className={isActive ? 'text-emerald-500' : 'text-gray-400'} />
                      <span className="text-[10px] font-black uppercase text-center">{item.name}</span>
                    </Link>
                  )
                })}
                
                <button 
                  onClick={handleLogout}
                  className="flex flex-col items-center gap-3 p-4 rounded-3xl bg-red-50 text-red-600 border border-red-100"
                >
                  <LogOut size={22} />
                  <span className="text-[10px] font-black uppercase">Déconnexion</span>
                </button>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Remplisseur d'espace en haut pour compenser la barre fixe sur desktop */}
      <div className="hidden md:block h-20" aria-hidden="true" />
    </>
  )
}