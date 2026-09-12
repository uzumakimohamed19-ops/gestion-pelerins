import { createClient } from '@supabase/supabase-js'

// On récupère les clés du fichier .env.local
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

// Petite vérification de sécurité pour éviter l'erreur "undefined"
if (!supabaseUrl || !supabaseAnonKey) {
  console.error("Attention : Les clés Supabase ne sont pas configurées dans .env.local")
}

// On exporte la constante pour qu'elle soit visible ailleurs
export const supabase = createClient(
  supabaseUrl || '', 
  supabaseAnonKey || ''
)

let supabaseUserPromise: Promise<any> | null = null

/**
 * Vérifie le token en ligne, mais conserve la session locale si le réseau est
 * indisponible. Une panne réseau ne doit pas être interprétée comme SIGNED_OUT.
 */
export function getUser() {
  if (!supabaseUserPromise) {
    supabaseUserPromise = (async () => {
      try {
        const result = await supabase.auth.getUser()
        if (result.data?.user || !result.error) return result

        const { data: sessionData } = await supabase.auth.getSession()
        if (sessionData.session?.user) {
          return { data: { user: sessionData.session.user }, error: null }
        }

        return result
      } catch (error) {
        try {
          const { data: sessionData } = await supabase.auth.getSession()
          if (sessionData.session?.user) {
            return { data: { user: sessionData.session.user }, error: null }
          }
        } catch {
          // Les deux vérifications sont indisponibles: conserver l'état local inchangé.
        }

        return { data: { user: null }, error }
      }
    })().finally(() => {
      supabaseUserPromise = null
    })
  }
  return supabaseUserPromise
}