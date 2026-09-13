'use client'

import { useState, useEffect } from 'react'
import { usePowerSync } from '@powersync/react'
import { supabase, getUser } from '@/lib/supabase'
import { ScanLine, Loader2, Save, Upload, RotateCcw, Smartphone, CalendarDays, UserRound } from 'lucide-react'
import { uploadPassportFile } from '@/lib/hajjPassport'
import { Capacitor, CapacitorHttp } from '@capacitor/core'

// Résolution de l'URL backend pour Web, Capacitor (Android/iOS) et Tauri (Desktop)
function getApiUrl(): string {
  if (Capacitor.isNativePlatform()) {
    return 'https://gestion-pelerins.vercel.app'
  }

  if (typeof window !== 'undefined') {
    const origin = window.location.origin
    const protocol = window.location.protocol

    if (
      protocol.startsWith('tauri') ||
      protocol.startsWith('capacitor') ||
      origin.includes('tauri.localhost') ||
      (origin.includes('localhost') && !origin.includes('localhost:3000'))
    ) {
      return 'https://gestion-pelerins.vercel.app'
    }
  }

  return process.env.NEXT_PUBLIC_API_URL || ''
}

// Prétraitement d'image pour optimiser la lecture OCR même sur photo floue ou sombre
function preparePassportImage(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const img = new Image()
      img.onload = () => {
        const canvas = document.createElement('canvas')
        const ctx = canvas.getContext('2d', { willReadFrequently: true })
        if (!ctx) {
          resolve(reader.result as string)
          return
        }

        // 1. Normalisation de la résolution : largeur entre 1400px et 1800px (idéale pour OCR-B < 700 Ko)
        const targetWidth = Math.min(1800, Math.max(1400, img.width))
        const scale = targetWidth / img.width
        const targetHeight = Math.round(img.height * scale)

        canvas.width = targetWidth
        canvas.height = targetHeight

        ctx.drawImage(img, 0, 0, targetWidth, targetHeight)

        // 2. Rehaussement du contraste sur les canaux RVB
        const imgData = ctx.getImageData(0, 0, targetWidth, targetHeight)
        const d = imgData.data
        const contrast = 35 // Augmentation nette du contraste (+35%)
        const factor = (259 * (contrast + 255)) / (255 * (259 - contrast))

        for (let i = 0; i < d.length; i += 4) {
          d[i] = factor * (d[i] - 128) + 128         // R
          d[i + 1] = factor * (d[i + 1] - 128) + 128 // V
          d[i + 2] = factor * (d[i + 2] - 128) + 128 // B
        }
        ctx.putImageData(imgData, 0, 0)

        // 3. Export JPEG optimisé
        resolve(canvas.toDataURL('image/jpeg', 0.85))
      }
      img.onerror = () => resolve(reader.result as string)
      img.src = reader.result as string
    }
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

