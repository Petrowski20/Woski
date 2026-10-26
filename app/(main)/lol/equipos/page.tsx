import { redirect } from 'next/navigation'
import { createClient } from '@/utils/supabase/server'
import EditionSelector from '@/components/lol/EditionSelector'
import TeamRosterCard, { championNames } from '@/components/lol/TeamRosterCard'
import { getChampionCatalog } from '@/utils/lol/champions'
import { getActiveLolEditions, getEditionTeams, getLeagueTeams, getLolLeagues, pickLolEdition, REST_OF_WORLD } from '../data'

export const metadata = { title: 'Equipos · LoL · Woski' }

// Equipos de una competición en curso (?edicion=ID) o de una liga (?liga=LEC,
// ?liga=resto para los equipos sin liga). Las ligas salen como píldoras al
// lado de las competiciones.
export default async function LolEquiposPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  const { edicion, liga } = await searchParams
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [editions, leagueInfo] = await Promise.all([
    getActiveLolEditions(supabase),
    // Sin la columna teams.league (migración sin aplicar) solo hay competiciones.
    getLolLeagues(supabase).catch(() => ({ leagues: [] as string[], hasRest: false })),
  ])

  const wanted = typeof liga === 'string' ? liga : null
  const league = wanted === REST_OF_WORLD && leagueInfo.hasRest
    ? REST_OF_WORLD
    : wanted && leagueInfo.leagues.includes(wanted.toUpperCase()) ? wanted.toUpperCase() : null

  if (editions.length === 0 && league === null && leagueInfo.leagues.length === 0 && !leagueInfo.hasRest) {
    return (
      <div className="flex flex-col items-center gap-3 py-20 text-center">
        <span className="text-5xl" aria-hidden>🎮</span>
        <h1 className="heading-display text-lg font-bold text-text-primary">No hay ninguna competición en curso ahora mismo</h1>
        <p className="text-sm text-text-muted max-w-sm">Los equipos y sus plantillas aparecerán aquí cuando arranque la próxima competición.</p>
      </div>
    )
  }

  // Sin liga elegida: la competición (o, si no hay ninguna en curso, la primera liga).
  const fallbackLeague = league ?? (editions.length === 0 ? leagueInfo.leagues[0] ?? REST_OF_WORLD : null)
  const selected = fallbackLeague === null ? pickLolEdition(editions, edicion) : null
  const leagueLabel = (l: string) => (l === REST_OF_WORLD ? 'Resto del mundo' : l)

  const [teams, catalog] = await Promise.all([
    selected
      ? getEditionTeams(supabase, selected.id)
      : getLeagueTeams(supabase, fallbackLeague === REST_OF_WORLD ? null : fallbackLeague),
    getChampionCatalog(),
  ])
  const names = championNames(catalog.champions)

  const extraLinks = [
    ...leagueInfo.leagues.map(l => ({ key: l, label: l, href: `/lol/equipos?liga=${l}`, active: fallbackLeague === l })),
    ...(leagueInfo.hasRest
      ? [{ key: REST_OF_WORLD, label: 'Resto del mundo', href: `/lol/equipos?liga=${REST_OF_WORLD}`, active: fallbackLeague === REST_OF_WORLD }]
      : []),
  ]
  const title = selected ? selected.fullName : leagueLabel(fallbackLeague!)
  const teamHref = (tag: string) => selected
    ? `/lol/equipos/${encodeURIComponent(tag)}?edicion=${selected.id}`
    : `/lol/equipos/${encodeURIComponent(tag)}?liga=${fallbackLeague}`

  return (
    <div className="w-full max-w-6xl mx-auto">
      <div className="mb-6">
        <h1 className="heading-display text-2xl font-bold text-text-primary">Equipos</h1>
        <p className="text-sm text-text-muted mt-1">
          {title} · {teams.length} equipo{teams.length !== 1 ? 's' : ''}. Pulsa un equipo para ver su ficha.
        </p>
        {!selected && (
          <p className="text-xs text-text-muted mt-1">
            Plantilla actual de cada equipo o, si no la tiene, la de su última competición.
          </p>
        )}
      </div>
      <div className="mb-6">
        <EditionSelector
          editions={editions}
          selectedId={selected?.id ?? null}
          basePath="/lol/equipos"
          extraLinks={extraLinks}
        />
      </div>

      {teams.length === 0 ? (
        <p className="py-16 text-center text-sm text-text-muted">
          {selected ? 'Esta competición todavía no tiene equipos.' : 'Todavía no hay equipos aquí.'}
        </p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4 items-start">
          {teams.map(t => (
            <TeamRosterCard
              key={t.id}
              team={t}
              href={teamHref(t.tag)}
              version={catalog.version}
              names={names}
            />
          ))}
        </div>
      )}
    </div>
  )
}
