'use client'

import { useState, useTransition, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { updatePlayerPredictionAction } from '@/app/(main)/admin/actions'
import { getFlagUrl } from '@/utils/getFlagUrl'

interface Profile { id: string; nickname: string }

interface Team { name: string; flag_emoji: string; iso_code?: string }

interface Match {
  id: number
  match_date: string
  stage: string
  group_letter: string | null
  status: string
  home_goals: number | null
  away_goals: number | null
  advancing_team_id: number | null
  home_team_id: number
  away_team_id: number
  home_team: Team | null
  away_team: Team | null
}

interface Prediction {
  match_id: number
  pred_home_goals: number | null
  pred_away_goals: number | null
  pred_advancing_team_id: number | null
  points_earned: number | null
}

interface Props {
  profiles: Profile[]
  matches: Match[]
  predictions: Prediction[]
  selectedPlayerId: string | null
}

const STAGE_LABELS: Record<string, string> = {
  GROUP: 'Grupos',
  ROUND_OF_32: 'R32',
  ROUND_OF_16: 'Octavos',
  QUARTER_FINAL: 'Cuartos',
  SEMI_FINAL: 'Semis',
  THIRD_PLACE: '3er Puesto',
  FINAL: 'Final',
}

const POINTS_BADGE: Record<number, string> = {
  3: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
  2: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
  1: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
  0: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',
}

function FlagImg({ flagEmoji, isoCode, name }: { flagEmoji: string; isoCode?: string; name: string }) {
  const url = getFlagUrl(flagEmoji, isoCode)
  if (!url) return <span className="text-base leading-none">{flagEmoji || '🏳'}</span>
  return <img src={url} alt={name} className="w-6 h-4 object-cover rounded-sm shadow-sm flex-shrink-0" />
}

function GoalInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <input
      type="number"
      min={0}
      max={99}
      value={value}
      onChange={e => onChange(e.target.value)}
      className="w-12 text-center rounded-lg border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-gray-900 dark:text-gray-100 text-sm py-1.5 focus:outline-none focus:ring-2 focus:ring-brand-blue tabular-nums"
    />
  )
}

interface RowState {
  home: string
  away: string
  advancing: number | null
  saving: boolean
}

