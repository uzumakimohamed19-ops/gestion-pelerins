'use client'
import { useEffect, useState, useMemo } from 'react'
import { supabase, getUser } from '@/lib/supabase'
import { cacheFirstFetch } from '@/lib/cacheFirst'
import { useRouter } from 'next/navigation'
import { useYear } from '@/lib/YearContext' // Importation du contexte de l'année
import { YearSelector } from '@/components/YearSelector' // Importation du sélecteur d'année
import { 
  BarChart3, Users, Landmark, Plane, ShieldCheck, 
  Search, Download, FileText, Activity, Hotel, GraduationCap, Loader2,
  CheckCircle2, AlertTriangle, Phone, CreditCard, Award, Calendar
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
  campagne?: string | number // Ajout du champ pour le filtrage par année
  agences?: { nom_agence?: string }
}

export default function EtatGeneralHajj() {
  const [pelerins, setPelerins] = useState<Pelerin[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [filtreStatut, setFiltreStatut] = useState<'tous' | 'pret' | 'bloque' | 'incomplet_paiement'>('tous')
  const [filtreAgence, setFiltreAgence] = useState<string>('toutes')
  const router = useRouter()
  const { selectedYear } = useYear() // Récupération de l'année sélectionnée

  useEffect(() => {
    const checkUserAndFetch = async () => {
      const { data: { user } } = await getUser()
      if (!user) { router.push('/login'); return }

      // Intégration de selectedYear dans la clé de cache pour éviter les conflits inter-campagnes
      await cacheFirstFetch<any[]>({
        cacheKey: `etat_general_pelerins_${selectedYear}`,
        setLoading,
        fetchRemote: async () => {
          let query = supabase
            .from('pelerins')
            .select('*, agences(nom_agence)')
            .order('nom_complet', { ascending: true })

          // Filtrer par campagne si selectedYear est défini
          if (selectedYear) {
            query = query.eq('campagne', selectedYear)
          }

          const { data, error } = await query

          if (error || !data) return undefined
          return data as any[]
        },
        onCache: (data) => setPelerins(data),
        onRemote: (data) => setPelerins(data),
      })
    }
    checkUserAndFetch()
  }, [router, selectedYear]) // Dépendance ajoutée sur selectedYear pour recharger au changement d'année

  // Extraction unique et dynamique des agences/personnes associées disponibles
  const listeAgencesDuniques = useMemo(() => {
    return Array.from(
      new Set(pelerins.map(p => p.agence_ou_personne_associee).filter(Boolean))
    ).sort()
  }, [pelerins])

  // LOGIQUE DE FILTRAGE COMBINÉE
  const pelerinsFiltrés = useMemo(() => {
    return pelerins.filter(p => {
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
  }, [pelerins, searchTerm, filtreAgence, filtreStatut])

  // CALCULS ANALYTIQUES POUR LES STATISTIQUES GLOBALES
  const totalPelerins = pelerins.length
  const totalVisas = pelerins.filter(p => p.visa_obtenu).length
  const totalMedical = pelerins.filter(p => p.visite_medicale && p.vacciné).length
  
  const argentEncaisse = pelerins.reduce((sum, p) => sum + (p.total_paye || 0), 0)
  const argentAttendu = pelerins.reduce((sum, p) => sum + (p.prix_package || 0), 0)
  const resteACollecter = argentAttendu - argentEncaisse

  // EXPORT EXCEL GLOBAL DE TOUTES LES COLONNES STRATÉGIQUES
  const exporterGrandEtatExcel = async () => {
    const workbook = new ExcelJS.Workbook()
    const worksheet = workbook.addWorksheet(`État Général ${selectedYear}`)

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
    saveAs(new Blob([buffer]), `Etat_General_Hajj_${selectedYear}_${new Date().toISOString().split('T')[0]}.xlsx`)
  }

  if (loading) {
    return (
      <div className="h-screen w-full flex flex-col items-center justify-center gap-3 bg-gray-50 px-4 text-center">
        <Loader2 className="animate-spin text-blue-600" size={36} />
        <p className="text-sm font-black text-gray-500 uppercase tracking-widest">Génération de l'état général {selectedYear}...</p>
      </div>
    )
  }

  return (
    <div className="max-w-7xl mx-auto px-4 py-4 md:py-8 bg-gray-50 min-h-screen w-full overflow-x-hidden">
      
      {/* SECTEUR ANNEE */}
      <div className="flex justify-end mb-4">
        <YearSelector />
      </div>

      {/* ENTÊTE DE PAGE */}
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center mb-6 md:mb-8 gap-4 w-full">
        <div className="min-w-0 w-full">
          <h1 className="text-xl md:text-3xl font-black text-slate-900 tracking-tight flex items-center gap-2 break-words">
            <BarChart3 className="text-blue-600 shrink-0" size={26} />
            <span className="truncate">État Général - Hajj {selectedYear}</span>
          </h1>
          <p className="text-gray-500 font-bold text-[10px] md:text-sm uppercase tracking-wider mt-0.5">
            Rapport global consolidé en temps réel
          </p>
        </div>
        <button 
          onClick={exporterGrandEtatExcel}
          className="w-full lg:w-auto flex items-center justify-center gap-2 bg-slate-900 hover:bg-slate-800 text-white px-4 py-3 rounded-xl font-black text-xs transition-all duration-200 shadow-md active:scale-95 shrink-0"
        >
          <Download size={14} /> Exporter le Manifeste ({pelerinsFiltrés.length})
        </button>
      </div>

      {/* BLOCS DE STATISTIQUES CONSOLIDÉES (KPIs) - GRILLE OPTIMISÉE MOBILE SANS DÉBORDEMENT */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 md:gap-5 mb-6 w-full">
        <div className="bg-white p-2.5 md:p-6 rounded-xl md:rounded-3xl border border-gray-100 shadow-sm flex items-center gap-2 min-w-0">
          <div className="p-2 bg-blue-50 text-blue-600 rounded-lg shrink-0"><Users size={16} className="md:w-6 md:h-6" /></div>
          <div className="min-w-0">
            <span className="text-[9px] md:text-xs font-bold text-gray-400 uppercase block truncate">Effectif</span>
            <span className="text-sm md:text-2xl font-black text-gray-900 block truncate">{totalPelerins} <span className="text-[8px] text-gray-400 font-bold hidden sm:inline">Inscrits</span></span>
          </div>
        </div>

        <div className="bg-white p-2.5 md:p-6 rounded-xl md:rounded-3xl border border-gray-100 shadow-sm flex items-center gap-2 min-w-0">
          <div className="p-2 bg-emerald-50 text-emerald-600 rounded-lg shrink-0"><ShieldCheck size={16} className="md:w-6 md:h-6" /></div>
          <div className="min-w-0">
            <span className="text-[9px] md:text-xs font-bold text-gray-400 uppercase block truncate">Visas</span>
            <span className="text-sm md:text-2xl font-black text-emerald-600 block truncate">
              {totalVisas} <span className="text-[8px] text-gray-400 font-bold">/ {totalPelerins}</span>
            </span>
          </div>
        </div>

        <div className="bg-white p-2.5 md:p-6 rounded-xl md:rounded-3xl border border-gray-100 shadow-sm flex items-center gap-2 min-w-0">
          <div className="p-2 bg-purple-50 text-purple-600 rounded-lg shrink-0"><Activity size={16} className="md:w-6 md:h-6" /></div>
          <div className="min-w-0">
            <span className="text-[9px] md:text-xs font-bold text-gray-400 uppercase block truncate">Santé</span>
            <span className="text-sm md:text-2xl font-black text-purple-600 block truncate">
              {totalMedical} <span className="text-[8px] text-gray-400 font-bold hidden sm:inline">Aptes</span>
            </span>
          </div>
        </div>

        <div className="bg-white p-2.5 md:p-6 rounded-xl md:rounded-3xl border border-gray-100 shadow-sm flex items-center gap-2 min-w-0">
          <div className="p-2 bg-amber-50 text-amber-600 rounded-lg shrink-0"><Landmark size={16} className="md:w-6 md:h-6" /></div>
          <div className="min-w-0">
            <span className="text-[9px] md:text-xs font-bold text-gray-400 uppercase block truncate">Restant</span>
            <span className="text-[11px] md:text-xl font-black text-amber-700 block truncate">{resteACollecter.toLocaleString()} F</span>
          </div>
        </div>
      </div>

      {/* FILTRES AVANCÉS DE SITUATION */}
      <div className="bg-white p-3 md:p-4 rounded-xl border border-gray-100 shadow-sm mb-6 flex flex-col gap-3 w-full">
        <div className="flex flex-col md:flex-row gap-2.5 w-full">
          <div className="relative flex-1 w-full">
            <input 
              type="text"
              placeholder="Recherche rapide (Nom, Passeport, Réf)..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-4 py-2.5 bg-gray-50 rounded-xl font-bold border-0 focus:ring-2 focus:ring-blue-600 text-xs outline-none"
            />
            <Search className="absolute left-3 top-3 text-gray-400" size={14} />
          </div>

          <div className="w-full md:w-72">
            <select
              value={filtreAgence}
              onChange={(e) => setFiltreAgence(e.target.value)}
              className="w-full px-3 py-2.5 bg-gray-50 text-gray-700 rounded-xl font-bold border-0 focus:ring-2 focus:ring-blue-600 text-xs outline-none cursor-pointer appearance-none"
              style={{ backgroundImage: 'url("data:image/svg+xml;charset=UTF-8,%3csvg xmlns=\'http://www.w3.org/2000/svg\' viewBox=\'0 0 24 24\' fill=\'none\' stroke=\'%236b7280\' stroke-width=\'2\' stroke-linecap=\'round\' stroke-linejoin=\'round\'%3e%3cpolyline points=\'6 9 12 15 18 9\'%3e%3c/polyline%3e%3c/svg%3e")', backgroundRepeat: 'no-repeat', backgroundPosition: 'right 12px center', backgroundSize: '14px' }}
            >
              <option value="toutes">Toutes les Agences / Assoc.</option>
              {listeAgencesDuniques.map((agence) => (
                <option key={agence} value={agence}>{agence}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Onglets Horizontaux Défilants sur Mobile */}
        <div className="flex items-center overflow-x-auto pb-1 gap-2 scrollbar-none -mx-3 px-3 md:mx-0 md:px-0 md:flex-wrap w-full">
          <button 
            onClick={() => setFiltreStatut('tous')}
            className={`whitespace-nowrap px-3 py-2 rounded-xl text-[10px] md:text-xs font-black uppercase tracking-wider transition-all shrink-0 ${filtreStatut === 'tous' ? 'bg-slate-900 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
          >
            Tous ({totalPelerins})
          </button>
          <button 
            onClick={() => setFiltreStatut('pret')}
            className={`whitespace-nowrap px-3 py-2 rounded-xl text-[10px] md:text-xs font-black uppercase tracking-wider transition-all shrink-0 ${filtreStatut === 'pret' ? 'bg-emerald-600 text-white' : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'}`}
          >
            Prêts pour départ
          </button>
          <button 
            onClick={() => setFiltreStatut('bloque')}
            className={`whitespace-nowrap px-3 py-2 rounded-xl text-[10px] md:text-xs font-black uppercase tracking-wider transition-all shrink-0 ${filtreStatut === 'bloque' ? 'bg-rose-600 text-white font-black animate-pulse' : 'bg-rose-50 text-rose-700 hover:bg-rose-100'}`}
          >
            Alerte Bloqués
          </button>
          <button 
            onClick={() => setFiltreStatut('incomplet_paiement')}
            className={`whitespace-nowrap px-3 py-2 rounded-xl text-[10px] md:text-xs font-black uppercase tracking-wider transition-all shrink-0 ${filtreStatut === 'incomplet_paiement' ? 'bg-amber-500 text-white' : 'bg-amber-50 text-amber-700 hover:bg-amber-100'}`}
          >
            Solde restant
          </button>
        </div>
      </div>

      {/* VUE MOBILE NATIVE PARFAITEMENT AJUSTÉE POUR TOUT ÉCRAN (SANS DEZOOM) */}
      <div className="block md:hidden space-y-3.5 w-full">
        {pelerinsFiltrés.map((p) => {
          const reste = (p.prix_package || 0) - (p.total_paye || 0)
          const pourcentagePaiement = Math.min(Math.round(((p.total_paye || 0) / (p.prix_package || 1)) * 100), 100)
          
          return (
            <div key={p.id} className="bg-white p-3.5 rounded-xl border border-slate-100 shadow-sm space-y-3 w-full box-border">
              {/* Ligne principale Nom / Statut Visa */}
              <div className="flex justify-between items-start gap-2 w-full">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1 flex-wrap w-full">
                    <span className="text-[9px] font-mono font-black text-blue-600 tracking-tight shrink-0">{p.reference || 'SANS RÉF'}</span>
                    {p.agence_ou_personne_associee && (
                      <span className="px-1 py-0.5 text-[8px] bg-slate-100 font-bold text-slate-500 rounded uppercase truncate max-w-[100px]">
                        {p.agence_ou_personne_associee}
                      </span>
                    )}
                  </div>
                  <h3 className="font-black text-slate-900 text-sm mt-0.5 break-words uppercase">{p.nom_complet}</h3>
                  <p className="text-[10px] font-bold text-slate-400 mt-0.5 break-all">
                    {p.num_passeport} • {p.sexe || 'M'} {p.telephone_pelerin ? `• ${p.telephone_pelerin}` : ''}
                  </p>
                </div>
                
                <div className="shrink-0">
                  {p.visa_obtenu ? (
                    <span className="inline-flex items-center gap-0.5 px-2 py-0.5 bg-emerald-50 text-emerald-700 text-[9px] font-black rounded-md uppercase">
                      VISA OK
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-0.5 px-2 py-0.5 bg-rose-50 text-rose-700 text-[9px] font-black rounded-md uppercase animate-pulse">
                      VISA ATT.
                    </span>
                  )}
                </div>
              </div>

              {/* Matrice d'étapes visuelles (Grille compacte 2x2) */}
              <div className="grid grid-cols-2 gap-2 bg-slate-50/70 p-2 rounded-lg border border-slate-100 text-[9px] font-black uppercase w-full box-border">
                <div className="flex items-center gap-1 min-w-0">
                  <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${p.sur_plateforme_gouv ? 'bg-emerald-500' : 'bg-slate-300'}`}></span>
                  <span className={`truncate ${p.sur_plateforme_gouv ? "text-slate-700" : "text-slate-400"}`}>Portail Gouv</span>
                </div>
                <div className="flex items-center gap-1 min-w-0">
                  <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${p.sur_plateforme_nusuk ? 'bg-blue-500' : 'bg-slate-300'}`}></span>
                  <span className={`truncate ${p.sur_plateforme_nusuk ? "text-slate-700" : "text-slate-400"}`}>Nusuk</span>
                </div>
                <div className="flex items-center gap-1 min-w-0">
                  <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${p.visite_medicale && p.vacciné ? 'bg-purple-500' : 'bg-slate-300'}`}></span>
                  <span className={`truncate ${p.visite_medicale && p.vacciné ? "text-slate-700" : "text-slate-400"}`}>Santé Ok</span>
                </div>
                <div className="flex items-center gap-1 min-w-0">
                  <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${p.formation_suivie ? 'bg-indigo-500' : 'bg-slate-300'}`}></span>
                  <span className={`truncate ${p.formation_suivie ? "text-slate-700" : "text-slate-400"}`}>Formé</span>
                </div>
              </div>

              {/* Logements simplifiés empilables sur ultra-petits écrans */}
              <div className="text-[10px] font-bold text-slate-600 bg-slate-50/40 p-2 rounded-lg flex flex-col xs:flex-row justify-between gap-1 w-full box-border">
                <div className="flex items-center gap-1 min-w-0 truncate">
                  <Hotel size={11} className="text-slate-400 shrink-0" />
                  <span className="truncate">Mec: <strong className="text-slate-900">{p.hotel_mecque || '-'}</strong></span>
                </div>
                <div className="flex items-center gap-1 min-w-0 truncate">
                  <Hotel size={11} className="text-slate-400 shrink-0" />
                  <span className="truncate">Méd: <strong className="text-slate-900">{p.hotel_medine || '-'}</strong></span>
                </div>
              </div>

              {/* Barre Financière Mobile Épurée */}
              <div className="pt-0.5 w-full">
                <div className="flex justify-between items-center text-[9px] font-black mb-1 w-full gap-2">
                  <span className="text-slate-400 uppercase tracking-tight truncate flex-1 min-w-0">{p.nom_package || 'Package'} ({pourcentagePaiement}%)</span>
                  <span className={`shrink-0 ${reste === 0 ? "text-emerald-600" : "text-amber-600"}`}>
                    {reste === 0 ? 'SOLDÉ' : `${p.total_paye.toLocaleString()} F`}
                  </span>
                </div>
                <div className="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden">
                  <div className={`h-full ${reste === 0 ? 'bg-emerald-500' : 'bg-blue-600'}`} style={{ width: `${pourcentagePaiement}%` }}></div>
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {/* VUE DESKTOP TRADITIONNELLE (S'AFFICHE UNIQUEMENT SUR PC) */}
      <div className="hidden md:block bg-white rounded-[2rem] border border-gray-100 shadow-sm overflow-hidden w-full">
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
        <div className="text-center py-12 text-gray-400 font-bold italic text-sm w-full">
          Aucun pèlerin ne correspond aux critères sélectionnés pour la campagne {selectedYear}.
        </div>
      )}
    </div>
  )
}