'use client'

import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { adminSetLolPredictionAction } from '@/app/(main)/admin/lol/actions'
import { isPredictionLocked, seriesOutcomes, type SeriesScore } from '@/utils/lol/series'
import type { LolMatchView } from '@/utils/lol/types'
import { formatMatchDate, formatSeriesScore } from './format'

// Pestaña Predicciones de /admin (LoL). Solo presenta lo que devuelve la BD
// (admin_lol_match_votes, lol_prediction_audit) y guarda con
// admin_set_lol_prediction, que comprueba ADMIN, valida, audita y repuntúa.

export interface VoteRow {
  profileId: string
  nickname: string
  hidden: boolean
  vote: SeriesScore | null
  savedAt: string | null
  adminEntered: boolean
  points: number | null
}

export interface AuditRow {
  id: number
  at: string
  series: string
  matchId: number
  player: string
  actor: string
  before: string
  after: string
  reason: string | null
}

const fieldClass = 'text-sm bg-bg-muted border border-border rounded-md px-2 py-1.5 text-text-primary min-w-0'
const btn = 'px-3 py-1.5 rounded-md text-xs font-semibold disabled:opacity-50'
const btnPrimary = `${btn} bg-accent bg-accent-gradient text-on-accent shadow-glow-accent disabled:shadow-none`
const btnPlain = `${btn} border border-border text-text-primary hover:border-accent/50 hover:text-accent`

const timeFmt = new Intl.DateTimeFormat('es-ES', {
  day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', second: '2-digit', timeZone: 'Europe/Madrid',
})

/** Formulario de un voto (añadir o corregir) para un jugador concreto o elegible. */
function VoteForm({
  match,
  profileId,
  players,
  initial,
  onDone,
}: {
  match: LolMatchView
  /** Jugador fijo; si falta, se elige de `players`. */
  profileId?: string
  players?: { id: string; nickname: string }[]
  initial?: SeriesScore | null
  onDone: () => void
}) {
  const [userId, setUserId] = useState(profileId ?? '')
  const [score, setScore] = useState(initial ? `${initial.home}-${initial.away}` : '')
  const [reason, setReason] = useState('')
  const [isPending, startTransition] = useTransition()
  const outcomes = seriesOutcomes(match.bestOf)

  const submit = () => {
    if (!userId || !score) return
    const [home, away] = score.split('-').map(Number)
    startTransition(async () => {
      try {
        const res = await adminSetLolPredictionAction({
          userId,
          matchId: match.id,
          winnerTeamId: home > away ? match.home.id : match.away.id,
          home,
          away,
          reason,
        })
        if ('error' in res) toast.error(res.error)
        else {
          toast.success('Voto guardado y registrado')
          onDone()
        }
      } catch {
        toast.error('No hemos podido conectar con el servidor. Inténtalo de nuevo.')
      }
    })
  }

  const unchanged = initial ? score === `${initial.home}-${initial.away}` : false

  return (
    <div className="grid grid-cols-1 sm:grid-cols-[auto_auto_minmax(0,1fr)_auto] items-end gap-2 rounded-lg bg-bg-muted/60 p-3">
      {!profileId && (
        <label className="flex flex-col gap-1 text-xs text-text-muted min-w-0">
          Jugador
          <select className={fieldClass} value={userId} onChange={e => setUserId(e.target.value)} disabled={isPending}>
            <option value="">Elige jugador…</option>
            {players?.map(p => <option key={p.id} value={p.id}>{p.nickname}</option>)}
          </select>
        </label>
      )}
      <label className="flex flex-col gap-1 text-xs text-text-muted min-w-0">
        Voto
        <select className={fieldClass} value={score} onChange={e => setScore(e.target.value)} disabled={isPending}>
          <option value="">Elige resultado…</option>
          {outcomes.map(o => (
            <option key={`${o.home}-${o.away}`} value={`${o.home}-${o.away}`}>
              {formatSeriesScore(o, match.home.tag, match.away.tag)}
            </option>
          ))}
        </select>
      </label>
      <label className={`flex flex-col gap-1 text-xs text-text-muted min-w-0 ${profileId ? 'sm:col-span-2' : ''}`}>
        Motivo (opcional)
        <input
          className={fieldClass}
          value={reason}
          onChange={e => setReason(e.target.value)}
          maxLength={200}
          placeholder="p. ej. me lo pasó por WhatsApp antes del partido"
          disabled={isPending}
        />
      </label>
      <div className="flex gap-2">
        <button type="button" onClick={submit} disabled={isPending || !userId || !score || unchanged} className={btnPrimary}>
          {isPending ? 'Guardando…' : 'Guardar'}
        </button>
        <button type="button" onClick={onDone} disabled={isPending} className={btnPlain}>Cerrar</button>
      </div>
    </div>
  )
}

