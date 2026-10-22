// Swiss Stage (Worlds): ronda y balance de cada serie, solo para mostrarlos
// en la tarjeta. No puntúa nada.
//
// Formato: todos empiezan 0-0; en cada ronda se cruzan equipos con el mismo
// balance. Con 3 victorias se clasifica y con 3 derrotas queda eliminado,
// así que hay hasta 5 rondas.

/** Una fase es suiza si su nombre lo dice ("Swiss Stage", "Fase suiza", "Suizo"…). */
export function isSwissPhase(name: string): boolean {
  return /\bswiss\b|\bsuiz[oa]\b/i.test(name)
}

export const SWISS_WINS = 3

export interface SwissSeries {
  id: number
  /** ISO (match_date). */
  date: string
  status: string
  homeId: number
  awayId: number
  result: { home: number; away: number } | null
}

/** 'qualify': el que gane se clasifica; 'eliminate': el que pierda se va; 'decider': las dos cosas. */
export type SwissStakes = 'qualify' | 'eliminate' | 'decider' | null

export interface SwissInfo {
  round: number
  /** Balance de los dos equipos antes de la serie; null si aún falta algún resultado anterior o no coinciden. */
  record: { wins: number; losses: number } | null
  stakes: SwissStakes
}

/**
 * Ronda (1, 2, …) y balance previo de cada serie de UNA fase suiza, en orden
 * (fecha, id). Las canceladas no cuentan. Ronda = series anteriores del
 * equipo + 1 (la mayor de los dos). Si a un equipo le falta el resultado de
 * una serie anterior, su balance es desconocido (null) desde ahí.
 */
export function swissInfo(series: SwissSeries[]): Map<number, SwissInfo> {
  const out = new Map<number, SwissInfo>()
  const teams = new Map<number, { played: number; wins: number; losses: number; known: boolean }>()
  const of = (id: number) => {
    if (!teams.has(id)) teams.set(id, { played: 0, wins: 0, losses: 0, known: true })
    return teams.get(id)!
  }
  const ordered = series
    .filter(s => s.status !== 'CANCELLED')
    .sort((a, b) => Date.parse(a.date) - Date.parse(b.date) || a.id - b.id)

  for (const s of ordered) {
    const h = of(s.homeId)
    const a = of(s.awayId)
    const same = h.known && a.known && h.wins === a.wins && h.losses === a.losses
    const record = same ? { wins: h.wins, losses: h.losses } : null
    const stakes: SwissStakes = !record
      ? null
      : record.wins === SWISS_WINS - 1 && record.losses === SWISS_WINS - 1
        ? 'decider'
        : record.wins === SWISS_WINS - 1
          ? 'qualify'
          : record.losses === SWISS_WINS - 1
            ? 'eliminate'
            : null
    out.set(s.id, { round: Math.max(h.played, a.played) + 1, record, stakes })

    h.played++
    a.played++
    if (s.status === 'FINISHED' && s.result && s.result.home !== s.result.away) {
      const homeWon = s.result.home > s.result.away
      ;(homeWon ? h : a).wins++
      ;(homeWon ? a : h).losses++
    } else {
      h.known = false
      a.known = false
    }
  }
  return out
}

/** "LCK #1"; null si falta la liga o el número. */
export function formatSeed(league: string | null | undefined, seed: number | null | undefined): string | null {
  return league && seed ? `${league} #${seed}` : null
}
