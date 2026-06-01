import { createClient } from '@/utils/supabase/server'
import { getFlagUrl } from '@/utils/getFlagUrl'

interface Team {
  name: string
  iso_code: string
  flag_emoji: string | null
}

interface Match {
  id: number
  group_letter: string
  home_team_id: number
  away_team_id: number
  home_team: Team
  away_team: Team
}

interface Prediction {
  match_id: number
  pred_home_goals: number
  pred_away_goals: number
}

interface TeamStanding {
  id: number
  name: string
  flag: string | null
  isoCode: string
  pts: number
  pj: number
  pg: number
  pe: number
  pp: number
  gf: number
  gc: number
  dg: number
}

function calcStandings(
  matches: Match[],
  predMap: Map<number, Prediction>,
): TeamStanding[] {
  const standings = new Map<number, TeamStanding>()

  for (const m of matches) {
    if (!standings.has(m.home_team_id)) {
      standings.set(m.home_team_id, {
        id: m.home_team_id, name: m.home_team.name,
        flag: m.home_team.flag_emoji, isoCode: m.home_team.iso_code,
        pts: 0, pj: 0, pg: 0, pe: 0, pp: 0, gf: 0, gc: 0, dg: 0,
      })
    }
    if (!standings.has(m.away_team_id)) {
      standings.set(m.away_team_id, {
        id: m.away_team_id, name: m.away_team.name,
        flag: m.away_team.flag_emoji, isoCode: m.away_team.iso_code,
        pts: 0, pj: 0, pg: 0, pe: 0, pp: 0, gf: 0, gc: 0, dg: 0,
      })
    }
  }

  for (const m of matches) {
    const pred = predMap.get(m.id)
    const hg = pred?.pred_home_goals ?? 0
    const ag = pred?.pred_away_goals ?? 0

    const home = standings.get(m.home_team_id)!
    const away = standings.get(m.away_team_id)!

    home.pj++; away.pj++
    home.gf += hg; home.gc += ag
    away.gf += ag; away.gc += hg

    if (hg > ag) {
      home.pg++; home.pts += 3; away.pp++
    } else if (hg < ag) {
      away.pg++; away.pts += 3; home.pp++
    } else {
      home.pe++; home.pts += 1; away.pe++; away.pts += 1
    }
  }

  return Array.from(standings.values())
    .map(t => ({ ...t, dg: t.gf - t.gc }))
    .sort((a, b) => b.pts - a.pts || b.dg - a.dg || b.gf - a.gf)
}

