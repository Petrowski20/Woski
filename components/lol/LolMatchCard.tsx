'use client'

import { memo } from 'react'
import Link from 'next/link'
import { Loader2 } from 'lucide-react'
import { sameScore, type SeriesScore } from '@/utils/lol/series'
import type { LolMatchView, LolTeamView, SaveErrorCode } from '@/utils/lol/types'
import SeriesSlider from './SeriesSlider'
import VoteBreakdown from './VoteBreakdown'
import TeamLogo from './TeamLogo'
import { SliderHelpButton } from './SliderHelp'
import { SAVE_ERROR_ACTION_LABEL, SAVE_ERROR_COPY } from './saveErrors'
import { formatMatchDate, formatSeriesScore } from './format'

type CardState = 'open' | 'voted' | 'locked' | 'finished' | 'cancelled'

const STATE_BADGE: Record<CardState, { label: string; className: string }> = {
  open:      { label: 'Por votar',  className: 'bg-accent/10 text-accent' },
  voted:     { label: 'Ya votado',  className: 'bg-success/10 text-success' },
  locked:    { label: 'Bloqueado',  className: 'bg-warning/10 text-warning' },
  finished:  { label: 'Finalizado', className: 'bg-bg-muted text-text-muted' },
  cancelled: { label: 'Cancelado',  className: 'bg-danger/10 text-danger' },
}

interface Props {
  match: LolMatchView
  locked: boolean
  draft: SeriesScore | null
  saving: boolean
  error: SaveErrorCode | null
  onDraftChange: (matchId: number, score: SeriesScore) => void
  onSave: (matchId: number) => void
}

function TeamColumn({ team, side }: { team: LolTeamView; side: 'a' | 'b' }) {
  return (
    <div className="flex flex-col items-center gap-1.5 min-w-0 flex-1 text-center">
      <TeamLogo name={team.name} tag={team.tag} logoUrl={team.logoUrl} side={side} />
      <span className="font-bold text-sm text-text-primary truncate max-w-full">{team.name}</span>
      <span className="text-xs text-text-muted tabular-nums" title="Récord en esta fase">
        {team.record.wins}-{team.record.losses}
      </span>
    </div>
  )
}

