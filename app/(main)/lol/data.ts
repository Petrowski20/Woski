import type { SupabaseClient } from '@supabase/supabase-js'
import { resolveBestOf, seriesOutcomes, type BestOf, type MatchStatus } from '@/utils/lol/series'
import type { LolEditionOption, LolMatchView, RankingRow, VoteShare } from '@/utils/lol/types'

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
    }
  })
}

// ── Partidos de una edición ────────────────────────────────────────────────

interface TeamRow { id: number; name: string; iso_code: string; logo_url: string | null }
interface MatchRow {
  id: number
  match_date: string
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
      id, match_date, status, home_goals, away_goals, metadata, phase_id,
      home_team:teams!home_team_id (id, name, iso_code, logo_url),
      away_team:teams!away_team_id (id, name, iso_code, logo_url)
    `)
    .in('phase_id', [...phaseById.keys()])
    .order('match_date', { ascending: true })
  if (error) throw new LolDataError('matches', error)

  const matches = (data ?? []) as unknown as MatchRow[]
  const matchIds = matches.map(m => m.id)

  const [predsRes, distributions] = await Promise.all([
    matchIds.length
      ? supabase
          .from('predictions')
          .select('match_id, pred_home_goals, pred_away_goals, points_earned')
          .eq('profile_id', userId)
          .in('match_id', matchIds)
      : Promise.resolve({ data: [], error: null }),
    getMyDistributions(supabase, matchIds),
  ])
  if (predsRes.error) throw new LolDataError('my predictions', predsRes.error)

  const myPreds = new Map(
    (predsRes.data ?? []).map((p: { match_id: number; pred_home_goals: number; pred_away_goals: number; points_earned: number | null }) => [p.match_id, p]),
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
      status: m.status,
      phaseName: phase?.name ?? '',
      bestOf,
      home: {
        id: m.home_team.id,
        name: m.home_team.name,
        tag: m.home_team.iso_code,
        logoUrl: m.home_team.logo_url,
        record: { ...recordOf(m.phase_id, m.home_team.id) },
      },
      away: {
        id: m.away_team.id,
        name: m.away_team.name,
        tag: m.away_team.iso_code,
        logoUrl: m.away_team.logo_url,
        record: { ...recordOf(m.phase_id, m.away_team.id) },
      },
      result:
        m.status === 'FINISHED' && m.home_goals !== null && m.away_goals !== null
          ? { home: m.home_goals, away: m.away_goals }
          : null,
      myPrediction: mine
        ? {
            home: mine.pred_home_goals,
            away: mine.pred_away_goals,
            points: m.status === 'FINISHED' ? mine.points_earned ?? 0 : null,
          }
        : null,
      distribution: mine && distRows ? buildDistribution(bestOf, distRows) : null,
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

  const { data, error } = await supabase.rpc('get_edition_ranking', {
    p_edition_id: editionId,
    p_pool_id: pool?.id ?? null,
  })
  if (error) throw new LolDataError('ranking', error)

  const rows: RankingRow[] = ((data ?? []) as {
    profile_id: string; nickname: string; avatar_url: string | null; total_points: number; rank_position: number
  }[]).map(r => ({
    profileId: r.profile_id,
    nickname: r.nickname,
    avatarUrl: r.avatar_url,
    points: Number(r.total_points),
    position: Number(r.rank_position),
  }))

  const top5 = rows.slice(0, 5)
  const me = rows.find(r => r.profileId === userId) ?? null

  return {
    title: pool ? `Top 5 · ${pool.name}` : 'Top 5 global',
    top5,
    me: me && me.position > 5 ? me : null,
  }
}
