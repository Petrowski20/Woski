'use client'

import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { setLolMatchResultAction, setLolMatchStatusAction } from '@/app/(main)/admin/lol/actions'
import { seriesOutcomes } from '@/utils/lol/series'
import type { LolMatchView } from '@/utils/lol/types'
import { formatMatchDate, formatSeriesScore } from './format'

function AdminRow({ match }: { match: LolMatchView }) {
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

export default function AdminLolResults({ title, matches }: { title: string; matches: LolMatchView[] }) {
  return (
    <section className="bg-bg-elevated border border-border rounded-xl p-4 overflow-x-auto">
      <h2 className="font-bold text-text-primary mb-3">{title}</h2>
      {matches.length === 0 ? (
        <p className="text-sm text-text-muted">Sin partidos.</p>
      ) : (
        <table className="w-full text-left">
          <tbody>
            {matches.map(m => <AdminRow key={m.id} match={m} />)}
          </tbody>
        </table>
      )}
    </section>
  )
}
