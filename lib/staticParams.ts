import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

const supabase = supabaseUrl && supabaseAnonKey
  ? createClient(supabaseUrl, supabaseAnonKey)
  : null

export async function getAgenceStaticParams() {
  if (!supabase) return [{ id: 'placeholder' }]

  const { data } = await supabase.from('agences').select('id')
  const params = (data ?? []).map(({ id }) => ({ id: String(id) }))
  return params.length > 0 ? params : [{ id: 'placeholder' }]
}

export async function getPelerinStaticParams() {
  if (!supabase) return [{ id: 'placeholder' }]

  const { data } = await supabase.from('pelerins').select('id')
  const params = (data ?? []).map(({ id }) => ({ id: String(id) }))
  return params.length > 0 ? params : [{ id: 'placeholder' }]
}

export async function getAgencePelerinStaticParams() {
  if (!supabase) return [{ id: 'placeholder', pelerinId: 'placeholder' }]

  const { data } = await supabase.from('pelerins').select('id, agence_id')
  const params = (data ?? [])
    .filter(({ id, agence_id }) => id != null && agence_id != null)
    .map(({ id, agence_id }) => ({
      id: String(agence_id),
      pelerinId: String(id),
    }))
  return params.length > 0 ? params : [{ id: 'placeholder', pelerinId: 'placeholder' }]
}