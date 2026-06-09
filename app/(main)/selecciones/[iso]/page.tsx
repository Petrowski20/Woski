import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/utils/supabase/server'
import { getServerLang, tServer } from '@/utils/i18n-server'
import { getFlagUrl } from '@/utils/getFlagUrl'

interface Team {
  id: number
  name: string
  iso_code: string
  flag_emoji: string | null
  group_letter: string | null
  fifa_ranking: number | null
  manager: string | null
  manager_nationality?: string | null
  confederation: string | null
  world_cups_won: number
  last_wc_result: string | null
  seudonimo: string | null
}

interface Player {
  id: number
  squad_number: number | null
  name: string
  position: 'GK' | 'DF' | 'MF' | 'FW'
  date_of_birth: string | null
  height_cm: number | null
  club: string | null
  caps: number
  intl_goals: number
  transfermarkt_id: number | null
}

const CONF_STYLES: Record<string, string> = {
  UEFA:     'bg-blue-100   text-blue-700   dark:bg-blue-900/40   dark:text-blue-400',
  CONMEBOL: 'bg-green-100  text-green-700  dark:bg-green-900/40  dark:text-green-400',
  CAF:      'bg-amber-100  text-amber-700  dark:bg-amber-900/40  dark:text-amber-400',
  AFC:      'bg-red-100    text-red-700    dark:bg-red-900/40    dark:text-red-400',
  CONCACAF: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-400',
  OFC:      'bg-teal-100   text-teal-700   dark:bg-teal-900/40   dark:text-teal-400',
}

const POS_STYLES: Record<string, string> = {
  GK: 'bg-teal-100  text-teal-700  dark:bg-teal-900/40  dark:text-teal-400',
  DF: 'bg-blue-100  text-blue-700  dark:bg-blue-900/40  dark:text-blue-400',
  MF: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400',
  FW: 'bg-red-100   text-red-700   dark:bg-red-900/40   dark:text-red-400',
}

// Edad en años en la fecha de inicio del torneo
const TOURNAMENT_START = new Date('2026-06-11')
function calcAge(dob: string | null): number | null {
  if (!dob) return null
  const birth = new Date(dob)
  let age = TOURNAMENT_START.getFullYear() - birth.getFullYear()
  const m = TOURNAMENT_START.getMonth() - birth.getMonth()
  if (m < 0 || (m === 0 && TOURNAMENT_START.getDate() < birth.getDate())) age--
  return age
}

const TM_BASE = 'https://www.transfermarkt.com/x/profil/spieler'

