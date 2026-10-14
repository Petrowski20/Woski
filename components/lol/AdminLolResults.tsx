'use client'

import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import {
  rescoreLolEditionAction,
  setLolFeaturedMatchAction,
  setLolMatchResultAction,
  setLolMatchStatusAction,
} from '@/app/(main)/admin/lol/actions'
import { isPredictionLocked, seriesOutcomes } from '@/utils/lol/series'
import type { LolMatchView } from '@/utils/lol/types'
import { formatMatchDate, formatSeriesScore } from './format'

function AdminRow({ match, now }: { match: LolMatchView; now: number }) {
  const outcomes = seriesOutcomes(match.bestOf)
  const initial = match.result ? `${match.result.home}-${match.result.away}` : ''
  const [value, setValue] = useState(initial)
  const [isPending, startTransition] = useTransition()

  const run = (fn: () => Promise<{ success: true } | { error: string }>, okMsg: string) => {
    startTransition(async () => {
      try {
        const res = await fn()
        if ('error' in res) toast.error(res.error)
        else toast.success(okMsg)
      } catch {
        toast.error('No hemos podido conectar con el servidor. Inténtalo de nuevo.')
      }
    })
  }

  // El partido de la jornada solo se cambia con la votación abierta (la BD
  // lo vuelve a comprobar).
  const featuredEditable = !isPredictionLocked(match.status, match.locksAt, now)

  const saveResult = () => {
    const [home, away] = value.split('-').map(Number)
    run(() => setLolMatchResultAction(match.id, home, away), 'Resultado guardado y puntos calculados')
  }

  return (
    <tr className="border-t border-border">
      <td className="py-2 pr-3 text-xs text-text-muted whitespace-nowrap capitalize">{formatMatchDate(match.date)}</td>
      <td className="py-2 pr-3 text-xs text-text-muted whitespace-nowrap">{match.phaseName} · Bo{match.bestOf}</td>
      <td className="py-2 pr-3 text-sm font-semibold text-text-primary whitespace-nowrap">
        {match.home.name} <span className="text-text-muted font-normal">vs</span> {match.away.name}
      </td>
      <td className="py-2 pr-3 text-xs whitespace-nowrap">
        <span className="px-2 py-0.5 rounded-full bg-bg-muted text-text-muted font-semibold">{match.status}</span>
      </td>
      <td className="py-2 pr-3 text-xs whitespace-nowrap">
        <label
          className={`inline-flex items-center gap-1.5 ${featuredEditable ? 'text-text-primary' : 'text-text-muted'}`}
          title={featuredEditable ? 'Partido de la jornada (+2 al acertar el ganador)' : 'Solo se cambia mientras la votación está abierta'}
        >
          <input
            type="checkbox"
            checked={match.featured}
            disabled={!featuredEditable || isPending}
            onChange={e => {
              const featured = e.target.checked
              run(() => setLolFeaturedMatchAction(match.id, featured), featured ? 'Partido de la jornada marcado' : 'Partido de la jornada desmarcado')
            }}
          />
          ⭐ Jornada
        </label>
      </td>
      <td className="py-2 pr-3">
        <select
          value={value}
          onChange={e => setValue(e.target.value)}
          disabled={isPending}
          className="text-sm bg-bg-muted border border-border rounded-md px-2 py-1 text-text-primary"
        >
          <option value="">Resultado…</option>
          {outcomes.map(o => (
            <option key={`${o.home}-${o.away}`} value={`${o.home}-${o.away}`}>
              {o.home}-{o.away} ({formatSeriesScore(o, match.home.tag, match.away.tag)})
            </option>
          ))}
        </select>
      </td>
      <td className="py-2 flex gap-2 whitespace-nowrap">
        <button
          type="button"
          onClick={saveResult}
          disabled={isPending || !value}
          className="px-3 py-1 rounded-md text-xs font-semibold bg-accent text-on-accent disabled:opacity-50"
        >
          {isPending ? 'Guardando…' : 'Guardar resultado'}
        </button>
        {match.status !== 'PENDING' && (
          <button
            type="button"
            onClick={() => run(() => setLolMatchStatusAction(match.id, 'PENDING'), 'Partido reabierto')}
            disabled={isPending}
            className="px-3 py-1 rounded-md text-xs font-semibold border border-border text-text-primary disabled:opacity-50"
          >
            Reabrir
          </button>
        )}
        {match.status !== 'CANCELLED' && (
          <button
            type="button"
            onClick={() => run(() => setLolMatchStatusAction(match.id, 'CANCELLED'), 'Partido cancelado')}
            disabled={isPending}
            className="px-3 py-1 rounded-md text-xs font-semibold text-danger border border-danger/40 disabled:opacity-50"
          >
            Cancelar
          </button>
        )}
      </td>
    </tr>
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
      className="px-3 py-1 rounded-md text-xs font-semibold border border-border text-text-primary disabled:opacity-50"
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
  // Hora al montar: decide qué casillas de "partido de la jornada" se pueden
  // tocar. La BD vuelve a comprobar el plazo al guardar.
  const [now] = useState(() => Date.now())
  return (
    <section className="bg-bg-elevated border border-border rounded-xl p-4 overflow-x-auto">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <h2 className="font-bold text-text-primary">{title}</h2>
        <RescoreButton editionId={editionId} />
      </div>
      {matches.length === 0 ? (
        <p className="text-sm text-text-muted">Sin partidos.</p>
      ) : (
        <table className="w-full text-left">
          <tbody>
            {matches.map(m => <AdminRow key={m.id} match={m} now={now} />)}
          </tbody>
        </table>
      )}
    </section>
  )
}
