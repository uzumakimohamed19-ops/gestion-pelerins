'use client'
import { useEffect, useState, useMemo } from 'react'
import { supabase, getUser } from '@/lib/supabase'
import { useQuery } from '@powersync/react'
import { useRouter } from 'next/navigation'
import { useYear } from '@/lib/YearContext'
import { useUI } from '@/lib/UIContext'
import { YearSelector } from '@/components/YearSelector'
import { HajjCurrencyTabs } from '@/components/HajjCurrencySelector'
import {
  HAJJ_CURRENCIES,
  HAJJ_CURRENCY_MAP,
  countByCurrency,
  getHajjCurrencySymbol,
  normalizeHajjCurrency,
  type HajjCurrency,
} from '@/lib/hajjCurrency'
import { 
  BarChart3, Download, Loader2, Search,
  Receipt, Wallet, ChevronDown, ChevronUp, ChevronRight,
  ArrowUpRight, ArrowDownRight, CreditCard, X, SlidersHorizontal, Building2
} from 'lucide-react'
import ExcelJS from 'exceljs'
import { saveAs } from 'file-saver'

interface Pelerin {
  id: string
  prenom?: string
  nom_complet: string
  num_passeport?: string
  telephone_pelerin?: string
  reference?: string
  total_paye?: number
  prix_package?: number
  devise: HajjCurrency
  agence_ou_personne_associee?: string
  campagne?: number | string
  hotel_mecque?: string
  hotel_medine?: string
  groupe_encadrement?: string
  groupe_formation?: string
  nom_package?: string
  agences?: { nom_agence?: string }
}

interface DepenseHajj {
  id: string
  type_cible: string
  cible_valeur: string
  libelle: string
  montant: number
  devise: HajjCurrency
  recorded_by_name?: string | null
  recorded_by_role?: string | null
  created_at: string
}

interface DepenseImputee {
  depense: DepenseHajj
  montantPartage: number
  motif: string
}

const getNomPelerin = (p: Pelerin) => `${p.prenom || ''} ${p.nom_complet || ''}`.trim()
const getAgenceNom = (p: Pelerin) => p.agences?.nom_agence || p.agence_ou_personne_associee || 'Agence non renseignée'