export default async function SeleccionDetailPage({
  params,
}: {
  params: Promise<{ iso: string }>
}) {
  const { iso } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const lang = await getServerLang()
  const t = (key: string, vars?: Record<string, string | number>) => tServer(lang, key, vars)

  const { data: teamData } = await supabase
    .from('teams')
    .select('id, name, iso_code, flag_emoji, group_letter, fifa_ranking, manager, manager_nationality, confederation, world_cups_won, last_wc_result, seudonimo')
    .eq('iso_code', iso.toUpperCase())
    .single()

  const team = teamData as Team | null
  if (!team) notFound()

  const { data: playersRaw } = await supabase
    .from('players')
    .select('id, squad_number, name, position, date_of_birth, height_cm, club, caps, intl_goals, transfermarkt_id')
    .eq('team_id', team.id)
    .order('squad_number', { ascending: true })

  const players = (playersRaw ?? []) as Player[]

  const flagUrl = getFlagUrl(team.flag_emoji ?? '', team.iso_code)
  const managerFlagUrl = team.manager_nationality ? getFlagUrl(team.manager_nationality) : ''

  // Orden de posiciones para mostrar
  const POS_ORDER = ['GK', 'DF', 'MF', 'FW']
  const sortedPlayers = [...players].sort((a, b) => {
    const pi = POS_ORDER.indexOf(a.position)
    const pj = POS_ORDER.indexOf(b.position)
    if (pi !== pj) return pi - pj
    return (a.squad_number ?? 99) - (b.squad_number ?? 99)
  })

  return (
    <div className="w-full max-w-5xl mx-auto">

      {/* Volver */}
      <Link
        href="/selecciones"
        className="inline-flex items-center gap-1.5 text-sm text-gray-500 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 mb-5 transition-colors"
      >
        {t('selecciones.volver')}
      </Link>

      {/* ── Cabecera del equipo ── */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-[#FFD6D1] dark:border-slate-800 p-6 mb-6 shadow-sm">
        <div className="flex flex-col sm:flex-row gap-5 items-start sm:items-center">

          {/* Bandera grande */}
          <div className="shrink-0">
            {flagUrl ? (
              <img src={flagUrl} alt={team.name} className="w-20 h-14 object-cover rounded-lg shadow-md border border-gray-200/60 dark:border-slate-700" />
            ) : (
              <span className="text-6xl leading-none">{team.flag_emoji ?? '🏳'}</span>
            )}
          </div>

          {/* Datos principales */}
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2 mb-1">
              <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">{team.name}</h1>
              <span className="font-mono text-sm font-bold text-gray-400 dark:text-gray-500">{team.iso_code}</span>
              {team.seudonimo && (
                <span className="text-sm italic text-gray-400 dark:text-gray-500">«{team.seudonimo}»</span>
              )}
              {team.group_letter && (
                <span className="text-xs font-semibold bg-[#FFD6D1]/60 dark:bg-slate-800 text-gray-600 dark:text-gray-300 px-2 py-0.5 rounded-full">
                  {t('selecciones.grupo', { letter: team.group_letter })}
                </span>
              )}
              {team.confederation && (
                <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${CONF_STYLES[team.confederation] ?? 'bg-gray-100 text-gray-600'}`}>
                  {team.confederation}
                </span>
              )}
            </div>

            <div className="flex flex-wrap gap-x-5 gap-y-1.5 text-sm text-gray-500 dark:text-gray-400 mt-2">
              {team.fifa_ranking && (
                <span>
                  <span className="text-gray-400 dark:text-slate-500 mr-1">{t('selecciones.rankingFifa')}</span>
                  <span className="font-semibold text-gray-700 dark:text-gray-200">#{team.fifa_ranking}</span>
                </span>
              )}
              {team.manager && (
                <span>
                  <span className="text-gray-400 dark:text-slate-500 mr-1">{t('selecciones.seleccionador')}</span>
                  <span className="inline-flex items-center gap-1.5">
                    {managerFlagUrl
                      ? <img src={managerFlagUrl} alt="" className="w-5 h-[14px] object-cover rounded-[2px] shadow-sm flex-shrink-0" />
                      : <span>🧑‍💼</span>
                    }
                    <span className="font-semibold text-gray-700 dark:text-gray-200">{team.manager}</span>
                  </span>
                </span>
              )}
              {team.world_cups_won > 0 && (
                <span>
                  <span className="text-gray-400 dark:text-slate-500 mr-1">{t('selecciones.mundiales')}</span>
                  <span className="font-semibold text-gray-700 dark:text-gray-200">
                    {'🏆'.repeat(Math.min(team.world_cups_won, 5))} ×{team.world_cups_won}
                  </span>
                </span>
              )}
              {team.last_wc_result && (
                <span>
                  <span className="text-gray-400 dark:text-slate-500 mr-1">{t('selecciones.ultimoResultado')}</span>
                  <span className="font-semibold text-gray-700 dark:text-gray-200">{team.last_wc_result}</span>
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ── Tabla de jugadores ── */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-[#FFD6D1] dark:border-slate-800 overflow-hidden shadow-sm">
        <div className="px-5 py-4 border-b border-gray-100 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="font-bold text-gray-900 dark:text-gray-100">
              {t('selecciones.squad.title')}
              {players.length > 0 && (
                <span className="ml-2 text-sm font-normal text-gray-400 dark:text-gray-500">({players.length})</span>
              )}
            </h2>
            {players.length > 0 && (
              <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">{t('selecciones.squad.preInfo')}</p>
            )}
          </div>
        </div>

        {sortedPlayers.length === 0 ? (
          <div className="py-14 text-center text-sm text-gray-400 dark:text-slate-500">
            {t('selecciones.squad.sinJugadores')}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 dark:border-slate-800 text-xs uppercase tracking-wider text-gray-400 dark:text-gray-500">
                  <th className="px-4 py-3 text-center w-8">{t('selecciones.squad.cols.dorsal')}</th>
                  <th className="px-4 py-3 text-left">{t('selecciones.squad.cols.jugador')}</th>
                  <th className="px-3 py-3 text-center w-12">{t('selecciones.squad.cols.pos')}</th>
                  <th className="px-3 py-3 text-center w-12">{t('selecciones.squad.cols.edad')}</th>
                  <th className="px-3 py-3 text-center w-12">{t('selecciones.squad.cols.altura')}</th>
                  <th className="px-4 py-3 text-left">{t('selecciones.squad.cols.club')}</th>
                  <th className="px-3 py-3 text-center w-12">{t('selecciones.squad.cols.pj')}</th>
                  <th className="px-3 py-3 text-center w-16">{t('selecciones.squad.cols.goles')}</th>
                  <th className="px-3 py-3 w-10" />
                </tr>
              </thead>
              <tbody>
                {sortedPlayers.map(player => {
                  const age = calcAge(player.date_of_birth)
                  return (
                    <tr
                      key={player.id}
                      className="border-b border-gray-50 dark:border-slate-800/50 last:border-0 hover:bg-gray-50 dark:hover:bg-slate-800/30 transition-colors"
                    >
                      {/* Dorsal */}
                      <td className="px-4 py-3 text-center">
                        <span className="text-xs font-mono font-bold text-gray-400 dark:text-slate-500">
                          {player.squad_number ?? '—'}
                        </span>
                      </td>

                      {/* Nombre */}
                      <td className="px-4 py-3">
                        <span className="font-semibold text-gray-900 dark:text-gray-100">{player.name}</span>
                      </td>

                      {/* Posición */}
                      <td className="px-3 py-3 text-center">
                        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${POS_STYLES[player.position] ?? ''}`}>
                          {player.position}
                        </span>
                      </td>

                      {/* Edad */}
                      <td className="px-3 py-3 text-center text-xs text-gray-500 dark:text-gray-400">
                        {age ?? '—'}
                      </td>

                      {/* Altura */}
                      <td className="px-3 py-3 text-center text-xs text-gray-500 dark:text-gray-400">
                        {player.height_cm ? `${player.height_cm} cm` : '—'}
                      </td>

                      {/* Club */}
                      <td className="px-4 py-3 text-xs text-gray-600 dark:text-gray-300 max-w-[160px] truncate">
                        {player.club ?? '—'}
                      </td>

                      {/* Partidos internacionales */}
                      <td className="px-3 py-3 text-center text-xs font-medium text-gray-700 dark:text-gray-300">
                        {player.caps}
                      </td>

                      {/* Goles internacionales */}
                      <td className="px-3 py-3 text-center text-xs font-medium text-gray-700 dark:text-gray-300">
                        {player.intl_goals}
                      </td>

                      {/* Link Transfermarkt */}
                      <td className="px-3 py-3 text-center">
                        {player.transfermarkt_id ? (
                          <a
                            href={`${TM_BASE}/${player.transfermarkt_id}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            title={t('selecciones.squad.verPerfil')}
                            className="inline-flex items-center justify-center w-7 h-7 rounded-lg text-gray-300 dark:text-slate-600 hover:text-blue-500 dark:hover:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors"
                          >
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                            </svg>
                          </a>
                        ) : (
                          <span className="text-gray-200 dark:text-slate-700">—</span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
