'use client'

import Image from 'next/image'

export interface PodiumEntry {
  profileId: string
  nickname: string
  avatarUrl: string | null
  pts: number
}

interface PodiumTop3Props {
  top3: PodiumEntry[]
  next2?: PodiumEntry[]
  title: string
  subtitle?: string
}

const CONFETTI_COLORS = [
  'var(--color-brand-blue)',
  'var(--color-brand-cyan)',
  'var(--color-brand-teal)',
  'var(--color-brand-mint)',
  'var(--color-brand-green)',
  'var(--color-brand-accent)',
]

// Determinista (no Math.random) para que el render de servidor y cliente coincidan.
function confettiPieces(count: number) {
  return Array.from({ length: count }, (_, i) => {
    const left = (i * 37) % 100
    const delay = (i % 10) * 0.18
    const duration = 2.4 + (i % 5) * 0.3
    const size = 6 + (i % 4) * 2
    const color = CONFETTI_COLORS[i % CONFETTI_COLORS.length]
    const rounded = i % 3 === 0
    return { left, delay, duration, size, color, rounded, key: i }
  })
}

function Avatar({ url, initial, size }: { url: string | null; initial: string; size: number }) {
  return (
    <div
      className="relative rounded-full overflow-hidden bg-blue-100 dark:bg-blue-900 border-2 border-white dark:border-slate-900 shadow-md flex items-center justify-center shrink-0"
      style={{ width: size, height: size }}
    >
      {url ? (
        <Image src={url} alt={initial} fill sizes={`${size}px`} className="object-cover" />
      ) : (
        <span className="font-bold text-blue-600 dark:text-blue-400" style={{ fontSize: size * 0.4 }}>
          {initial}
        </span>
      )}
    </div>
  )
}

const STEP_CONFIG = [
  { position: 2, medal: '🥈', height: 'h-24 sm:h-28', avatarSize: 56, order: 'order-1', delay: '0.15s' },
  { position: 1, medal: '🥇', height: 'h-32 sm:h-40', avatarSize: 72, order: 'order-2', delay: '0.45s' },
  { position: 3, medal: '🥉', height: 'h-16 sm:h-20', avatarSize: 48, order: 'order-3', delay: '0s' },
] as const

export default function PodiumTop3({ top3, next2 = [], title, subtitle }: PodiumTop3Props) {
  if (top3.length === 0) return null

  const byPosition = new Map(top3.map((entry, i) => [i + 1, entry]))
  const confetti = confettiPieces(28)

  return (
    <div className="relative overflow-hidden rounded-2xl border border-[#FFD6D1] dark:border-slate-800 bg-gradient-to-b from-amber-50 via-white to-white dark:from-amber-900/10 dark:via-slate-900 dark:to-slate-900 px-4 py-8 sm:py-10 mb-6">
      {/* Confeti */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        {confetti.map(c => (
          <span
            key={c.key}
            className="absolute top-0"
            style={{
              left: `${c.left}%`,
              width: c.size,
              height: c.size,
              backgroundColor: c.color,
              borderRadius: c.rounded ? '9999px' : '2px',
              animation: `podium-confetti-fall ${c.duration}s ease-in ${c.delay}s infinite`,
            }}
          />
        ))}
      </div>

      <div className="relative text-center mb-8">
        <h2 className="text-xl sm:text-2xl font-extrabold text-gray-900 dark:text-gray-100">{title}</h2>
        {subtitle && (
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{subtitle}</p>
        )}
      </div>

      <div className="relative flex items-end justify-center gap-3 sm:gap-6 max-w-lg mx-auto">
        {STEP_CONFIG.map(step => {
          const entry = byPosition.get(step.position)
          if (!entry) return <div key={step.position} className={`flex-1 ${step.order}`} />

          return (
            <div
              key={step.position}
              className={`flex-1 flex flex-col items-center ${step.order} opacity-0`}
              style={{ animation: `podium-rise 0.6s ease-out ${step.delay} forwards` }}
            >
              {step.position === 1 && (
                <span
                  className="text-4xl sm:text-5xl mb-1 inline-block"
                  style={{ animation: 'podium-trophy-bounce 2s ease-in-out infinite' }}
                >
                  🏆
                </span>
              )}

              <Avatar url={entry.avatarUrl} initial={entry.nickname.charAt(0).toUpperCase()} size={step.avatarSize} />

              <span className="text-2xl mt-2 leading-none">{step.medal}</span>

              <span className="font-bold text-gray-900 dark:text-gray-100 text-sm sm:text-base mt-1 text-center truncate max-w-full px-1">
                {entry.nickname}
              </span>
              <span className="text-xs sm:text-sm font-semibold text-blue-600 dark:text-blue-400">
                {entry.pts} pts
              </span>

              <div
                className={`w-full mt-3 rounded-t-lg ${step.height} ${
                  step.position === 1
                    ? 'bg-gradient-to-t from-amber-300 to-amber-200 dark:from-amber-600/40 dark:to-amber-500/30'
                    : step.position === 2
                    ? 'bg-gradient-to-t from-slate-300 to-slate-200 dark:from-slate-600/40 dark:to-slate-500/30'
                    : 'bg-gradient-to-t from-orange-300 to-orange-200 dark:from-orange-700/40 dark:to-orange-600/30'
                } flex items-start justify-center pt-2`}
              >
                <span className="text-lg sm:text-xl font-black text-white/80 dark:text-white/70">
                  {step.position}
                </span>
              </div>
            </div>
          )
        })}
      </div>

      {next2.length > 0 && (
        <div className="relative flex justify-center gap-3 mt-6 max-w-md mx-auto">
          {next2.map((entry, i) => (
            <div
              key={entry.profileId}
              className="flex items-center gap-2 flex-1 min-w-0 bg-white/80 dark:bg-slate-800/60 rounded-xl border border-gray-200 dark:border-slate-700 px-3 py-2 opacity-0"
              style={{ animation: `podium-rise 0.5s ease-out ${0.65 + i * 0.15}s forwards` }}
            >
              <span className="text-xs font-bold text-gray-400 dark:text-gray-500 w-4 text-center shrink-0">
                {i + 4}
              </span>
              <Avatar url={entry.avatarUrl} initial={entry.nickname.charAt(0).toUpperCase()} size={32} />
              <span className="text-xs font-semibold text-gray-800 dark:text-gray-100 truncate min-w-0 flex-1">
                {entry.nickname}
              </span>
              <span className="text-xs font-bold text-blue-600 dark:text-blue-400 shrink-0">
                {entry.pts} pts
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
