import {
  HAJJ_CURRENCIES,
  formatHajjMoney,
  normalizeHajjCurrency,
  type HajjCurrency,
} from '@/lib/hajjCurrency'

export type PushSlot = 'morning' | 'evening' | 'test'

export type PushCategory =
  | 'impayes'
  | 'passeports'
  | 'encaissement_jour'
  | 'inactivite'
  | 'plateformes'
  | 'resume'

export interface DigestPelerinRow {
  id: string
  num_passeport?: string | null
  document_url?: string | null
  prix_package?: number | null
  total_paye?: number | null
  devise?: string | null
  sur_plateforme_gouv?: boolean | number | null
  sur_plateforme_nusuk?: boolean | number | null
  campagne?: number | null
  created_at?: string | null
}

export interface DigestPaymentRow {
  id: string
  pelerin_id?: string | null
  amount?: number | null
  devise?: string | null
  payment_date?: string | null
  created_at?: string | null
}

export interface DigestPayload {
  title: string
  body: string
  url: string
  category: PushCategory
  tag: string
}

export interface AgencyDigestStats {
  total: number
  unpaidCount: number
  unpaidPct: number
  zeroPaidCount: number
  paidCompleteCount: number
  paidCompletePct: number
  noPassportCount: number
  noPassportPct: number
  notGouvCount: number
  notGouvPct: number
  todayPaymentsCount: number
  todayAmountSummary: string | null
  resteSummary: string | null
  todayNewPelerinsCount: number
  inactiveDays: number
  activeCampagne: number | null
}

function summarizeByCurrency(
  items: Array<{ amount: number; devise: HajjCurrency }>
): string | null {
  const totals: Record<HajjCurrency, number> = { FCFA: 0, EUR: 0, USD: 0 }
  for (const item of items) {
    if (item.amount > 0) {
      totals[item.devise] += item.amount
    }
  }
  const parts = HAJJ_CURRENCIES.filter((c) => totals[c.code] > 0).map((c) =>
    formatHajjMoney(totals[c.code], c.code, { compact: true })
  )
  return parts.length > 0 ? parts.join(' • ') : null
}

function isSameUtcDay(dateStr: string | null | undefined, todayIsoDate: string): boolean {
  if (!dateStr) return false
  return String(dateStr).slice(0, 10) === todayIsoDate
}

