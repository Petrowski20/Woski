import Link from 'next/link'
import type { EditionTeam, RosterMember } from '@/utils/lol/types'
import { ROLE_LABEL, flagUrl } from '@/utils/lol/roster'
import { championIconUrl, type Champion } from '@/utils/lol/champions'
import TeamLogo from './TeamLogo'

// Pestaña Equipos: plantilla de un equipo en una edición. Solo pinta lo que
// hay en la BD (lol_roster, team_edition_stats); los iconos de campeón son
// de Data Dragon.

export function Flag({ country, size = 'sm' }: { country: string | null; size?: 'sm' | 'md' }) {
  const src = flagUrl(country)
  if (!src) return <span aria-hidden className={size === 'sm' ? 'inline-block w-4' : 'inline-block w-6'} />
  return (
    // eslint-disable-next-line @next/next/no-img-element -- banderas pequeñas de flagcdn, como en el resto de la web
    <img
      src={src}
      alt={country!}
      title={country!}
      loading="lazy"
      className={`${size === 'sm' ? 'w-4 h-3' : 'w-6 h-4'} shrink-0 rounded-[2px] object-cover ring-1 ring-black/20`}
    />
  )
}

export function ChampionIcon({ id, version, names, size = 'sm' }: {
  id: string
  version: string | null
  names: Map<string, string>
  size?: 'sm' | 'md'
}) {
  const name = names.get(id) ?? id
  const src = championIconUrl(version, id)
  const box = size === 'sm' ? 'w-5 h-5' : 'w-8 h-8'
  if (!src) return <span className="text-[10px] text-text-muted">{name}</span>
  return (
    // eslint-disable-next-line @next/next/no-img-element -- iconos fijos del CDN de Riot
    <img src={src} alt={name} title={name} loading="lazy" className={`${box} shrink-0 rounded-md ring-1 ring-border`} />
  )
}

export function championNames(champions: Champion[]): Map<string, string> {
  return new Map(champions.map(c => [c.id, c.name]))
}

function MemberRow({ m, version, names }: { m: RosterMember; version: string | null; names: Map<string, string> }) {
  return (
    <li className="grid grid-cols-[4rem_minmax(0,1fr)_auto] items-center gap-2 px-3 py-1.5">
      <span className="text-[11px] font-bold uppercase tracking-wide text-text-muted">{ROLE_LABEL[m.role]}</span>
      <span className="flex items-center gap-1.5 min-w-0">
        <Flag country={m.country} />
        <span className="truncate text-sm font-semibold text-text-primary">{m.nickname}</span>
      </span>
      <span className="flex items-center gap-1">
        {m.picks.map(p => <ChampionIcon key={p} id={p} version={version} names={names} />)}
      </span>
    </li>
  )
}

export default function TeamRosterCard({ team, href, version, names }: {
  team: EditionTeam
  href: string
  version: string | null
  names: Map<string, string>
}) {
  return (
    <article className="bg-bg-elevated border border-border rounded-card shadow-card overflow-hidden flex flex-col">
      <Link href={href} className="flex items-center gap-3 px-3 py-3 border-b border-border hover:bg-bg-muted/60 transition-colors min-w-0">
        <TeamLogo team={team} size="md" />
        <div className="min-w-0 flex-1">
          <h2 className="flex items-center gap-1.5 font-display font-bold text-text-primary min-w-0">
            <Flag country={team.country} />
            <span className="truncate">{team.name}</span>
          </h2>
          <p className="text-xs text-text-muted">{team.tag}{team.region && ` · ${team.region}`}</p>
        </div>
        {team.seed && (
          <span className="shrink-0 px-2 py-0.5 rounded-full bg-accent/10 text-accent ring-1 ring-inset ring-accent/30 text-xs font-bold tabular-nums">
            {team.seed}
          </span>
        )}
      </Link>
      {team.roster.length === 0 ? (
        <p className="px-3 py-4 text-center text-xs text-text-muted">Plantilla pendiente</p>
      ) : (
        <ul className="divide-y divide-border/60">
          {team.roster.map(m => <MemberRow key={m.rosterId} m={m} version={version} names={names} />)}
        </ul>
      )}
      {team.rosterSource && (
        <p className="px-3 py-1.5 border-t border-border/60 text-[11px] text-text-muted">{team.rosterSource}</p>
      )}
    </article>
  )
}
