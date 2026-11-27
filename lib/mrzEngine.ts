import { parse as parseStrictMRZ } from 'mrz'

export type MrzFieldKey =
  | 'nom'
  | 'prenom'
  | 'passeport'
  | 'sexe'
  | 'dateNaissance'
  | 'dateExpiration'

export interface MrzVerification {
  passeport: boolean
  dateNaissance: boolean
  dateExpiration: boolean
  composite: boolean
  nomPrenom: boolean
}

export interface MrzParseResult {
  nom: string
  prenom: string
  numPasseport: string
  sexe: 'HOMME' | 'FEMME' | ''
  dateNaissance: string
  dateExpiration: string
  nationalite: string
  paysEmetteur: string
  verified: MrzVerification
  unverifiedFields: MrzFieldKey[]
  repairedFields: MrzFieldKey[]
  confidenceScore: number
  rawLines?: [string, string]
  source?: string
}

const MRZ_WEIGHTS = [7, 3, 1] as const

function charValue(ch: string): number {
  if (ch === '<') return 0
  const code = ch.charCodeAt(0)
  if (code >= 48 && code <= 57) return code - 48
  if (code >= 65 && code <= 90) return code - 55
  return 0
}

export function computeMrzCheckDigit(field: string): string {
  let sum = 0
  for (let i = 0; i < field.length; i++) {
    sum += charValue(field[i]) * MRZ_WEIGHTS[i % 3]
  }
  return String(sum % 10)
}

export function verifyMrzCheckDigit(field: string, checkChar: string): boolean {
  if (!field) return false
  const normalizedCheck = checkChar === '<' ? '0' : toDigitStrict(checkChar)
  if (!/^\d$/.test(normalizedCheck)) return false
  return computeMrzCheckDigit(field) === normalizedCheck
}

function toDigitStrict(ch: string): string {
  switch (ch.toUpperCase()) {
    case 'O':
    case 'D':
    case 'Q':
    case 'U':
      return '0'
    case 'I':
    case 'L':
    case 'J':
      return '1'
    case 'Z':
      return '2'
    case 'S':
      return '5'
    case 'G':
      return '6'
    case 'B':
      return '8'
    default:
      return ch
  }
}

export function fixDigitsString(val: string): string {
  return val
    .split('')
    .map((c) => toDigitStrict(c))
    .join('')
}

function fixAlphaString(val: string): string {
  return val
    .replace(/0/g, 'O')
    .replace(/1/g, 'I')
    .replace(/2/g, 'Z')
    .replace(/5/g, 'S')
    .replace(/8/g, 'B')
    .replace(/6/g, 'G')
    .replace(/4/g, 'A')
}

/**
 * Restaure les chiffres et chevrons si une douchette USB HID envoie des touches
 * sur un clavier Windows français AZERTY sans Shift/CapsLock actif.
 */