function VoteItem({ row, match, editing, onEdit, onDone }: {
  row: VoteRow
  match: LolMatchView
  editing: boolean
  onEdit: () => void
  onDone: () => void
}) {
  return (
    <li className="py-2.5 flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="font-semibold text-text-primary min-w-0 break-all">{row.nickname}</span>
        {row.hidden && <span className="px-1.5 py-0.5 rounded-full text-[11px] bg-bg-muted ring-1 ring-inset ring-border text-text-muted">oculto</span>}
        {row.adminEntered && <span className="px-1.5 py-0.5 rounded-full text-[11px] bg-warning/10 text-warning ring-1 ring-inset ring-warning/30" title="Cargado o corregido por un admin">a mano</span>}
        <span className="ml-auto flex items-center gap-3">
          {row.vote ? (
            <strong className="text-sm text-text-primary tabular-nums">{formatSeriesScore(row.vote, match.home.tag, match.away.tag)}</strong>
          ) : (
            <span className="text-sm text-danger">Sin voto</span>
          )}
          {match.status === 'FINISHED' && row.vote && (
            <span className="text-xs font-bold tabular-nums text-accent">{row.points ?? 0} pts</span>
          )}
          <button type="button" onClick={onEdit} className={btnPlain} aria-expanded={editing}>
            {row.vote ? 'Editar' : 'Añadir'}
          </button>
        </span>
      </div>
      {row.savedAt && (
        <p className="text-xs text-text-muted -mt-1">
          Guardado <time dateTime={row.savedAt}>{timeFmt.format(new Date(row.savedAt))}</time>
        </p>
      )}
      {editing && <VoteForm match={match} profileId={row.profileId} initial={row.vote} onDone={onDone} />}
    </li>
  )
}

export default function AdminLolPredictions({
  match,
  votes,
  players,
  audit,
}: {
  match: LolMatchView
  votes: VoteRow[]
  players: { id: string; nickname: string }[]
  audit: AuditRow[]
}) {
  const [editing, setEditing] = useState<string | null>(null)
  const [addingOther, setAddingOther] = useState(false)
  const [onlySeries, setOnlySeries] = useState(true)
  const [now] = useState(() => Date.now())

  const voted = votes.filter(v => v.vote)
  const missing = votes.filter(v => !v.vote)
  const listed = new Set(votes.map(v => v.profileId))
  const others = players.filter(p => !listed.has(p.id))
  const open = !isPredictionLocked(match.status, match.locksAt, now)
  const shownAudit = onlySeries ? audit.filter(a => a.matchId === match.id) : audit

  const item = (row: VoteRow) => (
    <VoteItem
      key={row.profileId}
      row={row}
      match={match}
      editing={editing === row.profileId}
      onEdit={() => setEditing(editing === row.profileId ? null : row.profileId)}
      onDone={() => setEditing(null)}
    />
  )

  return (
    <>
      <section className="bg-bg-elevated border border-border rounded-card shadow-card p-4 flex flex-col gap-3">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <h2 className="heading-display font-bold text-text-primary">
              {match.home.name} <span className="text-text-muted font-normal">vs</span> {match.away.name}
            </h2>
            <p className="text-xs text-text-muted">
              <span className="capitalize">{formatMatchDate(match.date)}</span> · {match.phaseName} · Bo{match.bestOf}
              {match.result && <> · Resultado <strong className="text-text-primary">{formatSeriesScore(match.result, match.home.tag, match.away.tag)}</strong></>}
            </p>
          </div>
          <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ring-1 ring-inset ${open ? 'bg-success/10 text-success ring-success/30' : 'bg-bg-muted text-text-muted ring-border'}`}>
            {open ? 'Votación abierta' : 'Votación cerrada'}
          </span>
        </div>

        <p className="text-sm text-text-primary">
          <strong>{voted.length}</strong> han votado · faltan <strong>{missing.length}</strong>
        </p>

        {votes.length === 0 ? (
          <p className="text-sm text-text-muted">Aún no hay participantes en esta edición.</p>
        ) : (
          <ul className="flex flex-col divide-y divide-border border-t border-border">
            {voted.map(item)}
            {missing.map(item)}
          </ul>
        )}

        <div className="border-t border-border pt-3 flex flex-col gap-2">
          {addingOther ? (
            <VoteForm match={match} players={others} onDone={() => setAddingOther(false)} />
          ) : (
            <button type="button" onClick={() => setAddingOther(true)} disabled={others.length === 0} className={`${btnPlain} self-start`}>
              Añadir voto a otro jugador
            </button>
          )}
          <p className="text-[11px] text-text-muted">
            La lista incluye a quien participa en la edición (sin ocultos) y a cualquiera que ya tenga voto en la serie.
            &quot;Otro jugador&quot; es para quien todavía no ha participado.
          </p>
        </div>
      </section>

      <section className="bg-bg-elevated border border-border rounded-card shadow-card p-4 flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="heading-display font-bold text-text-primary">Registro de cambios de votos</h2>
          <label className="inline-flex items-center gap-1.5 text-xs text-text-primary">
            <input type="checkbox" checked={onlySeries} onChange={e => setOnlySeries(e.target.checked)} />
            Solo esta serie
          </label>
        </div>
        {shownAudit.length === 0 ? (
          <p className="text-sm text-text-muted">
            {onlySeries ? 'Ningún voto de esta serie se ha cargado ni corregido a mano.' : 'Ningún voto de esta edición se ha cargado ni corregido a mano.'}
          </p>
        ) : (
          <ul className="flex flex-col divide-y divide-border text-sm">
            {shownAudit.map(a => (
              <li key={a.id} className="py-2 flex flex-col gap-0.5">
                <p className="text-text-primary">
                  <strong>{a.player}</strong>: {a.before} → <strong>{a.after}</strong>
                  {!onlySeries && <span className="text-text-muted"> · {a.series}</span>}
                </p>
                <p className="text-xs text-text-muted">
                  <time dateTime={a.at}>{timeFmt.format(new Date(a.at))}</time> · por {a.actor}
                  {a.reason && <> · “{a.reason}”</>}
                </p>
              </li>
            ))}
          </ul>
        )}
        <p className="text-[11px] text-text-muted">Últimos 100 cambios de la edición. El registro no se puede borrar ni editar.</p>
      </section>
    </>
  )
}
