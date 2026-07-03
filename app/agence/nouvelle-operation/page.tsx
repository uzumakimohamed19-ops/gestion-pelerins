'use client'
import { useState, useEffect, useRef } from 'react'
import { supabase } from '../../../lib/supabase'
import { useRouter } from 'next/navigation'
import {
  ArrowLeft, Save, Wallet, Plane, Globe, Receipt, FileText,
  User, Layers, CheckCircle, Clock, XCircle, Coins, Plus,
  Printer, MessageCircle, Hotel, Car, Bus, Package, Edit3,
  AlertCircle, ChevronDown, Copy, X
} from 'lucide-react'
import Link from 'next/link'

// ─── Types ───────────────────────────────────────────────────────────────────

type TypeService = {
  id: string
  label: string
  icon: React.ElementType
  color: string
  fields: string[]
}

type FormData = {
  type_activite: string
  client_nom: string
  client_telephone: string
  client_email: string
  description: string
  compagnie_fournisseur: string
  reference_document: string
  prix_achat: number
  prix_vente: number
  frais_annexes: number
  mode_paiement: string
  statut_paiement: string
  montant_verse: number
  // Billet Avion
  vol_depart: string
  vol_destination: string
  date_depart: string
  date_retour: string
  classe_voyage: string
  numero_vol: string
  bagages_kg: string
  // Visa
  type_visa: string
  pays_destination_visa: string
  date_depot_visa: string
  duree_sejour: string
  numero_passeport: string
  // Transfert
  devise_source: string
  devise_cible: string
  montant_transfert: string
  taux_change: string
  beneficiaire_nom: string
  beneficiaire_contact: string
  // Assurance
  type_assurance: string
  duree_couverture: string
  numero_police: string
  // Hôtel
  hotel_nom: string
  hotel_ville: string
  date_checkin: string
  date_checkout: string
  nombre_nuits: string
  type_chambre: string
  // Transport
  type_transport: string
  depart_transport: string
  arrivee_transport: string
  date_voyage: string
  nombre_places: string
}

// ─── Types Agence ─────────────────────────────────────────────────────────────

type AgenceInfo = {
  nom_agence: string
  telephone_agence: string
  adresse_agence: string
}

// ─── Config services préconfigurés ──────────────────────────────────────────

const SERVICES_PRECONFIGS: TypeService[] = [
  {
    id: 'BILLET',
    label: 'Billet Avion',
    icon: Plane,
    color: 'bg-blue-600',
    fields: ['vol_depart','vol_destination','date_depart','date_retour','classe_voyage','numero_vol','bagages_kg','compagnie_fournisseur','reference_document']
  },
  {
    id: 'VISA',
    label: 'Visa / Séjour',
    icon: Globe,
    color: 'bg-purple-600',
    fields: ['type_visa','pays_destination_visa','date_depot_visa','duree_sejour','numero_passeport','compagnie_fournisseur']
  },
  {
    id: 'TRANSFERT',
    label: 'Transfert Argent',
    icon: Coins,
    color: 'bg-amber-600',
    fields: ['devise_source','devise_cible','montant_transfert','taux_change','beneficiaire_nom','beneficiaire_contact','reference_document']
  },
  {
    id: 'ASSURANCE',
    label: 'Assurance',
    icon: Receipt,
    color: 'bg-teal-600',
    fields: ['type_assurance','duree_couverture','numero_police','compagnie_fournisseur']
  },
  {
    id: 'HOTEL',
    label: 'Hôtel',
    icon: Hotel,
    color: 'bg-rose-600',
    fields: ['hotel_nom','hotel_ville','date_checkin','date_checkout','nombre_nuits','type_chambre','compagnie_fournisseur']
  },
  {
    id: 'TRANSPORT',
    label: 'Transport',
    icon: Bus,
    color: 'bg-indigo-600',
    fields: ['type_transport','depart_transport','arrivee_transport','date_voyage','nombre_places','compagnie_fournisseur']
  },
  {
    id: 'PACKAGE',
    label: 'Package Voyage',
    icon: Package,
    color: 'bg-emerald-600',
    fields: ['vol_depart','vol_destination','date_depart','date_retour','hotel_nom','hotel_ville','compagnie_fournisseur','reference_document']
  },
]

// ─── Helpers ─────────────────────────────────────────────────────────────────

const formatMontant = (val: string | number): string => {
  const num = typeof val === 'string' ? parseInt(val.replace(/\D/g, ''), 10) : val
  if (isNaN(num) || num === 0) return ''
  return new Intl.NumberFormat('fr-FR').format(num)
}

const parseMontant = (val: string): number => {
  return parseInt(val.replace(/\s/g, '').replace(/\./g, '').replace(/,/g, ''), 10) || 0
}

// ─── Hook séparation milliers ─────────────────────────────────────────────────

function useMontantInput(initial = 0) {
  const [raw, setRaw] = useState(initial > 0 ? String(initial) : '')
  const [display, setDisplay] = useState(initial > 0 ? formatMontant(initial) : '')

  const onChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const digits = e.target.value.replace(/\D/g, '')
    setRaw(digits)
    setDisplay(digits ? formatMontant(digits) : '')
  }

  const setValue = (v: number) => {
    setRaw(String(v))
    setDisplay(v > 0 ? formatMontant(v) : '')
  }

  return { display, raw: parseMontant(raw), onChange, setValue }
}

// ─── Composant Champ Montant ──────────────────────────────────────────────────

function MontantInput({
  label,
  placeholder,
  colorClass,
  icon: Icon,
  value,
  onChange,
  required = false
}: {
  label: string
  placeholder?: string
  colorClass: string
  icon: React.ElementType
  value: string
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void
  required?: boolean
}) {
  return (
    <div>
      <label className={`block text-[10px] font-black uppercase tracking-widest mb-1.5 ${colorClass}`}>{label}</label>
      <div className="relative">
        <input
          required={required}
          type="text"
          inputMode="numeric"
          placeholder={placeholder || '0'}
          className="w-full p-3.5 pl-10 bg-gray-50 border-2 border-transparent focus:border-gray-900 focus:bg-white rounded-xl outline-none font-black text-base transition-all"
          value={value}
          onChange={onChange}
        />
        <Icon className="absolute left-3.5 top-4 text-gray-300" size={18} />
      </div>
    </div>
  )
}

// ─── Template reçu (HTML pur, même rendu partout) ────────────────────────────
// Cette fonction génère le HTML complet du reçu avec styles inline.
// Ce MÊME HTML est utilisé pour :
//   1. L'aperçu dans la modal (injecté via dangerouslySetInnerHTML dans un iframe srcDoc)
//   2. L'impression (ouvert via Blob URL dans une nouvelle fenêtre)
//   3. L'export en image pour WhatsApp (capturé par html2canvas)
//
// FIX IMPRESSION : on utilise width:560px fixe même en @media print pour éviter
// toute déformation. Le navigateur met automatiquement à l'échelle pour la page.

