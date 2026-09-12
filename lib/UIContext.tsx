'use client'

import React, { createContext, useContext, useState } from 'react'

type UIContextType = {
  hideNavbar: boolean
  setHideNavbar: (v: boolean) => void
}

const UIContext = createContext<UIContextType | undefined>(undefined)

export function UIProvider({ children }: { children: React.ReactNode }) {
  const [hideNavbar, setHideNavbar] = useState<boolean>(false)
  return (
    <UIContext.Provider value={{ hideNavbar, setHideNavbar }}>
      {children}
    </UIContext.Provider>
  )
}

export function useUI() {
  const ctx = useContext(UIContext)
  if (!ctx) {
    return {
      hideNavbar: false,
      setHideNavbar: (_: boolean) => {}
    }
  }
  return ctx
}
