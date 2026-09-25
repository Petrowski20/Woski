'use server'

import { createClient } from '@/utils/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { revalidatePath } from 'next/cache'
import { outcomeIndex, resolveBestOf, scoreSeriesPrediction } from '@/utils/lol/series'
import { LOL_SPORT_SLUG } from '../../lol/data'

// Admin mínimo para probar el calendario LoL con datos reales.
// TODO: sustituir la comprobación role = 'ADMIN' por permisos granulares.

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
  revalidatePath('/lol')
  revalidatePath('/admin/lol')
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

  const { data: preds, error: predsError } = await admin
    .from('predictions')
    .select('id, profile_id, match_id, pred_home_goals, pred_away_goals')
    .eq('match_id', matchId)
  if (predsError) {
    console.error('[admin lol] load predictions', predsError)
    return { error: 'Resultado guardado, pero no se han podido calcular los puntos. Vuelve a guardarlo.' }
  }

  if (preds?.length) {
    const rows = preds.map(p => {
      const s = scoreSeriesPrediction(config, { home: p.pred_home_goals, away: p.pred_away_goals }, result)
      return {
        ...p,
        points_earned: s.points,
        is_correct_winner: s.correctWinner,
        is_correct_score: s.correctScore,
      }
    })
    const { error: scoreError } = await admin.from('predictions').upsert(rows, { onConflict: 'id' })
    if (scoreError) {
      console.error('[admin lol] score predictions', scoreError)
      return { error: 'Resultado guardado, pero no se han podido calcular los puntos. Vuelve a guardarlo.' }
    }
  }

  _revalidate()
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

  const { error: resetError } = await admin
    .from('predictions')
    .update({ points_earned: 0, is_correct_winner: null, is_correct_score: null })
    .eq('match_id', matchId)
  if (resetError) {
    console.error('[admin lol] reset points', resetError)
    return { error: 'Estado cambiado, pero no se han podido reiniciar los puntos. Inténtalo de nuevo.' }
  }

  _revalidate()
  return { success: true }
}
