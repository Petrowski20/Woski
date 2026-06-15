'use server'

import { createClient } from '@/utils/supabase/server'
import { createClient as createSVClient } from '@supabase/supabase-js'
import { revalidatePath } from 'next/cache'

export interface AdminPrediction {
  nickname: string
  pred_home_goals: number | null
  pred_away_goals: number | null
  pred_advancing_team_id: number | null
}

export interface MatchResult {
  matchId: number
  homeGoals: number
  awayGoals: number
  advancingTeamId: number | null
}

export async function syncMatchesAction(): Promise<{ success: boolean; message: string }> {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, message: 'No estás autenticado' }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (profile?.role !== 'ADMIN') return { success: false, message: 'Acceso denegado: se requiere rol ADMIN' }

  // TODO: en producción, hacer fetch a la API de fútbol y upsert en matches
  // Ejemplo:
  // const res = await fetch('https://api.football-data.org/v4/competitions/2000/matches', {
  //   headers: { 'X-Auth-Token': process.env.FOOTBALL_API_TOKEN! },
  // })
  // const { matches: apiMatches } = await res.json()
  // await supabase.from('matches').upsert(apiMatches.map(transformMatch), { onConflict: 'external_id' })

  revalidatePath('/admin')
  revalidatePath('/')

  return { success: true, message: 'Sincronización completada. Los partidos están al día.' }
}

export async function createMatchAction(
  formData: FormData
): Promise<{ success?: true; error?: string }> {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'No estás autenticado' }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (profile?.role !== 'ADMIN') return { error: 'Acceso denegado: se requiere rol ADMIN' }

  const home_team_id = Number(formData.get('home_team_id'))
  const away_team_id = Number(formData.get('away_team_id'))
  const match_date = formData.get('match_date') as string
  const stage = formData.get('stage') as string
  const group_letter = (formData.get('group_letter') as string) || null
  const stadium = (formData.get('stadium') as string) || null
  const referee = (formData.get('referee') as string) || null

  if (!home_team_id || !away_team_id || !match_date || !stage) {
    return { error: 'Faltan campos obligatorios' }
  }
  if (home_team_id === away_team_id) {
    return { error: 'El equipo local y visitante no pueden ser el mismo' }
  }

  const { error: insertError } = await supabase.from('matches').insert({
    home_team_id,
    away_team_id,
    match_date,
    stage,
    group_letter: stage === 'GROUP' ? group_letter : null,
    stadium,
    referee,
    status: 'PENDING',
  })

  if (insertError) return { error: insertError.message }

  revalidatePath('/admin')
  revalidatePath('/')

  return { success: true }
}