export default function EtatGeneralHajj() {
  const [allPelerins, setAllPelerins] = useState<Pelerin[]>([])
  const [allDepenses, setAllDepenses] = useState<DepenseHajj[]>([])
  const [selectedDevise, setSelectedDevise] = useState<HajjCurrency>('FCFA')
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [filtreRentabilite, setFiltreRentabilite] = useState<'tous' | 'positif' | 'negatif' | 'impaye'>('tous')
  const [filtreAgence, setFiltreAgence] = useState<string>('toutes')
  const [expandedPelerinId, setExpandedPelerinId] = useState<string | null>(null)
  const [mobileDetailPelerinId, setMobileDetailPelerinId] = useState<string | null>(null)
  const [mobileAgenceSheetOpen, setMobileAgenceSheetOpen] = useState(false)

  const curSymbol = getHajjCurrencySymbol(selectedDevise)
  const curShort = getHajjCurrencySymbol(selectedDevise, true)

  const router = useRouter()
  const { selectedYear } = useYear()
  const { setHideNavbar } = useUI()

  useEffect(() => {
    setHideNavbar(Boolean(mobileDetailPelerinId || mobileAgenceSheetOpen))
    return () => setHideNavbar(false)
  }, [mobileDetailPelerinId, mobileAgenceSheetOpen, setHideNavbar])
  const { data: rawPelerins, isLoading: pelerinsLoading } = useQuery<any>(`
    SELECT p.*, a.nom_agence AS agence_nom_agence
    FROM pelerins p
    LEFT JOIN agences a ON p.agence_id = a.id
    ${selectedYear !== 'all' ? 'WHERE p.campagne = ?' : ''}
    ORDER BY p.nom_complet ASC
  `, selectedYear !== 'all' ? [selectedYear] : [])
  const { data: rawDepenses, isLoading: depensesLoading } = useQuery<DepenseHajj>(
    'SELECT * FROM depenses_hajj ORDER BY created_at DESC',
  )

  useEffect(() => {
    const checkUserAndFetch = async () => {
      const { data: { user } } = await getUser()
      if (!user) {
        if (navigator.onLine) router.push('/login')
        return
      }

    }

    checkUserAndFetch()
  }, [router, selectedYear])

  useEffect(() => {
    setAllPelerins((rawPelerins ?? []).map((p: any) => ({
      ...p,
      total_paye: Number(p.total_paye || 0),
      prix_package: Number(p.prix_package || 0),
      devise: normalizeHajjCurrency(p.devise),
      agences: p.agence_nom_agence ? { nom_agence: p.agence_nom_agence } : undefined,
    })))
    setAllDepenses((rawDepenses ?? []).map((d: any) => ({
      ...d,
      montant: Number(d.montant || 0),
      devise: normalizeHajjCurrency(d.devise),
    })))
    setLoading(pelerinsLoading || depensesLoading)
  }, [rawPelerins, rawDepenses, pelerinsLoading, depensesLoading])

  const deviseCounts = useMemo(() => countByCurrency(allPelerins), [allPelerins])

  // Isolation stricte par devise : aucun mélange possible
  const pelerins = useMemo(
    () => allPelerins.filter(p => p.devise === selectedDevise),
    [allPelerins, selectedDevise]
  )
  const depenses = useMemo(
    () => allDepenses.filter(d => d.devise === selectedDevise),
    [allDepenses, selectedDevise]
  )

  // Pré-indexation rapide des dépenses et des groupes en O(N + D)
  const calculsConsolides = useMemo(() => {
    if (!pelerins.length) {
      return {
        pelerinsCalcules: [],
        statsGlobales: {
          totalPelerinsCount: 0,
          caAttendu: 0,
          caEncaisse: 0,
          soldeACollecter: 0,
          totalDepensesReelles: 0,
          soldeCompteActuel: 0,
          soldeComptePrevisionnel: 0
        },
        detailParPelerin: new Map<string, DepenseImputee[]>()
      }
    }

    const clean = (val?: string | null) => (val || '').trim().toLowerCase()
    const totalEffectif = pelerins.length

    const referenceCounts = new Map<string, number>()
    const encadrementCounts = new Map<string, number>()
    const formationCounts = new Map<string, number>()
    const hotelCounts = new Map<string, number>()
    const packageCounts = new Map<string, number>()

    pelerins.forEach(p => {
      const ref = clean(p.reference)
      if (ref) referenceCounts.set(ref, (referenceCounts.get(ref) || 0) + 1)

      const enc = clean(p.groupe_encadrement)
      if (enc) encadrementCounts.set(enc, (encadrementCounts.get(enc) || 0) + 1)

      const form = clean(p.groupe_formation)
      if (form) formationCounts.set(form, (formationCounts.get(form) || 0) + 1)

      const hmec = clean(p.hotel_mecque)
      if (hmec) hotelCounts.set(hmec, (hotelCounts.get(hmec) || 0) + 1)

      const hmed = clean(p.hotel_medine)
      if (hmed) hotelCounts.set(hmed, (hotelCounts.get(hmed) || 0) + 1)

      const pkg = clean(p.nom_package)
      if (pkg) packageCounts.set(pkg, (packageCounts.get(pkg) || 0) + 1)
    })

    const directesMap = new Map<string, DepenseHajj[]>()
    const referenceMap = new Map<string, DepenseHajj[]>()
    const encadrementMap = new Map<string, DepenseHajj[]>()
    const formationMap = new Map<string, DepenseHajj[]>()
    const hotelMap = new Map<string, DepenseHajj[]>()
    const packageMap = new Map<string, DepenseHajj[]>()
    const globales: DepenseHajj[] = []

    let totalDepensesReelles = 0

    depenses.forEach(d => {
      const type = clean(d.type_cible)
      const cible = clean(d.cible_valeur)
      const montant = Number(d.montant) || 0
      totalDepensesReelles += montant

      if (montant <= 0) return

      if (['pelerin', 'pèlerin', 'personne', 'individuel'].includes(type)) {
        if (!cible) return
        const list = directesMap.get(cible) || []
        list.push(d)
        directesMap.set(cible, list)
      } else if (['reference', 'dossier'].includes(type)) {
        if (!cible) return
        const list = referenceMap.get(cible) || []
        list.push(d)
        referenceMap.set(cible, list)
      } else if (['groupe', 'groupe_encadrement'].includes(type)) {
        if (!cible) return
        const list = encadrementMap.get(cible) || []
        list.push(d)
        encadrementMap.set(cible, list)
      } else if (type === 'groupe_formation') {
        if (!cible) return
        const list = formationMap.get(cible) || []
        list.push(d)
        formationMap.set(cible, list)
      } else if (['hotel', 'hotel_mecque', 'hotel_medine'].includes(type)) {
        if (!cible) return
        const list = hotelMap.get(cible) || []
        list.push(d)
        hotelMap.set(cible, list)
      } else if (['package', 'forfait'].includes(type)) {
        if (!cible) return
        const list = packageMap.get(cible) || []
        list.push(d)
        packageMap.set(cible, list)
      } else {
        globales.push(d)
      }
    })

    const detailParPelerin = new Map<string, DepenseImputee[]>()
    let caAttendu = 0
    let caEncaisse = 0

    const pelerinsCalcules = pelerins.map(p => {
      const pId = clean(String(p.id))
      const pRef = clean(p.reference)
      const pPass = clean(p.num_passeport)
      const pEnc = clean(p.groupe_encadrement)
      const pForm = clean(p.groupe_formation)
      const pHmec = clean(p.hotel_mecque)
      const pHmed = clean(p.hotel_medine)
      const pPkg = clean(p.nom_package)

      const imputations: DepenseImputee[] = []
      let totalCout = 0

      const push = (d: DepenseHajj, montantPartage: number, motif: string) => {
        imputations.push({ depense: d, montantPartage, motif })
        totalCout += montantPartage
      }

      // Directe ID ou Passeport ou Référence
      const directesId = directesMap.get(pId) || []
      const directesPass = pPass ? directesMap.get(pPass) || [] : []
      const directesRef = pRef ? directesMap.get(pRef) || [] : []
      const directesMerged = Array.from(new Set([...directesId, ...directesPass, ...directesRef]))

      directesMerged.forEach(d => {
        push(d, Number(d.montant) || 0, 'Frais direct')
      })

      // Référence de groupe
      if (pRef && referenceMap.has(pRef)) {
        const list = referenceMap.get(pRef)!
        const count = referenceCounts.get(pRef) || 1
        list.forEach(d => push(d, Math.round((Number(d.montant) || 0) / count), `Part dossier (1/${count})`))
      }

      // Groupe Encadrement
      if (pEnc && encadrementMap.has(pEnc)) {
        const list = encadrementMap.get(pEnc)!
        const count = encadrementCounts.get(pEnc) || 1
        list.forEach(d => push(d, Math.round((Number(d.montant) || 0) / count), `Groupe encadrement (1/${count})`))
      }

      // Groupe Formation
      if (pForm && formationMap.has(pForm)) {
        const list = formationMap.get(pForm)!
        const count = formationCounts.get(pForm) || 1
        list.forEach(d => push(d, Math.round((Number(d.montant) || 0) / count), `Groupe formation (1/${count})`))
      }

      // Hôtel Makkah / Madinah
      if (pHmec && hotelMap.has(pHmec)) {
        const list = hotelMap.get(pHmec)!
        const count = hotelCounts.get(pHmec) || 1
        list.forEach(d => push(d, Math.round((Number(d.montant) || 0) / count), `Hôtel Makkah (1/${count})`))
      }
      if (pHmed && hotelMap.has(pHmed)) {
        const list = hotelMap.get(pHmed)!
        const count = hotelCounts.get(pHmed) || 1
        list.forEach(d => push(d, Math.round((Number(d.montant) || 0) / count), `Hôtel Médine (1/${count})`))
      }

      // Package
      if (pPkg && packageMap.has(pPkg)) {
        const list = packageMap.get(pPkg)!
        const count = packageCounts.get(pPkg) || 1
        list.forEach(d => push(d, Math.round((Number(d.montant) || 0) / count), `Frais package (1/${count})`))
      }

      // Globales
      globales.forEach(d => {
        const part = Math.round((Number(d.montant) || 0) / Math.max(totalEffectif, 1))
        push(d, part, `Quote-part globale (1/${totalEffectif})`)
      })

      detailParPelerin.set(String(p.id), imputations)

      const encaisse = Number(p.total_paye) || 0
      const prixPackage = Number(p.prix_package) || 0
      const soldeRestant = prixPackage - encaisse
      const gainReel = encaisse - totalCout
      const gainPrevisionnel = prixPackage - totalCout
      const margePct = prixPackage > 0 ? Math.round((gainPrevisionnel / prixPackage) * 100) : 0
      const reglementPct = prixPackage > 0 ? Math.min(Math.round((encaisse / prixPackage) * 100), 100) : 0

      caAttendu += prixPackage
      caEncaisse += encaisse

      return {
        ...p,
        totalCout,
        soldeRestant,
        gainReel,
        gainPrevisionnel,
        margePct,
        reglementPct,
        imputationsCount: imputations.length
      }
    })

    const soldeACollecter = caAttendu - caEncaisse
    const soldeCompteActuel = caEncaisse - totalDepensesReelles
    const soldeComptePrevisionnel = caAttendu - totalDepensesReelles

    return {
      pelerinsCalcules,
      detailParPelerin,
      statsGlobales: {
        totalPelerinsCount: totalEffectif,
        caAttendu,
        caEncaisse,
        soldeACollecter,
        totalDepensesReelles,
        soldeCompteActuel,
        soldeComptePrevisionnel
      }
    }
  }, [pelerins, depenses])

  const { pelerinsCalcules, detailParPelerin, statsGlobales } = calculsConsolides

  const listeAgences = useMemo(() => {
    return Array.from(
      new Set(pelerins.map(p => getAgenceNom(p)).filter(Boolean))
    ).sort()
  }, [pelerins])

  const pelerinsFiltrés = useMemo(() => {
    return pelerinsCalcules.filter(p => {
      const q = searchTerm.toLowerCase()
      const nomPelerin = getNomPelerin(p)
      const matchesSearch = !q ||
        nomPelerin.toLowerCase().includes(q) ||
        (p.num_passeport && p.num_passeport.toLowerCase().includes(q)) ||
        (p.reference && p.reference.toLowerCase().includes(q))

      if (!matchesSearch) return false

      const agenceNom = getAgenceNom(p)
      if (filtreAgence !== 'toutes' && agenceNom !== filtreAgence) {
        return false
      }

      if (filtreRentabilite === 'positif') return p.gainReel > 0
      if (filtreRentabilite === 'negatif') return p.gainReel <= 0
      if (filtreRentabilite === 'impaye') return p.soldeRestant > 0

      return true
    })
  }, [pelerinsCalcules, searchTerm, filtreAgence, filtreRentabilite])

  const exporterExcel = async () => {
    const workbook = new ExcelJS.Workbook()
    const worksheet = workbook.addWorksheet(`Rentabilite ${selectedYear} ${selectedDevise}`)

    worksheet.columns = [
      { header: 'RÉFÉRENCE', key: 'ref', width: 14 },
      { header: 'NOM DU PÈLERIN', key: 'nom', width: 30 },
      { header: 'PASSEPORT', key: 'pass', width: 16 },
      { header: 'DEVISE', key: 'devise', width: 10 },
      { header: `PRIX PACKAGE (${curSymbol})`, key: 'prix', width: 18 },
      { header: `PAYÉ CLIENT (${curSymbol})`, key: 'paye', width: 18 },
      { header: `RELIQUAT DÛ (${curSymbol})`, key: 'solde', width: 18 },
      { header: `TOTAL DÉPENSÉ (${curSymbol})`, key: 'cout_total', width: 20 },
      { header: `GAIN RÉEL ENCAISSÉ (${curSymbol})`, key: 'gain_reel', width: 22 },
      { header: `GAIN PRÉVISIONNEL (${curSymbol})`, key: 'gain_prev', width: 22 },
      { header: 'MARGE (%)', key: 'marge', width: 12 },
      { header: 'AGENCE / CANAL', key: 'agence', width: 22 },
    ]

    worksheet.getRow(1).eachCell((cell) => {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1D4ED8' } }
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 9 }
      cell.alignment = { vertical: 'middle', horizontal: 'center' }
    })

    pelerinsFiltrés.forEach(p => {
      worksheet.addRow({
        ref: p.reference || '-',
        nom: getNomPelerin(p).toUpperCase(),
        pass: p.num_passeport || '-',
        devise: selectedDevise,
        prix: p.prix_package || 0,
        paye: p.total_paye || 0,
        solde: p.soldeRestant,
        cout_total: p.totalCout,
        gain_reel: p.gainReel,
        gain_prev: p.gainPrevisionnel,
        marge: `${p.margePct}%`,
        agence: getAgenceNom(p),
      })
    })

    const buffer = await workbook.xlsx.writeBuffer()
    saveAs(new Blob([buffer]), `Rentabilite_${selectedYear}_${selectedDevise}_${new Date().toISOString().split('T')[0]}.xlsx`)
  }

  if (loading) {
    return (
      <div className="h-screen w-full flex flex-col items-center justify-center gap-3 bg-slate-50 px-4 text-center">
        <Loader2 className="animate-spin text-blue-600" size={32} />
        <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">
          Chargement de l'état général {selectedYear}...
        </p>
      </div>
    )
  }

  const mobileDetailPelerin = mobileDetailPelerinId
    ? pelerinsCalcules.find(p => p.id === mobileDetailPelerinId) || null
    : null
  const mobileDetailImputations = mobileDetailPelerin
    ? (detailParPelerin.get(String(mobileDetailPelerin.id)) || [])
    : []

  return (
    <div className="min-h-screen bg-slate-50 w-full min-w-0 overflow-x-hidden text-slate-800">
      {/* =================================================================== */}
      {/* 📱 VERSION MOBILE NATIVE — EN-TÊTE BLANC PUR (`md:hidden`)          */}
      {/* =================================================================== */}
      <div className="md:hidden pb-28">
        {/* 1. EN-TÊTE BLANC ÉPURÉ & COLLANT */}
        <div className="bg-white/95 backdrop-blur-md border-b border-slate-100 px-5 pt-5 pb-3.5 sticky top-0 z-30 shadow-[0_1px_8px_rgba(15,23,42,0.03)]">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <h1 className="text-2xl font-black text-slate-900 tracking-tight leading-none">
                État Général
              </h1>
              <p className="text-xs font-semibold text-slate-400 mt-1 truncate">
                {selectedYear === 'all' ? 'Toutes campagnes' : `Campagne ${selectedYear}`} • {pelerins.length} pèlerin
                {pelerins.length > 1 ? 's' : ''}
              </p>
            </div>

            <button
              type="button"
              onClick={exporterExcel}
              aria-label="Exporter Excel"
              className="h-10 px-3.5 rounded-full bg-slate-900 text-white text-xs font-black flex items-center gap-1.5 shadow-xs active:scale-95 transition shrink-0 cursor-pointer"
            >
              <Download size={15} />
              <span>Excel</span>
            </button>
          </div>

          {/* Sélecteur de devise natif (3 segments stricts FCFA | EUR | USD) */}
          <div className="mt-3.5 grid grid-cols-3 gap-1 p-1 bg-slate-100 rounded-2xl">
            {HAJJ_CURRENCIES.map(cur => {
              const active = selectedDevise === cur.code
              const count = deviseCounts[cur.code] ?? 0
              return (
                <button
                  key={cur.code}
                  type="button"
                  onClick={() => {
                    setSelectedDevise(cur.code)
                    setFiltreAgence('toutes')
                    setExpandedPelerinId(null)
                    setMobileDetailPelerinId(null)
                  }}
                  className={`h-9 rounded-xl text-xs font-black flex items-center justify-center gap-1.5 transition-all active:scale-[0.98] cursor-pointer ${
                    active ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-500'
                  }`}
                >
                  <span>{cur.shortLabel}</span>
                  <span
                    className={`text-[10px] px-1.5 py-0.5 rounded-full tabular-nums ${
                      active ? 'bg-slate-100 text-slate-800' : 'bg-slate-200/70 text-slate-500'
                    }`}
                  >
                    {count}
                  </span>
                </button>
              )
            })}
          </div>
        </div>

        {/* 2. CORPS DE PAGE AÉRÉ */}
        <div className="px-5 pt-4 space-y-4">
          {/* Carte Synthèse Trésorerie Hero (1 seul bloc clair) */}
          <div className="bg-slate-900 text-white rounded-3xl p-5 shadow-md space-y-4">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-[11px] font-black uppercase tracking-wider text-slate-400">
                  Solde réel disponible
                </p>
                <p
                  className={`text-[1.85rem] leading-none font-black tabular-nums tracking-tight mt-1.5 ${
                    statsGlobales.soldeCompteActuel >= 0 ? 'text-emerald-400' : 'text-rose-400'
                  }`}
                >
                  {statsGlobales.soldeCompteActuel > 0 ? '+' : ''}
                  {statsGlobales.soldeCompteActuel.toLocaleString('fr-FR')}{' '}
                  <span className="text-sm font-bold text-slate-400">{curSymbol}</span>
                </p>
              </div>
              <span className="text-[10px] font-black uppercase px-2.5 py-1 rounded-full bg-white/10 text-slate-200 shrink-0">
                {HAJJ_CURRENCY_MAP[selectedDevise].shortLabel}
              </span>
            </div>

            <div className="grid grid-cols-3 gap-2 pt-3.5 border-t border-white/10">
              <div className="min-w-0">
                <p className="text-[10px] text-slate-400 font-semibold">Encaissé</p>
                <p className="text-xs font-black text-white tabular-nums mt-0.5 truncate">
                  {statsGlobales.caEncaisse.toLocaleString('fr-FR')} {curShort}
                </p>
              </div>
              <div className="min-w-0 border-l border-white/10 pl-2.5">
                <p className="text-[10px] text-slate-400 font-semibold">Dépensé</p>
                <p className="text-xs font-black text-amber-300 tabular-nums mt-0.5 truncate">
                  {statsGlobales.totalDepensesReelles.toLocaleString('fr-FR')} {curShort}
                </p>
              </div>
              <div className="min-w-0 border-l border-white/10 pl-2.5">
                <p className="text-[10px] text-slate-400 font-semibold">À percevoir</p>
                <p className="text-xs font-black text-sky-300 tabular-nums mt-0.5 truncate">
                  {statsGlobales.soldeACollecter.toLocaleString('fr-FR')} {curShort}
                </p>
              </div>
            </div>

            <div className="flex items-center justify-between text-[11px] pt-2.5 border-t border-white/10 text-slate-300">
              <span>Marge finale estimée</span>
              <span className="font-black text-white tabular-nums">
                {statsGlobales.soldeComptePrevisionnel.toLocaleString('fr-FR')} {curShort}
              </span>
            </div>
          </div>

          {/* Recherche + Filtre Agence */}
          <div className="flex items-center gap-2.5">
            <div className="relative flex-1 min-w-0">
              <Search
                size={17}
                className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"
              />
              <input
                type="text"
                placeholder="Rechercher nom, passeport, réf…"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full h-12 pl-11 pr-10 bg-white border border-slate-200/80 rounded-2xl text-sm font-semibold text-slate-900 shadow-xs outline-none focus:border-slate-400 transition"
              />
              {searchTerm && (
                <button
                  type="button"
                  onClick={() => setSearchTerm('')}
                  aria-label="Effacer"
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 w-7 h-7 rounded-full bg-slate-100 text-slate-500 flex items-center justify-center"
                >
                  <X size={14} />
                </button>
              )}
            </div>

            {listeAgences.length > 0 && (
              <button
                type="button"
                onClick={() => setMobileAgenceSheetOpen(true)}
                aria-label="Filtrer par agence"
                className={`relative w-12 h-12 shrink-0 rounded-2xl border shadow-xs flex items-center justify-center active:scale-95 transition cursor-pointer ${
                  filtreAgence !== 'toutes'
                    ? 'bg-slate-900 text-white border-slate-900'
                    : 'bg-white text-slate-700 border-slate-200/80'
                }`}
              >
                <SlidersHorizontal size={17} />
                {filtreAgence !== 'toutes' && (
                  <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-blue-600 text-white text-[9px] font-black flex items-center justify-center">
                    1
                  </span>
                )}
              </button>
            )}
          </div>

          {/* Pills de rentabilité sur 1 seule ligne fluide */}
          <div className="-mx-5 px-5 flex items-center gap-2 overflow-x-auto pb-0.5">
            {[
              { id: 'tous', label: `Tous (${pelerinsCalcules.length})` },
              { id: 'positif', label: 'Bénéficiaires' },
              { id: 'negatif', label: 'En déficit' },
              { id: 'impaye', label: 'Reste dû' },
            ].map(f => {
              const active = filtreRentabilite === f.id
              return (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => setFiltreRentabilite(f.id as any)}
                  className={`h-9 px-3.5 rounded-full text-xs font-bold whitespace-nowrap shrink-0 transition active:scale-95 cursor-pointer ${
                    active
                      ? 'bg-slate-900 text-white shadow-xs'
                      : 'bg-white text-slate-600 border border-slate-200/80'
                  }`}
                >
                  {f.label}
                </button>
              )
            })}
          </div>

          {filtreAgence !== 'toutes' && (
            <div className="flex items-center justify-between px-3.5 py-2 rounded-2xl bg-blue-50 border border-blue-100 text-xs">
              <span className="font-bold text-blue-800 truncate">
                Agence : {filtreAgence}
              </span>
              <button
                type="button"
                onClick={() => setFiltreAgence('toutes')}
                className="text-blue-600 font-black ml-2 shrink-0 cursor-pointer"
              >
                Effacer
              </button>
            </div>
          )}

          {/* Liste des pèlerins aérée */}
          {pelerinsFiltrés.length === 0 ? (
            <div className="bg-white rounded-3xl border border-dashed border-slate-200 py-14 px-6 text-center space-y-2">
              <BarChart3 size={28} className="mx-auto text-slate-300" />
              <p className="text-sm font-black text-slate-700">Aucun dossier trouvé</p>
              <p className="text-xs text-slate-400 font-medium">
                Aucun pèlerin ne correspond à ces critères en {HAJJ_CURRENCY_MAP[selectedDevise].label}.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {pelerinsFiltrés.map((p) => {
                const estSolde = p.soldeRestant <= 0
                const margePositive = p.gainReel >= 0
                const nomPelerin = getNomPelerin(p)
                const agenceNom = getAgenceNom(p)

                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setMobileDetailPelerinId(p.id)}
                    className="w-full text-left bg-white rounded-3xl border border-slate-100 shadow-xs p-4 space-y-3 active:scale-[0.99] transition cursor-pointer"
                  >
                    {/* Identité + Bénéfice encaissé */}
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-2xl bg-slate-900 text-white font-black text-xs flex items-center justify-center shrink-0">
                        {nomPelerin.charAt(0).toUpperCase() || 'P'}
                      </div>
                      <div className="min-w-0 flex-1">
                        <h3 className="font-black text-slate-900 text-sm truncate leading-snug">
                          {nomPelerin}
                        </h3>
                        <p className="text-[11px] text-slate-400 font-medium truncate mt-0.5">
                          {p.reference || 'DIRECT'} • {agenceNom}
                        </p>
                      </div>
                      <div className="text-right shrink-0">
                        <p
                          className={`text-sm font-black tabular-nums flex items-center justify-end gap-0.5 ${
                            margePositive ? 'text-emerald-700' : 'text-rose-600'
                          }`}
                        >
                          {margePositive ? <ArrowUpRight size={13} /> : <ArrowDownRight size={13} />}
                          {p.gainReel > 0 ? '+' : ''}
                          {p.gainReel.toLocaleString('fr-FR')}
                        </p>
                        <p className="text-[10px] font-bold text-slate-400">{curShort} net</p>
                      </div>
                    </div>

                    {/* 3 chiffres clés + barre de règlement */}
                    <div className="space-y-2">
                      <div className="grid grid-cols-3 gap-2 text-xs">
                        <div>
                          <span className="text-[10px] text-slate-400 font-semibold block">Versé</span>
                          <span className="font-black text-emerald-700 tabular-nums">
                            {(p.total_paye || 0).toLocaleString('fr-FR')} {curShort}
                          </span>
                        </div>
                        <div>
                          <span className="text-[10px] text-slate-400 font-semibold block">Charges</span>
                          <span className="font-black text-slate-800 tabular-nums">
                            {p.totalCout.toLocaleString('fr-FR')} {curShort}
                          </span>
                        </div>
                        <div className="text-right">
                          <span className="text-[10px] text-slate-400 font-semibold block">Reste</span>
                          {estSolde ? (
                            <span className="font-black text-emerald-600">Soldé</span>
                          ) : (
                            <span className="font-black text-amber-600 tabular-nums">
                              {p.soldeRestant.toLocaleString('fr-FR')} {curShort}
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full ${estSolde ? 'bg-emerald-500' : 'bg-blue-600'}`}
                          style={{ width: `${p.reglementPct}%` }}
                        />
                      </div>
                    </div>

                    {/* Pied discret ouvrant la ventilation */}
                    <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-xs">
                      <span className="font-bold text-slate-500 flex items-center gap-1.5">
                        <Receipt size={13} className="text-blue-600" />
                        {p.imputationsCount} charge{p.imputationsCount > 1 ? 's' : ''} imputée
                        {p.imputationsCount > 1 ? 's' : ''}
                      </span>
                      <span className="font-black text-slate-900 flex items-center gap-0.5">
                        Détail <ChevronRight size={14} className="text-slate-400" />
                      </span>
                    </div>
                  </button>
                )
              })}
            </div>
          )}
        </div>

        {/* Bottom Sheet 1 : Filtre par Agence */}
        {mobileAgenceSheetOpen && (
          <div
            onClick={() => setMobileAgenceSheetOpen(false)}
            className="fixed inset-0 z-[9999] bg-slate-900/50 backdrop-blur-xs flex items-end md:hidden animate-in fade-in duration-150"
          >
            <div
              onClick={(e) => e.stopPropagation()}
              className="w-full bg-white rounded-t-[2rem] shadow-2xl max-h-[80dvh] flex flex-col animate-in slide-in-from-bottom duration-200"
            >
              <div className="px-5 pt-3 pb-3.5 border-b border-slate-100 shrink-0">
                <div className="w-12 h-1.5 bg-slate-200 rounded-full mx-auto mb-3" />
                <div className="flex items-center justify-between">
                  <h3 className="text-base font-black text-slate-900">Filtrer par agence</h3>
                  <button
                    type="button"
                    onClick={() => setMobileAgenceSheetOpen(false)}
                    className="w-9 h-9 rounded-full bg-slate-100 text-slate-500 flex items-center justify-center cursor-pointer"
                  >
                    <X size={18} />
                  </button>
                </div>
              </div>

              <div className="p-4 overflow-y-auto space-y-2 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
                <button
                  type="button"
                  onClick={() => {
                    setFiltreAgence('toutes')
                    setMobileAgenceSheetOpen(false)
                  }}
                  className={`w-full h-12 px-4 rounded-2xl text-sm font-black flex items-center justify-between cursor-pointer ${
                    filtreAgence === 'toutes'
                      ? 'bg-slate-900 text-white'
                      : 'bg-slate-50 text-slate-700'
                  }`}
                >
                  <span>Toutes les agences</span>
                </button>
                {listeAgences.map((agence) => (
                  <button
                    key={agence}
                    type="button"
                    onClick={() => {
                      setFiltreAgence(agence)
                      setMobileAgenceSheetOpen(false)
                    }}
                    className={`w-full h-12 px-4 rounded-2xl text-sm font-bold flex items-center justify-between gap-2 text-left cursor-pointer ${
                      filtreAgence === agence
                        ? 'bg-slate-900 text-white'
                        : 'bg-slate-50 text-slate-700'
                    }`}
                  >
                    <span className="truncate flex items-center gap-2">
                      <Building2 size={15} className="shrink-0 opacity-70" />
                      <span className="truncate">{agence}</span>
                    </span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Bottom Sheet 2 : Détail Rentabilité & Ventilation des Coûts d'un Pèlerin */}
        {mobileDetailPelerin && (
          <div
            onClick={() => setMobileDetailPelerinId(null)}
            className="fixed inset-0 z-[9999] bg-slate-900/50 backdrop-blur-xs flex items-end md:hidden animate-in fade-in duration-150"
          >
            <div
              onClick={(e) => e.stopPropagation()}
              className="w-full bg-white rounded-t-[2rem] shadow-2xl max-h-[88dvh] flex flex-col animate-in slide-in-from-bottom duration-200"
            >
              <div className="px-5 pt-3 pb-3.5 border-b border-slate-100 shrink-0">
                <div className="w-12 h-1.5 bg-slate-200 rounded-full mx-auto mb-3" />
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="text-base font-black text-slate-900 truncate">
                      {getNomPelerin(mobileDetailPelerin)}
                    </h3>
                    <p className="text-xs font-semibold text-slate-400 truncate mt-0.5">
                      {mobileDetailPelerin.num_passeport || 'Passeport en cours'} • {getAgenceNom(mobileDetailPelerin)}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setMobileDetailPelerinId(null)}
                    className="w-9 h-9 rounded-full bg-slate-100 text-slate-500 flex items-center justify-center shrink-0 cursor-pointer"
                  >
                    <X size={18} />
                  </button>
                </div>
              </div>

              <div className="p-5 overflow-y-auto space-y-4">
                {/* Synthèse rentabilité */}
                <div
                  className={`rounded-2xl p-4 text-center border ${
                    mobileDetailPelerin.gainReel >= 0
                      ? 'bg-emerald-50 border-emerald-100'
                      : 'bg-rose-50 border-rose-100'
                  }`}
                >
                  <p className="text-[10px] font-black uppercase tracking-wider text-slate-500">
                    Bénéfice encaissé
                  </p>
                  <p
                    className={`text-2xl font-black tabular-nums mt-1 ${
                      mobileDetailPelerin.gainReel >= 0 ? 'text-emerald-700' : 'text-rose-600'
                    }`}
                  >
                    {mobileDetailPelerin.gainReel > 0 ? '+' : ''}
                    {mobileDetailPelerin.gainReel.toLocaleString('fr-FR')}{' '}
                    <span className="text-sm">{curSymbol}</span>
                  </p>
                  <p className="text-xs font-bold text-slate-500 mt-1">
                    Marge prévisionnelle : {mobileDetailPelerin.margePct}% ({mobileDetailPelerin.gainPrevisionnel.toLocaleString('fr-FR')} {curShort})
                  </p>
                </div>

                {/* Récap chiffré */}
                <div className="rounded-2xl border border-slate-200 divide-y divide-slate-100 text-xs">
                  {[
                    ['Prix forfait', `${(mobileDetailPelerin.prix_package || 0).toLocaleString('fr-FR')} ${curShort}`],
                    ['Versé par client', `${(mobileDetailPelerin.total_paye || 0).toLocaleString('fr-FR')} ${curShort}`],
                    ['Reste à payer', mobileDetailPelerin.soldeRestant <= 0 ? 'Soldé' : `${mobileDetailPelerin.soldeRestant.toLocaleString('fr-FR')} ${curShort}`],
                    ['Total charges imputées', `${mobileDetailPelerin.totalCout.toLocaleString('fr-FR')} ${curShort}`],
                    ['Téléphone', mobileDetailPelerin.telephone_pelerin || '—'],
                  ].map(([k, v]) => (
                    <div key={k} className="flex items-center justify-between px-4 py-3">
                      <span className="font-semibold text-slate-400">{k}</span>
                      <span className="font-black text-slate-900 tabular-nums">{v}</span>
                    </div>
                  ))}
                </div>

                {/* Ventilation détaillée des charges */}
                <div className="space-y-2">
                  <p className="text-[11px] font-black uppercase tracking-wider text-slate-400">
                    Ventilation des coûts ({mobileDetailImputations.length})
                  </p>
                  {mobileDetailImputations.length === 0 ? (
                    <p className="text-xs text-slate-400 font-semibold text-center py-6 bg-slate-50 rounded-2xl">
                      Aucune charge imputée à ce pèlerin.
                    </p>
                  ) : (
                    <div className="rounded-2xl border border-slate-200 divide-y divide-slate-100 overflow-hidden">
                      {mobileDetailImputations.map((item, idx) => (
                        <div key={idx} className="px-4 py-3 flex items-center justify-between gap-3">
                          <div className="min-w-0">
                            <p className="text-xs font-black text-slate-900 truncate">
                              {item.depense.libelle}
                            </p>
                            <p className="text-[11px] text-slate-400 font-medium mt-0.5 truncate">
                              {item.motif}
                              {item.depense.recorded_by_name ? ` • Par ${item.depense.recorded_by_name}` : ''}
                            </p>
                          </div>
                          <span className="text-xs font-black text-slate-900 tabular-nums shrink-0">
                            {item.montantPartage.toLocaleString('fr-FR')} {curShort}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div className="px-5 pt-3 pb-[max(1.25rem,env(safe-area-inset-bottom))] border-t border-slate-100 bg-white shrink-0">
                <button
                  type="button"
                  onClick={() => setMobileDetailPelerinId(null)}
                  className="w-full h-12 rounded-2xl bg-slate-900 text-white font-black text-sm cursor-pointer"
                >
                  Fermer
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* =================================================================== */}
      {/* 💻 VERSION PC / TABLETTE (100% INCHANGÉE `hidden md:block`)         */}
      {/* =================================================================== */}
      <div className="hidden md:block max-w-[1600px] mx-auto px-4 sm:px-6 py-6 bg-slate-50 min-h-screen w-full min-w-0 overflow-x-hidden text-slate-800">
      
      {/* ── EN-TÊTE PRINCIPAL ── */}
      <div className="flex flex-col lg:flex-row justify-between items-stretch lg:items-center gap-4 mb-4">
        <div className="min-w-0">
          <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight flex items-center gap-2 flex-wrap">
            <BarChart3 className="text-blue-600 shrink-0" size={26} />
            <span className="break-words">État Général & Rentabilité — {selectedYear}</span>
            <span className={`text-xs px-2.5 py-1 rounded-xl border font-black uppercase ${HAJJ_CURRENCY_MAP[selectedDevise].badgeClass}`}>
              {HAJJ_CURRENCY_MAP[selectedDevise].label}
            </span>
          </h1>
          <p className="text-xs text-slate-500 font-medium mt-0.5">
            État séparé par devise — recettes, charges et rentabilité uniquement en {HAJJ_CURRENCY_MAP[selectedDevise].label}.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2.5 w-full lg:w-auto">
          <YearSelector />
          <button 
            onClick={exporterExcel}
            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-xl text-xs font-bold transition-colors shadow-xs active:scale-95 max-w-full cursor-pointer"
          >
            <Download size={14} /> Exporter {selectedDevise} (.xlsx)
          </button>
        </div>
      </div>

      {/* ── SÉLECTEUR DE DEVISE STRICT (FCFA | EUR | USD) ── */}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <HajjCurrencyTabs
          value={selectedDevise}
          onChange={(next) => {
            setSelectedDevise(next)
            setFiltreAgence('toutes')
            setExpandedPelerinId(null)
          }}
          counts={deviseCounts}
        />
        <span className="text-[11px] font-bold text-slate-400">
          {pelerins.length} pèlerin(s) • {depenses.length} dépense(s) en {HAJJ_CURRENCY_MAP[selectedDevise].label}
        </span>
      </div>

      {/* ── BANDEAU SYNTHÈSE TRÉSORERIE ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5 mb-6">
        <div className="bg-white p-4 rounded-2xl border border-slate-200/90 shadow-xs">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[11px] font-bold text-slate-500 uppercase">Recettes Encaissées</span>
            <div className="p-1.5 rounded-lg bg-blue-50 text-blue-600"><Wallet size={15} /></div>
          </div>
          <p className="text-xl font-black text-slate-900 tabular-nums">
            {statsGlobales.caEncaisse.toLocaleString('fr-FR')} <span className="text-xs text-slate-400 font-semibold">{curShort}</span>
          </p>
          <p className="text-[11px] text-slate-500 mt-1">
            Chiffre d'affaires visé : <span className="font-semibold text-slate-700">{statsGlobales.caAttendu.toLocaleString('fr-FR')} {curShort}</span>
          </p>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200/90 shadow-xs">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[11px] font-bold text-slate-500 uppercase">Total Décaissements</span>
            <div className="p-1.5 rounded-lg bg-amber-50 text-amber-600"><Receipt size={15} /></div>
          </div>
          <p className="text-xl font-black text-amber-900 tabular-nums">
            {statsGlobales.totalDepensesReelles.toLocaleString('fr-FR')} <span className="text-xs text-slate-400 font-semibold">{curShort}</span>
          </p>
          <p className="text-[11px] text-slate-500 mt-1">
            {depenses.length} opérations en {curSymbol}
          </p>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200/90 shadow-xs">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[11px] font-bold text-slate-500 uppercase">Solde Réel Disponible</span>
            <div className={`p-1.5 rounded-lg ${statsGlobales.soldeCompteActuel >= 0 ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'}`}>
              <ArrowUpRight size={15} />
            </div>
          </div>
          <p className={`text-xl font-black tabular-nums ${statsGlobales.soldeCompteActuel >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
            {statsGlobales.soldeCompteActuel > 0 ? '+' : ''}{statsGlobales.soldeCompteActuel.toLocaleString('fr-FR')} <span className="text-xs text-slate-400 font-semibold">{curShort}</span>
          </p>
          <p className="text-[11px] text-slate-500 mt-1">
            Encaissé moins sorties effectives
          </p>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200/90 shadow-xs">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[11px] font-bold text-slate-500 uppercase">Reliquat à Percevoir</span>
            <div className="p-1.5 rounded-lg bg-slate-100 text-slate-600"><CreditCard size={15} /></div>
          </div>
          <p className="text-xl font-black text-amber-700 tabular-nums">
            {statsGlobales.soldeACollecter.toLocaleString('fr-FR')} <span className="text-xs text-slate-400 font-semibold">{curShort}</span>
          </p>
          <p className="text-[11px] text-slate-500 mt-1">
            Marge finale estimée : <span className="font-semibold text-slate-800">{statsGlobales.soldeComptePrevisionnel.toLocaleString('fr-FR')} {curShort}</span>
          </p>
        </div>
      </div>

      {/* ── BARRE DE RECHERCHE ET FILTRES ── */}
      <div className="bg-white p-3.5 rounded-2xl border border-slate-200 mb-6 flex flex-col md:flex-row gap-3 items-center justify-between shadow-xs">
        <div className="relative w-full md:w-80 min-w-0">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={15} />
          <input 
            type="text"
            placeholder="Rechercher nom, passeport, réf..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-3 py-2 bg-slate-50 rounded-xl text-base sm:text-xs font-semibold border border-slate-200 focus:outline-none focus:border-blue-600"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
          <select
            value={filtreAgence}
            onChange={(e) => setFiltreAgence(e.target.value)}
            className="max-w-full px-3 py-2 bg-slate-50 text-slate-700 rounded-xl text-base sm:text-xs font-bold border border-slate-200 focus:outline-none cursor-pointer"
          >
            <option value="toutes">Toutes les agences</option>
            {listeAgences.map((agence) => (
              <option key={agence} value={agence}>{agence}</option>
            ))}
          </select>

          <div className="flex flex-wrap gap-1.5 min-w-0">
            {[
              { id: 'tous', label: `Tous (${pelerinsCalcules.length})` },
              { id: 'positif', label: 'Bénéficiaires' },
              { id: 'negatif', label: 'En déficit' },
              { id: 'impaye', label: 'Reste dû' },
            ].map(f => (
              <button
                key={f.id}
                onClick={() => setFiltreRentabilite(f.id as any)}
                className={`px-3 py-2 rounded-xl text-xs font-bold transition-colors whitespace-nowrap border ${
                  filtreRentabilite === f.id
                    ? 'bg-blue-600 text-white border-blue-600'
                    : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── DISPOSITION : GRILLE 4 CARTES PAR LIGNE SUR PC ── */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        {pelerinsFiltrés.map((p) => {
          const estSolde = p.soldeRestant <= 0
          const margePositive = p.gainReel >= 0
          const isExpanded = expandedPelerinId === p.id
          const nomPelerin = getNomPelerin(p)
          const agenceNom = getAgenceNom(p)
          const detailImputations = isExpanded ? (detailParPelerin.get(String(p.id)) || []) : []

          return (
            <div
              key={p.id}
              className={`bg-white rounded-2xl border transition-all duration-150 shadow-xs flex flex-col justify-between overflow-hidden ${
                isExpanded ? 'border-blue-500 ring-1 ring-blue-500' : 'border-slate-200 hover:border-slate-300'
              }`}
            >
              <div className="p-4 flex-1 flex flex-col justify-between">
                
                {/* En-tête profil */}
                <div>
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="w-9 h-9 rounded-xl bg-blue-600 text-white font-black text-xs flex items-center justify-center shrink-0">
                        {nomPelerin.charAt(0).toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <h3 className="font-bold text-slate-900 text-sm truncate leading-tight">
                          {nomPelerin}
                        </h3>
                        <p className="text-[11px] font-mono text-slate-500 truncate mt-0.5">
                          {p.num_passeport || 'Passeport en cours'}
                        </p>
                      </div>
                    </div>
                    <span className="text-[10px] font-mono font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded border border-blue-100 shrink-0">
                      {p.reference || 'DIRECT'}
                    </span>
                  </div>

                  {/* Agence & Téléphone */}
                  <div className="flex items-center justify-between text-[11px] text-slate-500 pb-2.5 mb-2.5 border-b border-slate-100">
                    <span className="truncate max-w-[140px] font-medium">
                      {agenceNom}
                    </span>
                    <span className="font-mono text-slate-400 shrink-0">
                      {p.telephone_pelerin || 'Sans contact'}
                    </span>
                  </div>
                </div>

                {/* Bloc Financier Pèlerin */}
                <div className="space-y-2">
                  <div className="flex justify-between items-baseline text-xs">
                    <span className="text-slate-500">Prix forfait</span>
                    <span className="font-bold text-slate-800 tabular-nums">
                      {(p.prix_package || 0).toLocaleString('fr-FR')} {curShort}
                    </span>
                  </div>

                  <div className="flex justify-between items-baseline text-xs">
                    <span className="text-slate-500">Versé par client</span>
                    <span className="font-bold text-emerald-700 tabular-nums">
                      {(p.total_paye || 0).toLocaleString('fr-FR')} {curShort}
                    </span>
                  </div>

                  {/* Barre d'encaissement unifiée bleue */}
                  <div className="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-blue-600 rounded-full" 
                      style={{ width: `${p.reglementPct}%` }}
                    />
                  </div>

                  <div className="flex justify-between items-baseline text-xs pt-0.5">
                    <span className="text-slate-500">Reste à payer</span>
                    {estSolde ? (
                      <span className="font-bold text-emerald-600 text-[11px]">Soldé</span>
                    ) : (
                      <span className="font-bold text-amber-700 tabular-nums">
                        {p.soldeRestant.toLocaleString('fr-FR')} {curShort}
                      </span>
                    )}
                  </div>
                </div>

                {/* Bloc Coût Réel & Marge */}
                <div className="mt-3.5 pt-3 border-t border-slate-100 bg-slate-50 -mx-4 -mb-4 p-3.5 flex flex-col gap-1.5">
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-slate-500">Dépenses imputées</span>
                    <span className="font-bold text-slate-900 tabular-nums">
                      {p.totalCout.toLocaleString('fr-FR')} {curShort}
                    </span>
                  </div>

                  <div className="flex justify-between items-center text-xs">
                    <span className="text-slate-500 font-medium">Bénéfice encaissé</span>
                    <span className={`font-black tabular-nums flex items-center gap-0.5 ${margePositive ? 'text-emerald-700' : 'text-rose-700'}`}>
                      {margePositive ? <ArrowUpRight size={13} /> : <ArrowDownRight size={13} />}
                      {p.gainReel > 0 ? '+' : ''}{p.gainReel.toLocaleString('fr-FR')} {curShort}
                    </span>
                  </div>

                  <button
                    onClick={() => setExpandedPelerinId(isExpanded ? null : p.id)}
                    className="w-full mt-1.5 py-1.5 px-2.5 rounded-lg bg-white hover:bg-slate-100 border border-slate-200 text-slate-700 text-xs font-bold flex items-center justify-between transition-colors"
                  >
                    <span className="flex items-center gap-1.5">
                      <Receipt size={13} className="text-blue-600" />
                      {p.imputationsCount} charge(s)
                    </span>
                    {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                  </button>
                </div>

              </div>

              {/* Tiroir dépliable des charges imputées */}
              {isExpanded && (
                <div className="bg-slate-100/90 border-t border-slate-200 p-3 text-xs space-y-1.5">
                  <div className="flex items-center justify-between text-[11px] font-bold text-slate-700">
                    <span>Ventilation des coûts</span>
                    <span>{p.totalCout.toLocaleString('fr-FR')} {curShort}</span>
                  </div>

                  {detailImputations.length === 0 ? (
                    <p className="text-[11px] text-slate-400 italic bg-white p-2 rounded-lg border border-slate-200 text-center">
                      Aucune charge imputée à ce profil
                    </p>
                  ) : (
                    <div className="bg-white rounded-lg border border-slate-200 overflow-hidden divide-y divide-slate-100 max-h-48 overflow-y-auto">
                      {detailImputations.map((item, idx) => (
                        <div key={idx} className="p-2 flex justify-between items-center text-[11px]">
                          <div className="min-w-0 flex-1 pr-2">
                            <p className="font-bold text-slate-800 truncate">{item.depense.libelle}</p>
                            <p className="text-[10px] text-slate-400 capitalize">
                              {item.motif}
                              {item.depense.recorded_by_name ? ` • Par ${item.depense.recorded_by_name}` : ''}
                            </p>
                          </div>
                          <span className="font-bold text-slate-900 tabular-nums shrink-0">
                            {item.montantPartage.toLocaleString('fr-FR')} {curShort}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {pelerinsFiltrés.length === 0 && (
        <div className="text-center py-16 text-slate-400 font-medium text-xs bg-white rounded-2xl border border-slate-200 mt-4">
          Aucun pèlerin trouvé pour les critères sélectionnés en {selectedYear}.
        </div>
      )}

      </div>
    </div>
  )
}