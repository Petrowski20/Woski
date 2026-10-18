// Lectura del config de un ruleset LoL para EXPLICAR las reglas en la web
// (página de reglas, leyenda de la clasificación). No puntúa nada: los
// valores salen tal cual del config y, donde el config no los tiene,
// son los mismos que usa la BD (lol_score_breakdown y lol_standings_at,
// migraciones 20261014120002 y 20261020100001).

export interface ShareTier {
  minShare: number
  points: number
}

export interface ShareBlock {
  /** De mayor a menor min_share. */
  tiers: ShareTier[]
  solePoints: number
  fallbackPoints: number
  minVotersOverride: number | null
  minVotersPercent: number
}

export interface StreakTier {
  from: number
  bonus: number
}

export interface LolRulesSummary {
  version: 1 | 2
  cutoffMinutes: number
  /** Solo v2. */
  winner: ShareBlock | null
  exact: ShareBlock | null
  /** De menor a mayor from. */
  streakTiers: StreakTier[]
  countExactScore: boolean
  perfectDay: { positive: number; negative: number }
  featuredBonus: number
  /** v1: puntos fijos. */
  v1: { winner: number; exact: number } | null
}

const num = (v: unknown, fallback: number): number =>
  typeof v === 'number' && Number.isFinite(v) ? v : typeof v === 'string' && v !== '' && Number.isFinite(Number(v)) ? Number(v) : fallback

function obj(v: unknown): Record<string, unknown> {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {}
}

function parseShareBlock(v: unknown): ShareBlock {
  const b = obj(v)
  const tiers = (Array.isArray(b.tiers) ? b.tiers : [])
    .map(t => ({ minShare: num(obj(t).min_share, 0), points: num(obj(t).points, 0) }))
    .sort((a, z) => z.minShare - a.minShare)
  return {
    tiers,
    solePoints: num(b.sole_voter_points, 0),
    fallbackPoints: num(b.fallback_points, 0),
    minVotersOverride: b.min_voters_override == null ? null : num(b.min_voters_override, 1),
    minVotersPercent: num(b.min_voters_percent, 1),
  }
}

export function parseLolRules(config: unknown): LolRulesSummary {
  const cfg = obj(config)
  const v2 = cfg.version === 2 || cfg.version === '2'
  const streak = obj(cfg.streak_bonus)
  const perfect = obj(cfg.perfect_day)
  return {
    version: v2 ? 2 : 1,
    // 60 por defecto, como matches.prediction_locks_at.
    cutoffMinutes: num(cfg.prediction_cutoff_minutes, 60),
    winner: v2 ? parseShareBlock(cfg.winner_points) : null,
    exact: v2 ? parseShareBlock(cfg.exact_score_points) : null,
    streakTiers: v2
      ? (Array.isArray(streak.tiers) ? streak.tiers : [])
          .map(t => ({ from: num(obj(t).from, 1), bonus: num(obj(t).bonus, 0) }))
          .sort((a, z) => a.from - z.from)
      : [],
    countExactScore: v2 && streak.count_exact_score === true,
    // v1: pleno negativo −1 y positivo 0, fijos en lol_standings_at.
    perfectDay: v2
      ? { positive: num(perfect.positive, 0), negative: num(perfect.negative, 0) }
      : { positive: 0, negative: -1 },
    featuredBonus: v2 ? num(cfg.featured_match_bonus, 0) : 0,
    v1: v2 ? null : { winner: num(cfg.correct_winner_points, 1), exact: num(cfg.exact_score_points, 3) },
  }
}

/** Bonus del tramo con mayor from <= longitud (igual que lol_streak_bonus). */
export function streakBonusFor(tiers: StreakTier[], length: number): number {
  let bonus = 0
  for (const t of tiers) if (t.from <= length) bonus = t.bonus
  return bonus
}

/** "−2", "+1", "0" para mostrar puntos con signo. */
export function signedPoints(n: number): string {
  if (n > 0) return `+${n}`
  if (n < 0) return `−${Math.abs(n)}`
  return '0'
}
