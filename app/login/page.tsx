'use client'

import { useEffect, useState } from 'react'
import { supabase, getSession } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import { Lock, Mail, Loader2, AlertCircle, ShieldCheck, CheckSquare, Square } from 'lucide-react'

// Fonction utilitaire pour éviter qu'une promesse Supabase ne freeze indéfiniment
function withTimeout<T>(promise: Promise<T>, ms = 10000, errorMsg = 'Le serveur met trop de temps à répondre.'): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) => setTimeout(() => reject(new Error(errorMsg)), ms)),
  ])
}

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [rememberMe, setRememberMe] = useState(true)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const router = useRouter()

  // 1. Pré-remplissage et auto-redirection propre si session déjà active
  useEffect(() => {
    const savedEmail = localStorage.getItem('remembered_email')
    const savedPassword = localStorage.getItem('remembered_password')

    if (savedEmail) setEmail(savedEmail)
    if (savedPassword) setPassword(savedPassword)

    async function checkExistingSession() {
      try {
        const { data: { session } } = await getSession()
        if (session?.user) {
          router.replace('/profile-selection')
        }
      } catch (err) {
        console.warn('[LoginPage] Impossible de vérifier la session:', err)
      }
    }

    void checkExistingSession()
  }, [router])

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    if (loading) return

    setLoading(true)
    setError('')

    try {
      // Mémorisation des identifiants
      if (rememberMe) {
        localStorage.setItem('remembered_email', email)
        localStorage.setItem('remembered_password', password)
      } else {
        localStorage.removeItem('remembered_email')
        localStorage.removeItem('remembered_password')
      }

      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        throw new Error('Connexion Internet requise pour vous connecter.')
      }

      // ÉTAPE A : Authentification avec Timeout anti-blocage (10s max)
      const authResponse = await withTimeout(
        supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        }),
        10000,
        'Délai de connexion dépassé. Vérifiez votre accès internet.'
      )

      if (authResponse.error) {
        throw authResponse.error
      }

      const user = authResponse.data?.user
      if (!user) {
        throw new Error('Utilisateur non identifié.')
      }

      // ÉTAPE B : Vérification du profil dans 'profiles' avec Timeout (8s max)
      const profilePromise = (async () => {
        const { data, error } = await supabase
          .from('profiles')
          .select('role, agence_id')
          .eq('id', user.id)
          .single()
        return { data, error }
      })()

      const { data: profile, error: profileError } = await withTimeout(
        profilePromise,
        8000,
        'Impossible de charger votre profil agence.'
      )

      if (profileError || !profile) {
        await supabase.auth.signOut()
        throw new Error("Votre compte n'est lié à aucune agence active.")
      }

      // ÉTAPE C : Redirection fluide Next.js sans crash de rechargement brutal
      router.replace('/profile-selection')

    } catch (err: unknown) {
      console.error('[LoginPage] Échec connexion:', err)
      const rawMessage = err instanceof Error ? err.message : 'Erreur inconnue'
      
      if (rawMessage.includes('Invalid login credentials')) {
        setError('Email ou mot de passe incorrect.')
      } else {
        setError(rawMessage)
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="login-page min-h-screen bg-[#F4F6F8] flex items-center justify-center p-6 font-sans w-full relative">
      <div className="max-w-md w-full bg-white rounded-[2.5rem] shadow-xl p-8 sm:p-10 border border-slate-100 relative z-10">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-blue-600 rounded-2xl mb-4 shadow-lg shadow-blue-600/20">
            <ShieldCheck className="text-white" size={32} />
          </div>
          <h1 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">Connexion</h1>
          <p className="text-slate-400 font-bold text-xs uppercase tracking-widest mt-1">
            Espace Agence Sécurisé
          </p>
        </div>

        <form onSubmit={handleLogin} className="space-y-5">
          <div className="space-y-1.5">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider ml-2">
              Email Professionnel
            </label>
            <div className="relative">
              <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
              <input
                type="email"
                name="email"
                autoComplete="username"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full pl-12 pr-4 py-3.5 bg-slate-50 border border-slate-200/80 rounded-2xl font-bold text-slate-800 text-sm focus:bg-white focus:border-blue-600 focus:ring-4 focus:ring-blue-100 transition-all outline-none"
                placeholder="nom@agence.com"
                required
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider ml-2">
              Mot de passe
            </label>
            <div className="relative">
              <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
              <input
                type="password"
                name="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full pl-12 pr-4 py-3.5 bg-slate-50 border border-slate-200/80 rounded-2xl font-bold text-slate-800 text-sm focus:bg-white focus:border-blue-600 focus:ring-4 focus:ring-blue-100 transition-all outline-none"
                placeholder="••••••••"
                required
              />
            </div>
          </div>

          <div
            onClick={() => setRememberMe(!rememberMe)}
            className="flex items-center gap-2.5 cursor-pointer select-none px-1 py-1"
          >
            {rememberMe ? (
              <CheckSquare className="text-blue-600 shrink-0" size={18} />
            ) : (
              <Square className="text-slate-300 shrink-0" size={18} />
            )}
            <span className="text-xs font-bold text-slate-600">
              Mémoriser mes identifiants
            </span>
          </div>

          {error && (
            <div className="p-4 bg-rose-50 rounded-2xl flex items-center gap-2.5 text-rose-600 font-bold text-xs border border-rose-200/60 animate-in fade-in">
              <AlertCircle size={16} className="shrink-0" />
              <span className="flex-1">{error}</span>
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-4 bg-blue-600 hover:bg-blue-700 text-white rounded-2xl font-black text-xs uppercase tracking-wider transition-all shadow-lg shadow-blue-600/25 flex items-center justify-center gap-2 disabled:opacity-50 active:scale-98"
          >
            {loading ? (
              <>
                <Loader2 className="animate-spin" size={18} />
                <span>Connexion en cours...</span>
              </>
            ) : (
              <span>Se connecter</span>
            )}
          </button>
        </form>

        <div className="mt-8 pt-5 border-t border-slate-100 flex justify-center items-center gap-2">
          <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse" />
          <p className="text-slate-400 text-[10px] font-bold uppercase tracking-wider">
            Système sécurisé Supabase Auth & PowerSync
          </p>
        </div>
      </div>
    </div>
  )
}