function buildRecuHTML(formData: FormData, agence: AgenceInfo, refOp: string, dateNow: string): string {
  const statutInfo = {
    PAYE: { label: 'Payé intégralement', color: '#059669', bg: '#d1fae5' },
    AVANCE: { label: 'Avance versée', color: '#d97706', bg: '#fef3c7' },
    NON_PAYE: { label: 'Non payé / Dette', color: '#dc2626', bg: '#fee2e2' },
  }[formData.statut_paiement] || { label: '', color: '#111', bg: '#f5f5f5' }

  const modePaiementLabel: Record<string, string> = {
    ESPECES: 'Espèces (Caisse)',
    ORANGE_MONEY: 'Orange Money',
    MOOV_MONEY: 'Moov Money',
    VIREMENT: 'Virement / Chèque',
  }

  const row = (label: string, value: string, bold = false, color = '#374151') =>
    `<tr>
      <td style="padding:7px 0;border-bottom:1px solid #f3f4f6;color:#6b7280;font-size:12px;width:45%">${label}</td>
      <td style="padding:7px 0;border-bottom:1px solid #f3f4f6;text-align:right;font-size:12px;font-weight:${bold ? '800' : '600'};color:${color}">${value}</td>
    </tr>`

  const sectionTitle = (title: string) =>
    `<tr><td colspan="2" style="padding:14px 0 6px;font-size:9px;font-weight:900;letter-spacing:2px;text-transform:uppercase;color:#9ca3af;border-bottom:1px solid #e5e7eb">${title}</td></tr>`

  return `
<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Reçu ${refOp}</title>
<style>
  /* ─── RESET ─── */
  * { margin:0; padding:0; box-sizing:border-box; -webkit-print-color-adjust:exact; print-color-adjust:exact; }

  /* ─── ÉCRAN ET IMPRESSION : dimensions identiques ─── */
  /* On fixe .page à 560px dans TOUS les contextes.
     À l'impression, le navigateur réduit automatiquement pour tenir sur la feuille A4.
     Cela garantit que aperçu = impression = image WhatsApp. */
  body {
    font-family: -apple-system, 'Helvetica Neue', Arial, sans-serif;
    background: #fff;
    margin: 0;
  }
  .page {
    width: 560px;
    margin: 0 auto;
    padding: 40px 36px;
    background: #fff;
  }

  @media print {
    /* On laisse .page en 560px — le navigateur scale automatiquement pour A4 */
    body { margin: 0; }
    @page { margin: 0.5cm; }
  }
</style>
</head>
<body>
<div class="page">

  <!-- EN-TÊTE AGENCE -->
  <div style="text-align:center;padding-bottom:20px;border-bottom:2px solid #111;margin-bottom:20px">
    <div style="font-size:22px;font-weight:900;text-transform:uppercase;letter-spacing:1px;color:#111">${agence.nom_agence}</div>
    <div style="font-size:12px;color:#6b7280;margin-top:5px">
      ${agence.adresse_agence ? agence.adresse_agence + ' &bull; ' : ''}${agence.telephone_agence}
    </div>
    <div style="display:inline-block;margin-top:10px;background:#111;color:#fff;font-size:10px;font-weight:800;letter-spacing:2px;text-transform:uppercase;padding:4px 14px;border-radius:20px">
      REÇU DE PAIEMENT
    </div>
  </div>

  <!-- RÉFERENCE & DATE -->
  <div style="display:flex;justify-content:space-between;margin-bottom:20px;font-size:12px;color:#6b7280">
    <span>Référence : <strong style="color:#111;font-weight:800">${refOp}</strong></span>
    <span>${dateNow}</span>
  </div>

  <!-- TABLE PRINCIPALE -->
  <table style="width:100%;border-collapse:collapse">

    ${sectionTitle('Informations client')}
    ${row('Nom du client', formData.client_nom, true)}
    ${formData.client_telephone ? row('Téléphone', formData.client_telephone) : ''}
    ${formData.client_email ? row('Email', formData.client_email) : ''}

    ${sectionTitle('Détail du service')}
    ${row('Type de service', formData.type_activite, true)}
    ${formData.compagnie_fournisseur ? row('Compagnie / Fournisseur', formData.compagnie_fournisseur) : ''}
    ${formData.reference_document ? row('N° Billet / Référence', formData.reference_document) : ''}
    ${formData.description ? row('Description', formData.description) : ''}

    <!-- Champs dynamiques par service -->
    ${formData.type_activite === 'BILLET' && formData.vol_depart ? `
      ${formData.vol_depart ? row('Départ', formData.vol_depart) : ''}
      ${formData.vol_destination ? row('Destination', formData.vol_destination) : ''}
      ${formData.date_depart ? row('Date départ', new Date(formData.date_depart).toLocaleDateString('fr-FR')) : ''}
      ${formData.date_retour ? row('Date retour', new Date(formData.date_retour).toLocaleDateString('fr-FR')) : ''}
      ${formData.classe_voyage ? row('Classe', formData.classe_voyage) : ''}
      ${formData.numero_vol ? row('N° de vol', formData.numero_vol) : ''}
      ${formData.bagages_kg ? row('Bagages', formData.bagages_kg + ' kg') : ''}
    ` : ''}
    ${formData.type_activite === 'VISA' && formData.pays_destination_visa ? `
      ${formData.type_visa ? row('Type de visa', formData.type_visa) : ''}
      ${formData.pays_destination_visa ? row('Pays destination', formData.pays_destination_visa) : ''}
      ${formData.numero_passeport ? row('N° Passeport', formData.numero_passeport) : ''}
      ${formData.duree_sejour ? row('Durée séjour', formData.duree_sejour) : ''}
      ${formData.date_depot_visa ? row('Date dépôt', new Date(formData.date_depot_visa).toLocaleDateString('fr-FR')) : ''}
    ` : ''}
    ${formData.type_activite === 'HOTEL' && formData.hotel_nom ? `
      ${formData.hotel_nom ? row('Hôtel', formData.hotel_nom) : ''}
      ${formData.hotel_ville ? row('Ville', formData.hotel_ville) : ''}
      ${formData.date_checkin ? row('Check-in', new Date(formData.date_checkin).toLocaleDateString('fr-FR')) : ''}
      ${formData.date_checkout ? row('Check-out', new Date(formData.date_checkout).toLocaleDateString('fr-FR')) : ''}
      ${formData.nombre_nuits ? row('Nuits', formData.nombre_nuits) : ''}
      ${formData.type_chambre ? row('Chambre', formData.type_chambre) : ''}
    ` : ''}
    ${formData.type_activite === 'TRANSFERT' && formData.beneficiaire_nom ? `
      ${formData.beneficiaire_nom ? row('Bénéficiaire', formData.beneficiaire_nom) : ''}
      ${formData.beneficiaire_contact ? row('Contact bénéficiaire', formData.beneficiaire_contact) : ''}
      ${formData.devise_source && formData.devise_cible ? row('Devise', formData.devise_source + ' → ' + formData.devise_cible) : ''}
      ${formData.montant_transfert ? row('Montant transféré', formData.montant_transfert) : ''}
    ` : ''}
    ${formData.type_activite === 'TRANSPORT' && formData.depart_transport ? `
      ${formData.type_transport ? row('Type', formData.type_transport) : ''}
      ${formData.depart_transport ? row('Départ', formData.depart_transport) : ''}
      ${formData.arrivee_transport ? row('Arrivée', formData.arrivee_transport) : ''}
      ${formData.date_voyage ? row('Date', new Date(formData.date_voyage).toLocaleDateString('fr-FR')) : ''}
      ${formData.nombre_places ? row('Places', formData.nombre_places) : ''}
    ` : ''}

    ${sectionTitle('Règlement')}
    ${row('Mode de paiement', modePaiementLabel[formData.mode_paiement] || formData.mode_paiement)}

  </table>

  <!-- BLOC TOTAL -->
  <div style="margin-top:20px;background:#f9fafb;border-radius:12px;padding:16px;border:1px solid #e5e7eb">
    <div style="display:flex;justify-content:space-between;align-items:center">
      <span style="font-size:13px;font-weight:900;text-transform:uppercase;letter-spacing:1px;color:#111">Total à payer</span>
      <span style="font-size:26px;font-weight:900;color:#111">${formData.prix_vente.toLocaleString('fr-FR')} CFA</span>
    </div>

    ${formData.statut_paiement === 'AVANCE' ? `
    <div style="border-top:1px solid #e5e7eb;margin-top:12px;padding-top:12px">
      <div style="display:flex;justify-content:space-between;font-size:12px;margin-bottom:6px">
        <span style="color:#6b7280">Montant versé ce jour</span>
        <span style="font-weight:800;color:#059669">${formData.montant_verse.toLocaleString('fr-FR')} CFA</span>
      </div>
      <div style="display:flex;justify-content:space-between;font-size:12px">
        <span style="color:#6b7280">Reste à payer</span>
        <span style="font-weight:800;color:#dc2626">${(formData.prix_vente - formData.montant_verse).toLocaleString('fr-FR')} CFA</span>
      </div>
    </div>
    ` : ''}

    <div style="margin-top:12px;text-align:center">
      <span style="display:inline-block;padding:5px 16px;border-radius:20px;font-size:11px;font-weight:800;background:${statutInfo.bg};color:${statutInfo.color}">
        ${statutInfo.label}
      </span>
    </div>
  </div>

  <!-- SIGNATURES -->
  <div style="display:flex;justify-content:space-between;margin-top:40px;padding-top:20px;border-top:1px solid #e5e7eb">
    <div style="text-align:center">
      <div style="width:100px;border-top:1px solid #9ca3af;margin:0 auto 6px;padding-top:8px"></div>
      <div style="font-size:10px;color:#9ca3af">Signature Client</div>
    </div>
    <div style="text-align:center">
      <div style="width:100px;border-top:1px solid #9ca3af;margin:0 auto 6px;padding-top:8px"></div>
      <div style="font-size:10px;color:#9ca3af">Cachet Agence</div>
    </div>
  </div>

  <!-- PIED DE PAGE -->
  <div style="text-align:center;margin-top:24px;font-size:10px;color:#d1d5db;border-top:1px solid #f3f4f6;padding-top:12px">
    Merci de votre confiance — ${agence.nom_agence}
  </div>

</div>
</body>
</html>`
}

