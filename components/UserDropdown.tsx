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
        className="flex items-center space-x-2 text-sm font-medium text-text-primary hover:text-accent bg-bg-muted/60 hover:bg-bg-muted px-3 py-2 rounded-lg transition-all border border-border hover:border-accent/50"
      >
        <div className="relative w-6 h-6 rounded-full overflow-hidden bg-accent/15 border border-accent/40 flex items-center justify-center shrink-0">
          {avatarUrl ? (
            <Image src={avatarUrl} alt={nickname} fill sizes="24px" className="object-cover" />
          ) : (
            <span className="text-accent font-bold text-xs">{initial}</span>
          )}
        </div>
        <span className="max-w-[100px] truncate">{nickname}</span>
        <svg
          className={`w-3 h-3 text-text-muted transition-transform ${isOpen ? 'rotate-180' : ''}`}
          fill="none" viewBox="0 0 24 24" stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {isOpen && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)} />

          <div className="absolute right-0 mt-2 w-64 bg-bg-elevated rounded-xl shadow-raised z-50 border border-border p-2">

            {/* Header */}
            <div className="flex items-center gap-3 px-3 py-2.5 mb-1">
              <div className="relative w-10 h-10 rounded-full overflow-hidden bg-accent/15 border-2 border-accent/40 flex items-center justify-center shrink-0">
                {avatarUrl ? (
                  <Image src={avatarUrl} alt={nickname} fill sizes="40px" className="object-cover" />
                ) : (
                  <span className="text-accent font-bold text-base">{initial}</span>
                )}
              </div>
              <div className="min-w-0">
                <p className="font-semibold text-sm text-text-primary truncate">{nickname}</p>
                <span className={`text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full ${
                  role === 'ADMIN'
                    ? 'bg-secondary/15 text-secondary ring-1 ring-inset ring-secondary/30'
                    : 'bg-bg-muted text-text-muted ring-1 ring-inset ring-border'
                }`}>
                  {role}
                </span>
              </div>
            </div>

            {/* Mi Perfil */}
            <Link
              href="/perfil"
              onClick={() => setIsOpen(false)}
              className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium text-text-primary hover:bg-bg-muted hover:text-accent transition-colors"
            >
              <span className="text-base">👤</span>
              {t('dropdown.miPerfil')}
            </Link>

            <div className="my-1.5 border-t border-border" />

            {/* Tema */}
            <div className="px-3 py-2">
              <p className="text-[10px] font-bold text-text-muted uppercase tracking-wider mb-2">
                {t('dropdown.tema')}
              </p>
              {!mounted ? (
                <div className="h-8 w-full bg-bg-muted rounded-lg animate-pulse" />
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
                          ? 'bg-accent-gradient border-accent shadow-glow-accent'
                          : 'bg-bg-muted/60 border-border hover:border-accent/50'
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
              <p className="text-[10px] font-bold text-text-muted uppercase tracking-wider mb-2">
                {t('dropdown.idioma')}
              </p>
              <div className="flex gap-1.5">
                {(['es', 'en', 'ro'] as Lang[]).map((l) => (
                  <button
                    key={l}
                    onClick={() => setLang(l)}
                    className={`px-3 py-1 rounded-lg text-xs font-semibold border transition-all ${
                      lang === l
                        ? 'bg-accent-gradient text-on-accent border-accent shadow-glow-accent'
                        : 'bg-bg-muted/60 text-text-muted border-border hover:border-accent/50 hover:text-text-primary'
                    }`}
                  >
                    {l.toUpperCase()}
                  </button>
                ))}
              </div>
            </div>

            <div className="my-1.5 border-t border-border" />

            {/* Cerrar Sesión */}
            <button
              onClick={handleLogout}
              className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium text-danger hover:bg-danger/10 transition-colors"
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
