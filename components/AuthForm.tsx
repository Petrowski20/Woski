'use client'

import { useState, useRef, useEffect } from 'react'
import { login, signup } from '@/app/(auth)/login/actions'
import { SELECCIONES } from '@/utils/data/selecciones'
import { useLang } from '@/contexts/LangContext'

const ESPANA_ID = '20'

const inputClass =
  'rounded-lg px-3 py-2 border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-brand-blue text-sm w-full'

const passwordInputClass =
  'rounded-lg px-3 py-2 pr-10 border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-brand-blue text-sm w-full'

type Props = {
  isRegister: boolean
  maxBirthDate: string
  errorInicial?: string
}

function EyeOpen() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  )
}

function EyeOff() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
      <line x1="1" y1="1" x2="23" y2="23" />
    </svg>
  )
}

export default function AuthForm({ isRegister, maxBirthDate, errorInicial }: Props) {
  const { t } = useLang()
  const [showPassword, setShowPassword] = useState(false)
  const [formError, setFormError] = useState(errorInicial)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const passwordRef = useRef<HTMLInputElement>(null)
  const confirmPasswordRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    setFormError(errorInicial)
  }, [isRegister, errorInicial])

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (isSubmitting) return
    setFormError(undefined)
    setIsSubmitting(true)
    try {
      const formData = new FormData(e.currentTarget)
      const result = isRegister ? await signup(formData) : await login(formData)
      if (result && 'error' in result) {
        setFormError(result.error)
        if (passwordRef.current) passwordRef.current.value = ''
        if (confirmPasswordRef.current) confirmPasswordRef.current.value = ''
      }
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="flex flex-col w-full gap-4 bg-white dark:bg-slate-900 p-6 rounded-xl shadow-sm border border-gray-200 dark:border-slate-800"
    >
      {/* Email */}
      <div className="flex flex-col gap-1">
        <label className="text-xs font-semibold text-gray-600" htmlFor="email">
          {t('auth.email')}
        </label>
        <input
          id="email"
          className={inputClass}
          name="email"
          placeholder={t('auth.emailPlaceholder')}
          required
          type="email"
        />
      </div>

      {isRegister && (
        <>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold text-gray-600" htmlFor="nickname">
              {t('auth.nickname')}
            </label>
            <input
              id="nickname"
              className={inputClass}
              name="nickname"
              placeholder={t('auth.nicknamePlaceholder')}
              required
            />
          </div>

          <div className="flex flex-col gap-1 min-w-0 overflow-hidden">
            <label className="text-xs font-semibold text-gray-600" htmlFor="birthDate">
              {t('auth.birthDate')}
            </label>
            <input
              id="birthDate"
              className={`${inputClass} max-w-full`}
              name="birthDate"
              type="date"
              max={maxBirthDate}
              required
            />
            <p className="text-xs text-gray-400">{t('auth.birthDateHint')}</p>
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold text-gray-600" htmlFor="favoriteTeamId">
              {t('auth.seleccion')}
            </label>
            <select
              id="favoriteTeamId"
              className="rounded-lg px-3 py-2 border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-brand-blue text-sm"
              name="favoriteTeamId"
              defaultValue={ESPANA_ID}
              required
            >
              <option value="">{t('auth.seleccionPlaceholder')}</option>
              {SELECCIONES.map((team) => (
                <option key={team.id} value={team.id}>
                  {team.emoji} {team.name}
                </option>
              ))}
            </select>
          </div>
        </>
      )}

      {/* Contraseña */}
      <div className="flex flex-col gap-1">
        <label className="text-xs font-semibold text-gray-600" htmlFor="password">
          {t('auth.password')}
        </label>
        <div className="relative">
          <input
            id="password"
            ref={passwordRef}
            className={passwordInputClass}
            type={showPassword ? 'text' : 'password'}
            name="password"
            placeholder={t('auth.passwordPlaceholder')}
            required
          />
          <button
            type="button"
            onClick={() => setShowPassword((v) => !v)}
            tabIndex={-1}
            aria-label={showPassword ? t('auth.ocultar') : t('auth.mostrar')}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
          >
            {showPassword ? <EyeOff /> : <EyeOpen />}
          </button>
        </div>
      </div>

      {isRegister && (
        <div className="flex flex-col gap-1">
          <label className="text-xs font-semibold text-gray-600" htmlFor="confirmPassword">
            {t('auth.confirmPassword')}
          </label>
          <div className="relative">
            <input
              id="confirmPassword"
              ref={confirmPasswordRef}
              className={passwordInputClass}
              type={showPassword ? 'text' : 'password'}
              name="confirmPassword"
              placeholder={t('auth.passwordPlaceholder')}
              required
            />
          </div>
        </div>
      )}

      <button
        type="submit"
        disabled={isSubmitting}
        className="bg-gradient-to-r from-brand-blue to-brand-teal hover:from-brand-cyan hover:to-brand-mint rounded-lg px-4 py-2.5 text-white font-semibold text-sm mt-2 shadow-md transition-all disabled:opacity-60 disabled:cursor-not-allowed"
      >
        {isSubmitting
          ? (isRegister ? t('auth.creando') : t('auth.entrando'))
          : (isRegister ? t('auth.crearCuenta') : t('auth.iniciarSesion'))
        }
      </button>

      <div className="text-center mt-2">
        <a
          href={isRegister ? '/login' : '/login?view=register'}
          className="text-xs text-brand-blue hover:underline"
        >
          {isRegister ? t('auth.yaRegistrado') : t('auth.noRegistrado')}
        </a>
      </div>

      {formError && (
        <p className="p-3 bg-red-50 text-red-600 text-center text-xs rounded-lg border border-red-100 mt-2 font-medium">
          ⚠️ {formError}
        </p>
      )}
    </form>
  )
}
