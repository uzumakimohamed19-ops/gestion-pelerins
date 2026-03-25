'use client'
import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import { Lock, Mail, Loader2, AlertCircle } from 'lucide-react'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const router = useRouter()

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')

    try {
      // 1. Connexion à Auth
      const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
        email,
        password,
      })

      if (authError) throw authError

      // 2. Vérification immédiate du Profil (pour l'agence)
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('role, agence_id')
        .eq('id', authData.user.id)
        .single()

      if (profileError || !profile) {
        // Si l'utilisateur existe dans Auth mais n'a pas de profil créé dans la table profiles
        await supabase.auth.signOut()
        throw new Error("Votre compte n'est pas encore activé par l'administrateur.")
      }

      // 3. Redirection si tout est OK
      router.push('/') // Remplace par ta page d'accueil
      router.refresh()

    } catch (err: any) {
      setError(err.message === 'Invalid login credentials' 
        ? 'Email ou mot de passe incorrect' 
        : err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
      <div className="max-w-md w-full bg-white rounded-[2.5rem] shadow-2xl p-10 border border-gray-100">
        <div className="text-center mb-10">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-blue-600 rounded-2xl mb-4 shadow-lg shadow-blue-100">
            <Lock className="text-white" size={32} />
          </div>
          <h1 className="text-3xl font-black text-gray-900 uppercase tracking-tighter">Connexion</h1>
          <p className="text-gray-400 font-bold text-xs uppercase tracking-widest mt-2 italic">Accès Plateforme Hajj</p>
        </div>

        <form onSubmit={handleLogin} className="space-y-6">
          <div className="space-y-2">
            <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-4">Email Professionnel</label>
            <div className="relative">
              <Mail className="absolute left-5 top-4.5 text-gray-300" size={20} />
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
              <Lock className="absolute left-5 top-4.5 text-gray-300" size={20} />
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

          {error && (
            <div className="p-4 bg-red-50 rounded-2xl flex items-center gap-3 text-red-600 font-bold text-sm">
              <AlertCircle size={18} />
              {error}
            </div>
          )}

          <button 
            type="submit"
            disabled={loading}
            className="w-full py-5 bg-gray-900 text-white rounded-2xl font-black uppercase tracking-widest hover:bg-blue-600 transition-all shadow-xl shadow-blue-100 flex items-center justify-center gap-3 disabled:opacity-50"
          >
            {loading ? <Loader2 className="animate-spin" /> : "Se connecter"}
          </button>
        </form>

        <p className="text-center mt-8 text-gray-400 text-[10px] font-bold uppercase tracking-widest">
          MK tech co ldt 2026
        </p>
      </div>
    </div>
  )
}