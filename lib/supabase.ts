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

export function getUser() {
  if (!supabaseUserPromise) {
    supabaseUserPromise = supabase.auth.getUser().finally(() => {
      supabaseUserPromise = null
    }) as Promise<any>
  }
  return supabaseUserPromise
}