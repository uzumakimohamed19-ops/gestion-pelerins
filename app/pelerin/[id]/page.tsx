'use client'
import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { supabase } from '../../../lib/supabase'
import { User, CreditCard, FileText, ArrowLeft, Pencil, Printer, Trash2, Calendar, ShieldCheck, Building2 } from 'lucide-react'
import Link from 'next/link'

export default function DetailsPelerin() {
  const { id } = useParams()
  const router = useRouter()
  const [p, setPelerin] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [isDeleting, setIsDeleting] = useState(false)
  const [updating, setUpdating] = useState(false)
  const [role, setRole] = useState<string>('staff')

  const toggleStatus = async (field: string, value: boolean) => {
    if (!p) return
    setUpdating(true)
    const { error } = await supabase
      .from('pelerins')
      .update({ [field]: value })
      .eq('id', p.id)
    
    if (!error) {
      setPelerin({ ...p, [field]: value })
    }
    setUpdating(false)
  }

  useEffect(() => {
    async function getPelerin() {
      if (!id) return
      const cleanId = Array.isArray(id) ? id[0] : id

      const { data, error } = await supabase
        .from('pelerins')
        .select(`*, agences ( nom_agence )`)
        .eq('id', cleanId)
        .single()
      
      if (error) {
        console.error("Erreur :", error.message)
        setPelerin(null)
      } else {
        setPelerin(data)
      }

      const { data: userData } = await supabase.auth.getUser()
      const userId = userData?.user?.id
      if (userId) {
        const { data: profileData } = await supabase
          .from('profiles')
          .select('role')
          .eq('id', userId)
          .single()

        if (profileData?.role) {
          setRole(profileData.role)
        }
      }
      setLoading(false)
    }
    getPelerin()
  }, [id])

  const handleDelete = async () => {
    if (!p) return
    const confirmDelete = confirm(`⚠️ Voulez-vous vraiment supprimer le dossier de ${p.nom_complet} ?`)
    if (confirmDelete) {
      setIsDeleting(true)
      const { error } = await supabase.from('pelerins').delete().eq('id', p.id)
      if (error) {
        alert("Erreur : " + error.message)
        setIsDeleting(false)
      } else {
        router.push('/liste-pelerins')
      }
    }
  }

  // Fonction pour ouvrir proprement le document sans erreur 404
  const openDocument = () => {
    const { data } = supabase.storage
      .from('passeports')
      .getPublicUrl(p.document_url)
    
    if (data?.publicUrl) {
      window.open(data.publicUrl, '_blank')
    }
  }

  if (loading) return <div className="p-10 text-center font-bold italic animate-pulse text-gray-400">CHARGEMENT DU DOSSIER...</div>
  
  if (!p) return (
    <div className="p-10 text-center">
      <div className="font-black text-red-500 mb-4">PÈLERIN NON TROUVÉ.</div>
      <Link href="/liste-pelerins" className="text-blue-600 underline font-bold">Retourner à la liste</Link>
    </div>
  )

  const resteAPayer = (p.montant_total || 0) - (p.montant_paye || 0)

  return (
    <div className="max-w-4xl mx-auto px-4 py-10">
      <div className="flex justify-between items-center mb-8">
        <Link href="/liste-pelerins" className="flex items-center gap-2 text-gray-500 font-bold hover:text-blue-600 transition">
          <ArrowLeft size={20} /> Retour à la liste
        </Link>
        <Link href={`/modifier-pelerin/${p.id}`} className="bg-blue-600 text-white px-6 py-3 rounded-2xl font-black flex items-center gap-2 shadow-lg shadow-blue-200 hover:scale-105 transition-all">
          <Pencil size={18} /> MODIFIER LE DOSSIER
        </Link>
      </div>

      <div className="flex flex-wrap gap-3 items-center mb-8 print:hidden"> 
        <button onClick={() => window.print()} className="bg-gray-800 text-white px-6 py-3 rounded-2xl font-black flex items-center gap-2 shadow-lg hover:bg-black transition-all">
          <Printer size={18} /> IMPRIMER LA FICHE
        </button>
        <button onClick={handleDelete} disabled={isDeleting} className="bg-red-50 text-red-600 px-6 py-3 rounded-2xl font-black flex items-center gap-2 border border-red-100 hover:bg-red-600 hover:text-white transition-all disabled:opacity-50">
          <Trash2 size={18} /> {isDeleting ? "SUPPRESSION..." : "SUPPRIMER"}
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="md:col-span-2 space-y-6">
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
            
            <div className="grid grid-cols-2 gap-8 border-t border-gray-50 pt-6 mt-6">
              <div>
                <p className="text-[10px] font-black text-gray-400 uppercase mb-1 flex items-center gap-1"><Calendar size={10} /> Date de Naissance</p>
                <p className="font-bold text-gray-800">{p.date_naissance ? new Date(p.date_naissance).toLocaleDateString('fr-FR') : "Non renseignée"}</p>
              </div>
              <div>
                <p className="text-[10px] font-black text-red-400 uppercase mb-1 flex items-center gap-1"><ShieldCheck size={10} /> Expiration Passeport</p>
                <p className="font-black text-red-600 uppercase">{p.date_expiration ? new Date(p.date_expiration).toLocaleDateString('fr-FR') : "Non renseignée"}</p>
              </div>
              <div>
                <p className="text-[10px] font-black text-gray-400 uppercase mb-1">Téléphone</p>
                <p className="font-bold text-gray-800">{p.telephone || "Non renseigné"}</p>
              </div>
              <div>
                <p className="text-[10px] font-black text-blue-500 uppercase mb-1 flex items-center gap-1"><Building2 size={10} /> Enregistré par</p>
                <p className="font-black text-gray-900 uppercase">{p.agences?.nom_agence || p.nom_agence || "Non renseignée"}</p>
              </div>
              <div className="col-span-2">
                <p className="text-[10px] font-black text-gray-300 uppercase mb-1">Date d'inscription au système</p>
                <p className="text-xs font-bold text-gray-400">{new Date(p.created_at).toLocaleString('fr-FR')}</p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-[2.5rem] p-8 shadow-sm border border-gray-100">
            <h3 className="flex items-center gap-2 font-black text-gray-900 mb-4">
              <FileText size={20} className="text-blue-600" /> PIÈCE JOINTE
            </h3>
            {p.document_url ? (
              <button 
                onClick={openDocument}
                className="w-full block p-4 rounded-2xl border-2 border-dashed border-blue-200 bg-blue-50 text-blue-700 font-bold text-center hover:bg-blue-100 transition"
              >
                Cliquer pour ouvrir le scan du Passeport
              </button>
            ) : (
              <div className="p-4 rounded-2xl border-2 border-dashed border-amber-200 bg-amber-50 text-amber-700 font-bold text-center">
                Aucun document numérisé
              </div>
            )}
          </div>
        </div>

        {role !== 'admin' && (
          <div className="bg-gray-900 rounded-[2.5rem] p-8 text-white shadow-2xl h-fit">
            <h3 className="flex items-center gap-2 font-black mb-8"><CreditCard size={20} className="text-blue-400" /> COMPTABILITÉ</h3>
            <div className="space-y-6">
              <div>
                <p className="text-[10px] font-black text-gray-400 uppercase mb-1">Total dû</p>
                <p className="text-2xl font-black tracking-tighter">{(p.montant_total || 0).toLocaleString()} CFA</p>
              </div>
              <div className="h-[1px] bg-gray-800"></div>
              <div>
                <p className="text-[10px] font-black text-green-400 uppercase mb-1">Déjà payé</p>
                <p className="text-2xl font-black text-green-400 tracking-tighter">{(p.montant_paye || 0).toLocaleString()} CFA</p>
              </div>
              <div className="h-[1px] bg-gray-800"></div>
              <div className="bg-blue-600/20 p-4 rounded-2xl border border-blue-600/30">
                <p className="text-[10px] font-black text-blue-300 uppercase mb-1">Reste à percevoir</p>
                <p className="text-2xl font-black text-blue-400 tracking-tighter">{resteAPayer.toLocaleString()} CFA</p>
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="md:col-span-2 mt-4 p-6 bg-gray-50 rounded-3xl border border-gray-100">
        <h3 className="text-[10px] font-black text-gray-400 uppercase mb-4 tracking-widest flex items-center gap-2">
          <ShieldCheck size={14} className="text-blue-600" /> ÉTAPE DE VALIDATION DES PLATEFORMES
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <button onClick={() => toggleStatus('sur_plateforme_gouv', !p.sur_plateforme_gouv)} className={`p-4 rounded-2xl border-2 transition-all flex items-center justify-between ${p.sur_plateforme_gouv ? 'bg-green-50 border-green-500 text-green-700' : 'bg-white border-gray-100 text-gray-400'}`}>
            <span className="font-bold text-sm uppercase">Plateforme Gouvernement</span>
            <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center ${p.sur_plateforme_gouv ? 'bg-green-500 border-green-500' : 'border-gray-200'}`}>{p.sur_plateforme_gouv && <div className="w-2 h-2 bg-white rounded-full" />}</div>
          </button>
          <button onClick={() => toggleStatus('sur_plateforme_nusuk', !p.sur_plateforme_nusuk)} className={`p-4 rounded-2xl border-2 transition-all flex items-center justify-between ${p.sur_plateforme_nusuk ? 'bg-blue-50 border-blue-500 text-blue-700' : 'bg-white border-gray-100 text-gray-400'}`}>
            <span className="font-bold text-sm uppercase">Plateforme Nusuk (KSA)</span>
            <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center ${p.sur_plateforme_nusuk ? 'bg-blue-500 border-blue-500' : 'border-gray-200'}`}>{p.sur_plateforme_nusuk && <div className="w-2 h-2 bg-white rounded-full" />}</div>
          </button>
        </div>
      </div>
    </div>
  )
}