'use client'
import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { supabase } from '../../../lib/supabase'
import { Save, ArrowLeft, Loader2, Upload, FileCheck, AlertCircle } from 'lucide-react'
import Link from 'next/link'

export default function ModifierPelerin() {
  const { id } = useParams()
  const router = useRouter()
  
  const [nom, setNom] = useState('')
  const [passeport, setPasseport] = useState('')
  const [total, setTotal] = useState(0)
  const [paye, setPaye] = useState(0)
  const [phone, setPhone] = useState('')
  
  const [loading, setLoading] = useState(true)
  const [updating, setUpdating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [file, setFile] = useState<File | null>(null)
  const [currentDocUrl, setCurrentDocUrl] = useState('')

  useEffect(() => {
    async function getPelerin() {
      try {
        const { data, error } = await supabase
          .from('pelerins')
          .select('*')
          .eq('id', id)
          .single()

        if (error) throw error

        if (data) {
          setNom(data.nom_complet || '')
          setPasseport(data.num_passeport || '')
          setTotal(data.montant_total || 0)
          setPaye(data.montant_paye || 0)
          setPhone(data.telephone || '')
          setCurrentDocUrl(data.document_url || '')
        }
      } catch (err: any) {
        setError("Impossible de charger le pèlerin : " + err.message)
      } finally {
        setLoading(false)
      }
    }
    getPelerin()
  }, [id])

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault()
    setUpdating(true)
    setError(null)
    
    try {
      let finalDocUrl = currentDocUrl

      // 1. Gestion de l'Upload
      if (file) {
        const fileExt = file.name.split('.').pop()
        const fileName = `${Date.now()}.${fileExt}` // Nom plus propre et unique

        const { error: uploadError } = await supabase.storage
          .from('passeports')
          .upload(fileName, file)

        if (uploadError) throw new Error("Erreur scan: " + uploadError.message)
        finalDocUrl = fileName
      }
      
      // 2. Mise à jour Base de données
      // Vérifie bien que ces noms correspondent à ta table Supabase
      const { error: updateError } = await supabase
        .from('pelerins')
        .update({ 
          nom_complet: nom, 
          num_passeport: passeport,
          total_paye: total,
          prix_package: paye,
          telephone_pelerin: phone,
          document_url: finalDocUrl 
        })
        .eq('id', id)

      if (updateError) throw updateError

      // 3. Redirection
      router.push('/liste-pelerins')
      router.refresh() // Force le rafraîchissement des données sur la page liste

    } catch (err: any) {
      console.error(err)
      setError(err.message)
      setUpdating(false)
    }
  }

  if (loading) return (
    <div className="flex h-screen items-center justify-center bg-gray-50">
      <Loader2 className="animate-spin text-blue-600" size={40} />
    </div>
  )

  return (
    <div className="max-w-3xl mx-auto px-4 py-10">
      <Link href="/liste-pelerins" className="flex items-center gap-2 text-gray-500 hover:text-blue-600 font-bold mb-6 transition group">
        <ArrowLeft size={20} className="group-hover:-translate-x-1 transition-transform" /> Retour à la liste
      </Link>

      <div className="bg-white rounded-[2.5rem] shadow-xl shadow-blue-900/5 border border-gray-100 p-10">
        <h2 className="text-3xl font-black text-gray-900 mb-8 uppercase tracking-tighter">Modifier le Pèlerin</h2>
        
        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-100 rounded-2xl flex items-center gap-3 text-red-600 font-bold text-sm">
            <AlertCircle size={20} /> {error}
          </div>
        )}

        <form onSubmit={handleUpdate} className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="md:col-span-2">
              <label className="block text-xs font-black text-gray-400 mb-2 uppercase tracking-widest">Nom Complet</label>
              <input 
                type="text" value={nom} onChange={(e) => setNom(e.target.value)}
                className="w-full px-5 py-4 rounded-2xl border-2 border-gray-100 bg-gray-50 text-gray-900 font-bold focus:border-blue-600 focus:bg-white outline-none transition-all"
                required 
              />
            </div>

            <div>
              <label className="block text-xs font-black text-gray-400 mb-2 uppercase tracking-widest">N° Passeport</label>
              <input 
                type="text" value={passeport} onChange={(e) => setPasseport(e.target.value)}
                className="w-full px-5 py-4 rounded-2xl border-2 border-gray-100 bg-gray-50 text-gray-900 font-bold focus:border-blue-600 focus:bg-white outline-none transition-all"
                required 
              />
            </div>

            <div>
              <label className="block text-xs font-black text-gray-400 mb-2 uppercase tracking-widest">Téléphone</label>
              <input 
                type="tel" 
                value={phone} 
                onChange={(e) => setPhone(e.target.value)}
                className="w-full px-5 py-4 rounded-2xl border-2 border-gray-100 bg-gray-50 text-gray-900 font-bold focus:border-blue-600 focus:bg-white outline-none transition-all"
              />
            </div>

            <div className="md:col-span-2 pt-4">
              <label className="block text-xs font-black text-gray-400 mb-2 uppercase tracking-widest">Scan du Passeport</label>
              <label className="flex items-center justify-center gap-3 w-full px-5 py-6 rounded-2xl border-2 border-dashed border-gray-200 bg-gray-50 hover:bg-blue-50 hover:border-blue-400 cursor-pointer transition-all">
                {file ? (
                  <div className="flex items-center gap-2 text-blue-600 font-bold">
                    <FileCheck size={24} /> {file.name}
                  </div>
                ) : (
                  <div className="flex items-center gap-2 text-gray-400 font-bold italic">
                    <Upload size={24} /> {currentDocUrl ? "Remplacer le scan actuel" : "Ajouter un scan"}
                  </div>
                )}
                <input 
                  type="file" 
                  className="hidden" 
                  accept="image/*,.pdf" 
                  onChange={(e) => setFile(e.target.files?.[0] || null)}
                />
              </label>
            </div>

            <div className="grid grid-cols-2 gap-4 md:col-span-2 pt-6 border-t border-gray-100">
                <div>
                  <label className="block text-xs font-black text-gray-400 mb-2 uppercase tracking-widest">Total (CFA)</label>
                  <input 
                    type="number" value={total} onChange={(e) => setTotal(Number(e.target.value))}
                    className="w-full px-5 py-4 rounded-2xl border-2 border-gray-100 bg-gray-50 text-gray-900 font-bold focus:border-blue-600 outline-none transition-all"
                  />
                </div>
                <div>
                  <label className="block text-xs font-black text-gray-400 mb-2 uppercase tracking-widest">Payé (CFA)</label>
                  <input 
                    type="number" value={paye} onChange={(e) => setPaye(Number(e.target.value))}
                    className="w-full px-5 py-4 rounded-2xl border-2 border-gray-100 bg-gray-50 text-blue-600 font-bold focus:border-blue-600 outline-none transition-all"
                  />
                </div>
            </div>
          </div>

          <button 
            type="submit" 
            disabled={updating}
            className="w-full flex items-center justify-center gap-3 bg-gray-900 text-white py-5 rounded-2xl font-black text-lg shadow-xl hover:bg-blue-600 transition-all disabled:bg-gray-200 active:scale-95"
          >
            {updating ? <Loader2 className="animate-spin" /> : <Save size={24} />}
            {updating ? "ENREGISTREMENT..." : "SAUVEGARDER LES MODIFICATIONS"}
          </button>
        </form>
      </div>
    </div>
  )
}