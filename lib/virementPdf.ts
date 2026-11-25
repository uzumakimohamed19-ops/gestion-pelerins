import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import {
  HAJJ_CURRENCY_MAP,
  formatHajjMoneyPdf,
  type HajjCurrency,
} from '@/lib/hajjCurrency'

export type VirementSens = 'emis' | 'recu'
export type VirementStatut = 'execute' | 'en_attente' | 'annule'

export interface VirementPdfItem {
  id: string
  sens: VirementSens
  banque: string
  nom_compte: string
  numero_compte?: string | null
  contrepartie?: string | null
  montant: number
  devise: HajjCurrency
  motif: string
  reference_bancaire?: string | null
  date_virement: string
  statut: VirementStatut
  recu_url?: string | null
  notes?: string | null
  recorded_by_name?: string | null
}

const STATUT_PDF_LABEL: Record<VirementStatut, string> = {
  execute: 'Exécuté',
  en_attente: 'En attente',
  annule: 'Annulé',
}

const fmtDateFr = (iso?: string | null) => {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleDateString('fr-FR')
}

export function generateVirementsRecapPdf(params: {
  items: VirementPdfItem[]
  scope: 'all' | 'emis' | 'recu'
  devise: HajjCurrency
  agenceName?: string | null
  campagneLabel?: string
  periodLabel?: string
}) {
  const { items, scope, devise, agenceName, campagneLabel, periodLabel } = params
  const filtered =
    scope === 'all' ? items : items.filter((v) => v.sens === scope)

  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })
  const pageW = doc.internal.pageSize.getWidth()
  const nowStr = new Date().toLocaleString('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })

  const scopeTitle =
    scope === 'emis'
      ? 'RELEVÉ DES VIREMENTS ÉMIS (SORTANTS)'
      : scope === 'recu'
      ? 'RELEVÉ DES VIREMENTS REÇUS (ENTRANTS)'
      : 'RELEVÉ RÉCAPITULATIF DES VIREMENTS BANCAIRES'

  // Bandeau d'en-tête architectural
  doc.setFillColor(30, 58, 95)
  doc.rect(0, 0, pageW, 28, 'F')

  doc.setTextColor(255, 255, 255)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(14)
  doc.text((agenceName || 'AGENCE PRO').toUpperCase(), 14, 11)

  doc.setFontSize(10)
  doc.setTextColor(203, 213, 225)
  doc.text(scopeTitle, 14, 18)

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8.5)
  doc.text(
    `${campagneLabel || 'Toutes campagnes'}  •  Devise : ${HAJJ_CURRENCY_MAP[devise].label}${periodLabel ? `  •  ${periodLabel}` : ''}`,
    14,
    24
  )

  doc.setTextColor(226, 232, 240)
  doc.text(`Édité le ${nowStr}`, pageW - 14, 11, { align: 'right' })
  doc.text(`${filtered.length} opération(s)`, pageW - 14, 18, { align: 'right' })

  // Totaux (hors annulés)
  const validItems = filtered.filter((v) => v.statut !== 'annule')
  const totalRecu = validItems
    .filter((v) => v.sens === 'recu')
    .reduce((s, v) => s + (Number(v.montant) || 0), 0)
  const totalEmis = validItems
    .filter((v) => v.sens === 'emis')
    .reduce((s, v) => s + (Number(v.montant) || 0), 0)
  const soldeNet = totalRecu - totalEmis
  const nbRecus = validItems.filter((v) => v.sens === 'recu').length
  const nbEmis = validItems.filter((v) => v.sens === 'emis').length

  // Cartes de synthèse
  const yCards = 34
  const cardGap = 5
  const cardW = (pageW - 28 - cardGap * 3) / 4
  const cardH = 18

  const cards = [
    {
      label: `VIREMENTS REÇUS (${nbRecus})`,
      value: `+${formatHajjMoneyPdf(totalRecu, devise)}`,
      color: [5, 150, 105] as [number, number, number],
    },
    {
      label: `VIREMENTS ÉMIS (${nbEmis})`,
      value: `-${formatHajjMoneyPdf(totalEmis, devise)}`,
      color: [225, 29, 72] as [number, number, number],
    },
    {
      label: 'SOLDE NET VIREMENTS',
      value: `${soldeNet >= 0 ? '+' : '-'}${formatHajjMoneyPdf(Math.abs(soldeNet), devise)}`,
      color: soldeNet >= 0 ? ([30, 58, 95] as [number, number, number]) : ([190, 18, 60] as [number, number, number]),
    },
    {
      label: 'JUSTIFICATIFS SCANNÉS',
      value: `${filtered.filter((v) => Boolean(v.recu_url)).length} / ${filtered.length}`,
      color: [51, 65, 85] as [number, number, number],
    },
  ]

  cards.forEach((c, idx) => {
    const x = 14 + idx * (cardW + cardGap)
    doc.setFillColor(248, 250, 252)
    doc.setDrawColor(226, 232, 240)
    doc.roundedRect(x, yCards, cardW, cardH, 2.5, 2.5, 'FD')
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(7.5)
    doc.setTextColor(100, 116, 139)
    doc.text(c.label, x + 3.5, yCards + 6)
    doc.setFontSize(11)
    doc.setTextColor(c.color[0], c.color[1], c.color[2])
    doc.text(c.value, x + 3.5, yCards + 13.5)
  })

  // Tableau détaillé
  const bodyRows = filtered.map((v, idx) => {
    const compteTxt = [v.banque, v.nom_compte, v.numero_compte ? `(${v.numero_compte})` : '']
      .filter(Boolean)
      .join(' — ')
    const motifTxt = [v.motif, v.reference_bancaire ? `Réf: ${v.reference_bancaire}` : '']
      .filter(Boolean)
      .join('\n')
    const sign = v.sens === 'recu' ? '+' : '-'
    return [
      String(idx + 1),
      fmtDateFr(v.date_virement),
      v.sens === 'recu' ? 'Reçu (Entrant)' : 'Émis (Sortant)',
      compteTxt,
      v.contrepartie || '—',
      motifTxt,
      `${STATUT_PDF_LABEL[v.statut]}${v.recu_url ? ' • Reçu' : ''}`,
      `${sign}${formatHajjMoneyPdf(v.montant, devise)}`,
    ]
  })

  autoTable(doc, {
    startY: yCards + cardH + 6,
    head: [['#', 'Date', 'Sens', 'Banque & Compte', 'Contrepartie', 'Motif & Référence', 'Statut', 'Montant']],
    body: bodyRows,
    theme: 'grid',
    styles: {
      font: 'helvetica',
      fontSize: 8,
      cellPadding: 2.5,
      textColor: [30, 41, 59],
      lineColor: [226, 232, 240],
      lineWidth: 0.2,
      valign: 'middle',
    },
    headStyles: {
      fillColor: [15, 23, 42],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 8,
    },
    columnStyles: {
      0: { cellWidth: 9, halign: 'center' },
      1: { cellWidth: 21 },
      2: { cellWidth: 26 },
      3: { cellWidth: 58 },
      4: { cellWidth: 38 },
      5: { cellWidth: 54 },
      6: { cellWidth: 26 },
      7: { cellWidth: 37, halign: 'right', fontStyle: 'bold' },
    },
    didParseCell: (hookData) => {
      if (hookData.section === 'body' && hookData.column.index === 7) {
        const raw = String(hookData.cell.raw || '')
        if (raw.startsWith('+')) {
          hookData.cell.styles.textColor = [5, 150, 105]
        } else if (raw.startsWith('-')) {
          hookData.cell.styles.textColor = [225, 29, 72]
        }
      }
    },
    didDrawPage: (data) => {
      const pageCount = doc.getNumberOfPages()
      const pageH = doc.internal.pageSize.getHeight()
      doc.setFontSize(7.5)
      doc.setTextColor(148, 163, 184)
      doc.text(
        'Document de suivi des virements bancaires — indépendant des écritures de comptabilité.',
        14,
        pageH - 7
      )
      doc.text(`Page ${data.pageNumber} / ${pageCount}`, pageW - 14, pageH - 7, { align: 'right' })
    },
  })

  const suffix = scope === 'all' ? 'Tous' : scope === 'emis' ? 'Emis' : 'Recus'
  const dateFile = new Date().toISOString().slice(0, 10)
  doc.save(`Releve_Virements_${suffix}_${devise}_${dateFile}.pdf`)
}

