'use client'

import { useEffect, useState, startTransition } from 'react'
import { supabase } from '@/lib/supabase'
import { 
  Plane, 
  Users, 
  Calendar, 
  FileSpreadsheet, 
  Search, 
  CheckCircle2, 
  AlertTriangle, 
  UserPlus, 
  X, 
  Printer, 
  Clock,
  RefreshCw,
  Loader2
} from 'lucide-react'

// Types stricts basés sur ton infrastructure de base de données
type Vol = {
  id: string
  numero_vol: string
  compagnie: string
  date_depart: string
  heure_depart: string
  aeroport_depart: string
  aeroport_arrivee: string
  capacite_reservee: number
}

type Pelerin = {
  id: string
  prenom: string
  nom: string
  passport_num: string | null
  genre: 'M' | 'F'
  nationalite: string
  visa_obtenu: boolean
  vol_id: string | null
  agences?: { nom_agence: string } | null
}

export default function GestionVolsManifest() {
  const [vols, setVols] = useState<Vol[]>([])
  const [pelerins, setPelerins] = useState<Pelerin[]>([])
  const [selectedVol, setSelectedVol] = useState<Vol | null>(null)
  const [activeTab, setActiveTab] = useState<'affectation' | 'manifeste'>('affectation')
  
  // États de filtrage et chargement
  const [searchTerm, setSearchTerm] = useState('')
  const [filterUnassignedOnly, setFilterUnassignedOnly] = useState(true)
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetchDatabaseData()
  }, [])

  // Récupération des données réelles depuis Supabase
  async function fetchDatabaseData() {
    setLoading(true)
    setError(null)
    try {
      // 1. Récupération des vols
      const { data: volsData, error: volsError } = await supabase
        .from('vols')
        .select('*')
        .order('date_depart', { ascending: true })

      if (volsError) throw volsError

      // 2. Récupération des pèlerins avec jointure vers leur agence
      const { data: pelerinsData, error: pelerinsError } = await supabase
        .from('pelerins')
        .select('*, agences(nom_agence)')

      if (pelerinsError) throw pelerinsError

      setVols(volsData || [])
      setPelerins(pelerinsData || [])
      
      // Sélectionner automatiquement le premier vol s'il existe
      if (volsData && volsData.length > 0 && !selectedVol) {
        setSelectedVol(volsData[0])
      }
    } catch (err: any) {
      setError(err.message || "Erreur lors de la synchronisation avec Supabase")
    } finally {
      setLoading(false)
    }
  }

  // Affectation réelle en base de données
  async function assignerAuVol(pelerinId: string, volId: string) {
    setActionLoading(pelerinId)
    try {
      const { error: updateError } = await supabase
        .from('pelerins')
        .update({ vol_id: volId })
        .eq('id', pelerinId)

      if (updateError) throw updateError

      // Mise à jour optimiste de l'état local
      setPelerins(prev => prev.map(p => p.id === pelerinId ? { ...p, vol_id: volId } : p))
    } catch (err: any) {
      alert(`Erreur d'affectation : ${err.message}`)
    } finally {
      setActionLoading(null)
    }
  }

  // Retrait réel du vol en base de données (remise à null)
  async function retirerDuVol(pelerinId: string) {
    setActionLoading(pelerinId)
    try {
      const { error: updateError } = await supabase
        .from('pelerins')
        .update({ vol_id: null })
        .eq('id', pelerinId)

      if (updateError) throw updateError

      // Mise à jour optimiste de l'état local
      setPelerins(prev => prev.map(p => p.id === pelerinId ? { ...p, vol_id: null } : p))
    } catch (err: any) {
      alert(`Erreur de retrait : ${err.message}`)
    } finally {
      setActionLoading(null)
    }
  }

  // Calculs dynamiques basés sur les vraies données chargées
  const pelerinsDuVolActuel = pelerins.filter(p => p.vol_id === selectedVol?.id)
  
  const pelerinsFiltresDisponibles = pelerins.filter(p => {
    const matchesSearch = `${p.prenom} ${p.nom}`.toLowerCase().includes(searchTerm.toLowerCase()) || 
                          (p.agences?.nom_agence && p.agences.nom_agence.toLowerCase().includes(searchTerm.toLowerCase()))
    const matchesAssignment = filterUnassignedOnly ? !p.vol_id : true
    return matchesSearch && matchesAssignment
  })

  const getComptageVol = (volId: string) => pelerins.filter(p => p.vol_id === volId).length

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-slate-50 gap-3">
        <Loader2 className="w-10 h-10 text-blue-600 animate-spin" />
        <p className="text-sm font-bold text-gray-500">Synchronisation en temps réel avec ta base Supabase...</p>
      </div>
    )
  }

  return (
    <div className="p-4 md:p-8 bg-slate-50 min-h-screen space-y-6 print:bg-white print:p-0">
      
      {/* Messages d'erreur SQL/Supabase */}
      {error && (
        <div className="p-4 bg-red-50 border border-red-200 text-red-700 rounded-2xl flex items-center gap-3 text-sm font-semibold">
          <AlertTriangle className="shrink-0" />
          <span>{error}</span>
          <button onClick={fetchDatabaseData} className="ml-auto underline flex items-center gap-1">
            <RefreshCw size={14} /> Réessayer
          </button>
        </div>
      )}

      {/* HEADER DE LA PAGE */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b border-gray-200 pb-5 print:hidden">
        <div>
          <h1 className="text-xl md:text-2xl font-black text-gray-900 tracking-tight">Logistique des Vols & Manifestes</h1>
          <p className="text-xs md:text-sm text-gray-500 font-medium">Données synchronisées en direct. Affectations officielles pour l'aviation civile.</p>
        </div>
        <div className="flex gap-2 w-full md:w-auto">
          <button 
            onClick={fetchDatabaseData}
            className="p-2.5 bg-white text-gray-700 rounded-xl border border-gray-200 hover:bg-gray-50 transition-all shadow-sm"
            title="Forcer la resynchronisation"
          >
            <RefreshCw size={16} />
          </button>
          <button 
            onClick={() => window.print()}
            disabled={!selectedVol || pelerinsDuVolActuel.length === 0}
            className="flex-1 md:flex-none flex items-center justify-center gap-2 px-4 py-2.5 bg-gray-900 text-white font-bold text-xs md:text-sm rounded-xl shadow-sm hover:bg-gray-800 transition-all disabled:opacity-50"
          >
            <Printer size={16} /> Imprimer le Manifeste
          </button>
        </div>
      </div>

      {/* STATISTIQUES RÉELLES EN LIVE */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 print:hidden">
        <div className="bg-white p-4 rounded-2xl border border-gray-100 shadow-sm flex items-center gap-4">
          <div className="p-3 bg-blue-50 text-blue-600 rounded-xl"><Plane size={20} /></div>
          <div>
            <p className="text-[10px] uppercase font-bold text-gray-400">Vols Actifs</p>
            <p className="text-lg font-black text-gray-800">{vols.length}</p>
          </div>
        </div>
        <div className="bg-white p-4 rounded-2xl border border-gray-100 shadow-sm flex items-center gap-4">
          <div className="p-3 bg-emerald-50 text-emerald-600 rounded-xl"><Users size={20} /></div>
          <div>
            <p className="text-[10px] uppercase font-bold text-gray-400">Pèlerins Assignés</p>
            <p className="text-lg font-black text-emerald-600">{pelerins.filter(p => p.vol_id).length}</p>
          </div>
        </div>
        <div className="bg-white p-4 rounded-2xl border border-gray-100 shadow-sm flex items-center gap-4">
          <div className="p-3 bg-amber-50 text-amber-600 rounded-xl"><Clock size={20} /></div>
          <div>
            <p className="text-[10px] uppercase font-bold text-gray-400">Restants à Placer</p>
            <p className="text-lg font-black text-amber-600">{pelerins.filter(p => !p.vol_id).length}</p>
          </div>
        </div>
        <div className="bg-white p-4 rounded-2xl border border-gray-100 shadow-sm flex items-center gap-4">
          <div className="p-3 bg-red-50 text-red-600 rounded-xl"><AlertTriangle size={20} /></div>
          <div>
            <p className="text-[10px] uppercase font-bold text-gray-400">Bloqués (Sans Visa)</p>
            <p className="text-lg font-black text-red-500">{pelerins.filter(p => p.vol_id && !p.visa_obtenu).length}</p>
          </div>
        </div>
      </div>

      {/* ESPACE DE CONFIGURATION */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
        
        {/* COLONNE GAUCHE : TABLEAU DES VOLS */}
        <div className="space-y-4 lg:col-span-1 print:hidden">
          <h3 className="text-xs font-black text-gray-400 uppercase tracking-wider flex items-center gap-2">
            <Plane size={14} /> Vols Enregistrés en Base
          </h3>
          
          <div className="space-y-3">
            {vols.length === 0 ? (
              <div className="bg-white p-6 rounded-2xl text-center text-xs text-gray-400 font-bold border border-gray-100">
                Aucun vol trouvé dans la table `vols`.
              </div>
            ) : (
              vols.map((v) => {
                const estSelectionne = selectedVol?.id === v.id
                const totalAssignes = getComptageVol(v.id)
                const pourcentage = Math.round((totalAssignes / v.capacite_reservee) * 100)
                
                let jaugeColor = 'bg-blue-600'
                if (pourcentage >= 100) jaugeColor = 'bg-red-500'
                else if (pourcentage >= 85) jaugeColor = 'bg-amber-500'

                return (
                  <div 
                    key={v.id}
                    onClick={() => setSelectedVol(v)}
                    className={`p-4 rounded-2xl border transition-all cursor-pointer shadow-sm
                      ${estSelectionne 
                        ? 'bg-blue-600 border-blue-600 text-white shadow-md shadow-blue-100' 
                        : 'bg-white border-gray-100 hover:border-gray-300 text-gray-800'}`}
                  >
                    <div className="flex justify-between items-start">
                      <div>
                        <span className={`text-[10px] px-2 py-0.5 rounded-md font-black uppercase tracking-wider ${estSelectionne ? 'bg-white/20 text-white' : 'bg-blue-50 text-blue-700'}`}>
                          {v.numero_vol}
                        </span>
                        <p className="font-black text-sm mt-1">{v.compagnie}</p>
                      </div>
                      <p className={`text-xs font-bold ${estSelectionne ? 'text-blue-100' : 'text-gray-400'}`}>
                        {v.date_depart}
                      </p>
                    </div>

                    <div className="flex justify-between text-[11px] font-bold mt-4 mb-1">
                      <span className={estSelectionne ? 'text-blue-100' : 'text-gray-500'}>
                        {v.aeroport_depart} ➔ {v.aeroport_arrivee}
                      </span>
                      <span>{totalAssignes} / {v.capacite_reservee} Pax</span>
                    </div>

                    <div className={`w-full h-1.5 rounded-full mt-2 ${estSelectionne ? 'bg-white/20' : 'bg-gray-100'}`}>
                      <div 
                        className={`h-full rounded-full transition-all duration-300 ${estSelectionne ? 'bg-white' : jaugeColor}`} 
                        style={{ width: `${Math.min(pourcentage, 100)}%` }}
                      />
                    </div>
                  </div>
                )
              })
            )}
          </div>
        </div>

        {/* COLONNE DROITE : INTELLIGENCE ET MANIFESTE */}
        <div className="lg:col-span-2 space-y-4">
          
          {selectedVol ? (
            <>
              {/* SÉLECTEUR D'ONGLET */}
              <div className="flex bg-white p-1.5 rounded-xl border border-gray-200 shadow-sm print:hidden">
                <button
                  onClick={() => setActiveTab('affectation')}
                  className={`flex-1 flex items-center justify-center gap-2 py-2 px-4 rounded-lg font-bold text-xs md:text-sm transition-all
                    ${activeTab === 'affectation' ? 'bg-blue-50 text-blue-700' : 'text-gray-500 hover:bg-gray-50'}`}
                >
                  <UserPlus size={16} /> Affectation en Direct
                </button>
                <button
                  onClick={() => setActiveTab('manifeste')}
                  className={`flex-1 flex items-center justify-center gap-2 py-2 px-4 rounded-lg font-bold text-xs md:text-sm transition-all
                    ${activeTab === 'manifeste' ? 'bg-blue-50 text-blue-700' : 'text-gray-500 hover:bg-gray-50'}`}
                >
                  <FileSpreadsheet size={16} /> Manifeste Réglementaire
                </button>
              </div>

              {/* ONGLET 1 : COMPOSANT D'AFFECTATION */}
              {activeTab === 'affectation' && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 print:hidden">
                  
                  {/* Liste gauche : Pèlerins déjà sécurisés dans le vol */}
                  <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm space-y-4">
                    <div>
                      <h4 className="font-black text-xs uppercase text-gray-400 tracking-wider">Passagers assignés ({pelerinsDuVolActuel.length})</h4>
                      <p className="text-xs text-gray-900 font-bold">{selectedVol.numero_vol} ({selectedVol.compagnie})</p>
                    </div>

                    <div className="space-y-2 max-h-[450px] overflow-y-auto pr-1">
                      {pelerinsDuVolActuel.length === 0 ? (
                        <div className="text-center py-12 text-gray-400 text-xs font-medium">
                          Aucun passager enregistré sur ce vol.
                        </div>
                      ) : (
                        pelerinsDuVolActuel.map((p) => (
                          <div key={p.id} className="flex items-center justify-between p-3 bg-slate-50 rounded-xl border border-slate-100">
                            <div className="min-w-0 flex-1">
                              <p className="font-bold text-gray-800 text-xs truncate uppercase">{p.nom} {p.prenom}</p>
                              <div className="flex items-center gap-2 mt-0.5">
                                <span className="text-[9px] text-gray-400 font-bold truncate">{p.agences?.nom_agence || 'Pas d\'agence'}</span>
                                {!p.visa_obtenu && (
                                  <span className="flex items-center gap-0.5 text-[8px] font-black bg-red-50 text-red-600 px-1 rounded border border-red-100 shrink-0">
                                    PAS DE VISA
                                  </span>
                                )}
                              </div>
                            </div>
                            <button 
                              onClick={() => retirerDuVol(p.id)}
                              disabled={actionLoading === p.id}
                              className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors ml-2"
                            >
                              {actionLoading === p.id ? <Loader2 size={14} className="animate-spin text-red-500" /> : <X size={14} />}
                            </button>
                          </div>
                        ))
                      )}
                    </div>
                  </div>

                  {/* Liste droite : Pool total disponible en Base de données */}
                  <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm space-y-4">
                    <div className="space-y-2">
                      <h4 className="font-black text-xs uppercase text-gray-400 tracking-wider">Pèlerins Disponibles</h4>
                      
                      <div className="relative">
                        <Search className="absolute left-3 top-2.5 text-gray-400 w-4 h-4" />
                        <input
                          type="text"
                          placeholder="Filtrer par nom ou agence..."
                          value={searchTerm}
                          onChange={(e) => setSearchTerm(e.target.value)}
                          className="w-full pl-9 pr-4 py-1.5 bg-gray-50 border border-gray-200 rounded-xl font-medium text-xs outline-none focus:border-blue-500"
                        />
                      </div>

                      <label className="flex items-center gap-2 text-[10px] text-gray-500 font-bold cursor-pointer pt-1">
                        <input 
                          type="checkbox" 
                          checked={filterUnassignedOnly} 
                          onChange={(e) => setFilterUnassignedOnly(e.target.checked)}
                          className="rounded text-blue-600 focus:ring-0 w-3.5 h-3.5"
                        />
                        Afficher uniquement les pèlerins sans vol
                      </label>
                    </div>

                    <div className="space-y-2 max-h-[380px] overflow-y-auto pr-1">
                      {pelerinsFiltresDisponibles.length === 0 ? (
                        <div className="text-center py-12 text-gray-400 text-xs font-medium">
                          Aucun pèlerin disponible en base selon ces critères.
                        </div>
                      ) : (
                        pelerinsFiltresDisponibles.map((p) => {
                          const dejàSurCeVol = p.vol_id === selectedVol.id
                          if (dejàSurCeVol) return null

                          return (
                            <div key={p.id} className="flex items-center justify-between p-2.5 bg-white border border-gray-100 rounded-xl shadow-2xs">
                              <div className="min-w-0 flex-1">
                                <p className="font-bold text-gray-800 text-xs uppercase truncate">{p.nom} {p.prenom}</p>
                                <p className="text-[9px] text-gray-400 font-medium truncate">{p.agences?.nom_agence || 'Pas d\'agence'}</p>
                              </div>
                              
                              <button
                                onClick={() => assignerAuVol(p.id, selectedVol.id)}
                                disabled={actionLoading === p.id || getComptageVol(selectedVol.id) >= selectedVol.capacite_reservee}
                                className={`ml-2 flex items-center gap-1 px-2.5 py-1 rounded-lg font-black text-[10px] uppercase tracking-wide transition-all shrink-0
                                  ${p.visa_obtenu 
                                    ? 'bg-blue-50 text-blue-600 hover:bg-blue-600 hover:text-white' 
                                    : 'bg-amber-50 text-amber-700 hover:bg-amber-600 hover:text-white'}`}
                              >
                                {actionLoading === p.id ? (
                                  <Loader2 size={11} className="animate-spin" />
                                ) : (
                                  <>
                                    {!p.visa_obtenu && <AlertTriangle size={11} className="text-amber-500" />}
                                    Ajouter
                                  </>
                                )}
                              </button>
                            </div>
                          )
                        })
                      )}
                    </div>
                  </div>

                </div>
              )}

              {/* ONGLET 2 : LE MANIFESTE UNIVERSEL OFFICIEL (Aviation Civile) */}
              {activeTab === 'manifeste' && (
                <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm print:border-none print:shadow-none space-y-4">
                  
                  {/* Header visible à l'impression papier uniquement */}
                  <div className="hidden print:block text-center space-y-1 border-b border-gray-300 pb-4">
                    <h2 className="text-lg font-black uppercase tracking-wider">MANIFESTE OFFICIEL DE TRANSPORT PASAGERS</h2>
                    <p className="text-xs font-bold text-gray-500 uppercase tracking-widest">Généré via la Plateforme Numérique Hajj</p>
                    <div className="grid grid-cols-3 text-left text-[10px] font-mono bg-gray-50 p-3 rounded-xl mt-3 border border-gray-200">
                      <p><strong>N° VOL :</strong> {selectedVol.numero_vol}</p>
                      <p><strong>COMPAGNIE :</strong> {selectedVol.compagnie}</p>
                      <p><strong>DATE :</strong> {selectedVol.date_depart} à {selectedVol.heure_depart}</p>
                      <p className="col-span-3 mt-1"><strong>ITINÉRAIRE :</strong> {selectedVol.aeroport_depart} ➔ {selectedVol.aeroport_arrivee}</p>
                    </div>
                  </div>

                  <div className="flex justify-between items-center border-b border-gray-100 pb-2 print:hidden">
                    <div>
                      <h4 className="font-black text-xs uppercase text-gray-400 tracking-wider">Aperçu du Manifeste d'Embarquement</h4>
                      <p className="text-xs text-gray-500 font-medium">Tableau normalisé prêt pour l'exportation ou la douane.</p>
                    </div>
                  </div>

                  {/* Le Tableau du Manifeste */}
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead>
                        <tr className="bg-slate-900 text-white font-bold text-[10px] uppercase tracking-wider print:bg-gray-100 print:text-black">
                          <th className="p-2 border border-gray-200 text-center">N°</th>
                          <th className="p-2 border border-gray-200">Nom complet</th>
                          <th className="p-2 border border-gray-200">N° Passeport</th>
                          <th className="p-2 border border-gray-200 text-center">Genre</th>
                          <th className="p-2 border border-gray-200">Nationalité</th>
                          <th className="p-2 border border-gray-200 text-center">Statut Visa</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200 font-medium text-gray-700">
                        {pelerinsDuVolActuel.length === 0 ? (
                          <tr>
                            <td colSpan={6} className="p-8 text-center text-gray-400 font-bold">
                              Aucun passager enregistré sur ce manifeste.
                            </td>
                          </tr>
                        ) : (
                          pelerinsDuVolActuel.map((p, idx) => (
                            <tr key={p.id} className="hover:bg-slate-50 transition-colors">
                              <td className="p-2 border border-gray-200 text-center font-bold text-gray-900">{idx + 1}</td>
                              <td className="p-2 border border-gray-200 uppercase font-black">{p.nom} {p.prenom}</td>
                              <td className="p-2 border border-gray-200 font-mono font-bold text-gray-600">{p.passport_num || 'N/A'}</td>
                              <td className="p-2 border border-gray-200 text-center font-bold">{p.genre}</td>
                              <td className="p-2 border border-gray-200">{p.nationalite}</td>
                              <td className="p-2 border border-gray-200 text-center">
                                {p.visa_obtenu ? (
                                  <span className="text-emerald-600 font-bold text-[11px] print:text-black">VALIDE</span>
                                ) : (
                                  <span className="text-red-500 font-bold text-[11px] print:text-black underline decoration-red-500">NON ÉDITÉ</span>
                                )}
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>

                  {/* Signatures officielles à l'impression */}
                  <div className="hidden print:flex justify-between items-center text-[10px] font-bold text-gray-400 pt-10 border-t border-dashed border-gray-300 mt-10">
                    <p>Signature du Commandant / Autorité Aéroportuaire :</p>
                    <p>Fait le {new Date().toLocaleDateString('fr-FR')}</p>
                  </div>

                </div>
              )}
            </>
          ) : (
            <div className="bg-white p-12 rounded-2xl border border-gray-100 text-center text-gray-400 font-bold shadow-2xs">
              Aucun vol sélectionné à gauche. Crée un vol ou assure-toi que ta table `vols` contient des données.
            </div>
          )}

        </div>

      </div>

    </div>
  )
}