'use client'
import { useEffect, useLayoutEffect, useState, useRef, useMemo } from 'react'
import { useQuery, usePowerSync } from '@powersync/react'
import { requireSupabaseRows, supabase, getUser } from '@/lib/supabase'
import { useYear } from '@/lib/YearContext'
import { YearSelector } from '@/components/YearSelector'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  Search, Download, Plus, ChevronRight, Loader2, Calendar, Hash,
  Building2, Phone, X, FileText, FileSpreadsheet, CheckSquare, Square, Filter, Trash2,
  TrendingUp, AlertCircle, CheckCircle2, Clock, SlidersHorizontal,
  ChevronDown, Eye, MessageCircle, Syringe, UserCheck, BookOpen, Globe,
  ArrowDown, ArrowUp
} from 'lucide-react'
import ExcelJS from 'exceljs'
import { saveAs } from 'file-saver'
import { getPassportPublicUrl } from '@/lib/hajjPassport'

interface Pelerin {
  id: string
  prenom: string
  nom_complet: string
  num_passeport: string
  telephone_pelerin: string
  document_url: string
  photo_url?: string | null
  notes?: string | null
  date_naissance?: string
  date_expiration?: string
  created_at?: string
  reference?: string
  agence_ou_personne_associee?: string
  total_paye: number
  prix_package: number
  sur_plateforme_gouv: boolean
  sur_plateforme_nusuk: boolean
  hajj_session_id?: string | null
  campagne?: number
  date_depart?: string
  date_retour?: string
  hotel_mecque?: string | null
  hotel_medine?: string | null
  chambre_mecque_id?: string | null
  chambre_medine_id?: string | null
  vacciné?: number | boolean
  visite_medicale?: number | boolean
  formation_suivie?: number | boolean
  visa_obtenu?: number | boolean
  hotel_statut?: number | boolean
  agences?: { nom_agence?: string }
}

type FilterType = 'date' | 'reference' | 'agence' | 'phone' | 'date_depart' | 'date_retour' | 'hotel' | null
type PaiementStatut = 'all' | 'complet' | 'partiel' | 'non_paye'

const FILTERS_STORAGE_KEY = 'liste_pelerins_filters'

// Formateur strict sans caractère d'échappement (espace pur)
const formatMoney = (val: number | string | null | undefined): string => {
  const num = Math.round(Number(val) || 0)
  return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ')
}

const getPaiementStatut = (p: Pelerin): PaiementStatut => {
  const pct = p.prix_package > 0 ? (p.total_paye / p.prix_package) * 100 : 0
  if (pct >= 100) return 'complet'
  if (pct > 0) return 'partiel'
  return 'non_paye'
}

const getPaiementBadgeColor = (statut: PaiementStatut) => {
  if (statut === 'complet') return 'bg-emerald-50 text-emerald-700 border-emerald-200'
  if (statut === 'partiel') return 'bg-amber-50 text-amber-700 border-amber-200'
  return 'bg-red-50 text-red-700 border-red-200'
}

// Exportation PDF Haute Qualité avec numéro officiel fixe conservé
const exporterPDF = async (
  pelerins: Pelerin[], 
  showPrix: boolean, 
  showAgence: boolean, 
  nomAgenceEntete: string,
  numberMap: Map<string, number>
) => {
  const { jsPDF } = await import('jspdf')
  const autoTable = (await import('jspdf-autotable')).default

  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })

  doc.setFillColor(15, 23, 42)
  doc.rect(0, 0, 297, 26, 'F')
  doc.setFillColor(37, 99, 235)
  doc.rect(0, 26, 297, 2, 'F')

  doc.setTextColor(255, 255, 255)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(14)
  doc.text((nomAgenceEntete || 'AGENCE HAJJ & OMRA').toUpperCase(), 14, 11)

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8.5)
  doc.setTextColor(203, 213, 225)
  const dateGeneration = new Date().toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' })
  doc.text(`RÉPERTOIRE OFFICIEL DES PÈLERINS  •  Édité le ${dateGeneration}  •  Total : ${pelerins.length} inscrits`, 14, 18)

  const totalPackage = pelerins.reduce((s, p) => s + (p.prix_package || 0), 0)
  const totalPaye = pelerins.reduce((s, p) => s + (p.total_paye || 0), 0)
  const nbComplets = pelerins.filter(p => getPaiementStatut(p) === 'complet').length
  const nbGouv = pelerins.filter(p => p.sur_plateforme_gouv).length
  const nbNusuk = pelerins.filter(p => p.sur_plateforme_nusuk).length

  doc.setFillColor(248, 250, 252)
  doc.setDrawColor(226, 232, 240)
  doc.roundedRect(14, 32, 269, 13, 2, 2, 'FD')

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8)
  doc.setTextColor(30, 41, 59)
  doc.text(`Inscrits : ${pelerins.length}`, 20, 40)
  doc.text(`Soldés : ${nbComplets}`, 70, 40)
  doc.text(`Plateforme Gouv : ${nbGouv}`, 115, 40)
  doc.text(`Portail Nusuk : ${nbNusuk}`, 165, 40)
  if (showPrix) {
    doc.text(`Encaissé : ${formatMoney(totalPaye)} F / ${formatMoney(totalPackage)} F`, 215, 40)
  }

  const columns: any[] = [
    { header: '#', dataKey: 'num' },
    { header: 'NOM & PRÉNOM', dataKey: 'nom' },
    { header: 'PASSEPORT', dataKey: 'passeport' },
    { header: 'TÉLÉPHONE', dataKey: 'phone' },
    { header: 'RÉFÉRENCE', dataKey: 'ref' },
    { header: 'GOUV', dataKey: 'gouv' },
    { header: 'NUSUK', dataKey: 'nusuk' },
  ]
  if (showAgence) columns.push({ header: 'AGENCE / ASSOCIÉ', dataKey: 'agence' })
  if (showPrix) {
    columns.push({ header: 'PACKAGE (F)', dataKey: 'package' })
    columns.push({ header: 'PAYÉ (F)', dataKey: 'paye' })
    columns.push({ header: 'SOLDE (F)', dataKey: 'reste' })
  }
  columns.push({ header: 'STATUT', dataKey: 'statut' })

  const rows = pelerins.map((p) => {
    const statut = getPaiementStatut(p)
    const fixedNum = numberMap.get(p.id) || '-'
    const row: any = {
      num: fixedNum,
      nom: `${p.prenom || ''} ${p.nom_complet}`.trim().toUpperCase(),
      passeport: p.num_passeport || '—',
      phone: p.telephone_pelerin || '—',
      ref: p.reference || '—',
      gouv: p.sur_plateforme_gouv ? 'OUI' : 'NON',
      nusuk: p.sur_plateforme_nusuk ? 'OUI' : 'NON',
      statut: statut === 'complet' ? 'SOLDÉ' : statut === 'partiel' ? 'PARTIEL' : 'NON PAYÉ',
      _statut: statut
    }
    if (showAgence) row.agence = p.agences?.nom_agence || p.agence_ou_personne_associee || '—'
    if (showPrix) {
      row.package = formatMoney(p.prix_package)
      row.paye = formatMoney(p.total_paye)
      row.reste = formatMoney(Math.max(0, (p.prix_package || 0) - (p.total_paye || 0)))
    }
    return row
  })

  autoTable(doc, {
    startY: 49,
    columns,
    body: rows,
    theme: 'grid',
    styles: {
      fontSize: 7.5,
      cellPadding: { top: 2.5, right: 3, bottom: 2.5, left: 3 },
      font: 'helvetica',
      textColor: [30, 41, 59],
      lineColor: [226, 232, 240],
      lineWidth: 0.2,
    },
    headStyles: {
      fillColor: [30, 41, 59],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 7.5,
      cellPadding: 3,
    },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    columnStyles: {
      num: { cellWidth: 10, halign: 'center' },
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
      doc.text(`${nomAgenceEntete || 'Plateforme Hajj'}  •  Gestion des Pèlerins`, 14, doc.internal.pageSize.height - 6)
    },
  })

  doc.save(`Pelerins_${(nomAgenceEntete || 'Hajj').replace(/\s+/g, '_')}_${new Date().toLocaleDateString('fr-FR').replace(/\//g, '-')}.pdf`)
}

