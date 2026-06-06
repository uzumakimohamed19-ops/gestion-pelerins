'use client'
import { useEffect, useState, useMemo, useRef, useCallback, type ElementType } from 'react'
import { supabase } from '@/lib/supabase'
import { cacheFirstFetch } from '@/lib/cacheFirst'
import { useYear } from '@/lib/YearContext'
import {
  Globe, ShieldCheck, FileCheck, FileWarning, Search, X,
  Filter, FileSpreadsheet, FileText, ArrowLeft, Building2,
  Wallet, CheckCircle2, AlertCircle, ChevronLeft, ChevronRight,
  SlidersHorizontal, CheckSquare, Square, Eye, CreditCard,
  RefreshCw, UserCheck, Download
} from 'lucide-react'
import Link from 'next/link'
import { YearSelector } from '@/components/YearSelector'

// ─── CLÉS SESSION STORAGE ─────────────────────────────────────────────────────
const SCROLL_KEY = 'nusuk_scroll_pos'
const FILTERS_KEY = 'nusuk_filters'

type Pelerin = {
  id: string
  prenom?: string
  nom_complet?: string
  telephone_pelerin?: string
  num_passeport?: string
  date_expiration?: string
  campagne?: string | number
  agences?: { nom_agence?: string }
  document_url?: string | null
  sur_plateforme_gouv?: boolean
  sur_plateforme_nusuk?: boolean
  total_paye?: number
}

// ─── MODAL DE CONFIRMATION EXPORT PDF ────────────────────────────────────────
type PdfConfirmModalProps = {
  isOpen: boolean
  onClose: () => void
  onConfirm: (includeFinance: boolean) => void
  title: string
  count: number
}

function PdfConfirmModal({ isOpen, onClose, onConfirm, title, count }: PdfConfirmModalProps) {
  if (!isOpen) return null
  return (
    <div className="fixed inset-0 z-[1100] flex items-center justify-center bg-slate-900/70 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 flex flex-col gap-5" onClick={e => e.stopPropagation()}>
        <div className="flex items-center gap-3">
          <div className="p-3 rounded-xl bg-indigo-50 border border-indigo-100">
            <FileText size={22} className="text-indigo-600" />
          </div>
          <div>
            <h3 className="text-base font-black text-slate-900">Exporter en PDF</h3>
            <p className="text-xs text-slate-400 mt-0.5">{count} pèlerin(s) — {title}</p>
          </div>
        </div>
        <div className="bg-amber-50 border border-amber-100 rounded-xl p-4">
          <p className="text-xs font-bold text-amber-800 mb-1 flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-500 inline-block" /> Données financières
          </p>
          <p className="text-xs text-amber-700 leading-relaxed">
            Souhaitez-vous inclure les <strong>montants versés</strong> et les statuts de paiement dans le rapport PDF ?
          </p>
        </div>
        <div className="flex flex-col gap-2">
          <button onClick={() => onConfirm(true)} className="w-full flex items-center justify-center gap-2 py-3 bg-indigo-600 text-white text-sm font-bold rounded-xl hover:bg-indigo-700 transition-colors">
            Inclure les données financières
          </button>
          <button onClick={() => onConfirm(false)} className="w-full flex items-center justify-center gap-2 py-3 bg-slate-100 text-slate-700 text-sm font-bold rounded-xl hover:bg-slate-200 transition-colors">
            Sans données financières
          </button>
          <button onClick={onClose} className="w-full py-2 text-xs text-slate-400 hover:text-slate-600 font-medium">Annuler</button>
        </div>
      </div>
    </div>
  )
}

