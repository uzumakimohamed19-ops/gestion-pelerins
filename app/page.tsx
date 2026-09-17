'use client'

import React, { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { BarChart3, Settings, Globe, ArrowUpRight, CheckCircle2 } from 'lucide-react'
import { useQuery } from '@powersync/react'

// 🕋 Kaaba monumentale, nette et stylisée avec Kiswah & Bab Al-Kaaba dorés
function KaabaIcon({ className = 'w-16 h-16' }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" fill="none" className={className}>
      <path
        d="M16 3.5L28 9.5L16 15.5L4 9.5L16 3.5Z"
        fill="currentColor"
        className="opacity-95"
      />
      <path
        d="M4 9.5L16 15.5V28.5L4 22.5V9.5Z"
        fill="currentColor"
        className="opacity-80"
      />
      <path
        d="M16 15.5L28 9.5V22.5L16 28.5V15.5Z"
        fill="currentColor"
        className="opacity-100"
      />
      <path
        d="M4 13.5L16 19.5L28 13.5"
        stroke="#F59E0B"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M20 18.5V25"
        stroke="#F59E0B"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <circle cx="21" cy="22" r="0.6" fill="#F59E0B" />
    </svg>
  )
}

interface RippleOrigin {
  x: number
  y: number
  size: number
  color: string
}

