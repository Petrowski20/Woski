import { redirect } from 'next/navigation'
import { createClient } from '@/utils/supabase/server'
import RecordsBoard from '@/components/RecordsBoard'
import type { AwardCard } from '@/components/RecordsBoard'
import type { FunnyPlayerStats } from '@/app/(main)/admin/actions'

function pickMax(
  players: FunnyPlayerStats[],
  key: keyof FunnyPlayerStats,
  minPredictions = 1,
): FunnyPlayerStats | null {
  const eligible = players.filter(p => p.total_predictions >= minPredictions)
  if (!eligible.length) return null
  return eligible.reduce((best, p) =>
    Number(p[key]) > Number(best[key]) ? p : best
  )
}

function fmt(value: number, decimals = 0): string {
  return decimals > 0 ? value.toFixed(decimals) : String(value)
}

function buildAwards(players: FunnyPlayerStats[]): AwardCard[] {
  if (!players.length) return []

  const awards: AwardCard[] = []

  const leader = pickMax(players, 'total_points')
  if (leader) {
    awards.push({
      emoji: '🏆',
      title: 'El Líder',
      description: 'Más puntos en la clasificación global',
      holder: leader.nickname,
      value: `${leader.total_points} pts`,
      colorClass: 'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800',
    })
  }

  const sniper = pickMax(players, 'exact_scores')
  if (sniper) {
    awards.push({
      emoji: '🎯',
      title: 'El Francotirador',
      description: 'Más resultados exactos (marcador perfecto)',
      holder: sniper.nickname,
      value: `${sniper.exact_scores} exactos`,
      colorClass: 'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800',
    })
  }

  const hotStreak = pickMax(players, 'best_streak')
  if (hotStreak && hotStreak.best_streak > 0) {
    awards.push({
      emoji: '🔥',
      title: 'Racha Legendaria',
      description: 'Mayor racha de partidos puntuando seguidos',
      holder: hotStreak.nickname,
      value: `${hotStreak.best_streak} partidos`,
      colorClass: 'bg-orange-50 dark:bg-orange-900/20 border-orange-200 dark:border-orange-800',
    })
  }

  const coldStreak = pickMax(players, 'worst_streak')
  if (coldStreak && coldStreak.worst_streak > 0) {
    awards.push({
      emoji: '❌',
      title: 'El Gafe',
      description: 'Racha más larga de partidos sin puntuar',
      holder: coldStreak.nickname,
      value: `${coldStreak.worst_streak} partidos`,
      colorClass: 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800',
    })
  }

  const uyyy = pickMax(players, 'missed_by_one')
  if (uyyy && uyyy.missed_by_one > 0) {
    awards.push({
      emoji: '🤏',
      title: 'El Uyyy',
      description: 'Más veces fallando el marcador exacto por solo 1 gol',
      holder: uyyy.nickname,
      value: `${uyyy.missed_by_one} veces`,
      colorClass: 'bg-purple-50 dark:bg-purple-900/20 border-purple-200 dark:border-purple-800',
    })
  }

  const empate = pickMax(players, 'predicted_draws')
  if (empate && empate.predicted_draws > 0) {
    awards.push({
      emoji: '💤',
      title: 'El Empático',
      description: 'Más empates predichos',
      holder: empate.nickname,
      value: `${empate.predicted_draws} empates`,
      colorClass: 'bg-slate-50 dark:bg-slate-800/50 border-slate-200 dark:border-slate-700',
    })
  }

  const goleador = pickMax(players, 'total_goals_predicted')
  if (goleador && goleador.total_goals_predicted > 0) {
    awards.push({
      emoji: '⚽',
      title: 'Goleador de Salón',
      description: 'Más goles predichos en total',
      holder: goleador.nickname,
      value: `${goleador.total_goals_predicted} goles`,
      colorClass: 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800',
    })
  }

  const loco = pickMax(players, 'max_goal_error', 3)
  if (loco && loco.max_goal_error > 0) {
    awards.push({
      emoji: '📏',
      title: 'La Predicción del Siglo',
      description: 'Predicción más alejada de la realidad (diferencia de goles)',
      holder: loco.nickname,
      value: `±${loco.max_goal_error} goles`,
      colorClass: 'bg-pink-50 dark:bg-pink-900/20 border-pink-200 dark:border-pink-800',
    })
  }

  const lastMin = pickMax(players, 'last_minute_count')
  if (lastMin && lastMin.last_minute_count > 0) {
    awards.push({
      emoji: '⚡',
      title: 'El Último Segundo',
      description: 'Más predicciones enviadas en los últimos 5 minutos',
      holder: lastMin.nickname,
      value: `${lastMin.last_minute_count} veces`,
      colorClass: 'bg-yellow-50 dark:bg-yellow-900/20 border-yellow-200 dark:border-yellow-800',
    })
  }

  const valiente = pickMax(players, 'underdog_wins', 3)
  if (valiente && valiente.underdog_wins > 0) {
    awards.push({
      emoji: '🦁',
      title: 'El Valiente',
      description: 'Más aciertos apostando por el equipo con peor ranking FIFA',
      holder: valiente.nickname,
      value: `${valiente.underdog_wins} aciertos`,
      colorClass: 'bg-teal-50 dark:bg-teal-900/20 border-teal-200 dark:border-teal-800',
    })
  }

  return awards
}

export default async function PremiosPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data, error } = await supabase.rpc('get_funny_prediction_stats', {
    p_league_id: null,
  })

  const players: FunnyPlayerStats[] = (data ?? []) as FunnyPlayerStats[]
  const awards = buildAwards(players)

  const now = new Date().toLocaleDateString('es-ES', {
    day: '2-digit', month: 'long', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })

  return (
    <div className="w-full max-w-4xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
          🏅 Premios y Récords
        </h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
          Los galardones del Mundial — basados en todas las predicciones
        </p>
      </div>

      {error && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl p-4 mb-6 text-sm text-red-700 dark:text-red-400">
          Error cargando premios: {(error as { message?: string }).message ?? String(error)}
        </div>
      )}

      <RecordsBoard awards={awards} updatedLabel={`Actualizado: ${now}`} />
    </div>
  )
}
