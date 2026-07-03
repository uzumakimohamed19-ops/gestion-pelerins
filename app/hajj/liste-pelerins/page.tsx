'use client'
import { useCallback, useEffect, useLayoutEffect, useState, useRef } from 'react'
import { get, set } from 'idb-keyval'
import { supabase, getUser } from '@/lib/supabase'
import { useYear } from '@/lib/YearContext'
import { YearSelector } from '@/components/YearSelector'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  Search, Download, Plus, User, ChevronRight, Loader2, Calendar, Hash,
  Building2, Phone, X, FileText, CheckSquare, Square, Filter, Trash2,
  TrendingUp, AlertCircle, CheckCircle2, Clock, SlidersHorizontal,
  BarChart3, Eye, EyeOff, ChevronDown, Sparkles
} from 'lucide-react'
import ExcelJS from 'exceljs'
import { saveAs } from 'file-saver'

interface Pelerin {
  id: string
  prenom: string
  nom_complet: string
  num_passeport: string
  telephone_pelerin: string
  document_url: string
  date_naissance?: string
  date_expiration?: string
  created_at?: string
  reference?: string
  agence_ou_personne_associee?: string
  total_paye: number
  prix_package: number
  sur_plateforme_gouv: boolean
  sur_plateforme_nusuk: boolean
  campagne?: number
  date_depart?: string
  date_retour?: string
  agences?: { nom_agence?: string }
}

type FilterType = 'date' | 'reference' | 'agence' | 'phone' | 'date_depart' | 'date_retour' | 'statut_paiement' | 'plateforme' | null

type PaiementStatut = 'all' | 'complet' | 'partiel' | 'non_paye'

const FILTERS_STORAGE_KEY = 'liste_pelerins_filters'

const getPaiementStatut = (p: Pelerin): PaiementStatut => {
  const pct = p.prix_package > 0 ? (p.total_paye / p.prix_package) * 100 : 0
  if (pct >= 100) return 'complet'
  if (pct > 0) return 'partiel'
  return 'non_paye'
}

const getPaiementColor = (statut: PaiementStatut) => {
  if (statut === 'complet') return { bg: 'bg-emerald-500', text: 'text-emerald-600', light: 'bg-emerald-50 text-emerald-700 border-emerald-200' }
  if (statut === 'partiel') return { bg: 'bg-amber-400', text: 'text-amber-600', light: 'bg-amber-50 text-amber-700 border-amber-200' }
  return { bg: 'bg-red-400', text: 'text-red-600', light: 'bg-red-50 text-red-700 border-red-200' }
}

const getCompletion = (p: Pelerin): number => {
  const checks = [
    !!p.num_passeport, !!p.telephone_pelerin, !!p.date_naissance,
    !!p.date_expiration, p.sur_plateforme_gouv, p.sur_plateforme_nusuk,
    p.total_paye >= p.prix_package
  ]
  return Math.round((checks.filter(Boolean).length / checks.length) * 100)
}

const exporterPDF = async (pelerins: Pelerin[], showPrix: boolean, showAgence: boolean) => {
  const { jsPDF } = await import('jspdf')
  const autoTable = (await import('jspdf-autotable')).default

  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })

  doc.setFillColor(15, 23, 42)
  doc.rect(0, 0, 297, 22, 'F')
  doc.setFillColor(37, 99, 235)
  doc.rect(0, 18, 297, 4, 'F')

  doc.setTextColor(255, 255, 255)
  doc.setFontSize(16)
  doc.setFont('helvetica', 'bold')
  doc.text('LISTE DES PÈLERINS — HAJJ', 14, 13)

  doc.setFontSize(9)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(148, 163, 184)
  const now = new Date().toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' })
  doc.text(`Généré le ${now}  •  ${pelerins.length} pèlerins`, 14, 19)

  const totalPackage = pelerins.reduce((s, p) => s + (p.prix_package || 0), 0)
  const totalPaye = pelerins.reduce((s, p) => s + (p.total_paye || 0), 0)
  const nbComplets = pelerins.filter(p => getPaiementStatut(p) === 'complet').length
  const nbGouv = pelerins.filter(p => p.sur_plateforme_gouv).length
  const nbNusuk = pelerins.filter(p => p.sur_plateforme_nusuk).length

  doc.setFillColor(248, 250, 252)
  doc.rect(0, 26, 297, 18, 'F')
  doc.setDrawColor(226, 232, 240)
  doc.line(0, 44, 297, 44)

  const stats = [
    { label: 'Total pèlerins', value: `${pelerins.length}` },
    ...(showPrix ? [
      { label: 'Montant total', value: `${totalPackage.toLocaleString('fr-FR')} F` },
      { label: 'Total encaissé', value: `${totalPaye.toLocaleString('fr-FR')} F` },
      { label: 'Reste à payer', value: `${(totalPackage - totalPaye).toLocaleString('fr-FR')} F` },
    ] : []),
    { label: 'Paiements complets', value: `${nbComplets}` },
    { label: 'Plateforme Gouv', value: `${nbGouv}` },
    { label: 'Portail Nusuk', value: `${nbNusuk}` },
  ]

  const colW = 297 / stats.length
  stats.forEach((s, i) => {
    const x = 14 + i * colW
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(11)
    doc.setTextColor(15, 23, 42)
    doc.text(s.value, x, 35)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(7)
    doc.setTextColor(100, 116, 139)
    doc.text(s.label.toUpperCase(), x, 41)
  })

  const columns: any[] = [
    { header: '#', dataKey: 'num' },
    { header: 'NOM COMPLET', dataKey: 'nom' },
    { header: 'PASSEPORT', dataKey: 'passeport' },
    { header: 'TÉLÉPHONE', dataKey: 'phone' },
    { header: 'NAISSANCE', dataKey: 'naissance' },
  ]
  if (showAgence) columns.push({ header: 'AGENCE', dataKey: 'agence' })
  if (showPrix) {
    columns.push({ header: 'PACKAGE (F)', dataKey: 'package' })
    columns.push({ header: 'PAYÉ (F)', dataKey: 'paye' })
    columns.push({ header: 'RESTE (F)', dataKey: 'reste' })
  }
  columns.push({ header: 'GOUV', dataKey: 'gouv' })
  columns.push({ header: 'NUSUK', dataKey: 'nusuk' })
  columns.push({ header: 'STATUT', dataKey: 'statut' })

  const rows = pelerins.map((p, i) => {
    const statut = getPaiementStatut(p)
    const row: any = {
      num: i + 1,
      nom: `${p.prenom || ''} ${p.nom_complet}`.trim().toUpperCase(),
      passeport: p.num_passeport || '—',
      phone: p.telephone_pelerin || '—',
      naissance: p.date_naissance ? new Date(p.date_naissance).toLocaleDateString('fr-FR') : '—',
    }
    if (showAgence) row.agence = p.agences?.nom_agence || '—'
    if (showPrix) {
      row.package = (p.prix_package || 0).toLocaleString('fr-FR')
      row.paye = (p.total_paye || 0).toLocaleString('fr-FR')
      row.reste = ((p.prix_package || 0) - (p.total_paye || 0)).toLocaleString('fr-FR')
    }
    row.gouv = p.sur_plateforme_gouv ? '✓' : '✗'
    row.nusuk = p.sur_plateforme_nusuk ? '✓' : '✗'
    row.statut = statut === 'complet' ? 'COMPLET' : statut === 'partiel' ? 'PARTIEL' : 'NON PAYÉ'
    row._statut = statut
    return row
  })

  autoTable(doc, {
    startY: 48,
    columns,
    body: rows,
    theme: 'grid',
    styles: {
      fontSize: 8,
      cellPadding: { top: 3, right: 4, bottom: 3, left: 4 },
      font: 'helvetica',
      textColor: [30, 41, 59],
      lineColor: [226, 232, 240],
      lineWidth: 0.3,
    },
    headStyles: {
      fillColor: [15, 23, 42],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 7,
      cellPadding: { top: 4, right: 4, bottom: 4, left: 4 },
    },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    columnStyles: {
      num: { cellWidth: 8, halign: 'center' },
      gouv: { cellWidth: 14, halign: 'center' },
      nusuk: { cellWidth: 14, halign: 'center' },
      statut: { cellWidth: 22, halign: 'center', fontStyle: 'bold' },
    },
    didParseCell(data: any) {
      if (data.column.dataKey === 'statut' && data.section === 'body') {
        const statut = rows[data.row.index]?._statut
        if (statut === 'complet') data.cell.styles.textColor = [5, 150, 105]
        else if (statut === 'partiel') data.cell.styles.textColor = [217, 119, 6]
        else data.cell.styles.textColor = [220, 38, 38]
      }
    },
    didDrawPage(data: any) {
      const pageCount = doc.getNumberOfPages()
      doc.setFontSize(7)
      doc.setTextColor(148, 163, 184)
      doc.text(
        `Page ${data.pageNumber} / ${pageCount}`,
        doc.internal.pageSize.width - 20,
        doc.internal.pageSize.height - 6,
        { align: 'right' }
      )
      doc.text('Hajj Management System', 14, doc.internal.pageSize.height - 6)
    },
  })

  doc.save(`Pelerins_Hajj_${new Date().toLocaleDateString('fr-FR').replace(/\//g, '-')}.pdf`)
}

