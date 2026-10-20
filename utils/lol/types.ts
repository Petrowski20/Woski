import type { BestOf, MatchStatus, SeriesScore } from './series'
import type { LolEditionStatus } from './editionStatus'

export interface LolEditionOption {
  id: number
  label: string
  fullName: string
  /** YYYY-MM-DD; decide la edición por defecto. */
  startDate: string
}

/** Edición con sus fechas tal cual (pueden faltar), para admin y perfil. */
export interface LolEditionInfo extends Omit<LolEditionOption, 'startDate'> {
  startDate: string | null
  endDate: string | null
}

export interface LolTeamView {
  id: number
  name: string
  /** Sigla (teams.iso_code): "G2", "MKOI". Se usa en marcadores ("3-1 G2"). */
  tag: string
  /** URL pública del bucket team-logos; null → insignia con las siglas. */
  logoUrl: string | null
  /** teams.color ('#rrggbb') o null. */
  color: string | null
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
  /**
   * Solo con streak_bonus.exact_as_prediction: racha y bonus tras cada
   * predicción de la serie (ganador y, en Bo3/Bo5, marcador). Si no, null.
   */
  streakSteps: StreakStep[] | null
}

export interface StreakStep {
  prediction: 'winner' | 'exact'
  hit: boolean
  /** Racha tras esta predicción. */
  length: number
  /** Bonus pagado por esta predicción. */
  bonus: number
}

export interface LolMatchView {
  id: number
  date: string
  /** Cierre de la votación (matches.prediction_locks_at, calculado en la BD). */
  locksAt: string
  status: MatchStatus
  phaseId: number
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
  /** Racha más larga en la fase en curso (con count_exact_score, el exacto suma uno más). */
  bestStreak: number
  /** + = sube respecto a la jornada anterior; null si no hay jornada anterior. */
  movement: number | null
}

/** Resumen de LoL de una edición para el perfil (sin cálculos propios: BD). */
export interface ProfileLolEdition {
  edition: LolEditionInfo
  /** Activa / Finalizada / Empieza pronto (utils/lol/editionStatus). */
  status: LolEditionStatus
  /** Mi fila en la clasificación global; null si aún no participo. */
  standing: StandingRow | null
  participants: number
  /** En un pool solo cuentan las series desde que entraste (lo decide la BD). */
  pools: { id: number; name: string; position: number | null; points: number; participants: number }[]
  /** Series terminadas que voté, de la más reciente a la más antigua. */
  scored: LolMatchView[]
  exactHits: number
  /** Series Bo3/Bo5 terminadas que voté (las únicas con marcador exacto). */
  exactPlayed: number
}

/** Equipo de una serie en el historial de un jugador (lo que pinta TeamLogo). */
export type PlayerTeam = Pick<LolTeamView, 'id' | 'name' | 'tag' | 'logoUrl' | 'color'>

/**
 * Serie del historial de LoL de otro jugador (get_lol_player_history): solo
 * series con la votación cerrada. vote null = no votó; breakdown null = aún
 * sin resultado.
 */
export interface PlayerSeries {
  matchId: number
  date: string
  /** YYYY-MM-DD en la zona horaria de la edición (la de las jornadas). */
  day: string
  phaseId: number
  phaseName: string
  phaseOrder: number
  status: MatchStatus
  bestOf: BestOf
  featured: boolean
  home: PlayerTeam
  away: PlayerTeam
  result: SeriesScore | null
  vote: SeriesScore | null
  points: number | null
  breakdown: ScoreBreakdown | null
}

/** Jornada con pleno (get_lol_player_days); points = lo que sumó el pleno. */
export interface PlayerDay {
  day: string
  perfect: boolean
  negative: boolean
  points: number
}
