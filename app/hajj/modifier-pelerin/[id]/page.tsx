'use client'
import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { Save, ArrowLeft, Loader2, Upload, FileCheck, AlertCircle, User, CreditCard, Syringe, Hotel, Calendar } from 'lucide-react'
import { uploadPassportFile } from '@/lib/hajjPassport'
import Link from 'next/link'

// Petit composant Switch réutilisable pour les champs booléens
const FormToggle = ({ label, checked, onChange, disabled = false }: { label: string, checked: boolean, onChange: (val: boolean) => void, disabled?: boolean }) => (
  <div 
    onClick={() => !disabled && onChange(!checked)}
    className={`flex items-center justify-between p-4 border rounded-2xl transition-all select-none ${disabled ? 'bg-amber-50 border-amber-200 cursor-not-allowed' : 'bg-gray-50 border-gray-100 cursor-pointer hover:bg-gray-100'}`}
  >
    <span className={`text-xs font-black uppercase tracking-wider ${disabled ? 'text-amber-700' : 'text-gray-600'}`}>{label}</span>
    <div className={`w-12 h-6 flex items-center rounded-full p-1 transition-all duration-300 ${checked ? 'bg-blue-600' : 'bg-gray-300'}`}>
      <div className={`bg-white w-4 h-4 rounded-full shadow-md transform transition-transform duration-300 ${checked ? 'translate-x-6' : 'translate-x-0'}`} />
    </div>
  </div>
)

const sanitizeAmount = (value: string) => value.replace(/\D/g, '')
const parseAmount = (value: string) => {
  const cleaned = sanitizeAmount(value)
  return cleaned === '' ? 0 : Number(cleaned)
}
const formatAmount = (value: string | number) => {
  const digits = typeof value === 'number' ? String(value) : sanitizeAmount(value)
  return digits === '' ? '' : Number(digits).toLocaleString('fr-FR')
}

