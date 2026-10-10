'use client'

import React, { useState, useEffect, useRef, useTransition } from 'react'
import Link from 'next/link'
import { useQuery, usePowerSync } from '@powersync/react'
import { requireSupabaseRows, supabase, getUser } from '@/lib/supabase'
import {
  ArrowLeft,
  Building2,
  Upload,
  Image as ImageIcon,
  Save,
  CheckCircle2,
  Trash2,
  Receipt,
  Sun,
  Moon,
} from 'lucide-react'

type AgenceRow = {
  id: string
  nom_agence: string
  telephone_agence: string
  adresse_agence: string
  logo_base64?: string | null
}

// Compression optimale : JPEG léger (< 30 Ko) pour une synchronisation PowerSync ultra-rapide
async function compressImageToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      const img = new window.Image()
      img.onload = () => {
        const canvas = document.createElement('canvas')
        const MAX_WIDTH = 300
        const scaleSize = img.width > MAX_WIDTH ? MAX_WIDTH / img.width : 1
        canvas.width = Math.round(img.width * scaleSize)
        canvas.height = Math.round(img.height * scaleSize)

        const ctx = canvas.getContext('2d')
        if (!ctx) {
          resolve(e.target?.result as string)
          return
        }
        ctx.fillStyle = '#FFFFFF'
        ctx.fillRect(0, 0, canvas.width, canvas.height)
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
        resolve(canvas.toDataURL('image/jpeg', 0.8))
      }
      img.onerror = () => reject(new Error('Erreur lecture image'))
      img.src = e.target?.result as string
    }
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

