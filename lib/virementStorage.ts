import { supabase } from '@/lib/supabase'

// Réutilise le bucket public déjà configuré dans Supabase ('passeports') sous un sous-dossier dédié `virements/`
const RECEIPT_BUCKET = 'passeports'

export function getVirementReceiptPublicUrl(pathOrUrl?: string | null): string | null {
  if (!pathOrUrl) return null
  if (
    pathOrUrl.startsWith('http://') ||
    pathOrUrl.startsWith('https://') ||
    pathOrUrl.startsWith('data:')
  ) {
    return pathOrUrl
  }
  return supabase.storage.from(RECEIPT_BUCKET).getPublicUrl(pathOrUrl).data.publicUrl || null
}

export function isPdfReceipt(pathOrUrl?: string | null): boolean {
  if (!pathOrUrl) return false
  return pathOrUrl.toLowerCase().split('?')[0].endsWith('.pdf')
}

async function compressReceiptImage(file: File): Promise<File> {
  if (!file.type.startsWith('image/') || file.type === 'image/gif') return file
  return new Promise((resolve) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      const img = new window.Image()
      img.onload = () => {
        const MAX_DIM = 1600
        const scale = Math.min(1, MAX_DIM / Math.max(img.width, img.height))
        const width = Math.round(img.width * scale)
        const height = Math.round(img.height * scale)

        const canvas = document.createElement('canvas')
        canvas.width = width
        canvas.height = height
        const ctx = canvas.getContext('2d')
        if (!ctx) {
          resolve(file)
          return
        }
        ctx.fillStyle = '#FFFFFF'
        ctx.fillRect(0, 0, width, height)
        ctx.drawImage(img, 0, 0, width, height)

        canvas.toBlob(
          (blob) => {
            if (!blob) {
              resolve(file)
              return
            }
            const baseName = file.name.replace(/\.[^.]+$/, '') || 'recu_virement'
            resolve(new File([blob], `${baseName}.jpg`, { type: 'image/jpeg' }))
          },
          'image/jpeg',
          0.84
        )
      }
      img.onerror = () => resolve(file)
      img.src = String(e.target?.result || '')
    }
    reader.onerror = () => resolve(file)
    reader.readAsDataURL(file)
  })
}

export async function uploadVirementReceipt(file: File): Promise<{
  path: string
  publicUrl: string | null
}> {
  const prepared = await compressReceiptImage(file)
  const safeName = prepared.name.replace(/[^a-zA-Z0-9._-]/g, '_')
  const ext = safeName.includes('.') ? safeName.split('.').pop()?.toLowerCase() : 'jpg'
  const filePath = `virements/${Date.now()}-${Math.random().toString(36).slice(2, 9)}.${ext || 'jpg'}`

  const { data, error } = await supabase.storage
    .from(RECEIPT_BUCKET)
    .upload(filePath, prepared, {
      cacheControl: '3600',
      upsert: false,
      contentType: prepared.type || undefined,
    })

  if (error) throw error

  const storedPath = data?.path || filePath
  return {
    path: storedPath,
    publicUrl: getVirementReceiptPublicUrl(storedPath),
  }
}
