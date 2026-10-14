'use client'

import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import {
  getLolMatchParticipationAction,
  rescoreLolEditionAction,
  setLolFeaturedMatchAction,
  setLolMatchResultAction,
  setLolMatchStatusAction,
  updateLolMatchAction,
  type ParticipationRow,
} from '@/app/(main)/admin/lol/actions'
import { isPredictionLocked, seriesOutcomes } from '@/utils/lol/series'
import type { LolMatchView } from '@/utils/lol/types'
import { formatMatchDate, formatSeriesScore, toMadridInputValue } from './format'

type ActionResult = { success: true } | { error: string }

const fieldClass = 'text-sm bg-bg-muted border border-border rounded-md px-2 py-1 text-text-primary min-w-0'
const btn = 'px-3 py-1 rounded-md text-xs font-semibold disabled:opacity-50'
const btnPlain = `${btn} border border-border text-text-primary`

const STATUS_LABEL: Record<LolMatchView['status'], string> = {
  PENDING: 'Pendiente',
  IN_PROGRESS: 'En juego',
  FINISHED: 'Finalizada',
  CANCELLED: 'Cancelada',
}

// ── Editar fecha / formato ────────────────────────────────────────────────

function EditPanel({ match, onDone }: { match: LolMatchView; onDone: () => void }) {
  const [localDateTime, setLocalDateTime] = useState(() => toMadridInputValue(match.date))
  const [bestOf, setBestOf] = useState<number>(match.bestOf)
  const [confirmMsg, setConfirmMsg] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const dateChanged = localDateTime !== toMadridInputValue(match.date)
  const boChanged = bestOf !== match.bestOf

  const save = (confirm: boolean) => {
    startTransition(async () => {
      try {
        const res = await updateLolMatchAction({
          matchId: match.id,
          localDateTime: dateChanged ? localDateTime : null,
          bestOf: boChanged ? bestOf : null,
          confirm,
        })
        if ('error' in res) {
          if (res.needsConfirm) setConfirmMsg(res.error)
          else toast.error(res.error)
          return
        }
        toast.success('Serie actualizada')
        onDone()
      } catch {
        toast.error('No hemos podido conectar con el servidor. Inténtalo de nuevo.')
      }
    })
  }

  return (
    <div className="flex flex-col gap-2 rounded-lg bg-bg-muted/60 p-3">
      <div className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1 text-xs text-text-muted">
          Inicio (Madrid)
          <input type="datetime-local" className={fieldClass} value={localDateTime}
                 onChange={e => { setLocalDateTime(e.target.value); setConfirmMsg(null) }} disabled={isPending} />
        </label>
        <label className="flex flex-col gap-1 text-xs text-text-muted">
          Formato
          <select className={fieldClass} value={bestOf} onChange={e => { setBestOf(Number(e.target.value)); setConfirmMsg(null) }} disabled={isPending}>
            {[1, 3, 5].map(n => <option key={n} value={n}>Bo{n}</option>)}
          </select>
        </label>
        <button type="button" onClick={() => save(false)} disabled={isPending || (!dateChanged && !boChanged)}
                className={`${btn} bg-accent text-on-accent`}>
          {isPending ? 'Guardando…' : 'Guardar cambios'}
        </button>
        <button type="button" onClick={onDone} disabled={isPending} className={btnPlain}>Cerrar</button>
      </div>
      {confirmMsg && (
        <div role="alert" className="flex flex-wrap items-center gap-2 rounded-md bg-warning/10 px-3 py-2 text-xs text-text-primary">
          <span className="flex-1">{confirmMsg}</span>
          <button type="button" onClick={() => save(true)} disabled={isPending} className={`${btn} bg-warning text-on-accent`}>
            Confirmar cambio de hora
          </button>
        </div>
      )}
    </div>
  )
}

// ── Participación ─────────────────────────────────────────────────────────

