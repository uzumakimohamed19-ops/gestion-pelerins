'use client'

import { useEffect, useState, useMemo } from 'react'
import { supabase, getUser } from '@/lib/supabase'
import Link from 'next/link'
import Image from 'next/image'
import { usePathname, useRouter } from 'next/navigation'
import { 
  LayoutDashboard, 
  Users, 
  UserPlus, 
  FileText, 
  LogOut,
  Building2,
  ShieldCheck,
  SquareArrowRight,
  Menu,
  X,
  PieChart,
  BarChart3,
  MoreHorizontal,
  Plus,
  Globe 
} from 'lucide-react'

// Rayon (en px) de la courbe concave "inverted border radius"
const CONCAVE_R = 20

export default function Navbar() {
  const { hideNavbar } = (function safeUseUI() {
    try {
      // dynamic import inside component to avoid server-only execution errors
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { useUI } = require('@/lib/UIContext')
      return useUI()
    } catch (e) {
      return { hideNavbar: false }
    }
  })()

  if (hideNavbar) return null
  const pathname = usePathname()
  const router = useRouter()
  const [nomAgence, setNomAgence] = useState<string>('Chargement...')
  const [userName, setUserName] = useState<string>('')
  const [role, setRole] = useState<string>('staff')
  const [isMenuOpen, setIsMenuOpen] = useState(false)

  // États pour la gestion du scroll du bouton mobile
  const [isButtonVisible, setIsButtonVisible] = useState(true)
  const [lastScrollY, setLastScrollY] = useState(0)

  useEffect(() => {
    async function getProfileAndAgence() {
      try {
        const { data: userData } = await getUser()
        const user = userData?.user
        if (!user) return

        const { data: profile } = await supabase
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

  // Effet pour masquer le menu mobile au défilement vers le bas
  useEffect(() => {
    const handleScroll = () => {
      const currentScrollY = window.scrollY

      if (isMenuOpen) {
        setIsButtonVisible(true)
        return
      }

      if (currentScrollY > lastScrollY && currentScrollY > 20) {
        setIsButtonVisible(false)
      } else {
        setIsButtonVisible(true)
      }
      setLastScrollY(currentScrollY)
    }

    window.addEventListener('scroll', handleScroll, { passive: true })
    return () => window.removeEventListener('scroll', handleScroll)
  }, [lastScrollY, isMenuOpen])

  const handleLogout = async () => {
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  const navItems = [
    { name: 'Tableau de bord', href: '/hajj/dashboard', icon: LayoutDashboard },
    { name: 'Pèlerins', href: '/hajj/liste-pelerins', icon: Users },
    { name: 'Ajouter', href: '/hajj/ajouter-pelerin', icon: UserPlus },
    { name: 'Documents', href: '/hajj/documents', icon: FileText },
    { name: 'Plateforme MDH', href: '/hajj/nusuk', icon: Globe }, 
    { name: 'État général', href: '/hajj/etat-general', icon: BarChart3 },
    { name: 'Comptabilité', href: '/hajj/comptabilite', icon: PieChart },
    { name: 'Quitter', href: '/', icon: SquareArrowRight },
  ]

  // Les deux premiers blocs restent fixes à gauche quoi qu'il arrive (pour le mobile)
  const leftItems = useMemo(() => {
    return [
      { name: 'Tableau de bord', href: '/hajj/dashboard', icon: LayoutDashboard },
      { name: 'Pèlerins', href: '/hajj/liste-pelerins', icon: Users }
    ]
  }, [])

  // Les blocs de droite filtrent dynamiquement les pages restantes sans dupliquer la page active ni les blocs fixes de gauche
  const rightItems = useMemo(() => {
    return navItems.filter(item => 
      item.href !== '/hajj/dashboard' && 
      item.href !== '/hajj/liste-pelerins' && 
      pathname !== item.href
    ).slice(0, 2)
  }, [pathname])

  if (pathname === '/login') return null

  const avatarFallbackName = encodeURIComponent(userName || nomAgence || 'User')

  return (
    <>
      {/* 🧬 INJECTION COMMANDE CSS DYNAMIQUE */}
      <style jsx global>{`
        @media (max-width: 1023px) {
          body {
            padding-bottom: 6rem !important;
          }
        }
      `}</style>

      {/* 💻 DESKTOP SIDEBAR — plate, soudée au fond de page (pas d'ombre "carte flottante") */}
      <nav className="hidden lg:flex flex-col justify-between w-64 bg-gradient-to-b from-[#4A7DF0] via-[#6E97F2] to-[#DCE7FC] fixed top-0 bottom-0 left-0 z-50 p-6 print:hidden overflow-visible">
        
        {/* Section Haut : Logo + Menu de liens empilés verticalement */}
        <div className="flex flex-col gap-8">
          
          {/* LOGO & NOM AGENCE */}
          <Link href="/" className="flex items-center gap-3 shrink-0">
            <div className="w-11 h-11 bg-white rounded-2xl flex items-center justify-center shadow-md shrink-0">
              <Building2 className="text-blue-600 w-5 h-5" />
            </div>
            <div className="flex flex-col global-logo-text min-w-0">
              {/* Drapeau du Mali imprimé au-dessus du nom de l'agence */}
              <div 
                className="w-full h-[6px] rounded-[1px] flex overflow-hidden mb-1 shadow-[inset_0_1px_1px_rgba(255,255,255,0.6),_0_1px_2px_rgba(0,0,0,0.2)] border border-black/10"
                title="Drapeau du Mali"
              >
                <div className="flex-1 bg-[#14B53A] bg-gradient-to-b from-white/30 via-transparent to-black/20" />
                <div className="flex-1 bg-[#FCD116] bg-gradient-to-b from-white/30 via-transparent to-black/20" />
                <div className="flex-1 bg-[#CE1126] bg-gradient-to-b from-white/30 via-transparent to-black/20" />
              </div>

              <span className="text-sm font-black text-white truncate uppercase tracking-tight drop-shadow-sm">
                {nomAgence}
              </span>
              <span className="text-[9px] font-semibold text-blue-50/90 uppercase tracking-widest whitespace-nowrap mt-1">
                Plateforme Hajj
              </span>
            </div>
          </Link>

          {/* LINKS MENU VERTICAL */}
          <div className="flex flex-col gap-2">
            {role === 'admin' && (
              <Link 
                href="/hajj/admin"
                className="flex items-center gap-3 px-4 py-3 rounded-2xl text-sm font-bold bg-amber-400 text-amber-900 hover:bg-amber-300 transition-all mb-2 shadow-sm"
              >
                <div className="w-8 h-8 rounded-xl bg-white/40 flex items-center justify-center shrink-0">
                  <ShieldCheck size={16} />
                </div>
                <span>Admin</span>
              </Link>
            )}

            {navItems.map((item) => {
              const isActive = pathname === item.href
              return (
                <Link
                  key={item.name}
                  href={item.href}
                  className={`relative flex items-center gap-3 h-12 px-3 text-sm font-semibold transition-all duration-200
                    ${isActive
                      ? 'text-blue-600 font-bold'
                      : 'rounded-2xl text-white/90 hover:bg-white/15'
                    }`}
                  style={
                    isActive
                      ? {
                          background: '#f8fafc',
                          borderRadius: '24px 0 0 24px',
                          marginRight: '-24px',
                          paddingRight: '24px',
                        }
                      : undefined
                  }
                >
                  {/* 🩹 Patch concave HAUT — mord dans le bleu au-dessus de la pilule */}
                  {isActive && (
                    <span
                      aria-hidden
                      style={{
                        position: 'absolute',
                        right: 0,
                        top: -CONCAVE_R,
                        width: CONCAVE_R,
                        height: CONCAVE_R,
                        background: `radial-gradient(circle at bottom right, #f8fafc ${CONCAVE_R}px, transparent ${CONCAVE_R + 1}px)`,
                        pointerEvents: 'none',
                      }}
                    />
                  )}

                  <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 transition-all
                    ${isActive ? 'bg-blue-50' : 'bg-white/20'}`}>
                    <item.icon size={16} className={isActive ? 'text-blue-600' : 'text-white'} />
                  </div>
                  <span className="truncate">{item.name}</span>

                  {/* 🩹 Patch concave BAS — mord dans le bleu en-dessous de la pilule */}
                  {isActive && (
                    <span
                      aria-hidden
                      style={{
                        position: 'absolute',
                        right: 0,
                        bottom: -CONCAVE_R,
                        width: CONCAVE_R,
                        height: CONCAVE_R,
                        background: `radial-gradient(circle at top right, #f8fafc ${CONCAVE_R}px, transparent ${CONCAVE_R + 1}px)`,
                        pointerEvents: 'none',
                      }}
                    />
                  )}
                </Link>
              )
            })}
          </div>
        </div>

        {/* Section Bas : Profil & Déconnexion fixés au pied */}
        <div className="pt-4 border-t border-white/25 flex items-center justify-between">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-full bg-white/20 border-2 border-white/40 overflow-hidden shadow-inner shrink-0">
              <Image
                src={`https://ui-avatars.com/api/?name=${avatarFallbackName}&background=eff6ff&color=2563eb&bold=true`}
                alt="Avatar"
                width={36}
                height={36}
              />
            </div>
            <div className="flex flex-col min-w-0">
              <span className="text-xs font-bold text-white truncate">{userName || 'Utilisateur'}</span>
              <span className="text-[10px] text-blue-50/80 uppercase font-medium">{role}</span>
            </div>
          </div>
          
          <button
            onClick={handleLogout}
            className="p-2 text-white/80 hover:text-white hover:bg-white/15 rounded-xl transition-all shrink-0"
            title="Déconnexion"
          >
            <LogOut size={18} />
          </button>
        </div>
      </nav>

      {/* 📱 MOBILE NAV — inchangé */}
      <div className="lg:hidden">
        
        {/* BARRE DE NAVIGATION FIXE EN BAS AVEC EFFET DE FLOU */}
        <div 
          className="fixed bottom-0 left-0 right-0 h-20 bg-white/80 backdrop-blur-md border-t border-slate-100 rounded-t-[2.2rem] shadow-[0_-10px_30px_rgba(0,0,0,0.04)] z-[90] flex items-center justify-between px-4 pb-2"
        >
          {/* Éléments de gauche (Boutons 1 & 2 - FIXES) */}
          <div className="flex flex-1 justify-around items-center">
            {leftItems.map((item) => {
              const isActive = pathname === item.href
              return (
                <Link
                  key={item.name}
                  href={item.href}
                  className={`flex flex-col items-center justify-center gap-1 w-14 h-14 active:scale-90 transition-transform duration-150 ${isActive ? 'text-blue-600' : 'text-slate-400'}`}
                >
                  <item.icon size={22} className={isActive ? 'text-blue-600' : 'text-slate-400'} />
                  <span className={`text-[10px] font-medium truncate max-w-[65px] ${isActive ? 'text-blue-600 font-bold' : 'text-slate-400'}`}>{item.name.split(' ')[0]}</span>
                </Link>
              )
            })}
          </div>

          {/* 3ÈME BOUTON CENTRAL : LE GRAND BOUTON ROND SURÉLEVÉ (+ / X) */}
          <div className="relative w-16 h-16 flex items-center justify-center shrink-0 -translate-y-4">
            <button
              onClick={() => setIsMenuOpen(!isMenuOpen)}
              className={`w-16 h-16 rounded-full flex items-center justify-center text-white shadow-lg transition-all duration-300 active:scale-95 border-4 border-white
                ${isMenuOpen 
                  ? 'bg-rose-500 rotate-45 shadow-rose-300' 
                  : 'bg-[#2B3A67] shadow-slate-400'}`}
            >
              <Plus size={28} className="transition-transform duration-200" />
            </button>
          </div>

          {/* Éléments de droite (Boutons 3 & 4 - ROUTANTS) */}
          <div className="flex flex-1 justify-around items-center">
            {rightItems.map((item) => (
              <Link
                key={item.name}
                href={item.href}
                className="flex flex-col items-center justify-center gap-1 w-14 h-14 text-slate-400 active:scale-90 transition-transform duration-150"
              >
                <item.icon size={22} className="text-slate-400" />
                <span className="text-[10px] font-medium text-slate-400 truncate max-w-[65px]">{item.name.split(' ')[0]}</span>
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

        {/* COMPARTIMENT DROIT / TIROIR REBONDISSANT POUR LES AUTRES OPTIONS */}
        <div 
          className={`fixed bottom-0 left-0 right-0 z-[88] bg-white rounded-t-[2.5rem] border-t border-slate-100 shadow-2xl p-6 pb-28 max-h-[75vh] overflow-y-auto transition-transform duration-500 cubic-bezier(0.32, 0.94, 0.6, 1)
            ${isMenuOpen ? 'translate-y-0' : 'translate-y-full'}`}
        >
          <div className="w-12 h-1 bg-slate-200 rounded-full mx-auto mb-5" />

          <div className="flex items-center gap-4 mb-6 pb-4 border-b border-slate-100">
            <div className="w-10 h-10 bg-blue-50 border border-blue-100 rounded-xl flex items-center justify-center text-blue-600 font-bold shrink-0">
              <Building2 size={20} />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-black text-slate-800 truncate">{nomAgence}</p>
              <p className="text-[10px] font-bold text-blue-600 uppercase tracking-wider">Toutes les sections</p>
            </div>
          </div>

          {/* Grille de navigation du Drawer principal */}
          <div className="grid grid-cols-2 gap-2.5">
            {role === 'admin' && (
              <Link
                href="/hajj/admin"
                onClick={() => setIsMenuOpen(false)}
                className="flex flex-col items-center justify-center gap-2 p-3.5 rounded-2xl bg-amber-50 border border-amber-100 text-amber-700 active:scale-[0.98] transition-transform"
              >
                <ShieldCheck size={20} />
                <span className="text-[11px] font-black uppercase tracking-wide">Administration</span>
              </Link>
            )}

            {navItems.map((item) => {
              const isActive = pathname === item.href
              return (
                <Link
                  key={item.name}
                  href={item.href}
                  onClick={() => setIsMenuOpen(false)}
                  className={`flex flex-col items-center justify-center gap-2 p-3.5 rounded-2xl border transition-all active:scale-[0.98]
                    ${isActive
                      ? 'bg-blue-600 border-blue-600 text-white font-bold shadow-lg'
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
              className="flex flex-col items-center justify-center gap-2 p-3.5 rounded-2xl bg-rose-50 text-rose-600 border border-rose-100 col-span-2 mt-2 active:scale-[0.98] transition-transform"
            >
              <LogOut size={19} />
              <span className="text-[11px] font-black uppercase tracking-wider">Déconnexion</span>
            </button>
          </div>
        </div>
      </div>

      {/* Remplissage de l'espace haut réservé au PC */}
      <div className="hidden lg:block h-20" />
    </>
  )
}