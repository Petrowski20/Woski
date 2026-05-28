'use client'

import { useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { createClient } from '@/utils/supabase/client'

type Theme = 'light' | 'auto' | 'dark'
type Lang = 'es' | 'en'

interface Props {
  avatarUrl: string | null
  nickname: string
  role: string
}

export default function UserDropdown({ avatarUrl, nickname, role }: Props) {
  const [isOpen, setIsOpen] = useState(false)
  const [theme, setTheme] = useState<Theme>('auto')
  const [lang, setLang] = useState<Lang>('es')

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
        className="flex items-center space-x-2 text-sm font-medium text-gray-700 hover:text-brand-blue bg-gray-50 hover:bg-gray-100 px-3 py-2 rounded-lg transition-all border border-gray-200"
      >
        <div className="relative w-6 h-6 rounded-full overflow-hidden bg-blue-100 border border-blue-200 flex items-center justify-center shrink-0">
          {avatarUrl ? (
            <Image src={avatarUrl} alt={nickname} fill className="object-cover" />
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
          {/* Overlay invisible para cerrar al hacer clic fuera */}
          <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)} />

          {/* Menú desplegable */}
          <div className="absolute right-0 mt-2 w-64 bg-white rounded-xl shadow-lg z-50 border border-gray-100 p-2">

            {/* Header: avatar + info */}
            <div className="flex items-center gap-3 px-3 py-2.5 mb-1">
              <div className="relative w-10 h-10 rounded-full overflow-hidden bg-blue-100 border-2 border-blue-200 flex items-center justify-center shrink-0">
                {avatarUrl ? (
                  <Image src={avatarUrl} alt={nickname} fill className="object-cover" />
                ) : (
                  <span className="text-blue-600 font-bold text-base">{initial}</span>
                )}
              </div>
              <div className="min-w-0">
                <p className="font-semibold text-sm text-gray-900 truncate">{nickname}</p>
                <span className={`text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full ${
                  role === 'ADMIN' ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-gray-500'
                }`}>
                  {role}
                </span>
              </div>
            </div>

            {/* Mi Perfil */}
            <Link
              href="/perfil"
              onClick={() => setIsOpen(false)}
              className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
            >
              <span className="text-base">👤</span>
              Mi Perfil
            </Link>

            <div className="my-1.5 border-t border-gray-100" />

            {/* Tema */}
            <div className="px-3 py-2">
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2">Tema</p>
              <div className="flex gap-1.5">
                {([
                  ['light', '☀️', 'Claro'],
                  ['auto',  '⚙️', 'Auto'],
                  ['dark',  '🌙', 'Oscuro'],
                ] as [Theme, string, string][]).map(([t, icon, label]) => (
                  <button
                    key={t}
                    onClick={() => setTheme(t)}
                    title={label}
                    className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium border transition-all ${
                      theme === t
                        ? 'bg-blue-600 text-white border-blue-600'
                        : 'bg-white text-gray-500 border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <span>{icon}</span>
                    <span>{label}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Idioma */}
            <div className="px-3 py-2">
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2">Idioma</p>
              <div className="flex gap-1.5">
                {(['es', 'en'] as Lang[]).map((l) => (
                  <button
                    key={l}
                    onClick={() => setLang(l)}
                    className={`px-3 py-1 rounded-lg text-xs font-semibold border transition-all ${
                      lang === l
                        ? 'bg-blue-600 text-white border-blue-600'
                        : 'bg-white text-gray-500 border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    {l.toUpperCase()}
                  </button>
                ))}
              </div>
            </div>

            <div className="my-1.5 border-t border-gray-100" />

            {/* Cerrar Sesión */}
            <button
              onClick={handleLogout}
              className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium text-red-600 hover:bg-red-50 transition-colors"
            >
              <span className="text-base">🚪</span>
              Cerrar Sesión
            </button>

          </div>
        </>
      )}
    </div>
  )
}
