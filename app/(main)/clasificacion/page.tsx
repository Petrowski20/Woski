import { createClient } from '@/utils/supabase/server'
import LeagueSelector from '@/components/LeagueSelector'
import Link from 'next/link'
import Image from 'next/image'
import { getServerLang, tServer } from '@/utils/i18n-server'

type BaseRow = { position: number; nickname: string; pts: number; profileId: string; avatarUrl: string | null }
type RankingRow = BaseRow & { me: number; ar: number; ta: number; pi: number; movement: number | null }

function MovementBadge({ m }: { m: number | null }) {
  if (m === null) return null
  if (m > 0) return <span className="text-[9px] font-bold text-emerald-500 leading-none">▲{m}</span>
  if (m < 0) return <span className="text-[9px] font-bold text-red-400 leading-none">▼{Math.abs(m)}</span>
  return <span className="text-[9px] text-gray-300 dark:text-slate-600 leading-none">—</span>
}

function Avatar({ url, initial }: { url: string | null; initial: string }) {
  return (
    <div className="relative w-7 h-7 rounded-full overflow-hidden bg-blue-100 dark:bg-blue-900 border border-blue-200 dark:border-blue-700 flex items-center justify-center shrink-0">
      {url ? (
        <Image src={url} alt={initial} fill sizes="28px" className="object-cover" />
      ) : (
        <span className="text-[10px] font-bold text-blue-600 dark:text-blue-400">{initial}</span>
      )}
    </div>
  )
}

