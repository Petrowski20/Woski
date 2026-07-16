'use client'

import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { toast } from 'sonner'
import { saveMatchResultAction, saveAllMatchesAction, createMatchAction, getAdminAllPredictionsAction } from '@/app/(main)/admin/actions'
import type { MatchResult, AdminPrediction } from '@/app/(main)/admin/actions'
import { getFlagUrl } from '@/utils/getFlagUrl'

interface Team { name: string; flag_emoji: string; iso_code?: string }

export interface TeamOption { id: number; name: string; flag_emoji: string }

export interface AdminMatch {
  id: number
  match_date: string
  stage: string
  group_letter: string | null
  status: string
  home_goals: number | null
  away_goals: number | null
  home_team_id: number | null
  away_team_id: number | null
  advancing_team_id: number | null
  home_team: Team | null
  away_team: Team | null
}

interface RowValues {
  homeGoals: string
  awayGoals: string
  advancingTeamId: number | null
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

const GROUPS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L']

const fieldClass =
  'w-full rounded-xl border px-3 py-2 text-sm ' +
  'bg-white dark:bg-slate-800 border-gray-200 dark:border-slate-700 ' +
  'text-gray-900 dark:text-gray-100 ' +
  'focus:outline-none focus:ring-2 focus:ring-brand-blue focus:border-transparent transition-colors'

function FlagImg({ flagEmoji, isoCode, name }: { flagEmoji: string; isoCode?: string; name: string }) {
  const url = getFlagUrl(flagEmoji, isoCode)
  if (!url) {
    return (
      <span className="text-sm leading-none flex-shrink-0" role="img" aria-label={name}>
        {flagEmoji || '🏳'}
      </span>
    )
  }
  return <img src={url} alt={name} className="w-6 h-4 object-cover rounded-sm shadow-sm flex-shrink-0" />
}

function PredictionsModal({ match, onClose }: { match: AdminMatch; onClose: () => void }) {
  const [predictions, setPredictions] = useState<AdminPrediction[] | null>(null)
  const [fetchError, setFetchError] = useState<string | null>(null)

  useEffect(() => {
    getAdminAllPredictionsAction(match.id).then((res) => {
      if (res.error) setFetchError(res.error)
      else setPredictions(res.data ?? [])
    })
  }, [match.id])

  const matchLabel = `${match.home_team?.flag_emoji ?? ''} ${match.home_team?.name ?? '?'}  vs  ${match.away_team?.name ?? '?'} ${match.away_team?.flag_emoji ?? ''}`

  const groups = useMemo(() => {
    if (!predictions) return []
    const map = new Map<string, {
      homeGoals: number | null
      awayGoals: number | null
      advancingTeamId: number | null
      nicknames: string[]
    }>()
    for (const pred of predictions) {
      const key = `${pred.pred_home_goals ?? '?'}-${pred.pred_away_goals ?? '?'}-${pred.pred_advancing_team_id ?? ''}`
      if (!map.has(key)) {
        map.set(key, {
          homeGoals: pred.pred_home_goals,
          awayGoals: pred.pred_away_goals,
          advancingTeamId: pred.pred_advancing_team_id,
          nicknames: [],
        })
      }
      map.get(key)!.nicknames.push(pred.nickname)
    }
    return Array.from(map.values()).sort((a, b) => b.nicknames.length - a.nicknames.length)
  }, [predictions])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-200">
        <div className="bg-gray-50 dark:bg-slate-800/60 px-5 py-4 border-b border-gray-100 dark:border-slate-800 flex justify-between items-start">
          <div>
            <h3 className="font-bold text-gray-800 dark:text-gray-100">Predicciones del partido</h3>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{matchLabel}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 text-xl font-bold px-2 leading-none ml-4"
          >
            ×
          </button>
        </div>

        <div className="p-5">
          {!predictions && !fetchError && (
            <p className="text-center text-gray-400 dark:text-slate-500 text-sm py-10">Cargando…</p>
          )}
          {fetchError && (
            <p className="text-center text-red-500 dark:text-red-400 text-sm py-10">{fetchError}</p>
          )}
          {predictions && predictions.length === 0 && (
            <p className="text-center text-gray-400 dark:text-slate-500 text-sm py-10">
              Ningún usuario ha predicho este partido todavía.
            </p>
          )}
          {predictions && predictions.length > 0 && (
            <>
              <div className="space-y-2 max-h-[26rem] overflow-y-auto pr-1">
                {groups.map((group, gi) => {
                  const advancing =
                    group.advancingTeamId !== null
                      ? group.advancingTeamId === match.home_team_id
                        ? match.home_team?.name
                        : match.away_team?.name
                      : null
                  const pct = Math.round((group.nicknames.length / predictions.length) * 100)
                  return (
                    <div key={gi} className="rounded-xl border border-gray-100 dark:border-slate-800 overflow-hidden">
                      <div className="flex items-center justify-between px-3 py-2 bg-gray-50 dark:bg-slate-800">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-gray-900 dark:text-gray-100 tabular-nums text-base">
                            {group.homeGoals ?? '?'} – {group.awayGoals ?? '?'}
                          </span>
                          {advancing && (
                            <span className="text-[10px] font-semibold text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/30 px-1.5 py-0.5 rounded-full">
                              {advancing}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <div className="w-16 h-1.5 rounded-full bg-gray-200 dark:bg-slate-700 overflow-hidden">
                            <div className="h-full rounded-full bg-indigo-500 dark:bg-indigo-400" style={{ width: `${pct}%` }} />
                          </div>
                          <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 tabular-nums w-6 text-right">{pct}%</span>
                          <span className="text-xs font-semibold bg-gray-200 dark:bg-slate-700 text-gray-600 dark:text-gray-300 px-2 py-0.5 rounded-full tabular-nums">
                            {group.nicknames.length}
                          </span>
                        </div>
                      </div>
                      <div className="px-3 py-2 flex flex-wrap gap-1.5">
                        {group.nicknames.map((nick, ni) => (
                          <span key={ni} className="text-xs text-gray-600 dark:text-gray-300 bg-gray-100 dark:bg-slate-700/60 px-2 py-0.5 rounded-md">
                            {nick}
                          </span>
                        ))}
                      </div>
                    </div>
                  )
                })}
              </div>
              <p className="text-xs text-gray-400 dark:text-slate-500 mt-3 text-right">
                {predictions.length} predicción{predictions.length !== 1 ? 'es' : ''} · {groups.length} resultado{groups.length !== 1 ? 's' : ''} distintos
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

function AddMatchModal({ teams, onClose }: { teams: TeamOption[]; onClose: () => void }) {
  const [homeTeamId, setHomeTeamId] = useState('')
  const [awayTeamId, setAwayTeamId] = useState('')
  const [matchDate, setMatchDate] = useState('')
  const [stage, setStage] = useState('GROUP')
  const [groupLetter, setGroupLetter] = useState('A')
  const [stadium, setStadium] = useState('')
  const [referee, setReferee] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!homeTeamId || !awayTeamId || !matchDate) {
      toast.error('Completa todos los campos obligatorios')
      return
    }
    if (homeTeamId === awayTeamId) {
      toast.error('El equipo local y visitante no pueden ser el mismo')
      return
    }

    const fd = new FormData()
    fd.set('home_team_id', homeTeamId)
    fd.set('away_team_id', awayTeamId)
    fd.set('match_date', matchDate)
    fd.set('stage', stage)
    if (stage === 'GROUP') fd.set('group_letter', groupLetter)
    fd.set('stadium', stadium)
    fd.set('referee', referee)

    setIsSubmitting(true)
    const result = await createMatchAction(fd)
    setIsSubmitting(false)

    if (result.error) {
      toast.error(result.error)
    } else {
      toast.success('Partido creado correctamente ✅')
      onClose()
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-xl w-full max-w-lg overflow-hidden animate-in zoom-in-95 duration-200">
        <div className="bg-gray-50 dark:bg-slate-800/60 px-5 py-4 border-b border-gray-100 dark:border-slate-800 flex justify-between items-center">
          <h3 className="font-bold text-gray-800 dark:text-gray-100">Añadir Partido</h3>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 text-xl font-bold px-2 leading-none"
          >
            ×
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1">Equipo Local *</label>
              <select value={homeTeamId} onChange={(e) => setHomeTeamId(e.target.value)} required className={fieldClass}>
                <option value="">Seleccionar…</option>
                {teams.map((t) => (
                  <option key={t.id} value={t.id}>{t.flag_emoji} {t.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1">Equipo Visitante *</label>
              <select value={awayTeamId} onChange={(e) => setAwayTeamId(e.target.value)} required className={fieldClass}>
                <option value="">Seleccionar…</option>
                {teams.map((t) => (
                  <option key={t.id} value={t.id}>{t.flag_emoji} {t.name}</option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1">Fecha y Hora *</label>
            <input
              type="datetime-local"
              value={matchDate}
              onChange={(e) => setMatchDate(e.target.value)}
              required
              className={fieldClass}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1">Fase *</label>
              <select value={stage} onChange={(e) => setStage(e.target.value)} required className={fieldClass}>
                {Object.entries(STAGE_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className={`block text-xs font-semibold mb-1 transition-colors ${stage === 'GROUP' ? 'text-gray-500 dark:text-gray-400' : 'text-gray-300 dark:text-slate-600'}`}>
                Grupo {stage === 'GROUP' ? '*' : '(N/A)'}
              </label>
              <select
                value={groupLetter}
                onChange={(e) => setGroupLetter(e.target.value)}
                disabled={stage !== 'GROUP'}
                className={`${fieldClass} ${stage !== 'GROUP' ? 'opacity-40 cursor-not-allowed' : ''}`}
              >
                {GROUPS.map((g) => (
                  <option key={g} value={g}>Grupo {g}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1">Estadio</label>
              <input
                type="text"
                value={stadium}
                onChange={(e) => setStadium(e.target.value)}
                placeholder="Ej. Lusail Stadium"
                className={fieldClass}
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1">Árbitro</label>
              <input
                type="text"
                value={referee}
                onChange={(e) => setReferee(e.target.value)}
                placeholder="Nombre del árbitro"
                className={fieldClass}
              />
            </div>
          </div>

          <div className="flex gap-3 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2.5 rounded-xl border border-gray-200 dark:border-slate-700 text-gray-600 dark:text-gray-400 font-medium hover:bg-gray-50 dark:hover:bg-slate-800 transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="flex-1 py-2.5 rounded-xl bg-gradient-to-r from-brand-blue to-brand-teal text-white font-semibold hover:opacity-90 transition-all active:scale-95 disabled:opacity-60 disabled:cursor-wait shadow-sm"
            >
              {isSubmitting ? 'Creando…' : 'Crear Partido'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

function MatchRow({
  match,
  onRowChange,
  onViewPredictions,
}: {
  match: AdminMatch
  onRowChange?: (id: number, data: RowValues | null) => void
  onViewPredictions?: (match: AdminMatch) => void
}) {
  const [homeGoals, setHomeGoals]             = useState(match.home_goals?.toString() ?? '')
  const [awayGoals, setAwayGoals]             = useState(match.away_goals?.toString() ?? '')
  const [advancingTeamId, setAdvancingTeamId] = useState<number | null>(match.advancing_team_id ?? null)
  const [isSubmitting, setIsSubmitting]       = useState(false)

  const isFinished  = match.status === 'FINISHED'
  const isKnockout  = match.stage !== 'GROUP'
  const isTied      = homeGoals !== '' && awayGoals !== '' && homeGoals === awayGoals
  const needsAdvancing = isKnockout && isTied && !isFinished

  const onRowChangeRef = useRef(onRowChange)
  useEffect(() => { onRowChangeRef.current = onRowChange }, [onRowChange])

  useEffect(() => {
    onRowChangeRef.current?.(
      match.id,
      isFinished ? null : { homeGoals, awayGoals, advancingTeamId }
    )
  }, [homeGoals, awayGoals, advancingTeamId, isFinished, match.id])

  useEffect(() => {
    if (!isKnockout) return
    const h = parseInt(homeGoals, 10)
    const a = parseInt(awayGoals, 10)
    if (!isNaN(h) && !isNaN(a) && h !== a) setAdvancingTeamId(null)
  }, [homeGoals, awayGoals, isKnockout])

  const handleSave = async () => {
    const home = parseInt(homeGoals, 10)
    const away = parseInt(awayGoals, 10)

    if (isNaN(home) || isNaN(away) || home < 0 || away < 0) {
      toast.error('Introduce un resultado válido (ambos campos, número ≥ 0)')
      return
    }
    if (needsAdvancing && advancingTeamId === null) {
      toast.error('En eliminatoria con empate debes seleccionar el equipo que avanza')
      return
    }

    setIsSubmitting(true)
    const result = await saveMatchResultAction(
      match.id,
      home,
      away,
      isKnockout ? advancingTeamId : null,
    )
    setIsSubmitting(false)

    if (result.error) {
      toast.error(result.error)
    } else {
      toast.success(
        `⚽ Puntos calculados: ${match.home_team?.name ?? ''} ${home} – ${away} ${match.away_team?.name ?? ''}`
      )
    }
  }

  const date = new Date(match.match_date)
  const dateStr = date.toLocaleDateString('es-ES', { day: '2-digit', month: 'short' })
  const timeStr = date.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })

  const inputBase =
    'w-12 text-center border rounded-lg px-1.5 py-1.5 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-brand-blue focus:border-transparent transition-colors ' +
    'bg-white dark:bg-slate-800 border-gray-200 dark:border-slate-600 text-gray-900 dark:text-gray-100 ' +
    'disabled:opacity-50 disabled:bg-gray-50 dark:disabled:bg-slate-700'

  const statusBadgeCls = isFinished
    ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400'
    : match.status === 'IN_PROGRESS'
    ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400'
    : match.status === 'CANCELLED'
    ? 'bg-red-100 text-red-600 dark:bg-red-900/40 dark:text-red-400'
    : 'bg-gray-100 text-gray-600 dark:bg-slate-700 dark:text-slate-400'

  const statusLabel = isFinished
    ? `${match.home_goals} – ${match.away_goals}`
    : match.status === 'IN_PROGRESS'
    ? 'En curso'
    : match.status === 'CANCELLED'
    ? 'Cancelado'
    : 'Pendiente'

  const advancingName = match.advancing_team_id === match.home_team_id
    ? match.home_team?.name
    : match.away_team?.name

  return (
    <div
      className={`rounded-xl border p-4 transition-colors ${
        isFinished
          ? 'bg-emerald-50/30 dark:bg-emerald-950/20 border-emerald-100 dark:border-emerald-900/30'
          : 'bg-white dark:bg-slate-900 border-gray-100 dark:border-slate-800'
      }`}
    >
      {/* Stage + date */}
      <div className="flex items-center justify-between mb-2.5">
        <span className="text-[11px] font-medium text-gray-400 dark:text-slate-500 uppercase tracking-wide">
          {STAGE_LABELS[match.stage] ?? match.stage}
          {match.group_letter && ` · Grupo ${match.group_letter}`}
        </span>
        <span className="text-[11px] text-gray-400 dark:text-slate-500 shrink-0 ml-2">
          {dateStr} · {timeStr}
        </span>
      </div>

      {/* Teams row + controls */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        {/* Teams */}
        <div className="flex items-center gap-2 flex-1 min-w-0">
          {match.home_team && (
            <FlagImg flagEmoji={match.home_team.flag_emoji} isoCode={match.home_team.iso_code} name={match.home_team.name} />
          )}
          <span className="font-semibold text-sm text-gray-900 dark:text-gray-100 truncate">
            {match.home_team?.name ?? '?'}
          </span>
          <span className="text-gray-300 dark:text-slate-600 text-xs shrink-0 mx-0.5">vs</span>
          <span className="font-semibold text-sm text-gray-900 dark:text-gray-100 truncate">
            {match.away_team?.name ?? '?'}
          </span>
          {match.away_team && (
            <FlagImg flagEmoji={match.away_team.flag_emoji} isoCode={match.away_team.iso_code} name={match.away_team.name} />
          )}
        </div>

        {/* Status + inputs + actions */}
        <div className="flex flex-wrap items-center gap-2 sm:shrink-0">
          {/* Status badge */}
          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold shrink-0 ${statusBadgeCls}`}>
            {statusLabel}
          </span>
          {isFinished && isKnockout && match.home_goals === match.away_goals && match.advancing_team_id !== null && (
            <span className="text-[10px] font-semibold text-blue-600 dark:text-blue-400 shrink-0">
              🏆 Pen.: {advancingName}
            </span>
          )}

          {/* Score inputs */}
          <div className="flex items-center gap-1.5 shrink-0">
            <input
              type="number" min={0} max={99}
              value={homeGoals}
              onChange={(e) => setHomeGoals(e.target.value)}
              onKeyDown={(e) => { if (['e', 'E', '+', '-', '.', ','].includes(e.key)) e.preventDefault() }}
              onInput={(e) => { if (e.currentTarget.value.length > 2) e.currentTarget.value = e.currentTarget.value.slice(0, 2) }}
              disabled={isSubmitting}
              placeholder="—"
              className={inputBase}
            />
            <span className="text-gray-300 dark:text-slate-600 font-bold text-sm select-none">–</span>
            <input
              type="number" min={0} max={99}
              value={awayGoals}
              onChange={(e) => setAwayGoals(e.target.value)}
              onKeyDown={(e) => { if (['e', 'E', '+', '-', '.', ','].includes(e.key)) e.preventDefault() }}
              onInput={(e) => { if (e.currentTarget.value.length > 2) e.currentTarget.value = e.currentTarget.value.slice(0, 2) }}
              disabled={isSubmitting}
              placeholder="—"
              className={inputBase}
            />
          </div>

          {/* Save button */}
          <button
            onClick={handleSave}
            disabled={isSubmitting || isFinished || (needsAdvancing && advancingTeamId === null)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all active:scale-95 shrink-0 whitespace-nowrap ${
              isFinished
                ? 'bg-gray-100 text-gray-400 cursor-not-allowed dark:bg-slate-700 dark:text-slate-500'
                : needsAdvancing && advancingTeamId === null
                ? 'bg-amber-100 text-amber-600 cursor-not-allowed dark:bg-amber-900/30 dark:text-amber-400'
                : isSubmitting
                ? 'opacity-70 cursor-wait bg-gradient-to-r from-brand-blue to-brand-teal text-white'
                : 'bg-gradient-to-r from-brand-blue to-brand-teal text-white hover:opacity-90 shadow-sm'
            }`}
          >
            {isSubmitting ? 'Calculando…' : isFinished ? '✓ Listo' : '💾 Guardar'}
          </button>

          {/* View predictions */}
          <button
            onClick={() => onViewPredictions?.(match)}
            className="text-xs text-indigo-500 hover:text-indigo-700 dark:text-indigo-400 dark:hover:text-indigo-300 flex items-center gap-1 transition-colors shrink-0"
          >
            👁 Ver predicciones
          </button>
        </div>
      </div>

      {/* Advancing team selector (knockout tie) */}
      {needsAdvancing && (
        <div className="mt-3 pt-3 border-t border-amber-100 dark:border-amber-900/30 flex flex-wrap items-center justify-center gap-2">
          <p className="text-[10px] uppercase tracking-widest font-bold text-amber-600 dark:text-amber-400 w-full text-center">
            ¿Quién avanza?
          </p>
          <div className="flex gap-2">
            {([
              { tid: match.home_team_id, name: match.home_team?.name ?? '?' },
              { tid: match.away_team_id, name: match.away_team?.name ?? '?' },
            ] as const).map(({ tid, name }) => (
              <button
                key={tid}
                onClick={() => tid !== null && setAdvancingTeamId(tid)}
                disabled={isSubmitting || tid === null}
                className={`px-3 py-1 rounded-full text-xs font-semibold border-2 transition-all ${
                  advancingTeamId === tid
                    ? 'border-blue-600 bg-blue-600 text-white'
                    : 'border-gray-200 dark:border-slate-600 text-gray-600 dark:text-gray-400 hover:border-blue-400 dark:hover:border-blue-500'
                }`}
              >
                {name}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

export default function AdminMatchManager({
  initialMatches,
  teams,
}: {
  initialMatches: AdminMatch[]
  teams: TeamOption[]
}) {
  const [showAddModal, setShowAddModal] = useState(false)
  const [isExporting, setIsExporting]  = useState(false)
  const [isSavingAll, setIsSavingAll]  = useState(false)
  const [predModal, setPredModal]      = useState<AdminMatch | null>(null)

  const scrollTargetId = useMemo(
    () => initialMatches.find((m) => m.status !== 'FINISHED')?.id ?? null,
    [initialMatches],
  )
  const scrollTargetRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!scrollTargetRef.current) return
    const t = setTimeout(() => {
      scrollTargetRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }, 200)
    return () => clearTimeout(t)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const rowValuesRef = useRef<Record<number, RowValues | null>>(
    Object.fromEntries(
      initialMatches.map(m => [
        m.id,
        m.status !== 'FINISHED'
          ? {
              homeGoals: m.home_goals?.toString() ?? '',
              awayGoals: m.away_goals?.toString() ?? '',
              advancingTeamId: m.advancing_team_id ?? null,
            }
          : null,
      ])
    )
  )

  const handleRowChange = useCallback((id: number, data: RowValues | null) => {
    rowValuesRef.current[id] = data
  }, [])

  async function handleExport() {
    setIsExporting(true)
    try {
      const res = await fetch('/api/export')
      if (!res.ok) {
        toast.error('Error al generar el reporte')
        return
      }
      const data = await res.json()
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = 'reporte_mundial.json'
      a.click()
      URL.revokeObjectURL(url)
      toast.success('Reporte descargado ✅')
    } catch {
      toast.error('Error inesperado al generar el reporte')
    } finally {
      setIsExporting(false)
    }
  }

  async function handleSaveAll() {
    const toSave: MatchResult[] = Object.entries(rowValuesRef.current).flatMap(([idStr, data]) => {
      if (!data) return []
      const homeGoals = parseInt(data.homeGoals, 10)
      const awayGoals = parseInt(data.awayGoals, 10)
      if (isNaN(homeGoals) || isNaN(awayGoals) || homeGoals < 0 || awayGoals < 0) return []
      return [{ matchId: parseInt(idStr, 10), homeGoals, awayGoals, advancingTeamId: data.advancingTeamId }]
    })

    if (toSave.length === 0) {
      toast.warning('No hay resultados válidos pendientes de guardar')
      return
    }

    setIsSavingAll(true)
    try {
      const { saved, failed } = await saveAllMatchesAction(toSave)
      if (failed.length === 0) {
        toast.success(`✅ ${saved} resultado(s) guardados correctamente`)
      } else {
        if (saved > 0) toast.success(`✅ ${saved} guardados correctamente`)
        toast.error(`❌ ${failed.length} fallaron: ${failed.map(f => `#${f.matchId} – ${f.error}`).join(', ')}`)
      }
    } catch {
      toast.error('Error inesperado al guardar todos los resultados')
    } finally {
      setIsSavingAll(false)
    }
  }

  const pending  = initialMatches.filter(m => m.status !== 'FINISHED' && m.status !== 'CANCELLED').length
  const finished = initialMatches.filter(m => m.status === 'FINISHED').length

  return (
    <div className="w-full space-y-5">
      {/* Cabecera */}
      <div className="space-y-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Panel de Administración</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            Introduce los resultados reales para calcular puntos automáticamente.
          </p>
        </div>

        {/* Stats + acciones */}
        <div className="flex flex-wrap items-center gap-3">
          {/* Estadísticas */}
          <div className="flex gap-2 shrink-0">
            <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-100 dark:border-amber-800/40 rounded-xl px-4 py-2 text-center min-w-[64px]">
              <p className="text-xl font-bold text-amber-700 dark:text-amber-400">{pending}</p>
              <p className="text-xs text-amber-600 dark:text-amber-500">Pendientes</p>
            </div>
            <div className="bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-100 dark:border-emerald-800/40 rounded-xl px-4 py-2 text-center min-w-[64px]">
              <p className="text-xl font-bold text-emerald-700 dark:text-emerald-400">{finished}</p>
              <p className="text-xs text-emerald-600 dark:text-emerald-500">Finalizados</p>
            </div>
          </div>

          {/* Botones de acción */}
          <div className="flex flex-wrap gap-2">
            <button
              onClick={handleSaveAll}
              disabled={isSavingAll}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold bg-gradient-to-r from-emerald-500 to-teal-500 text-white hover:opacity-90 transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
            >
              <span>💾</span>
              {isSavingAll ? 'Guardando…' : 'Guardar todos'}
            </button>
            <button
              onClick={handleExport}
              disabled={isExporting}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold border border-gray-200 dark:border-slate-700 text-gray-600 dark:text-gray-300 bg-white dark:bg-slate-800 hover:bg-gray-50 dark:hover:bg-slate-700 transition-all active:scale-95 disabled:opacity-60 disabled:cursor-wait"
            >
              <span>📊</span>
              {isExporting ? 'Generando…' : 'Reporte JSON'}
            </button>
            <button
              onClick={() => setShowAddModal(true)}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold bg-gradient-to-r from-brand-blue to-brand-teal text-white hover:opacity-90 transition-all active:scale-95 shadow-sm"
            >
              <span>➕</span>
              Añadir Partido
            </button>
          </div>
        </div>
      </div>

      {/* Lista de partidos */}
      <div className="space-y-3">
        {initialMatches.length === 0 ? (
          <p className="text-center text-gray-400 dark:text-slate-500 text-sm py-14">
            No hay partidos en la base de datos.
          </p>
        ) : (
          initialMatches.map((match) => (
            <div key={match.id} ref={match.id === scrollTargetId ? scrollTargetRef : undefined}>
              <MatchRow match={match} onRowChange={handleRowChange} onViewPredictions={setPredModal} />
            </div>
          ))
        )}
      </div>

      {showAddModal && (
        <AddMatchModal teams={teams} onClose={() => setShowAddModal(false)} />
      )}
      {predModal && (
        <PredictionsModal match={predModal} onClose={() => setPredModal(null)} />
      )}
    </div>
  )
}
