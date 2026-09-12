'use client'
import { useEffect, useState, useMemo, useRef } from 'react'
import { usePowerSync, useQuery } from '@powersync/react'
import { useYear } from '@/lib/YearContext'
import { YearSelector } from '@/components/YearSelector'
import {
  TrendingUp, Package, AlertCircle, CheckCircle,
  Wallet, CreditCard, BarChart2, ChevronDown, ChevronUp,
  PlusCircle, Trash2, Landmark, DollarSign, Search,
  Users, Check, X, Building2, Tag, Calendar, Layers
} from 'lucide-react'

type Pelerin = {
  id?: number | string
  prenom?: string
  nom?: string
  nom_complet?: string
  telephone_pelerin?: string
  nom_package?: string
  prix_package?: number | null
  total_paye?: number | null
  reference?: string
  agence_ou_personne_associee?: string
  num_passeport?: string
  campagne?: number | string
  agences?: { nom_agence?: string } | null
  [key: string]: unknown
}

type PackageData = {
  count: number
  encaisse: number
  attendu: number
}

type AgenceData = {
  pelerins: Pelerin[]
  encaisse: number
  attendu: number
}

type Depense = {
  id: string
  type_cible: 'pelerin' | 'reference' | 'associe' | 'global'
  cible_valeur: string
  libelle: string
  montant: number
  created_at?: string
}

