'use client'

import { useState, useEffect, useMemo } from 'react'
import { supabase } from '@/lib/supabase'
import { 
  Building2, 
  Users, 
  CheckCircle2, 
  Search, 
  Phone, 
  MapPin, 
  Loader2, 
  RefreshCw,
  ArrowRight,
  Layers,
  Calendar,
  ChevronRight,
  Filter
} from 'lucide-react'
import Link from 'next/link'

interface AgenceStat {
  id: string
  nom_agence: string
  code_agence: string
  telephone_agence: string
  adresse_agence: string
  groupement?: string | null
  created_at: string
  total_pelerins: number
  pelerins_gouv: number
}

export default function AdminAgencesList() {
  const [agences, setAgences] = useState<AgenceStat[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [selectedGroupement, setSelectedGroupement] = useState<string>('ALL')

  const fetchAgencesStats = async () => {
    setLoading(true)

    // 1. Récupération des agences (avec la colonne groupement)
    const { data: agencesData, error: agencesError } = await supabase
      .from('agences')
      .select('*')
      .order('nom_agence', { ascending: true })

    if (agencesError) {
      console.error('Erreur agences:', agencesError)
      setLoading(false)
      return
    }

    // 2. Récupération des pèlerins avec la colonne de validation GOUV
    const { data: pelerinsData, error: pelerinsError } = await supabase
      .from('pelerins')
      .select('agence_id, sur_plateforme_gouv')

    if (pelerinsError) {
      console.error('Erreur pèlerins:', pelerinsError)
    }

    // 3. Agrégation des statistiques par agence
    const statsMap: Record<string, { total: number; gouv: number }> = {}

    if (pelerinsData) {
      pelerinsData.forEach((p) => {
        if (!p.agence_id) return
        if (!statsMap[p.agence_id]) {
          statsMap[p.agence_id] = { total: 0, gouv: 0 }
        }
        statsMap[p.agence_id].total += 1
        if (p.sur_plateforme_gouv) {
          statsMap[p.agence_id].gouv += 1
        }
      })
    }

    // Combine les données agences avec leurs statistiques
    const formattedAgences: AgenceStat[] = (agencesData || []).map((ag) => ({
      ...ag,
      total_pelerins: statsMap[ag.id]?.total || 0,
      pelerins_gouv: statsMap[ag.id]?.gouv || 0
    }))

    setAgences(formattedAgences)
    setLoading(false)
  }

  useEffect(() => {
    fetchAgencesStats()

    const channel = supabase
      .channel('admin_agences_realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pelerins' }, () => {
        fetchAgencesStats()
      })
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [])

  // Extraire la liste unique des groupements enregistrés dans la BDD
  const groupementsList = useMemo(() => {
    const list = agences
      .map((ag) => ag.groupement?.trim())
      .filter((g): g is string => Boolean(g))
    return Array.from(new Set(list)).sort()
  }, [agences])

  // Filtrage combiné (recherche textuelle + filtre de groupement)
  const agencesFiltrees = useMemo(() => {
    return agences.filter((ag) => {
      const q = search.toLowerCase()
      const matchesSearch =
        ag.nom_agence?.toLowerCase().includes(q) ||
        ag.code_agence?.toLowerCase().includes(q) ||
        ag.groupement?.toLowerCase().includes(q)

      const matchesGroupement =
        selectedGroupement === 'ALL'
          ? true
          : selectedGroupement === 'NONE'
          ? !ag.groupement
          : ag.groupement === selectedGroupement

      return matchesSearch && matchesGroupement
    })
  }, [agences, search, selectedGroupement])

  // Totaux globaux
  const totalInscritsPlateforme = agences.reduce((acc, curr) => acc + curr.total_pelerins, 0)
  const totalValidesGouv = agences.reduce((acc, curr) => acc + curr.pelerins_gouv, 0)

  if (loading) {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-3 bg-slate-50">
        <Loader2 className="animate-spin text-indigo-600" size={38} />
        <p className="text-xs font-black uppercase tracking-widest text-slate-400">Chargement des agences...</p>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-4 md:p-8 bg-slate-50/50 min-h-screen">
      
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-white p-6 rounded-3xl border border-slate-200/80 shadow-sm">
        <div>
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse"></span>
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Maison du Hajj</p>
          </div>
          <h1 className="text-xl md:text-2xl font-black text-slate-900 tracking-tight mt-0.5">
            Agences & Groupements Partenaires
          </h1>
        </div>

        <button
          onClick={fetchAgencesStats}
          className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-2xl flex items-center gap-2 transition-all active:scale-95"
        >
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          Actualiser
        </button>
      </div>

      {/* Cartes de synthèse de haut de page */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white p-5 rounded-3xl border border-slate-200/80 shadow-sm flex items-center gap-4">
          <div className="p-3.5 bg-indigo-50 text-indigo-600 rounded-2xl shrink-0">
            <Building2 size={26} />
          </div>
          <div>
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Agences Actives</p>
            <p className="text-2xl font-black text-slate-900">{agences.length}</p>
          </div>
        </div>

        <div className="bg-white p-5 rounded-3xl border border-slate-200/80 shadow-sm flex items-center gap-4">
          <div className="p-3.5 bg-slate-100 text-slate-700 rounded-2xl shrink-0">
            <Users size={26} />
          </div>
          <div>
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Pèlerins Enregistrés</p>
            <p className="text-2xl font-black text-slate-900">{totalInscritsPlateforme}</p>
          </div>
        </div>

        <div className="bg-white p-5 rounded-3xl border border-slate-200/80 shadow-sm flex items-center gap-4">
          <div className="p-3.5 bg-emerald-50 text-emerald-600 rounded-2xl shrink-0">
            <CheckCircle2 size={26} />
          </div>
          <div>
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Inscrits GOUV Validés</p>
            <p className="text-2xl font-black text-emerald-600">{totalValidesGouv}</p>
          </div>
        </div>
      </div>

      {/* Zone de Recherche et Filtres par Groupement */}
      <div className="bg-white p-4 rounded-3xl border border-slate-200/80 shadow-sm space-y-4">
        <div className="flex items-center gap-3 bg-slate-50 px-4 py-2.5 rounded-2xl border border-slate-200/60 focus-within:border-indigo-500 focus-within:bg-white transition-all">
          <Search className="text-slate-400 shrink-0" size={18} />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Rechercher une agence, un code ou un groupement..."
            className="w-full bg-transparent text-sm font-semibold text-slate-800 outline-none placeholder:text-slate-400"
          />
        </div>

        {/* Filtres Groupement (Onglets) */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1 pt-1 scrollbar-none">
          <span className="flex items-center gap-1 text-[11px] font-black uppercase text-slate-400 shrink-0 mr-1">
            <Filter size={12} /> Groupement :
          </span>

          <button
            onClick={() => setSelectedGroupement('ALL')}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all shrink-0 ${
              selectedGroupement === 'ALL'
                ? 'bg-slate-900 text-white shadow-sm'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            Tous ({agences.length})
          </button>

          {groupementsList.map((grp) => {
            const count = agences.filter((a) => a.groupement === grp).length
            return (
              <button
                key={grp}
                onClick={() => setSelectedGroupement(grp)}
                className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all shrink-0 flex items-center gap-1.5 ${
                  selectedGroupement === grp
                    ? 'bg-indigo-600 text-white shadow-sm'
                    : 'bg-indigo-50 text-indigo-700 hover:bg-indigo-100'
                }`}
              >
                <Layers size={12} />
                <span>{grp}</span>
                <span className={`px-1.5 py-0.5 rounded-md text-[10px] font-black ${
                  selectedGroupement === grp ? 'bg-white/20 text-white' : 'bg-indigo-200/60 text-indigo-800'
                }`}>
                  {count}
                </span>
              </button>
            )
          })}

          <button
            onClick={() => setSelectedGroupement('NONE')}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all shrink-0 ${
              selectedGroupement === 'NONE'
                ? 'bg-amber-600 text-white shadow-sm'
                : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
            }`}
          >
            Sans groupement
          </button>
        </div>
      </div>

      {/* Grille de Cartes Agences */}
      {agencesFiltrees.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {agencesFiltrees.map((agence) => {
            const tauxGouv = agence.total_pelerins > 0 
              ? Math.round((agence.pelerins_gouv / agence.total_pelerins) * 100) 
              : 0

            return (
              <div 
                key={agence.id} 
                className="bg-white rounded-3xl border border-slate-200/80 shadow-sm hover:shadow-md transition-all duration-200 flex flex-col justify-between overflow-hidden group"
              >
                {/* En-tête de la Carte */}
                <div className="p-5 space-y-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 rounded-2xl bg-indigo-50 text-indigo-600 font-black flex items-center justify-center text-sm uppercase shrink-0 border border-indigo-100 group-hover:bg-indigo-600 group-hover:text-white transition-colors">
                        {agence.nom_agence?.substring(0, 2) || 'AG'}
                      </div>
                      <div>
                        <Link 
                          href={`/hajj/admin/agences2/${agence.id}`}
                          className="font-black text-slate-900 group-hover:text-indigo-600 transition-colors line-clamp-1 text-base"
                          title={agence.nom_agence}
                        >
                          {agence.nom_agence}
                        </Link>
                        <span className="inline-block px-2.5 py-0.5 bg-slate-100 text-slate-600 rounded-md text-[11px] font-mono font-bold mt-1">
                          CODE: {agence.code_agence || 'N/A'}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Groupement Tag */}
                  <div className="pt-1">
                    {agence.groupement ? (
                      <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-indigo-50 text-indigo-700 border border-indigo-100 rounded-xl text-xs font-extrabold">
                        <Layers size={13} className="text-indigo-500" />
                        <span>Groupement : {agence.groupement}</span>
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 bg-slate-100 text-slate-400 rounded-lg text-[11px] font-semibold italic">
                        Indépendant (Aucun groupement)
                      </span>
                    )}
                  </div>

                  {/* Coordonnées */}
                  <div className="space-y-1.5 pt-2 border-t border-slate-100 text-xs font-medium text-slate-600">
                    <div className="flex items-center gap-2">
                      <Phone size={13} className="text-slate-400 shrink-0" />
                      <span className="truncate">{agence.telephone_agence || 'Téléphone non renseigné'}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <MapPin size={13} className="text-slate-400 shrink-0" />
                      <span className="truncate">{agence.adresse_agence || 'Adresse non renseignée'}</span>
                    </div>
                  </div>
                </div>

                {/* Section Statistiques & Actions en bas de carte */}
                <div className="bg-slate-50/70 p-4 border-t border-slate-100 space-y-3">
                  
                  {/* Boutons d'accès rapide avec compteurs */}
                  <div className="grid grid-cols-2 gap-2">
                    
                    {/* Total Pèlerins Saisis */}
                    <Link
                      href={`/hajj/admin/agences2/${agence.id}`}
                      className="flex flex-col justify-between p-2.5 bg-white border border-slate-200/80 rounded-2xl hover:border-indigo-300 transition-all group/btn shadow-2xs"
                    >
                      <span className="text-[9px] font-black uppercase text-slate-400 tracking-wider">Total Saisis</span>
                      <div className="flex items-center justify-between mt-1">
                        <span className="text-base font-black text-slate-900">{agence.total_pelerins}</span>
                        <ChevronRight size={14} className="text-slate-400 group-hover/btn:translate-x-0.5 transition-transform" />
                      </div>
                    </Link>

                    {/* Validés GOUV */}
                    <Link
                      href={`/hajj/admin/agences2/${agence.id}/pelerins-gouv`}
                      className="flex flex-col justify-between p-2.5 bg-emerald-50/50 border border-emerald-200/60 rounded-2xl hover:bg-emerald-100/50 transition-all group/btn shadow-2xs"
                    >
                      <span className="text-[9px] font-black uppercase text-emerald-700 tracking-wider">Validés GOUV</span>
                      <div className="flex items-center justify-between mt-1">
                        <span className="text-base font-black text-emerald-700">{agence.pelerins_gouv}</span>
                        <ArrowRight size={14} className="text-emerald-600 group-hover/btn:translate-x-0.5 transition-transform" />
                      </div>
                    </Link>

                  </div>

                  {/* Barre de progression GOUV */}
                  {agence.total_pelerins > 0 && (
                    <div className="space-y-1 pt-1">
                      <div className="flex justify-between items-center text-[10px] font-black text-slate-500">
                        <span>Progression GOUV</span>
                        <span>{tauxGouv}%</span>
                      </div>
                      <div className="w-full bg-slate-200 rounded-full h-1.5 overflow-hidden">
                        <div 
                          className="bg-emerald-500 h-1.5 rounded-full transition-all duration-500" 
                          style={{ width: `${tauxGouv}%` }}
                        ></div>
                      </div>
                    </div>
                  )}

                  {/* Footer Date de création */}
                  <div className="flex items-center justify-between text-[10px] font-semibold text-slate-400 pt-1">
                    <span className="flex items-center gap-1">
                      <Calendar size={11} />
                      Créée le : {agence.created_at ? new Date(agence.created_at).toLocaleDateString('fr-FR') : '-'}
                    </span>
                  </div>

                </div>
              </div>
            )
          })}
        </div>
      ) : (
        <div className="bg-white rounded-3xl border border-slate-200 p-12 text-center space-y-3">
          <Building2 className="mx-auto text-slate-300" size={48} />
          <p className="text-sm font-black text-slate-700 uppercase tracking-wider">Aucune agence trouvée</p>
          <p className="text-xs text-slate-400">Essayez de modifier votre recherche ou vos filtres de groupement.</p>
        </div>
      )}

    </div>
  )
}