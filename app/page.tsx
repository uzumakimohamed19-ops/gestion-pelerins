'use client'

import React, { useEffect, useState } from 'react'
import Link from 'next/link'
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

export default function PageSelectionModule() {
  // Initialisation immédiate depuis le cache local (zéro milliseconde de latence)
  const [nomAgence, setNomAgence] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('cached_nom_agence') || ''
    }
    return ''
  })
  const [salutation, setSalutation] = useState<string>('Bienvenue')

  // ⚡ Requête 100% LOCALE PowerSync SQLite (sans attendre Supabase réseau)
  // Récupère le nom de l'agence directement depuis les tables répliquées en local
  const { data: agences } = useQuery<{ nom_agence: string }>(
    `SELECT a.nom_agence 
     FROM agences a 
     LIMIT 1`
  )

  // Met à jour et persiste en local dès que SQLite réagit
  useEffect(() => {
    const agenceLocale = agences?.[0]?.nom_agence
    if (agenceLocale) {
      setNomAgence(agenceLocale)
      localStorage.setItem('cached_nom_agence', agenceLocale)
    }
  }, [agences])

  // Salutation dynamique (Matin / Soir)
  useEffect(() => {
    const hour = new Date().getHours()
    if (hour >= 5 && hour < 18) {
      setSalutation('Bonjour')
    } else {
      setSalutation('Bonsoir')
    }
  }, [])

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-50 via-white to-gray-100 flex flex-col justify-between items-center p-5 sm:p-8 lg:p-12 w-full relative select-none">
      
      {/* Annulation de marge sidebar layout */}
      <style dangerouslySetInnerHTML={{
        __html: `
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

      {/* Halos d'ambiance d'arrière-plan */}
      <div className="absolute top-1/3 left-1/4 -translate-x-1/2 w-72 md:w-[480px] h-72 md:h-[480px] bg-blue-400/10 rounded-full blur-[100px] pointer-events-none -z-10" />
      <div className="absolute top-1/3 right-1/4 translate-x-1/2 w-72 md:w-[480px] h-72 md:h-[480px] bg-emerald-400/10 rounded-full blur-[100px] pointer-events-none -z-10" />

      {/* En-tête large et épuré (badge retiré) */}
      <header className="text-center pt-4 sm:pt-10 max-w-2xl">
        <h1 className="text-2xl sm:text-4xl lg:text-5xl font-black text-gray-900 tracking-tight uppercase">
          {salutation}
          {nomAgence && (
            <>
              , <span className="text-transparent bg-clip-text bg-gradient-to-r from-gray-900 via-blue-900 to-gray-800">{nomAgence}</span>
            </>
          )}
        </h1>
        <p className="mt-2 text-sm sm:text-lg text-gray-500 font-medium">
          Accédez directement à vos dossiers en choisissant votre espace de travail
        </p>
      </header>

      {/* Zone centrale : 2 Grands Cercles sur la même ligne */}
      <main className="my-auto w-full max-w-6xl py-4 sm:py-8">
        <div className="flex flex-row items-start justify-center gap-6 sm:gap-14 lg:gap-24">
          
          {/* 🔵 MODULE 1 : PÈLERINAGE */}
          <div className="flex flex-col items-center flex-1 max-w-[190px] sm:max-w-[340px] lg:max-w-[400px]">
            <Link
              href="/hajj/dashboard"
              className="group relative flex flex-col items-center w-full focus:outline-none"
            >
              <div className="relative w-36 h-36 sm:w-60 sm:h-60 lg:w-72 lg:h-72 rounded-full bg-white border-2 sm:border-4 border-gray-100/90 shadow-xl shadow-blue-600/5 group-hover:shadow-2xl group-hover:shadow-blue-600/25 group-hover:border-blue-500 flex flex-col items-center justify-center transition-all duration-300 group-hover:-translate-y-2 active:scale-95 text-slate-800 group-hover:text-blue-600">
                
                <div className="w-18 h-18 sm:w-28 sm:h-28 lg:w-36 lg:h-36 rounded-full bg-blue-50/70 group-hover:bg-blue-600/10 flex items-center justify-center transition-colors">
                  <KaabaIcon className="w-14 h-14 sm:w-20 sm:h-20 lg:w-28 lg:h-28 transition-transform duration-300 group-hover:scale-110" />
                </div>

                <div className="absolute top-2 right-2 sm:top-4 sm:right-4 w-9 h-9 sm:w-12 sm:h-12 rounded-full bg-white shadow-md border border-gray-100 flex items-center justify-center text-gray-400 group-hover:bg-blue-600 group-hover:text-white transition-all hidden sm:flex">
                  <ArrowUpRight className="w-5 h-5 sm:w-6 sm:h-6" />
                </div>
              </div>

              <div className="mt-4 sm:mt-6 text-center">
                <h2 className="text-base sm:text-2xl lg:text-3xl font-black uppercase tracking-tight text-gray-900 group-hover:text-blue-600 transition-colors">
                  Pèlerinage
                </h2>
                <p className="text-xs sm:text-base font-semibold text-blue-600/90 mt-0.5">
                  Hajj & Umrah
                </p>

                <div className="hidden sm:flex flex-col items-center gap-1.5 mt-3 text-xs lg:text-sm text-gray-500">
                  <span className="flex items-center gap-1.5">
                    <CheckCircle2 className="w-4 h-4 text-blue-500" /> Gestion Nusuk & Quotas
                  </span>
                  <span className="flex items-center gap-1.5">
                    <CheckCircle2 className="w-4 h-4 text-blue-500" /> Visas, Groupes & Pèlerins
                  </span>
                </div>
              </div>
            </Link>
          </div>

          {/* 🟢 MODULE 2 : SERVICES AGENCE (GLOBE MULTI-SERVICES) */}
          <div className="flex flex-col items-center flex-1 max-w-[190px] sm:max-w-[340px] lg:max-w-[400px]">
            <Link
              href="/agence/dashboard"
              className="group relative flex flex-col items-center w-full focus:outline-none"
            >
              <div className="relative w-36 h-36 sm:w-60 sm:h-60 lg:w-72 lg:h-72 rounded-full bg-white border-2 sm:border-4 border-gray-100/90 shadow-xl shadow-emerald-600/5 group-hover:shadow-2xl group-hover:shadow-emerald-600/25 group-hover:border-emerald-500 flex flex-col items-center justify-center transition-all duration-300 group-hover:-translate-y-2 active:scale-95 text-slate-800 group-hover:text-emerald-600">
                
                <div className="w-18 h-18 sm:w-28 sm:h-28 lg:w-36 lg:h-36 rounded-full bg-emerald-50/70 group-hover:bg-emerald-600/10 flex items-center justify-center transition-colors">
                  <Globe className="w-12 h-12 sm:w-18 sm:h-18 lg:w-24 lg:h-24 stroke-[1.6] transition-transform duration-300 group-hover:scale-110 group-hover:rotate-12" />
                </div>

                <div className="absolute top-2 right-2 sm:top-4 sm:right-4 w-9 h-9 sm:w-12 sm:h-12 rounded-full bg-white shadow-md border border-gray-100 flex items-center justify-center text-gray-400 group-hover:bg-emerald-600 group-hover:text-white transition-all hidden sm:flex">
                  <ArrowUpRight className="w-5 h-5 sm:w-6 sm:h-6" />
                </div>
              </div>

              <div className="mt-4 sm:mt-6 text-center">
                <h2 className="text-base sm:text-2xl lg:text-3xl font-black uppercase tracking-tight text-gray-900 group-hover:text-emerald-600 transition-colors">
                  Services Agence
                </h2>
                <p className="text-xs sm:text-base font-semibold text-emerald-600/90 mt-0.5">
                  Voyages & Opérations
                </p>

                <div className="hidden sm:flex flex-col items-center gap-1.5 mt-3 text-xs lg:text-sm text-gray-500">
                  <span className="flex items-center gap-1.5">
                    <CheckCircle2 className="w-4 h-4 text-emerald-500" /> Billetterie, Vols & Hôtels
                  </span>
                  <span className="flex items-center gap-1.5">
                    <CheckCircle2 className="w-4 h-4 text-emerald-500" /> Visas, Transferts & Finances
                  </span>
                </div>
              </div>
            </Link>
          </div>

        </div>
      </main>

      {/* Barre d'outils inférieure */}
      <footer className="w-full flex items-center justify-center pb-2 sm:pb-4">
        <div className="flex items-center gap-4 sm:gap-6 px-6 py-3 rounded-full bg-white border border-gray-200/80 shadow-md">
          <button
            type="button"
            className="flex items-center gap-2 text-xs sm:text-sm font-bold uppercase tracking-wider text-gray-500 hover:text-gray-900 transition-colors"
          >
            <BarChart3 className="w-4 h-4 text-blue-600" />
            <span>Bilan Global</span>
          </button>
          <div className="w-[1px] h-4 bg-gray-200" />
          <button
            type="button"
            className="flex items-center gap-2 text-xs sm:text-sm font-bold uppercase tracking-wider text-gray-500 hover:text-gray-900 transition-colors"
          >
            <Settings className="w-4 h-4 text-emerald-600" />
            <span>Paramètres</span>
          </button>
        </div>
      </footer>

    </div>
  )
}