import type { SupabaseClient } from '@supabase/supabase-js'
import { lolEditionStatus } from '@/utils/lol/editionStatus'
import { isPredictionLocked, resolveBestOf, seriesOutcomes, type BestOf, type MatchStatus } from '@/utils/lol/series'
import { parseLolRules, type LolRulesSummary } from '@/utils/lol/rules'
import { formatSeed, isSwissPhase, swissInfo, type SwissInfo } from '@/utils/lol/swiss'
import type { LolEditionInfo, LolEditionOption, LolMatchView, PoolOption, ProfileLolEdition, RankingRow, ScoreBreakdown, StandingRow, StreakStep, VoteShare } from '@/utils/lol/types'

export const LOL_SPORT_SLUG = 'lol'

// Error de carga con el detalle técnico solo en logs del servidor;
// el usuario ve el mensaje amigable de error.tsx.
export class LolDataError extends Error {
  constructor(context: string, cause: unknown) {
    super(`[lol] ${context}`)
    console.error(`[lol] ${context}:`, cause)
  }
}

/** Fecha de hoy (YYYY-MM-DD) en horario peninsular español. */
function todayMadrid(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid' }).format(new Date())
}

// ── Ediciones activas ──────────────────────────────────────────────────────

export async function getActiveLolEditions(supabase: SupabaseClient): Promise<LolEditionOption[]> {
  const { data: competitions, error: compError } = await supabase
    .from('competitions')
    .select('id, name, sports!inner(slug)')
    .eq('sports.slug', LOL_SPORT_SLUG)
  if (compError) throw new LolDataError('competitions', compError)
  if (!competitions?.length) return []

  const compName = new Map(competitions.map(c => [c.id as number, c.name as string]))
  const today = todayMadrid()

  const { data: editions, error } = await supabase
    .from('editions')
    .select('id, name, competition_id, start_date, end_date')
    .in('competition_id', [...compName.keys()])
    .lte('start_date', today)
    .gte('end_date', today)
    .order('start_date', { ascending: true })
  if (error) throw new LolDataError('editions', error)

  const rows = editions ?? []
  // Si hay dos ediciones activas de la misma competición, el nombre de la
  // competición no basta para distinguirlas en la píldora.
  const perCompetition = new Map<number, number>()
  for (const e of rows) perCompetition.set(e.competition_id, (perCompetition.get(e.competition_id) ?? 0) + 1)

  return rows.map(e => {
    const comp = compName.get(e.competition_id) ?? ''
    return {
      id: e.id,
      label: perCompetition.get(e.competition_id)! > 1 ? `${comp} ${e.name}` : comp,
      fullName: `${comp} ${e.name}`,
      startDate: e.start_date,
    }
  })
}

/**
 * Todas las ediciones de LoL (pasadas, en curso y futuras), de la más
 * reciente a la más antigua. Para el admin y el perfil.
 */
export async function getLolEditions(supabase: SupabaseClient): Promise<LolEditionInfo[]> {
  const { data: competitions, error: compError } = await supabase
    .from('competitions')
    .select('id, name, sports!inner(slug)')
    .eq('sports.slug', LOL_SPORT_SLUG)
  if (compError) throw new LolDataError('competitions', compError)
  if (!competitions?.length) return []

  const compName = new Map(competitions.map(c => [c.id as number, c.name as string]))
  const { data: editions, error } = await supabase
    .from('editions')
    .select('id, name, competition_id, start_date, end_date')
    .in('competition_id', [...compName.keys()])
    .order('start_date', { ascending: false, nullsFirst: false })
    .order('id', { ascending: false })
  if (error) throw new LolDataError('editions', error)

  return (editions ?? []).map(e => {
    const comp = compName.get(e.competition_id) ?? ''
    return {
      id: e.id,
      label: `${comp} ${e.name}`,
      fullName: `${comp} ${e.name}`,
      startDate: e.start_date ?? null,
      endDate: e.end_date ?? null,
    }
  })
}

/** Hoy (YYYY-MM-DD, Madrid): para decidir qué edición está en curso. */
export function lolToday(): string {
  return todayMadrid()
}

/**
 * Edición pedida en la URL (?edicion=ID) si sigue activa; si no, la activa
 * con start_date más reciente. `editions` no puede estar vacío.
 */
export function pickLolEdition(editions: LolEditionOption[], edicion: unknown): LolEditionOption {
  return (
    editions.find(e => String(e.id) === edicion) ??
    editions.reduce((latest, e) => (e.startDate >= latest.startDate ? e : latest))
  )
}

