'use client'

import { useState, useEffect, use } from 'react'
import { supabase } from '@/lib/supabase'
import { Loader2, ArrowLeft, Building2, Phone, MapPin, CheckCircle2, Search, Users, ArrowRight, RefreshCw, Globe, Trash2 } from 'lucide-react'
import Link from 'next/link'

export default function AgencePelerinsPage({ params }: { params: Promise<{ id: string }> }) {
  // Dépaquetage des paramètres d'URL (Next.js 15+)
  const resolvedParams = use(params)
  const agenceId = resolvedParams.id

  const [agence, setAgence] = useState<any>(null)
  const [pelerins, setPelerins] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [updatingId, setUpdatingId] = useState<string | null>(null)

  useEffect(() => {
    const fetchAgencePelerins = async () => {
      setLoading(true)

      // 1. Informations sur l'agence
      const { data: agenceData } = await supabase
        .from('agences')
        .select('*')
        .eq('id', agenceId)
        .single()

      // 2. Liste de TOUS les pèlerins de cette agence
      const { data: pelerinsData, error } = await supabase
        .from('pelerins')
        .select('*')
        .eq('agence_id', agenceId)
        .order('created_at', { ascending: false })

      if (error) {
        console.error('Erreur chargement pèlerins:', error)
      }

      setAgence(agenceData)
      setPelerins(pelerinsData || [])
      setLoading(false)
    }

    if (agenceId) {
      fetchAgencePelerins()
    }
  }, [agenceId])

  const toggleStatus = async (pelerinId: string, field: 'sur_plateforme_gouv' | 'sur_plateforme_nusuk', value: boolean) => {
    setUpdatingId(pelerinId + field)
    try {
      const updatePayload: Record<string, unknown> = { [field]: value }
      if (field === 'sur_plateforme_gouv') {
        updatePayload.hajj_session_id = value ? null : null
      }
      const { error } = await supabase.from('pelerins').update(updatePayload).eq('id', pelerinId)
      if (!error) {
        setPelerins(prev => prev.map((p) => p.id === pelerinId ? { ...p, [field]: value } : p))
      }
    } finally {
      setUpdatingId(null)
    }
  }

  // Filtrage local par nom, prénom ou passeport
  const pelerinsFiltres = pelerins.filter((p) => {
    const query = search.toLowerCase()
    return (
      p.nom_complet?.toLowerCase().includes(query) ||
      p.prenom?.toLowerCase().includes(query) ||
      p.num_passeport?.toLowerCase().includes(query)
    )
  })

  // Statistiques rapides
  const stats = {
    total: pelerins.length,
    gouv: pelerins.filter(p => p.sur_plateforme_gouv).length,
    nusuk: pelerins.filter(p => p.sur_plateforme_nusuk).length,
    avecDocument: pelerins.filter(p => p.document_url).length,
    avecPaiement: pelerins.filter(p => (p.total_paye ?? 0) > 0).length,
  }

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-gray-50">
        <Loader2 className="animate-spin text-blue-600" size={36} />
      </div>
    )
  }

  return (
    <div className="max-w-7xl mx-auto p-6 space-y-6">
      
      {/* Bouton Retour */}
      <Link
        href="/hajj/admin/agences2"
        className="inline-flex items-center gap-2 text-xs font-black uppercase text-gray-500 hover:text-gray-900 transition-colors"
      >
        <ArrowLeft size={16} /> Retour à la liste des agences
      </Link>

      {/* Cartouche d'en-tête de l'agence */}
      {agence && (
        <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-2xl bg-blue-50 text-blue-600 font-black flex items-center justify-center text-lg uppercase">
              {agence.nom_agence?.substring(0, 2) || 'AG'}
            </div>
            <div>
              <h1 className="text-xl font-black text-gray-900 uppercase tracking-tight">
                {agence.nom_agence}
              </h1>
              <div className="flex items-center gap-4 mt-1 text-xs text-gray-500 font-medium">
                <span className="flex items-center gap-1">
                  <Phone size={12} /> {agence.telephone_agence || 'N/A'}
                </span>
                <span className="flex items-center gap-1">
                  <MapPin size={12} /> {agence.adresse_agence || 'N/A'}
                </span>
              </div>
            </div>
          </div>

          <div className="px-4 py-2 bg-gray-100 rounded-2xl text-xs font-black text-gray-700 font-mono">
            CODE: {agence.code_agence || 'N/A'}
          </div>
        </div>
      )}

      {/* Cartes de statistiques rapides */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <div className="bg-white p-4 rounded-2xl border border-gray-100 shadow-sm">
          <p className="text-[9px] font-black text-gray-400 uppercase tracking-wider mb-1">Total</p>
          <p className="text-2xl font-black text-gray-900">{stats.total}</p>
        </div>
        <div className="bg-white p-4 rounded-2xl border border-gray-100 shadow-sm">
          <p className="text-[9px] font-black text-emerald-600 uppercase tracking-wider mb-1">GOUV ✓</p>
          <p className="text-2xl font-black text-emerald-600">{stats.gouv}</p>
        </div>
        <div className="bg-white p-4 rounded-2xl border border-gray-100 shadow-sm">
          <p className="text-[9px] font-black text-purple-600 uppercase tracking-wider mb-1">Nusuk ✓</p>
          <p className="text-2xl font-black text-purple-600">{stats.nusuk}</p>
        </div>
        <div className="bg-white p-4 rounded-2xl border border-gray-100 shadow-sm">
          <p className="text-[9px] font-black text-blue-600 uppercase tracking-wider mb-1">Dossiers</p>
          <p className="text-2xl font-black text-blue-600">{stats.avecDocument}</p>
        </div>
        <div className="bg-white p-4 rounded-2xl border border-gray-100 shadow-sm">
          <p className="text-[9px] font-black text-cyan-600 uppercase tracking-wider mb-1">Payés</p>
          <p className="text-2xl font-black text-cyan-600">{stats.avecPaiement}</p>
        </div>
      </div>

      {/* Barre de Recherche */}
      <div className="bg-white p-4 rounded-3xl border border-gray-100 shadow-sm flex items-center gap-3">
        <Search className="text-gray-400 ml-2" size={20} />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Rechercher par prénom, nom ou N° Passeport..."
          className="w-full bg-transparent text-sm font-bold text-gray-900 outline-none placeholder:text-gray-400 placeholder:font-normal"
        />
      </div>

      {/* Bouton accès filtré GOUV */}
      <div className="bg-emerald-50 border border-emerald-200 p-4 rounded-2xl flex items-center justify-between">
        <div className="flex items-center gap-3">
          <CheckCircle2 size={20} className="text-emerald-600" />
          <div>
            <p className="text-xs font-black text-emerald-900 uppercase">Filtrer par Plateforme GOUV</p>
            <p className="text-[10px] text-emerald-700 font-semibold">{stats.gouv} pèlerin(s) inscrits sur GOUV</p>
          </div>
        </div>
        <Link
          href={`/hajj/admin/agences2/${agenceId}/pelerins-gouv`}
          className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-black flex items-center gap-2 transition-all"
        >
          Voir <ArrowRight size={12} />
        </Link>
      </div>

      {/* Tableau de TOUS les Pèlerins */}
      <div className="bg-white rounded-3xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="p-5 border-b border-gray-100 flex justify-between items-center bg-gray-50">
          <div className="flex items-center gap-2">
            <Users size={18} className="text-gray-600" />
            <h2 className="text-sm font-black text-gray-900 uppercase">
              Tous les Pèlerins ({pelerinsFiltres.length})
            </h2>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100 text-[10px] font-black text-gray-400 uppercase tracking-wider">
                <th className="p-4">Identité du Pèlerin</th>
                <th className="p-4">N° Passeport</th>
                <th className="p-4">Téléphone</th>
                <th className="p-4 text-center">Statut</th>
                <th className="p-4 text-center">GOUV</th>
                <th className="p-4 text-center">Nusuk</th>
                <th className="p-4 text-right">Date</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 text-sm font-bold text-gray-800">
              {pelerinsFiltres.length > 0 ? (
                pelerinsFiltres.map((pelerin) => (
                  <tr key={pelerin.id} className="hover:bg-gray-50/50 transition-colors">
                    
                    {/* Nom & Prénom */}
                    <td className="p-4">
                      <div>
                        <p className="font-black text-gray-900 uppercase">
                          {pelerin.prenom} {pelerin.nom_complet}
                        </p>
                        <p className="text-[10px] text-gray-400 font-semibold">
                          {pelerin.telephone_pelerin || 'Pas de numéro'}
                        </p>
                      </div>
                    </td>

                    {/* Passeport */}
                    <td className="p-4 font-mono text-xs text-gray-700">
                      {pelerin.num_passeport || 'N/A'}
                    </td>

                    {/* Téléphone */}
                    <td className="p-4 text-xs text-gray-600">
                      {pelerin.telephone_pelerin || 'Non renseigné'}
                    </td>

                    {/* Badge Paiement */}
                    <td className="p-4 text-center">
                      {(pelerin.total_paye ?? 0) > 0 ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-emerald-100 text-emerald-800 rounded-full text-xs font-black">
                          ✓ Payé
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-red-100 text-red-800 rounded-full text-xs font-black">
                          ✗ Impayé
                        </span>
                      )}
                    </td>

                    {/* GOUV */}
                    <td className="p-4 text-center">
                      {pelerin.sur_plateforme_gouv ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-emerald-100 text-emerald-800 rounded-full text-xs font-black">
                          ✓
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-gray-100 text-gray-600 rounded-full text-xs font-black">
                          —
                        </span>
                      )}
                    </td>

                    {/* Nusuk */}
                    <td className="p-4 text-center">
                      {pelerin.sur_plateforme_nusuk ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-purple-100 text-purple-800 rounded-full text-xs font-black">
                          ✓
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-gray-100 text-gray-600 rounded-full text-xs font-black">
                          —
                        </span>
                      )}
                    </td>

                    {/* Actions */}
                    <td className="p-4 text-right">
                      <div className="flex items-center justify-end gap-2 flex-wrap">
                        <button
                          onClick={() => toggleStatus(pelerin.id, 'sur_plateforme_gouv', !pelerin.sur_plateforme_gouv)}
                          disabled={updatingId === pelerin.id + 'sur_plateforme_gouv'}
                          className="inline-flex items-center gap-1.5 px-2.5 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 rounded-full text-[10px] font-black transition-all disabled:opacity-60"
                        >
                          {updatingId === pelerin.id + 'sur_plateforme_gouv' ? <Loader2 size={10} className="animate-spin" /> : pelerin.sur_plateforme_gouv ? <Trash2 size={10} /> : <CheckCircle2 size={10} />}
                          {pelerin.sur_plateforme_gouv ? 'Retirer Gouv' : 'Ajouter Gouv'}
                        </button>
                        <button
                          onClick={() => toggleStatus(pelerin.id, 'sur_plateforme_nusuk', !pelerin.sur_plateforme_nusuk)}
                          disabled={updatingId === pelerin.id + 'sur_plateforme_nusuk'}
                          className="inline-flex items-center gap-1.5 px-2.5 py-1.5 bg-purple-50 hover:bg-purple-100 text-purple-700 rounded-full text-[10px] font-black transition-all disabled:opacity-60"
                        >
                          {updatingId === pelerin.id + 'sur_plateforme_nusuk' ? <Loader2 size={10} className="animate-spin" /> : <Globe size={10} />}
                          {pelerin.sur_plateforme_nusuk ? 'Retirer Nusuk' : 'Ajouter Nusuk'}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={7} className="p-10 text-center text-gray-400 text-xs font-bold uppercase">
                    Aucun pèlerin trouvé pour cette agence
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

    </div>
  )
}