export default async function SupuestosPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const [matchesRes, predsRes] = await Promise.all([
    supabase
      .from('matches')
      .select(`
        id, group_letter, home_team_id, away_team_id,
        home_team:teams!home_team_id (name, iso_code, flag_emoji),
        away_team:teams!away_team_id (name, iso_code, flag_emoji)
      `)
      .eq('stage', 'GROUP')
      .order('group_letter', { ascending: true }),
    supabase
      .from('predictions')
      .select('match_id, pred_home_goals, pred_away_goals')
      .eq('profile_id', user?.id ?? ''),
  ])

  const matches = (matchesRes.data ?? []) as unknown as Match[]
  const preds = (predsRes.data ?? []) as Prediction[]

  const predMap = new Map<number, Prediction>(preds.map(p => [p.match_id, p]))

  const groupedMatches = new Map<string, Match[]>()
  for (const m of matches) {
    const g = m.group_letter ?? 'X'
    if (!groupedMatches.has(g)) groupedMatches.set(g, [])
    groupedMatches.get(g)!.push(m)
  }

  const groups = Array.from(groupedMatches.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([letter, groupMatches]) => ({
      letter,
      standings: calcStandings(groupMatches, predMap),
    }))

  // Best third-place teams: extract 3rd from each group, sort, take top 8
  const allThirds = groups
    .map(g => g.standings[2])
    .filter((t): t is TeamStanding => t !== undefined)
    .sort((a, b) => b.pts - a.pts || b.dg - a.dg || b.gf - a.gf)

  const bestThirdsIds = new Set(allThirds.slice(0, 8).map(t => t.id))

  const groupMatchIds = new Set(matches.map(m => m.id))
  const predCount = preds.filter(p => groupMatchIds.has(p.match_id)).length

  return (
    <div className="w-full max-w-6xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Mi Mundial Virtual</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
          Así quedarían los grupos según tus predicciones
        </p>
      </div>

      <div className="bg-[#FFD6D1]/30 dark:bg-slate-800/50 p-4 rounded-xl mb-6 border border-[#FFD6D1] dark:border-slate-800">
        <div className="flex flex-wrap gap-x-5 gap-y-2 text-xs text-gray-500 dark:text-gray-400">
          <span>
            Basado en{' '}
            <strong className="text-gray-700 dark:text-gray-300">{predCount}</strong>{' '}
            de{' '}
            <strong className="text-gray-700 dark:text-gray-300">{matches.length}</strong>{' '}
            predicciones de fase de grupos
          </span>
          <span>•  Los partidos sin predicción se cuentan como <strong className="text-gray-700 dark:text-gray-300">0 – 0</strong></span>
          <span>•  <span className="inline-block w-2.5 h-2.5 rounded-sm bg-green-200 dark:bg-green-800 mr-1 align-middle" />Clasificación directa (1º y 2º)</span>
          <span>•  <span className="inline-block w-2.5 h-2.5 rounded-sm bg-lime-200 dark:bg-lime-800/60 mr-1 align-middle" />Mejor tercero (8 de 12)</span>
        </div>
      </div>

      {groups.length === 0 ? (
        <p className="text-center text-gray-500 text-sm py-12">No hay partidos de fase de grupos disponibles.</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-5">
          {groups.map(({ letter, standings }) => (
            <div
              key={letter}
              className="bg-white dark:bg-slate-900 rounded-xl shadow-sm border border-[#FFD6D1] dark:border-slate-800 overflow-hidden"
            >
              <div className="bg-[#FFD6D1]/30 dark:bg-slate-800/50 px-4 py-3 border-b border-[#FFD6D1] dark:border-slate-800">
                <h2 className="text-sm font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wider">
                  Grupo {letter}
                </h2>
              </div>

              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-gray-100 dark:border-slate-800/80 text-gray-400 dark:text-gray-500 uppercase tracking-wider">
                    <th className="px-3 py-2 text-left">Equipo</th>
                    <th className="px-1.5 py-2 text-center w-7">PJ</th>
                    <th className="px-1.5 py-2 text-center w-7">PG</th>
                    <th className="px-1.5 py-2 text-center w-7">PE</th>
                    <th className="px-1.5 py-2 text-center w-7">PP</th>
                    <th className="px-1.5 py-2 text-center w-7">GF</th>
                    <th className="px-1.5 py-2 text-center w-7">GC</th>
                    <th className="px-1.5 py-2 text-center w-9">DG</th>
                    <th className="px-2 py-2 text-center w-10 font-bold text-gray-600 dark:text-gray-300">Pts</th>
                  </tr>
                </thead>
                <tbody>
                  {standings.map((team, idx) => {
                    const isBestThird = idx === 2 && bestThirdsIds.has(team.id)
                    const rowClass = idx < 2
                      ? 'bg-green-50/60 dark:bg-green-900/10 hover:bg-green-50 dark:hover:bg-green-900/20'
                      : isBestThird
                        ? 'bg-lime-50/70 dark:bg-lime-900/15 hover:bg-lime-50 dark:hover:bg-lime-900/25'
                        : 'hover:bg-gray-50 dark:hover:bg-slate-800/30'
                    return (
                    <tr
                      key={team.id}
                      className={`border-b border-gray-50 dark:border-slate-800/50 last:border-0 transition-colors ${rowClass}`}
                    >
                      <td className="px-3 py-2.5">
                        <div className="flex items-center gap-1.5">
                          <img
                            src={getFlagUrl(team.flag ?? '')}
                            alt={team.name}
                            title={team.name}
                            className="w-7 h-7 rounded-full object-cover shrink-0 border border-gray-200/60 dark:border-slate-700"
                          />
                          {isBestThird && (
                            <span className="shrink-0 text-[10px] font-semibold text-lime-700 dark:text-lime-400 bg-lime-100 dark:bg-lime-900/40 px-1 py-0.5 rounded leading-none">
                              Mejor 3º
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-1.5 py-2.5 w-7 shrink-0 text-center text-gray-500 dark:text-gray-400">{team.pj}</td>
                      <td className="px-1.5 py-2.5 w-7 shrink-0 text-center text-gray-500 dark:text-gray-400">{team.pg}</td>
                      <td className="px-1.5 py-2.5 w-7 shrink-0 text-center text-gray-500 dark:text-gray-400">{team.pe}</td>
                      <td className="px-1.5 py-2.5 w-7 shrink-0 text-center text-gray-500 dark:text-gray-400">{team.pp}</td>
                      <td className="px-1.5 py-2.5 w-7 shrink-0 text-center text-gray-500 dark:text-gray-400">{team.gf}</td>
                      <td className="px-1.5 py-2.5 w-7 shrink-0 text-center text-gray-500 dark:text-gray-400">{team.gc}</td>
                      <td className="px-1.5 py-2.5 w-9 shrink-0 text-center text-gray-500 dark:text-gray-400">
                        {team.dg > 0 ? `+${team.dg}` : team.dg}
                      </td>
                      <td className="px-2 py-2.5 w-10 shrink-0 text-center font-bold text-blue-600 dark:text-blue-400">
                        {team.pts}
                      </td>
                    </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
