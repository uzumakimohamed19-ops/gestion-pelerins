'use client'

import { useState, useEffect, useRef } from 'react'
import { usePowerSync, useQuery } from '@powersync/react'
import { supabase, getUser } from '../../../lib/supabase'
import { useRouter } from 'next/navigation'
import {
  ArrowLeft, Save, Wallet, Plane, Globe, Receipt, FileText,
  User, Layers, CheckCircle, Clock, XCircle, Coins, Plus,
  Printer, MessageCircle, Hotel, Bus, Package,
  Settings, Smartphone, ArrowRightLeft, Check, X, Moon, Sun,
  Delete, Calculator, SendHorizontal, RotateCcw,
  ArrowUpRight, ArrowDownLeft
} from 'lucide-react'
import Link from 'next/link'

// ─── Types ───────────────────────────────────────────────────────────────────

type TypeService = {
  id: string
  label: string
  icon: React.ElementType
  color: string
}

type OperateurTransfert = {
  id: string
  nom: string
  tauxDepot: number
  ajouterAuClientDepot: boolean
  tauxRetrait: number
  ajouterAuClientRetrait: boolean
}

const OPERATEURS_INITIAUX: OperateurTransfert[] = [
  { id: 'ORANGE_MONEY', nom: 'Orange Money', tauxDepot: 1.0, ajouterAuClientDepot: false, tauxRetrait: 1.0, ajouterAuClientRetrait: false },
  { id: 'MOOV_MONEY', nom: 'Moov Money', tauxDepot: 1.0, ajouterAuClientDepot: false, tauxRetrait: 1.0, ajouterAuClientRetrait: false },
  { id: 'WAVE', nom: 'Wave Mali', tauxDepot: 1.0, ajouterAuClientDepot: false, tauxRetrait: 1.0, ajouterAuClientRetrait: false },
  { id: 'RIA', nom: 'Ria Money Transfer', tauxDepot: 2.5, ajouterAuClientDepot: true, tauxRetrait: 1.5, ajouterAuClientRetrait: false },
  { id: 'WESTERN_UNION', nom: 'Western Union', tauxDepot: 3.0, ajouterAuClientDepot: true, tauxRetrait: 1.5, ajouterAuClientRetrait: false },
  { id: 'MONEYGRAM', nom: 'MoneyGram', tauxDepot: 2.5, ajouterAuClientDepot: true, tauxRetrait: 1.5, ajouterAuClientRetrait: false },
]

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
  notes_internes: string
  vol_depart: string
  vol_destination: string
  date_depart: string
  date_retour: string
  classe_voyage: string
  numero_vol: string
  bagages_kg: string
  type_visa: string
  pays_destination_visa: string
  date_depot_visa: string
  duree_sejour: string
  numero_passeport: string
  devise_source: string
  devise_cible: string
  montant_transfert: string
  taux_change: string
  beneficiaire_nom: string
  beneficiaire_contact: string
  type_operation_transfert: 'ENVOI' | 'RETRAIT'
  type_assurance: string
  duree_couverture: string
  numero_police: string
  hotel_nom: string
  hotel_ville: string
  date_checkin: string
  date_checkout: string
  nombre_nuits: string
  type_chambre: string
  type_transport: string
  depart_transport: string
  arrivee_transport: string
  date_voyage: string
  nombre_places: string
}

type AgenceInfo = {
  id?: string
  nom_agence: string
  telephone_agence: string
  adresse_agence: string
}

const SERVICES_PRECONFIGS: TypeService[] = [
  { id: 'TRANSFERT', label: "Transfert d'argent", icon: ArrowRightLeft, color: 'bg-emerald-600 text-white' },
  { id: 'BILLET', label: 'Billet Avion', icon: Plane, color: 'bg-blue-600 text-white' },
  { id: 'VISA', label: 'Visa / Séjour', icon: Globe, color: 'bg-purple-600 text-white' },
  { id: 'HOTEL', label: 'Hôtel', icon: Hotel, color: 'bg-rose-600 text-white' },
  { id: 'TRANSPORT', label: 'Transport', icon: Bus, color: 'bg-indigo-600 text-white' },
  { id: 'ASSURANCE', label: 'Assurance', icon: Receipt, color: 'bg-teal-600 text-white' },
  { id: 'PACKAGE', label: 'Package Voyage', icon: Package, color: 'bg-amber-600 text-white' },
]

const QUICK_CASH_AMOUNTS = [5000, 10000, 25000, 50000, 100000, 250000, 500000]

// ─── Helpers ─────────────────────────────────────────────────────────────────

const fmt = (n: number): string => (isNaN(n) ? '0' : n.toLocaleString('fr-FR'))

const formatMontant = (val: string | number): string => {
  const num = typeof val === 'string' ? parseInt(val.replace(/\D/g, ''), 10) : val
  if (isNaN(num) || num === 0) return ''
  return new Intl.NumberFormat('fr-FR').format(num)
}

const parseMontant = (val: string): number => {
  return parseInt(val.replace(/\s/g, '').replace(/\./g, '').replace(/,/g, ''), 10) || 0
}

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

  const addAmount = (v: number) => {
    const current = parseMontant(raw)
    const next = current + v
    setValue(next)
  }

  const clear = () => {
    setValue(0)
  }

  return { display, raw: parseMontant(raw), onChange, setValue, addAmount, clear }
}

// ─── Composant Montant Saisi Sans Bug Fantôme ────────────────────────────────

function MontantInput({
  label,
  placeholder,
  colorClass,
  icon: Icon,
  value,
  onChange,
  required = false,
  isDark = false
}: {
  label: string
  placeholder?: string
  colorClass: string
  icon: React.ElementType
  value: string
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void
  required?: boolean
  isDark?: boolean
}) {
  return (
    <div>
      <label className={`block text-[10px] font-bold tracking-wider uppercase mb-1 ${colorClass}`}>{label}</label>
      <div className={`flex items-center gap-2 px-3 py-2.5 rounded-xl border transition-all ${
        isDark 
          ? 'bg-[#2C2C2E] border-[#38383A] focus-within:border-[#545458]' 
          : 'bg-slate-50/80 border-slate-200 focus-within:border-slate-800 focus-within:bg-white'
      }`}>
        <div className={`shrink-0 pointer-events-none ${isDark ? 'text-[#8E8E93]' : 'text-slate-400'}`}>
          <Icon size={16} />
        </div>
        <input
          required={required}
          type="text"
          inputMode="numeric"
          placeholder={placeholder || '0'}
          className={`w-full bg-transparent border-0 p-0 font-bold text-sm outline-none text-right ${
            isDark ? 'text-[#F5F5F7] placeholder:text-[#636366]' : 'text-slate-900 placeholder:text-slate-400'
          }`}
          value={value}
          onChange={onChange}
        />
        <span className={`text-[10px] font-extrabold uppercase shrink-0 pointer-events-none select-none ${
          isDark ? 'text-[#8E8E93]' : 'text-slate-400'
        }`}>
          CFA
        </span>
      </div>
    </div>
  )
}

// ─── Template Reçu Multiplateforme ────────────────────────────────────────────

