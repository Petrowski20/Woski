import Link from 'next/link'
import type { PlayerDay, PlayerSeries, StandingRow } from '@/utils/lol/types'
import { signedPoints } from '@/utils/lol/rules'
import TeamLogo from './TeamLogo'
import PointsBreakdown from './PointsBreakdown'
import { PointsPill, Stat } from './ProfileLolSection'
import { formatMatchDate, formatSeriesScore } from './format'

// Perfil de LoL de un jugador visto por otros (/jugador/[id]). Solo pinta lo
// que devuelve la BD: la fila de get_lol_standings y el historial de
// get_lol_player_history / get_lol_player_days (series con la votación ya
// cerrada). Aquí no se calcula ningún punto.

export interface PlayerLolProfileProps {
  standing: StandingRow | null
  participants: number
  series: PlayerSeries[]
  days: PlayerDay[]
  editions: { id: number; label: string }[]
  selectedEditionId: number
  phases: { id: number; name: string }[]
  selectedPhaseId: number | null
  /** Enlace a esta misma página con otra edición o fase (conserva ?from). */
  hrefFor: (editionId: number, phaseId: number | null) => string
}

const dayFmt = new Intl.DateTimeFormat('es-ES', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' })

function Pill({ href, active, children }: { href: string; active: boolean; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      scroll={false}
      aria-current={active ? 'page' : undefined}
      className={`shrink-0 px-3 py-1 rounded-full text-xs font-semibold ring-1 ring-inset transition-colors ${
        active
          ? 'bg-accent bg-accent-gradient text-on-accent ring-transparent shadow-glow-accent'
          : 'bg-bg-muted text-text-muted ring-border hover:text-accent hover:ring-accent/40'
      }`}
    >
      {children}
    </Link>
  )
}

/** Pleno de la jornada, tal cual lo cuenta la clasificación. */
function DayPleno({ day }: { day: PlayerDay }) {
  const tone = day.perfect
    ? 'bg-success/10 text-success ring-success/30'
    : 'bg-danger/10 text-danger ring-danger/30'
  return (
    <span className={`shrink-0 inline-flex items-center gap-1 px-2 py-0.5 rounded-full ring-1 ring-inset text-xs font-semibold ${tone}`}>
      {day.perfect ? '⭐ Pleno' : '💀 Pleno negativo'}
      <strong className="tabular-nums">{signedPoints(day.points)}</strong>
    </span>
  )
}

function SeriesItem({ s }: { s: PlayerSeries }) {
  const pending = s.status !== 'FINISHED'
  return (
    <li className="px-4 sm:px-5 py-3 flex flex-col gap-2">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 text-sm font-semibold text-text-primary min-w-0">
            <TeamLogo team={s.home} size="sm" side="a" />
            <span className="truncate">
              {s.home.name} <span className="text-text-muted font-normal">vs</span> {s.away.name}
            </span>
            <TeamLogo team={s.away} size="sm" side="b" />
          </p>
          <p className="text-xs text-text-muted">
            <time dateTime={s.date} className="capitalize">{formatMatchDate(s.date)}</time>
            {' · '}{s.phaseName} · Bo{s.bestOf}
            {s.featured && <span className="text-secondary"> · ⭐ Partido de la jornada</span>}
          </p>
        </div>
        {pending ? (
          <span className="shrink-0 text-xs font-semibold px-2 py-0.5 rounded-full bg-warning/10 text-warning ring-1 ring-inset ring-warning/30">
            Sin resultado
          </span>
        ) : (
          <PointsPill points={s.points ?? 0} />
        )}
      </div>
      <p className="text-xs text-text-muted">
        Resultado:{' '}
        <strong className="text-text-primary">{s.result ? formatSeriesScore(s.result, s.home.tag, s.away.tag) : '—'}</strong>
        {' · '}Voto:{' '}
        {s.vote ? (
          <strong className="text-text-primary">{formatSeriesScore(s.vote, s.home.tag, s.away.tag)}</strong>
        ) : (
          <strong className="text-danger">no votó</strong>
        )}
      </p>
      {s.breakdown && s.vote && (
        <div className="[&_ul]:justify-start">
          <PointsBreakdown breakdown={s.breakdown} />
        </div>
      )}
    </li>
  )
}

export default function PlayerLolProfile(props: PlayerLolProfileProps) {
  const { standing, participants, series, days, editions, selectedEditionId, phases, selectedPhaseId, hrefFor } = props

  // Marcador exacto: series terminadas Bo3/Bo5 con voto (las únicas con
  // marcador), contando lo que marcó el motor (correctScore).
  const withExact = series.filter(s => s.status === 'FINISHED' && s.bestOf > 1 && s.vote && s.breakdown)
  const exactHits = withExact.filter(s => s.breakdown!.correctScore).length

  const shown = selectedPhaseId === null ? series : series.filter(s => s.phaseId === selectedPhaseId)
  const dayInfo = new Map(days.map(d => [d.day, d]))
  const groups: { day: string; items: PlayerSeries[] }[] = []
  for (const s of shown) {
    const last = groups[groups.length - 1]
    if (last && last.day === s.day) last.items.push(s)
    else groups.push({ day: s.day, items: [s] })
  }

  return (
    <div className="flex flex-col gap-4">
      {editions.length > 1 && (
        <nav aria-label="Competición" className="flex gap-2 overflow-x-auto scrollbar-hide -mx-1 px-1 py-0.5">
          {editions.map(e => (
            <Pill key={e.id} href={hrefFor(e.id, null)} active={e.id === selectedEditionId}>{e.label}</Pill>
          ))}
        </nav>
      )}

      <section aria-label="Resumen" className="bg-bg-elevated border border-border rounded-panel shadow-card overflow-hidden">
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-px bg-border">
          <Stat label="Puntos" value={<span className="text-accent">{standing?.points ?? 0}</span>} />
          <Stat
            label="Posición global"
            value={standing ? `#${standing.position}` : '—'}
            sub={standing ? `de ${participants}` : 'Sin clasificar'}
          />
          <Stat
            label="Racha actual"
            value={standing?.currentStreak ?? 0}
            sub={`Mejor de la fase: ${standing?.bestStreak ?? 0}`}
          />
          <Stat
            label="Plenos"
            value={
              <span>
                <span className="text-success" title="Jornadas acertando todo">+{standing?.perfectDays ?? 0}</span>
                <span className="text-text-muted mx-1.5">/</span>
                <span className="text-danger" title="Jornadas sin ningún acierto">−{standing?.negativeDays ?? 0}</span>
              </span>
            }
            sub="positivos / negativos"
          />
          <Stat
            label="Aciertos de ganador"
            value={`${standing?.correctWinners ?? 0}/${standing?.finishedSeries ?? 0}`}
            sub="sobre series puntuadas"
          />
          <Stat label="Marcador exacto" value={`${exactHits}/${withExact.length}`} sub="en Bo3 y Bo5 votadas" />
        </div>
      </section>

      <section aria-labelledby="jugador-historial" className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2 px-1">
          <h2 id="jugador-historial" className="heading-display text-sm font-bold text-text-muted">
            Historial · {shown.length} serie{shown.length !== 1 ? 's' : ''}
          </h2>
        </div>
        {phases.length > 1 && (
          <nav aria-label="Fase" className="flex gap-2 overflow-x-auto scrollbar-hide -mx-1 px-1 py-0.5">
            <Pill href={hrefFor(selectedEditionId, null)} active={selectedPhaseId === null}>Todas</Pill>
            {phases.map(p => (
              <Pill key={p.id} href={hrefFor(selectedEditionId, p.id)} active={p.id === selectedPhaseId}>{p.name}</Pill>
            ))}
          </nav>
        )}
        <p className="text-xs text-text-muted px-1">
          Solo series con la votación ya cerrada. Los puntos y plenos los calcula la clasificación.
        </p>

        {groups.length === 0 ? (
          <div className="bg-bg-elevated border border-border rounded-panel shadow-card px-5 py-10 text-center">
            <p className="text-3xl" aria-hidden>📭</p>
            <p className="mt-2 text-sm text-text-muted">Todavía no hay series cerradas con voto de este jugador.</p>
          </div>
        ) : (
          groups.map(g => {
            const pleno = dayInfo.get(g.day)
            return (
              <div key={g.day} className="bg-bg-elevated border border-border rounded-panel shadow-card overflow-hidden">
                <div className="flex flex-wrap items-center justify-between gap-2 px-4 sm:px-5 py-2.5 bg-bg-muted/60 border-b border-border">
                  <h3 className="text-xs font-bold uppercase tracking-display text-text-muted capitalize">
                    {dayFmt.format(new Date(`${g.day}T12:00:00Z`))}
                  </h3>
                  {pleno && <DayPleno day={pleno} />}
                </div>
                <ul className="divide-y divide-border">
                  {g.items.map(s => <SeriesItem key={s.matchId} s={s} />)}
                </ul>
              </div>
            )
          })
        )}
      </section>
    </div>
  )
}
