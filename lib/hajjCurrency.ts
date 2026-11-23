export type HajjCurrency = 'FCFA' | 'EUR' | 'USD'
export type HajjCurrencyFilter = 'ALL' | HajjCurrency

export interface HajjCurrencyMeta {
  code: HajjCurrency
  label: string
  shortLabel: string
  symbol: string
  compactSymbol: string
  badgeClass: string
  pillActiveClass: string
}

export const HAJJ_CURRENCIES: HajjCurrencyMeta[] = [
  {
    code: 'FCFA',
    label: 'Franc CFA',
    shortLabel: 'FCFA',
    symbol: 'FCFA',
    compactSymbol: 'F',
    badgeClass: 'bg-blue-50 text-blue-700 border-blue-200',
    pillActiveClass: 'bg-blue-600 text-white border-blue-600 shadow-sm',
  },
  {
    code: 'EUR',
    label: 'Euro (€)',
    shortLabel: 'EUR €',
    symbol: '€',
    compactSymbol: '€',
    badgeClass: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    pillActiveClass: 'bg-emerald-600 text-white border-emerald-600 shadow-sm',
  },
  {
    code: 'USD',
    label: 'Dollar ($)',
    shortLabel: 'USD $',
    symbol: '$',
    compactSymbol: '$',
    badgeClass: 'bg-amber-50 text-amber-700 border-amber-200',
    pillActiveClass: 'bg-amber-600 text-white border-amber-600 shadow-sm',
  },
]

export const HAJJ_CURRENCY_MAP: Record<HajjCurrency, HajjCurrencyMeta> = {
  FCFA: HAJJ_CURRENCIES[0],
  EUR: HAJJ_CURRENCIES[1],
  USD: HAJJ_CURRENCIES[2],
}

export function normalizeHajjCurrency(raw?: string | null): HajjCurrency {
  const val = (raw || '').trim().toUpperCase()
  if (val === 'EUR' || val === 'EURO' || val === '€') return 'EUR'
  if (val === 'USD' || val === 'DOLLAR' || val === 'DOLLARS' || val === '$') return 'USD'
  return 'FCFA'
}

export function getHajjCurrencySymbol(devise?: string | null, compact = false): string {
  const meta = HAJJ_CURRENCY_MAP[normalizeHajjCurrency(devise)]
  return compact ? meta.compactSymbol : meta.symbol
}

export function getHajjCurrencyLabel(devise?: string | null): string {
  return HAJJ_CURRENCY_MAP[normalizeHajjCurrency(devise)].label
}

export function formatHajjNumber(amount?: number | null): string {
  return Math.round(Number(amount || 0)).toLocaleString('fr-FR')
}

export function formatHajjMoney(
  amount?: number | null,
  devise?: string | null,
  opts?: { compact?: boolean }
): string {
  const code = normalizeHajjCurrency(devise)
  const symbol = getHajjCurrencySymbol(code, opts?.compact)
  return `${formatHajjNumber(amount)} ${symbol}`
}

/**
 * Formate un montant pour les PDF (jsPDF / HTML) en remplaçant les espaces insécables
 * fines de `fr-FR` par des espaces simples afin d'éviter les artefacts de police.
 */
export function formatHajjMoneyPdf(amount?: number | null, devise?: string | null): string {
  return formatHajjMoney(amount, devise).replace(/[\u00A0\u202F]/g, ' ')
}

export function groupTotalsByCurrency<T extends { devise?: string | null }>(
  items: T[],
  getAmount: (item: T) => number
): Record<HajjCurrency, number> {
  const totals: Record<HajjCurrency, number> = { FCFA: 0, EUR: 0, USD: 0 }
  for (const item of items) {
    const code = normalizeHajjCurrency(item.devise)
    totals[code] += Number(getAmount(item) || 0)
  }
  return totals
}

export function countByCurrency<T extends { devise?: string | null }>(
  items: T[]
): Record<HajjCurrency, number> {
  const counts: Record<HajjCurrency, number> = { FCFA: 0, EUR: 0, USD: 0 }
  for (const item of items) {
    const code = normalizeHajjCurrency(item.devise)
    counts[code] += 1
  }
  return counts
}