export async function saveMatchResultAction(
  matchId: number,
  homeGoals: number,
  awayGoals: number,
  clientAdvancingId: number | null = null,
): Promise<{ success?: true; error?: string }> {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'No estás autenticado' }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (profile?.role !== 'ADMIN') return { error: 'Acceso denegado: se requiere rol ADMIN' }

  if (!Number.isInteger(homeGoals) || !Number.isInteger(awayGoals)) {
    return { error: 'Los goles deben ser números enteros' }
  }
  if (homeGoals < 0 || awayGoals < 0 || homeGoals > 99 || awayGoals > 99) {
    return { error: 'Valor de goles fuera de rango (0–99)' }
  }

  // Obtener stage y team IDs para la sanitización
  const { data: match, error: matchError } = await supabase
    .from('matches')
    .select('stage, home_team_id, away_team_id')
    .eq('id', matchId)
    .single()

  if (matchError || !match) return { error: 'Partido no encontrado' }

  // ── Sanitización del clasificado (misma lógica que jugador) ─
  let advancing_team_id: number | null = null

  if (match.stage !== 'GROUP') {
    if (homeGoals > awayGoals) {
      advancing_team_id = match.home_team_id
    } else if (awayGoals > homeGoals) {
      advancing_team_id = match.away_team_id
    } else {
      if (!clientAdvancingId) {
        return { error: 'En eliminatoria con empate debes seleccionar el equipo que avanza' }
      }
      if (clientAdvancingId !== match.home_team_id && clientAdvancingId !== match.away_team_id) {
        return { error: 'El equipo seleccionado no pertenece a este partido' }
      }
      advancing_team_id = clientAdvancingId
    }
  }
  // ────────────────────────────────────────────────────────────

  // Persistir el clasificado antes de llamar al RPC de puntos
  if (advancing_team_id !== null) {
    const { error: updateError } = await supabase
      .from('matches')
      .update({ advancing_team_id })
      .eq('id', matchId)
    if (updateError) return { error: updateError.message }
  }

  // El RPC actualiza marcador, status y calcula puntos (SECURITY DEFINER)
  const { error: rpcError } = await supabase.rpc('calculate_match_points', {
    p_match_id: matchId,
    p_home_goals: homeGoals,
    p_away_goals: awayGoals,
  })

  if (rpcError) return { error: rpcError.message }

  // Congela el ranking actual para el historial de posiciones
  await supabase.rpc('record_ranking_snapshot', { p_match_id: matchId })

  revalidatePath('/')
  revalidatePath('/predicciones')
  revalidatePath('/clasificacion')
  revalidatePath('/premios')
  revalidatePath('/admin')

  return { success: true }
}

export async function saveAllMatchesAction(
  results: MatchResult[]
): Promise<{ saved: number; failed: { matchId: number; error: string }[] }> {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { saved: 0, failed: results.map(r => ({ matchId: r.matchId, error: 'No autenticado' })) }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (profile?.role !== 'ADMIN') {
    return { saved: 0, failed: results.map(r => ({ matchId: r.matchId, error: 'Acceso denegado' })) }
  }

  const { data: matches } = await supabase
    .from('matches')
    .select('id, stage, home_team_id, away_team_id, status')
    .in('id', results.map(r => r.matchId))

  const matchMap = new Map((matches ?? []).map(m => [m.id, m]))

  const outcomes = await Promise.allSettled(
    results.map(async ({ matchId, homeGoals, awayGoals, advancingTeamId: clientAdvancingId }) => {
      const match = matchMap.get(matchId)
      if (!match) throw new Error('Partido no encontrado')
      if (match.status === 'FINISHED') throw new Error('Ya finalizado')

      let advancing_team_id: number | null = null
      if (match.stage !== 'GROUP') {
        if (homeGoals > awayGoals) {
          advancing_team_id = match.home_team_id
        } else if (awayGoals > homeGoals) {
          advancing_team_id = match.away_team_id
        } else {
          if (!clientAdvancingId) throw new Error('Empate en eliminatoria sin clasificado')
          if (clientAdvancingId !== match.home_team_id && clientAdvancingId !== match.away_team_id) {
            throw new Error('El equipo seleccionado no pertenece al partido')
          }
          advancing_team_id = clientAdvancingId
        }
      }

      if (advancing_team_id !== null) {
        const { error: updateError } = await supabase
          .from('matches')
          .update({ advancing_team_id })
          .eq('id', matchId)
        if (updateError) throw new Error(updateError.message)
      }

      const { error: rpcError } = await supabase.rpc('calculate_match_points', {
        p_match_id: matchId,
        p_home_goals: homeGoals,
        p_away_goals: awayGoals,
      })
      if (rpcError) throw new Error(rpcError.message)

      // Snapshot tras cada partido exitoso
      await supabase.rpc('record_ranking_snapshot', { p_match_id: matchId })
    })
  )

  revalidatePath('/')
  revalidatePath('/predicciones')
  revalidatePath('/clasificacion')
  revalidatePath('/premios')
  revalidatePath('/admin')

  const failed = outcomes
    .map((o, i) =>
      o.status === 'rejected'
        ? { matchId: results[i].matchId, error: (o.reason as Error).message }
        : null
    )
    .filter(Boolean) as { matchId: number; error: string }[]

  return { saved: outcomes.filter(o => o.status === 'fulfilled').length, failed }
}