export default function PageSelectionModule() {
  const router = useRouter()

  // État de l'expansion circulaire plein écran
  const [ripple, setRipple] = useState<RippleOrigin | null>(null)
  const [isExpanding, setIsExpanding] = useState(false)

  // Cache instantané 0 ms
  const [nomAgence, setNomAgence] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('cached_nom_agence') || ''
    }
    return ''
  })
  const [salutation, setSalutation] = useState<string>('Bienvenue')

  // Requête SQLite locale PowerSync
  const { data: agences } = useQuery<{ nom_agence: string }>(
    `SELECT a.nom_agence 
     FROM agences a 
     LIMIT 1`
  )

  useEffect(() => {
    const agenceLocale = agences?.[0]?.nom_agence
    if (agenceLocale) {
      setNomAgence(agenceLocale)
      localStorage.setItem('cached_nom_agence', agenceLocale)
    }
  }, [agences])

  useEffect(() => {
    const hour = new Date().getHours()
    if (hour >= 5 && hour < 18) {
      setSalutation('Bonjour')
    } else {
      setSalutation('Bonsoir')
    }
  }, [])

  // Déclencheur de l'expansion circulaire
  const handleLaunchModule = (
    e: React.MouseEvent<HTMLButtonElement>,
    href: string,
    colorClass: string
  ) => {
    if (ripple) return

    const rect = e.currentTarget.getBoundingClientRect()
    setRipple({
      x: rect.left,
      y: rect.top,
      size: rect.width,
      color: colorClass,
    })

    requestAnimationFrame(() => {
      setIsExpanding(true)
    })

    setTimeout(() => {
      router.push(href)
    }, 450)
  }

  return (
    <div className="h-dvh max-h-dvh w-full bg-gradient-to-b from-gray-50 via-white to-gray-100 flex flex-col justify-between items-center px-4 py-4 sm:p-8 lg:p-12 relative select-none overflow-hidden touch-none">
      
      {/* 🧬 Verrouillage strict du scroll (body et layout) */}
      <style dangerouslySetInnerHTML={{
        __html: `
          html, body {
            overflow: hidden !important;
            height: 100% !important;
            max-height: 100% !important;
            touch-action: none !important;
          }
          @media (min-width: 768px) {
            main, body, .min-h-screen {
              padding-left: 0px !important;
              margin-left: 0px !important;
            }
          }
          @media (min-width: 1024px) {
            main, body, .min-h-screen {
              padding-left: 0px !important;
              margin-left: 0px !important;
            }
          }
        `
      }} />

      {/* 💥 Cercle expansif plein écran (Transition Circular Reveal) */}
      {ripple && (
        <div
          style={{
            position: 'fixed',
            left: `${ripple.x}px`,
            top: `${ripple.y}px`,
            width: `${ripple.size}px`,
            height: `${ripple.size}px`,
            transform: isExpanding ? 'scale(35)' : 'scale(1)',
            transition: 'transform 500ms cubic-bezier(0.4, 0, 0.2, 1), opacity 450ms ease',
            pointerEvents: 'none',
            zIndex: 9999,
          }}
          className={`rounded-full ${ripple.color} ${isExpanding ? 'opacity-100' : 'opacity-80'}`}
        />
      )}

      {/* Halos d'ambiance d'arrière-plan */}
      <div className="absolute top-1/3 left-1/4 -translate-x-1/2 w-64 md:w-[480px] h-64 md:h-[480px] bg-blue-400/10 rounded-full blur-[90px] pointer-events-none -z-10" />
      <div className="absolute top-1/3 right-1/4 translate-x-1/2 w-64 md:w-[480px] h-64 md:h-[480px] bg-emerald-400/10 rounded-full blur-[90px] pointer-events-none -z-10" />

      {/* En-tête compact sans débordement */}
      <header className={`text-center pt-2 sm:pt-6 max-w-2xl shrink-0 transition-opacity duration-300 ${ripple ? 'opacity-20' : 'opacity-100'}`}>
        <h1 className="text-xl sm:text-4xl lg:text-5xl font-black text-gray-900 tracking-tight uppercase">
          {salutation}
          {nomAgence && (
            <>
              , <span className="text-transparent bg-clip-text bg-gradient-to-r from-gray-900 via-blue-900 to-gray-800">{nomAgence}</span>
            </>
          )}
        </h1>
        <p className="mt-1 text-xs sm:text-base text-gray-500 font-medium">
          Accédez directement à vos dossiers en choisissant votre espace de travail
        </p>
      </header>

      {/* Zone centrale : Grands cercles proportionnés pour tenir à 100% dans l'écran */}
      <main className={`my-auto w-full max-w-6xl shrink-0 py-2 sm:py-6 transition-opacity duration-300 ${ripple ? 'opacity-30' : 'opacity-100'}`}>
        <div className="flex flex-row items-start justify-center gap-5 sm:gap-14 lg:gap-24">
          
          {/* 🔵 MODULE 1 : PÈLERINAGE (Expansion Bleue) */}
          <div className="flex flex-col items-center flex-1 max-w-[155px] sm:max-w-[320px] lg:max-w-[380px]">
            <button
              type="button"
              onClick={(e) => handleLaunchModule(e, '/hajj/dashboard', 'bg-blue-600')}
              className="group relative flex flex-col items-center w-full focus:outline-none cursor-pointer"
            >
              <div className="relative w-32 h-32 sm:w-56 sm:h-56 lg:w-68 lg:h-68 rounded-full bg-white border-2 sm:border-4 border-gray-100/90 shadow-xl shadow-blue-600/5 group-hover:shadow-2xl group-hover:shadow-blue-600/25 group-hover:border-blue-500 group-hover:-translate-y-2 active:scale-90 active:border-blue-500 active:shadow-blue-600/30 flex flex-col items-center justify-center transition-all duration-300 text-slate-800 group-hover:text-blue-600 active:text-blue-600">
                
                <div className="w-16 h-16 sm:w-26 sm:h-26 lg:w-34 lg:h-34 rounded-full bg-blue-50/70 group-hover:bg-blue-600/10 active:bg-blue-600/15 flex items-center justify-center transition-colors">
                  <KaabaIcon className="w-12 h-12 sm:w-18 sm:h-18 lg:w-26 lg:h-26 transition-transform duration-300 group-hover:scale-110 active:scale-110" />
                </div>

                <div className="absolute top-2 right-2 sm:top-4 sm:right-4 w-8 h-8 sm:w-11 sm:h-11 rounded-full bg-white shadow-md border border-gray-100 flex items-center justify-center text-gray-400 group-hover:bg-blue-600 group-hover:text-white active:bg-blue-600 active:text-white transition-all hidden sm:flex">
                  <ArrowUpRight className="w-4 h-4 sm:w-5 sm:h-5" />
                </div>
              </div>

              <div className="mt-3 sm:mt-5 text-center">
                <h2 className="text-sm sm:text-2xl lg:text-3xl font-black uppercase tracking-tight text-gray-900 group-hover:text-blue-600 active:text-blue-600 transition-colors">
                  Pèlerinage
                </h2>
                <p className="text-[11px] sm:text-base font-semibold text-blue-600/90 mt-0.5">
                  Hajj & Umrah
                </p>

                <div className="hidden sm:flex flex-col items-center gap-1.5 mt-2.5 text-xs lg:text-sm text-gray-500">
                  <span className="flex items-center gap-1.5">
                    <CheckCircle2 className="w-4 h-4 text-blue-500" /> Gestion Nusuk & Quotas
                  </span>
                  <span className="flex items-center gap-1.5">
                    <CheckCircle2 className="w-4 h-4 text-blue-500" /> Visas, Groupes & Pèlerins
                  </span>
                </div>
              </div>
            </button>
          </div>

          {/* 🟢 MODULE 2 : SERVICES AGENCE (Expansion Émeraude) */}
          <div className="flex flex-col items-center flex-1 max-w-[155px] sm:max-w-[320px] lg:max-w-[380px]">
            <button
              type="button"
              onClick={(e) => handleLaunchModule(e, '/agence/dashboard', 'bg-emerald-600')}
              className="group relative flex flex-col items-center w-full focus:outline-none cursor-pointer"
            >
              <div className="relative w-32 h-32 sm:w-56 sm:h-56 lg:w-68 lg:h-68 rounded-full bg-white border-2 sm:border-4 border-gray-100/90 shadow-xl shadow-emerald-600/5 group-hover:shadow-2xl group-hover:shadow-emerald-600/25 group-hover:border-emerald-500 group-hover:-translate-y-2 active:scale-90 active:border-emerald-500 active:shadow-emerald-600/30 flex flex-col items-center justify-center transition-all duration-300 text-slate-800 group-hover:text-emerald-600 active:text-emerald-600">
                
                <div className="w-16 h-16 sm:w-26 sm:h-26 lg:w-34 lg:h-34 rounded-full bg-emerald-50/70 group-hover:bg-emerald-600/10 active:bg-emerald-600/15 flex items-center justify-center transition-colors">
                  <Globe className="w-11 h-11 sm:w-16 sm:h-16 lg:w-22 lg:h-22 stroke-[1.6] transition-transform duration-300 group-hover:scale-110 group-hover:rotate-12 active:scale-110 active:rotate-12" />
                </div>

                <div className="absolute top-2 right-2 sm:top-4 sm:right-4 w-8 h-8 sm:w-11 sm:h-11 rounded-full bg-white shadow-md border border-gray-100 flex items-center justify-center text-gray-400 group-hover:bg-emerald-600 group-hover:text-white active:bg-emerald-600 active:text-white transition-all hidden sm:flex">
                  <ArrowUpRight className="w-4 h-4 sm:w-5 sm:h-5" />
                </div>
              </div>

              <div className="mt-3 sm:mt-5 text-center">
                <h2 className="text-sm sm:text-2xl lg:text-3xl font-black uppercase tracking-tight text-gray-900 group-hover:text-emerald-600 active:text-emerald-600 transition-colors">
                  Services Agence
                </h2>
                <p className="text-[11px] sm:text-base font-semibold text-emerald-600/90 mt-0.5">
                  Voyages & Opérations
                </p>

                <div className="hidden sm:flex flex-col items-center gap-1.5 mt-2.5 text-xs lg:text-sm text-gray-500">
                  <span className="flex items-center gap-1.5">
                    <CheckCircle2 className="w-4 h-4 text-emerald-500" /> Billetterie, Vols & Hôtels
                  </span>
                  <span className="flex items-center gap-1.5">
                    <CheckCircle2 className="w-4 h-4 text-emerald-500" /> Visas, Transferts & Finances
                  </span>
                </div>
              </div>
            </button>
          </div>

        </div>
      </main>

      {/* Barre d'outils inférieure */}
      <footer className={`w-full flex items-center justify-center pb-2 shrink-0 transition-opacity duration-300 ${ripple ? 'opacity-10' : 'opacity-100'}`}>
        <div className="flex items-center gap-3 sm:gap-6 px-5 py-2.5 rounded-full bg-white border border-gray-200/80 shadow-md">
          <button
            type="button"
            className="flex items-center gap-1.5 text-xs sm:text-sm font-bold uppercase tracking-wider text-gray-500 hover:text-gray-900 active:scale-95 transition-all"
          >
            <BarChart3 className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-blue-600" />
            <span>Bilan Global</span>
          </button>
          <div className="w-[1px] h-3.5 bg-gray-200" />
          <button
            type="button"
            className="flex items-center gap-1.5 text-xs sm:text-sm font-bold uppercase tracking-wider text-gray-500 hover:text-gray-900 active:scale-95 transition-all"
          >
            <Settings className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-emerald-600" />
            <span>Paramètres</span>
          </button>
        </div>
      </footer>

    </div>
  )
}