// ── Partidos de una edición ────────────────────────────────────────────────

interface TeamRow { id: number; name: string; iso_code: string; logo_url: string | null; color: string | null }
interface MatchRow {
  id: number
  match_date: string
  prediction_locks_at: string
  status: MatchStatus
  home_goals: number | null
  away_goals: number | null
  metadata: unknown
  phase_id: number
  home_team: TeamRow
  away_team: TeamRow
}

export function buildDistribution(
  bestOf: BestOf,
  rows: { pred_home_goals: number; pred_away_goals: number; votes: number }[],
): { total: number; shares: VoteShare[] } {
  const outcomes = seriesOutcomes(bestOf)
  const counts = outcomes.map(o =>
    rows
      .filter(r => r.pred_home_goals === o.home && r.pred_away_goals === o.away)
      .reduce((s, r) => s + Number(r.votes), 0),
  )
  const total = counts.reduce((a, b) => a + b, 0)
  return {
    total,
    shares: outcomes.map((o, i) => ({
      ...o,
      votes: counts[i],
      pct: total > 0 ? Math.round((counts[i] / total) * 100) : 0,
    })),
  }
}

export async function getMyDistributions(
  supabase: SupabaseClient,
  matchIds: number[],
): Promise<Map<number, { pred_home_goals: number; pred_away_goals: number; votes: number }[]>> {
  const byMatch = new Map<number, { pred_home_goals: number; pred_away_goals: number; votes: number }[]>()
  if (matchIds.length === 0) return byMatch

  const { data, error } = await supabase.rpc('get_my_vote_distribution', { p_match_ids: matchIds })
  if (error) throw new LolDataError('vote distribution', error)

  for (const row of (data ?? []) as { match_id: number; pred_home_goals: number; pred_away_goals: number; votes: number }[]) {
    const list = byMatch.get(row.match_id) ?? []
    list.push(row)
    byMatch.set(row.match_id, list)
  }
  return byMatch
}

interface BreakdownRow {
  match_id: number
  rules_version: number
  correct_winner: boolean
  correct_score: boolean
  base_winner: number
  base_exact: number
  streak_length: number
  streak_bonus: number
  featured_bonus: number
  total: number
  explanation: {
    winner?: { share?: number | null; tier?: string | null }
    exact?: { share?: number | null; tier?: string | null }
    streak?: { steps?: StreakStep[] }
  } | null
}

/** Desglose de puntos de mis predicciones en series terminadas (lo calcula la BD). */
export async function getMyBreakdowns(
  supabase: SupabaseClient,
  matchIds: number[],
): Promise<Map<number, ScoreBreakdown>> {
  const byMatch = new Map<number, ScoreBreakdown>()
  if (matchIds.length === 0) return byMatch

  const { data, error } = await supabase.rpc('get_my_lol_breakdowns', { p_match_ids: matchIds })
  if (error) throw new LolDataError('score breakdowns', error)

  for (const r of (data ?? []) as BreakdownRow[]) {
    byMatch.set(r.match_id, {
      rulesVersion: r.rules_version,
      correctWinner: r.correct_winner,
      correctScore: r.correct_score,
      baseWinner: r.base_winner,
      baseExact: r.base_exact,
      streakLength: r.streak_length,
      streakBonus: r.streak_bonus,
      featuredBonus: r.featured_bonus,
      total: r.total,
      winnerShare: r.explanation?.winner?.share ?? null,
      exactShare: r.explanation?.exact?.share ?? null,
      winnerTier: r.explanation?.winner?.tier ?? null,
      exactTier: r.explanation?.exact?.tier ?? null,
      streakSteps: Array.isArray(r.explanation?.streak?.steps) ? r.explanation.streak.steps : null,
    })
  }
  return byMatch
}

