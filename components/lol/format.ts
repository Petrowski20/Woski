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