function PointsBadge({ points }: { points: number }) {
  const tone = points === 0 ? 'bg-danger/10 text-danger' : 'bg-success/10 text-success'
  return (
    <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${tone}`}>
      {points > 0 ? `+${points}` : points} pt{points !== 1 ? 's' : ''}
    </span>
  )
}

function LolMatchCard({ match, locked, draft, saving, error, onDraftChange, onSave }: Props) {
  const saved = match.myPrediction
  const savedScore: SeriesScore | null = saved ? { home: saved.home, away: saved.away } : null
  const current = draft ?? savedScore
  const dirty = draft !== null && !sameScore(draft, savedScore)

  const state: CardState =
    match.status === 'CANCELLED' ? 'cancelled'
    : match.status === 'FINISHED' ? 'finished'
    : locked ? 'locked'
    : saved ? 'voted'
    : 'open'
  const badge = STATE_BADGE[state]
  const interactive = state === 'open' || state === 'voted'

  const valueText = current ? formatSeriesScore(current, match.home.name, match.away.name) : ''
  const errorCopy = error ? SAVE_ERROR_COPY[error] : null

  return (
    <article
      className="bg-bg-elevated border border-border rounded-xl shadow-sm overflow-hidden"
      aria-label={`${match.home.name} contra ${match.away.name}`}
    >
      {/* Cabecera */}
      <header className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 border-b border-border text-xs">
        <div className="flex items-center gap-2 text-text-muted min-w-0">
          <span className="font-semibold text-text-primary truncate">{match.phaseName}</span>
          <span aria-hidden>·</span>
          <span className="font-semibold">Bo{match.bestOf}</span>
          <span aria-hidden>·</span>
          <time dateTime={match.date} className="capitalize">{formatMatchDate(match.date)}</time>
        </div>
        <span className={`px-2 py-0.5 rounded-full font-semibold ${badge.className}`}>{badge.label}</span>
      </header>

      <div className="p-4 flex flex-col gap-4">
        {/* Equipos */}
        <div className="flex items-start gap-3">
          <TeamColumn team={match.home} side="a" />
          <div className="self-center shrink-0 text-center">
            {match.result ? (
              <span className="text-2xl font-black tabular-nums text-text-primary">
                {match.result.home}<span className="text-text-muted mx-1">-</span>{match.result.away}
              </span>
            ) : (
              <span className="text-sm font-bold text-text-muted">VS</span>
            )}
          </div>
          <TeamColumn team={match.away} side="b" />
        </div>

        {/* Predicción */}
        {state === 'cancelled' ? (
          <p className="text-sm text-text-muted text-center">Partido cancelado. No cuenta para la clasificación.</p>
        ) : !interactive && !savedScore ? (
          <p className="text-sm text-text-muted text-center">No enviaste predicción para este partido.</p>
        ) : (
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between text-xs text-text-muted">
              <span className="font-semibold">{interactive ? 'Tu predicción' : 'Lo que votaste'}</span>
              <SliderHelpButton size="sm" />
            </div>

            <SeriesSlider
              bestOf={match.bestOf}
              value={interactive ? current : savedScore}
              onChange={(score) => onDraftChange(match.id, score)}
              disabled={!interactive || saving}
              homeName={match.home.name}
              awayName={match.away.name}
              valueText={valueText}
            />

            <p className="text-center text-sm font-bold text-text-primary min-h-5" aria-live="polite">
              {current
                ? formatSeriesScore(interactive ? current : savedScore!, match.home.name, match.away.name)
                : <span className="font-normal text-text-muted">Desliza hacia el equipo que crees que ganará</span>}
            </p>

            {state === 'finished' && match.result && savedScore && (
              <div className="flex items-center justify-center gap-2 text-sm">
                <span className="text-text-muted">
                  Resultado: <strong className="text-text-primary">{formatSeriesScore(match.result, match.home.name, match.away.name)}</strong>
                </span>
                <PointsBadge points={saved?.points ?? 0} />
              </div>
            )}

            {interactive && (
              <button
                type="button"
                onClick={() => onSave(match.id)}
                disabled={!dirty || saving}
                className="self-center mt-1 inline-flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-semibold bg-accent text-on-accent hover:opacity-90 active:scale-95 transition-all disabled:opacity-50 disabled:active:scale-100 disabled:cursor-not-allowed"
              >
                {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                {saving ? 'Guardando…' : dirty || !saved ? 'Guardar predicción' : 'Predicción guardada'}
              </button>
            )}
          </div>
        )}

        {/* Error de guardado */}
        {errorCopy && (
          <div role="alert" className="flex flex-col sm:flex-row sm:items-center gap-2 p-3 rounded-lg bg-danger/10 text-sm text-text-primary">
            <p className="flex-1">{errorCopy.text}</p>
            {errorCopy.action === 'login' && (
              <Link href="/login" className="shrink-0 px-3 py-1.5 rounded-md bg-danger text-on-accent font-semibold text-xs text-center">
                {SAVE_ERROR_ACTION_LABEL.login}
              </Link>
            )}
            {errorCopy.action === 'retry' && (
              <button type="button" onClick={() => onSave(match.id)} disabled={saving} className="shrink-0 px-3 py-1.5 rounded-md bg-danger text-on-accent font-semibold text-xs disabled:opacity-60">
                {SAVE_ERROR_ACTION_LABEL.retry}
              </button>
            )}
            {errorCopy.action === 'reload' && (
              <button type="button" onClick={() => window.location.reload()} className="shrink-0 px-3 py-1.5 rounded-md bg-danger text-on-accent font-semibold text-xs">
                {SAVE_ERROR_ACTION_LABEL.reload}
              </button>
            )}
          </div>
        )}

        {/* Desglose: solo si ya has guardado tu voto en este partido */}
        {savedScore && match.distribution && (
          <VoteBreakdown
            distribution={match.distribution}
            mine={savedScore}
            homeName={match.home.name}
            awayName={match.away.name}
          />
        )}
      </div>
    </article>
  )
}

export default memo(LolMatchCard)