export async function getEditionMatches(
  supabase: SupabaseClient,
  editionId: number,
  userId: string,
): Promise<LolMatchView[]> {
  const { data: phases, error: phasesError } = await supabase
    .from('phases')
    .select('id, name, rulesets(config)')
    .eq('edition_id', editionId)
  if (phasesError) throw new LolDataError('phases', phasesError)
  if (!phases?.length) return []

  const phaseById = new Map(
    phases.map(p => [p.id as number, {
      name: p.name as string,
      config: (p.rulesets as unknown as { config: unknown } | null)?.config ?? null,
    }]),
  )

  const { data, error } = await supabase
    .from('matches')
    .select(`
      id, match_date, prediction_locks_at, status, home_goals, away_goals, metadata, phase_id,
      home_team:teams!home_team_id (id, name, iso_code, logo_url, color),
      away_team:teams!away_team_id (id, name, iso_code, logo_url, color)
    `)
    .in('phase_id', [...phaseById.keys()])
    .order('match_date', { ascending: true })
  if (error) throw new LolDataError('matches', error)

  const matches = (data ?? []) as unknown as MatchRow[]
  const matchIds = matches.map(m => m.id)
  // Los % solo se piden de partidos con la votación cerrada (la BD tampoco
  // los devuelve antes del corte).
  const now = Date.now()
  const closedIds = matches
    .filter(m => m.status !== 'CANCELLED' && isPredictionLocked(m.status, m.prediction_locks_at, now))
    .map(m => m.id)

  const [predsRes, distributions, seedsRes] = await Promise.all([
    matchIds.length
      ? supabase
          .from('predictions')
          .select('match_id, pred_home_goals, pred_away_goals, points_earned')
          .eq('profile_id', userId)
          .in('match_id', matchIds)
      : Promise.resolve({ data: [], error: null }),
    getMyDistributions(supabase, closedIds),
    supabase.from('team_edition_stats').select('team_id, league, seed').eq('edition_id', editionId).not('seed', 'is', null),
  ])
  if (predsRes.error) throw new LolDataError('my predictions', predsRes.error)
  // Sin el seed la tarjeta sigue funcionando (p. ej. antes de aplicar la migración).
  if (seedsRes.error) console.error('[lol] team seeds:', seedsRes.error)
  const seeds = new Map(((seedsRes.data ?? []) as { team_id: number; league: string | null; seed: number | null }[])
    .map(r => [r.team_id, formatSeed(r.league, r.seed)]))

  // Swiss Stage: ronda y balance previo de cada serie (fases cuyo nombre lo dice).
  const swiss = new Map<number, SwissInfo>()
  for (const [phaseId, phase] of phaseById) {
    if (!isSwissPhase(phase.name)) continue
    const info = swissInfo(matches.filter(m => m.phase_id === phaseId).map(m => ({
      id: m.id,
      date: m.match_date,
      status: m.status,
      homeId: m.home_team.id,
      awayId: m.away_team.id,
      result: m.home_goals !== null && m.away_goals !== null ? { home: m.home_goals, away: m.away_goals } : null,
    })))
    for (const [id, v] of info) swiss.set(id, v)
  }

  const myPreds = new Map(
    (predsRes.data ?? []).map((p: { match_id: number; pred_home_goals: number; pred_away_goals: number; points_earned: number | null }) => [p.match_id, p]),
  )
  const breakdowns = await getMyBreakdowns(
    supabase,
    matches.filter(m => m.status === 'FINISHED' && myPreds.has(m.id)).map(m => m.id),
  )

  // Récord W-L por (fase, equipo) a partir de los partidos resueltos.
  const records = new Map<string, { wins: number; losses: number }>()
  const recordOf = (phaseId: number, teamId: number) => {
    const key = `${phaseId}:${teamId}`
    if (!records.has(key)) records.set(key, { wins: 0, losses: 0 })
    return records.get(key)!
  }
  for (const m of matches) {
    if (m.status !== 'FINISHED' || m.home_goals === null || m.away_goals === null) continue
    if (m.home_goals === m.away_goals) continue
    const homeWon = m.home_goals > m.away_goals
    recordOf(m.phase_id, m.home_team.id)[homeWon ? 'wins' : 'losses']++
    recordOf(m.phase_id, m.away_team.id)[homeWon ? 'losses' : 'wins']++
  }

  return matches.map(m => {
    const phase = phaseById.get(m.phase_id)
    const bestOf = resolveBestOf(m.metadata, phase?.config)
    const mine = myPreds.get(m.id)
    const distRows = distributions.get(m.id)

    return {
      id: m.id,
      date: m.match_date,
      locksAt: m.prediction_locks_at,
      status: m.status,
      phaseId: m.phase_id,
      phaseName: phase?.name ?? '',
      bestOf,
      home: {
        id: m.home_team.id,
        name: m.home_team.name,
        tag: m.home_team.iso_code,
        logoUrl: m.home_team.logo_url,
        color: m.home_team.color,
        record: { ...recordOf(m.phase_id, m.home_team.id) },
        seed: seeds.get(m.home_team.id) ?? null,
      },
      away: {
        id: m.away_team.id,
        name: m.away_team.name,
        tag: m.away_team.iso_code,
        logoUrl: m.away_team.logo_url,
        color: m.away_team.color,
        record: { ...recordOf(m.phase_id, m.away_team.id) },
        seed: seeds.get(m.away_team.id) ?? null,
      },
      result:
        m.status === 'FINISHED' && m.home_goals !== null && m.away_goals !== null
          ? { home: m.home_goals, away: m.away_goals }
          : null,
      featured: (m.metadata as { featured_match?: unknown } | null)?.featured_match === true,
      swiss: swiss.get(m.id) ?? null,
      myPrediction: mine
        ? {
            home: mine.pred_home_goals,
            away: mine.pred_away_goals,
            points: m.status === 'FINISHED' ? mine.points_earned ?? 0 : null,
            breakdown: breakdowns.get(m.id) ?? null,
          }
        : null,
      distribution: distRows ? buildDistribution(bestOf, distRows) : null,
    }
  })
}