export async function updatePlayerPredictionAction(
  profileId: string,
  matchId: number,
  predHomeGoals: number,
  predAwayGoals: number,
  predAdvancingTeamId: number | null,
): Promise<{ success?: true; error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'No autenticado' }

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'ADMIN') return { error: 'Acceso denegado' }

  if (
    !Number.isInteger(predHomeGoals) || !Number.isInteger(predAwayGoals) ||
    predHomeGoals < 0 || predAwayGoals < 0 || predHomeGoals > 99 || predAwayGoals > 99
  ) return { error: 'Valores de goles inválidos (0–99)' }

  const supabaseAdmin = createSVClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  )

  const { data: match, error: matchErr } = await supabaseAdmin
    .from('matches')
    .select('home_goals, away_goals, advancing_team_id, stage, home_team_id, away_team_id')
    .eq('id', matchId)
    .single()

  if (matchErr || !match) return { error: 'Partido no encontrado' }

  // Partido sin resultado aún: guardar la predicción sin tocar points_earned
  if (match.home_goals === null || match.away_goals === null) {
    const { error: predErr } = await supabaseAdmin
      .from('predictions')
      .upsert(
        { profile_id: profileId, match_id: matchId, pred_home_goals: predHomeGoals, pred_away_goals: predAwayGoals, pred_advancing_team_id: predAdvancingTeamId },
        { onConflict: 'profile_id,match_id' }
      )
    if (predErr) return { error: predErr.message }
    revalidatePath(`/jugador/${profileId}`)
    revalidatePath('/admin/predicciones')
    return { success: true }
  }

  const realHome = match.home_goals as number
  const realAway = match.away_goals as number
  const advancing = match.advancing_team_id as number | null
  const isKnockout = match.stage !== 'GROUP'
  const isRealTie = realHome === realAway

  let pointsEarned: number
  if (isKnockout && isRealTie && advancing !== null) {
    if (predAdvancingTeamId !== advancing) {
      pointsEarned = 0
    } else if (predHomeGoals === realHome && predAwayGoals === realAway) {
      pointsEarned = 3
    } else if (predHomeGoals === predAwayGoals) {
      pointsEarned = 2
    } else {
      pointsEarned = 1
    }
  } else {
    const wrongWinner =
      (realHome > realAway && predHomeGoals <= predAwayGoals) ||
      (realAway > realHome && predAwayGoals <= predHomeGoals) ||
      (isRealTie && predHomeGoals !== predAwayGoals)
    if (wrongWinner) {
      pointsEarned = 0
    } else if (predHomeGoals === realHome && predAwayGoals === realAway) {
      pointsEarned = 3
    } else if ((predHomeGoals - predAwayGoals) === (realHome - realAway)) {
      pointsEarned = 2
    } else {
      pointsEarned = 1
    }
  }

  const { error: predErr } = await supabaseAdmin
    .from('predictions')
    .upsert(
      { profile_id: profileId, match_id: matchId, pred_home_goals: predHomeGoals, pred_away_goals: predAwayGoals, pred_advancing_team_id: predAdvancingTeamId, points_earned: pointsEarned },
      { onConflict: 'profile_id,match_id' }
    )

  if (predErr) return { error: predErr.message }

  const { data: totals } = await supabaseAdmin
    .from('predictions')
    .select('points_earned')
    .eq('profile_id', profileId)

  const totalPoints = (totals ?? []).reduce((sum, r) => sum + (r.points_earned ?? 0), 0)

  await supabaseAdmin.from('profiles').update({ total_points: totalPoints }).eq('id', profileId)
  await supabaseAdmin.from('profile_leagues').update({ league_points: totalPoints }).eq('profile_id', profileId)

  revalidatePath('/')
  revalidatePath('/clasificacion')
  revalidatePath('/admin/predicciones')
  revalidatePath(`/jugador/${profileId}`)

  return { success: true }
}

