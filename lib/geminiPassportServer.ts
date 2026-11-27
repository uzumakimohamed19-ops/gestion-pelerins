import { GoogleGenAI } from '@google/genai'
import { mergeMrzResults, parseMrzSmart, type MrzParseResult } from '@/lib/mrzEngine'

const FAST_GEMINI_MODEL = 'gemini-3.5-flash-lite'
const HIGH_PRECISION_GEMINI_MODEL = 'gemini-4-hydrogen'

const PASSPORT_EXTRACTION_PROMPT = `Système biométrique ICAO 9303 ultra-précis.
Analyse cette image de passeport (même si elle est penchée, à 90°, 180° ou 270°) :
1. Lis les 2 lignes MRZ (commençant par P<...) caractère par caractère si visibles.
2. Croise avec le texte imprimé du passeport (Nom, Prénoms, N° Passeport, Sexe, Naissance, Expiration) pour zéro confusion 0/O, 1/I, 8/B, 5/S.
3. "nom" = NOM DE FAMILLE uniquement en MAJUSCULES.
4. "prenom" = TOUS les prénoms complets en MAJUSCULES séparés par espace.
5. "sexe" = "HOMME" (M), "FEMME" (F), ou "".
6. "dateNaissance" et "dateExpiration" = "YYYY-MM-DD" (ex: "2005-03-14").
7. "rotationDegrees" = rotation horaire (0, 90, 180 ou 270) à appliquer à l'image pour remettre le passeport à l'endroit.`

const PASSPORT_JSON_SCHEMA = {
  type: 'object',
  properties: {
    nom: { type: 'string' },
    prenom: { type: 'string' },
    numPasseport: { type: 'string' },
    sexe: { type: 'string' },
    dateNaissance: { type: 'string' },
    dateExpiration: { type: 'string' },
    nationalite: { type: 'string' },
    paysEmetteur: { type: 'string' },
    mrzLine1: { type: 'string' },
    mrzLine2: { type: 'string' },
    rotationDegrees: { type: 'integer' },
  },
  required: [
    'nom',
    'prenom',
    'numPasseport',
    'sexe',
    'dateNaissance',
    'dateExpiration',
    'nationalite',
    'paysEmetteur',
    'mrzLine1',
    'mrzLine2',
    'rotationDegrees',
  ],
}

export interface GeminiPassportScanResult extends MrzParseResult {
  rotationDegrees?: 0 | 90 | 180 | 270
}

function stripDataUrlPrefix(b64: string): { mimeType: string; data: string } {
  const match = b64.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/)
  if (match) {
    return { mimeType: match[1], data: match[2] }
  }
  return { mimeType: 'image/jpeg', data: b64.replace(/^data:image\/\w+;base64,/, '') }
}

function getGeminiApiKey(): string {
  return (
    process.env.GEMINI_API_KEY ||
    process.env.GOOGLE_AI_STUDIO_API_KEY ||
    process.env.GOOGLE_API_KEY ||
    ''
  ).trim()
}

