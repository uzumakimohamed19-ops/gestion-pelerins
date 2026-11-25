'use client'
import { useEffect, useMemo, useRef, useState } from 'react'
import { usePowerSync, useQuery } from '@powersync/react'
import { requireSupabaseRows, supabase } from '@/lib/supabase'
import { useYear } from '@/lib/YearContext'
import { useUI } from '@/lib/UIContext'
import { useWorkProfile } from '@/lib/ProfileContext'
import { YearSelector } from '@/components/YearSelector'
import { HajjCurrencyTabs } from '@/components/HajjCurrencySelector'
import { formatAuthorInline, formatProfileRoleLabel, getProfileRoleBadgeClass } from '@/lib/profileAuthor'
import { getPassportPublicUrl } from '@/lib/hajjPassport'
import {
  HAJJ_CURRENCIES,
  HAJJ_CURRENCY_MAP,
  countByCurrency,
  getHajjCurrencySymbol,
  normalizeHajjCurrency,
  type HajjCurrency,
} from '@/lib/hajjCurrency'
import type { LucideIcon } from 'lucide-react'
import {
  TrendingUp, Package, Wallet, CreditCard, BarChart2, ChevronDown, ChevronUp, ChevronRight,
  Plus, Trash2, Landmark, DollarSign, Search, Users, Check, X, Building2, Tag,
  Layers, Pencil, Copy, Download, ArrowUpDown, Receipt, LayoutDashboard, UserCheck,
  ListChecks, UserPlus, RefreshCw, SlidersHorizontal, ArrowLeft, CheckCircle2, AlertCircle,
  Plane, ShieldCheck, BedDouble, Utensils, Bus, FileText, Sparkles,
} from 'lucide-react'

/* ───────────────────────────── Types ───────────────────────────── */

type Pelerin = {
  id?: number | string
  prenom?: string
  nom?: string
  nom_complet?: string
  telephone_pelerin?: string
  nom_package?: string
  prix_package?: number | null
  total_paye?: number | null
  devise: HajjCurrency
  reference?: string
  agence_ou_personne_associee?: string
  num_passeport?: string
  photo_url?: string | null
  sur_plateforme_gouv?: boolean | number | null
  sur_plateforme_nusuk?: boolean | number | null
  campagne?: number | string
  agences?: { nom_agence?: string } | null
  [key: string]: unknown
}

type PackageData = { count: number; encaisse: number; attendu: number }
type AgenceData = { pelerins: Pelerin[]; encaisse: number; attendu: number }

type TypeCible = 'pelerin' | 'groupe' | 'reference' | 'associe' | 'global'

type Depense = {
  id: string
  type_cible: TypeCible
  cible_valeur: string
  libelle: string
  montant: number
  devise: HajjCurrency
  recorded_by_name?: string | null
  recorded_by_role?: string | null
  created_at?: string
  user_id?: string
}

type Meta = { base: string; dyn: number | null; lbl: string }

type Row = {
  d: Depense
  meta: Meta
  targets: Pelerin[]
  count: number
  stored: number
  montant: number
  unit: number
  unitExact: number
  dyn: boolean
  isList: boolean
  label: string
  blob: string
}

type Statut = 'solde' | 'partiel' | 'non_paye'

/* ─────────────────────────── Constantes ─────────────────────────── */

const LIBELLES = [
  "Billet d'avion",
  'Visa & Nusuk',
  'Hébergement Makkah',
  'Hébergement Médine',
  'Restauration & Vivres',
  'Transport terrestre (Bus)',
  'Frais de dossier / Passeport',
]

const LIBELLE_ICON: Record<string, LucideIcon> = {
  "Billet d'avion": Plane,
  'Visa & Nusuk': ShieldCheck,
  'Hébergement Makkah': BedDouble,
  'Hébergement Médine': BedDouble,
  'Restauration & Vivres': Utensils,
  'Transport terrestre (Bus)': Bus,
  'Frais de dossier / Passeport': FileText,
}

