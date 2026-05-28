'use client'
import { useEffect, useState } from 'react'
import { supabase, getUser } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import { 
  BarChart3, Users, Landmark, Plane, ShieldCheck, 
  Search, Download, FileText, Activity, Hotel, GraduationCap, Loader2 
} from 'lucide-react'
import ExcelJS from 'exceljs'
import { saveAs } from 'file-saver'

interface Pelerin {
  id: string
  nom_complet: string
  num_passeport: string
  sexe: string
  telephone_pelerin: string
  sur_plateforme_gouv: boolean
  sur_plateforme_nusuk: boolean
  nom_package: string
  prix_package: number
  total_paye: number
  vacciné: boolean
  visite_medicale: boolean
  formation_suivie: boolean
  hotel_mecque: string
  hotel_medine: string
  date_depart: string
  date_retour: string
  visa_obtenu: boolean
  reference: string
  agence_ou_personne_associee: string
  agences?: { nom_agence?: string }
}

export default function EtatGeneralHajj() {
  const [pelerins, setPelerins] = useState<Pelerin[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [filtreStatut, setFiltreStatut] = useState<'tous' | 'pret' | 'bloque' | 'incomplet_paiement'>('tous')
  const [filtreAgence, setFiltreAgence] = useState<string>('toutes')
  const router = useRouter()

  useEffect(() => {
    const checkUserAndFetch = async () => {
      const { data: { user } } = await getUser()
      if (!user) { router.push('/login'); return }
      fetchDonneesGenerales()
    }
    checkUserAndFetch()
  }, [router])

  async function fetchDonneesGenerales() {
    setLoading(true)
    const { data, error } = await supabase
      .from('pelerins')
      .select('*, agences(nom_agence)')
      .order('nom_complet', { ascending: true })

    if (!error && data) setPelerins(data as any[])
    setLoading(false)
  }

  // Extraction unique et dynamique des agences/personnes associées disponibles
  const listeAgencesDuniques = Array.from(
    new Set(pelerins.map(p => p.agence_ou_personne_associee).filter(Boolean))
  ).sort()

  // CALCULS ANALYTIQUES POUR LES STATISTIQUES GLOBALES
  const totalPelerins = pelerins.length
  const totalVisas = pelerins.filter(p => p.visa_obtenu).length
  const totalMedical = pelerins.filter(p => p.visite_medicale && p.vacciné).length
  
  const argentEncaisse = pelerins.reduce((sum, p) => sum + (p.total_paye || 0), 0)
  const argentAttendu = pelerins.reduce((sum, p) => sum + (p.prix_package || 0), 0)
  const resteACollecter = argentAttendu - argentEncaisse

  // LOGIQUE DE FILTRAGE COMBINÉE
  const pelerinsFiltrés = pelerins.filter(p => {
    // 1. Filtre par recherche textuelle
    const matchesSearch = 
      p.nom_complet.toLowerCase().includes(searchTerm.toLowerCase()) ||
      p.num_passeport.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (p.reference || '').toLowerCase().includes(searchTerm.toLowerCase())

    if (!matchesSearch) return false

    // 2. Filtre par agence ou personne associée
    if (filtreAgence !== 'toutes' && p.agence_ou_personne_associee !== filtreAgence) {
      return false
    }

    // 3. Formules de statut dynamique
    const estPret = p.visa_obtenu && p.visite_medicale && p.sur_plateforme_gouv
    const estPayeIntegral = p.total_paye >= p.prix_package

    if (filtreStatut === 'pret') return estPret
    if (filtreStatut === 'bloque') return !p.visa_obtenu && estPayeIntegral
    if (filtreStatut === 'incomplet_paiement') return !estPayeIntegral
    
    return true
  })

  // EXPORT EXCEL GLOBAL DE TOUTES LES COLONNES STRATÉGIQUES
  const exporterGrandEtatExcel = async () => {
    const workbook = new ExcelJS.Workbook()
    const worksheet = workbook.addWorksheet('État Général Hajj')

    worksheet.columns = [
      { header: 'RÉFÉRENCE', key: 'ref', width: 15 },
      { header: 'NOM COMPLET', key: 'nom', width: 30 },
      { header: 'PASSEPORT', key: 'pass', width: 18 },
      { header: 'TÉLÉPHONE', key: 'tel', width: 18 },
      { header: 'PACKAGE', key: 'pkg', width: 20 },
      { header: 'PRIX (F)', key: 'prix', width: 15 },
      { header: 'PAYÉ (F)', key: 'paye', width: 15 },
      { header: 'RESTE (F)', key: 'reste', width: 15 },
      { header: 'PLAT. GOUV', key: 'gouv', width: 12 },
      { header: 'NUSUK', key: 'nusuk', width: 12 },
      { header: 'VISITE MÉD.', key: 'med', width: 12 },
      { header: 'VISA', key: 'visa', width: 12 },
      { header: 'HÔTEL MECQUE', key: 'hmec', width: 22 },
      { header: 'HÔTEL MÉDINE', key: 'hmed', width: 22 },
      { header: 'PARTENAIRE / AGENCE', key: 'partenaire', width: 25 },
    ]

    worksheet.getRow(1).eachCell((cell) => {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F172A' } }
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 10 }
      cell.alignment = { vertical: 'middle', horizontal: 'center' }
    })

    pelerinsFiltrés.forEach(p => {
      worksheet.addRow({
        ref: p.reference || '-',
        nom: p.nom_complet.toUpperCase(),
        pass: p.num_passeport,
        tel: p.telephone_pelerin || '-',
        pkg: p.nom_package || '-',
        prix: p.prix_package || 0,
        paye: p.total_paye || 0,
        reste: (p.prix_package || 0) - (p.total_paye || 0),
        gouv: p.sur_plateforme_gouv ? 'OK' : '-',
        nusuk: p.sur_plateforme_nusuk ? 'OK' : '-',
        med: p.visite_medicale ? 'VALIDE' : '-',
        visa: p.visa_obtenu ? 'OCTROYÉ' : '-',
        hmec: p.hotel_mecque || '-',
        hmed: p.hotel_medine || '-',
        partenaire: p.agence_ou_personne_associee || '-',
      })
    })

    const buffer = await workbook.xlsx.writeBuffer()
    saveAs(new Blob([buffer]), `Etat_General_Hajj_${new Date().toISOString().split('T')[0]}.xlsx`)
  }

  if (loading) {
    return (
      <div className="h-screen w-full flex flex-col items-center justify-center gap-3 bg-gray-50 px-4 text-center">
        <Loader2 className="animate-spin text-blue-600" size={36} />
        <p className="text-sm font-black text-gray-500 uppercase tracking-widest">Génération de l'état général...</p>
      </div>
    )
  }

  return (
    <div className="max-w-7xl mx-auto px-4 py-6 md:py-8 bg-gray-50 min-h-screen">
      
      {/* ENTÊTE DE PAGE */}
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center mb-8 gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-black text-gray-900 tracking-tight flex items-center gap-2">
            <BarChart3 className="text-blue-600 shrink-0" size={32} />
            État Général du Convoi Hajj
          </h1>
          <p className="text-gray-500 font-bold text-xs md:text-sm uppercase tracking-wider mt-1">
            Rapport global consolidé en temps réel
          </p>
        </div>
        <button 
          onClick={exporterGrandEtatExcel}
          className="w-full lg:w-auto flex items-center justify-center gap-2 bg-gray-900 text-white hover:bg-gray-800 px-6 py-3 rounded-2xl font-black text-sm transition-all duration-200 shadow-lg shadow-gray-200 active:scale-95"
        >
          <Download size={18} /> Exporter le Manifeste Complet (Excel)
        </button>
      </div>

      {/* BLOCS DE STATISTIQUES CONSOLIDÉES (KPIs) - CONFIGURÉS 2 PAR 2 SUR MOBILE */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-5 mb-8">
        
        <div className="bg-white p-4 md:p-6 rounded-3xl border border-gray-100 shadow-sm flex flex-col sm:flex-row items-center text-center sm:text-left gap-2 sm:gap-4">
          <div className="p-3 md:p-4 bg-blue-50 rounded-2xl text-blue-600 shrink-0"><Users size={20} className="md:w-6 md:h-6" /></div>
          <div>
            <span className="text-[10px] md:text-xs font-bold text-gray-400 uppercase block">Total Effectif</span>
            <span className="text-lg md:text-2xl font-black text-gray-900">{totalPelerins} <span className="text-[10px] text-gray-400 font-bold block sm:inline">Inscrits</span></span>
          </div>
        </div>

        <div className="bg-white p-4 md:p-6 rounded-3xl border border-gray-100 shadow-sm flex flex-col sm:flex-row items-center text-center sm:text-left gap-2 sm:gap-4">
          <div className="p-3 md:p-4 bg-emerald-50 rounded-2xl text-emerald-600 shrink-0"><ShieldCheck size={20} className="md:w-6 md:h-6" /></div>
          <div>
            <span className="text-[10px] md:text-xs font-bold text-gray-400 uppercase block">Visas Délivrés</span>
            <span className="text-lg md:text-2xl font-black text-emerald-600">
              {totalVisas} <span className="text-[10px] text-gray-400 font-bold">/ {totalPelerins}</span>
            </span>
          </div>
        </div>

        <div className="bg-white p-4 md:p-6 rounded-3xl border border-gray-100 shadow-sm flex flex-col sm:flex-row items-center text-center sm:text-left gap-2 sm:gap-4">
          <div className="p-3 md:p-4 bg-purple-50 rounded-2xl text-purple-600 shrink-0"><Activity size={20} className="md:w-6 md:h-6" /></div>
          <div>
            <span className="text-[10px] md:text-xs font-bold text-gray-400 uppercase block">Aptitude Médicale</span>
            <span className="text-lg md:text-2xl font-black text-purple-600">
              {totalMedical} <span className="text-[10px] text-gray-400 font-bold block sm:inline">Valides</span>
            </span>
          </div>
        </div>

        <div className="bg-white p-4 md:p-6 rounded-3xl border border-gray-100 shadow-sm flex flex-col sm:flex-row items-center text-center sm:text-left gap-2 sm:gap-4">
          <div className="p-3 md:p-4 bg-amber-50 rounded-2xl text-amber-600 shrink-0"><Landmark size={20} className="md:w-6 md:h-6" /></div>
          <div>
            <span className="text-[10px] md:text-xs font-bold text-gray-400 uppercase block">Reste à Recouvrer</span>
            <span className="text-sm md:text-xl font-black text-amber-700">{resteACollecter.toLocaleString()} F</span>
          </div>
        </div>

      </div>

      {/* FILTRES AVANCÉS DE SITUATION */}
      <div className="bg-white p-4 rounded-2xl border border-gray-100 shadow-sm mb-6 flex flex-col gap-4">
        
        {/* Ligne Barre de Recherche & Filtre d'Agence */}
        <div className="flex flex-col md:flex-row gap-3 w-full">
          <div className="relative flex-1">
            <input 
              type="text"
              placeholder="Recherche rapide (Nom, Passeport, Réf)..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 bg-gray-50 rounded-xl font-bold border-0 focus:ring-2 focus:ring-blue-600 text-sm outline-none"
            />
            <Search className="absolute left-3 top-3 text-gray-400" size={16} />
          </div>

          {/* SÉLECTEUR D'AGENCE / ASSOCIÉ */}
          <div className="w-full md:w-72">
            <select
              value={filtreAgence}
              onChange={(e) => setFiltreAgence(e.target.value)}
              className="w-full px-3 py-2.5 bg-gray-50 text-gray-700 rounded-xl font-bold border-0 focus:ring-2 focus:ring-blue-600 text-sm outline-none cursor-pointer appearance-none"
              style={{ backgroundImage: 'url("data:image/svg+xml;charset=UTF-8,%3csvg xmlns=\'http://www.w3.org/2000/svg\' viewBox=\'0 0 24 24\' fill=\'none\' stroke=\'%236b7280\' stroke-width=\'2\' stroke-linecap=\'round\' stroke-linejoin=\'round\'%3e%3cpolyline points=\'6 9 12 15 18 9\'%3e%3c/polyline%3e%3c/svg%3e")', backgroundRepeat: 'no-repeat', backgroundPosition: 'right 12px center', backgroundSize: '16px' }}
            >
              <option value="toutes">Toutes les Agences / Assoc.</option>
              {listeAgencesDuniques.map((agence) => (
                <option key={agence} value={agence}>
                  {agence}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Boutons d'état horizontaux défilants sur Mobile */}
        <div className="flex items-center overflow-x-auto pb-1 md:pb-0 gap-2 scrollbar-none -mx-4 px-4 md:mx-0 md:px-0 md:flex-wrap md:justify-start">
          <button 
            onClick={() => setFiltreStatut('tous')}
            className={`whitespace-nowrap px-4 py-2 rounded-xl text-xs font-black transition-all shrink-0 ${filtreStatut === 'tous' ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
          >
            Tous ({totalPelerins})
          </button>
          <button 
            onClick={() => setFiltreStatut('pret')}
            className={`whitespace-nowrap px-4 py-2 rounded-xl text-xs font-black transition-all shrink-0 ${filtreStatut === 'pret' ? 'bg-green-600 text-white' : 'bg-green-50 text-green-700 hover:bg-green-100'}`}
          >
            Prêts pour départ
          </button>
          <button 
            onClick={() => setFiltreStatut('bloque')}
            className={`whitespace-nowrap px-4 py-2 rounded-xl text-xs font-black transition-all shrink-0 ${filtreStatut === 'bloque' ? 'bg-red-600 text-white' : 'bg-red-50 text-red-700 hover:bg-red-100'}`}
          >
            Alerte Bloqués (Payé sans Visa)
          </button>
          <button 
            onClick={() => setFiltreStatut('incomplet_paiement')}
            className={`whitespace-nowrap px-4 py-2 rounded-xl text-xs font-black transition-all shrink-0 ${filtreStatut === 'incomplet_paiement' ? 'bg-amber-600 text-white' : 'bg-amber-50 text-amber-700 hover:bg-amber-100'}`}
          >
            Solde restant
          </button>
        </div>
      </div>

      {/* VUE MOBILE NATIVE COMPLÈTE (S'AFFICHE UNIQUEMENT SUR MOBILE) */}
      <div className="block md:hidden space-y-4">
        {pelerinsFiltrés.map((p) => {
          const reste = (p.prix_package || 0) - (p.total_paye || 0)
          const pourcentagePaiement = Math.min(Math.round(((p.total_paye || 0) / (p.prix_package || 1)) * 100), 100)
          
          return (
            <div key={p.id} className="bg-white p-5 rounded-3xl border border-gray-100 shadow-sm space-y-4">
              <div className="flex justify-between items-start">
                <div>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-xs font-mono font-black text-blue-600">{p.reference || 'SANS RÉF'}</span>
                    {p.agence_ou_personne_associee && (
                      <span className="px-1.5 py-0.5 text-[9px] bg-gray-100 font-bold text-gray-500 rounded">
                        {p.agence_ou_personne_associee}
                      </span>
                    )}
                  </div>
                  <h3 className="font-black text-gray-900 text-lg mt-0.5">{p.nom_complet}</h3>
                  <p className="text-xs font-bold text-gray-400 uppercase">Pass: {p.num_passeport} • {p.sexe || 'M'}</p>
                </div>
                <div>
                  {p.visa_obtenu ? (
                    <span className="px-2.5 py-1 bg-green-100 text-green-800 text-[10px] font-black rounded-full uppercase">✓ Octroyé</span>
                  ) : (
                    <span className="px-2.5 py-1 bg-red-100 text-red-800 text-[10px] font-black rounded-full uppercase animate-pulse">⚠️ Attente</span>
                  )}
                </div>
              </div>

              {/* Étapes numériques & logistiques */}
              <div className="grid grid-cols-2 gap-2 bg-gray-50 p-3 rounded-2xl border border-gray-100/50 text-[11px] font-bold text-gray-600">
                <div className="flex items-center gap-2">
                  <span className={`w-2 h-2 rounded-full shrink-0 ${p.sur_plateforme_gouv ? 'bg-green-500' : 'bg-gray-300'}`}></span>
                  <span>Portail Gouv</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`w-2 h-2 rounded-full shrink-0 ${p.sur_plateforme_nusuk ? 'bg-blue-500' : 'bg-gray-300'}`}></span>
                  <span>Portail Nusuk</span>
                </div>
              </div>

              {/* Status Médicaux & Académiques */}
              <div className="flex flex-wrap gap-1.5">
                <span className={`px-2 py-0.5 rounded-md text-[9px] font-black uppercase ${p.visite_medicale ? 'bg-purple-100 text-purple-700' : 'bg-gray-100 text-gray-400'}`}>⚕️ Médicale</span>
                <span className={`px-2 py-0.5 rounded-md text-[9px] font-black uppercase ${p.vacciné ? 'bg-teal-100 text-teal-700' : 'bg-gray-100 text-gray-400'}`}>💉 Vaccin</span>
                <span className={`px-2 py-0.5 rounded-md text-[9px] font-black uppercase ${p.formation_suivie ? 'bg-indigo-100 text-indigo-700' : 'bg-gray-100 text-gray-400'}`}>🎓 Formé</span>
              </div>

              {/* Logements */}
              <div className="text-xs font-bold text-gray-600 space-y-0.5 border-t border-gray-100 pt-3">
                <div className="flex justify-between"><span>Mecque :</span> <span className="font-black text-gray-900">{p.hotel_mecque || 'Non assigné'}</span></div>
                <div className="flex justify-between"><span>Médine :</span> <span className="font-black text-gray-900">{p.hotel_medine || 'Non assigné'}</span></div>
              </div>

              {/* Barre Financière */}
              <div className="border-t border-gray-100 pt-3">
                <div className="flex justify-between text-[11px] font-black mb-1">
                  <span className="text-gray-400">{p.nom_package || 'Package'} ({pourcentagePaiement}%)</span>
                  <span className={reste === 0 ? "text-green-600" : "text-amber-600"}>
                    {reste === 0 ? 'Soldé' : `${p.total_paye.toLocaleString()} / ${p.prix_package.toLocaleString()} F`}
                  </span>
                </div>
                <div className="w-full bg-gray-100 h-2 rounded-full overflow-hidden">
                  <div className={`h-full ${reste === 0 ? 'bg-green-500' : 'bg-blue-600'}`} style={{ width: `${pourcentagePaiement}%` }}></div>
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {/* VUE DESKTOP TRADITIONNELLE (S'AFFICHE UNIQUEMENT SUR PC) */}
      <div className="hidden md:block bg-white rounded-[2.5rem] border border-gray-100 shadow-sm overflow-hidden">
        <div className="overflow-x-auto w-full inline-block align-middle">
          <table className="w-full text-left border-collapse whitespace-nowrap">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-wider">Réf / Pèlerin</th>
                <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-wider">Vérifications Numériques</th>
                <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-wider">Santé & Form.</th>
                <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-wider">Logistique Logement</th>
                <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-wider">Finances & Solde</th>
                <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-wider text-center">Visa</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {pelerinsFiltrés.map((p) => {
                const reste = (p.prix_package || 0) - (p.total_paye || 0)
                const pourcentagePaiement = Math.min(Math.round(((p.total_paye || 0) / (p.prix_package || 1)) * 100), 100)
                
                return (
                  <tr key={p.id} className="hover:bg-gray-50/70 transition-colors group">
                    
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-mono font-black text-blue-600">{p.reference || 'PAS DE RÉF'}</span>
                        {p.agence_ou_personne_associee && (
                          <span className="px-1.5 py-0.5 text-[9px] bg-gray-100 font-bold text-gray-500 rounded">
                            {p.agence_ou_personne_associee}
                          </span>
                        )}
                      </div>
                      <div className="font-black text-gray-900 text-base">{p.nom_complet}</div>
                      <div className="text-xs font-bold text-gray-400 uppercase tracking-tighter">Pass: {p.num_passeport} • {p.sexe || 'M'}</div>
                    </td>

                    <td className="px-6 py-4 space-y-1">
                      <div className="flex items-center gap-2">
                        <span className={`w-2 h-2 rounded-full ${p.sur_plateforme_gouv ? 'bg-green-500' : 'bg-gray-300'}`}></span>
                        <span className="text-xs font-bold text-gray-600">Portail National (Gouv)</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={`w-2 h-2 rounded-full ${p.sur_plateforme_nusuk ? 'bg-blue-500' : 'bg-gray-300'}`}></span>
                        <span className="text-xs font-bold text-gray-600">Nusuk International</span>
                      </div>
                    </td>

                    <td className="px-6 py-4">
                      <div className="flex flex-wrap gap-1.5 max-w-xs">
                        <span className={`px-2 py-0.5 rounded-md text-[10px] font-black uppercase ${p.visite_medicale ? 'bg-purple-100 text-purple-700' : 'bg-gray-100 text-gray-400'}`}>
                          ⚕️ Médicale
                        </span>
                        <span className={`px-2 py-0.5 rounded-md text-[10px] font-black uppercase ${p.vacciné ? 'bg-teal-100 text-teal-700' : 'bg-gray-100 text-gray-400'}`}>
                          💉 Vaccin
                        </span>
                        <span className={`px-2 py-0.5 rounded-md text-[10px] font-black uppercase ${p.formation_suivie ? 'bg-indigo-100 text-indigo-700' : 'bg-gray-100 text-gray-400'}`}>
                          🎓 Formé
                        </span>
                      </div>
                    </td>

                    <td className="px-6 py-4 text-xs font-bold text-gray-700">
                      <div className="flex items-center gap-1.5">
                        <Hotel size={12} className="text-gray-400" />
                        <span>Mecque : <span className="font-black text-gray-900">{p.hotel_mecque || 'Non assigné'}</span></span>
                      </div>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <Hotel size={12} className="text-gray-400" />
                        <span>Médine : <span className="font-black text-gray-900">{p.hotel_medine || 'Non assigné'}</span></span>
                      </div>
                    </td>

                    <td className="px-6 py-4">
                      <div className="w-36">
                        <div className="flex justify-between text-[10px] font-black mb-0.5">
                          <span className="text-gray-500">{pourcentagePaiement}%</span>
                          <span className={reste === 0 ? "text-green-600" : "text-amber-600"}>
                            {reste === 0 ? 'Soldé' : `-${reste.toLocaleString()} F`}
                          </span>
                        </div>
                        <div className="w-full bg-gray-100 h-1.5 rounded-full overflow-hidden">
                          <div 
                            className={`h-full transition-all duration-300 ${reste === 0 ? 'bg-green-500' : 'bg-blue-600'}`} 
                            style={{ width: `${pourcentagePaiement}%` }}
                          ></div>
                        </div>
                        <div className="text-[10px] font-bold text-gray-400 mt-0.5">
                          {p.nom_package || 'Aucun package'}
                        </div>
                      </div>
                    </td>

                    <td className="px-6 py-4 text-center">
                      {p.visa_obtenu ? (
                        <span className="inline-flex items-center justify-center px-3 py-1 bg-green-100 text-green-800 text-xs font-black rounded-full uppercase tracking-wider">
                          ✓ Octroyé
                        </span>
                      ) : (
                        <span className="inline-flex items-center justify-center px-3 py-1 bg-red-100 text-red-800 text-xs font-black rounded-full uppercase tracking-wider animate-pulse">
                          ⚠️ En Attente
                        </span>
                      )}
                    </td>

                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {pelerinsFiltrés.length === 0 && (
        <div className="text-center py-12 text-gray-400 font-bold italic text-sm">
          Aucun pèlerin ne correspond aux critères sélectionnés.
        </div>
      )}
    </div>
  )
}