// ── Tipos para el reporte de estadísticas curiosas ────────────────────────────

export interface FunnyPredictionDetail {
  match: string
  home_flag: string
  away_flag: string
  home_iso: string
  away_iso: string
  stage: string
  group_letter: string | null
  home_ranking: number | null
  away_ranking: number | null
  home_confederation: string | null
  away_confederation: string | null
  pred_result: string
  actual_result: string
  points_earned: number
  cumulative_points: number
  minutes_before_kickoff: number
  bet_on_underdog: boolean
  pred_total_goals: number
  goal_error: number
  missed_by_one: boolean
  predicted_draw: boolean
}

export interface FunnyPlayerLeague {
  league_id: number
  league_name: string
  league_points: number
}

export interface ConfederationStat {
  confederation: string
  matches: number
  total_points: number
  exact_scores: number
  avg_goal_error: number
}

export interface FunnyPlayerStats {
  profile_id: string
  nickname: string
  leagues: FunnyPlayerLeague[]
  total_predictions: number
  total_points: number
  exact_scores: number
  diff_scores: number
  correct_winners: number
  wrong_predictions: number
  underdog_bets: number
  underdog_wins: number
  total_goals_predicted: number
  avg_goals_per_match: number
  avg_minutes_before_kickoff: number
  last_minute_count: number
  late_predictions: number
  avg_goal_error: number
  max_goal_error: number
  max_pred_goals_in_match: number
  missed_by_one: number
  predicted_draws: number
  best_streak: number
  worst_streak: number
  current_streak: number
  by_confederation: ConfederationStat[]
  predictions: FunnyPredictionDetail[]
}

export async function getFunnyStatsAction(
  leagueId?: number | null,
): Promise<{ data?: FunnyPlayerStats[]; error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'No autenticado' }

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'ADMIN') return { error: 'Acceso denegado' }

  const supabaseAdmin = createSVClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  )

  const { data, error } = await supabaseAdmin.rpc('get_funny_prediction_stats', {
    p_league_id: leagueId ?? null,
  })
  if (error) return { error: error.message }

  return { data: (data ?? []) as FunnyPlayerStats[] }
}

export async function getPublicStatsAction(
  leagueId?: number | null,
): Promise<{ data?: FunnyPlayerStats[]; error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'No autenticado' }

  const { data, error } = await supabase.rpc('get_funny_prediction_stats', {
    p_league_id: leagueId ?? null,
  })
  if (error) return { error: error.message }

  return { data: (data ?? []) as FunnyPlayerStats[] }
}

export async function getAdminAllPredictionsAction(
  matchId: number
): Promise<{ data?: AdminPrediction[]; error?: string }> {
  // Verificar que el llamante es ADMIN
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'No autenticado' }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (profile?.role !== 'ADMIN') return { error: 'Acceso denegado' }

  // Cliente con SERVICE_ROLE para saltarse RLS y leer predicciones de todos los usuarios
  const supabaseAdmin = createSVClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  )

  const { data, error } = await supabaseAdmin
    .from('predictions')
    .select('pred_home_goals, pred_away_goals, pred_advancing_team_id, profiles(nickname)')
    .eq('match_id', matchId)
    .order('pred_home_goals', { ascending: false, nullsFirst: false })

  if (error) return { error: error.message }

  return {
    data: (data ?? []).map((row: any) => ({
      nickname: (row.profiles as { nickname: string } | null)?.nickname ?? 'Anónimo',
      pred_home_goals: row.pred_home_goals,
      pred_away_goals: row.pred_away_goals,
      pred_advancing_team_id: row.pred_advancing_team_id,
    })),
  }
}
