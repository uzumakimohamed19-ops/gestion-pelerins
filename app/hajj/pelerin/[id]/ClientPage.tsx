/* eslint-disable @next/next/no-img-element */
'use client'
import { useEffect, useState } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { usePowerSync, useQuery } from '@powersync/react'
import { requireSupabaseRows, supabase, getUser } from '@/lib/supabase'
import { 
  User, CreditCard, ArrowLeft, Pencil, Printer, Save, Syringe, 
  BookOpen, Hotel, Plane, Loader2, ShieldCheck, Tag, Building, 
  AlertTriangle, MessageCircle, Clock, TrendingUp, UserPlus, FileCheck, PlaneTakeoff,
  UserCheck, UserRound, Globe, CheckCircle2, Eye, FileText, Camera, Download, X
} from 'lucide-react'
import Link from 'next/link'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'

import { useUI } from '@/lib/UIContext'
import { getPassportPublicUrl, uploadPassportFile } from '@/lib/hajjPassport'

// ─── AVATARS PÈLERINS AFRICAINS DYNAMIQUES (SVG) ─────────────────────────────

const AvatarHommeJeune = ({ size = 56 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 72 72" fill="none" xmlns="http://www.w3.org/2000/svg">
    <circle cx="36" cy="36" r="36" fill="#1a1a2e"/>
    <path d="M16,72 Q14,54 18,44 Q26,36 36,38 Q46,36 54,44 Q58,54 56,72Z" fill="#f8f8f8"/>
    <path d="M54,44 Q62,46 60,72 L56,72 Q58,54 54,44Z" fill="#ededed"/>
    <rect x="31" y="38" width="10" height="8" rx="3" fill="#7a4e2d"/>
    <ellipse cx="36" cy="28" rx="13" ry="14" fill="#8B5E3C"/>
    <path d="M23,22 Q24,14 36,12 Q48,14 49,22 Q46,16 36,15 Q26,16 23,22Z" fill="#1a0a00"/>
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
    <path d="M16,72 Q14,54 18,44 Q26,36 36,38 Q46,36 54,44 Q58,54 56,72Z" fill="#f8f8f8"/>
    <path d="M54,44 Q62,46 60,72 L56,72 Q58,54 54,44Z" fill="#ededed"/>
    <path d="M24,34 Q22,44 26,48 Q36,52 46,48 Q50,44 48,34 Q42,40 36,40 Q30,40 24,34Z" fill="#d8d0c4"/>
    <rect x="31" y="38" width="10" height="6" rx="3" fill="#6a3e25"/>
    <ellipse cx="36" cy="27" rx="13" ry="14" fill="#7a4e2d"/>
    <path d="M23,21 Q24,13 36,11 Q48,13 49,21 Q46,15 36,14 Q26,15 23,21Z" fill="#b8b0a4"/>
    <path d="M23,21 Q21,26 22,30 Q24,25 23,21Z" fill="#c8c0b4"/>
    <path d="M49,21 Q51,26 50,30 Q48,25 49,21Z" fill="#c8c0b4"/>
    <ellipse cx="30" cy="25" rx="2" ry="2.5" fill="#3d1a00"/>
    <ellipse cx="42" cy="25" rx="2" ry="2.5" fill="#3d1a00"/>
    <path d="M27,21 Q30,19 33,21" stroke="#a09080" strokeWidth="1.5" fill="none" strokeLinecap="round"/>
    <path d="M39,21 Q42,19 45,21" stroke="#a09080" strokeWidth="1.5" fill="none" strokeLinecap="round"/>
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
    <path d="M14,72 Q12,52 16,42 Q24,34 36,36 Q48,34 56,42 Q60,52 58,72Z" fill="#f0f0f0"/>
    <path d="M16,42 Q10,48 12,72 L16,72 Q14,54 16,42Z" fill="#f5f5f5"/>
    <path d="M56,42 Q62,48 60,72 L56,72 Q58,54 56,42Z" fill="#f5f5f5"/>
    <path d="M19,22 Q36,10 53,22 Q58,30 56,42 Q46,34 36,34 Q26,34 16,42 Q14,30 19,22Z" fill="#f0f0f0"/>
    <rect x="31" y="34" width="10" height="6" rx="3" fill="#7a4e2d"/>
    <ellipse cx="36" cy="26" rx="12" ry="13" fill="#8B5E3C"/>
    <ellipse cx="30" cy="24" rx="2" ry="2.5" fill="#3d1a00"/>
    <ellipse cx="42" cy="24" rx="2" ry="2.5" fill="#3d1a00"/>
    <path d="M27,20 Q30,18 33,20" stroke="#3d1a00" strokeWidth="1.5" fill="none" strokeLinecap="round"/>
    <path d="M39,20 Q42,18 45,20" stroke="#3d1a00" strokeWidth="1.5" fill="none" strokeLinecap="round"/>
    <path d="M30,32 Q36,36 42,32" stroke="#5a3020" strokeWidth="1.2" fill="none" strokeLinecap="round"/>
  </svg>
);

const AvatarFemmeVieille = ({ size = 56 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 72 72" fill="none" xmlns="http://www.w3.org/2000/svg">
    <circle cx="36" cy="36" r="36" fill="#1a1a2e"/>
    <path d="M14,72 Q12,52 16,42 Q24,34 36,36 Q48,34 56,42 Q60,52 58,72Z" fill="#e8e4de"/>
    <path d="M16,42 Q10,48 12,72 L16,72 Q14,54 16,42Z" fill="#ede9e3"/>
    <path d="M56,42 Q62,48 60,72 L56,72 Q58,54 56,42Z" fill="#ede9e3"/>
    <path d="M19,22 Q36,10 53,22 Q58,30 56,42 Q46,34 36,34 Q26,34 16,42 Q14,30 19,22Z" fill="#e0dcd4"/>
    <rect x="31" y="34" width="10" height="6" rx="3" fill="#6a3e25"/>
    <ellipse cx="36" cy="26" rx="12" ry="13" fill="#7a4e2d"/>
    <ellipse cx="30" cy="24" rx="1.8" ry="2.2" fill="#3d1a00"/>
    <ellipse cx="42" cy="24" rx="1.8" ry="2.2" fill="#3d1a00"/>
    <path d="M27,20 Q30,18 33,20" stroke="#a09080" strokeWidth="1.5" fill="none" strokeLinecap="round"/>
    <path d="M39,20 Q42,18 45,20" stroke="#a09080" strokeWidth="1.5" fill="none" strokeLinecap="round"/>
    <path d="M26,23 Q28,22 30,23" stroke="#5a3020" strokeWidth="0.9" fill="none" strokeLinecap="round"/>
    <path d="M42,23 Q44,22 46,23" stroke="#5a3020" strokeWidth="0.9" fill="none" strokeLinecap="round"/>
    <path d="M28,30 Q32,32 36,32 Q40,32 44,30" stroke="#5a3020" strokeWidth="1" fill="none" strokeLinecap="round"/>
    <path d="M24,26 Q22,28 24,32" stroke="#5a3020" strokeWidth="0.7" fill="none" strokeLinecap="round"/>
    <path d="M48,26 Q50,28 48,32" stroke="#5a3020" strokeWidth="0.7" fill="none" strokeLinecap="round"/>
    <path d="M24,27 Q26,30 28,28" stroke="#5a3020" strokeWidth="0.7" fill="none" strokeLinecap="round"/>
    <path d="M48,27 Q46,30 44,28" stroke="#5a3020" strokeWidth="0.7" fill="none" strokeLinecap="round"/>
  </svg>
);

// ─── STATUS TIMELINE ─────────────────────────────────────────────
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
  const id = useSearchParams().get('id')
  const router = useRouter()
  const db = usePowerSync()

  // 🎯 REQUÊTE JOINTURE AUTOMATIQUE : Pèlerin + Agence + Hôtels et Chambres Mecque & Médine
  const { data: queriedPelerin, isLoading: pelerinLoading } = useQuery<any>(
    `SELECT 
        p.*, 
        a.nom_agence AS agence_nom_agence,
        hm.nom AS hotel_mecque_auto,
        cm.numero_chambre AS chambre_mecque_num,
        cm.capacite AS chambre_mecque_cap,
        hmed.nom AS hotel_medine_auto,
        cmed.numero_chambre AS chambre_medine_num,
        cmed.capacite AS chambre_medine_cap
     FROM pelerins p 
     LEFT JOIN agences a ON p.agence_id = a.id 
     LEFT JOIN chambres cm ON p.chambre_mecque_id = cm.id
     LEFT JOIN hotels hm ON cm.hotel_id = hm.id
     LEFT JOIN chambres cmed ON p.chambre_medine_id = cmed.id
     LEFT JOIN hotels hmed ON cmed.hotel_id = hmed.id
     WHERE p.id = ?`,
    [id ?? ''],
  )

  const { data: queriedPayments } = useQuery<any>(
    'SELECT * FROM pelerin_payments WHERE pelerin_id = ? ORDER BY payment_date DESC',
    [id ?? ''],
  )

  const [p, setPelerin] = useState<any | null>(null)
  const [loading, setLoading] = useState(true)
  const [updating, setUpdating] = useState(false)
  const [showScanModal, setShowScanModal] = useState(false)
  const [showPdfExportModal, setShowPdfExportModal] = useState(false)
  const [pdfIncludeFinances, setPdfIncludeFinances] = useState(false)
  const [photoError, setPhotoError] = useState(false)
  const [role, setRole] = useState<string>('staff')

  const [paymentForm, setPaymentForm] = useState({
    amount: '',
    paymentMode: 'ESPECES',
    paymentDate: new Date().toISOString().slice(0, 10),
    notes: ''
  })

  const formatAmountInput = (value: string) => {
    const digits = value.replace(/\D/g, '')
    if (!digits) return ''
    return Number(digits).toLocaleString('fr-FR')
  }

  const [payments, setPayments] = useState<any[]>([])
  const [savingPayment, setSavingPayment] = useState(false)
  const { setHideNavbar } = useUI()

  useEffect(() => {
    setHideNavbar(!!showScanModal || !!showPdfExportModal)
    return () => setHideNavbar(false)
  }, [showScanModal, showPdfExportModal, setHideNavbar])

  const handleChange = (field: string, value: any) => {
    if (!p) return
    setPelerin({ ...p, [field]: value })
  }

  const handleRecordPayment = async (e?: any) => {
    e?.preventDefault()
    if (!p?.id) return

    const amount = Number(paymentForm.amount.replace(/\s/g, '').replace(/,/g, '').replace(/\./g, ''))
    if (!amount || amount <= 0) {
      alert('Veuillez saisir un montant de paiement valide.')
      return
    }

    setSavingPayment(true)

    try {
      const nextTotalPaid = (p.total_paye || 0) + amount
      const insertedPayment = {
        id: crypto.randomUUID(),
        pelerin_id: p.id,
        amount,
        payment_date: paymentForm.paymentDate || new Date().toISOString().slice(0, 10),
        payment_mode: paymentForm.paymentMode,
        notes: paymentForm.notes.trim() || null,
        created_at: new Date().toISOString(),
      }
      const { error: paymentError } = await supabase.from('pelerin_payments').insert(insertedPayment)
      if (paymentError) throw paymentError
      const { data: updatedRows, error: updateError } = await supabase
        .from('pelerins')
        .update({ total_paye: nextTotalPaid })
        .eq('id', p.id)
        .select('id')
      requireSupabaseRows(updatedRows, updateError, 'mise à jour du total payé')

      await db.execute(
        'INSERT OR REPLACE INTO pelerin_payments (id, pelerin_id, amount, payment_date, payment_mode, notes, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [insertedPayment.id, insertedPayment.pelerin_id, insertedPayment.amount, insertedPayment.payment_date, insertedPayment.payment_mode, insertedPayment.notes, insertedPayment.created_at],
      )
      await db.execute('UPDATE pelerins SET total_paye = ? WHERE id = ?', [nextTotalPaid, p.id])

      setPelerin({ ...p, total_paye: nextTotalPaid })
      setPaymentForm({ amount: '', paymentMode: 'ESPECES', paymentDate: new Date().toISOString().slice(0, 10), notes: '' })
      alert('✅ Paiement enregistré avec succès.')
    } catch (error: any) {
      console.error('Erreur enregistrement paiement', error)
      alert(error.message || 'Impossible d’enregistrer le paiement.')
    } finally {
      setSavingPayment(false)
    }
  }

  const saveAdvancedData = async () => {
    if (!p?.id) return
    setUpdating(true)

    try {
      const nextDocumentUrl = p.document_url || null
      const updatedFields = {
        reference: p.reference || null,
        agence_ou_personne_associee: p.agence_ou_personne_associee || null,
        vacciné: p.vacciné ? 1 : 0,
        visite_medicale: p.visite_medicale ? 1 : 0,
        formation_suivie: p.formation_suivie ? 1 : 0,
        date_formation: p.date_formation || null,
        groupe_formation: p.groupe_formation || null,
        hotel_mecque: p.hotel_mecque || null,
        hotel_medine: p.hotel_medine || null,
        hotel_statut: p.hotel_statut ? 1 : 0,
        groupe_encadrement: p.groupe_encadrement || null,
        date_depart: p.date_depart || null,
        date_retour: p.date_retour || null,
        visa_obtenu: p.visa_obtenu ? 1 : 0,
        document_url: nextDocumentUrl,
        notes: p.notes || null,
      }
      const { data, error } = await supabase
        .from('pelerins')
        .update(updatedFields)
        .eq('id', p.id)
        .select('id')
      requireSupabaseRows(data, error, 'mise à jour du dossier')

      await db.execute(
        `UPDATE pelerins SET 
            reference = ?, 
            agence_ou_personne_associee = ?, 
            vacciné = ?, 
            visite_medicale = ?, 
            formation_suivie = ?, 
            date_formation = ?, 
            groupe_formation = ?, 
            hotel_mecque = ?, 
            hotel_medine = ?, 
            hotel_statut = ?, 
            groupe_encadrement = ?, 
            date_depart = ?, 
            date_retour = ?, 
            visa_obtenu = ?, 
            document_url = ?, 
            notes = ? 
         WHERE id = ?`,
        [...Object.values(updatedFields), p.id],
      )
      setPelerin({ ...p, document_url: nextDocumentUrl })
      alert("🚀 Dossier mis à jour avec succès !")
    } catch (error) {
      console.error(error)
      alert("Erreur lors de l'enregistrement du dossier")
    } finally {
      setUpdating(false)
    }
  }

  useEffect(() => {
    async function getPelerin() {
      if (!id) return
      setLoading(pelerinLoading)
      if (queriedPelerin?.[0]) {
        const current = queriedPelerin[0]
        // 🏨 Auto-remplissage automatique des hôtels si déjà assignés via la page de répartition
        const hotelMecqueFinal = current.hotel_mecque || current.hotel_mecque_auto || ''
        const hotelMedineFinal = current.hotel_medine || current.hotel_medine_auto || ''

        setPelerin({
          ...current,
          hotel_mecque: hotelMecqueFinal,
          hotel_medine: hotelMedineFinal,
          agences: current.agence_nom_agence ? { nom_agence: current.agence_nom_agence } : undefined
        })
      }
      setPayments(queriedPayments || [])
      try {
        const { data: userData } = await getUser()
        if (userData?.user?.id) {
          const { data: profileData } = await supabase.from('profiles').select('role').eq('id', userData.user.id).single()
          if (profileData?.role) setRole(profileData.role)
        }
      } catch (e) { console.error(e) }
    }
    getPelerin()
  }, [id, pelerinLoading, queriedPelerin, queriedPayments])

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

  const scanUrl = getPassportPublicUrl(p.document_url)

  // Résolution de l'URL publique de la photo d'identité
  const photoIdentiteUrl = p.photo_url ? getPassportPublicUrl(p.photo_url) : null

  // --- LOGIQUE MÉTIER & CALCULS ---
  const totalDue = p.prix_package || 0
  const totalPaid = payments.length > 0
    ? payments.reduce((sum, item) => sum + Number(item.amount || 0), 0)
    : (p.total_paye || 0)
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

  const genreNettoye = (p.sexe || p.genre || '').toLowerCase()
  const estFemme = genreNettoye.startsWith('f')
  const estVieux = age !== null && age > 50

  // 📄 EXPORT PDF HAUTE DÉFINITION CONÇU POUR LE PÈLERIN
  const exporterFichePelerinPDF = async () => {
    try {
      const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
      const nomAgence = p.agences?.nom_agence || 'AGENCE HAJJ & OMRA'

      // En-tête officiel
      doc.setFillColor(30, 41, 59)
      doc.rect(0, 0, 210, 40, 'F')
      doc.setFillColor(217, 119, 6)
      doc.rect(0, 40, 210, 2, 'F')

      doc.setFont('helvetica', 'bold')
      doc.setFontSize(20)
      doc.setTextColor(255, 255, 255)
      doc.text(nomAgence.toUpperCase(), 105, 16, { align: 'center' })

      doc.setFontSize(11)
      doc.setTextColor(253, 224, 71)
      doc.text('FICHE OFFICIELLE DE SUIVI DU PÈLERIN', 105, 24, { align: 'center' })

      doc.setFont('helvetica', 'normal')
      doc.setFontSize(8.5)
      doc.setTextColor(203, 213, 225)
      doc.text(`Document édité le ${new Date().toLocaleDateString('fr-FR')}  •  Campagne ${p.campagne || 'En cours'}`, 105, 32, { align: 'center' })

      // Cadre Pèlerin
      doc.setFillColor(248, 250, 252)
      doc.setDrawColor(226, 232, 240)
      doc.roundedRect(14, 48, 182, 38, 3, 3, 'FD')

      doc.setFont('helvetica', 'bold')
      doc.setFontSize(14)
      doc.setTextColor(15, 23, 42)
      doc.text(`${(p.prenom || '').toUpperCase()} ${p.nom_complet.toUpperCase()}`, 20, 58)

      doc.setFont('helvetica', 'normal')
      doc.setFontSize(9)
      doc.setTextColor(71, 85, 105)
      doc.text(`Passeport : ${p.num_passeport || '-'}   |   Téléphone : ${p.telephone_pelerin || '-'}`, 20, 65)
      doc.text(`Genre : ${estFemme ? 'Femme' : 'Homme'}   |   Âge : ${age !== null ? `${age} ans` : '-'}   |   Réf : ${p.reference || '-'}`, 20, 72)
      doc.text(`Statut général : ${statutDynamique.toUpperCase()}`, 20, 79)

      // Section 1 : Étapes et Formalités
      autoTable(doc, {
        startY: 92,
        head: [['Formalité / Étape', 'Statut', 'Observations']],
        body: [
          ['Inscription administrative', p.date_inscription ? 'Validée' : 'En attente', p.date_inscription ? `Le ${new Date(p.date_inscription).toLocaleDateString('fr-FR')}` : '-'],
          ['Carnet de Vaccination', p.vacciné ? 'À jour (OK)' : 'Non renseigné', 'Requis pour entrée KSA'],
          ['Visite Médicale', p.visite_medicale ? 'Effectuée (OK)' : 'En attente', 'Aptitude physique'],
          ['Formation aux rituels', p.formation_suivie ? 'Suivie (OK)' : 'En attente', p.groupe_formation ? `Groupe: ${p.groupe_formation}` : '-'],
          ['Visa Hajj / Nusuk', p.visa_obtenu ? 'Délivré (OK)' : 'En cours d’instruction', 'Autorisation officielle'],
        ],
        theme: 'striped',
        headStyles: { fillColor: [30, 41, 59], textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 8.5 },
        styles: { fontSize: 8, cellPadding: 2.5 },
        margin: { left: 14, right: 14 },
      })

      // Section 2 : Hébergements et Logistique
      // @ts-expect-error autoTable plugin
      const endY1 = doc.lastAutoTable.finalY + 8

      const meccaHotelText = p.hotel_mecque_auto || p.hotel_mecque || 'En cours d’attribution'
      const meccaRoomText = p.chambre_mecque_num ? `Chambre N° ${p.chambre_mecque_num}` : '-'
      const medinaHotelText = p.hotel_medine_auto || p.hotel_medine || 'En cours d’attribution'
      const medinaRoomText = p.chambre_medine_num ? `Chambre N° ${p.chambre_medine_num}` : '-'

      autoTable(doc, {
        startY: endY1,
        head: [['Ville / Étape', 'Hôtel Assigné', 'Chambre / Logement']],
        body: [
          ['La Mecque (Makkah)', meccaHotelText, meccaRoomText],
          ['Médine (Madinah)', medinaHotelText, medinaRoomText],
          ['Guide / Encadrement', p.groupe_encadrement || 'Non spécifié', '-'],
          ['Vol Aller', p.date_depart ? new Date(p.date_depart).toLocaleString('fr-FR') : 'Non programmé', '-'],
          ['Vol Retour', p.date_retour ? new Date(p.date_retour).toLocaleString('fr-FR') : 'Non programmé', '-'],
        ],
        theme: 'striped',
        headStyles: { fillColor: [37, 99, 235], textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 8.5 },
        styles: { fontSize: 8, cellPadding: 2.5 },
        margin: { left: 14, right: 14 },
      })

      // Section 3 : Finances (Conditionnelle)
      // @ts-expect-error autoTable plugin
      let nextY = doc.lastAutoTable.finalY + 8

      if (pdfIncludeFinances) {
        autoTable(doc, {
          startY: nextY,
          head: [['Package / Forfait', 'Montant Total', 'Total Réglé', 'Reste à Payer']],
          body: [
            [
              p.nom_package || 'Forfait Standard',
              `${totalDue.toLocaleString('fr-FR')} CFA`,
              `${totalPaid.toLocaleString('fr-FR')} CFA`,
              `${resteAPayer.toLocaleString('fr-FR')} CFA`,
            ]
          ],
          theme: 'grid',
          headStyles: { fillColor: [15, 23, 42], textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 8.5 },
          styles: { fontSize: 8.5, cellPadding: 3, fontStyle: 'bold' },
          margin: { left: 14, right: 14 },
        })

        // @ts-expect-error autoTable plugin
        nextY = doc.lastAutoTable.finalY + 8
      }

      // Section 4 : Notes et remarques
      if (p.notes && p.notes.trim()) {
        doc.setFont('helvetica', 'bold')
        doc.setFontSize(9)
        doc.setTextColor(30, 41, 59)
        doc.text('NOTES ET CONSIGNES PARTICULIÈRES :', 14, nextY + 2)

        doc.setFont('helvetica', 'normal')
        doc.setFontSize(8)
        doc.setTextColor(71, 85, 105)
        const splitNotes = doc.splitTextToSize(p.notes, 182)
        doc.text(splitNotes, 14, nextY + 8)
      }

      // Pied de page
      doc.setDrawColor(226, 232, 240)
      doc.line(14, 282, 196, 282)
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(7.5)
      doc.setTextColor(148, 163, 184)
      doc.text(`${nomAgence.toUpperCase()}  •  Plateforme de Gestion Hajj & Omra`, 105, 287, { align: 'center' })

      doc.save(`Fiche_Pelerin_${(p.prenom || '').trim()}_${p.nom_complet.replace(/\s+/g, '_')}.pdf`)
      setShowPdfExportModal(false)
    } catch (err) {
      console.error(err)
      alert("Erreur lors de l'exportation du PDF.")
    }
  }

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
                <div className="flex items-center gap-4 flex-wrap mb-2">
                  
                  {/* 📷 1. PHOTO RÉELLE OU AVATAR DYNAMIQUE */}
                  <div className={`w-16 h-16 md:w-20 md:h-20 rounded-2xl border-2 shadow-md overflow-hidden flex items-center justify-center shrink-0 ${estFemme ? 'bg-pink-50 border-pink-200' : 'bg-blue-50 border-blue-200'}`}>
                    {photoIdentiteUrl && !photoError ? (
                      <img
                        src={photoIdentiteUrl}
                        alt={`Photo de ${p.nom_complet}`}
                        className="w-full h-full object-cover"
                        onError={() => setPhotoError(true)}
                      />
                    ) : estFemme ? (
                      estVieux ? <AvatarFemmeVieille size={68} /> : <AvatarFemmeJeune size={68} />
                    ) : (
                      estVieux ? <AvatarHommeVieux size={68} /> : <AvatarHommeJeune size={68} />
                    )}
                  </div>

                  <div>
                    <h1 className="text-2xl md:text-3xl font-black text-slate-900 uppercase tracking-tight flex items-center flex-wrap">
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

                <div className="flex items-center gap-4 text-xs font-bold text-slate-400 mt-3 flex-wrap">
                  <p className="flex items-center gap-1 bg-slate-50 px-2.5 py-1 rounded-md border border-slate-100">
                    <Tag size={12} className="text-slate-400" /> Réf : <span className="text-slate-700 font-black">{p.reference || 'Non spécifiée'}</span>
                  </p>
                  <p className="flex items-center gap-1 bg-slate-50 px-2.5 py-1 rounded-md border border-slate-100">
                    <Building size={12} className="text-slate-400" /> Offre : <span className="text-slate-700 font-black">{p.nom_package || 'Sur Mesure'}</span>
                  </p>
                </div>
            </div>
            
            <div className="grid grid-cols-2 md:flex gap-3 items-end flex-wrap">
              {/* 📄 BOUTON EXPORT PDF PRO */}
              <button 
                onClick={() => setShowPdfExportModal(true)} 
                className="bg-emerald-600 text-white p-3.5 rounded-2xl hover:bg-emerald-700 transition-all font-bold text-xs flex justify-center items-center gap-2 shadow-lg shadow-emerald-600/20 cursor-pointer"
              >
                <Download size={16} /> Exporter Fiche (PDF)
              </button>

              <button 
                onClick={() => setShowScanModal(true)} 
                className="bg-indigo-50 border border-indigo-200 text-indigo-700 p-3.5 rounded-2xl hover:bg-indigo-100 transition-all font-black text-xs flex justify-center items-center gap-2 shadow-sm cursor-pointer"
              >
                <Eye size={16} className="text-indigo-600" /> Voir scan
              </button>

              {p.telephone_pelerin && (
                <a href={urlWhatsApp} target="_blank" rel="noopener noreferrer" className="bg-emerald-500 text-white p-3.5 rounded-2xl hover:bg-emerald-600 font-bold text-xs flex justify-center items-center gap-2 shadow-sm">
                  <MessageCircle size={16} /> WhatsApp
                </a>
              )}

              <button onClick={saveAdvancedData} disabled={updating} className="bg-blue-600 hover:bg-blue-700 text-white px-5 py-3.5 rounded-2xl font-black flex items-center justify-center gap-2 shadow-lg shadow-blue-600/20 text-xs cursor-pointer">
                {updating ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />} Enregistrer
              </button>

              <Link href={`/hajj/modifier-pelerin?id=${p.id}`} className="bg-slate-50 border border-slate-200 text-slate-700 p-3.5 rounded-2xl font-bold text-xs flex items-center justify-center gap-1.5 hover:bg-slate-100">
                <Pencil size={15} /> Modifier
              </Link>
            </div>
          </div>
        </div>

        {/* --- 1. PROGRESSION ET TIMELINE --- */}
        <div className="bg-white p-6 md:p-8 rounded-3xl shadow-xl shadow-slate-200/50 border border-slate-100 space-y-6">
          <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-4 border-b border-slate-100 pb-4">
            <h3 className="text-xs font-black text-slate-800 uppercase tracking-wider flex items-center gap-2">
              <TrendingUp size={16} className="text-blue-500" /> Suivi des étapes du pèlerin
            </h3>
            <span className="text-xs font-black text-blue-600 bg-blue-50 px-4 py-1.5 rounded-xl border border-blue-100 w-fit">
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
            
            {/* ÉTAT CIVIL */}
            <div className="bg-white rounded-3xl p-6 md:p-8 shadow-xl shadow-slate-200/50 border border-slate-100 space-y-6">
              <h3 className="text-xs font-black text-slate-400 uppercase tracking-wider flex items-center gap-2">
                <User size={16} className="text-blue-500" /> Informations Personnelles & Validité Document
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                <div className="bg-slate-50 border border-slate-100 p-4 rounded-2xl">
                  <p className="text-[10px] font-bold text-slate-400 uppercase">Âge Réel Calculé</p>
                  <p className="font-black text-slate-800 text-lg mt-0.5">{age !== null ? `${age} ans` : '--'}</p>
                </div>
                <div className="bg-slate-50 border border-slate-100 p-4 rounded-2xl">
                  <p className="text-[10px] font-bold text-slate-400 uppercase">N° Passeport Unique</p>
                  <p className="font-black text-slate-800 text-lg mt-0.5 tracking-wider">{p.num_passeport || '--'}</p>
                </div>
                <div className={`p-4 rounded-2xl border ${passeportDanger ? 'bg-red-50 border-red-200' : 'bg-slate-50 border-slate-100'}`}>
                  <p className={`text-[10px] font-bold uppercase ${passeportDanger ? 'text-red-500' : 'text-slate-400'}`}>Expiration Passeport</p>
                  <p className={`font-black text-lg mt-0.5 ${passeportDanger ? 'text-red-600' : 'text-slate-800'}`}>
                    {p.date_expiration ? new Date(p.date_expiration).toLocaleDateString('fr-FR') : '--'}
                  </p>
                  {passeportDanger && <p className="text-[9px] font-black text-red-500 uppercase mt-1">⚠️ Moins de 6 mois de validité</p>}
                </div>
              </div>
            </div>

            {/* 📝 2. SECTION NOTES ET COMMENTAIRES DU PÈLERIN */}
            <div className="bg-white rounded-3xl p-6 md:p-8 shadow-xl shadow-slate-200/50 border border-slate-100 space-y-3">
              <h3 className="text-xs font-black text-slate-700 uppercase tracking-wider flex items-center gap-2">
                <FileText size={16} className="text-blue-600" /> Notes & Consignes du Dossier
              </h3>
              <textarea
                rows={3}
                value={p.notes || ''}
                onChange={(e) => handleChange('notes', e.target.value)}
                placeholder="Régime alimentaire, demandes particulières, observations médicales ou remarques sur le pèlerin..."
                className="w-full p-4 bg-slate-50 rounded-2xl font-semibold text-xs border border-slate-200 focus:bg-white focus:border-blue-600 outline-none transition-all resize-none"
              />
            </div>

            {/* SANTE & FORMATION */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="bg-white rounded-3xl p-6 shadow-xl shadow-slate-200/50 border border-slate-100 space-y-4">
                <h3 className="text-xs font-black text-emerald-600 uppercase tracking-wider flex items-center gap-2">
                  <Syringe size={16} /> Formalités Sanitaires
                </h3>
                <div onClick={() => handleChange('vacciné', !p.vacciné)} className="flex items-center justify-between p-4 bg-slate-50 border border-slate-100 rounded-2xl cursor-pointer hover:bg-slate-100 transition-colors">
                  <span className="font-bold text-xs uppercase text-slate-600">Carnet de Vaccination</span>
                  <ToggleSwitch checked={!!p.vacciné} activeColor="bg-emerald-500" />
                </div>
                <div onClick={() => handleChange('visite_medicale', !p.visite_medicale)} className="flex items-center justify-between p-4 bg-slate-50 border border-slate-100 rounded-2xl cursor-pointer hover:bg-slate-100 transition-colors">
                  <span className="font-bold text-xs uppercase text-slate-600">Certificat Visite Médicale</span>
                  <ToggleSwitch checked={!!p.visite_medicale} activeColor="bg-emerald-500" />
                </div>
              </div>

              <div className="bg-white rounded-3xl p-6 shadow-xl shadow-slate-200/50 border border-slate-100 space-y-4">
                <h3 className="text-xs font-black text-orange-500 uppercase tracking-wider flex items-center gap-2">
                  <BookOpen size={16} /> Rituels & Formations
                </h3>
                <div onClick={() => handleChange('formation_suivie', !p.formation_suivie)} className="flex items-center justify-between p-4 bg-slate-50 border border-slate-100 rounded-2xl cursor-pointer hover:bg-slate-100 transition-colors">
                  <span className="font-bold text-xs uppercase text-orange-700">Séances de formation suivies</span>
                  <ToggleSwitch checked={!!p.formation_suivie} activeColor="bg-orange-500" />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <input type="date" value={p.date_formation || ''} onChange={(e) => handleChange('date_formation', e.target.value)} className="w-full p-3 bg-slate-50 rounded-xl font-bold text-xs border border-slate-200 outline-none" />
                  <input type="text" placeholder="Groupe (Ex: Convoi A)" value={p.groupe_formation || ''} onChange={(e) => handleChange('groupe_formation', e.target.value)} className="w-full p-3 bg-slate-50 rounded-xl font-bold text-xs border border-slate-200 outline-none" />
                </div>
              </div>
            </div>

            {/* 🏨 3. HÉBERGEMENTS : AUTO-REMPLIS AUTOMATIQUEMENT PAR LA RÉPARTITION */}
            <div className="bg-white rounded-3xl p-6 md:p-8 shadow-xl shadow-slate-200/50 border border-slate-100 space-y-6">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-black text-purple-600 uppercase tracking-wider flex items-center gap-2">
                  <Hotel size={16} /> Logistique & Répartition Hôtels (KSA)
                </h3>
                {(p.chambre_mecque_id || p.chambre_medine_id) && (
                  <span className="text-[10px] bg-purple-50 text-purple-700 font-bold px-2.5 py-1 rounded-full border border-purple-200">
                    Auto-attribué par la répartition
                  </span>
                )}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* La Mecque */}
                <div className="p-4 rounded-2xl border border-slate-200 bg-slate-50/50 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-black uppercase text-purple-700">Hôtel La Mecque</span>
                    {p.chambre_mecque_num && (
                      <span className="text-[10px] font-black bg-purple-100 text-purple-800 px-2 py-0.5 rounded-md">
                        Chambre {p.chambre_mecque_num}
                      </span>
                    )}
                  </div>
                  <input 
                    type="text" 
                    placeholder="Nom Hôtel La Mecque" 
                    value={p.hotel_mecque || ''} 
                    onChange={(e) => handleChange('hotel_mecque', e.target.value)} 
                    className="w-full p-3 bg-white rounded-xl font-bold text-xs border border-slate-200 outline-none focus:border-purple-500" 
                  />
                </div>

                {/* Médine */}
                <div className="p-4 rounded-2xl border border-slate-200 bg-slate-50/50 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-black uppercase text-purple-700">Hôtel Médine</span>
                    {p.chambre_medine_num && (
                      <span className="text-[10px] font-black bg-purple-100 text-purple-800 px-2 py-0.5 rounded-md">
                        Chambre {p.chambre_medine_num}
                      </span>
                    )}
                  </div>
                  <input 
                    type="text" 
                    placeholder="Nom Hôtel Médine" 
                    value={p.hotel_medine || ''} 
                    onChange={(e) => handleChange('hotel_medine', e.target.value)} 
                    className="w-full p-3 bg-white rounded-xl font-bold text-xs border border-slate-200 outline-none focus:border-purple-500" 
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2 border-t border-slate-100">
                <input 
                  type="text" 
                  placeholder="Nom du Guide / Encadreur assigné" 
                  value={p.groupe_encadrement || ''} 
                  onChange={(e) => handleChange('groupe_encadrement', e.target.value)} 
                  className="w-full p-3 bg-slate-50 rounded-xl font-bold text-xs border border-slate-200 outline-none focus:border-purple-500" 
                />
                <div onClick={() => handleChange('hotel_statut', !p.hotel_statut)} className="flex items-center justify-between p-3 bg-slate-50 border border-slate-100 rounded-xl cursor-pointer hover:bg-slate-100">
                  <span className="text-[10px] font-black uppercase text-slate-500">Chambres validées et attribuées</span>
                  <ToggleSwitch checked={!!p.hotel_statut} activeColor="bg-purple-500" />
                </div>
              </div>
            </div>

            {/* VOLS */}
            <div className="bg-gradient-to-br from-indigo-50/60 via-cyan-50/40 to-white border border-indigo-100 p-6 rounded-3xl shadow-xl space-y-4">
              <h3 className="text-xs font-black text-indigo-800 uppercase tracking-wider flex items-center gap-2">
                <Plane size={16} className="text-indigo-600" /> Détails du Plan de Vol
              </h3>

              {joursAvantDepart !== null && joursAvantDepart > 0 && (
                <div className="bg-white border border-indigo-100 p-3.5 rounded-2xl flex items-center gap-3 shadow-xs">
                  <Clock className="text-indigo-600" size={20} />
                  <div>
                    <p className="text-[10px] font-black text-indigo-950 uppercase">Compte à rebours Vol</p>
                    <p className="text-xs font-black text-indigo-600">{joursAvantDepart} jours restants avant le départ</p>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="relative">
                  <span className="text-[9px] font-black uppercase text-indigo-500 block mb-1">Vol Aller</span>
                  <input type="datetime-local" value={p.date_depart ? p.date_depart.slice(0, 16) : ''} onChange={(e) => handleChange('date_depart', e.target.value)} className="w-full p-3 bg-white rounded-xl font-bold text-xs border border-indigo-200 outline-none" />
                </div>
                <div className="relative">
                  <span className="text-[9px] font-black uppercase text-indigo-500 block mb-1">Vol Retour</span>
                  <input type="datetime-local" value={p.date_retour ? p.date_retour.slice(0, 16) : ''} onChange={(e) => handleChange('date_retour', e.target.value)} className="w-full p-3 bg-white rounded-xl font-bold text-xs border border-indigo-200 outline-none" />
                </div>
              </div>

              <div onClick={() => handleChange('visa_obtenu', !p.visa_obtenu)} className="flex items-center justify-between p-3.5 bg-white rounded-xl border border-indigo-100 cursor-pointer shadow-xs">
                <span className="font-black text-xs text-indigo-900 uppercase flex items-center gap-1.5">
                  <ShieldCheck size={14} className="text-indigo-500" /> Statut du Visa Obtenu
                </span>
                <ToggleSwitch checked={!!p.visa_obtenu} activeColor="bg-indigo-600" />
              </div>
            </div>

          </div>

          {/* BLOCS DE DROITE */}
          <div className="space-y-6">
            
            {/* COMPTABILITÉ */}
            <div className="bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 text-white p-6 rounded-[2rem] shadow-xl space-y-6">
              <div>
                <h3 className="text-[10px] font-black text-cyan-400 uppercase tracking-wider flex items-center gap-2">
                  <CreditCard size={14} /> Balance Comptable
                </h3>
                <p className="text-3xl font-black text-transparent bg-clip-text bg-gradient-to-r from-cyan-300 to-blue-300 tracking-tight mt-1.5">
                  {resteAPayer.toLocaleString()} <span className="text-xs text-white/50 uppercase">cfa</span>
                </p>
              </div>

              <div className="space-y-1.5">
                <div className="flex justify-between text-[10px] font-black text-slate-400 uppercase">
                  <span>Taux d'encaissement</span>
                  <span className="text-cyan-300">{totalDue > 0 ? Math.round((totalPaid / totalDue) * 100) : 0}%</span>
                </div>
                <div className="w-full bg-white/10 h-2 rounded-full overflow-hidden p-[1px]">
                  <div className="bg-gradient-to-r from-cyan-400 to-blue-500 h-full rounded-full transition-all duration-700" style={{ width: `${totalDue > 0 ? (totalPaid / totalDue) * 100 : 0}%` }}></div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 text-xs border-t border-white/10 pt-4">
                <div>
                  <span className="block text-[9px] text-slate-400 uppercase">Frais Fixés</span>
                  <span className="font-bold text-slate-200">{totalDue.toLocaleString()} F</span>
                </div>
                <div>
                  <span className="block text-[9px] text-emerald-400 uppercase">Acomptes Versés</span>
                  <span className="font-bold text-emerald-400">{totalPaid.toLocaleString()} F</span>
                </div>
              </div>
            </div>

            {/* ENREGISTRER UN PAIEMENT */}
            <div className="bg-white p-6 rounded-[2rem] shadow-xl shadow-slate-200/50 border border-slate-100 space-y-4">
              <h3 className="text-[10px] font-black text-slate-600 uppercase tracking-wider flex items-center gap-2">
                <CreditCard size={14} className="text-indigo-600" /> Enregistrer un versement
              </h3>

              <form onSubmit={handleRecordPayment} className="space-y-3">
                <div>
                  <label className="mb-1 block text-[10px] font-black uppercase text-slate-500">Montant (CFA)</label>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={paymentForm.amount}
                    onChange={(e) => setPaymentForm({ ...paymentForm, amount: formatAmountInput(e.target.value) })}
                    placeholder="Ex : 500 000"
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-semibold outline-none focus:border-indigo-500"
                  />
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="mb-1 block text-[10px] font-black uppercase text-slate-500">Mode</label>
                    <select
                      value={paymentForm.paymentMode}
                      onChange={(e) => setPaymentForm({ ...paymentForm, paymentMode: e.target.value })}
                      className="w-full rounded-xl border border-slate-200 bg-slate-50 px-2 py-2 text-xs font-semibold outline-none"
                    >
                      <option value="ESPECES">Espèces</option>
                      <option value="VIREMENT">Virement</option>
                      <option value="CARTE">Carte</option>
                      <option value="AUTRE">Autre</option>
                    </select>
                  </div>
                  <div>
                    <label className="mb-1 block text-[10px] font-black uppercase text-slate-500">Date</label>
                    <input
                      type="date"
                      value={paymentForm.paymentDate}
                      onChange={(e) => setPaymentForm({ ...paymentForm, paymentDate: e.target.value })}
                      className="w-full rounded-xl border border-slate-200 bg-slate-50 px-2 py-2 text-xs font-semibold outline-none"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={savingPayment}
                  className="w-full rounded-xl bg-emerald-600 hover:bg-emerald-700 py-2.5 text-xs font-black uppercase tracking-wider text-white transition disabled:opacity-60 cursor-pointer"
                >
                  {savingPayment ? <Loader2 size={14} className="animate-spin mx-auto" /> : "Enregistrer le paiement"}
                </button>
              </form>
            </div>

            {/* HISTORIQUE PAIEMENTS */}
            <div className="bg-white p-6 rounded-[2rem] shadow-xl shadow-slate-200/50 border border-slate-100 space-y-3">
              <h3 className="text-[10px] font-black text-slate-600 uppercase tracking-wider flex items-center gap-2">
                <Clock size={14} className="text-slate-500" /> Historique ({payments.length})
              </h3>

              {payments.length === 0 ? (
                <p className="text-xs text-slate-400 italic">Aucun versement enregistré.</p>
              ) : (
                <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                  {payments.map((item) => (
                    <div key={item.id} className="p-2.5 rounded-xl border border-slate-100 bg-slate-50 text-xs flex justify-between items-center">
                      <div>
                        <p className="font-bold text-slate-800">{Number(item.amount || 0).toLocaleString('fr-FR')} CFA</p>
                        <p className="text-[10px] text-slate-400">{item.payment_mode} • {item.payment_date || '-'}</p>
                      </div>
                      <span className="text-[9px] font-black text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-md">Reçu</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* AGENCE */}
            <div className="bg-white p-5 rounded-2xl shadow-xl shadow-slate-200/50 border border-slate-100">
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Agence d'inscription</p>
              <p className="text-xs font-bold text-slate-800 mt-1 uppercase">
                {p.agences?.nom_agence || 'Aucune agence rattachée'}
              </p>
            </div>

          </div>

        </div>
      </div>

      {/* 📄 4. MODAL D'EXPORT PDF DU DOSSIER COMPLET (AVEC OPTION FINANCES) */}
      {showPdfExportModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fadeIn">
          <div className="bg-white rounded-[2rem] shadow-2xl border border-slate-100 max-w-md w-full overflow-hidden p-6 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <Download className="text-emerald-600" size={20} />
                <h3 className="font-black text-slate-800 text-sm uppercase">Exportation Fiche Pèlerin (PDF)</h3>
              </div>
              <button onClick={() => setShowPdfExportModal(false)} className="text-slate-400 hover:text-slate-600 cursor-pointer">
                <X size={18} />
              </button>
            </div>

            <p className="text-xs text-slate-500 font-medium leading-relaxed">
              Vous allez générer un document officiel complet au format A4 pour <strong>{`${p.prenom || ''} ${p.nom_complet || ''}`.trim()}</strong>.
            </p>

            <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl space-y-3">
              <label className="flex items-center justify-between cursor-pointer">
                <div>
                  <p className="text-xs font-bold text-slate-800">Inclure les détails financiers</p>
                  <p className="text-[10px] text-slate-400">Prix du package, versements et reste à payer</p>
                </div>
                <input
                  type="checkbox"
                  checked={pdfIncludeFinances}
                  onChange={(e) => setPdfIncludeFinances(e.target.checked)}
                  className="w-4 h-4 text-blue-600 rounded cursor-pointer"
                />
              </label>
            </div>

            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowPdfExportModal(false)}
                className="flex-1 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl cursor-pointer"
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={exporterFichePelerinPDF}
                className="flex-1 py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl flex items-center justify-center gap-1.5 cursor-pointer shadow-md"
              >
                <Download size={14} /> Télécharger le PDF
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL POUR VOIR LE SCAN DU PASSEPORT */}
      {showScanModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fadeIn">
          <div className="bg-white rounded-[2rem] shadow-2xl border border-slate-100 max-w-2xl w-full max-h-[90vh] flex flex-col overflow-hidden">
            <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50">
              <div>
                <h3 className="font-black text-slate-800 text-lg uppercase tracking-wide flex items-center gap-2">
                  <FileCheck className="text-indigo-600" size={20} /> Scan de Document du Pèlerin
                </h3>
                <p className="text-xs font-bold text-slate-400 uppercase mt-0.5">{p.prenom} {p.nom_complet} — Réf {p.reference || 'Non spécifiée'}</p>
              </div>
              <button 
                onClick={() => setShowScanModal(false)}
                className="w-9 h-9 rounded-full border border-slate-200 flex items-center justify-center text-slate-500 hover:bg-slate-100 font-bold cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="p-6 overflow-y-auto flex-1 flex flex-col items-center justify-center bg-slate-50 min-h-[350px]">
              {scanUrl ? (
                <div className="w-full h-full flex flex-col items-center gap-4">
                  <div className="border border-slate-200 rounded-2xl overflow-hidden shadow-inner max-h-[50vh] w-full flex items-center justify-center bg-white p-2">
                    <img 
                      src={scanUrl} 
                      alt={`Scan Passeport - ${p.nom_complet}`} 
                      className="max-h-[45vh] w-auto max-w-full rounded-lg object-contain"
                    />
                  </div>
                  <div className="flex gap-2 flex-wrap justify-center">
                    <a
                      href={scanUrl ?? undefined}
                      download={`passeport_${p.nom_complet?.replace(/\s+/g, '_') || 'pelerin'}.jpg`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="bg-indigo-50 text-indigo-700 border border-indigo-200 px-4 py-2 rounded-xl text-xs font-black uppercase hover:bg-indigo-100 transition-all flex items-center gap-1.5 cursor-pointer"
                    >
                      ⬇ Télécharger
                    </a>
                    <button 
                      onClick={() => { handleChange('document_url', ''); }}
                      className="bg-red-50 text-red-600 border border-red-100 px-4 py-2 rounded-xl text-xs font-black uppercase hover:bg-red-100 transition-all flex items-center gap-1.5 cursor-pointer"
                    >
                      ✕ Supprimer le scan
                    </button>
                  </div>
                </div>
              ) : (
                <div className="w-full max-w-md bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex flex-col items-center text-center space-y-4">
                  <div className="w-20 h-28 bg-indigo-900 rounded-xl relative shadow-md p-3 flex flex-col justify-between overflow-hidden text-yellow-400">
                    <div className="border border-yellow-400/30 rounded p-1 text-center">
                      <p className="text-[6px] uppercase font-black">PASSPORT</p>
                    </div>
                    <Globe size={24} className="mx-auto text-yellow-400 opacity-80" />
                    <div className="w-10 h-1 bg-yellow-400/60 rounded mx-auto"></div>
                  </div>
                  <div>
                    <h4 className="font-black text-slate-800 text-sm uppercase">Aucun scan enregistré</h4>
                    <p className="text-xs text-slate-400 font-bold mt-0.5">Téléversez le passeport ci-dessous.</p>
                  </div>
                  <label className="w-full border-2 border-dashed border-indigo-200 hover:border-indigo-400 bg-indigo-50/20 rounded-2xl p-5 flex flex-col items-center justify-center gap-1.5 cursor-pointer transition-all">
                    <FileCheck className="text-indigo-500" size={22} />
                    <span className="text-xs font-black text-indigo-700 uppercase">Téléverser un document</span>
                    <input 
                      type="file" 
                      accept="image/*, application/pdf" 
                      onChange={async (e) => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        try {
                          const uploaded = await uploadPassportFile(file)
                          handleChange('document_url', uploaded.path)
                        } catch (error) {
                          console.error(error)
                          alert('Échec de l’upload du document')
                        }
                      }}
                      className="hidden" 
                    />
                  </label>
                </div>
              )}
            </div>

            <div className="p-5 bg-slate-50 border-t border-slate-100 flex items-center justify-end gap-3">
              <button 
                onClick={() => setShowScanModal(false)}
                className="bg-slate-200 hover:bg-slate-300 text-slate-700 px-5 py-2.5 rounded-xl text-xs font-black uppercase cursor-pointer"
              >
                Fermer
              </button>
              <button 
                onClick={() => {
                  saveAdvancedData();
                  setShowScanModal(false);
                }}
                className="bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-2.5 rounded-xl text-xs font-black uppercase cursor-pointer"
              >
                Enregistrer
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}