export function isGeminiConfigured(): boolean {
  return Boolean(getGeminiApiKey())
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Gemini timeout (${ms}ms)`)), ms)
    promise
      .then((v) => {
        clearTimeout(timer)
        resolve(v)
      })
      .catch((e) => {
        clearTimeout(timer)
        reject(e)
      })
  })
}

async function callGeminiInteraction(
  client: GoogleGenAI,
  model: string,
  images: Array<{ mimeType: string; data: string }>,
  thinkingLevel?: 'low',
  timeoutMs = 9000
): Promise<Record<string, unknown> | null> {
  const input = [
    { type: 'text' as const, text: PASSPORT_EXTRACTION_PROMPT },
    ...images.map((img) => ({
      type: 'image' as const,
      data: img.data,
      mime_type: img.mimeType,
    })),
  ]

  const interaction = await withTimeout(
    client.interactions.create({
      model,
      input,
      store: false,
      ...(thinkingLevel ? { generation_config: { thinking_level: thinkingLevel } } : {}),
      response_format: {
        type: 'text',
        mime_type: 'application/json',
        schema: PASSPORT_JSON_SCHEMA,
      },
    }),
    timeoutMs
  )

  const rawText = interaction.output_text || ''
  if (!rawText.trim()) return null

  const cleanedJson = rawText
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim()

  try {
    return JSON.parse(cleanedJson) as Record<string, unknown>
  } catch {
    console.warn(`[GeminiMRZ] JSON invalide de ${model}:`, cleanedJson.slice(0, 200))
    return null
  }
}

function normalizeRotation(val: unknown): 0 | 90 | 180 | 270 {
  const n = Number(val)
  if (n === 90 || n === 180 || n === 270) return n
  return 0
}

function buildResultFromGeminiJson(
  parsed: Record<string, unknown>,
  usedModel: string
): GeminiPassportScanResult | null {
  const mrzLine1 = String(parsed.mrzLine1 || '').trim()
  const mrzLine2 = String(parsed.mrzLine2 || '').trim()
  const rotationDegrees = normalizeRotation(parsed.rotationDegrees)

  // Validation mathématique ICAO 9303 sur les 2 lignes MRZ extraites par Gemini
  const mrzParsed =
    mrzLine1 || mrzLine2
      ? parseMrzSmart([mrzLine1, mrzLine2], `${usedModel}-mrz`)
      : null

  const vizNom = String(parsed.nom || '').toUpperCase().replace(/\s+/g, ' ').trim()
  const vizPrenom = String(parsed.prenom || '').toUpperCase().replace(/\s+/g, ' ').trim()
  const vizPass = String(parsed.numPasseport || '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .trim()
  const rawSex = String(parsed.sexe || '').toUpperCase().trim()
  const vizSex: 'HOMME' | 'FEMME' | '' =
    rawSex === 'FEMME' || rawSex === 'F'
      ? 'FEMME'
      : rawSex === 'HOMME' || rawSex === 'M'
      ? 'HOMME'
      : ''
  const vizDob = /^\d{4}-\d{2}-\d{2}$/.test(String(parsed.dateNaissance || ''))
    ? String(parsed.dateNaissance)
    : ''
  const vizExp = /^\d{4}-\d{2}-\d{2}$/.test(String(parsed.dateExpiration || ''))
    ? String(parsed.dateExpiration)
    : ''
  const vizNat = String(parsed.nationalite || '').toUpperCase().trim()
  const vizState = String(parsed.paysEmetteur || vizNat).toUpperCase().trim()

  const passAgreed = Boolean(
    mrzParsed?.verified.passeport || (vizPass && mrzParsed?.numPasseport === vizPass)
  )
  const dobAgreed = Boolean(
    mrzParsed?.verified.dateNaissance || (vizDob && mrzParsed?.dateNaissance === vizDob)
  )
  const expAgreed = Boolean(
    mrzParsed?.verified.dateExpiration || (vizExp && mrzParsed?.dateExpiration === vizExp)
  )

  const unverifiedFields: MrzParseResult['unverifiedFields'] = []
  if (!vizNom && !mrzParsed?.nom) unverifiedFields.push('nom')
  if (!vizPrenom && !mrzParsed?.prenom) unverifiedFields.push('prenom')
  if (!passAgreed && vizPass.length < 6) unverifiedFields.push('passeport')
  if (!vizSex && !mrzParsed?.sexe) unverifiedFields.push('sexe')
  if (!dobAgreed && !vizDob) unverifiedFields.push('dateNaissance')
  if (!expAgreed && !vizExp) unverifiedFields.push('dateExpiration')

  const vizCandidate: MrzParseResult = {
    nom: vizNom,
    prenom: vizPrenom,
    numPasseport: vizPass,
    sexe: vizSex,
    dateNaissance: vizDob,
    dateExpiration: vizExp,
    nationalite: vizNat,
    paysEmetteur: vizState,
    verified: {
      passeport: passAgreed || vizPass.length >= 6,
      dateNaissance: dobAgreed || Boolean(vizDob),
      dateExpiration: expAgreed || Boolean(vizExp),
      composite: Boolean(mrzParsed?.verified.composite),
      nomPrenom: Boolean(vizNom && vizPrenom),
    },
    unverifiedFields,
    repairedFields: mrzParsed?.repairedFields || [],
    confidenceScore: mrzParsed?.verified.composite
      ? 100
      : passAgreed && dobAgreed && expAgreed
      ? 98
      : vizNom && vizPass.length >= 6 && vizDob && vizExp
      ? 92
      : 80,
    rawLines: mrzParsed?.rawLines,
    source: 'gemini',
  }

  const fused = mergeMrzResults([mrzParsed, vizCandidate])
  if (!fused) return null

  if (vizNom && vizNom.length >= fused.nom.length && (!fused.nom || vizNom.startsWith(fused.nom))) {
    fused.nom = vizNom
  }
  if (
    vizPrenom &&
    vizPrenom.length >= fused.prenom.length &&
    (!fused.prenom || vizPrenom.startsWith(fused.prenom))
  ) {
    fused.prenom = vizPrenom
  }

  return {
    ...fused,
    rotationDegrees,
  }
}

/**
 * Lecture ultra-rapide (~0.9s) via Google Gemini (`v1beta` requis pour l'entrée image dans Interactions API) :
 * 1) Passe éclair `gemini-3.5-flash-lite` (sans surcoût de thinking) + vérification ICAO 9303.
 * 2) Retour immédiat dès que nom + numéro de passeport sont lus proprement.
 * 3) Escalade automatique vers `gemini-4-hydrogen` (`thinking_level: 'low'`) uniquement si l'image est très dégradée.
 */
export async function scanPassportWithGemini(
  primaryImageBase64: string,
  secondaryMrzBase64?: string
): Promise<GeminiPassportScanResult | null> {
  const apiKey = getGeminiApiKey()
  if (!apiKey) return null

  // CRITIQUE : apiVersion: 'v1beta' est indispensable pour les entrées multimodales { type: 'image' }
  const client = new GoogleGenAI({ apiKey, apiVersion: 'v1beta' })

  const images = [stripDataUrlPrefix(primaryImageBase64)]
  if (secondaryMrzBase64 && secondaryMrzBase64 !== primaryImageBase64) {
    images.push(stripDataUrlPrefix(secondaryMrzBase64))
  }

  let fastResult: GeminiPassportScanResult | null = null
  try {
    const rawFast = await callGeminiInteraction(
      client,
      FAST_GEMINI_MODEL,
      images,
      undefined,
      8500
    )
    if (rawFast) {
      fastResult = buildResultFromGeminiJson(rawFast, FAST_GEMINI_MODEL)
    }
  } catch (err) {
    console.warn(`[GeminiMRZ] Échec passe rapide (${FAST_GEMINI_MODEL}):`, err)
  }

  if (fastResult && fastResult.nom && fastResult.numPasseport && fastResult.confidenceScore >= 90) {
    return fastResult
  }

  // Escalade haute précision uniquement si le passeport était flou/illisible en passe 1
  let proResult: GeminiPassportScanResult | null = null
  try {
    const rawPro = await callGeminiInteraction(
      client,
      HIGH_PRECISION_GEMINI_MODEL,
      images,
      'low',
      10000
    )
    if (rawPro) {
      proResult = buildResultFromGeminiJson(rawPro, HIGH_PRECISION_GEMINI_MODEL)
    }
  } catch (err) {
    console.warn(`[GeminiMRZ] Échec escalade (${HIGH_PRECISION_GEMINI_MODEL}):`, err)
  }

  const merged = mergeMrzResults([proResult, fastResult])
  if (!merged) return null

  return {
    ...merged,
    rotationDegrees: proResult?.rotationDegrees ?? fastResult?.rotationDegrees ?? 0,
  }
}
