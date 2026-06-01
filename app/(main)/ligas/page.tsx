import { createClient } from '@/utils/supabase/server'
import { redirect } from 'next/navigation'
import LeagueManager from '@/components/LeagueManager'
import CopyButton from '@/components/CopyButton'
import LeaveLeagueButton from '@/components/LeaveLeagueButton'

export default async function LigasPage() {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Ligas del usuario con datos completos de la liga
  const { data: rows } = await supabase
    .from('profile_leagues')
    .select('joined_at, private_leagues(id, name, description, join_code, created_by)')
    .eq('profile_id', user.id)
    .order('joined_at', { ascending: false })

  type League = {
    id: number
    name: string
    description: string | null
    join_code: string | null
    created_by: string | null
    joined_at: string
  }

  const leagues: League[] = (rows ?? [])
    .map((r: any) => ({
      ...(r.private_leagues as Omit<League, 'joined_at'>),
      joined_at: r.joined_at as string,
    }))
    .filter((l: any) => l?.id)

  return (
    <div className="w-full max-w-3xl mx-auto">
      {/* Cabecera */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Mis Ligas Privadas</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
          Crea una liga para competir con tus amigos o únete con un código.
        </p>
      </div>

      {/* Crear / Unirse */}
      <LeagueManager />

      {/* Lista de ligas actuales */}
      <div className="mt-8">
        <h2 className="text-base font-semibold text-gray-700 dark:text-gray-300 mb-4">
          {leagues.length === 0 ? 'Aún no perteneces a ninguna liga' : `Tus ligas (${leagues.length})`}
        </h2>

        {leagues.length === 0 ? (
          <div className="bg-white dark:bg-slate-900 rounded-xl border border-dashed border-[#FFD6D1] dark:border-slate-700 py-12 flex flex-col items-center gap-2 text-gray-400 dark:text-gray-500">
            <span className="text-4xl">🏆</span>
            <p className="text-sm">Crea la primera o únete con un código.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {leagues.map((league) => {
              const isOwner = league.created_by === user.id
              const joinedDate = new Date(league.joined_at).toLocaleDateString('es-ES', {
                day: '2-digit', month: 'short', year: 'numeric',
              })

              return (
                <div
                  key={league.id}
                  className="bg-white dark:bg-slate-900 rounded-xl shadow-sm border border-[#FFD6D1] dark:border-slate-800 p-5 flex flex-col gap-3 hover:shadow-md transition-shadow"
                >
                  {/* Nombre + badge propietario */}
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="font-bold text-gray-900 dark:text-gray-100 text-base leading-tight">
                      {league.name}
                    </h3>
                    {isOwner && (
                      <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wide bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">
                        Admin
                      </span>
                    )}
                  </div>

                  {/* Descripción */}
                  {league.description && (
                    <p className="text-sm text-gray-500 dark:text-gray-400 leading-snug">{league.description}</p>
                  )}

                  {/* Código de unión */}
                  {league.join_code && (
                    <div className="flex items-center gap-2 bg-gray-50 dark:bg-slate-800 rounded-lg px-3 py-2">
                      <span className="text-xs text-gray-400 dark:text-gray-500 shrink-0">Código:</span>
                      <span className="font-mono font-bold text-gray-900 dark:text-gray-100 tracking-widest text-sm flex-1">
                        {league.join_code}
                      </span>
                      <CopyButton
                        text={league.join_code}
                        className="text-gray-400 hover:text-blue-600"
                      />
                    </div>
                  )}

                  {/* Footer: fecha + abandonar */}
                  <div className="flex items-center justify-between text-xs text-gray-400 dark:text-gray-500 pt-1 border-t border-gray-50 dark:border-slate-800/50">
                    <span>Desde {joinedDate}</span>
                    <LeaveLeagueButton leagueId={league.id} leagueName={league.name} />
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
