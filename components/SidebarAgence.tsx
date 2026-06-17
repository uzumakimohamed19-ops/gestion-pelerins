'use client'

import { useEffect, useState, useMemo } from 'react'
import { supabase, getUser } from '@/lib/supabase'
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
  X,
  Plus,
  Contact 
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

  const menuItems = [
    { name: 'Dashboard', href: '/agence/dashboard', icon: LayoutDashboard },
    { name: 'Vendre', href: '/agence/nouvelle-operation', icon: PlusCircle },
    { name: 'Journal', href: '/agence/journal', icon: ClipboardList },
    { name: 'Comptabilité', href: '/agence/compta', icon: PieChart },
    { name: 'Contact', href: '/agence/contact', icon: Contact }, 
    { name: 'Quitter', href: '/', icon: SquareArrowRight },
  ]

  const remainingItems = useMemo(() => {
    return menuItems.filter(item => pathname !== item.href)
  }, [pathname, menuItems])

  const leftItems = useMemo(() => remainingItems.slice(0, 2), [remainingItems])
  const rightItems = useMemo(() => remainingItems.slice(2, 4), [remainingItems])

  if (pathname === '/login') return null

  return (
    <>
      {/* 🧬 INJECTION CSS LOCALISÉE */}
      <style jsx global>{`
        @media (max-width: 767px) {
          body {
            padding-bottom: 6rem !important;
          }
        }
      `}</style>

      {/* --- 💻 DESKTOP SIDEBAR (Transformée de Topbar à Sidebar) --- */}
      <nav className="hidden md:flex flex-col justify-between w-64 bg-white/80 backdrop-blur-md border-r border-gray-100 fixed top-0 bottom-0 left-0 z-50 shadow-sm p-6 print:hidden">
        
        {/* Section Haut : Logo & Agence */}
        <div className="flex flex-col gap-8">
          <Link href="/" className="flex items-center gap-3">
            <div className="w-10 h-10 bg-emerald-500 rounded-xl flex items-center justify-center shadow-lg shadow-emerald-500/20 shrink-0">
              <Building2 className="text-white w-5 h-5" />
            </div>
            <div className="flex flex-col min-w-0">
              <span className="text-base font-black text-gray-900 tracking-tight leading-none uppercase truncate">{nomAgence}</span>
              <span className="text-[9px] font-bold text-emerald-600 tracking-[0.15em] uppercase mt-1">Gestion Agence</span>
            </div>
          </Link>

          {/* Section Milieu : Liens de navigation */}
          <div className="flex flex-col gap-1.5">
            {role === 'admin' && (
              <Link href="/agence/admin" className="flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-black transition-all bg-amber-50 text-amber-700 hover:bg-amber-100 border border-amber-100/50 mb-2">
                <ShieldCheck size={18} />
                <span>Admin</span>
              </Link>
            )}

            {menuItems.map((item) => {
              const isActive = pathname === item.href
              return (
                <Link 
                  key={item.name} 
                  href={item.href} 
                  className={`flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-black transition-all ${
                    isActive 
                      ? 'bg-emerald-50 text-emerald-700' 
                      : 'text-gray-500 hover:bg-gray-50 hover:text-gray-900'
                  }`}
                >
                  <item.icon size={18} className={isActive ? 'text-emerald-500' : 'text-gray-400'} />
                  <span>{item.name}</span>
                </Link>
              )
            })}
          </div>
        </div>

        {/* Section Bas : Profil & Déconnexion */}
        <div className="pt-4 border-t border-gray-100 flex items-center justify-between">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-full bg-gray-100 border border-gray-200 shadow-sm overflow-hidden shrink-0">
              <Image src={`https://ui-avatars.com/api/?name=${userName || nomAgence}&background=f0fdf4&color=047857`} alt="Avatar" width={36} height={36} />
            </div>
            <div className="flex flex-col min-w-0">
              <span className="text-xs font-bold text-gray-700 truncate">{userName || 'Utilisateur'}</span>
              <span className="text-[10px] text-gray-400 capitalize">{role}</span>
            </div>
          </div>
          <button onClick={handleLogout} className="p-2 text-gray-400 hover:text-red-600 transition-colors shrink-0" title="Déconnexion">
            <LogOut size={18} />
          </button>
        </div>
      </nav>

      {/* --- 📱 MOBILE NAV PREMIUM (Strictement intacte) --- */}
      <div className="md:hidden">
        
        {/* BARRE DE NAVIGATION FIXE EN BAS */}
        <div 
          className="fixed bottom-0 left-0 right-0 h-20 bg-white/80 backdrop-blur-md border-t border-slate-100 rounded-t-[2.2rem] shadow-[0_-10px_30px_rgba(0,0,0,0.04)] z-[90] flex items-center justify-between px-4 pb-2"
        >
          {/* Éléments de gauche (Boutons 1 & 2) */}
          <div className="flex flex-1 justify-around items-center">
            {leftItems.map((item) => (
              <Link
                key={item.name}
                href={item.href}
                className="flex flex-col items-center justify-center gap-1 w-14 h-14 text-slate-400 active:scale-90 transition-transform duration-150"
              >
                <item.icon size={22} className="text-slate-400" />
                <span className="text-[10px] font-medium text-slate-400 truncate max-w-[65px]">{item.name}</span>
              </Link>
            ))}
          </div>

          {/* 3ÈME BOUTON CENTRAL : LE GRAND BOUTON ROND EMERAUDE (+ / X) */}
          <div className="relative w-16 h-16 flex items-center justify-center shrink-0 -translate-y-4">
            <button
              onClick={() => setIsMenuOpen(!isMenuOpen)}
              className={`w-16 h-16 rounded-full flex items-center justify-center text-white shadow-lg transition-all duration-300 active:scale-95 border-4 border-white
                ${isMenuOpen 
                  ? 'bg-rose-500 rotate-45 shadow-rose-300' 
                  : 'bg-emerald-600 shadow-emerald-200'}`}
            >
              <Plus size={28} className="transition-transform duration-200" />
            </button>
          </div>

          {/* Éléments de droite (Boutons 3 & 4) */}
          <div className="flex flex-1 justify-around items-center">
            {rightItems.map((item) => (
              <Link
                key={item.name}
                href={item.href}
                className="flex flex-col items-center justify-center gap-1 w-14 h-14 text-slate-400 active:scale-90 transition-transform duration-150"
              >
                <item.icon size={22} className="text-slate-400" />
                <span className="text-[10px] font-medium text-slate-400 truncate max-w-[65px]">{item.name}</span>
              </Link>
            ))}
          </div>
        </div>

        {/* MODALE DE FOND FLOUE */}
        <div 
          className={`fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-[85] transition-opacity duration-300 
            ${isMenuOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`}
          onClick={() => setIsMenuOpen(false)}
        />

        {/* COMPARTIMENT / TIROIR DE NAVIGATION MOBILE */}
        <div 
          className={`fixed bottom-0 left-0 right-0 z-[88] bg-white rounded-t-[2.5rem] border-t border-slate-100 shadow-2xl p-6 pb-28 max-h-[75vh] overflow-y-auto transition-transform duration-500 cubic-bezier(0.32, 0.94, 0.6, 1)
            ${isMenuOpen ? 'translate-y-0' : 'translate-y-full'}`}
        >
          <div className="w-12 h-1 bg-slate-200 rounded-full mx-auto mb-5" />

          <div className="flex items-center gap-4 mb-6 pb-4 border-b border-slate-100">
            <div className="w-10 h-10 bg-emerald-50 border border-emerald-100 rounded-xl flex items-center justify-center text-emerald-600 font-bold shrink-0">
              <Building2 size={20} />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-black text-slate-800 truncate uppercase">{nomAgence}</p>
              <p className="text-[10px] font-bold text-emerald-600 uppercase tracking-wider">Menu Général</p>
            </div>
          </div>

          {/* Grille complète du Drawer mobile */}
          <div className="grid grid-cols-2 gap-2.5">
            {role === 'admin' && (
              <Link
                href="/agence/admin"
                onClick={() => setIsMenuOpen(false)}
                className="flex flex-col items-center justify-center gap-2 p-3.5 rounded-2xl bg-amber-50 border border-amber-100 text-amber-700 active:scale-[0.98] transition-transform"
              >
                <ShieldCheck size={20} />
                <span className="text-[11px] font-black uppercase tracking-wide">Administration</span>
              </Link>
            )}

            {menuItems.map((item) => {
              const isActive = pathname === item.href
              return (
                <Link
                  key={item.name}
                  href={item.href}
                  onClick={() => setIsMenuOpen(false)}
                  className={`flex flex-col items-center justify-center gap-2 p-3.5 rounded-2xl border transition-all active:scale-[0.98]
                    ${isActive
                      ? 'bg-emerald-600 border-emerald-600 text-white font-bold shadow-lg shadow-emerald-100'
                      : 'bg-slate-50/50 border-slate-100 text-slate-600'
                    }`}
                >
                  <item.icon size={19} className={isActive ? 'text-white' : 'text-slate-400'} />
                  <span className="text-[11px] font-bold tracking-tight text-center truncate w-full">
                    {item.name}
                  </span>
                </Link>
              )
            })}

            {/* Bouton de déconnexion */}
            <button
              onClick={() => {
                setIsMenuOpen(false)
                handleLogout()
              }}
              className="flex flex-col items-center justify-center gap-2 p-3.5 rounded-2xl bg-red-50 text-red-600 border border-red-100 col-span-2 mt-2 active:scale-[0.98] transition-transform"
            >
              <LogOut size={19} />
              <span className="text-[11px] font-black uppercase tracking-wider">Déconnexion</span>
            </button>
          </div>
        </div>
      </div>
    </>
  )
}