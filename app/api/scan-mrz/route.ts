import { NextRequest, NextResponse } from 'next/server'
import { parse as parseMRZ } from 'mrz'

// Nettoyage OCR agressif pour isoler la bande MRZ
function sanitizeMRZ(raw: string): string {
  return raw
    .toUpperCase()
    .replace(/[([{«]/g, '<')
    .replace(/[)\]}»]/g, '<')
    .replace(/[^A-Z0-9<]/g, '')
}

// Correction des confusions courantes pour les chiffres
function fixDigits(val: string): string {
  return val
    .replace(/[ODQ]/g, '0')
    .replace(/[ILJ]/g, '1')
    .replace(/Z/g, '2')
    .replace(/S/g, '5')
    .replace(/B/g, '8')
}

// Formatage date YYMMDD -> YYYY-MM-DD
function formatFieldDate(d: string | null | undefined, isExpiry = false): string {
  if (!d || d.length < 6) return ''
  const clean = fixDigits(d)
  const yy = parseInt(clean.substring(0, 2), 10)
  const mm = clean.substring(2, 4)
  const dd = clean.substring(4, 6)
  const century = isExpiry ? '20' : yy > 30 ? '19' : '20'
  return `${century}${yy}-${mm}-${dd}`
}

export async function POST(req: NextRequest) {
  try {
    const { imageBase64 } = await req.json()
    if (!imageBase64) {
      return NextResponse.json({ error: 'Image manquante' }, { status: 400 })
    }

    const base64Data = imageBase64.replace(/^data:image\/\w+;base64,/, '')

    // Appel OCR.space avec votre clé personnelle gratuite
    const formData = new URLSearchParams()
    formData.append('base64Image', `data:image/jpeg;base64,${base64Data}`)
    formData.append('language', 'eng')
    formData.append('isOverlayRequired', 'false')
    formData.append('OCREngine', '2') // Moteur optimisé pour formulaires, cartes et passeports
    formData.append('scale', 'true')
    formData.append('detectOrientation', 'true')

    const ocrRes = await fetch('https://api.ocr.space/parse/image', {
      method: 'POST',
      headers: { 
        apikey: process.env.OCR_SPACE_API_KEY || 'K86855410088957' 
      },
      body: formData,
    })

    const ocrData = await ocrRes.json()
    const parsedText: string = ocrData?.ParsedResults?.[0]?.ParsedText || ''

    if (!parsedText.trim()) {
      return NextResponse.json({ 
        error: 'Texte illisible sur cette photo. Ajustez la luminosité ou le cadrage.' 
      }, { status: 422 })
    }

    // Récupération de toutes les lignes brutes
    const allLines = parsedText
      .split(/\r?\n/)
      .map(l => sanitizeMRZ(l))
      .filter(l => l.length >= 10)

    let line1 = ''
    let line2 = ''

    // 1. Détection de Ligne 1 (commence par P< ou P avec chevrons)
    const l1Index = allLines.findIndex(l => /^P[<A-Z]/.test(l) && l.includes('<<'))
    if (l1Index !== -1) {
      line1 = allLines[l1Index]
      if (l1Index + 1 < allLines.length) {
        line2 = allLines[l1Index + 1]
      }
    }

    // Recherche de secours par densité de chevrons
    if (!line1 || !line2) {
      const candidates = allLines.filter(l => (l.match(/</g) || []).length >= 3 || /[A-Z0-9]{30,}/.test(l))
      if (candidates.length >= 2) {
        line1 = candidates[candidates.length - 2]
        line2 = candidates[candidates.length - 1]
      } else if (candidates.length === 1) {
        line2 = candidates[0]
      }
    }

    // Recollement si l'OCR a tronqué la première ligne
    if (line1.length < 35 && l1Index !== -1 && l1Index + 1 < allLines.length) {
      if (allLines[l1Index + 1].includes('<')) {
        line1 += allLines[l1Index + 1]
      }
    }

    let nom = ''
    let prenom = ''
    let numPasseport = ''
    let dateNaissance = ''
    let dateExpiration = ''
    let sexe: 'HOMME' | 'FEMME' | '' = ''

    // TENTATIVE 1 : Décodage officiel ICAO TD3 (44 caractères)
    if (line1 && line2) {
      try {
        const l1_44 = (line1.length > 44 ? line1.substring(0, 44) : line1.padEnd(44, '<'))
        const l2_44 = (line2.length > 44 ? line2.substring(0, 44) : line2.padEnd(44, '<'))
        const parsed = parseMRZ([l1_44, l2_44])
        const f = parsed.fields

        nom = f.lastName ? f.lastName.trim() : ''
        prenom = f.firstName ? f.firstName.trim() : ''
        numPasseport = (f.documentNumber || '').replace(/</g, '').trim()
        dateNaissance = formatFieldDate(f.birthDate, false)
        dateExpiration = formatFieldDate(f.expirationDate, true)
        sexe = f.sex === 'male' || f.sex === 'M' ? 'HOMME' : f.sex === 'female' || f.sex === 'F' ? 'FEMME' : ''
      } catch {
        // En cas de checksum strict non validé, repli vers le mode forcé
      }
    }

    // TENTATIVE 2 : MODE FORCÉ (Fuzzy Parser)
    if (!nom || !numPasseport || !dateNaissance) {
      // A. Noms et prénoms depuis la ligne 1
      if (line1) {
        const cleanL1 = line1.replace(/^P[<A-Z0-9]{1,5}/, '')
        const tokens = cleanL1.split('<<')
        if (tokens.length >= 2) {
          nom = nom || tokens[0].replace(/</g, ' ').trim()
          prenom = prenom || tokens[1].split('<')[0].replace(/</g, ' ').trim()
        } else {
          const parts = cleanL1.split('<').filter(Boolean)
          nom = nom || parts[0] || ''
          prenom = prenom || parts[1] || ''
        }
      }

      // B. Numéro et dates depuis la ligne 2 (ou tout le texte fusionné)
      const fullText = allLines.join('')
      const targetL2 = line2 || fullText

      // Numéro de passeport
      if (!numPasseport) {
        const passMatch = targetL2.match(/([A-Z]{1,2}[0-9]{6,8})/)
        if (passMatch) {
          numPasseport = passMatch[1]
        } else if (line2.length >= 9) {
          numPasseport = line2.substring(0, 9).replace(/</g, '').trim()
        }
      }

      // Sexe et dates
      const sexPos = targetL2.search(/[0-9]{6}[0-9<][MF][0-9]{6}/)
      if (sexPos !== -1) {
        const sexChar = targetL2[sexPos + 7]
        sexe = sexChar === 'F' ? 'FEMME' : 'HOMME'
        const rawDob = targetL2.substring(sexPos, sexPos + 6)
        const rawExp = targetL2.substring(sexPos + 8, sexPos + 14)
        dateNaissance = dateNaissance || formatFieldDate(rawDob, false)
        dateExpiration = dateExpiration || formatFieldDate(rawExp, true)
      } else {
        if (targetL2.includes('F')) {
          const idx = targetL2.indexOf('F')
          if (idx >= 15 && idx <= 25) sexe = 'FEMME'
        } else if (targetL2.includes('M')) {
          const idx = targetL2.indexOf('M')
          if (idx >= 15 && idx <= 25) sexe = 'HOMME'
        }

        if (line2.length >= 28) {
          const rawDob = line2.substring(13, 19)
          const rawExp = line2.substring(21, 27)
          dateNaissance = dateNaissance || formatFieldDate(rawDob, false)
          dateExpiration = dateExpiration || formatFieldDate(rawExp, true)
        }
      }
    }

    if (!nom && !numPasseport) {
      return NextResponse.json({
        error: "Bande MRZ trop dégradée. Essayez avec un meilleur éclairage ou sans reflet.",
      }, { status: 422 })
    }

    return NextResponse.json({
      nom,
      prenom,
      numPasseport,
      dateNaissance,
      dateExpiration,
      sexe,
    })
  } catch (err: unknown) {
    console.error('Erreur API Scan MRZ:', err)
    const msg = err instanceof Error ? err.message : 'Erreur interne'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}