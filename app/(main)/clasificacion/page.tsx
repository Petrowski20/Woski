import { createClient } from '@/utils/supabase/server'
import LeagueSelector from '@/components/LeagueSelector'
import Link from 'next/link'
import Image from 'next/image'
import { getServerLang, tServer } from '@/utils/i18n-server'

type BaseRow = { position: number; nickname: string; pts: number; profileId: string; avatarUrl: string | null }
type StatsEntry = { me: number; ar: number; eq: number; pi: number }
type RankingRow = BaseRow & { me: number; ar: number; ta: number; pi: number }

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
        .select('profile_id, nickname, total_points, avatar_url, league_name, created_at')
        .eq('league_id', activeLeagueId)
        .order('total_points',  { ascending: false })
        .order('exact_scores',  { ascending: false })
        .order('correct_signs', { ascending: false })
        .order('goal_diff_sum', { ascending: true })
        .order('created_at',    { ascending: true })
        .limit(100)
    : supabase
        .from('v_ranking_global')
        .select('profile_id, nickname, total_points, avatar_url, created_at')
        .order('total_points',  { ascending: false })
        .order('exact_scores',  { ascending: false })
        .order('correct_signs', { ascending: false })
        .order('goal_diff_sum', { ascending: true })
        .order('created_at',    { ascending: true })
        .limit(100)

  const [
    { data: rankingData, error: rankingError },
    { data: preds, error: predsError },
  ] = await Promise.all([
    rankingPromise,
    supabase
      .from('predictions')
      .select('profile_id, points_earned, matches!inner(status)')
      .eq('matches.status', 'FINISHED'),
  ])

  if (rankingError) console.error('[clasificacion] ranking error:', rankingError.message, rankingError.code)
  if (predsError) console.error('[clasificacion] predictions error:', predsError.message, predsError.code)

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

  const profileIds = new Set(baseRanking.map(r => r.profileId))
  const statsMap = new Map<string, StatsEntry>()

  for (const pred of preds ?? []) {
    const pid = pred.profile_id
    if (!profileIds.has(pid)) continue
    if (!statsMap.has(pid)) statsMap.set(pid, { me: 0, ar: 0, eq: 0, pi: 0 })
    const s = statsMap.get(pid)!
    const pts = pred.points_earned ?? 0
    if (pts === 3) s.me++
    else if (pts === 2) s.ar++
    else if (pts === 1) s.eq++
    else s.pi++
  }

  const ranking: RankingRow[] = baseRanking.map(r => {
    const s = statsMap.get(r.profileId) ?? { me: 0, ar: 0, eq: 0, pi: 0 }
    return { ...r, me: s.me, ar: s.ar, ta: s.me + s.ar + s.eq, pi: s.pi }
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
                    <td className="px-4 py-3 text-center font-bold text-gray-500 dark:text-gray-400 w-12">
                      {medals[row.position] ?? row.position}
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
