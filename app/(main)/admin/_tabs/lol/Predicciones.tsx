import { createClient } from '@/utils/supabase/server'
import AdminLolFilters from '@/components/lol/AdminLolFilters'
import AdminLolPredictions, { type AuditRow, type VoteRow } from '@/components/lol/AdminLolPredictions'
import { formatMatchDate, formatSeriesScore } from '@/components/lol/format'
import { isPredictionLocked } from '@/utils/lol/series'
import type { LolMatchView } from '@/utils/lol/types'
import { getEditionMatches, getLolEditions, lolToday } from '../../../lol/data'
import { editionOptions, pickAdminEdition } from './shared'

// LoL · Predicciones (antes "Cargar voto a mano" en /admin/lol): por serie,
// quién ha votado y qué (admin_lol_match_votes), añadir o corregir votos con
// admin_set_lol_prediction (auditado) y el registro lol_prediction_audit.

const STATUS_LABEL: Record<LolMatchView['status'], string> = {
  PENDING: 'pendiente',
  IN_PROGRESS: 'en juego',
  FINISHED: 'finalizada',
  CANCELLED: 'cancelada',
}

/** Serie por defecto: la próxima con la votación abierta; si no hay, la última empezada. */
function defaultSeries(matches: LolMatchView[], now: number): LolMatchView | null {
  const open = matches.find(m => !isPredictionLocked(m.status, m.locksAt, now))
  if (open) return open
  const started = matches.filter(m => new Date(m.date).getTime() <= now)
  return started[started.length - 1] ?? matches[0] ?? null
}

interface RawVote {
  profile_id: string
  nickname: string
  is_hidden: boolean
  has_voted: boolean
  pred_home: number | null
  pred_away: number | null
  saved_at: string | null
  admin_entered: boolean
  points_earned: number | null
}

interface RawAudit {
  id: number
  created_at: string
  profile_id: string
  match_id: number
  actor_id: string | null
  actor_kind: 'admin' | 'sql'
  old_home_goals: number | null
  old_away_goals: number | null
  new_home_goals: number
  new_away_goals: number
  reason: string | null
}

export default async function LolPrediccionesTab({
  userId,
  edicion,
  serie,
}: {
  userId: string
  edicion: string | null
  serie: string | null
}) {
  const supabase = await createClient()
  const today = lolToday()
  const editions = await getLolEditions(supabase)
  const edition = pickAdminEdition(editions, edicion, today)
  if (!edition) return <p className="text-sm text-text-muted">No hay ediciones de LoL.</p>

  const all = await getEditionMatches(supabase, edition.id, userId)
  // admin_set_lol_prediction no admite series canceladas.
  const matches = all.filter(m => m.status !== 'CANCELLED')
  const now = Date.now()
  const match = matches.find(m => String(m.id) === serie) ?? defaultSeries(matches, now)

  const [votesRes, playersRes, auditRes] = await Promise.all([
    match ? supabase.rpc('admin_lol_match_votes', { p_match_id: match.id }) : Promise.resolve({ data: [], error: null }),
    supabase.from('profiles').select('id, nickname').order('nickname'),
    all.length
      ? supabase
          .from('lol_prediction_audit')
          .select('id, created_at, profile_id, match_id, actor_id, actor_kind, old_home_goals, old_away_goals, new_home_goals, new_away_goals, reason')
          .in('match_id', all.map(m => m.id))
          .order('id', { ascending: false })
          .limit(100)
      : Promise.resolve({ data: [], error: null }),
  ])
  if (votesRes.error) console.error('[admin lol] match votes', votesRes.error)
  if (playersRes.error) console.error('[admin lol] players', playersRes.error)
  if (auditRes.error) console.error('[admin lol] prediction audit', auditRes.error)

  const players = (playersRes.data ?? []) as { id: string; nickname: string }[]
  const nick = new Map(players.map(p => [p.id, p.nickname]))
  const byId = new Map(all.map(m => [m.id, m]))

  const votes: VoteRow[] = ((votesRes.data ?? []) as RawVote[]).map(v => ({
    profileId: v.profile_id,
    nickname: v.nickname,
    hidden: v.is_hidden,
    vote: v.has_voted && v.pred_home !== null && v.pred_away !== null ? { home: v.pred_home, away: v.pred_away } : null,
    savedAt: v.saved_at,
    adminEntered: v.admin_entered,
    points: v.points_earned,
  }))

  const score = (m: LolMatchView | undefined, home: number | null, away: number | null) =>
    m && home !== null && away !== null ? formatSeriesScore({ home, away }, m.home.tag, m.away.tag) : '—'
  const audit: AuditRow[] = ((auditRes.data ?? []) as RawAudit[]).map(a => {
    const m = byId.get(a.match_id)
    return {
      id: a.id,
      at: a.created_at,
      series: m ? `${m.home.tag} vs ${m.away.tag} · ${formatMatchDate(m.date)}` : `Serie ${a.match_id}`,
      matchId: a.match_id,
      player: nick.get(a.profile_id) ?? 'usuario borrado',
      actor: a.actor_kind === 'sql' ? 'SQL Editor' : (a.actor_id && nick.get(a.actor_id)) || 'admin',
      before: score(m, a.old_home_goals, a.old_away_goals),
      after: score(m, a.new_home_goals, a.new_away_goals),
      reason: a.reason,
    }
  })

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="heading-display text-xl font-bold text-text-primary">Predicciones</h1>
        <p className="text-sm text-text-muted">
          Votos de cada serie. Puedes añadir o corregir un voto aunque la votación esté cerrada: queda registrado quién lo
          cambió, cuándo y el voto anterior, y si la serie ya terminó se recalculan los puntos.
        </p>
      </div>

      <AdminLolFilters
        tab="predicciones"
        fields={[
          { name: 'edicion', label: 'Edición', value: String(edition.id), options: editionOptions(editions, today), resets: ['serie'] },
          {
            name: 'serie',
            label: 'Serie',
            value: match ? String(match.id) : '',
            options: matches.length
              ? matches.map(m => ({
                  value: String(m.id),
                  label: `${formatMatchDate(m.date)} · ${m.home.tag} vs ${m.away.tag} · ${STATUS_LABEL[m.status]}`,
                  group: m.phaseName,
                }))
              : [{ value: '', label: 'Sin series' }],
          },
        ]}
      />

      {match ? (
        votesRes.error ? (
          <p role="alert" className="rounded-lg bg-danger/10 px-4 py-3 text-sm text-text-primary">
            No se han podido cargar los votos. ¿Está aplicada la migración 20261018100001_admin_lol_match_votes?
          </p>
        ) : (
          <AdminLolPredictions key={match.id} match={match} votes={votes} players={players} audit={audit} />
        )
      ) : (
        <p className="text-sm text-text-muted">Esta edición no tiene series.</p>
      )}
    </div>
  )
}
