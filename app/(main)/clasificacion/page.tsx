import { createClient } from '@/utils/supabase/server'
import LeagueSelector from '@/components/LeagueSelector'
import Link from 'next/link'

export default async function ClasificacionPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  // 1. Perfil del usuario (incluye su preferencia de liga)
  const { data: profile } = await supabase
    .from('profiles')
    .select('last_viewed_league_id')
    .eq('id', user?.id ?? '')
    .single()

  const activeLeagueId: number | null = profile?.last_viewed_league_id ?? null

  // 2. Ligas a las que pertenece el usuario
  const { data: memberLeagues } = await supabase
    .from('profile_leagues')
    .select('private_leagues(id, name)')
    .eq('profile_id', user?.id ?? '')

  const leagues = (memberLeagues ?? [])
    .map((ml: any) => ml.private_leagues)
    .filter(Boolean) as { id: number; name: string }[]

  // 3. Ranking según preferencia
  type RankingRow = { position: number; nickname: string; pts: number; profileId: string }

  let ranking: RankingRow[] = []
  let leagueName = 'Global'

  if (activeLeagueId) {
    const { data } = await supabase
      .from('v_ranking_by_league')
      .select('position, nickname, league_points, profile_id, league_name')
      .eq('league_id', activeLeagueId)
      .order('position', { ascending: true })
      .limit(100)

    ranking = (data ?? []).map((r: any) => ({
      position: r.position,
      nickname: r.nickname,
      pts: r.league_points,
      profileId: r.profile_id,
    }))
    leagueName = data?.[0]?.league_name ?? 'Liga privada'
  } else {
    const { data } = await supabase
      .from('v_ranking_global')
      .select('position, nickname, total_points, id')
      .order('position', { ascending: true })
      .limit(100)

    ranking = (data ?? []).map((r: any) => ({
      position: r.position,
      nickname: r.nickname,
      pts: r.total_points,
      profileId: r.id,
    }))
  }

  const medals: Record<number, string> = { 1: '🥇', 2: '🥈', 3: '🥉' }

  return (
    <div className="w-full max-w-2xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Clasificación</h1>
        <p className="text-sm text-gray-500 mt-1">{leagueName}</p>
      </div>

      <LeagueSelector leagues={leagues} activeLeagueId={activeLeagueId} />

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
                <th className="px-4 py-3 text-right pr-6">Puntos</th>
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
                    <td className="px-4 py-3 text-right pr-6 font-bold text-gray-900">
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