// ── Sidebar: ranking ───────────────────────────────────────────────────────

export interface RankingSidebarData {
  title: string
  top5: RankingRow[]
  me: RankingRow | null
}

/**
 * Mismo criterio que el Mundial: se usa el pool que el usuario vio por
 * última vez (profiles.last_viewed_league_id) si pertenece a esta edición.
 * Si no, el primer pool de la edición al que se unió. Sin pools → global.
 */
export async function getRankingSidebar(
  supabase: SupabaseClient,
  editionId: number,
  userId: string,
): Promise<RankingSidebarData> {
  const [membershipsRes, profileRes] = await Promise.all([
    supabase.from('pool_members').select('pool_id, joined_at').eq('profile_id', userId),
    supabase.from('profiles').select('last_viewed_league_id').eq('id', userId).maybeSingle(),
  ])
  if (membershipsRes.error) throw new LolDataError('pool memberships', membershipsRes.error)

  const memberships = (membershipsRes.data ?? []) as { pool_id: number; joined_at: string | null }[]
  let pool: { id: number; name: string } | null = null

  if (memberships.length) {
    const { data: pools, error } = await supabase
      .from('pools')
      .select('id, name')
      .eq('edition_id', editionId)
      .in('id', memberships.map(m => m.pool_id))
    if (error) throw new LolDataError('pools', error)

    const editionPools = (pools ?? []) as { id: number; name: string }[]
    const lastViewed = profileRes.data?.last_viewed_league_id as number | null | undefined
    pool =
      editionPools.find(p => p.id === lastViewed) ??
      [...editionPools].sort((a, b) => {
        const ja = memberships.find(m => m.pool_id === a.id)?.joined_at ?? ''
        const jb = memberships.find(m => m.pool_id === b.id)?.joined_at ?? ''
        return ja.localeCompare(jb)
      })[0] ??
      null
  }

  // Mismo cálculo que la clasificación completa, para que puntos y orden coincidan.
  const rows: RankingRow[] = await getEditionStandings(supabase, editionId, pool?.id ?? null)

  const top5 = rows.slice(0, 5)
  const me = rows.find(r => r.profileId === userId) ?? null

  return {
    title: pool ? `Top 5 · ${pool.name}` : 'Top 5 global',
    top5,
    me: me && me.position > 5 ? me : null,
  }
}

// ── Clasificación completa ─────────────────────────────────────────────────

/** Pools de la edición a los que pertenece el usuario, por orden de ingreso. */
export async function getUserEditionPools(
  supabase: SupabaseClient,
  editionId: number,
  userId: string,
): Promise<PoolOption[]> {
  const { data, error } = await supabase
    .from('pool_members')
    .select('joined_at, pools!inner(id, name, edition_id)')
    .eq('profile_id', userId)
    .eq('pools.edition_id', editionId)
    .order('joined_at', { ascending: true })
  if (error) throw new LolDataError('user pools', error)

  return ((data ?? []) as unknown as { pools: { id: number; name: string } }[])
    .map(r => ({ id: r.pools.id, name: r.pools.name }))
}

/** Clasificación de una edición: global (poolId null) o de un pool de esa edición. */
export async function getEditionStandings(
  supabase: SupabaseClient,
  editionId: number,
  poolId: number | null,
): Promise<StandingRow[]> {
  const { data, error } = await supabase.rpc('get_lol_standings', {
    p_edition_id: editionId,
    p_pool_id: poolId,
  })
  if (error) throw new LolDataError('standings', error)

  return ((data ?? []) as {
    profile_id: string
    nickname: string
    avatar_url: string | null
    total_points: number
    correct_winners: number
    finished_series: number
    perfect_days: number
    negative_days: number
    current_streak: number
    best_streak: number | null
    rank_position: number
    movement: number | null
  }[]).map(r => ({
    profileId: r.profile_id,
    nickname: r.nickname,
    avatarUrl: r.avatar_url,
    points: Number(r.total_points),
    position: Number(r.rank_position),
    correctWinners: Number(r.correct_winners),
    finishedSeries: Number(r.finished_series),
    perfectDays: Number(r.perfect_days),
    negativeDays: Number(r.negative_days),
    currentStreak: Number(r.current_streak),
    bestStreak: Number(r.best_streak ?? 0),
    movement: r.movement === null ? null : Number(r.movement),
  }))
}

