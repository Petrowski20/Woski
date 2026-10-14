import type { BestOf, MatchStatus, SeriesScore } from './series'

export interface LolEditionOption {
  id: number
  label: string
  fullName: string
  /** YYYY-MM-DD; decide la edición por defecto. */
  startDate: string
}

export interface LolTeamView {
  id: number
  name: string
  /** Sigla (teams.iso_code): "G2", "MKOI". Se usa en marcadores ("3-1 G2"). */
  tag: string
  logoUrl: string | null
  /** Récord en la fase del partido (solo partidos ya resueltos). */
  record: { wins: number; losses: number }
}

export interface VoteShare extends SeriesScore {
  votes: number
  pct: number
}

/**
 * Desglose de los puntos de una serie, tal cual lo devuelve la BD
 * (get_my_lol_breakdowns → lol_score_breakdown). Aquí no se calcula nada.
 */
export interface ScoreBreakdown {
  rulesVersion: number
  correctWinner: boolean
  correctScore: boolean
  baseWinner: number
  baseExact: number
  streakLength: number
  streakBonus: number
  featuredBonus: number
  total: number
  /** % de votantes que eligió el mismo ganador / marcador (solo v2 y si acertó). */
  winnerShare: number | null
  exactShare: number | null
  /** 'sole' (único), 'fallback' (único sin votantes suficientes) o 'min_share:N'. */
  winnerTier: string | null
  exactTier: string | null
}

export interface LolMatchView {
  id: number
  date: string
  /** Cierre de la votación (matches.prediction_locks_at, calculado en la BD). */
  locksAt: string
  status: MatchStatus
  phaseName: string
  bestOf: BestOf
  home: LolTeamView
  away: LolTeamView
  result: SeriesScore | null
  /** Partido de la jornada (matches.metadata.featured_match). */
  featured: boolean
  myPrediction: (SeriesScore & { points: number | null; breakdown: ScoreBreakdown | null }) | null
  /** Solo presente cuando la votación del partido ya está cerrada. */
  distribution: { total: number; shares: VoteShare[] } | null
}

export type SaveErrorCode =
  | 'UNAUTHENTICATED'
  | 'LOCKED'
  | 'INVALID'
  | 'NOT_FOUND'
  | 'SERVER'
  | 'NETWORK'

export interface PredictionDraft extends SeriesScore {
  matchId: number
}

export type SaveMatchResult =
  | {
      matchId: number
      ok: true
      prediction: SeriesScore
    }
  | { matchId: number; ok: false; code: Exclude<SaveErrorCode, 'NETWORK' | 'UNAUTHENTICATED'> }

export type SavePredictionsResponse =
  | { ok: false; code: 'UNAUTHENTICATED' }
  | { ok: true; results: SaveMatchResult[] }

export interface RankingRow {
  profileId: string
  nickname: string
  avatarUrl: string | null
  points: number
  position: number
}

export interface PoolOption {
  id: number
  name: string
}

/** Fila de la clasificación completa de una edición (get_lol_standings). */
export interface StandingRow extends RankingRow {
  correctWinners: number
  finishedSeries: number
  perfectDays: number
  negativeDays: number
  currentStreak: number
  /** + = sube respecto a la jornada anterior; null si no hay jornada anterior. */
  movement: number | null
}