export default function ModifierPelerin() {
  const { id } = useParams()
  const router = useRouter()
  
  // États de contrôle de l'application
  const [loading, setLoading] = useState(true)
  const [updating, setUpdating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [file, setFile] = useState<File | null>(null)
  const [prixPackageInput, setPrixPackageInput] = useState('')
  const [totalPayeInput, setTotalPayeInput] = useState('')
  const [sessionLocked, setSessionLocked] = useState(false)

  // TOUS LES CHAMPS DE LA BASE DE DONNÉES EXACTEMENT ALIGNÉS
  const [formData, setFormData] = useState({
    prenom: '',
    nom_complet: '',
    sexe: '',
    telephone_pelerin: '',
    date_naissance: '',
    num_passeport: '',
    date_expiration: '',
    reference: '',
    agence_id: '',
    agence_ou_personne_associee: '',
    nom_package: '',
    prix_package: 0,
    total_paye: 0,
    vacciné: false,
    visite_medicale: false,
    formation_suivie: false,
    date_formation: '',
    groupe_formation: '',
    hotel_mecque: '',
    hotel_medine: '',
    hotel_statut: false,
    groupe_encadrement: '',
    date_depart: '',
    date_retour: '',
    visa_obtenu: false,
    sur_plateforme_gouv: false,
    sur_plateforme_nusuk: false,
    date_inscription: '',
    campagne: new Date().getFullYear(),
    document_url: ''
  })

  const isGouvLocked = Boolean(formData.sur_plateforme_gouv)
  const isFieldLockedForGouv = (field: string) => isGouvLocked && !['nom_package', 'prix_package', 'total_paye'].includes(field)

  // Gestionnaire dynamique des inputs de type texte, date, nombre
  const handleInputChange = (field: string, value: string | number | boolean) => {
    setFormData(prev => ({ ...prev, [field]: value }))
  }

  useEffect(() => {
    let active = true

    const loadSessionState = async () => {
      const [{ data: configData }, { data: sessionData }] = await Promise.all([
        supabase
          .from('hajj_campaign_config')
          .select('session_ouverte')
          .eq('id', 1)
          .maybeSingle(),
        supabase
          .from('hajj_sessions')
          .select('*')
          .eq('est_active', true)
          .order('date_ouverture', { ascending: false })
          .limit(1)
          .maybeSingle()
      ])

      if (!active) return

      const isSessionOpenInDb = Boolean(
        sessionData?.id && (
          sessionData?.est_active === true ||
          sessionData?.session_ouverte === true ||
          sessionData?.is_active === true
        )
      )

      setSessionLocked(!(isSessionOpenInDb || Boolean(configData?.session_ouverte)))
    }

    void loadSessionState()

    const channel = supabase
      .channel('session_lock_hajj_modifier')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'hajj_campaign_config' }, () => {
        void loadSessionState()
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'hajj_sessions' }, () => {
        void loadSessionState()
      })
      .subscribe()

    return () => {
      active = false
      void supabase.removeChannel(channel)
    }
  }, [])

  useEffect(() => {
    async function getPelerin() {
      try {
        const { data, error } = await supabase
          .from('pelerins')
          .select('*')
          .eq('id', id)
          .single()

        if (error) throw error

        if (data) {
          const formatDateTime = (dateStr: string | null) => {
            if (!dateStr) return ''
            return dateStr.slice(0, 16)
          }

          const prixPackage = Number(data.prix_package || 0)
          const totalPaye = Number(data.total_paye || 0)

          setFormData({
            prenom: data.prenom || '',
            nom_complet: data.nom_complet || '',
            sexe: data.sexe || '',
            telephone_pelerin: data.telephone_pelerin || '',
            date_naissance: data.date_naissance || '',
            num_passeport: data.num_passeport || '',
            date_expiration: data.date_expiration || '',
            reference: data.reference || '',
            agence_id: data.agence_id || '',
            agence_ou_personne_associee: data.agence_ou_personne_associee || '',
            nom_package: data.nom_package || '',
            prix_package: prixPackage,
            total_paye: totalPaye,
            vacciné: !!data.vacciné,
            visite_medicale: !!data.visite_medicale,
            formation_suivie: !!data.formation_suivie,
            date_formation: data.date_formation || '',
            groupe_formation: data.groupe_formation || '',
            hotel_mecque: data.hotel_mecque || '',
            hotel_medine: data.hotel_medine || '',
            hotel_statut: !!data.hotel_statut,
            groupe_encadrement: data.groupe_encadrement || '',
            date_depart: formatDateTime(data.date_depart),
            date_retour: formatDateTime(data.date_retour),
            visa_obtenu: !!data.visa_obtenu,
            sur_plateforme_gouv: !!data.sur_plateforme_gouv,
            sur_plateforme_nusuk: !!data.sur_plateforme_nusuk,
            date_inscription: data.date_inscription || '',
            campagne: data.campagne || new Date().getFullYear(),
            document_url: data.document_url || ''
          })
          setPrixPackageInput(formatAmount(prixPackage))
          setTotalPayeInput(formatAmount(totalPaye))
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Erreur inconnue'
        setError("Impossible de charger le pèlerin : " + message)
      } finally {
        setLoading(false)
      }
    }
    getPelerin()
  }, [id])

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault()
    if (sessionLocked && formData.sur_plateforme_gouv) {
      setError('La session GOUV est fermée, vous ne pouvez plus activer ce statut.')
      return
    }
    setUpdating(true)
    setError(null)
    
    try {
      let finalDocUrl = formData.document_url

      // 1. Upload du scan du passeport
      if (file) {
        const uploaded = await uploadPassportFile(file)
        finalDocUrl = uploaded.path
      }

      // Utilitaire pour transformer les chaînes vides en NULL pour PostgreSQL
      const cleanValue = <T,>(val: T) => (val === '' ? null : val)

      let activeSessionId: string | null = null
      if (formData.sur_plateforme_gouv) {
        const { data: sessionData } = await supabase
          .from('hajj_sessions')
          .select('id')
          .order('date_ouverture', { ascending: false })
          .limit(1)
          .maybeSingle()
        activeSessionId = sessionData?.id ?? null
      }

      // Payload adapté à la structure de la table pelerins
      const updatePayload = isGouvLocked
        ? {
            nom_package: cleanValue(formData.nom_package),
            prix_package: formData.prix_package,
            total_paye: formData.total_paye,
            document_url: finalDocUrl,
            hajj_session_id: formData.sur_plateforme_gouv ? activeSessionId : null
          }
        : {
            agence_id: formData.agence_id, // Nécessaire si vérifié par RLS
            prenom: cleanValue(formData.prenom),
            nom_complet: formData.nom_complet,
            sexe: cleanValue(formData.sexe), // Envoie 'HOMME', 'FEMME' ou null
            telephone_pelerin: cleanValue(formData.telephone_pelerin),
            date_naissance: cleanValue(formData.date_naissance),
            num_passeport: formData.num_passeport,
            date_expiration: cleanValue(formData.date_expiration),
            reference: cleanValue(formData.reference),
            agence_ou_personne_associee: cleanValue(formData.agence_ou_personne_associee),
            nom_package: cleanValue(formData.nom_package),
            prix_package: formData.prix_package,
            total_paye: formData.total_paye,
            vacciné: formData.vacciné,
            visite_medicale: formData.visite_medicale,
            formation_suivie: formData.formation_suivie,
            date_formation: cleanValue(formData.date_formation),
            groupe_formation: cleanValue(formData.groupe_formation),
            hotel_mecque: cleanValue(formData.hotel_mecque),
            hotel_medine: cleanValue(formData.hotel_medine),
            hotel_statut: formData.hotel_statut,
            groupe_encadrement: cleanValue(formData.groupe_encadrement),
            date_depart: cleanValue(formData.date_depart),
            date_retour: cleanValue(formData.date_retour),
            visa_obtenu: formData.visa_obtenu,
            sur_plateforme_gouv: formData.sur_plateforme_gouv,
            sur_plateforme_nusuk: formData.sur_plateforme_nusuk,
            date_inscription: cleanValue(formData.date_inscription),
            campagne: formData.campagne || null,
            document_url: finalDocUrl,
            hajj_session_id: formData.sur_plateforme_gouv ? activeSessionId : null
          }

      // 2. Mise à jour de Supabase
      const { error: updateError } = await supabase
        .from('pelerins')
        .update(updatePayload)
        .eq('id', id)

      if (updateError) throw updateError

      // 3. Navigation
      router.push(`/hajj/pelerin/${id}`)
      router.refresh()

    } catch (err: unknown) {
      console.error('Erreur lors de la mise à jour :', err)
      const message = err instanceof Error 
        ? err.message 
        : (typeof err === 'object' && err !== null && 'message' in err) 
          ? String((err as { message: string }).message) 
          : 'Erreur lors de la mise à jour'
      
      setError(message)
      setUpdating(false)
    }
  }

  if (loading) return (
    <div className="flex h-screen items-center justify-center bg-slate-50">
      <Loader2 className="animate-spin text-blue-600" size={44} />
    </div>
  )

  return (
    <div className="max-w-7xl mx-auto px-4 py-6 md:py-10">
      <Link href={`/hajj/pelerin/${id}`} className="flex items-center gap-2 text-gray-500 hover:text-blue-600 font-bold mb-6 transition group text-sm w-fit">
        <ArrowLeft size={18} className="group-hover:-translate-x-1 transition-transform" /> Retour au dossier
      </Link>

      <div className="bg-white rounded-[2rem] md:rounded-[2.5rem] shadow-xl shadow-blue-900/5 border border-gray-100 p-5 md:p-10">
        <h2 className="text-2xl md:text-3xl font-black text-gray-900 mb-8 uppercase tracking-tighter border-b border-gray-100 pb-4">
          Modifier le Pèlerin
        </h2>
        
        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-100 rounded-2xl flex items-center gap-3 text-red-600 font-bold text-sm">
            <AlertCircle size={20} className="shrink-0" /> {error}
          </div>
        )}

        {isGouvLocked && (
          <div className="mb-6 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-700">
            Ce pèlerin est déjà enregistré sur GOUV. Les informations personnelles et opérationnelles sont verrouillées. Seuls les montants financiers et le scan du passeport peuvent être mis à jour.
          </div>
        )}

        <form onSubmit={handleUpdate} className="space-y-8">
          
          {/* SECTION 1: ÉTAT CIVIL & CONTACT */}
          <div className="space-y-4">
            <h3 className="text-xs font-black text-blue-600 uppercase tracking-widest flex items-center gap-2">
              <User size={16} /> 1. État Civil & Contact
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              <div>
                <label className="block text-[10px] font-black text-gray-400 mb-1.5 uppercase tracking-wider">Prénom</label>
                <input 
                  type="text" value={formData.prenom} onChange={(e) => handleInputChange('prenom', e.target.value)}
                  disabled={isFieldLockedForGouv('prenom')}
                  className={`w-full px-4 py-3.5 rounded-xl border-2 border-gray-100 bg-gray-50 text-gray-900 font-bold outline-none transition-all text-sm ${isFieldLockedForGouv('prenom') ? 'opacity-60 cursor-not-allowed bg-slate-100' : 'focus:border-blue-600 focus:bg-white'}`}
                />
              </div>

              <div>
                <label className="block text-[10px] font-black text-gray-400 mb-1.5 uppercase tracking-wider">Nom Complet *</label>
                <input 
                  type="text" value={formData.nom_complet} onChange={(e) => handleInputChange('nom_complet', e.target.value)}
                  disabled={isFieldLockedForGouv('nom_complet')}
                  className={`w-full px-4 py-3.5 rounded-xl border-2 border-gray-100 bg-gray-50 text-gray-900 font-bold outline-none transition-all text-sm ${isFieldLockedForGouv('nom_complet') ? 'opacity-60 cursor-not-allowed bg-slate-100' : 'focus:border-blue-600 focus:bg-white'}`}
                  required 
                />
              </div>

              <div>
                <label className="block text-[10px] font-black text-gray-400 mb-1.5 uppercase tracking-wider">Genre / Sexe</label>
                <select 
                  value={formData.sexe} onChange={(e) => handleInputChange('sexe', e.target.value)}
                  disabled={isFieldLockedForGouv('sexe')}
                  className={`w-full px-4 py-3.5 rounded-xl border-2 border-gray-100 bg-gray-50 text-gray-900 font-bold outline-none transition-all text-sm appearance-none ${isFieldLockedForGouv('sexe') ? 'opacity-60 cursor-not-allowed bg-slate-100' : 'focus:border-blue-600 focus:bg-white'}`}
                >
                  <option value="">Non spécifié</option>
                  <option value="HOMME">HOMME</option>
                  <option value="FEMME">FEMME</option>
                </select>
              </div>

              <div>
                <label className="block text-[10px] font-black text-gray-400 mb-1.5 uppercase tracking-wider">Téléphone Pèlerin</label>
                <input 
                  type="tel" value={formData.telephone_pelerin} onChange={(e) => handleInputChange('telephone_pelerin', e.target.value)}
                  disabled={isFieldLockedForGouv('telephone_pelerin')}
                  className={`w-full px-4 py-3.5 rounded-xl border-2 border-gray-100 bg-gray-50 text-gray-900 font-bold outline-none transition-all text-sm ${isFieldLockedForGouv('telephone_pelerin') ? 'opacity-60 cursor-not-allowed bg-slate-100' : 'focus:border-blue-600 focus:bg-white'}`}
                />
              </div>

              <div>
                <label className="block text-[10px] font-black text-gray-400 mb-1.5 uppercase tracking-wider">Date de Naissance</label>
                <input 
                  type="date" value={formData.date_naissance} onChange={(e) => handleInputChange('date_naissance', e.target.value)}
                  disabled={isFieldLockedForGouv('date_naissance')}
                  className={`w-full px-4 py-3.5 rounded-xl border-2 border-gray-100 bg-gray-50 text-gray-900 font-bold outline-none transition-all text-sm ${isFieldLockedForGouv('date_naissance') ? 'opacity-60 cursor-not-allowed bg-slate-100' : 'focus:border-blue-600 focus:bg-white'}`}
                />
              </div>

              <div>
                <label className="block text-[10px] font-black text-gray-400 mb-1.5 uppercase tracking-wider">Date d'inscription administrative</label>
                <input 
                  type="date" value={formData.date_inscription} onChange={(e) => handleInputChange('date_inscription', e.target.value)}
                  disabled={isFieldLockedForGouv('date_inscription')}
                  className={`w-full px-4 py-3.5 rounded-xl border-2 border-gray-100 bg-gray-50 text-gray-900 font-bold outline-none transition-all text-sm ${isFieldLockedForGouv('date_inscription') ? 'opacity-60 cursor-not-allowed bg-slate-100' : 'focus:border-blue-600 focus:bg-white'}`}
                />
              </div>
              
              <div>
                <label className="block text-[10px] font-black text-gray-400 mb-1.5 uppercase tracking-wider">Campagne</label>
                <select
                  value={formData.campagne}
                  onChange={(e) => handleInputChange('campagne', Number(e.target.value))}
                  disabled={isFieldLockedForGouv('campagne')}
                  className={`w-full px-4 py-3.5 rounded-xl border-2 border-gray-100 bg-gray-50 text-gray-900 font-bold outline-none transition-all text-sm appearance-none ${isFieldLockedForGouv('campagne') ? 'opacity-60 cursor-not-allowed bg-slate-100' : 'focus:border-blue-600'}`}
                >
                  {(() => {
                    const start = 2024
                    const end = new Date().getFullYear() + 5
                    const opts: number[] = []
                    for (let y = start; y <= end; y++) opts.push(y)
                    return opts.map(y => <option key={y} value={y}>{y}</option>)
                  })()}
                </select>
              </div>
            </div>
          </div>

          {/* SECTION 2: PIÈCES D'IDENTITÉ & DOCUMENTS */}
          <div className="space-y-4 pt-4 border-t border-gray-50">
            <h3 className="text-xs font-black text-indigo-600 uppercase tracking-widest flex items-center gap-2">
              <CreditCard size={16} /> 2. Documents & Références
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              <div>
                <label className="block text-[10px] font-black text-gray-400 mb-1.5 uppercase tracking-wider">N° Passeport *</label>
                <input 
                  type="text" value={formData.num_passeport} onChange={(e) => handleInputChange('num_passeport', e.target.value)}
                  disabled={isFieldLockedForGouv('num_passeport')}
                  className={`w-full px-4 py-3.5 rounded-xl border-2 border-gray-100 bg-gray-50 text-gray-900 font-bold outline-none transition-all text-sm ${isFieldLockedForGouv('num_passeport') ? 'opacity-60 cursor-not-allowed bg-slate-100' : 'focus:border-blue-600 focus:bg-white'}`}
                  required 
                />
              </div>

              <div>
                <label className="block text-[10px] font-black text-gray-400 mb-1.5 uppercase tracking-wider">Date d'expiration Passeport</label>
                <input 
                  type="date" value={formData.date_expiration} onChange={(e) => handleInputChange('date_expiration', e.target.value)}
                  disabled={isFieldLockedForGouv('date_expiration')}
                  className={`w-full px-4 py-3.5 rounded-xl border-2 border-gray-100 bg-gray-50 text-gray-900 font-bold outline-none transition-all text-sm ${isFieldLockedForGouv('date_expiration') ? 'opacity-60 cursor-not-allowed bg-slate-100' : 'focus:border-blue-600 focus:bg-white'}`}
                />
              </div>

              <div>
                <label className="block text-[10px] font-black text-gray-400 mb-1.5 uppercase tracking-wider">Référence Interne</label>
                <input 
                  type="text" value={formData.reference} onChange={(e) => handleInputChange('reference', e.target.value)}
                  disabled={isFieldLockedForGouv('reference')}
                  className={`w-full px-4 py-3.5 rounded-xl border-2 border-gray-100 bg-gray-50 text-gray-900 font-bold outline-none transition-all text-sm ${isFieldLockedForGouv('reference') ? 'opacity-60 cursor-not-allowed bg-slate-100' : 'focus:border-blue-600 focus:bg-white'}`}
                />
              </div>

              <div className="md:col-span-2 lg:col-span-3">
                <label className="block text-[10px] font-black text-gray-400 mb-1.5 uppercase tracking-wider">Scan du Passeport (Image ou PDF)</label>
                <label className="flex items-center justify-center gap-3 w-full px-5 py-5 rounded-xl border-2 border-dashed border-gray-200 bg-gray-50 hover:bg-blue-50 hover:border-blue-400 cursor-pointer transition-all">
                  {file ? (
                    <div className="flex items-center gap-2 text-blue-600 font-bold text-sm">
                      <FileCheck size={20} /> {file.name}
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 text-gray-400 font-bold italic text-sm">
                      <Upload size={20} /> {formData.document_url ? "Remplacer le document existant" : "Sélectionner un fichier"}
                    </div>
                  )}
                  <input 
                    type="file" className="hidden" accept="image/*,.pdf" 
                    onChange={(e) => setFile(e.target.files?.[0] || null)}
                  />
                </label>
              </div>
            </div>
          </div>

          {/* SECTION 3: COMPTABILITÉ & FORFAIT */}
          <div className="space-y-4 pt-4 border-t border-gray-50">
            <h3 className="text-xs font-black text-emerald-600 uppercase tracking-widest flex items-center gap-2">
              <CreditCard size={16} /> 3. Tarification & Agence
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="md:col-span-2 lg:col-span-2">
                <label className="block text-[10px] font-black text-gray-400 mb-1.5 uppercase tracking-wider">Nom du Package / Offre</label>
                <input 
                  type="text" value={formData.nom_package} onChange={(e) => handleInputChange('nom_package', e.target.value)}
                  className="w-full px-4 py-3.5 rounded-xl border-2 border-gray-100 bg-gray-50 text-gray-900 font-bold focus:border-blue-600 focus:bg-white outline-none transition-all text-sm"
                />
              </div>

              <div>
                <label className="block text-[10px] font-black text-gray-400 mb-1.5 uppercase tracking-wider">Prix Package (CFA)</label>
                <input 
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9\s]*"
                  value={prixPackageInput}
                  onChange={(e) => {
                    setPrixPackageInput(formatAmount(e.target.value))
                    handleInputChange('prix_package', parseAmount(e.target.value))
                  }}
                  className="w-full px-4 py-3.5 rounded-xl border-2 border-gray-100 bg-gray-50 text-gray-900 font-bold focus:border-blue-600 focus:bg-white outline-none transition-all text-sm"
                />
              </div>

              <div>
                <label className="block text-[10px] font-black text-gray-400 mb-1.5 uppercase tracking-wider">Total Payé / Acomptes (CFA)</label>
                <input 
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9\s]*"
                  value={totalPayeInput}
                  onChange={(e) => {
                    setTotalPayeInput(formatAmount(e.target.value))
                    handleInputChange('total_paye', parseAmount(e.target.value))
                  }}
                  className="w-full px-4 py-3.5 rounded-xl border-2 border-gray-100 bg-gray-50 text-emerald-600 font-bold focus:border-blue-600 focus:bg-white outline-none transition-all text-sm"
                />
              </div>

              <div className="md:col-span-2 lg:col-span-4">
                <label className="block text-[10px] font-black text-gray-400 mb-1.5 uppercase tracking-wider">Agence ou Personne associée</label>
                <input 
                  type="text" value={formData.agence_ou_personne_associee} onChange={(e) => handleInputChange('agence_ou_personne_associee', e.target.value)}
                  disabled={isFieldLockedForGouv('agence_ou_personne_associee')}
                  className={`w-full px-4 py-3.5 rounded-xl border-2 border-gray-100 bg-gray-50 text-gray-900 font-bold outline-none transition-all text-sm ${isFieldLockedForGouv('agence_ou_personne_associee') ? 'opacity-60 cursor-not-allowed bg-slate-100' : 'focus:border-blue-600 focus:bg-white'}`}
                />
              </div>
            </div>
          </div>

          {/* SECTION 4: SUIVI OPÉRATIONNEL & VOLS */}
          <div className="space-y-4 pt-4 border-t border-gray-50">
            <h3 className="text-xs font-black text-purple-600 uppercase tracking-widest flex items-center gap-2">
              <Calendar size={16} /> 4. Logistique & Transports (Vols)
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-[10px] font-black text-gray-400 mb-1.5 uppercase tracking-wider">Date & Heure Vol Aller</label>
                <input 
                  type="datetime-local" value={formData.date_depart} onChange={(e) => handleInputChange('date_depart', e.target.value)}
                  disabled={isFieldLockedForGouv('date_depart')}
                  className={`w-full px-4 py-3.5 rounded-xl border-2 border-gray-100 bg-gray-50 text-gray-900 font-bold outline-none transition-all text-sm ${isFieldLockedForGouv('date_depart') ? 'opacity-60 cursor-not-allowed bg-slate-100' : 'focus:border-blue-600 focus:bg-white'}`}
                />
              </div>

              <div>
                <label className="block text-[10px] font-black text-gray-400 mb-1.5 uppercase tracking-wider">Date & Heure Vol Retour</label>
                <input 
                  type="datetime-local" value={formData.date_retour} onChange={(e) => handleInputChange('date_retour', e.target.value)}
                  disabled={isFieldLockedForGouv('date_retour')}
                  className={`w-full px-4 py-3.5 rounded-xl border-2 border-gray-100 bg-gray-50 text-gray-900 font-bold outline-none transition-all text-sm ${isFieldLockedForGouv('date_retour') ? 'opacity-60 cursor-not-allowed bg-slate-100' : 'focus:border-blue-600 focus:bg-white'}`}
                />
              </div>
            </div>
          </div>

          {/* SECTION 5: HÉBERGEMENT KSA & FORMATION */}
          <div className="space-y-4 pt-4 border-t border-gray-50">
            <h3 className="text-xs font-black text-orange-500 uppercase tracking-widest flex items-center gap-2">
              <Hotel size={16} /> 5. Formations & Hébergements KSA
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              <div>
                <label className="block text-[10px] font-black text-gray-400 mb-1.5 uppercase tracking-wider">Hôtel La Mecque</label>
                <input 
                  type="text" value={formData.hotel_mecque} onChange={(e) => handleInputChange('hotel_mecque', e.target.value)}
                  disabled={isFieldLockedForGouv('hotel_mecque')}
                  className={`w-full px-4 py-3.5 rounded-xl border-2 border-gray-100 bg-gray-50 text-gray-900 font-bold outline-none transition-all text-sm ${isFieldLockedForGouv('hotel_mecque') ? 'opacity-60 cursor-not-allowed bg-slate-100' : 'focus:border-blue-600 focus:bg-white'}`}
                />
              </div>

              <div>
                <label className="block text-[10px] font-black text-gray-400 mb-1.5 uppercase tracking-wider">Hôtel Médine</label>
                <input 
                  type="text" value={formData.hotel_medine} onChange={(e) => handleInputChange('hotel_medine', e.target.value)}
                  disabled={isFieldLockedForGouv('hotel_medine')}
                  className={`w-full px-4 py-3.5 rounded-xl border-2 border-gray-100 bg-gray-50 text-gray-900 font-bold outline-none transition-all text-sm ${isFieldLockedForGouv('hotel_medine') ? 'opacity-60 cursor-not-allowed bg-slate-100' : 'focus:border-blue-600 focus:bg-white'}`}
                />
              </div>

              <div>
                <label className="block text-[10px] font-black text-gray-400 mb-1.5 uppercase tracking-wider">Guide / Encadreur Assigné</label>
                <input 
                  type="text" value={formData.groupe_encadrement} onChange={(e) => handleInputChange('groupe_encadrement', e.target.value)}
                  disabled={isFieldLockedForGouv('groupe_encadrement')}
                  className={`w-full px-4 py-3.5 rounded-xl border-2 border-gray-100 bg-gray-50 text-gray-900 font-bold outline-none transition-all text-sm ${isFieldLockedForGouv('groupe_encadrement') ? 'opacity-60 cursor-not-allowed bg-slate-100' : 'focus:border-blue-600 focus:bg-white'}`}
                />
              </div>

              <div>
                <label className="block text-[10px] font-black text-gray-400 mb-1.5 uppercase tracking-wider">Date de Formation</label>
                <input 
                  type="date" value={formData.date_formation} onChange={(e) => handleInputChange('date_formation', e.target.value)}
                  disabled={isFieldLockedForGouv('date_formation')}
                  className={`w-full px-4 py-3.5 rounded-xl border-2 border-gray-100 bg-gray-50 text-gray-900 font-bold outline-none transition-all text-sm ${isFieldLockedForGouv('date_formation') ? 'opacity-60 cursor-not-allowed bg-slate-100' : 'focus:border-blue-600 focus:bg-white'}`}
                />
              </div>

              <div className="md:col-span-2">
                <label className="block text-[10px] font-black text-gray-400 mb-1.5 uppercase tracking-wider">Groupe de Formation</label>
                <input 
                  type="text" value={formData.groupe_formation} onChange={(e) => handleInputChange('groupe_formation', e.target.value)}
                  disabled={isFieldLockedForGouv('groupe_formation')}
                  className={`w-full px-4 py-3.5 rounded-xl border-2 border-gray-100 bg-gray-50 text-gray-900 font-bold outline-none transition-all text-sm ${isFieldLockedForGouv('groupe_formation') ? 'opacity-60 cursor-not-allowed bg-slate-100' : 'focus:border-blue-600 focus:bg-white'}`}
                />
              </div>
            </div>
          </div>

          {/* SECTION 6: ETATS ET ETAPES (BOOLEANS SWITCHES) */}
          <div className="space-y-4 pt-4 border-t border-gray-50">
            <h3 className="text-xs font-black text-teal-600 uppercase tracking-widest flex items-center gap-2">
              <Syringe size={16} /> 6. Jalons administratifs & Sanitaires
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              <FormToggle 
                label="Carnet Vaccinal Validé" 
                checked={formData.vacciné} 
                onChange={(val) => handleInputChange('vacciné', val)} 
                disabled={isGouvLocked}
              />
              <FormToggle 
                label="Visite Médicale OK" 
                checked={formData.visite_medicale} 
                onChange={(val) => handleInputChange('visite_medicale', val)} 
                disabled={isGouvLocked}
              />
              <FormToggle 
                label="Formation Suivie" 
                checked={formData.formation_suivie} 
                onChange={(val) => handleInputChange('formation_suivie', val)} 
                disabled={isGouvLocked}
              />
              <FormToggle 
                label="Chambres Assignées (Hôtel)" 
                checked={formData.hotel_statut} 
                onChange={(val) => handleInputChange('hotel_statut', val)} 
                disabled={isGouvLocked}
              />
              <FormToggle 
                label="Visa Hajj Obtenu" 
                checked={formData.visa_obtenu} 
                onChange={(val) => handleInputChange('visa_obtenu', val)} 
                disabled={isGouvLocked}
              />
              <div className="space-y-2">
                <FormToggle 
                  label={sessionLocked ? 'GOUV (verrouillé)' : 'Enregistré Gouv.ml'} 
                  checked={formData.sur_plateforme_gouv} 
                  onChange={(val) => handleInputChange('sur_plateforme_gouv', val)}
                  disabled={sessionLocked || isGouvLocked}
                />
                {sessionLocked && (
                  <p className="text-[11px] font-bold text-amber-700">La session GOUV est fermée, ce statut est verrouillé partout dans l’application Hajj.</p>
                )}
              </div>
              <FormToggle 
                label="Inscrit Nusuk (KSA)" 
                checked={formData.sur_plateforme_nusuk} 
                onChange={(val) => handleInputChange('sur_plateforme_nusuk', val)} 
                disabled={isGouvLocked}
              />
            </div>
          </div>

          {/* BOUTON DE SOUMISSION */}
          <button 
            type="submit" 
            disabled={updating}
            className="w-full flex items-center justify-center gap-3 bg-gray-900 text-white py-4.5 rounded-2xl font-black text-base shadow-xl hover:bg-blue-600 transition-all disabled:bg-gray-200 active:scale-[0.99] mt-8 cursor-pointer"
          >
            {updating ? <Loader2 className="animate-spin" size={20} /> : <Save size={20} />}
            {updating ? "ENREGISTREMENT DES DONNÉES..." : "SAUVEGARDER LES MODIFICATIONS"}
          </button>
        </form>
      </div>
    </div>
  )
}