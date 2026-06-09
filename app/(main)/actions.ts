'use server'

import { createClient } from '@/utils/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { revalidatePath } from 'next/cache'

export interface PredictionDraft {
  matchId: number
  homeGoals: number | null
  awayGoals: number | null
  advancingTeamId: number | null
}

export interface PublicUserPrediction {
  nickname: string
  avatarUrl: string | null
  homeGoals: number
  awayGoals: number
  advancingTeamId: number | null
}

export interface MatchAggregate {
  total: number
  homeWinPct: number
  drawPct: number
  awayWinPct: number
}

export type PublicMatchPredictionsResult =
  | { type: 'league'; data: PublicUserPrediction[] }
  | { type: 'global'; data: MatchAggregate }
  | { error: string }

function _makeAdminClient() {
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  )
}

// ── Helper interno: borra la predicción validando corte de tiempo ──────────
// Usa el cliente admin para bypasear RLS (predictions no tiene política DELETE)
async function _deletePrediction(
  userId: string,
  matchId: number,
  matchDate: string,
  status: string,
  now: number,
): Promise<void> {
  if (status === 'FINISHED' || status === 'CANCELLED') throw new Error('No acepta modificaciones')
  const cutoffMs = new Date(matchDate).getTime() - 60 * 60 * 1000
  if (now >= cutoffMs) throw new Error('Plazo cerrado')

  const supabaseAdmin = _makeAdminClient()
  const { error } = await supabaseAdmin
    .from('predictions')
    .delete()
    .eq('profile_id', userId)
    .eq('match_id', matchId)

  if (error) throw new Error(error.message)
}

export async function saveAllPredictionsAction(
  drafts: PredictionDraft[]
): Promise<{ saved: number; failed: { matchId: number; error: string }[] }> {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { saved: 0, failed: drafts.map(d => ({ matchId: d.matchId, error: 'No autenticado' })) }

  const { data: matches } = await supabase
    .from('matches')
    .select('id, match_date, status, stage, home_team_id, away_team_id')
    .in('id', drafts.map(d => d.matchId))

  const matchMap = new Map((matches ?? []).map(m => [m.id, m]))
  const now = Date.now()

  const outcomes = await Promise.allSettled(
    drafts.map(async ({ matchId, homeGoals, awayGoals, advancingTeamId: clientAdvancingId }) => {
      const match = matchMap.get(matchId)
      if (!match) throw new Error('Partido no encontrado')
      if (match.status === 'FINISHED' || match.status === 'CANCELLED') throw new Error('No acepta predicciones')

      const cutoffMs = new Date(match.match_date).getTime() - 60 * 60 * 1000
      if (now >= cutoffMs) throw new Error('Plazo cerrado')

      // Borrador nulo → DELETE
      if (homeGoals === null && awayGoals === null) {
        await _deletePrediction(user.id, matchId, match.match_date, match.status, now)
        return
      }

      if (!Number.isInteger(homeGoals) || !Number.isInteger(awayGoals)) throw new Error('Goles inválidos')
      if (homeGoals! < 0 || awayGoals! < 0 || homeGoals! > 99 || awayGoals! > 99) throw new Error('Goles fuera de rango')

      let pred_advancing_team_id: number | null = null
      if (match.stage !== 'GROUP') {
        if (homeGoals! > awayGoals!) {
          pred_advancing_team_id = match.home_team_id
        } else if (awayGoals! > homeGoals!) {
          pred_advancing_team_id = match.away_team_id
        } else {
          if (!clientAdvancingId) throw new Error('Selecciona quién clasifica por penaltis')
          if (clientAdvancingId !== match.home_team_id && clientAdvancingId !== match.away_team_id) {
            throw new Error('Equipo no pertenece al partido')
          }
          pred_advancing_team_id = clientAdvancingId
        }
      }

      const { error } = await supabase
        .from('predictions')
        .upsert({
          profile_id: user.id,
          match_id: matchId,
          pred_home_goals: homeGoals,
          pred_away_goals: awayGoals,
          pred_advancing_team_id,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'profile_id, match_id' })

      if (error) throw new Error(error.message)
    })
  )

  revalidatePath('/')

  const failed = outcomes
    .map((o, i) => o.status === 'rejected'
      ? { matchId: drafts[i].matchId, error: (o.reason as Error).message }
      : null
    )
    .filter(Boolean) as { matchId: number; error: string }[]

  return { saved: outcomes.filter(o => o.status === 'fulfilled').length, failed }
}

