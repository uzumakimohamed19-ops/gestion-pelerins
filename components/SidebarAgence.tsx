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
  Contact,
  LockKeyhole
} from 'lucide-react'
import { useWorkProfile } from '@/lib/ProfileContext'
import { useQuery } from '@powersync/react'

// Rayon (en px) de la courbe concave "inverted border radius"
const CONCAVE_R = 20

export default function NavbarAgence() {
  const pathname = usePathname()
  const router = useRouter()
  const { isDirection, clearProfile } = useWorkProfile()

  // 🔑 ID utilisateur connecté
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)

  const [nomAgence, setNomAgence] = useState<string>('Mon Agence')
  const [userName, setUserName] = useState<string>('')
  const [role, setRole] = useState<string>('staff')
  const [isMenuOpen, setIsMenuOpen] = useState(false)

  // 🌓 GESTION DU THÈME SOMBRE SANS CONFLIT DE RENDU REACT
  const [isDark, setIsDark] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('compta_theme_dark') === 'true'
    }
    return false
  })

  useEffect(() => {
    if (typeof window === 'undefined') return

    // ⚡ On diffère l'exécution dans le prochain tick pour éviter d'interrompre le rendu d'une autre page
    const syncTheme = () => {
      setTimeout(() => {
        const currentDark = localStorage.getItem('compta_theme_dark') === 'true'
        setIsDark((prev) => (prev !== currentDark ? currentDark : prev))
      }, 0)
    }

    // 1. Écoute des événements
    window.addEventListener('storage', syncTheme)
    window.addEventListener('theme-change', syncTheme)

    // 2. Interception asynchrone sécurisée de setItem
    const originalSetItem = localStorage.setItem
    localStorage.setItem = function (key: string, value: string) {
      originalSetItem.apply(this, [key, value])
      if (key === 'compta_theme_dark') {
        setTimeout(() => {
          window.dispatchEvent(new Event('theme-change'))
        }, 0)
      }
    }

    syncTheme()

    return () => {
      window.removeEventListener('storage', syncTheme)
      window.removeEventListener('theme-change', syncTheme)
      localStorage.setItem = originalSetItem
    }
  }, [])

  // Re-synchronisation propre lors des changements de page
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const currentDark = localStorage.getItem('compta_theme_dark') === 'true'
      setIsDark((prev) => (prev !== currentDark ? currentDark : prev))
    }
  }, [pathname])

  // 1. Détection immédiate du compte connecté
  useEffect(() => {
    async function loadCurrentUser() {
      try {
        const { data } = await supabase.auth.getSession()
        const uid = data.session?.user?.id
        if (uid) {
          setCurrentUserId(uid)
          const cachedAgence = localStorage.getItem(`cached_nom_agence_${uid}`)
          const cachedName = localStorage.getItem(`cached_user_name_${uid}`)
          const cachedRole = localStorage.getItem(`cached_user_role_${uid}`)
          if (cachedAgence) setNomAgence(cachedAgence)
          if (cachedName) setUserName(cachedName)
          if (cachedRole) setRole(cachedRole)
        } else {
          const { data: userData } = await getUser()
          if (userData?.user?.id) {
            setCurrentUserId(userData.user.id)
          }
        }
      } catch (err) {
        console.error('Erreur session utilisateur:', err)
      }
    }
    loadCurrentUser()
  }, [])

  // 2. ⚡ Requête PowerSync SQLite
  const { data: profileData } = useQuery<{
    role: string | null
    full_name: string | null
    nom_agence: string | null
  }>(
    `SELECT p.role, p.full_name, a.nom_agence
     FROM profiles p
     LEFT JOIN agences a ON p.agence_id = a.id
     WHERE p.id = ?
     LIMIT 1`,
    [currentUserId ?? '']
  )

  // 3. Mise à jour automatique des données profil
  useEffect(() => {
    if (!currentUserId || !profileData || profileData.length === 0) return

    const current = profileData[0]
    if (current) {
      if (current.nom_agence) {
        setNomAgence(current.nom_agence)
        localStorage.setItem(`cached_nom_agence_${currentUserId}`, current.nom_agence)
      }
      if (current.full_name) {
        setUserName(current.full_name)
        localStorage.setItem(`cached_user_name_${currentUserId}`, current.full_name)
      }
      if (current.role) {
        setRole(current.role)
        localStorage.setItem(`cached_user_role_${currentUserId}`, current.role)
      }
    }
  }, [profileData, currentUserId])

  const handleLogout = async () => {
    if (currentUserId) {
      localStorage.removeItem(`cached_nom_agence_${currentUserId}`)
      localStorage.removeItem(`cached_user_name_${currentUserId}`)
      localStorage.removeItem(`cached_user_role_${currentUserId}`)
    }
    await supabase.auth.signOut({ scope: 'local' })
    router.replace('/login')
    router.refresh()
  }

  const handleLock = () => {
    clearProfile()
    setIsMenuOpen(false)
    router.replace('/profile-selection')
  }

  const menuItems = [
    { name: 'Dashboard', href: '/agence/dashboard', icon: LayoutDashboard },
    { name: 'Vendre', href: '/agence/nouvelle-operation', icon: PlusCircle },
    ...(isDirection ? [{ name: 'Journal', href: '/agence/journal', icon: ClipboardList }] : []),
    ...(isDirection ? [{ name: 'Comptabilité', href: '/agence/compta', icon: PieChart }] : []),
    { name: 'Contact', href: '/agence/contact', icon: Contact }, 
    { name: 'Quitter', href: '/', icon: SquareArrowRight },
  ]

  const remainingItems = useMemo(() => menuItems, [menuItems])
  const leftItems = useMemo(() => remainingItems.slice(0, 2), [remainingItems])
  const rightItems = useMemo(() => remainingItems.slice(2, 4), [remainingItems])

  if (pathname === '/login') return null

  const avatarFallbackName = encodeURIComponent(userName || nomAgence || 'User')
  const concaveBgColor = isDark ? '#000000' : '#f8fafc'

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

      {/* --- 💻 DESKTOP SIDEBAR --- */}
      <nav className={`hidden md:flex flex-col justify-between w-64 fixed top-0 bottom-0 left-0 z-50 p-6 print:hidden overflow-visible transition-colors duration-150 ${
        isDark 
          ? 'bg-gradient-to-b from-[#1C1C1E] via-[#161618] to-[#0E0E10] border-r border-[#2C2C2E]' 
          : 'bg-gradient-to-b from-emerald-600 via-emerald-500 to-emerald-100'
      }`}>
        
        {/* Section Haut : Logo & Agence */}
        <div className="flex flex-col gap-8">
          <Link href="/" className="flex items-center gap-3 shrink-0">
            <div className={`w-11 h-11 rounded-2xl flex items-center justify-center shadow-md shrink-0 ${
              isDark ? 'bg-[#2C2C2E] text-[#34C759]' : 'bg-white text-emerald-600'
            }`}>
              <Building2 className="w-5 h-5" />
            </div>
            <div className="flex flex-col global-logo-text min-w-0">
              {/* Drapeau du Mali */}
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
              <span className={`text-[9px] font-semibold uppercase tracking-widest whitespace-nowrap mt-1 ${
                isDark ? 'text-[#8E8E93]' : 'text-emerald-50/90'
              }`}>
                Gestion Agence
              </span>
            </div>
          </Link>

          {/* Section Milieu : Liens avec découpe concave */}
          <div className="flex flex-col gap-2">
            {role === 'admin' && (
              <Link 
                href="/agence/admin" 
                className={`flex items-center gap-3 px-4 py-3 rounded-2xl text-sm font-bold transition-all mb-2 shadow-sm ${
                  isDark ? 'bg-[#FF9F0A]/20 text-[#FF9F0A] hover:bg-[#FF9F0A]/30 border border-[#FF9F0A]/30' : 'bg-amber-400 text-amber-900 hover:bg-amber-300'
                }`}
              >
                <div className="w-8 h-8 rounded-xl bg-white/30 flex items-center justify-center shrink-0">
                  <ShieldCheck size={16} />
                </div>
                <span>Admin</span>
              </Link>
            )}

            {menuItems.map((item) => {
              const isActive = pathname === item.href
              return (
                <Link 
                  key={item.name} 
                  href={item.href} 
                  className={`relative flex items-center gap-3 h-12 px-3 text-sm font-semibold transition-all duration-200 ${
                    isActive 
                      ? (isDark ? 'text-[#34C759] font-bold' : 'text-emerald-700 font-bold')
                      : 'rounded-2xl text-white/90 hover:bg-white/15'
                  }`}
                  style={
                    isActive
                      ? {
                          background: concaveBgColor,
                          borderRadius: '24px 0 0 24px',
                          marginRight: '-24px',
                          paddingRight: '24px',
                        }
                      : undefined
                  }
                >
                  {/* Patch concave HAUT */}
                  {isActive && (
                    <span
                      aria-hidden
                      style={{
                        position: 'absolute',
                        right: 0,
                        top: -CONCAVE_R,
                        width: CONCAVE_R,
                        height: CONCAVE_R,
                        background: `radial-gradient(circle at bottom right, ${concaveBgColor} ${CONCAVE_R}px, transparent ${CONCAVE_R + 1}px)`,
                        pointerEvents: 'none',
                      }}
                    />
                  )}

                  <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 transition-all ${
                    isActive 
                      ? (isDark ? 'bg-[#1C1C1E]' : 'bg-emerald-50') 
                      : 'bg-white/20'
                  }`}>
                    <item.icon size={16} className={isActive ? (isDark ? 'text-[#34C759]' : 'text-emerald-600') : 'text-white'} />
                  </div>
                  <span className="truncate">{item.name}</span>

                  {/* Patch concave BAS */}
                  {isActive && (
                    <span
                      aria-hidden
                      style={{
                        position: 'absolute',
                        right: 0,
                        bottom: -CONCAVE_R,
                        width: CONCAVE_R,
                        height: CONCAVE_R,
                        background: `radial-gradient(circle at top right, ${concaveBgColor} ${CONCAVE_R}px, transparent ${CONCAVE_R + 1}px)`,
                        pointerEvents: 'none',
                      }}
                    />
                  )}
                </Link>
              )
            })}
          </div>
        </div>

        {/* Section Bas : Profil & Déconnexion */}
        <div className="pt-4 border-t border-white/20 space-y-2">
          <button
            onClick={handleLock}
            className={`w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-2xl border text-sm font-black transition-all cursor-pointer ${
              isDark 
                ? 'bg-[#2C2C2E] border-[#38383A] text-[#F5F5F7] hover:bg-[#38383A]' 
                : 'bg-white/15 border-white/25 text-white hover:bg-white/25'
            }`}
            title="Verrouiller"
          >
            <LockKeyhole size={18} />
            <span>Verrouiller</span>
          </button>

          <div className={`flex items-center justify-between gap-3 rounded-2xl px-2 py-2 ${
            isDark ? 'bg-[#2C2C2E]/60 border border-[#38383A]' : 'bg-white/10'
          }`}>
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-9 h-9 rounded-full bg-white/20 border-2 border-white/40 overflow-hidden shadow-inner shrink-0">
                <Image 
                  src={`https://ui-avatars.com/api/?name=${avatarFallbackName}&background=f0fdf4&color=047857&bold=true`} 
                  alt="Avatar" 
                  width={36} 
                  height={36} 
                />
              </div>
              <div className="flex flex-col min-w-0">
                <span className="text-xs font-bold text-white truncate">{userName || 'Utilisateur'}</span>
                <span className={`text-[10px] uppercase font-medium ${isDark ? 'text-[#8E8E93]' : 'text-emerald-50/80'}`}>{role}</span>
              </div>
            </div>
            <button 
              onClick={handleLogout} 
              className="p-2 text-white/80 hover:text-white hover:bg-white/15 rounded-xl transition-all shrink-0 cursor-pointer" 
              title="Déconnexion"
            >
              <LogOut size={18} />
            </button>
          </div>
        </div>
      </nav>

      {/* --- 📱 MOBILE BOTTOM NAV & DRAWER --- */}
      <div className="md:hidden">
        
        {/* BARRE DE NAVIGATION FIXE EN BAS */}
        <div 
          className={`fixed bottom-0 left-0 right-0 h-20 backdrop-blur-md border-t rounded-t-[2.2rem] z-[90] flex items-center justify-between px-4 pb-2 transition-colors duration-150 ${
            isDark 
              ? 'bg-[#1C1C1E]/95 border-[#2C2C2E] shadow-[0_-10px_30px_rgba(0,0,0,0.5)]' 
              : 'bg-white/80 border-slate-100 shadow-[0_-10px_30px_rgba(0,0,0,0.04)]'
          }`}
        >
          {/* Éléments de gauche */}
          <div className="flex flex-1 justify-around items-center">
            {leftItems.map((item) => (
              <Link
                key={item.name}
                href={item.href}
                className={`flex flex-col items-center justify-center gap-1 w-14 h-14 active:scale-90 transition-transform duration-150 ${
                  isDark ? 'text-[#8E8E93]' : 'text-slate-400'
                }`}
              >
                <item.icon size={22} className={isDark ? 'text-[#8E8E93]' : 'text-slate-400'} />
                <span className={`text-[10px] font-medium truncate max-w-[65px] ${isDark ? 'text-[#8E8E93]' : 'text-slate-400'}`}>{item.name}</span>
              </Link>
            ))}
          </div>

          {/* Bouton central émeraude */}
          <div className="relative w-16 h-16 flex items-center justify-center shrink-0 -translate-y-4">
            <button
              onClick={() => setIsMenuOpen(!isMenuOpen)}
              className={`w-16 h-16 rounded-full flex items-center justify-center text-white shadow-lg transition-all duration-300 active:scale-95 border-4 cursor-pointer
                ${isDark ? 'border-[#1C1C1E]' : 'border-white'}
                ${isMenuOpen 
                  ? 'bg-rose-500 rotate-45 shadow-rose-300' 
                  : (isDark ? 'bg-[#34C759] text-black shadow-[#34C759]/20' : 'bg-emerald-600 shadow-emerald-200')}`}
            >
              <Plus size={28} className="transition-transform duration-200" />
            </button>
          </div>

          {/* Éléments de droite */}
          <div className="flex flex-1 justify-around items-center">
            {rightItems.map((item) => (
              <Link
                key={item.name}
                href={item.href}
                className={`flex flex-col items-center justify-center gap-1 w-14 h-14 active:scale-90 transition-transform duration-150 ${
                  isDark ? 'text-[#8E8E93]' : 'text-slate-400'
                }`}
              >
                <item.icon size={22} className={isDark ? 'text-[#8E8E93]' : 'text-slate-400'} />
                <span className={`text-[10px] font-medium truncate max-w-[65px] ${isDark ? 'text-[#8E8E93]' : 'text-slate-400'}`}>{item.name}</span>
              </Link>
            ))}
          </div>
        </div>

        {/* MODALE DE FOND FLOUE */}
        <div 
          className={`fixed inset-0 bg-black/60 backdrop-blur-xs z-[85] transition-opacity duration-300 
            ${isMenuOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`}
          onClick={() => setIsMenuOpen(false)}
        />

        {/* TIROIR DE NAVIGATION MOBILE */}
        <div 
          className={`fixed bottom-0 left-0 right-0 z-[88] rounded-t-[2.5rem] border-t shadow-2xl p-6 pb-28 max-h-[75vh] overflow-y-auto transition-transform duration-500 cubic-bezier(0.32, 0.94, 0.6, 1)
            ${isDark ? 'bg-[#1C1C1E] border-[#2C2C2E]' : 'bg-white border-slate-100'}
            ${isMenuOpen ? 'translate-y-0' : 'translate-y-full'}`}
        >
          <div className={`w-12 h-1 rounded-full mx-auto mb-5 ${isDark ? 'bg-[#38383A]' : 'bg-slate-200'}`} />

          <div className={`flex items-center gap-4 mb-6 pb-4 border-b ${isDark ? 'border-[#2C2C2E]' : 'border-slate-100'}`}>
            <div className={`w-10 h-10 border rounded-xl flex items-center justify-center font-bold shrink-0 ${
              isDark ? 'bg-[#2C2C2E] border-[#38383A] text-[#34C759]' : 'bg-emerald-50 border-emerald-100 text-emerald-600'
            }`}>
              <Building2 size={20} />
            </div>
            <div className="min-w-0 flex-1">
              <p className={`text-sm font-black truncate uppercase ${isDark ? 'text-[#F5F5F7]' : 'text-slate-800'}`}>{nomAgence}</p>
              <p className={`text-[10px] font-bold uppercase tracking-wider ${isDark ? 'text-[#34C759]' : 'text-emerald-600'}`}>Menu Général</p>
            </div>
          </div>

          {/* Grille du Drawer mobile */}
          <div className="grid grid-cols-2 gap-2.5">
            {role === 'admin' && (
              <Link
                href="/agence/admin"
                onClick={() => setIsMenuOpen(false)}
                className={`flex flex-col items-center justify-center gap-2 p-3.5 rounded-2xl border active:scale-[0.98] transition-transform ${
                  isDark ? 'bg-[#FF9F0A]/15 border-[#FF9F0A]/30 text-[#FF9F0A]' : 'bg-amber-50 border-amber-100 text-amber-700'
                }`}
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
                      ? (isDark ? 'bg-[#34C759] border-[#34C759] text-black font-bold' : 'bg-emerald-600 border-emerald-600 text-white font-bold shadow-lg shadow-emerald-100')
                      : (isDark ? 'bg-[#2C2C2E] border-[#38383A] text-[#D1D1D6]' : 'bg-slate-50/50 border-slate-100 text-slate-600')
                    }`}
                >
                  <item.icon size={19} className={isActive ? (isDark ? 'text-black' : 'text-white') : (isDark ? 'text-[#8E8E93]' : 'text-slate-400')} />
                  <span className="text-[11px] font-bold tracking-tight text-center truncate w-full">
                    {item.name}
                  </span>
                </Link>
              )
            })}

            {/* Bouton de verrouillage */}
            <button
              onClick={handleLock}
              className={`flex flex-col items-center justify-center gap-2 p-3.5 rounded-2xl border col-span-2 active:scale-[0.98] transition-transform cursor-pointer ${
                isDark ? 'bg-[#0A84FF]/15 text-[#0A84FF] border-[#0A84FF]/30' : 'bg-blue-50 text-blue-700 border-blue-100'
              }`}
            >
              <LockKeyhole size={19} />
              <span className="text-[11px] font-black uppercase tracking-wider">Verrouiller</span>
            </button>

            {/* Bouton de déconnexion */}
            <button
              onClick={() => {
                setIsMenuOpen(false)
                handleLogout()
              }}
              className={`flex flex-col items-center justify-center gap-2 p-3.5 rounded-2xl border col-span-2 mt-2 active:scale-[0.98] transition-transform cursor-pointer ${
                isDark ? 'bg-[#FF453A]/15 text-[#FF453A] border-[#FF453A]/30' : 'bg-red-50 text-red-600 border-red-100'
              }`}
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