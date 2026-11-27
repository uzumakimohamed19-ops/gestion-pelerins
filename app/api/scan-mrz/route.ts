import { NextRequest, NextResponse } from 'next/server'
import { mergeMrzResults, parseMrzSmart, type MrzParseResult } from '@/lib/mrzEngine'
import { isGeminiConfigured, scanPassportWithGemini } from '@/lib/geminiPassportServer'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
}

export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders })
}

async function runOcrSpace(base64Data: string, engine: '2' | '1' = '2'): Promise<string> {
  const formData = new URLSearchParams()
  formData.append('base64Image', `data:image/jpeg;base64,${base64Data}`)
  formData.append('language', 'eng')
  formData.append('isOverlayRequired', 'false')
  formData.append('OCREngine', engine)
  formData.append('scale', 'true')
  formData.append('detectOrientation', 'true')

  const ocrRes = await fetch('https://api.ocr.space/parse/image', {
    method: 'POST',
    headers: {
      apikey: process.env.OCR_SPACE_API_KEY || 'K86855410088957',
    },
    body: formData,
    signal: AbortSignal.timeout(14000),
  })

  if (!ocrRes.ok) return ''
  const ocrData = await ocrRes.json()
  return ocrData?.ParsedResults?.[0]?.ParsedText || ''
}

