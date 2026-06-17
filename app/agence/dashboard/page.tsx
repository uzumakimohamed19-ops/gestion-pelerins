'use client'
import { useEffect, useState, useMemo, type ElementType } from 'react'
import { supabase } from '../../../lib/supabase'
import { cacheFirstFetch } from '@/lib/cacheFirst'
import {
  TrendingUp, Wallet, Plane, Plus, Clock, Briefcase,
  ShieldCheck, Globe, X, Search, UserPlus, AlertTriangle, 
  ChevronRight, FileSpreadsheet, Building2, Eye, EyeOff
} from 'lucide-react'
import Link from 'next/link'
import { get, set } from 'idb-keyval'

interface Operation {
  id: string
  created_at: string
  client_nom: string
  type_activite: string
  prix_vente: number
  benefice: number
}

type TileCard = {
  label: string
  value: number | string
  icon: ElementType<{ size?: number; className?: string }>
  light: string
  textColor: string
  borderColor: string
  subtext?: string
  progress?: number
  progressColor?: string
  tag?: string
  bgMobile?: string
}

type AlertType = 'amber' | 'red' | 'blue'

type AlertItem = {
  type: AlertType
  msg: string
  filter: string
}

type ModalState = {
  items: Operation[]
  title: string
} | null

function Bar({ value, color }: { value: number; color: string }) {
  return (
    <div className="mt-3 h-1.5 w-full bg-slate-100/70 overflow-hidden rounded-full">
      <div
        className={`h-full rounded-full ${color} transition-all duration-700 ease-out`}
        style={{ width: `${Math.min(100, Math.max(0, value))}%` }}
      />
    </div>
  )
}

function Tile({ card, loading, onClick }: { card: TileCard; loading: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      disabled={loading}
      className={`group text-left bg-white border ${card.borderColor} rounded-2xl p-5 hover:shadow-md hover:-translate-y-0.5 active:scale-[0.99] transition-all duration-300 flex flex-col justify-between w-full relative overflow-hidden shadow-sm h-full`}
    >
      <div className="flex items-center justify-between w-full mb-4">
        <div className={`p-2.5 rounded-xl ${card.light} border border-white shadow-sm transition-transform group-hover:scale-105`}>
          <card.icon size={20} className={card.textColor} />
        </div>
        {card.tag && (
          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md uppercase tracking-wider bg-slate-50 text-slate-400 border border-slate-100">
            {card.tag}
          </span>
        )}
      </div>
      
      <div className="min-w-0 w-full">
        {loading ? (
          <div className="h-8 w-24 bg-slate-100 rounded-lg animate-pulse mb-2" />
        ) : (
          <p className="text-xl md:text-2xl font-black text-slate-900 leading-tight tabular-nums tracking-tight mb-1.5 break-words">
            {card.value}
          </p>
        )}
        <p className="text-xs md:text-sm text-slate-500 font-medium tracking-wide uppercase truncate">{card.label}</p>
      </div>

      {card.subtext && !loading && (
        <p className={`text-xs font-bold mt-3 ${card.textColor} bg-slate-50/50 px-2.5 py-1.5 rounded-lg border border-slate-100 inline-block w-max max-w-full truncate`}>
          {card.subtext}
        </p>
      )}
      
      {card.progress != null && !loading && (
        <Bar value={card.progress} color={card.progressColor ?? 'bg-slate-400'} />
      )}
    </button>
  )
}

const alertStyles = {
  amber: { dot: 'bg-amber-500', bg: 'hover:bg-amber-50/50', border: 'border-amber-100/70' },
  red:   { dot: 'bg-red-500',   bg: 'hover:bg-red-50/50',   border: 'border-red-100/70' },
  blue:  { dot: 'bg-blue-500',  bg: 'hover:bg-blue-50/50',  border: 'border-blue-100/70' },
}

