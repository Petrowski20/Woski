import { createClient } from '@/utils/supabase/server'
import { createClient as createSVClient } from '@supabase/supabase-js'
import { redirect } from 'next/navigation'
import CopyButton from '@/components/CopyButton'

type LeagueMember = {
  profile_id: string
  profiles: { nickname: string } | null
}

type AdminLeague = {
  id: number
  name: string
  description: string | null
  join_code: string | null
  created_at: string
  profile_leagues: LeagueMember[]
}

export default async function AdminLeaguesPage() {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (profile?.role !== 'ADMIN') redirect('/')

  const adminClient = createSVClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  )

  const { data: leagues, error } = await adminClient
    .from('private_leagues')
    .select(`
      id,
      name,
      description,
      join_code,
      created_at,
      profile_leagues(
        profile_id,
        profiles(nickname)
      )
    `)
    .order('created_at', { ascending: false })

  if (error) {
    return (
      <div className="p-8 text-center text-red-600 dark:text-red-400">
        <p>Error cargando ligas: {error.message}</p>
      </div>
    )
  }

  const leagueList = (leagues ?? []) as unknown as AdminLeague[]

  return (
    <div className="w-full">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Ligas privadas</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
          {leagueList.length} {leagueList.length === 1 ? 'liga registrada' : 'ligas registradas'} en la plataforma
        </p>
      </div>

      {leagueList.length === 0 ? (
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-dashed border-[#FFD6D1] dark:border-slate-700 py-12 flex flex-col items-center gap-2 text-gray-400 dark:text-gray-500">
          <span className="text-4xl">🏆</span>
          <p className="text-sm">No hay ligas privadas creadas todavía.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {leagueList.map((league) => {
            const members = league.profile_leagues ?? []
            const nicknames = members
              .map(m => m.profiles?.nickname)
              .filter(Boolean) as string[]

            return (
              <div
                key={league.id}
                className="bg-white dark:bg-slate-900 rounded-xl shadow-sm border border-[#FFD6D1] dark:border-slate-800 flex flex-col"
              >
                {/* Cabecera */}
                <div className="p-5 flex flex-col gap-3 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="font-bold text-gray-900 dark:text-gray-100 text-base leading-tight">
                      {league.name}
                    </h3>
                    <span className="shrink-0 text-xs font-semibold bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 px-2 py-0.5 rounded-full">
                      #{league.id}
                    </span>
                  </div>

                  {league.description && (
                    <p className="text-sm text-gray-500 dark:text-gray-400 leading-snug">
                      {league.description}
                    </p>
                  )}

                  {/* Código de acceso */}
                  {league.join_code ? (
                    <div className="flex items-center gap-2 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800/40 rounded-lg px-3 py-2">
                      <span className="text-xs text-amber-600 dark:text-amber-400 shrink-0 font-medium">
                        Código:
                      </span>
                      <span className="font-mono font-bold text-amber-800 dark:text-amber-300 tracking-widest text-sm flex-1">
                        {league.join_code}
                      </span>
                      <CopyButton text={league.join_code} className="text-amber-400 hover:text-amber-600" />
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 bg-gray-50 dark:bg-slate-800 rounded-lg px-3 py-2">
                      <span className="text-xs text-gray-400 dark:text-gray-500 italic">Sin código de acceso</span>
                    </div>
                  )}

                  {/* Contador de miembros */}
                  <div className="flex items-center gap-1.5 text-sm text-gray-500 dark:text-gray-400">
                    <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                    <span>
                      <span className="font-semibold text-gray-700 dark:text-gray-300">{members.length}</span>
                      {' '}{members.length === 1 ? 'miembro' : 'miembros'}
                    </span>
                  </div>
                </div>

                {/* Lista de participantes */}
                {nicknames.length > 0 && (
                  <div className="px-5 pb-5 border-t border-gray-50 dark:border-slate-800/50 pt-3">
                    <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 dark:text-slate-500 mb-2">
                      Participantes
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {nicknames.map((nick) => (
                        <span
                          key={nick}
                          className="text-xs bg-gray-100 dark:bg-slate-800 text-gray-700 dark:text-gray-300 px-2 py-1 rounded-full"
                        >
                          {nick}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
