'use client'

import { useRef } from 'react'
import { outcomeIndex, seriesOutcomes, type BestOf, type SeriesScore } from '@/utils/lol/series'

interface Props {
  bestOf: BestOf
  value: SeriesScore | null
  onChange?: (value: SeriesScore) => void
  disabled?: boolean
  homeName: string
  awayName: string
  /** Texto accesible del valor actual (p. ej. "3-1 G2"). */
  valueText: string
}

/**
 * Slider discreto con una parada por resultado posible de la serie.
 * Izquierda = gana el equipo local (team-a), derecha = visitante (team-b).
 * El tramo desde el centro hasta la parada elegida se rellena con el color
 * del equipo hacia el que se inclina.
 */
export default function SeriesSlider({ bestOf, value, onChange, disabled, homeName, awayName, valueText }: Props) {
  const outcomes = seriesOutcomes(bestOf)
  const n = outcomes.length
  const half = n / 2
  const idx = outcomeIndex(bestOf, value)
  const trackRef = useRef<HTMLDivElement>(null)

  const pos = (i: number) => (i / (n - 1)) * 100
  const leansHome = idx !== -1 && idx < half

  const select = (i: number) => {
    const clamped = Math.max(0, Math.min(n - 1, i))
    if (clamped !== idx) onChange?.(outcomes[clamped])
  }

  const indexFromPointer = (clientX: number) => {
    const rect = trackRef.current!.getBoundingClientRect()
    const ratio = (clientX - rect.left) / rect.width
    return Math.round(ratio * (n - 1))
  }

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (disabled) return
    e.currentTarget.setPointerCapture(e.pointerId)
    select(indexFromPointer(e.clientX))
  }

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (disabled || !e.currentTarget.hasPointerCapture(e.pointerId)) return
    select(indexFromPointer(e.clientX))
  }

  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (disabled) return
    const step = (dir: -1 | 1) => {
      // Sin selección: la primera pulsación elige el resultado más ajustado de ese lado
      if (idx === -1) return dir === -1 ? half - 1 : half
      return idx + dir
    }
    switch (e.key) {
      case 'ArrowLeft':
      case 'ArrowDown': select(step(-1)); break
      case 'ArrowRight':
      case 'ArrowUp':   select(step(1)); break
      case 'Home':      select(0); break
      case 'End':       select(n - 1); break
      default: return
    }
    e.preventDefault()
  }

  // Tramo relleno: desde el centro (50%) hasta la parada elegida
  const fillStyle =
    idx === -1
      ? undefined
      : leansHome
        ? { left: `${pos(idx)}%`, width: `${50 - pos(idx)}%` }
        : { left: '50%', width: `${pos(idx) - 50}%` }

  const inFill = (i: number) =>
    idx !== -1 && (leansHome ? i >= idx && i < half : i <= idx && i >= half)

  return (
    <div className={disabled ? 'opacity-70' : ''}>
      <div
        role="slider"
        tabIndex={disabled ? -1 : 0}
        aria-label={`Resultado de la serie ${homeName} contra ${awayName}`}
        aria-valuemin={0}
        aria-valuemax={n - 1}
        aria-valuenow={idx === -1 ? undefined : idx}
        aria-valuetext={idx === -1 ? 'Sin elegir' : valueText}
        aria-disabled={disabled || undefined}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onKeyDown={onKeyDown}
        className={`relative py-3 px-3 rounded-lg touch-pan-y select-none focus:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
          disabled ? 'cursor-not-allowed' : 'cursor-pointer'
        }`}
      >
        <div ref={trackRef} className="relative h-2 rounded-full bg-bg-muted">
          {/* Centro */}
          <div className="absolute left-1/2 -translate-x-1/2 -top-1 h-4 w-0.5 rounded bg-border" />

          {fillStyle && (
            <div
              className={`absolute top-0 h-full rounded-full transition-all duration-150 ${leansHome ? 'bg-team-a' : 'bg-team-b'}`}
              style={fillStyle}
            />
          )}

          {outcomes.map((_, i) => (
            <span
              key={i}
              className={`absolute top-1/2 -translate-x-1/2 -translate-y-1/2 w-3 h-3 rounded-full border-2 border-bg-elevated ${
                inFill(i) ? (leansHome ? 'bg-team-a' : 'bg-team-b') : 'bg-border'
              }`}
              style={{ left: `${pos(i)}%` }}
            />
          ))}

          {idx !== -1 && (
            <span
              className={`absolute top-1/2 -translate-x-1/2 -translate-y-1/2 w-6 h-6 rounded-full bg-bg-elevated border-4 shadow transition-all duration-150 ${
                leansHome ? 'border-team-a' : 'border-team-b'
              }`}
              style={{ left: `${pos(idx)}%` }}
            />
          )}
        </div>
      </div>

      {/* Etiquetas de cada parada */}
      <div className="relative h-4 mx-3 text-[11px] font-semibold tabular-nums">
        {outcomes.map((o, i) => (
          <button
            key={i}
            type="button"
            tabIndex={-1}
            disabled={disabled}
            onClick={() => select(i)}
            className={`absolute -translate-x-1/2 disabled:cursor-not-allowed ${
              i === idx ? (leansHome ? 'text-team-a' : 'text-team-b') : 'text-text-muted'
            }`}
            style={{ left: `${pos(i)}%` }}
          >
            {o.home}-{o.away}
          </button>
        ))}
      </div>
    </div>
  )
}
