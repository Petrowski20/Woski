import { createClient } from '@/utils/supabase/server'
import { notFound } from 'next/navigation'
import Image from 'next/image'
import Link from 'next/link'
import MatchCard from '@/components/MatchCard'

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data } = await supabase.from('profiles').select('nickname').eq('id', id).single()
  return { title: data ? `${data.nickname} · Woski` : 'Jugador · Woski' }
}

export default async function JugadorPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()

  const [{ data: profile }, { data: rawPredictions }] = await Promise.all([
    supabase
      .from('profiles')
      .select('id, nickname, role, total_points, avatar_url')
      .eq('id', id)
      .single(),
    // SECURITY: !inner + .eq on status ensures predictions for unplayed matches never reach the client
    supabase
      .from('predictions')
      .select(`
        points_earned,
        pred_home_goals,
        pred_away_goals,
        pred_advancing_team_id,
        matches!inner(
          id, home_goals, away_goals, match_date, stage, group_letter,
          status, advancing_team_id, stadium, referee,
          home_team_id, away_team_id,
          home_team:teams!home_team_id(name, flag_emoji, iso_code),
          away_team:teams!away_team_id(name, flag_emoji, iso_code)
        )
      `)
      .eq('profile_id', id)
      .eq('matches.status', 'FINISHED'),
  ])

  if (!profile) notFound()

  const predictions = [...(rawPredictions ?? [])].sort((a, b) => {
    const ma = a.matches as any
    const mb = b.matches as any
    return new Date(mb.match_date).getTime() - new Date(ma.match_date).getTime()
  })

  const plenos   = predictions.filter(p => p.points_earned === 3).length
  const aciertos = predictions.filter(p => p.points_earned === 1 || p.points_earned === 2).length
  const fallos   = predictions.filter(p => p.points_earned === 0).length

  return (
    <div className="w-full max-w-2xl mx-auto space-y-6">

      {/* Back */}
      <Link
        href="/clasificacion"
        className="inline-flex items-center gap-1.5 text-sm text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 transition-colors"
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
        </svg>
        Clasificación
      </Link>

      {/* Header */}
      <div className="bg-white dark:bg-slate-900 rounded-xl border border-[#FFD6D1] dark:border-slate-800 shadow-sm overflow-hidden">
        <div className="bg-gradient-to-r from-[#FFD6D1] to-[#F9ECE5] dark:from-slate-800 dark:to-slate-900 px-6 py-6 flex items-center gap-5">
          <div className="relative w-20 h-20 rounded-full overflow-hidden bg-blue-100 dark:bg-blue-900 flex-shrink-0 flex items-center justify-center border-4 border-white/60 dark:border-slate-700 shadow-md">
            {profile.avatar_url ? (
              <Image src={profile.avatar_url} alt={profile.nickname} fill sizes="80px" className="object-cover" />
            ) : (
              <span className="text-2xl font-bold text-blue-600 dark:text-blue-400">
                {profile.nickname.charAt(0).toUpperCase()}
              </span>
            )}
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 truncate">
                {profile.nickname}
              </h1>
              {profile.role === 'ADMIN' && (
                <span className="px-2 py-0.5 bg-yellow-400 text-yellow-900 rounded-full text-xs font-bold uppercase tracking-wide shrink-0">
                  Admin
                </span>
              )}
            </div>
            <p className="text-3xl font-extrabold text-blue-600 dark:text-blue-400 mt-1 tabular-nums">
              {profile.total_points}
              <span className="text-base font-medium text-gray-400 dark:text-gray-500 ml-1">pts</span>
            </p>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 divide-x divide-gray-100 dark:divide-slate-800 border-t border-gray-100 dark:border-slate-800">
          <div className="flex flex-col items-center py-4 gap-0.5">
            <span className="text-2xl font-extrabold text-emerald-600 dark:text-emerald-400 tabular-nums">{plenos}</span>
            <span className="text-[11px] font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500">Plenos</span>
            <span className="text-[10px] text-gray-300 dark:text-slate-600">+3 pts</span>
          </div>
          <div className="flex flex-col items-center py-4 gap-0.5">
            <span className="text-2xl font-extrabold text-amber-500 dark:text-amber-400 tabular-nums">{aciertos}</span>
            <span className="text-[11px] font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500">Aciertos</span>
            <span className="text-[10px] text-gray-300 dark:text-slate-600">+1 / +2 pts</span>
          </div>
          <div className="flex flex-col items-center py-4 gap-0.5">
            <span className="text-2xl font-extrabold text-red-500 dark:text-red-400 tabular-nums">{fallos}</span>
            <span className="text-[11px] font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500">Fallos</span>
            <span className="text-[10px] text-gray-300 dark:text-slate-600">0 pts</span>
          </div>
        </div>
      </div>

      {/* Match history */}
      {predictions.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-16 text-center">
          <span className="text-5xl">📭</span>
          <p className="font-semibold text-gray-700 dark:text-gray-300 text-sm">Sin historial</p>
          <p className="text-sm text-gray-400 dark:text-gray-500">
            Aún no hay partidos finalizados con predicción de este jugador.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500 px-1">
            Historial · {predictions.length} partido{predictions.length !== 1 ? 's' : ''}
          </h2>
          {predictions.map((pred) => {
            const match = pred.matches as any
            const formattedDate = new Intl.DateTimeFormat('es-ES', {
              day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
            }).format(new Date(match.match_date))

            return (
              <MatchCard
                key={match.id}
                id={match.id}
                home={match.home_team}
                away={match.away_team}
                homeTeamId={match.home_team_id}
                awayTeamId={match.away_team_id}
                group={match.group_letter ?? '?'}
                matchStage={match.stage ?? 'GROUP'}
                date={formattedDate}
                status="FINISHED"
                isLocked
                homeRealResult={match.home_goals}
                awayRealResult={match.away_goals}
                realAdvancingTeamId={match.advancing_team_id ?? null}
                homePrediction={pred.pred_home_goals}
                awayPrediction={pred.pred_away_goals}
                predAdvancingTeamId={pred.pred_advancing_team_id ?? null}
                pointsEarned={pred.points_earned ?? 0}
                stadium={match.stadium}
                referee={match.referee}
              />
            )
          })}
        </div>
      )}

    </div>
  )
}
