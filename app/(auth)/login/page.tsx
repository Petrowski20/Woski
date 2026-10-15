import Image from 'next/image'
import AuthForm from '@/components/AuthForm'
import { getServerLang, tServer } from '@/utils/i18n-server'

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
        <Image
          src="/titulo.svg"
          alt="PollaMundialista"
          width={280}
          height={82}
          className="mx-auto mb-4 dark:brightness-0 dark:invert dark:drop-shadow-[0_0_12px_var(--glow-accent-soft)]"
          style={{ width: 'auto', height: 'auto' }}
          unoptimized
          priority
        />
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
