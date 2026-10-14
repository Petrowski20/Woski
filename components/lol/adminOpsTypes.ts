// Forma de lo que devuelve admin_lol_ops_today() (migración 20261015100001).
// Fechas en ISO UTC; la interfaz las muestra en Europe/Madrid.

export interface OpsMatch {
  id: number
  edition_id: number
  edition: string
  phase: string
  home: string
  away: string
  status: 'PENDING' | 'IN_PROGRESS' | 'FINISHED' | 'CANCELLED'
  best_of: number
  featured: boolean
  match_date: string
  locks_at: string
  votes: number
  participants: number
}

export interface OpsOpenDay {
  edition_id: number
  edition: string
  /** YYYY-MM-DD en la zona horaria de la sede. */
  day: string
  series: number
  finished: number
  pending: OpsMatch[]
  /** Pendientes cuya hora ya pasó: mantienen la jornada abierta. */
  blocking: OpsMatch[]
}

export interface OpsPhase {
  id: number
  name: string
  order: number
  ruleset: string
  version: number
  default_best_of: number | null
  cutoff_minutes: number | null
  current: boolean
}

export interface OpsEdition {
  id: number
  name: string
  timezone: string
  phases: OpsPhase[]
}

export interface OpsToday {
  now: string
  open: OpsMatch[]
  needs_result: OpsMatch[]
  open_days: OpsOpenDay[]
  editions: OpsEdition[]
}
