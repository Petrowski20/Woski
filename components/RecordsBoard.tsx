'use client'

export interface AwardCard {
  emoji: string
  title: string
  description: string
  holder: string
  value: string
  colorClass: string
}

interface Props {
  awards: AwardCard[]
  updatedLabel: string
}

export default function RecordsBoard({ awards, updatedLabel }: Props) {
  if (awards.length === 0) {
    return (
      <div className="text-center py-20 text-gray-400 dark:text-gray-600">
        <p className="text-4xl mb-3">🏆</p>
        <p className="text-sm">Aún no hay suficientes predicciones para los récords.</p>
        <p className="text-xs mt-1">¡Predice partidos para aparecer aquí!</p>
      </div>
    )
  }

  return (
    <div>
      <p className="text-xs text-gray-400 dark:text-gray-500 mb-6">{updatedLabel}</p>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {awards.map((award, i) => (
          <div
            key={i}
            className={`relative overflow-hidden rounded-2xl border p-5 flex flex-col gap-2 shadow-sm hover:shadow-md transition-shadow ${award.colorClass}`}
          >
            <div className="text-4xl leading-none">{award.emoji}</div>

            <div>
              <p className="font-bold text-gray-900 dark:text-gray-100 text-base leading-tight">
                {award.title}
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                {award.description}
              </p>
            </div>

            <div className="mt-auto pt-3 border-t border-black/5 dark:border-white/5 flex items-end justify-between gap-2">
              <p className="font-semibold text-gray-800 dark:text-gray-200 text-sm truncate">
                {award.holder}
              </p>
              <span className="font-mono font-bold text-lg text-gray-900 dark:text-gray-100 shrink-0">
                {award.value}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
