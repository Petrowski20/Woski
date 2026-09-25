'use server'

import { createClient } from '@/utils/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { revalidatePath } from 'next/cache'
import { isPredictionLocked, outcomeIndex, resolveBestOf, type MatchStatus } from '@/utils/lol/series'
import type { PredictionDraft, SaveMatchResult, SavePredictionsResponse } from '@/utils/lol/types'
import { LOL_SPORT_SLUG, buildDistribution, getMyDistributions } from './data'

function _makeAdminClient() {
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  )
}

interface MatchForSave {
  id: number
  match_date: string
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
      id, match_date, status, metadata, home_team_id, away_team_id,
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
  const supabaseAdmin = _makeAdminClient()

  const results: SaveMatchResult[] = await Promise.all(unique.map(async (draft): Promise<SaveMatchResult> => {
    const match = matchById.get(draft.matchId)
    if (!match || match.phases.editions.competitions.sports.slug !== LOL_SPORT_SLUG) {
      return { matchId: draft.matchId, ok: false, code: 'NOT_FOUND' }
    }
    if (isPredictionLocked(match.status, match.match_date, now)) {
      return { matchId: draft.matchId, ok: false, code: 'LOCKED' }
    }

    const bestOf = resolveBestOf(match.metadata, match.phases.rulesets?.config)
    const score = { home: draft.home, away: draft.away }
    if (!Number.isInteger(draft.home) || !Number.isInteger(draft.away) || outcomeIndex(bestOf, score) === -1) {
      return { matchId: draft.matchId, ok: false, code: 'INVALID' }
    }

    const { error: upsertError } = await supabaseAdmin
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
      console.error('[lol] save: upsert', draft.matchId, upsertError)
      return { matchId: draft.matchId, ok: false, code: 'SERVER' }
    }
    return { matchId: draft.matchId, ok: true, prediction: score, distribution: null }
  }))

  // Desglose de % de los partidos recién guardados (ya se puede ver: has votado)
  const savedIds = results.filter(r => r.ok).map(r => r.matchId)
  if (savedIds.length) {
    try {
      const distributions = await getMyDistributions(supabase, savedIds)
      for (const r of results) {
        if (!r.ok) continue
        const match = matchById.get(r.matchId)!
        const bestOf = resolveBestOf(match.metadata, match.phases.rulesets?.config)
        r.distribution = buildDistribution(bestOf, distributions.get(r.matchId) ?? [])
      }
    } catch {
      // Ya registrado en el log; la predicción está guardada y la revalidación
      // de la página traerá el desglose.
    }
  }

  revalidatePath('/lol')
  return { ok: true, results }
}
