export default function LigasLoading() {
  return (
    <div className="w-full max-w-3xl mx-auto animate-pulse">

      {/* Cabecera */}
      <div className="mb-6">
        <div className="h-7 w-52 bg-gray-200 dark:bg-slate-700 rounded-md" />
        <div className="h-4 w-80 bg-gray-100 dark:bg-slate-800 rounded mt-2" />
      </div>

      {/* Aviso de ligas congeladas */}
      <div className="bg-white dark:bg-slate-900 rounded-xl border border-gray-100 dark:border-slate-800 p-6">
        <div className="h-4 w-3/4 bg-gray-100 dark:bg-slate-800 rounded" />
      </div>

      {/* Título sección */}
      <div className="mt-8 mb-4 h-5 w-36 bg-gray-200 dark:bg-slate-700 rounded" />

      {/* Grid de tarjetas liga */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="bg-white dark:bg-slate-900 rounded-xl border border-gray-100 dark:border-slate-800 p-5 flex flex-col gap-3"
          >
            {/* Nombre + badge */}
            <div className="flex items-start justify-between gap-2">
              <div className="h-5 w-36 bg-gray-200 dark:bg-slate-700 rounded" />
              <div className="h-4 w-10 bg-blue-100 dark:bg-blue-900/40 rounded-full" />
            </div>
            {/* Descripción */}
            <div className="space-y-1.5">
              <div className="h-3.5 bg-gray-100 dark:bg-slate-800 rounded w-full" />
              <div className="h-3.5 bg-gray-100 dark:bg-slate-800 rounded w-3/4" />
            </div>
            {/* Footer */}
            <div className="flex items-center justify-between pt-1 border-t border-gray-50 dark:border-slate-800/50">
              <div className="h-3 w-24 bg-gray-100 dark:bg-slate-700 rounded" />
              <div className="h-3 w-16 bg-gray-100 dark:bg-slate-700 rounded" />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