export function computeAgencyDigestStats(params: {
  pelerins: DigestPelerinRow[]
  paymentsToday: DigestPaymentRow[]
  preferredCampagne?: number | null
  lastSeenAt?: string | null
  now?: Date
}): AgencyDigestStats {
  const now = params.now ?? new Date()
  const todayIsoDate = now.toISOString().slice(0, 10)

  // Priorité absolue à l'année active sélectionnée par l'agence lors de sa dernière connexion.
  // Sinon repli sur la campagne la plus récente trouvée dans les dossiers.
  const validPreferred =
    params.preferredCampagne != null &&
    Number.isFinite(Number(params.preferredCampagne)) &&
    Number(params.preferredCampagne) > 2000
      ? Number(params.preferredCampagne)
      : null

  const campagnes = params.pelerins
    .map((p) => Number(p.campagne))
    .filter((y) => Number.isFinite(y) && y > 2000)

  const activeCampagne =
    validPreferred ?? (campagnes.length > 0 ? Math.max(...campagnes) : null)

  const scopedPelerins = activeCampagne
    ? params.pelerins.filter((p) => Number(p.campagne) === activeCampagne)
    : params.pelerins

  const scopedPelerinIds = new Set(scopedPelerins.map((p) => String(p.id)))

  const total = scopedPelerins.length
  let unpaidCount = 0
  let zeroPaidCount = 0
  let paidCompleteCount = 0
  let noPassportCount = 0
  let notGouvCount = 0
  let todayNewPelerinsCount = 0

  const resteEntries: Array<{ amount: number; devise: HajjCurrency }> = []

  for (const p of scopedPelerins) {
    const prix = Number(p.prix_package) || 0
    const paye = Number(p.total_paye) || 0
    const devise = normalizeHajjCurrency(p.devise)
    const reste = Math.max(0, prix - paye)

    if (prix > 0 && paye >= prix) {
      paidCompleteCount++
    } else if (prix > 0) {
      unpaidCount++
      resteEntries.push({ amount: reste, devise })
    }

    if (paye <= 0) {
      zeroPaidCount++
    }

    const hasPassportNum = Boolean(String(p.num_passeport || '').trim())
    const hasDoc = Boolean(String(p.document_url || '').trim())
    if (!hasPassportNum && !hasDoc) {
      noPassportCount++
    }

    if (!p.sur_plateforme_gouv) {
      notGouvCount++
    }

    if (isSameUtcDay(p.created_at, todayIsoDate)) {
      todayNewPelerinsCount++
    }
  }

  // Filtrer strictement les paiements du jour appartenant aux pèlerins de la campagne active
  const todayPayments = params.paymentsToday.filter((pay) => {
    const matchesDay =
      isSameUtcDay(pay.payment_date, todayIsoDate) ||
      isSameUtcDay(pay.created_at, todayIsoDate)
    if (!matchesDay) return false
    if (pay.pelerin_id && scopedPelerinIds.size > 0) {
      return scopedPelerinIds.has(String(pay.pelerin_id))
    }
    return scopedPelerinIds.size > 0
  })

  const todayAmountSummary = summarizeByCurrency(
    todayPayments.map((pay) => ({
      amount: Number(pay.amount) || 0,
      devise: normalizeHajjCurrency(pay.devise),
    }))
  )

  const resteSummary = summarizeByCurrency(resteEntries)

  let inactiveDays = 0
  if (params.lastSeenAt) {
    const lastMs = Date.parse(params.lastSeenAt)
    if (!Number.isNaN(lastMs)) {
      inactiveDays = Math.max(0, Math.floor((now.getTime() - lastMs) / (1000 * 60 * 60 * 24)))
    }
  }

  const pct = (count: number) => (total > 0 ? Math.round((count / total) * 100) : 0)

  return {
    total,
    unpaidCount,
    unpaidPct: pct(unpaidCount),
    zeroPaidCount,
    paidCompleteCount,
    paidCompletePct: pct(paidCompleteCount),
    noPassportCount,
    noPassportPct: pct(noPassportCount),
    notGouvCount,
    notGouvPct: pct(notGouvCount),
    todayPaymentsCount: todayPayments.length,
    todayAmountSummary,
    resteSummary,
    todayNewPelerinsCount,
    inactiveDays,
    activeCampagne,
  }
}

