'use client'
import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { User, FileText, ArrowLeft, Printer, Calendar, ShieldCheck, Building2, Globe, CheckCircle2, Save, Syringe, Stethoscope, BookOpen, Hotel, Plane } from 'lucide-react'
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
      loading && setLoading(false)
    }
    getPelerin()
  }, [id, loading])

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

  const handleChange = (field: string, value: any) => {
    setPelerin({ ...p, [field]: value })
  }

  const saveAdvancedData = async () => {
    setUpdating(true)
    const { error } = await supabase
      .from('pelerins')
      .update({
        vacciné: p.vacciné,
        visite_medicale: p.visite_medicale,
        formation_suivie: p.formation_suivie,
        date_formation: p.date_formation || null,
        groupe_formation: p.groupe_formation || null,
        hotel_mecque: p.hotel_mecque || null,
        hotel_statut: p.hotel_statut,
        groupe_encadrement: p.groupe_encadrement || null,
        date_depart: p.date_depart || null,
        date_retour: p.date_retour || null,
        visa_obtenu: p.visa_obtenu
      })
      .eq('id', id)

    if (!error) {
      alert("Informations de suivi enregistrées avec succès !")
    } else {
      console.error("Erreur mise à jour :", error.message)
      alert("Une erreur est survenue lors de l'enregistrement.")
    }
    setUpdating(false)
  }

  if (loading) return <div className="p-10 text-center font-bold italic animate-pulse text-gray-400">CHARGEMENT DU DOSSIER ADMIN...</div>
  if (!p) return <div className="p-10 text-center font-black text-red-500">PÈLERIN NON TROUVÉ.</div>

  return (
    <div className="max-w-4xl mx-auto px-4 pt-4 pb-28 md:py-10">
      
      {/* Barre d'actions supérieure */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6 md:mb-8 print:hidden">
        <Link href={`/admin/agence/${p.agence_id}`} className="flex items-center gap-2 text-gray-500 font-bold hover:text-blue-600 transition p-2 -ml-2 rounded-lg hover:bg-gray-50">
          <ArrowLeft size={20} /> Retour au panneau Admin
        </Link>
        
        {/* Actions - Uniquement visibles sur tablette/bureau */}
        <div className="hidden sm:flex items-center gap-3 w-full sm:w-auto">
          <button 
            onClick={saveAdvancedData}
            disabled={updating}
            className="bg-emerald-600 text-white px-6 py-3 rounded-2xl font-black flex items-center justify-center gap-2 hover:bg-emerald-700 transition-all shadow-lg shadow-emerald-100 disabled:opacity-50"
          >
            <Save size={18} /> {updating ? 'SAUVEGARDE...' : 'ENREGISTRER'}
          </button>
          <button 
            onClick={() => window.print()} 
            className="bg-gray-100 text-gray-700 px-6 py-3 rounded-2xl font-black flex items-center justify-center gap-2 hover:bg-gray-200 transition-all"
          >
            <Printer size={18} /> IMPRIMER
          </button>
        </div>
      </div>

      <div className="space-y-6">
        
        {/* BLOC 1 : IDENTITÉ + PLATEFORMES & PASSEPORT REMONTÉS ICI */}
        <div className="bg-white rounded-2xl sm:rounded-[2.5rem] p-5 sm:p-8 shadow-sm border border-gray-100 space-y-6">
          <div className="flex flex-col sm:flex-row items-center gap-4 text-center sm:text-left">
            <div className="w-16 h-16 bg-blue-50 rounded-2xl flex items-center justify-center text-blue-600 shrink-0">
              <User size={32} />
            </div>
            <div className="w-full min-w-0">
              <h1 className="text-xl sm:text-3xl font-black text-gray-900 uppercase break-words">{p.nom_complet}</h1>
              <p className="text-blue-600 text-xs sm:text-sm font-bold tracking-widest uppercase mt-1">PASSEPORT : {p.num_passeport}</p>
            </div>
          </div>
          
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 sm:gap-8 border-t border-gray-50 pt-6">
            <div>
              <p className="text-[10px] font-black text-gray-400 uppercase mb-1 flex items-center gap-1 justify-center sm:justify-start">
                <Calendar size={10} /> Naissance
              </p>
              <p className="font-bold text-sm sm:text-base text-gray-800 text-center sm:text-left">
                {p.date_naissance ? new Date(p.date_naissance).toLocaleDateString('fr-FR') : "N/A"}
              </p>
            </div>
            <div>
              <p className="text-[10px] font-black text-red-400 uppercase mb-1 flex items-center gap-1 justify-center sm:justify-start">
                <ShieldCheck size={10} /> Expiration
              </p>
              <p className="font-black text-sm sm:text-base text-red-600 text-center sm:text-left">
                {p.date_expiration ? new Date(p.date_expiration).toLocaleDateString('fr-FR') : "N/A"}
              </p>
            </div>
            <div>
              <p className="text-[10px] font-black text-gray-400 uppercase mb-1 text-center sm:text-left">Téléphone</p>
              <p className="font-bold text-sm sm:text-base text-gray-800 text-center sm:text-left break-words">{p.telephone || "N/A"}</p>
            </div>
            <div>
              <p className="text-[10px] font-black text-blue-500 uppercase mb-1 flex items-center gap-1 justify-center sm:justify-start">
                <Building2 size={10} /> Agence
              </p>
              <p className="font-black text-sm sm:text-base text-gray-900 uppercase text-center sm:text-left break-words">
                {p.agence_nom || "AL-BOURAQ"}
              </p>
            </div>
          </div>

          {/* Section Intégrée : Suivi Plateformes */}
          <div className="border-t border-gray-50 pt-6">
            <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-3">Statut Enregistrements Obligatoires</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <button 
                onClick={() => toggleStatus('sur_plateforme_gouv', p.sur_plateforme_gouv)}
                disabled={updating}
                className={`p-4 rounded-2xl border-2 flex items-center justify-between transition-all active:scale-98 ${p.sur_plateforme_gouv ? 'border-emerald-500 bg-emerald-50 text-emerald-700' : 'border-gray-100 bg-gray-50 text-gray-400 hover:border-gray-300'}`}
              >
                <div className="flex items-center gap-3 text-left">
                  <ShieldCheck size={20} className="shrink-0" />
                  <span className="font-bold text-xs uppercase">Plateforme Gouv</span>
                </div>
                {p.sur_plateforme_gouv ? <CheckCircle2 size={20} className="text-emerald-500 shrink-0" /> : <div className="w-5 h-5 rounded-full border-2 border-gray-200 shrink-0" />}
              </button>

              <button 
                onClick={() => toggleStatus('sur_plateforme_nusuk', p.sur_plateforme_nusuk)}
                disabled={updating}
                className={`p-4 rounded-2xl border-2 flex items-center justify-between transition-all active:scale-98 ${p.sur_plateforme_nusuk ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-gray-100 bg-gray-50 text-gray-400 hover:border-gray-300'}`}
              >
                <div className="flex items-center gap-3 text-left">
                  <Globe size={20} className="shrink-0" />
                  <span className="font-bold text-xs uppercase">Portail NUSUK</span>
                </div>
                {p.sur_plateforme_nusuk ? <CheckCircle2 size={20} className="text-blue-500 shrink-0" /> : <div className="w-5 h-5 rounded-full border-2 border-gray-200 shrink-0" />}
              </button>
            </div>
          </div>

          {/* Section Intégrée : Visualisation Passeport */}
          <div className="border-t border-gray-50 pt-4">
            {p.document_url ? (
              <a 
                href={`${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/passeports/${p.document_url}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center gap-2 p-3.5 rounded-xl border border-blue-200 bg-blue-50 text-blue-700 font-bold hover:bg-blue-100 transition text-xs uppercase tracking-wider"
              >
                <FileText size={16} /> Ouvrir le Scan du Passeport
              </a>
            ) : (
              <div className="p-3.5 rounded-xl border border-dashed border-amber-200 bg-amber-50 text-amber-700 font-bold text-center text-xs uppercase tracking-wider">
                Aucun scan numérisé pour ce profil
              </div>
            )}
          </div>
        </div>

        {/* BLOC 2 : SANTÉ ET FORMATION */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* SANTÉ */}
          <div className="bg-white rounded-2xl sm:rounded-[2.5rem] p-5 sm:p-8 shadow-sm border border-gray-100 space-y-5">
            <h3 className="flex items-center gap-2 font-black text-gray-900 uppercase tracking-tight text-xs sm:text-sm">
              <Syringe size={18} className="text-emerald-600" /> Suivi Sanitaire
            </h3>
            <div className="space-y-3">
              <label className="flex items-center justify-between p-4 bg-gray-50 rounded-2xl cursor-pointer hover:bg-gray-100 transition-all select-none">
                <div className="flex items-center gap-3">
                  <Syringe className="text-emerald-600" size={20} />
                  <span className="font-bold text-sm text-gray-700">Vacciné</span>
                </div>
                <input 
                  type="checkbox"
                  checked={!!p.vacciné}
                  onChange={(e) => handleChange('vacciné', e.target.checked)}
                  className="w-5 h-5 min-w-[20px] accent-emerald-500 rounded cursor-pointer"
                />
              </label>

              <label className="flex items-center justify-between p-4 bg-gray-50 rounded-2xl cursor-pointer hover:bg-gray-100 transition-all select-none">
                <div className="flex items-center gap-3">
                  <Stethoscope className="text-blue-500" size={20} />
                  <span className="font-bold text-sm text-gray-700">Visite médicale</span>
                </div>
                <input 
                  type="checkbox"
                  checked={!!p.visite_medicale}
                  onChange={(e) => handleChange('visite_medicale', e.target.checked)}
                  className="w-5 h-5 min-w-[20px] accent-emerald-500 rounded cursor-pointer"
                />
              </label>
            </div>
          </div>

          {/* FORMATION */}
          <div className="bg-white rounded-2xl sm:rounded-[2.5rem] p-5 sm:p-8 shadow-sm border border-gray-100 space-y-4">
            <h3 className="flex items-center gap-2 font-black text-gray-900 uppercase tracking-tight text-xs sm:text-sm">
              <BookOpen size={18} className="text-orange-500" /> Formation
            </h3>
            <label className="flex items-center justify-between p-3 bg-gray-50 rounded-xl cursor-pointer select-none">
              <span className="font-bold text-sm text-gray-700">Formation suivie ?</span>
              <input 
                type="checkbox"
                checked={!!p.formation_suivie}
                onChange={(e) => handleChange('formation_suivie', e.target.checked)}
                className="w-5 h-5 min-w-[20px] accent-orange-500 rounded cursor-pointer"
              />
            </label>
            <div>
              <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest px-1">Date de formation</label>
              <input 
                type="date"
                value={p.date_formation || ''}
                onChange={(e) => handleChange('date_formation', e.target.value)}
                className="w-full p-3 mt-1 bg-gray-50 border border-gray-100 rounded-xl font-bold outline-none focus:border-orange-500 text-sm appearance-none"
              />
            </div>
            <div>
              <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest px-1">Groupe assigné</label>
              <input 
                type="text"
                placeholder="Ex: Groupe A"
                value={p.groupe_formation || ''}
                onChange={(e) => handleChange('groupe_formation', e.target.value)}
                className="w-full p-3 mt-1 bg-gray-50 border border-gray-100 rounded-xl font-bold outline-none focus:border-orange-500 text-sm"
              />
            </div>
          </div>
        </div>

        {/* BLOC 3 : LOGISTIQUE À LA MECQUE */}
        <div className="bg-white rounded-2xl sm:rounded-[2.5rem] p-5 sm:p-8 shadow-sm border border-gray-100">
          <h3 className="flex items-center gap-2 font-black text-gray-900 mb-6 uppercase tracking-tight text-xs sm:text-sm">
            <Hotel size={20} className="text-purple-600" /> Logistique à la Mecque & Vols
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            <div className="space-y-4">
              <div>
                <label className="text-[10px] font-black text-gray-400 uppercase px-1">Hôtel (La Mecque)</label>
                <input 
                  type="text"
                  placeholder="Ex: Hilton Makkah"
                  value={p.hotel_mecque || ''}
                  onChange={(e) => handleChange('hotel_mecque', e.target.value)}
                  className="w-full p-4 bg-gray-50 border border-transparent focus:border-purple-500 rounded-2xl outline-none font-bold transition-all text-sm"
                />
              </div>
              <label className="flex items-center gap-3 px-1 cursor-pointer select-none">
                <input 
                  type="checkbox"
                  checked={!!p.hotel_statut}
                  onChange={(e) => handleChange('hotel_statut', e.target.checked)}
                  className="w-5 h-5 min-w-[20px] accent-purple-600 rounded cursor-pointer"
                />
                <span className="font-bold text-xs text-gray-600">Hôtel confirmé ?</span>
              </label>
            </div>

            <div>
              <label className="text-[10px] font-black text-gray-400 uppercase px-1">Groupe d'encadrement</label>
              <input 
                type="text"
                placeholder="Ex: Groupe B - Guide Issa"
                value={p.groupe_encadrement || ''}
                onChange={(e) => handleChange('groupe_encadrement', e.target.value)}
                className="w-full p-4 bg-gray-50 border border-transparent focus:border-purple-500 rounded-2xl outline-none font-bold transition-all text-sm"
              />
            </div>
          </div>
        </div>

        {/* BLOC 4 : VOLS ET VISA */}
        <div className="bg-gray-900 rounded-2xl sm:rounded-[2.5rem] p-5 sm:p-8 shadow-sm border border-gray-100 text-white grid grid-cols-1 sm:grid-cols-2 gap-6">
          <div className="space-y-4">
            <h3 className="flex items-center gap-2 font-black uppercase tracking-tight text-emerald-400 text-xs sm:text-sm mb-4">
              <Plane size={18} /> Dates des Vols
            </h3>
            <div>
              <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-1">Départ de Bamako</label>
              <input 
                type="datetime-local"
                value={p.date_depart ? p.date_depart.slice(0, 16) : ''}
                onChange={(e) => handleChange('date_depart', e.target.value)}
                className="w-full p-3 bg-white/10 border border-white/20 rounded-xl font-bold outline-none focus:border-emerald-500 text-sm text-white appearance-none"
              />
            </div>
            <div>
              <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-1">Retour à Bamako</label>
              <input 
                type="datetime-local"
                value={p.date_retour ? p.date_retour.slice(0, 16) : ''}
                onChange={(e) => handleChange('date_retour', e.target.value)}
                className="w-full p-3 bg-white/10 border border-white/20 rounded-xl font-bold outline-none focus:border-emerald-500 text-sm text-white appearance-none"
              />
            </div>
          </div>

          <div className="flex flex-col justify-center mt-4 sm:mt-0">
            <h3 className="flex items-center gap-2 font-black uppercase tracking-tight text-red-400 text-xs sm:text-sm mb-4">
              <ShieldCheck size={18} /> Obtention du Visa
            </h3>
            <label className="flex items-center justify-between p-5 bg-white/5 border border-white/10 rounded-2xl cursor-pointer hover:bg-white/10 transition-all select-none">
              <span className="font-bold text-sm text-white">Visa Hajj validé ?</span>
              <input 
                type="checkbox"
                checked={!!p.visa_obtenu}
                onChange={(e) => handleChange('visa_obtenu', e.target.checked)}
                className="w-6 h-6 min-w-[24px] accent-emerald-500 rounded cursor-pointer"
              />
            </label>
          </div>
        </div>
      </div>

      {/* Barre d'action fixe sur Mobile - Bouton unique Pleine Largeur pour éviter les conflits d'impression */}
      <div className="fixed bottom-0 left-0 right-0 p-4 bg-white/90 backdrop-blur-md border-t border-gray-100 flex items-center sm:hidden shadow-xl z-50 print:hidden">
        <button 
          onClick={saveAdvancedData}
          disabled={updating}
          className="w-full bg-emerald-600 text-white py-4 px-4 rounded-xl font-black flex items-center justify-center gap-2 hover:bg-emerald-700 transition-all disabled:opacity-50 text-sm shadow-md uppercase tracking-wider"
        >
          <Save size={18} /> {updating ? 'SAUVEGARDE EN COURS...' : 'ENREGISTRER LES MODIFICATIONS'}
        </button>
      </div>

    </div>
  )
}