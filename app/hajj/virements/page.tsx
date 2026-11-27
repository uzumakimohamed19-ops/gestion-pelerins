'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { get as idbGet, set as idbSet } from 'idb-keyval'
import { supabase, getUser } from '@/lib/supabase'
import { useYear } from '@/lib/YearContext'
import { useUI } from '@/lib/UIContext'
import { useWorkProfile } from '@/lib/ProfileContext'
import { YearSelector } from '@/components/YearSelector'
import { HajjCurrencyTabs } from '@/components/HajjCurrencySelector'
import { formatAuthorInline, formatProfileRoleLabel, getProfileRoleBadgeClass } from '@/lib/profileAuthor'
import {
  HAJJ_CURRENCIES,
  HAJJ_CURRENCY_MAP,
  countByCurrency,
  getHajjCurrencySymbol,
  normalizeHajjCurrency,
  type HajjCurrency,
} from '@/lib/hajjCurrency'
import {
  getVirementReceiptPublicUrl,
  isPdfReceipt,
  uploadVirementReceipt,
} from '@/lib/virementStorage'
import {
  generateSingleVirementPdf,
  generateVirementsRecapPdf,
  type VirementSens,
  type VirementStatut,
} from '@/lib/virementPdf'
import {
  ArrowDownLeft,
  ArrowUpRight,
  ArrowLeft,
  ArrowUpDown,
  Building2,
  Camera,
  Check,
  CheckCircle2,
  AlertCircle,
  ChevronDown,
  ChevronRight,
  Clock,
  Copy,
  Download,
  ExternalLink,
  FileImage,
  FileText,
  Landmark,
  LayoutDashboard,
  Loader2,
  Pencil,
  Plus,
  Receipt,
  RefreshCw,
  Search,
  SlidersHorizontal,
  Sparkles,
  Trash2,
  Upload,
  X,
} from 'lucide-react'

/* ───────────────────────────── Types ───────────────────────────── */

interface VirementRow {
  id: string
  agence_id?: string | null
  user_id?: string | null
  sens: VirementSens
  banque: string
  nom_compte: string
  numero_compte?: string | null
  contrepartie?: string | null
  montant: number
  devise: HajjCurrency
  motif: string
  reference_bancaire?: string | null
  date_virement: string
  statut: VirementStatut
  recu_url?: string | null
  notes?: string | null
  campagne?: number | null
  recorded_by_name?: string | null
  recorded_by_role?: string | null
  created_at?: string | null
}

/* ─────────────────────────── Constantes ─────────────────────────── */

const BANQUES_SUGGESTIONS = [
  'BDM-SA',
  'BMS-SA',
  'Coris Bank',
  'Orabank',
  'Ecobank',
  'UBA',
  'BIM-SA',
  'BOA',
  'Al Rajhi Bank',
  'SNB',
]

const MOTIFS_EMIS = [
  "Achat billets d'avion",
  'Règlement hôtel Makkah',
  'Règlement hôtel Médine',
  'Transfert partenaire saoudien',
  'Frais Visa & Nusuk',
  'Frais de fonctionnement',
]

const MOTIFS_RECUS = [
  'Versement pèlerin',
  'Règlement partenaire / agence',
  'Apport trésorerie',
  'Remboursement fournisseur',
  'Commission reçue',
]

const STATUT_META: Record<VirementStatut, { label: string; textClass: string; badgeClass: string }> = {
  execute: {
    label: 'Exécuté',
    textClass: 'text-emerald-600',
    badgeClass: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  },
  en_attente: {
    label: 'En attente',
    textClass: 'text-amber-600',
    badgeClass: 'bg-amber-50 text-amber-700 border-amber-200',
  },
  annule: {
    label: 'Annulé',
    textClass: 'text-slate-400',
    badgeClass: 'bg-slate-100 text-slate-500 border-slate-200',
  },
}

const SORT_OPTIONS = [
  { id: 'date_desc', label: 'Date : récents d’abord' },
  { id: 'date_asc', label: 'Date : anciens d’abord' },
  { id: 'montant_desc', label: 'Montant : plus élevé' },
  { id: 'montant_asc', label: 'Montant : plus faible' },
  { id: 'banque_asc', label: 'Banque (A → Z)' },
]

/* ───────────────────────────── Helpers ───────────────────────────── */

const fmt = (n: number) => Math.round(n || 0).toLocaleString('fr-FR')
const sanitizeAmount = (v: string) => v.replace(/\D/g, '')
const parseAmount = (v: string) => {
  const cleaned = sanitizeAmount(v)
  return cleaned === '' ? 0 : Number(cleaned)
}
const formatAmount = (v: string | number) => {
  const digits = typeof v === 'number' ? String(Math.round(v)) : sanitizeAmount(v)
  return digits === '' ? '' : Number(digits).toLocaleString('fr-FR')
}

