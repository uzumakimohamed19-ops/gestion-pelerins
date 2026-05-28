'use client'
import React from 'react'
import Link from 'next/link'
import { Plane, Moon, BarChart3, Settings } from 'lucide-react'

export default function PageSelectionModule() {
  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-4 py-8 sm:p-6">
      
      {/* Header de bienvenue */}
      <div className="text-center mb-8 sm:mb-12 px-2">
        <h1 className="text-2xl sm:text-4xl font-black text-gray-900 mb-2 tracking-tight uppercase">
          Al Bouraq Gestion
        </h1>
        <p className="text-sm sm:text-base text-gray-500 font-medium max-w-sm sm:max-w-none mx-auto">
          Sélectionnez le module de travail pour continuer
        </p>
      </div>

      {/* Grid de Cartes */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-8 w-full max-w-5xl">
        
        {/* MODULE 1: HAJJ & UMRAH */}
        <Link href="hajj/dashboard" className="group relative overflow-hidden bg-white p-6 sm:p-10 rounded-3xl sm:rounded-[2.5rem] shadow-md hover:shadow-2xl transition-all border-2 border-transparent hover:border-blue-600 active:scale-98">
          <div className="relative z-10">
            <div className="bg-blue-50 w-14 h-14 sm:w-20 sm:h-20 rounded-2xl flex items-center justify-center mb-4 sm:mb-6 group-hover:bg-blue-600 transition-colors">
              <Moon className="w-7 h-7 sm:w-10 sm:h-10 text-blue-600 group-hover:text-white transition-colors" />
            </div>
            <h2 className="text-xl sm:text-3xl font-black text-gray-900 mb-2 uppercase tracking-tight sm:tracking-tighter">
              Pèlerinage
            </h2>
            <p className="text-xs sm:text-sm md:text-base text-gray-500 font-medium leading-relaxed mb-6">
              Gestion des dossiers Hajj & Umrah, suivi des passeports, visas et plateformes gouvernementales.
            </p>
            <div className="flex items-center text-blue-600 font-black uppercase text-xs sm:text-sm tracking-widest">
              Accéder au module
              <svg className="w-4 h-4 sm:w-5 sm:h-5 ml-2 group-hover:translate-x-2 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M13 7l5 5m0 0l-5 5m5-5H6" />
              </svg>
            </div>
          </div>
          {/* Décoration en arrière-plan - Masquée sur mobile pour épurer la lecture */}
          <div className="absolute -right-10 -bottom-10 opacity-5 group-hover:opacity-10 transition-opacity hidden sm:block">
            <Moon size={200} className="text-blue-900" />
          </div>
        </Link>

        {/* MODULE 2: AGENCE SERVICES (BILLETTERIE, ETC.) */}
        <Link href="/agence/dashboard" className="group relative overflow-hidden bg-white p-6 sm:p-10 rounded-3xl sm:rounded-[2.5rem] shadow-md hover:shadow-2xl transition-all border-2 border-transparent hover:border-emerald-600 active:scale-98">
          <div className="relative z-10">
            <div className="bg-emerald-50 w-14 h-14 sm:w-20 sm:h-20 rounded-2xl flex items-center justify-center mb-4 sm:mb-6 group-hover:bg-emerald-600 transition-colors">
              <Plane className="w-7 h-7 sm:w-10 sm:h-10 text-emerald-600 group-hover:text-white transition-colors" />
            </div>
            <h2 className="text-xl sm:text-3xl font-black text-gray-900 mb-2 uppercase tracking-tight sm:tracking-tighter">
              Services Agence
            </h2>
            <p className="text-xs sm:text-sm md:text-base text-gray-500 font-medium leading-relaxed mb-6">
              Billetterie, Transferts d&apos;argent, Visas touristiques et comptabilité analytique de l&apos;agence.
            </p>
            <div className="flex items-center text-emerald-600 font-black uppercase text-xs sm:text-sm tracking-widest">
              Accéder au module
              <svg className="w-4 h-4 sm:w-5 sm:h-5 ml-2 group-hover:translate-x-2 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M13 7l5 5m0 0l-5 5m5-5H6" />
              </svg>
            </div>
          </div>
          {/* Décoration en arrière-plan - Masquée sur mobile */}
          <div className="absolute -right-10 -bottom-10 opacity-5 group-hover:opacity-10 transition-opacity hidden sm:block">
            <Plane size={200} className="text-emerald-900" />
          </div>
        </Link>

      </div>

      {/* Barre de raccourcis rapides en bas */}
      <div className="mt-12 flex flex-wrap justify-center gap-6 sm:gap-8 border-t border-gray-200/60 pt-6 w-full max-w-xs sm:max-w-none">
        <div className="flex items-center gap-2 text-gray-400 hover:text-gray-600 cursor-pointer transition-colors p-1">
          <BarChart3 size={16} />
          <span className="text-[10px] sm:text-xs font-bold uppercase tracking-widest">Global Bilan</span>
        </div>
        <div className="flex items-center gap-2 text-gray-400 hover:text-gray-600 cursor-pointer transition-colors p-1">
          <Settings size={16} />
          <span className="text-[10px] sm:text-xs font-bold uppercase tracking-widest">Paramètres</span>
        </div>
      </div>

    </div>
  )
}