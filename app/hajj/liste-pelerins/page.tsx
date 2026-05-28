'use client'
import { useEffect, useState } from 'react'
import { supabase, getUser } from '@/lib/supabase'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Search, Download, Plus, User, CreditCard, ChevronRight, Loader2, Calendar, Hash, Building2, Phone, X } from 'lucide-react'
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
  reference?: string // Ajout explicite de la colonne de référence
  agence_ou_personne_associee?: string // Ajout explicite de la colonne intermédiaire
  total_paye: number        
  prix_package: number      
  sur_plateforme_gouv: boolean
  sur_plateforme_nusuk: boolean
  date_depart?: string // Ajout pour le filtrage demandé
  date_retour?: string // Ajout pour le filtrage demandé
  agences?: {
    nom_agence?: string
  }
}

type FilterType = 'date' | 'reference' | 'agence' | 'phone' | 'date_depart' | 'date_retour' | null;

export default function ListePelerins() {
  const [pelerins, setPelerins] = useState<Pelerin[]>([])
  const [searchTerm, setSearchTerm] = useState('')
  const [loading, setLoading] = useState(true)
  const [updatingId, setUpdatingId] = useState<string | null>(null)
  const [role, setRole] = useState<string>('staff')
  const router = useRouter()

  // États pour la gestion des filtres par étape
  const [activeFilterType, setActiveFilterType] = useState<FilterType>(null)
  const [selectedFilterValue, setSelectedFilterValue] = useState<string | null>(null)

  useEffect(() => {
    const checkUserAndFetch = async () => {
      try {
        const { data: { user } } = await getUser()
        if (!user) {
          router.push('/login')
          return
        }
        const { data: profile } = await supabase
          .from('profiles')
          .select('role')
          .eq('id', user.id)
          .single()

        if (profile?.role) setRole(profile.role)
        fetchPelerins()
      } catch (error) {
        router.push('/login')
      }
    }
    checkUserAndFetch()
  }, [router])

  async function fetchPelerins() {
    setLoading(true)
    const { data, error } = await supabase
      .from('pelerins')
      .select('*, agences ( nom_agence )')
      .order('created_at', { ascending: false })

    if (!error) setPelerins((data as any[]) || [])
    setLoading(false)
  }

  const toggleFastStatus = async (id: string, field: string, currentValue: boolean) => {
    setUpdatingId(id + field);
    const newValue = !currentValue;
    const { error } = await supabase
      .from('pelerins')
      .update({ [field]: newValue })
      .eq('id', id);

    if (!error) {
      setPelerins(prev => prev.map(p => p.id === id ? { ...p, [field]: newValue } : p));
    }
    setUpdatingId(null);
  };

  const exporterExcel = async () => {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Liste Pèlerins');
    
    worksheet.columns = [
      { header: 'NOM COMPLET', key: 'nom', width: 35 },
      { header: 'NUMÉRO PASSEPORT', key: 'passeport', width: 22 },
      { header: 'TÉLÉPHONE', key: 'phone', width: 22 },
      { header: 'DATE NAISSANCE', key: 'naissance', width: 20 },
      { header: 'EXP. PASSEPORT', key: 'expiration', width: 20 },
      { header: 'AGENCE ENREGISTREMENT', key: 'agence', width: 30 },
      { header: 'PLATEFORME GOUV', key: 'gouv', width: 20 },
      { header: 'PORTAIL NUSUK', key: 'nusuk', width: 20 },
    ];

    const headerRow = worksheet.getRow(1);
    headerRow.height = 28;
    headerRow.eachCell((cell) => {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E40AF' } }; 
      cell.font = { name: 'Arial', bold: true, color: { argb: 'FFFFFFFF' }, size: 10 };
      cell.alignment = { vertical: 'middle', horizontal: 'center' };
      cell.border = {
        top: { style: 'thin', color: { argb: 'FF1E40AF' } },
        bottom: { style: 'medium', color: { argb: 'FF0F172A' } }
      };
    });

    pelerinsFiltrés.forEach((p, idx) => {
      const row = worksheet.addRow({
        nom: p.nom_complet.toUpperCase(),
        passeport: p.num_passeport,
        phone: p.telephone_pelerin || 'N/A',
        naissance: p.date_naissance ? new Date(p.date_naissance).toLocaleDateString('fr-FR') : 'N/A',
        expiration: p.date_expiration ? new Date(p.date_expiration).toLocaleDateString('fr-FR') : 'N/A',
        agence: p.agences?.nom_agence || 'N/A',
        gouv: p.sur_plateforme_gouv ? '✅ OUI' : '❌ NON',
        nusuk: p.sur_plateforme_nusuk ? '✅ OUI' : '❌ NON'
      });

      row.height = 22;
      
      const bgColor = idx % 2 === 0 ? 'FFFFFFFF' : 'F9FAFBFF';
      row.eachCell((cell, colNumber) => {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bgColor } };
        cell.font = { name: 'Arial', size: 10, color: { argb: 'FF334155' } };
        cell.border = { bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } } };
        
        if (colNumber === 1 || colNumber === 6) {
          cell.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
        } else {
          cell.alignment = { vertical: 'middle', horizontal: 'center' };
        }
      });
    });

    const buffer = await workbook.xlsx.writeBuffer();
    saveAs(new Blob([buffer]), `Liste_Pelerins_Hajj_${new Date().toLocaleDateString('fr-FR')}.xlsx`);
  };

  // CORRIGÉ : Générateur dynamique basé sur les colonnes réelles 'reference' et 'agence_ou_personne_associee'
  const getFilterOptions = (): string[] => {
    if (!activeFilterType) return [];
    const rawOptions = pelerins.map(p => {
      switch (activeFilterType) {
        case 'date':
          return p.created_at ? new Date(p.created_at).toLocaleDateString('fr-FR') : 'N/A';
        case 'date_depart':
          return p.date_depart ? new Date(p.date_depart).toLocaleDateString('fr-FR') : 'N/A';
        case 'date_retour':
          return p.date_retour ? new Date(p.date_retour).toLocaleDateString('fr-FR') : 'N/A';
        case 'reference':
          return p.reference || 'Sans référence'; // Utilisation de la colonne reference
        case 'agence':
          return p.agence_ou_personne_associee || 'Non spécifié'; // Utilisation de agence_ou_personne_associee
        case 'phone':
          return p.telephone_pelerin || 'Aucun numéro';
        default:
          return '';
      }
    });
    return Array.from(new Set(rawOptions.filter(Boolean)));
  };

  // CORRIGÉ : Filtrage global appliqué sur les vraies colonnes 'reference' et 'agence_ou_personne_associee'
  const pelerinsFiltrés = pelerins.filter(p => {
    const matchesSearch = p.nom_complet.toLowerCase().includes(searchTerm.toLowerCase()) ||
      p.num_passeport.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (p.agences?.nom_agence || '').toLowerCase().includes(searchTerm.toLowerCase());

    if (!matchesSearch) return false;

    if (selectedFilterValue) {
      switch (activeFilterType) {
        case 'date':
          const registrationDate = p.created_at ? new Date(p.created_at).toLocaleDateString('fr-FR') : 'N/A';
          return registrationDate === selectedFilterValue;
        case 'date_depart':
          const departureDate = p.date_depart ? new Date(p.date_depart).toLocaleDateString('fr-FR') : 'N/A';
          return departureDate === selectedFilterValue;
        case 'date_retour':
          const returnDate = p.date_retour ? new Date(p.date_retour).toLocaleDateString('fr-FR') : 'N/A';
          return returnDate === selectedFilterValue;
        case 'reference':
          return (p.reference || 'Sans référence') === selectedFilterValue;
        case 'agence':
          return (p.agence_ou_personne_associee || 'Non spécifié') === selectedFilterValue;
        case 'phone':
          return (p.telephone_pelerin || 'Aucun numéro') === selectedFilterValue;
        default:
          return true;
      }
    }
    return true;
  });

  const handleFilterTypeClick = (type: FilterType) => {
    if (activeFilterType === type) {
      setActiveFilterType(null);
      setSelectedFilterValue(null);
    } else {
      setActiveFilterType(type);
      setSelectedFilterValue(null);
    }
  };

  return (
    <div className="max-w-6xl mx-auto px-4 py-6 md:py-10">
      
      {/* HEADER ADAPTATIF */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between mb-8 gap-6">
        <div>
          <h1 className="text-3xl md:text-4xl font-black text-gray-900 tracking-tight">Dossiers</h1>
          <p className="text-gray-500 font-bold mt-1 uppercase text-xs tracking-widest">{pelerins.length} pèlerins au total</p>
        </div>
        <div className="grid grid-cols-2 sm:flex gap-3">
          <button 
            onClick={exporterExcel} 
            className="flex items-center justify-center gap-2 bg-emerald-50 text-emerald-700 hover:bg-emerald-100/80 px-4 py-3.5 rounded-2xl font-black text-sm border border-emerald-100 transition-all duration-200 hover:-translate-y-0.5 active:translate-y-0 active:scale-95"
          >
            <Download size={18} /> <span className="hidden sm:inline">Export Pro</span>
          </button>
          <Link 
            href="/hajj/ajouter-pelerin" 
            className="flex items-center justify-center gap-2 bg-blue-600 text-white hover:bg-blue-700 px-4 py-3.5 rounded-2xl font-black text-sm shadow-lg shadow-blue-200 hover:shadow-xl transition-all duration-200 hover:-translate-y-0.5 active:translate-y-0 active:scale-95"
          >
            <Plus size={18} /> Nouveau
          </Link>
        </div>
      </div>

      {/* RECHERCHE AMÉLIORÉE */}
      <div className="mb-4 relative group">
        <input 
          type="text"
          placeholder="Nom, passeport, agence..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full pl-12 pr-4 py-4 rounded-[1.5rem] border-2 border-gray-100 bg-white text-gray-900 font-bold focus:border-blue-600 focus:ring-0 outline-none transition-all duration-200 shadow-sm group-hover:border-gray-200 focus:shadow-md"
        />
        <Search className="absolute left-4 top-4 text-gray-400 group-focus-within:text-blue-600 transition-colors duration-200" size={24} />
      </div>

      {/* COMPOSANT DE FILTRAGE PAR ÉTAPE (DESKTOP & MOBILE RESPONSIVE) */}
      <div className="mb-8 space-y-3">
        <div className="flex flex-wrap gap-2 items-center">
          <span className="text-[10px] font-black uppercase text-gray-400 tracking-wider mr-1">Filtrer par :</span>
          
          <button
            onClick={() => handleFilterTypeClick('date')}
            className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-black transition-all duration-200 active:scale-95 ${activeFilterType === 'date' ? 'bg-blue-600 text-white shadow-md shadow-blue-100' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
          >
            <Calendar size={14} /> Date inscription
          </button>

          <button
            onClick={() => handleFilterTypeClick('date_depart')}
            className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-black transition-all duration-200 active:scale-95 ${activeFilterType === 'date_depart' ? 'bg-blue-600 text-white shadow-md shadow-blue-100' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
          >
            <Calendar size={14} /> Date départ
          </button>

          <button
            onClick={() => handleFilterTypeClick('date_retour')}
            className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-black transition-all duration-200 active:scale-95 ${activeFilterType === 'date_retour' ? 'bg-blue-600 text-white shadow-md shadow-blue-100' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
          >
            <Calendar size={14} /> Date retour
          </button>

          <button
            onClick={() => handleFilterTypeClick('reference')}
            className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-black transition-all duration-200 active:scale-95 ${activeFilterType === 'reference' ? 'bg-blue-600 text-white shadow-md shadow-blue-100' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
          >
            <Hash size={14} /> Référence
          </button>

          <button
            onClick={() => handleFilterTypeClick('agence')}
            className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-black transition-all duration-200 active:scale-95 ${activeFilterType === 'agence' ? 'bg-blue-600 text-white shadow-md shadow-blue-100' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
          >
            <Building2 size={14} /> Agence / Associé
          </button>

          <button
            onClick={() => handleFilterTypeClick('phone')}
            className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-black transition-all duration-200 active:scale-95 ${activeFilterType === 'phone' ? 'bg-blue-600 text-white shadow-md shadow-blue-100' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
          >
            <Phone size={14} /> Numéro téléphone
          </button>

          {(activeFilterType || selectedFilterValue) && (
            <button
              onClick={() => { setActiveFilterType(null); setSelectedFilterValue(null); }}
              className="flex items-center justify-center w-7 h-7 bg-red-50 text-red-600 hover:bg-red-100 rounded-lg transition-colors cursor-pointer"
              title="Réinitialiser les filtres"
            >
              <X size={14} />
            </button>
          )}
        </div>

        {/* Menu déroulant contenant les données extraites à cliquer */}
        {activeFilterType && (
          <div className="bg-gray-50 rounded-2xl p-4 border border-gray-100 shadow-inner max-h-40 overflow-y-auto transition-all animate-in fade-in slide-in-from-top-2 duration-200">
            <div className="flex justify-between items-center mb-2">
              <span className="text-[10px] font-black uppercase text-gray-400 tracking-wider">
                Sélectionnez une option pour appliquer le filtre :
              </span>
              {selectedFilterValue && (
                <span className="bg-blue-50 text-blue-700 text-[10px] font-black px-2 py-0.5 rounded-md flex items-center gap-1">
                  Actif: {selectedFilterValue}
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
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all duration-150 cursor-pointer ${selectedFilterValue === option ? 'bg-gray-900 text-white shadow-sm' : 'bg-white text-gray-700 border border-gray-200 hover:border-gray-400'}`}
                  >
                    {option}
                  </button>
                ))
              )}
            </div>
          </div>
        )}
      </div>

      {/* LISTE MOBILE / TABLEAU PC */}
      <div className="space-y-4 md:space-y-0">
        {loading ? (
          <div className="py-20 flex flex-col items-center justify-center text-gray-400 font-black uppercase tracking-widest gap-3">
            <Loader2 className="animate-spin text-blue-600" size={28} />
            Chargement...
          </div>
        ) : (
          <>
            {/* VUE MOBILE (Cartes) */}
            <div className="md:hidden space-y-4">
              {pelerinsFiltrés.map((p) => (
                <div key={p.id} className="bg-white p-5 rounded-[2rem] border border-gray-100 shadow-sm hover:shadow-md transition-all duration-200 hover:-translate-y-0.5">
                  <div className="flex justify-between items-start mb-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-blue-50 flex items-center justify-center text-blue-600 transition-transform duration-300 group-hover:scale-110">
                        <User size={20} />
                      </div>
                      <div>
                        <h3 className="font-black text-gray-900 leading-tight">{p.prenom}
                          {p.nom_complet} </h3>
                        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-tighter mt-0.5">{p.num_passeport}</p>
                      </div>
                    </div>
                    
                    <div className="flex gap-3 bg-gray-50 p-2 rounded-xl border border-gray-100">
                      <div className="flex flex-col items-center gap-1">
                        <button 
                          onClick={() => toggleFastStatus(p.id, 'sur_plateforme_gouv', p.sur_plateforme_gouv)} 
                          disabled={updatingId === p.id + 'sur_plateforme_gouv'}
                          className={`w-5 h-5 rounded-full flex items-center justify-center transition-all duration-200 active:scale-75 ${p.sur_plateforme_gouv ? 'bg-green-500 shadow-md shadow-green-100' : 'bg-gray-200'}`}
                        >
                          {updatingId === p.id + 'sur_plateforme_gouv' ? (
                            <Loader2 className="animate-spin text-white" size={10} />
                          ) : (
                            p.sur_plateforme_gouv && <div className="w-1.5 h-1.5 bg-white rounded-full"></div>
                          )}
                        </button>
                        <span className="text-[8px] font-black text-gray-400 uppercase tracking-tighter">Gouv</span>
                      </div>

                      <div className="flex flex-col items-center gap-1">
                        <button 
                          onClick={() => toggleFastStatus(p.id, 'sur_plateforme_nusuk', p.sur_plateforme_nusuk)} 
                          disabled={updatingId === p.id + 'sur_plateforme_nusuk'}
                          className={`w-5 h-5 rounded-full flex items-center justify-center transition-all duration-200 active:scale-75 ${p.sur_plateforme_nusuk ? 'bg-blue-500 shadow-md shadow-blue-100' : 'bg-gray-200'}`}
                        >
                          {updatingId === p.id + 'sur_plateforme_nusuk' ? (
                            <Loader2 className="animate-spin text-white" size={10} />
                          ) : (
                            p.sur_plateforme_nusuk && <div className="w-1.5 h-1.5 bg-white rounded-full"></div>
                          )}
                        </button>
                        <span className="text-[8px] font-black text-gray-400 uppercase tracking-tighter">Nusuk</span>
                      </div>
                    </div>
                  </div>

                  <div className="bg-gray-50 rounded-2xl p-4 mb-4 border border-gray-100/50">
                    <div className="flex justify-between text-[10px] font-black uppercase mb-1.5">
                      <span className="text-gray-400">Paiement</span>
                      <span className="text-blue-600">{Math.round((p.total_paye / p.prix_package) * 100) || 0}%</span>
                    </div>
                    <div className="w-full bg-gray-200 h-1.5 rounded-full overflow-hidden mb-2">
                      <div className="h-full bg-blue-600 transition-all duration-500 ease-out" style={{ width: `${(p.total_paye / p.prix_package) * 100}%` }}></div>
                    </div>
                    <div className="flex justify-between text-[10px] font-bold text-gray-500 bg-white px-2 py-1 rounded-md border border-gray-100">
                      <span>Payé: {p.total_paye.toLocaleString()} F</span>
                      <span>Total: {p.prix_package.toLocaleString()} F</span>
                    </div>
                  </div>

                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-gray-400 italic">{p.agences?.nom_agence}</span>
                    <Link 
                      href={`/hajj/pelerin/${p.id}`} 
                      className="bg-gray-900 text-white hover:bg-blue-600 px-4 py-2 rounded-xl text-xs font-black flex items-center gap-1 transition-all duration-200 active:scale-95"
                    >
                      Détails <ChevronRight size={14} className="transition-transform duration-200 group-hover:translate-x-0.5" />
                    </Link>
                  </div>
                </div>
              ))}
            </div>

            {/* VUE DESKTOP (Tableau classique) */}
            <div className="hidden md:block bg-white rounded-[2.5rem] shadow-sm border border-gray-100 overflow-hidden">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-gray-50/50 border-b border-gray-100">
                    <th className="px-6 py-5 text-[10px] font-black text-gray-400 uppercase tracking-widest">Pèlerin</th>
                    <th className="px-6 py-5 text-[10px] font-black text-gray-400 uppercase tracking-widest">Passeport</th>
                    <th className="px-6 py-5 text-[10px] font-black text-gray-400 uppercase tracking-widest">Status</th>
                    <th className="px-6 py-5 text-[10px] font-black text-gray-400 uppercase tracking-widest">{role === 'admin' ? 'Agence' : 'Paiement'}</th>
                    <th className="px-6 py-5 text-[10px] font-black text-gray-400 uppercase tracking-widest text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {pelerinsFiltrés.map((p) => (
                    <tr key={p.id} className="hover:bg-blue-50/15 transition-colors duration-150 group">
                      <td className="px-6 py-5">
                        <div className="font-black text-gray-900 text-lg group-hover:text-blue-900 transition-colors duration-150"> {p.prenom} {p.nom_complet}</div>
                        <div className="text-sm text-gray-400 font-medium">{p.telephone_pelerin || 'Aucun numéro'}</div>
                      </td>
                      <td className="px-6 py-5">
                        <span className="bg-gray-100 px-3 py-1.5 rounded-xl font-mono font-black text-gray-700 uppercase text-sm border border-gray-200 transition-colors group-hover:bg-white">
                          {p.num_passeport}
                        </span>
                      </td>
                      <td className="px-6 py-5">
                        <div className="flex gap-4">
                          <div className="flex flex-col items-center gap-1">
                            <button 
                              onClick={() => toggleFastStatus(p.id, 'sur_plateforme_gouv', p.sur_plateforme_gouv)} 
                              disabled={updatingId === p.id + 'sur_plateforme_gouv'}
                              className={`w-5 h-5 rounded-full flex items-center justify-center transition-all duration-200 hover:scale-110 active:scale-90 ${p.sur_plateforme_gouv ? 'bg-green-500 shadow-lg shadow-green-100' : 'bg-gray-200'}`}
                            >
                              {updatingId === p.id + 'sur_plateforme_gouv' ? (
                                <Loader2 className="animate-spin text-white" size={10} />
                              ) : (
                                p.sur_plateforme_gouv && <div className="w-2 h-2 bg-white rounded-full"></div>
                              )}
                            </button>
                            <span className="text-[8px] font-black text-gray-400 tracking-wide uppercase">Gouv</span>
                          </div>

                          <div className="flex flex-col items-center gap-1">
                            <button 
                              onClick={() => toggleFastStatus(p.id, 'sur_plateforme_nusuk', p.sur_plateforme_nusuk)} 
                              disabled={updatingId === p.id + 'sur_plateforme_nusuk'}
                              className={`w-5 h-5 rounded-full flex items-center justify-center transition-all duration-200 hover:scale-110 active:scale-90 ${p.sur_plateforme_nusuk ? 'bg-blue-500 shadow-lg shadow-blue-100' : 'bg-gray-200'}`}
                            >
                              {updatingId === p.id + 'sur_plateforme_nusuk' ? (
                                <Loader2 className="animate-spin text-white" size={10} />
                              ) : (
                                p.sur_plateforme_nusuk && <div className="w-2 h-2 bg-white rounded-full"></div>
                              )}
                            </button>
                            <span className="text-[8px] font-black text-gray-400 tracking-wide uppercase">Nusuk</span>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-5">
                        {role === 'admin' ? (
                          <span className="font-bold text-gray-900">{p.agences?.nom_agence}</span>
                        ) : (
                          <div className="w-56">
                            <div className="flex justify-between text-[10px] font-black uppercase mb-1">
                              <span className="text-blue-600 font-extrabold">{Math.round((p.total_paye / p.prix_package) * 100) || 0}%</span>
                            </div>
                            <div className="w-full bg-gray-100 h-2 rounded-full overflow-hidden mb-1">
                              <div className="h-full bg-blue-600 transition-all duration-500 ease-out" style={{ width: `${(p.total_paye / p.prix_package) * 100}%` }}></div>
                            </div>
                            <div className="flex justify-between text-xs font-bold text-slate-700 mt-1">
                              <span>{p.total_paye.toLocaleString()} F</span>
                              <span className="text-gray-400">/ {p.prix_package.toLocaleString()} F</span>
                            </div>
                          </div>
                        )}
                      </td>
                      <td className="px-6 py-5 text-right">
                        <Link 
                          href={`/hajj/pelerin/${p.id}`} 
                          className="inline-flex items-center px-5 py-2.5 bg-gray-900 text-white rounded-xl font-black text-xs hover:bg-blue-600 transition-all duration-200 hover:-translate-y-0.5 active:translate-y-0 active:scale-95 shadow-sm hover:shadow-md"
                        >
                          Détails
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </div>
  )
}