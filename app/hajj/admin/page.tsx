'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import Link from 'next/link'
import { Building2, ArrowRight, Search, ShieldAlert, Users, Activity } from 'lucide-react'

export default function AdminPanel() {
  const [agences, setAgences] = useState<any[]>([])
  const [searchTerm, setSearchTerm] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchAgences()
  }, [])

  const fetchAgences = async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('agences')
      .select(`
        *,
        pelerins:pelerins(count)
      `)
      .order('nom_agence', { ascending: true })
    
    if (error) {
      console.error("Erreur:", error.message)
    } else {
      setAgences(data || [])
    }
    setLoading(false)
  }

  const agencesFiltrees = agences.filter((agence) =>
    agence.nom_agence?.toLowerCase().includes(searchTerm.toLowerCase())
  )

  if (loading) return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-4">
      <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
      <p className="font-black text-gray-400 uppercase tracking-widest text-xs">Chargement du Réseau...</p>
    </div>
  )

  return (
    <div className="max-w-7xl mx-auto px-4 md:px-6 py-6 md:py-12">
      
      {/* SECTION ENTÊTE */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 md:gap-8 mb-10 md:mb-16">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <Activity className="text-blue-600" size={20} />
            <span className="text-blue-600 font-black text-[10px] tracking-[0.3em] uppercase">Super Admin Control</span>
          </div>
          <h1 className="text-2xl md:text-4xl font-black text-gray-900 uppercase tracking-tighter">Gestion du Réseau</h1>
          <p className="text-gray-400 font-bold text-xs md:text-sm mt-1">{agences.length} agences partenaires enregistrées</p>
        </div>

        {/* BARRE DE RECHERCHE */}
        <div className="relative w-full md:w-96">
          <Search className="absolute left-5 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
          <input
            type="text"
            placeholder="Rechercher une agence..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-14 pr-6 py-4 bg-white border-2 border-gray-100 rounded-2xl shadow-sm outline-none focus:border-blue-600 focus:ring-4 focus:ring-blue-50 transition-all font-bold text-gray-700 text-sm md:text-base"
          />
        </div>
      </div>

      {/* GRILLE DES AGENCES RESONSIVE (2 BLOCS SUR MOBILE) */}
      <div className="grid grid-cols-2 md:grid-cols-2 lg:grid-cols-3 gap-3 md:gap-8">
        {agencesFiltrees.map((agence) => (
          <div key={agence.id} className="bg-white rounded-[1.8rem] md:rounded-[2.5rem] p-4 md:p-8 border border-gray-100 shadow-sm flex flex-col justify-between hover:shadow-xl hover:shadow-blue-900/5 transition-all group">
            
            <div>
              {/* Entête du bloc agence */}
              <div className="flex justify-between items-start mb-4 md:mb-6">
                <div className="w-10 h-10 md:w-14 md:h-14 bg-blue-50 text-blue-600 rounded-xl md:rounded-2xl flex items-center justify-center group-hover:bg-blue-600 group-hover:text-white transition-colors">
                  <Building2 className="w-5 h-5 md:w-7 md:h-7" />
                </div>
                <div className="flex flex-col items-end">
                  <div className="flex items-center gap-1 text-gray-400 font-bold text-[8px] md:text-[10px] uppercase bg-gray-50 px-2 md:px-3 py-1 md:py-1.5 rounded-full whitespace-nowrap">
                    <Users size={10} className="md:w-3 md:h-3" />
                    {agence.pelerins?.[0]?.count || 0} pél
                  </div>
                </div>
              </div>
              
              {/* Informations textuelles */}
              <h2 className="text-sm md:text-xl font-black text-gray-900 uppercase mb-0.5 md:mb-1 truncate" title={agence.nom_agence}>
                {agence.nom_agence}
              </h2>
              <p className="text-gray-400 text-[8px] md:text-[10px] font-mono mb-4 md:mb-8 uppercase tracking-tighter">
                UID: {agence.id.substring(0, 8)}...
              </p>
            </div>

            {/* Actions */}
            <div className="mt-2 md:mt-4">
              <Link 
                href={`/hajj/admin/agence/${agence.id}`}
                className="flex items-center justify-center gap-1 md:gap-2 w-full py-3 md:py-4 bg-gray-900 text-white rounded-xl md:rounded-2xl font-black text-[9px] md:text-[11px] uppercase hover:bg-blue-600 transition-all active:scale-95 shadow-lg shadow-gray-200"
              >
                <span className="hidden xs:inline">Superviser</span>
                <span className="xs:hidden">Gérer</span>
                <ArrowRight size={12} className="md:w-3.5 md:h-3.5" />
              </Link>
            </div>
          </div>
        ))}
      </div>

      {/* ÉTAT VIDE */}
      {agencesFiltrees.length === 0 && (
        <div className="text-center py-16 md:py-24 bg-gray-50 rounded-[2rem] md:rounded-[3rem] border-2 border-dashed border-gray-200">
          <ShieldAlert className="mx-auto text-gray-200 mb-4" size={48} />
          <p className="text-gray-400 font-black uppercase italic tracking-widest text-xs md:text-sm">Aucune agence trouvée</p>
        </div>
      )}
    </div>
  )
}