export function generateSingleVirementPdf(params: {
  v: VirementPdfItem
  agenceName?: string | null
}) {
  const { v, agenceName } = params
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  const pageW = doc.internal.pageSize.getWidth()

  doc.setFillColor(30, 58, 95)
  doc.rect(0, 0, pageW, 34, 'F')

  doc.setTextColor(255, 255, 255)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(15)
  doc.text((agenceName || 'AGENCE PRO').toUpperCase(), 16, 14)

  doc.setFontSize(10)
  doc.setTextColor(203, 213, 225)
  doc.text(
    v.sens === 'recu'
      ? 'FICHE DE VIREMENT BANCAIRE REÇU (ENTRANT)'
      : 'FICHE DE VIREMENT BANCAIRE ÉMIS (SORTANT)',
    16,
    22
  )
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8.5)
  doc.text(`Éditée le ${new Date().toLocaleDateString('fr-FR')}`, 16, 28.5)

  // Encadré montant
  doc.setFillColor(248, 250, 252)
  doc.setDrawColor(226, 232, 240)
  doc.roundedRect(16, 42, pageW - 32, 26, 3, 3, 'FD')

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(9)
  doc.setTextColor(100, 116, 139)
  doc.text('MONTANT DU VIREMENT', pageW / 2, 50, { align: 'center' })

  doc.setFontSize(20)
  if (v.sens === 'recu') doc.setTextColor(5, 150, 105)
  else doc.setTextColor(225, 29, 72)
  doc.text(
    `${v.sens === 'recu' ? '+' : '-'}${formatHajjMoneyPdf(v.montant, v.devise)}`,
    pageW / 2,
    61,
    { align: 'center' }
  )

  const rows: Array<[string, string]> = [
    ['Sens', v.sens === 'recu' ? 'Virement reçu (Entrant)' : 'Virement émis (Sortant)'],
    ['Date du virement', fmtDateFr(v.date_virement)],
    ['Statut', STATUT_PDF_LABEL[v.statut]],
    ['Banque', v.banque],
    ['Nom du compte', v.nom_compte],
    ['Numéro de compte / IBAN', v.numero_compte || 'Non renseigné'],
    [v.sens === 'recu' ? 'Émetteur' : 'Bénéficiaire', v.contrepartie || 'Non renseigné'],
    ['Raison / Motif', v.motif],
    ['Référence bancaire', v.reference_bancaire || 'Non renseignée'],
    ['Scan du reçu', v.recu_url ? 'Justificatif enregistré dans l’application' : 'Aucun scan joint'],
    ['Enregistré par', v.recorded_by_name || '—'],
    ['Notes', v.notes || '—'],
  ]

  autoTable(doc, {
    startY: 76,
    head: [['Champ', 'Détail']],
    body: rows,
    theme: 'grid',
    styles: { font: 'helvetica', fontSize: 9.5, cellPadding: 3.5, textColor: [30, 41, 59] },
    headStyles: { fillColor: [15, 23, 42], textColor: [255, 255, 255] },
    columnStyles: {
      0: { cellWidth: 60, fontStyle: 'bold', fillColor: [248, 250, 252] },
    },
  })

  doc.save(`Fiche_Virement_${v.sens}_${v.date_virement}.pdf`)
}