export default function AdminPredictionsEditor({ profiles, matches, predictions, selectedPlayerId }: Props) {
  const router = useRouter()
  const [, startTransition] = useTransition()

  const predMap = new Map(predictions.map(p => [p.match_id, p]))

  const initRow = useCallback((match: Match): RowState => {
    const pred = predMap.get(match.id)
    return {
      home: pred?.pred_home_goals?.toString() ?? '',
      away: pred?.pred_away_goals?.toString() ?? '',
      advancing: pred?.pred_advancing_team_id ?? null,
      saving: false,
    }
  }, [predictions])

  const [rows, setRows] = useState<Map<number, RowState>>(() => {
    const m = new Map<number, RowState>()
    for (const match of matches) m.set(match.id, initRow(match))
    return m
  })

  function setRow(matchId: number, patch: Partial<RowState>) {
    setRows(prev => {
      const next = new Map(prev)
      next.set(matchId, { ...prev.get(matchId)!, ...patch })
      return next
    })
  }

  function handlePlayerChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const val = e.target.value
    startTransition(() => {
      router.push(val ? `/admin/predicciones?player=${val}` : '/admin/predicciones')
    })
  }

  async function handleSave(match: Match) {
    if (!selectedPlayerId) return
    const row = rows.get(match.id)!
    const home = parseInt(row.home, 10)
    const away = parseInt(row.away, 10)

    if (!Number.isFinite(home) || !Number.isFinite(away)) {
      toast.error('Introduce valores numéricos válidos')
      return
    }

    const isKnockout = match.stage !== 'GROUP'
    const isTie = match.home_goals === match.away_goals
    if (isKnockout && isTie && home === away && row.advancing === null) {
      toast.error('Debes seleccionar el equipo que clasifica')
      return
    }

    setRow(match.id, { saving: true })
    const res = await updatePlayerPredictionAction(
      selectedPlayerId,
      match.id,
      home,
      away,
      isKnockout ? row.advancing : null,
    )
    setRow(match.id, { saving: false })

    if (res.error) {
      toast.error(res.error)
    } else {
      toast.success('Predicción actualizada')
      startTransition(() => router.refresh())
    }
  }

  const selectedNickname = profiles.find(p => p.id === selectedPlayerId)?.nickname

  return (
    <div className="space-y-6">
      {/* Player selector */}
      <div className="bg-white dark:bg-slate-900 rounded-xl border border-gray-100 dark:border-slate-800 shadow-sm p-5">
        <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
          Seleccionar jugador
        </label>
        <select
          value={selectedPlayerId ?? ''}
          onChange={handlePlayerChange}
          className="w-full max-w-sm rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-gray-900 dark:text-gray-100 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue"
        >
          <option value="">— Elige un jugador —</option>
          {profiles.map(p => (
            <option key={p.id} value={p.id}>{p.nickname}</option>
          ))}
        </select>
      </div>

      {/* Predictions list */}
      {selectedPlayerId && (
        <div className="space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500 px-1">
            Predicciones de <span className="text-gray-700 dark:text-gray-200">{selectedNickname}</span>
            {' · '}{matches.length} partido{matches.length !== 1 ? 's' : ''} bloqueados
          </h2>

          {matches.length === 0 && (
            <p className="text-center text-gray-400 dark:text-slate-500 text-sm py-10">
              No hay partidos finalizados aún.
            </p>
          )}

          {matches.map(match => {
            const row = rows.get(match.id)!
            const pred = predMap.get(match.id)
            const currentPoints = pred?.points_earned ?? null
            const isFinished = match.status === 'FINISHED'
            const isKnockout = match.stage !== 'GROUP'
            const isRealTie = isFinished && match.home_goals === match.away_goals
            const showAdvancing = isKnockout && isRealTie && match.advancing_team_id !== null
            const hasPred = pred !== undefined

            return (
              <div
                key={match.id}
                className="bg-white dark:bg-slate-900 rounded-xl border border-gray-100 dark:border-slate-800 shadow-sm p-4"
              >
                {/* Match header */}
                <div className="flex items-center justify-between mb-3 gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-[10px] font-semibold uppercase tracking-wide bg-gray-100 dark:bg-slate-800 text-gray-500 dark:text-gray-400 px-2 py-0.5 rounded-full flex-shrink-0">
                      {STAGE_LABELS[match.stage] ?? match.stage}
                      {match.group_letter ? ` ${match.group_letter}` : ''}
                    </span>
                    <span className="text-xs text-gray-400 dark:text-slate-500 truncate">
                      {new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'short' }).format(new Date(match.match_date))}
                    </span>
                  </div>
                  {/* Real result / status */}
                  {isFinished ? (
                    <span className="text-xs font-bold tabular-nums text-gray-600 dark:text-gray-300 flex-shrink-0">
                      {match.home_goals} – {match.away_goals}
                    </span>
                  ) : (
                    <span className="text-[10px] font-semibold uppercase tracking-wide bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300 px-2 py-0.5 rounded-full flex-shrink-0">
                      {match.status === 'IN_PROGRESS' ? 'En curso' : 'Bloqueado'}
                    </span>
                  )}
                </div>

                {/* Teams + prediction inputs */}
                <div className="flex items-center gap-2">
                  {/* Home */}
                  <div className="flex items-center gap-1.5 flex-1 min-w-0 justify-end">
                    <span className="text-xs font-medium text-gray-700 dark:text-gray-300 truncate">{match.home_team?.name ?? '?'}</span>
                    <FlagImg flagEmoji={match.home_team?.flag_emoji ?? ''} isoCode={match.home_team?.iso_code} name={match.home_team?.name ?? ''} />
                  </div>

                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    <GoalInput value={row.home} onChange={v => setRow(match.id, { home: v })} />
                    <span className="text-gray-400 dark:text-slate-500 font-bold text-sm">–</span>
                    <GoalInput value={row.away} onChange={v => setRow(match.id, { away: v })} />
                  </div>

                  {/* Away */}
                  <div className="flex items-center gap-1.5 flex-1 min-w-0">
                    <FlagImg flagEmoji={match.away_team?.flag_emoji ?? ''} isoCode={match.away_team?.iso_code} name={match.away_team?.name ?? ''} />
                    <span className="text-xs font-medium text-gray-700 dark:text-gray-300 truncate">{match.away_team?.name ?? '?'}</span>
                  </div>
                </div>

                {/* Advancing team selector (penalty case) */}
                {showAdvancing && (
                  <div className="mt-2.5 flex items-center gap-2">
                    <span className="text-xs text-gray-500 dark:text-gray-400">Clasifica:</span>
                    <div className="flex gap-2">
                      {[match.home_team_id, match.away_team_id].map(tid => {
                        const team = tid === match.home_team_id ? match.home_team : match.away_team
                        const isSelected = row.advancing === tid
                        return (
                          <button
                            key={tid}
                            type="button"
                            onClick={() => setRow(match.id, { advancing: isSelected ? null : tid })}
                            className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold border transition-colors ${
                              isSelected
                                ? 'bg-brand-blue text-white border-brand-blue dark:bg-brand-teal dark:border-brand-teal'
                                : 'bg-gray-50 dark:bg-slate-800 border-gray-200 dark:border-slate-700 text-gray-600 dark:text-gray-400'
                            }`}
                          >
                            <FlagImg flagEmoji={team?.flag_emoji ?? ''} isoCode={team?.iso_code} name={team?.name ?? ''} />
                            {team?.name ?? '?'}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                )}

                {/* Footer: points + save */}
                <div className="mt-3 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {!hasPred && (
                      <span className="text-xs text-gray-400 dark:text-slate-500">Sin predicción registrada</span>
                    )}
                    {hasPred && isFinished && currentPoints !== null && (
                      <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${POINTS_BADGE[currentPoints] ?? 'bg-gray-100 text-gray-500'}`}>
                        {currentPoints === 3 ? 'Pleno' : currentPoints === 0 ? 'Fallo' : `${currentPoints} pt${currentPoints !== 1 ? 's' : ''}`}
                      </span>
                    )}
                    {hasPred && !isFinished && (
                      <span className="text-xs text-gray-400 dark:text-slate-500">Puntos pendientes</span>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => handleSave(match)}
                    disabled={row.saving}
                    className="px-3 py-1.5 rounded-lg bg-brand-blue dark:bg-brand-teal text-white text-xs font-semibold disabled:opacity-50 hover:opacity-90 transition-opacity"
                  >
                    {row.saving ? 'Guardando…' : 'Guardar'}
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {!selectedPlayerId && (
        <div className="text-center py-16 text-gray-400 dark:text-slate-500 text-sm">
          Selecciona un jugador para ver y editar sus predicciones.
        </div>
      )}
    </div>
  )
}
