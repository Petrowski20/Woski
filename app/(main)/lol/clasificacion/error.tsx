'use client'

import { useEffect } from 'react'

// Fallo al cargar la clasificación o al cambiar de competición. Nunca se
// muestra el error técnico: queda en los logs del servidor.
export default function LolClasificacionError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string }
  unstable_retry: () => void
}) {
  useEffect(() => {
    console.error(error)
  }, [error])

  const offline = typeof navigator !== 'undefined' && !navigator.onLine

  return (
    <div className="flex flex-col items-center gap-3 py-20 text-center">
      <span className="text-5xl" aria-hidden>🛠️</span>
      <h1 className="text-lg font-bold text-text-primary">No hemos podido cargar la clasificación</h1>
      <p className="text-sm text-text-muted max-w-sm">
        {offline
          ? 'Parece que no tienes conexión. Comprueba tu red e inténtalo de nuevo.'
          : 'Algo ha fallado al traer la clasificación. Suele arreglarse solo: inténtalo de nuevo en unos segundos.'}
      </p>
      <button
        type="button"
        onClick={() => unstable_retry()}
        className="mt-2 px-5 py-2 rounded-lg text-sm font-semibold bg-accent text-on-accent hover:opacity-90 transition-opacity"
      >
        Reintentar
      </button>
    </div>
  )
}
