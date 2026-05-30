'use client'
import { useEffect, useState } from 'react'
import { Download, X, Smartphone } from 'lucide-react'

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

export default function PwaInstaller() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null)
  const [showPopUp, setShowPopUp] = useState(false)

  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js', { scope: '/' })
    }

    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault()
      setDeferredPrompt(e as BeforeInstallPromptEvent)
      
      // On tente d'afficher le pop-up après 3 secondes
      setTimeout(() => {
        setShowPopUp(true)
      }, 3000)
    }

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
    window.addEventListener('appinstalled', () => {
      setDeferredPrompt(null)
      setShowPopUp(false)
    })

    return () => window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
  }, [])

  const handleInstallClick = async () => {
    if (!deferredPrompt) return
    await deferredPrompt.prompt()
    const { outcome } = await deferredPrompt.userChoice
    if (outcome === 'accepted') setDeferredPrompt(null)
    setShowPopUp(false)
  }

  return (
    <>
      {/* 1. Le Pop-up automatique (s'il est autorisé par le navigateur) */}
      {showPopUp && (
        <div className="fixed bottom-4 left-4 right-4 sm:left-auto sm:right-6 sm:max-w-md z-[9999] animate-in slide-in-from-bottom duration-300">
          <div className="bg-slate-900 text-white rounded-2xl p-4 shadow-2xl border border-slate-800 flex items-start gap-4 relative">
            <div className="p-3 bg-slate-800 rounded-xl shrink-0 text-indigo-400 border border-slate-700">
              <Smartphone size={24} />
            </div>
            <div className="flex-1 min-w-0 pr-4">
              <h3 className="text-sm font-bold tracking-tight">Installer l'application</h3>
              <p className="text-xs text-slate-400 mt-1">Ajoutez TravelOS sur votre écran d'accueil pour y accéder en un clic.</p>
              <div className="flex gap-2 mt-3">
                <button onClick={handleInstallClick} className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold rounded-lg transition-all flex items-center gap-1.5">
                  <Download size={14} /> Installer
                </button>
                <button onClick={() => setShowPopUp(false)} className="px-3 py-2 bg-slate-800 text-slate-300 text-xs font-medium rounded-lg">Plus tard</button>
              </div>
            </div>
            <button onClick={() => setShowPopUp(false)} className="absolute top-3 right-3 p-1 text-slate-500 hover:text-slate-300"><X size={14} /></button>
          </div>
        </div>
      )}

      {/* 2. Un bouton discret permanent (uniquement si l'application est prête à être installée) */}
      {deferredPrompt && !showPopUp && (
        <div className="fixed bottom-4 right-4 z-[9999] hidden sm:block">
          <button 
            onClick={handleInstallClick}
            className="flex items-center gap-2 bg-slate-950 hover:bg-slate-900 text-white text-xs font-bold px-4 py-3 rounded-xl shadow-xl border border-slate-800 transition-all active:scale-95"
          >
            <Download size={14} className="text-indigo-400" />
            Installer l'application
          </button>
        </div>
      )}
    </>
  )
}