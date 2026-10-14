'use server'

import { createClient } from '@/utils/supabase/server'
import { revalidatePath } from 'next/cache'

// Centro de operaciones LoL. Cada acción:
// 1. comprueba en el servidor que la sesión es ADMIN (_requireAdmin), y
// 2. llama a una función SQL admin_* con la sesión del admin, que vuelve a
//    comprobar el rol con auth.uid(), valida, escribe, recalcula puntos con el
//    motor si hace falta y deja registro en lol_admin_audit (o
//    lol_prediction_audit para votos cargados a mano).
// Aquí no se escribe en tablas ni se calculan puntos.

type AdminResult = { success: true } | { error: string }

async function _requireAdmin(): Promise<string | null> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return 'Tu sesión ha caducado, vuelve a iniciar sesión.'
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'ADMIN') return 'Necesitas permisos de administrador.'
  return null
}

function _revalidate() {
  revalidatePath('/')
  revalidatePath('/admin/lol')
  revalidatePath('/lol/clasificacion')
}

// Errores de validación de la BD (22023 / 23505 / 55000) traen un mensaje en
// castellano pensado para el admin; el resto se queda en los logs.
function _rpcError(context: string, error: { code?: string; message: string }, fallback: string): { error: string } {
  if (error.code === '22023' || error.code === '23505' || error.code === '55000') return { error: error.message }
  if (error.code === '42501') return { error: 'Necesitas permisos de administrador.' }
  console.error(`[admin lol] ${context}`, error)
  return { error: fallback }
}

/**
 * "2026-10-17T20:00" (hora de Madrid, del <input type="datetime-local">) →
 * literal timestamptz con zona. Postgres lo pasa a UTC teniendo en cuenta el
 * cambio de hora; null si el formato no es válido.
 */
function _madridTimestamp(local: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(local)) return null
  return `${local.replace('T', ' ')}:00 Europe/Madrid`
}

// ── Resultado, estado, partido de la jornada, recálculo ───────────────────

/** Guarda el resultado (FINISHED); la BD valida el marcador y puntúa. */
export async function setLolMatchResultAction(matchId: number, home: number, away: number): Promise<AdminResult> {
  const authError = await _requireAdmin()
  if (authError) return { error: authError }

  const supabase = await createClient()
  const { error } = await supabase.rpc('admin_set_lol_match_result', { p_match_id: matchId, p_home: home, p_away: away })
  if (error) return _rpcError('admin_set_lol_match_result', error, 'No se ha podido guardar el resultado. Inténtalo de nuevo.')
  _revalidate()
  return { success: true }
}

/** Reabre (PENDING) o cancela (CANCELLED, nunca se borra) una serie. */
export async function setLolMatchStatusAction(matchId: number, status: 'PENDING' | 'CANCELLED'): Promise<AdminResult> {
  const authError = await _requireAdmin()
  if (authError) return { error: authError }

  const supabase = await createClient()
  const { error } = await supabase.rpc('admin_set_lol_match_status', { p_match_id: matchId, p_status: status })
  if (error) return _rpcError('admin_set_lol_match_status', error, 'No se ha podido cambiar el estado. Inténtalo de nuevo.')
  _revalidate()
  return { success: true }
}

/** Marca o desmarca el partido de la jornada (la BD valida plazo y unicidad). */
export async function setLolFeaturedMatchAction(matchId: number, featured: boolean): Promise<AdminResult> {
  const authError = await _requireAdmin()
  if (authError) return { error: authError }

  const supabase = await createClient()
  const { error } = await supabase.rpc('admin_set_lol_featured_match', { p_match_id: matchId, p_featured: featured })
  if (error) return _rpcError('admin_set_lol_featured_match', error, 'No se ha podido cambiar el partido de la jornada.')
  _revalidate()
  return { success: true }
}

