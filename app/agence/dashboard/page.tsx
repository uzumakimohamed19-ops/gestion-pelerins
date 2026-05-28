'use client'
import React, { useEffect, useState } from 'react'
import { supabase } from '../../../lib/supabase'
import { 
  TrendingUp, 
  Wallet, 
  Plane, 
  Plus, 
  Clock,
  Briefcase
} from 'lucide-react'
import Link from 'next/link'

interface Operation {
  id: string
  created_at: string
  client_nom: string
  type_activite: string
  prix_vente: number
  benefice: number
}

export default function DashboardAgence() {
  const [loading, setLoading] = useState(true)
  const [stats, setStats] = useState({
    caTotal: 0,
    beneficeTotal: 0,
    nombreVentes: 0
  })
  const [dernieresVentes, setDernieresVentes] = useState<Operation[]>([])

  useEffect(() => {
    async function chargerDonnees() {
      setLoading(true)
      
      const { data, error } = await supabase
        .from('operations_agence')
        .select('*')
        .order('created_at', { ascending: false })

      if (error) {
        console.error("Erreur Supabase:", error.message)
      } else if (data) {
        const totalCA = data.reduce((acc, curr) => acc + (curr.prix_vente || 0), 0)
        const totalBenef = data.reduce((acc, curr) => acc + (curr.benefice || 0), 0)
        
        setStats({
          caTotal: totalCA,
          beneficeTotal: totalBenef,
          nombreVentes: data.length
        })
        
        setDernieresVentes(data.slice(0, 5))
      }
      setLoading(false)
    }

    chargerDonnees()
  }, [])

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen font-black text-gray-300 animate-pulse text-xs uppercase tracking-widest p-4 text-center">
        Chargement des données réelles...
      </div>
    )
  }

  return (
    <div className="p-4 py-6 sm:p-8 space-y-6 sm:space-y-8 pb-24 sm:pb-8 max-w-5xl mx-auto">
      
      {/* HEADER */}
      <div className="flex justify-between items-center px-1">
        <div>
          <h1 className="text-xl sm:text-3xl font-black text-gray-900 tracking-tight uppercase">Tableau de Bord</h1>
          <p className="text-[11px] sm:text-sm text-gray-400 font-bold uppercase mt-0.5">Suivi des activités</p>
        </div>
        
        {/* Bouton - visible uniquement sur Tablette & Bureau */}
        <Link href="/agence/nouvelle-operation" className="hidden sm:flex bg-gray-900 text-white px-6 py-3 rounded-2xl font-black items-center gap-2 hover:bg-black transition-all shadow-md">
          <Plus size={20} /> Nouvelle Vente
        </Link>
      </div>

      {/* CARTES DE STATS RÉELLES */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 sm:gap-6">
        
        {/* CARTE : CA */}
        <div className="bg-white p-5 sm:p-8 rounded-3xl sm:rounded-[2.5rem] border border-gray-100 shadow-sm flex sm:flex-col justify-between items-center sm:items-start gap-4">
          <div className="min-w-0">
            <p className="text-[9px] sm:text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Chiffre d&apos;Affaires</p>
            <div className="flex items-baseline gap-1 flex-wrap">
              <h2 className="text-xl sm:text-3xl font-black text-gray-900 break-words">{stats.caTotal.toLocaleString()}</h2>
              <span className="text-[10px] font-bold text-gray-400">CFA</span>
            </div>
          </div>
          <div className="p-3 bg-blue-50 text-blue-600 rounded-2xl shrink-0">
            <Wallet size={20} />
          </div>
        </div>

        {/* CARTE : BENEFICE */}
        <div className="bg-emerald-600 p-5 sm:p-8 rounded-3xl sm:rounded-[2.5rem] shadow-xl shadow-emerald-100 text-white flex sm:flex-col justify-between items-center sm:items-start gap-4">
          <div className="min-w-0">
            <p className="text-[9px] sm:text-[10px] font-black text-emerald-200 uppercase tracking-widest mb-1">Bénéfice Net Total</p>
            <div className="flex items-baseline gap-1 flex-wrap">
              <h2 className="text-xl sm:text-3xl font-black break-words">{stats.beneficeTotal.toLocaleString()}</h2>
              <span className="text-[10px] font-bold opacity-70">CFA</span>
            </div>
          </div>
          <div className="p-3 bg-white/20 rounded-2xl shrink-0">
            <TrendingUp size={20} />
          </div>
        </div>

        {/* CARTE : ENREGISTREMENTS */}
        <div className="bg-white p-5 sm:p-8 rounded-3xl sm:rounded-[2.5rem] border border-gray-100 shadow-sm flex sm:flex-col justify-between items-center sm:items-start gap-4">
          <div className="min-w-0">
            <p className="text-[9px] sm:text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Total Opérations</p>
            <h2 className="text-xl sm:text-3xl font-black text-gray-900">{stats.nombreVentes}</h2>
          </div>
          <div className="p-3 bg-gray-100 text-gray-600 rounded-2xl shrink-0">
            <Plane size={20} />
          </div>
        </div>
      </div>

      {/* DERNIÈRES VENTES */}
      <div className="bg-white rounded-3xl sm:rounded-[2.5rem] p-5 sm:p-8 shadow-sm border border-gray-100">
        <h3 className="text-xs sm:text-sm font-black text-gray-900 uppercase tracking-widest mb-5 border-b border-gray-50 pb-3 sm:pb-0 sm:border-0">
          Dernières ventes
        </h3>
        
        {dernieresVentes.length === 0 ? (
          <div className="text-center py-10 text-gray-400 font-bold text-xs italic uppercase tracking-wider">
            Aucune vente enregistrée
          </div>
        ) : (
          <div className="space-y-3 sm:space-y-0">
            {dernieresVentes.map((vente) => (
              <div key={vente.id} className="flex flex-col sm:flex-row sm:items-center justify-between p-4 sm:p-4 border border-gray-100 sm:border-0 sm:border-b sm:border-gray-50 rounded-2xl sm:rounded-none last:border-0 bg-gray-50/40 sm:bg-transparent gap-3 sm:gap-0">
                
                <div className="flex items-center gap-3 sm:gap-4">
                  {/* Badge de Type d'Activité adaptable */}
                  <div className="px-2.5 py-1.5 bg-gray-900 text-white rounded-xl font-black text-[9px] tracking-wider uppercase shrink-0 flex items-center gap-1">
                    <Briefcase size={10} />
                    {vente.type_activite || 'VENTE'}
                  </div>
                  <div className="min-w-0">
                    <p className="font-black text-gray-900 uppercase text-xs sm:text-sm truncate">{vente.client_nom}</p>
                    <p className="text-[10px] text-gray-400 flex items-center gap-1 font-bold mt-0.5">
                      <Clock size={10} /> {new Date(vente.created_at).toLocaleDateString('fr-FR')}
                    </p>
                  </div>
                </div>

                {/* Section Prix & Bénéfices alignée à droite sur PC, répartie sur mobile */}
                <div className="flex sm:flex-col justify-between items-center sm:items-end border-t border-gray-100 sm:border-none pt-2 sm:pt-0">
                  <span className="text-[10px] font-bold text-gray-400 block sm:hidden uppercase">Montant & Marge :</span>
                  <div className="text-right">
                    <p className="font-black text-gray-900 text-sm sm:text-base">{vente.prix_vente.toLocaleString()} CFA</p>
                    <p className="text-[10px] sm:text-xs font-black text-emerald-600 mt-0.5">+{vente.benefice.toLocaleString()} CFA</p>
                  </div>
                </div>

              </div>
            ))}
          </div>
        )}
      </div>

      {/* BOUTON FLOTTANT MOBILE (FAB) : Modifié de bottom-6 à bottom-24 pour se placer au-dessus */}
      <div className="fixed bottom-20 right-4 z-40 sm:hidden">
        <Link 
          href="/agence/nouvelle-operation" 
          className="bg-gray-900 active:bg-black text-white h-10 w-10 rounded-full flex items-center justify-center shadow-xl shadow-gray-900/40 transition-all transform active:scale-95"
          aria-label="Nouvelle Vente"
        >
          <Plus size={28} />
        </Link>
      </div>

    </div>
  )
}