async function runOpenAiVisionFallback(base64Image: string): Promise<MrzParseResult | null> {
  const apiKey = process.env.OPENAI_API_KEY || process.env.OPENAI_ADMIN_KEY
  if (!apiKey) return null

  try {
    const OpenAI = (await import('openai')).default
    const openai = new OpenAI({ apiKey })

    const cleanB64 = base64Image.replace(/^data:image\/\w+;base64,/, '')
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      temperature: 0,
      messages: [
        {
          role: 'system',
          content: `Tu es un système biométrique expert ICAO 9303 pour passeports.
Lis l'image du passeport (zone visuelle imprimée + 2 lignes MRZ en bas) et retourne UNIQUEMENT un JSON valide :
{
  "nom": "NOM DE FAMILLE EN MAJUSCULES (sans prénom)",
  "prenom": "TOUS LES PRÉNOMS EN MAJUSCULES",
  "numPasseport": "NUMÉRO EXACT DU PASSEPORT",
  "sexe": "HOMME" | "FEMME" | "",
  "dateNaissance": "YYYY-MM-DD",
  "dateExpiration": "YYYY-MM-DD",
  "nationalite": "CODE 3 LETTRES",
  "mrzLine1": "ligne 1 MRZ 44 caractères si visible sinon vide",
  "mrzLine2": "ligne 2 MRZ 44 caractères si visible sinon vide"
}`,
        },
        {
          role: 'user',
          content: [
            { type: 'text', text: 'Extrais les données exactes de ce passeport :' },
            {
              type: 'image_url',
              image_url: { url: `data:image/jpeg;base64,${cleanB64}`, detail: 'high' },
            },
          ],
        },
      ],
      response_format: { type: 'json_object' },
    })

    const rawJson = response.choices[0]?.message?.content || '{}'
    const parsed = JSON.parse(rawJson)

    const mrzParsed =
      parsed.mrzLine1 || parsed.mrzLine2
        ? parseMrzSmart([parsed.mrzLine1 || '', parsed.mrzLine2 || ''], 'vision-mrz')
        : null

    const vizCandidate: MrzParseResult = {
      nom: String(parsed.nom || '').toUpperCase().trim(),
      prenom: String(parsed.prenom || '').toUpperCase().trim(),
      numPasseport: String(parsed.numPasseport || '').toUpperCase().replace(/\s+/g, '').trim(),
      sexe: parsed.sexe === 'FEMME' ? 'FEMME' : parsed.sexe === 'HOMME' ? 'HOMME' : '',
      dateNaissance: /^\d{4}-\d{2}-\d{2}$/.test(parsed.dateNaissance || '')
        ? parsed.dateNaissance
        : '',
      dateExpiration: /^\d{4}-\d{2}-\d{2}$/.test(parsed.dateExpiration || '')
        ? parsed.dateExpiration
        : '',
      nationalite: String(parsed.nationalite || '').toUpperCase().trim(),
      paysEmetteur: String(parsed.nationalite || '').toUpperCase().trim(),
      verified: {
        passeport: Boolean(
          mrzParsed?.verified.passeport && mrzParsed.numPasseport === parsed.numPasseport
        ),
        dateNaissance: Boolean(
          mrzParsed?.verified.dateNaissance && mrzParsed.dateNaissance === parsed.dateNaissance
        ),
        dateExpiration: Boolean(
          mrzParsed?.verified.dateExpiration && mrzParsed.dateExpiration === parsed.dateExpiration
        ),
        composite: Boolean(mrzParsed?.verified.composite),
        nomPrenom: Boolean(parsed.nom && parsed.prenom),
      },
      unverifiedFields: [],
      repairedFields: [],
      confidenceScore: 88,
      source: 'openai-vision',
    }

    return mergeMrzResults([mrzParsed, vizCandidate])
  } catch (e) {
    console.warn('[scan-mrz] OpenAI Vision fallback non disponible:', e)
    return null
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { imageBase64, fullImageBase64 } = body || {}
    if (!imageBase64 && !fullImageBase64) {
      return NextResponse.json({ error: 'Image manquante' }, { status: 400, headers: corsHeaders })
    }

    const candidates: Array<MrzParseResult | null> = []

    // 🚀 PRIORITÉ 1 : GOOGLE GEMINI (v1beta, ~0.9s) + validation ICAO 9303
    if (isGeminiConfigured()) {
      try {
        // On envoie uniquement l'image complète (ou la bande MRZ si seule fournie) pour diviser par 2 le poids et le temps d'inférence
        const geminiRes = await scanPassportWithGemini(String(fullImageBase64 || imageBase64))
        if (geminiRes && (geminiRes.nom || geminiRes.numPasseport)) {
          candidates.push(geminiRes)
          if (geminiRes.confidenceScore >= 85 && (geminiRes.nom || geminiRes.numPasseport)) {
            return NextResponse.json(geminiRes, { headers: corsHeaders })
          }
        }
      } catch (err) {
        console.warn('[scan-mrz] Gemini indisponible, bascule vers secours OCR :', err)
      }
    }

    // 🔄 PRIORITÉ 2 (Secours si GEMINI_API_KEY absente ou quota dépassé) : OCR.space Engine 2
    const mrzB64 = String(imageBase64 || fullImageBase64).replace(/^data:image\/\w+;base64,/, '')
    try {
      const textE2 = await runOcrSpace(mrzB64, '2')
      if (textE2.trim()) {
        const resE2 = parseMrzSmart(textE2, 'ocr-e2')
        if (resE2) candidates.push(resE2)
      }
    } catch (e) {
      console.warn('[scan-mrz] OCR Engine 2 timeout/error:', e)
    }

    const bestSoFar = mergeMrzResults(candidates)
    if (
      bestSoFar &&
      bestSoFar.verified.passeport &&
      bestSoFar.verified.dateNaissance &&
      bestSoFar.verified.dateExpiration &&
      bestSoFar.nom &&
      bestSoFar.prenom
    ) {
      return NextResponse.json(bestSoFar, { headers: corsHeaders })
    }

    // 🔄 PRIORITÉ 3 : Secours OpenAI Vision / OCR Engine 1
    const fallbackTasks: Array<Promise<MrzParseResult | null>> = []
    if (process.env.OPENAI_API_KEY || process.env.OPENAI_ADMIN_KEY) {
      fallbackTasks.push(runOpenAiVisionFallback(String(fullImageBase64 || imageBase64)))
    }
    if (!bestSoFar || bestSoFar.confidenceScore < 75) {
      fallbackTasks.push(
        runOcrSpace(mrzB64, '1')
          .then((txt) => (txt.trim() ? parseMrzSmart(txt, 'ocr-e1') : null))
          .catch(() => null)
      )
    }

    if (fallbackTasks.length > 0) {
      const extraResults = await Promise.all(fallbackTasks)
      candidates.push(...extraResults)
    }

    const merged = mergeMrzResults(candidates)

    if (!merged || (!merged.nom && !merged.numPasseport)) {
      return NextResponse.json(
        {
          error:
            'Bande MRZ illisible sur cette photo. Évitez les reflets et assurez-vous que les 2 lignes du bas soient nettes.',
        },
        { status: 422, headers: corsHeaders }
      )
    }

    return NextResponse.json(merged, { headers: corsHeaders })
  } catch (err: unknown) {
    console.error('Erreur API Scan MRZ:', err)
    const msg = err instanceof Error ? err.message : 'Erreur interne'
    return NextResponse.json({ error: msg }, { status: 500, headers: corsHeaders })
  }
}
