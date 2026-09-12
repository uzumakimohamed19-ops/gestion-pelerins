'use client'
import { useEffect, useState, useMemo, type ElementType } from 'react'
import { useQuery } from '@powersync/react'
import { useYear } from '@/lib/YearContext'
import Header from '@/components/Header'
import {
  Users, FileCheck, FileWarning, ArrowRight, Wallet,
  ShieldCheck, Globe, X, TrendingUp, AlertCircle,
  Download, Search, UserPlus, AlertTriangle, Filter, ChevronRight, FileSpreadsheet, Building2,
  Eye, EyeOff, FileText, Calendar, CheckCircle2
} from 'lucide-react'
import Link from 'next/link'
import { YearSelector } from '@/components/YearSelector'
import { get, set } from 'idb-keyval'

type Pelerin = {
  id?: string | number
  prenom?: string
  nom_complet?: string
  telephone_pelerin?: string
  agences?: { nom_agence?: string }
  document_url?: string | null
  sur_plateforme_gouv?: boolean
  sur_plateforme_nusuk?: boolean
  total_paye?: number
  campagne?: string | number | null
}

type TileCard = {
  label: string
  value: number | string
  icon: ElementType<{ size?: number; className?: string }>
  light: string
  textColor: string
  borderColor: string
  subtext?: string
  progress?: number
  progressColor?: string
  tag?: string
  bgMobile?: string
}

type AlertType = 'amber' | 'blue'

type AlertItem = {
  type: AlertType
  msg: string
  filter: string
}

type ModalState = {
  items: Pelerin[]
  title: string
  card?: TileCard
} | null

// ─── Modal de confirmation export PDF ─────────────────────────────────────────
type PdfConfirmModalProps = {
  isOpen: boolean
  onClose: () => void
  onConfirm: (includeFinance: boolean) => void
  title: string
  count: number
}

