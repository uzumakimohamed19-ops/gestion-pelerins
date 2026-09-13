import { parse as parseMRZ } from 'mrz'

export interface ParsedMRZResult {
  nom: string
  prenom: string
  numPasseport: string
  dateNaissance: string
  dateExpiration: string
  sexe: 'HOMME' | 'FEMME' | ''
}

// Nettoyage des confusions courantes sur les champs numériques
const sanitizeNumeric = (val: string): string => {
  return val
    .replace(/[ODQ]/g, '0')
    .replace(/[ILJ]/g, '1')
    .replace(/Z/g, '2')
    .replace(/S/g, '5')
    .replace(/B/g, '8')
}

// Conversion YYMMDD -> YYYY-MM-DD
export const formatMrzDate = (rawDate: string | null | undefined, isExpiry = false): string => {
  if (!rawDate || rawDate.length < 6) return ''
  const cleaned = sanitizeNumeric(rawDate)
  const yy = parseInt(cleaned.substring(0, 2), 10)
  const mm = cleaned.substring(2, 4)
  const dd = cleaned.substring(4, 6)
  const century = isExpiry ? '20' : yy > 30 ? '19' : '20'
  return `${century}${yy}-${mm}-${dd}`
}

export async function scanPassportMRZ(imageSrc: string): Promise<ParsedMRZResult> {
  // Import dynamique côté client pour éviter les erreurs SSR Next.js
  const mrzScannerModule = await import('mrz-scanner')
  const scan = mrzScannerModule.default || mrzScannerModule

  // Analyse complète de l'image (détection de la bande + lecture OCR-B)
  const result = await scan(imageSrc)

  if (!result || !result.lines) {
    throw new Error('Aucune zone MRZ détectée sur cette image.')
  }

  const rawLines: string[] = Array.isArray(result.lines)
    ? result.lines
    : String(result.lines).split('\n').filter(Boolean)

  if (rawLines.length < 2) {
    throw new Error('Le document ne contient pas les deux lignes standard MRZ.')
  }

  // Normalisation des chevrons et de la longueur TD3 (44 caractères)
  let l1 = rawLines[rawLines.length - 2]
    .toUpperCase()
    .replace(/\s+/g, '')
    .replace(/[([{«]/g, '<')
    .replace(/[)\]}»]/g, '<')
    .replace(/[^A-Z0-9<]/g, '<')

  let l2 = rawLines[rawLines.length - 1]
    .toUpperCase()
    .replace(/\s+/g, '')
    .replace(/[([{«]/g, '<')
    .replace(/[)\]}»]/g, '<')
    .replace(/[^A-Z0-9<]/g, '<')

  while (l1.length < 44) l1 += '<'
  while (l2.length < 44) l2 += '<'
  l1 = l1.substring(0, 44)
  l2 = l2.substring(0, 44)

  // Décodage standard ICAO
  try {
    const parsed = parseMRZ([l1, l2])
    const f = parsed.fields

    return {
      nom: f.lastName ? f.lastName.trim() : '',
      prenom: f.firstName ? f.firstName.trim() : '',
      numPasseport: f.documentNumber ? f.documentNumber.replace(/</g, '').trim() : '',
      dateNaissance: formatMrzDate(f.birthDate, false),
      dateExpiration: formatMrzDate(f.expirationDate, true),
      sexe: f.sex === 'male' || f.sex === 'M' ? 'HOMME' : f.sex === 'female' || f.sex === 'F' ? 'FEMME' : '',
    }
  } catch {
    // Décodage de secours si un caractère de checksum est imparfait
    let nom = ''
    let prenom = ''
    const chevronPos = l1.indexOf('<<')
    if (chevronPos !== -1) {
      const before = l1.substring(0, chevronPos)
      nom = before.length > 5 ? before.substring(5).replace(/</g, ' ').trim() : before.trim()
      prenom = l1.substring(chevronPos + 2).split('<')[0].replace(/</g, ' ').trim()
    }

    const numPasseport = l2.substring(0, 9).replace(/</g, '').trim()
    const dobRaw = l2.substring(13, 19)
    const sexChar = l2.substring(20, 21)
    const expRaw = l2.substring(21, 27)

    return {
      nom,
      prenom,
      numPasseport,
      dateNaissance: formatMrzDate(dobRaw, false),
      dateExpiration: formatMrzDate(expRaw, true),
      sexe: sexChar === 'M' ? 'HOMME' : sexChar === 'F' ? 'FEMME' : '',
    }
  }
}