function getDateGroupLabel(iso?: string): string {
  if (!iso) return 'Sans date'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return 'Sans date'
  const now = new Date()
  const todayKey = `${now.getFullYear()}-${now.getMonth()}-${now.getDate()}`
  const yest = new Date(now)
  yest.setDate(now.getDate() - 1)
  const yestKey = `${yest.getFullYear()}-${yest.getMonth()}-${yest.getDate()}`
  const dKey = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`
  if (dKey === todayKey) return "Aujourd'hui"
  if (dKey === yestKey) return 'Hier'
  return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: d.getFullYear() !== now.getFullYear() ? 'numeric' : undefined })
}

const TYPE_META: Record<TypeCible, { label: string; short: string; desc: string; icon: LucideIcon }> = {
  pelerin: { label: 'Pèlerin unique', short: 'Pèlerin', desc: '1 personne', icon: Users },
  groupe: { label: 'Sélection de pèlerins', short: 'Sélection', desc: 'Choix libre', icon: ListChecks },
  reference: { label: 'Par Dossier / Réf', short: 'Dossier', desc: 'Groupe lié', icon: Tag },
  associe: { label: 'Par Partenaire', short: 'Partenaire', desc: 'Agence externe', icon: Building2 },
  global: { label: 'Toute la campagne', short: 'Campagne', desc: 'Frais communs', icon: Layers },
}

const TYPE_ORDER: TypeCible[] = ['pelerin', 'groupe', 'reference', 'associe', 'global']

const SORT_OPTIONS = [
  { id: 'date_desc', label: 'Date : récentes d’abord' },
  { id: 'date_asc', label: 'Date : anciennes d’abord' },
  { id: 'nature_asc', label: 'Nature de la charge (A → Z)' },
  { id: 'montant_desc', label: 'Montant : plus élevé' },
  { id: 'montant_asc', label: 'Montant : plus faible' },
  { id: 'cible_asc', label: 'Cible (A → Z)' },
  { id: 'count_desc', label: 'Nombre de pèlerins' },
]

const STATUT_STYLE: Record<Statut, string> = {
  solde: 'bg-emerald-50 text-emerald-700',
  partiel: 'bg-amber-50 text-amber-700',
  non_paye: 'bg-rose-50 text-rose-700',
}
const STATUT_LABEL: Record<Statut, string> = { solde: 'Soldé', partiel: 'Partiel', non_paye: 'Non payé' }

/* ───────────────────────────── Helpers ───────────────────────────── */

const fmt = (n: number) => Math.round(n || 0).toLocaleString('fr-FR')
const sanitizeAmount = (value: string) => value.replace(/\D/g, '')
const parseAmount = (value: string) => {
  const cleaned = sanitizeAmount(value)
  return cleaned === '' ? 0 : Number(cleaned)
}
const formatAmount = (value: string | number) => {
  const digits = typeof value === 'number' ? String(Math.round(value)) : sanitizeAmount(value)
  return digits === '' ? '' : Number(digits).toLocaleString('fr-FR')
}

const pName = (p: Pelerin) => `${p.prenom || ''} ${p.nom_complet || p.nom || ''}`.trim() || 'Sans nom'
const assocOf = (p: Pelerin) => (p.agence_ou_personne_associee || p.agences?.nom_agence || '').trim()
const norm = (s?: string | null) => (s || '').trim().toLowerCase()
const idsOf = (v: string) => v.split(',').map(s => s.trim()).filter(Boolean)
const createdTime = (p: Pelerin) => new Date(String(p.created_at || 0)).getTime() || 0

const statusOf = (p: Pelerin): Statut => {
  const prix = Number(p.prix_package) || 0
  const paye = Number(p.total_paye) || 0
  if (prix > 0 && paye >= prix) return 'solde'
  if (paye <= 0) return 'non_paye'
  return 'partiel'
}

function parseCible(raw: string): Meta {
  const m = /^([\s\S]*?)(?:\|dyn:(\d+(?:\.\d+)?))?(?:\|lbl:([\s\S]*))?$/.exec(raw || '')
  return { base: (m?.[1] ?? raw ?? '').trim(), dyn: m?.[2] ? Number(m[2]) : null, lbl: m?.[3] ?? '' }
}

function buildCible(base: string, opts?: { dyn?: number | null; lbl?: string }) {
  return (
    base +
    (opts?.dyn !== undefined && opts?.dyn !== null ? `|dyn:${opts.dyn}` : '') +
    (opts?.lbl ? `|lbl:${opts.lbl.replace(/\|/g, '/')}` : '')
  )
}

function resolveTargets(d: { type_cible: TypeCible; cible_valeur: string }, pool: Pelerin[]): Pelerin[] {
  const { base } = parseCible(d.cible_valeur)
  switch (d.type_cible) {
    case 'global': {
      const key = base.replace(/^campagne_/, '')
      return key === '' || key === 'all' ? pool : pool.filter(p => String(p.campagne) === key)
    }
    case 'pelerin':
      return pool.filter(p => String(p.id) === base)
    case 'groupe': {
      const ids = new Set(idsOf(base))
      return pool.filter(p => ids.has(String(p.id)))
    }
    case 'reference':
      return pool.filter(p => norm(p.reference) === norm(base))
    case 'associe':
      return pool.filter(p => norm(assocOf(p)) === norm(base))
    default:
      return []
  }
}

function campagneLabel(base: string) {
  const k = base.replace(/^campagne_/, '')
  return k && k !== 'all' ? `Campagne ${k}` : 'Toute la campagne'
}

function ruleLabelOf(type: TypeCible, base: string) {
  if (type === 'global') return campagneLabel(base)
  if (type === 'reference') return `Réf ${base}`
  return `Partenaire ${base}`
}

function cibleLabel(d: Depense, targets: Pelerin[], meta: Meta, count: number): string {
  switch (d.type_cible) {
    case 'pelerin':
      return targets[0] ? pName(targets[0]) : 'Pèlerin introuvable'
    case 'groupe':
      if (meta.lbl) return `${meta.lbl} (${count} pèlerins)`
      if (!targets.length) return 'Sélection introuvable'
      return targets.length <= 2
        ? targets.map(pName).join(', ')
        : `${pName(targets[0])}, ${pName(targets[1])} +${targets.length - 2}`
    case 'reference':
      return `Dossier Réf : ${meta.base}`
    case 'associe':
      return `Partenaire : ${meta.base}`
    case 'global':
      return `Frais communs • ${campagneLabel(meta.base)}`
    default:
      return d.cible_valeur
  }
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

/* ─────────────────────── Composants utilitaires ─────────────────────── */

function Sheet({
  open, onClose, title, subtitle, children, footer, z = 'z-[9999]',
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
      <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-[2px] animate-in fade-in duration-150" onClick={onClose} />
      <div className="relative w-full md:max-w-xl bg-white rounded-t-[2rem] md:rounded-2xl shadow-2xl flex flex-col max-h-[92dvh] md:max-h-[88vh] animate-in slide-in-from-bottom md:zoom-in-95 duration-200">
        <div className="md:hidden flex justify-center pt-3">
          <div className="w-12 h-1.5 rounded-full bg-slate-200" />
        </div>
        <div className="flex items-start justify-between gap-3 px-4 sm:px-5 pt-3 md:pt-5 pb-3 border-b border-slate-100">
          <div className="min-w-0">
            <h2 className="font-black text-slate-900 text-sm sm:text-base leading-tight truncate">{title}</h2>
            {subtitle && <p className="text-[11px] sm:text-xs text-slate-500 font-medium mt-0.5 line-clamp-2">{subtitle}</p>}
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

function TargetPicker({
  mode, data, referencesList, associesList, selectedIds, cibleValeur, recentFirst, currencyUnit, onConfirmIds, onConfirmValue, onClose,
}: {
  mode: 'pelerin' | 'groupe' | 'reference' | 'associe'
  data: Pelerin[]
  referencesList: { valeur: string; count: number }[]
  associesList: { valeur: string; count: number }[]
  selectedIds: string[]
  cibleValeur: string
  recentFirst?: boolean
  currencyUnit: string
  onConfirmIds: (ids: string[]) => void
  onConfirmValue: (v: string) => void
  onClose: () => void
}) {
  const [search, setSearch] = useState('')
  const [statut, setStatut] = useState<'all' | Statut>('all')
  const [plateforme, setPlateforme] = useState<'all' | 'gouv' | 'nusuk'>('all')
  const [pkgFilter, setPkgFilter] = useState<string>('all')
  const [partnerFilter, setPartnerFilter] = useState<string>('all')
  const [onlySelected, setOnlySelected] = useState(false)
  const [sortBy, setSortBy] = useState<'alpha' | 'recent'>(recentFirst ? 'recent' : 'alpha')
  const [sel, setSel] = useState<string[]>(selectedIds)
  const [visibleCount, setVisibleCount] = useState(50)
  const loadMoreRef = useRef<HTMLDivElement | null>(null)
  const listScrollRef = useRef<HTMLDivElement | null>(null)

  const q = search.trim().toLowerCase()
  const isPelerinMode = mode === 'pelerin' || mode === 'groupe'
  const list = mode === 'reference' ? referencesList : associesList

  // Verrouiller le scroll arrière-plan tant que le sélecteur est ouvert
  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [])

  // Options dynamiques Forfait & Partenaire pour filtrer rapidement sur des centaines de pèlerins
  const availablePackages = useMemo(() => {
    const set = new Set<string>()
    data.forEach(p => {
      const pkg = (p.nom_package || '').trim()
      if (pkg) set.add(pkg)
    })
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'fr'))
  }, [data])

  const availablePartners = useMemo(() => {
    const set = new Set<string>()
    data.forEach(p => {
      const part = assocOf(p)
      if (part) set.add(part)
    })
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'fr'))
  }, [data])

  const selectedSet = useMemo(() => new Set(sel), [sel])

  const pelerinById = useMemo(() => {
    const m = new Map<string, Pelerin>()
    data.forEach(p => m.set(String(p.id), p))
    return m
  }, [data])

  const visible = useMemo(() => {
    return data
      .filter(p => {
        const id = String(p.id)
        if (onlySelected && !selectedSet.has(id)) return false
        if (statut !== 'all' && statusOf(p) !== statut) return false
        if (plateforme === 'gouv' && !p.sur_plateforme_gouv) return false
        if (plateforme === 'nusuk' && !p.sur_plateforme_nusuk) return false
        if (pkgFilter !== 'all' && (p.nom_package || '').trim() !== pkgFilter) return false
        if (partnerFilter !== 'all' && assocOf(p) !== partnerFilter) return false
        if (!q) return true
        const blob = `${pName(p)} ${p.num_passeport || ''} ${p.reference || ''} ${p.nom_package || ''} ${assocOf(p)} ${p.telephone_pelerin || ''}`
        return blob.toLowerCase().includes(q)
      })
      .sort((a, b) => (sortBy === 'recent' ? createdTime(b) - createdTime(a) : pName(a).localeCompare(pName(b), 'fr')))
  }, [data, q, statut, plateforme, pkgFilter, partnerFilter, onlySelected, selectedSet, sortBy])

  // Réinitialiser la pagination progressive et remonter la liste quand un filtre change
  useEffect(() => {
    setVisibleCount(50)
    if (listScrollRef.current) {
      listScrollRef.current.scrollTop = 0
    }
  }, [q, statut, plateforme, pkgFilter, partnerFilter, onlySelected, sortBy])

  // Chargement progressif fluide par tranches de 50 (60fps même avec 500+ pèlerins)
  useEffect(() => {
    const sentinel = loadMoreRef.current
    const root = listScrollRef.current
    if (!sentinel || !root || visibleCount >= visible.length) return
    const observer = new IntersectionObserver(
      entries => {
        if (entries[0]?.isIntersecting) {
          setVisibleCount(prev => Math.min(prev + 50, visible.length))
        }
      },
      { root, rootMargin: '300px' },
    )
    observer.observe(sentinel)
    return () => observer.disconnect()
  }, [visibleCount, visible.length])

  const renderedPelerins = useMemo(
    () => visible.slice(0, visibleCount),
    [visible, visibleCount],
  )

  const toggle = (id: string) => setSel(s => (s.includes(id) ? s.filter(x => x !== id) : [...s, id]))
  const allVisibleSelected = visible.length > 0 && visible.every(p => selectedSet.has(String(p.id)))
  const toggleAllVisible = () =>
    setSel(s =>
      allVisibleSelected
        ? s.filter(id => !visible.some(p => String(p.id) === id))
        : Array.from(new Set([...s, ...visible.map(p => String(p.id))])),
    )

  const hasExtraFilters =
    statut !== 'all' ||
    plateforme !== 'all' ||
    pkgFilter !== 'all' ||
    partnerFilter !== 'all' ||
    onlySelected ||
    q !== ''

  const clearPickerFilters = () => {
    setSearch('')
    setStatut('all')
    setPlateforme('all')
    setPkgFilter('all')
    setPartnerFilter('all')
    setOnlySelected(false)
  }

  const getInit = (p: Pelerin) => {
    const a = (p.prenom || '').trim().charAt(0).toUpperCase()
    const b = (p.nom_complet || p.nom || '').trim().charAt(0).toUpperCase()
    return `${a}${b}` || 'P'
  }

  const titles = {
    pelerin: 'Choisir un pèlerin',
    groupe: 'Sélectionner des pèlerins',
    reference: 'Choisir un dossier / réf',
    associe: 'Choisir un partenaire',
  }

  const filteredList = useMemo(
    () => list.filter(x => x.valeur.toLowerCase().includes(q)),
    [list, q],
  )

  return (
    <div className="fixed inset-0 z-[10000] flex items-stretch md:items-center justify-center md:p-4 bg-white md:bg-slate-900/55 md:backdrop-blur-[2px] animate-in fade-in duration-150">
      <div className="w-full h-full md:h-auto md:max-h-[90vh] md:max-w-xl bg-white md:rounded-3xl md:shadow-2xl flex flex-col overflow-hidden">
        {/* ═══ 1. EN-TÊTE FIXE (strictement séparé de la liste : 0 conflit au scroll) ═══ */}
        <div className="shrink-0 bg-white border-b border-slate-200/80 z-20">
          {/* Barre supérieure façon WhatsApp */}
          <div className="px-4 pt-[max(0.85rem,env(safe-area-inset-top))] md:pt-4 pb-2.5 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2.5 min-w-0">
              <button
                type="button"
                onClick={onClose}
                aria-label="Retour"
                className="w-9 h-9 rounded-full bg-slate-100 text-slate-700 flex items-center justify-center active:scale-90 transition shrink-0 cursor-pointer"
              >
                <ArrowLeft size={18} />
              </button>
              <div className="min-w-0">
                <h2 className="font-black text-slate-900 text-[15px] sm:text-base leading-tight truncate">
                  {titles[mode]}
                </h2>
                <p className="text-[11px] font-semibold text-slate-400 truncate mt-0.5 tabular-nums">
                  {isPelerinMode
                    ? `${visible.length} sur ${data.length} pèlerin${data.length > 1 ? 's' : ''}${mode === 'groupe' && sel.length > 0 ? ` • ${sel.length} choisi${sel.length > 1 ? 's' : ''}` : ''}`
                    : `${filteredList.length} disponible${filteredList.length > 1 ? 's' : ''}`}
                </p>
              </div>
            </div>

            {mode === 'groupe' && visible.length > 0 ? (
              <button
                type="button"
                onClick={toggleAllVisible}
                className={`h-8 px-3 rounded-full text-[11px] font-black shrink-0 transition active:scale-95 cursor-pointer ${
                  allVisibleSelected
                    ? 'bg-rose-50 text-rose-600 border border-rose-200'
                    : 'bg-blue-50 text-blue-700 border border-blue-200'
                }`}
              >
                {allVisibleSelected ? 'Désél.' : `Tout (${visible.length})`}
              </button>
            ) : (
              <button
                type="button"
                onClick={onClose}
                aria-label="Fermer"
                className="hidden md:flex w-9 h-9 rounded-full bg-slate-100 text-slate-500 items-center justify-center cursor-pointer"
              >
                <X size={17} />
              </button>
            )}
          </div>

          {/* Rangée horizontale WhatsApp des pèlerins déjà sélectionnés (mode groupe) */}
          {mode === 'groupe' && sel.length > 0 && (
            <div className="px-4 pb-2.5 flex items-center gap-3 overflow-x-auto no-scrollbar">
              {sel.map(id => {
                const p = pelerinById.get(id)
                const photo = p?.photo_url ? getPassportPublicUrl(p.photo_url) : null
                const firstName = (p?.prenom || p?.nom_complet || `#${id}`).trim().split(' ')[0]
                return (
                  <button
                    key={id}
                    type="button"
                    onClick={() => toggle(id)}
                    className="flex flex-col items-center gap-1 shrink-0 w-13 active:scale-90 transition cursor-pointer"
                  >
                    <div className="relative">
                      <div className="w-11 h-11 rounded-full bg-blue-50 text-blue-700 font-black text-xs flex items-center justify-center overflow-hidden border-2 border-blue-600">
                        {photo ? (
                          <img src={photo} alt={firstName} loading="lazy" decoding="async" className="w-full h-full object-cover" />
                        ) : (
                          <span>{p ? getInit(p) : '#'}</span>
                        )}
                      </div>
                      <span className="absolute -top-0.5 -right-0.5 w-4 h-4 rounded-full bg-slate-800 text-white border border-white flex items-center justify-center">
                        <X size={10} strokeWidth={3} />
                      </span>
                    </div>
                    <span className="text-[10px] font-bold text-slate-600 truncate w-full text-center leading-none">
                      {firstName}
                    </span>
                  </button>
                )
              })}
            </div>
          )}

          {/* Barre de recherche spacieuse */}
          <div className="px-4 pb-2.5">
            <div className="relative">
              <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
              <input
                type="text"
                placeholder={isPelerinMode ? 'Rechercher nom, passeport, tél, réf…' : 'Rechercher…'}
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="w-full h-11 pl-10 pr-9 bg-slate-100 border border-transparent focus:bg-white focus:border-blue-600 rounded-2xl text-sm font-semibold text-slate-900 placeholder:text-slate-400 outline-none transition"
              />
              {search && (
                <button
                  type="button"
                  onClick={() => setSearch('')}
                  aria-label="Effacer"
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full bg-slate-200 text-slate-600 flex items-center justify-center cursor-pointer"
                >
                  <X size={13} />
                </button>
              )}
            </div>
          </div>

          {/* Filtres rapides enrichis (100% fluides sans scrollbar visible) */}
          {isPelerinMode && (
            <div className="pb-2.5 space-y-2">
              <div className="px-4 flex items-center gap-1.5 overflow-x-auto no-scrollbar">
                <button
                  type="button"
                  onClick={() => setSortBy(s => (s === 'alpha' ? 'recent' : 'alpha'))}
                  className="h-8 px-2.5 rounded-full bg-slate-100 text-slate-700 text-[11px] font-bold whitespace-nowrap shrink-0 flex items-center gap-1 active:scale-95 transition cursor-pointer"
                >
                  <ArrowUpDown size={11} className="text-blue-600" />
                  <span>{sortBy === 'alpha' ? 'A → Z' : 'Récents'}</span>
                </button>

                {mode === 'groupe' && sel.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setOnlySelected(v => !v)}
                    className={`h-8 px-3 rounded-full text-[11px] font-bold whitespace-nowrap shrink-0 transition active:scale-95 cursor-pointer ${
                      onlySelected
                        ? 'bg-blue-600 text-white'
                        : 'bg-blue-50 text-blue-700 border border-blue-200'
                    }`}
                  >
                    Choisis ({sel.length})
                  </button>
                )}

                {([
                  ['all', 'Tous'],
                  ['solde', 'Soldés'],
                  ['partiel', 'Partiels'],
                  ['non_paye', 'Non payés'],
                ] as const).map(([id, label]) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setStatut(id)}
                    className={`h-8 px-3 rounded-full text-[11px] font-bold whitespace-nowrap shrink-0 transition active:scale-95 cursor-pointer ${
                      statut === id
                        ? 'bg-slate-900 text-white'
                        : 'bg-white text-slate-600 border border-slate-200'
                    }`}
                  >
                    {label}
                  </button>
                ))}

                <button
                  type="button"
                  onClick={() => setPlateforme(p => (p === 'gouv' ? 'all' : 'gouv'))}
                  className={`h-8 px-3 rounded-full text-[11px] font-bold whitespace-nowrap shrink-0 transition active:scale-95 cursor-pointer ${
                    plateforme === 'gouv'
                      ? 'bg-emerald-600 text-white'
                      : 'bg-white text-slate-600 border border-slate-200'
                  }`}
                >
                  Gouv
                </button>

                <button
                  type="button"
                  onClick={() => setPlateforme(p => (p === 'nusuk' ? 'all' : 'nusuk'))}
                  className={`h-8 px-3 rounded-full text-[11px] font-bold whitespace-nowrap shrink-0 transition active:scale-95 cursor-pointer ${
                    plateforme === 'nusuk'
                      ? 'bg-blue-600 text-white'
                      : 'bg-white text-slate-600 border border-slate-200'
                  }`}
                >
                  Nusuk
                </button>
              </div>

              {/* Sélecteurs compacts Forfait & Partenaire (uniquement s'il y en a plusieurs) */}
              {(availablePackages.length > 1 || availablePartners.length > 1 || hasExtraFilters) && (
                <div className="px-4 flex items-center gap-2 overflow-x-auto no-scrollbar">
                  {availablePackages.length > 1 && (
                    <select
                      value={pkgFilter}
                      onChange={e => setPkgFilter(e.target.value)}
                      className={`h-8 px-2.5 rounded-xl text-[11px] font-bold border outline-none shrink-0 cursor-pointer ${
                        pkgFilter !== 'all'
                          ? 'bg-blue-50 border-blue-300 text-blue-800'
                          : 'bg-slate-50 border-slate-200 text-slate-600'
                      }`}
                    >
                      <option value="all">Tous les forfaits</option>
                      {availablePackages.map(pkg => (
                        <option key={pkg} value={pkg}>{pkg}</option>
                      ))}
                    </select>
                  )}

                  {availablePartners.length > 1 && (
                    <select
                      value={partnerFilter}
                      onChange={e => setPartnerFilter(e.target.value)}
                      className={`h-8 px-2.5 rounded-xl text-[11px] font-bold border outline-none shrink-0 cursor-pointer ${
                        partnerFilter !== 'all'
                          ? 'bg-blue-50 border-blue-300 text-blue-800'
                          : 'bg-slate-50 border-slate-200 text-slate-600'
                      }`}
                    >
                      <option value="all">Tous les partenaires</option>
                      {availablePartners.map(part => (
                        <option key={part} value={part}>{part}</option>
                      ))}
                    </select>
                  )}

                  {hasExtraFilters && (
                    <button
                      type="button"
                      onClick={clearPickerFilters}
                      className="h-8 px-2.5 rounded-xl text-[11px] font-black text-rose-600 whitespace-nowrap shrink-0 cursor-pointer"
                    >
                      Réinitialiser
                    </button>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* ═══ 2. LISTE PLEIN ÉCRAN FLUIDE (style Contacts WhatsApp, 60fps) ═══ */}
        <div
          ref={listScrollRef}
          className="flex-1 overflow-y-auto overscroll-contain bg-white"
        >
          {isPelerinMode ? (
            visible.length === 0 ? (
              <div className="py-16 px-6 text-center space-y-2">
                <div className="w-12 h-12 rounded-full bg-slate-100 text-slate-400 flex items-center justify-center mx-auto">
                  <Search size={20} />
                </div>
                <p className="text-sm font-black text-slate-800">Aucun pèlerin trouvé</p>
                <p className="text-xs text-slate-400 font-medium">
                  Modifiez votre recherche ou réinitialisez les filtres.
                </p>
                {hasExtraFilters && (
                  <button
                    type="button"
                    onClick={clearPickerFilters}
                    className="mt-2 h-9 px-4 rounded-xl bg-slate-900 text-white text-xs font-black cursor-pointer"
                  >
                    Tout afficher
                  </button>
                )}
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {renderedPelerins.map(p => {
                  const id = String(p.id)
                  const checked = mode === 'groupe' ? selectedSet.has(id) : selectedIds[0] === id
                  const st = statusOf(p)
                  const reste = Math.max(0, (Number(p.prix_package) || 0) - (Number(p.total_paye) || 0))
                  const photoUrl = p.photo_url ? getPassportPublicUrl(p.photo_url) : null
                  const partner = assocOf(p)

                  return (
                    <button
                      key={id}
                      type="button"
                      onClick={() => (mode === 'groupe' ? toggle(id) : onConfirmIds([id]))}
                      style={{ contentVisibility: 'auto', containIntrinsicSize: '74px' }}
                      className={`w-full px-4 py-3 flex items-center gap-3.5 text-left transition-colors active:bg-slate-100/80 cursor-pointer ${
                        checked ? 'bg-blue-50/55' : 'bg-white'
                      }`}
                    >
                      {/* Photo de profil ronde style WhatsApp + coche en bas à droite si sélectionné */}
                      <div className="relative shrink-0">
                        <div
                          className={`w-12 h-12 rounded-full flex items-center justify-center font-black text-sm overflow-hidden border ${
                            checked
                              ? 'border-blue-600 bg-blue-100 text-blue-700'
                              : 'border-slate-200/80 bg-slate-100 text-slate-700'
                          }`}
                        >
                          {photoUrl ? (
                            <img
                              src={photoUrl}
                              alt={pName(p)}
                              loading="lazy"
                              decoding="async"
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <span>{getInit(p)}</span>
                          )}
                        </div>

                        {checked && (
                          <span className="absolute -bottom-0.5 -right-0.5 w-5 h-5 rounded-full bg-blue-600 text-white border-2 border-white flex items-center justify-center shadow-xs">
                            <Check size={11} strokeWidth={3.2} />
                          </span>
                        )}
                      </div>

                      {/* Identité claire & spacieuse */}
                      <div className="min-w-0 flex-1">
                        <div className="flex items-baseline justify-between gap-2">
                          <p className="font-bold text-[15px] text-slate-900 leading-snug truncate">
                            {pName(p)}
                          </p>
                          <span
                            className={`text-[11px] font-black shrink-0 ${
                              st === 'solde'
                                ? 'text-emerald-600'
                                : st === 'partiel'
                                ? 'text-amber-600'
                                : 'text-rose-600'
                            }`}
                          >
                            {STATUT_LABEL[st]}
                          </span>
                        </div>

                        <div className="flex items-center justify-between gap-2 mt-0.5">
                          <p className="text-xs text-slate-500 font-medium truncate">
                            <span className="font-mono text-slate-600">{p.num_passeport || 'Sans passeport'}</span>
                            {p.telephone_pelerin ? ` • ${p.telephone_pelerin}` : ''}
                          </p>
                          {st !== 'solde' && reste > 0 && (
                            <span className="text-[11px] font-bold text-slate-700 tabular-nums shrink-0">
                              -{fmt(reste)} {currencyUnit}
                            </span>
                          )}
                        </div>

                        {(p.nom_package || partner || p.reference || p.sur_plateforme_gouv || p.sur_plateforme_nusuk) && (
                          <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                            {p.nom_package && (
                              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 truncate max-w-[9rem]">
                                {p.nom_package}
                              </span>
                            )}
                            {partner && (
                              <span className="text-[10px] font-semibold text-slate-400 truncate max-w-[8rem]">
                                {partner}
                              </span>
                            )}
                            {p.reference && (
                              <span className="text-[10px] font-bold text-slate-400">
                                Réf {p.reference}
                              </span>
                            )}
                            {Boolean(p.sur_plateforme_gouv) && (
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" title="Gouv" />
                            )}
                            {Boolean(p.sur_plateforme_nusuk) && (
                              <span className="w-1.5 h-1.5 rounded-full bg-blue-500 shrink-0" title="Nusuk" />
                            )}
                          </div>
                        )}
                      </div>
                    </button>
                  )
                })}

                {visibleCount < visible.length && (
                  <div ref={loadMoreRef} className="py-4 text-center text-xs font-bold text-slate-400">
                    Chargement ({visibleCount} / {visible.length})…
                  </div>
                )}
              </div>
            )
          ) : filteredList.length === 0 ? (
            <div className="py-16 text-center text-xs text-slate-400 font-bold">Aucun résultat.</div>
          ) : (
            <div className="divide-y divide-slate-100">
              {filteredList.map(x => {
                const checked = cibleValeur === x.valeur
                const Icon = mode === 'reference' ? Tag : Building2
                return (
                  <button
                    key={x.valeur}
                    type="button"
                    onClick={() => onConfirmValue(x.valeur)}
                    className={`w-full px-4 py-3.5 flex items-center gap-3.5 text-left transition active:bg-slate-100 cursor-pointer ${
                      checked ? 'bg-blue-50/55' : 'bg-white'
                    }`}
                  >
                    <div
                      className={`w-11 h-11 rounded-full flex items-center justify-center shrink-0 ${
                        checked ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600'
                      }`}
                    >
                      <Icon size={18} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="font-bold text-[15px] text-slate-900 truncate">
                        {mode === 'reference' ? `Réf : ${x.valeur}` : x.valeur}
                      </p>
                      <p className="text-xs text-slate-400 font-medium mt-0.5">
                        {x.count} pèlerin{x.count > 1 ? 's' : ''} {mode === 'reference' ? 'dans ce dossier' : 'affilié(s)'}
                      </p>
                    </div>
                    <span className="text-xs font-black text-blue-700 bg-blue-50 px-2.5 py-1 rounded-full shrink-0 tabular-nums">
                      {x.count}
                    </span>
                  </button>
                )
              })}
            </div>
          )}
        </div>

        {/* ═══ 3. PIED FIXE (mode sélection multiple) ═══ */}
        {mode === 'groupe' && (
          <div className="shrink-0 px-4 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))] bg-white border-t border-slate-200/80 flex items-center gap-2.5">
            {sel.length > 0 && (
              <button
                type="button"
                onClick={() => setSel([])}
                className="h-12 px-4 rounded-2xl bg-slate-100 text-slate-700 font-black text-xs active:scale-95 transition cursor-pointer shrink-0"
              >
                Vider
              </button>
            )}
            <button
              type="button"
              onClick={() => onConfirmIds(sel)}
              className="flex-1 h-12 rounded-2xl bg-blue-600 active:bg-blue-700 text-white font-black text-sm shadow-sm active:scale-[0.98] transition cursor-pointer"
            >
              Valider la sélection ({sel.length})
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

/* ─────────────────────────── Page principale ─────────────────────────── */

export default function ComptabiliteHajj() {
  const { selectedYear } = useYear()
  const { setHideNavbar } = useUI()
  const { profile: workProfile } = useWorkProfile()
  const db = usePowerSync()
  const isMobile = useIsMobile()

  const [allPelerinsRaw, setAllPelerinsRaw] = useState<Pelerin[]>([])
  const [allDepensesRaw, setAllDepensesRaw] = useState<Depense[]>([])
  const [selectedDevise, setSelectedDevise] = useState<HajjCurrency>('FCFA')
  const [loading, setLoading] = useState<boolean>(true)
  const [expandedAgence, setExpandedAgence] = useState<string | null>(null)

  const curSymbol = getHajjCurrencySymbol(selectedDevise)
  const curShort = getHajjCurrencySymbol(selectedDevise, true)

  // Navigation
  const [tab, setTab] = useState<'apercu' | 'depenses'>('depenses')
  const [viewMode, setViewMode] = useState<'liste' | 'nature' | 'pelerin'>('liste')
  const [showNatureBars, setShowNatureBars] = useState(false)
  const [showFilters, setShowFilters] = useState(false)

  // Filtres / tri du journal
  const [filterDepenseSearch, setFilterDepenseSearch] = useState<string>('')
  const [sortKey, setSortKey] = useState<string>('date_desc')
  const [filterType, setFilterType] = useState<'all' | TypeCible>('all')
  const [filterNature, setFilterNature] = useState<string>('all')
  const [expandedDepense, setExpandedDepense] = useState<string | null>(null)
  const [detailId, setDetailId] = useState<string | null>(null)
  const [collapsedNatures, setCollapsedNatures] = useState<string[]>([])
  const [expandedPelerin, setExpandedPelerin] = useState<string | null>(null)

  // Formulaire (ajout / modification / duplication)
  const [showSheet, setShowSheet] = useState(false)
  const [showPicker, setShowPicker] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingLbl, setEditingLbl] = useState('')
  const [typeCible, setTypeCible] = useState<TypeCible>('pelerin')
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [cibleValeur, setCibleValeur] = useState<string>('')
  const [campagneBase, setCampagneBase] = useState<string | null>(null)
  const [dynamique, setDynamique] = useState<boolean>(false)
  const [libelle, setLibelle] = useState<string>("Billet d'avion")
  const [customLibelle, setCustomLibelle] = useState<string>('')
  const [montantSaisi, setMontantSaisi] = useState<string>('')
  const [modeCalcul, setModeCalcul] = useState<'unitaire' | 'total'>('unitaire')
  const [formLoading, setFormLoading] = useState<boolean>(false)

  // Ajout à une dépense existante
  const [addId, setAddId] = useState<string | null>(null)
  const [addMode, setAddMode] = useState<'pelerins' | 'montant'>('pelerins')
  const [addIds, setAddIds] = useState<string[]>([])
  const [addUnit, setAddUnit] = useState<string>('')
  const [addAmount, setAddAmount] = useState<string>('')
  const [addCalc, setAddCalc] = useState<'unitaire' | 'total'>('total')
  const [showAddPicker, setShowAddPicker] = useState(false)
  const [addLoading, setAddLoading] = useState(false)

  // UX Mobile native : assistant 3 étapes, pile 3D trésorerie, confirmation suppression & toast
  const [mobileStep, setMobileStep] = useState<1 | 2 | 3>(1)
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [toast, setToast] = useState<{ text: string; type: 'success' | 'error' } | null>(null)
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const [heroDeckIdx, setHeroDeckIdx] = useState(0)
  const [heroDragX, setHeroDragX] = useState(0)
  const heroTouchStartRef = useRef<{ x: number; y: number } | null>(null)
  const heroSwipeLockRef = useRef<'horizontal' | 'vertical' | null>(null)
  const heroDragXRef = useRef(0)

  const showToast = (text: string, type: 'success' | 'error' = 'success') => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current)
    setToast({ text, type })
    toastTimerRef.current = setTimeout(() => {
      setToast(null)
      toastTimerRef.current = null
    }, 2800)
  }

  useEffect(() => {
    return () => {
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current)
    }
  }, [])

  const handleHeroTouchStart = (e: React.TouchEvent) => {
    const t = e.touches[0]
    if (!t) return
    heroTouchStartRef.current = { x: t.clientX, y: t.clientY }
    heroSwipeLockRef.current = null
    heroDragXRef.current = 0
    setHeroDragX(0)
  }
  const handleHeroTouchMove = (e: React.TouchEvent) => {
    if (!heroTouchStartRef.current) return
    const t = e.touches[0]
    if (!t) return
    const dx = t.clientX - heroTouchStartRef.current.x
    const dy = t.clientY - heroTouchStartRef.current.y
    if (!heroSwipeLockRef.current) {
      if (Math.abs(dx) > 10 && Math.abs(dx) > Math.abs(dy)) {
        heroSwipeLockRef.current = 'horizontal'
      } else if (Math.abs(dy) > 10) {
        heroSwipeLockRef.current = 'vertical'
        return
      } else {
        return
      }
    }
    if (heroSwipeLockRef.current === 'horizontal') {
      const clamped = Math.max(-120, Math.min(120, dx))
      heroDragXRef.current = clamped
      setHeroDragX(clamped)
    }
  }
  const handleHeroTouchEnd = () => {
    const dragged = heroDragXRef.current
    heroTouchStartRef.current = null
    heroSwipeLockRef.current = null
    heroDragXRef.current = 0
    setHeroDragX(0)
    if (Math.abs(dragged) > 40) {
      setHeroDeckIdx(prev => (prev === 0 ? 1 : 0))
    }
  }

  const syncingRef = useRef<Set<string>>(new Set())

  // 🎯 Masquer automatiquement la navbar mobile dès qu'une fenêtre slide/modal est ouverte
  const anySheetOpen = Boolean(showSheet || showPicker || showFilters || detailId || addId || showAddPicker || deleteConfirmId)
  useEffect(() => {
    setHideNavbar(anySheetOpen)
    return () => setHideNavbar(false)
  }, [anySheetOpen, setHideNavbar])

  const filterByYear = (raw: any[]) => {
    return selectedYear === 'all'
      ? raw
      : raw.filter(p => {
        if (p.campagne === undefined || p.campagne === null) return false
        return Number(p.campagne) === Number(selectedYear)
      })
  }

  const { data: rawPelerins, isLoading: pelerinsLoading } = useQuery<any>(`
    SELECT p.*, a.nom_agence AS agence_nom_agence
    FROM pelerins p
    LEFT JOIN agences a ON p.agence_id = a.id
    ORDER BY p.created_at DESC
  `)
  const { data: rawDepenses, isLoading: depensesLoading } = useQuery<Depense>(
    'SELECT * FROM depenses_hajj ORDER BY created_at DESC',
  )

  useEffect(() => {
    const mappedPelerins: Pelerin[] = (rawPelerins ?? []).map((p: any) => ({
      ...p,
      total_paye: Number(p.total_paye || 0),
      prix_package: Number(p.prix_package || 0),
      devise: normalizeHajjCurrency(p.devise),
      agences: p.agence_nom_agence ? { nom_agence: p.agence_nom_agence } : undefined,
    }))
    const mappedDepenses: Depense[] = (rawDepenses ?? []).map((d: any) => ({
      ...d,
      montant: Number(d.montant || 0),
      devise: normalizeHajjCurrency(d.devise),
    }))
    setAllPelerinsRaw(mappedPelerins)
    setAllDepensesRaw(mappedDepenses)
    setLoading(pelerinsLoading || depensesLoading)
  }, [rawPelerins, rawDepenses, pelerinsLoading, depensesLoading])

  // Compteurs de pèlerins par devise sur l'année sélectionnée
  const yearPelerins = useMemo(() => filterByYear(allPelerinsRaw), [allPelerinsRaw, selectedYear])
  const deviseCounts = useMemo(() => countByCurrency(yearPelerins), [yearPelerins])

  // Isolation stricte par devise : aucun mélange possible
  const allPelerins = useMemo(
    () => allPelerinsRaw.filter(p => p.devise === selectedDevise),
    [allPelerinsRaw, selectedDevise]
  )
  const data = useMemo(
    () => yearPelerins.filter(p => p.devise === selectedDevise),
    [yearPelerins, selectedDevise]
  )
  const depenses = useMemo(
    () => allDepensesRaw.filter(d => d.devise === selectedDevise),
    [allDepensesRaw, selectedDevise]
  )

  /* ---------- Groupements pour le sélecteur ---------- */
  const referencesList = useMemo(() => {
    const map = new Map<string, number>()
    data.forEach(p => {
      const ref = p.reference?.trim()
      if (ref) map.set(ref, (map.get(ref) || 0) + 1)
    })
    return Array.from(map.entries()).map(([valeur, count]) => ({ valeur, count }))
  }, [data])

  const associesList = useMemo(() => {
    const map = new Map<string, number>()
    data.forEach(p => {
      const asc = assocOf(p)
      if (asc) map.set(asc, (map.get(asc) || 0) + 1)
    })
    return Array.from(map.entries()).map(([valeur, count]) => ({ valeur, count }))
  }, [data])

  /* ---------- Lignes du journal (montants effectifs, dynamiques inclus) ---------- */
  const rows = useMemo<Row[]>(
    () =>
      depenses.map(d => {
        const meta = parseCible(d.cible_valeur)
        const targets = resolveTargets(d, allPelerins)
        const isList = d.type_cible === 'pelerin' || d.type_cible === 'groupe'
        const dyn = !isList && meta.dyn !== null
        const stored = Number(d.montant) || 0
        const count = Math.max(isList ? idsOf(meta.base).length : targets.length, 1)
        const montant = dyn && targets.length > 0 ? Math.round((meta.dyn as number) * targets.length) : stored
        const unitExact = dyn ? (meta.dyn as number) : montant / count
        const label = cibleLabel(d, targets, meta, count)
        const names = d.type_cible === 'global' ? '' : targets.map(pName).join(' ')
        return {
          d,
          meta,
          targets,
          count,
          stored,
          montant,
          unit: Math.round(unitExact),
          unitExact,
          dyn,
          isList,
          label,
          blob: `${d.libelle} ${d.type_cible} ${TYPE_META[d.type_cible]?.short ?? ''} ${label} ${meta.base} ${names} ${d.recorded_by_name || ''} ${formatProfileRoleLabel(d.recorded_by_role)}`.toLowerCase(),
        }
      }),
    [depenses, allPelerins],
  )

  /* ---------- Synchronisation automatique des dépenses dynamiques ---------- */
  useEffect(() => {
    if (loading || pelerinsLoading || depensesLoading) return
    rows.forEach(r => {
      if (!r.dyn || r.targets.length === 0 || r.montant === r.stored) return
      const key = `${r.d.id}:${r.montant}`
      if (syncingRef.current.has(key)) return
      syncingRef.current.add(key)
        ; (async () => {
          try {
            const { data: upd, error } = await supabase
              .from('depenses_hajj')
              .update({ montant: r.montant })
              .eq('id', r.d.id)
              .select('id')
            requireSupabaseRows(upd, error, 'mise à jour dynamique de la dépense Hajj')
            await db.execute('UPDATE depenses_hajj SET montant = ? WHERE id = ?', [r.montant, r.d.id])
          } catch {
            syncingRef.current.delete(key)
          }
        })()
    })
  }, [rows, loading, pelerinsLoading, depensesLoading])

  /* ---------- Calculs du formulaire ---------- */
  const isRuleType = typeCible === 'global' || typeCible === 'reference' || typeCible === 'associe'
  const ruleBase = typeCible === 'global' ? (campagneBase ?? `campagne_${selectedYear}`) : cibleValeur.trim()
  const ruleTargets = useMemo(
    () =>
      isRuleType && ruleBase ? resolveTargets({ type_cible: typeCible, cible_valeur: ruleBase }, allPelerins) : [],
    [isRuleType, typeCible, ruleBase, allPelerins],
  )
  const cibleImpactCount = isRuleType ? ruleTargets.length : selectedIds.length

  const isTargetValid = isRuleType
    ? (typeCible === 'global' || cibleValeur !== '') && ruleTargets.length > 0
    : selectedIds.length > 0

  const effMode: 'unitaire' | 'total' = isRuleType && dynamique ? 'unitaire' : modeCalcul
  const montantNumerique = parseAmount(montantSaisi)
  const montantTotalStocke = effMode === 'unitaire' ? montantNumerique * Math.max(cibleImpactCount, 1) : montantNumerique

  const montantUnitaireCalcule = (() => {
    if (cibleImpactCount <= 1) return montantTotalStocke
    if (effMode === 'unitaire') return montantNumerique
    return Math.round(montantNumerique / cibleImpactCount)
  })()

  const finalLibelle = libelle === 'Autre' ? customLibelle.trim() : libelle
  const editingRow = editingId ? rows.find(r => r.d.id === editingId) : undefined
  const deltaEdition = editingRow ? montantTotalStocke - editingRow.montant : 0

  const targetSummary = (() => {
    if (typeCible === 'pelerin') {
      if (!selectedIds[0]) return ''
      const p = allPelerins.find(x => String(x.id) === selectedIds[0])
      return p ? `${pName(p)} • ${p.num_passeport || 'Sans passeport'}` : `Pèlerin #${selectedIds[0]}`
    }
    if (typeCible === 'groupe') return selectedIds.length ? `${selectedIds.length} pèlerin(s) sélectionné(s)` : ''
    if (typeCible === 'reference') return cibleValeur ? `Dossier Réf : ${cibleValeur} (${cibleImpactCount} pers.)` : ''
    if (typeCible === 'associe') return cibleValeur ? `Partenaire : ${cibleValeur} (${cibleImpactCount} pers.)` : ''
    return ''
  })()

  /* ---------- Totaux globaux ---------- */
  const totalDepenses = useMemo(() => rows.reduce((acc, r) => acc + r.montant, 0), [rows])
  const totalEncaisse = data.reduce((acc, p) => acc + (Number(p.total_paye) || 0), 0)
  const totalAttendu = data.reduce((acc, p) => acc + (Number(p.prix_package) || 0), 0)
  const totalRestant = totalAttendu - totalEncaisse
  const tauxRecouvrement = totalAttendu > 0 ? Math.round((totalEncaisse / totalAttendu) * 100) : 0
  const beneficeReel = totalEncaisse - totalDepenses
  const enAttente = data.filter(p => (Number(p.total_paye) || 0) < (Number(p.prix_package) || 0))

  const packages: Record<string, PackageData> = {}
  data.forEach(p => {
    const nom = p.nom_package || 'Non défini'
    if (!packages[nom]) packages[nom] = { count: 0, encaisse: 0, attendu: 0 }
    packages[nom].count++
    packages[nom].encaisse += Number(p.total_paye) || 0
    packages[nom].attendu += Number(p.prix_package) || 0
  })

  const agences: Record<string, AgenceData> = {}
  data.forEach(p => {
    const nom = p.agences?.nom_agence || p.agence_ou_personne_associee || 'Sans agence'
    if (!agences[nom]) agences[nom] = { pelerins: [], encaisse: 0, attendu: 0 }
    agences[nom].pelerins.push(p)
    agences[nom].encaisse += Number(p.total_paye) || 0
    agences[nom].attendu += Number(p.prix_package) || 0
  })

  /* ---------- Natures, filtres, tri, groupements ---------- */
  const natures = useMemo(() => {
    const m = new Map<string, { libelle: string; count: number; total: number }>()
    rows.forEach(r => {
      const e = m.get(r.d.libelle) ?? { libelle: r.d.libelle, count: 0, total: 0 }
      e.count++
      e.total += r.montant
      m.set(r.d.libelle, e)
    })
    return Array.from(m.values()).sort((a, b) => b.total - a.total)
  }, [rows])

  const effectiveNature = natures.some(n => n.libelle === filterNature) ? filterNature : 'all'

  const filteredRows = useMemo(() => {
    const q = filterDepenseSearch.trim().toLowerCase()
    const time = (r: Row) => new Date(r.d.created_at || 0).getTime()
    const list = rows.filter(r => {
      if (filterType !== 'all' && r.d.type_cible !== filterType) return false
      if (effectiveNature !== 'all' && r.d.libelle !== effectiveNature) return false
      return !q || r.blob.includes(q)
    })
    list.sort((a, b) => {
      switch (sortKey) {
        case 'date_asc':
          return time(a) - time(b)
        case 'nature_asc':
          return a.d.libelle.localeCompare(b.d.libelle, 'fr') || time(b) - time(a)
        case 'montant_desc':
          return b.montant - a.montant
        case 'montant_asc':
          return a.montant - b.montant
        case 'cible_asc':
          return a.label.localeCompare(b.label, 'fr')
        case 'count_desc':
          return b.count - a.count
        default:
          return time(b) - time(a)
      }
    })
    return list
  }, [rows, filterDepenseSearch, filterType, effectiveNature, sortKey])

  const filteredTotal = filteredRows.reduce((acc, r) => acc + r.montant, 0)
  const hasActiveFilter = filterType !== 'all' || effectiveNature !== 'all' || filterDepenseSearch.trim() !== ''
  const activeFilterCount = (filterType !== 'all' ? 1 : 0) + (effectiveNature !== 'all' ? 1 : 0) + (sortKey !== 'date_desc' ? 1 : 0)

  const groupedByDate = useMemo(() => {
    const groups: Array<{ label: string; rows: Row[]; total: number }> = []
    const byLabel = new Map<string, { label: string; rows: Row[]; total: number }>()
    for (const r of filteredRows) {
      const label = getDateGroupLabel(r.d.created_at)
      let g = byLabel.get(label)
      if (!g) {
        g = { label, rows: [], total: 0 }
        byLabel.set(label, g)
        groups.push(g)
      }
      g.rows.push(r)
      g.total += r.montant
    }
    return groups
  }, [filteredRows])

  const groupedByNature = useMemo(() => {
    const m = new Map<string, { libelle: string; rows: Row[]; total: number }>()
    filteredRows.forEach(r => {
      const e = m.get(r.d.libelle) ?? { libelle: r.d.libelle, rows: [], total: 0 }
      e.rows.push(r)
      e.total += r.montant
      m.set(r.d.libelle, e)
    })
    return Array.from(m.values()).sort((a, b) => b.total - a.total)
  }, [filteredRows])

  const perPelerin = useMemo(() => {
    const m = new Map<string, { p: Pelerin; cout: number; lignes: { id: string; libelle: string; part: number }[] }>()
    filteredRows.forEach(r => {
      if (!r.targets.length) return
      const part = r.montant / r.targets.length
      r.targets.forEach(p => {
        const k = String(p.id)
        const e = m.get(k) ?? { p, cout: 0, lignes: [] }
        e.cout += part
        e.lignes.push({ id: r.d.id, libelle: r.d.libelle, part })
        m.set(k, e)
      })
    })
    return Array.from(m.values()).sort((a, b) => b.cout - a.cout)
  }, [filteredRows])

  /* ---------- Persistance ---------- */
  const persistUpdate = async (
    id: string,
    patch: Partial<Pick<Depense, 'type_cible' | 'cible_valeur' | 'libelle' | 'montant' | 'devise'>>,
  ) => {
    const { data: upd, error } = await supabase.from('depenses_hajj').update(patch).eq('id', id).select('id')
    requireSupabaseRows(upd, error, 'modification de la dépense Hajj')
    const keys = Object.keys(patch)
    await db.execute(
      `UPDATE depenses_hajj SET ${keys.map(k => `${k} = ?`).join(', ')} WHERE id = ?`,
      [...keys.map(k => (patch as any)[k]), id],
    )
  }

  /* ---------- Formulaire : actions ---------- */
  const resetForm = () => {
    setTypeCible('pelerin')
    setSelectedIds([])
    setCibleValeur('')
    setCampagneBase(null)
    setDynamique(false)
    setLibelle("Billet d'avion")
    setCustomLibelle('')
    setMontantSaisi('')
    setModeCalcul('unitaire')
    setEditingId(null)
    setEditingLbl('')
  }

  const openNew = () => {
    resetForm()
    setDetailId(null)
    setMobileStep(1)
    setShowSheet(true)
  }

  const openEdit = (r: Row, duplicate = false) => {
    const d = r.d
    setDetailId(null)
    setTypeCible(d.type_cible)
    setEditingLbl(r.meta.lbl)
    setDynamique(r.dyn)
    setCampagneBase(d.type_cible === 'global' ? r.meta.base : null)
    setCibleValeur(d.type_cible === 'reference' || d.type_cible === 'associe' ? r.meta.base : '')

    if (d.type_cible === 'pelerin') setSelectedIds([r.meta.base])
    else if (d.type_cible === 'groupe') setSelectedIds(idsOf(r.meta.base))
    else setSelectedIds([])

    if (LIBELLES.includes(d.libelle)) {
      setLibelle(d.libelle)
      setCustomLibelle('')
    } else {
      setLibelle('Autre')
      setCustomLibelle(d.libelle)
    }

    if (r.dyn) {
      setModeCalcul('unitaire')
      setMontantSaisi(formatAmount(r.meta.dyn as number))
    } else if (r.stored % r.count === 0) {
      setModeCalcul('unitaire')
      setMontantSaisi(formatAmount(r.stored / r.count))
    } else {
      setModeCalcul('total')
      setMontantSaisi(formatAmount(r.stored))
    }
    setEditingId(duplicate ? null : d.id)
    setMobileStep(duplicate ? 1 : 3)
    setShowSheet(true)
  }

  const closeSheet = () => {
    setShowSheet(false)
    setShowPicker(false)
    resetForm()
  }

  const changeType = (id: TypeCible) => {
    if (id === typeCible) return
    if (typeCible === 'pelerin' && id === 'groupe') {
      // on conserve le pèlerin déjà choisi
    } else if (typeCible === 'groupe' && id === 'pelerin') {
      setSelectedIds(s => s.slice(0, 1))
    } else {
      setSelectedIds([])
      setCibleValeur('')
      setCampagneBase(null)
    }
    setTypeCible(id)
  }

  const handleSaveDepense = async () => {
    if (formLoading || !isTargetValid || montantTotalStocke <= 0) return
    if (libelle === 'Autre' && !customLibelle.trim()) return

    setFormLoading(true)
    let type_cible: TypeCible
    let cible_valeur: string

    if (isRuleType) {
      if (dynamique) {
        type_cible = typeCible
        cible_valeur = buildCible(ruleBase, { dyn: montantNumerique })
      } else {
        type_cible = 'groupe'
        cible_valeur = buildCible(ruleTargets.map(p => String(p.id)).join(','), { lbl: ruleLabelOf(typeCible, ruleBase) })
      }
    } else if (typeCible === 'pelerin') {
      type_cible = 'pelerin'
      cible_valeur = selectedIds[0]
    } else {
      type_cible = 'groupe'
      cible_valeur = buildCible(selectedIds.join(','), { lbl: editingLbl })
    }

    const payload = {
      type_cible,
      cible_valeur,
      libelle: finalLibelle || 'Frais divers',
      montant: montantTotalStocke,
      devise: selectedDevise,
    }

    try {
      if (editingId) {
        await persistUpdate(editingId, payload)
      } else {
        const depense = {
          id: crypto.randomUUID(),
          ...payload,
          recorded_by_name: workProfile?.name?.trim() || null,
          recorded_by_role: workProfile?.profile_type || null,
          created_at: new Date().toISOString(),
        }
        const { error } = await supabase.from('depenses_hajj').insert(depense)
        if (error) throw error
        await db.execute(
          'INSERT OR REPLACE INTO depenses_hajj (id, type_cible, cible_valeur, libelle, montant, devise, recorded_by_name, recorded_by_role, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
          [depense.id, depense.type_cible, depense.cible_valeur, depense.libelle, depense.montant, depense.devise, depense.recorded_by_name, depense.recorded_by_role, depense.created_at],
        )
      }
      const wasEditing = Boolean(editingId)
      closeSheet()
      showToast(wasEditing ? 'Dépense modifiée' : 'Dépense enregistrée')
    } catch {
      showToast(
        editingId ? 'Erreur lors de la modification de la dépense.' : "Erreur lors de l'enregistrement de la dépense.",
        'error'
      )
    }
    setFormLoading(false)
  }

  const executeDeleteDepense = async (id: string) => {
    setDeleting(true)
    try {
      const { data, error } = await supabase.from('depenses_hajj').delete().eq('id', id).select('id')
      requireSupabaseRows(data, error, 'suppression de la dépense Hajj')
      await db.execute('DELETE FROM depenses_hajj WHERE id = ?', [id])
      setExpandedDepense(null)
      setDetailId(null)
      setDeleteConfirmId(null)
      showToast('Dépense supprimée')
    } catch {
      showToast('Erreur lors de la suppression de la dépense.', 'error')
    } finally {
      setDeleting(false)
    }
  }

  const handleDeleteDepense = async (id: string) => {
    if (isMobile) {
      setDeleteConfirmId(id)
      return
    }
    if (!confirm('Supprimer cette écriture de dépense ?')) return
    await executeDeleteDepense(id)
  }

  /* ---------- Ajout à une dépense existante ---------- */
  const addRow = addId ? rows.find(r => r.d.id === addId) : undefined
  const addPelerinsAvailable = !!addRow && addRow.isList && !addRow.dyn
  const addUnitVal = parseAmount(addUnit)
  const addVal = parseAmount(addAmount)

  const addPool = useMemo(() => {
    if (!addRow) return []
    const existing = new Set(idsOf(addRow.meta.base))
    return data.filter(p => !existing.has(String(p.id)))
  }, [addRow, data])

  const addResult = (() => {
    if (!addRow) return { add: 0, newTotal: 0, newCount: 0, newUnit: 0, newDynUnit: 0 }
    if (addMode === 'pelerins') {
      const k = addIds.length
      const add = addUnitVal * k
      const newTotal = addRow.montant + add
      const newCount = addRow.count + k
      return { add, newTotal, newCount, newUnit: Math.round(newTotal / Math.max(newCount, 1)), newDynUnit: 0 }
    }
    if (addRow.dyn) {
      const newDynUnit = (addRow.meta.dyn as number) + addVal
      const newTotal = Math.round(newDynUnit * Math.max(addRow.targets.length, 1))
      return { add: newTotal - addRow.montant, newTotal, newCount: addRow.count, newUnit: Math.round(newDynUnit), newDynUnit }
    }
    const add = addCalc === 'unitaire' && addRow.count > 1 ? addVal * addRow.count : addVal
    const newTotal = addRow.montant + add
    return { add, newTotal, newCount: addRow.count, newUnit: Math.round(newTotal / addRow.count), newDynUnit: 0 }
  })()

  const canSaveAdd =
    !!addRow && addResult.add > 0 && (addMode !== 'pelerins' || (addIds.length > 0 && addUnitVal > 0))

  const openAdd = (r: Row) => {
    setDetailId(null)
    setAddId(r.d.id)
    setAddMode(r.isList && !r.dyn ? 'pelerins' : 'montant')
    setAddIds([])
    setAddUnit(formatAmount(Math.round(r.unitExact)))
    setAddAmount('')
    setAddCalc(r.count > 1 ? 'unitaire' : 'total')
    setShowAddPicker(false)
  }

  const closeAdd = () => {
    setAddId(null)
    setShowAddPicker(false)
    setAddIds([])
    setAddAmount('')
  }

  const handleAdd = async () => {
    if (!addRow || !canSaveAdd || addLoading) return
    setAddLoading(true)
    try {
      if (addMode === 'pelerins') {
        const ids = Array.from(new Set([...idsOf(addRow.meta.base), ...addIds]))
        await persistUpdate(addRow.d.id, {
          type_cible: 'groupe',
          cible_valeur: buildCible(ids.join(','), { lbl: addRow.meta.lbl }),
          montant: addResult.newTotal,
        })
      } else if (addRow.dyn) {
        await persistUpdate(addRow.d.id, {
          cible_valeur: buildCible(addRow.meta.base, { dyn: addResult.newDynUnit, lbl: addRow.meta.lbl }),
          montant: addResult.newTotal,
        })
      } else {
        await persistUpdate(addRow.d.id, { montant: addResult.newTotal })
      }
      closeAdd()
      showToast('Ajout enregistré sur la dépense')
    } catch {
      showToast("Erreur lors de l'ajout à la dépense.", 'error')
    }
    setAddLoading(false)
  }

  /* ---------- Divers ---------- */
  const exportCsv = () => {
    const header = ['Date', 'Devise', 'Nature', 'Type', 'Mode', 'Cible', 'Enregistrée par', 'Nb pèlerins', `Quote-part (${curSymbol})`, `Montant total (${curSymbol})`]
    const lines = filteredRows.map(r => [
      r.d.created_at ? new Date(r.d.created_at).toLocaleDateString('fr-FR') : '',
      selectedDevise,
      r.d.libelle,
      TYPE_META[r.d.type_cible]?.label ?? r.d.type_cible,
      r.dyn ? 'Dynamique' : 'Fixe',
      r.label,
      formatAuthorInline(r.d.recorded_by_name, r.d.recorded_by_role) || '—',
      r.count,
      r.unit,
      r.montant,
    ])
    const esc = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`
    const csv = '\uFEFF' + [header, ...lines].map(l => l.map(esc).join(';')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `depenses_hajj_${selectedYear}_${selectedDevise}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const goNature = (lib: string) => {
    setFilterNature(lib === effectiveNature && tab === 'depenses' ? 'all' : lib)
    setTab('depenses')
  }

  const resetFilters = () => {
    setFilterDepenseSearch('')
    setFilterType('all')
    setFilterNature('all')
    setSortKey('date_desc')
  }

  /* ---------- Rendus partiels ---------- */
  const renderNatureBars = (limit?: number) => (
    <div className="space-y-3">
      {(limit ? natures.slice(0, limit) : natures).map(n => {
        const pct = totalDepenses > 0 ? Math.round((n.total / totalDepenses) * 100) : 0
        const active = effectiveNature === n.libelle && tab === 'depenses'
        return (
          <button key={n.libelle} type="button" onClick={() => goNature(n.libelle)} className="w-full text-left active:opacity-70 cursor-pointer">
            <div className="flex items-center justify-between gap-2 text-xs mb-1">
              <span className={`font-bold truncate ${active ? 'text-blue-700' : 'text-slate-800'}`}>
                {n.libelle} <span className="text-slate-400 font-semibold">×{n.count}</span>
              </span>
              <span className="font-black text-slate-900 tabular-nums shrink-0">
                {fmt(n.total)} {curShort} <span className="text-slate-400 font-bold">• {pct}%</span>
              </span>
            </div>
            <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
              <div className={`h-full rounded-full transition-all ${active ? 'bg-blue-600' : 'bg-amber-500'}`} style={{ width: `${pct}%` }} />
            </div>
          </button>
        )
      })}
    </div>
  )

  const renderTypeChips = () => (
    <div className="flex flex-wrap gap-1.5">
      {([['all', 'Tous types'], ...TYPE_ORDER.map(t => [t, TYPE_META[t].short] as const)] as [string, string][]).map(([id, label]) => (
        <button
          key={id}
          type="button"
          onClick={() => setFilterType(id as 'all' | TypeCible)}
          className={`px-3 py-1.5 rounded-full text-[11px] font-bold border transition-colors cursor-pointer ${filterType === id ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
            }`}
        >
          {label}
        </button>
      ))}
    </div>
  )

  const renderNatureChips = () => (
    <div className="flex flex-wrap gap-1.5">
      <button
        type="button"
        onClick={() => setFilterNature('all')}
        className={`px-3 py-1.5 rounded-full text-[11px] font-bold border transition-colors cursor-pointer ${effectiveNature === 'all' ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
          }`}
      >
        Toutes natures
      </button>
      {natures.map(n => (
        <button
          key={n.libelle}
          type="button"
          onClick={() => setFilterNature(effectiveNature === n.libelle ? 'all' : n.libelle)}
          className={`px-3 py-1.5 rounded-full text-[11px] font-bold border transition-colors cursor-pointer ${effectiveNature === n.libelle ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
            }`}
        >
          {n.libelle} <span className="opacity-70">({n.count})</span>
        </button>
      ))}
    </div>
  )

  const searchBox = (
    <div className="relative flex-1 min-w-0">
      <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
      <input
        type="text"
        placeholder="Rechercher nature, pèlerin, réf, partenaire…"
        value={filterDepenseSearch}
        onChange={e => setFilterDepenseSearch(e.target.value)}
        className="w-full pl-10 pr-8 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs sm:text-sm font-semibold outline-none focus:border-blue-600"
      />
      {filterDepenseSearch && (
        <button
          type="button"
          onClick={() => setFilterDepenseSearch('')}
          className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-slate-400"
          aria-label="Effacer"
        >
          <X size={14} />
        </button>
      )}
    </div>
  )

  const viewSwitch = (
    <div className="grid grid-cols-3 gap-1 p-1 bg-slate-100 rounded-xl">
      {([
        ['liste', 'Journal', Receipt],
        ['nature', 'Par nature', Layers],
        ['pelerin', 'Par pèlerin', UserCheck],
      ] as const).map(([id, label, Icon]) => (
        <button
          key={id}
          type="button"
          onClick={() => setViewMode(id)}
          className={`py-2 rounded-lg text-[11px] sm:text-xs font-black flex items-center justify-center gap-1.5 transition-all cursor-pointer ${viewMode === id ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-500'
            }`}
        >
          <Icon size={13} /> <span className="truncate">{label}</span>
        </button>
      ))}
    </div>
  )

  const sortSelect = (
    <div className="relative flex-1">
      <ArrowUpDown size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
      <select
        value={sortKey}
        onChange={e => setSortKey(e.target.value)}
        className="w-full pl-9 pr-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold outline-none focus:border-blue-600 cursor-pointer appearance-none"
      >
        {SORT_OPTIONS.map(o => (
          <option key={o.id} value={o.id}>{o.label}</option>
        ))}
      </select>
    </div>
  )

  const renderPelerinChips = (r: Row) => {
    const shown = r.targets.slice(0, 24)
    if (r.targets.length === 0) {
      return (
        <p className="text-[11px] text-amber-700 font-semibold bg-amber-50 border border-amber-100 rounded-xl p-2.5">
          Aucun pèlerin trouvé pour cette cible (pèlerin supprimé ou liste pas encore synchronisée).
        </p>
      )
    }
    return (
      <div>
        <p className="text-[10px] font-black text-slate-400 uppercase tracking-wider mb-1.5">Pèlerins concernés ({r.targets.length})</p>
        <div className="flex flex-wrap gap-1.5">
          {shown.map(p => (
            <span key={String(p.id)} className="text-[11px] font-semibold text-slate-700 bg-white border border-slate-200 rounded-lg px-2 py-1">
              {pName(p)}
              {r.count > 1 && <span className="text-slate-400"> • {fmt(r.unit)} {curShort}</span>}
            </span>
          ))}
          {r.targets.length > shown.length && (
            <span className="text-[11px] font-bold text-slate-400 px-2 py-1">+{r.targets.length - shown.length} autres</span>
          )}
        </div>
      </div>
    )
  }

  const renderActions = (r: Row) => (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
      <button
        type="button"
        onClick={() => openAdd(r)}
        className="h-11 md:h-10 rounded-2xl md:rounded-xl bg-blue-600 active:bg-blue-700 text-white text-xs font-black flex items-center justify-center gap-1.5 cursor-pointer"
      >
        <UserPlus size={14} /> Ajouter
      </button>
      <button
        type="button"
        onClick={() => openEdit(r)}
        className="h-11 md:h-10 rounded-2xl md:rounded-xl bg-slate-900 active:bg-slate-800 text-white text-xs font-black flex items-center justify-center gap-1.5 cursor-pointer"
      >
        <Pencil size={13} /> Modifier
      </button>
      <button
        type="button"
        onClick={() => openEdit(r, true)}
        className="h-11 md:h-10 rounded-2xl md:rounded-xl bg-white border border-slate-200 active:bg-slate-100 text-slate-700 text-xs font-black flex items-center justify-center gap-1.5 cursor-pointer"
      >
        <Copy size={13} /> Dupliquer
      </button>
      <button
        type="button"
        onClick={() => handleDeleteDepense(r.d.id)}
        className="h-11 md:h-10 rounded-2xl md:rounded-xl bg-white border border-rose-200 active:bg-rose-50 text-rose-600 text-xs font-black flex items-center justify-center gap-1.5 cursor-pointer"
      >
        <Trash2 size={13} /> Supprimer
      </button>
    </div>
  )

  const renderRow = (r: Row) => {
    const open = expandedDepense === r.d.id
    const meta = TYPE_META[r.d.type_cible] ?? TYPE_META.global
    const Icon = meta.icon

    if (isMobile) {
      return (
        <button
          key={r.d.id}
          type="button"
          onClick={() => setDetailId(r.d.id)}
          className="w-full p-3.5 flex items-center gap-3 text-left active:bg-slate-50 cursor-pointer"
        >
          <div className="w-9 h-9 rounded-xl bg-slate-100 text-slate-600 flex items-center justify-center shrink-0">
            <Icon size={16} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <p className="font-bold text-slate-900 text-xs sm:text-sm truncate">{r.d.libelle}</p>
              {r.dyn && <RefreshCw size={11} className="text-blue-600 shrink-0" />}
            </div>
            <p className="text-[11px] text-slate-500 truncate mt-0.5">{r.label}</p>
            <p className="text-[10px] text-slate-400 mt-0.5 truncate">
              {r.targets.length === 0 && !r.isList ? 'Cible introuvable' : `${r.count} pers.`}
              {r.count > 1 && ` • ${fmt(r.unit)} ${curShort}/pers.`}
              {r.d.created_at && ` • ${new Date(r.d.created_at).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' })}`}
              {r.d.recorded_by_name && ` • Par ${r.d.recorded_by_name}`}
            </p>
          </div>
          <div className="text-right shrink-0">
            <p className="text-xs sm:text-sm font-black text-rose-600 tabular-nums">-{fmt(r.montant)}</p>
            <p className="text-[9px] text-slate-400 font-bold">{curSymbol}</p>
          </div>
        </button>
      )
    }

    return (
      <div key={r.d.id} className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
        <button
          type="button"
          onClick={() => setExpandedDepense(open ? null : r.d.id)}
          className="w-full p-3.5 text-left flex items-start gap-3 hover:bg-slate-50/60 cursor-pointer"
        >
          <div className="p-2 bg-slate-100 rounded-xl text-slate-600 shrink-0">
            <Icon size={16} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5 flex-wrap">
              <p className="font-black text-slate-900 text-sm leading-tight">{r.d.libelle}</p>
              <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-md bg-slate-100 text-slate-600 uppercase border border-slate-200">
                {meta.short}
              </span>
              {r.dyn && (
                <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-md bg-blue-50 text-blue-700 uppercase border border-blue-100 inline-flex items-center gap-1">
                  <RefreshCw size={9} /> Dynamique
                </span>
              )}
            </div>
            <p className="text-xs text-slate-500 truncate mt-0.5">{r.label}</p>
            <p className="text-[11px] text-slate-400 mt-0.5 flex items-center gap-1.5 flex-wrap">
              <span>
                {r.targets.length === 0 && !r.isList ? 'Cible introuvable' : `${r.count} pèlerin(s)`}
                {r.count > 1 && ` • ${fmt(r.unit)} ${curShort} / pers.`}
                {r.d.created_at && ` • ${new Date(r.d.created_at).toLocaleDateString('fr-FR')}`}
              </span>
              {r.d.recorded_by_name && (
                <span className="inline-flex items-center gap-1 text-[10px] font-bold text-slate-600">
                  • Par <strong className="text-slate-800">{r.d.recorded_by_name}</strong>
                  {formatProfileRoleLabel(r.d.recorded_by_role) && (
                    <span className={`px-1.5 py-0.2 rounded border text-[9px] font-black uppercase ${getProfileRoleBadgeClass(r.d.recorded_by_role)}`}>
                      {formatProfileRoleLabel(r.d.recorded_by_role)}
                    </span>
                  )}
                </span>
              )}
            </p>
          </div>
          <div className="text-right shrink-0 flex flex-col items-end">
            <p className="text-sm font-black text-rose-600 tabular-nums">-{fmt(r.montant)}</p>
            <p className="text-[10px] text-slate-400 font-bold">{curSymbol}</p>
            <ChevronDown size={14} className={`text-slate-300 mt-1 transition-transform ${open ? 'rotate-180' : ''}`} />
          </div>
        </button>

        {open && (
          <div className="border-t border-slate-100 bg-slate-50/70 p-3.5 space-y-3">
            {r.dyn && (
              <p className="text-[11px] text-blue-800 font-semibold bg-blue-50 border border-blue-100 rounded-xl p-2.5">
                Dépense dynamique : le total ({fmt(r.montant)} {curShort}) suit automatiquement les pèlerins ajoutés ou retirés ({fmt(r.unit)} {curShort} × {r.targets.length}).
              </p>
            )}
            {renderPelerinChips(r)}
            {renderActions(r)}
          </div>
        )}
      </div>
    )
  }

  const renderRowList = (list: Row[], nested = false) =>
    isMobile ? (
      <div className={nested ? 'divide-y divide-slate-100' : 'bg-white border border-slate-200 rounded-2xl divide-y divide-slate-100 overflow-hidden'}>
        {list.map(renderRow)}
      </div>
    ) : (
      <div className={nested ? 'p-2.5 space-y-2 bg-slate-50 border-t border-slate-100' : 'space-y-2.5'}>{list.map(renderRow)}</div>
    )

  const detailRow = detailId ? rows.find(r => r.d.id === detailId) : undefined

  /* ───────────────────────────── Rendu ───────────────────────────── */
  const handleSelectDevise = (next: HajjCurrency) => {
    setSelectedDevise(next)
    setExpandedAgence(null)
    setExpandedDepense(null)
    setExpandedPelerin(null)
    setDetailId(null)
    resetFilters()
  }

  return (
    <div className="min-h-screen bg-slate-50 md:bg-transparent text-slate-800">
      {/* ── TOAST NATIF FLOTTANT ── */}
      {toast && (
        <div
          onClick={() => setToast(null)}
          className={`fixed top-[max(1rem,env(safe-area-inset-top))] left-1/2 -translate-x-1/2 z-[10002] max-w-[calc(100vw-2rem)] px-4 py-2.5 rounded-full shadow-xl border flex items-center gap-2 text-xs font-bold cursor-pointer animate-in fade-in slide-in-from-top-2 duration-200 ${
            toast.type === 'error'
              ? 'bg-rose-600 text-white border-rose-500'
              : 'bg-slate-900 text-white border-slate-700'
          }`}
        >
          {toast.type === 'error' ? (
            <AlertCircle size={15} className="shrink-0 text-white" />
          ) : (
            <CheckCircle2 size={15} className="shrink-0 text-emerald-400" />
          )}
          <span className="truncate">{toast.text}</span>
        </div>
      )}

      {/* =================================================================== */}
      {/* 📱 VERSION MOBILE NATIVE 100% ÉPURÉE (`md:hidden`)                  */}
      {/* =================================================================== */}
      <div className="md:hidden pb-28 min-h-screen bg-slate-50">
        {/* 1. EN-TÊTE BLANC FIXE ULTRA-PROPRE (1 seul bouton d'ajout, zéro encombrement) */}
        <div className="bg-white border-b border-slate-100 px-5 pt-4 pb-3 sticky top-0 z-40 shadow-[0_1px_8px_rgba(15,23,42,0.03)]">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <h1 className="text-2xl font-black text-blue-600 tracking-tight leading-none">
                Comptabilité
              </h1>
              <p className="text-xs text-slate-400 font-semibold mt-1 truncate">
                {selectedYear !== 'all' ? `Campagne ${selectedYear}` : 'Toutes campagnes'} • {data.length} pèlerin{data.length > 1 ? 's' : ''}
              </p>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              {depenses.length > 0 && (
                <button
                  type="button"
                  onClick={exportCsv}
                  disabled={filteredRows.length === 0}
                  aria-label="Exporter en CSV"
                  className="w-9 h-9 rounded-full bg-slate-100 text-slate-700 flex items-center justify-center active:scale-90 transition disabled:opacity-40 cursor-pointer"
                >
                  <Download size={16} />
                </button>
              )}
              <button
                type="button"
                onClick={() => {
                  setTab('depenses')
                  openNew()
                }}
                className="h-9 px-3.5 rounded-full bg-slate-900 text-white text-xs font-black flex items-center gap-1.5 shadow-xs active:scale-95 transition cursor-pointer"
              >
                <Plus size={15} strokeWidth={2.6} />
                <span>Dépense</span>
              </button>
            </div>
          </div>
        </div>

        {/* 2. CORPS DE PAGE AÉRÉ (z-0 isolé pour glisser proprement sous l'en-tête) */}
        <div className="relative z-0 px-5 pt-3.5 space-y-4">
          {/* Sélecteur de devise style Apple (disparaît au scroll) */}
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
                  className={`h-9 rounded-xl text-xs font-black border flex items-center justify-center gap-1.5 transition active:scale-[0.97] cursor-pointer ${
                    active ? applePalette.active : applePalette.idle
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

          {/* Pile 3D flottante compacte de Trésorerie (2 cartes architecturales empilées, sans dégradé) */}
          {!loading && (() => {
            const deckCards = [
              {
                id: 'solde',
                label: 'Trésorerie',
                bgClass: 'bg-[#1E3A5F]', // Bleu Prusse architectural
                content: (
                  <>
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-[10px] font-black uppercase tracking-wider text-white/65">
                          Bénéfice réel
                        </p>
                        <p className="text-[1.45rem] leading-tight font-black tabular-nums tracking-tight text-white mt-0.5 truncate">
                          {beneficeReel > 0 ? '+' : ''}
                          {fmt(beneficeReel)}{' '}
                          <span className="text-xs font-bold text-white/70">{curShort}</span>
                        </p>
                      </div>
                      <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded-full bg-white/15 text-white shrink-0">
                        {HAJJ_CURRENCY_MAP[selectedDevise].shortLabel}
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-3 pt-2.5 border-t border-white/15">
                      <div className="min-w-0">
                        <p className="text-[9.5px] text-white/65 font-semibold">
                          Encaissé ({tauxRecouvrement}%)
                        </p>
                        <p className="text-xs font-black text-emerald-300 tabular-nums mt-0.5 truncate">
                          +{fmt(totalEncaisse)} {curShort}
                        </p>
                      </div>
                      <div className="min-w-0 border-l border-white/15 pl-3">
                        <p className="text-[9.5px] text-white/65 font-semibold">
                          Dépensé ({depenses.length})
                        </p>
                        <p className="text-xs font-black text-white tabular-nums mt-0.5 truncate">
                          -{fmt(totalDepenses)} {curShort}
                        </p>
                      </div>
                    </div>
                  </>
                ),
              },
              {
                id: 'recouvrement',
                label: 'Recouvrement',
                bgClass: 'bg-[#2C3A47]', // Ardoise Basalte architectural
                content: (
                  <>
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-[10px] font-black uppercase tracking-wider text-white/65">
                          Reste à recouvrer
                        </p>
                        <p className="text-[1.45rem] leading-tight font-black tabular-nums tracking-tight text-white mt-0.5 truncate">
                          {fmt(totalRestant)}{' '}
                          <span className="text-xs font-bold text-white/70">{curShort}</span>
                        </p>
                      </div>
                      <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-white/15 text-white shrink-0 tabular-nums">
                        {enAttente.length} en attente
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-3 pt-2.5 border-t border-white/15">
                      <div className="min-w-0">
                        <p className="text-[9.5px] text-white/65 font-semibold">Total attendu</p>
                        <p className="text-xs font-black text-white tabular-nums mt-0.5 truncate">
                          {fmt(totalAttendu)} {curShort}
                        </p>
                      </div>
                      <div className="min-w-0 border-l border-white/15 pl-3">
                        <p className="text-[9.5px] text-white/65 font-semibold">Moy. / pèlerin</p>
                        <p className="text-xs font-black text-white/90 tabular-nums mt-0.5 truncate">
                          {fmt(data.length ? totalDepenses / data.length : 0)} {curShort}
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
                    const isFront = idx === heroDeckIdx
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
                        onClick={!isFront ? () => setHeroDeckIdx(idx) : undefined}
                        className={`absolute inset-x-0 top-0 h-[116px] ${card.bgClass} text-white rounded-2xl px-4 py-3 flex flex-col justify-between border border-white/15 ${
                          isFront
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
                      onClick={() => setHeroDeckIdx(idx)}
                      className={`h-5 px-2.5 rounded-full text-[10px] font-bold transition cursor-pointer ${
                        heroDeckIdx === idx ? `${card.bgClass} text-white` : 'text-slate-400'
                      }`}
                    >
                      {card.label}
                    </button>
                  ))}
                </div>
              </div>
            )
          })()}

          {/* Onglets principaux soulignés ultra-sobres (Dépenses | Synthèse) */}
          <div className="-mx-5 px-5 border-b border-slate-200/80 flex items-center gap-6">
            <button
              type="button"
              onClick={() => setTab('depenses')}
              className={`relative pb-2.5 text-sm flex items-center gap-1.5 transition cursor-pointer ${
                tab === 'depenses' ? 'font-black text-slate-900' : 'font-semibold text-slate-400'
              }`}
            >
              <span>Dépenses</span>
              <span
                className={`text-[10px] font-black px-1.5 py-0.5 rounded-full tabular-nums ${
                  tab === 'depenses' ? 'bg-slate-900 text-white' : 'bg-slate-200/80 text-slate-500'
                }`}
              >
                {depenses.length}
              </span>
              {tab === 'depenses' && (
                <span className="absolute left-0 right-0 bottom-0 h-[2.5px] rounded-full bg-blue-600" />
              )}
            </button>

            <button
              type="button"
              onClick={() => setTab('apercu')}
              className={`relative pb-2.5 text-sm transition cursor-pointer ${
                tab === 'apercu' ? 'font-black text-slate-900' : 'font-semibold text-slate-400'
              }`}
            >
              <span>Synthèse</span>
              {tab === 'apercu' && (
                <span className="absolute left-0 right-0 bottom-0 h-[2.5px] rounded-full bg-blue-600" />
              )}
            </button>
          </div>

          {/* Contenu selon onglet */}
          {loading ? (
            <div className="space-y-2.5" aria-label="Chargement">
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
          ) : tab === 'apercu' ? (
            <div className="space-y-4">
              {/* Carte Dépenses par nature */}
              <div className="bg-white rounded-2xl border border-blue-950/15 shadow-[0_3px_10px_-4px_rgba(15,23,42,0.08)] p-4 space-y-3.5">
                <div className="flex items-center justify-between gap-2">
                  <h2 className="text-xs font-black uppercase tracking-wider text-slate-500">
                    Répartition des dépenses
                  </h2>
                  <button
                    type="button"
                    onClick={() => setTab('depenses')}
                    className="text-xs font-black text-blue-600 cursor-pointer"
                  >
                    Journal →
                  </button>
                </div>
                {natures.length === 0 ? (
                  <p className="text-xs text-slate-400 font-semibold text-center py-5">
                    Aucune dépense enregistrée en {HAJJ_CURRENCY_MAP[selectedDevise].label}.
                  </p>
                ) : (
                  renderNatureBars(6)
                )}
              </div>

              {/* Forfaits / Packages */}
              {Object.keys(packages).length > 0 && (
                <div className="space-y-2.5">
                  <h2 className="text-[11px] font-black uppercase tracking-wider text-slate-400 px-0.5">
                    Forfaits & Packages
                  </h2>
                  <div className="space-y-2.5">
                    {Object.entries(packages).map(([nom, pkg]) => {
                      const taux = pkg.attendu > 0 ? Math.round((pkg.encaisse / pkg.attendu) * 100) : 0
                      return (
                        <div
                          key={nom}
                          className="bg-white rounded-2xl border border-blue-950/15 shadow-[0_3px_10px_-4px_rgba(15,23,42,0.08)] p-3.5 space-y-2.5"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <p className="font-black text-slate-900 text-sm truncate">{nom}</p>
                            <span className="text-[11px] font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full shrink-0">
                              {pkg.count} pers.
                            </span>
                          </div>
                          <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-blue-600 rounded-full"
                              style={{ width: `${Math.min(100, taux)}%` }}
                            />
                          </div>
                          <div className="flex items-center justify-between text-xs">
                            <span className="font-black text-emerald-700 tabular-nums">
                              {fmt(pkg.encaisse)} {curShort}
                            </span>
                            <span className="font-semibold text-slate-500 tabular-nums">
                              Reste {fmt(pkg.attendu - pkg.encaisse)} {curShort} • {taux}%
                            </span>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* Agences & Partenaires */}
              {Object.keys(agences).length > 0 && (
                <div className="space-y-2.5">
                  <h2 className="text-[11px] font-black uppercase tracking-wider text-slate-400 px-0.5">
                    Agences & Partenaires
                  </h2>
                  <div className="space-y-2.5">
                    {Object.entries(agences)
                      .sort((a, b) => b[1].encaisse - a[1].encaisse)
                      .map(([nom, agc]) => {
                        const taux = agc.attendu > 0 ? Math.round((agc.encaisse / agc.attendu) * 100) : 0
                        const isOpen = expandedAgence === nom
                        return (
                          <div
                            key={nom}
                            className="bg-white rounded-2xl border border-blue-950/15 shadow-[0_3px_10px_-4px_rgba(15,23,42,0.08)] overflow-hidden"
                          >
                            <button
                              type="button"
                              onClick={() => setExpandedAgence(isOpen ? null : nom)}
                              className="w-full p-3.5 flex items-center justify-between gap-3 text-left active:bg-slate-50 transition cursor-pointer"
                            >
                              <div className="min-w-0">
                                <p className="font-black text-slate-900 text-sm truncate">{nom}</p>
                                <p className="text-xs text-slate-400 font-semibold mt-0.5">
                                  {agc.pelerins.length} pèlerin{agc.pelerins.length > 1 ? 's' : ''} • {taux}%
                                </p>
                              </div>
                              <div className="flex items-center gap-2 shrink-0">
                                <p className="text-sm font-black text-emerald-700 tabular-nums">
                                  {fmt(agc.encaisse)} {curShort}
                                </p>
                                <ChevronDown
                                  size={16}
                                  className={`text-slate-400 transition-transform ${isOpen ? 'rotate-180' : ''}`}
                                />
                              </div>
                            </button>

                            {isOpen && (
                              <div className="border-t border-slate-100 divide-y divide-slate-100 bg-slate-50/50">
                                {agc.pelerins.map((p, i) => {
                                  const restant = (Number(p.prix_package) || 0) - (Number(p.total_paye) || 0)
                                  const solde = restant <= 0
                                  return (
                                    <div
                                      key={p.id || i}
                                      className="flex items-center justify-between gap-3 px-3.5 py-2.5"
                                    >
                                      <div className="min-w-0">
                                        <p className="text-xs font-bold text-slate-900 truncate">
                                          {p.prenom} {p.nom_complet || p.nom}
                                        </p>
                                        <p className="text-[11px] text-slate-400 font-mono truncate">
                                          {p.num_passeport || 'Sans passeport'}
                                        </p>
                                      </div>
                                      <span
                                        className={`text-[11px] font-black shrink-0 tabular-nums ${
                                          solde ? 'text-emerald-600' : 'text-amber-600'
                                        }`}
                                      >
                                        {solde ? 'Soldé' : `-${fmt(restant)} ${curShort}`}
                                      </span>
                                    </div>
                                  )
                                })}
                              </div>
                            )}
                          </div>
                        )
                      })}
                  </div>
                </div>
              )}
            </div>
          ) : (
            /* =================== ONGLET DÉPENSES ULTRA-AÉRÉ =================== */
            <div className="space-y-3.5">
              {/* 1 seule barre propre : Recherche + Filtres/Tri */}
              <div className="flex items-center gap-2">
                <div className="relative flex-1 min-w-0">
                  <Search
                    size={16}
                    className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"
                  />
                  <input
                    type="text"
                    placeholder="Rechercher une dépense, pèlerin…"
                    value={filterDepenseSearch}
                    onChange={e => setFilterDepenseSearch(e.target.value)}
                    className="w-full h-11 pl-10 pr-9 bg-white border border-slate-200/90 rounded-2xl text-sm font-semibold text-slate-800 placeholder:text-slate-400 outline-none focus:border-blue-600 transition"
                  />
                  {filterDepenseSearch && (
                    <button
                      type="button"
                      onClick={() => setFilterDepenseSearch('')}
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
                  className={`relative w-11 h-11 shrink-0 rounded-2xl border flex items-center justify-center active:scale-95 transition cursor-pointer ${
                    activeFilterCount > 0
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

              {/* Mini ligne discrète : Mode de vue + Total filtré */}
              <div className="flex items-center justify-between gap-2 px-0.5">
                <div className="flex items-center gap-1.5">
                  {([
                    ['liste', 'Journal'],
                    ['nature', 'Par nature'],
                    ['pelerin', 'Par pèlerin'],
                  ] as const).map(([id, label]) => (
                    <button
                      key={id}
                      type="button"
                      onClick={() => setViewMode(id)}
                      className={`h-7 px-2.5 rounded-full text-[11px] font-bold transition cursor-pointer ${
                        viewMode === id
                          ? 'bg-slate-900 text-white'
                          : 'text-slate-500 active:bg-slate-200/70'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <span className="text-xs font-black text-rose-600 tabular-nums shrink-0">
                  -{fmt(filteredTotal)} {curShort}
                </span>
              </div>

              {/* Chips supprimables UNIQUEMENT si des filtres avancés sont actifs */}
              {(filterType !== 'all' || effectiveNature !== 'all' || sortKey !== 'date_desc') && (
                <div className="-mx-5 px-5 flex items-center gap-1.5 overflow-x-auto no-scrollbar">
                  {filterType !== 'all' && (
                    <button
                      type="button"
                      onClick={() => setFilterType('all')}
                      className="h-7 px-2.5 rounded-full bg-blue-50 text-blue-700 border border-blue-100 text-[11px] font-bold whitespace-nowrap shrink-0 flex items-center gap-1 cursor-pointer"
                    >
                      <span>{TYPE_META[filterType].short}</span>
                      <X size={11} />
                    </button>
                  )}
                  {effectiveNature !== 'all' && (
                    <button
                      type="button"
                      onClick={() => setFilterNature('all')}
                      className="h-7 px-2.5 rounded-full bg-blue-50 text-blue-700 border border-blue-100 text-[11px] font-bold whitespace-nowrap shrink-0 flex items-center gap-1 cursor-pointer"
                    >
                      <span>{effectiveNature}</span>
                      <X size={11} />
                    </button>
                  )}
                  {sortKey !== 'date_desc' && (
                    <button
                      type="button"
                      onClick={() => setSortKey('date_desc')}
                      className="h-7 px-2.5 rounded-full bg-slate-100 text-slate-700 border border-slate-200 text-[11px] font-bold whitespace-nowrap shrink-0 flex items-center gap-1 cursor-pointer"
                    >
                      <span>Tri personnalisé</span>
                      <X size={11} />
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={resetFilters}
                    className="h-7 px-2.5 rounded-full text-rose-600 text-[11px] font-black whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    Tout effacer
                  </button>
                </div>
              )}

              {/* Liste des dépenses */}
              {filteredRows.length === 0 ? (
                <div className="bg-white rounded-3xl border border-dashed border-slate-200 py-14 px-6 text-center space-y-3">
                  <div className="w-12 h-12 rounded-2xl bg-slate-100 text-slate-400 flex items-center justify-center mx-auto">
                    <Receipt size={22} />
                  </div>
                  <p className="text-sm font-black text-slate-800">
                    {depenses.length === 0
                      ? `Aucune dépense en ${HAJJ_CURRENCY_MAP[selectedDevise].label}`
                      : 'Aucun résultat trouvé'}
                  </p>
                  <p className="text-xs text-slate-400 font-medium">
                    {depenses.length === 0
                      ? 'Enregistrez votre première dépense en 3 étapes simples.'
                      : 'Essayez de modifier votre recherche ou vos filtres.'}
                  </p>
                  {depenses.length === 0 && (
                    <button
                      type="button"
                      onClick={openNew}
                      className="mt-1 inline-flex items-center gap-2 h-11 px-5 rounded-2xl bg-slate-900 text-white text-xs font-black active:scale-95 transition cursor-pointer"
                    >
                      <Plus size={16} />
                      <span>Ajouter une dépense</span>
                    </button>
                  )}
                </div>
              ) : viewMode === 'liste' ? (
                /* Journal groupé par DATE (style Revolut / Apple Wallet) */
                <div className="space-y-4">
                  {groupedByDate.map(group => (
                    <div key={group.label} className="space-y-2">
                      <div className="flex items-center justify-between px-1">
                        <span className="text-[11px] font-black uppercase tracking-wider text-slate-400">
                          {group.label}
                        </span>
                        <span className="text-[11px] font-bold text-slate-400 tabular-nums">
                          -{fmt(group.total)} {curShort}
                        </span>
                      </div>

                      <div className="space-y-2">
                        {group.rows.map(r => {
                          const meta = TYPE_META[r.d.type_cible] ?? TYPE_META.global
                          const Icon = LIBELLE_ICON[r.d.libelle] ?? meta.icon
                          return (
                            <button
                              key={r.d.id}
                              type="button"
                              onClick={() => setDetailId(r.d.id)}
                              className="w-full bg-white rounded-2xl border border-blue-950/15 shadow-[0_3px_10px_-4px_rgba(15,23,42,0.09),0_1px_2px_rgba(15,23,42,0.05)] px-3.5 py-3 flex items-center gap-3 text-left active:scale-[0.99] transition cursor-pointer"
                            >
                              <div className="w-10 h-10 rounded-xl bg-slate-100 text-slate-700 flex items-center justify-center shrink-0">
                                <Icon size={17} />
                              </div>

                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-1.5">
                                  <p className="font-black text-slate-900 text-[14px] leading-snug truncate">
                                    {r.d.libelle}
                                  </p>
                                  {r.dyn && (
                                    <span className="text-[9.5px] font-black px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 shrink-0">
                                      Auto
                                    </span>
                                  )}
                                </div>
                                <p className="text-xs text-slate-500 font-medium truncate mt-0.5">
                                  {r.label}
                                </p>
                                <p className="text-[10.5px] text-slate-400 font-medium mt-0.5 truncate">
                                  {r.targets.length === 0 && !r.isList ? 'Cible introuvable' : `${r.count} pers.`}
                                  {r.count > 1 && ` • ${fmt(r.unit)} ${curShort}/pers.`}
                                  {r.d.recorded_by_name && ` • ${r.d.recorded_by_name}`}
                                </p>
                              </div>

                              <div className="flex items-center gap-1 shrink-0">
                                <div className="text-right">
                                  <p className="text-[14px] font-black text-rose-600 tabular-nums">
                                    -{fmt(r.montant)}
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
              ) : viewMode === 'nature' ? (
                <div className="space-y-2.5">
                  {groupedByNature.map(g => {
                    const collapsed = collapsedNatures.includes(g.libelle)
                    const pct = filteredTotal > 0 ? Math.round((g.total / filteredTotal) * 100) : 0
                    const CatIcon = LIBELLE_ICON[g.libelle] ?? Receipt
                    return (
                      <div
                        key={g.libelle}
                        className="bg-white rounded-2xl border border-blue-950/15 shadow-[0_3px_10px_-4px_rgba(15,23,42,0.09)] overflow-hidden"
                      >
                        <button
                          type="button"
                          onClick={() =>
                            setCollapsedNatures(c =>
                              c.includes(g.libelle) ? c.filter(x => x !== g.libelle) : [...c, g.libelle],
                            )
                          }
                          className="w-full p-3.5 text-left active:bg-slate-50 transition cursor-pointer"
                        >
                          <div className="flex items-center gap-3">
                            <div className="w-9 h-9 rounded-xl bg-slate-100 text-slate-700 flex items-center justify-center shrink-0">
                              <CatIcon size={16} />
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="font-black text-slate-900 text-sm truncate">{g.libelle}</p>
                              <p className="text-[11px] text-slate-400 font-semibold">
                                {g.rows.length} écriture{g.rows.length > 1 ? 's' : ''} • {pct}%
                              </p>
                            </div>
                            <div className="flex items-center gap-1.5 shrink-0">
                              <p className="text-sm font-black text-rose-600 tabular-nums">
                                -{fmt(g.total)} {curShort}
                              </p>
                              <ChevronDown
                                size={15}
                                className={`text-slate-400 transition-transform ${collapsed ? '' : 'rotate-180'}`}
                              />
                            </div>
                          </div>
                          <div className="mt-2.5 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                            <div className="h-full bg-amber-500 rounded-full" style={{ width: `${pct}%` }} />
                          </div>
                        </button>

                        {!collapsed && (
                          <div className="border-t border-slate-100 divide-y divide-slate-100 bg-slate-50/40">
                            {g.rows.map(r => (
                              <button
                                key={r.d.id}
                                type="button"
                                onClick={() => setDetailId(r.d.id)}
                                className="w-full px-3.5 py-3 flex items-center justify-between gap-3 text-left active:bg-slate-100/70 transition cursor-pointer"
                              >
                                <div className="min-w-0">
                                  <p className="text-xs font-bold text-slate-800 truncate">{r.label}</p>
                                  <p className="text-[11px] text-slate-400 mt-0.5 truncate">
                                    {r.count} pers.
                                    {r.d.created_at &&
                                      ` • ${new Date(r.d.created_at).toLocaleDateString('fr-FR', {
                                        day: '2-digit',
                                        month: 'short',
                                      })}`}
                                  </p>
                                </div>
                                <div className="flex items-center gap-1 shrink-0">
                                  <span className="text-xs font-black text-rose-600 tabular-nums">
                                    -{fmt(r.montant)} {curShort}
                                  </span>
                                  <ChevronRight size={14} className="text-slate-300" />
                                </div>
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              ) : (
                <div className="space-y-2.5">
                  <p className="text-[11px] text-slate-400 font-semibold px-1">
                    {perPelerin.length} pèlerin{perPelerin.length > 1 ? 's' : ''} concerné
                    {perPelerin.length > 1 ? 's' : ''}
                  </p>
                  {perPelerin.map(({ p, cout, lignes }) => {
                    const k = String(p.id)
                    const open = expandedPelerin === k
                    const paye = Number(p.total_paye) || 0
                    const net = paye - cout
                    const initiales =
                      `${p.prenom?.charAt(0) || ''}${(p.nom_complet || p.nom || '').charAt(0)}`.toUpperCase() || 'P'
                    return (
                      <div
                        key={k}
                        className="bg-white rounded-2xl border border-blue-950/15 shadow-[0_3px_10px_-4px_rgba(15,23,42,0.09)] overflow-hidden"
                      >
                        <button
                          type="button"
                          onClick={() => setExpandedPelerin(open ? null : k)}
                          className="w-full p-3.5 flex items-center gap-3 text-left active:bg-slate-50 transition cursor-pointer"
                        >
                          <div className="w-9 h-9 rounded-xl bg-slate-100 text-slate-700 font-black text-xs flex items-center justify-center shrink-0">
                            {initiales}
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="font-black text-slate-900 text-sm truncate">{pName(p)}</p>
                            <p className="text-[11px] text-slate-400 font-medium mt-0.5 truncate">
                              Payé {fmt(paye)} {curShort} • {lignes.length} charge{lignes.length > 1 ? 's' : ''}
                            </p>
                          </div>
                          <div className="text-right shrink-0">
                            <p className="text-sm font-black text-rose-600 tabular-nums">
                              -{fmt(cout)} {curShort}
                            </p>
                            <span
                              className={`text-[10.5px] font-black tabular-nums ${
                                net >= 0 ? 'text-emerald-600' : 'text-rose-600'
                              }`}
                            >
                              {net > 0 ? '+' : ''}
                              {fmt(net)} {curShort}
                            </span>
                          </div>
                        </button>

                        {open && (
                          <div className="border-t border-slate-100 bg-slate-50/60 px-3.5 py-2.5 space-y-1.5">
                            {lignes.map((l, i) => (
                              <div
                                key={`${l.id}-${i}`}
                                className="flex items-center justify-between text-xs bg-white rounded-xl border border-slate-200/70 px-3 py-2"
                              >
                                <span className="font-bold text-slate-700 truncate pr-2">{l.libelle}</span>
                                <span className="font-black text-rose-600 tabular-nums shrink-0">
                                  -{fmt(l.part)} {curShort}
                                </span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* =================================================================== */}
      {/* 💻 VERSION PC / TABLETTE (100% INCHANGÉE `hidden md:block`)         */}
      {/* =================================================================== */}
      <div className="hidden md:block w-full min-w-0 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 md:py-8 pb-24 overflow-x-hidden text-slate-800">

        {/* HEADER RESPONSIVE (Sélecteur d'année masqué sur mobile) */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4 md:mb-5">
          <div className="min-w-0">
            <h1 className="text-xl sm:text-2xl md:text-3xl font-black text-slate-900 tracking-tight leading-tight flex items-center gap-2 flex-wrap">
              <span>Comptabilité & Dépenses</span>
              <span className={`text-xs px-2.5 py-1 rounded-xl border font-black uppercase ${HAJJ_CURRENCY_MAP[selectedDevise].badgeClass}`}>
                {HAJJ_CURRENCY_MAP[selectedDevise].label}
              </span>
            </h1>
            <p className="text-xs sm:text-sm text-slate-500 font-medium mt-0.5">
              Comptabilité séparée par devise — aucun mélange entre FCFA, Euro et Dollar.
            </p>
          </div>
          <div className="flex w-full sm:w-auto items-center justify-end gap-2 shrink-0">
            <div className="hidden md:block">
              <YearSelector />
            </div>
            <button
              type="button"
              onClick={() => {
                setTab('depenses')
                openNew()
              }}
              className="inline-flex w-full sm:w-auto justify-center items-center gap-1.5 px-3.5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 active:scale-95 text-white text-xs font-black shadow-sm transition-all cursor-pointer shrink-0"
            >
              <Plus size={16} /> <span>Nouvelle dépense ({curSymbol})</span>
            </button>
          </div>
        </div>

        {/* SÉLECTEUR DE DEVISE STRICT (FCFA | EUR | USD) */}
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <HajjCurrencyTabs
            value={selectedDevise}
            onChange={(next) => {
              setSelectedDevise(next)
              setExpandedAgence(null)
              setExpandedDepense(null)
              setExpandedPelerin(null)
              setDetailId(null)
              resetFilters()
            }}
            counts={deviseCounts}
          />
          <span className="text-[11px] font-bold text-slate-400">
            {data.length} pèlerin(s) en {HAJJ_CURRENCY_MAP[selectedDevise].label}
          </span>
        </div>

        {/* BARRE D'ONGLETS UNIFIÉE (MOBILE & BUREAU) */}
        <div className="grid grid-cols-2 gap-1.5 p-1.5 bg-slate-200/80 rounded-2xl mb-5 max-w-lg">
          <button
            type="button"
            onClick={() => setTab('apercu')}
            className={`py-2.5 px-3 rounded-xl text-xs font-black flex items-center justify-center gap-1.5 transition-all cursor-pointer ${tab === 'apercu' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
          >
            <LayoutDashboard size={15} className={tab === 'apercu' ? 'text-blue-600' : 'text-slate-500'} />
            <span>Vue d'ensemble</span>
          </button>
          <button
            type="button"
            onClick={() => setTab('depenses')}
            className={`py-2.5 px-3 rounded-xl text-xs font-black flex items-center justify-center gap-1.5 transition-all cursor-pointer ${tab === 'depenses' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
          >
            <Receipt size={15} className={tab === 'depenses' ? 'text-rose-600' : 'text-slate-500'} />
            <span>Dépenses</span>
            <span className={`text-[10px] px-1.5 py-0.2 rounded-md ${tab === 'depenses' ? 'bg-blue-600 text-white' : 'bg-slate-300 text-slate-700'}`}>
              {depenses.length}
            </span>
          </button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-28">
            <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : tab === 'apercu' ? (
          <>
            {/* ---- CARDS RÉSUMÉ DE TRÉSORERIE ---- */}
            <div className="grid grid-cols-2 lg:grid-cols-5 gap-2.5 sm:gap-3.5 mb-6">
              <div className="bg-blue-600 p-4 rounded-2xl text-white shadow-xs col-span-2 lg:col-span-1 flex flex-col justify-between">
                <div className="flex justify-between items-center mb-1.5">
                  <span className="text-[10px] font-black uppercase tracking-wider text-blue-100">Encaissé Total</span>
                  <div className="p-1.5 bg-white/15 rounded-xl"><Wallet size={16} /></div>
                </div>
                <div>
                  <h3 className="text-xl sm:text-2xl font-black tabular-nums">{fmt(totalEncaisse)} <span className="text-xs font-bold text-blue-200">{curShort}</span></h3>
                  <p className="text-[10px] text-blue-100 font-medium mt-0.5">Sur {fmt(totalAttendu)} {curShort} attendus</p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setTab('depenses')}
                className="text-left bg-white p-3.5 sm:p-4 rounded-2xl border border-slate-200 shadow-xs flex flex-col justify-between active:bg-slate-50 cursor-pointer"
              >
                <div className="flex justify-between items-center mb-1.5">
                  <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">Total Dépensé</span>
                  <div className="p-1.5 bg-amber-50 text-amber-600 rounded-xl"><DollarSign size={16} /></div>
                </div>
                <div>
                  <h3 className="text-base sm:text-xl font-black text-slate-900 tabular-nums">{fmt(totalDepenses)} <span className="text-xs font-bold text-slate-400">{curShort}</span></h3>
                  <p className="text-[10px] text-slate-400 font-medium mt-0.5">{depenses.length} écriture(s)</p>
                </div>
              </button>

              <div className="bg-white p-3.5 sm:p-4 rounded-2xl border border-slate-200 shadow-xs flex flex-col justify-between">
                <div className="flex justify-between items-center mb-1.5">
                  <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">Bénéfice Réel</span>
                  <div className={`p-1.5 rounded-xl ${beneficeReel >= 0 ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'}`}>
                    <Landmark size={16} />
                  </div>
                </div>
                <div>
                  <h3 className={`text-base sm:text-xl font-black tabular-nums ${beneficeReel >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
                    {beneficeReel > 0 ? '+' : ''}{fmt(beneficeReel)} <span className="text-xs font-bold text-slate-400">{curShort}</span>
                  </h3>
                  <p className="text-[10px] text-slate-400 font-medium mt-0.5">Encaissé moins sorties</p>
                </div>
              </div>

              <div className="bg-white p-3.5 sm:p-4 rounded-2xl border border-slate-200 shadow-xs flex flex-col justify-between">
                <div className="flex justify-between items-center mb-1.5">
                  <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">Reste à Recouvrer</span>
                  <div className="p-1.5 bg-slate-100 text-slate-600 rounded-xl"><CreditCard size={16} /></div>
                </div>
                <div>
                  <h3 className="text-base sm:text-xl font-black text-amber-700 tabular-nums">{fmt(totalRestant)} <span className="text-xs font-bold text-slate-400">{curShort}</span></h3>
                  <p className="text-[10px] text-slate-400 font-medium mt-0.5">{enAttente.length} dossier(s) incomplet(s)</p>
                </div>
              </div>

              <div className="bg-white p-3.5 sm:p-4 rounded-2xl border border-slate-200 shadow-xs flex flex-col justify-between">
                <div className="flex justify-between items-center mb-1.5">
                  <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">Recouvrement</span>
                  <div className="p-1.5 bg-blue-50 text-blue-600 rounded-xl"><TrendingUp size={16} /></div>
                </div>
                <div>
                  <h3 className="text-base sm:text-xl font-black text-slate-900 tabular-nums">{tauxRecouvrement}%</h3>
                  <div className="mt-1.5 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                    <div className="h-full bg-blue-600 rounded-full transition-all" style={{ width: `${tauxRecouvrement}%` }} />
                  </div>
                </div>
              </div>
            </div>

            {/* ---- APERÇU DES DÉPENSES PAR NATURE ---- */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-4 sm:p-6 mb-5">
              <div className="flex items-center justify-between gap-3 mb-4">
                <div className="flex items-center gap-2">
                  <div className="p-2 bg-amber-50 rounded-xl text-amber-600"><Receipt size={16} /></div>
                  <h2 className="text-xs sm:text-sm font-black text-slate-900 uppercase tracking-wide">Dépenses par nature</h2>
                </div>
                <button type="button" onClick={() => setTab('depenses')} className="text-xs font-black text-blue-600 active:text-blue-800 py-1 cursor-pointer">
                  Gérer les dépenses →
                </button>
              </div>
              {natures.length === 0 ? (
                <p className="text-xs text-slate-400 font-bold text-center py-6">Aucune dépense enregistrée.</p>
              ) : (
                renderNatureBars(5)
              )}
            </div>

            {/* ---- PAR PACKAGE ---- */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-4 sm:p-6 mb-5">
              <div className="flex items-center gap-2 mb-4">
                <div className="p-2 bg-blue-50 rounded-xl text-blue-600"><Package size={16} /></div>
                <h2 className="text-xs sm:text-sm font-black text-slate-900 uppercase tracking-wide">Recouvrement par Forfait / Package</h2>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {Object.entries(packages).map(([nom, pkg]) => {
                  const taux = pkg.attendu > 0 ? Math.round((pkg.encaisse / pkg.attendu) * 100) : 0
                  return (
                    <div key={nom} className="p-3.5 bg-slate-50 border border-slate-200/80 rounded-xl flex flex-col justify-between">
                      <div>
                        <div className="flex items-center justify-between gap-2 mb-1.5">
                          <span className="font-bold text-slate-900 text-xs truncate">{nom}</span>
                          <span className="text-[10px] font-bold text-slate-500 bg-white border border-slate-200 px-1.5 py-0.5 rounded shrink-0">
                            {pkg.count} pèlerin(s)
                          </span>
                        </div>
                        <div className="flex justify-between text-xs mb-1">
                          <span className="text-emerald-700 font-bold">{fmt(pkg.encaisse)} {curShort}</span>
                          <span className="text-slate-400">/ {fmt(pkg.attendu)} {curShort}</span>
                        </div>
                        <div className="h-1.5 bg-slate-200 rounded-full overflow-hidden">
                          <div className="h-full bg-blue-600 rounded-full" style={{ width: `${taux}%` }} />
                        </div>
                      </div>
                      <div className="flex justify-between items-center text-[10px] font-bold text-slate-400 mt-2">
                        <span>Reste : {fmt(pkg.attendu - pkg.encaisse)} {curShort}</span>
                        <span>{taux}%</span>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>

            {/* ---- PAR AGENCE / PARTENAIRE ---- */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-4 sm:p-6">
              <div className="flex items-center gap-2 mb-4">
                <div className="p-2 bg-blue-50 rounded-xl text-blue-600"><BarChart2 size={16} /></div>
                <h2 className="text-xs sm:text-sm font-black text-slate-900 uppercase tracking-wide">Situation par Agence & Partenaire</h2>
              </div>
              <div className="space-y-2">
                {Object.entries(agences).sort((a, b) => b[1].encaisse - a[1].encaisse).map(([nom, agc]) => {
                  const taux = agc.attendu > 0 ? Math.round((agc.encaisse / agc.attendu) * 100) : 0
                  const isOpen = expandedAgence === nom
                  return (
                    <div key={nom} className="border border-slate-200 rounded-xl overflow-hidden">
                      <button
                        onClick={() => setExpandedAgence(isOpen ? null : nom)}
                        className="w-full p-3.5 bg-slate-50 hover:bg-slate-100 active:bg-slate-100 transition-colors flex items-center justify-between text-left cursor-pointer"
                      >
                        <div className="min-w-0 pr-2">
                          <p className="font-bold text-slate-900 text-xs sm:text-sm truncate">{nom}</p>
                          <p className="text-[10px] text-slate-400 font-medium">{agc.pelerins.length} pèlerin(s)</p>
                        </div>
                        <div className="flex items-center gap-2.5 shrink-0">
                          <div className="text-right">
                            <p className="text-xs font-black text-emerald-700">{fmt(agc.encaisse)} {curSymbol}</p>
                            <p className="text-[10px] text-slate-400">{taux}% recouvré</p>
                          </div>
                          {isOpen ? <ChevronUp size={16} className="text-slate-400" /> : <ChevronDown size={16} className="text-slate-400" />}
                        </div>
                      </button>

                      {isOpen && (
                        <div className="p-3 sm:p-4 border-t border-slate-200 bg-white">
                          <div className="space-y-1.5">
                            {agc.pelerins.map((p, i) => {
                              const restant = (Number(p.prix_package) || 0) - (Number(p.total_paye) || 0)
                              const solde = restant <= 0
                              return (
                                <div key={p.id || i} className="flex items-center justify-between gap-2 p-2.5 bg-slate-50 rounded-lg text-xs">
                                  <div className="min-w-0">
                                    <p className="font-bold text-slate-800 truncate">{p.prenom} {p.nom_complet || p.nom}</p>
                                    <p className="text-[10px] text-slate-400 font-mono truncate">{p.num_passeport || 'Sans passeport'}</p>
                                  </div>
                                  <div className="text-right shrink-0">
                                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${solde ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>
                                      {solde ? 'Soldé' : `Reste: ${fmt(restant)} ${curShort}`}
                                    </span>
                                  </div>
                                </div>
                              )
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          </>
        ) : (
          <>
            {/* ======================= ONGLET DÉPENSES ======================= */}

            {/* Stats en grille 2x2 propre sur mobile et 4 colonnes sur PC */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-3 mb-4 sm:mb-5">
              <div className="bg-white p-3.5 sm:p-4 rounded-2xl border border-slate-200 shadow-xs">
                <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">Total dépensé</span>
                <h3 className="text-base sm:text-xl font-black text-rose-600 tabular-nums mt-1">-{fmt(totalDepenses)} <span className="text-xs text-slate-400">{curShort}</span></h3>
              </div>
              <div className="bg-white p-3.5 sm:p-4 rounded-2xl border border-slate-200 shadow-xs">
                <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">Écritures</span>
                <h3 className="text-base sm:text-xl font-black text-slate-900 tabular-nums mt-1">{depenses.length}</h3>
              </div>
              <div className="bg-white p-3.5 sm:p-4 rounded-2xl border border-slate-200 shadow-xs">
                <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">Coût moyen / pèlerin</span>
                <h3 className="text-base sm:text-xl font-black text-slate-900 tabular-nums mt-1">
                  {fmt(data.length ? totalDepenses / data.length : 0)} <span className="text-xs text-slate-400">{curShort}</span>
                </h3>
              </div>
              <div className="bg-white p-3.5 sm:p-4 rounded-2xl border border-slate-200 shadow-xs">
                <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">Bénéfice réel</span>
                <h3 className={`text-base sm:text-xl font-black tabular-nums mt-1 ${beneficeReel >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
                  {beneficeReel > 0 ? '+' : ''}{fmt(beneficeReel)} <span className="text-xs text-slate-400">{curShort}</span>
                </h3>
              </div>
            </div>

            {/* Répartition par nature (repliable sur mobile) */}
            {natures.length > 0 && (
              <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-4 sm:p-5 mb-4 sm:mb-5">
                <button
                  type="button"
                  onClick={() => setShowNatureBars(v => !v)}
                  className="w-full flex items-center justify-between md:cursor-default cursor-pointer"
                >
                  <h2 className="text-xs font-black text-slate-900 uppercase tracking-wide">Répartition par nature</h2>
                  <span className="flex items-center gap-2">
                    {effectiveNature !== 'all' && (
                      <span
                        role="button"
                        onClick={e => {
                          e.stopPropagation()
                          setFilterNature('all')
                        }}
                        className="text-[11px] font-bold text-blue-600 py-0.5"
                      >
                        Tout afficher
                      </span>
                    )}
                    <ChevronDown size={16} className={`md:hidden text-slate-400 transition-transform ${showNatureBars ? 'rotate-180' : ''}`} />
                  </span>
                </button>
                <div className={`${showNatureBars ? 'block' : 'hidden'} md:block mt-3.5`}>{renderNatureBars()}</div>
              </div>
            )}

            {/* Barre d'outils unifiée & responsive */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-3.5 sm:p-4 mb-4 space-y-3">
              <div className="flex gap-2">
                {searchBox}
                <button
                  type="button"
                  onClick={() => setShowFilters(true)}
                  className="md:hidden relative w-11 shrink-0 rounded-xl bg-slate-50 border border-slate-200 active:bg-slate-100 text-slate-700 flex items-center justify-center cursor-pointer"
                  aria-label="Filtrer et trier"
                >
                  <SlidersHorizontal size={16} />
                  {activeFilterCount > 0 && (
                    <span className="absolute -top-1.5 -right-1.5 min-w-[17px] h-[17px] px-1 rounded-full bg-blue-600 text-white text-[9px] font-black flex items-center justify-center">
                      {activeFilterCount}
                    </span>
                  )}
                </button>
                <button
                  type="button"
                  onClick={openNew}
                  className="hidden md:inline-flex items-center gap-1.5 px-4 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-black cursor-pointer shrink-0"
                >
                  <Plus size={15} /> Nouvelle dépense
                </button>
              </div>

              {viewSwitch}

              <div className="hidden md:flex gap-2">
                {sortSelect}
                <button
                  type="button"
                  onClick={exportCsv}
                  disabled={filteredRows.length === 0}
                  className="px-3.5 rounded-xl bg-slate-50 border border-slate-200 hover:bg-slate-100 text-slate-700 text-xs font-black flex items-center gap-1.5 disabled:opacity-40 cursor-pointer"
                  title="Exporter en CSV"
                >
                  <Download size={14} /> CSV
                </button>
              </div>

              <div className="hidden md:block space-y-2">
                {renderTypeChips()}
                {natures.length > 0 && renderNatureChips()}
              </div>

              {natures.length > 0 && (
                <div className="md:hidden pt-1">
                  {renderNatureChips()}
                </div>
              )}
            </div>

            {/* Résumé du résultat */}
            <div className="flex items-center justify-between px-1 mb-3 text-xs font-bold text-slate-500">
              <span>
                {filteredRows.length} écriture(s)
                {hasActiveFilter && (
                  <button type="button" onClick={resetFilters} className="ml-2 text-blue-600 underline cursor-pointer">
                    Réinitialiser
                  </button>
                )}
              </span>
              <span className="text-rose-700 font-black tabular-nums">-{fmt(filteredTotal)} {curSymbol}</span>
            </div>

            {/* Contenu selon la vue */}
            {filteredRows.length === 0 ? (
              <div className="text-center py-14 text-xs text-slate-400 font-bold border-2 border-dashed border-slate-200 rounded-2xl bg-white">
                {depenses.length === 0 ? `Aucune dépense en ${HAJJ_CURRENCY_MAP[selectedDevise].label} enregistrée pour le moment.` : 'Aucune dépense ne correspond aux critères.'}
              </div>
            ) : viewMode === 'liste' ? (
              renderRowList(filteredRows)
            ) : viewMode === 'nature' ? (
              <div className="space-y-3">
                {groupedByNature.map(g => {
                  const collapsed = collapsedNatures.includes(g.libelle)
                  const pct = filteredTotal > 0 ? Math.round((g.total / filteredTotal) * 100) : 0
                  return (
                    <div key={g.libelle} className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
                      <button
                        type="button"
                        onClick={() =>
                          setCollapsedNatures(c => (c.includes(g.libelle) ? c.filter(x => x !== g.libelle) : [...c, g.libelle]))
                        }
                        className="w-full p-3.5 sm:p-4 text-left active:bg-slate-50 cursor-pointer"
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div className="min-w-0">
                            <p className="font-black text-slate-900 text-xs sm:text-sm truncate">{g.libelle}</p>
                            <p className="text-[11px] text-slate-400 font-medium">{g.rows.length} écriture(s) • {pct}% du total</p>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <p className="text-xs sm:text-sm font-black text-rose-600 tabular-nums">-{fmt(g.total)} {curShort}</p>
                            <ChevronDown size={16} className={`text-slate-400 transition-transform ${collapsed ? '' : 'rotate-180'}`} />
                          </div>
                        </div>
                        <div className="mt-2 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                          <div className="h-full bg-amber-500 rounded-full" style={{ width: `${pct}%` }} />
                        </div>
                      </button>
                      {!collapsed && (
                        <div className={isMobile ? 'border-t border-slate-100' : ''}>{renderRowList(g.rows, true)}</div>
                      )}
                    </div>
                  )
                })}
              </div>
            ) : (
              <div className="space-y-2.5">
                <p className="text-[11px] text-slate-400 font-medium px-1">
                  {perPelerin.length} pèlerin(s) concerné(s). Le coût correspond à la somme des quote-parts des dépenses affichées.
                </p>
                {perPelerin.map(({ p, cout, lignes }) => {
                  const k = String(p.id)
                  const open = expandedPelerin === k
                  const paye = Number(p.total_paye) || 0
                  const net = paye - cout
                  return (
                    <div key={k} className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
                      <button
                        type="button"
                        onClick={() => setExpandedPelerin(open ? null : k)}
                        className="w-full p-3.5 text-left flex items-center gap-3 active:bg-slate-50 cursor-pointer"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="font-bold text-slate-900 text-xs sm:text-sm truncate">{pName(p)}</p>
                          <p className="text-[10px] sm:text-[11px] text-slate-400 font-mono truncate">{p.num_passeport || 'Sans passeport'}</p>
                          <p className="text-[11px] text-slate-500 font-semibold mt-0.5">
                            Payé {fmt(paye)} {curShort} • {lignes.length} charge(s)
                          </p>
                        </div>
                        <div className="text-right shrink-0">
                          <p className="text-xs sm:text-sm font-black text-rose-600 tabular-nums">-{fmt(cout)} {curShort}</p>
                          <span
                            className={`inline-block mt-1 text-[10px] font-bold px-2 py-0.5 rounded-md tabular-nums ${net >= 0 ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'
                              }`}
                          >
                            Marge {net > 0 ? '+' : ''}{fmt(net)} {curShort}
                          </span>
                        </div>
                        <ChevronDown size={14} className={`text-slate-300 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
                      </button>
                      {open && (
                        <div className="border-t border-slate-100 bg-slate-50/70 p-3.5 space-y-1.5">
                          {lignes.map((l, i) => (
                            <div key={`${l.id}-${i}`} className="flex items-center justify-between text-xs bg-white border border-slate-200 rounded-lg px-3 py-2">
                              <span className="font-semibold text-slate-700 truncate pr-2">{l.libelle}</span>
                              <span className="font-black text-rose-600 tabular-nums shrink-0">-{fmt(l.part)} {curShort}</span>
                            </div>
                          ))}
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

      {/* ===================== FILTRES (mobile) ===================== */}
      <Sheet
        open={showFilters}
        onClose={() => setShowFilters(false)}
        title="Filtrer & trier"
        subtitle={`${filteredRows.length} écriture(s) • -${fmt(filteredTotal)} ${curSymbol}`}
        footer={
          <div className="grid grid-cols-3 gap-2">
            <button
              type="button"
              onClick={resetFilters}
              className="h-11 rounded-xl bg-white border border-slate-200 text-slate-700 text-xs font-black active:bg-slate-100 cursor-pointer"
            >
              Réinitialiser
            </button>
            <button
              type="button"
              onClick={exportCsv}
              disabled={filteredRows.length === 0}
              className="h-11 rounded-xl bg-white border border-slate-200 text-slate-700 text-xs font-black active:bg-slate-100 flex items-center justify-center gap-1.5 disabled:opacity-40 cursor-pointer"
            >
              <Download size={14} /> CSV
            </button>
            <button
              type="button"
              onClick={() => setShowFilters(false)}
              className="h-11 rounded-xl bg-blue-600 active:bg-blue-700 text-white text-xs font-black cursor-pointer"
            >
              Voir ({filteredRows.length})
            </button>
          </div>
        }
      >
        <div className="space-y-5 pt-1">
          <div>
            <label className="text-[10px] font-black text-slate-500 uppercase tracking-wider block mb-2">Trier par</label>
            <div className="flex">{sortSelect}</div>
          </div>
          <div>
            <label className="text-[10px] font-black text-slate-500 uppercase tracking-wider block mb-2">Type d'affectation</label>
            {renderTypeChips()}
          </div>
          {natures.length > 0 && (
            <div>
              <label className="text-[10px] font-black text-slate-500 uppercase tracking-wider block mb-2">Nature de la charge</label>
              {renderNatureChips()}
            </div>
          )}
        </div>
      </Sheet>

      {/* ===================== DÉTAIL D'UNE DÉPENSE (mobile) ===================== */}
      <Sheet
        open={!!detailRow && isMobile}
        onClose={() => setDetailId(null)}
        title={detailRow?.d.libelle ?? ''}
        subtitle={detailRow?.label}
        footer={detailRow ? renderActions(detailRow) : undefined}
      >
        {detailRow && (
          <div className="space-y-4 pt-1">
            <div className="rounded-2xl bg-rose-50 border border-rose-100 p-4 text-center">
              <p className="text-[10px] font-black uppercase tracking-wider text-rose-400">Total de la dépense</p>
              <p className="text-2xl sm:text-3xl font-black text-rose-600 tabular-nums mt-1">
                -{fmt(detailRow.montant)} <span className="text-sm">{curSymbol}</span>
              </p>
              {detailRow.count > 1 && (
                <p className="text-xs font-bold text-rose-500 mt-1">
                  {fmt(detailRow.unit)} {curShort} × {detailRow.dyn ? detailRow.targets.length : detailRow.count} pèlerins
                </p>
              )}
            </div>

            {detailRow.dyn && (
              <p className="text-xs text-blue-800 font-semibold bg-blue-50 border border-blue-100 rounded-2xl p-3 flex gap-2">
                <RefreshCw size={14} className="shrink-0 mt-0.5" />
                Dépense dynamique : le total suit automatiquement les pèlerins ajoutés ou retirés de la liste.
              </p>
            )}

            <div className="rounded-2xl border border-slate-200 divide-y divide-slate-100 text-xs">
              {[
                ['Type', TYPE_META[detailRow.d.type_cible]?.label ?? detailRow.d.type_cible],
                ['Mode', detailRow.dyn ? 'Dynamique (auto)' : 'Montant fixe'],
                ['Pèlerins', String(detailRow.dyn ? detailRow.targets.length : detailRow.count)],
                ['Enregistrée par', formatAuthorInline(detailRow.d.recorded_by_name, detailRow.d.recorded_by_role) || 'Non renseigné'],
                ['Date', detailRow.d.created_at ? new Date(detailRow.d.created_at).toLocaleDateString('fr-FR') : '—'],
              ].map(([k, v]) => (
                <div key={k} className="flex items-center justify-between px-3.5 py-2.5">
                  <span className="font-bold text-slate-400">{k}</span>
                  <span className="font-black text-slate-800 text-right">{v}</span>
                </div>
              ))}
            </div>

            {detailRow.targets.length > 0 ? (
              <div>
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-wider mb-2">
                  Pèlerins concernés ({detailRow.targets.length})
                </p>
                <div className="rounded-2xl border border-slate-200 divide-y divide-slate-100 overflow-hidden">
                  {detailRow.targets.slice(0, 80).map(p => (
                    <div key={String(p.id)} className="flex items-center justify-between gap-3 px-3.5 py-2.5">
                      <div className="min-w-0">
                        <p className="text-xs font-bold text-slate-900 truncate">{pName(p)}</p>
                        <p className="text-[10px] text-slate-400 font-mono truncate">{p.num_passeport || 'Sans passeport'}</p>
                      </div>
                      <span className="text-[11px] font-black text-rose-600 tabular-nums shrink-0">-{fmt(detailRow.unit)} {curShort}</span>
                    </div>
                  ))}
                  {detailRow.targets.length > 80 && (
                    <p className="px-3.5 py-2.5 text-[11px] font-bold text-slate-400">+{detailRow.targets.length - 80} autres</p>
                  )}
                </div>
              </div>
            ) : (
              renderPelerinChips(detailRow)
            )}
          </div>
        )}
      </Sheet>

      {/* ===================== ASSISTANT PLEIN ÉCRAN MOBILE (3 ÉTAPES NATIVES) ===================== */}
      {showSheet && isMobile && (
        <div className="fixed inset-0 z-[9998] bg-[#F8FAFC] flex flex-col animate-in slide-in-from-bottom duration-200">
          {/* Barre supérieure native avec flèche retour & 3 étapes cliquables */}
          <div className="bg-white border-b border-slate-200/80 px-4 pt-[max(0.85rem,env(safe-area-inset-top))] pb-3 shrink-0 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => {
                  if (mobileStep > 1) setMobileStep((mobileStep - 1) as 1 | 2 | 3)
                  else closeSheet()
                }}
                aria-label="Retour"
                className="w-9 h-9 rounded-full bg-slate-100 text-slate-700 flex items-center justify-center active:scale-90 transition cursor-pointer"
              >
                <ArrowLeft size={18} />
              </button>

              <div className="text-center min-w-0">
                <p className="text-sm font-black text-slate-900 truncate">
                  {editingId ? 'Modifier la dépense' : 'Nouvelle dépense'}
                </p>
                <p className="text-[11px] font-bold text-slate-400">
                  {HAJJ_CURRENCY_MAP[selectedDevise].label} • Étape {mobileStep} sur 3
                </p>
              </div>

              <button
                type="button"
                onClick={closeSheet}
                aria-label="Fermer"
                className="w-9 h-9 rounded-full bg-slate-100 text-slate-500 flex items-center justify-center active:scale-90 transition cursor-pointer"
              >
                <X size={17} />
              </button>
            </div>

            {/* Barre de progression interactive 3 étapes */}
            <div className="grid grid-cols-3 gap-1.5">
              {([
                [1, '1. Pour qui'],
                [2, '2. Nature'],
                [3, '3. Montant'],
              ] as const).map(([stepNum, stepLabel]) => {
                const active = mobileStep === stepNum
                const done = mobileStep > stepNum
                const canJump =
                  stepNum === 1 ||
                  (stepNum === 2 && isTargetValid) ||
                  (stepNum === 3 && isTargetValid && (libelle !== 'Autre' || customLibelle.trim() !== ''))
                return (
                  <button
                    key={stepNum}
                    type="button"
                    disabled={!canJump}
                    onClick={() => canJump && setMobileStep(stepNum)}
                    className="text-left space-y-1 disabled:opacity-45 cursor-pointer"
                  >
                    <div
                      className={`h-1 rounded-full transition-colors ${
                        active ? 'bg-blue-600' : done ? 'bg-slate-900' : 'bg-slate-200'
                      }`}
                    />
                    <span
                      className={`block text-[10.5px] font-bold truncate ${
                        active ? 'text-blue-600' : done ? 'text-slate-800' : 'text-slate-400'
                      }`}
                    >
                      {stepLabel}
                    </span>
                  </button>
                )
              })}
            </div>
          </div>

          {/* Contenu aéré de l'étape active */}
          <div className="flex-1 overflow-y-auto overscroll-contain px-5 py-5 space-y-5">
            {mobileStep === 1 && (
              <>
                <div className="space-y-1">
                  <h2 className="text-xl font-black text-slate-900 tracking-tight">
                    Qui est concerné ?
                  </h2>
                  <p className="text-xs text-slate-500 font-medium">
                    Choisissez à qui imputer cette dépense en {curSymbol}.
                  </p>
                </div>

                {/* 5 cartes tactiles claires */}
                <div className="space-y-2">
                  {TYPE_ORDER.map(id => {
                    const m = TYPE_META[id]
                    const active = typeCible === id
                    return (
                      <button
                        key={id}
                        type="button"
                        onClick={() => {
                          changeType(id)
                          if (id !== 'global') {
                            // Ouvre le sélecteur en 1 tap pour les types qui nécessitent un choix
                            setTimeout(() => setShowPicker(true), 60)
                          }
                        }}
                        className={`w-full p-3.5 rounded-2xl border flex items-center gap-3.5 text-left transition active:scale-[0.99] cursor-pointer ${
                          active
                            ? 'bg-slate-900 text-white border-slate-900 shadow-sm'
                            : 'bg-white text-slate-800 border-blue-950/15'
                        }`}
                      >
                        <div
                          className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                            active ? 'bg-white/15 text-white' : 'bg-slate-100 text-slate-600'
                          }`}
                        >
                          <m.icon size={18} />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-black leading-tight">{m.label}</p>
                          <p className={`text-xs mt-0.5 ${active ? 'text-slate-300' : 'text-slate-400'}`}>
                            {m.desc}
                          </p>
                        </div>
                        <div
                          className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 ${
                            active ? 'bg-blue-500 border-blue-500 text-white' : 'border-slate-300'
                          }`}
                        >
                          {active && <Check size={12} strokeWidth={3} />}
                        </div>
                      </button>
                    )
                  })}
                </div>

                {/* Cible sélectionnée */}
                {typeCible !== 'global' && (
                  <div className="space-y-2">
                    <button
                      type="button"
                      onClick={() => setShowPicker(true)}
                      className={`w-full p-4 rounded-2xl border text-left flex items-center justify-between gap-3 transition active:scale-[0.99] cursor-pointer ${
                        targetSummary
                          ? 'bg-blue-50/70 border-blue-300'
                          : 'bg-white border-dashed border-slate-300'
                      }`}
                    >
                      <div className="min-w-0">
                        <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">
                          Cible choisie
                        </p>
                        <p className={`text-sm mt-0.5 truncate ${targetSummary ? 'font-black text-slate-900' : 'font-bold text-slate-400'}`}>
                          {targetSummary ||
                            (typeCible === 'groupe'
                              ? 'Sélectionner des pèlerins…'
                              : typeCible === 'pelerin'
                              ? 'Choisir un pèlerin…'
                              : typeCible === 'reference'
                              ? 'Choisir un dossier…'
                              : 'Choisir un partenaire…')}
                        </p>
                      </div>
                      <span className="h-8 px-3 rounded-xl bg-blue-600 text-white text-xs font-black flex items-center shrink-0">
                        {targetSummary ? 'Changer' : 'Choisir'}
                      </span>
                    </button>

                    {typeCible === 'groupe' && selectedIds.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 max-h-28 overflow-y-auto pt-1">
                        {selectedIds.map(id => {
                          const p = allPelerins.find(x => String(x.id) === id)
                          return (
                            <span
                              key={id}
                              className="inline-flex items-center gap-1 text-[11px] font-bold bg-white text-slate-700 border border-slate-200 rounded-full pl-2.5 pr-1.5 py-1"
                            >
                              {p ? pName(p) : `#${id}`}
                              <button
                                type="button"
                                onClick={() => setSelectedIds(s => s.filter(x => x !== id))}
                                className="p-0.5 text-slate-400 cursor-pointer"
                                aria-label="Retirer"
                              >
                                <X size={12} />
                              </button>
                            </span>
                          )
                        })}
                      </div>
                    )}
                  </div>
                )}

                {/* Option Figée / Dynamique pour les cibles de type règle */}
                {isRuleType && (
                  <div className="space-y-2">
                    <p className="text-[11px] font-black uppercase tracking-wider text-slate-400">
                      Si de nouveaux pèlerins s’inscrivent ({cibleImpactCount} actuellement)
                    </p>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => setDynamique(false)}
                        className={`p-3.5 rounded-2xl border text-left transition cursor-pointer ${
                          !dynamique
                            ? 'bg-slate-900 text-white border-slate-900'
                            : 'bg-white text-slate-700 border-blue-950/15'
                        }`}
                      >
                        <p className="text-xs font-black">Liste figée</p>
                        <p className={`text-[10.5px] mt-1 leading-snug ${!dynamique ? 'text-slate-300' : 'text-slate-400'}`}>
                          Seulement les pèlerins actuels.
                        </p>
                      </button>
                      <button
                        type="button"
                        onClick={() => setDynamique(true)}
                        className={`p-3.5 rounded-2xl border text-left transition cursor-pointer ${
                          dynamique
                            ? 'bg-blue-600 text-white border-blue-600'
                            : 'bg-white text-slate-700 border-blue-950/15'
                        }`}
                      >
                        <p className="text-xs font-black flex items-center gap-1">
                          <RefreshCw size={12} /> Dynamique
                        </p>
                        <p className={`text-[10.5px] mt-1 leading-snug ${dynamique ? 'text-blue-100' : 'text-slate-400'}`}>
                          S’ajuste tout seul aux nouveaux.
                        </p>
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}

            {mobileStep === 2 && (
              <>
                <div className="space-y-1">
                  <h2 className="text-xl font-black text-slate-900 tracking-tight">
                    Quelle est la nature ?
                  </h2>
                  <p className="text-xs text-slate-500 font-medium">
                    Touchez une catégorie ou saisissez un motif libre.
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-2.5">
                  {LIBELLES.map(item => {
                    const active = libelle === item
                    const Icon = LIBELLE_ICON[item] ?? Receipt
                    return (
                      <button
                        key={item}
                        type="button"
                        onClick={() => {
                          setLibelle(item)
                          setCustomLibelle('')
                        }}
                        className={`p-3.5 rounded-2xl border text-left space-y-2 transition active:scale-[0.98] cursor-pointer ${
                          active
                            ? 'bg-slate-900 text-white border-slate-900 shadow-sm'
                            : 'bg-white text-slate-800 border-blue-950/15'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <div
                            className={`w-9 h-9 rounded-xl flex items-center justify-center ${
                              active ? 'bg-white/15 text-white' : 'bg-slate-100 text-slate-600'
                            }`}
                          >
                            <Icon size={17} />
                          </div>
                          {active && <Check size={16} className="text-blue-400" strokeWidth={3} />}
                        </div>
                        <p className="text-xs font-black leading-snug">{item}</p>
                      </button>
                    )
                  })}

                  <button
                    type="button"
                    onClick={() => setLibelle('Autre')}
                    className={`p-3.5 rounded-2xl border text-left space-y-2 transition active:scale-[0.98] cursor-pointer ${
                      libelle === 'Autre'
                        ? 'bg-slate-900 text-white border-slate-900 shadow-sm'
                        : 'bg-white text-slate-800 border-blue-950/15'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div
                        className={`w-9 h-9 rounded-xl flex items-center justify-center ${
                          libelle === 'Autre' ? 'bg-white/15 text-white' : 'bg-slate-100 text-slate-600'
                        }`}
                      >
                        <Sparkles size={17} />
                      </div>
                      {libelle === 'Autre' && <Check size={16} className="text-blue-400" strokeWidth={3} />}
                    </div>
                    <p className="text-xs font-black leading-snug">Autre motif…</p>
                  </button>
                </div>

                {libelle === 'Autre' && (
                  <div className="pt-1">
                    <label className="block text-[11px] font-black uppercase tracking-wider text-slate-400 mb-1.5">
                      Motif personnalisé
                    </label>
                    <input
                      type="text"
                      autoFocus
                      value={customLibelle}
                      onChange={e => setCustomLibelle(e.target.value)}
                      placeholder="Ex : Assurance voyage, Valises…"
                      className="w-full h-12 px-4 rounded-2xl bg-white border border-slate-300 text-sm font-bold text-slate-900 outline-none focus:border-blue-600"
                    />
                  </div>
                )}
              </>
            )}

            {mobileStep === 3 && (
              <>
                {/* Rappel cliquable de la sélection */}
                <button
                  type="button"
                  onClick={() => setMobileStep(1)}
                  className="w-full px-3.5 py-2.5 rounded-2xl bg-white border border-blue-950/15 flex items-center justify-between gap-2 text-left cursor-pointer"
                >
                  <div className="min-w-0">
                    <p className="text-xs font-black text-slate-900 truncate">
                      {finalLibelle || 'Dépense'}
                    </p>
                    <p className="text-[11px] font-semibold text-slate-500 truncate">
                      {typeCible === 'global'
                        ? `Toute la campagne (${cibleImpactCount} pers.)`
                        : `${targetSummary} • ${cibleImpactCount} pers.`}
                    </p>
                  </div>
                  <span className="text-[11px] font-black text-blue-600 shrink-0">Modifier</span>
                </button>

                {/* Saisie géante centrée façon Revolut / Apple Pay */}
                <div className="bg-white rounded-3xl border border-blue-950/15 shadow-xs p-5 text-center space-y-4">
                  <p className="text-[11px] font-black uppercase tracking-wider text-slate-400">
                    {effMode === 'unitaire' && cibleImpactCount > 1
                      ? 'Montant par pèlerin'
                      : 'Montant total décaissé'}
                  </p>

                  <div className="flex items-baseline justify-center gap-2">
                    <input
                      type="text"
                      inputMode="numeric"
                      autoFocus
                      value={montantSaisi}
                      onChange={e => setMontantSaisi(formatAmount(e.target.value))}
                      placeholder="0"
                      className="w-full max-w-[230px] text-center bg-transparent font-black text-4xl text-slate-900 tabular-nums outline-none placeholder:text-slate-200"
                    />
                    <span className="text-base font-black text-slate-400 shrink-0">{curShort}</span>
                  </div>

                  {cibleImpactCount > 1 && !(isRuleType && dynamique) && (
                    <div className="inline-grid grid-cols-2 gap-1 p-1 bg-slate-100 rounded-xl">
                      <button
                        type="button"
                        onClick={() => setModeCalcul('unitaire')}
                        className={`px-3.5 py-1.5 rounded-lg text-xs font-black transition cursor-pointer ${
                          modeCalcul === 'unitaire' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-500'
                        }`}
                      >
                        Par pèlerin
                      </button>
                      <button
                        type="button"
                        onClick={() => setModeCalcul('total')}
                        className={`px-3.5 py-1.5 rounded-lg text-xs font-black transition cursor-pointer ${
                          modeCalcul === 'total' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-500'
                        }`}
                      >
                        Total global
                      </button>
                    </div>
                  )}
                </div>

                {/* Récapitulatif clair en temps réel */}
                {montantNumerique > 0 && cibleImpactCount > 0 && (
                  <div className="bg-white rounded-2xl border border-blue-950/15 p-4 space-y-2.5 text-xs">
                    <div className="flex items-center justify-between text-slate-500 font-semibold">
                      <span>Pèlerins concernés</span>
                      <span className="font-black text-slate-900 tabular-nums">{cibleImpactCount}</span>
                    </div>
                    <div className="flex items-center justify-between text-slate-500 font-semibold">
                      <span>Coût par pèlerin</span>
                      <span className="font-black text-slate-900 tabular-nums">
                        {fmt(montantUnitaireCalcule)} {curShort}
                      </span>
                    </div>
                    <div className="pt-2.5 border-t border-slate-100 flex items-center justify-between">
                      <span className="font-black text-slate-900">
                        {isRuleType && dynamique ? 'Total actuel (auto)' : 'Total enregistré'}
                      </span>
                      <span className="text-base font-black text-rose-600 tabular-nums">
                        -{fmt(montantTotalStocke)} {curSymbol}
                      </span>
                    </div>
                    {isRuleType && dynamique && (
                      <p className="text-[11px] text-blue-700 font-semibold bg-blue-50 rounded-xl px-3 py-2">
                        Chaque nouveau pèlerin ajoutera automatiquement {fmt(montantNumerique)} {curShort}.
                      </p>
                    )}
                    {editingRow && (
                      <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-[11px] font-bold">
                        <span className="text-slate-400">Ancien : {fmt(editingRow.montant)} {curShort}</span>
                        <span
                          className={`font-black tabular-nums ${
                            deltaEdition === 0 ? 'text-slate-500' : deltaEdition > 0 ? 'text-rose-600' : 'text-emerald-600'
                          }`}
                        >
                          {deltaEdition === 0 ? 'Inchangé' : `${deltaEdition > 0 ? '+' : ''}${fmt(deltaEdition)} ${curShort}`}
                        </span>
                      </div>
                    )}
                  </div>
                )}
              </>
            )}
          </div>

          {/* Barre d'action fixe en bas */}
          <div className="px-5 pt-3 pb-[max(1.25rem,env(safe-area-inset-bottom))] bg-white border-t border-slate-200/80 shrink-0">
            {mobileStep === 1 ? (
              <button
                type="button"
                disabled={!isTargetValid}
                onClick={() => setMobileStep(2)}
                className="w-full h-12 rounded-2xl bg-slate-900 text-white font-black text-sm active:scale-[0.98] transition disabled:opacity-35 cursor-pointer"
              >
                Continuer →
              </button>
            ) : mobileStep === 2 ? (
              <button
                type="button"
                disabled={libelle === 'Autre' && !customLibelle.trim()}
                onClick={() => setMobileStep(3)}
                className="w-full h-12 rounded-2xl bg-slate-900 text-white font-black text-sm active:scale-[0.98] transition disabled:opacity-35 cursor-pointer"
              >
                Continuer →
              </button>
            ) : (
              <button
                type="button"
                onClick={handleSaveDepense}
                disabled={
                  formLoading ||
                  !isTargetValid ||
                  montantTotalStocke <= 0 ||
                  (libelle === 'Autre' && !customLibelle.trim())
                }
                className="w-full h-12 rounded-2xl bg-blue-600 active:bg-blue-700 text-white font-black text-sm shadow-sm active:scale-[0.98] transition disabled:opacity-35 cursor-pointer"
              >
                {formLoading
                  ? 'Enregistrement…'
                  : editingId
                  ? `Enregistrer (${fmt(montantTotalStocke)} ${curShort})`
                  : `Valider la dépense (${fmt(montantTotalStocke)} ${curShort})`}
              </button>
            )}
          </div>
        </div>
      )}

      {/* ===================== CONFIRMATION SUPPRESSION NATIVE (MOBILE) ===================== */}
      <Sheet
        open={!!deleteConfirmId}
        onClose={() => !deleting && setDeleteConfirmId(null)}
        title="Supprimer cette dépense ?"
        subtitle="Cette écriture sera définitivement retirée de la comptabilité."
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
              onClick={() => deleteConfirmId && executeDeleteDepense(deleteConfirmId)}
              className="h-12 rounded-2xl bg-rose-600 text-white font-black text-xs cursor-pointer disabled:opacity-50"
            >
              {deleting ? 'Suppression…' : 'Supprimer'}
            </button>
          </div>
        }
      >
        <p className="text-xs text-slate-600 font-semibold leading-relaxed">
          Les totaux de dépenses et le bénéfice réel seront recalculés immédiatement après suppression.
        </p>
      </Sheet>

      {/* ===================== FEUILLE PC : AJOUT / MODIFICATION (100% INCHANGÉE) ===================== */}
      <Sheet
        open={showSheet && !isMobile}
        onClose={closeSheet}
        title={editingId ? `Modifier la dépense (${curSymbol})` : `Nouvelle dépense (${curSymbol})`}
        subtitle={editingId ? `Devise active : ${HAJJ_CURRENCY_MAP[selectedDevise].label}` : `Affectée uniquement aux pèlerins en ${HAJJ_CURRENCY_MAP[selectedDevise].label}.`}
        footer={
          <button
            type="button"
            onClick={handleSaveDepense}
            disabled={
              formLoading ||
              !isTargetValid ||
              montantTotalStocke <= 0 ||
              (libelle === 'Autre' && !customLibelle.trim())
            }
            className="w-full py-3.5 bg-slate-900 active:bg-slate-800 text-white font-black text-xs sm:text-sm rounded-2xl transition-colors disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
          >
            {formLoading
              ? 'Enregistrement...'
              : editingId
                ? `Enregistrer les modifications (${fmt(montantTotalStocke)} ${curShort})`
                : `Valider la dépense (${fmt(montantTotalStocke)} ${curShort})`}
          </button>
        }
      >
        <div className="space-y-4 sm:space-y-5 pt-1">
          {/* 1. Modalité d'affectation */}
          <div>
            <label className="text-[10px] font-black text-slate-500 uppercase tracking-wider block mb-2">1. Modalité d'affectation</label>
            <div className="grid grid-cols-2 gap-2">
              {TYPE_ORDER.map(id => {
                const m = TYPE_META[id]
                const active = typeCible === id
                return (
                  <button
                    key={id}
                    type="button"
                    onClick={() => changeType(id)}
                    className={`p-3 rounded-2xl border text-left transition-all cursor-pointer ${id === 'global' ? 'col-span-2' : ''} ${active ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-slate-700 border-slate-200 active:bg-slate-100'
                      }`}
                  >
                    <div className="flex items-center justify-between">
                      <m.icon size={15} className={active ? 'text-white' : 'text-slate-500'} />
                      <span className={`text-[10px] font-bold ${active ? 'text-blue-100' : 'text-slate-400'}`}>{m.desc}</span>
                    </div>
                    <p className="text-xs font-black mt-1.5 leading-tight">{m.label}</p>
                  </button>
                )
              })}
            </div>
          </div>

          {/* 2. Cible */}
          {typeCible !== 'global' && (
            <div>
              <label className="text-[10px] font-black text-slate-500 uppercase tracking-wider block mb-2">
                2. Cible (
                {typeCible === 'pelerin' || typeCible === 'groupe'
                  ? `${data.length} pèlerins`
                  : typeCible === 'reference'
                    ? `${referencesList.length} dossiers`
                    : `${associesList.length} partenaires`}
                )
              </label>
              <button
                type="button"
                onClick={() => setShowPicker(true)}
                className="w-full p-3.5 rounded-2xl border border-slate-300 bg-white active:bg-slate-50 text-left flex items-center justify-between gap-3 cursor-pointer"
              >
                <span className={`text-xs sm:text-sm truncate ${targetSummary ? 'text-slate-900 font-black' : 'text-slate-400 font-bold'}`}>
                  {targetSummary ||
                    (typeCible === 'groupe'
                      ? 'Sélectionner des pèlerins…'
                      : typeCible === 'pelerin'
                        ? 'Choisir un pèlerin…'
                        : typeCible === 'reference'
                          ? 'Choisir un dossier…'
                          : 'Choisir un partenaire…')}
                </span>
                <span className="text-xs font-black text-blue-600 shrink-0">{targetSummary ? 'Modifier' : 'Choisir'}</span>
              </button>

              {typeCible === 'groupe' && selectedIds.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-2.5 max-h-28 overflow-y-auto">
                  {selectedIds.map(id => {
                    const p = allPelerins.find(x => String(x.id) === id)
                    return (
                      <span
                        key={id}
                        className="inline-flex items-center gap-1 text-[11px] font-bold bg-blue-50 text-blue-800 border border-blue-100 rounded-lg pl-2.5 pr-1 py-0.5"
                      >
                        {p ? pName(p) : `#${id}`}
                        <button
                          type="button"
                          onClick={() => setSelectedIds(s => s.filter(x => x !== id))}
                          className="p-0.5 rounded-md active:bg-blue-100 cursor-pointer"
                          aria-label="Retirer"
                        >
                          <X size={12} />
                        </button>
                      </span>
                    )
                  })}
                </div>
              )}
            </div>
          )}

          {/* Mode : figée / dynamique */}
          {isRuleType && (
            <div>
              <label className="text-[10px] font-black text-slate-500 uppercase tracking-wider block mb-2">
                Nouveaux pèlerins ({cibleImpactCount} actuellement)
              </label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setDynamique(false)}
                  className={`p-3 rounded-2xl border text-left transition-all cursor-pointer ${!dynamique ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-700 border-slate-200 active:bg-slate-100'
                    }`}
                >
                  <p className="text-xs font-black">Figée</p>
                  <p className={`text-[10px] font-semibold mt-1 leading-snug ${!dynamique ? 'text-slate-300' : 'text-slate-400'}`}>
                    Liste d'aujourd'hui. Vous pourrez ajouter des personnes plus tard.
                  </p>
                </button>
                <button
                  type="button"
                  onClick={() => setDynamique(true)}
                  className={`p-3 rounded-2xl border text-left transition-all cursor-pointer ${dynamique ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-slate-700 border-slate-200 active:bg-slate-100'
                    }`}
                >
                  <p className="text-xs font-black flex items-center gap-1.5">
                    <RefreshCw size={12} /> Dynamique
                  </p>
                  <p className={`text-[10px] font-semibold mt-1 leading-snug ${dynamique ? 'text-blue-100' : 'text-slate-400'}`}>
                    Se met à jour tout seul à chaque nouveau pèlerin.
                  </p>
                </button>
              </div>
            </div>
          )}

          {/* 3. Nature */}
          <div>
            <label className="text-[10px] font-black text-slate-500 uppercase tracking-wider block mb-2">3. Nature de la charge</label>
            <select
              value={libelle}
              onChange={e => setLibelle(e.target.value)}
              className="w-full px-3.5 py-3 rounded-2xl border border-slate-300 bg-white font-bold text-xs sm:text-sm outline-none focus:border-blue-600 cursor-pointer"
            >
              <option value="Billet d'avion">Billet d'avion</option>
              <option value="Visa & Nusuk">Frais Visa & Nusuk</option>
              <option value="Hébergement Makkah">Hébergement Makkah</option>
              <option value="Hébergement Médine">Hébergement Médine</option>
              <option value="Restauration & Vivres">Restauration & Vivres</option>
              <option value="Transport terrestre (Bus)">Transport terrestre (Bus)</option>
              <option value="Frais de dossier / Passeport">Frais de dossier / Passeport</option>
              <option value="Autre">Autre (Saisie libre...)</option>
            </select>
            {libelle === 'Autre' && (
              <input
                type="text"
                value={customLibelle}
                onChange={e => setCustomLibelle(e.target.value)}
                placeholder="Préciser le motif de la dépense..."
                className="mt-2 w-full px-3.5 py-3 rounded-2xl border border-slate-300 bg-white font-bold text-xs sm:text-sm outline-none focus:border-blue-600"
              />
            )}
          </div>

          {/* 4. Montant */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-[10px] font-black text-slate-500 uppercase tracking-wider">
                4. Montant{isRuleType && dynamique ? ' par pèlerin' : ''}
              </label>
              {cibleImpactCount > 1 && !(isRuleType && dynamique) && (
                <div className="flex gap-1 bg-slate-200/80 p-0.5 rounded-xl text-[11px] font-bold">
                  <button
                    type="button"
                    onClick={() => setModeCalcul('unitaire')}
                    className={`px-3 py-1 rounded-lg transition-colors cursor-pointer ${modeCalcul === 'unitaire' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'}`}
                  >
                    Par pèlerin
                  </button>
                  <button
                    type="button"
                    onClick={() => setModeCalcul('total')}
                    className={`px-3 py-1 rounded-lg transition-colors cursor-pointer ${modeCalcul === 'total' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'}`}
                  >
                    Global
                  </button>
                </div>
              )}
            </div>

            <div className="relative">
              <input
                type="text"
                inputMode="numeric"
                value={montantSaisi}
                onChange={e => setMontantSaisi(formatAmount(e.target.value))}
                placeholder={effMode === 'unitaire' && cibleImpactCount > 1 ? 'Montant unitaire par personne' : 'Montant total décaissé'}
                className="w-full pl-4 pr-14 py-3 rounded-2xl border border-slate-300 bg-white font-black text-base sm:text-lg outline-none focus:border-blue-600"
              />
              <span className="absolute right-4 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">{curSymbol}</span>
            </div>

            {montantNumerique > 0 && cibleImpactCount > 0 && (
              <div className="mt-3 p-3.5 bg-blue-50 border border-blue-200/70 rounded-2xl text-xs space-y-1.5">
                <div className="flex justify-between text-blue-900 font-bold">
                  <span>Nombre de personnes cibles :</span>
                  <span className="font-black">{cibleImpactCount} pèlerin(s)</span>
                </div>
                <div className="flex justify-between text-blue-800">
                  <span>Coût unitaire par pèlerin :</span>
                  <span className="font-bold tabular-nums">{fmt(montantUnitaireCalcule)} {curShort}</span>
                </div>
                <div className="pt-1.5 border-t border-blue-200/60 flex justify-between items-center text-blue-950 font-black">
                  <span>{isRuleType && dynamique ? 'Total actuel :' : 'Total stocké en base :'}</span>
                  <span className="text-sm bg-blue-600 text-white px-2 py-0.5 rounded-md tabular-nums">{fmt(montantTotalStocke)} {curSymbol}</span>
                </div>
                {isRuleType && dynamique && (
                  <p className="text-[11px] text-blue-800 font-semibold pt-1">
                    Chaque nouveau pèlerin ajoutera automatiquement {fmt(montantNumerique)} {curShort} au total.
                  </p>
                )}
                {editingRow && (
                  <div className="pt-1.5 border-t border-blue-200/60 flex justify-between items-center text-blue-900 font-bold">
                    <span>Ancien total : {fmt(editingRow.montant)} {curShort}</span>
                    <span
                      className={`font-black tabular-nums ${deltaEdition === 0 ? 'text-slate-500' : deltaEdition > 0 ? 'text-rose-600' : 'text-emerald-600'
                        }`}
                    >
                      {deltaEdition === 0 ? 'Inchangé' : `${deltaEdition > 0 ? '+' : ''}${fmt(deltaEdition)} ${curShort}`}
                    </span>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </Sheet>

      {/* ===================== FEUILLE : AJOUTER À UNE DÉPENSE EXISTANTE ===================== */}
      <Sheet
        open={!!addRow}
        onClose={closeAdd}
        title="Ajouter à la dépense"
        subtitle={addRow ? `${addRow.d.libelle} • ${addRow.label}` : undefined}
        footer={
          <button
            type="button"
            onClick={handleAdd}
            disabled={!canSaveAdd || addLoading}
            className="w-full py-3.5 bg-blue-600 active:bg-blue-700 text-white font-black text-xs sm:text-sm rounded-2xl transition-colors disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
          >
            {addLoading ? 'Enregistrement...' : canSaveAdd ? `Ajouter +${fmt(addResult.add)} ${curShort} à la dépense` : 'Ajouter à la dépense'}
          </button>
        }
      >
        {addRow && (
          <div className="space-y-4 sm:space-y-5 pt-1">
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="rounded-2xl bg-slate-50 border border-slate-200 p-2.5 sm:p-3">
                <p className="text-[9px] sm:text-[10px] font-black uppercase tracking-wider text-slate-400">Total actuel</p>
                <p className="text-xs sm:text-sm font-black text-slate-900 tabular-nums mt-1">{fmt(addRow.montant)} {curShort}</p>
              </div>
              <div className="rounded-2xl bg-slate-50 border border-slate-200 p-2.5 sm:p-3">
                <p className="text-[9px] sm:text-[10px] font-black uppercase tracking-wider text-slate-400">Pèlerins</p>
                <p className="text-xs sm:text-sm font-black text-slate-900 tabular-nums mt-1">{addRow.dyn ? addRow.targets.length : addRow.count}</p>
              </div>
              <div className="rounded-2xl bg-slate-50 border border-slate-200 p-2.5 sm:p-3">
                <p className="text-[9px] sm:text-[10px] font-black uppercase tracking-wider text-slate-400">Par pers.</p>
                <p className="text-xs sm:text-sm font-black text-slate-900 tabular-nums mt-1">{fmt(addRow.unit)} {curShort}</p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-1 p-1 bg-slate-100 rounded-2xl">
              <button
                type="button"
                disabled={!addPelerinsAvailable}
                onClick={() => setAddMode('pelerins')}
                className={`py-2.5 rounded-xl text-xs font-black flex items-center justify-center gap-1.5 transition-all disabled:opacity-40 cursor-pointer ${addMode === 'pelerins' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-500'
                  }`}
              >
                <UserPlus size={14} /> Des pèlerins
              </button>
              <button
                type="button"
                onClick={() => setAddMode('montant')}
                className={`py-2.5 rounded-xl text-xs font-black flex items-center justify-center gap-1.5 transition-all cursor-pointer ${addMode === 'montant' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-500'
                  }`}
              >
                <Plus size={14} /> Un montant
              </button>
            </div>

            {!addPelerinsAvailable && (
              <p className="text-[11px] font-semibold text-slate-500 bg-slate-50 border border-slate-200 rounded-2xl p-3">
                {addRow.dyn
                  ? 'Cette dépense est dynamique : les nouveaux pèlerins y sont déjà ajoutés automatiquement.'
                  : 'Cette dépense est liée à un groupe sans liste enregistrée. Pour y ajouter des pèlerins un par un, ouvrez « Modifier » et choisissez « Figée » ou « Dynamique ».'}
              </p>
            )}

            {addMode === 'pelerins' && addPelerinsAvailable && (
              <>
                <div>
                  <label className="text-[10px] font-black text-slate-500 uppercase tracking-wider block mb-2">Pèlerins à ajouter</label>
                  <button
                    type="button"
                    onClick={() => setShowAddPicker(true)}
                    className="w-full p-3.5 rounded-2xl border border-slate-300 bg-white active:bg-slate-50 text-left flex items-center justify-between gap-3 cursor-pointer"
                  >
                    <span className={`text-xs sm:text-sm truncate ${addIds.length ? 'text-slate-900 font-black' : 'text-slate-400 font-bold'}`}>
                      {addIds.length ? `${addIds.length} pèlerin(s) sélectionné(s)` : `Choisir parmi ${addPool.length} pèlerin(s)…`}
                    </span>
                    <span className="text-xs font-black text-blue-600 shrink-0">{addIds.length ? 'Modifier' : 'Choisir'}</span>
                  </button>
                  {addIds.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mt-2.5 max-h-24 overflow-y-auto">
                      {addIds.map(id => {
                        const p = allPelerins.find(x => String(x.id) === id)
                        return (
                          <span
                            key={id}
                            className="inline-flex items-center gap-1 text-[11px] font-bold bg-blue-50 text-blue-800 border border-blue-100 rounded-lg pl-2.5 pr-1 py-0.5"
                          >
                            {p ? pName(p) : `#${id}`}
                            <button
                              type="button"
                              onClick={() => setAddIds(s => s.filter(x => x !== id))}
                              className="p-0.5 rounded-md active:bg-blue-100 cursor-pointer"
                              aria-label="Retirer"
                            >
                              <X size={12} />
                            </button>
                          </span>
                        )
                      })}
                    </div>
                  )}
                </div>

                <div>
                  <label className="text-[10px] font-black text-slate-500 uppercase tracking-wider block mb-2">
                    Prix unitaire pour chaque pèlerin ajouté
                  </label>
                  <div className="relative">
                    <input
                      type="text"
                      inputMode="numeric"
                      value={addUnit}
                      onChange={e => setAddUnit(formatAmount(e.target.value))}
                      placeholder="Prix par personne"
                      className="w-full pl-4 pr-14 py-3 rounded-2xl border border-slate-300 bg-white font-black text-base sm:text-lg outline-none focus:border-blue-600"
                    />
                    <span className="absolute right-4 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">{curSymbol}</span>
                  </div>
                  <p className="text-[11px] text-slate-400 font-medium mt-1.5">Pré-rempli avec le prix actuel par personne.</p>
                </div>
              </>
            )}

            {addMode === 'montant' && (
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-[10px] font-black text-slate-500 uppercase tracking-wider">
                    {addRow.dyn ? 'Montant à ajouter par pèlerin' : 'Montant à ajouter'}
                  </label>
                  {!addRow.dyn && addRow.count > 1 && (
                    <div className="flex gap-1 bg-slate-200/80 p-0.5 rounded-xl text-[11px] font-bold">
                      <button
                        type="button"
                        onClick={() => setAddCalc('unitaire')}
                        className={`px-3 py-1 rounded-lg transition-colors cursor-pointer ${addCalc === 'unitaire' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'}`}
                      >
                        Par pèlerin
                      </button>
                      <button
                        type="button"
                        onClick={() => setAddCalc('total')}
                        className={`px-3 py-1 rounded-lg transition-colors cursor-pointer ${addCalc === 'total' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'}`}
                      >
                        Global
                      </button>
                    </div>
                  )}
                </div>
                <div className="relative">
                  <input
                    type="text"
                    inputMode="numeric"
                    value={addAmount}
                    onChange={e => setAddAmount(formatAmount(e.target.value))}
                    placeholder="Montant supplémentaire"
                    className="w-full pl-4 pr-14 py-3 rounded-2xl border border-slate-300 bg-white font-black text-base sm:text-lg outline-none focus:border-blue-600"
                  />
                  <span className="absolute right-4 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">{curSymbol}</span>
                </div>
                <p className="text-[11px] text-slate-400 font-medium mt-1.5">
                  S'ajoute à la dépense existante, sans l'écraser (ex. supplément, frais complémentaires).
                </p>
              </div>
            )}

            {addResult.add > 0 && (
              <div className="p-3.5 bg-blue-50 border border-blue-200/70 rounded-2xl text-xs space-y-1.5">
                <div className="flex justify-between text-blue-900 font-bold">
                  <span>Total actuel</span>
                  <span className="tabular-nums">{fmt(addRow.montant)} {curShort}</span>
                </div>
                <div className="flex justify-between text-blue-800 font-bold">
                  <span>Ajout</span>
                  <span className="tabular-nums">+{fmt(addResult.add)} {curShort}</span>
                </div>
                {addMode === 'pelerins' && (
                  <div className="flex justify-between text-blue-800">
                    <span>Pèlerins</span>
                    <span className="font-bold tabular-nums">
                      {addRow.count} → {addResult.newCount}
                    </span>
                  </div>
                )}
                <div className="pt-1.5 border-t border-blue-200/60 flex justify-between items-center text-blue-950 font-black">
                  <span>Nouveau total</span>
                  <span className="text-sm bg-blue-600 text-white px-2 py-0.5 rounded-md tabular-nums">{fmt(addResult.newTotal)} {curSymbol}</span>
                </div>
              </div>
            )}
          </div>
        )}
      </Sheet>

      {/* ===================== SÉLECTEURS DE CIBLE ===================== */}
      {showSheet && showPicker && typeCible !== 'global' && (
        <TargetPicker
          mode={typeCible}
          data={data}
          referencesList={referencesList}
          associesList={associesList}
          selectedIds={selectedIds}
          cibleValeur={cibleValeur}
          currencyUnit={curShort}
          onConfirmIds={ids => {
            setSelectedIds(ids)
            setShowPicker(false)
          }}
          onConfirmValue={v => {
            setCibleValeur(v)
            setShowPicker(false)
          }}
          onClose={() => setShowPicker(false)}
        />
      )}

      {addRow && showAddPicker && (
        <TargetPicker
          mode="groupe"
          data={addPool}
          referencesList={[]}
          associesList={[]}
          selectedIds={addIds}
          cibleValeur=""
          recentFirst
          currencyUnit={curShort}
          onConfirmIds={ids => {
            setAddIds(ids)
            setShowAddPicker(false)
          }}
          onConfirmValue={() => undefined}
          onClose={() => setShowAddPicker(false)}
        />
      )}
    </div>
  )
}