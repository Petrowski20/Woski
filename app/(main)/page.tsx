import { createClient } from '@/utils/supabase/server';
import MatchGrid from '@/components/MatchGrid';
import Link from 'next/link';
import Image from 'next/image';
import { getServerLang, tServer } from '@/utils/i18n-server';
import ScrollToTopButton from '@/components/ScrollToTopButton';

export default async function HomePage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const lang = await getServerLang();
  const t = (key: string, vars?: Record<string, string | number>) => tServer(lang, key, vars);

  const [matchesRes, predictionsRes, profileRes] = await Promise.all([
    supabase
      .from('matches')
      .select(`
        id, match_date, stage, group_letter, status, home_goals, away_goals, stadium, referee,
        home_team_id, away_team_id, advancing_team_id,
        home_team:teams!home_team_id (name, flag_emoji, iso_code),
        away_team:teams!away_team_id (name, flag_emoji, iso_code)
      `)
      .order('match_date', { ascending: true }),
    supabase
      .from('predictions')
      .select('match_id, pred_home_goals, pred_away_goals, pred_advancing_team_id, points_earned')
      .eq('profile_id', user?.id ?? ''),
    supabase
      .from('profiles')
      .select('last_viewed_league_id')
      .eq('id', user?.id ?? '')
      .single(),
  ]);

  const { data: matches, error } = matchesRes;
  const { data: predictions } = predictionsRes;
  const activeLeagueId: number | null = profileRes.data?.last_viewed_league_id ?? null;

  type SidebarRow = { position: number; nickname: string; pts: number; profileId: string; avatarUrl: string | null };
  let top5: SidebarRow[] = [];
  let rankingTitle = t('home.ranking.global');

  if (activeLeagueId) {
    const { data: leagueData, error: leagueError } = await supabase
      .from('v_ranking_by_league')
      .select('profile_id, nickname, total_points, avatar_url, league_name, created_at')
      .eq('league_id', activeLeagueId)
      .order('total_points',  { ascending: false })
      .order('exact_scores',  { ascending: false })
      .order('correct_signs', { ascending: false })
      .order('goal_diff_sum', { ascending: true })
      .order('created_at',    { ascending: true })
      .limit(5);
    if (leagueError) console.error('[home] league ranking error:', leagueError)
    top5 = (leagueData ?? []).map((r: any, i: number) => ({
      position: i + 1, nickname: r.nickname, pts: r.total_points, profileId: r.profile_id, avatarUrl: r.avatar_url ?? null,
    }));
    rankingTitle = t('home.ranking.liga', { name: leagueData?.[0]?.league_name ?? 'Liga' });
  } else {
    const { data: globalData, error: globalError } = await supabase
      .from('v_ranking_global')
      .select('profile_id, nickname, total_points, avatar_url')
      .order('total_points', { ascending: false })
      .limit(5);
    if (globalError) console.error('[home] global ranking error:', globalError)
    top5 = (globalData ?? []).map((r: any, i: number) => ({
      position: i + 1, nickname: r.nickname, pts: r.total_points, profileId: r.profile_id, avatarUrl: r.avatar_url ?? null,
    }));
  }

  if (error) {
    return (
      <div className="p-8 text-center text-red-600">
        <p>Error cargando los partidos: {error.message}</p>
      </div>
    );
  }

  const userPredictions = (predictions || []).reduce((acc: any, pred: any) => {
    acc[pred.match_id] = pred;
    return acc;
  }, {});

  const matchesWithPredictions = matches?.map(match => ({
    ...match,
    myPred: userPredictions[match.id] || null,
  })) || [];

  const totalMatches = matches?.length ?? 0;
  const predictedMatches = predictions?.length ?? 0;
  const faltan = Math.max(0, totalMatches - predictedMatches);
  const progressPercentage = totalMatches > 0 ? Math.round((predictedMatches / totalMatches) * 100) : 0;

  return (
    <div className="w-full">
      <ScrollToTopButton />
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">

        {/* Calendario de Partidos */}
        <div className="lg:col-span-8">
          <div className="mb-6">
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{t('home.title')}</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{t('home.subtitle')}</p>
          </div>
          <MatchGrid matches={matchesWithPredictions} activeLeagueId={activeLeagueId} />
        </div>

        {/* Sidebar */}
        <div className="lg:col-span-4 flex flex-col gap-6 lg:sticky lg:top-24 h-fit">

          {/* Widget predicciones */}
          <div className="bg-white dark:bg-slate-900 rounded-xl shadow-sm border border-gray-200 dark:border-slate-800 p-5">
            <h2 className="font-bold text-gray-900 dark:text-white border-b border-gray-100 dark:border-slate-800 pb-3 mb-4 flex items-center justify-between">
              <span>{t('home.predictions.title')}</span>
              {faltan === 0 && totalMatches > 0 ? (
                <span className="bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300 text-xs px-2 py-1 rounded-full">
                  {t('home.predictions.completado')}
                </span>
              ) : (
                <span className="bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 text-xs px-2 py-1 rounded-full">
                  {t('home.predictions.faltan', { n: faltan })}
                </span>
              )}
            </h2>

            <div className="flex flex-col gap-3">
              <div className="flex justify-between items-center text-sm">
                <span className="text-gray-500 dark:text-gray-400">{t('home.predictions.completadas')}</span>
                <span className="font-semibold text-gray-900 dark:text-white">{predictedMatches} / {totalMatches}</span>
              </div>
              <div className="w-full bg-gray-100 dark:bg-slate-800 rounded-full h-2">
                <div className="bg-blue-600 h-2 rounded-full transition-all duration-500" style={{ width: `${progressPercentage}%` }}></div>
              </div>
              <p className="text-xs text-gray-400 dark:text-gray-500 mt-2">
                💡 {t('home.predictions.hint')}
              </p>
            </div>
          </div>

          {/* Widget ranking */}
          <div className="bg-white dark:bg-slate-900 rounded-xl shadow-sm border border-gray-200 dark:border-slate-800 p-5">
            <h2 className="font-bold text-gray-900 dark:text-white border-b border-gray-100 dark:border-slate-800 pb-3 mb-4">
              {rankingTitle}
            </h2>

            <div className="flex flex-col gap-3">
              {top5.length === 0 ? (
                <p className="text-xs text-gray-400 dark:text-gray-500 text-center py-2">{t('home.ranking.sinDatos')}</p>
              ) : (
                top5.map((row) => {
                  const isMe = row.profileId === user?.id;
                  return (
                    <div
                      key={row.profileId}
                      className={`flex items-center justify-between p-2 rounded-lg text-sm ${isMe ? 'bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-800' : ''}`}
                    >
                      <div className="flex items-center gap-2">
                        <span className={`font-bold w-4 text-center shrink-0 ${row.position <= 3 ? 'text-blue-600 dark:text-blue-400' : 'text-gray-400 dark:text-gray-500'}`}>
                          {row.position}
                        </span>
                        <div className="relative w-6 h-6 rounded-full overflow-hidden bg-blue-100 dark:bg-blue-900 border border-blue-200 dark:border-blue-700 flex items-center justify-center shrink-0">
                          {row.avatarUrl ? (
                            <Image src={row.avatarUrl} alt={row.nickname} fill sizes="24px" className="object-cover" />
                          ) : (
                            <span className="text-[9px] font-bold text-blue-600 dark:text-blue-400">{row.nickname.charAt(0).toUpperCase()}</span>
                          )}
                        </div>
                        <span className={`font-medium text-sm ${isMe ? 'text-blue-900 dark:text-blue-300' : 'text-gray-700 dark:text-gray-300'}`}>
                          {row.nickname} {isMe && t('clasificacion.yo')}
                        </span>
                      </div>
                      <span className="font-bold text-gray-900 dark:text-white">
                        {row.pts} <span className="text-xs text-gray-500 dark:text-gray-400 font-normal">pts</span>
                      </span>
                    </div>
                  );
                })
              )}
            </div>

            <Link
              href="/clasificacion"
              className="block w-full mt-4 py-2 text-sm text-center text-blue-600 dark:text-blue-400 font-medium hover:text-blue-800 dark:hover:text-blue-300 transition-colors border border-blue-100 dark:border-blue-800 rounded-lg bg-blue-50/50 dark:bg-blue-900/20 hover:bg-blue-50 dark:hover:bg-blue-900/40"
            >
              {t('home.ranking.verCompleto')}
            </Link>
          </div>

        </div>

      </div>
    </div>
  );
}
