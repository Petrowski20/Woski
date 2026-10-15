'use client'

import { useState, useRef, useEffect } from 'react'
import { AlertCircle, Eye, EyeOff } from 'lucide-react'
import { login, signup } from '@/app/(auth)/login/actions'
import { useLang } from '@/contexts/LangContext'

const inputClass =
  'rounded-lg px-3 py-2.5 border border-border bg-bg-muted text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-accent/40 focus:border-accent aria-[invalid=true]:border-danger aria-[invalid=true]:ring-danger/30 transition-colors text-sm w-full'

const labelClass = 'text-xs font-semibold text-text-muted'

type Props = {
  isRegister: boolean
  maxBirthDate: string
  errorInicial?: string
}

type ErrorKey =
  | 'credenciales' | 'noCoinciden' | 'menorEdad' | 'nickEnUso'
  | 'emailEnUso' | 'emailInvalido' | 'passwordCorta' | 'demasiados'

// Traduce los mensajes que devuelven las acciones (y Supabase Auth) a un texto
// claro en el idioma del usuario. Si no se reconoce, se muestra tal cual.
function errorKey(message: string): ErrorKey | null {
  const m = message.toLowerCase()
  if (m.includes('credenciales') || m.includes('invalid login')) return 'credenciales'
  if (m.includes('no coinciden')) return 'noCoinciden'
  if (m.includes('16 años')) return 'menorEdad'
  if (m.includes('nombre de usuario')) return 'nickEnUso'
  if (m.includes('already registered') || m.includes('already been registered')) return 'emailEnUso'
  if (m.includes('email') && m.includes('invalid')) return 'emailInvalido'
  if (m.includes('password should be') || m.includes('at least')) return 'passwordCorta'
  if (m.includes('rate limit') || m.includes('too many')) return 'demasiados'
  return null
}

const PASSWORD_ERRORS: ErrorKey[] = ['credenciales', 'noCoinciden', 'passwordCorta']

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

  const key = formError ? errorKey(formError) : null
  const errorText = formError ? (key ? t(`auth.errores.${key}`) : formError) : null
  const passwordInvalid = key !== null && PASSWORD_ERRORS.includes(key)
  const togglePassword = (
    <button
      type="button"
      onClick={() => setShowPassword((v) => !v)}
      aria-label={showPassword ? t('auth.ocultar') : t('auth.mostrar')}
      aria-pressed={showPassword}
      title={showPassword ? t('auth.ocultar') : t('auth.mostrar')}
      className="absolute right-1.5 top-1/2 -translate-y-1/2 flex items-center justify-center w-8 h-8 rounded-md text-text-muted hover:text-accent hover:bg-bg-elevated/60 transition-colors"
    >
      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
    </button>
  )

  return (
    <form onSubmit={handleSubmit} className="flex flex-col w-full gap-4">
      {/* Email */}
      <div className="flex flex-col gap-1.5">
        <label className={labelClass} htmlFor="email">
          {t('auth.email')}
        </label>
        <input
          id="email"
          className={inputClass}
          name="email"
          placeholder={t('auth.emailPlaceholder')}
          required
          type="email"
          autoComplete="email"
          aria-invalid={key === 'emailEnUso' || key === 'emailInvalido' || key === 'credenciales' || undefined}
        />
      </div>

      {isRegister && (
        <>
          <div className="flex flex-col gap-1.5">
            <label className={labelClass} htmlFor="nickname">
              {t('auth.nickname')}
            </label>
            <input
              id="nickname"
              className={inputClass}
              name="nickname"
              placeholder={t('auth.nicknamePlaceholder')}
              required
              autoComplete="username"
              aria-invalid={key === 'nickEnUso' || undefined}
            />
          </div>

          <div className="flex flex-col gap-1.5 min-w-0 overflow-hidden">
            <label className={labelClass} htmlFor="birthDate">
              {t('auth.birthDate')}
            </label>
            <input
              id="birthDate"
              className={`${inputClass} max-w-full`}
              name="birthDate"
              type="date"
              max={maxBirthDate}
              required
              autoComplete="bday"
              aria-describedby="birthDate-hint"
              aria-invalid={key === 'menorEdad' || undefined}
            />
            <p id="birthDate-hint" className="text-xs text-text-muted">{t('auth.birthDateHint')}</p>
          </div>
        </>
      )}

      {/* Contraseña */}
      <div className="flex flex-col gap-1.5">
        <label className={labelClass} htmlFor="password">
          {t('auth.password')}
        </label>
        <div className="relative">
          <input
            id="password"
            ref={passwordRef}
            className={`${inputClass} pr-11`}
            type={showPassword ? 'text' : 'password'}
            name="password"
            placeholder={t('auth.passwordPlaceholder')}
            required
            autoComplete={isRegister ? 'new-password' : 'current-password'}
            aria-invalid={passwordInvalid || undefined}
          />
          {togglePassword}
        </div>
      </div>

      {isRegister && (
        <div className="flex flex-col gap-1.5">
          <label className={labelClass} htmlFor="confirmPassword">
            {t('auth.confirmPassword')}
          </label>
          <input
            id="confirmPassword"
            ref={confirmPasswordRef}
            className={inputClass}
            type={showPassword ? 'text' : 'password'}
            name="confirmPassword"
            placeholder={t('auth.passwordPlaceholder')}
            required
            autoComplete="new-password"
            aria-invalid={key === 'noCoinciden' || undefined}
          />
        </div>
      )}

      {errorText && (
        <div
          role="alert"
          className="flex items-start gap-2.5 p-3 rounded-lg bg-danger/10 border border-danger/40 text-sm"
        >
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0 text-danger" aria-hidden />
          <div className="min-w-0">
            <p className="font-semibold text-danger">{t('auth.errores.titulo')}</p>
            <p className="text-text-primary mt-0.5">{errorText}</p>
          </div>
        </div>
      )}

      <button
        type="submit"
        disabled={isSubmitting}
        className="bg-accent bg-accent-gradient hover:brightness-110 rounded-lg px-4 py-3 text-on-accent font-display font-bold uppercase tracking-display text-base mt-1 shadow-glow-accent transition-all disabled:opacity-60 disabled:cursor-not-allowed disabled:shadow-none disabled:brightness-100"
      >
        {isSubmitting
          ? (isRegister ? t('auth.creando') : t('auth.entrando'))
          : (isRegister ? t('auth.crearCuenta') : t('auth.iniciarSesion'))
        }
      </button>

      <p className="text-center text-sm">
        <a
          href={isRegister ? '/login' : '/login?view=register'}
          className="text-accent font-medium hover:underline underline-offset-4"
        >
          {isRegister ? t('auth.yaRegistrado') : t('auth.noRegistrado')}
        </a>
      </p>
    </form>
  )
}