function PdfConfirmModal({ isOpen, onClose, onConfirm, title, count }: PdfConfirmModalProps) {
  if (!isOpen) return null
  return (
    <div
      className="fixed inset-0 z-[1100] flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6 flex flex-col gap-5 border border-slate-100"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center gap-3">
          <div className="p-3 rounded-xl bg-blue-50 border border-blue-100">
            <FileText size={22} className="text-blue-600" />
          </div>
          <div>
            <h3 className="text-base font-black text-slate-900">Exporter en PDF</h3>
            <p className="text-xs text-slate-500 mt-0.5">{count} pèlerin(s) — {title}</p>
          </div>
        </div>

        <div className="bg-amber-50 border border-amber-200/80 rounded-xl p-4">
          <p className="text-xs font-bold text-amber-900 mb-1 flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-500 inline-block" />
            Données financières
          </p>
          <p className="text-xs text-amber-800 leading-relaxed">
            Souhaitez-vous inclure les <strong>montants versés</strong> et les <strong>statuts de paiement</strong> dans le rapport PDF ?
          </p>
        </div>

        <div className="flex flex-col gap-2">
          <button
            onClick={() => onConfirm(true)}
            className="w-full flex items-center justify-center gap-2 py-3 bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold rounded-xl transition-colors active:scale-[0.98]"
          >
            <FileText size={15} />
            Inclure les données financières
          </button>
          <button
            onClick={() => onConfirm(false)}
            className="w-full flex items-center justify-center gap-2 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-bold rounded-xl transition-colors active:scale-[0.98]"
          >
            <FileText size={15} className="text-slate-500" />
            Sans données financières
          </button>
          <button
            onClick={onClose}
            className="w-full py-2.5 text-xs text-slate-400 hover:text-slate-600 font-medium transition-colors"
          >
            Annuler
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Génération et impression du PDF ─────────────────────────────────────────
function generateAndPrintPDF(
  items: Pelerin[],
  title: string,
  includeFinance: boolean,
  nomAgence: string,
  stats: {
    total: number
    tauxCompletion: number
    tauxPaiement: number
    tauxGouv: number
    tauxNusuk: number
  },
  recettes: number
) {
  const datePrint = new Date().toLocaleDateString('fr-FR', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
  })

  const totalPaye = items.reduce((acc, p) => acc + (p.total_paye || 0), 0)
  const payeCount = items.filter(p => (p.total_paye ?? 0) > 0).length
  const docsCount = items.filter(p => p.document_url).length
  const gouvCount = items.filter(p => p.sur_plateforme_gouv).length
  const nusukCount = items.filter(p => p.sur_plateforme_nusuk).length

  const rows = items.map((p, i) => {
    const statusPaiement = (p.total_paye ?? 0) > 0
      ? `<span style="background:#ecfdf5;color:#047857;padding:2px 8px;border-radius:6px;font-weight:700;font-size:11px;">Payé</span>`
      : `<span style="background:#fffbeb;color:#b45309;padding:2px 8px;border-radius:6px;font-weight:700;font-size:11px;">Impayé</span>`

    const docStatus = p.document_url
      ? `<span style="color:#059669;font-weight:700;">✓</span>`
      : `<span style="color:#d97706;font-weight:700;">✗</span>`
    const gouvStatus = p.sur_plateforme_gouv
      ? `<span style="color:#2563eb;font-weight:700;">✓</span>`
      : `<span style="color:#94a3b8;">—</span>`
    const nusukStatus = p.sur_plateforme_nusuk
      ? `<span style="color:#2563eb;font-weight:700;">✓</span>`
      : `<span style="color:#94a3b8;">—</span>`

    const financeCell = includeFinance
      ? `<td style="padding:10px 12px;text-align:right;font-weight:700;color:${(p.total_paye ?? 0) > 0 ? '#047857' : '#b45309'};">${(p.total_paye ?? 0) > 0 ? (p.total_paye ?? 0).toLocaleString('fr-FR') + ' CFA' : '—'}</td>
         <td style="padding:10px 12px;text-align:center;">${statusPaiement}</td>`
      : ''

    return `
      <tr style="background:${i % 2 === 0 ? '#fff' : '#f8fafc'};">
        <td style="padding:10px 12px;color:#94a3b8;font-size:11px;font-weight:600;">${i + 1}</td>
        <td style="padding:10px 12px;">
          <div style="font-weight:700;color:#0f172a;font-size:13px;">${p.prenom || ''} ${p.nom_complet || ''}</div>
          <div style="color:#94a3b8;font-size:11px;margin-top:2px;">${p.telephone_pelerin || 'Pas de numéro'}</div>
        </td>
        <td style="padding:10px 12px;font-size:12px;color:#1e40af;font-weight:600;">${p.agences?.nom_agence || '—'}</td>
        <td style="padding:10px 12px;text-align:center;">${docStatus}</td>
        <td style="padding:10px 12px;text-align:center;">${gouvStatus}</td>
        <td style="padding:10px 12px;text-align:center;">${nusukStatus}</td>
        ${financeCell}
      </tr>
    `
  }).join('')

  const thStyle = `padding:10px 12px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.05em;color:#475569;background:#f1f5f9;border-bottom:2px solid #e2e8f0;`

  const financeHeaders = includeFinance
    ? `<th style="${thStyle}text-align:right;">Montant (CFA)</th>
       <th style="${thStyle}text-align:center;">Statut</th>`
    : ''

  const html = `
    <!DOCTYPE html>
    <html lang="fr">
    <head>
      <meta charset="UTF-8" />
      <title>Rapport Hajj — ${title}</title>
      <style>
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap');
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
          font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
          background: #fff;
          color: #0f172a;
          font-size: 13px;
          line-height: 1.5;
        }
        @page {
          size: A4;
          margin: 14mm 12mm 14mm 12mm;
        }
        @media print {
          body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          .no-print { display: none !important; }
          tr { page-break-inside: avoid; }
        }
        table { border-collapse: collapse; width: 100%; }
        thead { display: table-header-group; }
        tfoot { display: table-footer-group; }
      </style>
    </head>
    <body>
      <div style="background:#2563eb;color:white;padding:24px 28px;border-radius:12px 12px 0 0;margin-bottom:0;">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:20px;">
          <div>
            <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.1em;color:#dbeafe;margin-bottom:6px;">Rapport Officiel — Campagne Hajj 2026</div>
            <h1 style="font-size:22px;font-weight:900;letter-spacing:-0.03em;line-height:1.2;">${title}</h1>
            <div style="margin-top:6px;font-size:12px;color:#eff6ff;font-weight:500;">${items.length} pèlerin(s) dans ce rapport</div>
          </div>
          <div style="text-align:right;flex-shrink:0;">
            <div style="font-size:11px;color:#dbeafe;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;">${nomAgence}</div>
            <div style="font-size:11px;color:#eff6ff;margin-top:4px;">${datePrint}</div>
            ${!includeFinance ? '<div style="margin-top:8px;background:rgba(255,255,255,0.2);padding:4px 8px;border-radius:4px;font-size:10px;font-weight:700;">DONNÉES FINANCIÈRES MASQUÉES</div>' : ''}
          </div>
        </div>
      </div>

      <div style="background:#f8fafc;border:1px solid #e2e8f0;border-top:none;padding:14px 28px;display:flex;gap:24px;flex-wrap:wrap;align-items:center;">
        <div style="display:flex;align-items:center;gap:8px;">
          <div style="width:8px;height:8px;border-radius:50%;background:#059669;"></div>
          <span style="font-size:11px;color:#64748b;font-weight:600;">Dossiers complets :</span>
          <span style="font-size:12px;font-weight:800;color:#0f172a;">${docsCount}/${items.length}</span>
        </div>
        <div style="display:flex;align-items:center;gap:8px;">
          <div style="width:8px;height:8px;border-radius:50%;background:#2563eb;"></div>
          <span style="font-size:11px;color:#64748b;font-weight:600;">Plateforme Gouv :</span>
          <span style="font-size:12px;font-weight:800;color:#0f172a;">${gouvCount}/${items.length}</span>
        </div>
        <div style="display:flex;align-items:center;gap:8px;">
          <div style="width:8px;height:8px;border-radius:50%;background:#2563eb;"></div>
          <span style="font-size:11px;color:#64748b;font-weight:600;">Inscriptions Nusuk :</span>
          <span style="font-size:12px;font-weight:800;color:#0f172a;">${nusukCount}/${items.length}</span>
        </div>
        ${includeFinance ? `
        <div style="display:flex;align-items:center;gap:8px;margin-left:auto;">
          <div style="width:8px;height:8px;border-radius:50%;background:#059669;"></div>
          <span style="font-size:11px;color:#64748b;font-weight:600;">Total encaissé :</span>
          <span style="font-size:12px;font-weight:800;color:#047857;">${totalPaye.toLocaleString('fr-FR')} CFA</span>
        </div>` : ''}
      </div>

      <div style="margin-top:20px;">
        <table>
          <thead>
            <tr>
              <th style="${thStyle}width:40px;">#</th>
              <th style="${thStyle}">Pèlerin</th>
              <th style="${thStyle}">Agence</th>
              <th style="${thStyle}text-align:center;">Dossier</th>
              <th style="${thStyle}text-align:center;">Gouv</th>
              <th style="${thStyle}text-align:center;">Nusuk</th>
              ${financeHeaders}
            </tr>
          </thead>
          <tbody>
            ${rows}
          </tbody>
        </table>
      </div>

      <div style="margin-top:30px;padding-top:14px;border-top:1px solid #e2e8f0;display:flex;justify-content:space-between;align-items:center;">
        <div style="font-size:10px;color:#94a3b8;font-weight:500;">
          Généré le ${datePrint} — Système de gestion Hajj 2026
        </div>
        <div style="font-size:10px;color:#94a3b8;font-weight:500;">
          ${nomAgence} — ${items.length} pèlerin(s) — ${title}
        </div>
      </div>

      <div class="no-print" style="position:fixed;bottom:24px;right:24px;display:flex;gap:10px;z-index:999;">
        <button
          onclick="window.print()"
          style="background:#2563eb;color:white;border:none;padding:10px 20px;border-radius:8px;font-size:13px;font-weight:700;cursor:pointer;display:flex;align-items:center;gap:8px;"
        >
          🖨️ Imprimer / Enregistrer PDF
        </button>
        <button
          onclick="window.close()"
          style="background:#f1f5f9;color:#475569;border:1px solid #e2e8f0;padding:10px 16px;border-radius:8px;font-size:13px;font-weight:700;cursor:pointer;"
        >
          ✕ Fermer
        </button>
      </div>
    </body>
    </html>
  `

  const printWindow = window.open('', '', 'width=1200,height=800')
  if (printWindow) {
    printWindow.document.write(html)
    printWindow.document.close()
    setTimeout(() => printWindow.print(), 250)
  }
}

// ─── Stat Card PC — Épurée et cohérente ───────────────────────────────────────
function Tile({ card, loading, onClick }: { card: TileCard; loading: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      disabled={loading}
      className={`
        text-left rounded-2xl p-4
        bg-white border ${card.borderColor}
        shadow-xs hover:border-slate-300
        transition-colors duration-150
        flex flex-col justify-between w-full min-h-[120px]
      `}
    >
      <div className="flex items-start justify-between w-full mb-3">
        <div className={`p-2.5 rounded-xl ${card.light} border border-slate-100`}>
          <card.icon size={18} className={card.textColor} />
        </div>
        {card.tag && (
          <span
            className={`text-[10px] font-extrabold px-2 py-0.5 rounded-full uppercase tracking-wider border
              ${card.light} ${card.textColor} ${card.borderColor}`}
          >
            {card.tag}
          </span>
        )}
      </div>

      <div className="min-w-0 w-full">
        {loading ? (
          <div className="h-7 w-24 bg-slate-100 rounded-lg mb-1.5" />
        ) : (
          <p className="text-[25px] font-black text-slate-900 leading-tight tabular-nums tracking-tight mb-1 truncate">
            {card.value}
          </p>
        )}
        <p className="text-[11px] text-slate-600 font-extrabold tracking-wider uppercase truncate">
          {card.label}
        </p>
      </div>

      {card.subtext && !loading && (
        <p className={`text-[10px] font-extrabold mt-2 ${card.textColor} ${card.light} px-2 py-0.5 rounded-md inline-block w-max max-w-full truncate border border-slate-100`}>
          {card.subtext}
        </p>
      )}

      {card.progress != null && !loading && (
        <Bar value={card.progress} color={card.progressColor ?? 'bg-slate-300'} />
      )}
    </button>
  )
}

// ─── Barre de progression statique ───────────────────────────────────────────
function Bar({ value, color }: { value: number; color: string }) {
  return (
    <div className="mt-2.5 h-1.5 bg-slate-100 rounded-full overflow-hidden">
      <div
        className={`h-full rounded-full ${color}`}
        style={{ width: `${value}%` }}
      />
    </div>
  )
}

// ─── Alertes latérales PC — Bicolore Bleu & Ambre ─────────────────────────────
const alertConfig = {
  amber: {
    dot: 'bg-amber-500',
    border: 'border-amber-200',
    bg: 'bg-amber-50/70',
    hoverBg: 'hover:bg-amber-100/60',
    text: 'text-amber-900',
    icon: 'text-amber-600',
  },
  blue: {
    dot: 'bg-blue-500',
    border: 'border-blue-200',
    bg: 'bg-blue-50/70',
    hoverBg: 'hover:bg-blue-100/60',
    text: 'text-blue-900',
    icon: 'text-blue-600',
  },
}

function AlertPill({ alert, onClick }: { alert: AlertItem; onClick: () => void }) {
  const s = alertConfig[alert.type] ?? alertConfig.amber
  return (
    <button
      onClick={onClick}
      className={`
        w-full text-left flex items-center gap-3 px-3.5 py-3 rounded-xl
        border ${s.border} ${s.bg} ${s.hoverBg}
        transition-colors duration-150 group
      `}
    >
      <span className={`w-2 h-2 rounded-full shrink-0 ${s.dot}`} />
      <p className={`text-xs font-bold ${s.text} leading-snug flex-1 min-w-0 truncate`}>
        {alert.msg}
      </p>
      <ChevronRight
        size={14}
        className={`${s.icon} shrink-0`}
      />
    </button>
  )
}

// ─── Dashboard Principal ─────────────────────────────────────────────────────
export default function Dashboard() {
  const { selectedYear, setSelectedYear, availableYears } = useYear()

  const [stats, setStats] = useState({
    total: 0, avecDoc: 0, sansDoc: 0,
    totalGouv: 0, totalNusuk: 0,
    avecPaiement: 0, sansPaiement: 0,
    tauxCompletion: 0, montantMoyen: 0,
    tauxGouv: 0, tauxNusuk: 0, tauxPaiement: 0,
    eligiblesNusuk: 0
  })
  const [recettes, setRecettes] = useState(0)
  const [loading, setLoading] = useState(true)
  const [allData, setAllData] = useState<Pelerin[]>([])
  const [agences, setAgences] = useState<string[]>([])
  const [modal, setModal] = useState<ModalState>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [agenceFilter, setAgenceFilter] = useState('all')
  const [activeTab, setActiveTab] = useState('all')
  const [nusukPaymentFilter, setNusukPaymentFilter] = useState('all')
  const [showAmount, setShowAmount] = useState(true)
  const [pdfConfirmOpen, setPdfConfirmOpen] = useState(false)
  const [pdfExportTarget, setPdfExportTarget] = useState<{ items: Pelerin[]; title: string } | null>(null)
  const [nomAgence, setNomAgence] = useState('')
  const [touchStartY, setTouchStartY] = useState<number | null>(null)
  const [dragOffset, setDragOffset] = useState(0)
  const dateDuJour = new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })

  const { data: rawPelerins, isLoading: powerSyncLoading } = useQuery<any>(`
    SELECT p.*, a.nom_agence AS agence_nom_agence
    FROM pelerins p
    LEFT JOIN agences a ON p.agence_id = a.id
    ORDER BY p.created_at DESC
  `)

  const powerSyncPelerins = useMemo<Pelerin[]>(() => (rawPelerins ?? []).map((p: any) => ({
    ...p,
    total_paye: Number(p.total_paye || 0),
    sur_plateforme_gouv: Boolean(p.sur_plateforme_gouv),
    sur_plateforme_nusuk: Boolean(p.sur_plateforme_nusuk),
    agences: p.agence_nom_agence ? { nom_agence: p.agence_nom_agence } : undefined,
  })), [rawPelerins])

  function processStats(data: Pelerin[]) {
    const filteredData = selectedYear === 'all' ? data : data.filter(p => p.campagne?.toString() === String(selectedYear))
    const total = filteredData.length
    const avec = filteredData.filter(p => p.document_url).length
    const totalGouv = filteredData.filter(p => p.sur_plateforme_gouv).length
    const totalNusuk = filteredData.filter(p => p.sur_plateforme_nusuk).length
    const avecPaiement = filteredData.filter(p => (p.total_paye ?? 0) > 0).length
    const sansPaiement = total - avecPaiement
    const totalRecettes = filteredData.reduce((acc, curr) => acc + (curr.total_paye || 0), 0)
    const pct = (n: number) => total > 0 ? Math.round((n / total) * 100) : 0

    const eligiblesNusuk = filteredData.filter(p => p.sur_plateforme_gouv && p.document_url).length

    setStats({
      total, avecDoc: avec, sansDoc: total - avec,
      totalGouv, totalNusuk, avecPaiement, sansPaiement,
      tauxCompletion: pct(avec),
      montantMoyen: avecPaiement > 0 ? Math.round(totalRecettes / avecPaiement) : 0,
      tauxGouv: pct(totalGouv), tauxNusuk: pct(totalNusuk), tauxPaiement: pct(avecPaiement),
      eligiblesNusuk
    })
    setRecettes(totalRecettes)
    setAllData(filteredData)

    const listAgences = [...new Set(filteredData.map(p => p.agences?.nom_agence).filter((x): x is string => Boolean(x)))].sort()
    setAgences(listAgences)

    if (filteredData[0]?.agences?.nom_agence) {
      setNomAgence(filteredData[0].agences.nom_agence)
    }
  }

  useEffect(() => {
    setLoading(powerSyncLoading)
    if (!powerSyncLoading) processStats(powerSyncPelerins)
  }, [powerSyncLoading, powerSyncPelerins, selectedYear])

  const alerts = useMemo(() => {
    if (!allData.length) return []
    const list: AlertItem[] = []
    if (stats.sansDoc > 0)
      list.push({ type: 'amber', msg: `${stats.sansDoc} dossier(s) sans documents joints`, filter: 'Dossiers Incomplets' })
    if (stats.sansPaiement > 0)
      list.push({ type: 'amber', msg: `${stats.sansPaiement} pèlerin(s) sans aucun versement`, filter: 'En Attente' })
    if (stats.total - stats.totalNusuk > 0)
      list.push({ type: 'blue', msg: `${stats.total - stats.totalNusuk} pèlerin(s) non inscrits sur Nusuk`, filter: 'Portail Nusuk' })
    if (stats.total - stats.totalGouv > 0)
      list.push({ type: 'blue', msg: `${stats.total - stats.totalGouv} pèlerin(s) manquants sur Plateforme Gouv`, filter: 'Plateforme Gouv' })
    return list
  }, [stats, allData])

  const handleSheetTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    if (window.innerWidth >= 768) return
    setTouchStartY(e.touches[0].clientY)
  }

  const handleSheetTouchMove = (e: React.TouchEvent<HTMLDivElement>) => {
    if (touchStartY === null || window.innerWidth >= 768) return
    const delta = e.touches[0].clientY - touchStartY
    if (delta > 0) setDragOffset(delta)
  }

  const handleSheetTouchEnd = () => {
    if (dragOffset > 95) {
      setModal(null)
    }
    setTouchStartY(null)
    setDragOffset(0)
  }

  function openModal(label: string, card?: TileCard) {
    const map: Record<string, { items: Pelerin[]; title: string }> = {
      'Total inscrits':     { items: allData, title: 'Tous les pèlerins' },
      'Dossiers complets':  { items: allData.filter(p => p.document_url), title: 'Dossiers complets' },
      'Dossiers incomplets':{ items: allData.filter(p => !p.document_url), title: 'Dossiers incomplets' },
      'Dossiers Incomplets':{ items: allData.filter(p => !p.document_url), title: 'Dossiers incomplets' },
      'Plateforme Gouv':    { items: allData.filter(p => p.sur_plateforme_gouv), title: 'Inscrits — Plateforme Gouv' },
      'Portail Nusuk':      { items: allData.filter(p => p.sur_plateforme_nusuk), title: 'Inscrits — Portail Nusuk' },
      'Encaissé Global':    { items: allData.filter(p => (p.total_paye ?? 0) > 0), title: 'Pèlerins ayant payé' },
      'Versements Reçus':   { items: allData.filter(p => (p.total_paye ?? 0) > 0), title: 'Pèlerins ayant payé' },
      'En attente paiement': { items: allData.filter(p => (p.total_paye ?? 0) === 0), title: 'En attente de paiement' },
      'En Attente':         { items: allData.filter(p => (p.total_paye ?? 0) === 0), title: 'En attente de paiement' },
      'Éligibles Nusuk':    { items: allData.filter(p => p.sur_plateforme_gouv && p.document_url), title: 'Pèlerins éligibles à l\'inscription Nusuk' },
    }
    const state = map[label] || { items: allData, title: label }
    setModal({ ...state, card })
    setSearchQuery(''); setAgenceFilter('all'); setActiveTab('all'); setNusukPaymentFilter('all')
  }

  function triggerPdfExport(items: Pelerin[], title: string) {
    setPdfExportTarget({ items, title })
    setPdfConfirmOpen(true)
  }

  function handlePdfConfirm(includeFinance: boolean) {
    setPdfConfirmOpen(false)
    if (!pdfExportTarget) return
    generateAndPrintPDF(
      pdfExportTarget.items,
      pdfExportTarget.title,
      includeFinance,
      nomAgence,
      stats,
      recettes
    )
    setPdfExportTarget(null)
  }

  const filteredItems = useMemo(() => {
    if (!modal) return []
    return modal.items.filter(p => {
      const matchSearch = `${p.prenom} ${p.nom_complet}`.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (p.telephone_pelerin && p.telephone_pelerin.includes(searchQuery))
      const matchAgence = agenceFilter === 'all' || p.agences?.nom_agence === agenceFilter
      const matchTab =
        activeTab === 'all' ? true :
        activeTab === 'avec_doc' ? !!p.document_url :
        activeTab === 'sans_doc' ? !p.document_url :
        activeTab === 'paye' ? (p.total_paye ?? 0) > 0 :
        activeTab === 'non_paye' ? (p.total_paye ?? 0) === 0 : true

      const matchNusukPayment =
        nusukPaymentFilter === 'all' ? true :
        nusukPaymentFilter === 'full' ? (p.total_paye ?? 0) > 0 :
        nusukPaymentFilter === 'partial' ? (p.total_paye ?? 0) > 0 :
        nusukPaymentFilter === 'none' ? (p.total_paye ?? 0) === 0 : true

      return matchSearch && matchAgence && matchTab && matchNusukPayment
    })
  }, [modal, searchQuery, agenceFilter, activeTab, nusukPaymentFilter])

  async function exportToExcel(items: Pelerin[], filename: string) {
    try {
      const XLSX = await import('xlsx')
      const cleanRows = items.map((p) => ({
        'Prénom': p.prenom || '',
        'Nom Complet': p.nom_complet || '',
        'Téléphone': p.telephone_pelerin || '',
        'Agence Associée': p.agences?.nom_agence || 'Non spécifiée',
        'Montant Payé (CFA)': p.total_paye || 0,
        'Dossier Fourni': p.document_url ? 'Oui' : 'Non',
        'Inscrit Gouv': p.sur_plateforme_gouv ? 'Oui' : 'Non',
        'Inscrit Nusuk': p.sur_plateforme_nusuk ? 'Oui' : 'Non'
      }))

      const worksheet = XLSX.utils.json_to_sheet(cleanRows)
      const workbook = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Pèlerins')
      worksheet['!cols'] = [{ wch: 18 }, { wch: 25 }, { wch: 16 }, { wch: 22 }, { wch: 20 }, { wch: 15 }, { wch: 15 }, { wch: 15 }]
      XLSX.writeFile(workbook, `${filename.replace(/\s/g, '_')}_${new Date().toISOString().split('T')[0]}.xlsx`)
    } catch (err) {
      console.error("Erreur durant l'export Excel:", err)
    }
  }

  const derniersPelerins = allData.slice(-5).reverse()

  const pelerinsEligiblesNusuk = useMemo(() => {
    return allData.filter(p => p.sur_plateforme_gouv && p.document_url)
  }, [allData])

  const pelerinsEligiblesFiltrés = useMemo(() => {
    return pelerinsEligiblesNusuk.filter(p => {
      if (nusukPaymentFilter === 'full') return (p.total_paye ?? 0) > 0
      if (nusukPaymentFilter === 'partial') return (p.total_paye ?? 0) > 0
      if (nusukPaymentFilter === 'none') return (p.total_paye ?? 0) === 0
      return true
    })
  }, [pelerinsEligiblesNusuk, nusukPaymentFilter])

  // ─── CHARTE STRICTE : BLEU (Info/Action), ÉMERAUDE (Validé/Payé), AMBRE (En cours/Attente)
  const mainCards = [
    {
      label: 'Total inscrits', value: stats.total, icon: Users,
      light: 'bg-blue-50', textColor: 'text-blue-600', borderColor: 'border-blue-100',
      bgMobile: 'bg-blue-50/90 border-blue-100 text-blue-900', progress: 100, progressColor: 'bg-blue-600'
    },
    {
      label: 'Dossiers complets', value: stats.avecDoc, icon: FileCheck,
      light: 'bg-emerald-50', textColor: 'text-emerald-600', borderColor: 'border-emerald-100',
      bgMobile: 'bg-emerald-50/90 border-emerald-100 text-emerald-900', subtext: `${stats.tauxCompletion}% Validés`,
      progress: stats.tauxCompletion, progressColor: 'bg-emerald-600'
    },
    {
      label: 'Dossiers incomplets', value: stats.sansDoc, icon: FileWarning,
      light: 'bg-amber-50', textColor: 'text-amber-600', borderColor: 'border-amber-100',
      bgMobile: 'bg-amber-50/90 border-amber-100 text-amber-900', subtext: `${100 - stats.tauxCompletion}% Restants`,
      progress: 100 - stats.tauxCompletion, progressColor: 'bg-amber-500'
    },
    {
      label: 'Plateforme Gouv', value: stats.totalGouv, icon: ShieldCheck,
      light: 'bg-blue-50', textColor: 'text-blue-600', borderColor: 'border-blue-100',
      bgMobile: 'bg-blue-50/90 border-blue-100 text-blue-900', subtext: `${stats.tauxGouv}% Synchro`,
      progress: stats.tauxGouv, progressColor: 'bg-blue-600'
    },
    {
      label: 'Portail Nusuk', value: stats.totalNusuk, icon: Globe,
      light: 'bg-blue-50', textColor: 'text-blue-600', borderColor: 'border-blue-100',
      bgMobile: 'bg-blue-50/90 border-blue-100 text-blue-900', subtext: `${stats.tauxNusuk}% Synchro`,
      progress: stats.tauxNusuk, progressColor: 'bg-blue-600'
    },
    {
      label: 'Encaissé Global', value: `${recettes.toLocaleString('fr-FR')} CFA`, icon: Wallet,
      light: 'bg-emerald-50', textColor: 'text-emerald-600', borderColor: 'border-emerald-100',
      bgMobile: 'bg-emerald-50/90 border-emerald-100 text-emerald-900', subtext: `Moy: ${stats.montantMoyen.toLocaleString('fr-FR')}`, tag: 'Finance'
    },
    {
      label: 'Versements Reçus', value: stats.avecPaiement, icon: TrendingUp,
      light: 'bg-emerald-50', textColor: 'text-emerald-600', borderColor: 'border-emerald-100',
      bgMobile: 'bg-emerald-50/90 border-emerald-100 text-emerald-900', subtext: `${stats.tauxPaiement}% à jour`,
      progress: stats.tauxPaiement, progressColor: 'bg-emerald-600', tag: 'Finance'
    },
    {
      label: 'En attente paiement', value: stats.sansPaiement, icon: AlertCircle,
      light: 'bg-amber-50', textColor: 'text-amber-600', borderColor: 'border-amber-100',
      bgMobile: 'bg-amber-50/90 border-amber-100 text-amber-900', subtext: `${100 - stats.tauxPaiement}% Restant`,
      progress: 100 - stats.tauxPaiement, progressColor: 'bg-amber-500', tag: 'Attente'
    },
    {
      label: 'Éligibles Nusuk', value: stats.eligiblesNusuk, icon: CheckCircle2,
      light: 'bg-blue-50', textColor: 'text-blue-600', borderColor: 'border-blue-100',
      bgMobile: 'bg-blue-50/90 border-blue-100 text-blue-900', subtext: `Prêts à inscrire`,
      progress: stats.total > 0 ? Math.round((stats.eligiblesNusuk / stats.total) * 100) : 0, progressColor: 'bg-blue-600', tag: 'Nusuk'
    },
  ]

  return (
    <div className="w-full min-h-screen bg-slate-50 select-none">
      <PdfConfirmModal
        isOpen={pdfConfirmOpen}
        onClose={() => { setPdfConfirmOpen(false); setPdfExportTarget(null) }}
        onConfirm={handlePdfConfirm}
        title={pdfExportTarget?.title || ''}
        count={pdfExportTarget?.items.length || 0}
      />

      {/* 📱 ───────────────────────────────────────────────────────────────────
          AFFICHAGE MOBILE ORIGINAL
          ────────────────────────────────────────────────────────────────────── */}
      <div className="block md:hidden pb-10">
        <div className="bg-gradient-to-b from-blue-600 to-blue-700 text-white px-5 pt-7 pb-14 rounded-b-[2.5rem] shadow-lg shadow-blue-600/10 relative overflow-hidden">
          <div className="absolute right-[-20px] bottom-[-20px] text-white/5 pointer-events-none transform -rotate-12 select-none">
            <Building2 size={220} />
          </div>

          <div className="flex items-start justify-between mb-6 relative z-10">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-white/20 border border-white/30 flex items-center justify-center font-black text-sm text-white backdrop-blur-md shrink-0">
                {nomAgence[0]?.toUpperCase() || 'A'}
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-300" />
                  <p className="text-[10px] text-blue-100 font-bold tracking-widest uppercase truncate max-w-[150px]">
                    {nomAgence}
                  </p>
                </div>
                <h2 className="text-sm font-black tracking-tight text-white mt-0.5">
                  Bienvenue sur votre espace
                </h2>
              </div>
            </div>
            <Link
              href="/hajj/ajouter-pelerin"
              className="bg-white text-blue-600 px-3 py-1.5 rounded-full font-bold text-[11px] flex items-center gap-1 shadow-sm active:scale-95 transition-transform shrink-0"
            >
              <UserPlus size={12} /> Ajouter
            </Link>
          </div>

          <div className="flex justify-between items-end mt-7 relative z-10">
            <div>
              <p className="text-xs text-blue-100 font-semibold tracking-wide uppercase opacity-90">Encaissé Global</p>
              <div className="flex items-center gap-2 mt-0.5">
                <div className="flex items-baseline gap-1">
                  <span className="text-3xl font-black tracking-tight tabular-nums">
                    {loading ? '---' : (showAmount ? recettes.toLocaleString('fr-FR') : '•••••••')}
                  </span>
                  <span className="text-sm font-bold text-blue-200">CFA</span>
                </div>
                <button
                  onClick={() => setShowAmount(!showAmount)}
                  className="p-1 rounded-lg bg-white/10 border border-white/10 active:scale-90 transition-transform flex items-center justify-center"
                >
                  {showAmount ? <EyeOff size={14} className="text-blue-100" /> : <Eye size={14} className="text-blue-100" />}
                </button>
              </div>
            </div>

            <div className="text-right">
              <p className="text-[10px] text-blue-200 font-bold uppercase tracking-wider">Date du jour</p>
              <p className="text-xs font-black text-white capitalize mt-0.5">{dateDuJour}</p>
            </div>
          </div>
        </div>

        <div className="px-4 mt-6 space-y-6">
          <div className="px-1">
            <YearSelector />
          </div>

          <div className="space-y-2">
            <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider px-1">Indicateurs clés</p>
            <div className="flex overflow-x-auto gap-3 pb-3 pt-1 px-1 scrollbar-none snap-x snap-mandatory">
              {mainCards.map((card, i) => (
                <div key={i} className="w-[155px] shrink-0 snap-start">
                  <button
                    onClick={() => !loading && openModal(card.label)}
                    disabled={loading}
                    className={`w-full text-left border rounded-2xl p-4 shadow-sm active:scale-[0.97] transition-transform flex flex-col justify-between h-[125px] ${card.bgMobile}`}
                  >
                    <div className="flex items-center justify-between w-full">
                      <div className="p-2 rounded-xl bg-white/60 border border-white/80 shadow-sm">
                        <card.icon size={16} className={card.textColor} />
                      </div>
                    </div>
                    <div className="mt-2 w-full min-w-0">
                      <p className="text-lg font-black tracking-tight leading-none truncate tabular-nums">
                        {card.value}
                      </p>
                      <p className="text-[9px] opacity-70 font-bold uppercase tracking-wide truncate mt-1">
                        {card.label}
                      </p>
                    </div>
                  </button>
                </div>
              ))}
            </div>
          </div>

          {!loading && alerts.length > 0 && (
            <div className="space-y-2">
              <div className="flex overflow-x-auto gap-2 pb-2 px-1 scrollbar-none snap-x">
                {alerts.map((a, i) => (
                  <div key={i} className="w-[290px] shrink-0 snap-start">
                    <button
                      onClick={() => openModal(a.filter)}
                      className={`w-full text-left flex items-center gap-3 p-3.5 rounded-2xl shadow-sm border ${
                        a.type === 'amber'
                          ? 'bg-amber-50 border-amber-200 text-amber-950'
                          : 'bg-blue-50 border-blue-200 text-blue-950'
                      }`}
                    >
                      <span className={`w-2 h-2 rounded-full shrink-0 ${a.type === 'amber' ? 'bg-amber-500' : 'bg-blue-500'}`} />
                      <p className="text-xs font-semibold leading-snug flex-1 truncate">{a.msg}</p>
                      <ChevronRight size={14} className="opacity-40 shrink-0" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {!loading && (
            <div className="bg-white border border-slate-100 rounded-2xl p-4 shadow-sm space-y-4">
              <p className="text-[10px] text-slate-400 font-medium uppercase tracking-wider">Conformité et synchronisation</p>
              <div className="space-y-3.5">
                {[
                  { label: 'Dossiers justificatifs', pct: stats.tauxCompletion, color: 'bg-emerald-500' },
                  { label: 'Paiements encaissés', pct: stats.tauxPaiement, color: 'bg-emerald-500' },
                  { label: 'Validations Gouv', pct: stats.tauxGouv, color: 'bg-blue-600' },
                  { label: 'Inscriptions Nusuk', pct: stats.tauxNusuk, color: 'bg-blue-600' },
                ].map((r, i) => (
                  <div key={i} className="space-y-1">
                    <div className="flex justify-between items-center text-[11px]">
                      <span className="text-slate-600 font-medium">{r.label}</span>
                      <span className="font-black text-slate-900">{r.pct}%</span>
                    </div>
                    <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                      <div className={`h-full rounded-full ${r.color}`} style={{ width: `${r.pct}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {derniersPelerins.length > 0 && (
            <div className="bg-white border border-slate-100 rounded-2xl overflow-hidden shadow-sm">
              <div className="px-4 py-3 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Derniers pèlerins</p>
                <Link href="/hajj/liste-pelerins" className="text-[11px] text-blue-600 font-bold flex items-center gap-0.5">
                  Voir tout
                </Link>
              </div>
              <ul className="divide-y divide-slate-50">
                {derniersPelerins.slice(0, 3).map((p, i) => (
                  <li key={p.id || i} className="p-4 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <div className="w-8 h-8 rounded-xl bg-blue-50 border border-blue-100 text-blue-600 flex items-center justify-center text-xs font-bold shrink-0">
                        {(p.prenom?.[0] || '?').toUpperCase()}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-bold text-slate-800 truncate">{p.prenom} {p.nom_complet}</p>
                        <p className="text-[10px] text-slate-400 truncate">{p.agences?.nom_agence || 'Direct'}</p>
                      </div>
                    </div>
                    <div className="shrink-0">
                      {(p.total_paye ?? 0) > 0 ? (
                        <span className="text-[10px] font-black text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md">Payé</span>
                      ) : (
                        <span className="text-[10px] font-bold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-md">Attente</span>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="flex gap-2">
            <button
              onClick={() => !loading && exportToExcel(allData, 'Global_Hajj_2026')}
              disabled={loading}
              className="flex-1 flex items-center justify-center gap-2 p-3.5 bg-slate-900 text-white rounded-2xl text-xs font-bold shadow-md active:bg-slate-800 transition-colors"
            >
              <FileSpreadsheet size={15} className="text-slate-300" />
              Exporter (.XLSX)
            </button>
            <button
              onClick={() => !loading && triggerPdfExport(allData, 'Tous les pèlerins')}
              disabled={loading}
              className="flex-1 flex items-center justify-center gap-2 p-3.5 bg-blue-600 text-white rounded-2xl text-xs font-bold shadow-md active:bg-blue-700 transition-colors"
            >
              <FileText size={15} className="text-blue-100" />
              Exporter (.PDF)
            </button>
          </div>
        </div>
      </div>

      {/* 💻 ───────────────────────────────────────────────────────────────────
          AFFICHAGE PC — HARMONIE BLEU / ÉMERAUDE / AMBRE
          ────────────────────────────────────────────────────────────────────── */}
      <div className="hidden md:flex flex-col min-h-screen bg-slate-50">
        
        {/* BANNIÈRE PC : Bleu 600 Uni (même esprit que le mobile) */}
        <header className="relative mt-4 mx-4 lg:mx-6 rounded-[32px] overflow-visible border border-blue-500 shadow-xs bg-blue-600">
          <div className="relative z-10 max-w-[1600px] mx-auto px-6 lg:px-10 py-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-2xl bg-white/20 border border-white/25 flex items-center justify-center font-black text-xl text-white shadow-xs">
                {nomAgence[0]?.toUpperCase() || 'H'}
              </div>

              <div>
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="text-[10px] font-black bg-white/20 border border-white/20 text-white px-2.5 py-0.5 rounded-full uppercase tracking-widest">
                    Hajj 2026
                  </span>
                  {!loading && (
                    <span className="text-[10px] font-semibold text-blue-100 bg-blue-700/50 border border-blue-400/20 px-2 py-0.5 rounded-full">
                      {nomAgence}
                    </span>
                  )}
                </div>
                <h1 className="text-2xl font-black text-white tracking-tight leading-none">
                  Tableau de bord
                </h1>
                <p className="text-xs text-blue-100 font-medium mt-0.5 capitalize">{dateDuJour}</p>
              </div>
            </div>

            <div className="flex items-center gap-3 flex-wrap">
              {!loading && (
                <div className="flex items-center gap-2.5 bg-white/15 border border-white/20 rounded-2xl px-4 py-2.5">
                  <Wallet size={15} className="text-emerald-300 shrink-0" />
                  <div>
                    <p className="text-[9px] text-blue-100 font-bold uppercase tracking-wider">Encaissé</p>
                    <p className="text-sm font-black text-white tabular-nums leading-none">
                      {recettes.toLocaleString('fr-FR')}
                      <span className="text-[10px] font-bold text-blue-200 ml-1">CFA</span>
                    </p>
                  </div>
                </div>
              )}

              {!loading && (
                <div className="flex items-center gap-2.5 bg-white/15 border border-white/20 rounded-2xl px-4 py-2.5">
                  <Users size={15} className="text-blue-100 shrink-0" />
                  <div>
                    <p className="text-[9px] text-blue-100 font-bold uppercase tracking-wider">Inscrits</p>
                    <p className="text-sm font-black text-white tabular-nums leading-none">{stats.total}</p>
                  </div>
                </div>
              )}

              <div className="relative z-50 bg-white/15 border border-white/20 rounded-2xl px-3 py-1.5">
                <YearSelector />
              </div>

              <Link
                href="/hajj/ajouter-pelerin"
                className="inline-flex items-center gap-2 bg-white text-blue-600 text-xs font-black px-4 py-2.5 rounded-2xl hover:bg-blue-50 transition-all shadow-xs"
              >
                <UserPlus size={14} />
                Nouveau pèlerin
              </Link>
            </div>
          </div>
        </header>

        {/* CORPS PRINCIPAL */}
        <main className="flex-1 max-w-[1600px] mx-auto w-full px-6 lg:px-10 pt-7 pb-12">
          <div className="flex flex-col lg:flex-row gap-6 items-start w-full">

            {/* COLONNE CENTRALE */}
            <div className="flex-1 min-w-0 w-full flex flex-col gap-5">

              {/* KPI Cards */}
              <div className="grid grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-3">
                {mainCards.map((card, i) => (
                  <Tile
                    key={i}
                    card={card}
                    loading={loading}
                    onClick={() => !loading && openModal(card.label, card)}
                  />
                ))}
              </div>

              {/* Éligibles Nusuk */}
              {!loading && stats.eligiblesNusuk > 0 && (
                <div className="bg-white border border-blue-100 rounded-2xl overflow-hidden shadow-xs">
                  <div className="px-5 py-3.5 border-b border-blue-50 flex justify-between items-center bg-blue-50/40">
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded-xl bg-blue-600 shadow-xs">
                        <CheckCircle2 size={16} className="text-white" />
                      </div>
                      <div>
                        <p className="text-sm font-black text-blue-900 tracking-tight">Éligibles Nusuk</p>
                        <p className="text-[10px] text-blue-600 font-semibold">
                          {stats.eligiblesNusuk} pèlerins avec dossier + validation Gouv
                        </p>
                      </div>
                    </div>
                    <button
                      onClick={() => openModal('Éligibles Nusuk')}
                      className="text-xs text-blue-600 font-black hover:text-blue-800 flex items-center gap-1.5 bg-blue-50 hover:bg-blue-100/70 border border-blue-200 px-3 py-1.5 rounded-xl transition-all"
                    >
                      Voir tout <ArrowRight size={12} />
                    </button>
                  </div>

                  <div className="px-5 py-2.5 border-b border-slate-100 bg-white flex gap-2 flex-wrap">
                    {[
                      { key: 'all',  label: `Tous (${pelerinsEligiblesNusuk.length})`,   active: 'bg-blue-600 text-white',   inactive: 'bg-slate-50 text-slate-700 border border-slate-200 hover:bg-slate-100' },
                      { key: 'full', label: `Payés (${pelerinsEligiblesNusuk.filter(p => (p.total_paye ?? 0) > 0).length})`, active: 'bg-emerald-600 text-white', inactive: 'bg-slate-50 text-slate-700 border border-slate-200 hover:bg-slate-100' },
                      { key: 'none', label: `Non payés (${pelerinsEligiblesNusuk.filter(p => (p.total_paye ?? 0) === 0).length})`, active: 'bg-amber-600 text-white', inactive: 'bg-slate-50 text-slate-700 border border-slate-200 hover:bg-slate-100' },
                    ].map(f => (
                      <button
                        key={f.key}
                        onClick={() => setNusukPaymentFilter(f.key)}
                        className={`text-xs font-black px-3 py-1.5 rounded-xl transition-all ${
                          nusukPaymentFilter === f.key ? f.active : f.inactive
                        }`}
                      >
                        {f.label}
                      </button>
                    ))}
                  </div>

                  <ul className="divide-y divide-slate-100">
                    {pelerinsEligiblesFiltrés.slice(0, 6).map((p, i) => (
                      <li key={p.id || i} className="px-5 py-3 flex items-center justify-between gap-3 hover:bg-slate-50/70 transition-colors">
                        <div className="flex items-center gap-3 min-w-0 flex-1">
                          <div className="w-8 h-8 rounded-xl bg-blue-50 border border-blue-100 flex items-center justify-center text-xs font-black text-blue-700 shrink-0 shadow-xs">
                            {(p.prenom?.[0] || '?').toUpperCase()}
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="text-xs font-bold text-slate-800 truncate">{p.prenom} {p.nom_complet}</p>
                            <p className="text-[10px] text-slate-400 truncate">{p.telephone_pelerin || '—'}</p>
                          </div>
                        </div>
                        <div className="shrink-0">
                          {(p.total_paye ?? 0) > 0 ? (
                            <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-xl shadow-xs">
                              {(p.total_paye ?? 0).toLocaleString('fr-FR')} CFA
                            </span>
                          ) : (
                            <span className="text-[10px] font-semibold text-amber-700 bg-amber-50 border border-amber-200 px-2.5 py-1 rounded-xl shadow-xs">
                              Impayé
                            </span>
                          )}
                        </div>
                      </li>
                    ))}
                  </ul>

                  <div className="px-5 py-3 border-t border-slate-100 bg-slate-50/50 flex items-center justify-between flex-wrap gap-2">
                    <p className="text-xs text-slate-500 font-semibold">
                      <span className="font-black text-slate-800">{pelerinsEligiblesFiltrés.length}</span> pèlerin(s) affiché(s)
                    </p>
                    <div className="flex gap-2">
                      <button
                        onClick={() => exportToExcel(pelerinsEligiblesFiltrés, 'Eligibles_Nusuk')}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-200 text-slate-700 rounded-xl text-xs font-bold hover:bg-slate-50 transition-all shadow-xs"
                      >
                        <FileSpreadsheet size={12} /> Excel
                      </button>
                      <button
                        onClick={() => triggerPdfExport(pelerinsEligiblesFiltrés, 'Pèlerins éligibles')}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white rounded-xl text-xs font-bold hover:bg-blue-700 transition-all shadow-xs"
                      >
                        <FileText size={12} /> PDF
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Flux récent */}
              {derniersPelerins.length > 0 && (
                <div className="bg-white border border-slate-200/80 rounded-2xl overflow-hidden shadow-xs">
                  <div className="px-5 py-3.5 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
                    <div className="flex items-center gap-2.5">
                      <div className="p-1.5 rounded-lg bg-slate-100">
                        <Calendar size={14} className="text-slate-600" />
                      </div>
                      <p className="text-xs font-black text-slate-700 uppercase tracking-wider">Flux récent</p>
                    </div>
                    <Link
                      href="/hajj/liste-pelerins"
                      className="text-xs text-blue-600 font-black hover:text-blue-800 flex items-center gap-1.5 bg-blue-50 hover:bg-blue-100 border border-blue-100 px-3 py-1.5 rounded-xl transition-all"
                    >
                      Voir tout <ArrowRight size={11} />
                    </Link>
                  </div>

                  <ul className="divide-y divide-slate-100">
                    {derniersPelerins.map((p, i) => (
                      <li key={p.id || i} className="px-5 py-3 flex items-center justify-between gap-3 hover:bg-slate-50/60 transition-colors">
                        <div className="flex items-center gap-3 min-w-0 flex-1">
                          <div className="w-8 h-8 rounded-xl bg-blue-50 border border-blue-100 flex items-center justify-center text-xs font-black text-blue-700 shrink-0 shadow-xs">
                            {(p.prenom?.[0] || '?').toUpperCase()}
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="text-xs font-bold text-slate-800 truncate">{p.prenom} {p.nom_complet}</p>
                            <div className="flex gap-1.5 mt-0.5 flex-wrap items-center">
                              {p.agences?.nom_agence && (
                                <span className="text-[9px] text-slate-600 bg-slate-100 border border-slate-200 px-1.5 py-0.5 rounded-md font-semibold">
                                  {p.agences.nom_agence}
                                </span>
                              )}
                              {p.document_url ? (
                                <span className="text-[9px] text-emerald-700 bg-emerald-50 border border-emerald-100 px-1.5 py-0.5 rounded-md font-bold">✓ Dossier</span>
                              ) : (
                                <span className="text-[9px] text-amber-700 bg-amber-50 border border-amber-100 px-1.5 py-0.5 rounded-md font-bold">✗ Incomplet</span>
                              )}
                            </div>
                          </div>
                        </div>
                        <div className="text-right shrink-0">
                          {(p.total_paye ?? 0) > 0 ? (
                            <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-xl shadow-xs">
                              {(p.total_paye ?? 0).toLocaleString('fr-FR')} CFA
                            </span>
                          ) : (
                            <span className="text-[10px] font-semibold text-amber-700 bg-amber-50 border border-amber-200 px-2.5 py-1 rounded-xl shadow-xs">
                              Impayé
                            </span>
                          )}
                        </div>
                      </li>
                    ))}
                  </ul>

                  <div className="px-5 py-3 border-t border-slate-100 bg-slate-50/40 flex justify-end gap-2">
                    <button
                      onClick={() => !loading && exportToExcel(allData, 'Global_Hajj_2026')}
                      disabled={loading}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-200 text-slate-700 rounded-xl text-xs font-bold hover:bg-slate-50 transition-all shadow-xs"
                    >
                      <FileSpreadsheet size={12} className="text-slate-600" /> Excel
                    </button>
                    <button
                      onClick={() => !loading && triggerPdfExport(allData, 'Tous les pèlerins')}
                      disabled={loading}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white rounded-xl text-xs font-bold hover:bg-blue-700 transition-all shadow-xs"
                    >
                      <FileText size={12} /> PDF
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* COLONNE LATÉRALE */}
            <div className="w-full lg:w-72 xl:w-80 shrink-0 flex flex-col gap-4">

              {/* Anomalies */}
              {!loading && alerts.length > 0 && (
                <div className="bg-white border border-slate-200/80 rounded-2xl overflow-hidden shadow-xs">
                  <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
                    <div className="flex items-center gap-2.5">
                      <div className="p-1.5 rounded-lg bg-amber-100">
                        <AlertTriangle size={13} className="text-amber-700" />
                      </div>
                      <p className="text-xs font-black text-slate-700 uppercase tracking-wider">Anomalies</p>
                    </div>
                    <span className="text-[10px] font-black bg-amber-100 text-amber-800 px-2 py-0.5 rounded-full">
                      {alerts.length}
                    </span>
                  </div>

                  <div className="p-3 flex flex-col gap-2">
                    {alerts.map((a, i) => (
                      <AlertPill key={i} alert={a} onClick={() => openModal(a.filter)} />
                    ))}
                  </div>
                </div>
              )}

              {/* Processus Métiers */}
              {!loading && (
                <div className="bg-white border border-slate-200/80 rounded-2xl p-5 shadow-xs">
                  <div className="flex items-center gap-2 mb-4">
                    <div className="p-1.5 rounded-lg bg-slate-100">
                      <TrendingUp size={13} className="text-slate-600" />
                    </div>
                    <p className="text-xs font-black text-slate-700 uppercase tracking-wider">Processus</p>
                  </div>

                  <div className="flex flex-col gap-4">
                    {[
                      { label: 'Dossiers', pct: stats.tauxCompletion, color: 'bg-emerald-500', textColor: 'text-emerald-700', bg: 'bg-emerald-50' },
                      { label: 'Paiements', pct: stats.tauxPaiement, color: 'bg-emerald-500', textColor: 'text-emerald-700', bg: 'bg-emerald-50' },
                      { label: 'Gouv', pct: stats.tauxGouv, color: 'bg-blue-600', textColor: 'text-blue-700', bg: 'bg-blue-50' },
                      { label: 'Nusuk', pct: stats.tauxNusuk, color: 'bg-blue-600', textColor: 'text-blue-700', bg: 'bg-blue-50' },
                    ].map((r, i) => (
                      <div key={i}>
                        <div className="flex justify-between items-center mb-1.5">
                          <span className="text-xs text-slate-600 font-semibold">{r.label}</span>
                          <span className={`text-xs font-black px-2 py-0.5 rounded-lg ${r.bg} ${r.textColor}`}>
                            {r.pct}%
                          </span>
                        </div>
                        <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full ${r.color}`}
                            style={{ width: `${r.pct}%` }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Vue globale */}
              {!loading && (
                <div className="rounded-2xl p-5 text-white shadow-xs bg-blue-600 border border-blue-500">
                  <p className="text-[9px] font-black uppercase tracking-widest text-blue-200 mb-3">Vue globale</p>
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      { label: 'Dossiers', val: `${stats.tauxCompletion}%` },
                      { label: 'Payés',    val: `${stats.tauxPaiement}%` },
                      { label: 'Gouv',     val: `${stats.tauxGouv}%` },
                      { label: 'Nusuk',    val: `${stats.tauxNusuk}%` },
                    ].map((item, i) => (
                      <div key={i} className="bg-white/15 rounded-xl p-2.5 border border-white/20">
                        <p className="text-[9px] text-blue-100 font-bold uppercase tracking-wider">{item.label}</p>
                        <p className="text-lg font-black text-white tabular-nums leading-none mt-0.5">{item.val}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </main>
      </div>

      {/* MODALE */}
      {modal && (
        <div className="fixed inset-0 z-[2000] flex items-end sm:items-center justify-center bg-slate-900/60 backdrop-blur-xs p-0 sm:p-4" onClick={() => setModal(null)}>
          <div
            className="bg-white w-full sm:max-w-3xl rounded-t-2xl sm:rounded-2xl shadow-xl h-[85vh] sm:h-auto max-h-[85vh] sm:max-h-[calc(100vh-80px)] flex flex-col border border-slate-100"
            onClick={e => e.stopPropagation()}
            onTouchStart={handleSheetTouchStart}
            onTouchMove={handleSheetTouchMove}
            onTouchEnd={handleSheetTouchEnd}
            onTouchCancel={handleSheetTouchEnd}
            style={{ transform: dragOffset > 0 ? `translateY(${dragOffset}px)` : undefined }}
          >
            <div className="w-12 h-1 bg-slate-200 rounded-full mx-auto my-3 sm:hidden shrink-0" />
            <div className="flex items-center justify-between px-5 pb-4 pt-1 sm:py-4 border-b border-slate-100 shrink-0">
              <div>
                {modal.card ? (
                  <>
                    <div className="flex flex-wrap items-center gap-2 mb-1">
                      <span className="text-xs font-black uppercase tracking-widest text-slate-500">{modal.card.tag || 'Carte'}</span>
                      {modal.card.progress != null && (
                        <span className="text-xs font-semibold px-2 py-1 rounded-full bg-slate-100 text-slate-600">{modal.card.progress}%</span>
                      )}
                    </div>
                    <h2 className="text-base sm:text-lg font-black text-slate-900">{modal.card.label}</h2>
                    <p className="text-sm text-slate-600 mt-1 font-black tracking-tight">{modal.card.value}</p>
                    {modal.card.subtext && <p className="text-xs text-slate-400 mt-1">{modal.card.subtext}</p>}
                  </>
                ) : (
                  <>
                    <h2 className="text-base sm:text-lg font-black text-slate-900">{modal.title}</h2>
                    <p className="text-xs text-slate-400 mt-0.5">{filteredItems.length} pèlerin(s)</p>
                  </>
                )}
              </div>
              <button onClick={() => setModal(null)} className="p-2 rounded-xl bg-slate-50 text-slate-400 border border-slate-100"><X size={16} /></button>
            </div>

            <div className="px-5 py-4 border-b border-slate-100 space-y-3 bg-slate-50/50 shrink-0">
              <div className="flex gap-2">
                <div className="flex-1 relative">
                  <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Rechercher..."
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    className="w-full pl-9 pr-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:border-blue-500 bg-white"
                  />
                </div>
              </div>
            </div>

            <div className="overflow-y-auto flex-1 px-5 py-4">
              <ul className="space-y-2">
                {filteredItems.map((p, i) => (
                  <li key={p.id || i} className="px-4 py-3 rounded-xl bg-white border border-slate-100 flex items-center justify-between gap-3 shadow-xs">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-bold text-slate-800 truncate">{p.prenom} {p.nom_complet}</p>
                      <p className="text-xs text-slate-400">{p.telephone_pelerin || 'Pas de numéro'}</p>
                    </div>
                    <div className="shrink-0 text-right">
                      <span className={`text-xs font-black px-2.5 py-1 rounded-md ${(p.total_paye ?? 0) > 0 ? 'text-emerald-700 bg-emerald-50' : 'text-amber-700 bg-amber-50'}`}>
                        {(p.total_paye ?? 0) > 0 ? `${(p.total_paye ?? 0).toLocaleString('fr-FR')} CFA` : 'Impayé'}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            </div>

            <div className="px-5 py-4 border-t border-slate-100 bg-slate-50/50 shrink-0 flex flex-wrap gap-2 items-center justify-between">
              <p className="text-xs text-slate-400 font-medium">
                {filteredItems.length} pèlerin(s) affiché(s)
              </p>
              <div className="flex gap-2 flex-wrap">
                <button
                  onClick={() => exportToExcel(filteredItems, modal.title)}
                  className="flex items-center gap-1.5 px-3.5 py-2 bg-white border border-slate-200 text-slate-700 rounded-xl text-xs font-bold hover:bg-slate-50 transition-all shadow-xs"
                >
                  <FileSpreadsheet size={13} className="text-slate-600" />
                  Excel
                </button>
                <button
                  onClick={() => triggerPdfExport(filteredItems, modal.title)}
                  className="flex items-center gap-1.5 px-3.5 py-2 bg-blue-600 text-white rounded-xl text-xs font-bold hover:bg-blue-700 transition-all shadow-xs"
                >
                  <FileText size={13} />
                  PDF
                </button>
              </div>
            </div>

          </div>
        </div>
      )}
    </div>
  )
}