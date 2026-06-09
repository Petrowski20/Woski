'use client'

import { useState, useRef, useEffect } from 'react'
import { toast } from 'sonner'
import Link from 'next/link'
import Image from 'next/image'
import { useTheme } from 'next-themes'
import { createClient } from '@/utils/supabase/client'
import { useLang } from '@/contexts/LangContext'
import type { Lang } from '@/contexts/LangContext'

interface Profile {
  id: string
  nickname: string
  role: string
  total_points: number
  avatar_url: string | null
}

interface Props {
  initialProfile: Profile
  userEmail: string
}

function SettingsRow({ icon, label, onClick, href }: {
  icon: string; label: string
  onClick?: () => void; href?: string
}) {
  const inner = (
    <div className="flex items-center gap-3 flex-1">
      <span className="text-lg w-6 text-center">{icon}</span>
      <span className="text-sm font-medium text-gray-800 dark:text-gray-200">{label}</span>
    </div>
  )
  const chevron = (
    <svg className="w-4 h-4 text-gray-300 dark:text-slate-600 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
    </svg>
  )
  const cls = 'flex items-center justify-between px-5 py-3.5 hover:bg-gray-50 dark:hover:bg-slate-800 transition-colors'

  if (href) return (
    <Link href={href} className={cls}>{inner}{chevron}</Link>
  )
  return (
    <button onClick={onClick} className={`w-full ${cls}`}>{inner}{chevron}</button>
  )
}

