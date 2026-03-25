'use client'
import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import Link from 'next/link'
import * as XLSX from 'xlsx'
import { useRouter } from 'next/navigation'

interface Pelerin {
  id: string
  nom_complet: string
  num_passeport: string
  telephone_pelerin: string // Mis à jour selon SQL
  document_url: string
  date_naissance?: string
  date_expiration?: string
  total_paye: number        // Mis à jour selon SQL
  prix_package: number      // Mis à jour selon SQL
  sur_plateforme_gouv: boolean
  sur_plateforme_nusuk: boolean
  agences?: {
    nom_agence?: string
  }
}

export default function ListePelerins() {
  const [pelerins, setPelerins] = useState<Pelerin[]>([])
  const [searchTerm, setSearchTerm] = useState('')
  const [loading, setLoading] = useState(true)
  const [updatingId, setUpdatingId] = useState<string | null>(null)
  const [role, setRole] = useState<string>('staff')
  const router = useRouter()

  useEffect(() => {
    const checkUserAndFetch = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        router.push('/login')
        return
      }

      // role de l'utilisateur (admin/team)
      const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single()

      if (profile?.role) {
        setRole(profile.role)
      }

      fetchPelerins()
    }
    checkUserAndFetch()
  }, [router])

  async function fetchPelerins() {
    setLoading(true)
    // NOTE : On ne met plus .eq('user_id'), le RLS de la base s'en occupe automatiquement !
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

  const exporterExcel = () => {
    const donneesExcel = pelerinsFiltrés.map(p => ({
      'Nom Complet': p.nom_complet,
      'Numéro Passeport': p.num_passeport,
      'Date de Naissance': p.date_naissance ? new Date(p.date_naissance).toLocaleDateString('fr-FR') : 'Inconnu',
      'Date d\'expiration': p.date_expiration ? new Date(p.date_expiration).toLocaleDateString('fr-FR') : 'Inconnu',
      'Agence': p.agences?.nom_agence || 'Agence inconnue',
      'Gouv': p.sur_plateforme_gouv ? 'OUI' : 'NON',
      'Nusuk': p.sur_plateforme_nusuk ? 'OUI' : 'NON'
    }));
    const feuille = XLSX.utils.json_to_sheet(donneesExcel);
    const classeur = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(classeur, feuille, "Pèlerins");
    XLSX.writeFile(classeur, `Liste_Pelerins.xlsx`);
  };

  const pelerinsFiltrés = pelerins.filter(p => 
    p.nom_complet.toLowerCase().includes(searchTerm.toLowerCase()) ||
    p.num_passeport.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (p.agences?.nom_agence || '').toLowerCase().includes(searchTerm.toLowerCase())
  )

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      {/* HEADER */}
      <div className="flex flex-col md:flex-row md:items-center justify-between mb-8 gap-4">
        <div>
          <h1 className="text-3xl font-black text-gray-900 tracking-tight">Gestion des Dossiers</h1>
          <p className="text-gray-500 font-medium">{pelerins.length} pèlerins visibles</p>
        </div>
        <div className="flex gap-3">
          <button onClick={exporterExcel} className="bg-emerald-600 hover:bg-emerald-700 text-white px-6 py-3 rounded-2xl font-bold transition-all shadow-lg flex items-center">
            Exporter Excel
          </button>
          <Link href="/ajouter-pelerin" className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-2xl font-bold transition-all shadow-lg text-center">
            + Nouveau Dossier
          </Link>
        </div>
      </div>

      {/* RECHERCHE */}
      <div className="mb-6 relative">
        <input 
          type="text"
          placeholder="Rechercher par nom ou numéro de passeport..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full pl-12 pr-4 py-4 rounded-2xl border-2 border-gray-200 bg-white text-gray-900 font-bold focus:border-blue-600 focus:ring-4 focus:ring-blue-50 outline-none transition-all shadow-sm"
        />
        <span className="absolute left-4 top-4 text-gray-400">
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
        </span>
      </div>

      {/* TABLEAU */}
      <div className="bg-white rounded-3xl shadow-sm border border-gray-100 overflow-hidden">
        <table className="w-full text-left">
          <thead>
            <tr className="bg-gray-50/50 border-b border-gray-100">
              <th className="px-6 py-5 text-xs font-black text-gray-400 uppercase tracking-widest">Pèlerin</th>
              <th className="px-6 py-5 text-xs font-black text-gray-400 uppercase tracking-widest">Passeport</th>
              <th className="px-6 py-5 text-xs font-black text-gray-400 uppercase tracking-widest">Validation</th>
              <th className="px-6 py-5 text-xs font-black text-gray-400 uppercase tracking-widest">{role === 'admin' ? 'Agence' : 'Paiement'}</th>
              <th className="px-6 py-5 text-xs font-black text-gray-400 uppercase tracking-widest text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {loading ? (
               <tr><td colSpan={5} className="py-20 text-center text-gray-400 font-bold italic">Chargement sécurisé...</td></tr>
            ) : pelerinsFiltrés.map((p) => (
              <tr key={p.id} className="hover:bg-blue-50/20 transition-colors">
                <td className="px-6 py-5">
                  <div className="font-bold text-gray-900 text-lg">{p.nom_complet}</div>
                  <div className="text-sm text-gray-500">{p.telephone_pelerin || 'Pas de numéro'}</div>
                </td>
                
                <td className="px-6 py-5">
                  <span className="bg-gray-100 px-3 py-1 rounded-lg font-mono font-bold text-gray-700 uppercase">
                    {p.num_passeport}
                  </span>
                </td>

                <td className="px-6 py-5">
                  <div className="flex gap-4">
                    <div className="flex flex-col items-center gap-1">
                      <button 
                        onClick={() => toggleFastStatus(p.id, 'sur_plateforme_gouv', p.sur_plateforme_gouv)}
                        disabled={updatingId === p.id + 'sur_plateforme_gouv'}
                        className={`w-4 h-4 rounded-full transition-all hover:scale-125 flex items-center justify-center ${p.sur_plateforme_gouv ? 'bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.6)]' : 'bg-gray-200'}`}
                      >
                         {p.sur_plateforme_gouv && <div className="w-1.5 h-1.5 bg-white rounded-full"></div>}
                      </button>
                      <span className="text-[8px] font-black text-gray-400 uppercase tracking-tighter">gouv</span>
                    </div>

                    <div className="flex flex-col items-center gap-1">
                      <button 
                        onClick={() => toggleFastStatus(p.id, 'sur_plateforme_nusuk', p.sur_plateforme_nusuk)}
                        disabled={updatingId === p.id + 'sur_plateforme_nusuk'}
                        className={`w-4 h-4 rounded-full transition-all hover:scale-125 flex items-center justify-center ${p.sur_plateforme_nusuk ? 'bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.6)]' : 'bg-gray-200'}`}
                      >
                         {p.sur_plateforme_nusuk && <div className="w-1.5 h-1.5 bg-white rounded-full"></div>}
                      </button>
                      <span className="text-[8px] font-black text-gray-400 uppercase tracking-tighter">nusuk</span>
                    </div>
                  </div>
                </td>

                <td className="px-6 py-5">
                  {role === 'admin' ? (
                    <div className="font-bold text-gray-900 text-sm">
                      {p.agences?.nom_agence || 'Agence inconnue'}
                    </div>
                  ) : (
                    <div className="flex flex-col gap-1 w-48">
                      <div className="flex justify-between text-[10px] font-black uppercase">
                        <span className="text-gray-400">Progression</span>
                        <span className="text-blue-600">{Math.round((p.total_paye / p.prix_package) * 100) || 0}%</span>
                      </div>
                      <div className="w-full bg-gray-100 h-2 rounded-full overflow-hidden">
                        <div className="h-full bg-blue-600 transition-all duration-500" style={{ width: `${(p.total_paye / p.prix_package) * 100}%` }}></div>
                      </div>
                      <p className="text-[11px] font-bold text-gray-900 truncate">
                        {(p.total_paye || 0).toLocaleString()} / {(p.prix_package || 0).toLocaleString()} CFA
                      </p>
                    </div>
                  )}
                </td>

                <td className="px-6 py-5 text-right space-x-2">
                  <Link href={`/pelerin/${p.id}`} className="inline-flex items-center px-4 py-2 bg-gray-100 hover:bg-blue-600 hover:text-white text-gray-700 rounded-xl font-bold text-sm transition">
                    Détails
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!loading && pelerinsFiltrés.length === 0 && (
          <div className="py-20 text-center text-gray-400 font-bold uppercase tracking-widest text-sm">
            Aucun dossier trouvé
          </div>
        )}
      </div>
    </div>
  )
}