'use client'

import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { setPlayerHiddenAction } from '@/app/(main)/admin/actions'

export interface PlayerRankingRow {
  profile_id: string
  nickname: string
  avatar_url: string | null
  total_points: number
  is_hidden: boolean
  day_points: number
  match_day: string | null
}

interface Props {
  players: PlayerRankingRow[]
}

const MEDALS = ['🥇', '🥈', '🥉']

export default function AdminJugadoresManager({ players }: Props) {
  const [hiddenMap, setHiddenMap] = useState<Record<string, boolean>>(
    Object.fromEntries(players.map(p => [p.profile_id, p.is_hidden]))
  )
  const [pendingMap, setPendingMap] = useState<Record<string, boolean>>({})
  const [, startTransition] = useTransition()

  const matchDay = players[0]?.match_day
    ? new Date(players[0].match_day + 'T12:00:00Z').toLocaleDateString('es-ES', {
        day: 'numeric',
        month: 'long',
      })
    : null

  function toggle(profileId: string) {
    const newValue = !hiddenMap[profileId]
    setHiddenMap(prev => ({ ...prev, [profileId]: newValue }))
    setPendingMap(prev => ({ ...prev, [profileId]: true }))
    startTransition(async () => {
      const result = await setPlayerHiddenAction(profileId, newValue)
      setPendingMap(prev => ({ ...prev, [profileId]: false }))
      if (result.error) {
        setHiddenMap(prev => ({ ...prev, [profileId]: !newValue }))
        toast.error(result.error)
      }
    })
  }

  const visiblePlayers = players.filter(p => !hiddenMap[p.profile_id])
  const topDay = visiblePlayers.length > 0
    ? Math.max(...visiblePlayers.map(p => p.day_points))
    : 0

  return (
    <div className="w-full">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">👥 Jugadores</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
          Clasificación, puntos del último día y visibilidad pública
        </p>
      </div>

      {matchDay && (
        <div className="mb-4 px-4 py-2 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 rounded-lg text-sm text-emerald-700 dark:text-emerald-400">
          La columna <strong>{matchDay}</strong> muestra los puntos ganados en los partidos de ese día.
        </div>
      )}

      <div className="bg-white dark:bg-slate-900 rounded-xl shadow-sm border border-[#FFD6D1] dark:border-slate-800 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-[#FFD6D1]/30 dark:bg-slate-800/50 border-b border-[#FFD6D1] dark:border-slate-800 text-xs uppercase tracking-wider text-gray-500 dark:text-gray-400">
              <th className="px-4 py-3 text-center w-10">Pos.</th>
              <th className="px-4 py-3 text-left">Jugador</th>
              <th className="px-3 py-3 text-center">Total</th>
              {matchDay && (
                <th className="px-3 py-3 text-center">{matchDay}</th>
              )}
              <th className="px-4 py-3 text-center w-20">Visible</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-slate-800">
            {players.map((player, i) => {
              const isHidden = hiddenMap[player.profile_id]
              const isPending = pendingMap[player.profile_id]
              const isMvpDay = !isHidden && player.day_points > 0 && player.day_points === topDay

              return (
                <tr
                  key={player.profile_id}
                  className={`transition-opacity ${isHidden ? 'opacity-40' : ''}`}
                >
                  <td className="px-4 py-3 text-center font-mono text-gray-500 dark:text-gray-400 text-xs">
                    {i + 1}
                  </td>
                  <td className="px-4 py-3">
                    <span className="font-semibold text-gray-900 dark:text-gray-100">
                      {player.nickname}
                    </span>
                    {isHidden && (
                      <span className="ml-2 text-[10px] text-gray-400 dark:text-slate-500 font-normal">
                        oculto
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-3 text-center font-bold tabular-nums text-gray-900 dark:text-gray-100">
                    {player.total_points}
                  </td>
                  {matchDay && (
                    <td className="px-3 py-3 text-center tabular-nums">
                      {player.day_points > 0 ? (
                        <span className={`font-bold ${isMvpDay ? 'text-amber-500 dark:text-amber-400' : 'text-emerald-600 dark:text-emerald-400'}`}>
                          {isMvpDay && '⭐ '}+{player.day_points}
                        </span>
                      ) : (
                        <span className="text-gray-300 dark:text-slate-600">—</span>
                      )}
                    </td>
                  )}
                  <td className="px-4 py-3 text-center">
                    <button
                      onClick={() => toggle(player.profile_id)}
                      disabled={isPending}
                      title={isHidden ? 'Mostrar en clasificación' : 'Ocultar de clasificación'}
                      className="text-xl transition-all disabled:opacity-30 hover:scale-110 cursor-pointer"
                    >
                      {isHidden ? '🙈' : '👁️'}
                    </button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <p className="mt-3 text-xs text-gray-400 dark:text-slate-500 text-center">
        Los jugadores ocultos no aparecen en la clasificación pública ni en premios, pero sus datos se conservan.
      </p>
    </div>
  )
}
