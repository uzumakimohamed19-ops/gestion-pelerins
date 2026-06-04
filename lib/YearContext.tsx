'use client'

import React, { createContext, useContext, useState, useEffect } from 'react'
import { get, set } from 'idb-keyval'

type YearContextType = {
  selectedYear: number | 'all'
  setSelectedYear: (year: number | 'all') => void
  availableYears: number[]
}

const YearContext = createContext<YearContextType | undefined>(undefined)

export function YearProvider({ children }: { children: React.ReactNode }) {
  const currentYear = new Date().getFullYear()
  const [selectedYear, setSelectedYearState] = useState<number | 'all'>(currentYear)
  const [availableYears, setAvailableYears] = useState<number[]>([])
  // Récupérer l'année sélectionnée depuis IndexedDB (idb-keyval), initialiser
  useEffect(() => {
    if (typeof window === 'undefined') return
    let mounted = true
    ;(async () => {
      try {
        const saved: any = await get('selectedYear')
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
  }, [currentYear])

  // Recalculer la liste d'années visible en fonction de l'année sélectionnée
  useEffect(() => {
    const base = selectedYear === 'all' ? currentYear : selectedYear
    const start = Math.max(1900, (base as number) - 2)
    const end = (base as number) + 5 // inclut 5 années à venir
    const years: number[] = []
    for (let y = start; y <= end; y++) years.push(y)
    // Présenter du plus récent au plus ancien pour l'UX
    setAvailableYears(years.reverse())
  }, [selectedYear, currentYear])

  const setSelectedYear = (year: number | 'all') => {
    setSelectedYearState(year)
    if (typeof window !== 'undefined') {
      // Persist asynchronously in IndexedDB to avoid blocking the main thread
      try { set('selectedYear', String(year)) } catch (e) { /* ignore */ }
    }
  }

  return (
    <YearContext.Provider value={{ selectedYear, setSelectedYear, availableYears }}>
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
    }
  }
  return context
}
