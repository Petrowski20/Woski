import Link from 'next/link'
import type { ProfileLolEdition } from '@/utils/lol/types'
import PointsBreakdown from './PointsBreakdown'
import { formatMatchDate, formatSeriesScore } from './format'

// Sección de LoL de /perfil. Solo presenta lo que calcula la BD
// (get_lol_standings y get_my_lol_breakdowns); no decide ningún punto.

function Stat({ label, value, sub }: { label: string; value: React.ReactNode; sub?: React.ReactNode }) {
  return (
    <div className="bg-bg-elevated px-4 py-3 min-w-0">
      <p className="text-xs text-text-muted">{label}</p>
      <p className="font-display text-2xl font-bold text-text-primary tabular-nums leading-tight mt-0.5">{value}</p>
      {sub && <p className="text-xs text-text-muted mt-0.5">{sub}</p>}
    </div>
  )
}

function PointsPill({ points }: { points: number }) {
  const tone = points === 0
    ? 'bg-danger/10 text-danger ring-danger/30'
    : 'bg-success/10 text-success ring-success/30'
  return (
    <span className={`shrink-0 text-xs font-bold px-2 py-0.5 rounded-full ring-1 ring-inset tabular-nums ${tone}`}>
      {points > 0 ? `+${points}` : points} pt{points !== 1 ? 's' : ''}
    </span>
  )
}

function EditionCard({ data }: { data: ProfileLolEdition }) {
  const { edition, standing, participants, pools, scored, exactHits, exactPlayed } = data
  const played = standing !== null || scored.length > 0

  return (
    <article className="bg-bg-elevated border border-border rounded-panel shadow-card overflow-hidden">
      <header className="flex flex-wrap items-center justify-between gap-2 px-5 py-3 border-b border-border">
        <h3 className="heading-display font-bold text-text-primary">{edition.fullName}</h3>
        <Link
          href={`/lol/clasificacion?edicion=${edition.id}`}
          className="text-xs font-semibold text-accent hover:underline underline-offset-4"
        >
          Ver clasificación
        </Link>
      </header>

      {!played ? (
        <div className="px-5 py-6 text-center">
          <p className="text-sm text-text-muted">Todavía no has votado en esta competición.</p>
          <Link
            href={`/?edicion=${edition.id}`}
            className="mt-3 inline-block px-4 py-2 rounded-lg text-sm font-semibold bg-accent bg-accent-gradient text-on-accent shadow-glow-accent hover:brightness-110"
          >
            Ir a votar
          </Link>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-px bg-border border-b border-border">
            <Stat label="Puntos" value={<span className="text-accent">{standing?.points ?? 0}</span>} />
            <Stat
              label="Posición global"
              value={standing ? `#${standing.position}` : '—'}
              sub={standing ? `de ${participants}` : 'aún sin clasificar'}
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
                  <span className="text-success" title="Plenos positivos">+{standing?.perfectDays ?? 0}</span>
                  <span className="text-text-muted mx-1.5">/</span>
                  <span className="text-danger" title="Plenos negativos">−{standing?.negativeDays ?? 0}</span>
                </span>
              }
              sub="positivos / negativos"
            />
            <Stat
              label="Aciertos de ganador"
              value={`${standing?.correctWinners ?? 0}/${standing?.finishedSeries ?? 0}`}
              sub="sobre series jugadas"
            />
            <Stat
              label="Marcador exacto"
              value={`${exactHits}/${exactPlayed}`}
              sub="en Bo3 y Bo5 votadas"
            />
          </div>

          {pools.length > 0 && (
            <div className="px-5 py-3 border-b border-border">
              <p className="font-display text-xs font-bold uppercase tracking-display text-text-muted mb-2">Mis pools</p>
              <ul className="flex flex-col gap-1.5">
                {pools.map(p => (
                  <li key={p.id} className="flex items-center justify-between gap-3 text-sm">
                    <span className="text-text-primary truncate">🏆 {p.name}</span>
                    <span className="shrink-0 tabular-nums text-text-muted">
                      {p.position ? <><strong className="text-text-primary">#{p.position}</strong> de {p.participants}</> : 'sin clasificar'}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <details className="group" open={scored.length > 0 && scored.length <= 5}>
            <summary className="flex items-center justify-between gap-3 px-5 py-3 cursor-pointer select-none list-none hover:bg-bg-muted/60 [&::-webkit-details-marker]:hidden">
              <span className="font-display text-xs font-bold uppercase tracking-display text-text-muted">
                Mis series puntuadas ({scored.length})
              </span>
              <span aria-hidden className="text-text-muted transition-transform group-open:rotate-180">▾</span>
            </summary>
            {scored.length === 0 ? (
              <p className="px-5 pb-4 text-sm text-text-muted">Aún no ha terminado ninguna serie que hayas votado.</p>
            ) : (
              <ul className="divide-y divide-border border-t border-border">
                {scored.map(m => {
                  const mine = m.myPrediction!
                  return (
                    <li key={m.id} className="px-5 py-3 flex flex-col gap-2">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-text-primary truncate">
                            {m.home.name} <span className="text-text-muted font-normal">vs</span> {m.away.name}
                          </p>
                          <p className="text-xs text-text-muted">
                            <time dateTime={m.date} className="capitalize">{formatMatchDate(m.date)}</time>
                            {' · '}{m.phaseName} · Bo{m.bestOf}
                          </p>
                        </div>
                        <PointsPill points={mine.points ?? 0} />
                      </div>
                      <p className="text-xs text-text-muted">
                        Resultado:{' '}
                        <strong className="text-text-primary">
                          {m.result ? formatSeriesScore(m.result, m.home.tag, m.away.tag) : '—'}
                        </strong>
                        {' · '}Tu voto:{' '}
                        <strong className="text-text-primary">{formatSeriesScore(mine, m.home.tag, m.away.tag)}</strong>
                      </p>
                      {mine.breakdown && (
                        <div className="[&_ul]:justify-start">
                          <PointsBreakdown breakdown={mine.breakdown} />
                        </div>
                      )}
                    </li>
                  )
                })}
              </ul>
            )}
          </details>
        </>
      )}
    </article>
  )
}

export default function ProfileLolSection({ editions }: { editions: ProfileLolEdition[] }) {
  return (
    <section aria-labelledby="perfil-lol" className="flex flex-col gap-3">
      <h2 id="perfil-lol" className="heading-display text-sm font-bold text-text-muted px-1">
        ⚔️ League of Legends
      </h2>
      {editions.length === 0 ? (
        <p className="bg-bg-elevated border border-border rounded-panel shadow-card px-5 py-6 text-sm text-text-muted text-center">
          No hay ninguna competición de LoL en curso. Tus competiciones pasadas están en el{' '}
          <Link href="/lol/historial" className="text-accent hover:underline">historial</Link>.
        </p>
      ) : (
        editions.map(e => <EditionCard key={e.edition.id} data={e} />)
      )}
    </section>
  )
}
