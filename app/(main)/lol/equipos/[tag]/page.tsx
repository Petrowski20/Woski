import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/utils/supabase/server'
import TeamLogo from '@/components/lol/TeamLogo'
import { ChampionIcon, Flag, championNames } from '@/components/lol/TeamRosterCard'
import { getChampionCatalog } from '@/utils/lol/champions'
import { ROLE_LABEL } from '@/utils/lol/roster'
import { getActiveLolEditions, getEditionTeams, getLeagueTeams, getLolEditions, pickLolEdition, REST_OF_WORLD } from '../../data'

type Params = Promise<{ tag: string }>
type SearchParams = Promise<{ [key: string]: string | string[] | undefined }>

export async function generateMetadata({ params }: { params: Params }) {
  const { tag } = await params
  return { title: `${decodeURIComponent(tag).toUpperCase()} · Equipos · LoL · Woski` }
}

// Ficha de un equipo en una edición (?edicion=ID: datos, seed y plantilla con
// los picks) o desde una liga (?liga=LEC o resto: su plantilla actual o la de
// su última competición).
export default async function LolEquipoPage({ params, searchParams }: { params: Params; searchParams: SearchParams }) {
  const [{ tag }, sp] = await Promise.all([params, searchParams])
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const wanted = decodeURIComponent(tag).toUpperCase()
  const ligaRaw = Array.isArray(sp.liga) ? sp.liga[0] : sp.liga
  const liga = ligaRaw === REST_OF_WORLD ? REST_OF_WORLD
    : ligaRaw && /^[A-Za-z0-9]{2,8}$/.test(ligaRaw) ? ligaRaw.toUpperCase() : null

  let teams
  let backHref: string
  let context: string
  if (liga) {
    teams = await getLeagueTeams(supabase, liga === REST_OF_WORLD ? null : liga)
    backHref = `/lol/equipos?liga=${liga}`
    context = liga === REST_OF_WORLD ? 'Resto del mundo' : `Liga ${liga}`
  } else {
    // Edición: la de la URL si es de LoL; si no, la activa por defecto.
    const raw = Array.isArray(sp.edicion) ? sp.edicion[0] : sp.edicion
    const requested = raw && /^[1-9][0-9]{0,8}$/.test(raw) ? Number(raw) : null
    const all = await getLolEditions(supabase)
    let edition = all.find(e => e.id === requested) ?? null
    if (!edition) {
      const active = await getActiveLolEditions(supabase)
      if (active.length === 0) notFound()
      const pick = pickLolEdition(active, undefined)
      edition = all.find(e => e.id === pick.id) ?? null
    }
    if (!edition) notFound()
    teams = await getEditionTeams(supabase, edition.id)
    backHref = `/lol/equipos?edicion=${edition.id}`
    context = edition.fullName
  }

  const catalog = await getChampionCatalog()
  const team = teams.find(t => t.tag.toUpperCase() === wanted)
  if (!team) notFound()
  const names = championNames(catalog.champions)

  return (
    <div className="w-full max-w-2xl mx-auto space-y-6">
      <Link href={backHref} className="inline-flex items-center gap-1.5 text-sm text-text-muted hover:text-accent transition-colors">
        <svg aria-hidden className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
        </svg>
        Equipos
      </Link>

      <header className="bg-bg-elevated border border-border rounded-panel shadow-card px-5 py-5 flex items-center gap-4 min-w-0">
        <TeamLogo team={team} size="lg" />
        <div className="min-w-0 flex-1">
          <h1 className="heading-display text-xl sm:text-2xl font-bold text-text-primary truncate">{team.name}</h1>
          <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-text-muted mt-1">
            <span className="font-bold text-text-primary">{team.tag}</span>
            {team.country && <span className="inline-flex items-center gap-1"><Flag country={team.country} /> {team.country}</span>}
            {team.region && <span>· {team.region}</span>}
          </p>
          <p className="text-xs text-text-muted mt-0.5">{context}</p>
        </div>
        {team.seed && (
          <span className="shrink-0 px-2.5 py-1 rounded-full bg-accent/10 text-accent ring-1 ring-inset ring-accent/30 text-sm font-bold tabular-nums">
            {team.seed}
          </span>
        )}
      </header>

      <section aria-labelledby="plantilla" className="bg-bg-elevated border border-border rounded-panel shadow-card overflow-hidden">
        <h2 id="plantilla" className="px-5 py-3 border-b border-border font-display text-xs font-bold uppercase tracking-display text-text-muted">
          {team.rosterSource ?? 'Plantilla'}
        </h2>
        {team.roster.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-text-muted">Plantilla pendiente.</p>
        ) : (
          <ul className="divide-y divide-border">
            {team.roster.map(m => (
              <li key={m.rosterId} className="px-4 sm:px-5 py-3 flex flex-col gap-2">
                <div className="grid grid-cols-[4.5rem_minmax(0,1fr)] items-center gap-2">
                  <span className="text-xs font-bold uppercase tracking-wide text-text-muted">{ROLE_LABEL[m.role]}</span>
                  <div className="min-w-0">
                    <p className="flex items-center gap-2 min-w-0">
                      <Flag country={m.country} size="md" />
                      <span className="truncate font-semibold text-text-primary">{m.nickname}</span>
                    </p>
                    {m.realName && <p className="text-xs text-text-muted truncate">{m.realName}</p>}
                  </div>
                </div>
                {m.picks.length > 0 && (
                  <ul aria-label={`Mejores picks de ${m.nickname}`} className="flex flex-wrap gap-2 pl-[5rem]">
                    {m.picks.map(p => (
                      <li key={p} className="inline-flex items-center gap-1.5 pr-2 rounded-lg bg-bg-muted ring-1 ring-inset ring-border">
                        <ChampionIcon id={p} version={catalog.version} names={names} size="md" />
                        <span className="text-xs font-semibold text-text-primary">{names.get(p) ?? p}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
