import { createClient } from '@/utils/supabase/server'
import { getServerLang, tServer } from '@/utils/i18n-server'
import AdminLolTeams from '@/components/lol/AdminLolTeams'
import type { AdminRosterEntry, AdminTeamRow, SeedEditionOption, TeamAuditRow } from '@/components/lol/adminTeamsTypes'
import { getChampionCatalog } from '@/utils/lol/champions'
import { roleOrder } from '@/utils/lol/roster'
import { getLolEditions, lolToday, LOL_SPORT_SLUG } from '../../../lol/data'

// LoL · Equipos: alta, nombre, siglas, color y logo de cada equipo. Escribe con
// teamActions.ts (admin_create_lol_team(s) / admin_update_lol_team / admin_set_lol_team_logo + bucket
// team-logos); aquí solo se lee: equipos, cuántas series juegan y el
// registro de cambios de lol_admin_audit (filas con team_id).

interface RawTeam { id: number; name: string; iso_code: string; slug: string | null; color: string | null; logo_url: string | null }
interface RawAudit {
  id: number
  created_at: string
  actor_id: string | null
  actor_kind: 'admin' | 'sql'
  action: TeamAuditRow['action']
  team_id: number
  edition_id: number | null
  before: Record<string, string | number | null> | null
  after: Record<string, string | number | null> | null
}

const FIELDS: { field: TeamAuditRow['changes'][number]['field']; key: string }[] = [
  { field: 'name', key: 'name' },
  { field: 'tag', key: 'tag' },
  { field: 'color', key: 'color' },
  { field: 'logo', key: 'logo_url' },
  { field: 'region', key: 'region' },
  { field: 'country', key: 'country' },
  { field: 'league', key: 'league' },
  { field: 'seed', key: 'seed' },
]

