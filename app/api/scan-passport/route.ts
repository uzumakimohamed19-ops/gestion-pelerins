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

export async function POST(request: NextRequest) {
  try {
    let base64 = ''
    const contentType = request.headers.get('content-type') || ''
    if (contentType.includes('application/json')) {
      const body = await request.json()
      base64 = String(body.imageBase64 || '').replace(/^data:image\/\w+;base64,/, '')
    } else {
      const formData = await request.formData()
      const file = formData.get('file') as File | null
      if (file) {
        const buffer = await file.arrayBuffer()
        base64 = Buffer.from(buffer).toString('base64')
      }
    }

    if (!base64) {
      return NextResponse.json(
        { error: 'Aucune image fournie' },
        { status: 400, headers: corsHeaders }
      )
    }

    // 🚀 PRIORITÉ 1 : Google Gemini Vision (Google AI Studio)
    if (isGeminiConfigured()) {
      const geminiRes = await scanPassportWithGemini(`data:image/jpeg;base64,${base64}`)
      if (geminiRes && (geminiRes.nom || geminiRes.numPasseport)) {
        return NextResponse.json(
          {
            success: true,
            data: geminiRes,
            ...geminiRes,
          },
          { headers: corsHeaders }
        )
      }
    }

    // 🔄 SECOURS : OpenAI Vision si configuré
    const apiKey = process.env.OPENAI_API_KEY || process.env.OPENAI_ADMIN_KEY
    if (!apiKey) {
      return NextResponse.json(
        { error: 'Aucune clé IA configurée (ajoutez GEMINI_API_KEY dans les variables d’environnement).' },
        { status: 503, headers: corsHeaders }
      )
    }

    const OpenAI = (await import('openai')).default
    const openai = new OpenAI({ apiKey })

    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      temperature: 0,
      messages: [
        {
          role: 'system',
          content: `Tu es un expert biométrique en lecture de passeports (norme ICAO 9303).
Extrais les informations exactes et retourne UNIQUEMENT un JSON valide :
{
  "nom": "NOM DE FAMILLE UNIQUEMENT (MAJUSCULES)",
  "prenom": "TOUS LES PRÉNOMS COMPLETS (MAJUSCULES)",
  "numPasseport": "NUMÉRO DU PASSEPORT",
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
            { type: 'text', text: 'Extrais les informations de ce passeport :' },
            {
              type: 'image_url',
              image_url: { url: `data:image/jpeg;base64,${base64}`, detail: 'high' },
            },
          ],
        },
      ],
      response_format: { type: 'json_object' },
    })

    const content = response.choices[0]?.message?.content || '{}'
    const parsedData = JSON.parse(content)

    const mrzCheck =
      parsedData.mrzLine1 || parsedData.mrzLine2
        ? parseMrzSmart([parsedData.mrzLine1 || '', parsedData.mrzLine2 || ''], 'vision-mrz')
        : null

    const vizResult: MrzParseResult = {
      nom: String(parsedData.nom || '').toUpperCase().trim(),
      prenom: String(parsedData.prenom || '').toUpperCase().trim(),
      numPasseport: String(parsedData.numPasseport || parsedData.passeport || '')
        .toUpperCase()
        .replace(/\s+/g, '')
        .trim(),
      sexe:
        parsedData.sexe === 'FEMME'
          ? 'FEMME'
          : parsedData.sexe === 'HOMME'
          ? 'HOMME'
          : '',
      dateNaissance: /^\d{4}-\d{2}-\d{2}$/.test(parsedData.dateNaissance || '')
        ? parsedData.dateNaissance
        : '',
      dateExpiration: /^\d{4}-\d{2}-\d{2}$/.test(parsedData.dateExpiration || '')
        ? parsedData.dateExpiration
        : '',
      nationalite: String(parsedData.nationalite || '').toUpperCase().trim(),
      paysEmetteur: String(parsedData.nationalite || '').toUpperCase().trim(),
      verified: {
        passeport: Boolean(mrzCheck?.verified.passeport),
        dateNaissance: Boolean(mrzCheck?.verified.dateNaissance),
        dateExpiration: Boolean(mrzCheck?.verified.dateExpiration),
        composite: Boolean(mrzCheck?.verified.composite),
        nomPrenom: Boolean(parsedData.nom && parsedData.prenom),
      },
      unverifiedFields: [],
      repairedFields: [],
      confidenceScore: 88,
      source: 'openai-vision',
    }

    const best = mergeMrzResults([mrzCheck, vizResult]) || vizResult

    return NextResponse.json(
      {
        success: true,
        data: best,
        ...best,
      },
      { headers: corsHeaders }
    )
  } catch (error: unknown) {
    console.error('Erreur scan passeport:', error)
    const msg = error instanceof Error ? error.message : 'Erreur lors du scan'
    return NextResponse.json({ error: msg }, { status: 500, headers: corsHeaders })
  }
}
