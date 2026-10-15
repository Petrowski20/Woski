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
    <main className="min-h-[100dvh] flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-md bg-bg-elevated border border-border rounded-panel shadow-raised p-6 sm:p-8">
        <header className="text-center mb-7">
          <BrandLogo size="lg" />
          <h1 className="mt-4 text-base font-medium text-text-primary text-balance">{subtitle}</h1>
        </header>

        <AuthForm
          isRegister={isRegister}
          maxBirthDate={maxBirthDate}
          errorInicial={error}
        />
      </div>
    </main>
  )
}
