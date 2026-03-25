'use client'
import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { Users, FileCheck, FileWarning, PlaneTakeoff, ArrowRight, Wallet, ShieldCheck, Globe } from 'lucide-react'
import Link from 'next/link'

export default function Dashboard() {
  const [stats, setStats] = useState({
    total: 0,
    avecDoc: 0,
    sansDoc: 0,
    totalGouv: 0,
    totalNusuk: 0
  })

  const [recettes, setRecettes] = useState(0)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function fetchStats() {
      const { data, error } = await supabase.from('pelerins').select('*')
      if (!error && data) {
        const avec = data.filter(p => p.document_url).length
        const totalGouv = data.filter(p => p.sur_plateforme_gouv).length
        const totalNusuk = data.filter(p => p.sur_plateforme_nusuk).length
        
        setStats({
          total: data.length,
          avecDoc: avec,
          sansDoc: data.length - avec,
          totalGouv,
          totalNusuk
        })

        const totalRecettes = data.reduce(
          (acc: number, curr: { total_paye?: number }) => acc + (curr.total_paye || 0),
          0
        )
        setRecettes(totalRecettes)
      }
      setLoading(false)
    }
    fetchStats()
  }, [])

  // Liste des cartes avec les icônes contextuelles pour Gouv et Nusuk
  const cards = [
    { 
      label: 'Total Pèlerins', 
      value: stats.total, 
      icon: Users, 
      light: 'bg-blue-50', 
      textColor: 'text-blue-600' 
    },
    { 
      label: 'Dossiers Complets', 
      value: stats.avecDoc, 
      icon: FileCheck, 
      light: 'bg-emerald-50', 
      textColor: 'text-emerald-600' 
    },
    { 
      label: 'Dossiers Incomplets', 
      value: stats.sansDoc, 
      icon: FileWarning, 
      light: 'bg-amber-50', 
      textColor: 'text-amber-600' 
    },
    { 
      label: 'Plateforme Gouv', 
      value: stats.totalGouv, 
      icon: ShieldCheck, // Icône de bouclier/validation pour le gouvernement
      light: 'bg-teal-50', 
      textColor: 'text-teal-600' 
    },
    { 
      label: 'Portail Nusuk', 
      value: stats.totalNusuk, 
      icon: Globe, // Icône de globe pour le portail international Saoudien
      light: 'bg-indigo-50', 
      textColor: 'text-indigo-600' 
    },
    { 
      label: 'Encaissé (CFA)', 
      value: recettes.toLocaleString(), 
      icon: Wallet, 
      light: 'bg-green-50', 
      textColor: 'text-green-600' 
    }
  ]

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      <div className="mb-10">
        <h1 className="text-4xl font-black text-gray-900 tracking-tight">Tableau de Bord</h1>
        <p className="text-gray-500 font-medium mt-1">Bienvenue sur l'interface de gestion.</p>
      </div>

      {/* Grille uniforme de 6 cartes */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-12">
        {cards.map((card, index) => (
          <div key={index} className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm hover:shadow-md transition-shadow">
            <div className="flex justify-between items-start mb-4">
              <div className={`p-3 rounded-2xl ${card.light} ${card.textColor}`}>
                <card.icon size={28} />
              </div>
              <span className="text-xs font-black text-gray-300 uppercase tracking-widest">Aujourd'hui</span>
            </div>
            <div>
              <h3 className="text-4xl font-black text-gray-900 mb-1">
                {loading ? '...' : card.value}
              </h3>
              <p className="text-sm font-bold text-gray-500 uppercase tracking-tight">{card.label}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 bg-gradient-to-br from-blue-700 to-indigo-900 rounded-[2rem] p-10 text-white relative overflow-hidden shadow-2xl shadow-blue-200">
           <div className="relative z-10">
              <h2 className="text-3xl font-black mb-4 leading-tight">Prêt pour un <br/>nouveau départ ?</h2>
              <p className="text-blue-100 mb-8 max-w-sm font-medium">Enregistrez les nouveaux pèlerins et organisez les documents de voyage en quelques clics.</p>
              <Link href="/ajouter-pelerin" className="inline-flex items-center gap-2 bg-white text-blue-900 px-8 py-4 rounded-2xl font-black hover:bg-blue-50 transition-all transform active:scale-95 shadow-lg">
                Lancer une inscription <ArrowRight size={20} />
              </Link>
           </div>
           <div className="absolute -bottom-10 -right-10 w-64 h-64 bg-white/10 rounded-full blur-3xl"></div>
        </div>

        <div className="bg-white rounded-[2rem] border border-gray-100 p-8 shadow-sm">
          <h3 className="text-xl font-black text-gray-900 mb-6">Accès Rapide</h3>
          <div className="space-y-4">
            <Link href="/liste-pelerins" className="flex items-center justify-between p-4 rounded-2xl bg-gray-50 hover:bg-blue-50 group transition-all">
              <span className="font-bold text-gray-700 group-hover:text-blue-700">Consulter la liste</span>
              <ArrowRight size={18} className="text-gray-400 group-hover:text-blue-600" />
            </Link>
            <div className="p-4 rounded-2xl border-2 border-dashed border-gray-100 text-gray-400 font-bold text-sm text-center">
              D'autres modules arrivent bientôt...
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}