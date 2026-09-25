// Lógica pura de series LoL (Bo1/Bo3/Bo5), compartida entre servidor y cliente.

export type BestOf = 1 | 3 | 5

export interface SeriesScore {
  home: number
  away: number
}

export const DEFAULT_BEST_OF: BestOf = 3

// Las predicciones se cierran 1h antes del inicio (igual que en el Mundial).
export const PREDICTION_CUTOFF_MS = 60 * 60 * 1000

export function parseBestOf(value: unknown): BestOf | null {
  const n = typeof value === 'string' ? Number(value) : value
  return n === 1 || n === 3 || n === 5 ? n : null
}

/** Formato de un partido: metadata.best_of > ruleset.default_best_of > DEFAULT_BEST_OF. */
export function resolveBestOf(matchMetadata: unknown, rulesetConfig: unknown): BestOf {
  const meta = (matchMetadata ?? {}) as Record<string, unknown>
  const cfg = (rulesetConfig ?? {}) as Record<string, unknown>
  return parseBestOf(meta.best_of) ?? parseBestOf(cfg.default_best_of) ?? DEFAULT_BEST_OF
}

/**
 * Resultados posibles de la serie, de "local arrasa" a "visitante arrasa".
 * Bo5 → 3-0, 3-1, 3-2, 2-3, 1-3, 0-3
 * Bo3 → 2-0, 2-1, 1-2, 0-2
 * Bo1 → 1-0, 0-1
 */
export function seriesOutcomes(bestOf: BestOf): SeriesScore[] {
  const wins = (bestOf + 1) / 2
  const homeWins: SeriesScore[] = []
  const awayWins: SeriesScore[] = []
  for (let l = 0; l < wins; l++) {
    homeWins.push({ home: wins, away: l })
    awayWins.unshift({ home: l, away: wins })
  }
  return [...homeWins, ...awayWins]
}

export function outcomeIndex(bestOf: BestOf, score: SeriesScore | null): number {
  if (!score) return -1
  return seriesOutcomes(bestOf).findIndex(o => o.home === score.home && o.away === score.away)
}

export function sameScore(a: SeriesScore | null, b: SeriesScore | null): boolean {
  if (!a || !b) return a === b
  return a.home === b.home && a.away === b.away
}

export type MatchStatus = 'PENDING' | 'IN_PROGRESS' | 'FINISHED' | 'CANCELLED'

/** Un partido admite predicciones si no ha empezado/terminado y falta más de 1h. */
export function isPredictionLocked(status: MatchStatus, matchDateIso: string, now: number): boolean {
  if (status !== 'PENDING') return true
  return now >= new Date(matchDateIso).getTime() - PREDICTION_CUTOFF_MS
}

interface SeriesRuleset {
  correct_winner_points?: number
  exact_score_points?: number
}

export function scoreSeriesPrediction(
  rulesetConfig: unknown,
  prediction: SeriesScore,
  result: SeriesScore,
): { points: number; correctWinner: boolean; correctScore: boolean } {
  const cfg = (rulesetConfig ?? {}) as SeriesRuleset
  const winnerPts = cfg.correct_winner_points ?? 1
  const exactPts = cfg.exact_score_points ?? 3

  const correctScore = sameScore(prediction, result)
  const correctWinner = Math.sign(prediction.home - prediction.away) === Math.sign(result.home - result.away)
  const points = correctScore ? exactPts : correctWinner ? winnerPts : 0
  return { points, correctWinner, correctScore }
}
