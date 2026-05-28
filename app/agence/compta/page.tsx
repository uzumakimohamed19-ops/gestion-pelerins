'use client'
import { useEffect, useState } from 'react'
import { supabase } from '../../../lib/supabase'
import { 
  ArrowLeft, 
  TrendingUp, 
  Wallet, 
  PieChart, 
  ChevronRight, 
  Layers, 
  AlertCircle, 
  CreditCard,
  Percent,
  RefreshCw,
  Home,
  BarChart2,
  Sliders
} from 'lucide-react'
import Link from 'next/link'

interface Stats {
  totalVentes: number
  totalAchats: number
  totalFraisAnnexes: number
  totalBenefice: number
  totalMontantVerse: number
  totalCreances: number // Ce que les clients nous doivent encore (Statut AVANCE ou NON_PAYE)
  count: number
  parType: { [key: string]: { ventes: number; benefice: number; count: number } }
  parModePaiement: { [key: string]: number }
}

export default function ComptabiliteAgence() {
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<'overview' | 'services' | 'modes'>('overview') // Navigation Mobile style native
  const [periode, setPeriode] = useState<'mois' | 'an' | 'tout'>('mois')
  const [filtreMode, setFiltreMode] = useState<string>('TOUS')
  const [stats, setStats] = useState<Stats>({
    totalVentes: 0,
    totalAchats: 0,
    totalFraisAnnexes: 0,
    totalBenefice: 0,
    totalMontantVerse: 0,
    totalCreances: 0,
    count: 0,
    parType: {},
    parModePaiement: {}
  })

  useEffect(() => {
    fetchStats()
  }, [periode, filtreMode])

  async function fetchStats() {
    setLoading(true)
    
    let query = supabase.from('operations_agence').select('*')

    // Filtrage chronologique strict
    if (periode === 'mois') {
      const dateDebut = new Date()
      dateDebut.setDate(1)
      dateDebut.setHours(0, 0, 0, 0)
      query = query.gte('created_at', dateDebut.toISOString())
    } else if (periode === 'an') {
      const dateDebut = new Date()
      dateDebut.setMonth(0, 1)
      dateDebut.setHours(0, 0, 0, 0)
      query = query.gte('created_at', dateDebut.toISOString())
    }

    // Filtre optionnel sur le mode de paiement
    if (filtreMode !== 'TOUS') {
      query = query.eq('mode_paiement', filtreMode)
    }

    const { data, error } = await query

    if (!error && data) {
      const s: Stats = {
        totalVentes: data.reduce((acc, op) => acc + (op.prix_vente || 0), 0),
        totalAchats: data.reduce((acc, op) => acc + (op.prix_achat || 0), 0),
        totalFraisAnnexes: data.reduce((acc, op) => acc + (op.frais_annexes || 0), 0),
        totalBenefice: data.reduce((acc, op) => acc + (op.benefice || 0), 0),
        totalMontantVerse: data.reduce((acc, op) => acc + (op.montant_verse || 0), 0),
        totalCreances: data.reduce((acc, op) => {
          const reste = (op.prix_vente || 0) - (op.montant_verse || 0)
          return acc + (reste > 0 ? reste : 0)
        }, 0),
        count: data.length,
        parType: {},
        parModePaiement: {}
      }

      data.forEach(op => {
        // Analyse par type d'activité
        if (!s.parType[op.type_activite]) {
          s.parType[op.type_activite] = { ventes: 0, benefice: 0, count: 0 }
        }
        s.parType[op.type_activite].ventes += (op.prix_vente || 0)
        s.parType[op.type_activite].benefice += (op.benefice || 0)
        s.parType[op.type_activite].count += 1

        // Analyse par mode de règlement
        const mode = op.mode_paiement || 'NON_DEFINI'
        s.parModePaiement[mode] = (s.parModePaiement[mode] || 0) + (op.prix_vente || 0)
      })

      setStats(s)
    }
    setLoading(false)
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 pb-32 md:py-8 px-0 md:px-4">
      <div className="max-w-6xl mx-auto">
        
        {/* EN-TÊTE CONFIGURATION COMPTABILITÉ (Desktop et Mobile) */}
        <div className="p-4 md:p-0 flex flex-col md:flex-row md:items-center justify-between mb-6 gap-4">
          <div>
            <Link href="/selection" className="hidden md:inline-flex items-center text-slate-500 hover:text-slate-900 font-bold mb-2 transition text-sm">
              <ArrowLeft className="mr-2" size={16} /> Retour au menu
            </Link>
            <h1 className="text-xl md:text-3xl font-black text-slate-900 tracking-tight uppercase flex items-center gap-2">
              <Layers className="text-emerald-600 md:hidden" size={20} />
              Tableau de Bord Compta
            </h1>
            <p className="text-xs text-slate-400 font-medium hidden md:block">Analyse financière temps réel liée à Supabase</p>
          </div>

          {/* SÉLECTEUR DE PÉRIODES / APPLICATIONS NATIVES */}
          <div className="flex items-center gap-2 overflow-x-auto pb-1 md:pb-0 scrollbar-none">
            <div className="bg-white p-1 rounded-xl border border-slate-200 shadow-sm flex flex-shrink-0">
              {(['mois', 'an', 'tout'] as const).map((p) => (
                <button
                  key={p}
                  onClick={() => setPeriode(p)}
                  className={`px-4 py-2 rounded-lg font-black text-xs transition-all uppercase ${periode === p ? 'bg-slate-900 text-white shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
                >
                  {p === 'mois' ? 'Ce mois' : p === 'an' ? 'Cette année' : 'Tout'}
                </button>
              ))}
            </div>

            <select
              value={filtreMode}
              onChange={(e) => setFiltreMode(e.target.value)}
              className="bg-white px-3 py-2 rounded-xl border border-slate-200 shadow-sm font-bold text-xs text-slate-700 outline-none focus:border-slate-900"
            >
              <option value="TOUS">Tous Modes</option>
              <option value="CASH">Espèces</option>
              <option value="ORANGE_MONEY">Orange Money</option>
              <option value="MOOV_MONEY">Moov Money</option>
              <option value="VIREMENT">Virement</option>
            </select>

            <button onClick={fetchStats} className="p-2.5 bg-white text-slate-600 border border-slate-200 rounded-xl hover:bg-slate-50 active:scale-95 transition-all shadow-sm">
              <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            </button>
          </div>
        </div>

        {loading ? (
          <div className="py-32 text-center font-black text-slate-300 animate-pulse text-lg uppercase tracking-widest">
            Extraction du grand livre comptable...
          </div>
        ) : (
          <div className="p-4 md:p-0 space-y-6">
            
            {/* VUE COMPLEMENTAIRE MOBILE / DESKTOP SELON L'ONGLET ACTIF */}
            
            {/* 1. ONGLET APPERÇU GLOBAL */}
            {((activeTab === 'overview') || (typeof window !== 'undefined' && window.innerWidth >= 768)) && (
              <div className={`${activeTab !== 'overview' ? 'hidden md:grid' : 'grid'} grid-cols-1 md:grid-cols-4 gap-4`}>
                
                {/* CHIFFRE D'AFFAIRES */}
                <div className="bg-white p-5 rounded-2xl border border-slate-200/60 shadow-sm relative overflow-hidden">
                  <div className="w-10 h-10 bg-blue-50 text-blue-600 rounded-xl flex items-center justify-center mb-3">
                    <Wallet size={20} />
                  </div>
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Chiffre d'Affaires brut</p>
                  <h2 className="text-2xl font-black text-slate-900 mt-1">{stats.totalVentes.toLocaleString()} <span className="text-xs font-bold text-slate-400">F</span></h2>
                  <div className="mt-2 flex items-center justify-between text-xs text-slate-400 font-bold border-t border-slate-50 pt-2">
                    <span>Volume</span>
                    <span className="text-blue-600 bg-blue-50 px-2 py-0.5 rounded-md">{stats.count} ops</span>
                  </div>
                </div>

                {/* COUTS ET ACHATS SOUSTRAITS */}
                <div className="bg-white p-5 rounded-2xl border border-slate-200/60 shadow-sm">
                  <div className="w-10 h-10 bg-red-50 text-red-600 rounded-xl flex items-center justify-center mb-3">
                    <PieChart size={20} />
                  </div>
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Coûts d'Achats nets</p>
                  <h2 className="text-2xl font-black text-slate-900 mt-1">{stats.totalAchats.toLocaleString()} <span className="text-xs font-bold text-slate-400">F</span></h2>
                  <div className="mt-2 flex items-center justify-between text-xs text-slate-400 font-bold border-t border-slate-50 pt-2">
                    <span>Frais annexes liés</span>
                    <span className="text-red-600 font-black">{stats.totalFraisAnnexes.toLocaleString()} F</span>
                  </div>
                </div>

                {/* CREANCES / RESTES A RECOUVRER */}
                <div className="bg-white p-5 rounded-2xl border border-slate-200/60 shadow-sm">
                  <div className="w-10 h-10 bg-amber-50 text-amber-600 rounded-xl flex items-center justify-center mb-3">
                    <AlertCircle size={20} />
                  </div>
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Créances dehors (Dettes Clients)</p>
                  <h2 className="text-2xl font-black text-amber-600 mt-1">{stats.totalCreances.toLocaleString()} <span className="text-xs font-bold text-amber-400">F</span></h2>
                  <div className="mt-2 flex items-center justify-between text-xs text-slate-400 font-bold border-t border-slate-50 pt-2">
                    <span>Montant déjà encaissé</span>
                    <span className="text-slate-700">{stats.totalMontantVerse.toLocaleString()} F</span>
                  </div>
                </div>

                {/* RESULTAT NET EXPLOITATION */}
                <div className="bg-gradient-to-br from-emerald-600 to-teal-700 p-5 rounded-2xl shadow-md text-white">
                  <div className="w-10 h-10 bg-white/20 text-white rounded-xl flex items-center justify-center mb-3">
                    <TrendingUp size={20} />
                  </div>
                  <p className="text-[10px] font-black text-emerald-100 uppercase tracking-wider">Bénéfice Réel Net</p>
                  <h2 className="text-2xl font-black text-white mt-1">{stats.totalBenefice.toLocaleString()} <span className="text-xs font-bold text-emerald-200">CFA</span></h2>
                  <div className="mt-2 flex items-center justify-between text-xs text-emerald-100 font-bold border-t border-white/10 pt-2">
                    <span className="inline-flex items-center gap-0.5"><Percent size={12} /> Taux Marge</span>
                    <span className="bg-white/20 px-2 py-0.5 rounded font-black">
                      {stats.totalVentes > 0 ? Math.round((stats.totalBenefice / stats.totalVentes) * 100) : 0}%
                    </span>
                  </div>
                </div>

              </div>
            )}

            {/* 2. RENTABILITÉ PAR SERVICE / ACTIVITÉ */}
            {((activeTab === 'services') || (typeof window !== 'undefined' && window.innerWidth >= 768)) && (
              <div className={`${activeTab !== 'services' ? 'hidden md:block' : 'block'} bg-slate-900 text-white rounded-3xl p-6 md:p-8 shadow-sm`}>
                <h3 className="text-sm font-black uppercase tracking-wider mb-6 flex items-center gap-2 text-slate-400">
                  <ChevronRight className="text-emerald-500" size={16} />
                  Performance par Segment de Services
                </h3>
                
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {Object.entries(stats.parType).map(([type, item]) => {
                    const partDuBenefice = stats.totalBenefice > 0 ? (item.benefice / stats.totalBenefice) * 100 : 0
                    const margeInterne = item.ventes > 0 ? (item.benefice / item.ventes) * 100 : 0

                    return (
                      <div key={type} className="bg-white/5 border border-white/10 rounded-2xl p-4 flex flex-col justify-between">
                        <div>
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-xs font-black uppercase text-emerald-400 bg-emerald-500/10 px-2.5 py-0.5 rounded-md tracking-wide">{type}</span>
                            <span className="text-[10px] text-slate-400 font-bold">{item.count} Transactions</span>
                          </div>
                          
                          <div className="space-y-1 my-3">
                            <div className="text-[10px] text-slate-400 uppercase font-bold">Marge Générée</div>
                            <div className="text-xl font-black">{item.benefice.toLocaleString()} <span className="text-xs text-slate-400">CFA</span></div>
                          </div>
                        </div>

                        <div className="space-y-2 pt-2 border-t border-white/5">
                          <div className="flex justify-between text-[10px] font-bold text-slate-400">
                            <span>Rentabilité du service</span>
                            <span className="text-white font-black">{Math.round(margeInterne)}%</span>
                          </div>
                          <div className="w-full bg-white/10 h-1.5 rounded-full overflow-hidden">
                            <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${Math.min(Math.max(partDuBenefice, 0), 100)}%` }}></div>
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {/* 3. FLUX DE TRÉSORERIE PAR MODE DE PAIEMENT */}
            {((activeTab === 'modes') || (typeof window !== 'undefined' && window.innerWidth >= 768)) && (
              <div className={`${activeTab !== 'modes' ? 'hidden md:block' : 'block'} bg-white rounded-3xl p-6 border border-slate-200/60 shadow-sm`}>
                <h3 className="text-sm font-black uppercase tracking-wider mb-4 flex items-center gap-2 text-slate-400">
                  <CreditCard className="text-blue-500" size={16} />
                  Canaux d'encaissement (C.A Volume)
                </h3>

                <div className="space-y-3">
                  {Object.entries(stats.parModePaiement).map(([mode, totalVolume]) => {
                    const pourcentageCanal = stats.totalVentes > 0 ? (totalVolume / stats.totalVentes) * 100 : 0
                    return (
                      <div key={mode} className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-3 bg-slate-50 rounded-xl border border-slate-100">
                        <div className="flex items-center gap-2">
                          <div className="w-2 h-2 rounded-full bg-blue-600" />
                          <span className="text-xs font-black text-slate-800 uppercase">{mode.replace('_', ' ')}</span>
                        </div>
                        <div className="flex items-center justify-between sm:justify-end gap-6">
                          <span className="text-xs font-medium text-slate-400">{Math.round(pourcentageCanal)}% du volume total</span>
                          <span className="text-sm font-black text-slate-900">{totalVolume.toLocaleString()} F</span>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

          </div>
        )}

        {/* BARRE DE NAVIGATION INFÉRIEURE FIXE (MOBILE UNIQUEMENT - STYLE APP NATIVE) */}
        <div className="md:hidden fixed bottom-0 left-0 right-0 bg-white/95 backdrop-blur-md border-t border-slate-200 px-6 py-2.5 flex justify-around items-center z-50 shadow-lg">
          <button 
            onClick={() => setActiveTab('overview')} 
            className={`flex flex-col items-center gap-1 transition-all ${activeTab === 'overview' ? 'text-emerald-600 scale-105' : 'text-slate-400'}`}
          >
            <Home size={18} />
            <span className="text-[9px] font-black uppercase tracking-tight">Vue Globale</span>
          </button>

          <button 
            onClick={() => setActiveTab('services')} 
            className={`flex flex-col items-center gap-1 transition-all ${activeTab === 'services' ? 'text-emerald-600 scale-105' : 'text-slate-400'}`}
          >
            <BarChart2 size={18} />
            <span className="text-[9px] font-black uppercase tracking-tight">Services</span>
          </button>

          <button 
            onClick={() => setActiveTab('modes')} 
            className={`flex flex-col items-center gap-1 transition-all ${activeTab === 'modes' ? 'text-emerald-600 scale-105' : 'text-slate-400'}`}
          >
            <Sliders size={18} />
            <span className="text-[9px] font-black uppercase tracking-tight">Canaux</span>
          </button>
        </div>

      </div>
    </div>
  )
}