function AlertPill({ alert, onClick }: { alert: AlertItem; onClick: () => void }) {
  const s = alertStyles[alert.type] || alertStyles.amber
  return (
    <button
      onClick={onClick}
      className={`w-full text-left flex items-center gap-3 px-4 py-3 rounded-xl border ${s.border} bg-white ${s.bg} transition-all duration-200 group shadow-sm`}
    >
      <span className={`w-2 h-2 rounded-full shrink-0 animate-pulse ${s.dot}`} />
      <p className="text-xs md:text-sm text-slate-600 font-medium leading-snug flex-1 truncate">{alert.msg}</p>
      <ChevronRight size={14} className="text-slate-300 group-hover:text-slate-500 group-hover:translate-x-0.5 shrink-0 transition-all" />
    </button>
  )
}

export default function DashboardAgence() {
  const [loading, setLoading] = useState(true)
  const [allData, setAllData] = useState<Operation[]>()
  const [stats, setStats] = useState({
    caTotal: 0,
    beneficeTotal: 0,
    nombreVentes: 0,
    panierMoyen: 0,
    margeMoyenne: 0,
    tauxRentabilite: 0,
    hauteMarge: 0,
    pctHauteMarge: 0
  })
  
  const [modal, setModal] = useState<ModalState>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [activeTab, setActiveTab] = useState('all')

  const [showAmount, setShowAmount] = useState<boolean>(true)
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
    if (typeof window === 'undefined') return
    ;(async () => {
      try {
        const saved: any = await get('agence_show_amount')
        setShowAmount(saved !== undefined && saved !== null ? Boolean(saved) : true)
      } catch (e) {
        setShowAmount(true)
      }
    })()
  }, [])

  useEffect(() => {
    if (!mounted) return
    try { set('agence_show_amount', showAmount) } catch (e) { /* ignore */ }
  }, [showAmount, mounted])

  const dateDuJour = useMemo(() => {
    return new Date().toLocaleDateString('fr-FR', {
      weekday: 'long',
      day: 'numeric',
      month: 'long'
    })
  }, [])

  useEffect(() => {
    async function chargerDonnees() {
      await cacheFirstFetch<Operation[]>({
        cacheKey: 'agence_dashboard_operations',
        setLoading,
        fetchRemote: async () => {
          const { data, error } = await supabase
            .from('operations_agence')
            .select('*')
            .order('created_at', { ascending: false })
          if (error || !data) return undefined
          return data as Operation[]
        },
        onCache: (data) => {
          const count = data.length
          const totalCA = data.reduce((acc, curr) => acc + (curr.prix_vente || 0), 0)
          const totalBenef = data.reduce((acc, curr) => acc + (curr.benefice || 0), 0)
          const panierMoyen = count > 0 ? Math.round(totalCA / count) : 0
          const margeMoyenne = count > 0 ? Math.round(totalBenef / count) : 0
          const tauxRentabilite = totalCA > 0 ? Math.round((totalBenef / totalCA) * 100) : 0
          const hauteMarge = data.filter(o => o.prix_vente > 0 && (o.benefice / o.prix_vente) >= 0.2).length
          const pctHauteMarge = count > 0 ? Math.round((hauteMarge / count) * 100) : 0

          setStats({
            caTotal: totalCA,
            beneficeTotal: totalBenef,
            nombreVentes: count,
            panierMoyen,
            margeMoyenne,
            tauxRentabilite,
            hauteMarge,
            pctHauteMarge
          })
          setAllData(data)
        },
        onRemote: (data) => {
          const count = data.length
          const totalCA = data.reduce((acc, curr) => acc + (curr.prix_vente || 0), 0)
          const totalBenef = data.reduce((acc, curr) => acc + (curr.benefice || 0), 0)
          const panierMoyen = count > 0 ? Math.round(totalCA / count) : 0
          const margeMoyenne = count > 0 ? Math.round(totalBenef / count) : 0
          const tauxRentabilite = totalCA > 0 ? Math.round((totalBenef / totalCA) * 100) : 0
          const hauteMarge = data.filter(o => o.prix_vente > 0 && (o.benefice / o.prix_vente) >= 0.2).length
          const pctHauteMarge = count > 0 ? Math.round((hauteMarge / count) * 100) : 0

          setStats({
            caTotal: totalCA,
            beneficeTotal: totalBenef,
            nombreVentes: count,
            panierMoyen,
            margeMoyenne,
            tauxRentabilite,
            hauteMarge,
            pctHauteMarge
          })
          setAllData(data)
        }
      })
    }
    chargerDonnees()
  }, [])

  const alerts = useMemo(() => {
    if (!allData || !allData.length) return []
    const list: AlertItem[] = []
    
    const sansMarge = allData.filter(o => (o.benefice || 0) <= 0).length
    const sansType = allData.filter(o => !o.type_activite).length

    if (sansMarge > 0)
      list.push({ type: 'red', msg: `${sansMarge} opération(s) à marge nulle ou négative`, filter: 'Marge Nulle' })
    if (sansType > 0)
      list.push({ type: 'amber', msg: `${sansType} vente(s) sans type d'activité spécifié`, filter: 'Incomplet' })
    
    return list
  }, [allData])

  function openModal(label: string) {
    if (!allData) return
    const map: Record<string, { items: Operation[]; title: string }> = {
      "Chiffre d'Affaires":   { items: allData, title: "Toutes les ventes (CA)" },
      "Bénéfice Net Total":   { items: allData, title: "Suivi des profits nets" },
      "Total Opérations":     { items: allData, title: "Historique global" },
      "Ventes Haute Marge":   { items: allData.filter(o => o.prix_vente > 0 && (o.benefice / o.prix_vente) >= 0.2), title: "Performances Haute Marge" },
      "Marge Nulle":          { items: allData.filter(o => (o.benefice || 0) <= 0), title: "Alertes Marges Nulles" },
      "Incomplet":            { items: allData.filter(o => !o.type_activite), title: "Activités non spécifiées" }
    }
    setModal(map[label] || { items: allData, title: label })
    setSearchQuery(''); setActiveTab('all')
  }

  const filteredItems = useMemo(() => {
    if (!modal) return []
    return modal.items.filter(o => {
      const matchSearch = (o.client_nom || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
        (o.type_activite || '').toLowerCase().includes(searchQuery.toLowerCase())
      const matchTab =
        activeTab === 'all' ? true :
        activeTab === 'haute_marge' ? (o.prix_vente > 0 && (o.benefice / o.prix_vente) >= 0.2) :
        activeTab === 'basse_marge' ? ((o.benefice || 0) <= 0) : true
      return matchSearch && matchTab
    })
  }, [modal, searchQuery, activeTab])

  async function exportToExcel(items: Operation[], filename: string) {
    try {
      const XLSX = await import('xlsx')
      const cleanRows = items.map((o) => ({
        'Date': o.created_at ? new Date(o.created_at).toLocaleDateString('fr-FR') : '',
        'Client': o.client_nom || 'Inconnu',
        'Type Activité': o.type_activite || 'Non spécifié',
        'Chiffre d\'Affaires (CFA)': o.prix_vente || 0,
        'Bénéfice Net (CFA)': o.benefice || 0,
        'Rentabilité (%)': o.prix_vente > 0 ? Math.round((o.benefice / o.prix_vente) * 100) : 0
      }))

      const worksheet = XLSX.utils.json_to_sheet(cleanRows)
      const workbook = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Opérations')
      worksheet['!cols'] = [{ wch: 15 }, { wch: 25 }, { wch: 18 }, { wch: 22 }, { wch: 20 }, { wch: 15 }]
      XLSX.writeFile(workbook, `${filename.replace(/\s/g, '_')}_${new Date().toISOString().split('T')[0]}.xlsx`)
    } catch (err) {
      console.error("Erreur durant l'export Excel:", err)
    }
  }

  const dernieresVentes = allData ? allData.slice(0, 5) : []

  const mainCards: TileCard[] = [
    {
      label: "Chiffre d'Affaires", value: `${showAmount ? stats.caTotal.toLocaleString('fr-FR') : '••••••'} CFA`, icon: Wallet,
      light: 'bg-blue-50', textColor: 'text-blue-600', borderColor: 'border-blue-100',
      bgMobile: 'bg-white border-slate-100 text-slate-900', progress: 100, progressColor: 'bg-blue-500', tag: 'Finance'
    },
    {
      label: 'Bénéfice Net Total', value: `${showAmount ? stats.beneficeTotal.toLocaleString('fr-FR') : '••••••'} CFA`, icon: TrendingUp,
      light: 'bg-emerald-50', textColor: 'text-emerald-600', borderColor: 'border-emerald-100',
      bgMobile: 'bg-emerald-600 border-emerald-500 text-white', subtext: `${stats.tauxRentabilite}% Rentabilité`,
      progress: stats.tauxRentabilite, progressColor: 'bg-emerald-400'
    },
    {
      label: 'Total Opérations', value: stats.nombreVentes, icon: Briefcase,
      light: 'bg-purple-50', textColor: 'text-purple-600', borderColor: 'border-purple-100',
      bgMobile: 'bg-white border-slate-100 text-slate-900', subtext: 'Ventes enregistrées',
      progress: 100, progressColor: 'bg-purple-500'
    },
    {
      label: 'Panier Moyen', value: `${showAmount ? stats.panierMoyen.toLocaleString('fr-FR') : '••••••'} CFA`, icon: Globe,
      light: 'bg-cyan-50', textColor: 'text-cyan-600', borderColor: 'border-cyan-100',
      bgMobile: 'bg-white border-slate-100 text-slate-900', subtext: 'Par transaction'
    },
    {
      label: 'Marge Moyenne', value: `${showAmount ? stats.margeMoyenne.toLocaleString('fr-FR') : '••••••'} CFA`, icon: Clock,
      light: 'bg-amber-50', textColor: 'text-amber-500', borderColor: 'border-amber-100',
      bgMobile: 'bg-white border-slate-100 text-slate-900', subtext: 'Par opération'
    },
    {
      label: 'Ventes Haute Marge', value: stats.hauteMarge, icon: ShieldCheck,
      light: 'bg-teal-50', textColor: 'text-teal-600', borderColor: 'border-teal-100',
      bgMobile: 'bg-white border-slate-100 text-slate-900', subtext: `${stats.pctHauteMarge}% du volume`,
      progress: stats.pctHauteMarge, progressColor: 'bg-teal-500', tag: 'KPI'
    }
  ]

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen font-black text-slate-300 animate-pulse text-xs uppercase tracking-widest p-4 text-center">
        Chargement des données réelles...
      </div>
    )
  }

  return (
    <div className="w-full min-h-screen bg-slate-50/40 select-none pt-0">
      
      {/* 📱 AFFICHAGE MOBILE UNIQUE (`md:hidden`) ── COLLÉ EN HAUT */}
      <div className="block md:hidden pb-10">
      
        {/* En-tête Immersif Bleu - pt-4 pour épouser le haut parfaitement */}
        <div className="bg-gradient-to-b from-slate-800 to-slate-900 text-white px-5 pt-4 pb-14 rounded-b-[2.5rem] shadow-lg shadow-slate-900/10 relative overflow-hidden">
          
          <div className="absolute right-[-20px] bottom-[-20px] text-white/5 pointer-events-none transform -rotate-12 select-none">
            <Building2 size={220} />
          </div>

          <div className="flex items-start justify-between mb-6 relative z-10">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-white/20 border border-white/30 flex items-center justify-center font-black text-sm text-white backdrop-blur-md shrink-0">
                A
              </div>
              <div>
                <p className="text-[10px] font-bold text-white/50 uppercase tracking-[0.2em]">Tableau de bord</p>
                <h1 className="text-lg font-black tracking-tight">Agence 2026</h1>
              </div>
            </div>
            <button 
              onClick={() => setShowAmount(!showAmount)}
              className="w-10 h-10 rounded-full bg-white/10 border border-white/20 flex items-center justify-center backdrop-blur-md active:scale-90 transition-all"
            >
              {showAmount ? <Eye size={18} /> : <EyeOff size={18} />}
            </button>
          </div>

          <div className="relative z-10 bg-white/10 backdrop-blur-xl border border-white/20 rounded-3xl p-6 shadow-2xl">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-bold text-white/60 uppercase tracking-widest">Chiffre d'Affaires Global</p>
              <div className="px-2 py-0.5 rounded-md bg-emerald-500/20 border border-emerald-500/30 text-[10px] font-black text-emerald-400 uppercase">Live</div>
            </div>
            <div className="flex items-baseline gap-2">
              <h2 className="text-3xl font-black tracking-tighter tabular-nums">
                {showAmount ? stats.caTotal.toLocaleString('fr-FR') : '••••••'}
              </h2>
              <span className="text-sm font-bold text-white/40">CFA</span>
            </div>
            
            <div className="mt-6 pt-5 border-t border-white/10 flex justify-between items-center">
              <div>
                <p className="text-[10px] font-bold text-white/40 uppercase mb-1">Profit Net</p>
                <p className="text-sm font-black text-emerald-400">
                  {showAmount ? `+${stats.beneficeTotal.toLocaleString('fr-FR')}` : '••••••'} <span className="text-[10px]">CFA</span>
                </p>
              </div>
              <div className="text-right">
                <p className="text-[10px] font-bold text-white/40 uppercase mb-1">Rentabilité</p>
                <p className="text-sm font-black text-white">{stats.tauxRentabilite}%</p>
              </div>
            </div>
          </div>
        </div>

        {/* Grille de Stats Mobile */}
        <div className="px-5 -mt-8 relative z-20 grid grid-cols-2 gap-3">
          {mainCards.slice(2).map((card, i) => (
            <button
              key={i}
              onClick={() => openModal(card.label)}
              className={`p-4 rounded-3xl border shadow-sm text-left active:scale-[0.97] transition-all ${card.bgMobile || 'bg-white border-slate-100 text-slate-900'}`}
            >
              <div className={`w-8 h-8 rounded-xl flex items-center justify-center mb-3 ${card.bgMobile?.includes('bg-white') ? card.light : 'bg-white/20'}`}>
                <card.icon size={16} className={card.bgMobile?.includes('bg-white') ? card.textColor : 'text-white'} />
              </div>
              <p className={`text-[10px] font-bold uppercase tracking-wider mb-1 ${card.bgMobile?.includes('bg-white') ? 'text-slate-400' : 'text-white/60'}`}>
                {card.label}
              </p>
              <p className="text-lg font-black tabular-nums tracking-tight">
                {card.value}
              </p>
            </button>
          ))}
        </div>

        {/* Liste Activité Mobile */}
        <div className="px-5 mt-8">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-black text-slate-800 uppercase tracking-widest">Dernières Ventes</h3>
            <span className="text-[10px] font-bold text-slate-400 bg-slate-100 px-2 py-1 rounded-lg uppercase">{dateDuJour}</span>
          </div>

          {dernieresVentes.length > 0 ? (
            <div className="space-y-3">
              {dernieresVentes.map((v) => (
                <div key={v.id} className="bg-white border border-slate-100 p-4 rounded-2xl flex items-center justify-between gap-4 shadow-sm">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-10 h-10 rounded-xl bg-slate-50 border border-slate-100 flex items-center justify-center text-slate-400 shrink-0">
                      <Plane size={18} />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-slate-800 truncate">{v.client_nom}</p>
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-tighter truncate">{v.type_activite || 'Prestation'}</p>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-sm font-black text-slate-900 tabular-nums">
                      {showAmount ? `${v.prix_vente.toLocaleString('fr-FR')}` : '•••'}
                    </p>
                    <p className="text-[10px] font-bold text-emerald-500 tabular-nums">
                      {showAmount ? `+${v.benefice.toLocaleString('fr-FR')}` : '•••'}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="bg-slate-100/50 border-2 border-dashed border-slate-200 rounded-3xl p-10 text-center">
              <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Aucune donnée</p>
            </div>
          )}

          {alerts.length > 0 && (
            <div className="mt-8 space-y-2">
              <p className="text-[10px] font-black text-rose-500 uppercase tracking-[0.2em] mb-3 ml-1">Alertes Attention</p>
              {alerts.map((a, i) => (
                <AlertPill key={i} alert={a} onClick={() => openModal(a.filter)} />
              ))}
            </div>
          )}

          <button
            onClick={() => allData && exportToExcel(allData, 'Rapport_Operations_Agence')}
            className="w-full mt-8 flex items-center justify-center gap-2 p-3.5 bg-slate-900 text-white rounded-2xl text-xs font-bold shadow-md active:bg-slate-800 transition-colors"
          >
            <FileSpreadsheet size={16} className="text-emerald-400" />
            Exporter les données (.XLSX)
          </button>
        </div>
      </div>

      {/* 💻 AFFICHAGE PC UNIQUE ── pt-0 POUR COLLER COMPLÈTEMENT AU NAV BAR */}
      <div className="hidden md:block max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 pt-0 pb-16 w-full">
        
        {/* pt-5 rajouté ici uniquement pour donner de l'espace au texte sans décoller le bloc global */}
        <div className="pt-5 mb-8 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-100 pb-6">
          <div>
            <span className="text-[10px] font-black text-slate-600 bg-slate-100 px-2.5 py-1 rounded-md uppercase tracking-widest border border-slate-200">Suivi Agence 2026</span>
            <h1 className="text-2xl md:text-3xl font-black text-slate-900 tracking-tight mt-2">Tableau de gestion & de suivi</h1>
          </div>
          <div className="flex items-center flex-wrap gap-3">
            <button
              onClick={() => setShowAmount(!showAmount)}
              className="inline-flex items-center gap-2 bg-slate-100 text-slate-700 text-xs font-bold px-4 py-2.5 rounded-xl hover:bg-slate-200 active:scale-95 transition-all shadow-sm border border-slate-200"
            >
              {showAmount ? <Eye size={15} /> : <EyeOff size={15} />}
              {showAmount ? 'Masquer' : 'Afficher'}
            </button>
            <span className="text-xs font-semibold text-slate-600 bg-white border border-slate-200/80 px-4 py-2.5 rounded-xl shadow-sm flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              <b className="text-slate-900">{stats.nombreVentes}</b> opérations enregistrées
            </span>
            <Link
              href="/agence/nouvelle-operation"
              className="inline-flex items-center gap-2 bg-slate-900 text-white text-xs font-bold px-5 py-3 rounded-xl hover:bg-slate-800 active:scale-95 transition-all shadow-sm"
            >
              <Plus size={15} /> Nouvelle Vente
            </Link>
          </div>
        </div>

        <div className="flex flex-col lg:flex-row gap-8 items-start w-full">
          <div className="flex-1 min-w-0 w-full flex flex-col gap-6">
            <div className="grid grid-cols-2 xl:grid-cols-3 gap-6">
              {mainCards.map((card, i) => (
                <Tile key={i} card={card} loading={loading} onClick={() => openModal(card.label)} />
              ))}
            </div>

            {dernieresVentes.length > 0 && (
              <div className="bg-white border border-slate-100 rounded-2xl overflow-hidden shadow-sm">
                <div className="px-6 py-5 border-b border-slate-100 flex justify-between items-center bg-slate-50/30">
                  <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Flux des dernières ventes</p>
                </div>
                <ul className="divide-y divide-slate-100">
                  {dernieresVentes.map((v) => (
                    <li key={v.id} className="px-6 py-5 flex items-center justify-between gap-4 hover:bg-slate-50/30 transition-colors">
                      <div className="flex items-center gap-4 min-w-0 flex-1">
                        <div className="w-10 h-10 rounded-xl bg-slate-100 border border-slate-200/50 flex items-center justify-center text-xs font-bold text-slate-700 shrink-0">
                          <Plane size={18} />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-base font-bold text-slate-800 truncate">{v.client_nom}</p>
                          <div className="flex gap-2 mt-1.5 flex-wrap items-center">
                            <span className="text-[10px] text-slate-600 bg-slate-50 border border-slate-100 px-2 py-0.5 rounded-md font-semibold">
                              {v.type_activite || 'VENTE'}
                            </span>
                            <span className="text-[10px] text-slate-400 font-medium flex items-center gap-1">
                              <Clock size={11} /> {new Date(v.created_at).toLocaleDateString('fr-FR')}
                            </span>
                          </div>
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-base font-black text-slate-900 tabular-nums">
                          {showAmount ? v.prix_vente.toLocaleString('fr-FR') : '•••••'} <span className="text-xs text-slate-400">CFA</span>
                        </p>
                        <p className="text-sm font-black text-emerald-600 mt-0.5">
                          {showAmount ? `+${v.benefice.toLocaleString('fr-FR')}` : '•••••'} <span className="text-[10px] opacity-70">CFA</span>
                        </p>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          <div className="w-full lg:w-80 xl:w-96 shrink-0 flex flex-col gap-5">
            {alerts.length > 0 && (
              <div className="bg-white border border-slate-100 rounded-2xl overflow-hidden shadow-sm w-full">
                <div className="px-4 py-3.5 border-b border-slate-100 flex items-center gap-2 bg-slate-50/50">
                  <AlertTriangle size={14} className="text-amber-500" />
                  <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Anomalies détectées</p>
                </div>
                <div className="p-3 flex flex-col gap-2">
                  {alerts.map((a, i) => (
                    <AlertPill key={i} alert={a} onClick={() => openModal(a.filter)} />
                  ))}
                </div>
              </div>
            )}

            <div className="bg-white border border-slate-100 rounded-2xl p-6 shadow-sm w-full">
              <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-5">Processus Métiers</p>
              {[
                { label: 'Volume Rentabilité Haute Marge', pct: stats.pctHauteMarge, color: 'bg-teal-500' },
                { label: 'Taux Moyen d\'Efficacité Marge', pct: stats.tauxRentabilite, color: 'bg-emerald-500' },
              ].map((r, i) => (
                <div key={i} className="mb-5 last:mb-0">
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-xs text-slate-600 font-medium">{r.label}</span>
                    <span className="text-xs font-black text-slate-800">{r.pct}%</span>
                  </div>
                  <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                    <div className={`h-full rounded-full ${r.color} transition-all duration-1000`} style={{ width: `${r.pct}%` }} />
                  </div>
                </div>
              ))}
              
              <button
                onClick={() => allData && exportToExcel(allData, 'Global_Agence_Operations')}
                className="mt-6 w-full flex items-center justify-center gap-2 py-3 border border-slate-200 text-slate-700 bg-slate-50 rounded-xl text-xs font-bold hover:bg-slate-100 transition-colors"
              >
                <FileSpreadsheet size={14} className="text-emerald-600" /> Export Excel Global
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* MODALE RE-OPTIMISÉE */}
      {modal && (
        <div className="fixed inset-0 z-[999] flex items-end sm:items-center justify-center bg-slate-900/60 backdrop-blur-sm p-0 sm:p-4" onClick={() => setModal(null)}>
          <div className="bg-white w-full sm:max-w-3xl rounded-t-2xl sm:rounded-2xl shadow-2xl h-[85vh] sm:h-auto max-h-[85vh] sm:max-h-[calc(100vh-80px)] flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="w-12 h-1 bg-slate-200 rounded-full mx-auto my-3 sm:hidden shrink-0" />
            <div className="flex items-center justify-between px-5 pb-4 pt-1 sm:py-4 border-b border-slate-100 shrink-0">
              <div>
                <h2 className="text-base sm:text-lg font-black text-slate-900">{modal.title}</h2>
                <p className="text-xs text-slate-400 mt-0.5">{filteredItems.length} opération(s)</p>
              </div>
              <button onClick={() => setModal(null)} className="p-2 rounded-xl bg-slate-50 text-slate-400 border border-slate-100"><X size={16} /></button>
            </div>

            <div className="px-5 py-4 border-b border-slate-100 space-y-3 bg-slate-50/50 shrink-0">
              <div className="flex gap-2">
                <div className="flex-1 relative">
                  <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Rechercher par client ou activité..."
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    className="w-full pl-9 pr-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:border-blue-500 bg-white"
                  />
                </div>
              </div>
            </div>

            <div className="overflow-y-auto flex-1 px-5 py-4">
              <ul className="space-y-2">
                {filteredItems.map((o) => (
                  <li key={o.id} className="px-4 py-3 rounded-xl bg-white border border-slate-100 flex items-center justify-between gap-3 shadow-sm">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-bold text-slate-800 truncate">{o.client_nom}</p>
                      <p className="text-xs text-slate-400 uppercase font-semibold">{o.type_activite || 'VENTE INDÉFINIE'}</p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="text-xs font-black text-slate-900">{showAmount ? o.prix_vente.toLocaleString('fr-FR') : '•••••'} CFA</p>
                      <span className={`text-[10px] font-black px-1.5 py-0.5 rounded-md ${o.benefice > 0 ? 'text-emerald-700 bg-emerald-50' : 'text-rose-600 bg-rose-50'}`}>
                        {showAmount ? `+${o.benefice.toLocaleString('fr-FR')}` : '•••••'} Marge
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