// ─── EN-TÊTE ET LOGIQUE D'IMPRESSION DU RAPPORT PDF ──────────────────────────
function generateAndPrintPDF(items: Pelerin[], title: string, includeFinance: boolean, selectedYear: string | number) {
  const datePrint = new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
  const totalPaye = items.reduce((acc, p) => acc + (p.total_paye || 0), 0)

  const rows = items.map((p, i) => `
    <tr style="background:${i % 2 === 0 ? '#fff' : '#f8fafc'};">
      <td style="padding:10px 12px;color:#94a3b8;font-size:11px;font-weight:600;">${i + 1}</td>
      <td style="padding:10px 12px;">
        <div style="font-weight:700;color:#0f172a;font-size:13px;">${p.prenom || ''} ${p.nom_complet || ''}</div>
        <div style="color:#94a3b8;font-size:11px;margin-top:2px;">Passeport: ${p.num_passeport || '—'}</div>
      </td>
      <td style="padding:10px 12px;font-size:12px;color:#4338ca;font-weight:600;">${p.agences?.nom_agence || '—'}</td>
      <td style="padding:10px 12px;text-align:center;">${p.document_url ? '✓' : '✗'}</td>
      <td style="padding:10px 12px;text-align:center;color:#0d9488;font-weight:700;">${p.sur_plateforme_gouv ? '✓' : '—'}</td>
      <td style="padding:10px 12px;text-align:center;color:#7c3aed;font-weight:700;">${p.sur_plateforme_nusuk ? '✓' : '—'}</td>
      ${includeFinance ? `<td style="padding:10px 12px;text-align:right;font-weight:700;">${(p.total_paye || 0).toLocaleString('fr-FR')} CFA</td>` : ''}
    </tr>
  `).join('')

  const thStyle = `padding:10px 12px;font-size:11px;font-weight:700;text-transform:uppercase;color:#475569;background:#f1f5f9;border-bottom:2px solid #e2e8f0;`

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8" />
      <title>Rapport Nusuk — ${title}</title>
      <style>
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;900&display=swap');
        body { font-family: 'Inter', sans-serif; padding: 20px; color: #0f172a; }
        table { border-collapse: collapse; width: 100%; margin-top: 20px; }
        @media print { .no-print { display: none !important; } tr { page-break-inside: avoid; } }
      </style>
    </head>
    <body>
      <div style="background:linear-gradient(135deg,#7c3aed 0%,#4f46e5 100%);color:white;padding:24px;border-radius:12px;">
        <h1 style="font-size:22px;font-weight:900;">${title}</h1>
        <p style="font-size:12px;opacity:0.8;margin-top:4px;">Campagne Hajj ${selectedYear} — Généré le ${datePrint}</p>
        <p style="font-size:12px;font-weight:bold;margin-top:8px;">Total pèlerins : ${items.length}</p>
        ${includeFinance ? `<p style="font-size:14px;font-weight:900;margin-top:4px;">Volume financier : ${totalPaye.toLocaleString('fr-FR')} CFA</p>` : ''}
      </div>
      <table>
        <thead>
          <tr>
            <th style="${thStyle}width:40px;">#</th>
            <th style="${thStyle}">Pèlerin</th>
            <th style="${thStyle}">Agence</th>
            <th style="${thStyle}text-align:center;">Dossier</th>
            <th style="${thStyle}text-align:center;">Gouv</th>
            <th style="${thStyle}text-align:center;">Nusuk</th>
            ${includeFinance ? `<th style="${thStyle}text-align:right;">Payé</th>` : ''}
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
      <div class="no-print" style="position:fixed;bottom:24px;right:24px;display:flex;gap:10px;">
        <button onclick="window.print()" style="background:#7c3aed;color:white;border:none;padding:12px 24px;border-radius:8px;font-weight:700;cursor:pointer;">Imprimer PDF</button>
        <button onclick="window.close()" style="background:#f1f5f9;color:#475569;border:1px solid #e2e8f0;padding:12px 18px;border-radius:8px;cursor:pointer;">Fermer</button>
      </div>
    </body>
    </html>
  `
  const printWindow = window.open('', '_blank')
  if (printWindow) {
    printWindow.document.write(html)
    printWindow.document.close()
  }
}

export default function PageGestionNusuk() {
  const { selectedYear } = useYear()
  const [data, setData] = useState<Pelerin[]>([])
  // loading = vrai seulement si aucune donnée cache n'est encore arrivée
  const [loading, setLoading] = useState(true)
  // indicateur discret de synchronisation en arrière-plan (pas de spinner)
  const [isBgSyncing, setIsBgSyncing] = useState(false)
  const [lastSyncTime, setLastSyncTime] = useState<string | null>(null)
  const [agences, setAgences] = useState<string[]>([])
  
  // Simuler/Vérifier si l'utilisateur est admin (A adapter selon votre logique d'auth globale)
  const [isAdmin, setIsAdmin] = useState<boolean>(true)

  // States de Filtrage Avancé initialisés à partir du SessionStorage s'ils existent
  const [search, setSearch] = useState(() => {
    if (typeof window !== 'undefined') {
      try {
        const saved = sessionStorage.getItem(FILTERS_KEY)
        if (saved) return JSON.parse(saved).search || ''
      } catch {}
    }
    return ''
  })
  const [selectedAgence, setSelectedAgence] = useState(() => {
    if (typeof window !== 'undefined') {
      try {
        const saved = sessionStorage.getItem(FILTERS_KEY)
        if (saved) return JSON.parse(saved).selectedAgence || 'all'
      } catch {}
    }
    return 'all'
  })
  const [filterEligibility, setFilterEligibility] = useState<'all' | 'eligible' | 'non-eligible'>(() => {
    if (typeof window !== 'undefined') {
      try {
        const saved = sessionStorage.getItem(FILTERS_KEY)
        if (saved) return JSON.parse(saved).filterEligibility || 'all'
      } catch {}
    }
    return 'all'
  })
  const [filterGouv, setFilterGouv] = useState<'all' | 'true' | 'false'>(() => {
    if (typeof window !== 'undefined') {
      try {
        const saved = sessionStorage.getItem(FILTERS_KEY)
        if (saved) return JSON.parse(saved).filterGouv || 'all'
      } catch {}
    }
    return 'all'
  })
  const [filterNusuk, setFilterNusuk] = useState<'all' | 'true' | 'false'>(() => {
    if (typeof window !== 'undefined') {
      try {
        const saved = sessionStorage.getItem(FILTERS_KEY)
        if (saved) return JSON.parse(saved).filterNusuk || 'all'
      } catch {}
    }
    return 'all'
  })
  const [filterFinance, setFilterFinance] = useState<'all' | 'full' | 'partial' | 'none'>(() => {
    if (typeof window !== 'undefined') {
      try {
        const saved = sessionStorage.getItem(FILTERS_KEY)
        if (saved) return JSON.parse(saved).filterFinance || 'all'
      } catch {}
    }
    return 'all'
  })
  const [filterDoc, setFilterDoc] = useState<'all' | 'complet' | 'incomplet'>(() => {
    if (typeof window !== 'undefined') {
      try {
        const saved = sessionStorage.getItem(FILTERS_KEY)
        if (saved) return JSON.parse(saved).filterDoc || 'all'
      } catch {}
    }
    return 'all'
  })

  // UI States
  const [mobileFilterOpen, setMobileFilterOpen] = useState(false)
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [isUpdating, setIsUpdating] = useState(false)
  const [actionInProgressId, setActionInProgressId] = useState<string | null>(null)

  // Pagination
  const [currentPage, setCurrentPage] = useState(1)
  const itemsPerPage = 25

  // Modals d'exports
  const [pdfConfirmOpen, setPdfConfirmOpen] = useState(false)

  // ─── REF MÉMOIRE SCROLL ───────────────────────────────────────────────────
  const scrollRestored = useRef(false)
  const hasHadData = useRef(false)

  // ─── PERSISTANCE FILTRES EN TEMPS RÉEL ───────────────────────────────────
  useEffect(() => {
    try {
      sessionStorage.setItem(FILTERS_KEY, JSON.stringify({
        search, selectedAgence, filterEligibility,
        filterGouv, filterNusuk, filterFinance, filterDoc
      }))
    } catch {}
  }, [search, selectedAgence, filterEligibility, filterGouv, filterNusuk, filterFinance, filterDoc])

  // ─── RESTAURATION SCROLL APRÈS AFFICHAGE DU CACHE ─────────────────────────
  useEffect(() => {
    if (data.length > 0 && !scrollRestored.current) {
      scrollRestored.current = true
      try {
        const savedY = sessionStorage.getItem(SCROLL_KEY)
        if (savedY) {
          const target = parseInt(savedY, 10)
          requestAnimationFrame(() => {
            window.scrollTo({ top: target, behavior: 'instant' })
            sessionStorage.removeItem(SCROLL_KEY)
          })
        }
      } catch {}
    }
  }, [data])

  // ─── RACCOURCI CLAVIER : ESC vide la recherche ───────────────────────────
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && search) {
        setSearch('')
        setCurrentPage(1)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [search])

  // ─── SAUVEGARDE SCROLL AVANT NAVIGATION ───────────────────────────────────
  const saveScrollPosition = useCallback(() => {
    try {
      sessionStorage.setItem(SCROLL_KEY, String(window.scrollY))
    } catch {}
  }, [])

  // ─── ACTION UNIQUE : VALIDATION NUSUK DEPUIS LA LISTE ──────────────────────
  const toggleNusukStatus = async (id: string, currentStatus: boolean) => {
    setActionInProgressId(id)
    const targetValue = !currentStatus
    const { error } = await supabase.from('pelerins').update({ sur_plateforme_nusuk: targetValue }).eq('id', id)
    if (!error) {
      setData(prev => prev.map(p => p.id === id ? { ...p, sur_plateforme_nusuk: targetValue } : p))
    }
    setActionInProgressId(null)
  }

  // ─── CHARGEMENT DONNÉES ──────────────────────────────────────────────────
  useEffect(() => {
    scrollRestored.current = false
    hasHadData.current = false

    async function loadData() {
      setIsBgSyncing(true)

      await cacheFirstFetch<any[]>({
        cacheKey: selectedYear === 'all' ? 'nusuk_data_all' : `nusuk_data_${selectedYear}`,
        setLoading: data.length === 0 ? setLoading : () => {}, // Modifié pour ne JAMAIS re-bloquer l'interface si le cache possède déjà des lignes
        fetchRemote: async () => {
          const { data: res, error } = await supabase.from('pelerins').select('*, agences(nom_agence)')
          if (error || !res) return undefined
          return res
        },
        onCache: (res) => {
          const filteredByYear = selectedYear === 'all' ? res : res.filter(p => Number(p.campagne) === selectedYear)
          setData(filteredByYear)
          setLoading(false)
          const list = [...new Set(filteredByYear.map(p => p.agences?.nom_agence).filter(Boolean))] as string[]
          setAgences(list.sort())
          hasHadData.current = true
        },
        onRemote: (res) => {
          const filteredByYear = selectedYear === 'all' ? res : res.filter(p => Number(p.campagne) === selectedYear)

          setData(prev => {
            if (JSON.stringify(prev) === JSON.stringify(filteredByYear)) return prev
            return filteredByYear
          })

          setLoading(false)
          const list = [...new Set(filteredByYear.map(p => p.agences?.nom_agence).filter(Boolean))] as string[]
          setAgences(list.sort())
          setLastSyncTime(new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }))
          setIsBgSyncing(false)
        }
      })

      setIsBgSyncing(false)
    }

    loadData()
    setSelectedIds([])
    setCurrentPage(1)
  }, [selectedYear])

  // ─── FILTRAGE MULTICRITÈRES ───────────────────────────────────────────────
  const filteredData = useMemo(() => {
    return data.filter(p => {
      const nomComplet = `${p.prenom || ''} ${p.nom_complet || ''}`.toLowerCase()
      const matchesSearch = nomComplet.includes(search.toLowerCase()) || (p.num_passeport && p.num_passeport.toLowerCase().includes(search.toLowerCase()))
      const matchesAgence = selectedAgence === 'all' || p.agences?.nom_agence === selectedAgence

      const isDocComplet = !!p.document_url
      const isEligibleBase = p.sur_plateforme_gouv && isDocComplet

      const matchesEligible = filterEligibility === 'all' || (filterEligibility === 'eligible' ? isEligibleBase : !isEligibleBase)
      const matchesGouv = filterGouv === 'all' || (filterGouv === 'true' ? p.sur_plateforme_gouv : !p.sur_plateforme_gouv)
      const matchesNusuk = filterNusuk === 'all' || (filterNusuk === 'true' ? p.sur_plateforme_nusuk : !p.sur_plateforme_nusuk)
      const matchesDoc = filterDoc === 'all' || (filterDoc === 'complet' ? isDocComplet : !isDocComplet)

      let matchesFinance = true
      const total = p.total_paye || 0
      if (filterFinance === 'full') matchesFinance = total >= 3000000
      else if (filterFinance === 'partial') matchesFinance = total > 0 && total < 3000000
      else if (filterFinance === 'none') matchesFinance = total === 0

      return matchesSearch && matchesAgence && matchesEligible && matchesGouv && matchesNusuk && matchesFinance && matchesDoc
    })
  }, [data, search, selectedAgence, filterEligibility, filterGouv, filterNusuk, filterFinance, filterDoc])

  // ─── PAGINATION ───────────────────────────────────────────────────────────
  const paginatedData = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage
    return filteredData.slice(start, start + itemsPerPage)
  }, [filteredData, currentPage])

  const totalPages = Math.ceil(filteredData.length / itemsPerPage)

  // ─── STATISTIQUES ─────────────────────────────────────────────────────────
  const stats = useMemo(() => {
    const total = filteredData.length
    const nusukInscrit = filteredData.filter(p => p.sur_plateforme_nusuk).length
    const gouvInscrit = filteredData.filter(p => p.sur_plateforme_gouv).length
    const totalEligibles = filteredData.filter(p => p.sur_plateforme_gouv && p.document_url).length
    return { total, nusukInscrit, gouvInscrit, totalEligibles }
  }, [filteredData])

  // ─── NOMBRE DE FILTRES ACTIFS ─────────────────────────────────────────────
  const activeFilterCount = useMemo(() => {
    let count = 0
    if (selectedAgence !== 'all') count++
    if (filterEligibility !== 'all') count++
    if (filterGouv !== 'all') count++
    if (filterNusuk !== 'all') count++
    if (filterFinance !== 'all') count++
    if (filterDoc !== 'all') count++
    return count
  }, [selectedAgence, filterEligibility, filterGouv, filterNusuk, filterFinance, filterDoc])

  // ─── RÉINITIALISER TOUS LES FILTRES ──────────────────────────────────────
  const resetAllFilters = useCallback(() => {
    setSearch('')
    setSelectedAgence('all')
    setFilterEligibility('all')
    setFilterGouv('all')
    setFilterNusuk('all')
    setFilterFinance('all')
    setFilterDoc('all')
    setCurrentPage(1)
  }, [])

  // ─── ACTIONS DE MASSE ─────────────────────────────────────────────────────
  const handleBulkNusukStatus = async (targetValue: boolean) => {
    if (selectedIds.length === 0) return
    setIsUpdating(true)
    const { error } = await supabase.from('pelerins').update({ sur_plateforme_nusuk: targetValue }).in('id', selectedIds)
    if (!error) {
      setData(prev => prev.map(p => selectedIds.includes(p.id) ? { ...p, sur_plateforme_nusuk: targetValue } : p))
      setSelectedIds([])
    }
    setIsUpdating(false)
  }

  const toggleSelectAll = () => {
    if (selectedIds.length === paginatedData.length) {
      setSelectedIds([])
    } else {
      setSelectedIds(paginatedData.map(p => p.id))
    }
  }

  const toggleSelectRow = (id: string) => {
    setSelectedIds(prev => prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id])
  }

  // ─── EXPORTS ──────────────────────────────────────────────────────────────
  const handleExcelExport = () => {
    let csvContent = 'data:text/csv;charset=utf-8,\uFEFF'
    csvContent += `N°;Prenom et Nom;Agence;Passeport;Dossier;Gouv Mali;Nusuk KSA${!isAdmin ? ';Montant Payé' : ''}\n`
    filteredData.forEach((p, idx) => {
      csvContent += `${idx + 1};${p.prenom || ''} ${p.nom_complet || ''};${p.agences?.nom_agence || '—'};${p.num_passeport || '—'};${p.document_url ? 'Complet' : 'Incomplet'};${p.sur_plateforme_gouv ? 'Validé' : 'Non'};${p.sur_plateforme_nusuk ? 'Inscrit' : 'Non'}${!isAdmin ? `;${p.total_paye || 0}` : ''}\n`
    })
    const encodedUri = encodeURI(csvContent)
    const link = document.createElement('a')
    link.setAttribute('href', encodedUri)
    link.setAttribute('download', `Export_Nusuk_Campagne_${selectedYear}.csv`)
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  const handlePdfConfirm = (includeFinance: boolean) => {
    generateAndPrintPDF(filteredData, "Registre Général d'Enregistrement Nusuk", isAdmin ? false : includeFinance, selectedYear)
    setPdfConfirmOpen(false)
  }

  const isFirstLoad = loading && data.length === 0

  return (
    <div className="bg-[#f8fafc] min-h-screen pb-12">
      {/* ─── STICKY HEADER COMPACT ET MODERNE (PC & MOBILE COHÉRENT) ─── */}
      <div className="bg-white border-b border-slate-200/60 shadow-sm sticky top-0 z-40 backdrop-blur-md bg-white/95 transition-all">
        <div className="max-w-7xl mx-auto px-4 md:px-8 py-3.5 md:py-5 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 md:gap-4 min-w-0">
            <Link href="/hajj/admin" className="p-2 bg-slate-50 border border-slate-200/70 hover:border-slate-300 rounded-xl text-slate-500 hover:text-indigo-600 transition-colors shrink-0">
              <ArrowLeft size={16} />
            </Link>
            <div className="min-w-0">
              <span className="hidden md:inline-block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-0.5">Espace Administrateur</span>
              <h1 className="text-base md:text-2xl font-black text-slate-900 tracking-tight uppercase truncate flex items-center gap-2">
                <Globe size={18} className="text-indigo-600 shrink-0" /> <span className="truncate">Nusuk Central</span>
              </h1>
            </div>
          </div>
          
          <div className="flex items-center gap-2 md:gap-3 shrink-0">
            {isBgSyncing && (
              <span className="flex items-center gap-1 text-[10px] font-bold text-indigo-600 bg-indigo-50/80 px-2 py-1 rounded-lg border border-indigo-100">
                <RefreshCw size={11} className="animate-spin" />
                <span className="hidden xs:inline">Sync...</span>
              </span>
            )}
            {!isBgSyncing && lastSyncTime && (
              <span className="text-[10px] font-bold text-slate-400 bg-slate-50 px-2 py-1 rounded-lg border border-slate-100 hidden sm:block">
                À jour : {lastSyncTime}
              </span>
            )}
            <YearSelector />
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 md:px-8 mt-4 md:mt-6">
        {/* ─── KPI COMPACTS ET RESPONSIVES ─── */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5 md:gap-5 mb-4 md:mb-6">
          <div className="bg-white border border-slate-200/60 rounded-xl p-3 md:p-4 shadow-sm">
            <p className="text-[9px] md:text-[10px] font-bold text-slate-400 uppercase tracking-wider truncate">Cible active filtrée</p>
            <p className="text-lg md:text-2xl font-black text-slate-900 mt-0.5 md:mt-1 tabular-nums">{filteredData.length}</p>
          </div>
          <div className="bg-white border border-slate-200/60 rounded-xl p-3 md:p-4 shadow-sm border-l-indigo-500 border-l-2">
            <p className="text-[9px] md:text-[10px] font-bold text-slate-400 uppercase tracking-wider truncate">Éligibles Nusuk</p>
            <p className="text-lg md:text-2xl font-black text-indigo-600 mt-0.5 md:mt-1 tabular-nums">{stats.totalEligibles}</p>
          </div>
          <div className="bg-white border border-slate-200/60 rounded-xl p-3 md:p-4 shadow-sm border-l-teal-500 border-l-2">
            <p className="text-[9px] md:text-[10px] font-bold text-slate-400 uppercase tracking-wider truncate">Inscrits Gouv</p>
            <p className="text-lg md:text-2xl font-black text-teal-600 mt-0.5 md:mt-1 tabular-nums">{stats.gouvInscrit}</p>
          </div>
          <div className="bg-white border border-slate-200/60 rounded-xl p-3 md:p-4 shadow-sm border-l-purple-500 border-l-2">
            <p className="text-[9px] md:text-[10px] font-bold text-slate-400 uppercase tracking-wider truncate">Inscrits Nusuk KSA</p>
            <p className="text-lg md:text-2xl font-black text-purple-600 mt-0.5 md:mt-1 tabular-nums">{stats.nusukInscrit}</p>
          </div>
        </div>

        {/* ─── BARRE DE FILTRES DESKTOP ─── */}
        <div className="hidden lg:grid grid-cols-4 xl:grid-cols-7 gap-3 bg-white p-4 rounded-2xl border border-slate-200/60 shadow-sm mb-3">
          <div className="relative col-span-1 xl:col-span-2">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={15} />
            <input
              type="text" placeholder="Nom ou Passeport… (Échap pour vider)" value={search}
              onChange={e => { setSearch(e.target.value); setCurrentPage(1) }}
              className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 text-xs font-bold rounded-xl outline-none focus:border-indigo-500 focus:bg-white"
            />
            {search && (
              <button onClick={() => { setSearch(''); setCurrentPage(1) }} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700">
                <X size={13} />
              </button>
            )}
          </div>

          <select value={selectedAgence} onChange={e => { setSelectedAgence(e.target.value); setCurrentPage(1) }} className="bg-slate-50 border border-slate-200 text-xs font-bold rounded-xl px-3 py-2 outline-none">
            <option value="all">Toutes les agences</option>
            {agences.map(ag => <option key={ag} value={ag}>{ag}</option>)}
          </select>

          <select value={filterEligibility} onChange={e => { setFilterEligibility(e.target.value as any); setCurrentPage(1) }} className="bg-slate-50 border border-slate-200 text-xs font-bold rounded-xl px-3 py-2 outline-none">
            <option value="all">Éligibilité (Tous)</option>
            <option value="eligible">Éligibles Nusuk uniquement</option>
            <option value="non-eligible">Non éligibles</option>
          </select>

          <select value={filterGouv} onChange={e => { setFilterGouv(e.target.value as any); setCurrentPage(1) }} className="bg-slate-50 border border-slate-200 text-xs font-bold rounded-xl px-3 py-2 outline-none">
            <option value="all">Plateforme Gouv (Tous)</option>
            <option value="true">Inscrits Gouv</option>
            <option value="false">Non inscrits Gouv</option>
          </select>

          <select value={filterNusuk} onChange={e => { setFilterNusuk(e.target.value as any); setCurrentPage(1) }} className="bg-slate-50 border border-slate-200 text-xs font-bold rounded-xl px-3 py-2 outline-none">
            <option value="all">Portail Nusuk (Tous)</option>
            <option value="true">Inscrits Nusuk</option>
            <option value="false">Non inscrits Nusuk</option>
          </select>

          {!isAdmin && (
            <select value={filterFinance} onChange={e => { setFilterFinance(e.target.value as any); setCurrentPage(1) }} className="bg-slate-50 border border-slate-200 text-xs font-bold rounded-xl px-3 py-2 outline-none">
              <option value="all">Filtre Financier (Tous)</option>
              <option value="full">Paiement Total (≥ 3M)</option>
              <option value="partial">Paiement Partiel</option>
              <option value="none">Aucun paiement</option>
            </select>
          )}
        </div>

        {/* ─── CHIPS FILTRES ACTIFS + RESET (Desktop) ─── */}
        {activeFilterCount > 0 && (
          <div className="hidden lg:flex items-center gap-2 mb-4 flex-wrap">
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider">{activeFilterCount} filtre(s) actif(s)</span>
            <button onClick={resetAllFilters} className="flex items-center gap-1 text-[10px] font-black text-rose-500 hover:text-rose-700 bg-rose-50 border border-rose-100 px-2.5 py-1 rounded-lg transition-colors">
              <X size={10} /> Tout effacer
            </button>
          </div>
        )}

        {/* ─── ACTION BAR MOBILE OPTIMISÉE, MODERNE AVEC BOUTON EXPORT PLACÉ À DROITE DE NOUVEAU/FILTRES ─── */}
        <div className="flex lg:hidden flex-col gap-2.5 mb-4 bg-white p-3 rounded-2xl border border-slate-200/70 shadow-sm">
          <div className="relative w-full">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
            <input
              type="text" placeholder="Rechercher nom, passeport..." value={search}
              onChange={e => { setSearch(e.target.value); setCurrentPage(1) }}
              className="w-full pl-9 pr-8 py-2 bg-slate-50 border border-slate-200 text-xs font-bold rounded-xl outline-none focus:border-indigo-500 focus:bg-white transition-all"
            />
            {search && (
              <button onClick={() => { setSearch(''); setCurrentPage(1) }} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400">
                <X size={13} />
              </button>
            )}
          </div>
          <div className="flex gap-2 w-full">
            <button onClick={() => setMobileFilterOpen(true)} className="relative flex-1 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-700 flex items-center justify-center gap-1.5 text-xs font-black transition-all active:scale-95">
              <SlidersHorizontal size={14} className="text-indigo-600" />
              <span>Filtres</span>
              {activeFilterCount > 0 && (
                <span className="w-4 h-4 bg-indigo-600 text-white text-[9px] font-black rounded-full flex items-center justify-center">
                  {activeFilterCount}
                </span>
              )}
            </button>

            {/* Bouton Export Moderne positionné directement à côté du bouton de gestion principal sur mobile */}
            <button 
              onClick={() => setPdfConfirmOpen(true)} 
              className="flex-1 py-2 bg-indigo-600 text-white font-black rounded-xl text-xs flex items-center justify-center gap-1.5 shadow-sm active:scale-95 transition-all"
            >
              <Download size={14} />
              <span>Exporter</span>
            </button>
          </div>
        </div>

        {/* ─── ZONE ACTIONS DE MASSE ─── */}
        {selectedIds.length > 0 && (
          <div className="bg-indigo-900 text-white px-4 py-3 rounded-xl flex items-center justify-between shadow-lg animate-fade-in mb-4">
            <span className="text-xs font-bold">{selectedIds.length} ligne(s) sélectionnée(s)</span>
            <div className="flex gap-2">
              <button disabled={isUpdating} onClick={() => handleBulkNusukStatus(true)} className="px-2.5 py-1.5 bg-white/20 hover:bg-white/30 rounded-lg text-[11px] font-black uppercase tracking-wider transition-all disabled:opacity-50">
                Inscrire Nusuk
              </button>
              <button disabled={isUpdating} onClick={() => handleBulkNusukStatus(false)} className="px-2.5 py-1.5 bg-rose-600 hover:bg-rose-700 rounded-lg text-[11px] font-black uppercase tracking-wider transition-all disabled:opacity-50">
                Retirer Nusuk
              </button>
            </div>
          </div>
        )}

        {/* ─── VERSION MOBILE : LISTING UI/UX ENTIÈREMENT REVU ─── */}
        <div className="block lg:hidden space-y-2.5">
          {isFirstLoad ? (
            <div className="p-12 text-center font-black text-slate-300 animate-pulse uppercase text-xs tracking-widest">Chargement du registre...</div>
          ) : paginatedData.length === 0 ? (
            <div className="bg-white rounded-xl p-8 border border-slate-100 text-center shadow-sm">
              <p className="text-slate-400 font-bold text-sm mb-2">Aucun résultat trouvé</p>
              {activeFilterCount > 0 && (
                <button onClick={resetAllFilters} className="text-xs text-indigo-600 font-bold underline underline-offset-2">Réinitialiser les filtres</button>
              )}
            </div>
          ) : (
            paginatedData.map(p => {
              const isEligible = p.sur_plateforme_gouv && p.document_url
              return (
                <div key={p.id} className="bg-white border border-slate-200/70 rounded-xl p-3.5 shadow-sm flex flex-col justify-between relative transition-all hover:border-slate-300">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <button onClick={() => toggleSelectRow(p.id)} className="text-slate-400 shrink-0">
                        {selectedIds.includes(p.id) ? <CheckSquare size={18} className="text-indigo-600" /> : <Square size={18} />}
                      </button>
                      <div className="min-w-0">
                        <p className="font-black text-slate-900 uppercase text-xs truncate">{p.prenom} {p.nom_complet}</p>
                        <p className="text-[10px] text-slate-400 font-bold truncate mt-0.5 flex items-center gap-1">
                          <Building2 size={10} className="text-slate-400 shrink-0" /> {p.agences?.nom_agence || 'Aucune agence'}
                        </p>
                      </div>
                    </div>
                    <span className={`text-[9px] font-black px-2 py-0.5 rounded-md uppercase tracking-wider shrink-0 ${isEligible ? 'bg-emerald-50 text-emerald-600 border border-emerald-100' : 'bg-slate-50 text-slate-400'}`}>
                      {isEligible ? 'Éligible' : 'Incomplet'}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-2 my-2.5 bg-slate-50 p-2 rounded-xl border border-slate-100">
                    <div>
                      <p className="text-[8px] text-slate-400 font-bold uppercase tracking-wider">Passeport</p>
                      <p className="text-xs font-mono font-bold text-slate-700 flex items-center gap-1 mt-0.5">
                        <CreditCard size={11} className="text-slate-400" /> {p.num_passeport || '—'}
                      </p>
                    </div>
                    {!isAdmin ? (
                      <div className="text-right">
                        <p className="text-[8px] text-slate-400 font-bold uppercase tracking-wider">Situation Finance</p>
                        <p className="text-xs font-black text-slate-700 mt-0.5">
                          {(p.total_paye || 0) > 0 ? `${(p.total_paye || 0).toLocaleString('fr-FR')} F` : '0 F'}
                        </p>
                      </div>
                    ) : (
                      <div className="text-right">
                        <p className="text-[8px] text-slate-400 font-bold uppercase tracking-wider">Mali Gouv Status</p>
                        <p className={`text-[10px] font-black mt-0.5 ${p.sur_plateforme_gouv ? 'text-teal-600' : 'text-slate-400'}`}>
                          {p.sur_plateforme_gouv ? '✓ Validé' : '— En attente'}
                        </p>
                      </div>
                    )}
                  </div>

                  <div className="flex justify-between items-center pt-2.5 border-t border-slate-100 gap-2">
                    {/* BOUTON DE VALIDATION NUSUK INLINE DIRECTPUIS LA LISTE MOBILE */}
                    <button 
                      disabled={actionInProgressId === p.id}
                      onClick={() => toggleNusukStatus(p.id, !!p.sur_plateforme_nusuk)}
                      className={`flex items-center gap-1 text-[9px] font-black uppercase px-2.5 py-1.5 rounded-lg border transition-all ${
                        p.sur_plateforme_nusuk 
                          ? 'bg-purple-50 text-purple-700 border-purple-200 hover:bg-purple-100' 
                          : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-indigo-50 hover:text-indigo-600'
                      }`}
                    >
                      <UserCheck size={12} className={actionInProgressId === p.id ? 'animate-spin' : ''} />
                      <span>{p.sur_plateforme_nusuk ? 'Nusuk Valide ✓' : 'Valider Nusuk'}</span>
                    </button>

                    {/* Navigation Instantanée SANS blocage de rafraîchissement */}
                    <Link
                      href={`/hajj/pelerin/${p.id}`}
                      onClick={saveScrollPosition}
                      className="p-1.5 bg-slate-100 text-slate-700 hover:bg-indigo-600 hover:text-white rounded-lg transition-colors shrink-0"
                    >
                      <Eye size={14} />
                    </Link>
                  </div>
                </div>
              )
            })
          )}
        </div>

        {/* ─── VERSION DESKTOP : TABLEAU COMPLET ─── */}
        <div className="hidden lg:block bg-white rounded-2xl border border-slate-200/60 shadow-sm overflow-hidden">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50/70 border-b border-slate-200/60">
                <th className="px-4 py-4 w-10">
                  <button onClick={toggleSelectAll} className="text-slate-400">
                    {selectedIds.length === paginatedData.length && paginatedData.length > 0 ? <CheckSquare size={16} className="text-indigo-600" /> : <Square size={16} />}
                  </button>
                </th>
                <th className="px-4 py-4 text-[10px] font-black text-slate-400 uppercase tracking-wider">Pèlerin</th>
                <th className="px-4 py-4 text-[10px] font-black text-slate-400 uppercase tracking-wider">Agence</th>
                <th className="px-4 py-4 text-[10px] font-black text-slate-400 uppercase tracking-wider">Passeport</th>
                <th className="px-4 py-4 text-[10px] font-black text-slate-400 uppercase tracking-wider text-center">Dossier</th>
                <th className="px-4 py-4 text-[10px] font-black text-slate-400 uppercase tracking-wider text-center">Gouv. Mali</th>
                <th className="px-4 py-4 text-[10px] font-black text-slate-400 uppercase tracking-wider text-center">Nusuk KSA</th>
                {!isAdmin && <th className="px-4 py-4 text-[10px] font-black text-slate-400 uppercase tracking-wider text-right">Montant Versé</th>}
                <th className="px-6 py-4 w-12 text-right">Fiche</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {isFirstLoad ? (
                <tr><td colSpan={isAdmin ? 8 : 9} className="px-6 py-16 text-center font-bold text-slate-300 animate-pulse">CHARGEMENT DES REGISTRES...</td></tr>
              ) : paginatedData.length === 0 ? (
                <tr>
                  <td colSpan={isAdmin ? 8 : 9} className="px-6 py-16 text-center">
                    <p className="text-slate-400 font-bold mb-2">Aucun dossier ne correspond à vos filtres.</p>
                    {activeFilterCount > 0 && (
                      <button onClick={resetAllFilters} className="text-xs text-indigo-600 font-black underline underline-offset-2">Réinitialiser tous les filtres</button>
                    )}
                  </td>
                </tr>
              ) : (
                paginatedData.map(p => {
                  const isEligible = p.sur_plateforme_gouv && p.document_url
                  return (
                    <tr key={p.id} className="hover:bg-slate-50/50 transition-colors group">
                      <td className="px-4 py-3.5">
                        <button onClick={() => toggleSelectRow(p.id)} className="text-slate-400">
                          {selectedIds.includes(p.id) ? <CheckSquare size={16} className="text-indigo-600" /> : <Square size={16} />}
                        </button>
                      </td>
                      <td className="px-4 py-3.5">
                        <p className="font-black text-slate-900 text-xs uppercase leading-tight">{p.prenom} {p.nom_complet}</p>
                        <p className="text-[10px] text-slate-400 font-mono mt-0.5">{p.telephone_pelerin || 'Pas de numéro'}</p>
                      </td>
                      <td className="px-4 py-3.5 text-xs font-bold text-indigo-600 truncate max-w-[140px]">{p.agences?.nom_agence || '—'}</td>
                      <td className="px-4 py-3.5 font-mono text-xs font-black text-slate-700">{p.num_passeport || '—'}</td>
                      <td className="px-4 py-3.5 text-center">
                        <span className={`mx-auto w-6 h-6 rounded-md flex items-center justify-center ${p.document_url ? 'bg-emerald-50 text-emerald-600' : 'bg-amber-50 text-amber-500'}`}>
                          {p.document_url ? <FileCheck size={14} /> : <FileWarning size={14} />}
                        </span>
                      </td>
                      <td className="px-4 py-3.5 text-center">
                        <span className={`mx-auto text-[10px] font-black uppercase px-2 py-0.5 rounded-md ${p.sur_plateforme_gouv ? 'bg-teal-50 text-teal-700' : 'bg-slate-100 text-slate-400'}`}>
                          {p.sur_plateforme_gouv ? 'Validé' : 'À faire'}
                        </span>
                      </td>
                      <td className="px-4 py-3.5 text-center">
                        <button 
                          disabled={actionInProgressId === p.id}
                          onClick={() => toggleNusukStatus(p.id, !!p.sur_plateforme_nusuk)}
                          className={`mx-auto text-[10px] font-black uppercase px-2.5 py-0.5 rounded-md border flex items-center gap-1 transition-all ${
                            p.sur_plateforme_nusuk ? 'bg-purple-100 text-purple-700 border-purple-200' : 'bg-slate-50 text-slate-400 border-slate-200 hover:border-indigo-300 hover:text-indigo-600'
                          }`}
                        >
                          {p.sur_plateforme_nusuk ? 'Inscrit' : 'Valider'}
                        </button>
                      </td>
                      {!isAdmin && (
                        <td className="px-4 py-3.5 text-right font-black text-xs tabular-nums text-slate-800">
                          {(p.total_paye || 0).toLocaleString('fr-FR')} CFA
                        </td>
                      )}
                      <td className="px-6 py-3.5 text-right">
                        <Link
                          href={`/hajj/pelerin/${p.id}`}
                          onClick={saveScrollPosition}
                          className="w-7 h-7 inline-flex items-center justify-center bg-slate-50 border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-900 hover:text-white transition-all"
                        >
                          <Eye size={13} />
                        </Link>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>

        {/* ─── PAGINATION ─── */}
        {totalPages > 1 && (
          <div className="mt-5 flex justify-between items-center bg-white p-3 rounded-xl border border-slate-200/60 shadow-sm">
            <span className="text-xs font-bold text-slate-400">Page {currentPage} sur {totalPages} ({filteredData.length} lignes)</span>
            <div className="flex gap-1.5">
              <button disabled={currentPage === 1} onClick={() => setCurrentPage(prev => prev - 1)} className="p-1.5 bg-slate-50 border border-slate-200 rounded-lg disabled:opacity-40">
                <ChevronLeft size={16} />
              </button>
              <button disabled={currentPage === totalPages} onClick={() => setCurrentPage(prev => prev + 1)} className="p-1.5 bg-slate-50 border border-slate-200 rounded-lg disabled:opacity-40">
                <ChevronRight size={16} />
              </button>
            </div>
          </div>
        )}

        {/* ─── BLOC EXPORTS DESKTOP HAUT DE GAMME ─── */}
        <div className="hidden lg:flex mt-5 justify-end gap-2.5">
          <button onClick={handleExcelExport} className="px-4 py-2.5 border border-slate-200 bg-white text-slate-700 font-black rounded-xl text-xs flex items-center gap-2 shadow-sm hover:bg-slate-50 active:scale-95 transition-all">
            <FileSpreadsheet size={15} className="text-emerald-600" /> Exporter Excel
          </button>
          <button onClick={() => setPdfConfirmOpen(true)} className="px-4 py-2.5 bg-indigo-600 text-white font-black rounded-xl text-xs flex items-center gap-2 shadow-sm hover:bg-indigo-700 active:scale-95 transition-all">
            <FileText size={15} /> Générer Rapport PDF
          </button>
        </div>
      </div>

      {/* ─── TIROIR FILTRES MOBILE PERSISTANTS ─── */}
      {mobileFilterOpen && (
        <div className="fixed inset-0 z-[1200] bg-slate-900/60 backdrop-blur-sm flex items-end justify-center animate-fade-in" onClick={() => setMobileFilterOpen(false)}>
          <div className="bg-white w-full rounded-t-[2rem] p-6 space-y-4 max-h-[85vh] overflow-y-auto shadow-2xl animate-slide-up pb-safe-bottom" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center border-b border-slate-100 pb-3">
              <h3 className="font-black text-slate-800 text-sm uppercase tracking-wide">Filtres du Registre</h3>
              <div className="flex items-center gap-2">
                {activeFilterCount > 0 && (
                  <button onClick={resetAllFilters} className="text-[10px] font-black text-rose-500 bg-rose-50 px-2.5 py-1 rounded-lg border border-rose-100">
                    Tout effacer
                  </button>
                )}
                <button onClick={() => setMobileFilterOpen(false)} className="p-1.5 bg-slate-100 rounded-xl text-slate-400"><X size={18} /></button>
              </div>
            </div>

            <div className="space-y-3.5">
              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-black text-slate-400 uppercase">Agence</label>
                <select value={selectedAgence} onChange={e => setSelectedAgence(e.target.value)} className="w-full bg-slate-50 border border-slate-200 p-2.5 rounded-xl text-xs font-bold">
                  <option value="all">Toutes les agences</option>
                  {agences.map(ag => <option key={ag} value={ag}>{ag}</option>)}
                </select>
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-black text-slate-400 uppercase">Éligibilité Nusuk de base</label>
                <select value={filterEligibility} onChange={e => setFilterEligibility(e.target.value as any)} className="w-full bg-slate-50 border border-slate-200 p-2.5 rounded-xl text-xs font-bold">
                  <option value="all">Tous</option>
                  <option value="eligible">Prêts / Éligibles</option>
                  <option value="non-eligible">Incomplets</option>
                </select>
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-black text-slate-400 uppercase">Plateforme Gouv</label>
                <select value={filterGouv} onChange={e => setFilterGouv(e.target.value as any)} className="w-full bg-slate-50 border border-slate-200 p-2.5 rounded-xl text-xs font-bold">
                  <option value="all">Tous</option>
                  <option value="true">Inscrits Gouv</option>
                  <option value="false">Non inscrits</option>
                </select>
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-black text-slate-400 uppercase">Portail Nusuk</label>
                <select value={filterNusuk} onChange={e => setFilterNusuk(e.target.value as any)} className="w-full bg-slate-50 border border-slate-200 p-2.5 rounded-xl text-xs font-bold">
                  <option value="all">Tous</option>
                  <option value="true">Inscrits Nusuk</option>
                  <option value="false">Non inscrits</option>
                </select>
              </div>

              {!isAdmin && (
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] font-black text-slate-400 uppercase">Finances (Seuil 3M)</label>
                  <select value={filterFinance} onChange={e => setFilterFinance(e.target.value as any)} className="w-full bg-slate-50 border border-slate-200 p-2.5 rounded-xl text-xs font-bold">
                    <option value="all">Tous</option>
                    <option value="full">Réglé Totalité</option>
                    <option value="partial">Versement Partiel</option>
                    <option value="none">Aucun paiement</option>
                  </select>
                </div>
              )}
            </div>

            <button onClick={() => setMobileFilterOpen(false)} className="w-full py-3.5 bg-indigo-600 text-white font-black uppercase text-xs tracking-wider rounded-xl shadow-md mt-2">
              Appliquer les filtres
            </button>
          </div>
        </div>
      )}

      {/* CONFIRMATION EXPORT PDF */}
      <PdfConfirmModal
        isOpen={pdfConfirmOpen}
        onClose={() => setPdfConfirmOpen(false)}
        onConfirm={handlePdfConfirm}
        title="Registre Général d'Enregistrement Nusuk"
        count={filteredData.length}
      />
    </div>
  )
}