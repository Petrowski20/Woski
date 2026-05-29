import { createClient } from '@/utils/supabase/server'
import LeagueSelector from '@/components/LeagueSelector'
import Link from 'next/link'

type BaseRow = { position: number; nickname: string; pts: number; profileId: string }
type StatsEntry = { me: number; ar: number; pi: number }
type RankingRow = BaseRow & { me: number; ar: number; ta: number; pi: number }

export default async function ClasificacionPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const { data: profile } = await supabase
    .from('profiles')
    .select('last_viewed_league_id')
    .eq('id', user?.id ?? '')
    .single()

  const activeLeagueId: number | null = profile?.last_viewed_league_id ?? null

  const { data: memberLeagues } = await supabase
    .from('profile_leagues')
    .select('private_leagues(id, name)')
    .eq('profile_id', user?.id ?? '')

  const leagues = (memberLeagues ?? [])
    .map((ml: any) => ml.private_leagues)
    .filter(Boolean) as { id: number; name: string }[]

  // Fetch ranking and prediction stats in parallel
  let leagueName = 'Global'

  const rankingPromise = activeLeagueId
    ? supabase
        .from('v_ranking_by_league')
        .select('position, nickname, league_points, profile_id, league_name')
        .eq('league_id', activeLeagueId)
        .order('position', { ascending: true })
        .limit(100)
    : supabase
        .from('v_ranking_global')
        .select('position, nickname, total_points, id')
        .order('position', { ascending: true })
        .limit(100)

  const [{ data: rankingData }, { data: preds }] = await Promise.all([
    rankingPromise,
    supabase
      .from('predictions')
      .select('profile_id, points_earned, matches!inner(status)'),
  ])

  const baseRanking: BaseRow[] = activeLeagueId
    ? (rankingData ?? []).map((r: any) => ({
        position: r.position,
        nickname: r.nickname,
        pts: r.league_points,
        profileId: r.profile_id,
      }))
    : (rankingData ?? []).map((r: any) => ({
        position: r.position,
        nickname: r.nickname,
        pts: r.total_points,
        profileId: r.id,
      }))

  if (activeLeagueId) {
    leagueName = (rankingData as any)?.[0]?.league_name ?? 'Liga privada'
  }

  // Build stats map from predictions
  const profileIds = new Set(baseRanking.map(r => r.profileId))
  const statsMap = new Map<string, StatsEntry>()

  for (const pred of preds ?? []) {
    const pid = pred.profile_id
    if (!profileIds.has(pid)) continue
    if (!statsMap.has(pid)) statsMap.set(pid, { me: 0, ar: 0, pi: 0 })
    const s = statsMap.get(pid)!
    const matchStatus = (pred.matches as any)?.status
    if (pred.points_earned === 3) s.me++
    else if (pred.points_earned === 1 || pred.points_earned === 2) s.ar++
    else if (pred.points_earned === 0 && matchStatus === 'FINISHED') s.pi++
  }

  const ranking: RankingRow[] = baseRanking.map(r => {
    const s = statsMap.get(r.profileId) ?? { me: 0, ar: 0, pi: 0 }
    return { ...r, me: s.me, ar: s.ar, ta: s.me + s.ar, pi: s.pi }
  })

  const medals: Record<number, string> = { 1: '🥇', 2: '🥈', 3: '🥉' }

  return (
    <div className="w-full max-w-2xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Clasificación</h1>
        <p className="text-sm text-gray-500 mt-1">{leagueName}</p>
      </div>

      <LeagueSelector leagues={leagues} activeLeagueId={activeLeagueId} />

      {/* Legend */}
      <div className="bg-gray-50 dark:bg-slate-800/50 p-4 rounded-xl mb-4 border border-gray-100 dark:border-slate-800">
        <div className="flex flex-wrap gap-x-5 gap-y-2 text-xs text-gray-500 dark:text-gray-400">
          <span>🎯 <strong className="text-gray-700 dark:text-gray-300">ME</strong> Marcador exacto</span>
          <span>✅ <strong className="text-gray-700 dark:text-gray-300">AR</strong> Acierto de resultado</span>
          <span>📊 <strong className="text-gray-700 dark:text-gray-300">TA</strong> Total de aciertos</span>
          <span>❌ <strong className="text-gray-700 dark:text-gray-300">PI</strong> Pronósticos incorrectos</span>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        {ranking.length === 0 ? (
          <p className="text-center text-gray-500 text-sm py-12">
            Aún no hay datos para esta clasificación.
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100 text-xs uppercase tracking-wider text-gray-500">
                <th className="px-4 py-3 text-center w-12">Pos.</th>
                <th className="px-4 py-3 text-left">Usuario</th>
                <th className="px-3 py-3 text-center">ME</th>
                <th className="px-3 py-3 text-center">AR</th>
                <th className="px-3 py-3 text-center hidden sm:table-cell">TA</th>
                <th className="px-3 py-3 text-center hidden sm:table-cell">PI</th>
                <th className="px-4 py-3 text-right pr-6">Total</th>
              </tr>
            </thead>
            <tbody>
              {ranking.map((row) => {
                const isMe = row.profileId === user?.id
                return (
                  <tr
                    key={row.profileId}
                    className={`border-b border-gray-50 last:border-0 transition-colors ${
                      isMe ? 'bg-blue-50' : 'hover:bg-gray-50'
                    }`}
                  >
                    <td className="px-4 py-3 text-center font-bold text-gray-500 w-12">
                      {medals[row.position] ?? row.position}
                    </td>
                    <td className="px-4 py-3 font-medium text-gray-800">
                      <Link
                        href={`/jugador/${row.profileId}`}
                        className="hover:text-blue-600 hover:underline transition-colors"
                      >
                        {row.nickname}
                      </Link>
                      {isMe && (
                        <span className="ml-2 text-xs text-blue-500 font-normal">(Tú)</span>
                      )}
                    </td>
                    <td className="px-3 py-3 text-center text-gray-600">{row.me}</td>
                    <td className="px-3 py-3 text-center text-gray-600">{row.ar}</td>
                    <td className="px-3 py-3 text-center text-gray-600 hidden sm:table-cell">{row.ta}</td>
                    <td className="px-3 py-3 text-center text-gray-600 hidden sm:table-cell">{row.pi}</td>
                    <td className="px-4 py-3 text-right pr-6 font-bold text-blue-600">
                      {row.pts}
                      <span className="ml-1 text-xs text-gray-400 font-normal">pts</span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
