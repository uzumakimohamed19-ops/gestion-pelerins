'use client'

import { HAJJ_CURRENCIES, type HajjCurrency, type HajjCurrencyFilter } from '@/lib/hajjCurrency'

type CurrencyTabsProps<T extends HajjCurrency | HajjCurrencyFilter> = {
  value: T
  onChange: (value: T) => void
  includeAll?: boolean
  counts?: Partial<Record<HajjCurrency, number>>
  totalCount?: number
  size?: 'sm' | 'md'
  className?: string
  variant?: 'default' | 'hero'
}

export function HajjCurrencyTabs<T extends HajjCurrency | HajjCurrencyFilter>({
  value,
  onChange,
  includeAll = false,
  counts,
  totalCount,
  size = 'md',
  className = '',
  variant = 'default',
}: CurrencyTabsProps<T>) {
  const isHero = variant === 'hero'
  const pad = size === 'sm' ? 'px-2.5 py-1.5 text-[11px]' : 'px-3.5 py-2 text-xs'

  return (
    <div
      className={`inline-flex flex-wrap items-center gap-1.5 p-1 rounded-2xl border ${
        isHero
          ? 'bg-white/15 border-white/20 backdrop-blur-md'
          : 'bg-white border-slate-200/90 shadow-xs'
      } ${className}`}
    >
      {includeAll && (
        <button
          type="button"
          onClick={() => onChange('ALL' as T)}
          className={`${pad} rounded-xl font-black uppercase tracking-wider transition-all cursor-pointer inline-flex items-center gap-1.5 ${
            value === 'ALL'
              ? isHero
                ? 'bg-white text-blue-700 shadow-sm'
                : 'bg-slate-900 text-white shadow-sm'
              : isHero
                ? 'text-blue-100 hover:bg-white/10'
                : 'text-slate-500 hover:bg-slate-50 hover:text-slate-800'
          }`}
        >
          <span>Toutes</span>
          {typeof totalCount === 'number' && (
            <span
              className={`px-1.5 py-0.5 rounded-md text-[10px] tabular-nums ${
                value === 'ALL'
                  ? isHero
                    ? 'bg-blue-50 text-blue-700'
                    : 'bg-white/20 text-white'
                  : isHero
                    ? 'bg-white/15 text-white'
                    : 'bg-slate-100 text-slate-600'
              }`}
            >
              {totalCount}
            </span>
          )}
        </button>
      )}

      {HAJJ_CURRENCIES.map((cur) => {
        const active = value === cur.code
        const count = counts?.[cur.code]
        return (
          <button
            key={cur.code}
            type="button"
            onClick={() => onChange(cur.code as T)}
            className={`${pad} rounded-xl font-black uppercase tracking-wider transition-all cursor-pointer inline-flex items-center gap-1.5 ${
              active
                ? isHero
                  ? 'bg-white text-blue-700 shadow-sm'
                  : cur.pillActiveClass
                : isHero
                  ? 'text-blue-100 hover:bg-white/10'
                  : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
            }`}
          >
            <span>{cur.shortLabel}</span>
            {typeof count === 'number' && (
              <span
                className={`px-1.5 py-0.5 rounded-md text-[10px] tabular-nums ${
                  active
                    ? isHero
                      ? 'bg-blue-50 text-blue-700'
                      : 'bg-white/20 text-white'
                    : isHero
                      ? 'bg-white/15 text-white'
                      : 'bg-slate-100 text-slate-500'
                }`}
              >
                {count}
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}
