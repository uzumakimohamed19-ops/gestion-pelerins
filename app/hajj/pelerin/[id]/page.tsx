'use client'
import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { supabase, getUser } from '@/lib/supabase'
import { 
  User, CreditCard, ArrowLeft, Pencil, Printer, Save, Syringe, 
  BookOpen, Hotel, Plane, Loader2, ShieldCheck, Tag, Building, 
  AlertTriangle, MessageCircle, Clock, TrendingUp, UserPlus, FileCheck, PlaneTakeoff,
  UserCheck, UserRound, Globe, CheckCircle2, HelpCircle
} from 'lucide-react'
import Link from 'next/link'

// ─── AVATARS PÈLERINS AFRICAINS DYNAMIQUES (SVG) ─────────────────────────────

const AvatarHommeJeune = ({ size = 56 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 72 72" fill="none" xmlns="http://www.w3.org/2000/svg">
    <circle cx="36" cy="36" r="36" fill="#1a1a2e"/>
    {/* Corps ihram blanc (épaule droite découverte) */}
    <path d="M16,72 Q14,54 18,44 Q26,36 36,38 Q46,36 54,44 Q58,54 56,72Z" fill="#f8f8f8"/>
    <path d="M54,44 Q62,46 60,72 L56,72 Q58,54 54,44Z" fill="#ededed"/>
    {/* Cou */}
    <rect x="31" y="38" width="10" height="8" rx="3" fill="#7a4e2d"/>
    {/* Tête */}
    <ellipse cx="36" cy="28" rx="13" ry="14" fill="#8B5E3C"/>
    {/* Cheveux noirs courts */}
    <path d="M23,22 Q24,14 36,12 Q48,14 49,22 Q46,16 36,15 Q26,16 23,22Z" fill="#1a0a00"/>
    {/* Traits du visage */}
    <ellipse cx="30" cy="26" rx="2" ry="2.5" fill="#3d1a00"/>
    <ellipse cx="42" cy="26" rx="2" ry="2.5" fill="#3d1a00"/>
    <path d="M30,34 Q36,37 42,34" stroke="#5a3020" strokeWidth="1.2" fill="none" strokeLinecap="round"/>
    <path d="M27,22 Q30,20 33,22" stroke="#1a0a00" strokeWidth="1.5" fill="none" strokeLinecap="round"/>
    <path d="M39,22 Q42,20 45,22" stroke="#1a0a00" strokeWidth="1.5" fill="none" strokeLinecap="round"/>
  </svg>
);

const AvatarHommeVieux = ({ size = 56 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 72 72" fill="none" xmlns="http://www.w3.org/2000/svg">
    <circle cx="36" cy="36" r="36" fill="#1a1a2e"/>
    {/* Corps ihram blanc */}
    <path d="M16,72 Q14,54 18,44 Q26,36 36,38 Q46,36 54,44 Q58,54 56,72Z" fill="#f8f8f8"/>
    <path d="M54,44 Q62,46 60,72 L56,72 Q58,54 54,44Z" fill="#ededed"/>
    {/* Barbe blanche */}
    <path d="M24,34 Q22,44 26,48 Q36,52 46,48 Q50,44 48,34 Q42,40 36,40 Q30,40 24,34Z" fill="#d8d0c4"/>
    {/* Cou */}
    <rect x="31" y="38" width="10" height="6" rx="3" fill="#6a3e25"/>
    {/* Tête */}
    <ellipse cx="36" cy="27" rx="13" ry="14" fill="#7a4e2d"/>
    {/* Cheveux gris/blancs */}
    <path d="M23,21 Q24,13 36,11 Q48,13 49,21 Q46,15 36,14 Q26,15 23,21Z" fill="#b8b0a4"/>
    {/* Tempes grises */}
    <path d="M23,21 Q21,26 22,30 Q24,25 23,21Z" fill="#c8c0b4"/>
    <path d="M49,21 Q51,26 50,30 Q48,25 49,21Z" fill="#c8c0b4"/>
    {/* Yeux */}
    <ellipse cx="30" cy="25" rx="2" ry="2.5" fill="#3d1a00"/>
    <ellipse cx="42" cy="25" rx="2" ry="2.5" fill="#3d1a00"/>
    {/* Sourcils gris */}
    <path d="M27,21 Q30,19 33,21" stroke="#a09080" strokeWidth="1.5" fill="none" strokeLinecap="round"/>
    <path d="M39,21 Q42,19 45,21" stroke="#a09080" strokeWidth="1.5" fill="none" strokeLinecap="round"/>
    {/* Rides */}
    <path d="M26,25 Q28,24 30,25" stroke="#5a3020" strokeWidth="0.8" fill="none" strokeLinecap="round"/>
    <path d="M42,25 Q44,24 46,25" stroke="#5a3020" strokeWidth="0.8" fill="none" strokeLinecap="round"/>
    <path d="M28,31 Q32,33 36,33 Q40,33 44,31" stroke="#5a3020" strokeWidth="0.8" fill="none" strokeLinecap="round"/>
    <path d="M24,20 Q22,15 24,12" stroke="#6a4030" strokeWidth="0.8" fill="none" strokeLinecap="round"/>
    <path d="M48,20 Q50,15 48,12" stroke="#6a4030" strokeWidth="0.8" fill="none" strokeLinecap="round"/>
  </svg>
);

const AvatarFemmeJeune = ({ size = 56 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 72 72" fill="none" xmlns="http://www.w3.org/2000/svg">
    <circle cx="36" cy="36" r="36" fill="#1a1a2e"/>
    {/* Corps abaya blanc */}
    <path d="M14,72 Q12,52 16,42 Q24,34 36,36 Q48,34 56,42 Q60,52 58,72Z" fill="#f0f0f0"/>
    {/* Côtés drapés hijab */}
    <path d="M16,42 Q10,48 12,72 L16,72 Q14,54 16,42Z" fill="#f5f5f5"/>
    <path d="M56,42 Q62,48 60,72 L56,72 Q58,54 56,42Z" fill="#f5f5f5"/>
    {/* Hijab blanc bien drapé */}
    <path d="M19,22 Q36,10 53,22 Q58,30 56,42 Q46,34 36,34 Q26,34 16,42 Q14,30 19,22Z" fill="#f0f0f0"/>
    {/* Cou */}
    <rect x="31" y="34" width="10" height="6" rx="3" fill="#7a4e2d"/>
    {/* Visage */}
    <ellipse cx="36" cy="26" rx="12" ry="13" fill="#8B5E3C"/>
    {/* Yeux */}
    <ellipse cx="30" cy="24" rx="2" ry="2.5" fill="#3d1a00"/>
    <ellipse cx="42" cy="24" rx="2" ry="2.5" fill="#3d1a00"/>
    {/* Sourcils */}
    <path d="M27,20 Q30,18 33,20" stroke="#3d1a00" strokeWidth="1.5" fill="none" strokeLinecap="round"/>
    <path d="M39,20 Q42,18 45,20" stroke="#3d1a00" strokeWidth="1.5" fill="none" strokeLinecap="round"/>
    {/* Sourire */}
    <path d="M30,32 Q36,36 42,32" stroke="#5a3020" strokeWidth="1.2" fill="none" strokeLinecap="round"/>
  </svg>
);

const AvatarFemmeVieille = ({ size = 56 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 72 72" fill="none" xmlns="http://www.w3.org/2000/svg">
    <circle cx="36" cy="36" r="36" fill="#1a1a2e"/>
    {/* Corps abaya */}
    <path d="M14,72 Q12,52 16,42 Q24,34 36,36 Q48,34 56,42 Q60,52 58,72Z" fill="#e8e4de"/>
    <path d="M16,42 Q10,48 12,72 L16,72 Q14,54 16,42Z" fill="#ede9e3"/>
    <path d="M56,42 Q62,48 60,72 L56,72 Q58,54 56,42Z" fill="#ede9e3"/>
    {/* Hijab grisé (cheveux blancs sous) */}
    <path d="M19,22 Q36,10 53,22 Q58,30 56,42 Q46,34 36,34 Q26,34 16,42 Q14,30 19,22Z" fill="#e0dcd4"/>
    {/* Cou */}
    <rect x="31" y="34" width="10" height="6" rx="3" fill="#6a3e25"/>
    {/* Visage plus marqué */}
    <ellipse cx="36" cy="26" rx="12" ry="13" fill="#7a4e2d"/>
    {/* Yeux */}
    <ellipse cx="30" cy="24" rx="1.8" ry="2.2" fill="#3d1a00"/>
    <ellipse cx="42" cy="24" rx="1.8" ry="2.2" fill="#3d1a00"/>
    {/* Sourcils gris */}
    <path d="M27,20 Q30,18 33,20" stroke="#a09080" strokeWidth="1.5" fill="none" strokeLinecap="round"/>
    <path d="M39,20 Q42,18 45,20" stroke="#a09080" strokeWidth="1.5" fill="none" strokeLinecap="round"/>
    {/* Rides marquées */}
    <path d="M26,23 Q28,22 30,23" stroke="#5a3020" strokeWidth="0.9" fill="none" strokeLinecap="round"/>
    <path d="M42,23 Q44,22 46,23" stroke="#5a3020" strokeWidth="0.9" fill="none" strokeLinecap="round"/>
    <path d="M28,30 Q32,32 36,32 Q40,32 44,30" stroke="#5a3020" strokeWidth="1" fill="none" strokeLinecap="round"/>
    <path d="M24,26 Q22,28 24,32" stroke="#5a3020" strokeWidth="0.7" fill="none" strokeLinecap="round"/>
    <path d="M48,26 Q50,28 48,32" stroke="#5a3020" strokeWidth="0.7" fill="none" strokeLinecap="round"/>
    {/* Joues creusées */}
    <path d="M24,27 Q26,30 28,28" stroke="#5a3020" strokeWidth="0.7" fill="none" strokeLinecap="round"/>
    <path d="M48,27 Q46,30 44,28" stroke="#5a3020" strokeWidth="0.7" fill="none" strokeLinecap="round"/>
  </svg>
);

// ─── PROGRESS BAR ───────────────────────────────────────────────────────────
const ProgressBar = ({ pct }: { pct: number }) => (
  <div className="w-full bg-gray-100 rounded-full h-2.5 overflow-hidden">
    <div
      className={`h-full rounded-full transition-all duration-700 ${
        pct >= 100
          ? 'bg-gradient-to-r from-emerald-400 to-teal-500'
          : pct >= 50
          ? 'bg-gradient-to-r from-blue-400 to-indigo-500'
          : 'bg-gradient-to-r from-orange-400 to-amber-500'
      }`}
      style={{ width: `${Math.min(pct, 100)}%` }}
    />
  </div>
);

// ─── TIMELINE DE STATUT CORRIGÉE ─────────────────────────────────────────────
const StatusTimeline = ({ p }: { p: any }) => {
  const steps = [
    { label: 'Inscription', done: !!p.date_inscription, icon: <UserCheck size={20} /> },
    { label: 'Santé', done: !!p.vacciné && !!p.visite_medicale, icon: <Syringe size={20} /> },
    { label: 'Formation', done: !!p.formation_suivie, icon: <BookOpen size={20} /> },
    { label: 'Visa', done: !!p.visa_obtenu, icon: <Globe size={20} /> },
    {
      label: 'Départ',
      done: !!p.date_depart && new Date(p.date_depart) <= new Date(),
      icon: <Plane size={20} />,
    },
    {
      label: 'Retour',
      done: !!p.date_retour && new Date(p.date_retour) <= new Date(),
      icon: <CheckCircle2 size={20} />,
    },
  ]

  return (
    <div className="w-full overflow-x-auto py-4">
      <div className="relative w-full min-w-[760px] px-3">
        <div className="absolute inset-x-0 top-12 h-1 bg-slate-100" />
        <div className="relative flex items-center justify-between gap-4">
          {steps.map((step, i) => (
            <div key={i} className="flex flex-col items-center gap-3 flex-1 min-w-[120px]">
              <div className="relative z-10">
                <div
                  className={`w-16 h-16 rounded-full flex items-center justify-center transition-all duration-300 ${
                    step.done
                      ? 'bg-emerald-100 text-emerald-600 ring-2 ring-emerald-300'
                      : 'bg-gray-100 text-gray-400 ring-1 ring-gray-200'
                  }`}
                >
                  {step.icon}
                </div>
              </div>
              <span
                className={`text-sm font-black uppercase tracking-[0.15em] text-center leading-none ${
                  step.done ? 'text-emerald-600' : 'text-slate-500'
                }`}
              >
                {step.label}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
};

const ToggleSwitch = ({ checked, activeColor = "bg-blue-500" }: { checked: boolean, activeColor?: string }) => (
  <div className={`w-12 h-6 flex items-center rounded-full p-1 transition-all duration-300 ease-in-out shadow-inner ${checked ? activeColor : 'bg-gray-300'}`}>
    <div className={`bg-white w-4 h-4 rounded-full shadow-md transform transition-transform duration-300 ease-in-out ${checked ? 'translate-x-6' : 'translate-x-0'}`} />
  </div>
);

export default function DetailsPelerin() {
  const { id } = useParams()
  const router = useRouter()
  const [p, setPelerin] = useState<any | null>(null)
  const [loading, setLoading] = useState(true)
  const [updating, setUpdating] = useState(false)
  const [role, setRole] = useState<string>('staff')
  const [avatarImgError, setAvatarImgError] = useState({ female: false, male: false })

  const handleChange = (field: string, value: any) => {
    if (!p) return
    setPelerin({ ...p, [field]: value })
  }

  const saveAdvancedData = async () => {
    if (!p?.id) return
    setUpdating(true)
    const { error } = await supabase
      .from('pelerins')
      .update({
        reference: p.reference || null,
        agence_ou_personne_associee: p.agence_ou_personne_associee || null,
        vacciné: p.vacciné,
        visite_medicale: p.visite_medicale,
        formation_suivie: p.formation_suivie,
        date_formation: p.date_formation || null,
        groupe_formation: p.groupe_formation || null,
        hotel_mecque: p.hotel_mecque || null,
        hotel_medine: p.hotel_medine || null,
        hotel_statut: p.hotel_statut,
        groupe_encadrement: p.groupe_encadrement || null,
        date_depart: p.date_depart || null,
        date_retour: p.date_retour || null,
        visa_obtenu: p.visa_obtenu
      })
      .eq('id', p.id)

    if (!error) alert("🚀 Dossier mis à jour avec succès !")
    else alert("Erreur : " + error.message)
    setUpdating(false)
  }

  useEffect(() => {
    async function getPelerin() {
      if (!id) return
      const cleanId = Array.isArray(id) ? id[0] : id
      const { data, error } = await supabase.from('pelerins').select(`*, agences ( nom_agence )`).eq('id', cleanId).single()
      if (!error) setPelerin(data)

      try {
        const { data: userData } = await getUser()
        if (userData?.user?.id) {
          const { data: profileData } = await supabase.from('profiles').select('role').eq('id', userData.user.id).single()
          if (profileData?.role) setRole(profileData.role)
        }
      } catch (e) { console.error(e) }
      finally { setLoading(false) }
    }
    getPelerin()
  }, [id])

  if (loading) return (
    <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center font-black text-blue-600 gap-4">
      <Loader2 className="animate-spin text-blue-600" size={48} />
      <span className="tracking-widest text-xs animate-pulse">CHARGEMENT DU DOSSIER EN COURS...</span>
    </div>
  )
  
  if (!p) return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50">
      <div className="p-10 text-center font-black text-red-400 bg-white rounded-3xl shadow-xl border border-red-100">PÈLERIN INTROUVABLE.</div>
    </div>
  )

  // --- LOGIQUE MÉTIER & CALCULS INTELLIGENTS ---
  const totalDue = p.prix_package || 0
  const totalPaid = p.total_paye || 0
  const resteAPayer = totalDue - totalPaid
  const paiementTermine = totalDue > 0 && resteAPayer <= 0

  let age = null
  if (p.date_naissance) {
    const birthDate = new Date(p.date_naissance)
    const today = new Date()
    age = today.getFullYear() - birthDate.getFullYear()
    const m = today.getMonth() - birthDate.getMonth()
    if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) age--
  }
  

  let passeportDanger = false
  let joursRestantsPasseport = 0
  if (p.date_expiration) {
    const diffTime = new Date(p.date_expiration).getTime() - new Date().getTime()
    joursRestantsPasseport = Math.ceil(diffTime / (1000 * 60 * 60 * 24))
    if (joursRestantsPasseport < 180) passeportDanger = true
  }

  let joursAvantDepart = null
  if (p.date_depart) {
    const diffTime = new Date(p.date_depart).getTime() - new Date().getTime()
    joursAvantDepart = Math.ceil(diffTime / (1000 * 60 * 60 * 24))
  }

  let statutDynamique = "En préparation"
  let statutColor = "bg-amber-50 text-amber-700 border-amber-200"
  const maintenant = new Date()
  if (p.date_retour && maintenant > new Date(p.date_retour)) {
    statutDynamique = "Retourné"
    statutColor = "bg-slate-100 text-slate-700 border-slate-200"
  } else if (p.date_depart && p.date_retour && maintenant >= new Date(p.date_depart) && maintenant <= new Date(p.date_retour)) {
    statutDynamique = "En voyage"
    statutColor = "bg-indigo-50 text-indigo-700 border-indigo-200"
  } else if (p.visa_obtenu) {
    statutDynamique = "Prêt"
    statutColor = "bg-emerald-50 text-emerald-700 border-emerald-200"
  }

  let niveauRisque = "Faible"
  let risqueColor = "text-emerald-600 bg-emerald-50 border-emerald-100"
  if (passeportDanger || (joursAvantDepart !== null && joursAvantDepart < 15 && !p.visa_obtenu)) {
    niveauRisque = "Élevé"
    risqueColor = "text-red-600 bg-red-50 border-red-100 animate-pulse"
  } else if (!p.vacciné || !p.visite_medicale || !p.sur_plateforme_gov) {
    niveauRisque = "Moyen"
    risqueColor = "text-orange-600 bg-orange-50 border-orange-100"
  }

  const etapesCalcul = [
    !!p.date_inscription,
    (!!p.vacciné && !!p.visite_medicale),
    !!p.formation_suivie,
    !!p.visa_obtenu,
    (!!p.date_depart && new Date(p.date_depart) <= new Date()),
    (!!p.date_retour && new Date(p.date_retour) <= new Date())
  ]
  const etapesReussies = etapesCalcul.filter(Boolean).length
  const pourcentageProgression = Math.round((etapesReussies / etapesCalcul.length) * 100)

  const messageWhatsApp = `Bonjour, voici un point sur le suivi de votre dossier Hajj. Statut : ${statutDynamique}. Reste à payer : ${resteAPayer.toLocaleString()} CFA.`
  const urlWhatsApp = p.telephone_pelerin ? `https://wa.me/${p.telephone_pelerin.replace(/\s+/g, '')}?text=${encodeURIComponent(messageWhatsApp)}` : '#'

  // Logique de détection du genre et de l'âge
  const genreNettoye = (p.sexe || p.genre || '').toLowerCase()
  const estFemme = genreNettoye.startsWith('f')
  const estVieux = age !== null && age > 50

  return (
    <div className="min-h-screen bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-slate-100 via-slate-50 to-white pb-16 transition-all duration-500">
      <div className="max-w-7xl mx-auto px-4 py-6 md:py-8 space-y-6 animate-fadeIn">
        
        {/* --- HEADER ACTIONS ET STATUTS CONTEXTUELS --- */}
        <div className="bg-white p-6 md:p-8 rounded-[2rem] shadow-xl shadow-slate-200/60 border border-slate-100/80 relative overflow-hidden transition-transform duration-300 hover:shadow-2xl">
          <div className="flex flex-col xl:flex-row justify-between gap-6 relative z-10">
            <div>
                <Link href="/hajj/liste-pelerins" className="group flex items-center gap-2 text-slate-400 font-bold hover:text-blue-600 transition-all text-xs mb-3 w-fit">
                  <ArrowLeft size={16} className="transform group-hover:-translate-x-1 transition-transform" /> Retour à la liste
                </Link>
                <div className="flex items-center gap-3 flex-wrap mb-2">
                  
                  {/* AVATAR DYNAMIQUE : genre + âge — préfère un PNG féminin dans /public/images */}
                  <div className={`p-1.5 rounded-2xl border shadow-sm transition-all flex-shrink-0 ${estFemme ? 'bg-pink-50 border-pink-200' : 'bg-blue-50 border-blue-200'}`}>
                    {estFemme ? (
                      !avatarImgError.female ? (
                        <img
                          src="/images/woman-with-headscarf-medium-dark-skin-tone-svgrepo-com.svg"
                          alt="Avatar femme"
                          width={56}
                          height={56}
                          onError={() => setAvatarImgError(prev => ({ ...prev, female: true }))}
                          className="w-14 h-14 rounded-full object-cover"
                        />
                      ) : (
                        (estVieux ? <AvatarFemmeVieille size={56} /> : <AvatarFemmeJeune size={56} />)
                      )
                    ) : (
                      estVieux ? (
                        <AvatarHommeVieux size={56} />
                      ) : (
                        !avatarImgError.male ? (
                          <img
                            src="/images/1547510251.svg"
                            alt="Avatar homme"
                            width={56}
                            height={56}
                            onError={() => setAvatarImgError(prev => ({ ...prev, male: true }))}
                            className="w-14 h-14 rounded-full object-cover"
                          />
                        ) : (
                          <AvatarHommeJeune size={56} />
                        )
                      )
                    )}
                  </div>

                  <div>
                    <h1 className="text-3xl md:text-4xl font-black text-slate-900 uppercase tracking-tight flex items-center flex-wrap">
                      {p.prenom && <span className="font-light mr-2 text-slate-400 lowercase first-letter:uppercase">{p.prenom}</span>}
                      {p.nom_complet}
                    </h1>
                    {p.telephone_pelerin && (
                      <p className="text-sm font-semibold text-slate-500 mt-1 flex items-center gap-1">
                        📱 Tel : <span className="text-slate-700 font-bold">{p.telephone_pelerin}</span>
                      </p>
                    )}
                  </div>

                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`px-4 py-1 rounded-full text-xs font-black uppercase border tracking-wider transition-all ${statutColor}`}>
                      {statutDynamique}
                    </span>
                    <span className={`px-3 py-1 rounded-full text-xs font-black uppercase border flex items-center gap-1 transition-all ${risqueColor}`}>
                      <AlertTriangle size={12} /> Risque : {niveauRisque}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-4 text-xs font-bold text-slate-400 mt-3">
                  <p className="flex items-center gap-1 bg-slate-50 px-2.5 py-1 rounded-md border border-slate-100">
                    <Tag size={12} className="text-slate-400" /> Réf : <span className="text-slate-700 font-black">{p.reference || 'Non spécifiée'}</span>
                  </p>
                  <p className="flex items-center gap-1 bg-slate-50 px-2.5 py-1 rounded-md border border-slate-100">
                    <Building size={12} className="text-slate-400" /> Offre : <span className="text-slate-700 font-black">{p.nom_package || 'Sur Mesure'}</span>
                  </p>
                </div>
            </div>
            
            <div className="grid grid-cols-2 md:flex gap-3 items-end">
              {p.telephone_pelerin && (
                <a href={urlWhatsApp} target="_blank" rel="noopener noreferrer" className="bg-emerald-500 text-white p-4 rounded-2xl hover:bg-emerald-600 font-bold text-xs flex justify-center items-center gap-2 shadow-lg shadow-emerald-500/20 hover:shadow-emerald-500/40 hover:scale-[1.03] transition-all duration-200">
                  <MessageCircle size={18} /> WhatsApp
                </a>
              )}
              <button onClick={saveAdvancedData} disabled={updating} className="bg-gradient-to-br from-blue-600 to-indigo-700 text-white px-6 py-4 rounded-2xl font-black flex items-center justify-center gap-2 shadow-lg shadow-blue-600/20 hover:shadow-blue-600/40 hover:scale-[1.03] transition-all duration-200 text-xs">
                {updating ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />} Enregistrer
              </button>
              <Link href={`/hajj/modifier-pelerin/${p.id}`} className="bg-slate-50 border border-slate-200 text-slate-700 p-4 rounded-2xl font-bold text-xs flex items-center justify-center gap-2 hover:bg-slate-100 hover:scale-[1.02] transition-all duration-200">
                <Pencil size={16} /> Modifier
              </Link>
              <button onClick={() => window.print()} className="bg-slate-50 border border-slate-200 text-slate-600 p-4 rounded-2xl hover:bg-slate-100 hover:scale-[1.02] transition-all duration-200 flex justify-center items-center">
                <Printer size={16} />
              </button>
            </div>
          </div>
        </div>

        {/* --- 1. BLOCK PROGRESSION ET TIMELINE --- */}
        <div className="bg-white p-6 md:p-8 rounded-3xl shadow-xl shadow-slate-200/50 border border-slate-100 space-y-6 transition-all hover:shadow-2xl">
          <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-4 border-b border-slate-100/80 pb-4">
            <h3 className="text-xs font-black text-slate-800 uppercase tracking-wider flex items-center gap-2">
              <TrendingUp size={16} className="text-blue-500" /> Suivi des étapes du pèlerin
            </h3>
            <span className="text-xs font-black text-blue-600 bg-blue-50/80 px-4 py-1.5 rounded-xl border border-blue-100/50 w-fit">
              {etapesReussies} / 6 Jalons Validés ({pourcentageProgression}%)
            </span>
          </div>
          
          <div className="pt-2">
            <StatusTimeline p={p} />
          </div>
        </div>

        {/* --- GRILLE PRINCIPALE --- */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          
          {/* BLOCS DE GAUCHE */}
          <div className="lg:col-span-2 space-y-6">
            
            {/* ÉTAT CIVIL ET ALERTES PASSEPORT */}
            <div className="bg-white rounded-3xl p-6 md:p-8 shadow-xl shadow-slate-200/50 border border-slate-100 space-y-6 transition-all hover:scale-[1.005]">
              <h3 className="text-xs font-black text-slate-400 uppercase tracking-wider flex items-center gap-2">
                <User size={16} className="text-blue-500" /> Informations Personnelles & Validité Document
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                <div className="bg-slate-50/80 border border-slate-100 p-4 rounded-2xl transition-all hover:bg-slate-50">
                  <p className="text-[10px] font-bold text-slate-400 uppercase">Âge Réel Calculé</p>
                  <p className="font-black text-slate-800 text-lg mt-0.5">{age !== null ? `${age} ans` : '--'}</p>
                </div>
                <div className="bg-slate-50/80 border border-slate-100 p-4 rounded-2xl transition-all hover:bg-slate-50">
                  <p className="text-[10px] font-bold text-slate-400 uppercase">N° Passeport Unique</p>
                  <p className="font-black text-slate-800 text-lg mt-0.5 tracking-wider">{p.num_passeport || '--'}</p>
                </div>
                <div className={`p-4 rounded-2xl border transition-all duration-300 ${passeportDanger ? 'bg-red-50/80 border-red-200 shadow-sm shadow-red-100' : 'bg-slate-50/80 border-slate-100'}`}>
                  <p className={`text-[10px] font-bold uppercase ${passeportDanger ? 'text-red-500' : 'text-slate-400'}`}>Expiration Passeport</p>
                  <p className={`font-black text-lg mt-0.5 ${passeportDanger ? 'text-red-600' : 'text-slate-800'}`}>
                    {p.date_expiration ? new Date(p.date_expiration).toLocaleDateString('fr-FR') : '--'}
                  </p>
                  {passeportDanger && <p className="text-[9px] font-black text-red-500 uppercase mt-1 tracking-tight animate-pulse">⚠️ Moins de 6 mois de validité</p>}
                </div>
              </div>
            </div>

            {/* SANTE & FORMATION */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="bg-white rounded-3xl p-6 shadow-xl shadow-slate-200/50 border border-slate-100 space-y-4 transition-all hover:scale-[1.01]">
                <h3 className="text-xs font-black text-emerald-600 uppercase tracking-wider flex items-center gap-2">
                  <Syringe size={16} /> Formalités Sanitaires
                </h3>
                <div onClick={() => handleChange('vacciné', !p.vacciné)} className="flex items-center justify-between p-4 bg-slate-50/60 border border-slate-100 rounded-2xl cursor-pointer hover:bg-slate-50 transition-colors">
                  <span className="font-bold text-xs uppercase text-slate-600">Carnet de Vaccination</span>
                  <ToggleSwitch checked={!!p.vacciné} activeColor="bg-emerald-500" />
                </div>
                <div onClick={() => handleChange('visite_medicale', !p.visite_medicale)} className="flex items-center justify-between p-4 bg-slate-50/60 border border-slate-100 rounded-2xl cursor-pointer hover:bg-slate-50 transition-colors">
                  <span className="font-bold text-xs uppercase text-slate-600">Certificat Visite Médicale</span>
                  <ToggleSwitch checked={!!p.visite_medicale} activeColor="bg-emerald-500" />
                </div>
              </div>

              <div className="bg-white rounded-3xl p-6 shadow-xl shadow-slate-200/50 border border-slate-100 space-y-4 transition-all hover:scale-[1.01]">
                <h3 className="text-xs font-black text-orange-500 uppercase tracking-wider flex items-center gap-2">
                  <BookOpen size={16} /> Rituels & Formations Pré-Départ
                </h3>
                <div onClick={() => handleChange('formation_suivie', !p.formation_suivie)} className="flex items-center justify-between p-4 bg-slate-50/60 border border-slate-100 rounded-2xl cursor-pointer hover:bg-slate-50 transition-colors">
                  <span className="font-bold text-xs uppercase text-orange-700">Séances de formation suivies</span>
                  <ToggleSwitch checked={!!p.formation_suivie} activeColor="bg-orange-500" />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <input type="date" value={p.date_formation || ''} onChange={(e) => handleChange('date_formation', e.target.value)} className="w-full p-3 bg-slate-50 rounded-xl font-bold text-xs border border-slate-200 focus:border-orange-400 focus:bg-white outline-none transition-all" />
                  <input type="text" placeholder="Groupe (Ex: Convoi A)" value={p.groupe_formation || ''} onChange={(e) => handleChange('groupe_formation', e.target.value)} className="w-full p-3 bg-slate-50 rounded-xl font-bold text-xs border border-slate-200 focus:border-orange-400 focus:bg-white outline-none transition-all" />
                </div>
              </div>
            </div>

            {/* HÉBERGEMENTS */}
            <div className="bg-white rounded-3xl p-6 md:p-8 shadow-xl shadow-slate-200/50 border border-slate-100 space-y-6 transition-all hover:scale-[1.005]">
              <h3 className="text-xs font-black text-purple-600 uppercase tracking-wider flex items-center gap-2">
                <Hotel size={16} /> Logistique & Répartition Hôtels (KSA)
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-3">
                  <input type="text" placeholder="Nom Hôtel La Mecque" value={p.hotel_mecque || ''} onChange={(e) => handleChange('hotel_mecque', e.target.value)} className="w-full p-4 bg-slate-50 rounded-2xl font-bold text-xs border border-purple-400 focus:bg-white outline-none transition-all" />
                  <input type="text" placeholder="Nom Hôtel Médine" value={p.hotel_medine || ''} onChange={(e) => handleChange('hotel_medine', e.target.value)} className="w-full p-4 bg-slate-50 rounded-2xl font-bold text-xs border border-purple-400 focus:bg-white outline-none transition-all" />
                </div>
                <div className="space-y-3">
                  <input type="text" placeholder="Nom du Guide / Encadreur assigné" value={p.groupe_encadrement || ''} onChange={(e) => handleChange('groupe_encadrement', e.target.value)} className="w-full p-4 bg-slate-50 rounded-2xl font-bold text-xs border border-purple-400 focus:bg-white outline-none transition-all" />
                  <div onClick={() => handleChange('hotel_statut', !p.hotel_statut)} className="flex items-center justify-between p-3.5 bg-slate-50 border border-slate-100 rounded-2xl cursor-pointer hover:bg-slate-100 transition-all">
                    <span className="text-[10px] font-black uppercase text-slate-500">Chambres validées et attribuées</span>
                    <ToggleSwitch checked={!!p.hotel_statut} activeColor="bg-purple-500" />
                  </div>
                </div>
              </div>
            </div>

            {/* TIMELINE CHRONOLOGIQUE */}
            <div className="bg-white rounded-3xl p-6 md:p-8 shadow-xl shadow-slate-200/50 border border-slate-100 space-y-6 transition-all hover:shadow-2xl">
              <h3 className="text-xs font-black text-slate-800 uppercase tracking-wider flex items-center gap-2">
                <Clock size={16} className="text-blue-500" /> Traçabilité Chronologique du Dossier
              </h3>
              <div className="relative border-l-2 border-slate-100 ml-6 space-y-8 pt-2">
                
                <div className="relative pl-8 transition-transform duration-300 hover:translate-x-1">
                  <div className={`absolute -left-[17px] top-0.5 w-8 h-8 rounded-full border-4 border-white flex items-center justify-center text-white shadow-md transition-all ${p.date_inscription ? 'bg-gradient-to-br from-emerald-400 to-emerald-600 scale-110' : 'bg-slate-300'}`}>
                    <UserPlus size={12} className={p.date_inscription ? 'animate-pulse' : ''} />
                  </div>
                  <p className="text-xs font-black text-slate-800 uppercase tracking-wide">Création & Inscription administrative</p>
                  <p className="text-[11px] text-slate-400 font-bold mt-0.5">{p.date_inscription ? `Enregistré le ${new Date(p.date_inscription).toLocaleDateString('fr-FR')}` : 'En attente de saisie initiale'}</p>
                </div>

                <div className="relative pl-8 transition-transform duration-300 hover:translate-x-1">
                  <div className={`absolute -left-[17px] top-0.5 w-8 h-8 rounded-full border-4 border-white flex items-center justify-center text-white shadow-md transition-all ${p.visa_obtenu ? 'bg-gradient-to-br from-emerald-400 to-emerald-600 scale-110' : !p.visa_obtenu && p.num_passeport ? 'bg-gradient-to-br from-blue-400 to-blue-600' : 'bg-slate-300'}`}>
                    <FileCheck size={12} />
                  </div>
                  <p className="text-xs font-black text-slate-800 uppercase tracking-wide">Délivrance & Validation du Visa</p>
                  <p className="text-[11px] text-slate-400 font-bold mt-0.5">{p.visa_obtenu ? "Approuvé par le Consulat d'Arabie Saoudite" : p.num_passeport ? 'En cours d\'instruction à l\'ambassade' : 'En attente des pièces justificatives'}</p>
                </div>

                <div className="relative pl-8 transition-transform duration-300 hover:translate-x-1">
                  <div className={`absolute -left-[17px] top-0.5 w-8 h-8 rounded-full border-4 border-white flex items-center justify-center text-white shadow-md transition-all ${p.date_depart && maintenant > new Date(p.date_depart) ? 'bg-gradient-to-br from-emerald-400 to-emerald-600' : p.date_depart ? 'bg-gradient-to-br from-blue-400 to-blue-600 scale-110' : 'bg-slate-300'}`}>
                    <PlaneTakeoff size={12} className={p.date_depart && maintenant <= new Date(p.date_depart) ? 'animate-bounce' : ''} />
                  </div>
                  <p className="text-xs font-black text-slate-800 uppercase tracking-wide">Planification Embarquement & Vol</p>
                  <p className="text-[11px] text-slate-400 font-bold mt-0.5">{p.date_depart ? `Vol programmé le ${new Date(p.date_depart).toLocaleString('fr-FR')}` : 'Aucune affectation de charter de vol pour le moment'}</p>
                </div>

              </div>
            </div>

          </div>

          {/* BLOCS DE DROITE */}
          <div className="space-y-6">
            
            {/* COMPTABILITÉ */}
            {role !== 'admin' && (
              <div className="bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 text-white p-6 rounded-[2rem] shadow-xl shadow-slate-900/10 space-y-6 transition-all duration-300 hover:shadow-2xl hover:scale-[1.01]">
                <div>
                  <h3 className="text-[10px] font-black text-cyan-400 uppercase tracking-wider flex items-center gap-2">
                    <CreditCard size={14} /> Balance Comptable / Reste à recouvrer
                  </h3>
                  <p className="text-4xl font-black text-transparent bg-clip-text bg-gradient-to-r from-cyan-300 via-teal-200 to-blue-300 tracking-tight mt-2">
                    {resteAPayer.toLocaleString()} <span className="text-xs text-white/50 uppercase">cfa</span>
                  </p>
                </div>

                <div className="space-y-1.5">
                  <div className="flex justify-between text-[10px] font-black text-slate-400 uppercase tracking-wide">
                    <span>Taux d'encaissement</span>
                    <span className="text-cyan-300">{totalDue > 0 ? Math.round((totalPaid / totalDue) * 100) : 0}%</span>
                  </div>
                  <div className="w-full bg-white/10 h-2 rounded-full overflow-hidden p-[1px]">
                    <div className="bg-gradient-to-r from-cyan-400 to-blue-500 h-full rounded-full transition-all duration-700" style={{ width: `${totalDue > 0 ? (totalPaid / totalDue) * 100 : 0}%` }}></div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2 text-xs border-t border-white/10 pt-4">
                  <div>
                    <span className="block text-[9px] text-slate-400 uppercase">Frais Package Fixés</span>
                    <span className="font-bold text-slate-200">{totalDue.toLocaleString()} F</span>
                  </div>
                  <div>
                    <span className="block text-[9px] text-emerald-400 uppercase">Acomptes Versés</span>
                    <span className="font-bold text-emerald-400">{totalPaid.toLocaleString()} F</span>
                  </div>
                </div>
              </div>
            )}

            {/* VOLS */}
            <div className="bg-gradient-to-br from-indigo-50/60 via-cyan-50/40 to-white border border-indigo-100/70 p-6 rounded-3xl shadow-xl space-y-6 transition-all hover:shadow-2xl">
               <h3 className="text-xs font-black text-indigo-800 uppercase tracking-wider flex items-center gap-2">
                  <Plane size={16} className="text-indigo-600" /> Détails du Plan de Vol Inter-continental
               </h3>

               {joursAvantDepart !== null && joursAvantDepart > 0 && (
                 <div className="bg-white border border-indigo-100 p-4 rounded-2xl flex items-center gap-3 shadow-sm animate-pulse">
                   <Clock className="text-indigo-600 animate-spin" size={24} style={{ animationDuration: '8s' }} />
                   <div>
                     <p className="text-xs font-black text-indigo-950 uppercase tracking-wide">Compte à rebours Vol</p>
                     <p className="text-sm font-black text-indigo-600">{joursAvantDepart} jours restants avant le départ</p>
                   </div>
                 </div>
               )}

                <div className="space-y-3">
                  <div className="relative transition-all focus-within:scale-[1.01]">
                    <span className="absolute top-3 left-4 text-[9px] font-black uppercase text-indigo-400">Date/Heure Vol Aller</span>
                    <input type="datetime-local" value={p.date_depart ? p.date_depart.slice(0, 16) : ''} onChange={(e) => handleChange('date_depart', e.target.value)} className="w-full pt-8 pb-3 px-4 bg-white rounded-2xl font-bold text-xs border border-indigo-200/60 outline-none focus:border-indigo-400 shadow-inner" />
                  </div>
                  <div className="relative transition-all focus-within:scale-[1.01]">
                    <span className="absolute top-3 left-4 text-[9px] font-black uppercase text-indigo-400">Date/Heure Vol Retour</span>
                    <input type="datetime-local" value={p.date_retour ? p.date_retour.slice(0, 16) : ''} onChange={(e) => handleChange('date_retour', e.target.value)} className="w-full pt-8 pb-3 px-4 bg-white rounded-2xl font-bold text-xs border border-indigo-200/60 outline-none focus:border-indigo-400 shadow-inner" />
                  </div>
                  <div onClick={() => handleChange('visa_obtenu', !p.visa_obtenu)} className="flex items-center justify-between p-4 bg-white rounded-2xl border border-indigo-100 cursor-pointer shadow-sm hover:border-indigo-300 transition-all">
                    <span className="font-black text-[11px] text-indigo-900 uppercase tracking-wide flex items-center gap-2">
                      <ShieldCheck size={14} className="text-indigo-500" /> Statut du Visa Obtenu
                    </span>
                    <ToggleSwitch checked={!!p.visa_obtenu} activeColor="bg-indigo-600" />
                  </div>
               </div>
            </div>

            {/* AGENCE */}
            <div className="bg-white p-6 rounded-3xl shadow-xl shadow-slate-200/50 border border-slate-100 space-y-4">
              <h3 className="text-xs font-black text-slate-400 uppercase tracking-wider flex items-center gap-2">
                <Building size={16} className="text-slate-400" /> Agence
              </h3>
              <p className="text-sm font-black text-slate-800 uppercase tracking-wide">
                {p.agences?.nom_agence || 'Aucune agence rattachée'}
              </p>
            </div>

          </div>

        </div>
      </div>
    </div>
  )
}