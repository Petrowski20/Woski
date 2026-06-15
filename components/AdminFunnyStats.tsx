'use client'

import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { getFunnyStatsAction } from '@/app/(main)/admin/actions'
import type { FunnyPlayerStats, ConfederationStat } from '@/app/(main)/admin/actions'

interface League { id: number; name: string }

interface Props {
  initialPlayers: FunnyPlayerStats[]
  leagues: League[]
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function stat(value: number, label: string, sub?: string) {
  return (
    <div className="flex flex-col items-center gap-0.5 min-w-[48px]">
      <span className="text-lg font-bold text-gray-900 dark:text-gray-100 tabular-nums leading-none">{value}</span>
      <span className="text-[10px] font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide leading-none text-center">{label}</span>
      {sub && <span className="text-[9px] text-gray-400 dark:text-slate-500 leading-none">{sub}</span>}
    </div>
  )
}

function Badge({ children, color }: { children: React.ReactNode; color: string }) {
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold ${color}`}>
      {children}
    </span>
  )
}

function minutesLabel(mins: number): string {
  if (mins < 0) return `${Math.abs(mins)} min después del pitido`
  if (mins === 0) return 'justo al pitido'
  if (mins < 60) return `${mins} min antes`
  const h = Math.floor(mins / 60)
  const m = mins % 60
  return m > 0 ? `${h}h ${m}m antes` : `${h}h antes`
}

// ─── Sparkline (curva de evolución) ──────────────────────────────────────────

function Sparkline({ points }: { points: number[] }) {
  if (points.length < 2) return null
  const w = 240
  const h = 48
  const max = Math.max(...points, 1)
  const coords = points
    .map((v, i) => {
      const x = (i / (points.length - 1)) * w
      const y = h - (v / max) * (h - 4) - 2
      return `${x.toFixed(1)},${y.toFixed(1)}`
    })
    .join(' ')

  const lastX = w
  const lastY = h - (points[points.length - 1] / max) * (h - 4) - 2

  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      className="w-full h-12 overflow-visible"
      preserveAspectRatio="none"
    >
      <polyline
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
        strokeLinecap="round"
        points={coords}
        className="text-brand-blue dark:text-brand-teal"
      />
      <circle
        cx={lastX}
        cy={lastY}
        r="3"
        fill="currentColor"
        className="text-brand-blue dark:text-brand-teal"
      />
    </svg>
  )
}

// ─── Tabla de confederaciones ─────────────────────────────────────────────────

const CONF_FLAGS: Record<string, string> = {
  UEFA: '🇪🇺',
  CONMEBOL: '🌎',
  CAF: '🌍',
  AFC: '🌏',
  CONCACAF: '🌐',
  OFC: '🏝️',
}

function ConfederationTable({ data }: { data: ConfederationStat[] }) {
  if (data.length === 0) return null
  const maxPts = Math.max(...data.map(d => d.total_points), 1)

  return (
    <div className="space-y-1.5">
      <p className="text-[10px] uppercase tracking-wide font-semibold text-gray-400 dark:text-slate-500">
        Rendimiento por confederación
      </p>
      <div className="divide-y divide-gray-100 dark:divide-slate-800 rounded-lg border border-gray-100 dark:border-slate-800 overflow-hidden">
        {data.map(d => {
          const pct = Math.round((d.total_points / maxPts) * 100)
          const ppg = d.matches > 0 ? (d.total_points / d.matches).toFixed(1) : '0'
          return (
            <div key={d.confederation} className="px-3 py-2 bg-white dark:bg-slate-900">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-sm">{CONF_FLAGS[d.confederation] ?? '🏳️'}</span>
                <span className="text-xs font-semibold text-gray-700 dark:text-gray-300 flex-1">{d.confederation}</span>
                <span className="text-xs tabular-nums text-gray-500 dark:text-gray-400">
                  {d.total_points} pts · {d.exact_scores} exactos · {ppg} pt/p · err {d.avg_goal_error}
                </span>
              </div>
              <div className="h-1 rounded-full bg-gray-100 dark:bg-slate-800 overflow-hidden">
                <div
                  className="h-full rounded-full bg-brand-blue dark:bg-brand-teal transition-all"
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── Awards ──────────────────────────────────────────────────────────────────

function deriveAwards(players: FunnyPlayerStats[]) {
  if (players.length === 0) return []

  const pickMax = (fn: (p: FunnyPlayerStats) => number) =>
    players.reduce((best, p) => (fn(p) > fn(best) ? p : best))
  const pickMin = (fn: (p: FunnyPlayerStats) => number) =>
    players.reduce((best, p) => (fn(p) < fn(best) ? p : best))

  return [
    {
      emoji: '🏆',
      label: 'MVP del Torneo',
      winner: pickMax(p => p.total_points).nickname,
      detail: `${pickMax(p => p.total_points).total_points} pts`,
    },
    {
      emoji: '🎯',
      label: 'Francotirador',
      winner: pickMax(p => p.exact_scores).nickname,
      detail: `${pickMax(p => p.exact_scores).exact_scores} marcadores exactos`,
    },
    {
      emoji: '🔥',
      label: 'Mejor Racha',
      winner: pickMax(p => p.best_streak).nickname,
      detail: `${pickMax(p => p.best_streak).best_streak} partidos seguidos puntuando`,
    },
    {
      emoji: '⚡',
      label: 'En Racha Ahora',
      winner: pickMax(p => p.current_streak).nickname,
      detail: `${pickMax(p => p.current_streak).current_streak} seguidos actualmente`,
    },
    {
      emoji: '💀',
      label: 'El Roto',
      winner: pickMax(p => p.wrong_predictions).nickname,
      detail: `${pickMax(p => p.wrong_predictions).wrong_predictions} fallos`,
    },
    {
      emoji: '🤏',
      label: 'El Uyyy',
      winner: pickMax(p => p.missed_by_one).nickname,
      detail: `${pickMax(p => p.missed_by_one).missed_by_one} veces casi exacto`,
    },
    {
      emoji: '⚔️',
      label: 'Enemigo del Empate',
      winner: pickMin(p => p.predicted_draws).nickname,
      detail: `solo ${pickMin(p => p.predicted_draws).predicted_draws} empates predichos`,
    },
    {
      emoji: '⚽⚽⚽',
      label: 'Goleador de Salón',
      winner: pickMax(p => p.total_goals_predicted).nickname,
      detail: `${pickMax(p => p.total_goals_predicted).total_goals_predicted} goles predichos`,
    },
    {
      emoji: '🦁',
      label: 'Apuesta por el Débil',
      winner: pickMax(p => p.underdog_bets).nickname,
      detail: `${pickMax(p => p.underdog_bets).underdog_bets} apuestas por el inferior`,
    },
    {
      emoji: '📏',
      label: 'Más Alejado de la Realidad',
      winner: pickMax(p => p.avg_goal_error).nickname,
      detail: `${pickMax(p => p.avg_goal_error).avg_goal_error} de error medio`,
    },
  ]
}

// ─── Player card ──────────────────────────────────────────────────────────────

function PlayerCard({ player, rank }: { player: FunnyPlayerStats; rank: number }) {
  const [open, setOpen] = useState(false)

  const accuracy =
    player.total_predictions > 0
      ? Math.round(((player.exact_scores + player.diff_scores + player.correct_winners) / player.total_predictions) * 100)
      : 0

  const cumPoints = player.predictions.map(p => p.cumulative_points)

  return (
    <div className="bg-white dark:bg-slate-900 rounded-xl border border-gray-100 dark:border-slate-800 shadow-sm overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="w-full text-left p-4 flex items-center gap-3 hover:bg-gray-50 dark:hover:bg-slate-800/50 transition-colors"
      >
        <span className="w-7 h-7 flex items-center justify-center rounded-full bg-gray-100 dark:bg-slate-800 text-xs font-bold text-gray-500 dark:text-gray-400 flex-shrink-0">
          {rank}
        </span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-gray-900 dark:text-gray-100">{player.nickname}</span>
            {player.current_streak > 0 && (
              <Badge color="bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300">
                🔥 {player.current_streak} en racha
              </Badge>
            )}
            {player.leagues.map(l => (
              <Badge key={l.league_id} color="bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300">
                🏆 {l.league_name}
              </Badge>
            ))}
          </div>
          <div className="flex gap-2 mt-1.5 flex-wrap">
            <Badge color="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">
              {player.total_points} pts
            </Badge>
            <Badge color="bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300">
              🎯 {player.exact_scores} exactos
            </Badge>
            <Badge color="bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300">
              🤏 {player.missed_by_one} uyyyy
            </Badge>
            <Badge color="bg-gray-100 text-gray-600 dark:bg-slate-800 dark:text-gray-300">
              {accuracy}% aciertos
            </Badge>
          </div>
        </div>
        <span className="text-gray-400 dark:text-slate-500 text-sm flex-shrink-0">
          {open ? '▲' : '▼'}
        </span>
      </button>

      {open && (
        <div className="border-t border-gray-100 dark:border-slate-800 p-4 space-y-5">

          {/* Stats grid */}
          <div className="grid grid-cols-5 gap-2 sm:grid-cols-10">
            {stat(player.total_predictions, 'Pred.')}
            {stat(player.exact_scores, 'Exactos', '+3')}
            {stat(player.diff_scores, 'Dif.', '+2')}
            {stat(player.correct_winners, 'Ganador', '+1')}
            {stat(player.wrong_predictions, 'Fallos', '0')}
            {stat(player.missed_by_one, 'Uyyy', '±1 gol')}
            {stat(player.predicted_draws, 'Empates', 'pred.')}
            {stat(player.best_streak, 'Mejor', 'racha')}
            {stat(player.underdog_bets, 'Débiles')}
            {stat(player.underdog_wins, 'Débil✓')}
          </div>

          {/* Info boxes */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="bg-gray-50 dark:bg-slate-800 rounded-lg p-2.5">
              <p className="text-[10px] text-gray-500 dark:text-gray-400 uppercase tracking-wide">⚽ Goles predichos</p>
              <p className="text-sm font-bold text-gray-800 dark:text-gray-200 mt-0.5">
                {player.total_goals_predicted} total · {player.avg_goals_per_match} media
              </p>
            </div>
            <div className="bg-gray-50 dark:bg-slate-800 rounded-lg p-2.5">
              <p className="text-[10px] text-gray-500 dark:text-gray-400 uppercase tracking-wide">⏱ Antelación media</p>
              <p className="text-sm font-bold text-gray-800 dark:text-gray-200 mt-0.5">
                {minutesLabel(player.avg_minutes_before_kickoff)}
              </p>
            </div>
            <div className="bg-gray-50 dark:bg-slate-800 rounded-lg p-2.5">
              <p className="text-[10px] text-gray-500 dark:text-gray-400 uppercase tracking-wide">📏 Error de goles</p>
              <p className="text-sm font-bold text-gray-800 dark:text-gray-200 mt-0.5">
                {player.avg_goal_error} medio · max {player.max_goal_error}
              </p>
            </div>
            <div className="bg-gray-50 dark:bg-slate-800 rounded-lg p-2.5">
              <p className="text-[10px] text-gray-500 dark:text-gray-400 uppercase tracking-wide">🔥 Rachas</p>
              <p className="text-sm font-bold text-gray-800 dark:text-gray-200 mt-0.5">
                mejor {player.best_streak} · actual {player.current_streak}
              </p>
            </div>
          </div>

          {/* Evolución temporal */}
          {cumPoints.length >= 2 && (
            <div className="space-y-1.5">
              <p className="text-[10px] uppercase tracking-wide font-semibold text-gray-400 dark:text-slate-500">
                Evolución acumulada · {cumPoints[cumPoints.length - 1]} pts al final
              </p>
              <div className="bg-gray-50 dark:bg-slate-800 rounded-lg px-3 pt-2 pb-1 text-brand-blue dark:text-brand-teal">
                <Sparkline points={cumPoints} />
                <div className="flex justify-between text-[9px] text-gray-400 dark:text-slate-500 mt-0.5">
                  <span>J1</span>
                  <span>J{cumPoints.length}</span>
                </div>
              </div>
            </div>
          )}

          {/* Confederaciones */}
          <ConfederationTable data={player.by_confederation} />

          {/* Per-match detail */}
          <div className="space-y-1.5">
            <p className="text-[10px] uppercase tracking-wide font-semibold text-gray-400 dark:text-slate-500">
              Detalle de predicciones
            </p>
            <div className="divide-y divide-gray-100 dark:divide-slate-800 rounded-lg border border-gray-100 dark:border-slate-800 overflow-hidden">
              {player.predictions.map((pred, i) => {
                const ptColor =
                  pred.points_earned === 3 ? 'text-emerald-600 dark:text-emerald-400'
                  : pred.points_earned === 2 ? 'text-blue-600 dark:text-blue-400'
                  : pred.points_earned === 1 ? 'text-amber-600 dark:text-amber-400'
                  : 'text-red-500 dark:text-red-400'

                return (
                  <div key={i} className="flex items-center gap-2 px-3 py-2 text-xs bg-white dark:bg-slate-900">
                    <span className={`font-bold w-5 text-center flex-shrink-0 ${ptColor}`}>
                      {pred.points_earned}
                    </span>
                    <span className="w-8 tabular-nums text-gray-400 dark:text-slate-500 flex-shrink-0 text-[10px]">
                      {pred.cumulative_points}p
                    </span>
                    <span className="flex-1 text-gray-700 dark:text-gray-300 truncate font-medium">
                      {pred.match}
                    </span>
                    <span className="tabular-nums text-gray-500 dark:text-gray-400 flex-shrink-0">
                      {pred.pred_result}
                      <span className="text-gray-300 dark:text-slate-600 mx-1">·</span>
                      {pred.actual_result}
                    </span>
                    {pred.missed_by_one && <span title="Casi exacto (±1 gol)" className="flex-shrink-0">🤏</span>}
                    {pred.bet_on_underdog && <span title="Apostó por el inferior" className="flex-shrink-0">🦁</span>}
                    {pred.minutes_before_kickoff >= 0 && pred.minutes_before_kickoff <= 5 && (
                      <span title="Último minuto" className="flex-shrink-0">⚡</span>
                    )}
                  </div>
                )
              })}
            </div>
          </div>

        </div>
      )}
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function AdminFunnyStats({ initialPlayers, leagues }: Props) {
  const [players, setPlayers] = useState(initialPlayers)
  const [selectedLeague, setSelectedLeague] = useState<number | null>(null)
  const [isPending, startTransition] = useTransition()

  const awards = deriveAwards(players)

  function handleLeagueChange(value: string) {
    const leagueId = value === '' ? null : Number(value)
    setSelectedLeague(leagueId)
    startTransition(async () => {
      const result = await getFunnyStatsAction(leagueId)
      if (result.data) setPlayers(result.data)
      else if (result.error) toast.error(result.error)
    })
  }

  function buildAiPrompt() {
    const scopeName = leagues.find(l => l.id === selectedLeague)?.name ?? 'Global'
    const scope = selectedLeague ? `la liga privada "${scopeName}"` : 'todos los jugadores de la app'
    const context = {
      scope: scopeName,
      total_players: players.length,
      generated_at: new Date().toISOString(),
      players: players.map(p => ({
        nickname: p.nickname,
        leagues: p.leagues.map(l => l.league_name),
        total_points: p.total_points,
        exact_scores: p.exact_scores,
        diff_scores: p.diff_scores,
        correct_winners: p.correct_winners,
        wrong_predictions: p.wrong_predictions,
        missed_by_one: p.missed_by_one,
        predicted_draws: p.predicted_draws,
        best_streak: p.best_streak,
        current_streak: p.current_streak,
        underdog_bets: p.underdog_bets,
        underdog_wins: p.underdog_wins,
        total_goals_predicted: p.total_goals_predicted,
        avg_goals_per_match: p.avg_goals_per_match,
        avg_minutes_before_kickoff: p.avg_minutes_before_kickoff,
        last_minute_count: p.last_minute_count,
        avg_goal_error: p.avg_goal_error,
        by_confederation: p.by_confederation,
        evolution: p.predictions.map(pr => ({
          match: pr.match,
          points: pr.points_earned,
          cumulative: pr.cumulative_points,
        })),
      })),
    }

    return `Eres el animador oficial de la "Polla Mundialista 2026", un torneo de predicciones del Mundial entre amigos.

Con los siguientes datos de rendimiento de ${scope}, redacta premios divertidos, creativos y un poco sarcásticos para la ceremonia de clausura. Para cada jugador inventa un apodo o premio único basándote en sus estadísticas reales.

Usa un tono festivo, con humor y referencias al fútbol. Los premios deben ser originales y personalizados. Puedes inventar nombres de galardón como "El Submarino Nuclear", "La Bola de Cristal Rota", etc.

Datos clave:
- "missed_by_one": veces que falló el exacto por 1 gol (el "Uyyy")
- "predicted_draws": cuántos empates predijo (bajo = Enemigo del Empate)
- "best_streak/current_streak": racha de partidos consecutivos puntuando
- "by_confederation": puntos por confederación (UEFA, CONMEBOL, CAF, AFC, CONCACAF, OFC)
- "evolution": curva de puntos acumulados partido a partido
- "underdog_bets/wins": apostó por equipos inferiores (ranking FIFA > 15 puestos de diferencia)
- "avg_minutes_before_kickoff": antelación media para predecir

DATOS:
${JSON.stringify(context, null, 2)}`
  }

  function copyToClipboard(text: string, label: string) {
    navigator.clipboard.writeText(text).then(
      () => toast.success(`${label} copiado al portapapeles`),
      () => toast.error('No se pudo copiar'),
    )
  }

  const selectedLeagueName = leagues.find(l => l.id === selectedLeague)?.name

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white dark:bg-slate-900 rounded-xl border border-gray-100 dark:border-slate-800 shadow-sm p-5 flex flex-col gap-4">
        <div className="flex flex-col sm:flex-row sm:items-center gap-4">
          <div className="flex-1">
            <h1 className="text-base font-bold text-gray-900 dark:text-gray-100">
              🏅 Estadísticas para premios
            </h1>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
              {isPending
                ? 'Cargando…'
                : `${players.length} jugadores · ${selectedLeagueName ? `Liga: ${selectedLeagueName}` : 'Vista global'}`}
            </p>
          </div>
          <div className="flex gap-2 flex-wrap">
            <button
              type="button"
              onClick={() => copyToClipboard(buildAiPrompt(), 'Prompt para IA')}
              disabled={isPending || players.length === 0}
              className="px-3.5 py-2 rounded-lg bg-brand-blue dark:bg-brand-teal text-white text-xs font-semibold hover:opacity-90 transition-opacity disabled:opacity-40"
            >
              🤖 Copiar prompt para IA
            </button>
            <button
              type="button"
              onClick={() => copyToClipboard(JSON.stringify(players, null, 2), 'JSON completo')}
              disabled={isPending || players.length === 0}
              className="px-3.5 py-2 rounded-lg border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-gray-700 dark:text-gray-300 text-xs font-semibold hover:bg-gray-50 dark:hover:bg-slate-700 transition-colors disabled:opacity-40"
            >
              📋 Copiar JSON
            </button>
          </div>
        </div>

        {leagues.length > 0 && (
          <div className="flex items-center gap-3">
            <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 flex-shrink-0">
              Filtrar por liga:
            </span>
            <select
              value={selectedLeague ?? ''}
              onChange={e => handleLeagueChange(e.target.value)}
              disabled={isPending}
              className="flex-1 max-w-xs rounded-lg border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-gray-900 dark:text-gray-100 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue disabled:opacity-50"
            >
              <option value="">🌍 Global (todos los jugadores)</option>
              {leagues.map(l => (
                <option key={l.id} value={l.id}>🏆 {l.name}</option>
              ))}
            </select>
          </div>
        )}
      </div>

      {players.length === 0 && !isPending && (
        <div className="text-center py-16 text-gray-400 dark:text-slate-500 text-sm">
          No hay partidos finalizados con predicciones todavía.
        </div>
      )}

      {players.length > 0 && (
        <>
          {/* Awards */}
          <div className={`bg-white dark:bg-slate-900 rounded-xl border border-gray-100 dark:border-slate-800 shadow-sm p-5 transition-opacity ${isPending ? 'opacity-50' : ''}`}>
            <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500 mb-3">
              Premios preliminares
            </h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
              {awards.map((a, i) => (
                <div key={i} className="bg-gray-50 dark:bg-slate-800 rounded-lg p-3 flex flex-col gap-1">
                  <span className="text-xl leading-none">{a.emoji}</span>
                  <span className="text-[10px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 mt-0.5">{a.label}</span>
                  <span className="text-sm font-bold text-gray-900 dark:text-gray-100">{a.winner}</span>
                  <span className="text-xs text-gray-500 dark:text-gray-400">{a.detail}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Player cards */}
          <div className={`space-y-2 transition-opacity ${isPending ? 'opacity-50 pointer-events-none' : ''}`}>
            <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500 px-1">
              Detalle por jugador
            </h2>
            {players.map((player, i) => (
              <PlayerCard key={player.profile_id} player={player} rank={i + 1} />
            ))}
          </div>
        </>
      )}
    </div>
  )
}