// ─── Modal Reçu ──────────────────────────────────────────────────────────────

function ModalRecu({
  formData,
  benefice,
  agence,
  onClose
}: {
  formData: FormData
  benefice: number
  agence: AgenceInfo
  onClose: () => void
}) {
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const [generating, setGenerating] = useState(false)
  const dateNow = new Date().toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' })
  const refOp = useRef(`OP-${Date.now().toString().slice(-8)}`).current

  const recuHTML = buildRecuHTML(formData, agence, refOp, dateNow)

  // ── FIX IMPRESSION : on utilise un Blob URL au lieu de document.write()
  // Cela garantit que le navigateur charge le fichier HTML complet comme une
  // vraie page, avec polices et styles correctement appliqués avant d'imprimer.
  const handlePrint = () => {
    const blob = new Blob([recuHTML], { type: 'text/html;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const win = window.open(url, '_blank', 'width=700,height=900')
    if (!win) return
    win.addEventListener('load', () => {
      setTimeout(() => {
        win.focus()
        win.print()
        // Libérer la mémoire après l'impression
        setTimeout(() => URL.revokeObjectURL(url), 2000)
      }, 500)
    })
  }

  // ── WhatsApp : capture iframe → canvas → image → téléchargement + ouverture WhatsApp ──
  const handleWhatsApp = async () => {
    const tel = formData.client_telephone.replace(/\D/g, '')
    setGenerating(true)

    try {
      const html2canvas = (await import('html2canvas')).default

      const iframe = document.createElement('iframe')
      iframe.style.cssText = 'position:fixed;top:-9999px;left:-9999px;width:620px;height:auto;border:none;visibility:hidden'
      document.body.appendChild(iframe)

      const iDoc = iframe.contentDocument || iframe.contentWindow?.document
      if (!iDoc) { setGenerating(false); return }
      iDoc.open()
      iDoc.write(recuHTML)
      iDoc.close()

      await new Promise(r => setTimeout(r, 700))

      const canvas = await html2canvas(iDoc.body, {
        scale: 2,
        useCORS: true,
        backgroundColor: '#ffffff',
        width: 620,
        windowWidth: 620,
      })

      document.body.removeChild(iframe)

      canvas.toBlob(async (blob) => {
        if (!blob) { setGenerating(false); return }

        if (navigator.share && navigator.canShare && navigator.canShare({ files: [new File([blob], 'recu.png', { type: 'image/png' })] })) {
          const file = new File([blob], `recu-${refOp}.png`, { type: 'image/png' })
          await navigator.share({ files: [file], title: `Reçu ${refOp}`, text: `Reçu de paiement — ${agence.nom_agence}` })
        } else {
          const url = URL.createObjectURL(blob)
          const a = document.createElement('a')
          a.href = url
          a.download = `recu-${refOp}.png`
          a.click()
          URL.revokeObjectURL(url)

          setTimeout(() => {
            const msg = encodeURIComponent(
              `🧾 *REÇU — ${agence.nom_agence}*\n📋 Réf: ${refOp} | 📅 ${dateNow}\n` +
              `👤 ${formData.client_nom} | 💰 ${formData.prix_vente.toLocaleString('fr-FR')} CFA\n` +
              `✅ Ci-joint votre reçu en image.`
            )
            window.open(`https://wa.me/${tel}?text=${msg}`, '_blank')
          }, 500)
        }
        setGenerating(false)
      }, 'image/png', 0.95)

    } catch (err) {
      console.error('Erreur génération image:', err)
      const msg = encodeURIComponent(
        `🧾 *REÇU DE PAIEMENT — ${agence.nom_agence}*\n\n` +
        `📋 Ref: ${refOp} | 📅 ${dateNow}\n👤 ${formData.client_nom}\n` +
        `🎫 ${formData.type_activite}\n💰 ${formData.prix_vente.toLocaleString('fr-FR')} CFA\n` +
        `✅ ${formData.statut_paiement === 'PAYE' ? 'Payé' : formData.statut_paiement === 'AVANCE' ? `Avance: ${formData.montant_verse.toLocaleString('fr-FR')} CFA` : 'Non payé'}\n` +
        `📞 ${agence.telephone_agence}`
      )
      window.open(`https://wa.me/${tel}?text=${msg}`, '_blank')
      setGenerating(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={onClose}>
      <div
        className="bg-white w-full sm:max-w-2xl rounded-t-3xl sm:rounded-3xl max-h-[94vh] flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex-none flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div>
            <h2 className="font-black text-sm uppercase tracking-widest text-gray-900">Aperçu du Reçu</h2>
            <p className="text-[10px] text-gray-400 mt-0.5">Ce que vous voyez = ce qui sera imprimé / envoyé</p>
          </div>
          <button onClick={onClose} className="p-2 rounded-full hover:bg-gray-100 transition-colors">
            <X size={18} className="text-gray-500" />
          </button>
        </div>

        {/* Aperçu iframe — rendu identique à l'impression */}
        <div className="flex-1 overflow-auto bg-gray-100 p-4">
          <div className="bg-white rounded-2xl shadow-lg overflow-hidden mx-auto" style={{ maxWidth: 620 }}>
            <iframe
              ref={iframeRef}
              srcDoc={recuHTML}
              title="Aperçu du reçu"
              className="w-full border-none"
              style={{ height: 780, display: 'block' }}
              scrolling="no"
            />
          </div>
        </div>

        {/* Boutons */}
        <div className="flex-none border-t border-gray-100 p-4 grid grid-cols-2 gap-3 bg-white">
          <button
            onClick={handleWhatsApp}
            disabled={generating}
            className="flex items-center justify-center gap-2 bg-green-500 hover:bg-green-600 active:scale-95 text-white py-3.5 rounded-2xl font-black text-sm transition-all disabled:opacity-60"
          >
            {generating ? (
              <><span className="animate-spin inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full" /> Génération...</>
            ) : (
              <><MessageCircle size={18} /> WhatsApp</>
            )}
          </button>
          <button
            onClick={handlePrint}
            className="flex items-center justify-center gap-2 bg-gray-900 hover:bg-black active:scale-95 text-white py-3.5 rounded-2xl font-black text-sm transition-all"
          >
            <Printer size={18} /> Imprimer
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Composant principal ──────────────────────────────────────────────────────

export default function NouvelleOperation() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [showRecu, setShowRecu] = useState(false)
  const [servicePersonnalise, setServicePersonnalise] = useState('')
  const [showAddService, setShowAddService] = useState(false)
  const [servicesPerso, setServicesPerso] = useState<string[]>([])
  const [etape, setEtape] = useState(1)
  const [savedData, setSavedData] = useState<FormData | null>(null)

  // ── FIX 1 : Données agence chargées depuis Supabase (table "agences") ──
  const [agence, setAgence] = useState<AgenceInfo>({
    nom_agence: '',
    telephone_agence: '',
    adresse_agence: '',
  })

  useEffect(() => {
    supabase
      .from('agences')
      .select('nom_agence, telephone_agence, adresse_agence')
      .limit(1)
      .single()
      .then(({ data, error }) => {
        if (data && !error) {
          setAgence({
            nom_agence: data.nom_agence ?? '',
            telephone_agence: data.telephone_agence ?? '',
            adresse_agence: data.adresse_agence ?? '',
          })
        }
      })
  }, [])

  // Inputs montants avec séparation de milliers
  const prixAchat = useMontantInput(0)
  const prixVente = useMontantInput(0)
  const fraisAnnexes = useMontantInput(0)
  const montantVerseInput = useMontantInput(0)

  const [formData, setFormData] = useState<FormData>({
    type_activite: 'BILLET',
    client_nom: '', client_telephone: '', client_email: '', description: '',
    compagnie_fournisseur: '', reference_document: '',
    prix_achat: 0, prix_vente: 0, frais_annexes: 0,
    mode_paiement: 'ESPECES', statut_paiement: 'PAYE', montant_verse: 0,
    vol_depart: '', vol_destination: '', date_depart: '', date_retour: '',
    classe_voyage: 'ECONOMIQUE', numero_vol: '', bagages_kg: '',
    type_visa: '', pays_destination_visa: '', date_depot_visa: '', duree_sejour: '', numero_passeport: '',
    devise_source: 'CFA', devise_cible: 'EUR', montant_transfert: '', taux_change: '',
    beneficiaire_nom: '', beneficiaire_contact: '',
    type_assurance: '', duree_couverture: '', numero_police: '',
    hotel_nom: '', hotel_ville: '', date_checkin: '', date_checkout: '', nombre_nuits: '', type_chambre: '',
    type_transport: '', depart_transport: '', arrivee_transport: '', date_voyage: '', nombre_places: '',
  })

  const beneficePrevu = prixVente.raw - prixAchat.raw - fraisAnnexes.raw
  const resteAPayer = prixVente.raw - montantVerseInput.raw

  useEffect(() => {
    if (formData.statut_paiement === 'PAYE') {
      montantVerseInput.setValue(prixVente.raw)
    } else if (formData.statut_paiement === 'NON_PAYE') {
      montantVerseInput.setValue(0)
    }
  }, [formData.statut_paiement, prixVente.raw])

  const serviceConfig = SERVICES_PRECONFIGS.find(s => s.id === formData.type_activite)

  const handleChange = (field: keyof FormData, val: string | number) => {
    setFormData(prev => ({ ...prev, [field]: val }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)

   const payload = {
  ...formData,

  // Dates
  date_depart: formData.date_depart || null,
  date_retour: formData.date_retour || null,
  date_depot_visa: formData.date_depot_visa || null,
  date_checkin: formData.date_checkin || null,
  date_checkout: formData.date_checkout || null,
  date_voyage: formData.date_voyage || null,

  // Numériques optionnels
  montant_transfert: formData.montant_transfert || null,
  taux_change: formData.taux_change || null,
  nombre_nuits: formData.nombre_nuits || null,
  nombre_places: formData.nombre_places || null,

  prix_achat: prixAchat.raw,
  prix_vente: prixVente.raw,
  frais_annexes: fraisAnnexes.raw,
  montant_verse: montantVerseInput.raw,
  benefice: beneficePrevu,
}

    setSavedData({ ...payload } as FormData)

    const { error } = await supabase.from('operations_agence').insert([payload])

    if (!error) {
      setShowRecu(true)
    } else {
      alert("Erreur lors de l'enregistrement : " + error.message)
    }
    setLoading(false)
  }

  const inputClass = "w-full p-3.5 bg-gray-50 border-2 border-transparent focus:border-gray-900 focus:bg-white rounded-xl outline-none font-bold text-sm transition-all"
  const labelClass = "block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1.5"

  // ─── Champs dynamiques selon le service ─────────────────────────────────────

  const renderChampsDynamiques = () => {
    switch (formData.type_activite) {
      case 'BILLET':
        return (
          <div className="space-y-4">
            <p className="text-[10px] font-black uppercase tracking-widest text-blue-500 flex items-center gap-1.5"><Plane size={12}/> Détails du vol</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelClass}>Ville de départ</label>
                <input className={inputClass} placeholder="Ex: Bamako (BKO)" value={formData.vol_depart} onChange={e => handleChange('vol_depart', e.target.value)} />
              </div>
              <div>
                <label className={labelClass}>Destination</label>
                <input className={inputClass} placeholder="Ex: Paris (CDG)" value={formData.vol_destination} onChange={e => handleChange('vol_destination', e.target.value)} />
              </div>
              <div>
                <label className={labelClass}>Date départ</label>
                <input type="date" className={inputClass} value={formData.date_depart} onChange={e => handleChange('date_depart', e.target.value)} />
              </div>
              <div>
                <label className={labelClass}>Date retour</label>
                <input type="date" className={inputClass} value={formData.date_retour} onChange={e => handleChange('date_retour', e.target.value)} />
              </div>
              <div>
                <label className={labelClass}>N° de vol</label>
                <input className={inputClass} placeholder="Ex: AF456" value={formData.numero_vol} onChange={e => handleChange('numero_vol', e.target.value)} />
              </div>
              <div>
                <label className={labelClass}>Franchise bagages (kg)</label>
                <input className={inputClass} placeholder="Ex: 23" value={formData.bagages_kg} onChange={e => handleChange('bagages_kg', e.target.value)} />
              </div>
              <div className="col-span-2">
                <label className={labelClass}>Classe de voyage</label>
                <div className="grid grid-cols-3 gap-2">
                  {['ECONOMIQUE', 'BUSINESS', 'PREMIERE'].map(cl => (
                    <button key={cl} type="button"
                      onClick={() => handleChange('classe_voyage', cl)}
                      className={`py-2.5 rounded-xl text-xs font-black border-2 transition-all ${formData.classe_voyage === cl ? 'bg-blue-600 text-white border-blue-600' : 'bg-gray-50 text-gray-500 border-transparent'}`}
                    >{cl}</button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )

      case 'VISA':
        return (
          <div className="space-y-4">
            <p className="text-[10px] font-black uppercase tracking-widest text-purple-500 flex items-center gap-1.5"><Globe size={12}/> Détails Visa / Séjour</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelClass}>Type de visa</label>
                <select className={inputClass} value={formData.type_visa} onChange={e => handleChange('type_visa', e.target.value)}>
                  <option value="">-- Choisir --</option>
                  <option value="TOURISTE">Visa Touriste</option>
                  <option value="AFFAIRES">Visa Affaires</option>
                  <option value="ETUDIANT">Visa Étudiant</option>
                  <option value="TRAVAIL">Visa Travail</option>
                  <option value="TRANSIT">Visa Transit</option>
                  <option value="FAMILLE">Visa Famille / Regroupement</option>
                </select>
              </div>
              <div>
                <label className={labelClass}>Pays de destination</label>
                <input className={inputClass} placeholder="Ex: France, Canada..." value={formData.pays_destination_visa} onChange={e => handleChange('pays_destination_visa', e.target.value)} />
              </div>
              <div>
                <label className={labelClass}>N° Passeport</label>
                <input className={inputClass} placeholder="Ex: ML-12345678" value={formData.numero_passeport} onChange={e => handleChange('numero_passeport', e.target.value)} />
              </div>
              <div>
                <label className={labelClass}>Durée de séjour</label>
                <input className={inputClass} placeholder="Ex: 90 jours" value={formData.duree_sejour} onChange={e => handleChange('duree_sejour', e.target.value)} />
              </div>
              <div className="col-span-2">
                <label className={labelClass}>Date de dépôt dossier</label>
                <input type="date" className={inputClass} value={formData.date_depot_visa} onChange={e => handleChange('date_depot_visa', e.target.value)} />
              </div>
            </div>
          </div>
        )

      case 'TRANSFERT':
        return (
          <div className="space-y-4">
            <p className="text-[10px] font-black uppercase tracking-widest text-amber-500 flex items-center gap-1.5"><Coins size={12}/> Détails Transfert</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelClass}>Devise envoyée</label>
                <select className={inputClass} value={formData.devise_source} onChange={e => handleChange('devise_source', e.target.value)}>
                  <option value="CFA">CFA (FCFA)</option>
                  <option value="EUR">Euro (€)</option>
                  <option value="USD">Dollar ($)</option>
                  <option value="MAD">Dirham (MAD)</option>
                  <option value="GNF">Franc Guinéen</option>
                </select>
              </div>
              <div>
                <label className={labelClass}>Devise reçue</label>
                <select className={inputClass} value={formData.devise_cible} onChange={e => handleChange('devise_cible', e.target.value)}>
                  <option value="EUR">Euro (€)</option>
                  <option value="USD">Dollar ($)</option>
                  <option value="CFA">CFA (FCFA)</option>
                  <option value="MAD">Dirham (MAD)</option>
                  <option value="GNF">Franc Guinéen</option>
                </select>
              </div>
              <div>
                <label className={labelClass}>Montant transféré</label>
                <input className={inputClass} placeholder="Ex: 500 000" value={formData.montant_transfert} onChange={e => handleChange('montant_transfert', e.target.value)} />
              </div>
              <div>
                <label className={labelClass}>Taux de change</label>
                <input className={inputClass} placeholder="Ex: 655.95" value={formData.taux_change} onChange={e => handleChange('taux_change', e.target.value)} />
              </div>
              <div>
                <label className={labelClass}>Nom bénéficiaire</label>
                <input className={inputClass} placeholder="Ex: Jean Traoré" value={formData.beneficiaire_nom} onChange={e => handleChange('beneficiaire_nom', e.target.value)} />
              </div>
              <div>
                <label className={labelClass}>Contact bénéficiaire</label>
                <input type="tel" className={inputClass} placeholder="Ex: +33 6 00 00 00" value={formData.beneficiaire_contact} onChange={e => handleChange('beneficiaire_contact', e.target.value)} />
              </div>
            </div>
          </div>
        )

      case 'ASSURANCE':
        return (
          <div className="space-y-4">
            <p className="text-[10px] font-black uppercase tracking-widest text-teal-500 flex items-center gap-1.5"><Receipt size={12}/> Détails Assurance</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelClass}>Type d&apos;assurance</label>
                <select className={inputClass} value={formData.type_assurance} onChange={e => handleChange('type_assurance', e.target.value)}>
                  <option value="">-- Choisir --</option>
                  <option value="VOYAGE">Assurance Voyage</option>
                  <option value="ANNULATION">Assurance Annulation</option>
                  <option value="SANTE">Assurance Santé</option>
                  <option value="RAPATRIEMENT">Rapatriement</option>
                  <option value="BAGAGES">Protection Bagages</option>
                </select>
              </div>
              <div>
                <label className={labelClass}>N° Police</label>
                <input className={inputClass} placeholder="Ex: POL-2024-001" value={formData.numero_police} onChange={e => handleChange('numero_police', e.target.value)} />
              </div>
              <div className="col-span-2">
                <label className={labelClass}>Durée de couverture</label>
                <input className={inputClass} placeholder="Ex: 30 jours" value={formData.duree_couverture} onChange={e => handleChange('duree_couverture', e.target.value)} />
              </div>
            </div>
          </div>
        )

      case 'HOTEL':
        return (
          <div className="space-y-4">
            <p className="text-[10px] font-black uppercase tracking-widest text-rose-500 flex items-center gap-1.5"><Hotel size={12}/> Détails Hôtel</p>
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <label className={labelClass}>Nom de l&apos;hôtel</label>
                <input className={inputClass} placeholder="Ex: Hôtel Radisson Blu" value={formData.hotel_nom} onChange={e => handleChange('hotel_nom', e.target.value)} />
              </div>
              <div>
                <label className={labelClass}>Ville</label>
                <input className={inputClass} placeholder="Ex: Abidjan" value={formData.hotel_ville} onChange={e => handleChange('hotel_ville', e.target.value)} />
              </div>
              <div>
                <label className={labelClass}>Type de chambre</label>
                <select className={inputClass} value={formData.type_chambre} onChange={e => handleChange('type_chambre', e.target.value)}>
                  <option value="">-- Choisir --</option>
                  <option value="SIMPLE">Chambre Simple</option>
                  <option value="DOUBLE">Chambre Double</option>
                  <option value="SUITE">Suite</option>
                  <option value="FAMILLE">Chambre Famille</option>
                </select>
              </div>
              <div>
                <label className={labelClass}>Check-in</label>
                <input type="date" className={inputClass} value={formData.date_checkin} onChange={e => handleChange('date_checkin', e.target.value)} />
              </div>
              <div>
                <label className={labelClass}>Check-out</label>
                <input type="date" className={inputClass} value={formData.date_checkout} onChange={e => handleChange('date_checkout', e.target.value)} />
              </div>
              <div className="col-span-2">
                <label className={labelClass}>Nombre de nuits</label>
                <input type="number" min="1" className={inputClass} placeholder="Ex: 3" value={formData.nombre_nuits} onChange={e => handleChange('nombre_nuits', e.target.value)} />
              </div>
            </div>
          </div>
        )

      case 'TRANSPORT':
        return (
          <div className="space-y-4">
            <p className="text-[10px] font-black uppercase tracking-widest text-indigo-500 flex items-center gap-1.5"><Bus size={12}/> Détails Transport</p>
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <label className={labelClass}>Type de transport</label>
                <div className="grid grid-cols-2 gap-2">
                  {[{id:'BUS', label:'Bus'},{id:'TRAIN', label:'Train'},{id:'TAXI', label:'Taxi / VTC'},{id:'FERRY', label:'Ferry / Bateau'}].map(t => (
                    <button key={t.id} type="button"
                      onClick={() => handleChange('type_transport', t.id)}
                      className={`py-2.5 rounded-xl text-xs font-black border-2 transition-all ${formData.type_transport === t.id ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-gray-50 text-gray-500 border-transparent'}`}
                    >{t.label}</button>
                  ))}
                </div>
              </div>
              <div>
                <label className={labelClass}>Point de départ</label>
                <input className={inputClass} placeholder="Ex: Bamako" value={formData.depart_transport} onChange={e => handleChange('depart_transport', e.target.value)} />
              </div>
              <div>
                <label className={labelClass}>Point d&apos;arrivée</label>
                <input className={inputClass} placeholder="Ex: Sikasso" value={formData.arrivee_transport} onChange={e => handleChange('arrivee_transport', e.target.value)} />
              </div>
              <div>
                <label className={labelClass}>Date du voyage</label>
                <input type="date" className={inputClass} value={formData.date_voyage} onChange={e => handleChange('date_voyage', e.target.value)} />
              </div>
              <div>
                <label className={labelClass}>Nombre de places</label>
                <input type="number" min="1" className={inputClass} placeholder="Ex: 2" value={formData.nombre_places} onChange={e => handleChange('nombre_places', e.target.value)} />
              </div>
            </div>
          </div>
        )

      case 'PACKAGE':
        return (
          <div className="space-y-4">
            <p className="text-[10px] font-black uppercase tracking-widest text-emerald-500 flex items-center gap-1.5"><Package size={12}/> Détails Package Voyage</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelClass}>Ville de départ</label>
                <input className={inputClass} placeholder="Ex: Bamako" value={formData.vol_depart} onChange={e => handleChange('vol_depart', e.target.value)} />
              </div>
              <div>
                <label className={labelClass}>Destination</label>
                <input className={inputClass} placeholder="Ex: Dubaï" value={formData.vol_destination} onChange={e => handleChange('vol_destination', e.target.value)} />
              </div>
              <div>
                <label className={labelClass}>Date de départ</label>
                <input type="date" className={inputClass} value={formData.date_depart} onChange={e => handleChange('date_depart', e.target.value)} />
              </div>
              <div>
                <label className={labelClass}>Date de retour</label>
                <input type="date" className={inputClass} value={formData.date_retour} onChange={e => handleChange('date_retour', e.target.value)} />
              </div>
              <div className="col-span-2">
                <label className={labelClass}>Hôtel inclus</label>
                <input className={inputClass} placeholder="Ex: Atlantis Palm Dubai ★★★★★" value={formData.hotel_nom} onChange={e => handleChange('hotel_nom', e.target.value)} />
              </div>
            </div>
          </div>
        )

      default:
        return null
    }
  }

  const allServices = [
    ...SERVICES_PRECONFIGS,
    ...servicesPerso.map(s => ({ id: s, label: s, icon: FileText, color: 'bg-gray-600', fields: [] }))
  ]

  // ─── Blocs réutilisables ──────────────────────────────────────────────────

  const BlockService = (
    <div className="bg-white p-5 lg:p-6 rounded-3xl border border-gray-100 shadow-sm">
      <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-3">Type de Service</label>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
        {allServices.map((item) => {
          const Icon = item.icon
          const isSelected = formData.type_activite === item.id
          return (
            <button key={item.id} type="button"
              onClick={() => setFormData(prev => ({ ...prev, type_activite: item.id }))}
              className={`flex items-center gap-2.5 p-3 rounded-2xl font-black text-xs transition-all border-2 ${
                isSelected
                  ? `${item.color} text-white border-transparent shadow-md`
                  : 'bg-gray-50 text-gray-500 border-transparent hover:bg-gray-100 active:scale-95'
              }`}
            >
              <Icon size={17} className={isSelected ? 'text-white' : 'text-gray-400'} />
              {item.label}
            </button>
          )
        })}
        {!showAddService ? (
          <button type="button" onClick={() => setShowAddService(true)}
            className="flex items-center gap-2 p-3 rounded-2xl font-black text-xs border-2 border-dashed border-gray-200 text-gray-400 hover:border-gray-400 hover:text-gray-600 transition-all"
          >
            <Plus size={16} /> Ajouter...
          </button>
        ) : (
          <div className="col-span-2 lg:col-span-4 flex gap-2">
            <input
              type="text"
              placeholder="Ex: Omra, Croisière, Pèlerinage..."
              className="flex-1 p-3 bg-gray-50 rounded-xl text-xs font-bold outline-none border-2 border-gray-900"
              value={servicePersonnalise}
              onChange={e => setServicePersonnalise(e.target.value)}
            />
            <button type="button"
              onClick={() => {
                if (servicePersonnalise.trim()) {
                  setServicesPerso(prev => [...prev, servicePersonnalise.trim().toUpperCase()])
                  setFormData(prev => ({ ...prev, type_activite: servicePersonnalise.trim().toUpperCase() }))
                  setServicePersonnalise('')
                  setShowAddService(false)
                }
              }}
              className="bg-gray-900 text-white px-4 rounded-xl text-xs font-black"
            >OK</button>
            <button type="button" onClick={() => setShowAddService(false)}
              className="bg-gray-100 text-gray-500 px-3 rounded-xl"
            ><X size={16}/></button>
          </div>
        )}
      </div>
    </div>
  )

  const BlockClient = (
    <div className="bg-white p-5 lg:p-6 rounded-3xl border border-gray-100 shadow-sm space-y-4">
      <div className="flex items-center gap-2 border-b border-gray-100 pb-3">
        <User size={15} className="text-gray-400" />
        <h2 className="text-[10px] font-black text-gray-900 uppercase tracking-wider">Client & Dossier</h2>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2">
          <label className={labelClass}>Nom complet *</label>
          <input required className={inputClass} placeholder="Ex: Moussa Diarra" value={formData.client_nom} onChange={e => handleChange('client_nom', e.target.value)} />
        </div>
        <div>
          <label className={labelClass}>Téléphone</label>
          <input type="tel" className={inputClass} placeholder="+223 70 00 00 00" value={formData.client_telephone} onChange={e => handleChange('client_telephone', e.target.value)} />
        </div>
        <div>
          <label className={labelClass}>Email</label>
          <input type="email" className={inputClass} placeholder="client@email.com" value={formData.client_email} onChange={e => handleChange('client_email', e.target.value)} />
        </div>
        <div>
          <label className={labelClass}>Compagnie / Fournisseur</label>
          <input className={inputClass} placeholder="Air France, Western Union..." value={formData.compagnie_fournisseur} onChange={e => handleChange('compagnie_fournisseur', e.target.value)} />
        </div>
        <div>
          <label className={labelClass}>N° Billet / Réf. Dossier</label>
          <input className={inputClass} placeholder="TK-23948203" value={formData.reference_document} onChange={e => handleChange('reference_document', e.target.value)} />
        </div>
        <div className="col-span-2">
          <label className={labelClass}>Description / Itinéraire</label>
          <textarea rows={2} className={`${inputClass} resize-none`} placeholder="Ex: Vol Aller-Retour Bamako-Paris (Classe Éco)" value={formData.description} onChange={e => handleChange('description', e.target.value)} />
        </div>
      </div>
    </div>
  )

  const BlockFinances = (
    <div className="bg-white p-5 lg:p-6 rounded-3xl border border-gray-100 shadow-sm space-y-4">
      <div className="flex items-center gap-2 border-b border-gray-100 pb-3">
        <Layers size={15} className="text-gray-400" />
        <h2 className="text-[10px] font-black text-gray-900 uppercase tracking-wider">Données Financières (CFA)</h2>
      </div>
      <div className="space-y-3">
        <MontantInput label="Coût achat agence *" colorClass="text-red-500" icon={Wallet} value={prixAchat.display} onChange={prixAchat.onChange} required />
        <MontantInput label="Frais annexes / Taxes" colorClass="text-blue-500" icon={FileText} value={fraisAnnexes.display} onChange={fraisAnnexes.onChange} />
        <MontantInput label="Prix de vente client *" colorClass="text-emerald-500" icon={Coins} value={prixVente.display} onChange={prixVente.onChange} required />
      </div>
      <div className={`p-4 rounded-2xl ${beneficePrevu >= 0 ? 'bg-emerald-50 border border-emerald-100' : 'bg-red-50 border border-red-100'}`}>
        <div className="flex items-center justify-between">
          <div>
            <span className="text-[9px] font-black uppercase tracking-widest text-gray-500 block">Marge nette</span>
            <span className="text-[10px] text-gray-400">En temps réel</span>
          </div>
          <div className="text-right">
            <span className={`text-2xl font-black ${beneficePrevu >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
              {beneficePrevu.toLocaleString('fr-FR')} CFA
            </span>
            {prixVente.raw > 0 && (
              <p className="text-[10px] text-gray-400">{((beneficePrevu / prixVente.raw) * 100).toFixed(1)}% de marge</p>
            )}
          </div>
        </div>
      </div>
    </div>
  )

  const BlockReglement = (
    <div className="bg-white p-5 lg:p-6 rounded-3xl border border-gray-100 shadow-sm space-y-4">
      <div className="flex items-center gap-2 border-b border-gray-100 pb-3">
        <Receipt size={15} className="text-gray-400" />
        <h2 className="text-[10px] font-black text-gray-900 uppercase tracking-wider">Règlement & Encaissement</h2>
      </div>

      <div>
        <label className={labelClass}>Statut du paiement</label>
        <div className="grid grid-cols-3 gap-2">
          {[
            { id: 'PAYE', label: 'Payé', icon: CheckCircle, style: 'text-emerald-700 bg-emerald-50 border-emerald-200' },
            { id: 'AVANCE', label: 'Avance', icon: Clock, style: 'text-amber-700 bg-amber-50 border-amber-200' },
            { id: 'NON_PAYE', label: 'Dette', icon: XCircle, style: 'text-red-700 bg-red-50 border-red-200' },
          ].map(s => {
            const SI = s.icon
            return (
              <button key={s.id} type="button"
                onClick={() => handleChange('statut_paiement', s.id)}
                className={`flex flex-col items-center p-3 rounded-xl font-bold text-xs border-2 transition-all ${formData.statut_paiement === s.id ? s.style : 'bg-gray-50 text-gray-400 border-transparent'}`}
              >
                <SI size={18} className="mb-1" />
                {s.label}
              </button>
            )
          })}
        </div>
      </div>

      <div>
        <label className={labelClass}>Mode de versement</label>
        <div className="grid grid-cols-2 gap-2">
          {[
            { id: 'ESPECES', label: 'Espèces' },
            { id: 'ORANGE_MONEY', label: 'Orange Money' },
            { id: 'MOOV_MONEY', label: 'Moov Money' },
            { id: 'VIREMENT', label: 'Virement / Chèque' },
          ].map(m => (
            <button key={m.id} type="button"
              onClick={() => handleChange('mode_paiement', m.id)}
              className={`py-2.5 px-3 rounded-xl text-xs font-black border-2 transition-all ${formData.mode_paiement === m.id ? 'bg-gray-900 text-white border-gray-900' : 'bg-gray-50 text-gray-500 border-transparent'}`}
            >{m.label}</button>
          ))}
        </div>
      </div>

      {formData.statut_paiement === 'AVANCE' && (
        <div className="grid grid-cols-2 gap-3 pt-1 border-t border-gray-100">
          <MontantInput
            label="Montant versé ce jour"
            colorClass="text-amber-600"
            icon={Wallet}
            value={montantVerseInput.display}
            onChange={montantVerseInput.onChange}
          />
          <div className="bg-amber-50 rounded-2xl p-3 flex flex-col justify-center border border-amber-100">
            <span className="text-[9px] font-black uppercase tracking-widest text-amber-700 block mb-1">Reste dû</span>
            <span className="text-xl font-black text-amber-800">{resteAPayer.toLocaleString('fr-FR')} CFA</span>
          </div>
        </div>
      )}

      <div>
        <label className={labelClass}>Notes internes</label>
        <textarea rows={2} className={`${inputClass} resize-none`} placeholder="Ex: Client à rappeler avant émission, dossier urgent..." />
      </div>
    </div>
  )

  const BlockSubmit = (
    <button type="submit" disabled={loading}
      className="w-full bg-gray-900 hover:bg-black text-white p-4 rounded-2xl font-black uppercase tracking-widest flex items-center justify-center gap-3 transition-all shadow-lg disabled:opacity-50 active:scale-[0.99]"
    >
      {loading ? (
        <span className="flex items-center gap-2"><span className="animate-spin inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full"></span>Enregistrement...</span>
      ) : (
        <><Save size={20} /> Enregistrer l&apos;opération</>
      )}
    </button>
  )

  return (
    <div className="min-h-screen bg-gray-50 pb-8">

      {/* ─── TOP BAR ─── */}
      <div className="sticky top-0 z-30 bg-white/95 backdrop-blur-md border-b border-gray-100 px-4 lg:px-8 py-3.5 lg:py-4">
        <div className="max-w-screen-xl mx-auto flex items-center justify-between">
          <Link href="/agence/dashboard" className="flex items-center text-gray-500 hover:text-gray-900 font-bold transition-colors gap-1.5">
            <ArrowLeft size={20} />
            <span className="text-sm hidden sm:inline">Retour au tableau de bord</span>
            <span className="text-sm sm:hidden">Retour</span>
          </Link>
          <h1 className="text-sm sm:text-base lg:text-xl font-black text-gray-900 uppercase tracking-tight">
            ✈ Nouvelle Opération
          </h1>
          <div className="hidden lg:flex items-center gap-3">
            {prixVente.raw > 0 && (
              <div className={`px-4 py-1.5 rounded-full text-xs font-black ${beneficePrevu >= 0 ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-800'}`}>
                Marge : {beneficePrevu.toLocaleString('fr-FR')} CFA
              </div>
            )}
            {/* Affiche le nom de l'agence chargé depuis la BD */}
            {agence.nom_agence && (
              <div className="px-4 py-1.5 rounded-full text-xs font-black bg-gray-100 text-gray-700">
                {agence.nom_agence}
              </div>
            )}
          </div>
          <div className="w-20 lg:hidden" />
        </div>
      </div>

      {/* ─── LAYOUT PRINCIPAL ─── */}
      <form onSubmit={handleSubmit}>
        <div className="max-w-screen-xl mx-auto px-4 lg:px-8 py-5 lg:py-8">

          {/* ════ DESKTOP : 2 colonnes sticky ════ */}
          <div className="hidden lg:grid lg:grid-cols-[1fr_400px] xl:grid-cols-[1fr_440px] gap-6 items-start">
            <div className="space-y-5">
              {BlockService}
              {BlockClient}
              {serviceConfig && (
                <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm">
                  {renderChampsDynamiques()}
                </div>
              )}
            </div>
            <div className="sticky top-[73px] space-y-5">
              {BlockFinances}
              {BlockReglement}
              {BlockSubmit}
            </div>
          </div>

          {/* ════ MOBILE : colonne unique ════ */}
          <div className="lg:hidden space-y-4">
            {BlockService}
            {BlockClient}
            {serviceConfig && (
              <div className="bg-white p-5 rounded-3xl border border-gray-100 shadow-sm">
                {renderChampsDynamiques()}
              </div>
            )}
            {BlockFinances}
            {BlockReglement}
            {BlockSubmit}
          </div>

        </div>
      </form>

      {/* ─── MODAL REÇU ───
          FIX 2 : on passe l'objet "agence" complet (récupéré de Supabase)
          au lieu des anciens props séparés agenceNom / agenceTel qui ne
          correspondaient pas à la signature du composant ModalRecu. */}
      {showRecu && savedData && (
        <ModalRecu
          formData={{
            ...savedData,
            prix_achat: prixAchat.raw,
            prix_vente: prixVente.raw,
            frais_annexes: fraisAnnexes.raw,
            montant_verse: montantVerseInput.raw,
          }}
          benefice={beneficePrevu}
          agence={agence}
          onClose={() => {
            setShowRecu(false)
            router.push('/agence/dashboard')
          }}
        />
      )}

    </div>
  )
}