// ── Reglas ─────────────────────────────────────────────────────────────────

/**
 * Reglas vigentes de una edición: las del ruleset de la fase en curso (la
 * de la última serie ya empezada, o la de la primera serie si aún no ha
 * empezado ninguna). Solo para explicarlas; los puntos los pone la BD.
 */
export async function getEditionRules(
  supabase: SupabaseClient,
  editionId: number,
): Promise<LolRulesSummary | null> {
  const { data: phases, error } = await supabase
    .from('phases')
    .select('id, order, rulesets(config)')
    .eq('edition_id', editionId)
    .order('order', { ascending: true })
  if (error) throw new LolDataError('rules phases', error)
  if (!phases?.length) return null

  const phaseIds = phases.map(p => p.id as number)
  const now = new Date().toISOString()
  const [started, upcoming] = await Promise.all([
    supabase.from('matches').select('phase_id').in('phase_id', phaseIds).neq('status', 'CANCELLED')
      .lte('match_date', now).order('match_date', { ascending: false }).limit(1).maybeSingle(),
    supabase.from('matches').select('phase_id').in('phase_id', phaseIds).neq('status', 'CANCELLED')
      .gt('match_date', now).order('match_date', { ascending: true }).limit(1).maybeSingle(),
  ])
  if (started.error) throw new LolDataError('rules current match', started.error)
  if (upcoming.error) throw new LolDataError('rules next match', upcoming.error)

  const phaseId = (started.data?.phase_id ?? upcoming.data?.phase_id ?? phases[0].id) as number
  const phase = phases.find(p => p.id === phaseId) ?? phases[0]
  return parseLolRules((phase.rulesets as unknown as { config: unknown } | null)?.config ?? null)
}

// ── Perfil ─────────────────────────────────────────────────────────────────

/**
 * Resumen de LoL del usuario por edición, para /perfil: las ediciones en
 * curso y las que empiezan pronto siempre; las finalizadas solo si jugó. Todo sale
 * de la BD: puntos, posición, rachas y plenos de get_lol_standings (global y
 * de cada pool) y el desglose por serie de get_my_lol_breakdowns (vía
 * getEditionMatches). Aquí solo se cuentan filas, no se puntúa nada.
 */
export async function getProfileLolSummary(
  supabase: SupabaseClient,
  userId: string,
): Promise<ProfileLolEdition[]> {
  const editions = await getLolEditions(supabase)
  const today = todayMadrid()
  const now = Date.now()

  const all = await Promise.all(editions.map(async (edition): Promise<ProfileLolEdition> => {
    const [global, pools, matches] = await Promise.all([
      getEditionStandings(supabase, edition.id, null),
      getUserEditionPools(supabase, edition.id, userId),
      getEditionMatches(supabase, edition.id, userId),
    ])

    const poolStandings = await Promise.all(pools.map(async p => {
      const rows = await getEditionStandings(supabase, edition.id, p.id)
      const mine = rows.find(r => r.profileId === userId)
      return {
        id: p.id,
        name: p.name,
        position: mine?.position ?? null,
        points: mine?.points ?? 0,
        participants: rows.length,
      }
    }))

    const scored = matches
      .filter(m => m.status === 'FINISHED' && m.myPrediction)
      .sort((a, b) => b.date.localeCompare(a.date))
    const withExact = scored.filter(m => m.bestOf > 1 && m.myPrediction?.breakdown)

    return {
      edition,
      status: lolEditionStatus(edition, matches, today, now),
      standing: global.find(r => r.profileId === userId) ?? null,
      participants: global.length,
      pools: poolStandings,
      scored,
      exactHits: withExact.filter(m => m.myPrediction!.breakdown!.correctScore).length,
      exactPlayed: withExact.length,
    }
  }))

  const ORDER = { active: 0, upcoming: 1, finished: 2 } as const
  return all
    .filter(e => e.status !== 'finished' || e.standing !== null || e.scored.length > 0)
    .sort((a, b) => ORDER[a.status] - ORDER[b.status])
}