function buildRecuHTML(formData: FormData, agence: AgenceInfo, refOp: string, dateNow: string): string {
  const statutInfo = {
    PAYE: { label: 'Payé intégralement', color: '#059669', bg: '#ecfdf5' },
    AVANCE: { label: 'Avance versée', color: '#d97706', bg: '#fffbeb' },
    NON_PAYE: { label: 'Non payé / Dette', color: '#dc2626', bg: '#fef2f2' },
  }[formData.statut_paiement] || { label: '', color: '#111', bg: '#f8fafc' }

  const modePaiementLabel: Record<string, string> = {
    ESPECES: 'Espèces (Caisse)',
    ORANGE_MONEY: 'Orange Money',
    MOOV_MONEY: 'Moov Money',
    WAVE: 'Wave',
    VIREMENT: 'Virement / Chèque',
  }

  const row = (label: string, value: string, bold = false, color = '#1e293b') =>
    `<tr>
      <td style="padding:6px 0;border-bottom:1px solid #f1f5f9;color:#64748b;font-size:12px;width:48%">${label}</td>
      <td style="padding:6px 0;border-bottom:1px solid #f1f5f9;text-align:right;font-size:12px;font-weight:${bold ? '700' : '500'};color:${color}">${value}</td>
    </tr>`

  const sectionTitle = (title: string) =>
    `<tr><td colspan="2" style="padding:12px 0 4px;font-size:9px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:#94a3b8;border-bottom:1px solid #e2e8f0">${title}</td></tr>`

  return `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1.0"/>
<title>Reçu ${refOp}</title>
<style>
  * { margin:0; padding:0; box-sizing:border-box; -webkit-print-color-adjust:exact; print-color-adjust:exact; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    background: #fff;
    color: #0f172a;
    width: 100%;
    margin: 0;
    padding: 0;
  }
  .receipt-box {
    width: 100%;
    max-width: 500px;
    margin: 0 auto;
    padding: 24px 20px;
  }
  @media print {
    @page { margin: 0.6cm; size: auto; }
    body { background: #fff; }
    .receipt-box { width: 100% !important; max-width: 100% !important; padding: 0 !important; }
  }
</style>
</head>
<body>
<div class="receipt-box">
  <div style="text-align:center;padding-bottom:16px;border-bottom:1px solid #0f172a;margin-bottom:14px">
    <div style="font-size:18px;font-weight:800;text-transform:uppercase;letter-spacing:0.5px;color:#0f172a">${agence.nom_agence || 'AGENCE DE VOYAGE'}</div>
    <div style="font-size:11px;color:#64748b;margin-top:4px">
      ${agence.adresse_agence ? agence.adresse_agence + ' &bull; ' : ''}${agence.telephone_agence || ''}
    </div>
    <div style="display:inline-block;margin-top:8px;background:#0f172a;color:#fff;font-size:9px;font-weight:700;letter-spacing:1px;text-transform:uppercase;padding:2px 10px;border-radius:6px">
      TICKET DE CAISSE
    </div>
  </div>

  <div style="display:flex;justify-content:space-between;margin-bottom:14px;font-size:11px;color:#64748b">
    <span>Réf: <strong style="color:#0f172a;font-weight:700">${refOp}</strong></span>
    <span>${dateNow}</span>
  </div>

  <table style="width:100%;border-collapse:collapse">
    ${sectionTitle('Client')}
    ${row('Nom du client', formData.client_nom || 'Client Comptoir', true)}
    ${formData.client_telephone ? row('Téléphone', formData.client_telephone) : ''}

    ${sectionTitle('Détail de la transaction')}
    ${row('Service', formData.type_activite, true)}
    ${formData.compagnie_fournisseur ? row('Opérateur / Compagnie', formData.compagnie_fournisseur, true) : ''}
    ${formData.reference_document ? row('Réf. Transaction', formData.reference_document, true) : ''}
    ${formData.description ? row('Description', formData.description) : ''}

    ${formData.type_activite === 'TRANSFERT' ? `
      ${row("Opération", formData.type_operation_transfert === 'RETRAIT' ? 'Retrait Espèces' : 'Dépôt / Envoi d’argent', true)}
      ${formData.montant_transfert ? row('Montant Principal', Number(formData.montant_transfert).toLocaleString('fr-FR') + ' ' + formData.devise_source, true) : ''}
      ${formData.beneficiaire_nom ? row('Bénéficiaire', formData.beneficiaire_nom) : ''}
      ${formData.beneficiaire_contact ? row('Contact Bénéficiaire', formData.beneficiaire_contact) : ''}
    ` : ''}

    ${formData.type_activite === 'BILLET' && formData.vol_depart ? `
      ${row('Itinéraire', formData.vol_depart + ' → ' + formData.vol_destination, true)}
      ${formData.date_depart ? row('Date départ', new Date(formData.date_depart).toLocaleDateString('fr-FR')) : ''}
      ${formData.numero_vol ? row('N° de vol', formData.numero_vol) : ''}
    ` : ''}

    ${formData.type_activite === 'VISA' && formData.pays_destination_visa ? `
      ${formData.type_visa ? row('Type visa', formData.type_visa) : ''}
      ${row('Pays de destination', formData.pays_destination_visa, true)}
      ${formData.numero_passeport ? row('N° Passeport', formData.numero_passeport) : ''}
      ${formData.duree_sejour ? row('Durée de séjour', formData.duree_sejour) : ''}
      ${formData.date_depot_visa ? row('Date dépôt', new Date(formData.date_depot_visa).toLocaleDateString('fr-FR')) : ''}
    ` : ''}

    ${formData.type_activite === 'HOTEL' && formData.hotel_nom ? `
      ${row('Hôtel', formData.hotel_nom, true)}
      ${formData.hotel_ville ? row('Ville', formData.hotel_ville) : ''}
      ${formData.date_checkin ? row('Check-in', new Date(formData.date_checkin).toLocaleDateString('fr-FR')) : ''}
      ${formData.date_checkout ? row('Check-out', new Date(formData.date_checkout).toLocaleDateString('fr-FR')) : ''}
      ${formData.nombre_nuits ? row('Nuits', String(formData.nombre_nuits)) : ''}
      ${formData.type_chambre ? row('Chambre', formData.type_chambre) : ''}
    ` : ''}

    ${formData.type_activite === 'TRANSPORT' && formData.depart_transport ? `
      ${row('Type Transport', formData.type_transport || 'Bus', true)}
      ${row('Trajet', formData.depart_transport + ' → ' + formData.arrivee_transport)}
      ${formData.date_voyage ? row('Date du voyage', new Date(formData.date_voyage).toLocaleDateString('fr-FR')) : ''}
      ${formData.nombre_places ? row('Nombre de places', String(formData.nombre_places)) : ''}
    ` : ''}

    ${formData.type_activite === 'ASSURANCE' && formData.type_assurance ? `
      ${row('Type d’assurance', formData.type_assurance, true)}
      ${formData.numero_police ? row('N° Police', formData.numero_police) : ''}
      ${formData.duree_couverture ? row('Durée de couverture', formData.duree_couverture) : ''}
    ` : ''}

    ${formData.type_activite === 'PACKAGE' && formData.vol_destination ? `
      ${row('Destination Forfait', formData.vol_destination, true)}
      ${formData.date_depart ? row('Date aller', new Date(formData.date_depart).toLocaleDateString('fr-FR')) : ''}
      ${formData.date_retour ? row('Date retour', new Date(formData.date_retour).toLocaleDateString('fr-FR')) : ''}
      ${formData.hotel_nom ? row('Prestations / Hôtel', formData.hotel_nom) : ''}
    ` : ''}

    ${sectionTitle('Encaissement')}
    ${row('Mode de paiement', modePaiementLabel[formData.mode_paiement] || formData.mode_paiement)}
  </table>

  <div style="margin-top:16px;background:#f8fafc;border-radius:8px;padding:14px;border:1px solid #e2e8f0">
    <div style="display:flex;justify-content:space-between;align-items:center">
      <span style="font-size:12px;font-weight:700;text-transform:uppercase;color:#0f172a">Total Facturé</span>
      <span style="font-size:22px;font-weight:800;color:#0f172a">${formData.prix_vente.toLocaleString('fr-FR')} CFA</span>
    </div>

    ${formData.statut_paiement === 'AVANCE' ? `
    <div style="border-top:1px solid #e2e8f0;margin-top:8px;padding-top:8px">
      <div style="display:flex;justify-content:space-between;font-size:11px;margin-bottom:3px">
        <span style="color:#64748b">Montant versé</span>
        <span style="font-weight:700;color:#059669">${formData.montant_verse.toLocaleString('fr-FR')} CFA</span>
      </div>
      <div style="display:flex;justify-content:space-between;font-size:11px">
        <span style="color:#64748b">Reste dû</span>
        <span style="font-weight:700;color:#dc2626">${(formData.prix_vente - formData.montant_verse).toLocaleString('fr-FR')} CFA</span>
      </div>
    </div>` : ''}

    <div style="margin-top:10px;text-align:center">
      <span style="display:inline-block;padding:3px 12px;border-radius:6px;font-size:10px;font-weight:700;background:${statutInfo.bg};color:${statutInfo.color}">
        ${statutInfo.label}
      </span>
    </div>
  </div>

  <div style="display:flex;justify-content:space-between;margin-top:28px;padding-top:12px;border-top:1px dashed #cbd5e1">
    <div style="text-align:center">
      <div style="font-size:9px;color:#94a3b8;margin-bottom:20px">Client</div>
      <div style="width:70px;border-bottom:1px solid #cbd5e1;margin:0 auto"></div>
    </div>
    <div style="text-align:center">
      <div style="font-size:9px;color:#94a3b8;margin-bottom:20px">Caisse / Agence</div>
      <div style="width:70px;border-bottom:1px solid #cbd5e1;margin:0 auto"></div>
    </div>
  </div>

  <div style="text-align:center;margin-top:16px;font-size:9px;color:#94a3b8">
    Merci de votre fidélité &bull; ${agence.telephone_agence || 'Agence'}
  </div>
</div>
</body>
</html>`
}

// ─── Modal Reçu Responsive & Flat ────────────────────────────────────────────

