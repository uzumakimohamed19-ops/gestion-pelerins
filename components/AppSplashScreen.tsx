'use client'

import { useEffect, useState } from 'react'
import { Building2, Plane } from 'lucide-react'
import { getPersistedSupabaseUserId } from '@/lib/supabase'

interface AppSplashScreenProps {
  statusText?: string
  exiting?: boolean
  darkOverride?: boolean
}

/**
 * Splash Screen Signature Agence Pro (Fond blanc pur, style ouverture cinéma Disney+ / Netflix) :
 * - Toile blanche épurée avec astrolabe de navigation bleu royal & or champagne ultra-subtil
 * - Logo vectoriel Agence Pro qui se dessine en direct ("A" + envol de la trajectoire avion cyan)
 * - Bulles de chargement animées verticalement avec icônes miniatures métier :
 *   Pèlerin / Kaaba · Avion · Agence de voyage
 */
export default function AppSplashScreen({
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
      aria-label="Ouverture Agence Pro"
      className={`fixed inset-0 z-[9998] overflow-hidden bg-white text-[#061A44] flex flex-col items-center justify-between px-6 pt-[max(2.25rem,env(safe-area-inset-top))] pb-[max(2.25rem,env(safe-area-inset-bottom))] select-none transition-all duration-400 ease-out ${
        exiting
          ? 'opacity-0 scale-[1.04] blur-[2px] pointer-events-none'
          : 'opacity-100 scale-100 blur-0'
      }`}
    >
      {/* ── DÉCOR ARCHITECTURAL SUBTIL SUR FOND BLANC : ASTROLABE & TRAJECTOIRES ── */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 flex items-center justify-center overflow-hidden"
      >
        <svg
          viewBox="0 0 600 600"
          className="w-[520px] h-[520px] sm:w-[680px] sm:h-[680px]"
        >
          <g className="ap-compass-slow" style={{ transformOrigin: '300px 300px' }}>
            <circle
              cx="300"
              cy="300"
              r="256"
              fill="none"
              stroke="rgba(7, 39, 110, 0.06)"
              strokeWidth="1"
              strokeDasharray="3 12"
            />
            <circle
              cx="300"
              cy="300"
              r="210"
              fill="none"
              stroke="rgba(212, 163, 89, 0.16)"
              strokeWidth="0.9"
              strokeDasharray="1 18"
            />
            {/* 4 repères cardinaux or champagne */}
            <line x1="300" y1="36" x2="300" y2="50" stroke="rgba(212, 163, 89, 0.45)" strokeWidth="1.4" />
            <line x1="300" y1="550" x2="300" y2="564" stroke="rgba(212, 163, 89, 0.45)" strokeWidth="1.4" />
            <line x1="36" y1="300" x2="50" y2="300" stroke="rgba(212, 163, 89, 0.45)" strokeWidth="1.4" />
            <line x1="550" y1="300" x2="564" y2="300" stroke="rgba(212, 163, 89, 0.45)" strokeWidth="1.4" />
          </g>

          <g className="ap-compass-reverse" style={{ transformOrigin: '300px 300px' }}>
            <ellipse
              cx="300"
              cy="300"
              rx="232"
              ry="114"
              transform="rotate(-24 300 300)"
              fill="none"
              stroke="rgba(0, 150, 255, 0.085)"
              strokeWidth="1"
            />
            <circle cx="511" cy="206" r="3" fill="#0096FF" opacity="0.45" />
            <circle cx="89" cy="394" r="2.4" fill="#D4A359" opacity="0.5" />
          </g>

          <circle
            cx="300"
            cy="300"
            r="138"
            fill="none"
            stroke="rgba(7, 39, 110, 0.045)"
            strokeWidth="1"
          />
        </svg>
      </div>

      {/* Haut : mention discrète */}
      <div className="relative z-10 h-6 flex items-center justify-center">
        <span className="ap-tagline-in inline-flex items-center gap-1.5 text-[10px] font-bold tracking-[0.22em] uppercase text-slate-400">
          <span className="w-1.5 h-1.5 rounded-full bg-[#D4A359]" />
          Plateforme Officielle
        </span>
      </div>

      {/* ── CENTRE : EMBLÈME VECTORIEL ANIMÉ + TYPOGRAPHIE DE MARQUE ── */}
      <div className="relative z-10 flex flex-col items-center">
        {/* Médaillon Squircle Agence Pro sur fond blanc */}
        <div className="ap-badge-rise relative w-[112px] h-[112px] sm:w-[126px] sm:h-[126px] rounded-[30px] sm:rounded-[34px] p-[2px] bg-gradient-to-br from-[#29D3FF]/60 via-[#07276E]/25 to-[#D4A359]/55 shadow-[0_26px_60px_-14px_rgba(7,39,110,0.34)]">
          <div
            style={{
              background:
                'linear-gradient(145deg, #0B4FD1 0%, #062163 56%, #031033 100%)',
            }}
            className="relative w-full h-full rounded-[28px] sm:rounded-[32px] overflow-hidden flex items-center justify-center"
          >
            {/* Emblème vectoriel exact Agence Pro animé */}
            <svg viewBox="0 0 120 120" className="w-[84%] h-[84%] overflow-visible">
              <defs>
                <linearGradient id="ap-leg-white" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#FFFFFF" />
                  <stop offset="68%" stopColor="#E6F2FF" />
                  <stop offset="100%" stopColor="#38BDF8" />
                </linearGradient>
                <linearGradient id="ap-arc-cyan" x1="0%" y1="100%" x2="100%" y2="0%">
                  <stop offset="0%" stopColor="#0066FF" />
                  <stop offset="52%" stopColor="#00B4FF" />
                  <stop offset="100%" stopColor="#48E5FF" />
                </linearGradient>
              </defs>

              {/* Pilier "A" architectural */}
              <path
                d="M31 92 L54 27 Q60 14 66 27 L89 92"
                fill="none"
                stroke="url(#ap-leg-white)"
                strokeWidth="15.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="ap-stroke-a"
              />

              {/* Ombre de profondeur sous la courbe d'envol */}
              <path
                d="M21 63 C14 78, 52 84, 96 42"
                fill="none"
                stroke="rgba(3, 16, 51, 0.55)"
                strokeWidth="13"
                strokeLinecap="round"
                className="ap-stroke-arc"
              />

              {/* Trajectoire cyan qui s'envole à travers le A */}
              <path
                d="M20 60 C13 76, 51 81, 96 39"
                fill="none"
                stroke="url(#ap-arc-cyan)"
                strokeWidth="9.5"
                strokeLinecap="round"
                className="ap-stroke-arc"
              />

              {/* Pointe avion */}
              <g className="ap-plane-tip">
                <polygon points="106,31 85,37 95,43 97,54" fill="#33DBFF" />
                <polygon points="106,31 95,43 97,54" fill="#0088FF" />
              </g>

              {/* Éclat au sommet de la trajectoire */}
              <circle
                cx="104"
                cy="33"
                r="6"
                fill="none"
                stroke="#7CEEFF"
                strokeWidth="1.5"
                className="ap-star-pulse"
              />
            </svg>

            {/* Reflet lumineux diagonal */}
            <div
              aria-hidden="true"
              className="ap-splash-sheen absolute inset-y-0 -left-1/2 w-1/2 bg-gradient-to-r from-transparent via-white/30 to-transparent pointer-events-none"
            />
          </div>
        </div>

        {/* Révélation typographique sur fond blanc */}
        <div className="mt-7 overflow-hidden">
          <h1 className="ap-mask-up text-[32px] sm:text-[36px] font-black tracking-[-0.035em] leading-none flex items-baseline justify-center">
            <span className="text-[#061A44]">Agence</span>
            <span className="text-[#0096FF] ml-1.5">Pro</span>
          </h1>
        </div>

        {/* Filet or champagne */}
        <div className="ap-gold-rule mt-3.5 w-14 h-[1.5px] rounded-full bg-gradient-to-r from-transparent via-[#D4A359] to-transparent" />

        {/* Sous-titre */}
        <p className="ap-tagline-in mt-3 text-[11px] font-bold tracking-[0.26em] uppercase text-slate-500">
          Hajj &nbsp;·&nbsp; Voyages &nbsp;·&nbsp; Gestion
        </p>
      </div>

      {/* ── PIED : NOM D'AGENCE + BULLES DE CHARGEMENT VERTICALES (PÈLERIN · AVION · AGENCE) ── */}
      <div className="relative z-10 flex flex-col items-center gap-4 w-full max-w-xs">
        {agencyName && (
          <p className="ap-tagline-in text-[11px] font-extrabold tracking-[0.14em] uppercase text-[#07276E] truncate max-w-full">
            {agencyName}
          </p>
        )}

        {/* 3 bulles miniatures en vague verticale fluide */}
        <div className="flex items-center justify-center gap-4 pt-2" aria-hidden="true">
          {/* Bulle 1 : Pèlerin / Kaaba */}
          <div className="ap-bubble-1 w-10 h-10 rounded-full bg-[#FFFBF2] border border-[#D4A359]/45 shadow-[0_8px_20px_-6px_rgba(212,163,89,0.45)] flex items-center justify-center text-[#B8832D]">
            <svg
              width="17"
              height="17"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.9"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M4 9.5L12 5l8 4.5v8.5L12 22l-8-4v-8.5z" />
              <path d="M4 9.5L12 14l8-4.5" />
              <path d="M12 14v8" />
              <path d="M7.5 11.4l4.5 2.6 4.5-2.6" stroke="#D4A359" strokeWidth="1.6" />
            </svg>
          </div>

          {/* Bulle 2 : Avion / Vol */}
          <div className="ap-bubble-2 w-10 h-10 rounded-full bg-[#F0F9FF] border border-[#0096FF]/35 shadow-[0_8px_20px_-6px_rgba(0,150,255,0.4)] flex items-center justify-center text-[#0088EE]">
            <Plane size={16} strokeWidth={2.1} />
          </div>

          {/* Bulle 3 : Agence de voyage */}
          <div className="ap-bubble-3 w-10 h-10 rounded-full bg-[#EFF4FF] border border-[#07276E]/25 shadow-[0_8px_20px_-6px_rgba(7,39,110,0.35)] flex items-center justify-center text-[#07276E]">
            <Building2 size={16} strokeWidth={2.1} />
          </div>
        </div>

        {statusText && (
          <p className="text-[10px] font-semibold tracking-wider text-slate-400">
            {statusText}
          </p>
        )}
      </div>
    </main>
  )
}
