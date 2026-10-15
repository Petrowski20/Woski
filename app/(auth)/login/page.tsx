import BrandLogo from '@/components/BrandLogo'
import AuthForm from '@/components/AuthForm'
import { getServerLang, tServer } from '@/utils/i18n-server'

export const metadata = { title: 'Entrar · Woski' }

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; view?: string }>
}) {
  const { error, view } = await searchParams
  const isRegister = view === 'register'

  const today = new Date()
  const maxDate = new Date(today.getFullYear() - 16, today.getMonth(), today.getDate())
  const maxBirthDate = maxDate.toISOString().split('T')[0]

  const lang = await getServerLang()
  const subtitle = tServer(lang, isRegister ? 'login.creaCuenta' : 'login.iniciaSesion')

  return (
    <div className="flex-1 flex flex-col w-full px-8 sm:max-w-md justify-center gap-2 mx-auto mt-10 mb-20">
      <div className="text-center mb-6">
        <BrandLogo size="lg" className="mb-4" />
        <p className="heading-display text-sm font-semibold text-text-muted">{subtitle}</p>
      </div>

      <AuthForm
        isRegister={isRegister}
        maxBirthDate={maxBirthDate}
        errorInicial={error}
      />
    </div>
  )
}