function ModalRecu({
  formData,
  agence,
  isDark,
  onClose
}: {
  formData: FormData
  agence: AgenceInfo
  isDark: boolean
  onClose: () => void
}) {
  const [generating, setGenerating] = useState(false)
  const dateNow = new Date().toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' })
  const refOp = useRef(`OP-${Date.now().toString().slice(-8)}`).current

  const recuHTML = buildRecuHTML(formData, agence, refOp, dateNow)

  const handlePrint = () => {
    const isTauri = typeof window !== 'undefined' && (window as any).__TAURI__

    if (isTauri) {
      window.print()
      return
    }

    const iframe = document.createElement('iframe')
    iframe.style.position = 'fixed'
    iframe.style.right = '0'
    iframe.style.bottom = '0'
    iframe.style.width = '0'
    iframe.style.height = '0'
    iframe.style.border = '0'
    document.body.appendChild(iframe)

    const doc = iframe.contentWindow?.document
    if (doc) {
      doc.open()
      doc.write(recuHTML)
      doc.close()
      setTimeout(() => {
        iframe.contentWindow?.focus()
        iframe.contentWindow?.print()
        setTimeout(() => document.body.removeChild(iframe), 1500)
      }, 350)
    }
  }

  const handleWhatsApp = async () => {
    const tel = formData.client_telephone.replace(/\D/g, '')
    setGenerating(true)
    try {
      const html2canvas = (await import('html2canvas')).default
      const iframe = document.createElement('iframe')
      iframe.style.cssText = 'position:fixed;top:-9999px;left:-9999px;width:500px;height:auto;border:none;visibility:hidden'
      document.body.appendChild(iframe)

      const iDoc = iframe.contentDocument || iframe.contentWindow?.document
      if (!iDoc) { setGenerating(false); return }
      iDoc.open()
      iDoc.write(recuHTML)
      iDoc.close()

      await new Promise(r => setTimeout(r, 600))

      const canvas = await html2canvas(iDoc.body, {
        scale: 2,
        useCORS: true,
        backgroundColor: '#ffffff',
        width: 500,
      })
      document.body.removeChild(iframe)

      canvas.toBlob(async (blob) => {
        if (!blob) { setGenerating(false); return }

        if (navigator.share && navigator.canShare && navigator.canShare({ files: [new File([blob], 'recu.png', { type: 'image/png' })] })) {
          const file = new File([blob], `recu-${refOp}.png`, { type: 'image/png' })
          await navigator.share({ files: [file], title: `Reçu ${refOp}`, text: `Reçu — ${agence.nom_agence}` })
        } else {
          const url = URL.createObjectURL(blob)
          const a = document.createElement('a')
          a.href = url
          a.download = `recu-${refOp}.png`
          a.click()
          URL.revokeObjectURL(url)

          setTimeout(() => {
            const msg = encodeURIComponent(
              `🧾 *TICKET — ${agence.nom_agence}*\n📋 Réf: ${refOp} | 📅 ${dateNow}\n` +
              `👤 Client: ${formData.client_nom || 'Client Comptoir'}\n💼 Service: ${formData.type_activite}\n` +
              `💰 Total: ${formData.prix_vente.toLocaleString('fr-FR')} CFA\n` +
              `✅ Merci de votre confiance.`
            )
            window.open(`https://wa.me/${tel}?text=${msg}`, '_blank')
          }, 400)
        }
        setGenerating(false)
      }, 'image/png', 0.95)
    } catch (err) {
      setGenerating(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
      <div className={`w-full max-w-lg rounded-2xl border overflow-hidden flex flex-col my-auto max-h-[92vh] ${
        isDark ? 'bg-[#1C1C1E] border-[#2C2C2E]' : 'bg-white border-slate-200'
      }`}>
        <div className={`flex items-center justify-between px-5 py-3.5 border-b ${isDark ? 'border-[#2C2C2E]' : 'border-slate-100'}`}>
          <div>
            <h2 className={`font-bold text-xs uppercase tracking-wider ${isDark ? 'text-[#F5F5F7]' : 'text-slate-900'}`}>Reçu de Caisse</h2>
            <p className="text-[10px] text-slate-400">Réf: {refOp}</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-slate-400 hover:text-slate-200 transition-colors">
            <X size={16} />
          </button>
        </div>

        <div className={`flex-1 overflow-y-auto p-3 sm:p-4 ${isDark ? 'bg-[#121214]' : 'bg-slate-50/60'}`}>
          <div className="bg-white rounded-xl border border-slate-200/80 overflow-hidden mx-auto">
            <iframe
              srcDoc={recuHTML}
              title="Aperçu du reçu"
              className="w-full border-none"
              style={{ minHeight: '500px', height: '600px', display: 'block' }}
            />
          </div>
        </div>

        <div className={`p-3.5 border-t flex flex-col gap-2 ${isDark ? 'border-[#2C2C2E] bg-[#1C1C1E]' : 'border-slate-100 bg-white'}`}>
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={handleWhatsApp}
              disabled={generating}
              className="flex items-center justify-center gap-1.5 bg-[#34C759] hover:bg-[#30B750] text-black py-3 rounded-xl font-bold text-xs transition-colors disabled:opacity-60 cursor-pointer"
            >
              <MessageCircle size={16} /> WhatsApp
            </button>
            <button
              onClick={handlePrint}
              className={`flex items-center justify-center gap-1.5 py-3 rounded-xl font-bold text-xs transition-colors cursor-pointer ${
                isDark ? 'bg-[#2C2C2E] hover:bg-[#3A3A3C] text-[#F5F5F7]' : 'bg-slate-900 hover:bg-slate-800 text-white'
              }`}
            >
              <Printer size={16} /> Imprimer Ticket
            </button>
          </div>

          <button
            onClick={onClose}
            className={`w-full flex items-center justify-center gap-1.5 py-3 rounded-xl font-bold text-xs transition-colors cursor-pointer ${
              isDark ? 'bg-[#2C2C2E] hover:bg-[#3A3A3C] text-[#F5F5F7]' : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
            }`}
          >
            <Check size={16} className="text-[#34C759]" /> Terminer & Caisse Suivante
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Composant POS Principal ──────────────────────────────────────────────────

export default function NouvelleOperation() {
  const db = usePowerSync()
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [showRecu, setShowRecu] = useState(false)
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)
  const [savedData, setSavedData] = useState<FormData | null>(null)

  // Thème Sombre Apple / Google
  const [isDark, setIsDark] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('compta_theme_dark') === 'true'
    }
    return false
  })

  const toggleDarkMode = () => {
    setIsDark(prev => {
      const next = !prev
      if (typeof window !== 'undefined') {
        localStorage.setItem('compta_theme_dark', String(next))
      }
      return next
    })
  }

  // Services personnalisés
  const [servicePersonnalise, setServicePersonnalise] = useState('')
  const [showAddService, setShowAddService] = useState(false)
  const [servicesPerso, setServicesPerso] = useState<string[]>([])

  // Opérateurs
  const [operateurs, setOperateurs] = useState<OperateurTransfert[]>(OPERATEURS_INITIAUX)
  const [showConfigTaux, setShowConfigTaux] = useState(false)
  const [nouveauOperateurNom, setNouveauOperateurNom] = useState('')
  const [nouveauTauxDepot, setNouveauTauxDepot] = useState('1.0')
  const [nouveauAjoutClientDepot, setNouveauAjoutClientDepot] = useState(false)
  const [nouveauTauxRetrait, setNouveauTauxRetrait] = useState('1.0')
  const [nouveauAjoutClientRetrait, setNouveauAjoutClientRetrait] = useState(false)

  // Données Agence
  const [agence, setAgence] = useState<AgenceInfo>({
    id: undefined,
    nom_agence: '',
    telephone_agence: '',
    adresse_agence: '',
  })

  useEffect(() => {
    async function init() {
      const { data } = await supabase.auth.getSession()
      if (data.session?.user?.id) {
        setCurrentUserId(data.session.user.id)
      } else {
        const { data: userData } = await getUser()
        if (userData?.user?.id) setCurrentUserId(userData.user.id)
      }
    }
    init()
  }, [])

  const { data: agencesLocales } = useQuery<{
    id: string
    nom_agence: string
    telephone_agence: string
    adresse_agence: string
  }>(
    `SELECT a.id, a.nom_agence, a.telephone_agence, a.adresse_agence
     FROM profiles p
     JOIN agences a ON p.agence_id = a.id
     WHERE p.id = ?
     LIMIT 1`,
    [currentUserId ?? '']
  )

  useEffect(() => {
    if (agencesLocales?.[0]) {
      const ag = agencesLocales[0]
      setAgence({
        id: ag.id,
        nom_agence: ag.nom_agence || 'Mon Agence',
        telephone_agence: ag.telephone_agence || '',
        adresse_agence: ag.adresse_agence || '',
      })

      const cleStorage = `taux_transfert_v3_depot_retrait_${ag.id || 'default'}`
      const savedTaux = localStorage.getItem(cleStorage)
      if (savedTaux) {
        try {
          setOperateurs(JSON.parse(savedTaux))
        } catch (e) {
          console.error(e)
        }
      }
    }
  }, [agencesLocales])

  const saveTauxConfig = (newOps: OperateurTransfert[]) => {
    setOperateurs(newOps)
    const cleStorage = `taux_transfert_v3_depot_retrait_${agence.id || 'default'}`
    localStorage.setItem(cleStorage, JSON.stringify(newOps))
  }

  // Inputs monétaires avec fonctions POS
  const prixAchat = useMontantInput(0)
  const prixVente = useMontantInput(0)
  const fraisAnnexes = useMontantInput(0)
  const montantVerseInput = useMontantInput(0)
  const montantTransfertInput = useMontantInput(0)

  const initFormData: FormData = {
    type_activite: 'TRANSFERT',
    client_nom: '',
    client_telephone: '',
    client_email: '',
    description: '',
    compagnie_fournisseur: '',
    reference_document: '',
    prix_achat: 0,
    prix_vente: 0,
    frais_annexes: 0,
    mode_paiement: 'ESPECES',
    statut_paiement: 'PAYE',
    montant_verse: 0,
    notes_internes: '',
    vol_depart: '',
    vol_destination: '',
    date_depart: '',
    date_retour: '',
    classe_voyage: 'ECONOMIQUE',
    numero_vol: '',
    bagages_kg: '',
    type_visa: '',
    pays_destination_visa: '',
    date_depot_visa: '',
    duree_sejour: '',
    numero_passeport: '',
    devise_source: 'CFA',
    devise_cible: 'CFA',
    montant_transfert: '',
    taux_change: '1',
    beneficiaire_nom: '',
    beneficiaire_contact: '',
    type_operation_transfert: 'ENVOI',
    type_assurance: '',
    duree_couverture: '',
    numero_police: '',
    hotel_nom: '',
    hotel_ville: '',
    date_checkin: '',
    date_checkout: '',
    nombre_nuits: '',
    type_chambre: '',
    type_transport: 'BUS',
    depart_transport: '',
    arrivee_transport: '',
    date_voyage: '',
    nombre_places: '',
  }

  const [formData, setFormData] = useState<FormData>(initFormData)

  const resetFormulaire = () => {
    setFormData(initFormData)
    prixAchat.setValue(0)
    prixVente.setValue(0)
    fraisAnnexes.setValue(0)
    montantVerseInput.setValue(0)
    montantTransfertInput.setValue(0)
  }

  useEffect(() => {
    if (formData.type_activite === 'TRANSFERT' && !formData.compagnie_fournisseur) {
      setFormData(prev => ({
        ...prev,
        compagnie_fournisseur: 'Orange Money',
        mode_paiement: 'ORANGE_MONEY'
      }))
    }
  }, [formData.type_activite, formData.compagnie_fournisseur])

  // 🎯 CALCUL AUTOMATIQUE & SYNCHRONISATION INSTANTANÉE (Même lors de la suppression du montant)
  useEffect(() => {
    if (formData.type_activite !== 'TRANSFERT') return

    const montantPrincipal = montantTransfertInput.raw

    // Si l'utilisateur efface le montant ou le remet à 0, TOUT doit être remis à 0
    if (!montantPrincipal || montantPrincipal <= 0) {
      prixAchat.setValue(0)
      prixVente.setValue(0)
      if (formData.statut_paiement === 'PAYE') {
        montantVerseInput.setValue(0)
      }
      return
    }

    const opCourant = operateurs.find(o => o.nom === formData.compagnie_fournisseur || o.id === formData.compagnie_fournisseur)
    const isEnvoi = formData.type_operation_transfert === 'ENVOI'

    const tauxCommission = opCourant 
      ? (isEnvoi ? opCourant.tauxDepot : opCourant.tauxRetrait) 
      : 1.0
    const ajouterAuClient = opCourant 
      ? (isEnvoi ? opCourant.ajouterAuClientDepot : opCourant.ajouterAuClientRetrait) 
      : false

    const commissionCalculee = Math.round(montantPrincipal * (tauxCommission / 100))

    if (ajouterAuClient) {
      prixAchat.setValue(montantPrincipal)
      prixVente.setValue(montantPrincipal + commissionCalculee)
    } else {
      prixAchat.setValue(Math.max(0, montantPrincipal - commissionCalculee))
      prixVente.setValue(montantPrincipal)
    }
  }, [montantTransfertInput.raw, formData.compagnie_fournisseur, formData.type_operation_transfert, operateurs])

  const beneficePrevu = prixVente.raw - prixAchat.raw - fraisAnnexes.raw
  const resteAPayer = prixVente.raw - montantVerseInput.raw

  useEffect(() => {
    if (formData.statut_paiement === 'PAYE') {
      montantVerseInput.setValue(prixVente.raw)
    } else if (formData.statut_paiement === 'NON_PAYE') {
      montantVerseInput.setValue(0)
    }
  }, [formData.statut_paiement, prixVente.raw])

  const handleChange = (field: keyof FormData, val: any) => {
    setFormData(prev => ({ ...prev, [field]: val }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)

    const nomClientFinal = formData.client_nom.trim() 
      ? formData.client_nom 
      : (formData.type_activite === 'TRANSFERT' ? 'Client Comptoir' : 'Client')

    const payload = {
      id: crypto.randomUUID(),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      agence_id: agence.id || null,
      user_id: currentUserId || null,
      type_activite: formData.type_activite,
      client_nom: nomClientFinal,
      client_telephone: formData.client_telephone || null,
      client_email: formData.client_email || null,
      description: formData.description || null,
      compagnie_fournisseur: formData.compagnie_fournisseur || null,
      reference_document: formData.reference_document || null,
      notes_internes: formData.notes_internes || null,
      mode_paiement: formData.mode_paiement,
      statut_paiement: formData.statut_paiement,

      prix_achat: prixAchat.raw,
      prix_vente: prixVente.raw,
      frais_annexes: fraisAnnexes.raw,
      montant_verse: montantVerseInput.raw,
      benefice: beneficePrevu,

      montant_transfert: montantTransfertInput.raw > 0 ? montantTransfertInput.raw : null,
      taux_change: formData.taux_change ? Number(formData.taux_change) : null,
      devise_source: formData.devise_source || 'CFA',
      devise_cible: formData.devise_cible || 'CFA',
      beneficiaire_nom: formData.beneficiaire_nom || null,
      beneficiaire_contact: formData.beneficiaire_contact || null,

      vol_depart: formData.vol_depart || null,
      vol_destination: formData.vol_destination || null,
      date_depart: formData.date_depart || null,
      date_retour: formData.date_retour || null,
      classe_voyage: formData.classe_voyage || null,
      numero_vol: formData.numero_vol || null,
      bagages_kg: formData.bagages_kg || null,

      type_visa: formData.type_visa || null,
      pays_destination_visa: formData.pays_destination_visa || null,
      date_depot_visa: formData.date_depot_visa || null,
      duree_sejour: formData.duree_sejour || null,
      numero_passeport: formData.numero_passeport || null,

      type_assurance: formData.type_assurance || null,
      duree_couverture: formData.duree_couverture || null,
      numero_police: formData.numero_police || null,

      hotel_nom: formData.hotel_nom || null,
      hotel_ville: formData.hotel_ville || null,
      date_checkin: formData.date_checkin || null,
      date_checkout: formData.date_checkout || null,
      nombre_nuits: formData.nombre_nuits ? parseInt(formData.nombre_nuits, 10) : null,
      type_chambre: formData.type_chambre || null,

      type_transport: formData.type_transport || null,
      depart_transport: formData.depart_transport || null,
      arrivee_transport: formData.arrivee_transport || null,
      date_voyage: formData.date_voyage || null,
      nombre_places: formData.nombre_places ? parseInt(formData.nombre_places, 10) : null,
    }

    setSavedData({ 
      ...formData, 
      client_nom: nomClientFinal, 
      prix_achat: prixAchat.raw, 
      prix_vente: prixVente.raw, 
      montant_verse: montantVerseInput.raw 
    })

    try {
      const columns = Object.keys(payload)
      const values = columns.map(c => (payload as any)[c])
      await db.execute(
        `INSERT INTO operations_agence (${columns.join(', ')}) VALUES (${columns.map(() => '?').join(', ')})`,
        values
      )
      setShowRecu(true)
    } catch (err: any) {
      alert("Erreur lors de l'enregistrement : " + (err?.message || 'Erreur SQL'))
    }
    setLoading(false)
  }

  const inputClass = `w-full p-2.5 sm:p-3 rounded-xl outline-none font-semibold text-sm transition-colors border ${
    isDark
      ? 'bg-[#2C2C2E] border-[#38383A] text-[#F5F5F7] placeholder:text-[#636366] focus:border-[#545458]'
      : 'bg-slate-50/80 border-slate-200 focus:border-slate-800 focus:bg-white text-slate-800'
  }`
  const labelClass = `block text-[10px] font-bold uppercase tracking-wider mb-1 ${isDark ? 'text-[#8E8E93]' : 'text-slate-500'}`

  // ─── Services disponibles ───────────────────────────────────────────────────
  const allServices = [
    ...SERVICES_PRECONFIGS,
    ...servicesPerso.map(s => ({ id: s, label: s, icon: FileText, color: 'bg-slate-800 text-white' }))
  ]

  // ─── Module Transfert Spécial Caisse POS ─────────────────────────────────────

  const renderModuleTransfertSpecial = () => {
    const isEnvoi = formData.type_operation_transfert === 'ENVOI'
    const opCourant = operateurs.find(o => o.nom === formData.compagnie_fournisseur || o.id === formData.compagnie_fournisseur)
    const tauxActif = opCourant ? (isEnvoi ? opCourant.tauxDepot : opCourant.tauxRetrait) : 1.0
    const ajoutClientActif = opCourant ? (isEnvoi ? opCourant.ajouterAuClientDepot : opCourant.ajouterAuClientRetrait) : false

    return (
      <div className={`p-4 sm:p-5 rounded-2xl border space-y-4 transition-colors ${
        isDark ? 'bg-[#1C1C1E] border-[#2C2C2E]' : 'bg-white border-slate-200/90 shadow-xs'
      }`}>
        
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5">
          <div className="flex items-center gap-2">
            <div className={`w-8 h-8 rounded-xl flex items-center justify-center ${isDark ? 'bg-emerald-500/20 text-[#34C759]' : 'bg-emerald-50 text-emerald-600'}`}>
              <Smartphone size={16} />
            </div>
            <div>
              <h2 className={`text-xs font-bold uppercase tracking-wider ${isDark ? 'text-[#F5F5F7]' : 'text-slate-900'}`}>Caisse Mobile Money & Réseaux</h2>
              <p className="text-[10px] text-slate-400">Guichet Express Mali</p>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setShowConfigTaux(!showConfigTaux)}
              className={`p-2 rounded-xl text-xs font-semibold flex items-center gap-1 transition-colors cursor-pointer ${
                isDark ? 'bg-[#2C2C2E] text-slate-300 hover:bg-[#38383A]' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
              title="Gérer les taux de commission"
            >
              <Settings size={14} />
              <span className="hidden sm:inline">Commissions</span>
            </button>
          </div>
        </div>

        {showConfigTaux && (
          <div className={`p-3.5 border rounded-xl space-y-3 ${
            isDark ? 'bg-[#121214] border-[#2C2C2E]' : 'bg-slate-50 border-slate-200/80'
          }`}>
            <div>
              <span className={`text-[11px] font-bold block ${isDark ? 'text-[#F5F5F7]' : 'text-slate-900'}`}>
                Configuration : Taux Dépôt & Taux Retrait
              </span>
              <p className={`text-[10px] ${isDark ? 'text-[#8E8E93]' : 'text-slate-500'}`}>
                Ajustez les pourcentages de commission pour chaque opérateur.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {operateurs.map((op) => (
                <div key={op.id} className={`p-2 rounded-lg border space-y-1.5 ${
                  isDark ? 'bg-[#1C1C1E] border-[#2C2C2E]' : 'bg-white border-slate-200'
                }`}>
                  <span className={`text-xs font-bold block truncate ${isDark ? 'text-[#F5F5F7]' : 'text-slate-900'}`}>{op.nom}</span>

                  <div className={`p-1.5 rounded-md border flex items-center justify-between ${
                    isDark ? 'bg-[#2C2C2E] border-[#38383A]' : 'bg-slate-50 border-slate-100'
                  }`}>
                    <span className={`text-[10px] font-bold ${isDark ? 'text-[#34C759]' : 'text-slate-700'}`}>Dépôt</span>
                    <div className="flex items-center gap-1">
                      <input
                        type="number"
                        step="0.1"
                        className={`w-12 p-1 text-xs font-bold border rounded outline-none text-right ${
                          isDark ? 'bg-[#1C1C1E] border-[#38383A] text-[#F5F5F7]' : 'bg-white border-slate-200 text-slate-800'
                        }`}
                        value={op.tauxDepot}
                        onChange={(e) => {
                          const val = parseFloat(e.target.value) || 0
                          const updated = operateurs.map(o => o.id === op.id ? { ...o, tauxDepot: val } : o)
                          saveTauxConfig(updated)
                        }}
                      />
                      <span className="text-xs text-slate-500">%</span>
                    </div>
                  </div>

                  <div className={`p-1.5 rounded-md border flex items-center justify-between ${
                    isDark ? 'bg-[#2C2C2E] border-[#38383A]' : 'bg-slate-50 border-slate-100'
                  }`}>
                    <span className={`text-[10px] font-bold ${isDark ? 'text-[#0A84FF]' : 'text-slate-700'}`}>Retrait</span>
                    <div className="flex items-center gap-1">
                      <input
                        type="number"
                        step="0.1"
                        className={`w-12 p-1 text-xs font-bold border rounded outline-none text-right ${
                          isDark ? 'bg-[#1C1C1E] border-[#38383A] text-[#F5F5F7]' : 'bg-white border-slate-200 text-slate-800'
                        }`}
                        value={op.tauxRetrait}
                        onChange={(e) => {
                          const val = parseFloat(e.target.value) || 0
                          const updated = operateurs.map(o => o.id === op.id ? { ...o, tauxRetrait: val } : o)
                          saveTauxConfig(updated)
                        }}
                      />
                      <span className="text-xs text-slate-500">%</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className={`pt-2 border-t flex flex-wrap items-center gap-2 ${isDark ? 'border-[#2C2C2E]' : 'border-slate-200'}`}>
              <input
                type="text"
                placeholder="Nouvel opérateur..."
                className={`flex-1 p-2 text-xs font-medium rounded-lg border outline-none ${
                  isDark ? 'bg-[#2C2C2E] border-[#38383A] text-[#F5F5F7] placeholder:text-[#636366]' : 'bg-white border-slate-200 text-slate-800'
                }`}
                value={nouveauOperateurNom}
                onChange={e => setNouveauOperateurNom(e.target.value)}
              />
              <button
                type="button"
                onClick={() => {
                  if (nouveauOperateurNom.trim()) {
                    const id = nouveauOperateurNom.trim().toUpperCase().replace(/\s+/g, '_')
                    const newOp: OperateurTransfert = {
                      id,
                      nom: nouveauOperateurNom.trim(),
                      tauxDepot: parseFloat(nouveauTauxDepot) || 1.0,
                      ajouterAuClientDepot: nouveauAjoutClientDepot,
                      tauxRetrait: parseFloat(nouveauTauxRetrait) || 1.0,
                      ajouterAuClientRetrait: nouveauAjoutClientRetrait,
                    }
                    const updated = [...operateurs, newOp]
                    saveTauxConfig(updated)
                    handleChange('compagnie_fournisseur', newOp.nom)
                    setNouveauOperateurNom('')
                  }
                }}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer ${
                  isDark ? 'bg-[#FFFFFF] text-[#000000] hover:bg-[#E5E5EA]' : 'bg-slate-900 text-white hover:bg-black'
                }`}
              >
                Ajouter
              </button>
            </div>
          </div>
        )}

        {/* 1. SWITCH TOUCH DÉPÔT / RETRAIT */}
        <div className={`grid grid-cols-2 gap-2 p-1.5 rounded-2xl border ${
          isDark ? 'bg-[#121214] border-[#2C2C2E]' : 'bg-slate-100 border-slate-200'
        }`}>
          <button
            type="button"
            onClick={() => handleChange('type_operation_transfert', 'ENVOI')}
            className={`py-3 rounded-xl text-xs sm:text-sm font-black flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
              isEnvoi 
                ? isDark ? 'bg-[#34C759] text-black shadow-md' : 'bg-emerald-600 text-white shadow-md' 
                : isDark ? 'text-[#8E8E93] hover:text-[#F5F5F7]' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <ArrowUpRight size={18} />
            <span>↗ DÉPÔT (ENVOI)</span>
          </button>
          <button
            type="button"
            onClick={() => handleChange('type_operation_transfert', 'RETRAIT')}
            className={`py-3 rounded-xl text-xs sm:text-sm font-black flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
              !isEnvoi 
                ? isDark ? 'bg-[#0A84FF] text-white shadow-md' : 'bg-blue-600 text-white shadow-md' 
                : isDark ? 'text-[#8E8E93] hover:text-[#F5F5F7]' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <ArrowDownLeft size={18} />
            <span>↙ RETRAIT ESPÈCES</span>
          </button>
        </div>

        {/* 2. SÉLECTION DES OPÉRATEURS TOUCH */}
        <div>
          <label className={labelClass}>Sélectionnez l'opérateur de transfert</label>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {operateurs.map((op) => {
              const isSelected = formData.compagnie_fournisseur === op.nom
              const tauxAffiche = isEnvoi ? op.tauxDepot : op.tauxRetrait

              return (
                <button
                  key={op.id}
                  type="button"
                  onClick={() => {
                    handleChange('compagnie_fournisseur', op.nom)
                    if (['Orange Money', 'Moov Money', 'Wave Mali'].includes(op.nom)) {
                      handleChange('mode_paiement', op.id)
                    } else {
                      handleChange('mode_paiement', 'ESPECES')
                    }
                  }}
                  className={`p-3 rounded-xl border text-left flex flex-col justify-between transition-all cursor-pointer min-h-[58px] ${
                    isSelected
                      ? isDark 
                        ? 'border-[#34C759] bg-[#34C759]/20 text-[#34C759] ring-2 ring-[#34C759]/40'
                        : 'border-emerald-600 bg-emerald-50 text-emerald-950 ring-2 ring-emerald-500/30 font-bold'
                      : isDark
                        ? 'border-[#2C2C2E] bg-[#2C2C2E] text-[#D1D1D6] hover:border-[#38383A]'
                        : 'border-slate-200 bg-slate-50/70 text-slate-700 hover:border-slate-300'
                  }`}
                >
                  <span className="text-xs sm:text-sm font-bold truncate block">{op.nom}</span>
                  <div className="flex items-center justify-between mt-1">
                    <span className={`text-[10px] font-bold ${isDark ? 'text-[#8E8E93]' : 'text-slate-500'}`}>Taux: {tauxAffiche}%</span>
                    {isSelected && <CheckCircle size={14} className={isDark ? 'text-[#34C759]' : 'text-emerald-600'} />}
                  </div>
                </button>
              )
            })}
          </div>
        </div>

        {/* 3. MONTANT PRINCIPAL AVEC PAVÉ DE RACCOURCIS RAPIDES (POS) */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className={labelClass}>Montant de la transaction (CFA) *</label>
            {montantTransfertInput.raw > 0 && (
              <button
                type="button"
                onClick={montantTransfertInput.clear}
                className="text-[10px] font-bold text-rose-500 hover:text-rose-600 flex items-center gap-1 cursor-pointer"
              >
                <RotateCcw size={12} /> Effacer (C)
              </button>
            )}
          </div>

          <div className={`flex items-center justify-between px-4 py-3 sm:py-3.5 rounded-2xl border transition-all ${
            isDark 
              ? 'bg-[#121214] border-[#38383A] focus-within:border-[#34C759]' 
              : 'bg-emerald-50/40 border-emerald-500 focus-within:border-emerald-700 focus-within:bg-white'
          }`}>
            <input
              type="text"
              inputMode="numeric"
              placeholder="0"
              className={`w-full bg-transparent border-0 p-0 font-black text-xl sm:text-2xl text-right outline-none ${
                isDark ? 'text-[#34C759]' : 'text-emerald-900'
              }`}
              value={montantTransfertInput.display}
              onChange={montantTransfertInput.onChange}
              required
            />
            <span className={`ml-2 text-xs sm:text-sm font-black select-none shrink-0 ${
              isDark ? 'text-slate-400' : 'text-emerald-800'
            }`}>
              FCFA
            </span>
          </div>

          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none pt-1">
            {QUICK_CASH_AMOUNTS.map((amt) => (
              <button
                key={amt}
                type="button"
                onClick={() => montantTransfertInput.addAmount(amt)}
                className={`px-2.5 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap transition-colors border cursor-pointer shrink-0 ${
                  isDark
                    ? 'bg-[#2C2C2E] border-[#38383A] text-[#F5F5F7] hover:bg-[#3A3A3C]'
                    : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-100 hover:border-slate-300'
                }`}
              >
                +{fmt(amt)}
              </button>
            ))}
          </div>

          {opCourant && montantTransfertInput.raw > 0 && (
            <div className={`p-2.5 rounded-xl border flex items-center justify-between text-xs font-bold ${
              isDark ? 'bg-[#2C2C2E] border-[#38383A] text-slate-300' : 'bg-slate-50 border-slate-200 text-slate-700'
            }`}>
              <span>Commission Agence ({tauxActif}%) :</span>
              <span className={isDark ? 'text-[#34C759]' : 'text-emerald-700'}>
                +{Math.round(montantTransfertInput.raw * (tauxActif / 100)).toLocaleString('fr-FR')} CFA
              </span>
            </div>
          )}
        </div>

        {/* 4. Réf. & Bénéficiaire Express */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-1">
          <div>
            <label className={labelClass}>Code Réf. / Transaction</label>
            <input
              className={inputClass}
              placeholder="Code MTCN, SMS..."
              value={formData.reference_document}
              onChange={e => handleChange('reference_document', e.target.value)}
            />
          </div>
          <div>
            <label className={labelClass}>Bénéficiaire (Optionnel)</label>
            <input
              className={inputClass}
              placeholder="Nom du bénéficiaire"
              value={formData.beneficiaire_nom}
              onChange={e => handleChange('beneficiaire_nom', e.target.value)}
            />
          </div>
          <div>
            <label className={labelClass}>Téléphone Bénéficiaire</label>
            <input
              type="tel"
              className={inputClass}
              placeholder="+223..."
              value={formData.beneficiaire_contact}
              onChange={e => handleChange('beneficiaire_contact', e.target.value)}
            />
          </div>
        </div>

      </div>
    )
  }

  // ─── Champs Dynamiques pour les autres services ─────────────────────────────

  const renderChampsDynamiques = () => {
    switch (formData.type_activite) {
      case 'BILLET':
        return (
          <div className="space-y-4">
            <p className={`text-[11px] font-bold uppercase tracking-wider flex items-center gap-1.5 ${isDark ? 'text-[#0A84FF]' : 'text-blue-600'}`}>
              <Plane size={14}/> Détails du vol
            </p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelClass}>Ville de départ</label>
                <input className={inputClass} placeholder="" value={formData.vol_depart} onChange={e => handleChange('vol_depart', e.target.value)} />
              </div>
              <div>
                <label className={labelClass}>Destination</label>
                <input className={inputClass} placeholder="" value={formData.vol_destination} onChange={e => handleChange('vol_destination', e.target.value)} />
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
                <input className={inputClass} placeholder="" value={formData.numero_vol} onChange={e => handleChange('numero_vol', e.target.value)} />
              </div>
              <div>
                <label className={labelClass}>Franchise bagages (kg)</label>
                <input className={inputClass} placeholder="" value={formData.bagages_kg} onChange={e => handleChange('bagages_kg', e.target.value)} />
              </div>
              <div className="col-span-2">
                <label className={labelClass}>Classe de voyage</label>
                <div className={`grid grid-cols-3 gap-1.5 p-1 rounded-xl ${isDark ? 'bg-[#2C2C2E]' : 'bg-slate-100'}`}>
                  {['ECONOMIQUE', 'BUSINESS', 'PREMIERE'].map(cl => (
                    <button key={cl} type="button"
                      onClick={() => handleChange('classe_voyage', cl)}
                      className={`py-2 rounded-lg text-xs font-semibold transition-colors ${
                        formData.classe_voyage === cl 
                          ? isDark ? 'bg-[#1C1C1E] text-[#F5F5F7] shadow-xs' : 'bg-white text-slate-900 shadow-xs' 
                          : isDark ? 'text-[#8E8E93] hover:text-[#F5F5F7]' : 'text-slate-600 hover:text-slate-900'
                      }`}
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
            <p className={`text-[11px] font-bold uppercase tracking-wider flex items-center gap-1.5 ${isDark ? 'text-[#BF5AF2]' : 'text-purple-600'}`}>
              <Globe size={14}/> Détails Visa / Séjour
            </p>
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
                  <option value="FAMILLE">Visa Famille</option>
                </select>
              </div>
              <div>
                <label className={labelClass}>Pays de destination</label>
                <input className={inputClass} placeholder="" value={formData.pays_destination_visa} onChange={e => handleChange('pays_destination_visa', e.target.value)} />
              </div>
              <div>
                <label className={labelClass}>N° Passeport</label>
                <input className={inputClass} placeholder="" value={formData.numero_passeport} onChange={e => handleChange('numero_passeport', e.target.value)} />
              </div>
              <div>
                <label className={labelClass}>Durée de séjour</label>
                <input className={inputClass} placeholder="" value={formData.duree_sejour} onChange={e => handleChange('duree_sejour', e.target.value)} />
              </div>
              <div className="col-span-2">
                <label className={labelClass}>Date de dépôt dossier</label>
                <input type="date" className={inputClass} value={formData.date_depot_visa} onChange={e => handleChange('date_depot_visa', e.target.value)} />
              </div>
            </div>
          </div>
        )

      case 'HOTEL':
        return (
          <div className="space-y-4">
            <p className={`text-[11px] font-bold uppercase tracking-wider flex items-center gap-1.5 ${isDark ? 'text-[#FF375F]' : 'text-rose-600'}`}>
              <Hotel size={14}/> Détails Réservation Hôtel
            </p>
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <label className={labelClass}>Nom de l'établissement</label>
                <input className={inputClass} placeholder="" value={formData.hotel_nom} onChange={e => handleChange('hotel_nom', e.target.value)} />
              </div>
              <div>
                <label className={labelClass}>Ville</label>
                <input className={inputClass} placeholder="" value={formData.hotel_ville} onChange={e => handleChange('hotel_ville', e.target.value)} />
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
                <input type="number" min="1" className={inputClass} placeholder="" value={formData.nombre_nuits} onChange={e => handleChange('nombre_nuits', e.target.value)} />
              </div>
            </div>
          </div>
        )

      case 'TRANSPORT':
        return (
          <div className="space-y-4">
            <p className={`text-[11px] font-bold uppercase tracking-wider flex items-center gap-1.5 ${isDark ? 'text-[#5E5CE6]' : 'text-indigo-600'}`}>
              <Bus size={14}/> Détails Transport / Billetterie Routière
            </p>
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <label className={labelClass}>Type de transport</label>
                <div className={`grid grid-cols-2 gap-1.5 p-1 rounded-xl ${isDark ? 'bg-[#2C2C2E]' : 'bg-slate-100'}`}>
                  {[{ id: 'BUS', label: 'Bus' }, { id: 'TRAIN', label: 'Train' }, { id: 'TAXI', label: 'Taxi' }, { id: 'FERRY', label: 'Ferry' }].map(t => (
                    <button key={t.id} type="button"
                      onClick={() => handleChange('type_transport', t.id)}
                      className={`py-2 rounded-lg text-xs font-semibold transition-colors ${
                        formData.type_transport === t.id 
                          ? isDark ? 'bg-[#1C1C1E] text-[#F5F5F7] shadow-xs' : 'bg-white text-slate-900 shadow-xs' 
                          : isDark ? 'text-[#8E8E93] hover:text-[#F5F5F7]' : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >{t.label}</button>
                  ))}
                </div>
              </div>
              <div>
                <label className={labelClass}>Départ</label>
                <input className={inputClass} placeholder="" value={formData.depart_transport} onChange={e => handleChange('depart_transport', e.target.value)} />
              </div>
              <div>
                <label className={labelClass}>Arrivée</label>
                <input className={inputClass} placeholder="" value={formData.arrivee_transport} onChange={e => handleChange('arrivee_transport', e.target.value)} />
              </div>
              <div>
                <label className={labelClass}>Date de voyage</label>
                <input type="date" className={inputClass} value={formData.date_voyage} onChange={e => handleChange('date_voyage', e.target.value)} />
              </div>
              <div>
                <label className={labelClass}>Nombre de places</label>
                <input type="number" min="1" className={inputClass} placeholder="" value={formData.nombre_places} onChange={e => handleChange('nombre_places', e.target.value)} />
              </div>
            </div>
          </div>
        )

      case 'ASSURANCE':
        return (
          <div className="space-y-4">
            <p className={`text-[11px] font-bold uppercase tracking-wider flex items-center gap-1.5 ${isDark ? 'text-[#64D2FF]' : 'text-teal-600'}`}>
              <Receipt size={14}/> Détails Assurance
            </p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelClass}>Type d'assurance</label>
                <select className={inputClass} value={formData.type_assurance} onChange={e => handleChange('type_assurance', e.target.value)}>
                  <option value="">-- Choisir --</option>
                  <option value="VOYAGE">Assurance Voyage</option>
                  <option value="SANTE">Assurance Santé</option>
                  <option value="ANNULATION">Annulation</option>
                  <option value="RAPATRIEMENT">Rapatriement</option>
                </select>
              </div>
              <div>
                <label className={labelClass}>N° Police</label>
                <input className={inputClass} placeholder="" value={formData.numero_police} onChange={e => handleChange('numero_police', e.target.value)} />
              </div>
              <div className="col-span-2">
                <label className={labelClass}>Durée de couverture</label>
                <input className={inputClass} placeholder="" value={formData.duree_couverture} onChange={e => handleChange('duree_couverture', e.target.value)} />
              </div>
            </div>
          </div>
        )

      case 'PACKAGE':
        return (
          <div className="space-y-4">
            <p className={`text-[11px] font-bold uppercase tracking-wider flex items-center gap-1.5 ${isDark ? 'text-[#FF9F0A]' : 'text-amber-600'}`}>
              <Package size={14}/> Détails Package Voyage
            </p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelClass}>Ville de départ</label>
                <input className={inputClass} placeholder="" value={formData.vol_depart} onChange={e => handleChange('vol_depart', e.target.value)} />
              </div>
              <div>
                <label className={labelClass}>Destination</label>
                <input className={inputClass} placeholder="" value={formData.vol_destination} onChange={e => handleChange('vol_destination', e.target.value)} />
              </div>
              <div>
                <label className={labelClass}>Date aller</label>
                <input type="date" className={inputClass} value={formData.date_depart} onChange={e => handleChange('date_depart', e.target.value)} />
              </div>
              <div>
                <label className={labelClass}>Date retour</label>
                <input type="date" className={inputClass} value={formData.date_retour} onChange={e => handleChange('date_retour', e.target.value)} />
              </div>
              <div className="col-span-2">
                <label className={labelClass}>Hôtel / Prestations incluses</label>
                <input className={inputClass} placeholder="" value={formData.hotel_nom} onChange={e => handleChange('hotel_nom', e.target.value)} />
              </div>
            </div>
          </div>
        )

      default:
        return null
    }
  }

  // ─── Blocs POS ──────────────────────────────────────────────────────────────

  const BlockService = (
    <div className={`p-3.5 sm:p-4 rounded-2xl border transition-colors ${
      isDark ? 'bg-[#1C1C1E] border-[#2C2C2E]' : 'bg-white border-slate-200/90 shadow-xs'
    }`}>
      <div className="flex items-center justify-between mb-2">
        <label className={labelClass}>Service au comptoir</label>
        {!showAddService ? (
          <button
            type="button"
            onClick={() => setShowAddService(true)}
            className={`text-[10px] font-bold flex items-center gap-1 cursor-pointer ${
              isDark ? 'text-slate-400 hover:text-white' : 'text-slate-500 hover:text-slate-900'
            }`}
          >
            <Plus size={12} /> Autre
          </button>
        ) : null}
      </div>

      <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
        {allServices.map((item) => {
          const Icon = item.icon
          const isSelected = formData.type_activite === item.id
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => {
                setFormData(prev => ({
                  ...prev,
                  type_activite: item.id,
                  compagnie_fournisseur: item.id === 'TRANSFERT' ? 'Orange Money' : '',
                  mode_paiement: item.id === 'TRANSFERT' ? 'ORANGE_MONEY' : 'ESPECES'
                }))
              }}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold transition-all border shrink-0 cursor-pointer ${
                isSelected
                  ? isDark ? 'bg-[#FFFFFF] text-[#000000] border-[#FFFFFF]' : 'bg-slate-900 text-white border-slate-900 shadow-xs'
                  : isDark ? 'bg-[#2C2C2E] text-[#D1D1D6] border-[#38383A] hover:bg-[#3A3A3C]' : 'bg-slate-50 text-slate-600 border-slate-200/80 hover:bg-slate-100'
              }`}
            >
              <Icon size={14} className={isSelected ? (isDark ? 'text-[#000000]' : 'text-white') : (isDark ? 'text-[#8E8E93]' : 'text-slate-400')} />
              <span>{item.label}</span>
            </button>
          )
        })}

        {showAddService && (
          <div className="flex items-center gap-1.5 shrink-0">
            <input
              type="text"
              placeholder="Nom service..."
              className={`p-1.5 rounded-lg text-xs font-semibold outline-none border ${
                isDark ? 'bg-[#2C2C2E] border-[#38383A] text-[#F5F5F7]' : 'bg-white border-slate-300 text-slate-800'
              }`}
              value={servicePersonnalise}
              onChange={e => setServicePersonnalise(e.target.value)}
            />
            <button
              type="button"
              onClick={() => {
                if (servicePersonnalise.trim()) {
                  const s = servicePersonnalise.trim().toUpperCase()
                  setServicesPerso(prev => [...prev, s])
                  setFormData(prev => ({ ...prev, type_activite: s, compagnie_fournisseur: '' }))
                  setServicePersonnalise('')
                  setShowAddService(false)
                }
              }}
              className="bg-emerald-600 text-white px-2.5 py-1.5 rounded-lg text-xs font-bold"
            >
              OK
            </button>
            <button
              type="button"
              onClick={() => setShowAddService(false)}
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600"
            >
              <X size={14} />
            </button>
          </div>
        )}
      </div>
    </div>
  )

  const BlockClient = (
    <div className={`p-4 sm:p-5 rounded-2xl border space-y-3 transition-colors ${
      isDark ? 'bg-[#1C1C1E] border-[#2C2C2E]' : 'bg-white border-slate-200/90 shadow-xs'
    }`}>
      <div className={`flex items-center gap-2 border-b pb-2 ${isDark ? 'border-[#2C2C2E]' : 'border-slate-100'}`}>
        <User size={14} className="text-slate-400" />
        <h2 className={`text-[10px] font-bold uppercase tracking-wider ${isDark ? 'text-[#F5F5F7]' : 'text-slate-900'}`}>
          {formData.type_activite === 'TRANSFERT' ? 'Informations Client (Optionnel)' : 'Client & Dossier'}
        </h2>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
        <div className="sm:col-span-2">
          <label className={labelClass}>
            {formData.type_activite === 'TRANSFERT' ? 'Nom client (Optionnel — Client Comptoir par défaut)' : 'Nom complet du client *'}
          </label>
          <input
            required={formData.type_activite !== 'TRANSFERT'}
            className={inputClass}
            placeholder={formData.type_activite === 'TRANSFERT' ? 'Client de passage' : ''}
            value={formData.client_nom}
            onChange={e => handleChange('client_nom', e.target.value)}
          />
        </div>
        <div>
          <label className={labelClass}>Téléphone</label>
          <input type="tel" className={inputClass} placeholder="+223..." value={formData.client_telephone} onChange={e => handleChange('client_telephone', e.target.value)} />
        </div>
        <div>
          <label className={labelClass}>Email (Optionnel)</label>
          <input type="email" className={inputClass} placeholder="" value={formData.client_email} onChange={e => handleChange('client_email', e.target.value)} />
        </div>

        {formData.type_activite !== 'TRANSFERT' && (
          <>
            <div>
              <label className={labelClass}>Fournisseur / Compagnie</label>
              <input 
                className={inputClass} 
                placeholder="" 
                value={formData.compagnie_fournisseur} 
                onChange={e => handleChange('compagnie_fournisseur', e.target.value)} 
              />
            </div>
            <div>
              <label className={labelClass}>N° Billet / Dossier</label>
              <input className={inputClass} placeholder="" value={formData.reference_document} onChange={e => handleChange('reference_document', e.target.value)} />
            </div>
          </>
        )}
      </div>
    </div>
  )

  // ─── TICKET DE CAISSE POS (Résumé d'encaissement direct) ─────────────────────

  const BlockFinances = (
    <div className={`p-4 sm:p-5 rounded-2xl border space-y-3.5 transition-colors ${
      isDark ? 'bg-[#1C1C1E] border-[#2C2C2E]' : 'bg-white border-slate-200/90 shadow-xs'
    }`}>
      
      {/* Résumé Grand Écran POS */}
      <div className={`p-4 rounded-2xl border flex flex-col justify-between gap-1 text-right ${
        isDark ? 'bg-[#121214] border-[#2C2C2E]' : 'bg-slate-900 text-white border-slate-900 shadow-sm'
      }`}>
        <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-wider opacity-80">
          <span>Net à Encaisser</span>
          <Calculator size={14} />
        </div>
        <div className={`text-2xl sm:text-3xl font-black tracking-tight ${isDark ? 'text-[#34C759]' : 'text-white'}`}>
          {prixVente.display ? `${prixVente.display} F` : '0 F'}
        </div>
        <div className="flex items-center justify-between border-t border-white/10 pt-2 text-[10px] font-semibold opacity-90">
          <span>Gain Agence :</span>
          <span className={beneficePrevu >= 0 ? (isDark ? 'text-[#34C759]' : 'text-emerald-300') : 'text-rose-400'}>
            +{fmt(beneficePrevu)} CFA
          </span>
        </div>
      </div>

      {/* Détail Prix d'achat & Frais Sans Bug Fantôme */}
      <div className="space-y-2">
        <MontantInput label="Coût d'achat / Débit *" colorClass={isDark ? 'text-[#FF453A]' : 'text-red-600'} icon={Wallet} value={prixAchat.display} onChange={prixAchat.onChange} required isDark={isDark} />
        <MontantInput label="Frais annexes" colorClass={isDark ? 'text-[#0A84FF]' : 'text-blue-600'} icon={FileText} value={fraisAnnexes.display} onChange={fraisAnnexes.onChange} isDark={isDark} />
        <MontantInput label="Prix Vente / Total Client *" colorClass={isDark ? 'text-[#34C759]' : 'text-emerald-700'} icon={Coins} value={prixVente.display} onChange={prixVente.onChange} required isDark={isDark} />
      </div>
    </div>
  )

  const BlockReglement = (
    <div className={`p-4 sm:p-5 rounded-2xl border space-y-3.5 transition-colors ${
      isDark ? 'bg-[#1C1C1E] border-[#2C2C2E]' : 'bg-white border-slate-200/90 shadow-xs'
    }`}>
      
      {/* 1. Statut Rapide */}
      <div>
        <label className={labelClass}>Statut du paiement</label>
        <div className={`grid grid-cols-3 gap-1.5 p-1 rounded-xl ${isDark ? 'bg-[#2C2C2E]' : 'bg-slate-100'}`}>
          {[
            { id: 'PAYE', label: 'Payé Net' },
            { id: 'AVANCE', label: 'Avance' },
            { id: 'NON_PAYE', label: 'Dette' },
          ].map(s => {
            const isSelected = formData.statut_paiement === s.id
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => handleChange('statut_paiement', s.id)}
                className={`py-2 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  isSelected 
                    ? isDark ? 'bg-[#1C1C1E] text-[#F5F5F7] shadow-xs' : 'bg-white text-slate-900 shadow-xs' 
                    : isDark ? 'text-[#8E8E93]' : 'text-slate-600'
                }`}
              >
                {s.label}
              </button>
            )
          })}
        </div>
      </div>

      {/* 2. Mode de versement en boutons POS */}
      <div>
        <label className={labelClass}>Mode d'encaissement</label>
        <div className="grid grid-cols-2 gap-1.5">
          {[
            { id: 'ESPECES', label: 'Espèces (Caisse)' },
            { id: 'ORANGE_MONEY', label: 'Orange Money' },
            { id: 'WAVE', label: 'Wave' },
            { id: 'MOOV_MONEY', label: 'Moov Money' },
            { id: 'VIREMENT', label: 'Compte Bancaire' },
          ].map(m => {
            const isSelected = formData.mode_paiement === m.id
            return (
              <button
                key={m.id}
                type="button"
                onClick={() => handleChange('mode_paiement', m.id)}
                className={`p-2.5 rounded-xl text-xs font-bold border text-left transition-all cursor-pointer ${
                  isSelected
                    ? isDark ? 'border-[#FFFFFF] bg-[#FFFFFF] text-[#000000]' : 'border-slate-900 bg-slate-900 text-white'
                    : isDark ? 'border-[#38383A] bg-[#2C2C2E] text-[#D1D1D6] hover:bg-[#38383A]' : 'border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100'
                }`}
              >
                {m.label}
              </button>
            )
          })}
        </div>
      </div>

      {formData.statut_paiement === 'AVANCE' && (
        <div className={`p-3 rounded-xl border space-y-2 ${isDark ? 'bg-[#2C2C2E] border-[#38383A]' : 'bg-amber-50/70 border-amber-200'}`}>
          <MontantInput
            label="Montant perçu ce jour"
            colorClass={isDark ? 'text-[#FF9F0A]' : 'text-amber-800'}
            icon={Wallet}
            value={montantVerseInput.display}
            onChange={montantVerseInput.onChange}
            isDark={isDark}
          />
          <div className="flex items-center justify-between text-xs font-bold pt-1">
            <span className={isDark ? 'text-slate-400' : 'text-amber-800'}>Reste dû client :</span>
            <span className={isDark ? 'text-[#FFD60A]' : 'text-amber-900'}>{resteAPayer.toLocaleString('fr-FR')} CFA</span>
          </div>
        </div>
      )}
    </div>
  )

  const BlockSubmit = (
    <button
      type="submit"
      disabled={loading}
      className={`w-full p-4 rounded-2xl font-black uppercase tracking-wider text-sm flex items-center justify-center gap-2.5 transition-all shadow-md disabled:opacity-50 cursor-pointer ${
        isDark 
          ? 'bg-[#34C759] hover:bg-[#30B750] text-black active:scale-[0.99]' 
          : 'bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white active:scale-[0.99]'
      }`}
    >
      {loading ? (
        <span className="flex items-center gap-2"><span className="animate-spin inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full"></span>Validation caisse...</span>
      ) : (
        <><SendHorizontal size={18} /> Valider & Sortir le Reçu</>
      )}
    </button>
  )

  return (
    <div className={`min-h-screen pb-16 transition-colors duration-150 select-none ${
      isDark ? 'bg-[#000000] text-[#F5F5F7]' : 'bg-slate-100/60 text-slate-800'
    }`}>
      
      {/* ─── TOPBAR POS ─── */}
      <div className={`sticky top-0 z-30 border-b backdrop-blur-md px-3.5 sm:px-8 py-2.5 sm:py-3 transition-colors ${
        isDark ? 'bg-[#161618]/90 border-[#2C2C2E]' : 'bg-white/95 border-slate-200 shadow-xs'
      }`}>
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Link href="/agence/dashboard" className={`p-1.5 rounded-lg transition-colors ${
              isDark ? 'text-[#8E8E93] hover:text-[#F5F5F7]' : 'text-slate-500 hover:text-slate-900'
            }`}>
              <ArrowLeft size={18} />
            </Link>
            <h1 className={`text-xs sm:text-base font-black tracking-tight ${isDark ? 'text-[#F5F5F7]' : 'text-slate-900'}`}>
              Caisse & Ventes (POS)
            </h1>
          </div>
          
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={toggleDarkMode}
              className={`hidden md:flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border transition-colors cursor-pointer ${
                isDark 
                  ? 'bg-[#2C2C2E] border-[#38383A] text-[#FFD60A]' 
                  : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-100'
              }`}
            >
              {isDark ? <Sun size={14} className="text-[#FFD60A]" /> : <Moon size={14} className="text-slate-600" />}
              <span>{isDark ? 'Mode clair' : 'Mode sombre'}</span>
            </button>

            {agence.nom_agence && (
              <span className={`px-2.5 py-1 rounded-md text-xs font-bold border truncate max-w-[150px] ${
                isDark ? 'bg-[#1C1C1E] text-slate-300 border-[#2C2C2E]' : 'bg-slate-50 text-slate-700 border-slate-200'
              }`}>
                {agence.nom_agence}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* ─── INTERFACE POS DEUX COLONNES (DESKTOP) OU COLONNE UNIQUE (MOBILE) ─── */}
      <form onSubmit={handleSubmit}>
        <div className="max-w-7xl mx-auto px-3 sm:px-6 py-3 sm:py-5">
          
          {/* Version Desktop : 2 colonnes */}
          <div className="hidden lg:grid lg:grid-cols-[1fr_420px] gap-4 items-start">
            <div className="space-y-4">
              {BlockService}
              {formData.type_activite === 'TRANSFERT' ? (
                renderModuleTransfertSpecial()
              ) : (
                <div className={`p-5 rounded-2xl border transition-colors ${
                  isDark ? 'bg-[#1C1C1E] border-[#2C2C2E]' : 'bg-white border-slate-200/90 shadow-xs'
                }`}>
                  {renderChampsDynamiques()}
                </div>
              )}
              {BlockClient}
            </div>

            {/* Colonne de droite dédiée à l'encaissement direct (Caisse) */}
            <div className="sticky top-[58px] space-y-3.5">
              {BlockFinances}
              {BlockReglement}
              {BlockSubmit}
            </div>
          </div>

          {/* Version Mobile : Touch-friendly fluide */}
          <div className="lg:hidden space-y-3">
            {BlockService}
            {formData.type_activite === 'TRANSFERT' ? (
              renderModuleTransfertSpecial()
            ) : (
              <div className={`p-4 rounded-2xl border transition-colors ${
                isDark ? 'bg-[#1C1C1E] border-[#2C2C2E]' : 'bg-white border-slate-200/90'
              }`}>
                {renderChampsDynamiques()}
              </div>
            )}
            {BlockClient}
            {BlockFinances}
            {BlockReglement}
            {BlockSubmit}
          </div>

        </div>
      </form>

      {/* Modal Reçu de Caisse */}
      {showRecu && savedData && (
        <ModalRecu
          formData={{
            ...savedData,
            prix_achat: prixAchat.raw,
            prix_vente: prixVente.raw,
            frais_annexes: fraisAnnexes.raw,
            montant_verse: montantVerseInput.raw,
          }}
          agence={agence}
          isDark={isDark}
          onClose={() => {
            setShowRecu(false)
            resetFormulaire()
          }}
        />
      )}

    </div>
  )
}