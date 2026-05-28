'use client'
import { useEffect, useState, useMemo, type ElementType } from 'react'
import { supabase } from '../../../lib/supabase'
import {
  Users, FileCheck, FileWarning, ArrowRight, Wallet,
  ShieldCheck, Globe, X, TrendingUp, AlertCircle,
  Download, Search, UserPlus, AlertTriangle, Filter, ChevronRight, FileSpreadsheet
} from 'lucide-react'
import Link from 'next/link'

type Pelerin = {
  id?: string | number
  prenom?: string
  nom_complet?: string
  telephone_pelerin?: string
  agences?: { nom_agence?: string }
  document_url?: string | null
  sur_plateforme_gouv?: boolean
  sur_plateforme_nusuk?: boolean
  total_paye?: number
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
}

type AlertType = 'amber' | 'red' | 'blue'

type AlertItem = {
  type: AlertType
  msg: string
  filter: string
}

type ModalState = {
  items: Pelerin[]
  title: string
} | null

// ─── Barre de progression micro épurée ────────────────────────────────────────
function Bar({ value, color }: { value: number; color: string }) {
  return (
    <div className="mt-3 h-1.5 w-full bg-slate-100 overflow-hidden rounded-full">
      <div
        className={`h-full rounded-full ${color} transition-all duration-700 ease-out`}
        style={{ width: `${Math.min(100, Math.max(0, value))}%` }}
      />
    </div>
  )
}

