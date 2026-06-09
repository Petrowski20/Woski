'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { useTheme } from 'next-themes'
import { createClient } from '@/utils/supabase/client'
import { useLang } from '@/contexts/LangContext'
import type { Lang } from '@/contexts/LangContext'

interface Props {
  avatarUrl: string | null
  nickname: string
  role: string
}

export default function UserDropdown({ avatarUrl, nickname, role }: Props) {
  const [isOpen, setIsOpen] = useState(false)
  const [mounted, setMounted] = useState(false)
  const { theme, setTheme } = useTheme()
  const { lang, setLang, t } = useLang()

  useEffect(() => { setMounted(true) }, [])

  const initial = nickname.charAt(0).toUpperCase()

  const handleLogout = async () => {
    setIsOpen(false)
    const supabase = createClient()
    await supabase.auth.signOut()
    window.location.href = '/login'
  }

  return (
    <div className="relative">
      {/* Trigger */}
      <button
        onClick={() => setIsOpen((v) => !v)}
        className="flex items-center space-x-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:text-brand-blue bg-gray-50 dark:bg-slate-800 hover:bg-gray-100 dark:hover:bg-slate-700 px-3 py-2 rounded-lg transition-all border border-gray-200 dark:border-slate-700"
      >
        <div className="relative w-6 h-6 rounded-full overflow-hidden bg-blue-100 dark:bg-blue-900 border border-blue-200 dark:border-blue-700 flex items-center justify-center shrink-0">
          {avatarUrl ? (
            <Image src={avatarUrl} alt={nickname} fill sizes="24px" className="object-cover" />
          ) : (
            <span className="text-brand-blue font-bold text-xs">{initial}</span>
          )}
        </div>
        <span className="max-w-[100px] truncate">{nickname}</span>
        <svg
          className={`w-3 h-3 text-gray-400 transition-transform ${isOpen ? 'rotate-180' : ''}`}
          fill="none" viewBox="0 0 24 24" stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {isOpen && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)} />

          <div className="absolute right-0 mt-2 w-64 bg-white dark:bg-slate-900 rounded-xl shadow-lg z-50 border border-gray-100 dark:border-slate-800 p-2">

            {/* Header */}
            <div className="flex items-center gap-3 px-3 py-2.5 mb-1">
              <div className="relative w-10 h-10 rounded-full overflow-hidden bg-blue-100 dark:bg-blue-900 border-2 border-blue-200 dark:border-blue-700 flex items-center justify-center shrink-0">
                {avatarUrl ? (
                  <Image src={avatarUrl} alt={nickname} fill sizes="40px" className="object-cover" />
                ) : (
                  <span className="text-blue-600 dark:text-blue-400 font-bold text-base">{initial}</span>
                )}
              </div>
              <div className="min-w-0">
                <p className="font-semibold text-sm text-gray-900 dark:text-gray-100 truncate">{nickname}</p>
                <span className={`text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full ${
                  role === 'ADMIN'
                    ? 'bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-400'
                    : 'bg-gray-100 dark:bg-slate-800 text-gray-500 dark:text-gray-400'
                }`}>
                  {role}
                </span>
              </div>
            </div>

            {/* Mi Perfil */}
            <Link
              href="/perfil"
              onClick={() => setIsOpen(false)}
              className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-slate-800 transition-colors"
            >
              <span className="text-base">👤</span>
              {t('dropdown.miPerfil')}
            </Link>

            <div className="my-1.5 border-t border-gray-100 dark:border-slate-800" />

            {/* Tema */}
            <div className="px-3 py-2">
              <p className="text-[10px] font-bold text-gray-400 dark:text-slate-500 uppercase tracking-wider mb-2">
                {t('dropdown.tema')}
              </p>
              {!mounted ? (
                <div className="h-8 w-full bg-gray-100 dark:bg-slate-800 rounded-lg animate-pulse" />
              ) : (
                <div className="flex gap-1">
                  {([
                    ['light',  '☀️', t('dropdown.claro')],
                    ['system', '⚙️', t('dropdown.auto')],
                    ['dark',   '🌙', t('dropdown.oscuro')],
                  ] as [string, string, string][]).map(([val, icon, label]) => (
                    <button
                      key={val}
                      onClick={() => setTheme(val)}
                      title={label}
                      className={`flex-1 flex items-center justify-center py-1.5 rounded-lg text-base border transition-all ${
                        theme === val
                          ? 'bg-blue-600 border-blue-600'
                          : 'bg-white dark:bg-slate-800 border-gray-200 dark:border-slate-700 hover:border-gray-300 dark:hover:border-slate-600'
                      }`}
                    >
                      {icon}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Idioma */}
            <div className="px-3 py-2">
              <p className="text-[10px] font-bold text-gray-400 dark:text-slate-500 uppercase tracking-wider mb-2">
                {t('dropdown.idioma')}
              </p>
              <div className="flex gap-1.5">
                {(['es', 'en', 'ro'] as Lang[]).map((l) => (
                  <button
                    key={l}
                    onClick={() => setLang(l)}
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
            </div>

            <div className="my-1.5 border-t border-gray-100 dark:border-slate-800" />

            {/* Cerrar Sesión */}
            <button
              onClick={handleLogout}
              className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
            >
              <span className="text-base">🚪</span>
              {t('dropdown.cerrarSesion')}
            </button>

          </div>
        </>
      )}
    </div>
  )
}
