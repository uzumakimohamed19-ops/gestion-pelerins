import { supabase } from './supabase'

const PASSPORT_BUCKET = 'passeports'

export function getPassportStorageValue(documentUrl?: string | null, fallbackUrl?: string | null) {
  const value = documentUrl || fallbackUrl || ''
  if (!value) return null

  if (value.startsWith('http://') || value.startsWith('https://') || value.startsWith('data:')) {
    return value
  }

  return value
}

export function getPassportPublicUrl(documentUrl?: string | null, fallbackUrl?: string | null) {
  const value = getPassportStorageValue(documentUrl, fallbackUrl)
  if (!value) return null

  if (value.startsWith('http://') || value.startsWith('https://') || value.startsWith('data:')) {
    return value
  }

  return supabase.storage.from(PASSPORT_BUCKET).getPublicUrl(value).data.publicUrl || null
}

export async function uploadPassportFile(file: File) {
  const safeName = file.name.replace(/\s+/g, '_')
  const extension = safeName.includes('.') ? safeName.split('.').pop() : 'bin'
  const fileName = `${Date.now()}-${Math.random().toString(36).slice(2)}.${extension}`

  const { data, error } = await supabase.storage.from(PASSPORT_BUCKET).upload(fileName, file, {
    cacheControl: '3600',
    upsert: false,
  })

  if (error) throw error

  const storedPath = data?.path || fileName

  return {
    path: storedPath,
    publicUrl: getPassportPublicUrl(storedPath),
  }
}
