import { createClient } from '@/utils/supabase/server';
import MatchGrid from '@/components/MatchGrid';
import Link from 'next/link';

export default async function HomePage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  // 1. Pedimos los partidos, predicciones y perfil en paralelo
  const [matchesRes, predictionsRes, profileRes] = await Promise.all([
    supabase
      .from('matches')
      .select(`
        id, match_date, stage, group_letter, status, home_goals, away_goals, stadium, referee,
        home_team:teams!home_team_id (name, flag_emoji),
        away_team:teams!away_team_id (name, flag_emoji)
      `)
      .order('match_date', { ascending: true }),
    supabase
      .from('predictions')
      .select('*')
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

  // 2. Top 5 según la preferencia del usuario
  type SidebarRow = { position: number; nickname: string; pts: number; profileId: string };
  let top5: SidebarRow[] = [];
  let rankingTitle = 'Top 5 - Global';

  if (activeLeagueId) {
    const { data: leagueData } = await supabase
      .from('v_ranking_by_league')
      .select('position, nickname, league_points, profile_id, league_name')
      .eq('league_id', activeLeagueId)
      .order('position', { ascending: true })
      .limit(5);
    top5 = (leagueData ?? []).map((r: any) => ({
      position: r.position, nickname: r.nickname, pts: r.league_points, profileId: r.profile_id,
    }));
    rankingTitle = `Top 5 - ${leagueData?.[0]?.league_name ?? 'Liga'}`;
  } else {
    const { data: globalData } = await supabase
      .from('v_ranking_global')
      .select('position, nickname, total_points, id')
      .order('position', { ascending: true })
      .limit(5);
    top5 = (globalData ?? []).map((r: any) => ({
      position: r.position, nickname: r.nickname, pts: r.total_points, profileId: r.id,
    }));
  }

  if (error) {
    return (
      <div className="p-8 text-center text-red-600">
        <p>Error cargando los partidos: {error.message}</p>
      </div>
    );
  }

  // 3. Fusionamos partidos con predicciones
  const userPredictions = (predictions || []).reduce((acc: any, pred: any) => {
    acc[pred.match_id] = pred;
    return acc;
  }, {});

  const matchesWithPredictions = matches?.map(match => ({
    ...match,
    myPred: userPredictions[match.id] || null,
  })) || [];

  // 4. Estadísticas del widget de progreso
  const totalMatches = matches?.length ?? 0;
  const predictedMatches = predictions?.length ?? 0;
  const faltan = Math.max(0, totalMatches - predictedMatches);
  const progressPercentage = totalMatches > 0 ? Math.round((predictedMatches / totalMatches) * 100) : 0;

  return (
    <div className="w-full">
      {/* Contenedor principal dividido en 12 columnas en escritorio */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">

        {/* COLUMNA IZQUIERDA: Calendario de Partidos (8/12 del ancho) */}
        <div className="lg:col-span-8">
          <div className="mb-6">
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Jornada Actual</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Fase de Grupos - Fecha 1</p>
          </div>

          <MatchGrid matches={matchesWithPredictions} />
        </div>

        {/* COLUMNA DERECHA: Sidebar (4/12 del ancho) */}
        {/* Se queda fija al hacer scroll en escritorio */}
        <div className="lg:col-span-4 flex flex-col gap-6 lg:sticky lg:top-24 h-fit">
          
          {/* WIDGET 1: Tareas Pendientes */}
          <div className="bg-white dark:bg-slate-900 rounded-xl shadow-sm border border-gray-200 dark:border-slate-800 p-5">
            <h2 className="font-bold text-gray-900 dark:text-white border-b border-gray-100 dark:border-slate-800 pb-3 mb-4 flex items-center justify-between">
              <span>Tus Predicciones</span>
              {faltan === 0 && totalMatches > 0 ? (
                <span className="bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300 text-xs px-2 py-1 rounded-full">¡Completado!</span>
              ) : (
                <span className="bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 text-xs px-2 py-1 rounded-full">Faltan {faltan}</span>
              )}
            </h2>

            <div className="flex flex-col gap-3">
              <div className="flex justify-between items-center text-sm">
                <span className="text-gray-500 dark:text-gray-400">Completadas</span>
                <span className="font-semibold text-gray-900 dark:text-white">{predictedMatches} / {totalMatches}</span>
              </div>
              {/* Barra de progreso visual */}
              <div className="w-full bg-gray-100 dark:bg-slate-800 rounded-full h-2">
                <div className="bg-blue-600 h-2 rounded-full transition-all duration-500" style={{ width: `${progressPercentage}%` }}></div>
              </div>
              <p className="text-xs text-gray-400 dark:text-gray-500 mt-2">
                💡 Recuerda que puedes editar hasta 1 hora antes del pitido inicial.
              </p>
            </div>
          </div>

          {/* WIDGET 2: Mini Clasificación */}
          <div className="bg-white dark:bg-slate-900 rounded-xl shadow-sm border border-gray-200 dark:border-slate-800 p-5">
            <h2 className="font-bold text-gray-900 dark:text-white border-b border-gray-100 dark:border-slate-800 pb-3 mb-4">
              {rankingTitle}
            </h2>

            <div className="flex flex-col gap-3">
              {top5.length === 0 ? (
                <p className="text-xs text-gray-400 dark:text-gray-500 text-center py-2">Sin datos aún.</p>
              ) : (
                top5.map((row) => {
                  const isMe = row.profileId === user?.id;
                  return (
                    <div
                      key={row.profileId}
                      className={`flex items-center justify-between p-2 rounded-lg text-sm ${isMe ? 'bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-800' : ''}`}
                    >
                      <div className="flex items-center gap-3">
                        <span className={`font-bold w-4 text-center ${row.position <= 3 ? 'text-blue-600 dark:text-blue-400' : 'text-gray-400 dark:text-gray-500'}`}>
                          {row.position}
                        </span>
                        <span className={`font-medium ${isMe ? 'text-blue-900 dark:text-blue-300' : 'text-gray-700 dark:text-gray-300'}`}>
                          {row.nickname} {isMe && '(Tú)'}
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
              Ver clasificación completa
            </Link>
          </div>

        </div>

      </div>
    </div>
  );
}