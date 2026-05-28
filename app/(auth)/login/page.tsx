import Image from 'next/image'
import { login, signup } from './actions'
import { SELECCIONES } from '@/utils/data/selecciones'

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ message?: string; error?: string; view?: string }>
}) {
  const { message, error, view } = await searchParams
  const isRegister = view === 'register'

  const today = new Date()
  const maxDate = new Date(today.getFullYear() - 16, today.getMonth(), today.getDate())
  const maxBirthDate = maxDate.toISOString().split('T')[0]

  return (
    <div className="flex-1 flex flex-col w-full px-8 sm:max-w-md justify-center gap-2 mx-auto mt-10 mb-20">

      {/* Logo centrado */}
      <div className="text-center mb-6">
        <Image
          src="/titulo.svg"
          alt="PollaMundialista"
          width={280}
          height={82}
          className="mx-auto mb-4 dark:brightness-0 dark:invert"
          style={{ width: 'auto', height: 'auto' }}
          unoptimized
          priority
        />
        <p className="text-sm text-gray-500">
          {isRegister ? 'Crea tu cuenta de jugador' : 'Inicia sesión para predecir'}
        </p>
      </div>

      <form className="flex flex-col w-full gap-4 bg-white dark:bg-slate-900 p-6 rounded-xl shadow-sm border border-gray-200 dark:border-slate-800">

        {/* CAMPOS COMUNES */}
        <div className="flex flex-col gap-1">
          <label className="text-xs font-semibold text-gray-600" htmlFor="email">Correo Electrónico</label>
          <input
            className="rounded-lg px-3 py-2 border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-brand-blue text-sm"
            name="email"
            placeholder="tu@email.com"
            required
            type="email"
          />
        </div>

        {/* CAMPOS EXCLUSIVOS DE REGISTRO */}
        {isRegister && (
          <>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold text-gray-600" htmlFor="nickname">Nickname (Único)</label>
              <input
                className="rounded-lg px-3 py-2 border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-brand-blue text-sm"
                name="nickname"
                placeholder="Ej: Petrowski"
                required
              />
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold text-gray-600" htmlFor="birthDate">Fecha de Nacimiento</label>
              <input
                className="rounded-lg px-3 py-2 border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-brand-blue text-sm"
                name="birthDate"
                type="date"
                max={maxBirthDate}
                required
              />
              <p className="text-xs text-gray-400">Debes tener al menos 16 años para participar.</p>
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold text-gray-600" htmlFor="favoriteTeamId">Selección Favorita</label>
              <select
                className="rounded-lg px-3 py-2 border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-brand-blue text-sm"
                name="favoriteTeamId"
                required
              >
                <option value="">Selecciona tu país...</option>
                {SELECCIONES.map((team) => (
                  <option key={team.id} value={team.id}>
                    {team.emoji} {team.name}
                  </option>
                ))}
              </select>
            </div>
          </>
        )}

        <div className="flex flex-col gap-1">
          <label className="text-xs font-semibold text-gray-600" htmlFor="password">Contraseña</label>
          <input
            className="rounded-lg px-3 py-2 border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-brand-blue text-sm"
            type="password"
            name="password"
            placeholder="••••••••"
            required
          />
        </div>

        {isRegister && (
          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold text-gray-600" htmlFor="confirmPassword">Confirmar Contraseña</label>
            <input
              className="rounded-lg px-3 py-2 border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-brand-blue text-sm"
              type="password"
              name="confirmPassword"
              placeholder="••••••••"
              required
            />
          </div>
        )}

        {/* BOTONES PRINCIPALES */}
        {!isRegister ? (
          <button
            formAction={login}
            className="bg-gradient-to-r from-brand-blue to-brand-teal hover:from-brand-cyan hover:to-brand-mint rounded-lg px-4 py-2.5 text-white font-semibold text-sm mt-2 shadow-md transition-all"
          >
            Iniciar Sesión
          </button>
        ) : (
          <button
            formAction={signup}
            className="bg-gradient-to-r from-brand-blue to-brand-teal hover:from-brand-cyan hover:to-brand-mint rounded-lg px-4 py-2.5 text-white font-semibold text-sm mt-2 shadow-md transition-all"
          >
            Crear Cuenta
          </button>
        )}

        {/* INTERRUPTOR DE VISTA */}
        <div className="text-center mt-2">
          <a
            href={isRegister ? '/login' : '/login?view=register'}
            className="text-xs text-brand-blue hover:underline"
          >
            {isRegister ? '¿Ya tienes cuenta? Inicia sesión' : '¿No tienes cuenta? Regístrate aquí'}
          </a>
        </div>

        {/* FEEDBACK */}
        {error && (
          <p className="p-3 bg-red-50 text-red-600 text-center text-xs rounded-lg border border-red-100 mt-2 font-medium">
            ⚠️ {error}
          </p>
        )}
        {message && (
          <p className="p-3 bg-green-50 text-green-600 text-center text-xs rounded-lg border border-green-100 mt-2 font-medium">
            📩 {message}
          </p>
        )}
      </form>
    </div>
  )
}