export default function ListePelerins() {
  const { selectedYear } = useYear()
  const db = usePowerSync()
  const router = useRouter()

  // Ordre de tri sélectionnable (DÉCROISSANT par défaut)
  const [sortOrder, setSortOrder] = useState<'desc' | 'asc'>('desc')
  const [nomAgenceLocale, setNomAgenceLocale] = useState<string>('')

  // 1. REQUÊTE RÉACTIVE : Toujours récupérée par ordre d'inscription de base
  const { data: rawPelerins, isLoading: loading } = useQuery<any>(
    `SELECT 
      p.*,
      a.nom_agence as agence_nom_agence
     FROM pelerins p
     LEFT JOIN agences a ON p.agence_id = a.id
     ORDER BY p.created_at ASC`
  )

  // 🎯 CALCUL DE LA NUMÉROTATION FIXE ABSOLUE (Le 1er inscrit reste #1 à jamais)
  const pelerinNumberMap = useMemo(() => {
    const map = new Map<string, number>()
    if (!rawPelerins) return map

    // Filtre par année pour établir la numérotation officielle de la campagne
    const allChronological = rawPelerins
      .filter((p: any) => {
        if (selectedYear === 'all') return true
        return p.campagne !== undefined && p.campagne !== null && Number(p.campagne) === Number(selectedYear)
      })
      .sort((a: any, b: any) => new Date(a.created_at || 0).getTime() - new Date(b.created_at || 0).getTime())

    allChronological.forEach((p: any, idx: number) => {
      map.set(p.id, idx + 1)
    })

    return map
  }, [rawPelerins, selectedYear])

  const pelerins: Pelerin[] = useMemo(() => {
    if (!rawPelerins) return []
    const mapped = rawPelerins.map((p: any) => ({
      ...p,
      total_paye: Number(p.total_paye || 0),
      prix_package: Number(p.prix_package || 0),
      sur_plateforme_gouv: Boolean(p.sur_plateforme_gouv),
      sur_plateforme_nusuk: Boolean(p.sur_plateforme_nusuk),
      campagne: p.campagne ? Number(p.campagne) : undefined,
      agences: p.agence_nom_agence ? { nom_agence: p.agence_nom_agence } : undefined
    }))

    const filtered = selectedYear === 'all'
      ? mapped
      : mapped.filter((p: Pelerin) => p.campagne !== undefined && p.campagne !== null && Number(p.campagne) === Number(selectedYear))

    // Application du tri d'affichage (décroissant par défaut)
    return [...filtered].sort((a, b) => {
      const timeA = new Date(a.created_at || 0).getTime()
      const timeB = new Date(b.created_at || 0).getTime()
      return sortOrder === 'desc' ? timeB - timeA : timeA - timeB
    })
  }, [rawPelerins, selectedYear, sortOrder])

  const [searchTerm, setSearchTerm] = useState('')
  const [role, setRole] = useState<string>('staff')

  const [activeFilterType, setActiveFilterType] = useState<FilterType>(null)
  const [selectedFilterValue, setSelectedFilterValue] = useState<string | null>(null)
  const [statutPaiementFilter, setStatutPaiementFilter] = useState<PaiementStatut>('all')
  const [plateformeFilter, setPlateformeFilter] = useState<'all' | 'gouv' | 'nusuk' | 'both' | 'neither'>('all')
  const [hotelFilter, setHotelFilter] = useState<string>('all')
  const [showFilterPanel, setShowFilterPanel] = useState(false)
  const filtersRestoredRef = useRef(false)

  const [showPdfModal, setShowPdfModal] = useState(false)
  const [pdfShowPrix, setPdfShowPrix] = useState(false)
  const [pdfShowAgence, setPdfShowAgence] = useState(true)
  const [pdfGenerating, setPdfGenerating] = useState(false)

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [selectMode, setSelectMode] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)

  const [showExportMenu, setShowExportMenu] = useState(false)
  const exportRef = useRef<HTMLDivElement>(null)

  const [quickViewPelerin, setQuickViewPelerin] = useState<Pelerin | null>(null)
  const [quickViewUpdating, setQuickViewUpdating] = useState(false)
  const [quickPaymentMontant, setQuickPaymentMontant] = useState('')

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
        if (parsed.hotelFilter !== undefined) setHotelFilter(parsed.hotelFilter)
        if (parsed.searchTerm !== undefined) setSearchTerm(parsed.searchTerm)
        if (parsed.showFilterPanel !== undefined) setShowFilterPanel(parsed.showFilterPanel)
      }
    } catch { /* ignore */ }
  }, [])

  useEffect(() => {
    try {
      sessionStorage.setItem(FILTERS_STORAGE_KEY, JSON.stringify({
        activeFilterType,
        selectedFilterValue,
        statutPaiementFilter,
        plateformeFilter,
        hotelFilter,
        searchTerm,
        showFilterPanel,
      }))
    } catch { /* ignore */ }
  }, [activeFilterType, selectedFilterValue, statutPaiementFilter, plateformeFilter, hotelFilter, searchTerm, showFilterPanel])

  const restoreScrollPosition = () => {
    const savedScroll = sessionStorage.getItem('liste_pelerins_scroll_y')
    if (savedScroll) {
      window.scrollTo({ top: parseInt(savedScroll, 10), behavior: 'instant' })
      sessionStorage.removeItem('liste_pelerins_scroll_y')
    }
  }

  useEffect(() => {
    const checkUser = async () => {
      try {
        const { data: { user } } = await getUser()
        if (!user) { router.push('/login'); return }
        const { data: profile } = await supabase
          .from('profiles')
          .select('role, agence_id, agences(nom_agence)')
          .eq('id', user.id)
          .single()

        if (profile?.role) setRole(profile.role)
        // @ts-expect-error join type
        const nomAg = profile?.agences?.nom_agence
        if (nomAg) setNomAgenceLocale(nomAg)
      } catch {
        if (navigator.onLine) router.push('/login')
      }
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

  const uniqueHotels = useMemo(() => {
    const set = new Set<string>()
    pelerins.forEach(p => {
      if (p.hotel_mecque?.trim()) set.add(p.hotel_mecque.trim())
      if (p.hotel_medine?.trim()) set.add(p.hotel_medine.trim())
    })
    return Array.from(set).sort()
  }, [pelerins])

  const handleDeleteSelected = async () => {
    if (selectedIds.size === 0) return
    setDeleting(true)
    try {
      const idsArray = Array.from(selectedIds)
      const placeholders = idsArray.map(() => '?').join(',')
      const { data, error } = await supabase.from('pelerins').delete().in('id', idsArray).select('id')
      requireSupabaseRows(data, error, 'suppression des pèlerins', idsArray.length)
      await db.execute(`DELETE FROM pelerins WHERE id IN (${placeholders})`, idsArray)

      setSelectedIds(new Set())
      setSelectMode(false)
      setShowDeleteConfirm(false)
    } catch (err) {
      console.error(err)
      alert('Erreur lors de la suppression.')
    } finally {
      setDeleting(false)
    }
  }

  const exporterExcel = async () => {
    const workbook = new ExcelJS.Workbook()
    const worksheet = workbook.addWorksheet('Liste Pèlerins')
    worksheet.columns = [
      { header: '#', key: 'num', width: 8 },
      { header: 'NOM COMPLET', key: 'nom', width: 35 },
      { header: 'NUMÉRO PASSEPORT', key: 'passeport', width: 22 },
      { header: 'TÉLÉPHONE', key: 'phone', width: 20 },
      { header: 'DATE NAISSANCE', key: 'naissance', width: 20 },
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
    pelerinsFiltrés.forEach((p) => {
      const fixedNum = pelerinNumberMap.get(p.id) || '-'
      const row = worksheet.addRow({
        num: fixedNum,
        nom: `${p.prenom || ''} ${p.nom_complet}`.trim().toUpperCase(),
        passeport: p.num_passeport,
        phone: p.telephone_pelerin || 'N/A',
        naissance: p.date_naissance ? new Date(p.date_naissance).toLocaleDateString('fr-FR') : 'N/A',
        agence: p.agences?.nom_agence || 'N/A',
        gouv: p.sur_plateforme_gouv ? '✅ OUI' : '❌ NON',
        nusuk: p.sur_plateforme_nusuk ? '✅ OUI' : '❌ NON',
      })
      row.height = 22
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
      (p.prenom || '').toLowerCase().includes(q) ||
      (p.hotel_mecque || '').toLowerCase().includes(q) ||
      (p.hotel_medine || '').toLowerCase().includes(q)

    if (!matchesSearch) return false
    if (statutPaiementFilter !== 'all' && getPaiementStatut(p) !== statutPaiementFilter) return false
    if (plateformeFilter === 'gouv' && !p.sur_plateforme_gouv) return false
    if (plateformeFilter === 'nusuk' && !p.sur_plateforme_nusuk) return false
    if (plateformeFilter === 'both' && !(p.sur_plateforme_gouv && p.sur_plateforme_nusuk)) return false
    if (plateformeFilter === 'neither' && (p.sur_plateforme_gouv || p.sur_plateforme_nusuk)) return false

    if (hotelFilter !== 'all') {
      const matchHotel = (p.hotel_mecque?.trim() === hotelFilter) || (p.hotel_medine?.trim() === hotelFilter)
      if (!matchHotel) return false
    }

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

  const hasActiveFilters = !!selectedFilterValue || statutPaiementFilter !== 'all' || plateformeFilter !== 'all' || hotelFilter !== 'all' || !!searchTerm

  const activeFilterCount = [
    selectedFilterValue ? 1 : 0,
    statutPaiementFilter !== 'all' ? 1 : 0,
    plateformeFilter !== 'all' ? 1 : 0,
    hotelFilter !== 'all' ? 1 : 0,
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
    setHotelFilter('all')
    setSearchTerm('')
  }

  const handleGeneratePDF = async () => {
    setPdfGenerating(true)
    try {
      const toExport = selectedIds.size > 0
        ? pelerinsFiltrés.filter(p => selectedIds.has(p.id))
        : pelerinsFiltrés
      await exporterPDF(toExport, pdfShowPrix, pdfShowAgence, nomAgenceLocale, pelerinNumberMap)
    } finally {
      setPdfGenerating(false)
      setShowPdfModal(false)
    }
  }

  const handleToggleQuickField = async (field: 'vacciné' | 'visite_medicale' | 'formation_suivie' | 'visa_obtenu') => {
    if (!quickViewPelerin) return
    const nextVal = !quickViewPelerin[field] ? 1 : 0
    try {
      const { data, error } = await supabase
        .from('pelerins')
        .update({ [field]: nextVal })
        .eq('id', quickViewPelerin.id)
        .select('id')
      requireSupabaseRows(data, error, 'mise à jour du dossier')
      await db.execute(`UPDATE pelerins SET ${field} = ? WHERE id = ?`, [nextVal, quickViewPelerin.id])
      setQuickViewPelerin({ ...quickViewPelerin, [field]: nextVal })
    } catch (err) {
      console.error(err)
      alert("Erreur lors de la mise à jour.")
    }
  }

  const handleUpdateNotesQuick = async (notesVal: string) => {
    if (!quickViewPelerin) return
    try {
      const notes = notesVal.trim() || null
      const { data, error } = await supabase
        .from('pelerins')
        .update({ notes })
        .eq('id', quickViewPelerin.id)
        .select('id')
      requireSupabaseRows(data, error, 'mise à jour des notes')
      await db.execute(`UPDATE pelerins SET notes = ? WHERE id = ?`, [notes, quickViewPelerin.id])
      setQuickViewPelerin({ ...quickViewPelerin, notes: notesVal })
    } catch (err) {
      console.error(err)
    }
  }

  const handleQuickAddPayment = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!quickViewPelerin) return
    const cleaned = quickPaymentMontant.replace(/\D/g, '')
    const amount = Number(cleaned)
    if (!amount || amount <= 0) return

    setQuickViewUpdating(true)
    try {
      const nextTotal = (quickViewPelerin.total_paye || 0) + amount
      const payment = {
        id: crypto.randomUUID(),
        pelerin_id: quickViewPelerin.id,
        amount,
        payment_date: new Date().toISOString().slice(0, 10),
        payment_mode: 'ESPECES',
        notes: 'Versement rapide',
        created_at: new Date().toISOString(),
      }
      const { error: paymentError } = await supabase.from('pelerin_payments').insert(payment)
      if (paymentError) throw paymentError
      const { data: updatedRows, error: updateError } = await supabase
        .from('pelerins')
        .update({ total_paye: nextTotal })
        .eq('id', quickViewPelerin.id)
        .select('id')
      requireSupabaseRows(updatedRows, updateError, 'mise à jour du total payé')

      await db.execute(
        `INSERT OR REPLACE INTO pelerin_payments (id, pelerin_id, amount, payment_date, payment_mode, notes, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [payment.id, payment.pelerin_id, payment.amount, payment.payment_date, payment.payment_mode, payment.notes, payment.created_at]
      )
      await db.execute(`UPDATE pelerins SET total_paye = ? WHERE id = ?`, [nextTotal, quickViewPelerin.id])
      setQuickViewPelerin({ ...quickViewPelerin, total_paye: nextTotal })
      setQuickPaymentMontant('')
      alert("✅ Versement enregistré avec succès !")
    } catch (err) {
      console.error(err)
      alert("Erreur lors de l'enregistrement.")
    } finally {
      setQuickViewUpdating(false)
    }
  }

  const getInitiales = (p: Pelerin) => {
    const p1 = (p.prenom || '').trim().charAt(0).toUpperCase()
    const p2 = (p.nom_complet || '').trim().charAt(0).toUpperCase()
    return `${p1}${p2}` || 'P'
  }

  return (
    <div className="min-h-screen bg-slate-50 px-3 sm:px-4 md:px-6 py-4 sm:py-6 md:py-10">
      <div className="max-w-7xl mx-auto">

        {/* ── MODAL COUP D'ŒIL (STYLE ÉLÉGANT, NOTES, SANS BORDURES NOIRES) ── */}
        {quickViewPelerin && (
          <div 
            className="fixed inset-0 z-[9999] flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-100"
            onClick={() => setQuickViewPelerin(null)}
          >
            <div 
              className="relative bg-white rounded-2xl shadow-xl w-full max-w-lg overflow-hidden border border-slate-200 flex flex-col max-h-[90vh]"
              onClick={(e) => e.stopPropagation()}
            >
              {/* En-tête sobre */}
              <div className="bg-slate-900 px-5 py-4 text-white flex items-center justify-between border-b border-slate-800">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-11 h-11 rounded-xl bg-slate-800 flex items-center justify-center overflow-hidden shrink-0">
                    {quickViewPelerin.photo_url ? (
                      <img 
                        src={getPassportPublicUrl(quickViewPelerin.photo_url) || ''} 
                        alt={quickViewPelerin.nom_complet}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <span className="font-bold text-xs text-slate-200">{getInitiales(quickViewPelerin)}</span>
                    )}
                  </div>
                  <div className="min-w-0">
                    <h3 className="font-black text-sm truncate uppercase tracking-tight text-white flex items-center gap-2">
                      <span className="text-blue-400 font-mono">#{pelerinNumberMap.get(quickViewPelerin.id)}</span>
                      <span>{quickViewPelerin.prenom} {quickViewPelerin.nom_complet}</span>
                    </h3>
                    <p className="text-[11px] text-slate-400 font-mono">
                      Pass: {quickViewPelerin.num_passeport || 'N/A'} • Tél: {quickViewPelerin.telephone_pelerin || '—'}
                    </p>
                  </div>
                </div>

                <button 
                  onClick={() => setQuickViewPelerin(null)}
                  className="w-8 h-8 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 flex items-center justify-center transition cursor-pointer"
                >
                  <X size={16} />
                </button>
              </div>

              {/* Contenu */}
              <div className="p-5 overflow-y-auto space-y-4 text-xs">
                <div>
                  <p className="text-[10px] font-black uppercase text-slate-400 tracking-wider mb-2">Formalités du pèlerin</p>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => handleToggleQuickField('vacciné')}
                      className={`p-2.5 rounded-xl border flex items-center justify-between font-bold transition cursor-pointer ${
                        quickViewPelerin.vacciné ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-slate-50 border-slate-200 text-slate-600'
                      }`}
                    >
                      <span className="flex items-center gap-1.5"><Syringe size={13} /> Vaccin</span>
                      <span className="text-[10px] font-black">{quickViewPelerin.vacciné ? 'OUI' : 'NON'}</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => handleToggleQuickField('visite_medicale')}
                      className={`p-2.5 rounded-xl border flex items-center justify-between font-bold transition cursor-pointer ${
                        quickViewPelerin.visite_medicale ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-slate-50 border-slate-200 text-slate-600'
                      }`}
                    >
                      <span className="flex items-center gap-1.5"><UserCheck size={13} /> Visite Méd.</span>
                      <span className="text-[10px] font-black">{quickViewPelerin.visite_medicale ? 'OUI' : 'NON'}</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => handleToggleQuickField('formation_suivie')}
                      className={`p-2.5 rounded-xl border flex items-center justify-between font-bold transition cursor-pointer ${
                        quickViewPelerin.formation_suivie ? 'bg-amber-50 border-amber-200 text-amber-800' : 'bg-slate-50 border-slate-200 text-slate-600'
                      }`}
                    >
                      <span className="flex items-center gap-1.5"><BookOpen size={13} /> Formation</span>
                      <span className="text-[10px] font-black">{quickViewPelerin.formation_suivie ? 'OUI' : 'NON'}</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => handleToggleQuickField('visa_obtenu')}
                      className={`p-2.5 rounded-xl border flex items-center justify-between font-bold transition cursor-pointer ${
                        quickViewPelerin.visa_obtenu ? 'bg-blue-50 border-blue-200 text-blue-800' : 'bg-slate-50 border-slate-200 text-slate-600'
                      }`}
                    >
                      <span className="flex items-center gap-1.5"><Globe size={13} /> Visa</span>
                      <span className="text-[10px] font-black">{quickViewPelerin.visa_obtenu ? 'DÉLIVRÉ' : 'EN COURS'}</span>
                    </button>
                  </div>
                </div>

                {/* Situation financière */}
                <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-2">
                  <div className="flex justify-between items-center text-slate-700 font-bold">
                    <span>Prix total :</span>
                    <span className="font-mono text-slate-900">{formatMoney(quickViewPelerin.prix_package)} F</span>
                  </div>
                  <div className="flex justify-between items-center text-slate-700 font-bold">
                    <span>Déjà payé :</span>
                    <span className="font-mono text-emerald-700">{formatMoney(quickViewPelerin.total_paye)} F</span>
                  </div>
                  <div className="pt-2 border-t border-slate-200 flex justify-between items-center text-slate-900 font-black">
                    <span>Reste dû :</span>
                    <span className="font-mono text-amber-700">
                      {formatMoney(Math.max(0, (quickViewPelerin.prix_package || 0) - (quickViewPelerin.total_paye || 0)))} CFA
                    </span>
                  </div>

                  <form onSubmit={handleQuickAddPayment} className="flex gap-2 pt-2">
                    <input 
                      type="text"
                      placeholder="Ajouter acompte (F)"
                      value={quickPaymentMontant}
                      onChange={(e) => setQuickPaymentMontant(e.target.value.replace(/\D/g, '').replace(/\B(?=(\d{3})+(?!\d))/g, ' '))}
                      className="flex-1 bg-white border border-slate-300 rounded-lg px-3 py-1.5 text-xs text-slate-900 font-bold outline-none focus:border-blue-600"
                    />
                    <button
                      type="submit"
                      disabled={quickViewUpdating || !quickPaymentMontant}
                      className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-black text-xs transition disabled:opacity-50 cursor-pointer"
                    >
                      {quickViewUpdating ? '...' : '+ Verser'}
                    </button>
                  </form>
                </div>

                {/* Notes & Remarques */}
                <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-1.5">
                  <p className="text-[10px] font-black uppercase text-slate-500">Notes & Remarques :</p>
                  <textarea
                    rows={2}
                    value={quickViewPelerin.notes || ''}
                    onChange={(e) => setQuickViewPelerin({ ...quickViewPelerin, notes: e.target.value })}
                    onBlur={(e) => handleUpdateNotesQuick(e.target.value)}
                    placeholder="Ajouter des observations médicales, régime ou consigne..."
                    className="w-full p-2 bg-white rounded-lg border border-slate-200 text-slate-700 font-medium text-xs outline-none focus:border-blue-600 resize-none"
                  />
                </div>
              </div>

              {/* Pied du modal */}
              <div className="p-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between gap-2">
                {quickViewPelerin.telephone_pelerin ? (
                  <a
                    href={`https://wa.me/${quickViewPelerin.telephone_pelerin.replace(/\s+/g, '')}?text=${encodeURIComponent(`Bonjour ${quickViewPelerin.prenom}, votre dossier Hajj est bien pris en compte.`)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1.5 px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold transition"
                  >
                    <MessageCircle size={14} /> WhatsApp
                  </a>
                ) : <div />}

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setQuickViewPelerin(null)}
                    className="px-3 py-2 rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-100 font-bold text-xs cursor-pointer"
                  >
                    Fermer
                  </button>
                  <Link
                    href={`/hajj/pelerin?id=${quickViewPelerin.id}`}
                    onClick={() => setQuickViewPelerin(null)}
                    className="flex items-center gap-1 px-4 py-2 bg-slate-900 hover:bg-blue-600 text-white rounded-lg font-black text-xs transition"
                  >
                    Profil Complet <ChevronRight size={13} />
                  </Link>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── MODAL DE SUPPRESSION ── */}
        {showDeleteConfirm && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4">
            <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-xs" onClick={() => setShowDeleteConfirm(false)} />
            <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-sm overflow-hidden border border-slate-200">
              <div className="bg-slate-900 px-4 sm:px-6 py-4 sm:py-5">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 bg-white/10 rounded-xl flex items-center justify-center">
                    <Trash2 size={18} className="text-white" />
                  </div>
                  <div>
                    <h2 className="text-white font-black text-base sm:text-lg">Confirmer la suppression</h2>
                    <p className="text-slate-300 text-xs sm:text-sm font-medium">
                      {selectedIds.size} pèlerin{selectedIds.size > 1 ? 's' : ''} sélectionné{selectedIds.size > 1 ? 's' : ''}
                    </p>
                  </div>
                </div>
              </div>

              <div className="p-4 sm:p-6 space-y-4">
                <p className="text-sm text-slate-700 font-semibold">
                  Êtes-vous sûr de vouloir supprimer {selectedIds.size} pèlerin{selectedIds.size > 1 ? 's' : ''} ? Cette action est irréversible.
                </p>

                <div className="flex flex-col-reverse sm:flex-row gap-3">
                  <button
                    onClick={() => setShowDeleteConfirm(false)}
                    disabled={deleting}
                    className="flex-1 py-2.5 rounded-xl border border-slate-200 text-slate-700 font-black text-sm hover:bg-slate-50 transition cursor-pointer"
                  >
                    Annuler
                  </button>
                  <button
                    onClick={handleDeleteSelected}
                    disabled={deleting}
                    className="flex-1 py-2.5 rounded-xl bg-slate-900 text-white font-black text-sm flex items-center justify-center gap-2 hover:bg-slate-800 transition disabled:opacity-60 cursor-pointer"
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

        {/* ── MODAL EXPORT PDF ── */}
        {showPdfModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4">
            <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-xs" onClick={() => setShowPdfModal(false)} />
            <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden border border-slate-200">
              <div className="bg-slate-900 px-4 sm:px-6 py-4 sm:py-5 border-b border-slate-800">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 bg-white/10 rounded-xl flex items-center justify-center">
                    <FileText size={18} className="text-white" />
                  </div>
                  <div>
                    <h2 className="text-white font-black text-base sm:text-lg">Exportation PDF</h2>
                    <p className="text-slate-300 text-xs font-medium">
                      {nomAgenceLocale ? `${nomAgenceLocale} • ` : ''}
                      {selectedIds.size > 0 ? `${selectedIds.size} pèlerins sélectionnés` : `${pelerinsFiltrés.length} pèlerins (filtrés)`}
                    </p>
                  </div>
                </div>
              </div>

              <div className="p-4 sm:p-6 space-y-4">
                <div className="space-y-2">
                  {[
                    { key: 'prix', label: 'Détails des paiements', sublabel: 'Forfait, montant encaissé et solde', value: pdfShowPrix, set: setPdfShowPrix },
                    { key: 'agence', label: "Nom de l'agence", sublabel: "Colonne agence ou associé", value: pdfShowAgence, set: setPdfShowAgence },
                  ].map(opt => (
                    <button
                      key={opt.key}
                      onClick={() => opt.set(!opt.value)}
                      className={`w-full flex items-center justify-between p-3 rounded-xl border transition text-left cursor-pointer ${
                        opt.value ? 'border-blue-600 bg-blue-50/50' : 'border-slate-200 bg-slate-50'
                      }`}
                    >
                      <div>
                        <p className="font-bold text-xs text-slate-900">{opt.label}</p>
                        <p className="text-[11px] text-slate-500">{opt.sublabel}</p>
                      </div>
                      <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${opt.value ? 'bg-blue-600 border-blue-600' : 'border-slate-300'}`}>
                        {opt.value && <div className="w-1.5 h-1.5 bg-white rounded-full" />}
                      </div>
                    </button>
                  ))}
                </div>

                <div className="flex gap-3 pt-2">
                  <button
                    onClick={() => setShowPdfModal(false)}
                    className="flex-1 py-2.5 rounded-xl border border-slate-200 text-slate-700 font-black text-sm hover:bg-slate-50 transition cursor-pointer"
                  >
                    Annuler
                  </button>
                  <button
                    onClick={handleGeneratePDF}
                    disabled={pdfGenerating}
                    className="flex-1 py-2.5 rounded-xl bg-blue-600 text-white font-black text-sm flex items-center justify-center gap-2 hover:bg-blue-700 transition disabled:opacity-60 cursor-pointer shadow-xs"
                  >
                    {pdfGenerating ? (
                      <><Loader2 size={16} className="animate-spin" /> Création...</>
                    ) : (
                      <><FileText size={16} /> Télécharger</>
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
            <h1 className="text-2xl sm:text-3xl md:text-4xl font-black text-slate-900 tracking-tight">Dossiers</h1>
            <div className="flex items-center gap-3 mt-1.5 flex-wrap">
              <p className="text-slate-500 font-bold uppercase text-xs tracking-widest">{pelerins.length} pèlerins</p>
              {hasActiveFilters && (
                <span className="bg-blue-50 text-blue-700 text-[10px] font-black px-2 py-0.5 rounded-full border border-blue-200 flex items-center gap-1">
                  <Filter size={9} /> {pelerinsFiltrés.length} filtrés
                </span>
              )}
            </div>
          </div>

          {/* ── BOUTONS D'ACTION ── */}
          <div className="flex flex-wrap gap-2 items-center">
            <YearSelector />

            {/* 🎯 BOUTON TRI AVEC RESPECT DES NUMÉROS FIXES */}
            <button
              onClick={() => setSortOrder(prev => prev === 'desc' ? 'asc' : 'desc')}
              className="flex items-center gap-1.5 px-3 sm:px-4 py-2.5 sm:py-3.5 rounded-xl font-bold text-xs sm:text-sm bg-white text-slate-700 border border-slate-200 hover:bg-slate-50 transition shadow-xs cursor-pointer"
              title={sortOrder === 'desc' ? "Affichage : Récents d'abord" : "Affichage : Premiers inscrits d'abord"}
            >
              {sortOrder === 'desc' ? (
                <>
                  <ArrowDown size={14} className="text-blue-600" />
                  <span>Récents en premier</span>
                </>
              ) : (
                <>
                  <ArrowUp size={14} className="text-emerald-600" />
                  <span>Premiers inscrits</span>
                </>
              )}
            </button>

            <button
              onClick={() => { setSelectMode(!selectMode); setSelectedIds(new Set()) }}
              className={`flex items-center gap-1.5 px-3 sm:px-4 py-2.5 sm:py-3.5 rounded-xl font-black text-xs sm:text-sm border transition cursor-pointer ${
                selectMode
                  ? 'bg-slate-900 text-white border-slate-900'
                  : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
              }`}
            >
              <CheckSquare size={16} />
              <span className="hidden sm:inline">{selectMode ? `${selectedIds.size} sél.` : 'Sélect.'}</span>
              <span className="sm:hidden">{selectMode ? `${selectedIds.size}` : 'Sél.'}</span>
            </button>

            <div className="ml-auto flex items-center gap-2 sm:ml-0 flex-wrap">
              <div className="relative" ref={exportRef}>
                <button
                  onClick={() => setShowExportMenu(!showExportMenu)}
                  className={`flex items-center gap-1 sm:gap-2 px-3 sm:px-4 py-2.5 sm:py-3.5 rounded-xl font-black text-xs sm:text-sm border transition cursor-pointer ${
                    showExportMenu ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  <Download size={16} />
                  <span className="hidden sm:inline">Exporter</span>
                  <ChevronDown size={13} className={`transition-transform duration-200 ${showExportMenu ? 'rotate-180' : ''}`} />
                </button>

                {showExportMenu && (
                  <div className="absolute right-0 top-full mt-2 w-64 sm:w-72 bg-white rounded-2xl shadow-xl border border-slate-200 overflow-hidden z-20">
                    <div className="px-4 py-3 bg-slate-50 border-b border-slate-100">
                      <p className="text-xs font-black text-slate-800 tracking-tight">Exporter la liste</p>
                      <p className="text-[10px] text-slate-500 font-medium mt-0.5">
                        {selectedIds.size > 0
                          ? `${selectedIds.size} sélectionné(s)`
                          : `${pelerinsFiltrés.length} pèlerin${pelerinsFiltrés.length > 1 ? 's' : ''}`
                        }
                      </p>
                    </div>

                    <div className="p-2 space-y-1">
                      <button
                        onClick={() => { exporterExcel(); setShowExportMenu(false) }}
                        className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-slate-50 transition text-left cursor-pointer"
                      >
                        <div className="w-9 h-9 bg-slate-100 border border-slate-200 rounded-xl flex items-center justify-center shrink-0">
                          <FileSpreadsheet size={18} className="text-emerald-600" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-black text-slate-900 text-xs sm:text-sm">Tableur Excel</p>
                          <p className="text-[10px] text-slate-400 font-medium">Format standard .xlsx</p>
                        </div>
                      </button>

                      <button
                        onClick={() => { setShowPdfModal(true); setShowExportMenu(false) }}
                        className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-slate-50 transition text-left cursor-pointer"
                      >
                        <div className="w-9 h-9 bg-slate-100 border border-slate-200 rounded-xl flex items-center justify-center shrink-0">
                          <FileText size={18} className="text-blue-600" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-black text-slate-900 text-xs sm:text-sm">Document PDF ({nomAgenceLocale || 'Agence'})</p>
                          <p className="text-[10px] text-slate-400 font-medium">Canevas moderne format paysage</p>
                        </div>
                      </button>
                    </div>
                  </div>
                )}
              </div>

              <Link
                href="/hajj/ajouter-pelerin"
                className="flex items-center gap-1.5 sm:gap-2 bg-blue-600 text-white hover:bg-blue-700 px-3 sm:px-4 py-2.5 sm:py-3.5 rounded-xl font-black text-xs sm:text-sm shadow-sm transition"
              >
                <Plus size={16} /> <span className="hidden sm:inline">Nouveau</span>
              </Link>
            </div>
          </div>
        </div>

        {/* ── CARTES STATISTIQUES EN HAUT ── */}
        {!loading && pelerinsFiltrés.length > 0 && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5 sm:gap-3 mb-6 sm:mb-8">
            {[
              {
                label: 'Total encaissé',
                value: `${(totalPaye / 1000000).toFixed(1)}M F`,
                sub: `sur ${(totalPackage / 1000000).toFixed(1)}M F`,
                icon: <TrendingUp size={16} className="text-slate-700" />,
                bar: totalPackage > 0 ? (totalPaye / totalPackage) * 100 : 0,
              },
              {
                label: 'Reste à payer',
                value: `${((totalPackage - totalPaye) / 1000000).toFixed(1)}M F`,
                sub: `${pelerinsFiltrés.filter(p => getPaiementStatut(p) !== 'complet').length} pèlerins`,
                icon: <AlertCircle size={16} className="text-slate-700" />,
                bar: null,
              },
              {
                label: 'Paiements complets',
                value: `${nbComplets}`,
                sub: `${totalPaye > 0 ? Math.round((nbComplets / pelerinsFiltrés.length) * 100) : 0}% du groupe`,
                icon: <CheckCircle2 size={16} className="text-slate-700" />,
                bar: pelerinsFiltrés.length > 0 ? (nbComplets / pelerinsFiltrés.length) * 100 : 0,
              },
              {
                label: 'Plateforme Gouv',
                value: `${nbGouv} / ${pelerinsFiltrés.length}`,
                sub: `${pelerinsFiltrés.length > 0 ? Math.round((nbGouv / pelerinsFiltrés.length) * 100) : 0}% inscrits`,
                icon: <Clock size={16} className="text-slate-700" />,
                bar: pelerinsFiltrés.length > 0 ? (nbGouv / pelerinsFiltrés.length) * 100 : 0,
              },
            ].map((stat, i) => (
              <div key={i} className="bg-white border border-slate-200 rounded-xl sm:rounded-2xl p-3.5 sm:p-4 shadow-xs">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="p-1.5 rounded-lg bg-slate-100 border border-slate-200/80">{stat.icon}</span>
                  <span className="font-black text-base sm:text-lg text-slate-900 tabular-nums">{stat.value}</span>
                </div>
                <p className="text-[10px] font-black uppercase text-slate-500 tracking-wider leading-tight">{stat.label}</p>
                <p className="text-[10px] font-bold text-slate-400 mt-0.5">{stat.sub}</p>
                {stat.bar !== null && (
                  <div className="mt-2.5 w-full bg-slate-100 h-1.5 rounded-full overflow-hidden">
                    <div className="h-full bg-blue-600 rounded-full" style={{ width: `${stat.bar}%` }} />
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* ── BARRE DE RECHERCHE ── */}
        <div className="mb-4 relative group">
          <input
            type="text"
            placeholder="Nom, prénom, passeport, téléphone, agence, référence..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 sm:pl-12 pr-10 py-3 sm:py-3.5 rounded-xl sm:rounded-2xl border border-slate-200 bg-white text-slate-900 font-bold text-sm sm:text-base focus:border-blue-600 focus:ring-0 outline-none transition shadow-xs"
          />
          <Search className="absolute left-3.5 sm:left-4 top-3.5 text-slate-400 group-focus-within:text-blue-600 transition" size={18} />
          {searchTerm && (
            <button onClick={() => setSearchTerm('')} className="absolute right-3.5 sm:right-4 top-3.5 text-slate-400 hover:text-slate-600 transition cursor-pointer">
              <X size={18} />
            </button>
          )}
        </div>

        {/* ── BARRE DE FILTRES RAPIDES ── */}
        <div className="mb-4 flex items-center gap-2 flex-wrap">
          <button
            onClick={() => setShowFilterPanel(!showFilterPanel)}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-black transition border cursor-pointer ${
              showFilterPanel || hasActiveFilters
                ? 'bg-blue-600 text-white border-blue-600 shadow-xs'
                : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
            }`}
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
                className={`flex items-center gap-1 px-2.5 sm:px-3 py-2 rounded-xl text-xs font-black transition border cursor-pointer ${
                  statutPaiementFilter === s
                    ? 'bg-slate-900 text-white border-slate-900 shadow-xs'
                    : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                }`}
              >
                {labels[s]}
              </button>
            )
          })}

          {hasActiveFilters && (
            <button
              onClick={clearAllFilters}
              className="flex items-center gap-1 px-2.5 sm:px-3 py-2 rounded-xl text-xs font-black bg-red-50 text-red-600 hover:bg-red-100 transition border border-red-200 cursor-pointer"
            >
              <X size={12} /> Réinit.
            </button>
          )}
        </div>

        {/* ── PANNEAU DE FILTRES AVANCÉS ── */}
        {showFilterPanel && (
          <div className="mb-6 bg-white rounded-2xl border border-slate-200 shadow-xs p-4 sm:p-5 space-y-4">
            <div>
              <p className="text-[10px] font-black uppercase text-slate-400 tracking-wider mb-2 flex items-center gap-1.5">
                Filtrer par Hôtel assigné
              </p>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setHotelFilter('all')}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition border cursor-pointer ${
                    hotelFilter === 'all'
                      ? 'bg-slate-900 text-white border-slate-900 shadow-xs'
                      : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  Tous les hôtels
                </button>
                {uniqueHotels.map(h => (
                  <button
                    key={h}
                    type="button"
                    onClick={() => setHotelFilter(h)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold transition border cursor-pointer ${
                      hotelFilter === h
                        ? 'bg-slate-900 text-white border-slate-900 shadow-xs'
                        : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    {h}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <p className="text-[10px] font-black uppercase text-slate-400 tracking-wider mb-2">Plateforme d'inscription</p>
              <div className="flex flex-wrap gap-2">
                {[
                  { key: 'all', label: 'Toutes' },
                  { key: 'gouv', label: 'Gouv' },
                  { key: 'nusuk', label: 'Nusuk' },
                  { key: 'both', label: 'Les deux' },
                  { key: 'neither', label: 'Aucune' },
                ].map(opt => (
                  <button
                    key={opt.key}
                    onClick={() => setPlateformeFilter(opt.key as any)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold transition border cursor-pointer ${
                      plateformeFilter === opt.key
                        ? 'bg-slate-900 text-white border-slate-900'
                        : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <p className="text-[10px] font-black uppercase text-slate-400 tracking-wider mb-2">Filtrer par champ</p>
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
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-black transition border cursor-pointer ${
                      activeFilterType === f.type
                        ? 'bg-blue-600 text-white border-blue-600 shadow-xs'
                        : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    {f.icon} {f.label}
                  </button>
                ))}
              </div>
            </div>

            {activeFilterType && (
              <div className="bg-slate-50 rounded-xl p-3 sm:p-4 border border-slate-200 max-h-44 overflow-y-auto">
                <div className="flex justify-between items-center mb-2">
                  <span className="text-[10px] font-black uppercase text-slate-400 tracking-wider">Choisir une valeur :</span>
                  {selectedFilterValue && (
                    <span className="bg-blue-50 text-blue-700 text-[10px] font-black px-2 py-0.5 rounded-md flex items-center gap-1 border border-blue-200">
                      {selectedFilterValue}
                      <X size={10} className="cursor-pointer" onClick={() => setSelectedFilterValue(null)} />
                    </span>
                  )}
                </div>
                <div className="flex flex-wrap gap-2">
                  {getFilterOptions().length === 0 ? (
                    <span className="text-xs font-bold text-slate-400 italic">Aucune donnée disponible</span>
                  ) : (
                    getFilterOptions().map((option, index) => (
                      <button
                        key={index}
                        onClick={() => setSelectedFilterValue(option)}
                        className={`px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer border ${
                          selectedFilterValue === option
                            ? 'bg-slate-900 text-white border-slate-900 shadow-xs'
                            : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'
                        }`}
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

        {/* ── BARRE DE SÉLECTION MULTIPLE ── */}
        {selectMode && (
          <div className="mb-4 bg-slate-100 border border-slate-200 rounded-xl px-4 py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <button onClick={toggleSelectAll} className="flex items-center gap-2 text-slate-800 font-black text-xs sm:text-sm hover:text-black transition cursor-pointer">
              {selectedIds.size === pelerinsFiltrés.length && pelerinsFiltrés.length > 0
                ? <CheckSquare size={18} /> : <Square size={18} />}
              {selectedIds.size > 0 ? `${selectedIds.size} sélectionné(s)` : 'Tout sélectionner'}
            </button>
            {selectedIds.size > 0 && (
              <div className="flex gap-2 flex-wrap">
                <button
                  onClick={() => setShowPdfModal(true)}
                  className="flex items-center gap-1.5 bg-blue-600 text-white px-3 py-2 rounded-xl text-xs font-black hover:bg-blue-700 transition shadow-xs cursor-pointer"
                >
                  <FileText size={14} /> Export
                </button>
                <button
                  onClick={() => setShowDeleteConfirm(true)}
                  className="flex items-center gap-1.5 bg-red-600 text-white px-3 py-2 rounded-xl text-xs font-black hover:bg-red-700 transition shadow-xs cursor-pointer"
                >
                  <Trash2 size={14} /> Supprimer
                </button>
              </div>
            )}
          </div>
        )}

        {/* ── LISTE DE DONNÉES ── */}
        <div className="space-y-3 sm:space-y-4 md:space-y-0">
          {loading ? (
            <div className="py-16 sm:py-20 flex flex-col items-center justify-center text-slate-400 font-black uppercase tracking-widest gap-3">
              <Loader2 className="animate-spin text-blue-600" size={28} />
              Chargement des pèlerins (local)...
            </div>
          ) : pelerinsFiltrés.length === 0 ? (
            <div className="py-16 sm:py-20 flex flex-col items-center justify-center gap-4 text-center">
              <div className="w-14 sm:w-16 h-14 sm:h-16 bg-white border border-slate-200 rounded-2xl flex items-center justify-center">
                <Search size={24} className="text-slate-400" />
              </div>
              <div>
                <p className="font-black text-slate-800 text-base sm:text-lg">Aucun résultat</p>
                <p className="text-slate-400 font-medium text-xs sm:text-sm mt-1">Essayez de modifier vos filtres ou votre recherche</p>
              </div>
              <button onClick={clearAllFilters} className="text-blue-600 font-black text-xs sm:text-sm hover:underline cursor-pointer">Réinitialiser tout</button>
            </div>
          ) : (
            <>
              {/* ── CARTES MOBILE AVEC NUMÉROTATION FIXE CONSERVÉE ── */}
              <div className="md:hidden space-y-3">
                {pelerinsFiltrés.map((p) => {
                  const statut = getPaiementStatut(p)
                  const badgeColor = getPaiementBadgeColor(statut)
                  const isSelected = selectedIds.has(p.id)
                  const photoUrl = p.photo_url ? getPassportPublicUrl(p.photo_url) : null
                  const fixedNumber = pelerinNumberMap.get(p.id) || '-'

                  return (
                    <div
                      key={p.id}
                      className={`bg-white rounded-2xl border transition-colors overflow-hidden ${
                        isSelected ? 'border-blue-600' : 'border-slate-200'
                      }`}
                    >
                      <div className="px-4 pt-4 pb-3">
                        <div className="flex items-start gap-3">
                          {selectMode && (
                            <button onClick={() => toggleSelect(p.id)} className="mt-0.5 shrink-0">
                              {isSelected ? <CheckSquare size={20} className="text-blue-600" /> : <Square size={20} className="text-slate-300" />}
                            </button>
                          )}

                          {/* 🎯 Numéro pérenne fixe officiel */}
                          <div className="w-7 h-7 rounded-lg bg-slate-100 border border-slate-200 text-slate-700 font-mono font-black text-[10px] flex items-center justify-center shrink-0">
                            #{fixedNumber}
                          </div>

                          {/* Photo d'identité sans bordure noire */}
                          <div className="w-10 h-10 rounded-xl bg-slate-100 border border-slate-200/60 text-slate-800 flex items-center justify-center font-bold text-xs shrink-0 overflow-hidden shadow-2xs">
                            {photoUrl ? (
                              <img src={photoUrl} alt={p.nom_complet} className="w-full h-full object-cover" />
                            ) : (
                              <span>{getInitiales(p)}</span>
                            )}
                          </div>

                          <div className="flex-1 min-w-0">
                            <h3 className="font-black text-slate-900 text-sm leading-tight truncate">
                              {p.prenom} {p.nom_complet}
                            </h3>
                            <div className="flex items-center gap-2 mt-1 flex-wrap">
                              <span className="font-mono text-[9px] bg-slate-100 px-2 py-0.5 rounded-md text-slate-700 font-bold border border-slate-200/80">
                                {p.num_passeport || 'Sans passeport'}
                              </span>
                              {p.telephone_pelerin && (
                                <span className="text-[10px] text-slate-400 font-medium">{p.telephone_pelerin}</span>
                              )}
                            </div>
                          </div>

                          <span className={`text-[9px] font-black px-2 py-1 rounded-md border shrink-0 ${badgeColor}`}>
                            {statut === 'complet' ? '✓ COMPLET' : statut === 'partiel' ? '◑ PARTIEL' : '✗ NON PAYÉ'}
                          </span>
                        </div>
                      </div>

                      <div className="px-4 pb-3">
                        <div className="bg-slate-50 rounded-xl p-3 border border-slate-200/80">
                          <div className="flex justify-between text-[10px] font-black uppercase mb-1.5">
                            <span className="text-slate-500">Paiement</span>
                            <span className="font-black text-blue-600">{Math.round((p.total_paye / (p.prix_package || 1)) * 100) || 0}%</span>
                          </div>
                          <div className="w-full bg-slate-200 h-1.5 rounded-full overflow-hidden mb-1.5">
                            <div className="h-full bg-blue-600 rounded-full" style={{ width: `${Math.min((p.total_paye / (p.prix_package || 1)) * 100, 100)}%` }} />
                          </div>
                          <div className="flex justify-between text-[10px] font-bold text-slate-600">
                            <span>{formatMoney(p.total_paye)} F</span>
                            <span className="text-slate-400">{formatMoney(p.prix_package)} F</span>
                          </div>
                        </div>
                      </div>

                      <div className="border-t border-slate-100 px-4 py-3 flex items-center justify-between gap-3 flex-wrap">
                        <div className="flex gap-1.5">
                          <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[9px] font-black border ${p.sur_plateforme_gouv ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-slate-50 border-slate-200 text-slate-400'}`}>
                            <div className={`w-1.5 h-1.5 rounded-full ${p.sur_plateforme_gouv ? 'bg-emerald-500' : 'bg-slate-300'}`} />
                            GOUV
                          </span>
                          <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[9px] font-black border ${p.sur_plateforme_nusuk ? 'bg-blue-50 border-blue-200 text-blue-700' : 'bg-slate-50 border-slate-200 text-slate-400'}`}>
                            <div className={`w-1.5 h-1.5 rounded-full ${p.sur_plateforme_nusuk ? 'bg-blue-500' : 'bg-slate-300'}`} />
                            NUSUK
                          </span>
                        </div>

                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => setQuickViewPelerin(p)}
                            className="p-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition flex items-center gap-1 border border-slate-200 cursor-pointer"
                            title="Aperçu rapide"
                          >
                            <Eye size={14} />
                            <span>Aperçu</span>
                          </button>

                          <Link
                            onClick={handlePersistScroll}
                            href={`/hajj/pelerin?id=${p.id}`}
                            className="bg-slate-900 text-white hover:bg-blue-600 px-3.5 py-2 rounded-xl text-xs font-black flex items-center justify-center gap-1 transition-colors"
                          >
                            Dossier <ChevronRight size={13} />
                          </Link>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>

              {/* ── TABLEAU DESKTOP AVEC NUMÉROTATION FIXE RÉELLEMENT PÉRENNE ── */}
              <div className="hidden md:block bg-white rounded-2xl border border-slate-200 overflow-x-auto shadow-xs">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-50/70 border-b border-slate-200">
                      {selectMode && (
                        <th className="pl-6 py-4 w-10">
                          <button onClick={toggleSelectAll} className="cursor-pointer">
                            {selectedIds.size === pelerinsFiltrés.length && pelerinsFiltrés.length > 0
                              ? <CheckSquare size={16} className="text-blue-600" />
                              : <Square size={16} className="text-slate-300" />}
                          </button>
                        </th>
                      )}
                      <th className="pl-6 pr-2 py-4 w-12 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">#</th>
                      <th className="px-6 py-4 text-[10px] font-black text-slate-500 uppercase tracking-widest">Pèlerin</th>
                      <th className="px-6 py-4 text-[10px] font-black text-slate-500 uppercase tracking-widest">Passeport</th>
                      <th className="px-6 py-4 text-[10px] font-black text-slate-500 uppercase tracking-widest">Plateformes</th>
                      <th className="px-6 py-4 text-[10px] font-black text-slate-500 uppercase tracking-widest">{role === 'admin' ? 'Agence' : 'Paiement'}</th>
                      <th className="px-6 py-4 text-[10px] font-black text-slate-500 uppercase tracking-widest text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {pelerinsFiltrés.map((p) => {
                      const isSelected = selectedIds.has(p.id)
                      const photoUrl = p.photo_url ? getPassportPublicUrl(p.photo_url) : null
                      const fixedNumber = pelerinNumberMap.get(p.id) || '-'

                      return (
                        <tr key={p.id} className={`transition-colors duration-150 ${isSelected ? 'bg-blue-50/40' : 'hover:bg-slate-50/60'}`}>
                          {selectMode && (
                            <td className="pl-6 py-4">
                              <button onClick={() => toggleSelect(p.id)} className="cursor-pointer">
                                {isSelected ? <CheckSquare size={16} className="text-blue-600" /> : <Square size={16} className="text-slate-300" />}
                              </button>
                            </td>
                          )}

                          {/* 🎯 Le numéro reste fixé à son ordre d'inscription réel (#17 reste #17) */}
                          <td className="pl-6 pr-2 py-4 text-center font-mono font-bold text-xs text-slate-600">
                            #{fixedNumber}
                          </td>

                          <td className="px-6 py-4">
                            <div className="flex items-center gap-3">
                              <div className="w-9 h-9 rounded-xl bg-slate-100 border border-slate-200/70 text-slate-700 flex items-center justify-center font-bold text-xs shrink-0 overflow-hidden shadow-2xs">
                                {photoUrl ? (
                                  <img src={photoUrl} alt={p.nom_complet} className="w-full h-full object-cover" />
                                ) : (
                                  <span>{getInitiales(p)}</span>
                                )}
                              </div>
                              <div>
                                <div className="font-black text-slate-900 text-sm flex items-center gap-2">
                                  {p.prenom} {p.nom_complet}
                                </div>
                                <div className="text-xs text-slate-400 font-medium">{p.telephone_pelerin || 'Aucun numéro'}</div>
                              </div>
                            </div>
                          </td>

                          <td className="px-6 py-4">
                            <span className="bg-slate-100 px-2.5 py-1 rounded-lg font-mono font-bold text-slate-700 uppercase text-xs border border-slate-200">
                              {p.num_passeport || '—'}
                            </span>
                          </td>

                          <td className="px-6 py-4">
                            <div className="flex gap-2">
                              <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-black border ${p.sur_plateforme_gouv ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-slate-50 border-slate-200 text-slate-400'}`}>
                                <div className={`w-1.5 h-1.5 rounded-full ${p.sur_plateforme_gouv ? 'bg-emerald-500' : 'bg-slate-300'}`} />
                                Gouv
                              </span>
                              <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-black border ${p.sur_plateforme_nusuk ? 'bg-blue-50 border-blue-200 text-blue-700' : 'bg-slate-50 border-slate-200 text-slate-400'}`}>
                                <div className={`w-1.5 h-1.5 rounded-full ${p.sur_plateforme_nusuk ? 'bg-blue-500' : 'bg-slate-300'}`} />
                                Nusuk
                              </span>
                            </div>
                          </td>

                          <td className="px-6 py-4">
                            {role === 'admin' ? (
                              <span className="font-bold text-slate-900 text-sm">{p.agences?.nom_agence}</span>
                            ) : (
                              <div className="w-32">
                                <div className="flex justify-between text-[10px] font-black uppercase mb-1">
                                  <span className="font-black text-blue-600">{Math.round((p.total_paye / (p.prix_package || 1)) * 100) || 0}%</span>
                                </div>
                                <div className="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden mb-1">
                                  <div className="h-full bg-blue-600 rounded-full" style={{ width: `${Math.min((p.total_paye / (p.prix_package || 1)) * 100, 100)}%` }} />
                                </div>
                                <div className="flex justify-between text-xs font-bold text-slate-700">
                                  <span>{formatMoney(p.total_paye)} F</span>
                                  <span className="text-slate-400">/ {formatMoney(p.prix_package)} F</span>
                                </div>
                              </div>
                            )}
                          </td>

                          <td className="px-6 py-4 text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              <button
                                type="button"
                                onClick={() => setQuickViewPelerin(p)}
                                title="Aperçu rapide"
                                className="p-2 bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 rounded-xl transition cursor-pointer"
                              >
                                <Eye size={14} />
                              </button>

                              <Link
                                onClick={handlePersistScroll}
                                href={`/hajj/pelerin?id=${p.id}`}
                                className="inline-flex items-center gap-1.5 px-4 py-2 bg-slate-900 text-white rounded-xl font-black text-xs hover:bg-blue-600 transition-colors shadow-xs"
                              >
                                Détails <ChevronRight size={13} />
                              </Link>
                            </div>
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

        {/* ── COMPTEUR BAS DE PAGE ── */}
        {!loading && pelerinsFiltrés.length > 0 && (
          <div className="mt-6 sm:mt-8 text-center">
            <p className="text-xs font-bold text-slate-400">
              {pelerinsFiltrés.length} pèlerin{pelerinsFiltrés.length > 1 ? 's' : ''} affiché{pelerinsFiltrés.length > 1 ? 's' : ''}
              {hasActiveFilters && ` sur ${pelerins.length} au total`}
            </p>
          </div>
        )}
      </div>
    </div>
  )
}