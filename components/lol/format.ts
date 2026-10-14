import type { SeriesScore } from '@/utils/lol/series'

/** "3-1 G2": marcador desde el punto de vista del ganador + ganador. */
export function formatSeriesScore(score: SeriesScore, homeName: string, awayName: string): string {
  const homeWins = score.home > score.away
  const hi = Math.max(score.home, score.away)
  const lo = Math.min(score.home, score.away)
  return `${hi}-${lo} ${homeWins ? homeName : awayName}`
}

// Zona horaria fija para que servidor y cliente formateen igual (evita
// desajustes de hidratación).
const dateFmt = new Intl.DateTimeFormat('es-ES', {
  weekday: 'short',
  day: 'numeric',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'Europe/Madrid',
})

export function formatMatchDate(iso: string): string {
  return dateFmt.format(new Date(iso))
}

// "2026-10-17T20:00" en hora de Madrid, para <input type="datetime-local">.
const localInputFmt = new Intl.DateTimeFormat('sv-SE', {
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
  timeZone: 'Europe/Madrid',
})

export function toMadridInputValue(iso: string): string {
  return localInputFmt.format(new Date(iso)).replace(' ', 'T')
}

/** "en 2 h 15 min", "en 3 d 4 h" o "ya" (solo presentación). */
export function formatTimeLeft(iso: string, now: number): string {
  const ms = new Date(iso).getTime() - now
  if (ms <= 0) return 'ya'
  const min = Math.floor(ms / 60000)
  const d = Math.floor(min / 1440)
  const h = Math.floor((min % 1440) / 60)
  const m = min % 60
  if (d > 0) return `en ${d} d ${h} h`
  if (h > 0) return `en ${h} h ${m} min`
  return `en ${m} min`
}
