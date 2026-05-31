'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { saveMatchResultAction, createMatchAction } from '@/app/(main)/admin/actions'
import { getFlagUrl } from '@/utils/getFlagUrl'

interface Team { name: string; flag_emoji: string }

export interface TeamOption { id: number; name: string; flag_emoji: string }

export interface AdminMatch {
  id: number
  match_date: string
  stage: string
  group_letter: string | null
  matchday: number | null
  status: string
  home_goals: number | null
  away_goals: number | null
  home_team: Team | null
  away_team: Team | null
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
        {/* Cabecera */}
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

        {/* Formulario */}
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {/* Equipos */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1">
                Equipo Local *
              </label>
              <select
                value={homeTeamId}
                onChange={(e) => setHomeTeamId(e.target.value)}
                required
                className={fieldClass}
              >
                <option value="">Seleccionar…</option>
                {teams.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.flag_emoji} {t.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1">
                Equipo Visitante *
              </label>
              <select
                value={awayTeamId}
                onChange={(e) => setAwayTeamId(e.target.value)}
                required
                className={fieldClass}
              >
                <option value="">Seleccionar…</option>
                {teams.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.flag_emoji} {t.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Fecha y Hora */}
          <div>
            <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1">
              Fecha y Hora *
            </label>
            <input
              type="datetime-local"
              value={matchDate}
              onChange={(e) => setMatchDate(e.target.value)}
              required
              className={fieldClass}
            />
          </div>

          {/* Fase + Grupo */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1">
                Fase *
              </label>
              <select
                value={stage}
                onChange={(e) => setStage(e.target.value)}
                required
                className={fieldClass}
              >
                {Object.entries(STAGE_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label
                className={`block text-xs font-semibold mb-1 transition-colors ${
                  stage === 'GROUP'
                    ? 'text-gray-500 dark:text-gray-400'
                    : 'text-gray-300 dark:text-slate-600'
                }`}
              >
                Grupo {stage === 'GROUP' ? '*' : '(N/A)'}
              </label>
              <select
                value={groupLetter}
                onChange={(e) => setGroupLetter(e.target.value)}
                disabled={stage !== 'GROUP'}
                className={`${fieldClass} ${stage !== 'GROUP' ? 'opacity-40 cursor-not-allowed' : ''}`}
              >
                {GROUPS.map((g) => (
                  <option key={g} value={g}>
                    Grupo {g}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Estadio + Árbitro */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1">
                Estadio
              </label>
              <input
                type="text"
                value={stadium}
                onChange={(e) => setStadium(e.target.value)}
                placeholder="Ej. Lusail Stadium"
                className={fieldClass}
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1">
                Árbitro
              </label>
              <input
                type="text"
                value={referee}
                onChange={(e) => setReferee(e.target.value)}
                placeholder="Nombre del árbitro"
                className={fieldClass}
              />
            </div>
          </div>

          {/* Acciones */}
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

function MatchRow({ match }: { match: AdminMatch }) {
  const [homeGoals, setHomeGoals] = useState(match.home_goals?.toString() ?? '')
  const [awayGoals, setAwayGoals] = useState(match.away_goals?.toString() ?? '')
  const [isSubmitting, setIsSubmitting] = useState(false)

  const isFinished = match.status === 'FINISHED'

  const handleSave = async () => {
    const home = parseInt(homeGoals, 10)
    const away = parseInt(awayGoals, 10)

    if (isNaN(home) || isNaN(away) || home < 0 || away < 0) {
      toast.error('Introduce un resultado válido (ambos campos, número ≥ 0)')
      return
    }

    setIsSubmitting(true)
    const result = await saveMatchResultAction(match.id, home, away)
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
    'w-14 text-center border rounded-lg px-2 py-1.5 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-brand-blue focus:border-transparent transition-colors ' +
    'bg-white dark:bg-slate-800 border-gray-200 dark:border-slate-600 text-gray-900 dark:text-gray-100 ' +
    'disabled:opacity-50 disabled:bg-gray-50 dark:disabled:bg-slate-700'

  return (
    <tr
      className={`transition-colors hover:bg-gray-50/60 dark:hover:bg-slate-800/40 ${
        isFinished ? 'bg-emerald-50/40 dark:bg-emerald-950/20' : ''
      }`}
    >
      {/* Fecha */}
      <td className="px-4 py-3 whitespace-nowrap">
        <span className="font-medium text-gray-800 dark:text-gray-200 text-sm">{dateStr}</span>
        <span className="block text-xs text-gray-400 dark:text-gray-500">{timeStr}</span>
      </td>

      {/* Partido */}
      <td className="px-4 py-3">
        <div className="flex items-center gap-2 text-sm">
          {match.home_team?.flag_emoji && (
            <img src={getFlagUrl(match.home_team.flag_emoji)} alt={match.home_team.name} className="w-6 h-4 object-cover rounded-sm shadow-sm flex-shrink-0" />
          )}
          <span className="font-semibold text-gray-900 dark:text-gray-100 hidden sm:inline">
            {match.home_team?.name}
          </span>
          <span className="text-gray-300 dark:text-slate-600 text-xs font-medium">vs</span>
          <span className="font-semibold text-gray-900 dark:text-gray-100 hidden sm:inline">
            {match.away_team?.name}
          </span>
          {match.away_team?.flag_emoji && (
            <img src={getFlagUrl(match.away_team.flag_emoji)} alt={match.away_team.name} className="w-6 h-4 object-cover rounded-sm shadow-sm flex-shrink-0" />
          )}
        </div>
        <div className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
          {STAGE_LABELS[match.stage] ?? match.stage}
          {match.group_letter && ` · Grupo ${match.group_letter}`}
          {match.matchday && ` · J${match.matchday}`}
        </div>
      </td>

      {/* Estado */}
      <td className="px-4 py-3 text-center whitespace-nowrap">
        <span
          className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${
            isFinished
              ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400'
              : match.status === 'IN_PROGRESS'
              ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400'
              : match.status === 'CANCELLED'
              ? 'bg-red-100 text-red-600 dark:bg-red-900/40 dark:text-red-400'
              : 'bg-gray-100 text-gray-600 dark:bg-slate-700 dark:text-slate-400'
          }`}
        >
          {isFinished
            ? `${match.home_goals} – ${match.away_goals}`
            : match.status === 'IN_PROGRESS'
            ? 'En curso'
            : match.status === 'CANCELLED'
            ? 'Cancelado'
            : 'Pendiente'}
        </span>
      </td>

      {/* Inputs resultado */}
      <td className="px-4 py-3">
        <div className="flex items-center justify-center gap-2">
          <input
            type="number"
            min={0}
            max={99}
            value={homeGoals}
            onChange={(e) => setHomeGoals(e.target.value)}
            onKeyDown={(e) => { if (['e', 'E', '+', '-', '.', ','].includes(e.key)) e.preventDefault(); }}
            onInput={(e) => { if (e.currentTarget.value.length > 2) e.currentTarget.value = e.currentTarget.value.slice(0, 2); }}
            disabled={isSubmitting}
            placeholder="—"
            className={inputBase}
          />
          <span className="text-gray-300 dark:text-slate-600 font-bold text-sm select-none">–</span>
          <input
            type="number"
            min={0}
            max={99}
            value={awayGoals}
            onChange={(e) => setAwayGoals(e.target.value)}
            onKeyDown={(e) => { if (['e', 'E', '+', '-', '.', ','].includes(e.key)) e.preventDefault(); }}
            onInput={(e) => { if (e.currentTarget.value.length > 2) e.currentTarget.value = e.currentTarget.value.slice(0, 2); }}
            disabled={isSubmitting}
            placeholder="—"
            className={inputBase}
          />
        </div>
      </td>

      {/* Acción */}
      <td className="px-4 py-3 text-center">
        <button
          onClick={handleSave}
          disabled={isSubmitting || isFinished}
          className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all active:scale-95 whitespace-nowrap ${
            isFinished
              ? 'bg-gray-100 text-gray-400 cursor-not-allowed dark:bg-slate-700 dark:text-slate-500'
              : isSubmitting
              ? 'opacity-70 cursor-wait bg-gradient-to-r from-brand-blue to-brand-teal text-white'
              : 'bg-gradient-to-r from-brand-blue to-brand-teal text-white hover:opacity-90 shadow-sm'
          }`}
        >
          {isSubmitting ? 'Calculando…' : isFinished ? '✓ Listo' : '💾 Guardar y Calcular'}
        </button>
      </td>
    </tr>
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

  const pending  = initialMatches.filter(m => m.status !== 'FINISHED' && m.status !== 'CANCELLED').length
  const finished = initialMatches.filter(m => m.status === 'FINISHED').length

  return (
    <div className="w-full space-y-6">
      {/* Cabecera */}
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
            Panel de Administración
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            Introduce los resultados reales para calcular puntos automáticamente.
          </p>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          {/* Stat: Pendientes */}
          <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-100 dark:border-amber-800/40 rounded-xl px-4 py-2 text-center min-w-[68px]">
            <p className="text-xl font-bold text-amber-700 dark:text-amber-400">{pending}</p>
            <p className="text-xs text-amber-600 dark:text-amber-500">Pendientes</p>
          </div>

          {/* Stat: Finalizados */}
          <div className="bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-100 dark:border-emerald-800/40 rounded-xl px-4 py-2 text-center min-w-[68px]">
            <p className="text-xl font-bold text-emerald-700 dark:text-emerald-400">{finished}</p>
            <p className="text-xs text-emerald-600 dark:text-emerald-500">Finalizados</p>
          </div>

          {/* Botón Añadir Partido */}
          <button
            onClick={() => setShowAddModal(true)}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold bg-gradient-to-r from-brand-blue to-brand-teal text-white hover:opacity-90 transition-all active:scale-95 shadow-sm"
          >
            <span>➕</span>
            Añadir Partido
          </button>
        </div>
      </div>

      {/* Tabla */}
      <div className="bg-white dark:bg-slate-900 rounded-xl shadow-sm border border-gray-200 dark:border-slate-800 overflow-x-auto">
        <table className="w-full text-sm min-w-[680px]">
          <thead>
            <tr className="bg-gray-50 dark:bg-slate-800/60 border-b border-gray-100 dark:border-slate-800">
              {['Fecha', 'Partido', 'Estado', 'Resultado real', 'Acción'].map((h) => (
                <th
                  key={h}
                  className="px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide first:text-left text-center last:text-center"
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50 dark:divide-slate-800">
            {initialMatches.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-14 text-center text-gray-400 dark:text-slate-500">
                  No hay partidos en la base de datos.
                </td>
              </tr>
            ) : (
              initialMatches.map((match) => <MatchRow key={match.id} match={match} />)
            )}
          </tbody>
        </table>
      </div>

      {/* Modal */}
      {showAddModal && (
        <AddMatchModal
          teams={teams}
          onClose={() => setShowAddModal(false)}
        />
      )}
    </div>
  )
}
