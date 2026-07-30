'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import { Lock, Mail, Loader2, AlertCircle, ShieldCheck, CheckSquare, Square } from 'lucide-react'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [rememberMe, setRememberMe] = useState(true)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const router = useRouter()

  // 1. Charger les identifiants sauvegardés si présents + Check de session
  useEffect(() => {
    // Pré-remplissage depuis le LocalStorage
    const savedEmail = localStorage.getItem('remembered_email')
    const savedPassword = localStorage.getItem('remembered_password')

    if (savedEmail) setEmail(savedEmail)
    if (savedPassword) setPassword(savedPassword)

    // Vérification de la session active Supabase
    async function checkSession() {
      const { data: { session } } = await supabase.auth.getSession()
      if (session) {
        console.log("Session active détectée, redirection vers l'accueil...")
        router.replace('/')
      }
    }
    checkSession()
  }, [router])

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    
    console.log("--- Début tentative de connexion ---")

    try {
      // GESTION DU MEMORISATION DES IDENTIFIANTS
      if (rememberMe) {
        localStorage.setItem('remembered_email', email)
        localStorage.setItem('remembered_password', password)
      } else {
        localStorage.removeItem('remembered_email')
        localStorage.removeItem('remembered_password')
      }

      // ÉTAPE A : Authentification Supabase
      const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
        email,
        password,
      })

      if (authError) {
        console.error("Erreur Auth Supabase:", authError.message)
        throw authError
      }

      if (!authData.user) {
        throw new Error('Utilisateur non trouvé après authentification.')
      }

      console.log("✅ Authentification réussie. User ID:", authData.user.id)

      // ÉTAPE B : Vérification du profil dans ta table 'profiles'
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('role, agence_id')
        .eq('id', authData.user.id)
        .single()

      if (profileError) {
        console.error("❌ Erreur Profil (Table 'profiles') :", profileError.message)
        await supabase.auth.signOut()
        throw new Error("Votre compte n'existe pas dans la base de données des profils ou n'est pas activé.")
      }

      if (!profile) {
        console.error("❌ Aucun profil retourné pour cet ID.")
        await supabase.auth.signOut()
        throw new Error("Profil introuvable.")
      }

      console.log("✅ Profil trouvé (Role:", profile.role, "). Tentative de redirection...")

      // ÉTAPE C : Redirection forcée
      window.location.assign('/')

    } catch (err) {
      console.error("--- Échec de la connexion ---")
      const message = err instanceof Error ? err.message : 'Erreur inconnue';
      setError(message === 'Invalid login credentials'
        ? 'Email ou mot de passe incorrect'
        : message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6 font-sans w-full relative">
      
      {/* 🧬 INJECTION CSS LOCALISÉE 
          Annule l'espace (padding-left et margin-left) imposé par le layout parent, 
          uniquement pour la page de connexion sur ordinateur (écrans md et lg). */}
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

      <div className="max-w-md w-full bg-white rounded-[2.5rem] shadow-2xl p-10 border border-gray-100 relative z-10">
        <div className="text-center mb-10">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-blue-600 rounded-2xl mb-4 shadow-lg shadow-blue-100">
            <ShieldCheck className="text-white" size={32} />
          </div>
          <h1 className="text-3xl font-black text-gray-900 uppercase tracking-tighter">Connexion</h1>
          <p className="text-gray-400 font-bold text-xs uppercase tracking-widest mt-2 italic">Accès Plateforme TravelOS</p>
        </div>

        <form onSubmit={handleLogin} className="space-y-6">
          <div className="space-y-2">
            <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-4">Email Professionnel</label>
            <div className="relative">
              <Mail className="absolute left-5 top-1/2 -translate-y-1/2 text-gray-300" size={20} />
              <input 
                type="email" 
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full pl-14 pr-6 py-4 bg-gray-50 border-none rounded-2xl font-bold text-gray-700 focus:ring-4 focus:ring-blue-100 transition-all outline-none"
                placeholder="nom@agence.com"
                required
              />
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-4">Mot de passe</label>
            <div className="relative">
              <Lock className="absolute left-5 top-1/2 -translate-y-1/2 text-gray-300" size={20} />
              <input 
                type="password" 
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full pl-14 pr-6 py-4 bg-gray-50 border-none rounded-2xl font-bold text-gray-700 focus:ring-4 focus:ring-blue-100 transition-all outline-none"
                placeholder="••••••••"
                required
              />
            </div>
          </div>

          {/* Option Se Souvenir de Moi */}
          <div 
            onClick={() => setRememberMe(!rememberMe)}
            className="flex items-center gap-3 cursor-pointer select-none px-2 py-1 hover:opacity-80 transition-opacity"
          >
            {rememberMe ? (
              <CheckSquare className="text-blue-600" size={20} />
            ) : (
              <Square className="text-gray-300" size={20} />
            )}
            <span className="text-xs font-bold text-gray-600 tracking-wide">
              Mémoriser mes identifiants
            </span>
          </div>

          {error && (
            <div className="p-4 bg-red-50 rounded-2xl flex items-center gap-3 text-red-600 font-bold text-sm border border-red-100">
              <AlertCircle size={18} />
              <span className="flex-1">{error}</span>
            </div>
          )}

          <button 
            type="submit"
            disabled={loading}
            className="w-full py-5 bg-gray-900 text-white rounded-2xl font-black uppercase tracking-widest hover:bg-blue-600 transition-all shadow-xl shadow-blue-100 flex items-center justify-center gap-3 disabled:opacity-50 active:scale-95"
          >
            {loading ? (
              <>
                <Loader2 className="animate-spin" size={20} />
                Vérification...
              </>
            ) : (
              "Se connecter"
            )}
          </button>
        </form>

        <div className="mt-10 pt-6 border-t border-gray-50 flex justify-center items-center gap-2">
            <div className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse" />
            <p className="text-gray-400 text-[10px] font-bold uppercase tracking-widest">
              Système de connexion sécurisé par Supabase Auth
            </p>
        </div>
      </div>
    </div>
  )
}