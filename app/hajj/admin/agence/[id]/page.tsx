'use client'
import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation' 
import { supabase } from '@/lib/supabase'
import { Search, Globe, ShieldCheck, Eye, CreditCard, AlertCircle, ArrowLeft } from 'lucide-react'
import Link from 'next/link'

export default function ListeAdminPelerins() {
  const { id } = useParams()
  const [pelerins, setPelerins] = useState<any[]>([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function fetchPelerins() {
      setLoading(true)
      setError(null)
      
      try {
        let query = supabase
          .from('pelerins')
          .select('*')

        if (id) {
          query = query.eq('agence_id', id) 
        }

        const { data, error: sbError } = await query.order('nom_complet', { ascending: true })
        
        if (sbError) throw sbError

        setPelerins(data || [])
      } catch (err: any) {
        console.error("Erreur de récupération:", err.message)
        setError(err.message)
      } finally {
        setLoading(false)
      }
    }

    fetchPelerins()
  }, [id])

  const toggleStatus = async (pelerinId: string, field: 'sur_plateforme_gouv' | 'sur_plateforme_nusuk', value: boolean) => {
    try {
      const { error } = await supabase
        .from('pelerins')
        .update({ [field]: value })
        .eq('id', pelerinId)

      if (error) {
        console.error('Erreur de mise à jour', error)
        return
      }

      setPelerins(prev => prev.map(p => p.id === pelerinId ? { ...p, [field]: value } : p))
    } catch (err) {
      console.error('Erreur toggleStatus', err)
    }
  }

  const filtered = pelerins.filter(p => 
    p.nom_complet?.toLowerCase().includes(search.toLowerCase()) ||
    p.num_passeport?.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      
      {/* BOUTON RETOUR VERS ADMIN PANEL */}
      <Link 
        href="/hajj/admin" 
        className="inline-flex items-center gap-2 text-gray-400 hover:text-blue-600 font-bold text-[10px] uppercase tracking-[0.2em] mb-6 transition-colors group"
      >
        <ArrowLeft size={16} className="group-hover:-translate-x-1 transition-transform" />
        Retour au réseau
      </Link>

      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-10">
        <div>
          <h1 className="text-4xl font-black text-gray-900 tracking-tight uppercase">Liste Agence</h1>
          <p className="text-gray-500 font-bold mt-1 text-xs uppercase tracking-[0.15em]">
            {loading ? 'Chargement...' : `${filtered.length} Pèlerin(s) enregistré(s)`}
          </p>
        </div>
        
        <div className="relative group">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
          <input 
            type="text"
            placeholder="Rechercher..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-12 pr-6 py-4 bg-white border border-gray-100 rounded-2xl w-full md:w-[350px] shadow-sm focus:ring-4 focus:ring-blue-50 outline-none font-bold text-gray-700"
          />
        </div>
      </div>

      {error && (
        <div className="mb-6 p-4 bg-red-50 border border-red-100 rounded-2xl flex items-center gap-3 text-red-600 font-bold text-sm">
          <AlertCircle size={20} /> Erreur de connexion : {error}
        </div>
      )}

      {/* --- RESPONSIVE MOBILE: 2 BLOCS PAR LIGNE --- */}
      <div className="md:hidden">
        {loading ? (
          <div className="p-12 text-center font-black text-gray-300 animate-pulse uppercase text-xs tracking-widest">
            CHARGEMENT DES DOSSIERS...
          </div>
        ) : filtered.length === 0 ? (
          <div className="bg-white rounded-[2rem] p-8 border border-gray-100 text-center shadow-xl">
            <p className="font-black text-gray-400 uppercase text-xs tracking-widest">Aucun pèlerin trouvé</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            {filtered.map((p) => (
              <div key={p.id} className="bg-white border border-gray-100 rounded-[2rem] p-4 shadow-md flex flex-col justify-between relative overflow-hidden group">
                <div>
                  {/* Avatar & Action Eye */}
                  <div className="flex items-center justify-between gap-2 mb-3">
                    <div className="w-8 h-8 rounded-xl bg-gray-900 text-white flex items-center justify-center font-black text-[10px]">
                      {p.nom_complet?.substring(0, 2).toUpperCase()}
                    </div>
                    <Link 
                      href={`/hajj/admin/pelerin/${p.id}`}
                      className="w-8 h-8 rounded-xl bg-gray-50 border border-gray-100 text-gray-900 flex items-center justify-center transition-all"
                    >
                      <Eye size={14} />
                    </Link>
                  </div>

                  {/* Infos Pèlerin */}
                  <div className="mb-4">
                    <p className="font-black text-gray-900 uppercase text-xs truncate leading-tight" title={p.nom_complet}>
                      {p.nom_complet}
                    </p>
                    <p className="text-[9px] font-mono font-black text-gray-400 mt-1 flex items-center gap-0.5 truncate">
                      <CreditCard size={10} /> {p.num_passeport}
                    </p>
                  </div>
                </div>

                {/* Statuts / Toggles (Empilés verticalement dans le bloc) */}
                <div className="flex flex-col gap-2 mt-auto pt-2 border-t border-gray-50">
                  <button
                    onClick={() => toggleStatus(p.id, 'sur_plateforme_gouv', !p.sur_plateforme_gouv)}
                    className={`w-full px-2 py-1.5 rounded-xl flex items-center justify-center gap-1 ${p.sur_plateforme_gouv ? 'bg-green-100 text-green-700' : 'bg-gray-50 text-gray-400 opacity-80'}`}
                  >
                    <ShieldCheck size={12} />
                    <span className="text-[8px] font-black uppercase tracking-tighter">Gouv</span>
                  </button>

                  <button
                    onClick={() => toggleStatus(p.id, 'sur_plateforme_nusuk', !p.sur_plateforme_nusuk)}
                    className={`w-full px-2 py-1.5 rounded-xl flex items-center justify-center gap-1 ${p.sur_plateforme_nusuk ? 'bg-blue-100 text-blue-700' : 'bg-gray-50 text-gray-400 opacity-80'}`}
                  >
                    <Globe size={12} />
                    <span className="text-[8px] font-black uppercase tracking-tighter">Nusuk</span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* --- DESKTOP VIEW: TABLEAU ORIGINAL --- */}
      <div className="hidden md:block bg-white rounded-[2.5rem] border border-gray-100 shadow-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-gray-50/50 border-b border-gray-100">
                <th className="px-8 py-6 text-[10px] font-black text-gray-400 uppercase tracking-widest">Pèlerin</th>
                <th className="px-6 py-6 text-[10px] font-black text-gray-400 uppercase tracking-widest">Passeport</th>
                <th className="px-6 py-6 text-[10px] font-black text-gray-400 uppercase tracking-widest text-center">Gouv. Mali</th>
                <th className="px-6 py-6 text-[10px] font-black text-gray-400 uppercase tracking-widest text-center">Nusuk KSA</th>
                <th className="px-8 py-6 text-[10px] font-black text-gray-400 uppercase tracking-widest text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {loading ? (
                <tr><td colSpan={5} className="px-8 py-20 text-center font-bold text-gray-300 animate-pulse">CHARGEMENT DES DOSSIERS...</td></tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-8 py-20 text-center">
                    <p className="font-black text-gray-400 uppercase text-sm tracking-widest">Aucun pèlerin trouvé pour cette sélection</p>
                    <p className="text-xs text-gray-300 font-bold mt-1 italic">Vérifiez que les pèlerins sont bien liés à l'ID : {id}</p>
                  </td>
                </tr>
              ) : (
                filtered.map((p) => (
                  <tr key={p.id} className="hover:bg-blue-50/20 transition-colors group">
                    <td className="px-8 py-6">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-gray-900 text-white flex items-center justify-center font-black text-xs">
                          {p.nom_complet?.substring(0, 2).toUpperCase()}
                        </div>
                        <div>
                          <p className="font-black text-gray-900 uppercase text-sm leading-tight">{p.nom_complet}</p>
                          <p className="text-[10px] font-bold text-blue-600 uppercase mt-0.5">{p.agence_nom}</p>
                        </div>
                      </div>
                    </td>

                    <td className="px-6 py-6">
                      <div className="flex flex-col">
                        <span className="flex items-center gap-1 font-mono font-black text-gray-900 text-sm">
                          <CreditCard size={12} className="text-gray-400" /> {p.num_passeport}
                        </span>
                        <span className="text-[10px] font-bold text-gray-400 uppercase">Exp: {p.date_expiration || "N/A"}</span>
                      </div>
                    </td>

                    <td className="px-6 py-6 text-center">
                      <button
                        onClick={() => toggleStatus(p.id, 'sur_plateforme_gouv', !p.sur_plateforme_gouv)}
                        className={`mx-auto w-fit px-3 py-1.5 rounded-full flex items-center gap-1.5 ${p.sur_plateforme_gouv ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-400 opacity-60 hover:bg-gray-200'} transition-all`}
                        title={p.sur_plateforme_gouv ? 'Désactiver statuts gouv' : 'Valider sur gouv'}
                      >
                        <ShieldCheck size={14} />
                        <span className="text-[9px] font-black uppercase tracking-tighter">{p.sur_plateforme_gouv ? 'Validé' : 'À faire'}</span>
                      </button>
                    </td>

                    <td className="px-6 py-6 text-center">
                      <button
                        onClick={() => toggleStatus(p.id, 'sur_plateforme_nusuk', !p.sur_plateforme_nusuk)}
                        className={`mx-auto w-fit px-3 py-1.5 rounded-full flex items-center gap-1.5 ${p.sur_plateforme_nusuk ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-400 opacity-60 hover:bg-gray-200'} transition-all`}
                        title={p.sur_plateforme_nusuk ? 'Désactiver statuts nusuk' : 'Valider sur nusuk'}
                      >
                        <Globe size={14} />
                        <span className="text-[9px] font-black uppercase tracking-tighter">{p.sur_plateforme_nusuk ? 'Inscrit' : 'À faire'}</span>
                      </button>
                    </td>

                    <td className="px-8 py-6 text-right">
                      <Link 
                        href={`/hajj/admin/pelerin/${p.id}`}
                        className="inline-flex items-center justify-center w-10 h-10 rounded-xl bg-white border border-gray-200 text-gray-900 hover:bg-gray-900 hover:text-white transition-all shadow-sm"
                      >
                        <Eye size={18} />
                      </Link>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}