export default function ProfileManager({ initialProfile, userEmail }: Props) {
  const fileRef = useRef<HTMLInputElement>(null)
  const { lang, setLang, t } = useLang()

  const [avatarUrl, setAvatarUrl] = useState<string | null>(initialProfile.avatar_url)
  const [isUploading, setIsUploading] = useState(false)

  const { theme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)

  const [showPwModal,  setShowPwModal]  = useState(false)
  const [newPw,        setNewPw]        = useState('')
  const [confirmPw,    setConfirmPw]    = useState('')
  const [isChangingPw, setIsChangingPw] = useState(false)

  useEffect(() => { setMounted(true) }, [])

  const handleTheme = (themeVal: string) => {
    setTheme(themeVal)
    const labels: Record<string, string> = {
      light: t('profile.claro'),
      system: t('profile.automatico'),
      dark: t('profile.oscuro'),
    }
    toast.success(t('profile.temaToast', { label: labels[themeVal] ?? themeVal }))
  }

  const handleLang = (l: Lang) => {
    setLang(l)
    toast.success(t('profile.idiomaToast', { lang: l.toUpperCase() }))
  }

  const handleUploadPhoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp']
    if (!ALLOWED_TYPES.includes(file.type)) {
      toast.error(t('profile.avatar.formatError'))
      setIsUploading(false)
      return
    }

    if (file.size > 5 * 1024 * 1024) {
      toast.error(t('profile.avatar.sizeError'))
      setIsUploading(false)
      return
    }

    setIsUploading(true)
    const supabase = createClient()
    const ext  = file.name.split('.').pop() ?? 'jpg'
    const path = `${initialProfile.id}/avatar.${ext}`

    const { error: uploadError } = await supabase.storage
      .from('avatars')
      .upload(path, file, { upsert: true, contentType: file.type })

    if (uploadError) {
      console.error('Error de subida:', uploadError)
      if (uploadError.message.includes('Bucket not found')) {
        toast.error(t('profile.avatar.bucketError'))
      } else {
        toast.error(t('profile.avatar.error', { msg: uploadError.message }))
      }
      setIsUploading(false)
      return
    }

    const { data: { publicUrl } } = supabase.storage.from('avatars').getPublicUrl(path)

    const { error: updateError } = await supabase
      .from('profiles')
      .update({ avatar_url: publicUrl })
      .eq('id', initialProfile.id)

    if (updateError) {
      toast.error(t('profile.avatar.error', { msg: updateError.message }))
      setIsUploading(false)
      return
    }

    setAvatarUrl(`${publicUrl}?t=${Date.now()}`)
    toast.success(t('profile.avatar.success'))
    setIsUploading(false)
    if (fileRef.current) fileRef.current.value = ''
  }

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault()
    if (newPw.length < 6) { toast.error(t('profile.password.min6')); return }
    if (newPw !== confirmPw) { toast.error(t('profile.password.noCoinciden')); return }

    setIsChangingPw(true)
    const supabase = createClient()
    const { error } = await supabase.auth.updateUser({ password: newPw })
    setIsChangingPw(false)

    if (error) { toast.error(error.message); return }

    toast.success(t('profile.password.success'))
    setShowPwModal(false)
    setNewPw('')
    setConfirmPw('')
  }

  const initial = initialProfile.nickname.charAt(0).toUpperCase()

  const handleLogout = async () => {
    const supabase = createClient()
    await supabase.auth.signOut()
    window.location.href = '/login'
  }

  return (
    <>
      <div className="w-full max-w-sm mx-auto flex flex-col gap-4 pb-10">

        {/* Header: avatar + info */}
        <div className="flex flex-col items-center gap-3 pt-2 pb-1">
          <button
            onClick={() => fileRef.current?.click()}
            disabled={isUploading}
            className="relative group cursor-pointer"
            aria-label={t('profile.cambiarFoto')}
          >
            <div className="relative w-24 h-24 rounded-full overflow-hidden bg-blue-100 dark:bg-blue-900 border-4 border-white dark:border-slate-800 shadow-lg flex items-center justify-center">
              {avatarUrl ? (
                <Image src={avatarUrl} alt="Avatar" fill sizes="96px" className="object-cover" />
              ) : (
                <span className="text-4xl font-black text-blue-600 dark:text-blue-400">{initial}</span>
              )}
            </div>
            <div className="absolute inset-0 rounded-full bg-black/25 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
              {isUploading ? (
                <svg className="w-6 h-6 text-white animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
              ) : (
                <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              )}
            </div>
          </button>

          <input
            ref={fileRef}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="hidden"
            onChange={handleUploadPhoto}
          />

          <div className="text-center">
            <p className="font-bold text-xl text-gray-900 dark:text-white leading-tight">{initialProfile.nickname}</p>
            {userEmail && <p className="text-sm text-gray-400 dark:text-slate-500 mt-0.5">{userEmail}</p>}
          </div>
        </div>

        {/* Estadísticas */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-gray-100 dark:border-slate-800 overflow-hidden">
          <p className="text-[10px] font-bold text-gray-400 dark:text-slate-500 uppercase tracking-wider px-5 py-3 border-b border-gray-50 dark:border-slate-800">
            {t('profile.estadisticas')}
          </p>
          <div className="divide-y divide-gray-50 dark:divide-slate-800">
            <div className="flex items-center justify-between px-5 py-3.5">
              <span className="text-sm text-gray-600 dark:text-gray-400">{t('profile.puntosTotales')}</span>
              <span className="font-black text-blue-600 dark:text-blue-400 text-lg">
                {initialProfile.total_points}
                <span className="text-xs font-normal text-gray-400 dark:text-slate-500 ml-1">pts</span>
              </span>
            </div>
            <div className="flex items-center justify-between px-5 py-3.5">
              <span className="text-sm text-gray-600 dark:text-gray-400">{t('profile.rol')}</span>
              <span className={`text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full ${
                initialProfile.role === 'ADMIN'
                  ? 'bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-400'
                  : 'bg-gray-100 dark:bg-slate-800 text-gray-600 dark:text-gray-400'
              }`}>
                {initialProfile.role}
              </span>
            </div>
          </div>
        </div>

        {/* Preferencias */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-gray-100 dark:border-slate-800 overflow-hidden">
          <p className="text-[10px] font-bold text-gray-400 dark:text-slate-500 uppercase tracking-wider px-5 py-3 border-b border-gray-50 dark:border-slate-800">
            {t('profile.preferencias')}
          </p>
          <div className="divide-y divide-gray-50 dark:divide-slate-800">

            {/* Idioma */}
            <div className="flex items-center justify-between px-5 py-3.5">
              <span className="text-sm text-gray-600 dark:text-gray-400">{t('profile.idioma')}</span>
              {!mounted ? (
                <div className="h-7 w-[72px] bg-gray-100 dark:bg-slate-800 rounded-lg animate-pulse" />
              ) : (
                <div className="flex gap-1.5">
                  {(['es', 'en', 'ro'] as Lang[]).map((l) => (
                    <button
                      key={l}
                      onClick={() => handleLang(l)}
                      className={`px-3 py-1 rounded-lg text-xs font-semibold border transition-all ${
                        lang === l
                          ? 'bg-blue-600 text-white border-blue-600'
                          : 'bg-white dark:bg-slate-800 text-gray-500 dark:text-gray-400 border-gray-200 dark:border-slate-700 hover:border-gray-300 dark:hover:border-slate-600'
                      }`}
                    >
                      {l.toUpperCase()}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Tema */}
            <div className="flex items-center justify-between px-5 py-3.5">
              <span className="text-sm text-gray-600 dark:text-gray-400">{t('profile.tema')}</span>
              {!mounted ? (
                <div className="h-9 w-[116px] bg-gray-100 dark:bg-slate-800 rounded-lg animate-pulse" />
              ) : (
                <div className="flex gap-1.5">
                  {([
                    ['light',  '☀️', t('profile.claro')],
                    ['system', '⚙️', t('profile.automatico')],
                    ['dark',   '🌙', t('profile.oscuro')],
                  ] as [string, string, string][]).map(([val, icon, label]) => (
                    <button
                      key={val}
                      onClick={() => handleTheme(val)}
                      title={label}
                      className={`w-9 h-9 rounded-lg text-base border transition-all flex items-center justify-center ${
                        theme === val
                          ? 'bg-blue-600 border-blue-600 shadow-sm'
                          : 'bg-white dark:bg-slate-800 border-gray-200 dark:border-slate-700 hover:border-gray-300 dark:hover:border-slate-600'
                      }`}
                    >
                      {icon}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Cuenta */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-gray-100 dark:border-slate-800 overflow-hidden">
          <p className="text-[10px] font-bold text-gray-400 dark:text-slate-500 uppercase tracking-wider px-5 py-3 border-b border-gray-50 dark:border-slate-800">
            {t('profile.cuenta')}
          </p>
          <div className="divide-y divide-gray-50 dark:divide-slate-800">
            <SettingsRow icon="🏆" label={t('profile.misLigas')}        href="/ligas" />
            <SettingsRow icon="🔒" label={t('profile.cambiarPassword')} onClick={() => setShowPwModal(true)} />
          </div>
        </div>

        {/* Cerrar sesión */}
        <button
          onClick={handleLogout}
          className="w-full py-3 text-sm font-semibold text-red-600 dark:text-red-400 bg-white dark:bg-slate-900 hover:bg-red-50 dark:hover:bg-red-900/20 border border-gray-100 dark:border-slate-800 rounded-2xl shadow-sm transition-colors"
        >
          {t('profile.cerrarSesion')}
        </button>

      </div>

      {/* Modal contraseña */}
      {showPwModal && (
        <>
          <div
            className="fixed inset-0 bg-black/40 backdrop-blur-sm z-40"
            onClick={() => setShowPwModal(false)}
          />
          <div className="fixed inset-x-4 bottom-0 sm:inset-auto sm:left-1/2 sm:-translate-x-1/2 sm:top-1/2 sm:-translate-y-1/2 sm:w-full sm:max-w-sm z-50 bg-white dark:bg-slate-900 border-t border-gray-100 dark:border-slate-800 sm:border rounded-t-3xl sm:rounded-2xl shadow-2xl p-6 animate-in slide-in-from-bottom-4 sm:zoom-in-95 duration-200">
            <div className="flex items-center justify-between mb-5">
              <h3 className="font-bold text-gray-900 dark:text-white">{t('profile.password.title')}</h3>
              <button
                onClick={() => setShowPwModal(false)}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 text-2xl leading-none w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 dark:hover:bg-slate-800"
              >
                ×
              </button>
            </div>

            <form onSubmit={handleChangePassword} className="flex flex-col gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5">
                  {t('profile.password.nueva')}
                </label>
                <input
                  type="password"
                  value={newPw}
                  onChange={(e) => setNewPw(e.target.value)}
                  placeholder={t('profile.password.nuevaPlaceholder')}
                  autoFocus
                  className="w-full border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-gray-900 dark:text-gray-100 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent placeholder:text-gray-400 dark:placeholder:text-slate-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5">
                  {t('profile.password.confirmar')}
                </label>
                <input
                  type="password"
                  value={confirmPw}
                  onChange={(e) => setConfirmPw(e.target.value)}
                  placeholder={t('profile.password.confirmarPlaceholder')}
                  className="w-full border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-gray-900 dark:text-gray-100 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent placeholder:text-gray-400 dark:placeholder:text-slate-500"
                />
              </div>

              <div className="flex gap-2 mt-1">
                <button
                  type="button"
                  onClick={() => { setShowPwModal(false); setNewPw(''); setConfirmPw('') }}
                  className="flex-1 py-2.5 border border-gray-200 dark:border-slate-700 rounded-xl text-sm font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-slate-800 transition-colors"
                >
                  {t('profile.password.cancelar')}
                </button>
                <button
                  type="submit"
                  disabled={isChangingPw}
                  className="flex-1 py-2.5 bg-blue-600 text-white rounded-xl text-sm font-semibold hover:bg-blue-700 disabled:bg-blue-400 transition-colors"
                >
                  {isChangingPw ? t('profile.password.guardando') : t('profile.password.guardar')}
                </button>
              </div>
            </form>
          </div>
        </>
      )}
    </>
  )
}
