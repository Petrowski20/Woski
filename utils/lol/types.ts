import type { BestOf, MatchStatus, SeriesScore } from './series'

export interface LolEditionOption {
  id: number
  label: string
  fullName: string
}

export interface LolTeamView {
  id: number
  name: string
  tag: string
  logoUrl: string | null
  /** Récord en la fase del partido (solo partidos ya resueltos). */
  record: { wins: number; losses: number }
}

export interface VoteShare extends SeriesScore {
  votes: number
  pct: number
}

export interface LolMatchView {
  id: number
  date: string
  status: MatchStatus
  phaseName: string
  bestOf: BestOf
  home: LolTeamView
  away: LolTeamView
  result: SeriesScore | null
  myPrediction: (SeriesScore & { points: number | null }) | null
  /** Solo presente si el usuario ya ha votado este partido. */
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
      /** null si el guardado fue bien pero no se pudo leer el desglose. */
      distribution: { total: number; shares: VoteShare[] } | null
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