export default async function LolEquiposTab() {
  const supabase = await createClient()
  const lang = await getServerLang()
  const t = (key: string) => tServer(lang, `adminTeams.${key}`)

  const teamsRes = await supabase
    .from('teams')
    .select('id, name, iso_code, slug, color, logo_url, sports!inner(slug)')
    .eq('sports.slug', LOL_SPORT_SLUG)
    .order('name')
  if (teamsRes.error) {
    console.error('[admin equipos] teams', teamsRes.error)
    return (
      <p role="alert" className="rounded-lg bg-danger/10 px-4 py-3 text-sm text-text-primary">
        {t('errors.SERVER')} ¿Está aplicada la migración 20261019100001_team_logos?
      </p>
    )
  }
  const raw = (teamsRes.data ?? []) as unknown as RawTeam[]
  const ids = raw.map(r => r.id)

  const editions = await getLolEditions(supabase)
  const today = lolToday()
  const seedEditions: SeedEditionOption[] = editions.map(e => ({
    id: e.id,
    label: e.label,
    active: !!e.startDate && e.startDate <= today && (!e.endDate || e.endDate >= today),
  }))

  const [homeRes, awayRes, auditRes, seedsRes, rosterRes, catalog] = await Promise.all([
    ids.length ? supabase.from('matches').select('home_team_id').in('home_team_id', ids) : Promise.resolve({ data: [], error: null }),
    ids.length ? supabase.from('matches').select('away_team_id').in('away_team_id', ids) : Promise.resolve({ data: [], error: null }),
    supabase
      .from('lol_admin_audit')
      .select('id, created_at, actor_id, actor_kind, action, team_id, edition_id, before, after')
      .not('team_id', 'is', null)
      .order('id', { ascending: false })
      .limit(50),
    editions.length
      ? supabase.from('team_edition_stats').select('edition_id, team_id, league, seed')
          .in('edition_id', editions.map(e => e.id)).not('seed', 'is', null)
      : Promise.resolve({ data: [], error: null }),
    editions.length
      ? supabase.from('lol_roster').select('id, edition_id, team_id, role, picks, lol_players(nickname, country)')
          .in('edition_id', editions.map(e => e.id))
      : Promise.resolve({ data: [], error: null }),
    getChampionCatalog(),
  ])
  if (rosterRes.error) console.error('[admin equipos] roster', rosterRes.error)
  const rosterByTeam = new Map<number, AdminRosterEntry[]>()
  for (const r of (rosterRes.data ?? []) as unknown as {
    id: number; edition_id: number; team_id: number; role: string; picks: string[] | null
    lol_players: { nickname: string; country: string | null } | null
  }[]) {
    const list = rosterByTeam.get(r.team_id) ?? []
    list.push({ rosterId: r.id, editionId: r.edition_id, role: r.role, picks: r.picks ?? [],
                nickname: r.lol_players?.nickname ?? '?', country: r.lol_players?.country ?? null })
    rosterByTeam.set(r.team_id, list)
  }
  for (const list of rosterByTeam.values()) list.sort((a, b) => roleOrder(a.role) - roleOrder(b.role) || a.rosterId - b.rosterId)
  if (seedsRes.error) console.error('[admin equipos] seeds', seedsRes.error)
  const seedsByTeam = new Map<number, AdminTeamRow['seeds']>()
  for (const r of (seedsRes.data ?? []) as { edition_id: number; team_id: number; league: string; seed: number }[]) {
    const list = seedsByTeam.get(r.team_id) ?? []
    list.push({ editionId: r.edition_id, league: r.league, seed: r.seed })
    seedsByTeam.set(r.team_id, list)
  }
  if (homeRes.error || awayRes.error) console.error('[admin equipos] matches', homeRes.error ?? awayRes.error)
  if (auditRes.error) console.error('[admin equipos] audit', auditRes.error)

  const played = new Map<number, number>()
  for (const m of (homeRes.data ?? []) as { home_team_id: number }[]) played.set(m.home_team_id, (played.get(m.home_team_id) ?? 0) + 1)
  for (const m of (awayRes.data ?? []) as { away_team_id: number }[]) played.set(m.away_team_id, (played.get(m.away_team_id) ?? 0) + 1)

  const teams: AdminTeamRow[] = raw.map(r => ({
    id: r.id,
    name: r.name,
    tag: r.iso_code,
    slug: r.slug,
    color: r.color,
    logoUrl: r.logo_url,
    matches: played.get(r.id) ?? 0,
    seeds: seedsByTeam.get(r.id) ?? [],
    roster: rosterByTeam.get(r.id) ?? [],
  }))

  const audits = (auditRes.data ?? []) as RawAudit[]
  const actorIds = [...new Set(audits.map(a => a.actor_id).filter((id): id is string => id !== null))]
  const actorsRes = actorIds.length
    ? await supabase.from('profiles').select('id, nickname').in('id', actorIds)
    : { data: [], error: null }
  const nick = new Map(((actorsRes.data ?? []) as { id: string; nickname: string }[]).map(p => [p.id, p.nickname]))
  const teamName = new Map(teams.map(tm => [tm.id, tm.name]))
  const editionName = new Map(editions.map(e => [e.id, e.label]))
  const str = (v: string | number | null | undefined) => (v === null || v === undefined ? null : String(v))

  const audit: TeamAuditRow[] = audits.map(a => ({
    id: a.id,
    at: a.created_at,
    team: teamName.get(a.team_id) ?? str(a.after?.name) ?? `#${a.team_id}`,
    actor: a.actor_kind === 'sql' ? t('audit.sql') : (a.actor_id && nick.get(a.actor_id)) || 'admin',
    action: a.action,
    changes: FIELDS
      .map(({ field, key }) => ({ field, before: str(a.before?.[key]), after: str(a.after?.[key]) }))
      .filter(c => c.before !== c.after),
    edition: a.edition_id ? editionName.get(a.edition_id) ?? `#${a.edition_id}` : null,
  }))

  return <AdminLolTeams teams={teams} audit={audit} editions={seedEditions} champions={catalog.champions} />
}
