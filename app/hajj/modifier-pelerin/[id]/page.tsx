'use client'
import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { Save, ArrowLeft, Loader2, Upload, FileCheck, AlertCircle, User, CreditCard, Syringe, Hotel, Calendar } from 'lucide-react'
import Link from 'next/link'

// Petit composant Switch réutilisable pour les champs booléens
const FormToggle = ({ label, checked, onChange }: { label: string, checked: boolean, onChange: (val: boolean) => void }) => (
  <div 
    onClick={() => onChange(!checked)}
    className="flex items-center justify-between p-4 bg-gray-50 border border-gray-100 rounded-2xl cursor-pointer hover:bg-gray-100 transition-all select-none"
  >
    <span className="text-xs font-black uppercase text-gray-600 tracking-wider">{label}</span>
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

  // TOUS LES CHAMPS DE LA BASE DE DONNÉES
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
    document_url: ''
  })

  // Gestionnaire dynamique des inputs de type texte, date, nombre
  const handleInputChange = (field: string, value: string | number | boolean) => {
    setFormData(prev => ({ ...prev, [field]: value }))
  }

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
          // Helper pour formater les timestamps (ISO) en format géré par <input type="datetime-local">
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
    setUpdating(true)
    setError(null)
    
    try {
      let finalDocUrl = formData.document_url

      // 1. Gestion de l'Upload du scan de passeport
      if (file) {
        const fileExt = file.name.split('.').pop()
        const fileName = `${Date.now()}.${fileExt}`

        const { error: uploadError } = await supabase.storage
          .from('passeports')
          .upload(fileName, file)

        if (uploadError) throw new Error("Erreur scan: " + uploadError.message)
        finalDocUrl = fileName
      }
      
      // 2. Mise à jour de tous les champs dans la table Supabase
      const { error: updateError } = await supabase
        .from('pelerins')
        .update({ 
          prenom: formData.prenom || null,
          nom_complet: formData.nom_complet, 
          sexe: formData.sexe || null,
          telephone_pelerin: formData.telephone_pelerin || null,
          date_naissance: formData.date_naissance || null,
          num_passeport: formData.num_passeport,
          date_expiration: formData.date_expiration || null,
          reference: formData.reference || null,
          agence_ou_personne_associee: formData.agence_ou_personne_associee || null,
          nom_package: formData.nom_package || null,
          prix_package: formData.prix_package,
          total_paye: formData.total_paye,
          vacciné: formData.vacciné,
          visite_medicale: formData.visite_medicale,
          formation_suivie: formData.formation_suivie,
          date_formation: formData.date_formation || null,
          groupe_formation: formData.groupe_formation || null,
          hotel_mecque: formData.hotel_mecque || null,
          hotel_medine: formData.hotel_medine || null,
          hotel_statut: formData.hotel_statut,
          groupe_encadrement: formData.groupe_encadrement || null,
          date_depart: formData.date_depart || null,
          date_retour: formData.date_retour || null,
          visa_obtenu: formData.visa_obtenu,
          sur_plateforme_gouv: formData.sur_plateforme_gouv,
          sur_plateforme_nusuk: formData.sur_plateforme_nusuk,
          date_inscription: formData.date_inscription || null,
          document_url: finalDocUrl 
        })
        .eq('id', id)

      if (updateError) throw updateError

      // 3. Navigation retour
      router.push(`/hajj/pelerin/${id}`)
      router.refresh()

    } catch (err) {
      console.error(err)
      const message = err instanceof Error ? err.message : 'Erreur de mise à jour';
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
      {/* Bouton Retour */}
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
                  className="w-full px-4 py-3.5 rounded-xl border-2 border-gray-100 bg-gray-50 text-gray-900 font-bold focus:border-blue-600 focus:bg-white outline-none transition-all text-sm"
                />
              </div>

              <div>
                <label className="block text-[10px] font-black text-gray-400 mb-1.5 uppercase tracking-wider">Nom Complet *</label>
                <input 
                  type="text" value={formData.nom_complet} onChange={(e) => handleInputChange('nom_complet', e.target.value)}
                  className="w-full px-4 py-3.5 rounded-xl border-2 border-gray-100 bg-gray-50 text-gray-900 font-bold focus:border-blue-600 focus:bg-white outline-none transition-all text-sm"
                  required 
                />
              </div>

              <div>
                <label className="block text-[10px] font-black text-gray-400 mb-1.5 uppercase tracking-wider">Genre / Sexe</label>
                <select 
                  value={formData.sexe} onChange={(e) => handleInputChange('sexe', e.target.value)}
                  className="w-full px-4 py-3.5 rounded-xl border-2 border-gray-100 bg-gray-50 text-gray-900 font-bold focus:border-blue-600 focus:bg-white outline-none transition-all text-sm appearance-none"
                >
                  <option value="">Non spécifié</option>
                  <option value="Masculin">Masculin</option>
                  <option value="Féminin">Féminin</option>
                </select>
              </div>

              <div>
                <label className="block text-[10px] font-black text-gray-400 mb-1.5 uppercase tracking-wider">Téléphone Pèlerin</label>
                <input 
                  type="tel" value={formData.telephone_pelerin} onChange={(e) => handleInputChange('telephone_pelerin', e.target.value)}
                  className="w-full px-4 py-3.5 rounded-xl border-2 border-gray-100 bg-gray-50 text-gray-900 font-bold focus:border-blue-600 focus:bg-white outline-none transition-all text-sm"
                />
              </div>

              <div>
                <label className="block text-[10px] font-black text-gray-400 mb-1.5 uppercase tracking-wider">Date de Naissance</label>
                <input 
                  type="date" value={formData.date_naissance} onChange={(e) => handleInputChange('date_naissance', e.target.value)}
                  className="w-full px-4 py-3.5 rounded-xl border-2 border-gray-100 bg-gray-50 text-gray-900 font-bold focus:border-blue-600 focus:bg-white outline-none transition-all text-sm"
                />
              </div>

              <div>
                <label className="block text-[10px] font-black text-gray-400 mb-1.5 uppercase tracking-wider">Date d'inscription administrative</label>
                <input 
                  type="date" value={formData.date_inscription} onChange={(e) => handleInputChange('date_inscription', e.target.value)}
                  className="w-full px-4 py-3.5 rounded-xl border-2 border-gray-100 bg-gray-50 text-gray-900 font-bold focus:border-blue-600 focus:bg-white outline-none transition-all text-sm"
                />
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
                  className="w-full px-4 py-3.5 rounded-xl border-2 border-gray-100 bg-gray-50 text-gray-900 font-bold focus:border-blue-600 focus:bg-white outline-none transition-all text-sm"
                  required 
                />
              </div>

              <div>
                <label className="block text-[10px] font-black text-gray-400 mb-1.5 uppercase tracking-wider">Date d'expiration Passeport</label>
                <input 
                  type="date" value={formData.date_expiration} onChange={(e) => handleInputChange('date_expiration', e.target.value)}
                  className="w-full px-4 py-3.5 rounded-xl border-2 border-gray-100 bg-gray-50 text-gray-900 font-bold focus:border-blue-600 focus:bg-white outline-none transition-all text-sm"
                />
              </div>

              <div>
                <label className="block text-[10px] font-black text-gray-400 mb-1.5 uppercase tracking-wider">Référence Interne</label>
                <input 
                  type="text" value={formData.reference} onChange={(e) => handleInputChange('reference', e.target.value)}
                  className="w-full px-4 py-3.5 rounded-xl border-2 border-gray-100 bg-gray-50 text-gray-900 font-bold focus:border-blue-600 focus:bg-white outline-none transition-all text-sm"
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
                  className="w-full px-4 py-3.5 rounded-xl border-2 border-gray-100 bg-gray-50 text-gray-900 font-bold focus:border-blue-600 focus:bg-white outline-none transition-all text-sm"
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
                  className="w-full px-4 py-3.5 rounded-xl border-2 border-gray-100 bg-gray-50 text-gray-900 font-bold focus:border-blue-600 focus:bg-white outline-none transition-all text-sm"
                />
              </div>

              <div>
                <label className="block text-[10px] font-black text-gray-400 mb-1.5 uppercase tracking-wider">Date & Heure Vol Retour</label>
                <input 
                  type="datetime-local" value={formData.date_retour} onChange={(e) => handleInputChange('date_retour', e.target.value)}
                  className="w-full px-4 py-3.5 rounded-xl border-2 border-gray-100 bg-gray-50 text-gray-900 font-bold focus:border-blue-600 focus:bg-white outline-none transition-all text-sm"
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
                  className="w-full px-4 py-3.5 rounded-xl border-2 border-gray-100 bg-gray-50 text-gray-900 font-bold focus:border-blue-600 focus:bg-white outline-none transition-all text-sm"
                />
              </div>

              <div>
                <label className="block text-[10px] font-black text-gray-400 mb-1.5 uppercase tracking-wider">Hôtel Médine</label>
                <input 
                  type="text" value={formData.hotel_medine} onChange={(e) => handleInputChange('hotel_medine', e.target.value)}
                  className="w-full px-4 py-3.5 rounded-xl border-2 border-gray-100 bg-gray-50 text-gray-900 font-bold focus:border-blue-600 focus:bg-white outline-none transition-all text-sm"
                />
              </div>

              <div>
                <label className="block text-[10px] font-black text-gray-400 mb-1.5 uppercase tracking-wider">Guide / Encadreur Assigné</label>
                <input 
                  type="text" value={formData.groupe_encadrement} onChange={(e) => handleInputChange('groupe_encadrement', e.target.value)}
                  className="w-full px-4 py-3.5 rounded-xl border-2 border-gray-100 bg-gray-50 text-gray-900 font-bold focus:border-blue-600 focus:bg-white outline-none transition-all text-sm"
                />
              </div>

              <div>
                <label className="block text-[10px] font-black text-gray-400 mb-1.5 uppercase tracking-wider">Date de Formation</label>
                <input 
                  type="date" value={formData.date_formation} onChange={(e) => handleInputChange('date_formation', e.target.value)}
                  className="w-full px-4 py-3.5 rounded-xl border-2 border-gray-100 bg-gray-50 text-gray-900 font-bold focus:border-blue-600 focus:bg-white outline-none transition-all text-sm"
                />
              </div>

              <div className="md:col-span-2">
                <label className="block text-[10px] font-black text-gray-400 mb-1.5 uppercase tracking-wider">Groupe de Formation</label>
                <input 
                  type="text" value={formData.groupe_formation} onChange={(e) => handleInputChange('groupe_formation', e.target.value)}
                  className="w-full px-4 py-3.5 rounded-xl border-2 border-gray-100 bg-gray-50 text-gray-900 font-bold focus:border-blue-600 focus:bg-white outline-none transition-all text-sm"
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
              />
              <FormToggle 
                label="Visite Médicale OK" 
                checked={formData.visite_medicale} 
                onChange={(val) => handleInputChange('visite_medicale', val)} 
              />
              <FormToggle 
                label="Formation Suivie" 
                checked={formData.formation_suivie} 
                onChange={(val) => handleInputChange('formation_suivie', val)} 
              />
              <FormToggle 
                label="Chambres Assignées (Hôtel)" 
                checked={formData.hotel_statut} 
                onChange={(val) => handleInputChange('hotel_statut', val)} 
              />
              <FormToggle 
                label="Visa Hajj Obtenu" 
                checked={formData.visa_obtenu} 
                onChange={(val) => handleInputChange('visa_obtenu', val)} 
              />
              <FormToggle 
                label="Enregistré Gouv.ml" 
                checked={formData.sur_plateforme_gouv} 
                onChange={(val) => handleInputChange('sur_plateforme_gouv', val)} 
              />
              <FormToggle 
                label="Inscrit Nusuk (KSA)" 
                checked={formData.sur_plateforme_nusuk} 
                onChange={(val) => handleInputChange('sur_plateforme_nusuk', val)} 
              />
            </div>
          </div>

          {/* BOUTON DE SOUMISSION */}
          <button 
            type="submit" 
            disabled={updating}
            className="w-full flex items-center justify-center gap-3 bg-gray-900 text-white py-4.5 rounded-2xl font-black text-base shadow-xl hover:bg-blue-600 transition-all disabled:bg-gray-200 active:scale-[0.99] mt-8"
          >
            {updating ? <Loader2 className="animate-spin" size={20} /> : <Save size={20} />}
            {updating ? "ENREGISTREMENT DES DONNÉES..." : "SAUVEGARDER LES MODIFICATIONS"}
          </button>
        </form>
      </div>
    </div>
  )
}