export default function AjouterPelerin() {
  const db = usePowerSync()

  // États des données
  const [nom, setNom] = useState('')
  const [prenom, setPrenom] = useState('')
  const [reference, setReference] = useState('')
  const [passeport, setPasseport] = useState('')
  const [phone, setPhone] = useState('')
  const [sexe, setSexe] = useState('') 
  const [dateNaissance, setDateNaissance] = useState('')
  const [dateExpiration, setDateExpiration] = useState('')
  const [dateInscription, setDateInscription] = useState(new Date().toISOString().split('T')[0])
  const [campagne, setCampagne] = useState<number | null>(new Date().getFullYear())
  const [associe, setAssocie] = useState('')
  const [total, setTotal] = useState(0)
  const [totalInput, setTotalInput] = useState('')
  const [paye, setPaye] = useState(0)
  const [payeInput, setPayeInput] = useState('')
  const [nomPackage, setNomPackage] = useState('') 
  
  // États techniques
  const [fileToUpload, setFileToUpload] = useState<File | null>(null)
  const [loading, setLoading] = useState(false)
  const [isScanning, setIsScanning] = useState(false)
  const [message, setMessage] = useState({ text: '', type: '' })
  
  // États automatiques
  const [agenceId, setAgenceId] = useState<string | null>(null)

  useEffect(() => {
    async function fetchUserAgence() {
      try {
        const { data: { user } } = await getUser()
        if (user) {
          const { data: profile } = await supabase
            .from('profiles')
            .select('agence_id')
            .eq('id', user.id)
            .single()
          
          if (profile) setAgenceId(profile.agence_id)
        }
      } catch (error) {
        console.error('[AjouterPelerin] getUser error', error)
      }
    }
    fetchUserAgence()
  }, [])

  const resetForm = () => {
    setNom(''); setPrenom(''); setReference(''); setPasseport(''); setPhone(''); setSexe(''); setDateNaissance('')
    setDateExpiration(''); setDateInscription(new Date().toISOString().split('T')[0])
    setCampagne(new Date().getFullYear())
    setAssocie(''); setTotal(0); setTotalInput(''); setPaye(0); setPayeInput(''); setNomPackage(''); setFileToUpload(null)
    setMessage({ text: '', type: '' })
  }

  const sanitizeAmount = (value: string) => value.replace(/\D/g, '')
  const parseAmount = (value: string) => {
    const cleaned = sanitizeAmount(value)
    return cleaned === '' ? 0 : Number(cleaned)
  }
  const formatAmount = (value: string | number) => {
    const digits = typeof value === 'number' ? String(value) : sanitizeAmount(value)
    return digits === '' ? '' : Number(digits).toLocaleString('fr-FR')
  }

  const handleAutoFill = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const scanFile = e.target.files?.[0]
    if (!scanFile) return
    setIsScanning(true)
    setMessage({ text: "⚡ PRÉTRAITEMENT DE L'IMAGE ET SCAN EN COURS...", type: 'info' })

    try {
      // 1. Optimisation du contraste et de la résolution côté client
      const optimizedImageUrl = await preparePassportImage(scanFile)

      // 2. Détermination de l'URL backend (gère Web, Capacitor et Tauri)
      const baseUrl = getApiUrl()
      const targetEndpoint = `${baseUrl}/api/scan-mrz`

      let data: any

      // 3. Requête native sous Capacitor pour éviter les restrictions WebView Android
      if (Capacitor.isNativePlatform()) {
        const nativeResponse = await CapacitorHttp.post({
          url: targetEndpoint,
          headers: { 'Content-Type': 'application/json' },
          data: { imageBase64: optimizedImageUrl },
          connectTimeout: 30000,
          readTimeout: 30000,
        })

        if (nativeResponse.status !== 200) {
          const errData = typeof nativeResponse.data === 'object' ? nativeResponse.data : {}
          throw new Error(errData?.error || `Erreur serveur (${nativeResponse.status})`)
        }

        data = typeof nativeResponse.data === 'string' ? JSON.parse(nativeResponse.data) : nativeResponse.data
      } else {
        // Mode Web standard et Tauri Desktop
        let res: Response
        try {
          res = await fetch(targetEndpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ imageBase64: optimizedImageUrl }),
          })
        } catch {
          throw new Error(
            "Impossible de joindre le serveur de scan. Vérifiez la connexion Internet de l'appareil."
          )
        }

        const rawText = await res.text()
        try {
          data = JSON.parse(rawText)
        } catch {
          if (res.status === 404) {
            throw new Error("Route d'analyse introuvable (404). Vérifiez le déploiement sur Vercel.")
          }
          throw new Error(`Réponse inattendue du serveur (${res.status}).`)
        }

        if (!res.ok) {
          throw new Error(data.error || 'Échec de la lecture du passeport.')
        }
      }

      // 4. Remplissage automatique des champs extraits
      if (data.nom) setNom(data.nom)
      if (data.prenom) setPrenom(data.prenom)
      if (data.numPasseport) setPasseport(data.numPasseport)
      if (data.sexe) setSexe(data.sexe)
      if (data.dateNaissance) setDateNaissance(data.dateNaissance)
      if (data.dateExpiration) setDateExpiration(data.dateExpiration)

      // Conserver le fichier original pour l'enregistrement ultérieur dans le dossier
      setFileToUpload(scanFile)

      setMessage({ text: "✅ PASSEPORT DÉTECTÉ ET CHAMPS PRÉ-REMPLIS !", type: 'success' })
    } catch (err: unknown) {
      console.error(err)
      const errMsg = err instanceof Error ? err.message : String(err)
      setMessage({ text: `❌ ERREUR LORS DU SCAN : ${errMsg}`, type: 'error' })
    } finally {
      setIsScanning(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!agenceId) {
      setMessage({ text: "❌ ERREUR : AUCUNE AGENCE LIÉE À VOTRE COMPTE.", type: 'error' })
      return
    }
    setLoading(true)
    try {
      let fileUrl = ''
      if (fileToUpload) {
        const uploaded = await uploadPassportFile(fileToUpload)
        fileUrl = uploaded.path
      }

      await db.execute(
        `INSERT INTO pelerins (id, nom_complet, prenom, reference, num_passeport, telephone_pelerin, sexe, date_naissance, date_expiration, date_inscription, campagne, prix_package, total_paye, nom_package, document_url, agence_id, agence_ou_personne_associee, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [crypto.randomUUID(), `${nom}`.trim(), prenom.trim(), reference || null, passeport || null, phone || null, sexe || null, dateNaissance || null, dateExpiration || null, dateInscription || null, campagne || null, total, paye, nomPackage || null, fileUrl || null, agenceId, associe || null, new Date().toISOString()],
      )
      setMessage({ text: "✅ ENREGISTRÉ AVEC SUCCÈS !", type: 'success' })
      setTimeout(resetForm, 2000)
    } catch (err: unknown) {
      console.error(err)
      const errObj = err as { message?: string; details?: string }
      const errMsg = errObj?.message || errObj?.details || 'Erreur inconnue'
      setMessage({ text: `❌ ERREUR : ${errMsg}`, type: 'error' })
    } finally { 
      setLoading(false) 
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-0 md:p-6 lg:p-8">
      <div className="w-full max-w-6xl">
        <div className="bg-white md:rounded-[2.5rem] shadow-xl border border-gray-100 p-5 md:p-10 min-h-screen md:min-h-0">
          
          <div className="text-center mb-8">
            <h2 className="text-2xl md:text-4xl font-black text-gray-900 uppercase tracking-tighter">Nouveau Dossier</h2>
            <p className="text-gray-400 font-bold uppercase text-[10px] tracking-widest mt-1 italic">Gestion Immédiate</p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-8 items-start">
            
            {/* BLOC GAUCHE */}
            <div className="lg:col-span-5 space-y-5 lg:sticky lg:top-24">
              <div className="p-5 bg-blue-50/70 rounded-3xl border-2 border-dashed border-blue-200 shadow-inner">
                <div className="flex items-center justify-between mb-3">
                  <label className="text-[10px] font-black text-blue-900 uppercase italic flex items-center gap-2">
                    <Smartphone size={14} /> 1. Scan Rapide (Optionnel)
                  </label>
                  {isScanning && <Loader2 className="animate-spin text-blue-600" size={18} />}
                </div>
                
                <label className="flex items-center justify-center w-full py-5 bg-white rounded-2xl border-2 border-blue-100 cursor-pointer hover:border-blue-300 active:scale-95 transition-all shadow-sm">
                  <ScanLine className="mr-2 text-blue-600" size={20} />
                  <span className="text-[11px] font-black text-blue-600 uppercase">
                    {isScanning ? "Analyse..." : "Scanner Passeport"}
                  </span>
                  <input type="file" className="hidden" accept="image/*" onChange={handleAutoFill} disabled={isScanning} />
                </label>
              </div>

              <div className="bg-gray-50 p-4 rounded-2xl border border-gray-100 flex items-center justify-between px-4">
                <p className="text-[9px] font-black text-gray-400 uppercase tracking-tighter italic">2. Formulaire Client</p>
                <button type="button" onClick={resetForm} className="text-[9px] font-black text-red-500 hover:text-red-700 flex items-center gap-1 uppercase bg-white px-3 py-1.5 rounded-xl border border-gray-200/60 shadow-sm transition-all active:scale-95">
                  <RotateCcw size={10} /> Réinitialiser
                </button>
              </div>

              {fileToUpload && (
                <div className="p-3.5 bg-gray-50 border border-gray-200 rounded-2xl text-xs font-bold text-gray-600 truncate flex items-center gap-2">
                  <Upload size={14} className="text-gray-400 shrink-0" />
                  <span className="truncate">{fileToUpload.name}</span>
                </div>
              )}
            </div>

            {/* BLOC DROIT */}
            <form onSubmit={handleSubmit} className="lg:col-span-7 space-y-5">
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="text-[10px] font-black text-gray-400 uppercase ml-4 mb-1 block">Nom (Obligatoire)</label>
                  <input 
                    type="text" value={nom} onChange={(e) => setNom(e.target.value)}
                    className="w-full px-5 py-4 rounded-2xl border-2 border-gray-100 bg-gray-50 text-gray-900 text-base font-bold focus:border-blue-600 outline-none transition-all uppercase"
                    placeholder="NOM" required 
                  />
                </div>
                <div>
                  <label className="text-[10px] font-black text-gray-400 uppercase ml-4 mb-1 block">Prénom (Obligatoire)</label>
                  <input 
                    type="text" value={prenom} onChange={(e) => setPrenom(e.target.value)}
                    className="w-full px-5 py-4 rounded-2xl border-2 border-gray-100 bg-gray-50 text-gray-900 text-base font-bold focus:border-blue-600 outline-none transition-all uppercase"
                    placeholder="PRÉNOM" required 
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="text-[10px] font-black text-blue-600 uppercase ml-4 mb-1 flex items-center gap-1">
                    <CalendarDays size={12}/> Date d'inscription (Optionnel)
                  </label>
                  <input 
                    type="date" value={dateInscription} onChange={(e) => setDateInscription(e.target.value)}
                    className="w-full px-5 py-4 rounded-2xl border-2 border-blue-50 bg-blue-50/30 text-gray-900 font-bold focus:border-blue-600 outline-none"
                  />
                </div>

                <div>
                  <label className="text-[10px] font-black text-gray-400 uppercase ml-4 mb-1 block">Campagne (Optionnel)</label>
                  <select
                    value={campagne ?? ''}
                    onChange={(e) => setCampagne(e.target.value ? Number(e.target.value) : null)}
                    className="w-full px-5 py-4 rounded-2xl border-2 border-gray-100 bg-gray-50 text-gray-900 font-bold focus:border-blue-600 outline-none appearance-none"
                  >
                    <option value="">SÉLECTIONNER</option>
                    {(() => {
                      const start = 2024
                      const end = new Date().getFullYear() + 100
                      const opts = [] as number[]
                      for (let y = start; y <= end; y++) opts.push(y)
                      return opts.map(y => <option key={y} value={y}>{y}</option>)
                    })()}
                  </select>
                </div>

                <div>
                  <label className="text-[10px] font-black text-gray-400 uppercase ml-4 mb-1 flex items-center gap-1">
                    <UserRound size={12}/> Sexe (Optionnel)
                  </label>
                  <select
                    value={sexe}
                    onChange={(e) => setSexe(e.target.value)}
                    className="w-full px-5 py-4 rounded-2xl border-2 border-gray-100 bg-gray-50 text-gray-900 font-bold focus:border-blue-600 outline-none transition-all appearance-none cursor-pointer"
                    style={{ backgroundImage: 'url("data:image/svg+xml;utf8,<svg xmlns=\'http://www.w3.org/2000/svg\' width=\'24\' height=\'24\' viewBox=\'0 0 24 24\' fill=\'none\' stroke=\'%236b7280\' stroke-width=\'2\' stroke-linecap=\'round\' stroke-linejoin=\'round\'><polyline points=\'6 9 12 15 18 9\'></polyline></svg>")', backgroundRepeat: 'no-repeat', backgroundPosition: 'right 1.25rem center', backgroundSize: '1rem' }}
                  >
                    <option value="">SÉLECTIONNER</option>
                    <option value="HOMME">HOMME</option>
                    <option value="FEMME">FEMME</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-[10px] font-black text-gray-400 uppercase ml-4 mb-1 block">Référence (Optionnel)</label>
                  <input 
                    type="text" value={reference} onChange={(e) => setReference(e.target.value)}
                    className="w-full px-5 py-4 rounded-2xl border-2 border-gray-100 bg-gray-50 text-gray-900 font-bold focus:border-blue-600 outline-none uppercase"
                    placeholder="GRP-A"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-black text-gray-400 uppercase ml-4 mb-1 block">N° Passeport (Optionnel)</label>
                  <input 
                    type="text" value={passeport} onChange={(e) => setPasseport(e.target.value)}
                    className="w-full px-5 py-4 rounded-2xl border-2 border-gray-100 bg-gray-50 text-gray-900 font-bold focus:border-blue-600 outline-none"
                    placeholder="A000000"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="text-[10px] font-black text-gray-400 uppercase ml-4 mb-1 block">Intermédiaire / Agence (Optionnel)</label>
                  <input 
                    type="text" value={associe} onChange={(e) => setAssocie(e.target.value)}
                    className="w-full px-5 py-4 rounded-2xl border-2 border-gray-100 bg-gray-50 text-gray-900 font-bold focus:border-blue-600 outline-none uppercase"
                    placeholder="NOM DE L'ASSOCIÉ" 
                  />
                </div>
                <div>
                  <label className="text-[10px] font-black text-gray-400 uppercase ml-4 mb-1 block">Téléphone (Optionnel)</label>
                  <input 
                    type="text" value={phone} onChange={(e) => setPhone(e.target.value)}
                    className="w-full px-5 py-4 rounded-2xl border-2 border-gray-100 bg-gray-50 text-gray-900 font-bold focus:border-blue-600 outline-none"
                    placeholder="70 00 00 00" 
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-[10px] font-black text-gray-400 uppercase ml-4 mb-1 block">Naissance (Optionnel)</label>
                  <input 
                    type="date" value={dateNaissance} onChange={(e) => setDateNaissance(e.target.value)}
                    className="w-full px-4 py-4 rounded-2xl border-2 border-gray-100 bg-gray-50 text-gray-900 font-bold text-sm outline-none"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-black text-gray-400 uppercase ml-4 mb-1 block">Exp. Passeport (Optionnel)</label>
                  <input 
                    type="date" value={dateExpiration} onChange={(e) => setDateExpiration(e.target.value)}
                    className="w-full px-4 py-4 rounded-2xl border-2 border-gray-100 bg-gray-50 text-gray-900 font-bold text-sm outline-none"
                  />
                </div>
              </div>

              <label className="flex items-center px-5 py-4 bg-gray-100/80 rounded-2xl border-2 border-transparent hover:border-gray-200 active:border-gray-300 transition-all cursor-pointer shadow-sm">
                <Upload size={18} className="text-gray-400 mr-3" />
                <span className="text-xs font-bold text-gray-500 truncate">
                  {fileToUpload ? fileToUpload.name : "Joindre le fichier du passeport (PDF, Image) (Optionnel)"}
                </span>
                <input type="file" className="hidden" onChange={(e) => setFileToUpload(e.target.files?.[0] || null)} />
              </label>

              <div className="grid grid-cols-2 gap-4">
                <div className="bg-gray-900 p-4 rounded-2xl shadow-inner">
                  <label className="text-[9px] font-black text-gray-400 uppercase mb-1 block">Prix Total (Obligatoire)</label>
                  <input 
                    type="text" inputMode="numeric" pattern="[0-9\s]*" value={totalInput}
                    onChange={(e) => {
                      setTotalInput(formatAmount(e.target.value))
                      setTotal(parseAmount(e.target.value))
                    }}
                    className="w-full bg-transparent text-white font-black text-lg outline-none" required
                  />
                </div>
                <div className="bg-green-600 p-4 rounded-2xl shadow-inner">
                  <label className="text-[9px] font-black text-green-200 uppercase mb-1 block">Acompte (Optionnel)</label>
                  <input 
                    type="text" inputMode="numeric" pattern="[0-9\s]*" value={payeInput}
                    onChange={(e) => {
                      setPayeInput(formatAmount(e.target.value))
                      setPaye(parseAmount(e.target.value))
                    }}
                    className="w-full bg-transparent text-white font-black text-lg outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="text-[10px] font-black text-gray-400 uppercase ml-4 mb-1 block">Nom du Package (Optionnel)</label>
                <input 
                  type="text" value={nomPackage} onChange={(e) => setNomPackage(e.target.value)}
                  className="w-full px-5 py-4 rounded-2xl border-2 border-gray-100 bg-gray-50 text-gray-900 text-base font-bold focus:border-blue-600 outline-none transition-all uppercase"
                  placeholder="Ex: PREMIUM, ÉCONOMIQUE, ETC."
                />
              </div>

              <div className="flex justify-between items-center px-5 py-4 bg-gray-100 rounded-2xl border border-gray-200/50 shadow-sm">
                 <span className="text-[10px] font-black uppercase text-gray-500 tracking-wider">Reste à payer :</span>
                 <span className="font-black text-lg text-gray-900">{(total - paye).toLocaleString()} CFA</span>
              </div>

              <button 
                type="submit" disabled={loading || !agenceId}
                className={`w-full py-5 rounded-2xl text-white font-black text-lg shadow-lg active:scale-95 transition-all flex items-center justify-center gap-3 ${loading || !agenceId ? 'bg-gray-400 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700 shadow-blue-600/20'}`}
              >
                {loading ? <Loader2 className="animate-spin" /> : <Save size={20} />}
                {loading ? "ENREGISTREMENT..." : "VALIDER LE DOSSIER"}
              </button>

              {message.text && (
                <div className={`p-4 rounded-2xl text-center font-bold text-[10px] uppercase tracking-wider shadow-sm border ${message.type === 'success' ? 'bg-green-100 text-green-700 border-green-200' : 'bg-red-100 text-red-700 border-red-200'}`}>
                  {message.text}
                </div>
              )}
            </form>

          </div>

        </div>
      </div>
    </div>
  )
}