export function buildPushDigest(params: {
  slot: PushSlot
  agenceName?: string | null
  stats: AgencyDigestStats
  lastCategory?: string | null
  now?: Date
}): DigestPayload {
  const { slot, stats, lastCategory } = params
  const now = params.now ?? new Date()

  // Titre bien visible : NOM DE L'AGENCE en majuscules
  const title = (params.agenceName?.trim() || 'AGENCE PRO').toUpperCase()
  const campagneTag = stats.activeCampagne
    ? `Campagne ${stats.activeCampagne}`
    : 'Toutes campagnes'

  const dayOfYear = Math.floor(
    (now.getTime() - new Date(now.getFullYear(), 0, 0).getTime()) / (1000 * 60 * 60 * 24)
  )
  const dateTag = now.toISOString().slice(0, 10)
  const tag = `agencepro-${slot}-${dateTag}`

  // Cas 0 pèlerin enregistré sur la campagne active
  if (stats.total === 0) {
    return {
      title,
      body:
        stats.inactiveDays >= 2
          ? `${campagneTag} • Rappel d’activité\nCela fait ${stats.inactiveDays} jours sans ouverture. Commencez à enregistrer vos pèlerins.`
          : `${campagneTag} • Démarrage\nAucun pèlerin enregistré pour le moment sur ${campagneTag.toLowerCase()}.`,
      url: '/hajj/ajouter-pelerin',
      category: stats.inactiveDays >= 2 ? 'inactivite' : 'resume',
      tag,
    }
  }

  // 1. Créneau SOIR : priorité aux encaissements du jour ou nouvelles inscriptions
  if (slot === 'evening' || (slot === 'test' && stats.todayAmountSummary)) {
    if (stats.todayAmountSummary && stats.todayPaymentsCount > 0) {
      return {
        title,
        body: `${campagneTag} • Bilan du jour\nVous avez encaissé ${stats.todayAmountSummary} aujourd’hui (${stats.todayPaymentsCount} versement${stats.todayPaymentsCount > 1 ? 's' : ''}) • ${stats.paidCompletePct}% soldés.`,
        url: '/hajj/comptabilite',
        category: 'encaissement_jour',
        tag,
      }
    }

    if (stats.inactiveDays >= 2) {
      const details: string[] = []
      if (stats.unpaidPct > 0) details.push(`${stats.unpaidPct}% ont un solde en attente`)
      if (stats.noPassportPct > 0) details.push(`${stats.noPassportPct}% sans passeport`)
      return {
        title,
        body: `${campagneTag} • Rappel (${stats.inactiveDays} j sans ouverture)\n${details.length > 0 ? details.join(' • ') : `Vos ${stats.total} dossiers vous attendent.`}`,
        url: '/hajj/dashboard',
        category: 'inactivite',
        tag,
      }
    }

    if (stats.todayNewPelerinsCount > 0) {
      return {
        title,
        body: `${campagneTag} • Point du soir\n${stats.todayNewPelerinsCount} nouveau${stats.todayNewPelerinsCount > 1 ? 'x' : ''} pèlerin${stats.todayNewPelerinsCount > 1 ? 's' : ''} ajouté${stats.todayNewPelerinsCount > 1 ? 's' : ''} aujourd’hui • Total : ${stats.total} (${stats.paidCompletePct}% soldés).`,
        url: '/hajj/liste-pelerins',
        category: 'resume',
        tag,
      }
    }

    if (stats.unpaidCount > 0) {
      return {
        title,
        body: `${campagneTag} • Suivi des encaissements\n${stats.unpaidPct}% des pèlerins (${stats.unpaidCount}/${stats.total}) n’ont pas soldé${stats.resteSummary ? ` • Reste : ${stats.resteSummary}` : ''}.`,
        url: '/hajj/liste-pelerins',
        category: 'impayes',
        tag,
      }
    }
  }

  // 2. Créneau MATIN (ou TEST) : inactivité + rotation intelligente Impayés / Passeports / Plateformes
  if (stats.inactiveDays >= 3 && lastCategory !== 'inactivite') {
    return {
      title,
      body: `${campagneTag} • Rappel (${stats.inactiveDays} j sans ouverture)\n${stats.unpaidPct}% n’ont pas encore soldé et ${stats.noPassportPct}% n’ont pas de passeport.`,
      url: '/hajj/dashboard',
      category: 'inactivite',
      tag,
    }
  }

  const candidates: DigestPayload[] = []

  if (stats.unpaidCount > 0) {
    const zeroNote =
      stats.zeroPaidCount > 0 ? ` dont ${stats.zeroPaidCount} aucun versement` : ''
    candidates.push({
      title,
      body: `${campagneTag} • Paiements en attente\n${stats.unpaidPct}% des pèlerins (${stats.unpaidCount}/${stats.total}${zeroNote}) n’ont pas soldé${stats.resteSummary ? ` • Reste : ${stats.resteSummary}` : ''}.`,
      url: '/hajj/liste-pelerins',
      category: 'impayes',
      tag,
    })
  }

  if (stats.noPassportCount > 0) {
    candidates.push({
      title,
      body: `${campagneTag} • Passeports manquants\n${stats.noPassportPct}% des pèlerins (${stats.noPassportCount}/${stats.total}) n’ont pas encore de passeport enregistré.`,
      url: '/hajj/liste-pelerins',
      category: 'passeports',
      tag,
    })
  }

  if (stats.notGouvCount > 0) {
    candidates.push({
      title,
      body: `${campagneTag} • Plateforme Gouv\n${stats.notGouvPct}% des pèlerins (${stats.notGouvCount}/${stats.total}) ne sont pas encore inscrits sur Gouv.`,
      url: '/hajj/nusuk',
      category: 'plateformes',
      tag,
    })
  }

  if (candidates.length > 0) {
    const filtered =
      candidates.length > 1 && lastCategory
        ? candidates.filter((c) => c.category !== lastCategory)
        : candidates
    const chosen = filtered[dayOfYear % filtered.length] ?? candidates[0]
    return chosen
  }

  return {
    title,
    body: `${campagneTag} • Campagne à jour\nBravo ! Vos ${stats.total} dossiers sont complets et soldés à ${stats.paidCompletePct}%.`,
    url: '/hajj/dashboard',
    category: 'resume',
    tag,
  }
}
