'use client'

import { useEffect, useRef, useState } from 'react'

// Evolución de un jugador en la clasificación global: su posición al cierre
// de cada jornada (get_lol_player_days). Solo pinta; los datos ya vienen
// calculados por la BD. Una sola serie, así que no lleva leyenda.

export interface RankHistoryPoint {
  day: string
  rank: number
  totalPoints: number
  players: number
}

const shortFmt = new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'short', timeZone: 'UTC' })
const longFmt = new Intl.DateTimeFormat('es-ES', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' })
const asDate = (day: string) => new Date(`${day}T12:00:00Z`)
/** "jueves, 1 de octubre" → "Jueves, 1 de octubre" (capitalize pondría "De Octubre"). */
const longDay = (day: string) => {
  const s = longFmt.format(asDate(day))
  return s.charAt(0).toUpperCase() + s.slice(1)
}

const HEIGHT = 180
const PAD = { top: 16, right: 40, bottom: 26, left: 36 }

/**
 * Fondo del eje Y: el peor puesto del jugador redondeado hacia arriba (a 5
 * o a 10), no el total de jugadores, para que se vea cómo se mueve. El total
 * va en el tooltip y en la tabla.
 */
function axisBottom(worstRank: number): number {
  if (worstRank <= 1) return 1
  if (worstRank <= 5) return worstRank + 1
  const step = worstRank <= 50 ? 5 : 10
  return Math.ceil((worstRank + 1) / step) * step
}

/** Marcas del eje Y: 1, el fondo y, si cabe, una redonda en medio. */
function rankTicks(maxRank: number): number[] {
  if (maxRank <= 1) return [1]
  const mid = Math.round(maxRank / 2 / 5) * 5 || Math.round(maxRank / 2)
  return [...new Set([1, mid, maxRank])].filter(v => v >= 1 && v <= maxRank)
}

export default function RankHistoryChart({ points }: { points: RankHistoryPoint[] }) {
  const boxRef = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(0)
  const [active, setActive] = useState<number | null>(null)

  useEffect(() => {
    const el = boxRef.current
    if (!el) return
    const ro = new ResizeObserver(([entry]) => setWidth(Math.floor(entry.contentRect.width)))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const n = points.length
  const maxRank = axisBottom(Math.max(...points.map(p => p.rank)))
  const innerW = Math.max(width - PAD.left - PAD.right, 1)
  const innerH = HEIGHT - PAD.top - PAD.bottom
  const x = (i: number) => PAD.left + (n === 1 ? innerW / 2 : (i / (n - 1)) * innerW)
  const y = (rank: number) => PAD.top + (maxRank === 1 ? 0 : ((rank - 1) / (maxRank - 1)) * innerH)

  const path = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(p.rank).toFixed(1)}`).join(' ')
  const last = points[n - 1]
  const shown = active ?? null
  const sel = shown !== null ? points[shown] : null

  function nearest(clientX: number, rect: DOMRect) {
    if (n === 1) return 0
    const rel = (clientX - rect.left - PAD.left) / innerW
    return Math.min(n - 1, Math.max(0, Math.round(rel * (n - 1))))
  }

  function onKey(e: React.KeyboardEvent) {
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      e.preventDefault()
      const step = e.key === 'ArrowLeft' ? -1 : 1
      setActive(a => Math.min(n - 1, Math.max(0, (a ?? n - 1) + step)))
    } else if (e.key === 'Escape') {
      setActive(null)
    }
  }

  // Tooltip a un lado del punto, sin salirse de la tarjeta.
  const tipLeft = sel !== null && shown !== null ? Math.min(Math.max(x(shown) - 70, 4), Math.max(width - 144, 4)) : 0
  const tipTop = sel !== null ? (y(sel.rank) > HEIGHT / 2 ? 4 : HEIGHT - 70) : 0

  return (
    <section aria-labelledby="jugador-evolucion" className="bg-bg-elevated border border-border rounded-panel shadow-card px-4 sm:px-5 pt-4 pb-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h2 id="jugador-evolucion" className="heading-display text-sm font-bold text-text-muted">
          Evolución en la clasificación
        </h2>
        <p className="text-xs text-text-muted">Posición global al cierre de cada jornada</p>
      </div>

      <div ref={boxRef} className="relative mt-3 select-none" style={{ height: HEIGHT }}>
        {width > 0 && (
          <svg
            width={width}
            height={HEIGHT}
            role="img"
            tabIndex={0}
            aria-label={`Posición en ${n} jornada${n !== 1 ? 's' : ''}: ahora ${last.rank}º de ${last.players}. Usa las flechas para recorrer las jornadas.`}
            className="block outline-none focus-visible:ring-2 focus-visible:ring-accent rounded-sm touch-pan-y"
            onPointerMove={e => setActive(nearest(e.clientX, e.currentTarget.getBoundingClientRect()))}
            onPointerDown={e => setActive(nearest(e.clientX, e.currentTarget.getBoundingClientRect()))}
            onPointerLeave={e => { if (e.pointerType === 'mouse') setActive(null) }}
            onFocus={() => setActive(a => a ?? n - 1)}
            onBlur={() => setActive(null)}
            onKeyDown={onKey}
          >
            {/* Rejilla y eje Y (1 arriba) */}
            {rankTicks(maxRank).map(t => (
              <g key={t}>
                <line x1={PAD.left} x2={width - PAD.right} y1={y(t)} y2={y(t)} className="stroke-border" strokeWidth={1} />
                <text x={PAD.left - 8} y={y(t)} dy="0.35em" textAnchor="end" className="fill-text-muted text-[10px] tabular-nums">
                  {t}º
                </text>
              </g>
            ))}

            {/* Eje X: primera y última jornada */}
            <text x={x(0)} y={HEIGHT - 6} textAnchor={n === 1 ? 'middle' : 'start'} className="fill-text-muted text-[10px]">
              {shortFmt.format(asDate(points[0].day))}
            </text>
            {n > 1 && (
              <text x={x(n - 1)} y={HEIGHT - 6} textAnchor="end" className="fill-text-muted text-[10px]">
                {shortFmt.format(asDate(last.day))}
              </text>
            )}

            {/* Cruz del punto activo */}
            {shown !== null && (
              <line x1={x(shown)} x2={x(shown)} y1={PAD.top} y2={HEIGHT - PAD.bottom} className="stroke-text-muted/50" strokeWidth={1} />
            )}

            <path d={path} fill="none" className="stroke-accent" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />

            {/* Punto final con su posición, y el activo */}
            <circle cx={x(n - 1)} cy={y(last.rank)} r={4} className="fill-accent stroke-bg-elevated" strokeWidth={2} />
            <text x={x(n - 1) + 8} y={y(last.rank)} dy="0.35em" className="fill-text-primary text-[11px] font-semibold tabular-nums">
              {last.rank}º
            </text>
            {shown !== null && shown !== n - 1 && (
              <circle cx={x(shown)} cy={y(points[shown].rank)} r={4} className="fill-accent stroke-bg-elevated" strokeWidth={2} />
            )}
          </svg>
        )}

        {sel && (
          <div
            aria-hidden
            className="pointer-events-none absolute w-36 rounded-card border border-border bg-bg-elevated shadow-card px-2.5 py-1.5 text-xs"
            style={{ left: tipLeft, top: tipTop }}
          >
            <p className="text-text-primary">
              <strong className="text-sm tabular-nums">{sel.rank}º</strong>
              <span className="text-text-muted"> de {sel.players}</span>
            </p>
            <p className="text-text-primary tabular-nums">{sel.totalPoints} pts</p>
            <p className="text-text-muted truncate">{longDay(sel.day)}</p>
          </div>
        )}
      </div>

      {/* Lo que la gráfica dice en voz alta para lectores de pantalla y teclado */}
      <p className="sr-only" aria-live="polite">
        {sel ? `${longDay(sel.day)}: ${sel.rank}º de ${sel.players}, ${sel.totalPoints} puntos` : ''}
      </p>

      <details className="mt-1 text-xs text-text-muted">
        <summary className="cursor-pointer w-fit hover:text-accent">Ver tabla</summary>
        <div className="mt-2 pr-2 max-h-60 overflow-y-auto">
          <table className="w-full">
            <thead>
              <tr className="text-left border-b border-border">
                <th className="py-1 font-semibold">Jornada</th>
                <th className="py-1 font-semibold text-right">Posición</th>
                <th className="py-1 font-semibold text-right">Puntos</th>
              </tr>
            </thead>
            <tbody>
              {[...points].reverse().map(p => (
                <tr key={p.day} className="border-b border-border/60 last:border-0">
                  <td className="py-1">{longDay(p.day)}</td>
                  <td className="py-1 text-right tabular-nums text-text-primary">{p.rank}º <span className="text-text-muted">/ {p.players}</span></td>
                  <td className="py-1 text-right tabular-nums text-text-primary">{p.totalPoints}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </section>
  )
}
