import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/utils/supabase/server'
import { getServerLang, tServer } from '@/utils/i18n-server'
import { getFlagUrl } from '@/utils/getFlagUrl'

interface Team {
  id: number
  name: string
  iso_code: string
  flag_emoji: string | null
  fifa_ranking: number | null
  manager: string | null
  confederation: string | null
  world_cups_won: number
  last_wc_result: string | null
  seudonimo: string | null
  // derivado de los partidos, no de la columna teams.group_letter
  groupLetter: string
}

const CONF_STYLES: Record<string, string> = {
  UEFA:     'bg-blue-100   text-blue-700   dark:bg-blue-900/40   dark:text-blue-400',
  CONMEBOL: 'bg-green-100  text-green-700  dark:bg-green-900/40  dark:text-green-400',
  CAF:      'bg-amber-100  text-amber-700  dark:bg-amber-900/40  dark:text-amber-400',
  AFC:      'bg-red-100    text-red-700    dark:bg-red-900/40    dark:text-red-400',
  CONCACAF: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-400',
  OFC:      'bg-teal-100   text-teal-700   dark:bg-teal-900/40   dark:text-teal-400',
}

function TeamFlag({ team }: { team: Team }) {
  const url = getFlagUrl(team.flag_emoji ?? '', team.iso_code)
  if (url) return <img src={url} alt={team.name} className="w-10 h-7 object-cover rounded shadow-sm shrink-0" />
  return <span className="text-2xl leading-none shrink-0">{team.flag_emoji ?? '🏳'}</span>
}

export default async function SeleccionesPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const lang = await getServerLang()
  const t = (key: string, vars?: Record<string, string | number>) => tServer(lang, key, vars)

  const [teamsRes, matchesRes] = await Promise.all([
    supabase
      .from('teams')
      .select('id, name, iso_code, flag_emoji, fifa_ranking, manager, confederation, world_cups_won, last_wc_result, seudonimo')
      .order('name', { ascending: true }),
    supabase
      .from('matches')
      .select('group_letter, home_team_id, away_team_id')
      .eq('stage', 'GROUP'),
  ])

  // Mapa team_id → group_letter derivado de los partidos (fuente fiable)
  const teamGroupMap = new Map<number, string>()
  for (const m of matchesRes.data ?? []) {
    if (m.group_letter) {
      teamGroupMap.set(m.home_team_id, m.group_letter)
      teamGroupMap.set(m.away_team_id, m.group_letter)
    }
  }

  // Fusionar equipo + grupo derivado
  const teamsWithGroup: Team[] = (teamsRes.data ?? []).map((t: any) => ({
    ...t,
    groupLetter: teamGroupMap.get(t.id) ?? '?',
  }))

  // Agrupar y ordenar
  const grouped = new Map<string, Team[]>()
  for (const team of teamsWithGroup) {
    if (!grouped.has(team.groupLetter)) grouped.set(team.groupLetter, [])
    grouped.get(team.groupLetter)!.push(team)
  }

  const groups = Array.from(grouped.entries()).sort(([a], [b]) => a.localeCompare(b))

  return (
    <div className="w-full max-w-6xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">{t('selecciones.title')}</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{t('selecciones.subtitle')}</p>
      </div>

      <div className="space-y-8">
        {groups.map(([letter, groupTeams]) => (
          <div key={letter}>
            <h2 className="text-xs font-bold uppercase tracking-widest text-gray-400 dark:text-gray-500 mb-3 pl-1">
              {t('selecciones.grupo', { letter: letter === '?' ? '—' : letter })}
            </h2>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {groupTeams.map(team => (
                <Link
                  key={team.id}
                  href={`/selecciones/${team.iso_code.toLowerCase()}`}
                  className="bg-white dark:bg-slate-900 rounded-xl border border-[#FFD6D1] dark:border-slate-800 p-4 flex flex-col gap-3 hover:shadow-md hover:border-[#ffbdb5] dark:hover:border-slate-600 transition-all group"
                >
                  {/* Cabecera: bandera + nombre + seudónimo */}
                  <div className="flex items-center gap-3">
                    <TeamFlag team={team} />
                    <div className="min-w-0">
                      <p className="font-bold text-sm text-gray-900 dark:text-gray-100 leading-tight truncate group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                        {team.name}
                      </p>
                      {team.seudonimo ? (
                        <p className="text-[11px] text-gray-400 dark:text-gray-500 truncate leading-tight mt-0.5">
                          {team.seudonimo}
                        </p>
                      ) : (
                        <p className="font-mono text-[11px] font-semibold text-gray-400 dark:text-gray-500 tracking-wide">
                          {team.iso_code}
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Metadatos */}
                  <div className="flex flex-col gap-1.5 text-xs text-gray-500 dark:text-gray-400">
                    {team.fifa_ranking && (
                      <span className="flex items-center gap-1.5">
                        <span className="text-gray-300 dark:text-slate-600">↑</span>
                        {t('selecciones.rankingFifa')} #{team.fifa_ranking}
                      </span>
                    )}
                    {team.manager && (
                      <span className="truncate" title={team.manager}>
                        🧑‍💼 {team.manager}
                      </span>
                    )}
                    {team.last_wc_result && (
                      <span className="truncate">
                        <span className="text-gray-400 dark:text-gray-500">Qatar 2022: </span>
                        {team.last_wc_result}
                      </span>
                    )}
                  </div>

                  {/* Footer: CTA */}
                  <div className="flex items-center justify-end mt-auto pt-1">
                    <span className="text-[11px] text-blue-500 dark:text-blue-400 font-medium group-hover:underline">
                      {t('selecciones.verPlantilla')} →
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