function ParticipationPanel({ match, rows }: { match: LolMatchView; rows: ParticipationRow[] }) {
  const missing = rows.filter(r => !r.hasVoted)
  const voted = rows.length - missing.length

  const copyMissing = async () => {
    const text = [
      `Faltan por votar ${match.home.tag} vs ${match.away.tag} (${formatMatchDate(match.date)}):`,
      ...missing.map(r => `- ${r.nickname}`),
    ].join('\n')
    try {
      await navigator.clipboard.writeText(text)
      toast.success('Lista copiada')
    } catch {
      toast.error('No se ha podido copiar. Selecciona el texto a mano.')
    }
  }

  return (
    <div className="flex flex-col gap-2 rounded-lg bg-bg-muted/60 p-3 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-text-primary">
          <strong>{voted}</strong>/{rows.length} han votado · faltan <strong>{missing.length}</strong>
        </span>
        <button type="button" onClick={copyMissing} disabled={missing.length === 0} className={btnPlain}>
          Copiar lista de quienes faltan
        </button>
      </div>
      {rows.length === 0 ? (
        <p className="text-xs text-text-muted">Aún no hay participantes en esta edición.</p>
      ) : (
        <ul className="flex flex-wrap gap-1.5">
          {rows.map(r => (
            <li key={r.nickname}
                className={`px-2 py-0.5 rounded-full text-xs ${r.hasVoted ? 'bg-success/10 text-success' : 'bg-danger/10 text-danger'}`}>
              {r.hasVoted ? '✓' : '✗'} {r.nickname}
            </li>
          ))}
        </ul>
      )}
      <p className="text-[11px] text-text-muted">Solo se muestra si ha votado, nunca qué ha votado. Sin usuarios ocultos.</p>
    </div>
  )
}

// ── Tarjeta de una serie ──────────────────────────────────────────────────

function AdminMatchCard({ match, now }: { match: LolMatchView; now: number }) {
  const outcomes = seriesOutcomes(match.bestOf)
  const [value, setValue] = useState(match.result ? `${match.result.home}-${match.result.away}` : '')
  const [panel, setPanel] = useState<'edit' | 'participation' | 'cancel' | null>(null)
  const [participation, setParticipation] = useState<ParticipationRow[] | null>(null)
  const [isPending, startTransition] = useTransition()

  // Con la votación abierta (la BD lo vuelve a comprobar): editar y partido
  // de la jornada.
  const votingOpen = !isPredictionLocked(match.status, match.locksAt, now)

  const run = (fn: () => Promise<ActionResult>, okMsg: string, after?: () => void) => {
    startTransition(async () => {
      try {
        const res = await fn()
        if ('error' in res) toast.error(res.error)
        else {
          toast.success(okMsg)
          after?.()
        }
      } catch {
        toast.error('No hemos podido conectar con el servidor. Inténtalo de nuevo.')
      }
    })
  }

  const toggleParticipation = () => {
    if (panel === 'participation') {
      setPanel(null)
      return
    }
    startTransition(async () => {
      try {
        const res = await getLolMatchParticipationAction(match.id)
        if ('error' in res) toast.error(res.error)
        else {
          setParticipation(res.rows)
          setPanel('participation')
        }
      } catch {
        toast.error('No hemos podido conectar con el servidor. Inténtalo de nuevo.')
      }
    })
  }

  const saveResult = () => {
    const [home, away] = value.split('-').map(Number)
    run(() => setLolMatchResultAction(match.id, home, away), 'Resultado guardado y puntos calculados')
  }

  return (
    <li className="border-t border-border py-3 flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-text-muted">
        <span className="capitalize">{formatMatchDate(match.date)}</span>
        <span aria-hidden>·</span>
        <span>{match.phaseName} · Bo{match.bestOf}</span>
        <span className="px-2 py-0.5 rounded-full bg-bg-muted font-semibold">{STATUS_LABEL[match.status]}</span>
        {match.featured && <span className="text-warning font-semibold">⭐ Partido de la jornada</span>}
      </div>

      <p className="text-sm font-semibold text-text-primary">
        {match.home.name} <span className="text-text-muted font-normal">vs</span> {match.away.name}
      </p>

      <div className="flex flex-wrap items-center gap-2">
        {match.status !== 'CANCELLED' && (
          <>
            <select value={value} onChange={e => setValue(e.target.value)} disabled={isPending} className={fieldClass}>
              <option value="">Resultado…</option>
              {outcomes.map(o => (
                <option key={`${o.home}-${o.away}`} value={`${o.home}-${o.away}`}>
                  {o.home}-{o.away} ({formatSeriesScore(o, match.home.tag, match.away.tag)})
                </option>
              ))}
            </select>
            <button type="button" onClick={saveResult} disabled={isPending || !value} className={`${btn} bg-accent text-on-accent`}>
              Guardar resultado
            </button>
          </>
        )}
        {votingOpen && (
          <button type="button" onClick={() => setPanel(panel === 'edit' ? null : 'edit')} disabled={isPending} className={btnPlain}>
            Editar
          </button>
        )}
        {match.status !== 'CANCELLED' && (
          <button type="button" onClick={toggleParticipation} disabled={isPending} className={btnPlain}>
            Participación
          </button>
        )}
        <label
          className={`inline-flex items-center gap-1.5 text-xs ${votingOpen ? 'text-text-primary' : 'text-text-muted'}`}
          title={votingOpen ? 'Partido de la jornada (+2 al acertar el ganador)' : 'Solo se cambia mientras la votación está abierta'}
        >
          <input
            type="checkbox"
            checked={match.featured}
            disabled={!votingOpen || isPending}
            onChange={e => {
              const featured = e.target.checked
              run(() => setLolFeaturedMatchAction(match.id, featured), featured ? 'Partido de la jornada marcado' : 'Partido de la jornada desmarcado')
            }}
          />
          ⭐ Jornada
        </label>
        {match.status !== 'PENDING' && (
          <button type="button" onClick={() => run(() => setLolMatchStatusAction(match.id, 'PENDING'), 'Serie reabierta')}
                  disabled={isPending} className={btnPlain}>
            Reabrir
          </button>
        )}
        {match.status !== 'CANCELLED' && (
          <button type="button" onClick={() => setPanel(panel === 'cancel' ? null : 'cancel')} disabled={isPending}
                  className={`${btn} text-danger border border-danger/40`}>
            Cancelar
          </button>
        )}
      </div>

      {panel === 'cancel' && (
        <div role="alert" className="flex flex-wrap items-center gap-2 rounded-lg bg-danger/10 px-3 py-2 text-xs text-text-primary">
          <span className="flex-1">
            ¿Cancelar {match.home.tag} vs {match.away.tag}? No se borra: queda cancelada, sin resultado ni puntos, y se recalculan las rachas.
          </span>
          <button type="button" disabled={isPending} className={`${btn} bg-danger text-on-accent`}
                  onClick={() => run(() => setLolMatchStatusAction(match.id, 'CANCELLED'), 'Serie cancelada', () => setPanel(null))}>
            Sí, cancelar
          </button>
          <button type="button" onClick={() => setPanel(null)} disabled={isPending} className={btnPlain}>No</button>
        </div>
      )}
      {panel === 'edit' && <EditPanel match={match} onDone={() => setPanel(null)} />}
      {panel === 'participation' && participation && <ParticipationPanel match={match} rows={participation} />}
    </li>
  )
}

