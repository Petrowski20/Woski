'use server'

import { createClient } from '@/utils/supabase/server'
import { revalidatePath } from 'next/cache'
import { isPredictionLocked, outcomeIndex, resolveBestOf, type MatchStatus } from '@/utils/lol/series'
import type { PredictionDraft, SaveMatchResult, SavePredictionsResponse } from '@/utils/lol/types'
import { LOL_SPORT_SLUG } from './data'

// Código de Postgres cuando la RLS rechaza la fila: en LoL solo ocurre si la
// votación ya está cerrada (políticas predictions_lol_*_while_open).
const RLS_VIOLATION = '42501'

interface MatchForSave {
  id: number
  prediction_locks_at: string
  status: MatchStatus
  metadata: unknown
  home_team_id: number
  away_team_id: number
  phases: {
    rulesets: { config: unknown } | null
    editions: { competitions: { sports: { slug: string } } }
  }
}

/**
 * Guarda una o varias predicciones de LoL. Nunca lanza: devuelve un código
 * por partido para que el cliente muestre un mensaje específico.
 * Se usa tanto para "Guardar predicción" como para "Guardar todas".
 * Escribe con el cliente del usuario: la RLS es quien decide si la votación
 * sigue abierta; la comprobación previa solo da un mensaje más claro.
 */
export async function saveLolPredictionsAction(drafts: PredictionDraft[]): Promise<SavePredictionsResponse> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, code: 'UNAUTHENTICATED' }

  // Un borrador por partido (el último gana)
  const unique = [...new Map(drafts.map(d => [d.matchId, d])).values()]
    .filter(d => Number.isInteger(d.matchId))
  if (unique.length === 0) return { ok: true, results: [] }

  const { data, error } = await supabase
    .from('matches')
    .select(`
      id, prediction_locks_at, status, metadata, home_team_id, away_team_id,
      phases!inner (
        rulesets (config),
        editions!inner ( competitions!inner ( sports!inner (slug) ) )
      )
    `)
    .in('id', unique.map(d => d.matchId))

  if (error) {
    console.error('[lol] save: load matches', error)
    return { ok: true, results: unique.map(d => ({ matchId: d.matchId, ok: false, code: 'SERVER' as const })) }
  }

  const matchById = new Map(((data ?? []) as unknown as MatchForSave[]).map(m => [m.id, m]))
  const now = Date.now()

  const results: SaveMatchResult[] = await Promise.all(unique.map(async (draft): Promise<SaveMatchResult> => {
    const match = matchById.get(draft.matchId)
    if (!match || match.phases.editions.competitions.sports.slug !== LOL_SPORT_SLUG) {
      return { matchId: draft.matchId, ok: false, code: 'NOT_FOUND' }
    }
    if (isPredictionLocked(match.status, match.prediction_locks_at, now)) {
      return { matchId: draft.matchId, ok: false, code: 'LOCKED' }
    }

    const bestOf = resolveBestOf(match.metadata, match.phases.rulesets?.config)
    const score = { home: draft.home, away: draft.away }
    if (!Number.isInteger(draft.home) || !Number.isInteger(draft.away) || outcomeIndex(bestOf, score) === -1) {
      return { matchId: draft.matchId, ok: false, code: 'INVALID' }
    }

    const { error: upsertError } = await supabase
      .from('predictions')
      .upsert({
        profile_id: user.id,
        match_id: draft.matchId,
        pred_home_goals: draft.home,
        pred_away_goals: draft.away,
        pred_winner_id: draft.home > draft.away ? match.home_team_id : match.away_team_id,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'profile_id, match_id' })

    if (upsertError) {
      if (upsertError.code === RLS_VIOLATION) return { matchId: draft.matchId, ok: false, code: 'LOCKED' }
      console.error('[lol] save: upsert', draft.matchId, upsertError)
      return { matchId: draft.matchId, ok: false, code: 'SERVER' }
    }
    return { matchId: draft.matchId, ok: true, prediction: score }
  }))

  revalidatePath('/')
  return { ok: true, results }
}

/**
 * Guarda el ámbito elegido en la clasificación (null = Global) en
 * profiles.last_viewed_league_id, igual que LeagueSelector en el fútbol.
 * Solo acepta pools de esa edición de los que el usuario es miembro.
 */
export async function setLolPoolAction(editionId: number, poolId: number | null): Promise<{ error: string | null }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Tu sesión ha caducado, vuelve a iniciar sesión.' }

  if (poolId !== null) {
    const { data: membership, error } = await supabase
      .from('pool_members')
      .select('pool_id, pools!inner(edition_id)')
      .eq('profile_id', user.id)
      .eq('pool_id', poolId)
      .eq('pools.edition_id', editionId)
      .maybeSingle()
    if (error) console.error('[lol] set pool: membership', error)
    if (!membership) return { error: 'No perteneces a ese pool.' }
  }

  const { error } = await supabase
    .from('profiles')
    .update({ last_viewed_league_id: poolId })
    .eq('id', user.id)
  if (error) {
    console.error('[lol] set pool: update profile', error)
    return { error: 'No se ha podido cambiar la clasificación. Inténtalo de nuevo.' }
  }

  revalidatePath('/')
  revalidatePath('/lol/clasificacion')
  return { error: null }
}
