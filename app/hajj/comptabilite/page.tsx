'use client'
import { useEffect, useState } from 'react'
import { supabase } from '../../../lib/supabase'
import {
  TrendingUp, Package, AlertCircle, CheckCircle,
  Wallet, CreditCard, BarChart2, ChevronDown, ChevronUp,
  PlusCircle, Trash2, Landmark, DollarSign, Search
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
  type_cible: 'pelerin' | 'reference' | 'associe'
  cible_valeur: string
  libelle: string
  montant: number
  created_at?: string
}

export default function ComptabiliteHajj() {
  const [data, setData] = useState<Pelerin[]>([])
  const [depenses, setDepenses] = useState<Depense[]>([])
  const [loading, setLoading] = useState<boolean>(true)
  const [expandedAgence, setExpandedAgence] = useState<string | null>(null)

  // États du formulaire de dépenses
  const [typeCible, setTypeCible] = useState<'pelerin' | 'reference' | 'associe'>('pelerin')
  const [cibleValeur, setCibleValeur] = useState<string>('')
  const [libelle, setLibelle] = useState<string>("Billet d'avion")
  const [customLibelle, setCustomLibelle] = useState<string>('')
  const [montantDepense, setMontantDepense] = useState<string>('')
  const [formLoading, setFormLoading] = useState<boolean>(false)
  
  const sanitizeAmount = (value: string) => value.replace(/\D/g, '')
  const parseAmount = (value: string) => {
    const cleaned = sanitizeAmount(value)
    return cleaned === '' ? 0 : Number(cleaned)
  }
  const formatAmount = (value: string | number) => {
    const digits = typeof value === 'number' ? String(value) : sanitizeAmount(value)
    return digits === '' ? '' : Number(digits).toLocaleString('fr-FR')
  }
  
  // État de recherche pour la sélection de pèlerin unique
  const [searchPelerin, setSearchPelerin] = useState<string>('')

  async function fetchAllData() {
    setLoading(true)
    const { data: pelerins, error: pErr } = await supabase
      .from('pelerins')
      .select('*, agences(nom_agence)')
    
    const { data: listDepenses, error: dErr } = await supabase
      .from('depenses_hajj')
      .select('*')
      .order('created_at', { ascending: false })

    if (!pErr && pelerins) setData(pelerins)
    if (!dErr && listDepenses) setDepenses(listDepenses)
    
    if (pErr || dErr) console.error({ pErr, dErr })
    setLoading(false)
  }

  useEffect(() => {
    fetchAllData()
  }, [])

  // --- EXTRACTEURS POUR LES LISTES DÉROULANTES ---
  const listReferences = Array.from(new Set(data.map(p => p.reference).filter(Boolean))) as string[]
  const listAssocies = Array.from(new Set(data.map(p => p.agence_ou_personne_associee).filter(Boolean))) as string[]

  // Filtrage en direct de la liste des pèlerins selon la recherche
  const filteredPelerins = data.filter(p => {
    const searchString = `${p.prenom || ''} ${p.nom || ''} ${p.num_passeport || ''}`.toLowerCase()
    return searchString.includes(searchPelerin.toLowerCase())
  })

  // --- CALCULS DES DÉPENSES ---
  const totalDepenses = depenses.reduce((acc, d) => {
    if (d.type_cible === 'pelerin') {
      return acc + d.montant
    } else if (d.type_cible === 'reference') {
      const count = data.filter(p => p.reference === d.cible_valeur).length
      return acc + (d.montant * count)
    } else if (d.type_cible === 'associe') {
      const count = data.filter(p => p.agence_ou_personne_associee === d.cible_valeur).length
      return acc + (d.montant * count)
    }
    return acc
  }, 0)

  // --- CALCULS GLOBAUX ---
  const totalPelerins = data.length
  const totalEncaisse = data.reduce((acc, p) => acc + (p.total_paye || 0), 0)
  const totalAttendu = data.reduce((acc, p) => acc + (p.prix_package || 0), 0)
  const totalRestant = totalAttendu - totalEncaisse
  const tauxRecouvrement = totalAttendu > 0 ? Math.round((totalEncaisse / totalAttendu) * 100) : 0
  const beneficeReel = totalEncaisse - totalDepenses

  // Soldés vs en attente
  const soldes = data.filter(p => (p.prix_package || 0) > 0 && (p.total_paye || 0) >= (p.prix_package || 0))
  const enAttente = data.filter(p => (p.total_paye || 0) < (p.prix_package || 0))
  const nonPayes = data.filter(p => !p.total_paye || p.total_paye === 0)

  // --- PAR PACKAGE ---
  const packages: Record<string, PackageData> = {}
  data.forEach(p => {
    const nom = p.nom_package || 'Non défini'
    if (!packages[nom]) packages[nom] = { count: 0, encaisse: 0, attendu: 0 }
    packages[nom].count++
    packages[nom].encaisse += p.total_paye || 0
    packages[nom].attendu += p.prix_package || 0
  })

  // --- PAR AGENCE ---
  const agences: Record<string, AgenceData> = {}
  data.forEach(p => {
    const nom = p.agences?.nom_agence || 'Sans agence'
    if (!agences[nom]) agences[nom] = { pelerins: [], encaisse: 0, attendu: 0 }
    agences[nom].pelerins.push(p)
    agences[nom].encaisse += p.total_paye || 0
    agences[nom].attendu += p.prix_package || 0
  })

  // --- ACTIONS SOUCHET DÉPENSES ---
  const handleAddDepense = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!cibleValeur || !montantDepense) return
    
    setFormLoading(true)
    const finalLibelle = libelle === 'Autre' ? customLibelle : libelle

    const { error } = await supabase.from('depenses_hajj').insert([{
      type_cible: typeCible,
      cible_valeur: cibleValeur,
      libelle: finalLibelle,
      montant: parseAmount(montantDepense)
    }])

    if (!error) {
      setCibleValeur('')
      setMontantDepense('')
      setCustomLibelle('')
      setSearchPelerin('')
      fetchAllData()
    } else {
      console.error(error)
    }
    setFormLoading(false)
  }

  const handleDeleteDepense = async (id: string) => {
    if (!confirm('Voulez-vous supprimer cette ligne de dépense ?')) return
    const { error } = await supabase.from('depenses_hajj').delete().eq('id', id)
    if (!error) fetchAllData()
  }

  const fmt = (n: number) => Math.round(n).toLocaleString('fr-FR')

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 md:py-10">

      {/* HEADER */}
      <div className="mb-8 md:mb-10">
        <h1 className="text-2xl md:text-4xl font-black text-gray-900 tracking-tight leading-none">Comptabilité Hajj</h1>
        <p className="text-xs md:text-base text-gray-500 font-medium mt-1">Vue globale des finances et rentabilité de la saison.</p>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-32">
          <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
        </div>
      ) : (
        <>
          {/* ---- CARDS RÉSUMÉ ---- */}
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 md:gap-5 mb-8">

            <div className="bg-gradient-to-br from-blue-600 to-indigo-700 p-4 md:p-6 rounded-[1.8rem] text-white shadow-lg shadow-blue-200 col-span-2 lg:col-span-1">
              <div className="flex justify-between items-start mb-3">
                <div className="p-2 md:p-3 bg-white/20 rounded-xl">
                  <Wallet size={20} className="md:w-6 md:h-6" />
                </div>
                <span className="text-[8px] md:text-[10px] font-black text-white/50 uppercase tracking-widest">Total</span>
              </div>
              <h3 className="text-lg md:text-2xl font-black leading-none mb-1">{fmt(totalEncaisse)}</h3>
              <p className="text-[9px] md:text-xs font-bold text-white/70 uppercase tracking-tight">CFA Encaissé</p>
            </div>

            <div className="bg-white p-4 md:p-6 rounded-[1.8rem] border border-gray-100 shadow-sm">
              <div className="flex justify-between items-start mb-3">
                <div className="p-2 md:p-3 bg-red-50 rounded-xl text-red-500">
                  <DollarSign size={20} />
                </div>
                <span className="text-[8px] md:text-[10px] font-black text-gray-300 tracking-widest">Charges</span>
              </div>
              <h3 className="text-xl md:text-2xl font-black text-gray-900 leading-none mb-1">{fmt(totalDepenses)}</h3>
              <p className="text-[9px] md:text-xs font-bold text-gray-400 uppercase tracking-tight">CFA Dépensé</p>
            </div>

            <div className="bg-gradient-to-br from-emerald-500 to-teal-600 p-4 md:p-6 rounded-[1.8rem] text-white shadow-md col-span-1">
              <div className="flex justify-between items-start mb-3">
                <div className="p-2 md:p-3 bg-white/20 rounded-xl">
                  <Landmark size={20} />
                </div>
                <span className="text-[8px] md:text-[10px] font-black text-white/60 tracking-widest">Net</span>
              </div>
              <h3 className="text-xl md:text-2xl font-black leading-none mb-1">{fmt(beneficeReel)}</h3>
              <p className="text-[9px] md:text-xs font-bold text-white/90 uppercase tracking-tight">Bénéfice Réel</p>
            </div>

            <div className="bg-white p-4 md:p-6 rounded-[1.8rem] border border-gray-100 shadow-sm">
              <div className="flex justify-between items-start mb-3">
                <div className="p-2 md:p-3 bg-amber-50 rounded-xl text-amber-500">
                  <CreditCard size={20} />
                </div>
                <span className="text-[8px] md:text-[10px] font-black text-gray-300 uppercase tracking-widest">Reste</span>
              </div>
              <h3 className="text-xl md:text-2xl font-black text-gray-900 leading-none mb-1">{fmt(totalRestant)}</h3>
              <p className="text-[9px] md:text-xs font-bold text-gray-400 uppercase tracking-tight">CFA Restant</p>
            </div>

            <div className="bg-white p-4 md:p-6 rounded-[1.8rem] border border-gray-100 shadow-sm col-span-2 lg:col-span-1">
              <div className="flex justify-between items-start mb-3">
                <div className="p-2 md:p-3 bg-emerald-50 rounded-xl text-emerald-500">
                  <TrendingUp size={20} />
                </div>
                <span className="text-[8px] md:text-[10px] font-black text-gray-300 uppercase tracking-widest">Taux</span>
              </div>
              <h3 className="text-xl md:text-2xl font-black text-gray-900 leading-none mb-1">{tauxRecouvrement}%</h3>
              <p className="text-[9px] md:text-xs font-bold text-gray-400 uppercase tracking-tight">Recouvrement</p>
              <div className="mt-2 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-emerald-500 rounded-full transition-all"
                  style={{ width: `${tauxRecouvrement}%` }}
                />
              </div>
            </div>
          </div>

          {/* ---- STATUTS PAIEMENT ---- */}
          <div className="grid grid-cols-3 gap-3 md:gap-5 mb-8">
            <div className="bg-emerald-50 border border-emerald-100 p-4 md:p-5 rounded-[1.5rem]">
              <div className="flex items-center gap-2 mb-2">
                <CheckCircle size={16} className="text-emerald-500" />
                <span className="text-[9px] md:text-xs font-black text-emerald-600 uppercase tracking-tight">Soldés</span>
              </div>
              <p className="text-2xl md:text-4xl font-black text-emerald-700">{soldes.length}</p>
              <p className="text-[9px] md:text-xs text-emerald-500 font-bold mt-0.5">pèlerins</p>
            </div>
            <div className="bg-amber-50 border border-amber-100 p-4 md:p-5 rounded-[1.5rem]">
              <div className="flex items-center gap-2 mb-2">
                <AlertCircle size={16} className="text-amber-500" />
                <span className="text-[9px] md:text-xs font-black text-amber-600 uppercase tracking-tight">En attente</span>
              </div>
              <p className="text-2xl md:text-4xl font-black text-amber-700">{enAttente.length}</p>
              <p className="text-[9px] md:text-xs text-amber-500 font-bold mt-0.5">pèlerins</p>
            </div>
            <div className="bg-red-50 border border-red-100 p-4 md:p-5 rounded-[1.5rem]">
              <div className="flex items-center gap-2 mb-2">
                <AlertCircle size={16} className="text-red-400" />
                <span className="text-[9px] md:text-xs font-black text-red-500 uppercase tracking-tight">Non payés</span>
              </div>
              <p className="text-2xl md:text-4xl font-black text-red-600">{nonPayes.length}</p>
              <p className="text-[9px] md:text-xs text-red-400 font-bold mt-0.5">pèlerins</p>
            </div>
          </div>

          {/* ---- AXE : SYSTEME DE SAISIE DES DEPENSES ---- */}
          <div className="bg-white rounded-[2rem] border border-gray-100 shadow-sm p-6 md:p-8 mb-8 grid grid-cols-1 lg:grid-cols-12 gap-6">
            <form onSubmit={handleAddDepense} className="lg:col-span-5 bg-gray-50 p-5 rounded-2xl border border-gray-200/60 space-y-4">
              <div className="flex items-center gap-2 pb-2 border-b border-gray-200">
                <PlusCircle size={18} className="text-blue-600" />
                <h3 className="font-black text-gray-900 text-sm uppercase">Enregistrer une dépense</h3>
              </div>

              <div>
                <label className="text-[10px] font-black text-gray-400 uppercase block mb-1">Type de répartition</label>
                <select 
                  value={typeCible} 
                  onChange={(e) => { setTypeCible(e.target.value as 'pelerin' | 'reference' | 'associe'); setCibleValeur(''); }}
                  className="w-full px-3 py-2.5 rounded-xl border border-gray-200 bg-white font-bold text-xs outline-none"
                >
                  <option value="pelerin">Par pèlerin unique</option>
                  <option value="reference">Par groupe (Référence)</option>
                  <option value="associe">Par intermédiaire / Partenaire</option>
                </select>
              </div>

              {/* BARRE DE RECHERCHE DYNAMIQUE (Uniquement si typeCible === 'pelerin') */}
              {typeCible === 'pelerin' && (
                <div className="relative animate-fadeIn">
                  <label className="text-[10px] font-black text-gray-400 uppercase block mb-1">Filtrer / Chercher un pèlerin</label>
                  <div className="relative">
                    <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input 
                      type="text"
                      value={searchPelerin}
                      onChange={(e) => setSearchPelerin(e.target.value)}
                      placeholder="Tapez un nom, prénom ou passeport..."
                      className="w-full pl-9 pr-3 py-2 rounded-xl border border-gray-200 bg-white font-bold text-xs outline-none focus:border-blue-500 transition-all"
                    />
                  </div>
                </div>
              )}

              <div>
                <label className="text-[10px] font-black text-gray-400 uppercase block mb-1">Sélectionner la cible</label>
                <select 
                  value={cibleValeur}
                  onChange={(e) => setCibleValeur(e.target.value)}
                  required
                  className="w-full px-3 py-3 rounded-xl border border-gray-300 bg-white font-black text-sm outline-none shadow-xs focus:ring-2 focus:ring-blue-100 focus:border-blue-500 transition-all text-gray-800"
                >
                  <option value="" hidden disabled>-- Cliquer pour dérouler la liste ({typeCible === 'pelerin' ? filteredPelerins.length : 'Tous'} trouvé) --</option>
                  {typeCible === 'pelerin' && filteredPelerins.map(p => (
                    <option key={p.id} value={p.id} className="py-2 font-medium">
                      {p.prenom} {p.nom_complet}  {p.num_passeport || 'Non spécifié'}
                    </option>
                  ))}
                  {typeCible === 'reference' && listReferences.map(ref => (
                    <option key={ref} value={ref}>Groupe : {ref}</option>
                  ))}
                  {typeCible === 'associe' && listAssocies.map(asc => (
                    <option key={asc} value={asc}>Partenaire : {asc}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-[10px] font-black text-gray-400 uppercase block mb-1">Nature de la charge</label>
                <select 
                  value={libelle}
                  onChange={(e) => setLibelle(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl border border-gray-200 bg-white font-bold text-xs outline-none"
                >
                  <option value="Billet d'avion">Billet d'avion</option>
                  <option value="Passeport">Passeport</option>
                  <option value="Hébergement Makkah">Hébergement Makkah</option>
                  <option value="Hébergement Médine">Hébergement Médine</option>
                  <option value="Autre">Autre (Saisie libre...)</option>
                </select>
              </div>

              {libelle === 'Autre' && (
                <div>
                  <label className="text-[10px] font-black text-gray-400 uppercase block mb-1">Libellé personnalisé</label>
                  <input 
                    type="text" value={customLibelle} onChange={(e) => setCustomLibelle(e.target.value)}
                    required placeholder="Ex: Frais de vaccin, Logistique..."
                    className="w-full px-3 py-2.5 rounded-xl border border-gray-200 bg-white font-bold text-xs outline-none"
                  />
                </div>
              )}

              <div>
                <label className="text-[10px] font-black text-gray-400 uppercase block mb-1">Montant unitaire (CFA)</label>
                <input 
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9\s]*"
                  value={montantDepense}
                  onChange={(e) => setMontantDepense(formatAmount(e.target.value))}
                  required placeholder="Montant par pèlerin"
                  className="w-full px-3 py-2.5 rounded-xl border border-gray-200 bg-white font-black text-sm outline-none"
                />
                <p className="text-[9px] text-gray-400 font-medium mt-1 italic">
                  * Sera multiplié automatiquement par le nombre de pèlerins du groupe.
                </p>
              </div>

              <button 
                type="submit" disabled={formLoading}
                className="w-full py-3 bg-gray-900 text-white font-black text-xs rounded-xl uppercase hover:bg-gray-800 transition-all flex items-center justify-center gap-2"
              >
                {formLoading ? 'Enregistrement...' : 'Ajouter la dépense'}
              </button>
            </form>

            <div className="lg:col-span-7 space-y-3 max-h-[460px] overflow-y-auto pr-1">
              <h4 className="font-black text-gray-800 text-xs uppercase tracking-tight">Journal des charges enregistrées</h4>
              {depenses.length === 0 ? (
                <div className="text-center py-12 text-xs text-gray-400 font-bold border-2 border-dashed border-gray-100 rounded-2xl">
                  Aucune dépense enregistrée pour le moment.
                </div>
              ) : (
                <div className="space-y-2">
                  {depenses.map((d) => {
                    let impactCount = 1
                    let detailCible = ''
                    
                    if (d.type_cible === 'pelerin') {
                      const match = data.find(p => String(p.id) === String(d.cible_valeur))
                      detailCible = match ? `${match.prenom} ${match.nom} (${match.num_passeport || 'Sans Doc'})` : 'Pèlerin inconnu'
                    } else if (d.type_cible === 'reference') {
                      impactCount = data.filter(p => p.reference === d.cible_valeur).length
                      detailCible = `Groupe Réf: ${d.cible_valeur}`
                    } else if (d.type_cible === 'associe') {
                      impactCount = data.filter(p => p.agence_ou_personne_associee === d.cible_valeur).length
                      detailCible = `Partenaire: ${d.cible_valeur}`
                    }

                    return (
                      <div key={d.id} className="flex items-center justify-between p-3.5 bg-white border border-gray-100 rounded-xl hover:border-gray-200 shadow-2xs transition-all">
                        <div>
                          <p className="font-black text-gray-900 text-xs">{d.libelle}</p>
                          <p className="text-[10px] text-gray-400 font-bold">{detailCible} ({impactCount} pèlerin(s))</p>
                        </div>
                        <div className="flex items-center gap-4">
                          <div className="text-right">
                            <p className="text-xs font-black text-red-600">-{fmt(d.montant * impactCount)} CFA</p>
                            {impactCount > 1 && <p className="text-[9px] text-gray-400 font-medium">{fmt(d.montant)} x{impactCount}</p>}
                          </div>
                          <button onClick={() => handleDeleteDepense(d.id)} className="text-gray-300 hover:text-red-500 transition-colors">
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>

          {/* ---- PAR PACKAGE ---- */}
          <div className="bg-white rounded-[2rem] border border-gray-100 shadow-sm p-6 md:p-8 mb-6">
            <div className="flex items-center gap-3 mb-6">
              <div className="p-2.5 bg-indigo-50 rounded-xl text-indigo-600">
                <Package size={20} />
              </div>
              <h2 className="text-lg font-black text-gray-900">Répartition par Package</h2>
            </div>
            <div className="space-y-4">
              {Object.entries(packages).map(([nom, pkg]) => {
                const taux = pkg.attendu > 0 ? Math.round((pkg.encaisse / pkg.attendu) * 100) : 0
                return (
                  <div key={nom} className="p-4 bg-gray-50 rounded-2xl">
                    <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
                      <div>
                        <span className="font-black text-gray-800 text-sm md:text-base">{nom}</span>
                        <span className="ml-2 text-[10px] font-black text-gray-400 bg-gray-200 px-2 py-0.5 rounded-full">{pkg.count} pèlerins</span>
                      </div>
                      <div className="text-right">
                        <span className="text-sm font-black text-emerald-600">{fmt(pkg.encaisse)} CFA</span>
                        <span className="text-xs text-gray-400 font-medium"> / {fmt(pkg.attendu)} CFA</span>
                      </div>
                    </div>
                    <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all"
                        style={{
                          width: `${taux}%`,
                          background: taux >= 80 ? '#10b981' : taux >= 50 ? '#f59e0b' : '#ef4444'
                        }}
                      />
                    </div>
                    <div className="flex justify-between mt-1">
                      <span className="text-[10px] text-gray-400 font-bold">Restant : {fmt(pkg.attendu - pkg.encaisse)} CFA</span>
                      <span className="text-[10px] font-black text-gray-500">{taux}%</span>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* ---- PAR AGENCE ---- */}
          <div className="bg-white rounded-[2rem] border border-gray-100 shadow-sm p-6 md:p-8">
            <div className="flex items-center gap-3 mb-6">
              <div className="p-2.5 bg-blue-50 rounded-xl text-blue-600">
                <BarChart2 size={20} />
              </div>
              <h2 className="text-lg font-black text-gray-900">Répartition par Agence</h2>
            </div>
            <div className="space-y-3">
              {Object.entries(agences).sort((a, b) => b[1].encaisse - a[1].encaisse).map(([nom, agc]) => {
                const taux = agc.attendu > 0 ? Math.round((agc.encaisse / agc.attendu) * 100) : 0
                const isOpen = expandedAgence === nom
                return (
                  <div key={nom} className="border border-gray-100 rounded-2xl overflow-hidden">
                    <button
                      onClick={() => setExpandedAgence(isOpen ? null : nom)}
                      className="w-full p-4 bg-gray-50 hover:bg-blue-50 transition-colors flex items-center justify-between"
                    >
                      <div className="flex items-center gap-3 text-left">
                        <div>
                          <p className="font-black text-gray-800 text-sm md:text-base">{nom}</p>
                          <p className="text-[10px] text-gray-400 font-bold">{agc.pelerins.length} pèlerin(s)</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="text-right hidden sm:block">
                          <p className="text-sm font-black text-emerald-600">{fmt(agc.encaisse)} CFA</p>
                          <p className="text-[10px] text-gray-400 font-bold">{taux}% recouvré</p>
                        </div>
                        {isOpen ? <ChevronUp size={18} className="text-gray-400" /> : <ChevronDown size={18} className="text-gray-400" />}
                      </div>
                    </button>

                    {isOpen && (
                      <div className="p-4 border-t border-gray-100">
                        {/* Barre de progression */}
                        <div className="mb-4">
                          <div className="flex justify-between mb-1">
                            <span className="text-xs font-bold text-gray-500">Encaissé : {fmt(agc.encaisse)} CFA</span>
                            <span className="text-xs font-bold text-gray-500">Attendu : {fmt(agc.attendu)} CFA</span>
                          </div>
                          <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                            <div
                              className="h-full rounded-full"
                              style={{
                                width: `${taux}%`,
                                background: taux >= 80 ? '#10b981' : taux >= 50 ? '#f59e0b' : '#ef4444'
                              }}
                            />
                          </div>
                        </div>

                        {/* Liste pèlerins */}
                        <div className="space-y-2">
                          {agc.pelerins.map((p, i) => {
                            const restant = (p.prix_package || 0) - (p.total_paye || 0)
                            const solde = restant <= 0
                            return (
                              <div key={p.id || i} className="flex items-center justify-between p-3 bg-gray-50 rounded-xl">
                                <div>
                                  <p className="font-bold text-gray-800 text-xs md:text-sm">{p.prenom} {p.nom}</p>
                                  <p className="text-[10px] text-gray-400">{p.nom_package || 'Package non défini'}</p>
                                </div>
                                <div className="text-right">
                                  <p className="text-xs font-black text-gray-700">{fmt(p.total_paye || 0)} CFA</p>
                                  <span className={`text-[9px] font-black px-2 py-0.5 rounded-full ${solde ? 'bg-emerald-100 text-emerald-600' : 'bg-amber-100 text-amber-600'}`}>
                                    {solde ? 'Soldé' : `- ${fmt(restant)} CFA`}
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