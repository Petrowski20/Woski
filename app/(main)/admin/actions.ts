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

  revalidatePath('/')
  revalidatePath('/predicciones')
  revalidatePath('/clasificacion')
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
    })
  )

  revalidatePath('/')
  revalidatePath('/predicciones')
  revalidatePath('/clasificacion')
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
