'use client'
import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { User, FileText, ArrowLeft, Printer, Calendar, ShieldCheck, Building2, Globe, CheckCircle2 } from 'lucide-react'
import Link from 'next/link'

export default function DetailsAdminPelerin() {
  const { id } = useParams()
  const [p, setPelerin] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [updating, setUpdating] = useState(false)

  useEffect(() => {
    async function getPelerin() {
      if (!id) return
      const cleanId = Array.isArray(id) ? id[0] : id

      const { data, error } = await supabase
        .from('pelerins')
        .select('*')
        .eq('id', cleanId)
        .single()
      
      if (error) {
        console.error("Erreur :", error.message)
        setPelerin(null)
      } else {
        setPelerin(data)
      }
      setLoading(false)
    }
    getPelerin()
  }, [id])

  const toggleStatus = async (field: string, currentValue: boolean) => {
    setUpdating(true)
    const { error } = await supabase
      .from('pelerins')
      .update({ [field]: !currentValue })
      .eq('id', id)

    if (!error) {
      setPelerin({ ...p, [field]: !currentValue })
    }
    setUpdating(false)
  }

  if (loading) return <div className="p-10 text-center font-bold italic animate-pulse text-gray-400">CHARGEMENT DU DOSSIER ADMIN...</div>
  if (!p) return <div className="p-10 text-center font-black text-red-500">PÈLERIN NON TROUVÉ.</div>

  return (
    <div className="max-w-4xl mx-auto px-4 py-10">
      {/* Barre d'actions : Modifier retiré */}
      <div className="flex justify-between items-center mb-8">
        <Link href={`/admin/agence/${p.agence_id}`} className="flex items-center gap-2 text-gray-500 font-bold hover:text-blue-600 transition">
          <ArrowLeft size={20} /> Retour au panneau Admin
        </Link>
        <button 
          onClick={() => window.print()} 
          className="bg-gray-100 text-gray-700 px-6 py-3 rounded-2xl font-black flex items-center gap-2 hover:bg-gray-200 transition-all"
        >
          <Printer size={18} /> IMPRIMER LA FICHE
        </button>
      </div>

      <div className="space-y-6">
        
        {/* BLOC 1 : IDENTITÉ */}
        <div className="bg-white rounded-[2.5rem] p-8 shadow-sm border border-gray-100">
          <div className="flex items-center gap-4 mb-6">
            <div className="w-16 h-16 bg-blue-50 rounded-2xl flex items-center justify-center text-blue-600">
              <User size={32} />
            </div>
            <div>
              <h1 className="text-3xl font-black text-gray-900 uppercase">{p.nom_complet}</h1>
              <p className="text-blue-600 font-bold tracking-widest uppercase">PASSEPORT : {p.num_passeport}</p>
            </div>
          </div>
          
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 border-t border-gray-50 pt-6 mt-6">
            <div>
              <p className="text-[10px] font-black text-gray-400 uppercase mb-1 flex items-center gap-1">
                <Calendar size={10} /> Naissance
              </p>
              <p className="font-bold text-gray-800">
                {p.date_naissance ? new Date(p.date_naissance).toLocaleDateString('fr-FR') : "N/A"}
              </p>
            </div>
            <div>
              <p className="text-[10px] font-black text-red-400 uppercase mb-1 flex items-center gap-1">
                <ShieldCheck size={10} /> Expiration
              </p>
              <p className="font-black text-red-600">
                {p.date_expiration ? new Date(p.date_expiration).toLocaleDateString('fr-FR') : "N/A"}
              </p>
            </div>
            <div>
              <p className="text-[10px] font-black text-gray-400 uppercase mb-1">Téléphone</p>
              <p className="font-bold text-gray-800">{p.telephone || "N/A"}</p>
            </div>
            <div>
              <p className="text-[10px] font-black text-blue-500 uppercase mb-1 flex items-center gap-1">
                <Building2 size={10} /> Agence
              </p>
              <p className="font-black text-gray-900 uppercase">
                {p.agence_nom || "AL-BOURAQ"}
              </p>
            </div>
          </div>
        </div>

        {/* BLOC 2 : ACTIONS PLATEFORMES (INTERACTIF) */}
        <div className="bg-white rounded-[2.5rem] p-8 shadow-sm border border-gray-100">
          <h3 className="flex items-center gap-2 font-black text-gray-900 mb-6 uppercase tracking-tight">
            <ShieldCheck size={20} className="text-blue-600" /> Suivi Administratif (Admin)
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <button 
              onClick={() => toggleStatus('sur_plateforme_gouv', p.sur_plateforme_gouv)}
              disabled={updating}
              className={`p-6 rounded-3xl border-2 flex items-center justify-between transition-all group ${p.sur_plateforme_gouv ? 'border-emerald-500 bg-emerald-50 text-emerald-700' : 'border-gray-100 bg-gray-50 text-gray-400 hover:border-gray-300'}`}
            >
              <div className="flex items-center gap-3 text-left">
                <ShieldCheck size={24} />
                <span className="font-black text-xs uppercase">Plateforme<br/>Gouvernement</span>
              </div>
              {p.sur_plateforme_gouv ? <CheckCircle2 size={24} className="text-emerald-500" /> : <div className="w-6 h-6 rounded-full border-2 border-gray-200" />}
            </button>

            <button 
              onClick={() => toggleStatus('sur_plateforme_nusuk', p.sur_plateforme_nusuk)}
              disabled={updating}
              className={`p-6 rounded-3xl border-2 flex items-center justify-between transition-all group ${p.sur_plateforme_nusuk ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-gray-100 bg-gray-50 text-gray-400 hover:border-gray-300'}`}
            >
              <div className="flex items-center gap-3 text-left">
                <Globe size={24} />
                <span className="font-black text-xs uppercase">Portail<br/>NUSUK (KSA)</span>
              </div>
              {p.sur_plateforme_nusuk ? <CheckCircle2 size={24} className="text-blue-500" /> : <div className="w-6 h-6 rounded-full border-2 border-gray-200" />}
            </button>
          </div>
        </div>

        {/* BLOC 3 : DOCUMENT SCANNÉ */}
        <div className="bg-white rounded-[2.5rem] p-8 shadow-sm border border-gray-100">
          <h3 className="flex items-center gap-2 font-black text-gray-900 mb-4 uppercase text-sm">
            <FileText size={18} className="text-blue-600" /> Visualisation Passeport
          </h3>
          {p.document_url ? (
            <a 
              href={`${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/passeports/${p.document_url}`}
              target="_blank"
              className="block p-4 rounded-2xl border-2 border-dashed border-blue-200 bg-blue-50 text-blue-700 font-bold text-center hover:bg-blue-100 transition"
            >
              Cliquer pour ouvrir le scan du Passeport
            </a>
          ) : (
            <div className="p-4 rounded-2xl border-2 border-dashed border-amber-200 bg-amber-50 text-amber-700 font-bold text-center">
              Aucun document numérisé
            </div>
          )}
        </div>
      </div>
    </div>
  )
}