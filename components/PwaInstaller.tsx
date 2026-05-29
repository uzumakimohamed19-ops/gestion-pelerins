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
    // 1. Enregistrer le Service Worker
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js')
        .then(() => console.log('Service Worker installé avec succès.'))
        .catch(err => console.error('Erreur d’enregistrement du SW:', err))
    }

    // 2. Capter l'événement d'installation de Chrome
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault() // Empêche la bannière native moche de s'ouvrir
      setDeferredPrompt(e as BeforeInstallPromptEvent)
      
      // Optionnel : On attend 2 secondes après l'ouverture pour afficher le pop-up gentiment
      setTimeout(() => {
        setShowPopUp(true)
      }, 2000)
    }

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt)

    // Si l'app est déjà installée, on n'affiche rien
    window.addEventListener('appinstalled', () => {
      setDeferredPrompt(null)
      setShowPopUp(false)
    })

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
    }
  }, [])

  const handleInstallClick = async () => {
    if (!deferredPrompt) return
    
    // Déclenche le pop-up officiel du navigateur
    await deferredPrompt.prompt()
    
    // Attend le choix de l'utilisateur
    const { outcome } = await deferredPrompt.userChoice
    if (outcome === 'accepted') {
      console.log('L’utilisateur a installé l’application.')
    }
    
    setDeferredPrompt(null)
    setShowPopUp(false)
  }

  if (!showPopUp) return null

  return (
    <div className="fixed bottom-4 left-4 right-4 sm:left-auto sm:right-6 sm:max-w-md z-[9999] animate-in slide-in-from-bottom duration-300">
      <div className="bg-slate-900 text-white rounded-2xl p-4 shadow-2xl border border-slate-800 flex items-start gap-4 relative overflow-hidden">
        
        {/* Icône d'illustration */}
        <div className="p-3 bg-slate-800 rounded-xl shrink-0 text-indigo-400 border border-slate-700">
          <Smartphone size={24} />
        </div>

        {/* Contenu textuel */}
        <div className="flex-1 min-w-0 pr-4">
          <h3 className="text-sm font-bold tracking-tight">Installer l&apos;application</h3>
          <p className="text-xs text-slate-400 mt-1 leading-relaxed">
            Ajoutez cette plateforme sur votre écran d&apos;accueil pour y accéder en un clic, comme une application native.
          </p>
          
          <div className="flex gap-2 mt-3">
            <button
              onClick={handleInstallClick}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold rounded-lg transition-all flex items-center gap-1.5 shadow-md shadow-indigo-950/50 active:scale-95"
            >
              <Download size={14} /> Installer
            </button>
            <button
              onClick={() => setShowPopUp(false)}
              className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium rounded-lg transition-colors"
            >
              Plus tard
            </button>
          </div>
        </div>

        {/* Bouton de fermeture d'angle */}
        <button 
          onClick={() => setShowPopUp(false)}
          className="absolute top-3 right-3 p-1 rounded-md text-slate-500 hover:text-slate-300 transition-colors"
        >
          <X size={14} />
        </button>
      </div>
    </div>
  )
}