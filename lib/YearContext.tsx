'use client'

import React, { createContext, useContext, useState, useEffect } from 'react'
import { get, set } from 'idb-keyval'

type YearScope = 'hajj' | 'agence'

type YearContextType = {
  selectedYear: number | 'all'
  setSelectedYear: (year: number | 'all') => void
  availableYears: number[]
  scope: YearScope
}

const YearContext = createContext<YearContextType | undefined>(undefined)

function getStorageKey(scope: YearScope) {
  return `selectedYear_${scope}`
}

export function YearProvider({ children, scope = 'hajj' }: { children: React.ReactNode; scope?: YearScope }) {
  const currentYear = new Date().getFullYear()
  const [selectedYear, setSelectedYearState] = useState<number | 'all'>(currentYear)
  const [availableYears, setAvailableYears] = useState<number[]>([])

  useEffect(() => {
    if (typeof window === 'undefined') return
    let mounted = true
    ;(async () => {
      try {
        const saved: any = await get(getStorageKey(scope))
        if (!mounted) return
        if (saved != null) {
          setSelectedYearState(saved === 'all' ? 'all' : parseInt(String(saved)))
        } else {
          setSelectedYearState(currentYear)
        }
      } catch (e) {
        setSelectedYearState(currentYear)
      }
    })()
    return () => { mounted = false }
  }, [currentYear, scope])

  useEffect(() => {
    const base = selectedYear === 'all' ? currentYear : selectedYear
    const start = Math.max(1900, (base as number) - 2)
    const end = (base as number) + 5
    const years: number[] = []
    for (let y = start; y <= end; y++) years.push(y)
    setAvailableYears(years.reverse())
  }, [selectedYear, currentYear])

  const setSelectedYear = (year: number | 'all') => {
    setSelectedYearState(year)
    if (typeof window !== 'undefined') {
      try { set(getStorageKey(scope), String(year)) } catch (e) { /* ignore */ }
    }
  }

  return (
    <YearContext.Provider value={{ selectedYear, setSelectedYear, availableYears, scope }}>
      {children}
    </YearContext.Provider>
  )
}

export function useYear() {
  const context = useContext(YearContext)
  if (!context) {
    const fallbackYear = new Date().getFullYear()
    const years: number[] = []
    const start = Math.max(1900, fallbackYear - 2)
    const end = fallbackYear + 5
    for (let y = start; y <= end; y++) years.push(y)
    return {
      selectedYear: fallbackYear,
      setSelectedYear: (_: number | 'all') => {},
      availableYears: years.reverse(),
      scope: 'hajj' as YearScope,
    }
  }
  return context
}