function RescoreButton({ editionId }: { editionId: number }) {
  const [isPending, startTransition] = useTransition()
  return (
    <button
      type="button"
      disabled={isPending}
      onClick={() => startTransition(async () => {
        try {
          const res = await rescoreLolEditionAction(editionId)
          if ('error' in res) toast.error(res.error)
          else toast.success(`Edición recalculada (${res.changed ?? 0} predicciones cambiadas)`)
        } catch {
          toast.error('No hemos podido conectar con el servidor. Inténtalo de nuevo.')
        }
      })}
      className={btnPlain}
    >
      {isPending ? 'Recalculando…' : 'Recalcular edición'}
    </button>
  )
}

export default function AdminLolResults({
  title,
  editionId,
  matches,
}: {
  title: string
  editionId: number
  matches: LolMatchView[]
}) {
  // Hora al montar: decide qué series se pueden editar o marcar como partido
  // de la jornada. La BD vuelve a comprobar el plazo al guardar.
  const [now] = useState(() => Date.now())
  return (
    <section className="bg-bg-elevated border border-border rounded-xl p-4">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-1">
        <h2 className="font-bold text-text-primary">Series · {title}</h2>
        <RescoreButton editionId={editionId} />
      </div>
      {matches.length === 0 ? (
        <p className="text-sm text-text-muted">Sin series.</p>
      ) : (
        <ul className="flex flex-col">
          {matches.map(m => <AdminMatchCard key={m.id} match={m} now={now} />)}
        </ul>
      )}
    </section>
  )
}
