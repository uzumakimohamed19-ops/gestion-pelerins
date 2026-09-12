'use client'

import React from 'react'

interface HeaderProps {
  title: string
  subtitle?: string
  bgColor?: string // Ex: bg-blue-600
  textColor?: string
  rightAction?: React.ReactNode
}

export default function Header({ 
  title, 
  subtitle, 
  bgColor = "bg-blue-600",
  textColor = "text-white",
  rightAction
}: HeaderProps) {
  return (
    /* 1. Le conteneur principal reste sticky pour le défilement */
    <header className={`w-full ${textColor} shadow-sm sticky top-0 z-50 pt-[env(safe-area-inset-top,0px)]`}>
      
      {/* 2. LE TRUC MAGIQUE : Un bloc positionné de force au sommet absolu de l'écran.
          Il prend la couleur de fond dynamique et monte derrière la Dynamic Island quoi qu'il arrive. */}
      <div className={`absolute inset-x-0 -top-20 bottom-0 ${bgColor} -z-10`} />

      {/* 3. Conteneur interne pour tes textes et boutons (Totalement protégés de la Dynamic Island) */}
      <div className="flex items-center justify-between h-16 px-4 max-w-7xl mx-auto relative z-10">
        
        {/* Partie gauche : Titres */}
        <div className="flex flex-col justify-center">
          <h1 className="text-base font-black tracking-tight leading-tight">
            {title}
          </h1>
          {subtitle && (
            <p className="text-[11px] mt-0.5 font-medium opacity-85 leading-none">
              {subtitle}
            </p>
          )}
        </div>

        {/* Partie droite : Actions / Badge */}
        <div className="flex items-center gap-2">
          {rightAction ? rightAction : (
            <div className="w-8 h-8 rounded-full bg-black/10 border border-white/10 flex items-center justify-center font-bold text-xs shadow-inner">
              MZ
            </div>
          )}
        </div>

      </div>
    </header>
  )
}