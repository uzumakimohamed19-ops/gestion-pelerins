'use client'

import { useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { Search, Plus, X, Building2 } from 'lucide-react'

export default function MobileTopBar() {
  const router = useRouter()
  const searchParams = useSearchParams()
  
  const [nomAgence, setNomAgence] = useState<string>('Chargement...')
  const [searchTerm, setSearchTerm] = useState(searchParams.get('search') || '')
  const [showMobileSearch, setShowMobileSearch] = useState(false)

  useEffect(() => {
    async function getAgenceConnectee() {
      try {
        const { data: { user } } = await supabase.auth.getUser()
        if (user) {
          const { data: profileData } = await supabase
            .from('profiles')
            .select('agences(nom_agence)')
            .eq('id', user.id)
            .single()
          
          if (profileData?.agences?.nom_agence) {
            setNomAgence(profileData.agences.nom_agence)
          } else {
            setNomAgence('Gestion Globale Hajj')
          }
        }
      } catch (error) {
        setNomAgence('Plateforme Hajj')
      }
    }
    getAgenceConnectee()
  }, [])

  const handleSearchChange = (value: string) => {
    setSearchTerm(value)
    router.push(`/hajj/liste-pelerins?search=${encodeURIComponent(value)}`)
  }

  return (
    // Conteneur fixe avec marges pour créer l'effet de capsule flottante unique sur mobile
    <div className="fixed top-3 left-3 right-3 h-14 z-50 md:hidden print:hidden">
      
      {/* La capsule avec effet flou givré (Glassmorphism) et courbes prononcées (rounded-2xl) */}
      <div className="w-full h-full px-4 rounded-2xl bg-white/75 backdrop-blur-xl border border-white/60 shadow-[0_12px_40px_-12px_rgba(0,0,0,0.08)] flex items-center justify-between transition-all duration-300 ease-in-out">
        
        {showMobileSearch ? (
          /* 🔍 MODE RECHERCHE : TRANSITION ULTRA FLUIDE */
          <div className="flex items-center gap-2 w-full animate-in fade-in zoom-in-95 duration-200">
            <Search size={16} className="text-slate-400 shrink-0" />
            <input
              type="text"
              placeholder="Rechercher un pèlerin..."
              value={searchTerm}
              onChange={(e) => handleSearchChange(e.target.value)}
              className="flex-1 bg-slate-100/60 border border-slate-200/40 rounded-xl px-3 py-1.5 text-xs font-semibold text-slate-800 outline-none focus:border-blue-500/50 focus:bg-white/90 transition-all font-sans"
              autoFocus
            />
            <button 
              onClick={() => { setShowMobileSearch(false); handleSearchChange(''); }}
              className="p-1.5 bg-slate-100/80 hover:bg-slate-200 text-slate-500 rounded-xl active:scale-90 transition-all"
            >
              <X size={15} />
            </button>
          </div>
        ) : (
          /* 🏛️ MODE NORMAL : DESIGN RECHERCHÉ ET MODERNE */
          <>
            {/* Infos Agence */}
            <div className="flex items-center gap-2.5 min-w-0 flex-1">
              <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-blue-50 to-indigo-50 border border-blue-100/50 flex items-center justify-center text-blue-600 shrink-0 shadow-3xs">
                <Building2 size={15} />
              </div>
              <div className="flex flex-col min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="text-[9px] font-black text-blue-600 uppercase tracking-widest leading-none">
                    Bienvenue
                  </span>
                  {/* Petit point vert de synchronisation en direct qui pulse */}
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse block shrink-0" />
                </div>
                <h2 className="text-xs font-black text-slate-800 truncate pr-2 uppercase tracking-tight mt-0.5">
                  {nomAgence}
                </h2>
              </div>
            </div>

            {/* Boutons d'actions aux formes adoucies */}
            <div className="flex items-center gap-2 shrink-0">
              {/* Bouton Loupe épuré */}
              <button 
                onClick={() => setShowMobileSearch(true)}
                className="p-2 text-slate-600 bg-slate-50/80 border border-slate-100 rounded-xl active:scale-90 transition-all shadow-3xs"
              >
                <Search size={16} />
              </button>
              
              {/* Bouton Ajouter (+) en Dégradé Moderne */}
              <button 
                onClick={() => router.push('/hajj/ajouter-pelerin/')}
                className="p-2 bg-gradient-to-tr from-blue-600 to-indigo-600 text-white rounded-xl active:scale-90 transition-all shadow-md shadow-blue-600/20 hover:brightness-110"
              >
                <Plus size={16} />
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}