export default function ConfigurationAgencePage() {
  const db = usePowerSync()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [currentUserId, setCurrentUserId] = useState<string | null>(null)
  const [logoUploading, setLogoUploading] = useState(false)
  const [successMsg, setSuccessMsg] = useState<string | null>(null)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [isSaving, startTransition] = useTransition()

  const [isDark, setIsDark] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('compta_theme_dark') === 'true'
    }
    return false
  })

  const toggleDarkMode = () => {
    setIsDark((prev) => {
      const next = !prev
      if (typeof window !== 'undefined') {
        localStorage.setItem('compta_theme_dark', String(next))
      }
      return next
    })
  }

  useEffect(() => {
    async function init() {
      const { data } = await supabase.auth.getSession()
      if (data.session?.user?.id) {
        setCurrentUserId(data.session.user.id)
      } else {
        const { data: userData } = await getUser()
        if (userData?.user?.id) setCurrentUserId(userData.user.id)
      }
    }
    init()
  }, [])

  const { data: agencesLocales } = useQuery<AgenceRow>(
    `SELECT a.id, a.nom_agence, a.telephone_agence, a.adresse_agence, a.logo_base64
     FROM profiles p
     JOIN agences a ON p.agence_id = a.id
     WHERE p.id = ?
     LIMIT 1`,
    [currentUserId ?? '']
  )

  const agenceActive = agencesLocales?.[0]

  const [nomAgence, setNomAgence] = useState('')
  const [telephoneAgence, setTelephoneAgence] = useState('')
  const [adresseAgence, setAdresseAgence] = useState('')
  const [slogan, setSlogan] = useState('')
  const [messageRecu, setMessageRecu] = useState('Les billets et prestations émis sont soumis aux conditions générales de vente. Merci de votre confiance !')
  const [logoBase64, setLogoBase64] = useState<string | null>(null)

  useEffect(() => {
    if (!agenceActive?.id) return

    setNomAgence(agenceActive.nom_agence || '')
    setTelephoneAgence(agenceActive.telephone_agence || '')
    setAdresseAgence(agenceActive.adresse_agence || '')

    if (agenceActive.logo_base64) {
      setLogoBase64(agenceActive.logo_base64)
      try {
        localStorage.setItem(`agency_receipt_logo_${agenceActive.id}`, agenceActive.logo_base64)
      } catch {}
    } else {
      const cached = localStorage.getItem(`agency_receipt_logo_${agenceActive.id}`)
      if (cached) setLogoBase64(cached)
    }

    const cachedConfigStr = localStorage.getItem(`agency_receipt_config_${agenceActive.id}`)
    if (cachedConfigStr) {
      try {
        const parsed = JSON.parse(cachedConfigStr)
        if (parsed.slogan) setSlogan(parsed.slogan)
        if (parsed.message_recu) setMessageRecu(parsed.message_recu)
      } catch {}
    }
  }, [agenceActive])

  // Téléversement avec diagnostic d'erreur précis
  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !agenceActive?.id) return

    setLogoUploading(true)
    setErrorMsg(null)

    try {
      const base64 = await compressImageToBase64(file)

      // 1. Mise à jour Supabase Cloud en priorité
      const { data, error: sbError } = await supabase
        .from('agences')
        .update({ logo_base64: base64 })
        .eq('id', agenceActive.id)
        .select('id')

      requireSupabaseRows(data, sbError, 'mise à jour du logo')
      setLogoBase64(base64)

      // 2. Mise à jour locale SQLite PowerSync
      try {
        await db.execute(
          `UPDATE agences SET logo_base64 = ? WHERE id = ?`,
          [base64, agenceActive.id]
        )
      } catch (dbErr) {
        console.warn('Erreur écriture SQLite locale (sera synchronisée via Cloud) :', dbErr)
      }

      // 3. Cache de secours local
      try {
        localStorage.setItem(`agency_receipt_logo_${agenceActive.id}`, base64)
      } catch {}

      setSuccessMsg('Logo enregistré et synchronisé avec succès.')
      setTimeout(() => setSuccessMsg(null), 3000)
    } catch (err: unknown) {
      console.error(err)
      setErrorMsg(err instanceof Error ? err.message : 'Erreur lors du traitement du logo.')
    } finally {
      setLogoUploading(false)
    }
  }

  const handleRemoveLogo = async () => {
    if (!agenceActive?.id) return
    setErrorMsg(null)

    try {
      const { data, error: sbError } = await supabase
        .from('agences')
        .update({ logo_base64: null })
        .eq('id', agenceActive.id)
        .select('id')

      requireSupabaseRows(data, sbError, 'suppression du logo')

      await db.execute(`UPDATE agences SET logo_base64 = NULL WHERE id = ?`, [agenceActive.id]).catch(() => {})
      setLogoBase64(null)
      localStorage.removeItem(`agency_receipt_logo_${agenceActive.id}`)
      
      if (fileInputRef.current) fileInputRef.current.value = ''
      setSuccessMsg('Logo supprimé.')
      setTimeout(() => setSuccessMsg(null), 2500)
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Erreur lors de la suppression.')
    }
  }

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault()
    if (!agenceActive?.id) return

    setErrorMsg(null)
    setSuccessMsg(null)

    startTransition(async () => {
      try {
        const payload = {
          nom_agence: nomAgence.trim(),
          telephone_agence: telephoneAgence.trim(),
          adresse_agence: adresseAgence.trim(),
          logo_base64: logoBase64 || null,
        }

        const { data, error: sbError } = await supabase
          .from('agences')
          .update(payload)
          .eq('id', agenceActive.id)
          .select('id')

        requireSupabaseRows(data, sbError, 'mise à jour de l’agence')

        await db.execute(
          `UPDATE agences 
           SET nom_agence = ?, telephone_agence = ?, adresse_agence = ?, logo_base64 = ?
           WHERE id = ?`,
          [
            payload.nom_agence,
            payload.telephone_agence,
            payload.adresse_agence,
            payload.logo_base64,
            agenceActive.id,
          ]
        ).catch(() => {})

        const configData = {
          slogan: slogan.trim() || null,
          message_recu: messageRecu.trim() || null,
        }
        localStorage.setItem(`agency_receipt_config_${agenceActive.id}`, JSON.stringify(configData))

        setSuccessMsg('Configuration synchronisée avec succès.')
        setTimeout(() => setSuccessMsg(null), 3500)
      } catch (err: unknown) {
        setErrorMsg(err instanceof Error ? err.message : "Erreur d'enregistrement.")
      }
    })
  }

  return (
    <div
      className={`min-h-screen pb-16 transition-colors duration-150 ${
        isDark ? 'bg-[#000000] text-[#F5F5F7]' : 'bg-slate-50/50 text-slate-800'
      }`}
    >
      {/* ─── BARRE SUPÉRIEURE ─── */}
      <div
        className={`sticky top-0 z-30 backdrop-blur-md border-b px-4 lg:px-8 py-3 transition-colors ${
          isDark ? 'bg-[#161618]/90 border-[#2C2C2E]' : 'bg-white/90 border-slate-200/80'
        }`}
      >
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Link
              href="/agence/dashboard"
              className={`p-1.5 rounded-lg transition-colors flex items-center ${
                isDark
                  ? 'text-[#8E8E93] hover:text-[#F5F5F7] hover:bg-[#2C2C2E]'
                  : 'text-slate-500 hover:text-slate-900 hover:bg-slate-100'
              }`}
            >
              <ArrowLeft size={18} />
            </Link>
            <div>
              <h1
                className={`text-sm sm:text-base font-bold tracking-tight leading-tight ${
                  isDark ? 'text-[#F5F5F7]' : 'text-slate-900'
                }`}
              >
                Configuration du Reçu
              </h1>
              <p className={`text-[11px] hidden sm:block ${isDark ? 'text-[#8E8E93]' : 'text-slate-400'}`}>
                Synchronisé sur tous vos appareils et utilisable hors ligne
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={toggleDarkMode}
              className={`hidden md:flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border transition-colors cursor-pointer ${
                isDark
                  ? 'bg-[#2C2C2E] border-[#38383A] text-[#FFD60A]'
                  : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-100 shadow-xs'
              }`}
            >
              {isDark ? <Sun size={14} className="text-[#FFD60A]" /> : <Moon size={14} className="text-slate-600" />}
              <span>{isDark ? 'Clair' : 'Sombre'}</span>
            </button>

            <button
              type="submit"
              form="config-form"
              disabled={isSaving}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition shadow-sm cursor-pointer disabled:opacity-50 ${
                isDark ? 'bg-[#FFFFFF] hover:bg-[#E5E5EA] text-[#000000]' : 'bg-slate-900 hover:bg-black text-white'
              }`}
            >
              <Save size={14} />
              <span>{isSaving ? 'Enregistrement…' : 'Enregistrer'}</span>
            </button>
          </div>
        </div>
      </div>

      {/* ─── CORPS DE LA PAGE ─── */}
      <div className="max-w-7xl mx-auto px-4 lg:px-8 py-5 space-y-5">
        {errorMsg && (
          <div className="p-3.5 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-rose-600 text-xs font-bold animate-in fade-in">
            {errorMsg}
          </div>
        )}
        {successMsg && (
          <div className="p-3.5 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 text-xs font-bold flex items-center gap-2 animate-in fade-in">
            <CheckCircle2 size={16} />
            <span>{successMsg}</span>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          <form id="config-form" onSubmit={handleSave} className="lg:col-span-7 space-y-4">
            
            {/* Bloc Logo */}
            <div
              className={`p-5 rounded-2xl border transition-colors ${
                isDark ? 'bg-[#1C1C1E] border-[#2C2C2E]' : 'bg-white border-slate-200/80 shadow-xs'
              }`}
            >
              <h2 className="text-xs font-black uppercase tracking-wider text-blue-600 mb-1 flex items-center gap-1.5">
                <ImageIcon size={14} />
                Logo du Reçu (Multi-appareils & Hors Ligne)
              </h2>
              <div className="flex items-center gap-4 mt-3">
                <div
                  className={`w-20 h-20 rounded-2xl border-2 border-dashed flex items-center justify-center overflow-hidden shrink-0 ${
                    isDark ? 'border-[#38383A] bg-[#2C2C2E]' : 'border-slate-200 bg-slate-50'
                  }`}
                >
                  {logoBase64 ? (
                    <img 
                      src={logoBase64} 
                      alt="Logo agence" 
                      className="w-full h-full object-contain p-1" 
                    />
                  ) : (
                    <Building2 size={24} className={isDark ? 'text-[#545458]' : 'text-slate-300'} />
                  )}
                </div>

                <div className="flex-1 space-y-2">
                  <input
                    ref={fileInputRef}
                    type="file"
                    aria-label="Sélectionner le logo de l'agence"
                    accept="image/*"
                    onChange={handleLogoUpload}
                    className="hidden"
                    id="logo-upload"
                  />
                  <div className="flex gap-2">
                    <label
                      htmlFor="logo-upload"
                      className={`px-3 py-2 rounded-xl text-xs font-bold border flex items-center gap-1.5 cursor-pointer transition ${
                        isDark
                          ? 'bg-[#2C2C2E] border-[#38383A] text-white hover:bg-[#38383A]'
                          : 'bg-slate-100 border-slate-200 text-slate-700 hover:bg-slate-200'
                      }`}
                    >
                      <Upload size={13} />
                      <span>{logoUploading ? 'Synchronisation…' : 'Choisir une image'}</span>
                    </label>
                    {logoBase64 && (
                      <button
                        type="button"
                        onClick={handleRemoveLogo}
                        className={`p-2 rounded-xl border transition cursor-pointer ${
                          isDark ? 'border-[#38383A] text-rose-400 hover:bg-rose-500/10' : 'border-slate-200 text-rose-600 hover:bg-rose-50'
                        }`}
                        title="Supprimer le logo"
                      >
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                  <p className="text-[10px] text-slate-400">
                    Ce logo est compressé et automatiquement synchronisé sur tous vos appareils via PowerSync.
                  </p>
                </div>
              </div>
            </div>

            {/* Bloc Coordonnées */}
            <div
              className={`p-5 rounded-2xl border space-y-3.5 transition-colors ${
                isDark ? 'bg-[#1C1C1E] border-[#2C2C2E]' : 'bg-white border-slate-200/80 shadow-xs'
              }`}
            >
              <h2 className="text-xs font-black uppercase tracking-wider text-blue-600 flex items-center gap-1.5">
                <Building2 size={14} /> Coordonnées & En-tête
              </h2>

              <div>
                <label className="text-[10px] font-black uppercase text-slate-400 block mb-1">
                  Nom de l'agence *
                </label>
                <input
                  type="text"
                  required
                  value={nomAgence}
                  onChange={(e) => setNomAgence(e.target.value)}
                  placeholder="Ex: DIABILA VOYAGES"
                  className={`w-full px-3.5 py-2.5 rounded-xl border text-xs font-bold outline-none transition ${
                    isDark
                      ? 'bg-[#2C2C2E] border-[#38383A] text-white focus:border-blue-500'
                      : 'bg-slate-50 border-slate-200 text-slate-900 focus:bg-white focus:border-blue-600'
                  }`}
                />
              </div>

              <div>
                <label className="text-[10px] font-black uppercase text-slate-400 block mb-1">
                  Slogan ou Sous-titre
                </label>
                <input
                  type="text"
                  value={slogan}
                  onChange={(e) => setSlogan(e.target.value)}
                  placeholder="Ex: Billetterie • Séjours • Hajj & Omra"
                  className={`w-full px-3.5 py-2.5 rounded-xl border text-xs font-semibold outline-none transition ${
                    isDark
                      ? 'bg-[#2C2C2E] border-[#38383A] text-white focus:border-blue-500'
                      : 'bg-slate-50 border-slate-200 text-slate-900 focus:bg-white focus:border-blue-600'
                  }`}
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] font-black uppercase text-slate-400 block mb-1">
                    Téléphone agence
                  </label>
                  <input
                    type="text"
                    value={telephoneAgence}
                    onChange={(e) => setTelephoneAgence(e.target.value)}
                    placeholder="+223 74 07 06 53"
                    className={`w-full px-3.5 py-2.5 rounded-xl border text-xs font-bold outline-none transition ${
                      isDark
                        ? 'bg-[#2C2C2E] border-[#38383A] text-white focus:border-blue-500'
                        : 'bg-slate-50 border-slate-200 text-slate-900 focus:bg-white focus:border-blue-600'
                    }`}
                  />
                </div>

                <div>
                  <label className="text-[10px] font-black uppercase text-slate-400 block mb-1">
                    Adresse physique / Ville
                  </label>
                  <input
                    type="text"
                    value={adresseAgence}
                    onChange={(e) => setAdresseAgence(e.target.value)}
                    placeholder="Hamdallaye ACI 2000, Bamako"
                    className={`w-full px-3.5 py-2.5 rounded-xl border text-xs font-semibold outline-none transition ${
                      isDark
                        ? 'bg-[#2C2C2E] border-[#38383A] text-white focus:border-blue-500'
                        : 'bg-slate-50 border-slate-200 text-slate-900 focus:bg-white focus:border-blue-600'
                    }`}
                  />
                </div>
              </div>

              <div>
                <label className="text-[10px] font-black uppercase text-slate-400 block mb-1">
                  Message au pied du ticket
                </label>
                <textarea
                  rows={2}
                  value={messageRecu}
                  onChange={(e) => setMessageRecu(e.target.value)}
                  className={`w-full px-3.5 py-2.5 rounded-xl border text-xs font-medium outline-none transition ${
                    isDark
                      ? 'bg-[#2C2C2E] border-[#38383A] text-white focus:border-blue-500'
                      : 'bg-slate-50 border-slate-200 text-slate-900 focus:bg-white focus:border-blue-600'
                  }`}
                />
              </div>
            </div>
          </form>

          {/* Aperçu en direct */}
          <div className="lg:col-span-5 sticky top-20">
            <div className="flex items-center gap-1.5 mb-2 px-1 text-slate-400 text-[11px] font-bold uppercase tracking-wider">
              <Receipt size={14} className="text-blue-600" />
              <span>Aperçu en direct du Reçu</span>
            </div>

            <div className="bg-white text-slate-900 border border-slate-200 rounded-3xl p-6 shadow-lg font-mono text-xs space-y-4">
              <div className="text-center space-y-1 pb-3 border-b border-dashed border-slate-300">
                {logoBase64 && (
                  <img
                    src={logoBase64}
                    alt="Logo Reçu"
                    className="h-10 max-w-[130px] mx-auto object-contain mb-2"
                  />
                )}
                <h3 className="font-black text-sm uppercase tracking-tight text-slate-900">
                  {nomAgence || 'NOM DE VOTRE AGENCE'}
                </h3>
                {slogan && <p className="text-[10px] text-slate-500 font-sans">{slogan}</p>}
                {adresseAgence && <p className="text-[10px] text-slate-500">{adresseAgence}</p>}
                <p className="text-[11px] font-bold text-slate-700">Tél : {telephoneAgence || '+223 ...'}</p>
                <div className="inline-block mt-2 bg-slate-900 text-white text-[9px] font-bold px-2.5 py-0.5 rounded">
                  TICKET DE CAISSE
                </div>
              </div>

              <div className="py-2 space-y-1.5 border-b border-dashed border-slate-300 text-[11px]">
                <div className="flex justify-between text-slate-500">
                  <span>Réf: #OP-EXEMPLE</span>
                  <span>{new Date().toLocaleDateString('fr-FR')}</span>
                </div>
                <div className="flex justify-between font-bold">
                  <span>Client : M. Ousmane Traoré</span>
                  <span>Comptoir</span>
                </div>
                <div className="flex justify-between font-black pt-1">
                  <span>Billet d'avion (BKO - DOH)</span>
                  <span>650 000 F</span>
                </div>
              </div>

              <div className="flex justify-between items-center font-black text-sm pb-3 border-b border-dashed border-slate-300">
                <span>TOTAL PAYÉ</span>
                <span>650 000 CFA</span>
              </div>

              <div className="text-center pt-1 text-[10px] text-slate-500 leading-tight font-sans">
                {messageRecu}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}