export default function ComptabiliteHajj() {
  const { selectedYear } = useYear()
  const db = usePowerSync()
  const [data, setData] = useState<Pelerin[]>([])
  const [depenses, setDepenses] = useState<Depense[]>([])
  const [loading, setLoading] = useState<boolean>(true)
  const [expandedAgence, setExpandedAgence] = useState<string | null>(null)

  // États du formulaire de dépenses
  const [typeCible, setTypeCible] = useState<'pelerin' | 'reference' | 'associe' | 'global'>('pelerin')
  const [cibleValeur, setCibleValeur] = useState<string>('')
  const [libelle, setLibelle] = useState<string>("Billet d'avion")
  const [customLibelle, setCustomLibelle] = useState<string>('')
  const [montantSaisi, setMontantSaisi] = useState<string>('')
  const [modeCalcul, setModeCalcul] = useState<'unitaire' | 'total'>('unitaire')
  const [formLoading, setFormLoading] = useState<boolean>(false)
  const [filterDepenseSearch, setFilterDepenseSearch] = useState<string>('')

  // État du sélecteur personnalisé
  const [isDropdownOpen, setIsDropdownOpen] = useState(false)
  const [searchTarget, setSearchTarget] = useState('')
  const dropdownRef = useRef<HTMLDivElement>(null)

  const sanitizeAmount = (value: string) => value.replace(/\D/g, '')
  const parseAmount = (value: string) => {
    const cleaned = sanitizeAmount(value)
    return cleaned === '' ? 0 : Number(cleaned)
  }
  const formatAmount = (value: string | number) => {
    const digits = typeof value === 'number' ? String(value) : sanitizeAmount(value)
    return digits === '' ? '' : Number(digits).toLocaleString('fr-FR')
  }

  // Fermeture du dropdown lors d'un clic extérieur
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsDropdownOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

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
    const mappedPelerins = (rawPelerins ?? []).map((p: any) => ({
      ...p,
      total_paye: Number(p.total_paye || 0),
      prix_package: Number(p.prix_package || 0),
      agences: p.agence_nom_agence ? { nom_agence: p.agence_nom_agence } : undefined,
    }))
    setData(filterByYear(mappedPelerins))
    setDepenses((rawDepenses ?? []) as Depense[])
    setLoading(pelerinsLoading || depensesLoading)
  }, [rawPelerins, rawDepenses, selectedYear, pelerinsLoading, depensesLoading])

  // Données de groupement
  const referencesList = useMemo(() => {
    const map = new Map<string, Pelerin[]>()
    data.forEach(p => {
      const ref = p.reference?.trim()
      if (ref) {
        const list = map.get(ref) || []
        list.push(p)
        map.set(ref, list)
      }
    })
    return Array.from(map.entries()).map(([ref, pelerins]) => ({
      valeur: ref,
      count: pelerins.length,
      pelerins
    }))
  }, [data])

  const associesList = useMemo(() => {
    const map = new Map<string, Pelerin[]>()
    data.forEach(p => {
      const asc = (p.agence_ou_personne_associee || p.agences?.nom_agence)?.trim()
      if (asc) {
        const list = map.get(asc) || []
        list.push(p)
        map.set(asc, list)
      }
    })
    return Array.from(map.entries()).map(([nom, pelerins]) => ({
      valeur: nom,
      count: pelerins.length,
      pelerins
    }))
  }, [data])

  // Détermination du nombre de pèlerins impactés par la sélection courante
  const cibleImpactCount = useMemo(() => {
    if (typeCible === 'global') return data.length
    if (!cibleValeur) return 0
    if (typeCible === 'pelerin') return 1
    if (typeCible === 'reference') {
      return data.filter(p => p.reference?.trim().toLowerCase() === cibleValeur.trim().toLowerCase()).length
    }
    if (typeCible === 'associe') {
      return data.filter(p => {
        const asc = (p.agence_ou_personne_associee || p.agences?.nom_agence)?.trim().toLowerCase()
        return asc === cibleValeur.trim().toLowerCase()
      }).length
    }
    return 0
  }, [typeCible, cibleValeur, data])

  // Calcul du montant réel stocké en base
  const montantNumerique = parseAmount(montantSaisi)
  const montantTotalStocke = useMemo(() => {
    if (modeCalcul === 'unitaire') {
      return montantNumerique * Math.max(cibleImpactCount, 1)
    }
    return montantNumerique
  }, [montantNumerique, modeCalcul, cibleImpactCount])

  const montantUnitaireCalcule = useMemo(() => {
    if (cibleImpactCount <= 1) return montantTotalStocke
    if (modeCalcul === 'unitaire') return montantNumerique
    return Math.round(montantNumerique / cibleImpactCount)
  }, [cibleImpactCount, modeCalcul, montantNumerique, montantTotalStocke])

  // Total des dépenses calculées
  const totalDepenses = useMemo(() => {
    return depenses.reduce((acc, d) => acc + (Number(d.montant) || 0), 0)
  }, [depenses])

  // Totaux globaux
  const totalEncaisse = data.reduce((acc, p) => acc + (Number(p.total_paye) || 0), 0)
  const totalAttendu = data.reduce((acc, p) => acc + (Number(p.prix_package) || 0), 0)
  const totalRestant = totalAttendu - totalEncaisse
  const tauxRecouvrement = totalAttendu > 0 ? Math.round((totalEncaisse / totalAttendu) * 100) : 0
  const beneficeReel = totalEncaisse - totalDepenses

  const soldes = data.filter(p => (Number(p.prix_package) || 0) > 0 && (Number(p.total_paye) || 0) >= (Number(p.prix_package) || 0))
  const enAttente = data.filter(p => (Number(p.total_paye) || 0) < (Number(p.prix_package) || 0))
  const nonPayes = data.filter(p => !p.total_paye || Number(p.total_paye) === 0)

  // Regroupements Packages & Agences
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

  // Enregistrement de la dépense
  const handleAddDepense = async (e: React.FormEvent) => {
    e.preventDefault()
    if (typeCible !== 'global' && !cibleValeur) return
    if (montantTotalStocke <= 0) return

    setFormLoading(true)
    const finalLibelle = libelle === 'Autre' ? customLibelle.trim() : libelle
    const finalValeur = typeCible === 'global' ? `campagne_${selectedYear}` : cibleValeur.trim()

    // Envoi du montant total consolidé dans la table depenses_hajj
    try {
      await db.execute(
        'INSERT INTO depenses_hajj (id, type_cible, cible_valeur, libelle, montant, created_at) VALUES (?, ?, ?, ?, ?, ?)',
        [crypto.randomUUID(), typeCible, finalValeur, finalLibelle || 'Frais divers', montantTotalStocke, new Date().toISOString()],
      )
      setCibleValeur('')
      setMontantSaisi('')
      setCustomLibelle('')
      setSearchTarget('')
    } catch {
      alert("Erreur lors de l'enregistrement de la dépense.")
    }
    setFormLoading(false)
  }

  const handleDeleteDepense = async (id: string) => {
    if (!confirm('Supprimer cette écriture de dépense ?')) return
    try {
      await db.execute('DELETE FROM depenses_hajj WHERE id = ?', [id])
    } catch {
      alert("Erreur lors de la suppression de la dépense.")
    }
  }

  const fmt = (n: number) => Math.round(n || 0).toLocaleString('fr-FR')

  // Cible sélectionnée texte pour affichage
  const targetLabel = useMemo(() => {
    if (typeCible === 'global') return `Ensemble de la campagne (${data.length} pèlerins)`
    if (!cibleValeur) return 'Sélectionner la cible...'
    if (typeCible === 'pelerin') {
      const match = data.find(p => String(p.id) === String(cibleValeur))
      return match ? `${match.prenom || ''} ${match.nom_complet || match.nom || ''} • ${match.num_passeport || 'Sans passeport'}` : cibleValeur
    }
    if (typeCible === 'reference') return `Dossier Réf : ${cibleValeur} (${cibleImpactCount} pers.)`
    if (typeCible === 'associe') return `Partenaire : ${cibleValeur} (${cibleImpactCount} pers.)`
    return cibleValeur
  }, [typeCible, cibleValeur, data, cibleImpactCount])

  // Filtrage des dépenses pour l'historique
  const filteredDepenses = useMemo(() => {
    if (!filterDepenseSearch) return depenses
    const q = filterDepenseSearch.toLowerCase()
    return depenses.filter(d => 
      d.libelle.toLowerCase().includes(q) || 
      d.cible_valeur.toLowerCase().includes(q) ||
      d.type_cible.toLowerCase().includes(q)
    )
  }, [depenses, filterDepenseSearch])

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 md:py-10 text-slate-800">

      {/* HEADER */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl md:text-3xl font-black text-slate-900 tracking-tight leading-none">Comptabilité & Dépenses</h1>
          <p className="text-xs md:text-sm text-slate-500 font-medium mt-1">Saisie des charges de campagne, répartition groupée et solde net d'exploitation.</p>
        </div>
        <YearSelector />
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-32">
          <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <>
          {/* ---- CARDS RÉSUMÉ DE TRÉSORERIE ---- */}
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-3.5 mb-8">
            <div className="bg-blue-600 p-4 md:p-5 rounded-2xl text-white shadow-xs col-span-2 lg:col-span-1 flex flex-col justify-between">
              <div className="flex justify-between items-center mb-2">
                <span className="text-[10px] font-black uppercase tracking-wider text-blue-100">Encaissé Total</span>
                <div className="p-2 bg-white/15 rounded-xl"><Wallet size={18} /></div>
              </div>
              <div>
                <h3 className="text-xl md:text-2xl font-black tabular-nums">{fmt(totalEncaisse)} <span className="text-xs font-bold text-blue-200">F</span></h3>
                <p className="text-[10px] text-blue-100 font-medium mt-0.5">Sur {fmt(totalAttendu)} F attendus</p>
              </div>
            </div>

            <div className="bg-white p-4 md:p-5 rounded-2xl border border-slate-200 shadow-xs flex flex-col justify-between">
              <div className="flex justify-between items-center mb-2">
                <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">Total Dépensé</span>
                <div className="p-2 bg-amber-50 text-amber-600 rounded-xl"><DollarSign size={18} /></div>
              </div>
              <div>
                <h3 className="text-xl md:text-2xl font-black text-slate-900 tabular-nums">{fmt(totalDepenses)} <span className="text-xs font-bold text-slate-400">F</span></h3>
                <p className="text-[10px] text-slate-400 font-medium mt-0.5">{depenses.length} écriture(s) passée(s)</p>
              </div>
            </div>

            <div className="bg-white p-4 md:p-5 rounded-2xl border border-slate-200 shadow-xs flex flex-col justify-between">
              <div className="flex justify-between items-center mb-2">
                <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">Bénéfice Réel (Cash)</span>
                <div className={`p-2 rounded-xl ${beneficeReel >= 0 ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'}`}>
                  <Landmark size={18} />
                </div>
              </div>
              <div>
                <h3 className={`text-xl md:text-2xl font-black tabular-nums ${beneficeReel >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
                  {beneficeReel > 0 ? '+' : ''}{fmt(beneficeReel)} <span className="text-xs font-bold text-slate-400">F</span>
                </h3>
                <p className="text-[10px] text-slate-400 font-medium mt-0.5">Encaissé moins sorties réelles</p>
              </div>
            </div>

            <div className="bg-white p-4 md:p-5 rounded-2xl border border-slate-200 shadow-xs flex flex-col justify-between">
              <div className="flex justify-between items-center mb-2">
                <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">Reste à Recouvrer</span>
                <div className="p-2 bg-slate-100 text-slate-600 rounded-xl"><CreditCard size={18} /></div>
              </div>
              <div>
                <h3 className="text-xl md:text-2xl font-black text-amber-700 tabular-nums">{fmt(totalRestant)} <span className="text-xs font-bold text-slate-400">F</span></h3>
                <p className="text-[10px] text-slate-400 font-medium mt-0.5">{enAttente.length} dossier(s) incomplet(s)</p>
              </div>
            </div>

            <div className="bg-white p-4 md:p-5 rounded-2xl border border-slate-200 shadow-xs col-span-2 lg:col-span-1 flex flex-col justify-between">
              <div className="flex justify-between items-center mb-2">
                <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">Recouvrement</span>
                <div className="p-2 bg-blue-50 text-blue-600 rounded-xl"><TrendingUp size={18} /></div>
              </div>
              <div>
                <h3 className="text-xl md:text-2xl font-black text-slate-900 tabular-nums">{tauxRecouvrement}%</h3>
                <div className="mt-2 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                  <div className="h-full bg-blue-600 rounded-full transition-all" style={{ width: `${tauxRecouvrement}%` }} />
                </div>
              </div>
            </div>
          </div>

          {/* ---- MODULE D'ENREGISTREMENT ET JOURNAL DES CHARGES ---- */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-5 md:p-7 mb-8">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">

              {/* FORMULAIRE RECONÇU */}
              <form onSubmit={handleAddDepense} className="lg:col-span-5 bg-slate-50 p-5 rounded-2xl border border-slate-200/90 flex flex-col justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2 pb-3 mb-4 border-b border-slate-200">
                    <PlusCircle size={18} className="text-blue-600" />
                    <h2 className="font-black text-slate-900 text-sm uppercase tracking-wide">Nouvelle Dépense</h2>
                  </div>

                  {/* 1. SÉLECTEUR DE TYPE DE RÉPARTITION */}
                  <div className="mb-3.5">
                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-wider block mb-1.5">
                      1. Modalité d'affectation
                    </label>
                    <div className="grid grid-cols-2 gap-1.5">
                      {[
                        { id: 'pelerin', label: 'Pèlerin unique', desc: '1 personne', icon: Users },
                        { id: 'reference', label: 'Par Dossier / Réf', desc: 'Groupe lié', icon: Tag },
                        { id: 'associe', label: 'Par Partenaire', desc: 'Agence externe', icon: Building2 },
                        { id: 'global', label: 'Toute la campagne', desc: 'Frais communs', icon: Layers },
                      ].map(opt => (
                        <button
                          key={opt.id}
                          type="button"
                          onClick={() => {
                            setTypeCible(opt.id as any)
                            setCibleValeur('')
                            setSearchTarget('')
                          }}
                          className={`p-2.5 rounded-xl border text-left transition-all flex flex-col justify-between ${
                            typeCible === opt.id
                              ? 'bg-blue-600 text-white border-blue-600 shadow-xs'
                              : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <opt.icon size={14} className={typeCible === opt.id ? 'text-white' : 'text-slate-500'} />
                            <span className={`text-[9px] font-bold ${typeCible === opt.id ? 'text-blue-100' : 'text-slate-400'}`}>{opt.desc}</span>
                          </div>
                          <p className="text-xs font-black mt-1 leading-tight">{opt.label}</p>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* 2. SÉLECTION INTELLIGENTE DE LA CIBLE AVEC RECHERCHE */}
                  {typeCible !== 'global' && (
                    <div className="mb-3.5 relative" ref={dropdownRef}>
                      <label className="text-[10px] font-black text-slate-500 uppercase tracking-wider block mb-1.5">
                        2. Sélectionner la cible ({typeCible === 'pelerin' ? data.length : typeCible === 'reference' ? referencesList.length : associesList.length} disponibles)
                      </label>

                      {/* Bouton d'ouverture du menu déroulant */}
                      <button
                        type="button"
                        onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                        className={`w-full p-3 rounded-xl border bg-white text-left flex items-center justify-between text-xs font-bold shadow-xs transition-colors ${
                          isDropdownOpen ? 'border-blue-600 ring-1 ring-blue-600' : 'border-slate-300 hover:border-slate-400'
                        }`}
                      >
                        <span className={`truncate ${cibleValeur ? 'text-slate-900 font-black' : 'text-slate-400'}`}>
                          {targetLabel}
                        </span>
                        <ChevronDown size={16} className={`text-slate-400 transition-transform ${isDropdownOpen ? 'rotate-180 text-blue-600' : ''}`} />
                      </button>

                      {/* Tiroir déroulant personnalisé */}
                      {isDropdownOpen && (
                        <div className="absolute left-0 right-0 top-full mt-1.5 bg-white border border-slate-200 rounded-2xl shadow-xl z-50 p-2 overflow-hidden animate-in fade-in zoom-in-95 duration-100">
                          {/* Barre de recherche interne */}
                          <div className="relative mb-2">
                            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                            <input
                              type="text"
                              autoFocus
                              placeholder="Filtrer la liste..."
                              value={searchTarget}
                              onChange={(e) => setSearchTarget(e.target.value)}
                              className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold outline-none focus:border-blue-600"
                            />
                          </div>

                          <div className="max-h-56 overflow-y-auto divide-y divide-slate-50">
                            {typeCible === 'pelerin' && (
                              data
                                .filter(p => {
                                  const str = `${p.prenom || ''} ${p.nom_complet || p.nom || ''} ${p.num_passeport || ''} ${p.reference || ''}`.toLowerCase()
                                  return str.includes(searchTarget.toLowerCase())
                                })
                                .map(p => (
                                  <button
                                    key={p.id}
                                    type="button"
                                    onClick={() => {
                                      setCibleValeur(String(p.id))
                                      setIsDropdownOpen(false)
                                    }}
                                    className="w-full text-left p-2.5 hover:bg-slate-50 rounded-xl flex items-center justify-between gap-2"
                                  >
                                    <div className="min-w-0">
                                      <p className="font-bold text-xs text-slate-900 truncate">{p.prenom} {p.nom_complet || p.nom}</p>
                                      <p className="text-[10px] text-slate-400 font-mono">{p.num_passeport || 'Passeport non renseigné'}</p>
                                    </div>
                                    {String(cibleValeur) === String(p.id) && <Check size={14} className="text-blue-600 shrink-0" />}
                                  </button>
                                ))
                            )}

                            {typeCible === 'reference' && (
                              referencesList
                                .filter(r => r.valeur.toLowerCase().includes(searchTarget.toLowerCase()))
                                .map(r => (
                                  <button
                                    key={r.valeur}
                                    type="button"
                                    onClick={() => {
                                      setCibleValeur(r.valeur)
                                      setIsDropdownOpen(false)
                                    }}
                                    className="w-full text-left p-2.5 hover:bg-slate-50 rounded-xl flex items-center justify-between gap-2"
                                  >
                                    <div>
                                      <p className="font-bold text-xs text-slate-900">Réf : {r.valeur}</p>
                                      <p className="text-[10px] text-slate-400">{r.count} pèlerin(s) dans ce groupe</p>
                                    </div>
                                    <span className="text-xs font-black text-blue-600 bg-blue-50 px-2 py-0.5 rounded-md">
                                      {r.count} pers.
                                    </span>
                                  </button>
                                ))
                            )}

                            {typeCible === 'associe' && (
                              associesList
                                .filter(a => a.valeur.toLowerCase().includes(searchTarget.toLowerCase()))
                                .map(a => (
                                  <button
                                    key={a.valeur}
                                    type="button"
                                    onClick={() => {
                                      setCibleValeur(a.valeur)
                                      setIsDropdownOpen(false)
                                    }}
                                    className="w-full text-left p-2.5 hover:bg-slate-50 rounded-xl flex items-center justify-between gap-2"
                                  >
                                    <div>
                                      <p className="font-bold text-xs text-slate-900">{a.valeur}</p>
                                      <p className="text-[10px] text-slate-400">{a.count} pèlerin(s) affilié(s)</p>
                                    </div>
                                    <span className="text-xs font-black text-blue-600 bg-blue-50 px-2 py-0.5 rounded-md">
                                      {a.count} pers.
                                    </span>
                                  </button>
                                ))
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* 3. NATURE DE LA DÉPENSE */}
                  <div className="mb-3.5">
                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-wider block mb-1.5">
                      3. Nature de la charge
                    </label>
                    <select
                      value={libelle}
                      onChange={(e) => setLibelle(e.target.value)}
                      className="w-full px-3 py-2.5 rounded-xl border border-slate-300 bg-white font-bold text-xs outline-none focus:border-blue-600 cursor-pointer"
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
                        onChange={(e) => setCustomLibelle(e.target.value)}
                        required
                        placeholder="Préciser le motif de la dépense..."
                        className="mt-2 w-full px-3 py-2 rounded-xl border border-slate-300 bg-white font-bold text-xs outline-none focus:border-blue-600"
                      />
                    )}
                  </div>

                  {/* 4. MONTANT ET RÈGLE DE CALCUL DÉTAILLÉE */}
                  <div className="mb-3.5">
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="text-[10px] font-black text-slate-500 uppercase tracking-wider">
                        4. Montant
                      </label>
                      {cibleImpactCount > 1 && (
                        <div className="flex gap-1 bg-slate-200/80 p-0.5 rounded-lg text-[10px] font-bold">
                          <button
                            type="button"
                            onClick={() => setModeCalcul('unitaire')}
                            className={`px-2 py-0.5 rounded-md transition-colors ${modeCalcul === 'unitaire' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'}`}
                          >
                            Par pèlerin
                          </button>
                          <button
                            type="button"
                            onClick={() => setModeCalcul('total')}
                            className={`px-2 py-0.5 rounded-md transition-colors ${modeCalcul === 'total' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'}`}
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
                        onChange={(e) => setMontantSaisi(formatAmount(e.target.value))}
                        required
                        placeholder={cibleImpactCount > 1 && modeCalcul === 'unitaire' ? 'Montant unitaire par personne' : 'Montant total décaissé'}
                        className="w-full pl-3 pr-12 py-2.5 rounded-xl border border-slate-300 bg-white font-black text-base outline-none focus:border-blue-600"
                      />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">CFA</span>
                    </div>

                    {/* PRÉVISUALISATION DU CALCUL RÉEL QUI SERA ENREGISTRÉ DANS SUPABASE */}
                    {montantNumerique > 0 && cibleImpactCount > 0 && (
                      <div className="mt-2.5 p-3 bg-blue-50 border border-blue-200/70 rounded-xl text-xs space-y-1">
                        <div className="flex justify-between text-blue-900 font-bold">
                          <span>Nombre de personnes cibles :</span>
                          <span className="font-black">{cibleImpactCount} pèlerin(s)</span>
                        </div>
                        <div className="flex justify-between text-blue-800">
                          <span>Coût unitaire par pèlerin :</span>
                          <span className="font-bold">{fmt(montantUnitaireCalcule)} F</span>
                        </div>
                        <div className="pt-1 border-t border-blue-200/60 flex justify-between items-center text-blue-950 font-black">
                          <span>Total stocké en base :</span>
                          <span className="text-sm bg-blue-600 text-white px-2 py-0.5 rounded-md">
                            {fmt(montantTotalStocke)} CFA
                          </span>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={formLoading || (typeCible !== 'global' && !cibleValeur) || montantTotalStocke <= 0}
                  className="w-full py-3 bg-slate-900 hover:bg-slate-800 text-white font-black text-xs rounded-xl uppercase tracking-wider transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-xs"
                >
                  {formLoading ? 'Enregistrement...' : `Valider la dépense (${fmt(montantTotalStocke)} F)`}
                </button>
              </form>

              {/* JOURNAL DES DÉPENSES COMPTABLES */}
              <div className="lg:col-span-7 flex flex-col justify-between">
                <div>
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 mb-3 border-b border-slate-100">
                    <div>
                      <h3 className="font-black text-slate-900 text-sm uppercase tracking-wide">Journal des Dépenses</h3>
                      <p className="text-xs text-slate-400 font-medium">Lignes d'écritures réelles de la table depenses_hajj</p>
                    </div>

                    <div className="relative w-full sm:w-56">
                      <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                      <input
                        type="text"
                        placeholder="Filtrer les écritures..."
                        value={filterDepenseSearch}
                        onChange={(e) => setFilterDepenseSearch(e.target.value)}
                        className="w-full pl-8 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-semibold outline-none focus:border-blue-600"
                      />
                    </div>
                  </div>

                  {filteredDepenses.length === 0 ? (
                    <div className="text-center py-16 text-xs text-slate-400 font-bold border-2 border-dashed border-slate-100 rounded-2xl">
                      Aucune dépense ne correspond aux critères.
                    </div>
                  ) : (
                    <div className="space-y-2 max-h-[460px] overflow-y-auto pr-1">
                      {filteredDepenses.map((d) => {
                        let impactCount = 1
                        let detailCible = d.cible_valeur

                        if (d.type_cible === 'pelerin') {
                          const match = data.find(p => String(p.id) === String(d.cible_valeur))
                          detailCible = match ? `${match.prenom || ''} ${match.nom_complet || match.nom || ''}` : 'Pèlerin'
                        } else if (d.type_cible === 'reference') {
                          impactCount = data.filter(p => p.reference?.trim() === d.cible_valeur.trim()).length || 1
                          detailCible = `Dossier Réf: ${d.cible_valeur}`
                        } else if (d.type_cible === 'associe') {
                          impactCount = data.filter(p => (p.agence_ou_personne_associee || p.agences?.nom_agence)?.trim() === d.cible_valeur.trim()).length || 1
                          detailCible = `Partenaire: ${d.cible_valeur}`
                        } else if (d.type_cible === 'global') {
                          impactCount = data.length || 1
                          detailCible = 'Frais communs de campagne'
                        }

                        const montantTotal = Number(d.montant) || 0
                        const montantUnitaire = impactCount > 1 ? Math.round(montantTotal / impactCount) : montantTotal

                        return (
                          <div key={d.id} className="p-3 bg-white border border-slate-200 rounded-xl hover:border-slate-300 transition-colors flex items-center justify-between gap-3 shadow-2xs">
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2 flex-wrap">
                                <p className="font-bold text-slate-900 text-xs truncate">{d.libelle}</p>
                                <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 uppercase border border-slate-200">
                                  {d.type_cible}
                                </span>
                              </div>
                              <p className="text-[11px] text-slate-500 truncate mt-0.5">
                                {detailCible} • <span className="font-semibold">{impactCount} pèlerin(s)</span>
                              </p>
                              {impactCount > 1 && (
                                <p className="text-[10px] text-slate-400 font-mono mt-0.5">
                                  Quote-part : {fmt(montantUnitaire)} F / pers.
                                </p>
                              )}
                            </div>

                            <div className="flex items-center gap-3 shrink-0">
                              <div className="text-right">
                                <p className="text-xs font-black text-red-600 tabular-nums">
                                  -{fmt(montantTotal)} CFA
                                </p>
                                {d.created_at && (
                                  <p className="text-[9px] text-slate-400">
                                    {new Date(d.created_at).toLocaleDateString('fr-FR')}
                                  </p>
                                )}
                              </div>
                              <button
                                onClick={() => handleDeleteDepense(d.id)}
                                title="Supprimer la dépense"
                                className="p-1 text-slate-300 hover:text-rose-600 transition-colors"
                              >
                                <Trash2 size={15} />
                              </button>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>

                <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs font-bold text-slate-600">
                  <span>Total sorties cumulées :</span>
                  <span className="text-sm font-black text-red-700">-{fmt(totalDepenses)} CFA</span>
                </div>
              </div>

            </div>
          </div>

          {/* ---- PAR PACKAGE ---- */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-5 md:p-6 mb-6">
            <div className="flex items-center gap-2.5 mb-4">
              <div className="p-2 bg-blue-50 rounded-xl text-blue-600"><Package size={18} /></div>
              <h2 className="text-sm font-black text-slate-900 uppercase tracking-wide">Recouvrement par Forfait / Package</h2>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {Object.entries(packages).map(([nom, pkg]) => {
                const taux = pkg.attendu > 0 ? Math.round((pkg.encaisse / pkg.attendu) * 100) : 0
                return (
                  <div key={nom} className="p-3.5 bg-slate-50 border border-slate-200/80 rounded-xl flex flex-col justify-between">
                    <div>
                      <div className="flex items-center justify-between gap-2 mb-1.5">
                        <span className="font-bold text-slate-900 text-xs truncate">{nom}</span>
                        <span className="text-[10px] font-bold text-slate-500 bg-white border border-slate-200 px-1.5 py-0.5 rounded">
                          {pkg.count} pèlerin(s)
                        </span>
                      </div>
                      <div className="flex justify-between text-xs mb-1">
                        <span className="text-emerald-700 font-bold">{fmt(pkg.encaisse)} F</span>
                        <span className="text-slate-400">/ {fmt(pkg.attendu)} F</span>
                      </div>
                      <div className="h-1.5 bg-slate-200 rounded-full overflow-hidden">
                        <div className="h-full bg-blue-600 rounded-full" style={{ width: `${taux}%` }} />
                      </div>
                    </div>
                    <div className="flex justify-between items-center text-[10px] font-bold text-slate-400 mt-2">
                      <span>Reste : {fmt(pkg.attendu - pkg.encaisse)} F</span>
                      <span>{taux}%</span>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* ---- PAR AGENCE / PARTENAIRE ---- */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-5 md:p-6">
            <div className="flex items-center gap-2.5 mb-4">
              <div className="p-2 bg-blue-50 rounded-xl text-blue-600"><BarChart2 size={18} /></div>
              <h2 className="text-sm font-black text-slate-900 uppercase tracking-wide">Situation par Agence & Partenaire</h2>
            </div>
            <div className="space-y-2">
              {Object.entries(agences).sort((a, b) => b[1].encaisse - a[1].encaisse).map(([nom, agc]) => {
                const taux = agc.attendu > 0 ? Math.round((agc.encaisse / agc.attendu) * 100) : 0
                const isOpen = expandedAgence === nom
                return (
                  <div key={nom} className="border border-slate-200 rounded-xl overflow-hidden">
                    <button
                      onClick={() => setExpandedAgence(isOpen ? null : nom)}
                      className="w-full p-3.5 bg-slate-50 hover:bg-slate-100 transition-colors flex items-center justify-between text-left"
                    >
                      <div>
                        <p className="font-bold text-slate-900 text-xs sm:text-sm">{nom}</p>
                        <p className="text-[10px] text-slate-400 font-medium">{agc.pelerins.length} pèlerin(s)</p>
                      </div>
                      <div className="flex items-center gap-4">
                        <div className="text-right">
                          <p className="text-xs font-black text-emerald-700">{fmt(agc.encaisse)} CFA</p>
                          <p className="text-[10px] text-slate-400">{taux}% recouvré</p>
                        </div>
                        {isOpen ? <ChevronUp size={16} className="text-slate-400" /> : <ChevronDown size={16} className="text-slate-400" />}
                      </div>
                    </button>

                    {isOpen && (
                      <div className="p-4 border-t border-slate-200 bg-white">
                        <div className="space-y-1.5">
                          {agc.pelerins.map((p, i) => {
                            const restant = (Number(p.prix_package) || 0) - (Number(p.total_paye) || 0)
                            const solde = restant <= 0
                            return (
                              <div key={p.id || i} className="flex items-center justify-between p-2.5 bg-slate-50 rounded-lg text-xs">
                                <div>
                                  <p className="font-bold text-slate-800">{p.prenom} {p.nom_complet || p.nom}</p>
                                  <p className="text-[10px] text-slate-400 font-mono">{p.num_passeport || 'Sans passeport'}</p>
                                </div>
                                <div className="text-right">
                                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${solde ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>
                                    {solde ? 'Soldé' : `Reste: ${fmt(restant)} F`}
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
      )}
    </div>
  )
}