export async function savePredictionAction(
  matchId: number,
  homeGoals: number | null,
  awayGoals: number | null,
  clientAdvancingId: number | null = null,
) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'No estás autenticado' }

  const { data: match, error: matchError } = await supabase
    .from('matches')
    .select('match_date, status, stage, home_team_id, away_team_id')
    .eq('id', matchId)
    .single()

  if (matchError || !match) return { error: 'Partido no encontrado' }
  if (match.status === 'FINISHED' || match.status === 'CANCELLED') {
    return { error: 'Este partido ya no acepta predicciones' }
  }

  const cutoffMs = new Date(match.match_date).getTime() - 60 * 60 * 1000
  if (Date.now() >= cutoffMs) {
    return { error: 'El plazo para predecir ha cerrado (se cierra 1 hora antes del partido)' }
  }

  // Borrador nulo → DELETE
  if (homeGoals === null && awayGoals === null) {
    try {
      await _deletePrediction(user.id, matchId, match.match_date, match.status, Date.now())
      revalidatePath('/')
      return { success: true }
    } catch (e) {
      return { error: (e as Error).message }
    }
  }

  if (!Number.isInteger(homeGoals) || !Number.isInteger(awayGoals)) {
    return { error: 'Los goles deben ser números enteros' }
  }
  if (homeGoals! < 0 || awayGoals! < 0 || homeGoals! > 99 || awayGoals! > 99) {
    return { error: 'Valor de goles fuera de rango (0–99)' }
  }

  let pred_advancing_team_id: number | null = null
  if (match.stage !== 'GROUP') {
    if (homeGoals! > awayGoals!) {
      pred_advancing_team_id = match.home_team_id
    } else if (awayGoals! > homeGoals!) {
      pred_advancing_team_id = match.away_team_id
    } else {
      if (!clientAdvancingId) {
        return { error: 'En eliminatoria con empate debes seleccionar quién clasifica por penaltis' }
      }
      if (clientAdvancingId !== match.home_team_id && clientAdvancingId !== match.away_team_id) {
        return { error: 'El equipo seleccionado no pertenece a este partido' }
      }
      pred_advancing_team_id = clientAdvancingId
    }
  }

  const { error } = await supabase
    .from('predictions')
    .upsert({
      profile_id: user.id,
      match_id: matchId,
      pred_home_goals: homeGoals,
      pred_away_goals: awayGoals,
      pred_advancing_team_id,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'profile_id, match_id' })

  if (error) return { error: error.message }

  revalidatePath('/')
  return { success: true }
}

export async function getPublicMatchPredictions(
  matchId: number,
  leagueId?: number | null,
): Promise<PublicMatchPredictionsResult> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'No autenticado' }

  const supabaseAdmin = _makeAdminClient()

  if (leagueId) {
    // Verificar membresía del usuario en la liga
    const { data: membership } = await supabase
      .from('profile_leagues')
      .select('league_id')
      .eq('profile_id', user.id)
      .eq('league_id', leagueId)
      .maybeSingle()

    if (!membership) return { error: 'No eres miembro de esta liga' }

    // IDs de miembros de la liga
    const { data: members, error: membersError } = await supabaseAdmin
      .from('profile_leagues')
      .select('profile_id')
      .eq('league_id', leagueId)

    if (membersError) return { error: membersError.message }

    const memberIds = (members ?? []).map((m: any) => m.profile_id as string)

    const { data, error } = await supabaseAdmin
      .from('predictions')
      .select('profile_id, pred_home_goals, pred_away_goals, pred_advancing_team_id, profiles(nickname, avatar_url)')
      .eq('match_id', matchId)
      .in('profile_id', memberIds)
      .order('pred_home_goals', { ascending: false, nullsFirst: false })

    if (error) return { error: error.message }

    return {
      type: 'league',
      data: (data ?? []).map((row: any) => ({
        nickname: (row.profiles as { nickname: string } | null)?.nickname ?? 'Anónimo',
        avatarUrl: (row.profiles as { avatar_url: string | null } | null)?.avatar_url ?? null,
        homeGoals: row.pred_home_goals,
        awayGoals: row.pred_away_goals,
        advancingTeamId: row.pred_advancing_team_id,
      })),
    }
  }

  // Vista global: porcentajes agregados
  const { data, error } = await supabaseAdmin
    .from('predictions')
    .select('pred_home_goals, pred_away_goals')
    .eq('match_id', matchId)
    .not('pred_home_goals', 'is', null)
    .not('pred_away_goals', 'is', null)

  if (error) return { error: error.message }

  const rows = data ?? []
  const total = rows.length

  if (total === 0) {
    return { type: 'global', data: { total: 0, homeWinPct: 0, drawPct: 0, awayWinPct: 0 } }
  }

  let homeWin = 0, draw = 0, awayWin = 0
  for (const row of rows as any[]) {
    if (row.pred_home_goals > row.pred_away_goals) homeWin++
    else if (row.pred_home_goals < row.pred_away_goals) awayWin++
    else draw++
  }

  return {
    type: 'global',
    data: {
      total,
      homeWinPct: Math.round((homeWin / total) * 100),
      drawPct: Math.round((draw / total) * 100),
      awayWinPct: Math.round((awayWin / total) * 100),
    },
  }
}