/** Recalcula todos los puntos de una edición con el motor de la BD. */
export async function rescoreLolEditionAction(editionId: number): Promise<AdminResult & { changed?: number }> {
  const authError = await _requireAdmin()
  if (authError) return { error: authError }

  const supabase = await createClient()
  const { data, error } = await supabase.rpc('admin_rescore_lol_edition', { p_edition_id: editionId })
  if (error) return _rpcError('admin_rescore_lol_edition', error, 'No se ha podido recalcular la edición.')
  _revalidate()
  return { success: true, changed: Number(data ?? 0) }
}

// ── Crear / editar series ─────────────────────────────────────────────────

export interface CreateMatchInput {
  phaseId: number
  homeTag: string
  awayTag: string
  /** "YYYY-MM-DDTHH:mm" en hora de Madrid. */
  localDateTime: string
  bestOf: number
  featured: boolean
}

export async function createLolMatchAction(
  input: CreateMatchInput,
): Promise<{ success: true; warnings: string[] } | { error: string }> {
  const authError = await _requireAdmin()
  if (authError) return { error: authError }

  const matchDate = _madridTimestamp(input.localDateTime)
  if (!matchDate) return { error: 'Indica la fecha y la hora de inicio.' }

  const supabase = await createClient()
  const { data, error } = await supabase.rpc('admin_create_lol_match', {
    p_phase_id: input.phaseId,
    p_home_tag: input.homeTag,
    p_away_tag: input.awayTag,
    p_match_date: matchDate,
    p_best_of: input.bestOf,
    p_featured: input.featured,
  })
  if (error) return _rpcError('admin_create_lol_match', error, 'No se ha podido crear la serie. Inténtalo de nuevo.')
  _revalidate()
  return { success: true, warnings: ((data as { warnings?: string[] } | null)?.warnings ?? []) }
}

export interface UpdateMatchInput {
  matchId: number
  /** "YYYY-MM-DDTHH:mm" en hora de Madrid, o null para no cambiarla. */
  localDateTime: string | null
  bestOf: number | null
  /** Confirmación explícita para cambiar la hora de una serie con votos. */
  confirm: boolean
}

/**
 * Cambia fecha y/o formato de una serie con la votación abierta. Si ya tiene
 * votos y no viene confirmada devuelve needsConfirm para que la interfaz pida
 * confirmación (la BD responde 55000).
 */
export async function updateLolMatchAction(
  input: UpdateMatchInput,
): Promise<{ success: true } | { error: string; needsConfirm?: boolean }> {
  const authError = await _requireAdmin()
  if (authError) return { error: authError }

  const matchDate = input.localDateTime ? _madridTimestamp(input.localDateTime) : null
  if (input.localDateTime && !matchDate) return { error: 'La fecha y hora no son válidas.' }

  const supabase = await createClient()
  const { error } = await supabase.rpc('admin_update_lol_match', {
    p_match_id: input.matchId,
    p_match_date: matchDate,
    p_best_of: input.bestOf,
    p_confirm: input.confirm,
  })
  if (error) {
    if (error.code === '55000') return { error: error.message, needsConfirm: true }
    return _rpcError('admin_update_lol_match', error, 'No se ha podido editar la serie. Inténtalo de nuevo.')
  }
  _revalidate()
  return { success: true }
}

// ── Participación ─────────────────────────────────────────────────────────

export interface ParticipationRow {
  nickname: string
  hasVoted: boolean
}

/** Quién ha votado una serie (sí/no). Nunca el voto. */
export async function getLolMatchParticipationAction(
  matchId: number,
): Promise<{ success: true; rows: ParticipationRow[] } | { error: string }> {
  const authError = await _requireAdmin()
  if (authError) return { error: authError }

  const supabase = await createClient()
  const { data, error } = await supabase.rpc('admin_lol_match_participation', { p_match_id: matchId })
  if (error) return _rpcError('admin_lol_match_participation', error, 'No se ha podido cargar la participación.')
  const rows = ((data ?? []) as { nickname: string; has_voted: boolean }[]).map(r => ({
    nickname: r.nickname,
    hasVoted: r.has_voted,
  }))
  return { success: true, rows }
}

// ── Votos a mano ──────────────────────────────────────────────────────────

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
