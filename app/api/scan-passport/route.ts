/**
 * Fichier: app/api/scan-passport/route.ts
 * 
 * Cette API Route Next.js gère le scan OCR côté serveur.
 * La clé API OpenAI reste protégée et n'est jamais exposée au client.
 */

import { NextRequest, NextResponse } from 'next/server'
import OpenAI from 'openai'

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
})

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()
    const file = formData.get('file') as File

    if (!file) {
      return NextResponse.json(
        { error: 'Aucun fichier fourni' },
        { status: 400 }
      )
    }

    // Convertir le fichier en base64
    const buffer = await file.arrayBuffer()
    const base64 = Buffer.from(buffer).toString('base64')

    // Appel à OpenAI Vision API
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: `Tu es un expert en extraction de données de passeports. 
Analyse l'image fournie et retourne un objet JSON VALIDE avec les champs suivants:
- nom: string (NOM Prénom complet)
- passeport: string (numéro du passeport)
- dateNaissance: string (format YYYY-MM-DD)
- dateExpiration: string (format YYYY-MM-DD)

Si un champ est illisible ou absent, laisse-le comme chaîne vide "".
Réponds UNIQUEMENT avec du JSON valide, aucun texte supplémentaire.`
        },
        {
          role: "user",
          content: [
            { 
              type: "text", 
              text: "Extrais les informations de ce passeport :" 
            },
            {
              type: "image_url",
              image_url: {
                url: `data:image/jpeg;base64,${base64}`,
              },
            },
          ],
        },
      ],
      response_format: { type: "json_object" }
    })

    const content = response.choices[0].message.content
    const parsedData = JSON.parse(content || '{}')

    return NextResponse.json({
      success: true,
      data: parsedData
    })

  } catch (error: any) {
    console.error('Erreur scan passeport:', error)
    return NextResponse.json(
      { error: error.message || 'Erreur lors du scan' },
      { status: 500 }
    )
  }
}