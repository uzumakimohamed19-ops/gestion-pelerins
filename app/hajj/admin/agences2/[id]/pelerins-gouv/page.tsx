'use client'

import { useState, useEffect, use } from 'react'
import { supabase } from '@/lib/supabase'
import { Loader2, ArrowLeft, Building2, Phone, MapPin, CheckCircle2, Search, ArrowRight, Eye, RefreshCw, Globe, Trash2 } from 'lucide-react'
import Link from 'next/link'

export default function AgencePelerinsGouvPage({ params }: { params: Promise<{ id: string }> }) {
  // Dépaquetage des paramètres d'URL (Next.js 15+)
  const resolvedParams = use(params)
  const agenceId = resolvedParams.id

  const [agence, setAgence] = useState<any>(null)
  const [pelerins, setPelerins] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [updatingId, setUpdatingId] = useState<string | null>(null)

  useEffect(() => {
    const fetchGouvPelerins = async () => {
      setLoading(true)

      // 1. Informations sur l'agence
      const { data: agenceData } = await supabase
        .from('agences')
        .select('*')
        .eq('id', agenceId)
        .single()

      // 2. Liste UNIQUEMENT des pèlerins inscrits sur GOUV pour cette agence
      const { data: pelerinsData, error } = await supabase
        .from('pelerins')
        .select('*')
        .eq('agence_id', agenceId)
        .eq('sur_plateforme_gouv', true)
        .order('created_at', { ascending: false })

      if (error) {
        console.error('Erreur chargement pèlerins GOUV:', error)
      }

      setAgence(agenceData)
      setPelerins(pelerinsData || [])
      setLoading(false)
    }

    if (agenceId) {
      fetchGouvPelerins()
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
        href={`/hajj/admin/agences2/${agenceId}`}
        className="inline-flex items-center gap-2 text-xs font-black uppercase text-gray-500 hover:text-gray-900 transition-colors"
      >
        <ArrowLeft size={16} /> Retour à la liste de l'agence
      </Link>

      {/* Cartouche d'en-tête de l'agence */}
      {agence && (
        <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-2xl bg-emerald-50 text-emerald-600 font-black flex items-center justify-center text-lg uppercase">
              {agence.nom_agence?.substring(0, 2) || 'AG'}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-black text-gray-900 uppercase tracking-tight">
                  {agence.nom_agence}
                </h1>
                <span className="px-2.5 py-0.5 bg-emerald-100 text-emerald-800 rounded-full text-[10px] font-black uppercase">
                  GOUV Validés
                </span>
              </div>
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

      {/* Barre de Recherche */}
      <div className="bg-white p-4 rounded-3xl border border-gray-100 shadow-sm flex items-center gap-3">
        <Search className="text-gray-400 ml-2" size={20} />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Rechercher par prénom, nom, NINA ou N° Passeport..."
          className="w-full bg-transparent text-sm font-bold text-gray-900 outline-none placeholder:text-gray-400 placeholder:font-normal"
        />
      </div>

      {/* Tableau des Pèlerins Inscrits sur GOUV */}
      <div className="bg-white rounded-3xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="p-5 border-b border-gray-100 flex justify-between items-center bg-emerald-50/30">
          <div className="flex items-center gap-2">
            <CheckCircle2 size={18} className="text-emerald-600" />
            <h2 className="text-sm font-black text-gray-900 uppercase">
              Pèlerins inscrits sur la plateforme GOUV ({pelerinsFiltres.length})
            </h2>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100 text-[10px] font-black text-gray-400 uppercase tracking-wider">
                <th className="p-4">Identité</th>
                <th className="p-4">N° Passeport</th>
                <th className="p-4">Téléphone</th>
                <th className="p-4">Date Naissance</th>
                <th className="p-4">Sexe</th>
                <th className="p-4 text-center">Nusuk</th>
                <th className="p-4 text-center">Dossier</th>
                <th className="p-4 text-center">Action</th>
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
                        <p className="text-[10px] text-gray-400 font-bold mt-0.5">
                          {pelerin.num_passeport || 'Pas de passeport'}
                        </p>
                      </div>
                    </td>

                    {/* Passeport */}
                    <td className="p-4 font-mono text-xs text-gray-700">
                      {pelerin.num_passeport || '—'}
                    </td>

                    {/* Téléphone */}
                    <td className="p-4 text-xs text-gray-600">
                      {pelerin.telephone_pelerin || '—'}
                    </td>

                    {/* Date Naissance */}
                    <td className="p-4 text-xs text-gray-600">
                      {pelerin.date_naissance ? new Date(pelerin.date_naissance).toLocaleDateString('fr-FR') : '—'}
                    </td>

                    {/* Sexe */}
                    <td className="p-4 text-xs text-gray-600">
                      {pelerin.sexe || pelerin.genre || '—'}
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

                    {/* Dossier */}
                    <td className="p-4 text-center">
                      {pelerin.document_url ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-emerald-100 text-emerald-800 rounded-full text-xs font-black">
                          ✓
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-red-100 text-red-800 rounded-full text-xs font-black">
                          ✗
                        </span>
                      )}
                    </td>

                    {/* Actions */}
                    <td className="p-4 text-center">
                      <div className="flex items-center justify-center gap-2 flex-wrap">
                        <button
                          onClick={() => toggleStatus(pelerin.id, 'sur_plateforme_gouv', false)}
                          disabled={updatingId === pelerin.id + 'sur_plateforme_gouv'}
                          className="inline-flex items-center gap-1.5 px-2.5 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 rounded-full text-[10px] font-black transition-all disabled:opacity-60"
                        >
                          {updatingId === pelerin.id + 'sur_plateforme_gouv' ? <Loader2 size={10} className="animate-spin" /> : <Trash2 size={10} />}
                          Retirer Gouv
                        </button>
                        <button
                          onClick={() => toggleStatus(pelerin.id, 'sur_plateforme_nusuk', !pelerin.sur_plateforme_nusuk)}
                          disabled={updatingId === pelerin.id + 'sur_plateforme_nusuk'}
                          className="inline-flex items-center gap-1.5 px-2.5 py-1.5 bg-purple-50 hover:bg-purple-100 text-purple-700 rounded-full text-[10px] font-black transition-all disabled:opacity-60"
                        >
                          {updatingId === pelerin.id + 'sur_plateforme_nusuk' ? <Loader2 size={10} className="animate-spin" /> : <Globe size={10} />}
                          {pelerin.sur_plateforme_nusuk ? 'Retirer Nusuk' : 'Ajouter Nusuk'}
                        </button>
                        <Link
                          href={`/hajj/admin/agences2/${agenceId}/pelerins-gouv/${pelerin.id}`}
                          className="inline-flex items-center gap-1.5 px-2.5 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-full text-[10px] font-black transition-all hover:scale-105"
                          title="Voir le profil complet du pèlerin"
                        >
                          <Eye size={10} /> Profil
                        </Link>
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={8} className="p-10 text-center text-gray-400 text-xs font-bold uppercase">
                    Aucun pèlerin validé GOUV trouvé pour cette agence
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