'use client'

import React, { createContext, useContext, useEffect, useState } from 'react'

export type ThemeMode = 'light' | 'dark'

type UIContextType = {
  hideNavbar: boolean
  setHideNavbar: (v: boolean) => void
  theme: ThemeMode
  setTheme: (theme: ThemeMode) => void
  toggleTheme: () => void
}

const UIContext = createContext<UIContextType | undefined>(undefined)

export function UIProvider({ children }: { children: React.ReactNode }) {
  const [hideNavbar, setHideNavbar] = useState<boolean>(false)
  const [theme, setTheme] = useState<ThemeMode>(() => {
    if (typeof window === 'undefined') return 'light'
    return localStorage.getItem('app-theme') === 'dark' ? 'dark' : 'light'
  })

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark')
    document.documentElement.dataset.theme = theme
    localStorage.setItem('app-theme', theme)
  }, [theme])

  return (
    <UIContext.Provider value={{ hideNavbar, setHideNavbar, theme, setTheme, toggleTheme: () => setTheme((current) => current === 'light' ? 'dark' : 'light') }}>
      {children}
    </UIContext.Provider>
  )
}

export function useUI() {
  const ctx = useContext(UIContext)
  if (!ctx) {
    return {
      hideNavbar: false,
      setHideNavbar: (_: boolean) => {},
      theme: 'light',
      setTheme: (_: ThemeMode) => {},
      toggleTheme: () => {},
    }
  }
  return ctx
}