export default function ListePelerins() {
  const { selectedYear } = useYear()
  const [pelerins, setPelerins] = useState<Pelerin[]>([])
  const [searchTerm, setSearchTerm] = useState('')
  const [loading, setLoading] = useState(true)
  const [backgroundUpdating, setBackgroundUpdating] = useState(false)
  const [updatingId, setUpdatingId] = useState<string | null>(null)
  const [role, setRole] = useState<string>('staff')
  const router = useRouter()

  // Filters — persistants via sessionStorage
  const [activeFilterType, setActiveFilterType] = useState<FilterType>(null)
  const [selectedFilterValue, setSelectedFilterValue] = useState<string | null>(null)
  const [statutPaiementFilter, setStatutPaiementFilter] = useState<PaiementStatut>('all')
  const [plateformeFilter, setPlateformeFilter] = useState<'all' | 'gouv' | 'nusuk' | 'both' | 'neither'>('all')
  const [showFilterPanel, setShowFilterPanel] = useState(false)
  const filtersRestoredRef = useRef(false)

  // PDF export modal
  const [showPdfModal, setShowPdfModal] = useState(false)
  const [pdfShowPrix, setPdfShowPrix] = useState(false)
  const [pdfShowAgence, setPdfShowAgence] = useState(true)
  const [pdfGenerating, setPdfGenerating] = useState(false)

  // Multi-select
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [selectMode, setSelectMode] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)

  // Export dropdown
  const [showExportMenu, setShowExportMenu] = useState(false)
  const exportRef = useRef<HTMLDivElement>(null)

  // ── FIX 2: Restaurer les filtres depuis sessionStorage au montage
  useEffect(() => {
    if (filtersRestoredRef.current) return
    filtersRestoredRef.current = true
    try {
      const saved = sessionStorage.getItem(FILTERS_STORAGE_KEY)
      if (saved) {
        const parsed = JSON.parse(saved)
        if (parsed.activeFilterType !== undefined) setActiveFilterType(parsed.activeFilterType)
        if (parsed.selectedFilterValue !== undefined) setSelectedFilterValue(parsed.selectedFilterValue)
        if (parsed.statutPaiementFilter !== undefined) setStatutPaiementFilter(parsed.statutPaiementFilter)
        if (parsed.plateformeFilter !== undefined) setPlateformeFilter(parsed.plateformeFilter)
        if (parsed.searchTerm !== undefined) setSearchTerm(parsed.searchTerm)
        if (parsed.showFilterPanel !== undefined) setShowFilterPanel(parsed.showFilterPanel)
      }
    } catch { /* ignore */ }
  }, [])

  // ── FIX 2: Persister les filtres à chaque changement
  useEffect(() => {
    try {
      sessionStorage.setItem(FILTERS_STORAGE_KEY, JSON.stringify({
        activeFilterType,
        selectedFilterValue,
        statutPaiementFilter,
        plateformeFilter,
        searchTerm,
        showFilterPanel,
      }))
    } catch { /* ignore */ }
  }, [activeFilterType, selectedFilterValue, statutPaiementFilter, plateformeFilter, searchTerm, showFilterPanel])

  const restoreScrollPosition = () => {
    const savedScroll = sessionStorage.getItem('liste_pelerins_scroll_y')
    if (savedScroll) {
      window.scrollTo({ top: parseInt(savedScroll, 10), behavior: 'instant' })
      sessionStorage.removeItem('liste_pelerins_scroll_y')
    }
  }

  // ── FIX 1: fetchPelerins ne bloque JAMAIS la navigation quand il y a un cache
  const fetchPelerins = useCallback(async ({ cacheKey, hasCache }: { cacheKey: string; hasCache: boolean }) => {
    if (!hasCache) setLoading(true)
    else setBackgroundUpdating(true)

    const { data, error } = await supabase
      .from('pelerins')
      .select('*, agences ( nom_agence )')
      .order('created_at', { ascending: false })

    if (!error) {
      const filtered = (data as Pelerin[]) || []
      const yearFiltered =
        selectedYear === 'all'
          ? filtered
          : filtered.filter(p => p.campagne !== undefined && p.campagne !== null && Number(p.campagne) === selectedYear)

      setPelerins(yearFiltered)
      try { await set(cacheKey, yearFiltered) } catch { /* ignore */ }
    }

    setLoading(false)
    setBackgroundUpdating(false)
  }, [selectedYear])

  useEffect(() => {
    const triggerDataFlow = async () => {
      const cacheKey = selectedYear === 'all' ? 'pelerins_all' : `pelerins_year_${selectedYear}`
      const cachedPelerins = await get<Pelerin[]>(cacheKey)
      if (cachedPelerins && cachedPelerins.length > 0) {
        setPelerins(cachedPelerins)
        setLoading(false)
        fetchPelerins({ cacheKey, hasCache: true })
      } else {
        await fetchPelerins({ cacheKey, hasCache: false })
      }
    }
    triggerDataFlow()
  }, [selectedYear, fetchPelerins])

  useEffect(() => {
    const checkUser = async () => {
      try {
        const { data: { user } } = await getUser()
        if (!user) { router.push('/login'); return }
        const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
        if (profile?.role) setRole(profile.role)
      } catch { router.push('/login') }
    }
    checkUser()
  }, [router])

  useLayoutEffect(() => {
    if (pelerins.length > 0) restoreScrollPosition()
  }, [pelerins])

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (exportRef.current && !exportRef.current.contains(e.target as Node)) setShowExportMenu(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const toggleFastStatus = async (id: string, field: string, currentValue: boolean) => {
    setUpdatingId(id + field)
    const newValue = !currentValue
    const { error } = await supabase.from('pelerins').update({ [field]: newValue }).eq('id', id)
    if (!error) setPelerins(prev => prev.map(p => p.id === id ? { ...p, [field]: newValue } : p))
    setUpdatingId(null)
  }

  // ── NEW: Delete selected pelerins
  const handleDeleteSelected = async () => {
    if (selectedIds.size === 0) return
    setDeleting(true)
    try {
      const idsArray = Array.from(selectedIds)
      const { error } = await supabase.from('pelerins').delete().in('id', idsArray)
      if (!error) {
        setPelerins(prev => prev.filter(p => !selectedIds.has(p.id)))
        setSelectedIds(new Set())
        setSelectMode(false)
        setShowDeleteConfirm(false)
      } else {
        alert('Erreur lors de la suppression. Veuillez réessayer.')
      }
    } catch (err) {
      alert('Erreur lors de la suppression. Veuillez réessayer.')
    } finally {
      setDeleting(false)
    }
  }

  const exporterExcel = async () => {
    const workbook = new ExcelJS.Workbook()
    const worksheet = workbook.addWorksheet('Liste Pèlerins')
    worksheet.columns = [
      { header: 'NOM COMPLET', key: 'nom', width: 35 },
      { header: 'NUMÉRO PASSEPORT', key: 'passeport', width: 22 },
      { header: 'TÉLÉPHONE', key: 'phone', width: 20 },
      { header: 'DATE NAISSANCE', key: 'naissance', width: 20 },
      { header: 'EXP. PASSEPORT', key: 'expiration', width: 20 },
      { header: 'AGENCE ENREGISTREMENT', key: 'agence', width: 30 },
      { header: 'PLATEFORME GOUV', key: 'gouv', width: 20 },
      { header: 'PORTAIL NUSUK', key: 'nusuk', width: 20 },
    ]
    const headerRow = worksheet.getRow(1)
    headerRow.height = 28
    headerRow.eachCell((cell) => {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E40AF' } }
      cell.font = { name: 'Arial', bold: true, color: { argb: 'FFFFFFFF' }, size: 10 }
      cell.alignment = { vertical: 'middle', horizontal: 'center' }
      cell.border = { top: { style: 'thin', color: { argb: 'FF1E40AF' } }, bottom: { style: 'medium', color: { argb: 'FF0F172A' } } }
    })
    pelerinsFiltrés.forEach((p, idx) => {
      const row = worksheet.addRow({
        nom: p.nom_complet.toUpperCase(),
        passeport: p.num_passeport,
        phone: p.telephone_pelerin || 'N/A',
        naissance: p.date_naissance ? new Date(p.date_naissance).toLocaleDateString('fr-FR') : 'N/A',
        expiration: p.date_expiration ? new Date(p.date_expiration).toLocaleDateString('fr-FR') : 'N/A',
        agence: p.agences?.nom_agence || 'N/A',
        gouv: p.sur_plateforme_gouv ? '✅ OUI' : '❌ NON',
        nusuk: p.sur_plateforme_nusuk ? '✅ OUI' : '❌ NON',
      })
      row.height = 22
      const bgColor = idx % 2 === 0 ? 'FFFFFFFF' : 'F9FAFBFF'
      row.eachCell((cell, colNumber) => {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bgColor } }
        cell.font = { name: 'Arial', size: 10, color: { argb: 'FF334155' } }
        cell.border = { bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } } }
        if (colNumber === 1 || colNumber === 6) cell.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 }
        else cell.alignment = { vertical: 'middle', horizontal: 'center' }
      })
    })
    const buffer = await workbook.xlsx.writeBuffer()
    saveAs(new Blob([buffer]), `Liste_Pelerins_Hajj_${new Date().toLocaleDateString('fr-FR')}.xlsx`)
  }

  const getFilterOptions = (): string[] => {
    if (!activeFilterType) return []
    const rawOptions = pelerins.map(p => {
      switch (activeFilterType) {
        case 'date': return p.created_at ? new Date(p.created_at).toLocaleDateString('fr-FR') : 'N/A'
        case 'date_depart': return p.date_depart ? new Date(p.date_depart).toLocaleDateString('fr-FR') : 'N/A'
        case 'date_retour': return p.date_retour ? new Date(p.date_retour).toLocaleDateString('fr-FR') : 'N/A'
        case 'reference': return p.reference || 'Sans référence'
        case 'agence': return p.agence_ou_personne_associee || 'Non spécifié'
        case 'phone': return p.telephone_pelerin || 'Aucun numéro'
        default: return ''
      }
    })
    return Array.from(new Set(rawOptions.filter(Boolean)))
  }

  const pelerinsFiltrés = pelerins.filter(p => {
    const q = searchTerm.toLowerCase()
    const matchesSearch = !q ||
      p.nom_complet.toLowerCase().includes(q) ||
      p.num_passeport.toLowerCase().includes(q) ||
      (p.agences?.nom_agence || '').toLowerCase().includes(q) ||
      (p.telephone_pelerin || '').includes(q) ||
      (p.reference || '').toLowerCase().includes(q) ||
      (p.prenom || '').toLowerCase().includes(q)

    if (!matchesSearch) return false
    if (statutPaiementFilter !== 'all' && getPaiementStatut(p) !== statutPaiementFilter) return false
    if (plateformeFilter === 'gouv' && !p.sur_plateforme_gouv) return false
    if (plateformeFilter === 'nusuk' && !p.sur_plateforme_nusuk) return false
    if (plateformeFilter === 'both' && !(p.sur_plateforme_gouv && p.sur_plateforme_nusuk)) return false
    if (plateformeFilter === 'neither' && (p.sur_plateforme_gouv || p.sur_plateforme_nusuk)) return false

    if (selectedFilterValue) {
      switch (activeFilterType) {
        case 'date': return (p.created_at ? new Date(p.created_at).toLocaleDateString('fr-FR') : 'N/A') === selectedFilterValue
        case 'date_depart': return (p.date_depart ? new Date(p.date_depart).toLocaleDateString('fr-FR') : 'N/A') === selectedFilterValue
        case 'date_retour': return (p.date_retour ? new Date(p.date_retour).toLocaleDateString('fr-FR') : 'N/A') === selectedFilterValue
        case 'reference': return (p.reference || 'Sans référence') === selectedFilterValue
        case 'agence': return (p.agence_ou_personne_associee || 'Non spécifié') === selectedFilterValue
        case 'phone': return (p.telephone_pelerin || 'Aucun numéro') === selectedFilterValue
        default: return true
      }
    }
    return true
  })

  const totalPackage = pelerinsFiltrés.reduce((s, p) => s + (p.prix_package || 0), 0)
  const totalPaye = pelerinsFiltrés.reduce((s, p) => s + (p.total_paye || 0), 0)
  const nbComplets = pelerinsFiltrés.filter(p => getPaiementStatut(p) === 'complet').length
  const nbGouv = pelerinsFiltrés.filter(p => p.sur_plateforme_gouv).length

  const hasActiveFilters = !!selectedFilterValue || statutPaiementFilter !== 'all' || plateformeFilter !== 'all' || !!searchTerm

  const activeFilterCount = [
    selectedFilterValue ? 1 : 0,
    statutPaiementFilter !== 'all' ? 1 : 0,
    plateformeFilter !== 'all' ? 1 : 0,
  ].reduce((a, b) => a + b, 0)

  const handleFilterTypeClick = (type: FilterType) => {
    if (activeFilterType === type) {
      setActiveFilterType(null)
      setSelectedFilterValue(null)
    } else {
      setActiveFilterType(type)
      setSelectedFilterValue(null)
    }
  }

  const handlePersistScroll = () => sessionStorage.setItem('liste_pelerins_scroll_y', window.scrollY.toString())

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const toggleSelectAll = () => {
    if (selectedIds.size === pelerinsFiltrés.length) setSelectedIds(new Set())
    else setSelectedIds(new Set(pelerinsFiltrés.map(p => p.id)))
  }

  const clearAllFilters = () => {
    setActiveFilterType(null)
    setSelectedFilterValue(null)
    setStatutPaiementFilter('all')
    setPlateformeFilter('all')
    setSearchTerm('')
  }

  const handleGeneratePDF = async () => {
    setPdfGenerating(true)
    try {
      const toExport = selectedIds.size > 0
        ? pelerinsFiltrés.filter(p => selectedIds.has(p.id))
        : pelerinsFiltrés
      await exporterPDF(toExport, pdfShowPrix, pdfShowAgence)
    } finally {
      setPdfGenerating(false)
      setShowPdfModal(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50/50 px-3 sm:px-4 md:px-6 py-4 sm:py-6 md:py-10">
      <div className="max-w-7xl mx-auto">

        {/* ── DELETE CONFIRMATION MODAL ── */}
        {showDeleteConfirm && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4">
            <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setShowDeleteConfirm(false)} />
            <div className="relative bg-white rounded-2xl sm:rounded-3xl shadow-2xl w-full max-w-sm overflow-hidden animate-in fade-in zoom-in-95 duration-200">
              <div className="bg-gradient-to-r from-red-600 to-red-700 px-4 sm:px-6 py-4 sm:py-5">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 bg-white/20 rounded-xl flex items-center justify-center">
                    <Trash2 size={18} className="text-white" />
                  </div>
                  <div>
                    <h2 className="text-white font-black text-base sm:text-lg">Confirmer la suppression</h2>
                    <p className="text-red-100 text-xs sm:text-sm font-medium">
                      {selectedIds.size} pèlerin{selectedIds.size > 1 ? 's' : ''} sélectionné{selectedIds.size > 1 ? 's' : ''}
                    </p>
                  </div>
                </div>
              </div>

              <div className="p-4 sm:p-6 space-y-4">
                <p className="text-sm sm:text-base text-gray-700 font-semibold">
                  Êtes-vous sûr de vouloir supprimer {selectedIds.size} pèlerin{selectedIds.size > 1 ? 's' : ''} ? Cette action est irréversible.
                </p>

                <div className="bg-red-50 rounded-xl sm:rounded-2xl p-3 sm:p-4 border border-red-100">
                  <p className="text-xs sm:text-sm text-red-700 font-medium">
                    ⚠️ Les données supprimées ne pourront pas être récupérées.
                  </p>
                </div>

                <div className="flex flex-col-reverse sm:flex-row gap-3">
                  <button
                    onClick={() => setShowDeleteConfirm(false)}
                    disabled={deleting}
                    className="flex-1 py-2.5 sm:py-3 rounded-xl sm:rounded-2xl border-2 border-gray-100 text-gray-700 font-black text-sm hover:bg-gray-50 transition-colors disabled:opacity-50"
                  >
                    Annuler
                  </button>
                  <button
                    onClick={handleDeleteSelected}
                    disabled={deleting}
                    className="flex-1 py-2.5 sm:py-3 rounded-xl sm:rounded-2xl bg-gradient-to-r from-red-600 to-red-700 text-white font-black text-sm flex items-center justify-center gap-2 shadow-lg hover:shadow-xl transition-all hover:-translate-y-0.5 active:translate-y-0 disabled:opacity-60 disabled:cursor-not-allowed"
                  >
                    {deleting ? (
                      <><Loader2 size={16} className="animate-spin" /> Suppression...</>
                    ) : (
                      <><Trash2 size={16} /> Supprimer</>
                    )}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── PDF Export Modal ── */}
        {showPdfModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4">
            <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setShowPdfModal(false)} />
            <div className="relative bg-white rounded-2xl sm:rounded-3xl shadow-2xl w-full max-w-md overflow-hidden">
              <div className="bg-gradient-to-r from-slate-900 to-blue-900 px-4 sm:px-6 py-4 sm:py-5">
                <div className="flex items-center gap-3 mb-1">
                  <div className="w-9 h-9 bg-white/10 rounded-xl flex items-center justify-center">
                    <FileText size={18} className="text-white" />
                  </div>
                  <div>
                    <h2 className="text-white font-black text-base sm:text-lg">Export PDF</h2>
                    <p className="text-blue-300 text-xs font-medium">
                      {selectedIds.size > 0 ? `${selectedIds.size} pèlerins sélectionnés` : `${pelerinsFiltrés.length} pèlerins (filtrés)`}
                    </p>
                  </div>
                </div>
              </div>

              <div className="p-4 sm:p-6 space-y-4">
                <div>
                  <p className="text-xs font-black uppercase text-gray-400 tracking-wider mb-3">Options du document</p>
                  <div className="space-y-2">
                    {[
                      { key: 'prix', label: 'Inclure les informations de paiement', sublabel: 'Package, montant payé, solde restant', value: pdfShowPrix, set: setPdfShowPrix, icon: <BarChart3 size={16} className="text-blue-500" /> },
                      { key: 'agence', label: "Afficher le nom de l'agence", sublabel: "Colonne agence d'enregistrement", value: pdfShowAgence, set: setPdfShowAgence, icon: <Building2 size={16} className="text-violet-500" /> },
                    ].map(opt => (
                      <button
                        key={opt.key}
                        onClick={() => opt.set(!opt.value)}
                        className={`w-full flex items-center gap-3 p-3 sm:p-3.5 rounded-xl sm:rounded-2xl border-2 transition-all duration-200 text-left ${opt.value ? 'border-blue-500 bg-blue-50' : 'border-gray-100 bg-gray-50 hover:border-gray-200'}`}
                      >
                        <div className={`w-8 h-8 rounded-xl flex items-center justify-center ${opt.value ? 'bg-blue-100' : 'bg-white border border-gray-200'}`}>
                          {opt.icon}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-bold text-xs sm:text-sm text-gray-900">{opt.label}</p>
                          <p className="text-xs text-gray-500 font-medium">{opt.sublabel}</p>
                        </div>
                        <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-all ${opt.value ? 'bg-blue-500 border-blue-500' : 'border-gray-300'}`}>
                          {opt.value && <div className="w-2 h-2 bg-white rounded-full" />}
                        </div>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="bg-gray-50 rounded-xl sm:rounded-2xl p-3 sm:p-4 border border-gray-100">
                  <p className="text-[10px] font-black uppercase text-gray-400 tracking-wider mb-2">Aperçu du document</p>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div className="bg-white rounded-xl p-2.5 border border-gray-100 text-center">
                      <p className="font-black text-gray-900 text-base">{selectedIds.size > 0 ? selectedIds.size : pelerinsFiltrés.length}</p>
                      <p className="text-gray-400 font-medium">Pèlerins</p>
                    </div>
                    <div className="bg-white rounded-xl p-2.5 border border-gray-100 text-center">
                      <p className="font-black text-gray-900 text-base">{5 + (pdfShowPrix ? 3 : 0) + (pdfShowAgence ? 1 : 0)}</p>
                      <p className="text-gray-400 font-medium">Colonnes</p>
                    </div>
                  </div>
                </div>

                <div className="flex flex-col-reverse sm:flex-row gap-3">
                  <button
                    onClick={() => setShowPdfModal(false)}
                    className="flex-1 py-2.5 sm:py-3 rounded-xl sm:rounded-2xl border-2 border-gray-100 text-gray-700 font-black text-sm hover:bg-gray-50 transition-colors"
                  >
                    Annuler
                  </button>
                  <button
                    onClick={handleGeneratePDF}
                    disabled={pdfGenerating}
                    className="flex-1 py-2.5 sm:py-3 rounded-xl sm:rounded-2xl bg-gradient-to-r from-slate-900 to-blue-700 text-white font-black text-sm flex items-center justify-center gap-2 shadow-lg hover:shadow-xl transition-all hover:-translate-y-0.5 active:translate-y-0 disabled:opacity-60 disabled:cursor-not-allowed"
                  >
                    {pdfGenerating ? (
                      <><Loader2 size={16} className="animate-spin" /> Génération...</>
                    ) : (
                      <><FileText size={16} /> Générer le PDF</>
                    )}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── HEADER ── */}
        <div className="flex flex-col gap-4 sm:gap-5 mb-6 sm:mb-8">
          <div>
            <h1 className="text-2xl sm:text-3xl md:text-4xl font-black text-gray-900 tracking-tight">Dossiers</h1>
            <div className="flex items-center gap-3 mt-1.5 flex-wrap">
              <p className="text-gray-500 font-bold uppercase text-xs tracking-widest">{pelerins.length} pèlerins</p>
              {hasActiveFilters && (
                <span className="bg-blue-100 text-blue-700 text-[10px] font-black px-2 py-0.5 rounded-full border border-blue-200 flex items-center gap-1">
                  <Filter size={9} /> {pelerinsFiltrés.length} filtrés
                </span>
              )}
            </div>
          </div>

          {/* ── RESPONSIVE BUTTON GROUP ── */}
          <div className="flex flex-wrap gap-2 items-center">
            <YearSelector />

            <button
              onClick={() => { setSelectMode(!selectMode); setSelectedIds(new Set()) }}
              className={`flex items-center gap-1.5 px-3 sm:px-4 py-2.5 sm:py-3.5 rounded-xl sm:rounded-2xl font-black text-xs sm:text-sm border transition-all duration-200 hover:-translate-y-0.5 active:scale-95 ${selectMode ? 'bg-violet-600 text-white border-violet-600 shadow-lg shadow-violet-100' : 'bg-violet-50 text-violet-700 border-violet-100 hover:bg-violet-100'}`}
            >
              <CheckSquare size={16} />
              <span className="hidden sm:inline">{selectMode ? `${selectedIds.size} sél.` : 'Sélect.'}</span>
              <span className="sm:hidden">{selectMode ? `${selectedIds.size}` : 'Sél.'}</span>
            </button>

            {/* ── EXPORT & NEW BUTTONS ── */}
            <div className="ml-auto flex items-center gap-2 sm:ml-0 flex-wrap">
              <div className="relative" ref={exportRef}>
                <button
                  onClick={() => setShowExportMenu(!showExportMenu)}
                  className={`flex items-center gap-1 sm:gap-2 px-3 sm:px-4 py-2.5 sm:py-3.5 rounded-xl sm:rounded-2xl font-black text-xs sm:text-sm border transition-all duration-200 hover:-translate-y-0.5 active:scale-95 ${showExportMenu ? 'bg-gray-900 text-white border-gray-900 shadow-lg' : 'bg-gray-100 text-gray-700 border-gray-200 hover:bg-gray-200'}`}
                >
                  <Download size={16} />
                  <span className="hidden sm:inline">Exporter</span>
                  <ChevronDown size={13} className={`transition-transform duration-200 ${showExportMenu ? 'rotate-180' : ''}`} />
                </button>

                {showExportMenu && (
                  <div
                    className="absolute right-0 top-full mt-2 w-64 sm:w-72 bg-white rounded-2xl sm:rounded-3xl overflow-hidden z-20"
                    style={{ boxShadow: '0 8px 40px -8px rgba(0,0,0,0.20), 0 2px 12px -4px rgba(0,0,0,0.10)', border: '1px solid rgba(0,0,0,0.06)' }}
                  >
                    <div className="px-4 sm:px-5 pt-3 sm:pt-4 pb-2 sm:pb-3.5 bg-gradient-to-b from-gray-50/80 to-white border-b border-gray-100">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-xs font-black text-gray-800 tracking-tight">Exporter la liste</p>
                          <p className="text-[10px] text-gray-400 font-medium mt-0.5">
                            {selectedIds.size > 0
                              ? `${selectedIds.size} sélectionné(s)`
                              : `${pelerinsFiltrés.length} pèlerin${pelerinsFiltrés.length > 1 ? 's' : ''}`
                            }
                            {hasActiveFilters && ' · filtres actifs'}
                          </p>
                        </div>
                        {hasActiveFilters && (
                          <span className="bg-blue-100 text-blue-700 text-[9px] font-black px-2 py-1 rounded-lg border border-blue-200">
                            Filtré
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="p-2 sm:p-2.5 space-y-1">
                      <button
                        onClick={() => { exporterExcel(); setShowExportMenu(false) }}
                        className="w-full flex items-center gap-3 sm:gap-3.5 px-3 sm:px-3.5 py-2.5 sm:py-3.5 rounded-xl sm:rounded-2xl hover:bg-emerald-50/80 transition-all duration-150 text-left group active:scale-[0.98]"
                      >
                        <div className="w-10 sm:w-11 h-10 sm:h-11 bg-gradient-to-br from-emerald-400 to-emerald-600 rounded-lg sm:rounded-2xl flex items-center justify-center shrink-0 shadow-md shadow-emerald-200/60 group-hover:shadow-lg group-hover:shadow-emerald-200 group-hover:-translate-y-0.5 transition-all duration-200">
                          <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                            <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8l-6-6z" fill="white" fillOpacity="0.2"/>
                            <path d="M14 2v6h6" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                            <path d="M8 13l2 2 4-4" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                            <path d="M8 17h8" stroke="white" strokeWidth="1.5" strokeLinecap="round" opacity="0.7"/>
                          </svg>
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-0.5">
                            <p className="font-black text-gray-900 text-xs sm:text-sm">Tableur Excel</p>
                            <span className="text-[9px] font-black bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded-md border border-emerald-200">.xlsx</span>
                          </div>
                          <p className="text-[10px] sm:text-[11px] text-gray-400 font-medium leading-tight">Modifiable · compatible Google Sheets</p>
                        </div>
                        <div className="w-6 sm:w-7 h-6 sm:h-7 rounded-lg sm:rounded-xl bg-gray-100 flex items-center justify-center group-hover:bg-emerald-100 transition-colors shrink-0">
                          <ChevronRight size={13} className="text-gray-400 group-hover:text-emerald-600 transition-colors" />
                        </div>
                      </button>

                      <button
                        onClick={() => { setShowPdfModal(true); setShowExportMenu(false) }}
                        className="w-full flex items-center gap-3 sm:gap-3.5 px-3 sm:px-3.5 py-2.5 sm:py-3.5 rounded-xl sm:rounded-2xl hover:bg-rose-50/80 transition-all duration-150 text-left group active:scale-[0.98]"
                      >
                        <div className="w-10 sm:w-11 h-10 sm:h-11 bg-gradient-to-br from-rose-400 to-red-600 rounded-lg sm:rounded-2xl flex items-center justify-center shrink-0 shadow-md shadow-rose-200/60 group-hover:shadow-lg group-hover:shadow-rose-200 group-hover:-translate-y-0.5 transition-all duration-200">
                          <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                            <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8l-6-6z" fill="white" fillOpacity="0.2"/>
                            <path d="M14 2v6h6" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                            <path d="M9 13h6M9 16.5h4" stroke="white" strokeWidth="1.5" strokeLinecap="round"/>
                          </svg>
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-0.5">
                            <p className="font-black text-gray-900 text-xs sm:text-sm">Document PDF</p>
                            <span className="text-[9px] font-black bg-rose-100 text-rose-700 px-1.5 py-0.5 rounded-md border border-rose-200">.pdf</span>
                          </div>
                          <p className="text-[10px] sm:text-[11px] text-gray-400 font-medium leading-tight">Imprimable · options avancées</p>
                        </div>
                        <div className="w-6 sm:w-7 h-6 sm:h-7 rounded-lg sm:rounded-xl bg-gray-100 flex items-center justify-center group-hover:bg-rose-100 transition-colors shrink-0">
                          <ChevronRight size={13} className="text-gray-400 group-hover:text-rose-600 transition-colors" />
                        </div>
                      </button>
                    </div>

                    <div className="mx-2 sm:mx-3 mb-2 sm:mb-3 px-3 sm:px-3.5 py-2 sm:py-2.5 bg-gray-50 rounded-xl sm:rounded-2xl border border-gray-100">
                      <p className="text-[10px] text-gray-400 font-medium text-center leading-tight">
                        Les filtres actifs s'appliquent à l'export
                      </p>
                    </div>
                  </div>
                )}
              </div>

              <Link
                href="/hajj/ajouter-pelerin"
                className="flex items-center gap-1.5 sm:gap-2 bg-blue-600 text-white hover:bg-blue-700 px-3 sm:px-4 py-2.5 sm:py-3.5 rounded-xl sm:rounded-2xl font-black text-xs sm:text-sm shadow-lg shadow-blue-200 hover:shadow-xl transition-all duration-200 hover:-translate-y-0.5 active:scale-95"
              >
                <Plus size={16} /> <span className="hidden sm:inline">Nouveau</span>
              </Link>
            </div>
          </div>
        </div>

        {/* ── LIVE STATS BAR ── */}
        {!loading && pelerinsFiltrés.length > 0 && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 sm:gap-3 mb-6 sm:mb-8">
            {[
              {
                label: 'Total encaissé',
                value: `${(totalPaye / 1000000).toFixed(1)}M F`,
                sub: `sur ${(totalPackage / 1000000).toFixed(1)}M F`,
                icon: <TrendingUp size={16} />,
                color: 'text-emerald-600', bg: 'bg-emerald-50', border: 'border-emerald-100',
                bar: totalPackage > 0 ? (totalPaye / totalPackage) * 100 : 0,
                barColor: 'bg-emerald-500'
              },
              {
                label: 'Reste à payer',
                value: `${((totalPackage - totalPaye) / 1000000).toFixed(1)}M F`,
                sub: `${pelerinsFiltrés.filter(p => getPaiementStatut(p) !== 'complet').length} pèlerins`,
                icon: <AlertCircle size={16} />,
                color: 'text-red-500', bg: 'bg-red-50', border: 'border-red-100',
                bar: null, barColor: ''
              },
              {
                label: 'Paiements complets',
                value: `${nbComplets}`,
                sub: `${totalPaye > 0 ? Math.round((nbComplets / pelerinsFiltrés.length) * 100) : 0}% du groupe`,
                icon: <CheckCircle2 size={16} />,
                color: 'text-blue-600', bg: 'bg-blue-50', border: 'border-blue-100',
                bar: pelerinsFiltrés.length > 0 ? (nbComplets / pelerinsFiltrés.length) * 100 : 0,
                barColor: 'bg-blue-500'
              },
              {
                label: 'Plateforme Gouv',
                value: `${nbGouv} / ${pelerinsFiltrés.length}`,
                sub: `${pelerinsFiltrés.length > 0 ? Math.round((nbGouv / pelerinsFiltrés.length) * 100) : 0}% inscrits`,
                icon: <Clock size={16} />,
                color: 'text-violet-600', bg: 'bg-violet-50', border: 'border-violet-100',
                bar: pelerinsFiltrés.length > 0 ? (nbGouv / pelerinsFiltrés.length) * 100 : 0,
                barColor: 'bg-violet-500'
              },
            ].map((stat, i) => (
              <div key={i} className={`${stat.bg} border ${stat.border} rounded-xl sm:rounded-2xl p-3 sm:p-4`}>
                <div className="flex items-center justify-between mb-1">
                  <span className={`${stat.color} opacity-70`}>{stat.icon}</span>
                  <span className={`font-black text-base sm:text-lg ${stat.color}`}>{stat.value}</span>
                </div>
                <p className="text-[9px] sm:text-[10px] font-black uppercase text-gray-400 tracking-wider leading-tight">{stat.label}</p>
                <p className="text-[9px] sm:text-[10px] font-bold text-gray-500 mt-0.5">{stat.sub}</p>
                {stat.bar !== null && (
                  <div className="mt-2 w-full bg-white/60 h-1 rounded-full overflow-hidden">
                    <div className={`h-full ${stat.barColor} rounded-full transition-all duration-500`} style={{ width: `${stat.bar}%` }} />
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* ── SEARCH ── */}
        <div className="mb-4 relative group">
          <input
            type="text"
            placeholder="Nom, prénom, passeport, téléphone, agence, référence..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 sm:pl-12 pr-10 py-3 sm:py-4 rounded-xl sm:rounded-3xl border-2 border-gray-100 bg-white text-gray-900 font-bold text-sm sm:text-base focus:border-blue-600 focus:ring-0 outline-none transition-all duration-200 shadow-sm group-hover:border-gray-200 focus:shadow-md"
          />
          <Search className="absolute left-3 sm:left-4 top-3 sm:top-4 text-gray-400 group-focus-within:text-blue-600 transition-colors duration-200" size={20} />
          {searchTerm && (
            <button onClick={() => setSearchTerm('')} className="absolute right-3 sm:right-4 top-3 sm:top-4 text-gray-300 hover:text-gray-500 transition-colors">
              <X size={18} />
            </button>
          )}
        </div>

        {/* ── FILTER PANEL TOGGLE ── */}
        <div className="mb-4 flex items-center gap-2 flex-wrap">
          <button
            onClick={() => setShowFilterPanel(!showFilterPanel)}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-lg sm:rounded-xl text-xs font-black transition-all duration-200 active:scale-95 border ${showFilterPanel || hasActiveFilters ? 'bg-blue-600 text-white border-blue-600 shadow-md' : 'bg-gray-100 text-gray-600 border-transparent hover:bg-gray-200'}`}
          >
            <SlidersHorizontal size={13} />
            Filtres
            {activeFilterCount > 0 && (
              <span className="bg-white/20 rounded-full w-4 h-4 flex items-center justify-center text-[9px] font-black">
                {activeFilterCount}
              </span>
            )}
          </button>

          {(['all', 'complet', 'partiel', 'non_paye'] as PaiementStatut[]).map(s => {
            const labels = { all: 'Tous', complet: '✓ Complets', partiel: '◑ Partiels', non_paye: '✗ Non payés' }
            return (
              <button
                key={s}
                onClick={() => setStatutPaiementFilter(s)}
                className={`flex items-center gap-1 px-2.5 sm:px-3 py-2 rounded-lg sm:rounded-xl text-xs font-black transition-all duration-200 active:scale-95 ${statutPaiementFilter === s ? 'bg-gray-900 text-white shadow-sm' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
              >
                {labels[s]}
              </button>
            )
          })}

          {hasActiveFilters && (
            <button
              onClick={clearAllFilters}
              className="flex items-center gap-1 px-2.5 sm:px-3 py-2 rounded-lg sm:rounded-xl text-xs font-black bg-red-50 text-red-600 hover:bg-red-100 transition-colors border border-red-100 active:scale-95"
            >
              <X size={12} /> Réinit.
            </button>
          )}
        </div>

        {/* ── ADVANCED FILTER PANEL ── */}
        {showFilterPanel && (
          <div className="mb-6 bg-white rounded-xl sm:rounded-3xl border border-gray-100 shadow-sm p-4 sm:p-5 space-y-4 animate-in fade-in slide-in-from-top-2 duration-200">
            <div>
              <p className="text-[10px] font-black uppercase text-gray-400 tracking-wider mb-2">Plateforme d'inscription</p>
              <div className="flex flex-wrap gap-2">
                {[
                  { key: 'all', label: 'Toutes' },
                  { key: 'gouv', label: '🏛 Gouv' },
                  { key: 'nusuk', label: '🕌 Nusuk' },
                  { key: 'both', label: '✅ Les deux' },
                  { key: 'neither', label: '⚠️ Aucune' },
                ].map(opt => (
                  <button
                    key={opt.key}
                    onClick={() => setPlateformeFilter(opt.key as any)}
                    className={`px-2.5 sm:px-3 py-1.5 rounded-lg sm:rounded-xl text-xs font-bold transition-all duration-150 active:scale-95 ${plateformeFilter === opt.key ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <p className="text-[10px] font-black uppercase text-gray-400 tracking-wider mb-2">Filtrer par champ</p>
              <div className="flex flex-wrap gap-2">
                {([
                  { type: 'date', icon: <Calendar size={12} />, label: 'Date inscription' },
                  { type: 'date_depart', icon: <Calendar size={12} />, label: 'Date départ' },
                  { type: 'date_retour', icon: <Calendar size={12} />, label: 'Date retour' },
                  { type: 'reference', icon: <Hash size={12} />, label: 'Référence' },
                  { type: 'agence', icon: <Building2 size={12} />, label: 'Agence' },
                  { type: 'phone', icon: <Phone size={12} />, label: 'Téléphone' },
                ] as { type: FilterType; icon: React.ReactNode; label: string }[]).map(f => (
                  <button
                    key={f.type as string}
                    onClick={() => handleFilterTypeClick(f.type)}
                    className={`flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-lg sm:rounded-xl text-xs font-black transition-all duration-200 active:scale-95 ${activeFilterType === f.type ? 'bg-blue-600 text-white shadow-sm' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
                  >
                    {f.icon} {f.label}
                  </button>
                ))}
              </div>
            </div>

            {activeFilterType && (
              <div className="bg-gray-50 rounded-lg sm:rounded-2xl p-3 sm:p-4 border border-gray-100 max-h-44 overflow-y-auto">
                <div className="flex justify-between items-center mb-2">
                  <span className="text-[10px] font-black uppercase text-gray-400 tracking-wider">Choisir une valeur :</span>
                  {selectedFilterValue && (
                    <span className="bg-blue-50 text-blue-700 text-[10px] font-black px-2 py-0.5 rounded-md flex items-center gap-1">
                      {selectedFilterValue}
                      <X size={10} className="cursor-pointer" onClick={() => setSelectedFilterValue(null)} />
                    </span>
                  )}
                </div>
                <div className="flex flex-wrap gap-2">
                  {getFilterOptions().length === 0 ? (
                    <span className="text-xs font-bold text-gray-400 italic">Aucune donnée disponible</span>
                  ) : (
                    getFilterOptions().map((option, index) => (
                      <button
                        key={index}
                        onClick={() => setSelectedFilterValue(option)}
                        className={`px-2.5 sm:px-3 py-1.5 rounded-lg sm:rounded-xl text-xs font-bold transition-all duration-150 cursor-pointer ${selectedFilterValue === option ? 'bg-gray-900 text-white shadow-sm' : 'bg-white text-gray-700 border border-gray-200 hover:border-gray-400'}`}
                      >
                        {option}
                      </button>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── SELECT ALL & DELETE BAR ── */}
        {selectMode && (
          <div className="mb-4 bg-violet-50 border border-violet-100 rounded-xl sm:rounded-2xl px-3 sm:px-4 py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 animate-in fade-in slide-in-from-top-2 duration-200">
            <button onClick={toggleSelectAll} className="flex items-center gap-2 text-violet-700 font-black text-xs sm:text-sm hover:text-violet-900 transition-colors">
              {selectedIds.size === pelerinsFiltrés.length && pelerinsFiltrés.length > 0
                ? <CheckSquare size={18} /> : <Square size={18} />}
              {selectedIds.size > 0 ? `${selectedIds.size} sélectionné(s)` : 'Tout sélectionner'}
            </button>
            {selectedIds.size > 0 && (
              <div className="flex gap-2 flex-wrap">
                <button
                  onClick={() => setShowPdfModal(true)}
                  className="flex items-center gap-1.5 bg-violet-600 text-white px-3 sm:px-4 py-2 rounded-lg sm:rounded-xl text-xs font-black hover:bg-violet-700 transition-colors active:scale-95"
                >
                  <FileText size={14} /> Export
                </button>
                <button
                  onClick={() => setShowDeleteConfirm(true)}
                  className="flex items-center gap-1.5 bg-red-600 text-white px-3 sm:px-4 py-2 rounded-lg sm:rounded-xl text-xs font-black hover:bg-red-700 transition-colors active:scale-95"
                >
                  <Trash2 size={14} /> Supprimer
                </button>
              </div>
            )}
          </div>
        )}

        {/* Synchro arrière-plan — non bloquante */}
        {backgroundUpdating && !loading && (
          <div className="mb-5 rounded-lg sm:rounded-2xl border border-blue-100 bg-blue-50 px-3 sm:px-4 py-3 text-xs sm:text-sm font-semibold text-blue-800 shadow-sm flex items-center gap-2">
            <Sparkles size={14} className="animate-pulse" />
            Synchronisation en arrière-plan...
          </div>
        )}

        {/* ── LISTE ── */}
        <div className="space-y-3 sm:space-y-4 md:space-y-0">
          {loading ? (
            <div className="py-16 sm:py-20 flex flex-col items-center justify-center text-gray-400 font-black uppercase tracking-widest gap-3">
              <Loader2 className="animate-spin text-blue-600" size={28} />
              Chargement initial...
            </div>
          ) : pelerinsFiltrés.length === 0 ? (
            <div className="py-16 sm:py-20 flex flex-col items-center justify-center gap-4 text-center">
              <div className="w-14 sm:w-16 h-14 sm:h-16 bg-gray-100 rounded-2xl sm:rounded-3xl flex items-center justify-center">
                <Search size={24} className="text-gray-300" />
              </div>
              <div>
                <p className="font-black text-gray-700 text-base sm:text-lg">Aucun résultat</p>
                <p className="text-gray-400 font-medium text-xs sm:text-sm mt-1">Essayez de modifier vos filtres ou votre recherche</p>
              </div>
              <button onClick={clearAllFilters} className="text-blue-600 font-black text-xs sm:text-sm hover:underline">Réinitialiser tout</button>
            </div>
          ) : (
            <>
              {/* ── MOBILE CARDS ── */}
              <div className="md:hidden space-y-3">
                {pelerinsFiltrés.map((p) => {
                  const statut = getPaiementStatut(p)
                  const colors = getPaiementColor(statut)
                  const completion = getCompletion(p)
                  const isSelected = selectedIds.has(p.id)

                  return (
                    <div
                      key={p.id}
                      className={`bg-white rounded-xl sm:rounded-3xl border-2 shadow-sm transition-all duration-200 overflow-hidden ${isSelected ? 'border-violet-400 shadow-violet-100' : 'border-gray-100 hover:border-gray-200 hover:shadow-md'}`}
                    >
                      <div className="px-3 sm:px-4 pt-3 sm:pt-4 pb-2 sm:pb-3">
                        <div className="flex items-start gap-2 sm:gap-3">
                          {selectMode && (
                            <button onClick={() => toggleSelect(p.id)} className="mt-0.5 shrink-0">
                              {isSelected ? <CheckSquare size={20} className="text-violet-600" /> : <Square size={20} className="text-gray-300" />}
                            </button>
                          )}
                          <div className={`w-10 sm:w-11 h-10 sm:h-11 rounded-lg sm:rounded-2xl flex items-center justify-center font-black text-sm shrink-0 ${statut === 'complet' ? 'bg-emerald-100 text-emerald-700' : statut === 'partiel' ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-600'}`}>
                            {(p.prenom || p.nom_complet).charAt(0).toUpperCase()}
                          </div>
                          <div className="flex-1 min-w-0">
                            <h3 className="font-black text-gray-900 text-sm sm:text-base leading-tight truncate">{p.prenom} {p.nom_complet}</h3>
                            <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                              <span className="font-mono text-[9px] sm:text-[10px] bg-gray-100 px-2 py-0.5 rounded-lg text-gray-600 font-bold">{p.num_passeport}</span>
                              {p.telephone_pelerin && (
                                <span className="text-[9px] sm:text-[10px] text-gray-400 font-medium">{p.telephone_pelerin}</span>
                              )}
                            </div>
                          </div>
                          <span className={`text-[8px] sm:text-[9px] font-black px-2 py-1 rounded-lg border shrink-0 ${colors.light}`}>
                            {statut === 'complet' ? '✓ COMPLET' : statut === 'partiel' ? '◑ PARTIEL' : '✗ NON PAYÉ'}
                          </span>
                        </div>
                      </div>

                      <div className="px-3 sm:px-4 pb-2 sm:pb-3">
                        <div className="bg-gray-50 rounded-lg sm:rounded-2xl p-2.5 sm:p-3 border border-gray-100">
                          <div className="flex justify-between text-[9px] sm:text-[10px] font-black uppercase mb-1">
                            <span className="text-gray-500">Paiement</span>
                            <span className={colors.text}>{Math.round((p.total_paye / p.prix_package) * 100) || 0}%</span>
                          </div>
                          <div className="w-full bg-gray-200 h-1 rounded-full overflow-hidden mb-1">
                            <div className={`h-full ${colors.bg} rounded-full transition-all duration-500`} style={{ width: `${Math.min((p.total_paye / p.prix_package) * 100, 100)}%` }} />
                          </div>
                          <div className="flex justify-between text-[9px] font-bold text-gray-500">
                            <span>{p.total_paye.toLocaleString()} F</span>
                            <span>{p.prix_package.toLocaleString()} F</span>
                          </div>
                        </div>
                      </div>

                      <div className="border-t border-gray-50 px-3 sm:px-4 py-2.5 sm:py-3 flex items-center justify-between gap-2 sm:gap-3 flex-wrap">
                        <div className="flex items-center gap-2 sm:gap-3">
                          <div className="flex gap-1.5 sm:gap-2">
                            <button
                              onClick={() => toggleFastStatus(p.id, 'sur_plateforme_gouv', p.sur_plateforme_gouv)}
                              disabled={updatingId === p.id + 'sur_plateforme_gouv'}
                              className={`flex items-center gap-1 px-2 py-1 rounded-lg text-[8px] sm:text-[9px] font-black transition-all active:scale-90 border ${p.sur_plateforme_gouv ? 'bg-green-50 border-green-200 text-green-700' : 'bg-gray-50 border-gray-200 text-gray-400'}`}
                            >
                              {updatingId === p.id + 'sur_plateforme_gouv' ? <Loader2 size={9} className="animate-spin" /> : <div className={`w-1.5 h-1.5 rounded-full ${p.sur_plateforme_gouv ? 'bg-green-500' : 'bg-gray-300'}`} />}
                              GOUV
                            </button>
                            <button
                              onClick={() => toggleFastStatus(p.id, 'sur_plateforme_nusuk', p.sur_plateforme_nusuk)}
                              disabled={updatingId === p.id + 'sur_plateforme_nusuk'}
                              className={`flex items-center gap-1 px-2 py-1 rounded-lg text-[8px] sm:text-[9px] font-black transition-all active:scale-90 border ${p.sur_plateforme_nusuk ? 'bg-blue-50 border-blue-200 text-blue-700' : 'bg-gray-50 border-gray-200 text-gray-400'}`}
                            >
                              {updatingId === p.id + 'sur_plateforme_nusuk' ? <Loader2 size={9} className="animate-spin" /> : <div className={`w-1.5 h-1.5 rounded-full ${p.sur_plateforme_nusuk ? 'bg-blue-500' : 'bg-gray-300'}`} />}
                              NUSUK
                            </button>
                          </div>

                          <div className="flex items-center gap-1">
                            <div className="relative w-7 h-7">
                              <svg className="w-7 h-7 -rotate-90" viewBox="0 0 28 28">
                                <circle cx="14" cy="14" r="11" fill="none" stroke="#f1f5f9" strokeWidth="3" />
                                <circle cx="14" cy="14" r="11" fill="none" stroke={completion >= 100 ? '#10b981' : completion >= 60 ? '#3b82f6' : '#f59e0b'} strokeWidth="3" strokeDasharray={`${(completion / 100) * 69.1} 69.1`} strokeLinecap="round" />
                              </svg>
                              <span className="absolute inset-0 flex items-center justify-center text-[7px] font-black text-gray-600">{completion}%</span>
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 w-full sm:w-auto">
                          {p.agences?.nom_agence && (
                            <span className="text-[9px] text-gray-400 font-medium hidden sm:block max-w-[100px] truncate">{p.agences.nom_agence}</span>
                          )}
                          <Link
                            onClick={handlePersistScroll}
                            href={`/hajj/pelerin/${p.id}`}
                            className="flex-1 sm:flex-none bg-gray-900 text-white hover:bg-blue-600 px-3 sm:px-4 py-2 rounded-lg sm:rounded-xl text-xs font-black flex items-center justify-center gap-1 transition-all duration-200 active:scale-95 shrink-0"
                          >
                            Dossier <ChevronRight size={13} />
                          </Link>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>

              {/* ── DESKTOP TABLE ── */}
              <div className="hidden md:block bg-white rounded-2xl lg:rounded-[2.5rem] shadow-sm border border-gray-100 overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-gray-50/50 border-b border-gray-100">
                      {selectMode && (
                        <th className="pl-4 lg:pl-6 py-4 lg:py-5 w-10">
                          <button onClick={toggleSelectAll}>
                            {selectedIds.size === pelerinsFiltrés.length && pelerinsFiltrés.length > 0
                              ? <CheckSquare size={16} className="text-violet-600" />
                              : <Square size={16} className="text-gray-300" />}
                          </button>
                        </th>
                      )}
                      <th className="px-4 lg:px-6 py-4 lg:py-5 text-[10px] font-black text-gray-400 uppercase tracking-widest">Pèlerin</th>
                      <th className="px-4 lg:px-6 py-4 lg:py-5 text-[10px] font-black text-gray-400 uppercase tracking-widest">Passeport</th>
                      <th className="px-4 lg:px-6 py-4 lg:py-5 text-[10px] font-black text-gray-400 uppercase tracking-widest">Plateformes</th>
                      <th className="px-4 lg:px-6 py-4 lg:py-5 text-[10px] font-black text-gray-400 uppercase tracking-widest">Dossier</th>
                      <th className="px-4 lg:px-6 py-4 lg:py-5 text-[10px] font-black text-gray-400 uppercase tracking-widest">{role === 'admin' ? 'Agence' : 'Paiement'}</th>
                      <th className="px-4 lg:px-6 py-4 lg:py-5 text-[10px] font-black text-gray-400 uppercase tracking-widest text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {pelerinsFiltrés.map((p) => {
                      const statut = getPaiementStatut(p)
                      const colors = getPaiementColor(statut)
                      const completion = getCompletion(p)
                      const isSelected = selectedIds.has(p.id)

                      return (
                        <tr key={p.id} className={`transition-colors duration-150 group ${isSelected ? 'bg-violet-50/60' : 'hover:bg-blue-50/15'}`}>
                          {selectMode && (
                            <td className="pl-4 lg:pl-6 py-4 lg:py-5">
                              <button onClick={() => toggleSelect(p.id)}>
                                {isSelected ? <CheckSquare size={16} className="text-violet-600" /> : <Square size={16} className="text-gray-300" />}
                              </button>
                            </td>
                          )}
                          <td className="px-4 lg:px-6 py-4 lg:py-5">
                            <div className="flex items-center gap-3">
                              <div className={`w-9 h-9 rounded-xl flex items-center justify-center font-black text-sm shrink-0 ${statut === 'complet' ? 'bg-emerald-100 text-emerald-700' : statut === 'partiel' ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-600'}`}>
                                {(p.prenom || p.nom_complet).charAt(0).toUpperCase()}
                              </div>
                              <div>
                                <div className="font-black text-gray-900 text-base group-hover:text-blue-900 transition-colors duration-150">{p.prenom} {p.nom_complet}</div>
                                <div className="text-xs text-gray-400 font-medium">{p.telephone_pelerin || 'Aucun numéro'}</div>
                              </div>
                            </div>
                          </td>

                          <td className="px-4 lg:px-6 py-4 lg:py-5">
                            <span className="bg-gray-100 px-3 py-1.5 rounded-xl font-mono font-black text-gray-700 uppercase text-sm border border-gray-200">
                              {p.num_passeport}
                            </span>
                          </td>

                          <td className="px-4 lg:px-6 py-4 lg:py-5">
                            <div className="flex gap-2">
                              <button
                                onClick={() => toggleFastStatus(p.id, 'sur_plateforme_gouv', p.sur_plateforme_gouv)}
                                disabled={updatingId === p.id + 'sur_plateforme_gouv'}
                                className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-[10px] font-black transition-all hover:scale-105 active:scale-90 border ${p.sur_plateforme_gouv ? 'bg-green-50 border-green-200 text-green-700 shadow-sm' : 'bg-gray-50 border-gray-200 text-gray-400'}`}
                              >
                                {updatingId === p.id + 'sur_plateforme_gouv' ? <Loader2 size={10} className="animate-spin" /> : <div className={`w-2 h-2 rounded-full ${p.sur_plateforme_gouv ? 'bg-green-500' : 'bg-gray-300'}`} />}
                                Gouv
                              </button>
                              <button
                                onClick={() => toggleFastStatus(p.id, 'sur_plateforme_nusuk', p.sur_plateforme_nusuk)}
                                disabled={updatingId === p.id + 'sur_plateforme_nusuk'}
                                className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-[10px] font-black transition-all hover:scale-105 active:scale-90 border ${p.sur_plateforme_nusuk ? 'bg-blue-50 border-blue-200 text-blue-700 shadow-sm' : 'bg-gray-50 border-gray-200 text-gray-400'}`}
                              >
                                {updatingId === p.id + 'sur_plateforme_nusuk' ? <Loader2 size={10} className="animate-spin" /> : <div className={`w-2 h-2 rounded-full ${p.sur_plateforme_nusuk ? 'bg-blue-500' : 'bg-gray-300'}`} />}
                                Nusuk
                              </button>
                            </div>
                          </td>

                          <td className="px-4 lg:px-6 py-4 lg:py-5">
                            <div className="flex items-center gap-2">
                              <div className="relative w-8 h-8 shrink-0">
                                <svg className="w-8 h-8 -rotate-90" viewBox="0 0 32 32">
                                  <circle cx="16" cy="16" r="12" fill="none" stroke="#f1f5f9" strokeWidth="3.5" />
                                  <circle cx="16" cy="16" r="12" fill="none" stroke={completion >= 100 ? '#10b981' : completion >= 60 ? '#3b82f6' : '#f59e0b'} strokeWidth="3.5" strokeDasharray={`${(completion / 100) * 75.4} 75.4`} strokeLinecap="round" />
                                </svg>
                                <span className="absolute inset-0 flex items-center justify-center text-[8px] font-black text-gray-600">{completion}%</span>
                              </div>
                              <span className={`text-[9px] font-black px-2 py-0.5 rounded-lg border ${colors.light}`}>
                                {statut === 'complet' ? 'COMPLET' : statut === 'partiel' ? 'PARTIEL' : 'NON PAYÉ'}
                              </span>
                            </div>
                          </td>

                          <td className="px-4 lg:px-6 py-4 lg:py-5">
                            {role === 'admin' ? (
                              <span className="font-bold text-gray-900">{p.agences?.nom_agence}</span>
                            ) : (
                              <div className="w-52">
                                <div className="flex justify-between text-[10px] font-black uppercase mb-1">
                                  <span className={`font-extrabold ${colors.text}`}>{Math.round((p.total_paye / p.prix_package) * 100) || 0}%</span>
                                </div>
                                <div className="w-full bg-gray-100 h-2 rounded-full overflow-hidden mb-1">
                                  <div className={`h-full ${colors.bg} rounded-full transition-all duration-500`} style={{ width: `${Math.min((p.total_paye / p.prix_package) * 100, 100)}%` }} />
                                </div>
                                <div className="flex justify-between text-xs font-bold text-slate-700">
                                  <span>{p.total_paye.toLocaleString()} F</span>
                                  <span className="text-gray-400">/ {p.prix_package.toLocaleString()} F</span>
                                </div>
                              </div>
                            )}
                          </td>

                          <td className="px-4 lg:px-6 py-4 lg:py-5 text-right">
                            <Link
                              onClick={handlePersistScroll}
                              href={`/hajj/pelerin/${p.id}`}
                              className="inline-flex items-center gap-1.5 px-5 py-2.5 bg-gray-900 text-white rounded-xl font-black text-xs hover:bg-blue-600 transition-all duration-200 hover:-translate-y-0.5 active:scale-95 shadow-sm hover:shadow-md"
                            >
                              Détails <ChevronRight size={13} />
                            </Link>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>

        {/* ── BOTTOM COUNTER ── */}
        {!loading && pelerinsFiltrés.length > 0 && (
          <div className="mt-6 sm:mt-8 text-center">
            <p className="text-xs font-bold text-gray-400">
              {pelerinsFiltrés.length} pèlerin{pelerinsFiltrés.length > 1 ? 's' : ''} affiché{pelerinsFiltrés.length > 1 ? 's' : ''}
              {hasActiveFilters && ` sur ${pelerins.length} au total`}
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
