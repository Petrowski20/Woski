'use server'

import { createClient } from '@/utils/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { revalidatePath } from 'next/cache'
import { outcomeIndex, resolveBestOf } from '@/utils/lol/series'
import { LOL_SPORT_SLUG } from '../../lol/data'

// Admin mínimo para probar el calendario LoL con datos reales.
// TODO: sustituir la comprobación role = 'ADMIN' por permisos granulares.
//
// Los puntos los calcula siempre la BD (score_lol_match / rescore_lol_edition,
// migración 20261014120002). Las RPC del motor se llaman con la sesión del
// admin: la BD vuelve a comprobar el rol con auth.uid() y la carga manual de
// votos queda registrada a su nombre.

type AdminResult = { success: true } | { error: string }

function _makeAdminClient() {
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  )
}

async function _requireAdmin(): Promise<string | null> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return 'Tu sesión ha caducado, vuelve a iniciar sesión.'
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'ADMIN') return 'Necesitas permisos de administrador.'
  return null
}

interface LolMatchRow {
  id: number
  home_team_id: number
  away_team_id: number
  metadata: unknown
  phases: {
    rulesets: { config: unknown } | null
    editions: { competitions: { sports: { slug: string } } }
  }
}

async function _loadLolMatch(admin: ReturnType<typeof _makeAdminClient>, matchId: number) {
  const { data, error } = await admin
    .from('matches')
    .select(`
      id, home_team_id, away_team_id, metadata,
      phases!inner ( rulesets (config), editions!inner ( competitions!inner ( sports!inner (slug) ) ) )
    `)
    .eq('id', matchId)
    .maybeSingle()
  if (error) console.error('[admin lol] load match', error)
  const match = data as unknown as LolMatchRow | null
  if (!match || match.phases.editions.competitions.sports.slug !== LOL_SPORT_SLUG) return null
  return match
}

function _revalidate() {
  revalidatePath('/')
  revalidatePath('/admin/lol')
  revalidatePath('/lol/clasificacion')
}

// Errores de validación del motor (22023 / 23505) traen un mensaje en
// castellano pensado para el admin; el resto se queda en los logs.
function _rpcError(context: string, error: { code?: string; message: string }, fallback: string): { error: string } {
  if (error.code === '22023' || error.code === '23505') return { error: error.message }
  if (error.code === '42501') return { error: 'Necesitas permisos de administrador.' }
  console.error(`[admin lol] ${context}`, error)
  return { error: fallback }
}

/** Puntúa la serie y las posteriores de su fase (la racha depende del orden). */
async function _scoreMatch(matchId: number): Promise<{ error: string } | null> {
  const supabase = await createClient()
  const { error } = await supabase.rpc('score_lol_match', { p_match_id: matchId })
  return error ? _rpcError('score_lol_match', error, 'No se han podido calcular los puntos. Vuelve a intentarlo.') : null
}

/** Guarda el resultado de la serie, marca el partido FINISHED y puntúa las predicciones. */
export async function setLolMatchResultAction(matchId: number, home: number, away: number): Promise<AdminResult> {
  const authError = await _requireAdmin()
  if (authError) return { error: authError }

  const admin = _makeAdminClient()
  const match = await _loadLolMatch(admin, matchId)
  if (!match) return { error: 'No se ha encontrado el partido de LoL.' }

  const config = match.phases.rulesets?.config
  const bestOf = resolveBestOf(match.metadata, config)
  const result = { home, away }
  if (outcomeIndex(bestOf, result) === -1) return { error: `${home}-${away} no es un resultado válido para un Bo${bestOf}.` }

  const { error: matchError } = await admin
    .from('matches')
    .update({
      home_goals: home,
      away_goals: away,
      winner_id: home > away ? match.home_team_id : match.away_team_id,
      status: 'FINISHED',
      updated_at: new Date().toISOString(),
    })
    .eq('id', matchId)
  if (matchError) {
    console.error('[admin lol] update match', matchError)
    return { error: 'No se ha podido guardar el resultado. Inténtalo de nuevo.' }
  }

  const scoreError = await _scoreMatch(matchId)
  _revalidate()
  if (scoreError) return { error: `Resultado guardado, pero no se han podido calcular los puntos. ${scoreError.error}` }
  return { success: true }
}

/** Reabre (PENDING) o cancela (CANCELLED) un partido, borrando resultado y puntos. */
export async function setLolMatchStatusAction(matchId: number, status: 'PENDING' | 'CANCELLED'): Promise<AdminResult> {
  const authError = await _requireAdmin()
  if (authError) return { error: authError }

  const admin = _makeAdminClient()
  const match = await _loadLolMatch(admin, matchId)
  if (!match) return { error: 'No se ha encontrado el partido de LoL.' }

  const { error: matchError } = await admin
    .from('matches')
    .update({ status, home_goals: null, away_goals: null, winner_id: null, updated_at: new Date().toISOString() })
    .eq('id', matchId)
  if (matchError) {
    console.error('[admin lol] update status', matchError)
    return { error: 'No se ha podido cambiar el estado. Inténtalo de nuevo.' }
  }

  // El motor deja esta serie a 0 y recalcula las posteriores de la fase.
  const scoreError = await _scoreMatch(matchId)
  _revalidate()
  if (scoreError) return { error: `Estado cambiado, pero no se han podido recalcular los puntos. ${scoreError.error}` }
  return { success: true }
}

/** Marca o desmarca el partido de la jornada (la BD valida plazo y unicidad). */
export async function setLolFeaturedMatchAction(matchId: number, featured: boolean): Promise<AdminResult> {
  const authError = await _requireAdmin()
  if (authError) return { error: authError }

  const supabase = await createClient()
  const { error } = await supabase.rpc('set_lol_featured_match', { p_match_id: matchId, p_featured: featured })
  if (error) return _rpcError('set_lol_featured_match', error, 'No se ha podido cambiar el partido de la jornada.')
  _revalidate()
  return { success: true }
}

/** Recalcula todos los puntos de una edición con el motor de la BD. */
export async function rescoreLolEditionAction(editionId: number): Promise<AdminResult & { changed?: number }> {
  const authError = await _requireAdmin()
  if (authError) return { error: authError }

  const supabase = await createClient()
  const { data, error } = await supabase.rpc('rescore_lol_edition', { p_edition_id: editionId })
  if (error) return _rpcError('rescore_lol_edition', error, 'No se ha podido recalcular la edición.')
  _revalidate()
  return { success: true, changed: Number(data ?? 0) }
}

export interface ManualVoteInput {
  userId: string
  matchId: number
  winnerTeamId: number
  home: number
  away: number
  reason: string
}

/**
 * Carga o corrige el voto de un usuario aunque la votación esté cerrada.
 * Queda auditado en lol_prediction_audit y, si la serie ya terminó, la BD
 * la vuelve a puntuar.
 */
export async function adminSetLolPredictionAction(input: ManualVoteInput): Promise<AdminResult> {
  const authError = await _requireAdmin()
  if (authError) return { error: authError }

  const supabase = await createClient()
  const { error } = await supabase.rpc('admin_set_lol_prediction', {
    p_user_id: input.userId,
    p_match_id: input.matchId,
    p_winner_team_id: input.winnerTeamId,
    p_home_score: input.home,
    p_away_score: input.away,
    p_reason: input.reason.trim() || null,
  })
  if (error) return _rpcError('admin_set_lol_prediction', error, 'No se ha podido guardar el voto.')
  _revalidate()
  return { success: true }
}
