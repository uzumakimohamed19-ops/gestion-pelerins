'use client'

import { useYear } from '@/lib/YearContext'
import { Calendar, ChevronDown, Check } from 'lucide-react'
import { useState, useRef, useEffect } from 'react'

export function YearSelector() {
  const { selectedYear, setSelectedYear, availableYears } = useYear()
  const [isOpen, setIsOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  // Fermer le menu si on clique en dehors
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // Libellé de l'année sélectionnée
  const currentLabel = selectedYear === 'all' ? 'Toutes les années' : `Campagne ${selectedYear}`

  return (
    <div className="relative inline-block text-left select-none" ref={dropdownRef}>
      {/* Bouton Principal de l'UI */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`flex items-center justify-between gap-3 px-4 py-2.5 bg-white border ${
          isOpen ? 'border-blue-500 shadow-md shadow-blue-500/5 ring-2 ring-blue-50' : 'border-slate-200 shadow-sm'
        } rounded-xl hover:border-slate-300 hover:bg-slate-50 active:scale-[0.98] transition-all duration-200 cursor-pointer w-full sm:w-auto`}
      >
        <div className="flex items-center gap-2.5 min-w-0">
          <div className={`p-1.5 rounded-lg ${isOpen ? 'bg-blue-50 text-blue-600' : 'bg-slate-50 text-slate-500'} transition-colors`}>
            <Calendar size={15} />
          </div>
          <div className="text-left">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider leading-none">Année</p>
            <p className="text-sm font-black text-slate-800 tracking-tight mt-0.5 truncate">{currentLabel}</p>
          </div>
        </div>
        <ChevronDown 
          size={16} 
          className={`text-slate-400 shrink-0 transition-transform duration-300 ${isOpen ? 'rotate-180 text-blue-500' : ''}`} 
        />
      </button>

      {/* Menu Déroulant (Dropdown Premium) */}
      {isOpen && (
        <div className="absolute right-0 mt-2 w-56 bg-white/95 backdrop-blur-md border border-slate-100 rounded-xl shadow-xl shadow-slate-200/80 z-[100] overflow-hidden origin-top-right animate-fadeIn p-1.5 focus:outline-none">
          
          {/* Option : Toutes les années */}
          <button
            onClick={() => {
              setSelectedYear('all')
              setIsOpen(false)
            }}
            className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-left text-xs font-semibold transition-all ${
              selectedYear === 'all'
                ? 'bg-blue-50 text-blue-600 font-bold'
                : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
            }`}
          >
            <span>Toutes les années</span>
            {selectedYear === 'all' && <Check size={14} className="stroke-[3]" />}
          </button>

          {availableYears.length > 0 && <div className="h-px bg-slate-100 my-1 mx-1" />}

          {/* Options : Années dynamiques */}
          <div className="max-h-48 overflow-y-auto space-y-0.5 pr-0.5 scrollbar-thin">
            {availableYears.map((y) => {
              const isSelected = selectedYear !== 'all' && selectedYear === y
              return (
                <button
                  key={y}
                  onClick={() => {
                    setSelectedYear(parseInt(String(y)))
                    setIsOpen(false)
                  }}
                  className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-left text-xs font-semibold transition-all ${
                    isSelected
                      ? 'bg-blue-50 text-blue-600 font-bold'
                      : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                  }`}
                >
                  <span className="tabular-nums">Campagne {y}</span>
                  {isSelected && <Check size={14} className="stroke-[3]" />}
                </button>
              )
            })}
          </div>

        </div>
      )}
    </div>
  )
}