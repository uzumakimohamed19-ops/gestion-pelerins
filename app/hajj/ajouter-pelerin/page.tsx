'use client'

import { useState, useEffect } from 'react'
import { supabase, getUser } from '@/lib/supabase'
import { ScanLine, Loader2, Save, Upload, RotateCcw, Smartphone, CalendarDays, UserRound } from 'lucide-react'

// Note: Pour une implémentation réelle, le scan devrait passer par une API Route 
// pour ne pas exposer de clés secrètes côté client. 
// Cette version améliore la logique de traitement MRZ existante pour la rendre plus robuste.

export default function AjouterPelerin() {
  // États des données
  const [nom, setNom] = useState('')
  const [prenom, setPrenom] = useState('')
  const [reference, setReference] = useState('')
  const [passeport, setPasseport] = useState('')
  const [phone, setPhone] = useState('')
  const [sexe, setSexe] = useState('') // Nouvel état pour le champ Sexe
  const [dateNaissance, setDateNaissance] = useState('')
  const [dateExpiration, setDateExpiration] = useState('')
  const [dateInscription, setDateInscription] = useState(new Date().toISOString().split('T')[0])
  const [associe, setAssocie] = useState('')
  const [total, setTotal] = useState(0)
  const [totalInput, setTotalInput] = useState('')
  const [paye, setPaye] = useState(0)
  const [payeInput, setPayeInput] = useState('')
  const [nomPackage, setNomPackage] = useState('') // Nouvel état pour le package (non obligatoire)
  
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
    setNom(''); setPrenom(''); setReference(''); setPasseport(''); setPhone(''); setSexe(''); setDateNaissance('');
    setDateExpiration(''); setDateInscription(new Date().toISOString().split('T')[0]); 
    setAssocie(''); setTotal(0); setTotalInput(''); setPaye(0); setPayeInput(''); setNomPackage(''); setFileToUpload(null);
    setMessage({ text: '', type: '' });
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

  // Fonction utilitaire pour parser les dates MRZ (YYMMDD)
  const parseMRZDate = (dateStr: string, isExpiry: boolean = false) => {
    if (!dateStr || dateStr.length !== 6) return '';
    const yearPart = dateStr.substring(0, 2);
    const month = dateStr.substring(2, 4);
    const day = dateStr.substring(4, 6);
    
    let yearPrefix = '20';
    if (!isExpiry) {
      // Pour la naissance : si l'année est > 25, on assume 1900, sinon 2000
      yearPrefix = parseInt(yearPart) > 26 ? '19' : '20';
    }
    return `${yearPrefix}${yearPart}-${month}-${day}`;
  }

  const handleAutoFill = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const scanFile = e.target.files?.[0]
    if (!scanFile) return
    setIsScanning(true)
    setMessage({ text: "ANALYSE DU PASSEPORT EN COURS...", type: 'info' })

    try {
      const Tesseract = await import('tesseract.js')
      
      const result = await Tesseract.recognize(scanFile, 'fra+eng', {
        logger: m => console.log(m)
      })

      const text = result.data.text.toUpperCase()
      const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0)
      
      const mrzLines = lines.filter(l => l.includes('<<') || (l.length > 30 && /[A-Z0-9<]{30,}/.test(l)))
      
      if (mrzLines.length >= 2) {
        const line1 = mrzLines[mrzLines.length - 2].replace(/\s/g, '')
        const line2 = mrzLines[mrzLines.length - 1].replace(/\s/g, '')

        // Extraction Nom / Prénom (Ligne 1 : P<FRA<NOM<<PRENOM<<<<)
        const namePart = line1.substring(5)
        const parts = namePart.split('<<')
        const lastName = parts[0]?.replace(/</g, ' ').trim() || ''
        const firstName = parts[1]?.split('<')[0].replace(/</g, ' ').trim() || ''
        
        setNom(lastName)
        setPrenom(firstName)

        // Extraction Sexe
        const sexPart = line2.substring(20, 21)
        if (sexPart === 'M') setSexe('HOMME')
        if (sexPart === 'F') setSexe('FEMME')

        // Extraction Passeport
        const passNum = line2.substring(0, 9).replace(/</g, '')
        setPasseport(passNum)

        // Extraction Dates
        const dobRaw = line2.substring(13, 19)
        const expRaw = line2.substring(21, 27)
        
        setDateNaissance(parseMRZDate(dobRaw, false))
        setDateExpiration(parseMRZDate(expRaw, true))

        setMessage({ text: "✅ SCAN RÉUSSI (MODE MRZ)", type: 'success' })
      } else {
        // Fallback
        let detectedNom = ''
        let detectedPass = ''

        lines.forEach((line, index) => {
          if (line.includes("NOM") || line.includes("SURNAME") || line.includes("NAME")) {
            const nextLine = lines[index + 1] || ""
            if (nextLine.length > 2 && !detectedNom) detectedNom = nextLine.trim()
          }
          const passportMatch = line.match(/[A-Z][0-9]{7,8}/)
          if (passportMatch && !detectedPass) detectedPass = passportMatch[0]
        })

        if (detectedNom) setNom(detectedNom)
        if (detectedPass) setPasseport(detectedPass)
        
        setMessage({ text: "✅ LECTURE TERMINÉE (MODE TEXTE)", type: 'success' })
      }
    } catch (err) {
      console.error(err)
      setMessage({ text: "❌ ERREUR LORS DU SCAN.", type: 'error' })
    } finally { 
      setIsScanning(false) 
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!agenceId) {
      setMessage({ text: "❌ ERREUR : AUCUNE AGENCE LIÉE.", type: 'error' })
      return
    }
    setLoading(true)
    try {
      let fileUrl = ''
      if (fileToUpload) {
        const fileName = `${Date.now()}-${fileToUpload.name}`
        const { error: upErr } = await supabase.storage.from('passeports').upload(fileName, fileToUpload)
        if (upErr) throw upErr
        fileUrl = fileName
      }

      const { error } = await supabase.from('pelerins').insert([{
        nom_complet: `${nom}`.trim(), 
        prenom: prenom, // Correspondance exacte avec votre base de données
        reference: reference, 
        num_passeport: passeport, 
        telephone_pelerin: phone, 
        sexe: sexe, // Enregistrement de la nouvelle colonne sexe
        date_naissance: dateNaissance, 
        date_expiration: dateExpiration,
        date_inscription: dateInscription,
        prix_package: total, 
        total_paye: paye, 
        nom_package: nomPackage || null, // Ajout du champ optionnel
        document_url: fileUrl, 
        agence_id: agenceId,
        agence_ou_personne_associee: associe 
      }])

      if (error) throw error
      setMessage({ text: "✅ ENREGISTRÉ AVEC SUCCÈS !", type: 'success' })
      setTimeout(resetForm, 2000)
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Erreur inconnue'
      setMessage({ text: "❌ ERREUR : " + message, type: 'error' })
    } finally { setLoading(false) }
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-0 md:p-6 lg:p-8">
      <div className="w-full max-w-6xl">
        <div className="bg-white md:rounded-[2.5rem] shadow-xl border border-gray-100 p-5 md:p-10 min-h-screen md:min-h-0">
          
          <div className="text-center mb-8">
            <h2 className="text-2xl md:text-4xl font-black text-gray-900 uppercase tracking-tighter">Nouveau Dossier</h2>
            <p className="text-gray-400 font-bold uppercase text-[10px] tracking-widest mt-1 italic">Gestion Immédiate</p>
          </div>

          {/* Grille responsive : empilée sur mobile, 12 colonnes côte à côte sur ordinateur */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-8 items-start">
            
            {/* BLOC GAUCHE PC : SCAN & ACTIONS SECONDAIRES (Prend 5 colonnes sur 12) */}
            <div className="lg:col-span-5 space-y-5 lg:sticky lg:top-24">
              {/* SECTION SCAN */}
              <div className="p-5 bg-blue-50/70 rounded-3xl border-2 border-dashed border-blue-200 shadow-inner">
                <div className="flex items-center justify-between mb-3">
                  <label className="text-[10px] font-black text-blue-900 uppercase italic flex items-center gap-2">
                    <Smartphone size={14} /> 1. Scan Rapide
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

              {/* SECTION CONTRÔLE DE RÉINITIALISATION */}
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

            {/* BLOC DROIT PC : CHAMPS DU FORMULAIRE (Prend 7 colonnes sur 12) */}
            <form onSubmit={handleSubmit} className="lg:col-span-7 space-y-5">
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="text-[10px] font-black text-gray-400 uppercase ml-4 mb-1 block">Nom</label>
                  <input 
                    type="text" value={nom} onChange={(e) => setNom(e.target.value)}
                    className="w-full px-5 py-4 rounded-2xl border-2 border-gray-100 bg-gray-50 text-gray-900 text-base font-bold focus:border-blue-600 outline-none transition-all uppercase"
                    placeholder="NOM" required 
                  />
                </div>
                <div>
                  <label className="text-[10px] font-black text-gray-400 uppercase ml-4 mb-1 block">Prénom</label>
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
                    <CalendarDays size={12}/> Date d'inscription
                  </label>
                  <input 
                    type="date" value={dateInscription} onChange={(e) => setDateInscription(e.target.value)}
                    className="w-full px-5 py-4 rounded-2xl border-2 border-blue-50 bg-blue-50/30 text-gray-900 font-bold focus:border-blue-600 outline-none"
                  />
                </div>

                {/* NOUVEAU CHAMP SEXE TOTALEMENT RESPONSIVE */}
                <div>
                  <label className="text-[10px] font-black text-gray-400 uppercase ml-4 mb-1 flex items-center gap-1">
                    <UserRound size={12}/> Sexe
                  </label>
                  <select
                    value={sexe}
                    onChange={(e) => setSexe(e.target.value)}
                    required
                    className="w-full px-5 py-4 rounded-2xl border-2 border-gray-100 bg-gray-50 text-gray-900 font-bold focus:border-blue-600 outline-none transition-all appearance-none cursor-pointer"
                    style={{ backgroundImage: 'url("data:image/svg+xml;utf8,<svg xmlns=\'http://www.w3.org/2000/svg\' width=\'24\' height=\'24\' viewBox=\'0 0 24 24\' fill=\'none\' stroke=\'%236b7280\' stroke-width=\'2\' stroke-linecap=\'round\' stroke-linejoin=\'round\'><polyline points=\'6 9 12 15 18 9\'></polyline></svg>")', backgroundRepeat: 'no-repeat', backgroundPosition: 'right 1.25rem center', backgroundSize: '1rem' }}
                  >
                    <option value="" disabled hidden>SÉLECTIONNER</option>
                    <option value="HOMME">HOMME</option>
                    <option value="FEMME">FEMME</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-[10px] font-black text-gray-400 uppercase ml-4 mb-1 block">Référence</label>
                  <input 
                    type="text" value={reference} onChange={(e) => setReference(e.target.value)}
                    className="w-full px-5 py-4 rounded-2xl border-2 border-gray-100 bg-gray-50 text-gray-900 font-bold focus:border-blue-600 outline-none uppercase"
                    placeholder="GRP-A"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-black text-gray-400 uppercase ml-4 mb-1 block">N° Passeport</label>
                  <input 
                    type="text" value={passeport} onChange={(e) => setPasseport(e.target.value)}
                    className="w-full px-5 py-4 rounded-2xl border-2 border-gray-100 bg-gray-50 text-gray-900 font-bold focus:border-blue-600 outline-none"
                    placeholder="A000000" required 
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="text-[10px] font-black text-gray-400 uppercase ml-4 mb-1 block">Intermédiaire / Agence</label>
                  <input 
                    type="text" value={associe} onChange={(e) => setAssocie(e.target.value)}
                    className="w-full px-5 py-4 rounded-2xl border-2 border-gray-100 bg-gray-50 text-gray-900 font-bold focus:border-blue-600 outline-none uppercase"
                    placeholder="NOM DE L'ASSOCIÉ" 
                  />
                </div>
                <div>
                  <label className="text-[10px] font-black text-gray-400 uppercase ml-4 mb-1 block">Téléphone</label>
                  <input 
                    type="tel" value={phone} onChange={(e) => setPhone(e.target.value)}
                    className="w-full px-5 py-4 rounded-2xl border-2 border-gray-100 bg-gray-50 text-gray-900 font-bold focus:border-blue-600 outline-none"
                    placeholder="70 00 00 00" 
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-[10px] font-black text-gray-400 uppercase ml-4 mb-1 block">Naissance</label>
                  <input 
                    type="date" value={dateNaissance} onChange={(e) => setDateNaissance(e.target.value)}
                    className="w-full px-4 py-4 rounded-2xl border-2 border-gray-100 bg-gray-50 text-gray-900 font-bold text-sm outline-none"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-black text-gray-400 uppercase ml-4 mb-1 block">Exp. Passeport</label>
                  <input 
                    type="date" value={dateExpiration} onChange={(e) => setDateExpiration(e.target.value)}
                    className="w-full px-4 py-4 rounded-2xl border-2 border-gray-100 bg-gray-50 text-gray-900 font-bold text-sm outline-none"
                  />
                </div>
              </div>

              <label className="flex items-center px-5 py-4 bg-gray-100/80 rounded-2xl border-2 border-transparent hover:border-gray-200 active:border-gray-300 transition-all cursor-pointer shadow-sm">
                <Upload size={18} className="text-gray-400 mr-3" />
                <span className="text-xs font-bold text-gray-500 truncate">
                  {fileToUpload ? fileToUpload.name : "Joindre le fichier du passeport (PDF, Image)"}
                </span>
                <input type="file" className="hidden" onChange={(e) => setFileToUpload(e.target.files?.[0] || null)} />
              </label>

              <div className="grid grid-cols-2 gap-4">
                <div className="bg-gray-900 p-4 rounded-2xl shadow-inner">
                  <label className="text-[9px] font-black text-gray-400 uppercase mb-1 block">Prix Total</label>
                  <input 
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9\s]*"
                    value={totalInput}
                    onChange={(e) => {
                      setTotalInput(formatAmount(e.target.value))
                      setTotal(parseAmount(e.target.value))
                    }}
                    className="w-full bg-transparent text-white font-black text-lg outline-none"
                  />
                </div>
                <div className="bg-green-600 p-4 rounded-2xl shadow-inner">
                  <label className="text-[9px] font-black text-green-200 uppercase mb-1 block">Acompte</label>
                  <input 
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9\s]*"
                    value={payeInput}
                    onChange={(e) => {
                      setPayeInput(formatAmount(e.target.value))
                      setPaye(parseAmount(e.target.value))
                    }}
                    className="w-full bg-transparent text-white font-black text-lg outline-none"
                  />
                </div>
              </div>

              {/* NOUVEAU CHAMP : NOM DE PACKAGE (OPTIONNEL) */}
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