function getDateGroupLabel(iso?: string | null): string {
  if (!iso) return 'Sans date'
  const d = new Date(iso.length === 10 ? `${iso}T12:00:00` : iso)
  if (Number.isNaN(d.getTime())) return 'Sans date'
  const now = new Date()
  const todayKey = `${now.getFullYear()}-${now.getMonth()}-${now.getDate()}`
  const yest = new Date(now)
  yest.setDate(now.getDate() - 1)
  const yestKey = `${yest.getFullYear()}-${yest.getMonth()}-${yest.getDate()}`
  const dKey = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`
  if (dKey === todayKey) return "Aujourd'hui"
  if (dKey === yestKey) return 'Hier'
  return d.toLocaleDateString('fr-FR', {
    day: 'numeric',
    month: 'short',
    year: d.getFullYear() !== now.getFullYear() ? 'numeric' : undefined,
  })
}

function useIsMobile(breakpoint = 768) {
  const [mobile, setMobile] = useState(false)
  useEffect(() => {
    const mq = window.matchMedia(`(max-width:${breakpoint - 1}px)`)
    const update = () => setMobile(mq.matches)
    update()
    mq.addEventListener('change', update)
    return () => mq.removeEventListener('change', update)
  }, [breakpoint])
  return mobile
}

function Sheet({
  open,
  onClose,
  title,
  subtitle,
  children,
  footer,
  z = 'z-[9999]',
}: {
  open: boolean
  onClose: () => void
  title: string
  subtitle?: string
  children: React.ReactNode
  footer?: React.ReactNode
  z?: string
}) {
  useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [open])

  if (!open) return null
  return (
    <div className={`fixed inset-0 ${z} flex items-end md:items-center justify-center p-0 md:p-4`}>
      <div
        className="absolute inset-0 bg-slate-900/50 backdrop-blur-[2px] animate-in fade-in duration-150"
        onClick={onClose}
      />
      <div className="relative w-full md:max-w-xl bg-white rounded-t-[2rem] md:rounded-2xl shadow-2xl flex flex-col max-h-[92dvh] md:max-h-[88vh] animate-in slide-in-from-bottom md:zoom-in-95 duration-200">
        <div className="md:hidden flex justify-center pt-3">
          <div className="w-12 h-1.5 rounded-full bg-slate-200" />
        </div>
        <div className="flex items-start justify-between gap-3 px-4 sm:px-5 pt-3 md:pt-5 pb-3 border-b border-slate-100">
          <div className="min-w-0">
            <h2 className="font-black text-slate-900 text-sm sm:text-base leading-tight truncate">{title}</h2>
            {subtitle && (
              <p className="text-[11px] sm:text-xs text-slate-500 font-medium mt-0.5 line-clamp-2">{subtitle}</p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 -mr-1 -mt-1 rounded-xl text-slate-400 hover:bg-slate-100 active:bg-slate-100 shrink-0 cursor-pointer"
            aria-label="Fermer"
          >
            <X size={18} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto overscroll-contain px-4 sm:px-5 py-4">{children}</div>
        {footer && (
          <div className="px-4 sm:px-5 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))] border-t border-slate-100 bg-white rounded-b-2xl">
            {footer}
          </div>
        )}
      </div>
    </div>
  )
}

/* ─────────────────────────── Page principale ─────────────────────────── */

export default function VirementsBancairesPage() {
  const { selectedYear } = useYear()
  const { setHideNavbar } = useUI()
  const { profile: workProfile } = useWorkProfile()
  const isMobile = useIsMobile()

  const [userId, setUserId] = useState<string | null>(null)
  const [agenceId, setAgenceId] = useState<string | null>(null)
  const [agenceName, setAgenceName] = useState<string>('')
  const [allVirements, setAllVirements] = useState<VirementRow[]>([])
  const [loading, setLoading] = useState(true)
  const [tableMissing, setTableMissing] = useState(false)

  const [selectedDevise, setSelectedDevise] = useState<HajjCurrency>('FCFA')
  const [tab, setTab] = useState<'operations' | 'synthese'>('operations')

  // Filtres & tri
  const [search, setSearch] = useState('')
  const [filterSens, setFilterSens] = useState<'all' | VirementSens>('all')
  const [filterStatut, setFilterStatut] = useState<'all' | VirementStatut>('all')
  const [filterBanque, setFilterBanque] = useState<string>('all')
  const [filterRecu, setFilterRecu] = useState<'all' | 'avec' | 'sans'>('all')
  const [sortKey, setSortKey] = useState<string>('date_desc')

  // Overlays
  const [showFilters, setShowFilters] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [mobileStep, setMobileStep] = useState<1 | 2 | 3>(1)
  const [detailId, setDetailId] = useState<string | null>(null)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null)

  // Modal Export PDF Récapitulatif
  const [showPdfSheet, setShowPdfSheet] = useState(false)
  const [pdfScope, setPdfScope] = useState<'all' | 'emis' | 'recu'>('all')
  const [pdfFromDate, setPdfFromDate] = useState('')
  const [pdfToDate, setPdfToDate] = useState('')

  // Formulaire ajout / modification
  const [editingId, setEditingId] = useState<string | null>(null)
  const [sens, setSens] = useState<VirementSens>('emis')
  const [banque, setBanque] = useState('')
  const [nomCompte, setNomCompte] = useState('')
  const [numeroCompte, setNumeroCompte] = useState('')
  const [contrepartie, setContrepartie] = useState('')
  const [montantSaisi, setMontantSaisi] = useState('')
  const [motifChoice, setMotifChoice] = useState<string>(MOTIFS_EMIS[0])
  const [customMotif, setCustomMotif] = useState('')
  const [referenceBancaire, setReferenceBancaire] = useState('')
  const [dateVirement, setDateVirement] = useState(() => new Date().toISOString().slice(0, 10))
  const [statut, setStatut] = useState<VirementStatut>('execute')
  const [notes, setNotes] = useState('')
  const [recuUrl, setRecuUrl] = useState<string | null>(null)
  const [pendingFile, setPendingFile] = useState<File | null>(null)
  const [pendingPreview, setPendingPreview] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const cameraInputRef = useRef<HTMLInputElement | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  // Pile 3D mobile
  const [heroIdx, setHeroIdx] = useState(0)
  const [heroDragX, setHeroDragX] = useState(0)
  const heroStartRef = useRef<{ x: number; y: number } | null>(null)
  const heroLockRef = useRef<'horizontal' | 'vertical' | null>(null)
  const heroDragXRef = useRef(0)

  // Toast natif
  const [toast, setToast] = useState<{ text: string; type: 'success' | 'error' } | null>(null)
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const showToast = useCallback((text: string, type: 'success' | 'error' = 'success') => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current)
    setToast({ text, type })
    toastTimerRef.current = setTimeout(() => {
      setToast(null)
      toastTimerRef.current = null
    }, 3000)
  }, [])

  useEffect(() => {
    return () => {
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current)
    }
  }, [])

  // Masquer la navbar mobile dès qu'une feuille ou un assistant est ouvert
  const anyOverlayOpen = Boolean(
    showForm || showFilters || detailId || deleteConfirmId || showPdfSheet || lightboxUrl
  )
  useEffect(() => {
    setHideNavbar(anyOverlayOpen)
    return () => setHideNavbar(false)
  }, [anyOverlayOpen, setHideNavbar])

  const curSymbol = getHajjCurrencySymbol(selectedDevise)
  const curShort = getHajjCurrencySymbol(selectedDevise, true)

  /* ---------- Chargement session + virements ---------- */
  const fetchVirements = useCallback(async (uid: string, agId: string | null) => {
    const cacheKey = `virements_cache_${agId || uid}`
    try {
      const cached = await idbGet<VirementRow[]>(cacheKey)
      if (Array.isArray(cached) && cached.length > 0) {
        setAllVirements(cached)
        setLoading(false)
      }
    } catch { /* ignore */ }

    try {
      let query = supabase
        .from('virements_bancaires')
        .select('*')
        .order('date_virement', { ascending: false })
        .order('created_at', { ascending: false })

      if (agId) {
        query = query.eq('agence_id', agId)
      } else {
        query = query.eq('user_id', uid)
      }

      const { data, error } = await query
      if (error) {
        if (error.code === '42P01' || String(error.message || '').includes('virements_bancaires')) {
          setTableMissing(true)
        }
        return
      }

      setTableMissing(false)
      const mapped: VirementRow[] = (data || []).map((r: any) => ({
        ...r,
        montant: Number(r.montant) || 0,
        devise: normalizeHajjCurrency(r.devise),
        sens: r.sens === 'recu' ? 'recu' : 'emis',
        statut:
          r.statut === 'en_attente' || r.statut === 'annule' ? r.statut : 'execute',
      }))
      setAllVirements(mapped)
      void idbSet(cacheKey, mapped).catch(() => { })
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    let mounted = true
      ; (async () => {
        try {
          const { data: userRes } = await getUser()
          const uid = userRes?.user?.id ?? null
          if (!mounted || !uid) {
            setLoading(false)
            return
          }
          setUserId(uid)

          const { data: prof } = await supabase
            .from('profiles')
            .select('agence_id, agences(nom_agence)')
            .eq('id', uid)
            .maybeSingle()

          if (!mounted) return
          const agId = prof?.agence_id ?? null
          // @ts-expect-error join relation
          const nomAg = prof?.agences?.nom_agence || ''
          setAgenceId(agId)
          setAgenceName(nomAg)
          await fetchVirements(uid, agId)
        } catch {
          if (mounted) setLoading(false)
        }
      })()
    return () => {
      mounted = false
    }
  }, [fetchVirements])

  /* ---------- Filtrage par campagne & devise ---------- */
  const yearVirements = useMemo(() => {
    if (selectedYear === 'all') return allVirements
    return allVirements.filter(v => !v.campagne || Number(v.campagne) === Number(selectedYear))
  }, [allVirements, selectedYear])

  const deviseCounts = useMemo(() => countByCurrency(yearVirements), [yearVirements])

  const currencyVirements = useMemo(
    () => yearVirements.filter(v => v.devise === selectedDevise),
    [yearVirements, selectedDevise]
  )

  const uniqueBanques = useMemo(() => {
    const s = new Set<string>()
    currencyVirements.forEach(v => {
      if (v.banque?.trim()) s.add(v.banque.trim())
    })
    return Array.from(s).sort((a, b) => a.localeCompare(b, 'fr'))
  }, [currencyVirements])

  const knownAccounts = useMemo(() => {
    const map = new Map<string, { banque: string; nom_compte: string; numero_compte: string }>()
    allVirements.forEach(v => {
      const key = `${v.banque.trim().toLowerCase()}|${v.nom_compte.trim().toLowerCase()}`
      if (!map.has(key) && v.banque.trim() && v.nom_compte.trim()) {
        map.set(key, {
          banque: v.banque.trim(),
          nom_compte: v.nom_compte.trim(),
          numero_compte: (v.numero_compte || '').trim(),
        })
      }
    })
    return Array.from(map.values()).slice(0, 8)
  }, [allVirements])

  /* ---------- Totaux (strictement hors annulés) ---------- */
  const validCurrencyRows = useMemo(
    () => currencyVirements.filter(v => v.statut !== 'annule'),
    [currencyVirements]
  )
  const totalRecu = useMemo(
    () => validCurrencyRows.filter(v => v.sens === 'recu').reduce((s, v) => s + v.montant, 0),
    [validCurrencyRows]
  )
  const totalEmis = useMemo(
    () => validCurrencyRows.filter(v => v.sens === 'emis').reduce((s, v) => s + v.montant, 0),
    [validCurrencyRows]
  )
  const soldeNet = totalRecu - totalEmis
  const nbRecus = validCurrencyRows.filter(v => v.sens === 'recu').length
  const nbEmis = validCurrencyRows.filter(v => v.sens === 'emis').length
  const nbEnAttente = currencyVirements.filter(v => v.statut === 'en_attente').length
  const nbAvecRecu = currencyVirements.filter(v => Boolean(v.recu_url)).length

  /* ---------- Synthèse par compte bancaire & par motif ---------- */
  const byAccount = useMemo(() => {
    const map = new Map<
      string,
      { banque: string; nom_compte: string; numero_compte: string; recu: number; emis: number; count: number }
    >()
    validCurrencyRows.forEach(v => {
      const key = `${v.banque.trim()}|${v.nom_compte.trim()}`
      const cur = map.get(key) ?? {
        banque: v.banque.trim(),
        nom_compte: v.nom_compte.trim(),
        numero_compte: (v.numero_compte || '').trim(),
        recu: 0,
        emis: 0,
        count: 0,
      }
      if (v.sens === 'recu') cur.recu += v.montant
      else cur.emis += v.montant
      cur.count++
      map.set(key, cur)
    })
    return Array.from(map.values()).sort((a, b) => b.recu + b.emis - (a.recu + a.emis))
  }, [validCurrencyRows])

  const byMotif = useMemo(() => {
    const map = new Map<string, { motif: string; total: number; count: number; sens: VirementSens }>()
    validCurrencyRows.forEach(v => {
      const key = `${v.sens}|${v.motif}`
      const cur = map.get(key) ?? { motif: v.motif, total: 0, count: 0, sens: v.sens }
      cur.total += v.montant
      cur.count++
      map.set(key, cur)
    })
    return Array.from(map.values()).sort((a, b) => b.total - a.total)
  }, [validCurrencyRows])

  /* ---------- Liste filtrée & groupée par date ---------- */
  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase()
    const list = currencyVirements.filter(v => {
      if (filterSens !== 'all' && v.sens !== filterSens) return false
      if (filterStatut !== 'all' && v.statut !== filterStatut) return false
      if (filterBanque !== 'all' && v.banque.trim() !== filterBanque) return false
      if (filterRecu === 'avec' && !v.recu_url) return false
      if (filterRecu === 'sans' && v.recu_url) return false
      if (!q) return true
      const blob = `${v.banque} ${v.nom_compte} ${v.numero_compte || ''} ${v.contrepartie || ''} ${v.motif} ${v.reference_bancaire || ''} ${v.notes || ''} ${v.recorded_by_name || ''}`.toLowerCase()
      return blob.includes(q)
    })

    const dateMs = (v: VirementRow) =>
      new Date(v.date_virement || v.created_at || 0).getTime() || 0

    list.sort((a, b) => {
      switch (sortKey) {
        case 'date_asc':
          return dateMs(a) - dateMs(b)
        case 'montant_desc':
          return b.montant - a.montant
        case 'montant_asc':
          return a.montant - b.montant
        case 'banque_asc':
          return a.banque.localeCompare(b.banque, 'fr')
        default:
          return dateMs(b) - dateMs(a) || new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime()
      }
    })
    return list
  }, [currencyVirements, search, filterSens, filterStatut, filterBanque, filterRecu, sortKey])

  const groupedByDate = useMemo(() => {
    const groups: Array<{ label: string; rows: VirementRow[]; net: number }> = []
    const byLabel = new Map<string, { label: string; rows: VirementRow[]; net: number }>()
    for (const r of filteredRows) {
      const label = getDateGroupLabel(r.date_virement || r.created_at)
      let g = byLabel.get(label)
      if (!g) {
        g = { label, rows: [], net: 0 }
        byLabel.set(label, g)
        groups.push(g)
      }
      g.rows.push(r)
      if (r.statut !== 'annule') {
        g.net += r.sens === 'recu' ? r.montant : -r.montant
      }
    }
    return groups
  }, [filteredRows])

  const activeFilterCount =
    (filterSens !== 'all' ? 1 : 0) +
    (filterStatut !== 'all' ? 1 : 0) +
    (filterBanque !== 'all' ? 1 : 0) +
    (filterRecu !== 'all' ? 1 : 0) +
    (sortKey !== 'date_desc' ? 1 : 0)

  const resetFilters = () => {
    setSearch('')
    setFilterSens('all')
    setFilterStatut('all')
    setFilterBanque('all')
    setFilterRecu('all')
    setSortKey('date_desc')
  }

  /* ---------- Gestes pile 3D mobile ---------- */
  const handleHeroTouchStart = (e: React.TouchEvent) => {
    const t = e.touches[0]
    if (!t) return
    heroStartRef.current = { x: t.clientX, y: t.clientY }
    heroLockRef.current = null
    heroDragXRef.current = 0
    setHeroDragX(0)
  }
  const handleHeroTouchMove = (e: React.TouchEvent) => {
    if (!heroStartRef.current) return
    const t = e.touches[0]
    if (!t) return
    const dx = t.clientX - heroStartRef.current.x
    const dy = t.clientY - heroStartRef.current.y
    if (!heroLockRef.current) {
      if (Math.abs(dx) > 10 && Math.abs(dx) > Math.abs(dy)) heroLockRef.current = 'horizontal'
      else if (Math.abs(dy) > 10) {
        heroLockRef.current = 'vertical'
        return
      } else return
    }
    if (heroLockRef.current === 'horizontal') {
      const clamped = Math.max(-120, Math.min(120, dx))
      heroDragXRef.current = clamped
      setHeroDragX(clamped)
    }
  }
  const handleHeroTouchEnd = () => {
    const dragged = heroDragXRef.current
    heroStartRef.current = null
    heroLockRef.current = null
    heroDragXRef.current = 0
    setHeroDragX(0)
    if (Math.abs(dragged) > 40) setHeroIdx(prev => (prev === 0 ? 1 : 0))
  }

  /* ---------- Formulaire : ouverture / réinitialisation / fichier ---------- */
  const resetForm = (defaultSens: VirementSens = 'emis') => {
    setEditingId(null)
    setSens(defaultSens)
    setBanque('')
    setNomCompte('')
    setNumeroCompte('')
    setContrepartie('')
    setMontantSaisi('')
    setMotifChoice(defaultSens === 'recu' ? MOTIFS_RECUS[0] : MOTIFS_EMIS[0])
    setCustomMotif('')
    setReferenceBancaire('')
    setDateVirement(new Date().toISOString().slice(0, 10))
    setStatut('execute')
    setNotes('')
    setRecuUrl(null)
    setPendingFile(null)
    if (pendingPreview) URL.revokeObjectURL(pendingPreview)
    setPendingPreview(null)
  }

  const openNew = (defaultSens: VirementSens = 'emis') => {
    resetForm(defaultSens)
    setDetailId(null)
    setMobileStep(1)
    setShowForm(true)
  }

  const openEdit = (v: VirementRow, duplicate = false) => {
    setDetailId(null)
    setEditingId(duplicate ? null : v.id)
    setSens(v.sens)
    setBanque(v.banque)
    setNomCompte(v.nom_compte)
    setNumeroCompte(v.numero_compte || '')
    setContrepartie(v.contrepartie || '')
    setMontantSaisi(formatAmount(v.montant))
    const list = v.sens === 'recu' ? MOTIFS_RECUS : MOTIFS_EMIS
    if (list.includes(v.motif)) {
      setMotifChoice(v.motif)
      setCustomMotif('')
    } else {
      setMotifChoice('Autre')
      setCustomMotif(v.motif)
    }
    setReferenceBancaire(duplicate ? '' : v.reference_bancaire || '')
    setDateVirement(duplicate ? new Date().toISOString().slice(0, 10) : v.date_virement)
    setStatut(v.statut)
    setNotes(v.notes || '')
    setRecuUrl(duplicate ? null : v.recu_url || null)
    setPendingFile(null)
    if (pendingPreview) URL.revokeObjectURL(pendingPreview)
    setPendingPreview(null)
    setMobileStep(1)
    setShowForm(true)
  }

  const closeForm = () => {
    setShowForm(false)
    resetForm()
  }

  const handleSelectFile = (file: File | null | undefined) => {
    if (!file) return
    if (pendingPreview) URL.revokeObjectURL(pendingPreview)
    setPendingFile(file)
    if (file.type.startsWith('image/')) {
      setPendingPreview(URL.createObjectURL(file))
    } else {
      setPendingPreview(null)
    }
  }

  const finalMotif = motifChoice === 'Autre' ? customMotif.trim() : motifChoice
  const montantNum = parseAmount(montantSaisi)
  const step1Valid = banque.trim().length > 0 && nomCompte.trim().length > 0
  const step2Valid = montantNum > 0 && finalMotif.length > 0 && dateVirement.length > 0

  const handleSave = async () => {
    if (saving || !step1Valid || !step2Valid) return
    setSaving(true)
    try {
      let finalRecuUrl = recuUrl
      if (pendingFile) {
        const uploaded = await uploadVirementReceipt(pendingFile)
        finalRecuUrl = uploaded.path
      }

      const payload = {
        agence_id: agenceId,
        user_id: userId,
        sens,
        banque: banque.trim(),
        nom_compte: nomCompte.trim(),
        numero_compte: numeroCompte.trim() || null,
        contrepartie: contrepartie.trim() || null,
        montant: montantNum,
        devise: selectedDevise,
        motif: finalMotif,
        reference_bancaire: referenceBancaire.trim() || null,
        date_virement: dateVirement,
        statut,
        recu_url: finalRecuUrl,
        notes: notes.trim() || null,
        campagne: selectedYear === 'all' ? new Date().getFullYear() : Number(selectedYear),
      }

      if (editingId) {
        const { error } = await supabase
          .from('virements_bancaires')
          .update(payload)
          .eq('id', editingId)
        if (error) throw error
      } else {
        const { error } = await supabase.from('virements_bancaires').insert({
          ...payload,
          recorded_by_name: workProfile?.name?.trim() || null,
          recorded_by_role: workProfile?.profile_type || null,
        })
        if (error) throw error
      }

      if (userId) await fetchVirements(userId, agenceId)
      const wasEdit = Boolean(editingId)
      closeForm()
      showToast(wasEdit ? 'Virement mis à jour' : 'Virement enregistré')
    } catch (err: any) {
      console.error('[virements save]', err)
      showToast(
        err?.code === '42P01'
          ? 'Exécutez supabase/virements_bancaires.sql dans Supabase.'
          : err?.message || "Erreur lors de l'enregistrement du virement.",
        'error'
      )
    } finally {
      setSaving(false)
    }
  }

  const handleQuickStatut = async (v: VirementRow, nextStatut: VirementStatut) => {
    try {
      const { error } = await supabase
        .from('virements_bancaires')
        .update({ statut: nextStatut })
        .eq('id', v.id)
      if (error) throw error
      setAllVirements(prev => prev.map(x => (x.id === v.id ? { ...x, statut: nextStatut } : x)))
      showToast(`Statut passé en « ${STATUT_META[nextStatut].label} »`)
    } catch {
      showToast('Erreur lors de la mise à jour du statut.', 'error')
    }
  }

  const executeDelete = async (id: string) => {
    setDeleting(true)
    try {
      const { error } = await supabase.from('virements_bancaires').delete().eq('id', id)
      if (error) throw error
      setAllVirements(prev => prev.filter(v => v.id !== id))
      setDetailId(null)
      setExpandedId(null)
      setDeleteConfirmId(null)
      showToast('Virement supprimé')
    } catch {
      showToast('Erreur lors de la suppression.', 'error')
    } finally {
      setDeleting(false)
    }
  }

  /* ---------- Exports CSV & PDF ---------- */
  const exportCsv = () => {
    const header = [
      'Date',
      'Sens',
      'Devise',
      'Banque',
      'Nom du compte',
      'Numéro compte',
      'Contrepartie',
      'Motif',
      'Réf. bancaire',
      'Statut',
      'Justificatif',
      'Enregistré par',
      `Montant (${curSymbol})`,
    ]
    const lines = filteredRows.map(v => [
      v.date_virement,
      v.sens === 'recu' ? 'Reçu' : 'Émis',
      v.devise,
      v.banque,
      v.nom_compte,
      v.numero_compte || '',
      v.contrepartie || '',
      v.motif,
      v.reference_bancaire || '',
      STATUT_META[v.statut].label,
      v.recu_url ? 'Oui' : 'Non',
      formatAuthorInline(v.recorded_by_name, v.recorded_by_role) || '—',
      v.sens === 'recu' ? v.montant : -v.montant,
    ])
    const esc = (val: string | number) => `"${String(val).replace(/"/g, '""')}"`
    const csv = '\uFEFF' + [header, ...lines].map(l => l.map(esc).join(';')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `virements_bancaires_${selectedYear}_${selectedDevise}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const handleGenerateRecapPdf = () => {
    const pool = currencyVirements.filter(v => {
      if (pdfFromDate && v.date_virement < pdfFromDate) return false
      if (pdfToDate && v.date_virement > pdfToDate) return false
      return true
    })
    const scopedCount = pdfScope === 'all' ? pool.length : pool.filter(v => v.sens === pdfScope).length
    if (scopedCount === 0) {
      showToast('Aucun virement à inclure pour cette sélection.', 'error')
      return
    }
    const periodLabel =
      pdfFromDate || pdfToDate
        ? `Période : ${pdfFromDate || '...'} au ${pdfToDate || '...'}`
        : undefined

    generateVirementsRecapPdf({
      items: pool,
      scope: pdfScope,
      devise: selectedDevise,
      agenceName,
      campagneLabel: selectedYear === 'all' ? 'Toutes campagnes' : `Campagne ${selectedYear}`,
      periodLabel,
    })
    setShowPdfSheet(false)
    showToast('Relevé PDF téléchargé')
  }

  const detailRow = detailId ? allVirements.find(v => v.id === detailId) || null : null
  const currentMotifSuggestions = sens === 'recu' ? MOTIFS_RECUS : MOTIFS_EMIS

  const handleSelectDevise = (next: HajjCurrency) => {
    setSelectedDevise(next)
    setDetailId(null)
    setExpandedId(null)
    resetFilters()
  }

  /* ───────────────────────────── Rendu ───────────────────────────── */

  return (
    <div className="min-h-screen bg-slate-50 md:bg-transparent text-slate-800">
      {/* ── TOAST NATIF FLOTTANT ── */}
      {toast && (
        <div
          onClick={() => setToast(null)}
          className={`fixed top-[max(1rem,env(safe-area-inset-top))] left-1/2 -translate-x-1/2 z-[10002] max-w-[calc(100vw-2rem)] px-4 py-2.5 rounded-full shadow-xl border flex items-center gap-2 text-xs font-bold cursor-pointer animate-in fade-in slide-in-from-top-2 duration-200 ${toast.type === 'error'
              ? 'bg-rose-600 text-white border-rose-500'
              : 'bg-slate-900 text-white border-slate-700'
            }`}
        >
          {toast.type === 'error' ? (
            <AlertCircle size={15} className="shrink-0" />
          ) : (
            <CheckCircle2 size={15} className="shrink-0 text-emerald-400" />
          )}
          <span className="truncate">{toast.text}</span>
        </div>
      )}

      {/* Inputs cachés pour scan caméra / import fichier du reçu */}
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={e => {
          handleSelectFile(e.target.files?.[0])
          e.currentTarget.value = ''
        }}
      />
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*,application/pdf"
        className="hidden"
        onChange={e => {
          handleSelectFile(e.target.files?.[0])
          e.currentTarget.value = ''
        }}
      />

      {/* =================================================================== */}
      {/* 📱 VERSION MOBILE NATIVE (`md:hidden`)                              */}
      {/* =================================================================== */}
      <div className="md:hidden pb-28 min-h-screen bg-slate-50">
        {/* 1. EN-TÊTE BLANC FIXE */}
        <div className="bg-white border-b border-slate-100 px-5 pt-4 pb-3 sticky top-0 z-40 shadow-[0_1px_8px_rgba(15,23,42,0.03)]">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <h1 className="text-2xl font-black text-blue-600 tracking-tight leading-none">
                Virements
              </h1>
              <p className="text-xs text-slate-400 font-semibold mt-1 truncate">
                Suivi bancaire • {selectedYear !== 'all' ? `Campagne ${selectedYear}` : 'Toutes campagnes'}
              </p>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              {currencyVirements.length > 0 && (
                <button
                  type="button"
                  onClick={() => setShowPdfSheet(true)}
                  aria-label="Relevé PDF"
                  className="w-9 h-9 rounded-full bg-slate-100 text-slate-700 flex items-center justify-center active:scale-90 transition cursor-pointer"
                >
                  <FileText size={16} />
                </button>
              )}
              <button
                type="button"
                onClick={() => openNew('emis')}
                className="h-9 px-3.5 rounded-full bg-slate-900 text-white text-xs font-black flex items-center gap-1.5 shadow-xs active:scale-95 transition cursor-pointer"
              >
                <Plus size={15} strokeWidth={2.6} />
                <span>Virement</span>
              </button>
            </div>
          </div>
        </div>

        {/* 2. CORPS DE PAGE AÉRÉ (z-0 isolé) */}
        <div className="relative z-0 px-5 pt-3.5 space-y-4">
          {tableMissing && (
            <div className="rounded-2xl bg-amber-50 border border-amber-200 p-3.5 text-xs text-amber-900 font-semibold leading-relaxed">
              La table <code className="font-mono font-bold">virements_bancaires</code> n’est pas encore créée dans Supabase. Exécutez{' '}
              <code className="font-mono font-bold">supabase/virements_bancaires.sql</code> dans le SQL Editor.
            </div>
          )}

          {/* Devises style Apple */}
          <div className="grid grid-cols-3 gap-1.5">
            {HAJJ_CURRENCIES.map(cur => {
              const active = selectedDevise === cur.code
              const count = deviseCounts[cur.code] ?? 0
              const applePalette =
                cur.code === 'FCFA'
                  ? {
                    active: 'bg-[#248A3D] text-white border-[#248A3D] shadow-[0_3px_10px_-3px_rgba(36,138,61,0.5)]',
                    idle: 'bg-[#34C759]/12 text-[#1D7A36] border-[#34C759]/25',
                    countIdle: 'text-[#1D7A36]/70',
                  }
                  : cur.code === 'EUR'
                    ? {
                      active: 'bg-[#5856D6] text-white border-[#5856D6] shadow-[0_3px_10px_-3px_rgba(88,86,214,0.5)]',
                      idle: 'bg-[#5856D6]/10 text-[#4846C2] border-[#5856D6]/20',
                      countIdle: 'text-[#4846C2]/70',
                    }
                    : {
                      active: 'bg-[#0E7C94] text-white border-[#0E7C94] shadow-[0_3px_10px_-3px_rgba(14,124,148,0.5)]',
                      idle: 'bg-[#30B0C7]/12 text-[#0C6E84] border-[#30B0C7]/25',
                      countIdle: 'text-[#0C6E84]/70',
                    }

              return (
                <button
                  key={cur.code}
                  type="button"
                  onClick={() => handleSelectDevise(cur.code)}
                  className={`h-9 rounded-xl text-xs font-black border flex items-center justify-center gap-1.5 transition active:scale-[0.97] cursor-pointer ${active ? applePalette.active : applePalette.idle
                    }`}
                >
                  <span>{cur.shortLabel}</span>
                  <span className={`text-[10px] tabular-nums ${active ? 'text-white/80' : applePalette.countIdle}`}>
                    {count}
                  </span>
                </button>
              )
            })}
          </div>

          {/* Pile 3D flottante compacte (2 cartes architecturales empilées) */}
          {!loading && (() => {
            const deckCards = [
              {
                id: 'flux',
                label: 'Flux bancaires',
                bgClass: 'bg-[#1E3A5F]',
                content: (
                  <>
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-[10px] font-black uppercase tracking-wider text-white/65">
                          Solde net virements
                        </p>
                        <p className="text-[1.45rem] leading-tight font-black tabular-nums tracking-tight text-white mt-0.5 truncate">
                          {soldeNet > 0 ? '+' : ''}
                          {fmt(soldeNet)}{' '}
                          <span className="text-xs font-bold text-white/70">{curShort}</span>
                        </p>
                      </div>
                      <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded-full bg-white/15 text-white shrink-0">
                        Hors compta
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-3 pt-2.5 border-t border-white/15">
                      <div className="min-w-0">
                        <p className="text-[9.5px] text-white/65 font-semibold">Reçus ({nbRecus})</p>
                        <p className="text-xs font-black text-emerald-300 tabular-nums mt-0.5 truncate">
                          +{fmt(totalRecu)} {curShort}
                        </p>
                      </div>
                      <div className="min-w-0 border-l border-white/15 pl-3">
                        <p className="text-[9.5px] text-white/65 font-semibold">Émis ({nbEmis})</p>
                        <p className="text-xs font-black text-white tabular-nums mt-0.5 truncate">
                          -{fmt(totalEmis)} {curShort}
                        </p>
                      </div>
                    </div>
                  </>
                ),
              },
              {
                id: 'justifs',
                label: 'Comptes & Reçus',
                bgClass: 'bg-[#2C3A47]',
                content: (
                  <>
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-[10px] font-black uppercase tracking-wider text-white/65">
                          Reçus scannés
                        </p>
                        <p className="text-[1.45rem] leading-tight font-black tabular-nums tracking-tight text-white mt-0.5">
                          {nbAvecRecu}
                          <span className="text-sm font-bold text-white/60"> / {currencyVirements.length}</span>
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={e => {
                          e.stopPropagation()
                          setShowPdfSheet(true)
                        }}
                        className="text-[10px] font-black px-2.5 py-1 rounded-full bg-white text-[#2C3A47] shrink-0 cursor-pointer"
                      >
                        Relevé PDF
                      </button>
                    </div>

                    <div className="grid grid-cols-2 gap-3 pt-2.5 border-t border-white/15">
                      <div className="min-w-0">
                        <p className="text-[9.5px] text-white/65 font-semibold">Comptes suivis</p>
                        <p className="text-xs font-black text-white tabular-nums mt-0.5 truncate">
                          {byAccount.length} compte{byAccount.length > 1 ? 's' : ''}
                        </p>
                      </div>
                      <div className="min-w-0 border-l border-white/15 pl-3">
                        <p className="text-[9.5px] text-white/65 font-semibold">En attente</p>
                        <p className="text-xs font-black text-amber-300 tabular-nums mt-0.5 truncate">
                          {nbEnAttente} opération{nbEnAttente > 1 ? 's' : ''}
                        </p>
                      </div>
                    </div>
                  </>
                ),
              },
            ]

            return (
              <div className="isolate relative z-0 w-[94%] max-w-[350px] mx-auto">
                <div
                  className="relative h-[126px] select-none"
                  onTouchStart={handleHeroTouchStart}
                  onTouchMove={handleHeroTouchMove}
                  onTouchEnd={handleHeroTouchEnd}
                  onTouchCancel={handleHeroTouchEnd}
                >
                  {deckCards.map((card, idx) => {
                    const isFront = idx === heroIdx
                    const layerStyle: React.CSSProperties = isFront
                      ? {
                        transform: `translate3d(${heroDragX}px, 0px, 0) rotate(${(heroDragX * 0.03).toFixed(2)}deg) scale(1)`,
                        zIndex: 2,
                        opacity: 1,
                        transition: heroDragX !== 0 ? 'none' : 'transform 260ms cubic-bezier(0.22, 1, 0.36, 1), opacity 200ms ease',
                      }
                      : {
                        transform: `translate3d(0px, ${heroDragX !== 0 ? Math.max(2, 10 - Math.abs(heroDragX) * 0.06) : 10}px, 0) scale(${heroDragX !== 0 ? Math.min(0.99, 0.94 + Math.abs(heroDragX) * 0.0004) : 0.94})`,
                        zIndex: 1,
                        opacity: 0.92,
                        transition: heroDragX !== 0 ? 'none' : 'transform 260ms cubic-bezier(0.22, 1, 0.36, 1), opacity 200ms ease',
                      }

                    return (
                      <div
                        key={card.id}
                        style={layerStyle}
                        onClick={!isFront ? () => setHeroIdx(idx) : undefined}
                        className={`absolute inset-x-0 top-0 h-[116px] ${card.bgClass} text-white rounded-2xl px-4 py-3 flex flex-col justify-between border border-white/15 ${isFront
                            ? 'shadow-[inset_0_1px_0_rgba(255,255,255,0.22),0_16px_28px_-12px_rgba(15,23,42,0.45),0_4px_10px_-4px_rgba(15,23,42,0.20)]'
                            : 'shadow-[0_10px_18px_-12px_rgba(15,23,42,0.38)] cursor-pointer'
                          }`}
                      >
                        <div className={isFront ? 'h-full flex flex-col justify-between' : 'opacity-20 pointer-events-none h-full flex flex-col justify-between'}>
                          {card.content}
                        </div>
                      </div>
                    )
                  })}
                </div>

                <div className="flex items-center justify-center gap-2 pt-1.5">
                  {deckCards.map((card, idx) => (
                    <button
                      key={card.id}
                      type="button"
                      onClick={() => setHeroIdx(idx)}
                      className={`h-5 px-2.5 rounded-full text-[10px] font-bold transition cursor-pointer ${heroIdx === idx ? `${card.bgClass} text-white` : 'text-slate-400'
                        }`}
                    >
                      {card.label}
                    </button>
                  ))}
                </div>
              </div>
            )
          })()}

          {/* Onglets soulignés (Opérations | Synthèse) */}
          <div className="-mx-5 px-5 border-b border-slate-200/80 flex items-center gap-6">
            <button
              type="button"
              onClick={() => setTab('operations')}
              className={`relative pb-2.5 text-sm flex items-center gap-1.5 transition cursor-pointer ${tab === 'operations' ? 'font-black text-slate-900' : 'font-semibold text-slate-400'
                }`}
            >
              <span>Opérations</span>
              <span
                className={`text-[10px] font-black px-1.5 py-0.5 rounded-full tabular-nums ${tab === 'operations' ? 'bg-slate-900 text-white' : 'bg-slate-200/80 text-slate-500'
                  }`}
              >
                {currencyVirements.length}
              </span>
              {tab === 'operations' && (
                <span className="absolute left-0 right-0 bottom-0 h-[2.5px] rounded-full bg-blue-600" />
              )}
            </button>

            <button
              type="button"
              onClick={() => setTab('synthese')}
              className={`relative pb-2.5 text-sm transition cursor-pointer ${tab === 'synthese' ? 'font-black text-slate-900' : 'font-semibold text-slate-400'
                }`}
            >
              <span>Synthèse</span>
              {tab === 'synthese' && (
                <span className="absolute left-0 right-0 bottom-0 h-[2.5px] rounded-full bg-blue-600" />
              )}
            </button>
          </div>

          {loading ? (
            <div className="space-y-2.5">
              {Array.from({ length: 4 }).map((_, i) => (
                <div
                  key={i}
                  className="bg-white rounded-2xl border border-blue-950/15 p-3.5 flex items-center gap-3 animate-pulse"
                >
                  <div className="w-10 h-10 rounded-xl bg-slate-100 shrink-0" />
                  <div className="flex-1 space-y-2">
                    <div className="h-3.5 w-32 bg-slate-100 rounded" />
                    <div className="h-3 w-44 bg-slate-100 rounded" />
                  </div>
                  <div className="h-4 w-16 bg-slate-100 rounded" />
                </div>
              ))}
            </div>
          ) : tab === 'synthese' ? (
            <div className="space-y-4">
              {/* Synthèse par compte bancaire */}
              <div className="space-y-2.5">
                <div className="flex items-center justify-between px-0.5">
                  <h2 className="text-[11px] font-black uppercase tracking-wider text-slate-400">
                    Par banque & compte
                  </h2>
                  <span className="text-[11px] font-bold text-slate-400">
                    {byAccount.length} compte{byAccount.length > 1 ? 's' : ''}
                  </span>
                </div>

                {byAccount.length === 0 ? (
                  <div className="bg-white rounded-2xl border border-dashed border-slate-200 py-10 text-center text-xs text-slate-400 font-semibold">
                    Aucun compte enregistré en {HAJJ_CURRENCY_MAP[selectedDevise].label}.
                  </div>
                ) : (
                  <div className="space-y-2.5">
                    {byAccount.map(acc => {
                      const net = acc.recu - acc.emis
                      return (
                        <button
                          key={`${acc.banque}-${acc.nom_compte}`}
                          type="button"
                          onClick={() => {
                            setFilterBanque(acc.banque)
                            setTab('operations')
                          }}
                          className="w-full text-left bg-white rounded-2xl border border-blue-950/15 shadow-[0_3px_10px_-4px_rgba(15,23,42,0.08)] p-3.5 space-y-2.5 active:scale-[0.99] transition cursor-pointer"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex items-center gap-2.5 min-w-0">
                              <div className="w-9 h-9 rounded-xl bg-slate-100 text-slate-700 flex items-center justify-center shrink-0">
                                <Landmark size={16} />
                              </div>
                              <div className="min-w-0">
                                <p className="text-sm font-black text-slate-900 truncate">{acc.banque}</p>
                                <p className="text-xs text-slate-500 font-medium truncate">
                                  {acc.nom_compte}
                                  {acc.numero_compte ? ` • ${acc.numero_compte}` : ''}
                                </p>
                              </div>
                            </div>
                            <span className="text-[10.5px] font-bold text-slate-400 shrink-0">
                              {acc.count} op.
                            </span>
                          </div>

                          <div className="grid grid-cols-3 gap-2 pt-2 border-t border-slate-100 text-xs">
                            <div>
                              <span className="text-[10px] text-slate-400 font-semibold block">Reçus</span>
                              <span className="font-black text-emerald-600 tabular-nums">
                                +{fmt(acc.recu)} {curShort}
                              </span>
                            </div>
                            <div>
                              <span className="text-[10px] text-slate-400 font-semibold block">Émis</span>
                              <span className="font-black text-rose-600 tabular-nums">
                                -{fmt(acc.emis)} {curShort}
                              </span>
                            </div>
                            <div className="text-right">
                              <span className="text-[10px] text-slate-400 font-semibold block">Solde</span>
                              <span className={`font-black tabular-nums ${net >= 0 ? 'text-slate-900' : 'text-rose-700'}`}>
                                {net > 0 ? '+' : ''}
                                {fmt(net)} {curShort}
                              </span>
                            </div>
                          </div>
                        </button>
                      )
                    })}
                  </div>
                )}
              </div>

              {/* Synthèse par motif */}
              {byMotif.length > 0 && (
                <div className="bg-white rounded-2xl border border-blue-950/15 shadow-[0_3px_10px_-4px_rgba(15,23,42,0.08)] p-4 space-y-3">
                  <h2 className="text-xs font-black uppercase tracking-wider text-slate-500">
                    Principaux motifs
                  </h2>
                  <div className="space-y-2.5">
                    {byMotif.slice(0, 8).map(m => {
                      const base = m.sens === 'recu' ? totalRecu : totalEmis
                      const pct = base > 0 ? Math.round((m.total / base) * 100) : 0
                      return (
                        <div key={`${m.sens}-${m.motif}`} className="space-y-1">
                          <div className="flex items-center justify-between gap-2 text-xs">
                            <span className="font-bold text-slate-800 truncate">
                              {m.motif}{' '}
                              <span className="text-slate-400 font-semibold">×{m.count}</span>
                            </span>
                            <span
                              className={`font-black tabular-nums shrink-0 ${m.sens === 'recu' ? 'text-emerald-600' : 'text-rose-600'
                                }`}
                            >
                              {m.sens === 'recu' ? '+' : '-'}
                              {fmt(m.total)} {curShort}
                            </span>
                          </div>
                          <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                            <div
                              className={`h-full rounded-full ${m.sens === 'recu' ? 'bg-emerald-500' : 'bg-rose-500'}`}
                              style={{ width: `${Math.min(100, pct)}%` }}
                            />
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* Bouton relevé récapitulatif PDF */}
              {currencyVirements.length > 0 && (
                <button
                  type="button"
                  onClick={() => setShowPdfSheet(true)}
                  className="w-full h-12 rounded-2xl bg-slate-900 text-white text-xs font-black flex items-center justify-center gap-2 active:scale-[0.98] transition cursor-pointer"
                >
                  <FileText size={15} />
                  <span>Générer un relevé récapitulatif PDF</span>
                </button>
              )}
            </div>
          ) : (
            /* =================== ONGLET OPÉRATIONS MOBILE =================== */
            <div className="space-y-3.5">
              {/* Recherche + Filtres */}
              <div className="flex items-center gap-2">
                <div className="relative flex-1 min-w-0">
                  <Search
                    size={16}
                    className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"
                  />
                  <input
                    type="text"
                    placeholder="Banque, compte, motif, réf…"
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    className="w-full h-11 pl-10 pr-9 bg-white border border-slate-200/90 rounded-2xl text-sm font-semibold text-slate-800 placeholder:text-slate-400 outline-none focus:border-blue-600 transition"
                  />
                  {search && (
                    <button
                      type="button"
                      onClick={() => setSearch('')}
                      aria-label="Effacer"
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full bg-slate-100 text-slate-500 flex items-center justify-center"
                    >
                      <X size={13} />
                    </button>
                  )}
                </div>

                <button
                  type="button"
                  onClick={() => setShowFilters(true)}
                  aria-label="Filtrer et trier"
                  className={`relative w-11 h-11 shrink-0 rounded-2xl border flex items-center justify-center active:scale-95 transition cursor-pointer ${activeFilterCount > 0
                      ? 'bg-slate-900 text-white border-slate-900'
                      : 'bg-white text-slate-700 border-slate-200/90'
                    }`}
                >
                  <SlidersHorizontal size={17} />
                  {activeFilterCount > 0 && (
                    <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-blue-600 text-white text-[10px] font-black flex items-center justify-center">
                      {activeFilterCount}
                    </span>
                  )}
                </button>
              </div>

              {/* Quick pills Sens : Tous | Émis | Reçus */}
              <div className="flex items-center justify-between gap-2 px-0.5">
                <div className="flex items-center gap-1.5">
                  {([
                    ['all', 'Tous'],
                    ['emis', 'Émis'],
                    ['recu', 'Reçus'],
                  ] as const).map(([id, label]) => (
                    <button
                      key={id}
                      type="button"
                      onClick={() => setFilterSens(id)}
                      className={`h-7 px-3 rounded-full text-[11px] font-bold transition cursor-pointer ${filterSens === id
                          ? 'bg-slate-900 text-white'
                          : 'text-slate-500 active:bg-slate-200/70'
                        }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>

                <span className="text-[11px] font-bold text-slate-400 tabular-nums">
                  {filteredRows.length} op.
                </span>
              </div>

              {/* Chips filtres avancés actifs */}
              {(filterStatut !== 'all' || filterBanque !== 'all' || filterRecu !== 'all') && (
                <div className="-mx-5 px-5 flex items-center gap-1.5 overflow-x-auto no-scrollbar">
                  {filterBanque !== 'all' && (
                    <button
                      type="button"
                      onClick={() => setFilterBanque('all')}
                      className="h-7 px-2.5 rounded-full bg-blue-50 text-blue-700 border border-blue-100 text-[11px] font-bold whitespace-nowrap shrink-0 flex items-center gap-1 cursor-pointer"
                    >
                      <span>{filterBanque}</span>
                      <X size={11} />
                    </button>
                  )}
                  {filterStatut !== 'all' && (
                    <button
                      type="button"
                      onClick={() => setFilterStatut('all')}
                      className="h-7 px-2.5 rounded-full bg-blue-50 text-blue-700 border border-blue-100 text-[11px] font-bold whitespace-nowrap shrink-0 flex items-center gap-1 cursor-pointer"
                    >
                      <span>{STATUT_META[filterStatut].label}</span>
                      <X size={11} />
                    </button>
                  )}
                  {filterRecu !== 'all' && (
                    <button
                      type="button"
                      onClick={() => setFilterRecu('all')}
                      className="h-7 px-2.5 rounded-full bg-blue-50 text-blue-700 border border-blue-100 text-[11px] font-bold whitespace-nowrap shrink-0 flex items-center gap-1 cursor-pointer"
                    >
                      <span>{filterRecu === 'avec' ? 'Avec reçu' : 'Sans reçu'}</span>
                      <X size={11} />
                    </button>
                  )}
                </div>
              )}

              {/* Liste groupée par date */}
              {filteredRows.length === 0 ? (
                <div className="bg-white rounded-3xl border border-dashed border-slate-200 py-14 px-6 text-center space-y-3">
                  <div className="w-12 h-12 rounded-2xl bg-slate-100 text-slate-400 flex items-center justify-center mx-auto">
                    <Landmark size={22} />
                  </div>
                  <p className="text-sm font-black text-slate-800">
                    {currencyVirements.length === 0
                      ? `Aucun virement en ${HAJJ_CURRENCY_MAP[selectedDevise].label}`
                      : 'Aucun virement trouvé'}
                  </p>
                  <p className="text-xs text-slate-400 font-medium">
                    {currencyVirements.length === 0
                      ? 'Enregistrez vos virements émis ou reçus avec le scan du bordereau bancaire.'
                      : 'Ajustez votre recherche ou réinitialisez les filtres.'}
                  </p>
                  {currencyVirements.length === 0 && (
                    <div className="flex items-center justify-center gap-2 pt-1">
                      <button
                        type="button"
                        onClick={() => openNew('emis')}
                        className="h-10 px-4 rounded-xl bg-slate-900 text-white text-xs font-black active:scale-95 transition cursor-pointer"
                      >
                        + Virement émis
                      </button>
                      <button
                        type="button"
                        onClick={() => openNew('recu')}
                        className="h-10 px-4 rounded-xl bg-emerald-600 text-white text-xs font-black active:scale-95 transition cursor-pointer"
                      >
                        + Virement reçu
                      </button>
                    </div>
                  )}
                </div>
              ) : (
                <div className="space-y-4">
                  {groupedByDate.map(group => (
                    <div key={group.label} className="space-y-2">
                      <div className="flex items-center justify-between px-1">
                        <span className="text-[11px] font-black uppercase tracking-wider text-slate-400">
                          {group.label}
                        </span>
                        <span
                          className={`text-[11px] font-bold tabular-nums ${group.net >= 0 ? 'text-emerald-600' : 'text-slate-400'
                            }`}
                        >
                          {group.net > 0 ? '+' : ''}
                          {fmt(group.net)} {curShort}
                        </span>
                      </div>

                      <div className="space-y-2">
                        {group.rows.map(v => {
                          const isRecu = v.sens === 'recu'
                          const cancelled = v.statut === 'annule'
                          return (
                            <button
                              key={v.id}
                              type="button"
                              onClick={() => setDetailId(v.id)}
                              className={`w-full bg-white rounded-2xl border border-blue-950/15 shadow-[0_3px_10px_-4px_rgba(15,23,42,0.09),0_1px_2px_rgba(15,23,42,0.05)] px-3.5 py-3 flex items-center gap-3 text-left active:scale-[0.99] transition cursor-pointer ${cancelled ? 'opacity-60' : ''
                                }`}
                            >
                              <div
                                className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${isRecu
                                    ? 'bg-emerald-50 text-emerald-600'
                                    : 'bg-rose-50 text-rose-600'
                                  }`}
                              >
                                {isRecu ? <ArrowDownLeft size={18} /> : <ArrowUpRight size={18} />}
                              </div>

                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-1.5">
                                  <p className="font-black text-slate-900 text-[14px] leading-snug truncate">
                                    {v.banque} • {v.nom_compte}
                                  </p>
                                </div>
                                <p className="text-xs text-slate-500 font-medium truncate mt-0.5">
                                  {v.motif}
                                  {v.contrepartie ? ` • ${v.contrepartie}` : ''}
                                </p>
                                <div className="flex items-center gap-2 mt-0.5 text-[10.5px] font-bold">
                                  <span className={STATUT_META[v.statut].textClass}>
                                    {STATUT_META[v.statut].label}
                                  </span>
                                  {v.recu_url && (
                                    <span className="text-blue-600 inline-flex items-center gap-0.5">
                                      • <FileImage size={11} /> Reçu
                                    </span>
                                  )}
                                  {v.reference_bancaire && (
                                    <span className="text-slate-400 font-mono truncate">
                                      • {v.reference_bancaire}
                                    </span>
                                  )}
                                </div>
                              </div>

                              <div className="flex items-center gap-1 shrink-0">
                                <div className="text-right">
                                  <p
                                    className={`text-[14px] font-black tabular-nums ${cancelled
                                        ? 'line-through text-slate-400'
                                        : isRecu
                                          ? 'text-emerald-600'
                                          : 'text-rose-600'
                                      }`}
                                  >
                                    {isRecu ? '+' : '-'}
                                    {fmt(v.montant)}
                                  </p>
                                  <p className="text-[10px] font-bold text-slate-400">{curShort}</p>
                                </div>
                                <ChevronRight size={15} className="text-slate-300" />
                              </div>
                            </button>
                          )
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* =================================================================== */}
      {/* 💻 VERSION PC / TABLETTE (`hidden md:block`)                        */}
      {/* =================================================================== */}
      <div className="hidden md:block w-full min-w-0 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 lg:py-8 pb-24 text-slate-800">
        {/* Header PC */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-5">
          <div className="min-w-0">
            <h1 className="text-2xl lg:text-3xl font-black text-slate-900 tracking-tight flex items-center gap-2.5 flex-wrap">
              <span>Virements Bancaires</span>
              <span className={`text-xs px-2.5 py-1 rounded-xl border font-black uppercase ${HAJJ_CURRENCY_MAP[selectedDevise].badgeClass}`}>
                {HAJJ_CURRENCY_MAP[selectedDevise].label}
              </span>
            </h1>
            <p className="text-xs lg:text-sm text-slate-500 font-medium mt-0.5">
              Suivi dédié des virements émis et reçus avec justificatifs — indépendant des écritures de comptabilité.
            </p>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <YearSelector />
            <button
              type="button"
              onClick={() => setShowPdfSheet(true)}
              disabled={currencyVirements.length === 0}
              className="inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-black shadow-xs transition disabled:opacity-40 cursor-pointer"
            >
              <FileText size={15} className="text-blue-600" />
              <span>Relevé PDF</span>
            </button>
            <button
              type="button"
              onClick={() => openNew('emis')}
              className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 active:scale-95 text-white text-xs font-black shadow-sm transition cursor-pointer"
            >
              <Plus size={16} />
              <span>Nouveau virement ({curSymbol})</span>
            </button>
          </div>
        </div>

        {tableMissing && (
          <div className="mb-5 rounded-2xl bg-amber-50 border border-amber-200 p-4 text-xs text-amber-900 font-bold">
            Exécutez <code className="font-mono">supabase/virements_bancaires.sql</code> dans Supabase → SQL Editor pour activer la table <code className="font-mono">virements_bancaires</code>.
          </div>
        )}

        {/* Sélecteur de devise PC */}
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <HajjCurrencyTabs
            value={selectedDevise}
            onChange={handleSelectDevise}
            counts={deviseCounts}
          />
          <span className="text-xs font-bold text-slate-400">
            {currencyVirements.length} opération(s) en {HAJJ_CURRENCY_MAP[selectedDevise].label}
          </span>
        </div>

        {/* 4 Cartes KPI PC */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5 mb-6">
          <div className="bg-[#1E3A5F] p-4 rounded-2xl text-white shadow-xs flex flex-col justify-between">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[10px] font-black uppercase tracking-wider text-white/70">Solde Net Virements</span>
              <div className="p-1.5 bg-white/15 rounded-xl"><Landmark size={16} /></div>
            </div>
            <div>
              <h3 className="text-xl font-black tabular-nums">
                {soldeNet > 0 ? '+' : ''}
                {fmt(soldeNet)} <span className="text-xs font-bold text-white/70">{curShort}</span>
              </h3>
              <p className="text-[10px] text-white/70 font-medium mt-0.5">Reçus moins émis (hors annulés)</p>
            </div>
          </div>

          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex flex-col justify-between">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">Virements Reçus</span>
              <div className="p-1.5 bg-emerald-50 text-emerald-600 rounded-xl"><ArrowDownLeft size={16} /></div>
            </div>
            <div>
              <h3 className="text-xl font-black text-emerald-700 tabular-nums">
                +{fmt(totalRecu)} <span className="text-xs font-bold text-slate-400">{curShort}</span>
              </h3>
              <p className="text-[10px] text-slate-400 font-medium mt-0.5">{nbRecus} virement(s) entrant(s)</p>
            </div>
          </div>

          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex flex-col justify-between">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">Virements Émis</span>
              <div className="p-1.5 bg-rose-50 text-rose-600 rounded-xl"><ArrowUpRight size={16} /></div>
            </div>
            <div>
              <h3 className="text-xl font-black text-rose-600 tabular-nums">
                -{fmt(totalEmis)} <span className="text-xs font-bold text-slate-400">{curShort}</span>
              </h3>
              <p className="text-[10px] text-slate-400 font-medium mt-0.5">{nbEmis} virement(s) sortant(s)</p>
            </div>
          </div>

          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex flex-col justify-between">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">Justificatifs & Suivi</span>
              <div className="p-1.5 bg-blue-50 text-blue-600 rounded-xl"><FileImage size={16} /></div>
            </div>
            <div>
              <h3 className="text-xl font-black text-slate-900 tabular-nums">
                {nbAvecRecu} <span className="text-xs font-bold text-slate-400">/ {currencyVirements.length} reçus</span>
              </h3>
              <p className="text-[10px] text-amber-600 font-bold mt-0.5">
                {nbEnAttente} en attente • {byAccount.length} compte(s)
              </p>
            </div>
          </div>
        </div>

        {/* Onglets PC */}
        <div className="grid grid-cols-2 gap-1.5 p-1.5 bg-slate-200/80 rounded-2xl mb-5 max-w-md">
          <button
            type="button"
            onClick={() => setTab('operations')}
            className={`py-2.5 px-3 rounded-xl text-xs font-black flex items-center justify-center gap-1.5 transition cursor-pointer ${tab === 'operations' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
          >
            <Receipt size={15} className={tab === 'operations' ? 'text-blue-600' : 'text-slate-500'} />
            <span>Journal des virements</span>
            <span className={`text-[10px] px-1.5 rounded-md ${tab === 'operations' ? 'bg-blue-600 text-white' : 'bg-slate-300 text-slate-700'}`}>
              {currencyVirements.length}
            </span>
          </button>
          <button
            type="button"
            onClick={() => setTab('synthese')}
            className={`py-2.5 px-3 rounded-xl text-xs font-black flex items-center justify-center gap-1.5 transition cursor-pointer ${tab === 'synthese' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
          >
            <LayoutDashboard size={15} className={tab === 'synthese' ? 'text-blue-600' : 'text-slate-500'} />
            <span>Par compte & motifs</span>
          </button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-24">
            <Loader2 size={28} className="animate-spin text-blue-600" />
          </div>
        ) : tab === 'synthese' ? (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Par compte bancaire */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-5 space-y-4">
              <h2 className="text-xs font-black uppercase tracking-wider text-slate-500">
                Soldes par banque & compte ({byAccount.length})
              </h2>
              {byAccount.length === 0 ? (
                <p className="text-xs text-slate-400 font-semibold py-8 text-center">Aucune donnée.</p>
              ) : (
                <div className="space-y-3">
                  {byAccount.map(acc => {
                    const net = acc.recu - acc.emis
                    return (
                      <div
                        key={`${acc.banque}-${acc.nom_compte}`}
                        className="p-4 rounded-xl bg-slate-50 border border-slate-200/80 space-y-2.5"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div>
                            <p className="font-black text-slate-900 text-sm">{acc.banque} — {acc.nom_compte}</p>
                            {acc.numero_compte && (
                              <p className="text-[11px] font-mono text-slate-400">{acc.numero_compte}</p>
                            )}
                          </div>
                          <button
                            type="button"
                            onClick={() => {
                              setFilterBanque(acc.banque)
                              setTab('operations')
                            }}
                            className="text-xs font-black text-blue-600 hover:underline cursor-pointer"
                          >
                            Voir ({acc.count}) →
                          </button>
                        </div>
                        <div className="grid grid-cols-3 gap-2 pt-2 border-t border-slate-200/70 text-xs">
                          <div>
                            <span className="text-[10px] text-slate-400 block font-semibold">Reçus</span>
                            <span className="font-black text-emerald-700 tabular-nums">+{fmt(acc.recu)} {curShort}</span>
                          </div>
                          <div>
                            <span className="text-[10px] text-slate-400 block font-semibold">Émis</span>
                            <span className="font-black text-rose-600 tabular-nums">-{fmt(acc.emis)} {curShort}</span>
                          </div>
                          <div className="text-right">
                            <span className="text-[10px] text-slate-400 block font-semibold">Solde net</span>
                            <span className={`font-black tabular-nums ${net >= 0 ? 'text-slate-900' : 'text-rose-700'}`}>
                              {net > 0 ? '+' : ''}{fmt(net)} {curShort}
                            </span>
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

            {/* Par motif */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-5 space-y-4">
              <h2 className="text-xs font-black uppercase tracking-wider text-slate-500">
                Répartition par motif
              </h2>
              {byMotif.length === 0 ? (
                <p className="text-xs text-slate-400 font-semibold py-8 text-center">Aucune donnée.</p>
              ) : (
                <div className="space-y-3">
                  {byMotif.map(m => {
                    const base = m.sens === 'recu' ? totalRecu : totalEmis
                    const pct = base > 0 ? Math.round((m.total / base) * 100) : 0
                    return (
                      <div key={`${m.sens}-${m.motif}`} className="space-y-1">
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-bold text-slate-800">
                            {m.motif} <span className="text-slate-400">×{m.count}</span>
                          </span>
                          <span className={`font-black tabular-nums ${m.sens === 'recu' ? 'text-emerald-700' : 'text-rose-600'}`}>
                            {m.sens === 'recu' ? '+' : '-'}{fmt(m.total)} {curShort} • {pct}%
                          </span>
                        </div>
                        <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full ${m.sens === 'recu' ? 'bg-emerald-500' : 'bg-rose-500'}`}
                            style={{ width: `${Math.min(100, pct)}%` }}
                          />
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
        ) : (
          <>
            {/* Barre d'outils PC */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-4 mb-4 space-y-3">
              <div className="flex items-center gap-2.5">
                <div className="relative flex-1 min-w-0">
                  <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Rechercher banque, compte, contrepartie, motif, référence…"
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    className="w-full pl-10 pr-8 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-semibold outline-none focus:border-blue-600"
                  />
                  {search && (
                    <button
                      type="button"
                      onClick={() => setSearch('')}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-slate-400 cursor-pointer"
                    >
                      <X size={14} />
                    </button>
                  )}
                </div>

                <select
                  value={sortKey}
                  onChange={e => setSortKey(e.target.value)}
                  className="px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold outline-none focus:border-blue-600 cursor-pointer"
                >
                  {SORT_OPTIONS.map(o => (
                    <option key={o.id} value={o.id}>{o.label}</option>
                  ))}
                </select>

                <button
                  type="button"
                  onClick={exportCsv}
                  disabled={filteredRows.length === 0}
                  className="px-3.5 py-2.5 rounded-xl bg-slate-50 border border-slate-200 hover:bg-slate-100 text-slate-700 text-xs font-black flex items-center gap-1.5 disabled:opacity-40 cursor-pointer"
                >
                  <Download size={14} /> CSV
                </button>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {([
                  ['all', 'Tous sens'],
                  ['emis', 'Virements émis'],
                  ['recu', 'Virements reçus'],
                ] as const).map(([id, label]) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setFilterSens(id)}
                    className={`px-3 py-1.5 rounded-full text-[11px] font-bold border transition cursor-pointer ${filterSens === id
                        ? 'bg-slate-900 text-white border-slate-900'
                        : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                      }`}
                  >
                    {label}
                  </button>
                ))}

                <span className="text-slate-200">|</span>

                {([
                  ['all', 'Tous statuts'],
                  ['execute', 'Exécutés'],
                  ['en_attente', 'En attente'],
                  ['annule', 'Annulés'],
                ] as const).map(([id, label]) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setFilterStatut(id)}
                    className={`px-3 py-1.5 rounded-full text-[11px] font-bold border transition cursor-pointer ${filterStatut === id
                        ? 'bg-blue-600 text-white border-blue-600'
                        : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                      }`}
                  >
                    {label}
                  </button>
                ))}

                <span className="text-slate-200">|</span>

                {([
                  ['all', 'Tous justificatifs'],
                  ['avec', 'Avec reçu scanné'],
                  ['sans', 'Sans reçu'],
                ] as const).map(([id, label]) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setFilterRecu(id)}
                    className={`px-3 py-1.5 rounded-full text-[11px] font-bold border transition cursor-pointer ${filterRecu === id
                        ? 'bg-slate-800 text-white border-slate-800'
                        : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                      }`}
                  >
                    {label}
                  </button>
                ))}

                {uniqueBanques.length > 1 && (
                  <select
                    value={filterBanque}
                    onChange={e => setFilterBanque(e.target.value)}
                    className="px-3 py-1.5 rounded-full text-[11px] font-bold border border-slate-200 bg-white text-slate-700 outline-none cursor-pointer"
                  >
                    <option value="all">Toutes les banques</option>
                    {uniqueBanques.map(b => (
                      <option key={b} value={b}>{b}</option>
                    ))}
                  </select>
                )}

                {activeFilterCount > 0 && (
                  <button
                    type="button"
                    onClick={resetFilters}
                    className="text-xs font-black text-rose-600 hover:underline ml-auto cursor-pointer"
                  >
                    Réinitialiser
                  </button>
                )}
              </div>
            </div>

            {/* Liste PC */}
            {filteredRows.length === 0 ? (
              <div className="bg-white rounded-2xl border-2 border-dashed border-slate-200 py-14 text-center space-y-2">
                <p className="text-sm font-black text-slate-700">Aucun virement trouvé</p>
                <p className="text-xs text-slate-400">
                  Enregistrez vos virements bancaires émis ou reçus pour garder un suivi clair avec les scans des reçus.
                </p>
              </div>
            ) : (
              <div className="space-y-2.5">
                {filteredRows.map(v => {
                  const open = expandedId === v.id
                  const isRecu = v.sens === 'recu'
                  const receiptPublic = getVirementReceiptPublicUrl(v.recu_url)
                  const receiptIsPdf = isPdfReceipt(v.recu_url)
                  return (
                    <div key={v.id} className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
                      <button
                        type="button"
                        onClick={() => setExpandedId(open ? null : v.id)}
                        className="w-full p-4 text-left flex items-center gap-3.5 hover:bg-slate-50/70 transition cursor-pointer"
                      >
                        <div
                          className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${isRecu ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'
                            }`}
                        >
                          {isRecu ? <ArrowDownLeft size={18} /> : <ArrowUpRight size={18} />}
                        </div>

                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="font-black text-slate-900 text-sm">
                              {v.banque} — {v.nom_compte}
                            </p>
                            <span className={`text-[10px] font-black px-2 py-0.5 rounded-md border ${STATUT_META[v.statut].badgeClass}`}>
                              {STATUT_META[v.statut].label}
                            </span>
                            {v.recu_url && (
                              <span className="text-[10px] font-black px-2 py-0.5 rounded-md bg-blue-50 text-blue-700 border border-blue-200 inline-flex items-center gap-1">
                                <FileImage size={10} /> Reçu scanné
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-slate-600 font-semibold mt-0.5">
                            {v.motif}
                            {v.contrepartie ? ` • ${isRecu ? 'De' : 'Vers'} : ${v.contrepartie}` : ''}
                          </p>
                          <p className="text-[11px] text-slate-400 mt-0.5 flex items-center gap-2 flex-wrap">
                            <span>{new Date(`${v.date_virement}T12:00:00`).toLocaleDateString('fr-FR')}</span>
                            {v.numero_compte && <span className="font-mono">• Cpt: {v.numero_compte}</span>}
                            {v.reference_bancaire && <span className="font-mono">• Réf: {v.reference_bancaire}</span>}
                            {v.recorded_by_name && (
                              <span className="inline-flex items-center gap-1 text-slate-500">
                                • Par <strong className="text-slate-700">{v.recorded_by_name}</strong>
                                {formatProfileRoleLabel(v.recorded_by_role) && (
                                  <span className={`px-1.5 rounded border text-[9px] font-black uppercase ${getProfileRoleBadgeClass(v.recorded_by_role)}`}>
                                    {formatProfileRoleLabel(v.recorded_by_role)}
                                  </span>
                                )}
                              </span>
                            )}
                          </p>
                        </div>

                        <div className="text-right shrink-0 flex items-center gap-3">
                          <div>
                            <p
                              className={`text-base font-black tabular-nums ${v.statut === 'annule'
                                  ? 'line-through text-slate-400'
                                  : isRecu
                                    ? 'text-emerald-600'
                                    : 'text-rose-600'
                                }`}
                            >
                              {isRecu ? '+' : '-'}{fmt(v.montant)} {curShort}
                            </p>
                            <p className="text-[10px] font-bold text-slate-400">
                              {isRecu ? 'Virement reçu' : 'Virement émis'}
                            </p>
                          </div>
                          <ChevronDown size={16} className={`text-slate-300 transition-transform ${open ? 'rotate-180' : ''}`} />
                        </div>
                      </button>

                      {open && (
                        <div className="border-t border-slate-100 bg-slate-50/70 p-4 space-y-4">
                          {v.notes && (
                            <p className="text-xs text-slate-600 bg-white border border-slate-200 rounded-xl p-3 font-medium">
                              <strong>Notes :</strong> {v.notes}
                            </p>
                          )}

                          {receiptPublic && (
                            <div className="bg-white border border-slate-200 rounded-xl p-3 flex items-center justify-between gap-3">
                              <div className="flex items-center gap-3 min-w-0">
                                {!receiptIsPdf ? (
                                  <img
                                    src={receiptPublic}
                                    alt="Scan du reçu"
                                    onClick={() => setLightboxUrl(receiptPublic)}
                                    className="w-16 h-16 rounded-lg object-cover border border-slate-200 cursor-zoom-in shrink-0"
                                  />
                                ) : (
                                  <div className="w-12 h-12 rounded-lg bg-rose-50 text-rose-600 flex items-center justify-center shrink-0">
                                    <FileText size={20} />
                                  </div>
                                )}
                                <div className="min-w-0">
                                  <p className="text-xs font-black text-slate-900">Justificatif / Scan du reçu</p>
                                  <p className="text-[11px] text-slate-400 truncate">
                                    {receiptIsPdf ? 'Document PDF joint' : 'Cliquez sur l’image pour agrandir'}
                                  </p>
                                </div>
                              </div>
                              <div className="flex items-center gap-2 shrink-0">
                                {!receiptIsPdf && (
                                  <button
                                    type="button"
                                    onClick={() => setLightboxUrl(receiptPublic)}
                                    className="px-3 py-1.5 rounded-lg bg-slate-900 text-white text-xs font-bold cursor-pointer"
                                  >
                                    Agrandir
                                  </button>
                                )}
                                <a
                                  href={receiptPublic}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold inline-flex items-center gap-1"
                                >
                                  <ExternalLink size={12} /> Ouvrir
                                </a>
                              </div>
                            </div>
                          )}

                          <div className="flex flex-wrap items-center gap-2">
                            {v.statut === 'en_attente' && (
                              <button
                                type="button"
                                onClick={() => handleQuickStatut(v, 'execute')}
                                className="h-9 px-3.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black inline-flex items-center gap-1.5 cursor-pointer"
                              >
                                <Check size={14} /> Marquer exécuté
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => generateSingleVirementPdf({ v, agenceName })}
                              className="h-9 px-3.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-black inline-flex items-center gap-1.5 cursor-pointer"
                            >
                              <FileText size={13} /> Fiche PDF
                            </button>
                            <button
                              type="button"
                              onClick={() => openEdit(v)}
                              className="h-9 px-3.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-black inline-flex items-center gap-1.5 cursor-pointer"
                            >
                              <Pencil size={13} /> Modifier
                            </button>
                            <button
                              type="button"
                              onClick={() => openEdit(v, true)}
                              className="h-9 px-3.5 rounded-xl bg-white border border-slate-200 hover:bg-slate-100 text-slate-700 text-xs font-black inline-flex items-center gap-1.5 cursor-pointer"
                            >
                              <Copy size={13} /> Dupliquer
                            </button>
                            <button
                              type="button"
                              onClick={() => setDeleteConfirmId(v.id)}
                              className="h-9 px-3.5 rounded-xl bg-white border border-rose-200 hover:bg-rose-50 text-rose-600 text-xs font-black inline-flex items-center gap-1.5 cursor-pointer ml-auto"
                            >
                              <Trash2 size={13} /> Supprimer
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </>
        )}
      </div>

      {/* =================================================================== */}
      {/* 📱 ASSISTANT PLEIN ÉCRAN MOBILE (3 ÉTAPES)                          */}
      {/* =================================================================== */}
      {showForm && isMobile && (
        <div className="fixed inset-0 z-[9998] bg-[#F8FAFC] flex flex-col animate-in slide-in-from-bottom duration-200">
          <div className="bg-white border-b border-slate-200/80 px-4 pt-[max(0.85rem,env(safe-area-inset-top))] pb-3 shrink-0 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => {
                  if (mobileStep > 1) setMobileStep((mobileStep - 1) as 1 | 2 | 3)
                  else closeForm()
                }}
                aria-label="Retour"
                className="w-9 h-9 rounded-full bg-slate-100 text-slate-700 flex items-center justify-center active:scale-90 transition cursor-pointer"
              >
                <ArrowLeft size={18} />
              </button>

              <div className="text-center min-w-0">
                <p className="text-sm font-black text-slate-900 truncate">
                  {editingId ? 'Modifier le virement' : 'Nouveau virement'}
                </p>
                <p className="text-[11px] font-bold text-slate-400">
                  {HAJJ_CURRENCY_MAP[selectedDevise].label} • Étape {mobileStep} / 3
                </p>
              </div>

              <button
                type="button"
                onClick={closeForm}
                aria-label="Fermer"
                className="w-9 h-9 rounded-full bg-slate-100 text-slate-500 flex items-center justify-center active:scale-90 transition cursor-pointer"
              >
                <X size={17} />
              </button>
            </div>

            <div className="grid grid-cols-3 gap-1.5">
              {([
                [1, '1. Compte'],
                [2, '2. Montant'],
                [3, '3. Reçu'],
              ] as const).map(([n, lbl]) => {
                const active = mobileStep === n
                const done = mobileStep > n
                const canJump = n === 1 || (n === 2 && step1Valid) || (n === 3 && step1Valid && step2Valid)
                return (
                  <button
                    key={n}
                    type="button"
                    disabled={!canJump}
                    onClick={() => canJump && setMobileStep(n)}
                    className="text-left space-y-1 disabled:opacity-45 cursor-pointer"
                  >
                    <div className={`h-1 rounded-full ${active ? 'bg-blue-600' : done ? 'bg-slate-900' : 'bg-slate-200'}`} />
                    <span className={`block text-[10.5px] font-bold ${active ? 'text-blue-600' : done ? 'text-slate-800' : 'text-slate-400'}`}>
                      {lbl}
                    </span>
                  </button>
                )
              })}
            </div>
          </div>

          <div className="flex-1 overflow-y-auto overscroll-contain px-5 py-5 space-y-4">
            {mobileStep === 1 && (
              <>
                <div className="space-y-1">
                  <h2 className="text-xl font-black text-slate-900 tracking-tight">Sens & compte bancaire</h2>
                  <p className="text-xs text-slate-500 font-medium">
                    Indiquez si l’entreprise a effectué ou reçu ce virement.
                  </p>
                </div>

                {/* Sens du virement */}
                <div className="grid grid-cols-2 gap-2.5">
                  <button
                    type="button"
                    onClick={() => {
                      setSens('emis')
                      if (MOTIFS_RECUS.includes(motifChoice)) setMotifChoice(MOTIFS_EMIS[0])
                    }}
                    className={`p-3.5 rounded-2xl border text-left space-y-1.5 transition cursor-pointer ${sens === 'emis'
                        ? 'bg-slate-900 text-white border-slate-900 shadow-sm'
                        : 'bg-white text-slate-700 border-blue-950/15'
                      }`}
                  >
                    <ArrowUpRight size={18} className={sens === 'emis' ? 'text-rose-400' : 'text-rose-500'} />
                    <p className="text-xs font-black">Virement émis</p>
                    <p className={`text-[10.5px] ${sens === 'emis' ? 'text-slate-300' : 'text-slate-400'}`}>
                      Effectué par l’entreprise
                    </p>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setSens('recu')
                      if (MOTIFS_EMIS.includes(motifChoice)) setMotifChoice(MOTIFS_RECUS[0])
                    }}
                    className={`p-3.5 rounded-2xl border text-left space-y-1.5 transition cursor-pointer ${sens === 'recu'
                        ? 'bg-emerald-600 text-white border-emerald-600 shadow-sm'
                        : 'bg-white text-slate-700 border-blue-950/15'
                      }`}
                  >
                    <ArrowDownLeft size={18} className={sens === 'recu' ? 'text-white' : 'text-emerald-600'} />
                    <p className="text-xs font-black">Virement reçu</p>
                    <p className={`text-[10.5px] ${sens === 'recu' ? 'text-emerald-100' : 'text-slate-400'}`}>
                      Reçu sur notre compte
                    </p>
                  </button>
                </div>

                {/* Comptes récents réutilisables en 1 tap */}
                {knownAccounts.length > 0 && (
                  <div className="space-y-1.5">
                    <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">
                      Comptes déjà utilisés
                    </p>
                    <div className="-mx-5 px-5 flex gap-2 overflow-x-auto no-scrollbar">
                      {knownAccounts.map((acc, i) => (
                        <button
                          key={i}
                          type="button"
                          onClick={() => {
                            setBanque(acc.banque)
                            setNomCompte(acc.nom_compte)
                            setNumeroCompte(acc.numero_compte)
                          }}
                          className="px-3 py-1.5 rounded-full bg-white border border-blue-950/15 text-[11px] font-bold text-slate-700 whitespace-nowrap shrink-0 active:scale-95 transition cursor-pointer"
                        >
                          {acc.banque} • {acc.nom_compte}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Banque */}
                <div className="space-y-2">
                  <label className="text-[10.5px] font-black uppercase tracking-wider text-slate-400 block">
                    Banque *
                  </label>
                  <input
                    type="text"
                    value={banque}
                    onChange={e => setBanque(e.target.value)}
                    placeholder="Ex : BDM-SA, Coris Bank, Al Rajhi…"
                    className="w-full h-12 px-4 rounded-2xl bg-white border border-slate-300 text-sm font-bold text-slate-900 outline-none focus:border-blue-600"
                  />
                  <div className="-mx-5 px-5 flex gap-1.5 overflow-x-auto no-scrollbar">
                    {BANQUES_SUGGESTIONS.map(b => (
                      <button
                        key={b}
                        type="button"
                        onClick={() => setBanque(b)}
                        className={`h-7 px-2.5 rounded-full text-[11px] font-bold whitespace-nowrap shrink-0 border transition cursor-pointer ${banque === b
                            ? 'bg-blue-600 text-white border-blue-600'
                            : 'bg-white text-slate-600 border-slate-200'
                          }`}
                      >
                        {b}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Nom du compte */}
                <div>
                  <label className="text-[10.5px] font-black uppercase tracking-wider text-slate-400 block mb-1.5">
                    Nom du compte / Titulaire *
                  </label>
                  <input
                    type="text"
                    value={nomCompte}
                    onChange={e => setNomCompte(e.target.value)}
                    placeholder={sens === 'recu' ? 'Ex : Compte principal Agence' : 'Ex : Compte Compagnie / Hôtel'}
                    className="w-full h-12 px-4 rounded-2xl bg-white border border-slate-300 text-sm font-bold text-slate-900 outline-none focus:border-blue-600"
                  />
                </div>

                {/* Numéro de compte + Contrepartie */}
                <div className="grid grid-cols-1 gap-3">
                  <div>
                    <label className="text-[10.5px] font-black uppercase tracking-wider text-slate-400 block mb-1.5">
                      N° de compte / IBAN (optionnel)
                    </label>
                    <input
                      type="text"
                      value={numeroCompte}
                      onChange={e => setNumeroCompte(e.target.value)}
                      placeholder="Ex : ML01 2345 6789…"
                      className="w-full h-11 px-4 rounded-2xl bg-white border border-slate-200 text-sm font-mono font-semibold text-slate-900 outline-none focus:border-blue-600"
                    />
                  </div>
                  <div>
                    <label className="text-[10.5px] font-black uppercase tracking-wider text-slate-400 block mb-1.5">
                      {sens === 'recu' ? 'Émetteur du virement (optionnel)' : 'Bénéficiaire (optionnel)'}
                    </label>
                    <input
                      type="text"
                      value={contrepartie}
                      onChange={e => setContrepartie(e.target.value)}
                      placeholder={sens === 'recu' ? 'Nom de la personne ou agence' : 'Nom du fournisseur / bénéficiaire'}
                      className="w-full h-11 px-4 rounded-2xl bg-white border border-slate-200 text-sm font-semibold text-slate-900 outline-none focus:border-blue-600"
                    />
                  </div>
                </div>
              </>
            )}

            {mobileStep === 2 && (
              <>
                {/* Saisie montant géante style Revolut */}
                <div className="bg-white rounded-3xl border border-blue-950/15 shadow-xs p-5 text-center space-y-2">
                  <p className="text-[10.5px] font-black uppercase tracking-wider text-slate-400">
                    Montant du virement {sens === 'recu' ? 'reçu' : 'émis'}
                  </p>
                  <div className="flex items-baseline justify-center gap-2">
                    <input
                      type="text"
                      inputMode="numeric"
                      autoFocus
                      value={montantSaisi}
                      onChange={e => setMontantSaisi(formatAmount(e.target.value))}
                      placeholder="0"
                      className={`w-full max-w-[230px] text-center bg-transparent font-black text-4xl tabular-nums outline-none placeholder:text-slate-200 ${sens === 'recu' ? 'text-emerald-600' : 'text-slate-900'
                        }`}
                    />
                    <span className="text-base font-black text-slate-400 shrink-0">{curShort}</span>
                  </div>
                </div>

                {/* Raison / Motif */}
                <div className="space-y-2">
                  <label className="text-[10.5px] font-black uppercase tracking-wider text-slate-400 block">
                    Raison du virement *
                  </label>
                  <div className="flex flex-wrap gap-1.5">
                    {currentMotifSuggestions.map(m => (
                      <button
                        key={m}
                        type="button"
                        onClick={() => {
                          setMotifChoice(m)
                          setCustomMotif('')
                        }}
                        className={`h-9 px-3 rounded-xl text-xs font-bold border transition cursor-pointer ${motifChoice === m
                            ? 'bg-slate-900 text-white border-slate-900'
                            : 'bg-white text-slate-700 border-blue-950/15'
                          }`}
                      >
                        {m}
                      </button>
                    ))}
                    <button
                      type="button"
                      onClick={() => setMotifChoice('Autre')}
                      className={`h-9 px-3 rounded-xl text-xs font-bold border flex items-center gap-1 transition cursor-pointer ${motifChoice === 'Autre'
                          ? 'bg-slate-900 text-white border-slate-900'
                          : 'bg-white text-slate-700 border-blue-950/15'
                        }`}
                    >
                      <Sparkles size={12} /> Autre…
                    </button>
                  </div>
                  {motifChoice === 'Autre' && (
                    <input
                      type="text"
                      value={customMotif}
                      onChange={e => setCustomMotif(e.target.value)}
                      placeholder="Préciser la raison du virement…"
                      className="w-full h-11 px-4 rounded-2xl bg-white border border-slate-300 text-sm font-bold text-slate-900 outline-none focus:border-blue-600"
                    />
                  )}
                </div>

                {/* Date & Statut */}
                <div className="grid grid-cols-2 gap-2.5">
                  <div>
                    <label className="text-[10.5px] font-black uppercase tracking-wider text-slate-400 block mb-1">
                      Date
                    </label>
                    <input
                      type="date"
                      value={dateVirement}
                      onChange={e => setDateVirement(e.target.value)}
                      className="w-full h-11 px-3 rounded-2xl bg-white border border-slate-200 text-xs font-bold text-slate-900 outline-none focus:border-blue-600"
                    />
                  </div>
                  <div>
                    <label className="text-[10.5px] font-black uppercase tracking-wider text-slate-400 block mb-1">
                      Statut
                    </label>
                    <select
                      value={statut}
                      onChange={e => setStatut(e.target.value as VirementStatut)}
                      className="w-full h-11 px-3 rounded-2xl bg-white border border-slate-200 text-xs font-bold text-slate-900 outline-none focus:border-blue-600"
                    >
                      <option value="execute">Exécuté / Confirmé</option>
                      <option value="en_attente">En attente</option>
                      <option value="annule">Annulé</option>
                    </select>
                  </div>
                </div>

                {/* Référence & Notes */}
                <div className="space-y-2.5">
                  <input
                    type="text"
                    value={referenceBancaire}
                    onChange={e => setReferenceBancaire(e.target.value)}
                    placeholder="Référence bordereau / N° SWIFT (optionnel)"
                    className="w-full h-11 px-4 rounded-2xl bg-white border border-slate-200 text-xs font-mono font-semibold text-slate-900 outline-none focus:border-blue-600"
                  />
                  <textarea
                    rows={2}
                    value={notes}
                    onChange={e => setNotes(e.target.value)}
                    placeholder="Notes complémentaires (optionnel)…"
                    className="w-full p-3.5 rounded-2xl bg-white border border-slate-200 text-xs font-semibold text-slate-900 outline-none focus:border-blue-600 resize-none"
                  />
                </div>
              </>
            )}

            {mobileStep === 3 && (
              <>
                <div className="space-y-1">
                  <h2 className="text-xl font-black text-slate-900 tracking-tight">
                    Scan du reçu & validation
                  </h2>
                  <p className="text-xs text-slate-500 font-medium">
                    Ajoutez la photo ou le PDF du bordereau bancaire (optionnel, modifiable plus tard).
                  </p>
                </div>

                {/* Zone Scan / Upload */}
                <div className="bg-white rounded-3xl border border-blue-950/15 p-4 space-y-3">
                  <div className="grid grid-cols-2 gap-2.5">
                    <button
                      type="button"
                      onClick={() => cameraInputRef.current?.click()}
                      className="h-12 rounded-2xl bg-blue-600 text-white text-xs font-black flex items-center justify-center gap-2 active:scale-95 transition cursor-pointer"
                    >
                      <Camera size={16} />
                      <span>Scanner / Photo</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="h-12 rounded-2xl bg-slate-100 text-slate-800 text-xs font-black flex items-center justify-center gap-2 active:scale-95 transition cursor-pointer"
                    >
                      <Upload size={16} />
                      <span>Galerie / PDF</span>
                    </button>
                  </div>

                  {(pendingPreview || pendingFile || recuUrl) && (
                    <div className="rounded-2xl bg-slate-50 border border-slate-200 p-3 flex items-center justify-between gap-3">
                      <div className="flex items-center gap-3 min-w-0">
                        {pendingPreview ? (
                          <img src={pendingPreview} alt="Aperçu" className="w-14 h-14 rounded-xl object-cover shrink-0" />
                        ) : recuUrl && !isPdfReceipt(recuUrl) ? (
                          <img
                            src={getVirementReceiptPublicUrl(recuUrl) || ''}
                            alt="Reçu"
                            className="w-14 h-14 rounded-xl object-cover shrink-0"
                          />
                        ) : (
                          <div className="w-12 h-12 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
                            <FileText size={20} />
                          </div>
                        )}
                        <div className="min-w-0">
                          <p className="text-xs font-black text-slate-900 truncate">
                            {pendingFile ? pendingFile.name : 'Justificatif enregistré'}
                          </p>
                          <p className="text-[11px] text-emerald-600 font-bold">Prêt à être enregistré</p>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setPendingFile(null)
                          if (pendingPreview) URL.revokeObjectURL(pendingPreview)
                          setPendingPreview(null)
                          setRecuUrl(null)
                        }}
                        className="w-8 h-8 rounded-full bg-rose-50 text-rose-600 flex items-center justify-center shrink-0 cursor-pointer"
                      >
                        <X size={15} />
                      </button>
                    </div>
                  )}
                </div>

                {/* Récapitulatif final */}
                <div className="bg-white rounded-2xl border border-blue-950/15 p-4 space-y-2 text-xs">
                  <div className="flex justify-between">
                    <span className="text-slate-400 font-semibold">Sens</span>
                    <span className={`font-black ${sens === 'recu' ? 'text-emerald-600' : 'text-rose-600'}`}>
                      {sens === 'recu' ? 'Virement reçu (Entrant)' : 'Virement émis (Sortant)'}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400 font-semibold">Banque & compte</span>
                    <span className="font-black text-slate-900 text-right">{banque} • {nomCompte}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400 font-semibold">Motif</span>
                    <span className="font-bold text-slate-800 text-right">{finalMotif}</span>
                  </div>
                  <div className="flex justify-between pt-2 border-t border-slate-100">
                    <span className="font-black text-slate-900">Montant</span>
                    <span className={`text-base font-black tabular-nums ${sens === 'recu' ? 'text-emerald-600' : 'text-rose-600'}`}>
                      {sens === 'recu' ? '+' : '-'}{fmt(montantNum)} {curSymbol}
                    </span>
                  </div>
                </div>
              </>
            )}
          </div>

          <div className="px-5 pt-3 pb-[max(1.25rem,env(safe-area-inset-bottom))] bg-white border-t border-slate-200/80 shrink-0">
            {mobileStep === 1 ? (
              <button
                type="button"
                disabled={!step1Valid}
                onClick={() => setMobileStep(2)}
                className="w-full h-12 rounded-2xl bg-slate-900 text-white font-black text-sm disabled:opacity-35 cursor-pointer"
              >
                Continuer →
              </button>
            ) : mobileStep === 2 ? (
              <button
                type="button"
                disabled={!step2Valid}
                onClick={() => setMobileStep(3)}
                className="w-full h-12 rounded-2xl bg-slate-900 text-white font-black text-sm disabled:opacity-35 cursor-pointer"
              >
                Continuer →
              </button>
            ) : (
              <button
                type="button"
                disabled={saving || !step1Valid || !step2Valid}
                onClick={handleSave}
                className="w-full h-12 rounded-2xl bg-blue-600 active:bg-blue-700 text-white font-black text-sm flex items-center justify-center gap-2 disabled:opacity-35 cursor-pointer"
              >
                {saving && <Loader2 size={16} className="animate-spin" />}
                <span>
                  {saving
                    ? 'Enregistrement…'
                    : editingId
                      ? 'Enregistrer les modifications'
                      : `Valider le virement (${fmt(montantNum)} ${curShort})`}
                </span>
              </button>
            )}
          </div>
        </div>
      )}

      {/* =================================================================== */}
      {/* 💻 MODALE PC : AJOUT / MODIFICATION VIREMENT                        */}
      {/* =================================================================== */}
      <Sheet
        open={showForm && !isMobile}
        onClose={closeForm}
        title={editingId ? `Modifier le virement (${curSymbol})` : `Nouveau virement (${curSymbol})`}
        subtitle="Suivi bancaire dédié — non comptabilisé dans les dépenses ou encaissements."
        footer={
          <button
            type="button"
            disabled={saving || !step1Valid || !step2Valid}
            onClick={handleSave}
            className="w-full py-3.5 bg-slate-900 hover:bg-blue-600 text-white font-black text-sm rounded-2xl flex items-center justify-center gap-2 disabled:opacity-40 transition cursor-pointer"
          >
            {saving && <Loader2 size={16} className="animate-spin" />}
            <span>
              {saving
                ? 'Enregistrement…'
                : editingId
                  ? `Enregistrer (${fmt(montantNum)} ${curShort})`
                  : `Valider le virement (${fmt(montantNum)} ${curShort})`}
            </span>
          </button>
        }
      >
        <div className="space-y-4">
          {/* Sens */}
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => {
                setSens('emis')
                if (MOTIFS_RECUS.includes(motifChoice)) setMotifChoice(MOTIFS_EMIS[0])
              }}
              className={`p-3 rounded-xl border text-left flex items-center gap-2.5 cursor-pointer ${sens === 'emis' ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-700 border-slate-200'
                }`}
            >
              <ArrowUpRight size={17} className="text-rose-400" />
              <div>
                <p className="text-xs font-black">Virement émis</p>
                <p className="text-[10px] opacity-70">Fait par l’entreprise</p>
              </div>
            </button>
            <button
              type="button"
              onClick={() => {
                setSens('recu')
                if (MOTIFS_EMIS.includes(motifChoice)) setMotifChoice(MOTIFS_RECUS[0])
              }}
              className={`p-3 rounded-xl border text-left flex items-center gap-2.5 cursor-pointer ${sens === 'recu' ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-white text-slate-700 border-slate-200'
                }`}
            >
              <ArrowDownLeft size={17} />
              <div>
                <p className="text-xs font-black">Virement reçu</p>
                <p className="text-[10px] opacity-80">Reçu sur notre compte</p>
              </div>
            </button>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] font-black uppercase text-slate-500 block mb-1">Banque *</label>
              <input
                type="text"
                value={banque}
                onChange={e => setBanque(e.target.value)}
                list="banques-datalist"
                placeholder="Ex : BDM-SA, Coris Bank…"
                className="w-full h-10 px-3 rounded-xl border border-slate-300 text-xs font-bold outline-none focus:border-blue-600"
              />
              <datalist id="banques-datalist">
                {BANQUES_SUGGESTIONS.map(b => <option key={b} value={b} />)}
              </datalist>
            </div>
            <div>
              <label className="text-[10px] font-black uppercase text-slate-500 block mb-1">Nom du compte *</label>
              <input
                type="text"
                value={nomCompte}
                onChange={e => setNomCompte(e.target.value)}
                placeholder="Nom du titulaire / compte"
                className="w-full h-10 px-3 rounded-xl border border-slate-300 text-xs font-bold outline-none focus:border-blue-600"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] font-black uppercase text-slate-500 block mb-1">N° Compte / IBAN</label>
              <input
                type="text"
                value={numeroCompte}
                onChange={e => setNumeroCompte(e.target.value)}
                placeholder="Optionnel"
                className="w-full h-10 px-3 rounded-xl border border-slate-200 text-xs font-mono font-semibold outline-none focus:border-blue-600"
              />
            </div>
            <div>
              <label className="text-[10px] font-black uppercase text-slate-500 block mb-1">
                {sens === 'recu' ? 'Émetteur' : 'Bénéficiaire'}
              </label>
              <input
                type="text"
                value={contrepartie}
                onChange={e => setContrepartie(e.target.value)}
                placeholder="Optionnel"
                className="w-full h-10 px-3 rounded-xl border border-slate-200 text-xs font-semibold outline-none focus:border-blue-600"
              />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="text-[10px] font-black uppercase text-slate-500 block mb-1">Montant ({curShort}) *</label>
              <input
                type="text"
                inputMode="numeric"
                value={montantSaisi}
                onChange={e => setMontantSaisi(formatAmount(e.target.value))}
                placeholder="0"
                className="w-full h-10 px-3 rounded-xl border border-slate-300 text-sm font-black tabular-nums outline-none focus:border-blue-600"
              />
            </div>
            <div>
              <label className="text-[10px] font-black uppercase text-slate-500 block mb-1">Date *</label>
              <input
                type="date"
                value={dateVirement}
                onChange={e => setDateVirement(e.target.value)}
                className="w-full h-10 px-3 rounded-xl border border-slate-200 text-xs font-bold outline-none focus:border-blue-600"
              />
            </div>
            <div>
              <label className="text-[10px] font-black uppercase text-slate-500 block mb-1">Statut</label>
              <select
                value={statut}
                onChange={e => setStatut(e.target.value as VirementStatut)}
                className="w-full h-10 px-2.5 rounded-xl border border-slate-200 text-xs font-bold outline-none focus:border-blue-600"
              >
                <option value="execute">Exécuté</option>
                <option value="en_attente">En attente</option>
                <option value="annule">Annulé</option>
              </select>
            </div>
          </div>

          <div>
            <label className="text-[10px] font-black uppercase text-slate-500 block mb-1">Raison du virement *</label>
            <select
              value={motifChoice}
              onChange={e => setMotifChoice(e.target.value)}
              className="w-full h-10 px-3 rounded-xl border border-slate-300 text-xs font-bold outline-none focus:border-blue-600"
            >
              {currentMotifSuggestions.map(m => (
                <option key={m} value={m}>{m}</option>
              ))}
              <option value="Autre">Autre (saisie libre…)</option>
            </select>
            {motifChoice === 'Autre' && (
              <input
                type="text"
                value={customMotif}
                onChange={e => setCustomMotif(e.target.value)}
                placeholder="Préciser le motif…"
                className="mt-2 w-full h-10 px-3 rounded-xl border border-slate-300 text-xs font-bold outline-none focus:border-blue-600"
              />
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] font-black uppercase text-slate-500 block mb-1">Référence bancaire</label>
              <input
                type="text"
                value={referenceBancaire}
                onChange={e => setReferenceBancaire(e.target.value)}
                placeholder="N° bordereau / SWIFT"
                className="w-full h-10 px-3 rounded-xl border border-slate-200 text-xs font-mono font-semibold outline-none focus:border-blue-600"
              />
            </div>
            <div>
              <label className="text-[10px] font-black uppercase text-slate-500 block mb-1">Scan du reçu (Photo / PDF)</label>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="w-full h-10 px-3 rounded-xl border border-dashed border-slate-300 hover:border-blue-500 text-xs font-bold text-slate-600 flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <Upload size={14} />
                <span className="truncate">
                  {pendingFile ? pendingFile.name : recuUrl ? 'Remplacer le reçu' : 'Importer un scan'}
                </span>
              </button>
            </div>
          </div>

          <div>
            <label className="text-[10px] font-black uppercase text-slate-500 block mb-1">Notes</label>
            <textarea
              rows={2}
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="Observations complémentaires…"
              className="w-full p-3 rounded-xl border border-slate-200 text-xs font-semibold outline-none focus:border-blue-600 resize-none"
            />
          </div>
        </div>
      </Sheet>

      {/* ===================== DÉTAIL D'UN VIREMENT (MOBILE) ===================== */}
      <Sheet
        open={Boolean(detailRow && isMobile)}
        onClose={() => setDetailId(null)}
        title={detailRow ? `${detailRow.banque} • ${detailRow.nom_compte}` : ''}
        subtitle={detailRow?.motif}
        footer={
          detailRow ? (
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => generateSingleVirementPdf({ v: detailRow, agenceName })}
                className="h-11 rounded-2xl bg-blue-600 text-white text-xs font-black flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <FileText size={14} /> Fiche PDF
              </button>
              <button
                type="button"
                onClick={() => openEdit(detailRow)}
                className="h-11 rounded-2xl bg-slate-900 text-white text-xs font-black flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <Pencil size={13} /> Modifier
              </button>
              <button
                type="button"
                onClick={() => openEdit(detailRow, true)}
                className="h-11 rounded-2xl bg-white border border-slate-200 text-slate-700 text-xs font-black flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <Copy size={13} /> Dupliquer
              </button>
              <button
                type="button"
                onClick={() => setDeleteConfirmId(detailRow.id)}
                className="h-11 rounded-2xl bg-white border border-rose-200 text-rose-600 text-xs font-black flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <Trash2 size={13} /> Supprimer
              </button>
            </div>
          ) : undefined
        }
      >
        {detailRow && (() => {
          const isRecu = detailRow.sens === 'recu'
          const receiptPublic = getVirementReceiptPublicUrl(detailRow.recu_url)
          const receiptIsPdf = isPdfReceipt(detailRow.recu_url)
          return (
            <div className="space-y-4">
              <div
                className={`rounded-2xl border p-4 text-center ${isRecu ? 'bg-emerald-50 border-emerald-100' : 'bg-rose-50 border-rose-100'
                  }`}
              >
                <p className={`text-[10px] font-black uppercase tracking-wider ${isRecu ? 'text-emerald-600' : 'text-rose-500'}`}>
                  {isRecu ? 'Virement reçu (Entrant)' : 'Virement émis (Sortant)'}
                </p>
                <p className={`text-2xl font-black tabular-nums mt-1 ${isRecu ? 'text-emerald-700' : 'text-rose-600'}`}>
                  {isRecu ? '+' : '-'}{fmt(detailRow.montant)} <span className="text-sm">{curSymbol}</span>
                </p>
              </div>

              {detailRow.statut === 'en_attente' && (
                <button
                  type="button"
                  onClick={() => handleQuickStatut(detailRow, 'execute')}
                  className="w-full h-11 rounded-2xl bg-emerald-600 text-white text-xs font-black flex items-center justify-center gap-1.5 active:scale-[0.98] transition cursor-pointer"
                >
                  <Check size={15} /> Confirmer comme exécuté
                </button>
              )}

              <div className="rounded-2xl border border-slate-200 divide-y divide-slate-100 text-xs">
                {[
                  ['Statut', STATUT_META[detailRow.statut].label],
                  ['Date', new Date(`${detailRow.date_virement}T12:00:00`).toLocaleDateString('fr-FR')],
                  ['Banque', detailRow.banque],
                  ['Nom du compte', detailRow.nom_compte],
                  ['N° compte / IBAN', detailRow.numero_compte || '—'],
                  [isRecu ? 'Émetteur' : 'Bénéficiaire', detailRow.contrepartie || '—'],
                  ['Réf. bancaire', detailRow.reference_bancaire || '—'],
                  ['Enregistré par', formatAuthorInline(detailRow.recorded_by_name, detailRow.recorded_by_role) || '—'],
                ].map(([k, val]) => (
                  <div key={k} className="flex items-center justify-between gap-3 px-3.5 py-2.5">
                    <span className="font-bold text-slate-400">{k}</span>
                    <span className="font-black text-slate-800 text-right truncate max-w-[60%]">{val}</span>
                  </div>
                ))}
              </div>

              {detailRow.notes && (
                <div className="rounded-2xl bg-slate-50 border border-slate-200 p-3.5 text-xs text-slate-700 font-medium">
                  <p className="text-[10px] font-black uppercase text-slate-400 mb-1">Notes</p>
                  {detailRow.notes}
                </div>
              )}

              {/* Aperçu du scan du reçu */}
              {receiptPublic ? (
                <div className="rounded-2xl border border-slate-200 overflow-hidden bg-slate-50">
                  {!receiptIsPdf ? (
                    <button
                      type="button"
                      onClick={() => setLightboxUrl(receiptPublic)}
                      className="w-full block cursor-pointer"
                    >
                      <img src={receiptPublic} alt="Scan du reçu" className="w-full max-h-60 object-contain bg-slate-900/5" />
                    </button>
                  ) : (
                    <div className="p-4 flex items-center gap-3">
                      <FileText size={24} className="text-rose-600 shrink-0" />
                      <span className="text-xs font-black text-slate-800">Reçu de virement (PDF)</span>
                    </div>
                  )}
                  <div className="p-3 bg-white border-t border-slate-100 flex items-center justify-between gap-2">
                    <span className="text-[11px] font-bold text-slate-500">Justificatif bancaire</span>
                    <a
                      href={receiptPublic}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="h-8 px-3 rounded-xl bg-slate-900 text-white text-[11px] font-black inline-flex items-center gap-1"
                    >
                      <ExternalLink size={12} /> Ouvrir / Télécharger
                    </a>
                  </div>
                </div>
              ) : (
                <div className="rounded-2xl border border-dashed border-slate-200 p-4 text-center text-xs text-slate-400 font-semibold">
                  Aucun scan de reçu joint (touchez « Modifier » pour en ajouter un).
                </div>
              )}
            </div>
          )
        })()}
      </Sheet>

      {/* ===================== FILTRES MOBILE ===================== */}
      <Sheet
        open={showFilters}
        onClose={() => setShowFilters(false)}
        title="Filtrer & exporter"
        subtitle={`${filteredRows.length} opération(s)`}
        footer={
          <div className="grid grid-cols-3 gap-2">
            <button
              type="button"
              onClick={resetFilters}
              className="h-11 rounded-xl bg-white border border-slate-200 text-slate-700 text-xs font-black cursor-pointer"
            >
              Réinitialiser
            </button>
            <button
              type="button"
              onClick={exportCsv}
              disabled={filteredRows.length === 0}
              className="h-11 rounded-xl bg-white border border-slate-200 text-slate-700 text-xs font-black flex items-center justify-center gap-1 disabled:opacity-40 cursor-pointer"
            >
              <Download size={13} /> CSV
            </button>
            <button
              type="button"
              onClick={() => setShowFilters(false)}
              className="h-11 rounded-xl bg-blue-600 text-white text-xs font-black cursor-pointer"
            >
              Voir ({filteredRows.length})
            </button>
          </div>
        }
      >
        <div className="space-y-4">
          <div>
            <label className="text-[10px] font-black text-slate-500 uppercase tracking-wider block mb-1.5">Trier par</label>
            <select
              value={sortKey}
              onChange={e => setSortKey(e.target.value)}
              className="w-full h-11 px-3 rounded-xl bg-slate-50 border border-slate-200 text-xs font-bold outline-none"
            >
              {SORT_OPTIONS.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
            </select>
          </div>

          <div>
            <label className="text-[10px] font-black text-slate-500 uppercase tracking-wider block mb-1.5">Statut</label>
            <div className="flex flex-wrap gap-1.5">
              {([
                ['all', 'Tous'],
                ['execute', 'Exécutés'],
                ['en_attente', 'En attente'],
                ['annule', 'Annulés'],
              ] as const).map(([id, lbl]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setFilterStatut(id)}
                  className={`px-3 py-1.5 rounded-full text-xs font-bold border cursor-pointer ${filterStatut === id ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-600 border-slate-200'
                    }`}
                >
                  {lbl}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="text-[10px] font-black text-slate-500 uppercase tracking-wider block mb-1.5">Justificatif scanné</label>
            <div className="flex flex-wrap gap-1.5">
              {([
                ['all', 'Tous'],
                ['avec', 'Avec reçu'],
                ['sans', 'Sans reçu'],
              ] as const).map(([id, lbl]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setFilterRecu(id)}
                  className={`px-3 py-1.5 rounded-full text-xs font-bold border cursor-pointer ${filterRecu === id ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-slate-600 border-slate-200'
                    }`}
                >
                  {lbl}
                </button>
              ))}
            </div>
          </div>

          {uniqueBanques.length > 0 && (
            <div>
              <label className="text-[10px] font-black text-slate-500 uppercase tracking-wider block mb-1.5">Banque</label>
              <div className="flex flex-wrap gap-1.5">
                <button
                  type="button"
                  onClick={() => setFilterBanque('all')}
                  className={`px-3 py-1.5 rounded-full text-xs font-bold border cursor-pointer ${filterBanque === 'all' ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-600 border-slate-200'
                    }`}
                >
                  Toutes
                </button>
                {uniqueBanques.map(b => (
                  <button
                    key={b}
                    type="button"
                    onClick={() => setFilterBanque(b)}
                    className={`px-3 py-1.5 rounded-full text-xs font-bold border cursor-pointer ${filterBanque === b ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-600 border-slate-200'
                      }`}
                  >
                    {b}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </Sheet>

      {/* ===================== EXPORT RELEVÉ RÉCAPITULATIF PDF ===================== */}
      <Sheet
        open={showPdfSheet}
        onClose={() => setShowPdfSheet(false)}
        title="Relevé récapitulatif PDF"
        subtitle={`Devise active : ${HAJJ_CURRENCY_MAP[selectedDevise].label}`}
        footer={
          <button
            type="button"
            onClick={handleGenerateRecapPdf}
            className="w-full h-12 rounded-2xl bg-blue-600 active:bg-blue-700 text-white font-black text-sm flex items-center justify-center gap-2 cursor-pointer"
          >
            <FileText size={16} /> Télécharger le relevé PDF
          </button>
        }
      >
        <div className="space-y-4">
          <div className="space-y-2">
            <label className="text-[10px] font-black uppercase tracking-wider text-slate-400 block">
              Contenu du récapitulatif
            </label>
            {([
              ['all', 'Tous les virements (Émis + Reçus)', `${currencyVirements.length} opération(s)`],
              ['emis', 'Virements émis uniquement', `${currencyVirements.filter(v => v.sens === 'emis').length} sortant(s)`],
              ['recu', 'Virements reçus uniquement', `${currencyVirements.filter(v => v.sens === 'recu').length} entrant(s)`],
            ] as const).map(([id, title, sub]) => (
              <button
                key={id}
                type="button"
                onClick={() => setPdfScope(id)}
                className={`w-full p-3.5 rounded-2xl border flex items-center justify-between text-left transition cursor-pointer ${pdfScope === id ? 'bg-blue-50/70 border-blue-500' : 'bg-slate-50 border-slate-200'
                  }`}
              >
                <div>
                  <p className="text-xs font-black text-slate-900">{title}</p>
                  <p className="text-[11px] text-slate-500 font-medium">{sub}</p>
                </div>
                <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${pdfScope === id ? 'bg-blue-600 border-blue-600' : 'border-slate-300'}`}>
                  {pdfScope === id && <div className="w-2 h-2 rounded-full bg-white" />}
                </div>
              </button>
            ))}
          </div>

          <div className="grid grid-cols-2 gap-2.5">
            <div>
              <label className="text-[10px] font-black uppercase tracking-wider text-slate-400 block mb-1">
                Du (optionnel)
              </label>
              <input
                type="date"
                value={pdfFromDate}
                onChange={e => setPdfFromDate(e.target.value)}
                className="w-full h-10 px-3 rounded-xl bg-slate-50 border border-slate-200 text-xs font-bold outline-none"
              />
            </div>
            <div>
              <label className="text-[10px] font-black uppercase tracking-wider text-slate-400 block mb-1">
                Au (optionnel)
              </label>
              <input
                type="date"
                value={pdfToDate}
                onChange={e => setPdfToDate(e.target.value)}
                className="w-full h-10 px-3 rounded-xl bg-slate-50 border border-slate-200 text-xs font-bold outline-none"
              />
            </div>
          </div>
        </div>
      </Sheet>

      {/* ===================== CONFIRMATION SUPPRESSION ===================== */}
      <Sheet
        open={Boolean(deleteConfirmId)}
        onClose={() => !deleting && setDeleteConfirmId(null)}
        title="Supprimer ce virement ?"
        subtitle="Cette opération sera retirée définitivement du suivi bancaire."
        z="z-[10001]"
        footer={
          <div className="grid grid-cols-2 gap-2.5">
            <button
              type="button"
              disabled={deleting}
              onClick={() => setDeleteConfirmId(null)}
              className="h-12 rounded-2xl bg-slate-100 text-slate-700 font-black text-xs cursor-pointer"
            >
              Annuler
            </button>
            <button
              type="button"
              disabled={deleting}
              onClick={() => deleteConfirmId && executeDelete(deleteConfirmId)}
              className="h-12 rounded-2xl bg-rose-600 text-white font-black text-xs cursor-pointer disabled:opacity-50"
            >
              {deleting ? 'Suppression…' : 'Supprimer'}
            </button>
          </div>
        }
      >
        <p className="text-xs text-slate-600 font-semibold leading-relaxed">
          Les totaux de virements émis, reçus et le solde net seront immédiatement recalculés.
        </p>
      </Sheet>

      {/* ===================== LIGHTBOX PLEIN ÉCRAN SCAN DU REÇU ===================== */}
      {lightboxUrl && (
        <div
          onClick={() => setLightboxUrl(null)}
          className="fixed inset-0 z-[10003] bg-slate-950/95 flex flex-col items-center justify-center p-4 animate-in fade-in duration-150"
        >
          <div className="w-full max-w-3xl flex items-center justify-between pb-3">
            <a
              href={lightboxUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={e => e.stopPropagation()}
              className="h-9 px-3.5 rounded-full bg-white/15 text-white text-xs font-bold inline-flex items-center gap-1.5"
            >
              <ExternalLink size={14} /> Ouvrir l’original
            </a>
            <button
              type="button"
              onClick={() => setLightboxUrl(null)}
              className="w-9 h-9 rounded-full bg-white/15 text-white flex items-center justify-center cursor-pointer"
            >
              <X size={18} />
            </button>
          </div>
          <img
            src={lightboxUrl}
            alt="Scan du reçu de virement"
            onClick={e => e.stopPropagation()}
            className="max-w-full max-h-[82dvh] object-contain rounded-xl"
          />
        </div>
      )}
    </div>
  )
}