// ─── Stat Card premium ────────────────────────────────────────────────────────
function Tile({ card, loading, onClick }: { card: TileCard; loading: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      disabled={loading}
      className={`group text-left bg-white border ${card.borderColor} rounded-2xl p-5 hover:shadow-md hover:-translate-y-0.5 active:scale-[0.99] transition-all duration-300 flex flex-col justify-between w-full relative overflow-hidden shadow-sm`}
    >
      <div className="flex items-center justify-between w-full mb-4">
        <div className={`p-2.5 rounded-xl ${card.light} border border-white shadow-sm transition-transform group-hover:scale-105`}>
          <card.icon size={20} className={card.textColor} />
        </div>
        {card.tag && (
          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md uppercase tracking-wider bg-slate-50 text-slate-400 border border-slate-100`}>
            {card.tag}
          </span>
        )}
      </div>
      
      <div>
        {loading ? (
          <div className="h-8 w-24 bg-slate-100 rounded-lg animate-pulse mb-2" />
        ) : (
          <p className="text-2xl md:text-3xl font-black text-slate-900 leading-none tabular-nums tracking-tight mb-1.5">
            {card.value}
          </p>
        )}
        <p className="text-xs md:text-sm text-slate-500 font-medium tracking-wide uppercase">{card.label}</p>
      </div>

      {card.subtext && !loading && (
        <p className={`text-xs font-bold mt-2 ${card.textColor} bg-slate-50/50 px-2 py-1 rounded-lg border border-slate-100 inline-block w-max`}>
          {card.subtext}
        </p>
      )}
      
      {card.progress != null && !loading && (
        <Bar value={card.progress} color={card.progressColor ?? 'bg-slate-400'} />
      )}
    </button>
  )
}

// ─── Alertes latérales modernisées ───────────────────────────────────────────
const alertStyles = {
  amber: { dot: 'bg-amber-500', bg: 'hover:bg-amber-50/50', border: 'border-amber-100/70', text: 'text-amber-800' },
  red:   { dot: 'bg-red-500',   bg: 'hover:bg-red-50/50',   border: 'border-red-100/70',   text: 'text-red-800' },
  blue:  { dot: 'bg-blue-500',  bg: 'hover:bg-blue-50/50',  border: 'border-blue-100/70',  text: 'text-blue-800' },
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

// ─── Dashboard Principal ─────────────────────────────────────────────────────
export default function Dashboard() {
  const [stats, setStats] = useState({
    total: 0, avecDoc: 0, sansDoc: 0,
    totalGouv: 0, totalNusuk: 0,
    avecPaiement: 0, sansPaiement: 0,
    tauxCompletion: 0, montantMoyen: 0,
    tauxGouv: 0, tauxNusuk: 0, tauxPaiement: 0
  })
  const [recettes, setRecettes] = useState(0)
  const [loading, setLoading] = useState(true)
  const [allData, setAllData] = useState<Pelerin[]>([])
  const [agences, setAgences] = useState<string[]>([])
  const [modal, setModal] = useState<ModalState>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [agenceFilter, setAgenceFilter] = useState('all')
  const [activeTab, setActiveTab] = useState('all')

  useEffect(() => {
    async function fetchStats() {
      const { data, error } = await supabase.from('pelerins').select('*, agences(nom_agence)')
      if (!error && data) {
        const total = data.length
        const avec = data.filter(p => p.document_url).length
        const totalGouv = data.filter(p => p.sur_plateforme_gouv).length
        const totalNusuk = data.filter(p => p.sur_plateforme_nusuk).length
        const avecPaiement = data.filter(p => p.total_paye > 0).length
        const sansPaiement = total - avecPaiement
        const totalRecettes = data.reduce((acc, curr) => acc + (curr.total_paye || 0), 0)
        const pct = (n: number) => total > 0 ? Math.round((n / total) * 100) : 0
        
        setStats({
          total, avecDoc: avec, sansDoc: total - avec,
          totalGouv, totalNusuk, avecPaiement, sansPaiement,
          tauxCompletion: pct(avec),
          montantMoyen: avecPaiement > 0 ? Math.round(totalRecettes / avecPaiement) : 0,
          tauxGouv: pct(totalGouv), tauxNusuk: pct(totalNusuk), tauxPaiement: pct(avecPaiement)
        })
        setRecettes(totalRecettes)
        setAllData(data)
        setAgences([...new Set(data.map(p => p.agences?.nom_agence).filter(Boolean))].sort())
      }
      setLoading(false)
    }
    fetchStats()
  }, [])

  const alerts = useMemo(() => {
    if (!allData.length) return []
    const list: AlertItem[] = []
    if (stats.sansDoc > 0)
      list.push({ type: 'amber', msg: `${stats.sansDoc} dossier(s) sans documents joints`, filter: 'Dossiers Incomplets' })
    if (stats.sansPaiement > 0)
      list.push({ type: 'red', msg: `${stats.sansPaiement} pèlerin(s) sans aucun versement`, filter: 'En Attente' })
    if (stats.total - stats.totalNusuk > 0)
      list.push({ type: 'blue', msg: `${stats.total - stats.totalNusuk} pèlerin(s) non inscrits sur Nusuk`, filter: 'Portail Nusuk' })
    if (stats.total - stats.totalGouv > 0)
      list.push({ type: 'amber', msg: `${stats.total - stats.totalGouv} pèlerin(s) manquants sur Plateforme Gouv`, filter: 'Plateforme Gouv' })
    return list
  }, [stats, allData])

  function openModal(label: string) {
    const map: Record<string, { items: Pelerin[]; title: string }> = {
      'Total Pèlerins':     { items: allData, title: 'Tous les pèlerins' },
      'Dossiers Complets':  { items: allData.filter(p => p.document_url), title: 'Dossiers complets' },
      'Dossiers Incomplets':{ items: allData.filter(p => !p.document_url), title: 'Dossiers incomplets' },
      'Plateforme Gouv':    { items: allData.filter(p => p.sur_plateforme_gouv), title: 'Inscrits — Plateforme Gouv' },
      'Portail Nusuk':      { items: allData.filter(p => p.sur_plateforme_nusuk), title: 'Inscrits — Portail Nusuk' },
      'Encaissé (CFA)':      { items: allData.filter(p => (p.total_paye ?? 0) > 0), title: 'Pèlerins ayant payé' },
      'Paiements Reçus':    { items: allData.filter(p => (p.total_paye ?? 0) > 0), title: 'Pèlerins ayant payé' },
      'En Attente':         { items: allData.filter(p => (p.total_paye ?? 0) === 0), title: 'En attente de paiement' },
    }
    setModal(map[label] || { items: allData, title: label })
    setSearchQuery(''); setAgenceFilter('all'); setActiveTab('all')
  }

  const filteredItems = useMemo(() => {
    if (!modal) return []
    return modal.items.filter(p => {
      const matchSearch = `${p.prenom} ${p.nom_complet}`.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (p.telephone_pelerin && p.telephone_pelerin.includes(searchQuery))
      const matchAgence = agenceFilter === 'all' || p.agences?.nom_agence === agenceFilter
      const matchTab =
        activeTab === 'all' ? true :
        activeTab === 'avec_doc' ? !!p.document_url :
        activeTab === 'sans_doc' ? !p.document_url :
        activeTab === 'paye' ? (p.total_paye ?? 0) > 0 :
        activeTab === 'non_paye' ? (p.total_paye ?? 0) === 0 : true
      return matchSearch && matchAgence && matchTab
    })
  }, [modal, searchQuery, agenceFilter, activeTab])

  // ─── NOUVELLE FONCTION EXCEL (.XLSX) PROPRE ET PARFAITEMENT AUTOMATISÉE ───
  async function exportToExcel(items: Pelerin[], filename: string) {
    try {
      const XLSX = await import('xlsx')
      
      // Structuration propre des données pour les colonnes Excel
      const cleanRows = items.map((p) => ({
        'Prénom': p.prenom || '',
        'Nom Complet': p.nom_complet || '',
        'Téléphone': p.telephone_pelerin || '',
        'Agence Associée': p.agences?.nom_agence || 'Non spécifiée',
        'Montant Payé (CFA)': p.total_paye || 0,
        'Dossier Fourni': p.document_url ? 'Oui' : 'Non',
        'Inscrit Gouv': p.sur_plateforme_gouv ? 'Oui' : 'Non',
        'Inscrit Nusuk': p.sur_plateforme_nusuk ? 'Oui' : 'Non'
      }))

      const worksheet = XLSX.utils.json_to_sheet(cleanRows)
      const workbook = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Pèlerins')

      // Auto-ajustement de la largeur des colonnes pour un rendu pro sans texte coupé
      const colWidths = [
        { wch: 18 }, // Prénom
        { wch: 25 }, // Nom Complet
        { wch: 16 }, // Téléphone
        { wch: 22 }, // Agence
        { wch: 20 }, // Montant Payé
        { wch: 15 }, // Dossier
        { wch: 15 }, // Gouv
        { wch: 15 }, // Nusuk
      ]
      worksheet['!cols'] = colWidths

      // Génération et téléchargement du fichier final .xlsx
      XLSX.writeFile(workbook, `${filename.replace(/\s/g, '_')}_${new Date().toISOString().split('T')[0]}.xlsx`)
    } catch (err) {
      console.error("Erreur durant l'export Excel:", err)
    }
  }

  const derniersPelerins = allData.slice(-5).reverse()

  const mainCards = [
    {
      label: 'Total inscrits', value: stats.total, icon: Users,
      light: 'bg-slate-100', textColor: 'text-slate-600', borderColor: 'border-slate-100',
      progress: 100, progressColor: 'bg-slate-500'
    },
    {
      label: 'Dossiers complets', value: stats.avecDoc, icon: FileCheck,
      light: 'bg-emerald-50', textColor: 'text-emerald-600', borderColor: 'border-emerald-100',
      subtext: `${stats.tauxCompletion}% Validés`,
      progress: stats.tauxCompletion, progressColor: 'bg-emerald-500'
    },
    {
      label: 'Dossiers incomplets', value: stats.sansDoc, icon: FileWarning,
      light: 'bg-amber-50', textColor: 'text-amber-500', borderColor: 'border-amber-100',
      subtext: `${100 - stats.tauxCompletion}% Restants`,
      progress: 100 - stats.tauxCompletion, progressColor: 'bg-amber-500'
    },
    {
      label: 'Plateforme Gouv', value: stats.totalGouv, icon: ShieldCheck,
      light: 'bg-teal-50', textColor: 'text-teal-600', borderColor: 'border-teal-100',
      subtext: `${stats.tauxGouv}% Synchronisés`,
      progress: stats.tauxGouv, progressColor: 'bg-teal-500'
    },
    {
      label: 'Portail Nusuk', value: stats.totalNusuk, icon: Globe,
      light: 'bg-indigo-50', textColor: 'text-indigo-600', borderColor: 'border-indigo-100',
      subtext: `${stats.tauxNusuk}% Synchronisés`,
      progress: stats.tauxNusuk, progressColor: 'bg-indigo-500'
    },
    {
      label: 'Encaissé Global', value: `${recettes.toLocaleString('fr-FR')} CFA`, icon: Wallet,
      light: 'bg-emerald-50', textColor: 'text-emerald-600', borderColor: 'border-emerald-100',
      subtext: `Moy: ${stats.montantMoyen.toLocaleString('fr-FR')} / pèl.`, tag: 'Finance'
    },
    {
      label: 'Versements Reçus', value: stats.avecPaiement, icon: TrendingUp,
      light: 'bg-emerald-50', textColor: 'text-emerald-600', borderColor: 'border-emerald-100',
      subtext: `${stats.tauxPaiement}% à jour`,
      progress: stats.tauxPaiement, progressColor: 'bg-emerald-500', tag: 'KPI'
    },
    {
      label: 'En attente paiement', value: stats.sansPaiement, icon: AlertCircle,
      light: 'bg-rose-50', textColor: 'text-rose-600', borderColor: 'border-rose-100',
      subtext: `${100 - stats.tauxPaiement}% Non réglés`,
      progress: 100 - stats.tauxPaiement, progressColor: 'bg-rose-500', tag: 'KPI'
    },
  ]

  return (
    <div className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 pt-8 pb-16 w-full bg-slate-50/40 min-h-screen">

      {/* HEADER DE LA PAGE */}
      <div className="mb-8 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-100 pb-6">
        <div>
          <span className="text-[10px] font-black text-indigo-600 bg-indigo-50 px-2.5 py-1 rounded-md uppercase tracking-widest border border-indigo-100">Campagne Hajj 2025</span>
          <h1 className="text-2xl md:text-3xl font-black text-slate-900 tracking-tight mt-2">Tableau de gestion & de suivi</h1>
        </div>
        <div className="flex items-center flex-wrap gap-3">
          {!loading && (
            <span className="text-xs font-semibold text-slate-600 bg-white border border-slate-200/80 px-4 py-2.5 rounded-xl shadow-sm flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              <b className="text-slate-900">{stats.total}</b> pèlerins enregistrés
            </span>
          )}
          <Link
            href="/hajj/ajouter-pelerin"
            className="inline-flex items-center gap-2 bg-slate-900 text-white text-xs font-bold px-5 py-3 rounded-xl hover:bg-slate-800 active:scale-95 transition-all shadow-sm shadow-slate-950/20"
          >
            <UserPlus size={15} /> Nouveau pèlerin
          </Link>
        </div>
      </div>

      {/* WORKSPACE : DEUX COLONNES */}
      <div className="flex flex-col lg:flex-row gap-8 items-start w-full">

        {/* COLONNE GAUCHE (Grilles d'indicateurs & Listes principales) */}
        <div className="flex-1 min-w-0 w-full flex flex-col gap-6">

          {/* Grille responsive des cartes d'analyses */}
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
            {mainCards.map((card, i) => (
              <Tile key={i} card={card} loading={loading} onClick={() => !loading && openModal(card.label)} />
            ))}
          </div>

          {/* Section derniers pèlerins récents */}
          {derniersPelerins.length > 0 && (
            <div className="bg-white border border-slate-100 rounded-2xl overflow-hidden shadow-sm">
              <div className="px-5 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50/30">
                <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Flux des dernières inscriptions</p>
                <Link href="/hajj/liste-pelerins" className="text-xs text-indigo-600 font-bold hover:text-indigo-700 flex items-center gap-1 transition-colors">
                  Voir l&apos;intégralité <ArrowRight size={13} />
                </Link>
              </div>
              <ul className="divide-y divide-slate-100">
                {derniersPelerins.map((p, i) => (
                  <li key={p.id || i} className="px-5 py-4 flex items-center justify-between gap-4 hover:bg-slate-50/30 transition-colors">
                    <div className="flex items-center gap-3.5 min-w-0 flex-1">
                      <div className="w-9 h-9 rounded-xl bg-slate-100 border border-slate-200/50 flex items-center justify-center text-xs font-bold text-slate-700 shrink-0 shadow-inner">
                        {(p.prenom?.[0] || '?').toUpperCase()}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-bold text-slate-800 truncate">{p.prenom} {p.nom_complet}</p>
                        <div className="flex gap-1.5 mt-1.5 flex-wrap items-center">
                          {p.agences?.nom_agence && (
                            <span className="text-[10px] text-indigo-600 bg-indigo-50 border border-indigo-100/50 px-2 py-0.5 rounded-md font-semibold">{p.agences.nom_agence}</span>
                          )}
                          {p.document_url ? (
                            <span className="text-[10px] text-emerald-700 bg-emerald-50 border border-emerald-100/50 px-2 py-0.5 rounded-md font-semibold">✓ Dossier</span>
                          ) : (
                            <span className="text-[10px] text-amber-600 bg-amber-50 border border-amber-100/50 px-2 py-0.5 rounded-md font-semibold">✗ Manquant</span>
                          )}
                          {p.sur_plateforme_nusuk && (
                            <span className="text-[10px] text-purple-600 bg-purple-50 border border-purple-100/50 px-2 py-0.5 rounded-md font-semibold">Nusuk</span>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      {(p.total_paye ?? 0) > 0 ? (
                        <span className="text-xs font-black text-emerald-700 bg-emerald-50 border border-emerald-100 px-2.5 py-1 rounded-lg">{(p.total_paye ?? 0).toLocaleString('fr-FR')} CFA</span>
                      ) : (
                        <span className="text-xs font-semibold text-rose-500 bg-rose-50 border border-rose-100 px-2.5 py-1 rounded-lg">Non payé</span>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Raccourcis de navigation */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {[
              { label: 'Répertoire complet des pèlerins', href: '/hajj/liste-pelerins', desc: 'Gestion de la base, recherche & tris multicritères' },
              { label: 'Configuration de la plateforme', href: '/agence/dashboard', desc: 'Paramètres agences partenaires & quotas' },
            ].map((item, i) => (
              <Link
                key={i}
                href={item.href}
                className="flex items-center justify-between p-5 bg-white border border-slate-100 rounded-2xl hover:border-slate-300 hover:shadow-sm transition-all duration-300 group"
              >
                <div>
                  <p className="text-sm font-bold text-slate-800 group-hover:text-indigo-600 transition-colors">{item.label}</p>
                  <p className="text-xs text-slate-400 mt-1">{item.desc}</p>
                </div>
                <div className="p-1.5 rounded-lg bg-slate-50 text-slate-400 group-hover:bg-slate-900 group-hover:text-white transition-all shrink-0 ml-4">
                  <ArrowRight size={14} className="group-hover:translate-x-0.5 transition-transform" />
                </div>
              </Link>
            ))}
          </div>
        </div>

        {/* COLONNE DROITE (Widgets de contrôles & Actions de masse) */}
        <div className="w-full lg:w-80 xl:w-96 shrink-0 flex flex-col gap-5">

          {/* Boîte des alertes urgentes */}
          {!loading && alerts.length > 0 && (
            <div className="bg-white border border-slate-100 rounded-2xl overflow-hidden shadow-sm w-full">
              <div className="px-4 py-3.5 border-b border-slate-100 flex items-center gap-2 bg-slate-50/50">
                <AlertTriangle size={14} className="text-amber-500 animate-bounce" />
                <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Ajustements & Anomalies</p>
              </div>
              <div className="p-3 flex flex-col gap-2">
                {alerts.map((a, i) => (
                  <AlertPill key={i} alert={a} onClick={() => openModal(a.filter)} />
                ))}
              </div>
            </div>
          )}

          {/* Synthèse des taux de complétion */}
          {!loading && (
            <div className="bg-white border border-slate-100 rounded-2xl p-5 shadow-sm w-full">
              <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-4">Étapes clés du processus</p>
              {[
                { label: 'Dossiers justificatifs', pct: stats.tauxCompletion, color: 'bg-emerald-500' },
                { label: 'Paiements encaissés', pct: stats.tauxPaiement, color: 'bg-teal-500' },
                { label: 'Validations Gouv', pct: stats.tauxGouv, color: 'bg-indigo-500' },
                { label: 'Inscriptions Nusuk', pct: stats.tauxNusuk, color: 'bg-purple-500' },
              ].map((r, i) => (
                <div key={i} className="mb-4 last:mb-0">
                  <div className="flex justify-between items-center mb-1.5">
                    <span className="text-xs text-slate-600 font-medium">{r.label}</span>
                    <span className="text-xs font-black text-slate-800 tabular-nums">{r.pct}%</span>
                  </div>
                  <div className="h-2 bg-slate-100 rounded-full overflow-hidden shadow-inner">
                    <div className={`h-full rounded-full ${r.color} transition-all duration-1000 ease-out`} style={{ width: `${r.pct}%` }} />
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Action principale d'export Excel de toute la base */}
          <button
            onClick={() => !loading && exportToExcel(allData, 'Global_Hajj_2025')}
            disabled={loading}
            className="w-full flex items-center justify-between px-5 py-4 bg-white border border-dashed border-slate-200 rounded-2xl text-sm font-bold text-slate-600 hover:bg-slate-50 hover:border-slate-400 transition-all group shadow-sm"
          >
            <span className="flex items-center gap-2.5 text-slate-700">
              <FileSpreadsheet size={18} className="text-emerald-600 transition-transform group-hover:scale-110" />
              Exporter la base (EXCEL)
            </span>
            <span className="text-[10px] font-bold bg-slate-100 text-slate-400 px-2 py-0.5 rounded border border-slate-200 uppercase tracking-wide">.XLSX</span>
          </button>

          {/* Carte informative bas de page */}
          <div className="bg-slate-900 rounded-2xl p-5 text-white shadow-md w-full relative overflow-hidden">
            <div className="absolute -right-8 -bottom-8 opacity-10 text-white pointer-events-none">
              <Users size={120} />
            </div>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Assistance technique</p>
            <p className="text-xs text-slate-300 mb-4 leading-relaxed">Suivez en temps réel la conformité des données pour vos départs au Hajj.</p>
            <Link
              href="/hajj/ajouter-pelerin"
              className="inline-flex items-center gap-2 bg-white text-slate-900 text-xs font-bold px-4 py-2.5 rounded-xl hover:bg-slate-100 active:scale-95 transition-all w-full justify-center"
            >
              <UserPlus size={14} /> Enregistrer un nouveau dossier
            </Link>
          </div>
        </div>
      </div>

      {/* ── MODALE ADAPTATIVE (Responsive Bottom-Sheet sur Mobile / Centrée Desktop) ──────────────────────────────────────────────────────────── */}
      {modal && (
        <div
          className="fixed inset-0 z-[999] flex items-end sm:items-center justify-center bg-slate-900/60 backdrop-blur-sm p-0 sm:p-4 transition-all duration-300"
          onClick={() => setModal(null)}
        >
          <div
            className="bg-white w-full sm:max-w-3xl rounded-t-2xl sm:rounded-2xl shadow-2xl h-[85vh] sm:h-auto max-h-[85vh] sm:max-h-[calc(100vh-80px)] flex flex-col animate-in slide-in-from-bottom sm:zoom-in-95 duration-200"
            onClick={e => e.stopPropagation()}
          >
            {/* Barre d'appui tactile mobile */}
            <div className="w-12 h-1 bg-slate-200 rounded-full mx-auto my-3 sm:hidden shrink-0" />

            {/* Header de la modale */}
            <div className="flex items-center justify-between px-5 pb-4 pt-1 sm:py-4 border-b border-slate-100 shrink-0">
              <div>
                <h2 className="text-base sm:text-lg font-black text-slate-900">{modal.title}</h2>
                <p className="text-xs text-slate-400 mt-0.5 font-medium">{filteredItems.length} résultat(s) correspondant(s)</p>
              </div>
              <button onClick={() => setModal(null)} className="p-2 rounded-xl bg-slate-50 text-slate-400 hover:bg-slate-100 transition-colors border border-slate-100">
                <X size={16} />
              </button>
            </div>

            {/* Zone des filtres de la modale */}
            <div className="px-5 py-4 border-b border-slate-100 space-y-3 bg-slate-50/50 shrink-0">
              <div className="flex gap-2">
                <div className="flex-1 relative">
                  <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Chercher par nom, prénom, numéro..."
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    className="w-full pl-9 pr-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:border-indigo-500 bg-white shadow-sm font-medium transition-colors"
                  />
                </div>
                <button
                  onClick={() => exportToExcel(filteredItems, `Sélection_${modal.title}`)}
                  className="p-2.5 rounded-xl bg-slate-900 text-white hover:bg-slate-800 active:scale-95 transition-all shadow-sm flex items-center gap-1.5 text-xs font-bold"
                  title="Exporter ce segment"
                >
                  <FileSpreadsheet size={15} /> Export
                </button>
              </div>

              <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
                {agences.length > 0 && (
                  <div className="flex items-center gap-1.5 flex-1 bg-white border border-slate-200 rounded-xl px-2.5 py-1.5 shadow-sm">
                    <Filter size={13} className="text-slate-400 shrink-0" />
                    <select
                      value={agenceFilter}
                      onChange={e => setAgenceFilter(e.target.value)}
                      className="w-full text-xs focus:outline-none bg-transparent text-slate-700 font-semibold appearance-none cursor-pointer"
                    >
                      <option value="all">Toutes les agences</option>
                      {agences.map(a => <option key={a} value={a}>{a}</option>)}
                    </select>
                  </div>
                )}

                {/* Filtres internes par sous-onglets horizontaux */}
                <div className="flex gap-1 overflow-x-auto pb-0.5 pt-0.5 scrollbar-none">
                  {[
                    { key: 'all', label: 'Tous' },
                    { key: 'avec_doc', label: 'Dossier ok' },
                    { key: 'sans_doc', label: 'Dossier manquant' },
                    { key: 'paye', label: 'Réglo' },
                    { key: 'non_paye', label: 'Impayés' },
                  ].map(tab => (
                    <button
                      key={tab.key}
                      onClick={() => setActiveTab(tab.key)}
                      className={`text-[11px] font-bold px-3 py-1.5 rounded-lg border transition-all whitespace-nowrap shrink-0 ${
                        activeTab === tab.key
                          ? 'bg-slate-950 text-white border-slate-950 shadow-sm'
                          : 'bg-white text-slate-500 border-slate-200 hover:border-slate-300'
                      }`}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Corps de liste scrollable */}
            <div className="overflow-y-auto flex-1 px-5 py-4 bg-slate-50/20">
              {filteredItems.length === 0 ? (
                <div className="text-center py-12">
                  <AlertCircle size={32} className="mx-auto text-slate-300 mb-3" />
                  <p className="text-slate-400 text-sm font-medium">Aucun pèlerin trouvé sur ce filtre.</p>
                </div>
              ) : (
                <ul className="space-y-2">
                  {filteredItems.map((p, i) => (
                    <li key={p.id || i} className="px-4 py-3 rounded-xl bg-white hover:border-slate-300 border border-slate-100 transition-all flex items-center justify-between gap-3 shadow-sm">
                      <div className="flex items-center gap-3 min-w-0 flex-1">
                        <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center text-xs font-black text-slate-600 shrink-0 border border-slate-200/50">
                          {(p.prenom?.[0] || '?').toUpperCase()}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-bold text-slate-800 truncate">{p.prenom} {p.nom_complet}</p>
                          {p.telephone_pelerin && <p className="text-xs text-slate-400 font-medium">{p.telephone_pelerin}</p>}
                          <div className="flex flex-wrap gap-1 mt-1.5">
                            {p.agences?.nom_agence && <span className="text-[9px] font-bold text-indigo-600 bg-indigo-50 border border-indigo-100/50 px-1.5 py-0.5 rounded">{p.agences.nom_agence}</span>}
                            {p.document_url && <span className="text-[9px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-100/50 px-1.5 py-0.5 rounded">Dossier ✓</span>}
                            {p.sur_plateforme_gouv && <span className="text-[9px] font-bold text-teal-700 bg-teal-50 border border-teal-100/50 px-1.5 py-0.5 rounded">Gouv</span>}
                            {p.sur_plateforme_nusuk && <span className="text-[9px] font-bold text-purple-700 bg-purple-50 border border-purple-100/50 px-1.5 py-0.5 rounded">Nusuk</span>}
                          </div>
                        </div>
                      </div>
                      <div className="shrink-0 text-right">
                        {(p.total_paye ?? 0) > 0 ? (
                          <span className="text-xs font-black text-emerald-700 bg-emerald-50 border border-emerald-100 px-2 py-1 rounded-md">{(p.total_paye ?? 0).toLocaleString('fr-FR')} CFA</span>
                        ) : (
                          <span className="text-xs font-bold text-rose-500 bg-rose-50 border border-rose-100 px-2 py-1 rounded-md">Non payé</span>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* Footer de la modale */}
            <div className="px-5 py-4 border-t border-slate-100 flex justify-between items-center bg-slate-50/50 shrink-0 rounded-b-2xl">
              <span className="text-xs font-semibold text-slate-400">{filteredItems.length} affiché(s) sur {modal.items.length}</span>
              <button
                onClick={() => exportToExcel(filteredItems, modal.title)}
                className="text-xs font-bold text-slate-600 hover:text-indigo-600 flex items-center gap-1.5 transition-colors"
              >
                <Download size={14} /> Exporter cette sélection
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}