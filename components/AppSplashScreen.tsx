'use client'

import { useEffect, useState } from 'react'
import { Building2, Plane } from 'lucide-react'
import { getPersistedSupabaseUserId } from '@/lib/supabase'

interface AppSplashScreenProps {
  id?: string
  statusText?: string
  exiting?: boolean
  darkOverride?: boolean
}

/**
 * Splash Screen Signature Agence Pro :
 * - Fond blanc pur minimaliste sans aucune distraction en arrière-plan
 * - Logo vectoriel Agence Pro animé directement sur fond blanc (sans cadre bleu)
 * - 3 grandes bulles métier (Pèlerin/Kaaba · Avion · Agence) placées juste sous le logo et le texte,
 *   reliées par une ligne bleue lumineuse qui se balade fluidement entre elles.
 */
export default function AppSplashScreen({
  id,
  statusText,
  exiting = false,
}: AppSplashScreenProps) {
  const [agencyName, setAgencyName] = useState<string>('')

  useEffect(() => {
    try {
      const uid = getPersistedSupabaseUserId()
      if (uid) {
        const cached = localStorage.getItem(`cached_nom_agence_${uid}`)
        if (cached && cached.trim()) {
          setAgencyName(cached.trim())
        }
      }
    } catch {}
  }, [])

  return (
    <main
      id={id}
      aria-label="Ouverture Agence Pro"
      style={{ backgroundColor: '#FFFFFF', color: '#061A44' }}
      className={`ap-splash-surface fixed inset-0 z-[9998] overflow-hidden flex flex-col items-center justify-center px-6 pt-[max(2rem,env(safe-area-inset-top))] pb-[max(2rem,env(safe-area-inset-bottom))] select-none transition-all duration-500 ease-out ${
        exiting
          ? 'opacity-0 scale-[1.03] pointer-events-none'
          : 'opacity-100 scale-100'
      }`}
    >
      {/* ── BLOC CENTRAL UNIFIÉ : LOGO SUR FOND BLANC + TEXTE + BULLES RELIÉES ── */}
      <div className="flex flex-col items-center w-full max-w-sm">
        {/* Emblème vectoriel Agence Pro animé directement sur fond blanc pur */}
        <div className="ap-logo-enter relative w-[124px] h-[124px] sm:w-[140px] sm:h-[140px] flex items-center justify-center">
          <svg viewBox="0 0 120 120" className="w-full h-full overflow-visible">
            <defs>
              <linearGradient id="ap-leg-navy" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#0D47B8" />
                <stop offset="55%" stopColor="#07276E" />
                <stop offset="100%" stopColor="#041540" />
              </linearGradient>
              <linearGradient id="ap-arc-electric" x1="0%" y1="100%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="#0052E0" />
                <stop offset="52%" stopColor="#0096FF" />
                <stop offset="100%" stopColor="#26CCFF" />
              </linearGradient>
            </defs>

            {/* Pilier "A" architectural en bleu royal profond directement sur blanc */}
            <path
              d="M29 94 L53.5 25 Q60 11 66.5 25 L91 94"
              fill="none"
              stroke="url(#ap-leg-navy)"
              strokeWidth="15.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="ap-stroke-a"
            />

            {/* Découpe négative blanche nette là où la trajectoire coupe le A */}
            <path
              d="M18 61 C11 78, 51 83, 97 38"
              fill="none"
              stroke="#FFFFFF"
              strokeWidth="16"
              strokeLinecap="round"
              className="ap-stroke-arc"
            />

            {/* Trajectoire avion bleu électrique qui s'envole à travers le A */}
            <path
              d="M18 61 C11 78, 51 83, 97 38"
              fill="none"
              stroke="url(#ap-arc-electric)"
              strokeWidth="9.5"
              strokeLinecap="round"
              className="ap-stroke-arc"
            />

            {/* Pointe avion bicolore */}
            <g className="ap-plane-tip">
              <polygon points="108,29 86,36 96,42.5 98.5,54" fill="#0096FF" />
              <polygon points="108,29 96,42.5 98.5,54" fill="#07276E" />
            </g>

            {/* Éclat discret au sommet de l'envol */}
            <circle
              cx="106"
              cy="31"
              r="6.5"
              fill="none"
              stroke="#0096FF"
              strokeWidth="1.6"
              className="ap-star-pulse"
            />
          </svg>
        </div>

        {/* Typographie de marque */}
        <div className="mt-4 overflow-hidden">
          <h1 className="ap-mask-up text-[34px] sm:text-[38px] font-black tracking-[-0.035em] leading-none flex items-baseline justify-center">
            <span className="text-[#061A44]">Agence</span>
            <span className="text-[#0088FF] ml-1.5">Pro</span>
          </h1>
        </div>

        {/* Filet or champagne */}
        <div className="ap-gold-rule mt-3.5 w-14 h-[1.5px] rounded-full bg-gradient-to-r from-transparent via-[#D4A359] to-transparent" />

        {/* Sous-titre métier */}
        <p className="ap-tagline-in mt-3 text-[11px] font-bold tracking-[0.26em] uppercase text-slate-500">
          Hajj &nbsp;·&nbsp; Voyages &nbsp;·&nbsp; Gestion
        </p>

        {agencyName && (
          <p className="ap-tagline-in mt-2 text-[11.5px] font-extrabold tracking-[0.14em] uppercase text-[#07276E] truncate max-w-full">
            {agencyName}
          </p>
        )}

        {/* ── BULLES DE CHARGEMENT AGRANDIES + LIGNE BLEUE QUI SE BALADE ENTRE ELLES ── */}
        <div
          className="ap-bubbles-enter relative mt-10 w-[256px] sm:w-[288px] h-[72px] flex items-center justify-between"
          aria-hidden="true"
        >
          {/* Ligne bleue fluide qui circule entre les 3 bulles */}
          <svg
            viewBox="0 0 200 32"
            preserveAspectRatio="none"
            className="pointer-events-none absolute left-7 right-7 sm:left-8 sm:right-8 top-1/2 -translate-y-1/2 w-[calc(100%-3.5rem)] sm:w-[calc(100%-4rem)] h-8 overflow-visible z-0"
          >
            <defs>
              <linearGradient id="ap-travel-blue" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="#0055FF" />
                <stop offset="50%" stopColor="#0096FF" />
                <stop offset="100%" stopColor="#38D4FF" />
              </linearGradient>
            </defs>

            {/* Rail de connexion subtil */}
            <path
              d="M 0 16 Q 50 7 100 16 T 200 16"
              pathLength={200}
              fill="none"
              stroke="rgba(0, 122, 255, 0.14)"
              strokeWidth="2.6"
              strokeLinecap="round"
            />

            {/* Halo doux accompagnant la ligne bleue */}
            <path
              d="M 0 16 Q 50 7 100 16 T 200 16"
              pathLength={200}
              fill="none"
              stroke="#0096FF"
              strokeOpacity="0.22"
              strokeWidth="7"
              strokeLinecap="round"
              className="ap-line-travel"
            />

            {/* Ligne bleue vive qui se balade entre les bulles */}
            <path
              d="M 0 16 Q 50 7 100 16 T 200 16"
              pathLength={200}
              fill="none"
              stroke="url(#ap-travel-blue)"
              strokeWidth="3.6"
              strokeLinecap="round"
              className="ap-line-travel"
            />
          </svg>

          {/* Bulle 1 : Pèlerin / Kaaba */}
          <div
            style={{ backgroundColor: '#FFFDF7' }}
            className="ap-bubble-1 relative z-10 w-14 h-14 sm:w-16 sm:h-16 rounded-full border-[1.5px] border-[#D4A359]/55 shadow-[0_12px_28px_-8px_rgba(212,163,89,0.42)] flex items-center justify-center text-[#B8832D]"
          >
            <svg
              width="25"
              height="25"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.85"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M4 9.5L12 5l8 4.5v8.5L12 22l-8-4v-8.5z" />
              <path d="M4 9.5L12 14l8-4.5" />
              <path d="M12 14v8" />
              <path d="M7.5 11.4l4.5 2.6 4.5-2.6" stroke="#D4A359" strokeWidth="1.7" />
            </svg>
          </div>

          {/* Bulle 2 : Avion / Vol */}
          <div
            style={{ backgroundColor: '#F4FAFF' }}
            className="ap-bubble-2 relative z-10 w-14 h-14 sm:w-16 sm:h-16 rounded-full border-[1.5px] border-[#0096FF]/45 shadow-[0_12px_28px_-8px_rgba(0,150,255,0.4)] flex items-center justify-center text-[#0082EE]"
          >
            <Plane size={24} strokeWidth={2} />
          </div>

          {/* Bulle 3 : Agence de voyage */}
          <div
            style={{ backgroundColor: '#F3F6FF' }}
            className="ap-bubble-3 relative z-10 w-14 h-14 sm:w-16 sm:h-16 rounded-full border-[1.5px] border-[#07276E]/30 shadow-[0_12px_28px_-8px_rgba(7,39,110,0.34)] flex items-center justify-center text-[#07276E]"
          >
            <Building2 size={24} strokeWidth={2} />
          </div>
        </div>

        {statusText && (
          <p className="mt-5 text-[10.5px] font-semibold tracking-wider text-slate-400">
            {statusText}
          </p>
        )}
      </div>
    </main>
  )
}
