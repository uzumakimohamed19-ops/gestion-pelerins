'use client'
import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { ScanLine, Loader2, Save, Upload, UserPlus, RotateCcw, Smartphone } from 'lucide-react'

export default function AjouterPelerin() {
  // États des données
  const [nom, setNom] = useState('')
  const [passeport, setPasseport] = useState('')
  const [phone, setPhone] = useState('')
  const [dateNaissance, setDateNaissance] = useState('')
  const [dateExpiration, setDateExpiration] = useState('')
  const [total, setTotal] = useState(0)
  const [paye, setPaye] = useState(0)
  
  // États techniques
  const [fileToUpload, setFileToUpload] = useState<File | null>(null)
  const [loading, setLoading] = useState(false)
  const [isScanning, setIsScanning] = useState(false)
  const [message, setMessage] = useState({ text: '', type: '' })
  
  // --- NOUVEAU : État pour l'agence automatique ---
  const [agenceId, setAgenceId] = useState<string | null>(null)

  // --- NOUVEAU : Récupération du profil au chargement ---
  useEffect(() => {
    async function fetchUserAgence() {
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('agence_id')
          .eq('id', user.id)
          .single()
        
        if (profile) setAgenceId(profile.agence_id)
      }
    }
    fetchUserAgence()
  }, [])

  const resetForm = () => {
    setNom(''); setPasseport(''); setPhone(''); setDateNaissance('');
    setDateExpiration(''); setTotal(0); setPaye(0); setFileToUpload(null);
    setMessage({ text: '', type: '' });
  }

  // --- LOGIQUE DE SCAN (INCHANGÉE) ---
  const handleAutoFill = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const scanFile = e.target.files?.[0]
    if (!scanFile) return
    setIsScanning(true)
    setMessage({ text: "SCAN PROFOND DU PASSEPORT...", type: 'info' })

    try {
      const { createWorker } = await import('tesseract.js')
      const worker = await createWorker('fra', 1, {
        workerPath: '/tesseract/worker.min.js',
        corePath: '/tesseract/tesseract-core-simd.wasm.js',
        langPath: '/tesseract/',
        gzip: true,
      })

      await worker.setParameters({
        _tessedit_pageseg_mode: '1',
      })

      const { data: { text } } = await worker.recognize(scanFile)
      const rawLines = text.toUpperCase().split('\n')
      const mrzLines = rawLines.map(l => l.replace(/\s/g, '')).filter(l => l.includes('<<'))
      
      if (mrzLines.length >= 2) {
        const line1 = mrzLines[mrzLines.length - 2]
        const line2 = mrzLines[mrzLines.length - 1]
        const namePart = line1.substring(5)
        const [last, first] = namePart.split('<<')
        setNom(`${last.replace(/</g, ' ')} ${first ? first.split('<')[0].replace(/</g, ' ') : ''}`.trim())
        setPasseport(line2.substring(0, 9).replace(/</g, ''))
        
        const dobRaw = line2.substring(13, 19)
        const expRaw = line2.substring(21, 27)
        const yearPrefix = parseInt(dobRaw.substring(0, 2)) > 26 ? '19' : '20'
        setDateNaissance(`${yearPrefix}${dobRaw.substring(0, 2)}-${dobRaw.substring(2, 4)}-${dobRaw.substring(4, 6)}`)
        setDateExpiration(`20${expRaw.substring(0, 2)}-${expRaw.substring(2, 4)}-${expRaw.substring(4, 6)}`)
        setMessage({ text: "✅ SCAN MRZ RÉUSSI !", type: 'success' })
      } else {
        setMessage({ text: "MRZ ILLISIBLE, TENTATIVE DE LECTURE DU TEXTE...", type: 'info' })
        rawLines.forEach((line, index) => {
          if (line.includes("NOM") || line.includes("SURNAME")) {
            const nextLine = rawLines[index + 1] || ""
            if (nextLine.length > 2) setNom(prev => prev || nextLine.trim())
          }
          const passportMatch = line.match(/[A-Z][0-9]{7,8}/)
          if (passportMatch) setPasseport(passportMatch[0])
          const dateMatch = line.match(/(\d{2})[\/\.\s](\d{2})[\/\.\s](\d{4})/)
          if (dateMatch) {
            const formattedDate = `${dateMatch[3]}-${dateMatch[2]}-${dateMatch[1]}`
            if (line.includes("NAISSANCE") || line.includes("BIRTH")) setDateNaissance(formattedDate)
            else if (line.includes("EXPIRATION") || line.includes("EXPIRE")) setDateExpiration(formattedDate)
          }
        })
        if (nom || passeport) setMessage({ text: "✅ LECTURE PARTIELLE RÉUSSIE.", type: 'success' })
        else setMessage({ text: "❌ ÉCHEC DE LECTURE.", type: 'error' })
      }
      await worker.terminate()
    } catch (err) {
      setMessage({ text: "❌ ERREUR MOTEUR OCR.", type: 'error' })
    } finally {
      setIsScanning(false)
    }
  }

  // --- LOGIQUE DE SOUMISSION (MISE À JOUR) ---
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!agenceId) {
      setMessage({ text: "❌ ERREUR : AUCUNE AGENCE LIÉE À VOTRE COMPTE.", type: 'error' })
      return
    }

    setLoading(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error("Session expirée")

      let fileUrl = ''
      if (fileToUpload) {
        const fileName = `${Date.now()}-${fileToUpload.name}`
        const { error: upErr } = await supabase.storage.from('passeports').upload(fileName, fileToUpload)
        if (upErr) throw upErr
        fileUrl = fileName
      }

      // Utilisation des nouveaux noms de colonnes : agence_id, nom_complet, num_passeport, telephone_pelerin
      const { error } = await supabase.from('pelerins').insert([{
        nom_complet: nom, 
        num_passeport: passeport, 
        telephone_pelerin: phone, // Nom corrigé selon SQL
        date_naissance: dateNaissance, 
        date_expiration: dateExpiration,
        prix_package: total,       // Nom corrigé selon SQL
        total_paye: paye,          // Nom corrigé selon SQL
        document_url: fileUrl, 
        agence_id: agenceId        // ID automatique
      }])

      if (error) throw error
      setMessage({ text: "✅ DOSSIER ENREGISTRÉ AVEC SUCCÈS !", type: 'success' })
      setTimeout(resetForm, 2000)
    } catch (err: any) {
      setMessage({ text: "❌ ERREUR : " + err.message, type: 'error' })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-10">
      <div className="bg-white rounded-[2.5rem] shadow-2xl border border-gray-100 p-8 md:p-12">
        
        <div className="text-center mb-10">
          <h2 className="text-4xl font-black text-gray-900 uppercase tracking-tighter">Nouveau Dossier</h2>
          <p className="text-gray-400 font-bold uppercase text-xs tracking-[0.3em] mt-2 italic">Enregistrement Pèlerin</p>
        </div>

        {/* SECTION SCAN RAPIDE */}
        <div className="mb-10 p-6 bg-blue-50 rounded-[2rem] border-2 border-dashed border-blue-200">
          <div className="flex items-center justify-between mb-4">
            <label className="text-xs font-black text-blue-900 uppercase italic tracking-wider flex items-center gap-2">
              <Smartphone size={16} /> 1. Auto-remplissage par Scan
            </label>
            {isScanning && <Loader2 className="animate-spin text-blue-600" size={20} />}
          </div>
          
          <label className="flex items-center justify-center w-full py-4 bg-white rounded-2xl border-2 border-blue-100 cursor-pointer hover:bg-blue-100 transition-all group">
            <ScanLine className="mr-3 text-blue-600 group-hover:scale-110 transition-transform" size={20} />
            <span className="text-xs font-black text-blue-600 uppercase">Choisir la photo du passeport</span>
            <input type="file" className="hidden" accept="image/*" onChange={handleAutoFill} disabled={isScanning} />
          </label>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="flex items-center justify-between px-2">
            <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest italic">2. Informations & Pièce jointe</p>
            <button type="button" onClick={resetForm} className="text-[10px] font-black text-gray-300 hover:text-red-500 flex items-center gap-1 uppercase transition-colors">
              <RotateCcw size={12} /> Vider
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="md:col-span-2">
              <input 
                type="text" value={nom} onChange={(e) => setNom(e.target.value)}
                className="w-full px-6 py-5 rounded-2xl border-2 border-gray-100 bg-gray-50 text-gray-900 text-lg font-bold focus:border-blue-600 outline-none transition-all uppercase"
                placeholder="NOM COMPLET DU PELERIN" required 
              />
            </div>

            <div>
              <label className="text-[10px] font-black text-gray-400 uppercase ml-4 mb-1 block">N° Passeport</label>
              <input 
                type="text" value={passeport} onChange={(e) => setPasseport(e.target.value)}
                className="w-full px-6 py-4 rounded-2xl border-2 border-gray-100 bg-gray-50 text-gray-900 font-bold focus:border-blue-600 outline-none"
                placeholder="EX: A1234567" required 
              />
            </div>

            <div>
              <label className="text-[10px] font-black text-gray-400 uppercase ml-4 mb-1 block">Téléphone</label>
              <input 
                type="tel" value={phone} onChange={(e) => setPhone(e.target.value)}
                className="w-full px-6 py-4 rounded-2xl border-2 border-gray-100 bg-gray-50 text-gray-900 font-bold focus:border-blue-600 outline-none"
                placeholder="VOTRE NUMÉRO" 
              />
            </div>

            <div>
              <label className="text-[10px] font-black text-gray-400 uppercase ml-4 mb-1 block">Date de Naissance</label>
              <input 
                type="date" value={dateNaissance} onChange={(e) => setDateNaissance(e.target.value)}
                className="w-full px-6 py-4 rounded-2xl border-2 border-gray-100 bg-gray-50 text-gray-900 font-bold focus:border-blue-600 outline-none"
              />
            </div>

            <div>
              <label className="text-[10px] font-black text-gray-400 uppercase ml-4 mb-1 block">Expiration Passeport</label>
              <input 
                type="date" value={dateExpiration} onChange={(e) => setDateExpiration(e.target.value)}
                className="w-full px-6 py-4 rounded-2xl border-2 border-gray-100 bg-gray-50 text-gray-900 font-bold focus:border-blue-600 outline-none"
              />
            </div>

            <div className="md:col-span-2">
              <label className="text-[10px] font-black text-gray-400 uppercase ml-4 mb-1 block tracking-widest">📎 Document à enregistrer (Photo/PDF)</label>
              <label className="flex items-center px-6 py-4 bg-gray-100 rounded-2xl border-2 border-transparent hover:border-gray-300 cursor-pointer transition-all">
                <Upload size={18} className="text-gray-400 mr-3" />
                <span className="text-sm font-bold text-gray-500 truncate">
                  {fileToUpload ? fileToUpload.name : "Joindre le fichier final"}
                </span>
                <input type="file" className="hidden" onChange={(e) => setFileToUpload(e.target.files?.[0] || null)} />
              </label>
            </div>

            <div className="pt-4 md:col-span-2 border-t border-gray-50 grid grid-cols-2 gap-4">
              <div>
                <label className="text-[10px] font-black text-gray-900 uppercase ml-4 mb-1 block">Prix Total (CFA)</label>
                <input 
                  type="number" value={total} onChange={(e) => setTotal(Number(e.target.value))}
                  className="w-full px-6 py-4 rounded-2xl border-2 border-gray-100 bg-gray-50 text-gray-900 font-black text-xl outline-none focus:border-black"
                />
              </div>
              <div>
                <label className="text-[10px] font-black text-green-600 uppercase ml-4 mb-1 block">Acompte (CFA)</label>
                <input 
                  type="number" value={paye} onChange={(e) => setPaye(Number(e.target.value))}
                  className="w-full px-6 py-4 rounded-2xl border-2 border-gray-100 bg-green-50 text-green-700 font-black text-xl outline-none focus:border-green-600"
                />
              </div>
            </div>
            <div className="md:col-span-2 bg-blue-50 border border-blue-100 rounded-2xl p-4 mt-4">
              <p className="text-xs font-black text-blue-600 uppercase tracking-widest">BLOC COMPTABILITÉ</p>
              <div className="mt-2 grid grid-cols-3 gap-3 text-sm font-bold">
                <div className="p-3 bg-white rounded-xl border border-gray-100">
                  <p className="text-gray-400 uppercase text-[10px]">Total</p>
                  <p className="text-gray-800">{total.toLocaleString()} CFA</p>
                </div>
                <div className="p-3 bg-white rounded-xl border border-gray-100">
                  <p className="text-gray-400 uppercase text-[10px]">Acompte</p>
                  <p className="text-gray-800">{paye.toLocaleString()} CFA</p>
                </div>
                <div className={`p-3 rounded-xl border ${paye > total ? 'border-red-400 bg-red-50' : 'border-green-400 bg-green-50'}`}>
                  <p className="text-gray-400 uppercase text-[10px]">Reste à payer</p>
                  <p className="text-gray-900">{Math.max(0, total - paye).toLocaleString()} CFA</p>
                </div>
              </div>
              {paye > total && <p className="text-[10px] text-red-600 mt-2 font-black">Attention : l'acompte dépasse le montant total.</p>}
            </div>
          </div>

          <button 
            type="submit" disabled={loading || !agenceId}
            className={`w-full py-6 rounded-[2rem] text-white font-black text-xl shadow-2xl transition-all flex items-center justify-center gap-4 ${loading || !agenceId ? 'bg-gray-400' : 'bg-gray-900 hover:bg-black hover:scale-[1.01]'}`}
          >
            {loading ? <Loader2 className="animate-spin" /> : <Save size={24} />}
            {loading ? "EN COURS..." : "CONFIRMER L'ENREGISTREMENT"}
          </button>
        </form>
        
        {message.text && (
          <div className={`mt-8 p-5 rounded-2xl text-center font-black text-xs uppercase tracking-widest animate-pulse ${message.type === 'success' ? 'bg-green-100 text-green-700' : message.type === 'error' ? 'bg-red-100 text-red-700' : 'bg-blue-100 text-blue-700'}`}>
            {message.text}
          </div>
        )}
      </div>
    </div>
  )
}