export default async function ClasificacionPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const lang = await getServerLang()
  const t = (key: string) => tServer(lang, key)

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

  let leagueName = 'Global'

  const rankingPromise = activeLeagueId
    ? supabase
        .from('v_ranking_by_league')
        .select('profile_id, nickname, total_points, avatar_url, league_name')
        .eq('league_id', activeLeagueId)
        .order('total_points', { ascending: false })
        .limit(100)
    : supabase
        .from('v_ranking_global')
        .select('profile_id, nickname, total_points, avatar_url')
        .order('total_points', { ascending: false })
        .limit(100)

  const [
    { data: rankingData, error: rankingError },
    { data: statsData },
    { data: movementData },
  ] = await Promise.all([
    rankingPromise,
    supabase.rpc('get_player_stats'),
    supabase.rpc('get_ranking_movement', { p_league_id: activeLeagueId ?? null }),
  ])

  const movementMap = new Map<string, number | null>(
    (movementData ?? []).map((r: any) => [r.profile_id, r.movement ?? null])
  )

  if (rankingError) console.error('[clasificacion] ranking error:', rankingError.message, rankingError.code)

  const baseRanking: BaseRow[] = (rankingData ?? []).map((r: any, i: number) => ({
    position: i + 1,
    nickname: r.nickname,
    pts: r.total_points,
    profileId: r.profile_id,
    avatarUrl: r.avatar_url ?? null,
  }))

  if (activeLeagueId) {
    leagueName = (rankingData as any)?.[0]?.league_name ?? 'Liga privada'
  }

  const statsMap = new Map<string, { me: number; ar: number; eq: number; pi: number }>(
    (statsData ?? []).map((r: any) => [
      r.profile_id,
      {
        me: Number(r.exact_scores ?? 0),
        ar: Number(r.diff_scores  ?? 0),
        eq: Number(r.sign_scores  ?? 0),
        pi: Number(r.misses       ?? 0),
      },
    ])
  )

  const ranking: RankingRow[] = baseRanking.map(r => {
    const s = statsMap.get(r.profileId) ?? { me: 0, ar: 0, eq: 0, pi: 0 }
    return { ...r, me: s.me, ar: s.ar, ta: s.me + s.ar + s.eq, pi: s.pi, movement: movementMap.get(r.profileId) ?? null }
  })

  const medals: Record<number, string> = { 1: '🥇', 2: '🥈', 3: '🥉' }

  return (
    <div className="w-full max-w-2xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">{t('clasificacion.title')}</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{leagueName}</p>
      </div>

      <LeagueSelector leagues={leagues} activeLeagueId={activeLeagueId} />

      {/* Leyenda */}
      <div className="bg-[#FFD6D1]/30 dark:bg-slate-800/50 p-4 rounded-xl mb-4 border border-[#FFD6D1] dark:border-slate-800">
        <div className="flex flex-wrap gap-x-5 gap-y-2 text-xs text-gray-500 dark:text-gray-400">
          <span>🎯 <strong className="text-gray-700 dark:text-gray-300">{t('clasificacion.legend.me_abbr')}</strong> {t('clasificacion.legend.me')}</span>
          <span>✅ <strong className="text-gray-700 dark:text-gray-300">{t('clasificacion.legend.ar_abbr')}</strong> {t('clasificacion.legend.ar')}</span>
          <span>📊 <strong className="text-gray-700 dark:text-gray-300">{t('clasificacion.legend.ta_abbr')}</strong> {t('clasificacion.legend.ta')}</span>
          <span>❌ <strong className="text-gray-700 dark:text-gray-300">{t('clasificacion.legend.pi_abbr')}</strong> {t('clasificacion.legend.pi')}</span>
        </div>
      </div>

      <div className="bg-white dark:bg-slate-900 rounded-xl shadow-sm border border-[#FFD6D1] dark:border-slate-800 overflow-hidden">
        {ranking.length === 0 ? (
          <p className="text-center text-gray-500 text-sm py-12">
            {t('clasificacion.sinDatos')}
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-[#FFD6D1]/30 dark:bg-slate-800/50 border-b border-[#FFD6D1] dark:border-slate-800 text-xs uppercase tracking-wider text-gray-500 dark:text-gray-400">
                <th className="px-4 py-3 text-center w-12">{t('clasificacion.cols.pos')}</th>
                <th className="px-4 py-3 text-left">{t('clasificacion.cols.usuario')}</th>
                <th className="px-3 py-3 text-center">{t('clasificacion.legend.me_abbr')}</th>
                <th className="px-3 py-3 text-center">{t('clasificacion.legend.ar_abbr')}</th>
                <th className="px-3 py-3 text-center hidden sm:table-cell">{t('clasificacion.legend.ta_abbr')}</th>
                <th className="px-3 py-3 text-center hidden sm:table-cell">{t('clasificacion.legend.pi_abbr')}</th>
                <th className="px-4 py-3 text-right pr-6">{t('clasificacion.cols.total')}</th>
              </tr>
            </thead>
            <tbody>
              {ranking.map((row) => {
                const isMe = row.profileId === user?.id
                return (
                  <tr
                    key={row.profileId}
                    className={`border-b border-gray-50 dark:border-slate-800/50 last:border-0 transition-colors ${
                      isMe ? 'bg-blue-50 dark:bg-blue-900/20' : 'hover:bg-gray-50 dark:hover:bg-slate-800/50'
                    }`}
                  >
                    <td className="px-4 py-3 text-center w-12">
                      <div className="flex flex-col items-center gap-0.5">
                        <span className="font-bold text-gray-500 dark:text-gray-400 leading-none">
                          {medals[row.position] ?? row.position}
                        </span>
                        <MovementBadge m={row.movement} />
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <Link
                        href={`/jugador/${row.profileId}`}
                        className="flex items-center gap-2 hover:text-blue-600 dark:hover:text-blue-400 transition-colors group"
                      >
                        <Avatar url={row.avatarUrl} initial={row.nickname.charAt(0).toUpperCase()} />
                        <span className="font-medium text-gray-800 dark:text-gray-100 group-hover:text-blue-600 dark:group-hover:text-blue-400">
                          {row.nickname}
                        </span>
                        {isMe && (
                          <span className="text-xs text-blue-400 dark:text-blue-500 font-normal">{t('clasificacion.yo')}</span>
                        )}
                      </Link>
                    </td>
                    <td className="px-3 py-3 text-center text-gray-600 dark:text-gray-400">{row.me}</td>
                    <td className="px-3 py-3 text-center text-gray-600 dark:text-gray-400">{row.ar}</td>
                    <td className="px-3 py-3 text-center text-gray-600 dark:text-gray-400 hidden sm:table-cell">{row.ta}</td>
                    <td className="px-3 py-3 text-center text-gray-600 dark:text-gray-400 hidden sm:table-cell">{row.pi}</td>
                    <td className="px-4 py-3 text-right pr-6 font-bold text-blue-600 dark:text-blue-400">
                      {row.pts}
                      <span className="ml-1 text-xs text-gray-400 dark:text-gray-500 font-normal">pts</span>
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
