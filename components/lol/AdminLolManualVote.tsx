'use client'

import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { adminSetLolPredictionAction } from '@/app/(main)/admin/lol/actions'
import { seriesOutcomes } from '@/utils/lol/series'
import type { LolMatchView } from '@/utils/lol/types'
import { formatMatchDate, formatSeriesScore } from './format'

export interface ManualVotePlayer {
  id: string
  nickname: string
}

export interface ManualVoteSection {
  editionName: string
  matches: LolMatchView[]
}

const fieldClass = 'text-sm bg-bg-muted border border-border rounded-md px-2 py-1.5 text-text-primary min-w-0'

/**
 * Carga o corrige el voto de un usuario aunque la votación esté cerrada.
 * La BD comprueba que eres ADMIN, valida ganador y marcador, lo registra en
 * la auditoría y repuntúa si la serie ya terminó.
 */
export default function AdminLolManualVote({
  players,
  sections,
}: {
  players: ManualVotePlayer[]
  sections: ManualVoteSection[]
}) {
  const matches = sections.flatMap(s => s.matches.filter(m => m.status !== 'CANCELLED'))
  const [userId, setUserId] = useState('')
  const [matchId, setMatchId] = useState<number | null>(null)
  const [winner, setWinner] = useState<'home' | 'away' | ''>('')
  const [score, setScore] = useState('')
  const [reason, setReason] = useState('')
  const [isPending, startTransition] = useTransition()

  const match = matches.find(m => m.id === matchId) ?? null
  const outcomes = match
    ? seriesOutcomes(match.bestOf).filter(o => (winner === 'home' ? o.home > o.away : winner === 'away' ? o.away > o.home : false))
    : []

  const submit = () => {
    if (!match || !userId || !winner || !score) return
    const [home, away] = score.split('-').map(Number)
    startTransition(async () => {
      try {
        const res = await adminSetLolPredictionAction({
          userId,
          matchId: match.id,
          winnerTeamId: winner === 'home' ? match.home.id : match.away.id,
          home,
          away,
          reason,
        })
        if ('error' in res) toast.error(res.error)
        else {
          toast.success('Voto guardado y registrado')
          setScore('')
          setReason('')
        }
      } catch {
        toast.error('No hemos podido conectar con el servidor. Inténtalo de nuevo.')
      }
    })
  }

  return (
    <section className="bg-bg-elevated border border-border rounded-xl p-4 flex flex-col gap-3">
      <div>
        <h2 className="font-bold text-text-primary">Cargar voto a mano</h2>
        <p className="text-xs text-text-muted">
          Se salta el corte de votación. Queda registrado quién lo cargó, cuándo y el voto anterior.
        </p>
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-xs text-text-muted">
          Usuario
          <select className={fieldClass} value={userId} onChange={e => setUserId(e.target.value)} disabled={isPending}>
            <option value="">Elige usuario…</option>
            {players.map(p => <option key={p.id} value={p.id}>{p.nickname}</option>)}
          </select>
        </label>

        <label className="flex flex-col gap-1 text-xs text-text-muted">
          Partido
          <select
            className={fieldClass}
            value={matchId ?? ''}
            onChange={e => {
              setMatchId(e.target.value ? Number(e.target.value) : null)
              setWinner('')
              setScore('')
            }}
            disabled={isPending}
          >
            <option value="">Elige partido…</option>
            {sections.map(s => (
              <optgroup key={s.editionName} label={s.editionName}>
                {s.matches.filter(m => m.status !== 'CANCELLED').map(m => (
                  <option key={m.id} value={m.id}>
                    {formatMatchDate(m.date)} · {m.home.tag} vs {m.away.tag} · Bo{m.bestOf} · {m.status}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1 text-xs text-text-muted">
          Ganador
          <select
            className={fieldClass}
            value={winner}
            onChange={e => {
              setWinner(e.target.value as 'home' | 'away' | '')
              setScore('')
            }}
            disabled={!match || isPending}
          >
            <option value="">Elige ganador…</option>
            {match && <option value="home">{match.home.name}</option>}
            {match && <option value="away">{match.away.name}</option>}
          </select>
        </label>

        <label className="flex flex-col gap-1 text-xs text-text-muted">
          Marcador
          <select className={fieldClass} value={score} onChange={e => setScore(e.target.value)} disabled={!winner || isPending}>
            <option value="">Elige marcador…</option>
            {match && outcomes.map(o => (
              <option key={`${o.home}-${o.away}`} value={`${o.home}-${o.away}`}>
                {o.home}-{o.away} ({formatSeriesScore(o, match.home.tag, match.away.tag)})
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1 text-xs text-text-muted sm:col-span-2">
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
      </div>

      <button
        type="button"
        onClick={submit}
        disabled={isPending || !userId || !match || !winner || !score}
        className="self-start px-4 py-1.5 rounded-md text-sm font-semibold bg-accent bg-accent-gradient text-on-accent shadow-glow-accent disabled:shadow-none disabled:opacity-50"
      >
        {isPending ? 'Guardando…' : 'Guardar voto'}
      </button>
    </section>
  )
}