export function normalizeAzertyScannerInput(raw: string): string {
  if (!raw) return ''
  const azertyChars = raw.match(/[&é"'(\-è_çà]/g)
  if (!azertyChars || azertyChars.length < 4) return raw

  const map: Record<string, string> = {
    '&': '1',
    'é': '2',
    '"': '3',
    "'": '4',
    '(': '5',
    '-': '6',
    'è': '7',
    '_': '8',
    'ç': '9',
    'à': '0',
    '>': '<',
  }
  return raw
    .split('')
    .map((ch) => map[ch] ?? ch)
    .join('')
}

export function sanitizeMrzLine(raw: string): string {
  return raw
    .toUpperCase()
    .replace(/[([{«‹›»)\]}]/g, '<')
    .replace(/\s+/g, '')
    .replace(/[^A-Z0-9<]/g, '')
}

function isValidCalendarDate(year: number, month: number, day: number): boolean {
  if (month < 1 || month > 12 || day < 1 || day > 31) return false
  if (year < 1915 || year > 2065) return false
  const maxDay = new Date(year, month, 0).getDate()
  return day <= maxDay
}

export function resolveMrzFullYear(yy: number, isExpiry: boolean): number {
  const nowYear = new Date().getFullYear()
  const currentShort = nowYear % 100
  if (isExpiry) {
    // Un passeport peut être expiré depuis quelques années ou valide jusqu'à +15 ans
    return yy > currentShort + 25 ? 1900 + yy : 2000 + yy
  }
  return yy > currentShort ? 1900 + yy : 2000 + yy
}

export function formatAndValidateMrzDate(
  raw6: string,
  checkChar: string,
  isExpiry: boolean
): { iso: string; verified: boolean; repaired: boolean; clean6: string } {
  if (!raw6 || raw6.length < 6) {
    return { iso: '', verified: false, repaired: false, clean6: '' }
  }

  const base6 = fixDigitsString(raw6.slice(0, 6))
  const hadAlphaFix = base6 !== raw6.slice(0, 6)
  const cleanCheck = toDigitStrict(checkChar || '')

  const buildIso = (sixDigits: string): string | null => {
    if (!/^\d{6}$/.test(sixDigits)) return null
    const yy = parseInt(sixDigits.slice(0, 2), 10)
    const mm = parseInt(sixDigits.slice(2, 4), 10)
    const dd = parseInt(sixDigits.slice(4, 6), 10)
    const fullYear = resolveMrzFullYear(yy, isExpiry)
    if (!isValidCalendarDate(fullYear, mm, dd)) return null
    const yyyyStr = String(fullYear).padStart(4, '0')
    const mmStr = String(mm).padStart(2, '0')
    const ddStr = String(dd).padStart(2, '0')
    return `${yyyyStr}-${mmStr}-${ddStr}`
  }

  const directIso = buildIso(base6)
  if (directIso && /^\d$/.test(cleanCheck) && computeMrzCheckDigit(base6) === cleanCheck) {
    return { iso: directIso, verified: true, repaired: hadAlphaFix, clean6: base6 }
  }

  // Tentative de réparation mathématique par chiffre de contrôle ICAO (confusions OCR classiques)
  if (/^\d$/.test(cleanCheck) && /^\d{6}$/.test(base6)) {
    const digitSwaps: Record<string, string[]> = {
      '0': ['8', '6', '9'],
      '1': ['7', '4'],
      '2': ['7'],
      '3': ['8', '5'],
      '4': ['1', '9'],
      '5': ['6', '8', '3'],
      '6': ['5', '8', '0'],
      '7': ['1', '2'],
      '8': ['0', '6', '3', '5', '9'],
      '9': ['0', '8', '4'],
    }

    const matches: Array<{ six: string; iso: string }> = []
    for (let pos = 0; pos < 6; pos++) {
      const orig = base6[pos]
      const alts = digitSwaps[orig] || []
      for (const alt of alts) {
        const candidate = base6.slice(0, pos) + alt + base6.slice(pos + 1)
        if (computeMrzCheckDigit(candidate) === cleanCheck) {
          const iso = buildIso(candidate)
          if (iso) matches.push({ six: candidate, iso })
        }
      }
    }

    if (matches.length === 1) {
      return {
        iso: matches[0].iso,
        verified: true,
        repaired: true,
        clean6: matches[0].six,
      }
    }
  }

  if (directIso) {
    return { iso: directIso, verified: false, repaired: hadAlphaFix, clean6: base6 }
  }

  return { iso: '', verified: false, repaired: false, clean6: base6 }
}

/**
 * Nettoie et répare le numéro de passeport sur 9 caractères grâce au chiffre de contrôle pos 9
 * (et au chiffre composite pos 43 si disponible).
 */
function repairPassportField(
  rawDoc9: string,
  docCheckChar: string,
  optionalData14?: string
): { numPasseport: string; verified: boolean; repaired: boolean; clean9: string } {
  const padded9 = rawDoc9.padEnd(9, '<').slice(0, 9)

  // Cas ICAO des numéros de passeport longs (> 9 caractères) : checkChar === '<'
  if (docCheckChar === '<' && optionalData14) {
    const overflowMatch = optionalData14.match(/^([A-Z0-9]+?)([0-9])</)
    if (overflowMatch) {
      const fullRaw = padded9.replace(/</g, '') + overflowMatch[1]
      const realCheck = overflowMatch[2]
      const verified = verifyMrzCheckDigit(
        padded9 + '<' + overflowMatch[1],
        realCheck
      ) || verifyMrzCheckDigit(fullRaw, realCheck)
      return {
        numPasseport: fullRaw,
        verified,
        repaired: false,
        clean9: padded9,
      }
    }
  }

  const cleanCheck = toDigitStrict(docCheckChar)
  if (/^\d$/.test(cleanCheck) && computeMrzCheckDigit(padded9) === cleanCheck) {
    return {
      numPasseport: padded9.replace(/</g, '').trim(),
      verified: true,
      repaired: false,
      clean9: padded9,
    }
  }

  // Confusions fréquentes entre lettres et chiffres dans le numéro de passeport
  if (/^\d$/.test(cleanCheck)) {
    const ambiguityMap: Record<string, string[]> = {
      O: ['0', 'D', 'Q'],
      '0': ['O', 'D', '8'],
      D: ['0', 'O'],
      Q: ['0', 'O'],
      I: ['1'],
      L: ['1'],
      '1': ['I', '7'],
      B: ['8'],
      '8': ['B', '0'],
      S: ['5'],
      '5': ['S', '6'],
      Z: ['2'],
      '2': ['Z'],
      G: ['6'],
      '6': ['G', '5'],
      K: ['<'],
      C: ['<'],
    }

    // 1 substitution
    const singleMatches: string[] = []
    for (let i = 0; i < 9; i++) {
      const alts = ambiguityMap[padded9[i]]
      if (!alts) continue
      for (const alt of alts) {
        const cand = padded9.slice(0, i) + alt + padded9.slice(i + 1)
        if (computeMrzCheckDigit(cand) === cleanCheck) {
          singleMatches.push(cand)
        }
      }
    }

    if (singleMatches.length === 1) {
      return {
        numPasseport: singleMatches[0].replace(/</g, '').trim(),
        verified: true,
        repaired: true,
        clean9: singleMatches[0],
      }
    }

    // Si plusieurs candidats 1-substitution : préférer le format standard (1-2 lettres au début puis chiffres)
    if (singleMatches.length > 1) {
      const scored = singleMatches.sort((a, b) => {
        const scoreFormat = (s: string) => {
          const trimmed = s.replace(/<+$/, '')
          if (/^[A-Z]{1,2}\d{6,8}$/.test(trimmed)) return 3
          if (/^\d{2}[A-Z]{2}\d{5}$/.test(trimmed)) return 3 // Format français / CEDEAO biométrique
          if (/^[A-Z0-9]{7,9}$/.test(trimmed) && !trimmed.includes('<')) return 2
          return 0
        }
        return scoreFormat(b) - scoreFormat(a)
      })
      if (scored[0]) {
        return {
          numPasseport: scored[0].replace(/</g, '').trim(),
          verified: true,
          repaired: true,
          clean9: scored[0],
        }
      }
    }

    // 2 substitutions ciblées (ex: deux 'O' lus à la place de deux '0')
    const ambigIndices: number[] = []
    for (let i = 0; i < 9; i++) {
      if (ambiguityMap[padded9[i]]) ambigIndices.push(i)
    }
    if (ambigIndices.length >= 2 && ambigIndices.length <= 6) {
      for (let a = 0; a < ambigIndices.length; a++) {
        for (let b = a + 1; b < ambigIndices.length; b++) {
          const idxA = ambigIndices[a]
          const idxB = ambigIndices[b]
          const altA = ambiguityMap[padded9[idxA]][0]
          const altB = ambiguityMap[padded9[idxB]][0]
          const cand =
            padded9.slice(0, idxA) +
            altA +
            padded9.slice(idxA + 1, idxB) +
            altB +
            padded9.slice(idxB + 1)
          if (computeMrzCheckDigit(cand) === cleanCheck) {
            return {
              numPasseport: cand.replace(/</g, '').trim(),
              verified: true,
              repaired: true,
              clean9: cand,
            }
          }
        }
      }
    }
  }

  return {
    numPasseport: padded9.replace(/</g, '').trim(),
    verified: false,
    repaired: false,
    clean9: padded9,
  }
}

/**
 * Extrait Nom, Prénom(s) complets et Pays émetteur depuis la ligne 1 TD3 (44 caractères).
 * Ne tronque JAMAIS les prénoms composés et élimine les faux 'K'/'C' de fin de ligne.
 */
function parseLine1Names(rawLine1: string): {
  paysEmetteur: string
  nom: string
  prenom: string
  cleanOk: boolean
} {
  if (!rawLine1 || rawLine1.length < 6) {
    return { paysEmetteur: '', nom: '', prenom: '', cleanOk: false }
  }

  let l1 = rawLine1
  // Réaligner si un caractère parasite précède P<
  const pStart = l1.search(/P[<A-Z0-9][A-Z0-9<]{3}/)
  if (pStart > 0 && pStart <= 4) {
    l1 = l1.slice(pStart)
  }

  const rawState = l1.slice(2, 5)
  const paysEmetteur = fixAlphaString(rawState).replace(/</g, '').trim()

  let nameZone = l1.slice(5)
  // Nettoyer les faux chevrons de fin de ligne très fréquents en OCR (ex: <<<<K<< ou <<<C<<<)
  nameZone = nameZone.replace(/<{2,}[KCLXE<]+$/g, '')

  const doubleParts = nameZone.split('<<')
  const rawSurname = doubleParts[0] || ''
  // Tout ce qui suit un 2e '<<' dans un passeport TD3 est du remplissage '<<<<<' !
  const rawGiven = doubleParts[1] || ''

  const cleanNamePart = (part: string) =>
    fixAlphaString(part)
      .replace(/<+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()

  const nom = cleanNamePart(rawSurname)
  const prenom = cleanNamePart(rawGiven)

  return {
    paysEmetteur,
    nom,
    prenom,
    cleanOk: Boolean(nom && prenom && doubleParts.length >= 2),
  }
}

/**
 * Réaligne une ligne 2 TD3 même si l'OCR a sauté ou doublé 1-3 chevrons '<'.
 */
function alignTd3Line2(rawLine2: string): string {
  if (rawLine2.length === 44) return rawLine2

  // Recherche du bloc central [DOB:6][chk:1][Sex:1][EXP:6][chk:1] normalement aux index 13..28
  const anchorRegex = /([0-9OISBZGDQ]{6})([0-9OISBZGDQ<])([MF<])([0-9OISBZGDQ]{6})([0-9OISBZGDQ<])/
  const match = anchorRegex.exec(rawLine2)
  if (match && match.index >= 9 && match.index <= 17) {
    const idx = match.index
    // Les 3 caractères juste avant DOB sont la nationalité (index 10..12)
    const natStart = Math.max(0, idx - 3)
    const docZone = rawLine2.slice(0, natStart)
    const natZone = rawLine2.slice(natStart, idx).padEnd(3, '<').slice(0, 3)
    // docZone doit faire 10 caractères : 9 numPasseport + 1 checkDigit
    let normDoc10 = docZone
    if (docZone.length > 10) {
      // Souvent un '<' en trop avant le check digit
      const checkCh = docZone[docZone.length - 1]
      normDoc10 = docZone.slice(0, 9) + checkCh
    } else if (docZone.length < 10 && docZone.length >= 7) {
      const checkCh = docZone[docZone.length - 1]
      normDoc10 = docZone.slice(0, docZone.length - 1).padEnd(9, '<') + checkCh
    }
    const rest = rawLine2.slice(idx)
    const rebuilt = (normDoc10 + natZone + rest).padEnd(44, '<').slice(0, 44)
    return rebuilt
  }

  return rawLine2.length > 44 ? rawLine2.slice(0, 44) : rawLine2.padEnd(44, '<')
}

function parseTaggedScannerText(fullText: string, sourceLabel?: string): MrzParseResult | null {
  const getTag = (tag: string) => {
    const match = fullText.match(new RegExp(`(?:^|,|\\n)${tag}([^,\\r\\n]+)`, 'i'))
    return match ? match[1].trim() : ''
  }

  const nom = fixAlphaString(getTag('LNM')).replace(/</g, ' ').replace(/\s+/g, ' ').trim()
  const prenom = fixAlphaString(getTag('FNM')).replace(/</g, ' ').replace(/\s+/g, ' ').trim()
  const numPasseport = getTag('PNM').replace(/</g, '').trim().toUpperCase()
  const nationalite = fixAlphaString(getTag('NAT')).replace(/</g, '').trim().toUpperCase()

  const rawSex = getTag('SEX').toUpperCase()
  const sexe: 'HOMME' | 'FEMME' | '' = rawSex.startsWith('F')
    ? 'FEMME'
    : rawSex.startsWith('M')
    ? 'HOMME'
    : ''

  const parseTagDate = (dStr: string, isExpiry: boolean): string => {
    if (!dStr) return ''
    const dmy = dStr.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{2,4})$/)
    if (dmy) {
      const dd = parseInt(dmy[1], 10)
      const mm = parseInt(dmy[2], 10)
      const rawY = parseInt(dmy[3], 10)
      const yyyy = rawY < 100 ? resolveMrzFullYear(rawY, isExpiry) : rawY
      if (!isValidCalendarDate(yyyy, mm, dd)) return ''
      return `${String(yyyy).padStart(4, '0')}-${String(mm).padStart(2, '0')}-${String(dd).padStart(2, '0')}`
    }
    if (/^\d{4}-\d{2}-\d{2}$/.test(dStr)) return dStr
    const digits = dStr.replace(/\D/g, '')
    if (digits.length === 8) {
      return `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6, 8)}`
    }
    if (digits.length === 6) {
      return formatAndValidateMrzDate(digits, '', isExpiry).iso
    }
    return ''
  }

  const dateNaissance = parseTagDate(getTag('DOB'), false)
  const dateExpiration = parseTagDate(getTag('EDT'), true)

  if (!nom && !numPasseport && !prenom) return null

  return {
    nom,
    prenom,
    numPasseport,
    sexe,
    dateNaissance,
    dateExpiration,
    nationalite,
    paysEmetteur: nationalite,
    verified: {
      passeport: Boolean(numPasseport),
      dateNaissance: Boolean(dateNaissance),
      dateExpiration: Boolean(dateExpiration),
      composite: true,
      nomPrenom: Boolean(nom && prenom),
    },
    unverifiedFields: [],
    repairedFields: [],
    confidenceScore: 95,
    source: sourceLabel || 'scanner-hid',
  }
}

export function parseMrzSmart(
  rawInput: string | string[],
  sourceLabel = 'mrz'
): MrzParseResult | null {
  const joined = Array.isArray(rawInput) ? rawInput.join('\n') : String(rawInput || '')
  if (!joined || joined.trim().length < 8) return null

  const normalizedInput = normalizeAzertyScannerInput(joined)

  if (
    normalizedInput.includes('LNM') ||
    normalizedInput.includes('PNM') ||
    normalizedInput.includes('FNM')
  ) {
    const tagged = parseTaggedScannerText(normalizedInput, sourceLabel)
    if (tagged) return tagged
  }

  const rawLines = normalizedInput
    .split(/\r?\n/)
    .map((l) => sanitizeMrzLine(l))
    .filter((l) => l.length >= 12)

  let line1 = ''
  let line2 = ''

  // 1. Identification de la ligne 1 (commence par P< ou P + code pays + <<)
  let l1Idx = rawLines.findIndex((l) => /^P[<A-Z0-9]/.test(l) && l.includes('<<'))
  if (l1Idx === -1) {
    l1Idx = rawLines.findIndex((l) => l.includes('P<') && l.includes('<<'))
  }

  if (l1Idx !== -1) {
    line1 = rawLines[l1Idx]
    // Si l'OCR a coupé la ligne 1 en deux morceaux avant la ligne 2
    if (
      line1.length < 36 &&
      l1Idx + 2 < rawLines.length &&
      /^[A-Z<]+$/.test(rawLines[l1Idx + 1])
    ) {
      line1 = line1 + rawLines[l1Idx + 1]
      line2 = rawLines[l1Idx + 2]
    } else if (l1Idx + 1 < rawLines.length) {
      line2 = rawLines[l1Idx + 1]
    }
  }

  // 2. Cas continu sur 1 seule ligne (ex: douchette USB HID 88 caractères sans retour chariot)
  if (!line1 || !line2) {
    const continuous = sanitizeMrzLine(normalizedInput)
    const pIdx = continuous.search(/P[<A-Z][A-Z]{3}[A-Z]+<</)
    if (pIdx !== -1 && continuous.length - pIdx >= 72) {
      const mrzBlock = continuous.slice(pIdx)
      line1 = mrzBlock.slice(0, 44)
      line2 = mrzBlock.slice(44, 88)
    }
  }

  // 3. Secours par densité de chevrons / longueur
  if (!line1 || !line2) {
    const candidates = rawLines.filter(
      (l) => (l.match(/</g) || []).length >= 3 || l.length >= 30
    )
    if (candidates.length >= 2) {
      line1 = line1 || candidates[candidates.length - 2]
      line2 = line2 || candidates[candidates.length - 1]
    } else if (candidates.length === 1 && !line2) {
      line2 = candidates[0]
    }
  }

  if (!line1 && !line2) return null

  const l1_44 = line1 ? (line1.length > 44 ? line1.slice(0, 44) : line1.padEnd(44, '<')) : ''
  const l2_44 = line2 ? alignTd3Line2(line2) : ''

  // Essai préalable avec le décodeur strict `mrz` si tout est déjà 100% valide
  if (l1_44.length === 44 && l2_44.length === 44) {
    try {
      const strict = parseStrictMRZ([l1_44, l2_44], { autocorrect: false })
      if (strict.valid && strict.fields) {
        const f = strict.fields
        const dobRes = formatAndValidateMrzDate(l2_44.slice(13, 19), l2_44[19], false)
        const expRes = formatAndValidateMrzDate(l2_44.slice(21, 27), l2_44[27], true)
        const namesRes = parseLine1Names(l1_44)
        const sexe: 'HOMME' | 'FEMME' | '' =
          f.sex === 'male' ? 'HOMME' : f.sex === 'female' ? 'FEMME' : ''

        return {
          nom: namesRes.nom || (f.lastName || '').trim(),
          prenom: namesRes.prenom || (f.firstName || '').trim(),
          numPasseport: (f.documentNumber || '').replace(/</g, '').trim(),
          sexe,
          dateNaissance: dobRes.iso,
          dateExpiration: expRes.iso,
          nationalite: (f.nationality || '').trim(),
          paysEmetteur: (f.issuingState || namesRes.paysEmetteur || '').trim(),
          verified: {
            passeport: true,
            dateNaissance: dobRes.verified,
            dateExpiration: expRes.verified,
            composite: true,
            nomPrenom: true,
          },
          unverifiedFields: [],
          repairedFields: [],
          confidenceScore: 100,
          rawLines: [l1_44, l2_44],
          source: sourceLabel,
        }
      }
    } catch {
      // On passe à notre décodeur correcteur ICAO ci-dessous
    }
  }

  const repairedFields: MrzFieldKey[] = []
  const unverifiedFields: MrzFieldKey[] = []

  // Décodage Ligne 1
  const names = parseLine1Names(l1_44)
  if (!names.nom) unverifiedFields.push('nom')
  if (!names.prenom) unverifiedFields.push('prenom')

  // Décodage & Réparation Ligne 2
  let numPasseport = ''
  let nationalite = ''
  let sexe: 'HOMME' | 'FEMME' | '' = ''
  let dateNaissance = ''
  let dateExpiration = ''
  let passVerified = false
  let dobVerified = false
  let expVerified = false
  let compositeVerified = false

  if (l2_44.length >= 28) {
    const passRes = repairPassportField(l2_44.slice(0, 9), l2_44[9], l2_44.slice(28, 42))
    numPasseport = passRes.numPasseport
    passVerified = passRes.verified
    if (passRes.repaired) repairedFields.push('passeport')
    if (!passVerified) unverifiedFields.push('passeport')

    nationalite = fixAlphaString(l2_44.slice(10, 13)).replace(/</g, '').trim()

    const dobRes = formatAndValidateMrzDate(l2_44.slice(13, 19), l2_44[19], false)
    dateNaissance = dobRes.iso
    dobVerified = dobRes.verified
    if (dobRes.repaired) repairedFields.push('dateNaissance')
    if (!dobVerified) unverifiedFields.push('dateNaissance')

    const rawSex = l2_44[20]
    if (rawSex === 'F') sexe = 'FEMME'
    else if (rawSex === 'M') sexe = 'HOMME'
    else unverifiedFields.push('sexe')

    const expRes = formatAndValidateMrzDate(l2_44.slice(21, 27), l2_44[27], true)
    dateExpiration = expRes.iso
    expVerified = expRes.verified
    if (expRes.repaired) repairedFields.push('dateExpiration')
    if (!expVerified) unverifiedFields.push('dateExpiration')

    // Vérification du checksum composite ICAO (pos 43 sur [0..9]+[13..19]+[21..42])
    const rebuiltCompositeSlice =
      passRes.clean9 +
      toDigitStrict(l2_44[9]) +
      (dobRes.clean6 || l2_44.slice(13, 19)) +
      toDigitStrict(l2_44[19]) +
      (expRes.clean6 || l2_44.slice(21, 27)) +
      toDigitStrict(l2_44[27]) +
      l2_44.slice(28, 42) +
      (l2_44[42] === '<' ? '0' : toDigitStrict(l2_44[42]))

    compositeVerified = verifyMrzCheckDigit(rebuiltCompositeSlice, l2_44[43])
  }

  if (!names.nom && !numPasseport && !names.prenom) {
    return null
  }

  // Calcul d'un score de fiabilité transparent sur 100
  let score = 0
  if (names.cleanOk) score += 22
  else if (names.nom) score += 10
  if (passVerified) score += 28
  else if (numPasseport.length >= 6) score += 10
  if (dobVerified) score += 18
  else if (dateNaissance) score += 6
  if (expVerified) score += 18
  else if (dateExpiration) score += 6
  if (sexe) score += 6
  if (compositeVerified) score += 8

  return {
    nom: names.nom,
    prenom: names.prenom,
    numPasseport,
    sexe,
    dateNaissance,
    dateExpiration,
    nationalite,
    paysEmetteur: names.paysEmetteur,
    verified: {
      passeport: passVerified,
      dateNaissance: dobVerified,
      dateExpiration: expVerified,
      composite: compositeVerified,
      nomPrenom: names.cleanOk,
    },
    unverifiedFields: Array.from(new Set(unverifiedFields)),
    repairedFields: Array.from(new Set(repairedFields)),
    confidenceScore: Math.min(100, score),
    rawLines: [l1_44, l2_44],
    source: sourceLabel,
  }
}

/**
 * Fusionne intelligemment plusieurs lectures (ex: OCR local mrz.traineddata + OCR serveur + Vision IA)
 * en choisissant pour chaque champ la valeur mathématiquement certifiée par checksum ICAO.
 */
export function mergeMrzResults(
  candidates: Array<MrzParseResult | null | undefined>
): MrzParseResult | null {
  const valid = candidates.filter((c): c is MrzParseResult => Boolean(c))
  if (valid.length === 0) return null
  if (valid.length === 1) return valid[0]

  const sorted = [...valid].sort((a, b) => b.confidenceScore - a.confidenceScore)
  const primary = sorted[0]

  const bestPass = sorted.find((c) => c.verified.passeport && c.numPasseport) || primary
  const bestDob = sorted.find((c) => c.verified.dateNaissance && c.dateNaissance) || primary
  const bestExp = sorted.find((c) => c.verified.dateExpiration && c.dateExpiration) || primary
  const bestNames = sorted.find((c) => c.verified.nomPrenom && c.nom && c.prenom) || primary
  const bestSex = sorted.find((c) => c.sexe) || primary

  const verified: MrzVerification = {
    passeport: bestPass.verified.passeport,
    dateNaissance: bestDob.verified.dateNaissance,
    dateExpiration: bestExp.verified.dateExpiration,
    composite: sorted.some((c) => c.verified.composite),
    nomPrenom: bestNames.verified.nomPrenom,
  }

  const unverifiedFields: MrzFieldKey[] = []
  if (!bestNames.nom) unverifiedFields.push('nom')
  if (!bestNames.prenom) unverifiedFields.push('prenom')
  if (!verified.passeport) unverifiedFields.push('passeport')
  if (!bestSex.sexe) unverifiedFields.push('sexe')
  if (!verified.dateNaissance) unverifiedFields.push('dateNaissance')
  if (!verified.dateExpiration) unverifiedFields.push('dateExpiration')

  let score = 0
  if (verified.nomPrenom) score += 22
  else if (bestNames.nom) score += 10
  if (verified.passeport) score += 28
  else if (bestPass.numPasseport) score += 10
  if (verified.dateNaissance) score += 18
  else if (bestDob.dateNaissance) score += 6
  if (verified.dateExpiration) score += 18
  else if (bestExp.dateExpiration) score += 6
  if (bestSex.sexe) score += 6
  if (verified.composite) score += 8

  return {
    nom: bestNames.nom || primary.nom,
    prenom: bestNames.prenom || primary.prenom,
    numPasseport: bestPass.numPasseport || primary.numPasseport,
    sexe: bestSex.sexe || primary.sexe,
    dateNaissance: bestDob.dateNaissance || primary.dateNaissance,
    dateExpiration: bestExp.dateExpiration || primary.dateExpiration,
    nationalite: primary.nationalite || bestPass.nationalite,
    paysEmetteur: bestNames.paysEmetteur || primary.paysEmetteur,
    verified,
    unverifiedFields,
    repairedFields: Array.from(
      new Set(sorted.flatMap((c) => c.repairedFields))
    ),
    confidenceScore: Math.min(100, score),
    rawLines: primary.rawLines,
    source: Array.from(new Set(sorted.map((c) => c.source).filter(Boolean))).join('+'),
  }
}
