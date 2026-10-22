import { redirect } from 'next/navigation'
import { createClient } from '@/utils/supabase/server'
import EditionSelector from '@/components/lol/EditionSelector'
import TeamRosterCard, { championNames } from '@/components/lol/TeamRosterCard'
import { getChampionCatalog } from '@/utils/lol/champions'
import { getActiveLolEditions, getEditionTeams, pickLolEdition } from '../data'

export const metadata = { title: 'Equipos · LoL · Woski' }

export default async function LolEquiposPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  const { edicion } = await searchParams
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const editions = await getActiveLolEditions(supabase)
  if (editions.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 py-20 text-center">
        <span className="text-5xl" aria-hidden>🎮</span>
        <h1 className="heading-display text-lg font-bold text-text-primary">No hay ninguna competición en curso ahora mismo</h1>
        <p className="text-sm text-text-muted max-w-sm">Los equipos y sus plantillas aparecerán aquí cuando arranque la próxima competición.</p>
      </div>
    )
  }

  const selected = pickLolEdition(editions, edicion)
  const [teams, catalog] = await Promise.all([getEditionTeams(supabase, selected.id), getChampionCatalog()])
  const names = championNames(catalog.champions)

  return (
    <div className="w-full max-w-6xl mx-auto">
      <div className="mb-6">
        <h1 className="heading-display text-2xl font-bold text-text-primary">Equipos</h1>
        <p className="text-sm text-text-muted mt-1">
          {selected.fullName} · {teams.length} equipo{teams.length !== 1 ? 's' : ''}. Pulsa un equipo para ver su ficha.
        </p>
      </div>
      <div className="mb-6">
        <EditionSelector editions={editions} selectedId={selected.id} basePath="/lol/equipos" />
      </div>

      {teams.length === 0 ? (
        <p className="py-16 text-center text-sm text-text-muted">Esta competición todavía no tiene equipos.</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4 items-start">
          {teams.map(t => (
            <TeamRosterCard
              key={t.id}
              team={t}
              href={`/lol/equipos/${encodeURIComponent(t.tag)}?edicion=${selected.id}`}
              version={catalog.version}
              names={names}
            />
          ))}
        </div>
      )}
    </div>
  )
}
