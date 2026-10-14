'use client'

import { useEffect, useState } from 'react'
import type { OpsMatch, OpsToday } from './adminOpsTypes'
import { formatMatchDate, formatTimeLeft } from './format'

// Panel "Hoy" de /admin/lol. Solo muestra lo que devuelve
// admin_lol_ops_today(); "cuánto falta" se refresca cada 30 s.

function useNow() {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000)
    return () => clearInterval(id)
  }, [])
  return now
}

function Block({ title, tone, count, children }: {
  title: string
  tone: 'accent' | 'warning' | 'muted'
  count: number
  children: React.ReactNode
}) {
  const badge = tone === 'warning' ? 'bg-warning/10 text-warning' : tone === 'accent' ? 'bg-accent/10 text-accent' : 'bg-bg-muted text-text-muted'
  return (
    <div className="flex flex-col gap-2">
      <h3 className="flex items-center gap-2 text-sm font-semibold text-text-primary">
        {title}
        <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${badge}`}>{count}</span>
      </h3>
      {children}
    </div>
  )
}

function MatchLabel({ m }: { m: OpsMatch }) {
  return (
    <span className="font-semibold text-text-primary">
      {m.home} <span className="font-normal text-text-muted">vs</span> {m.away}
      <span className="ml-1.5 text-xs font-normal text-text-muted">Bo{m.best_of} · {m.phase}</span>
      {m.featured && <span className="ml-1.5 text-xs" title="Partido de la jornada">⭐</span>}
    </span>
  )
}

export default function AdminLolToday({ data }: { data: OpsToday }) {
  const now = useNow()

  return (
    <section className="bg-bg-elevated border border-border rounded-xl p-4 flex flex-col gap-5">
      <h2 className="font-bold text-text-primary">Hoy</h2>

      <Block title="Votación abierta" tone="accent" count={data.open.length}>
        {data.open.length === 0 ? (
          <p className="text-sm text-text-muted">No hay series con la votación abierta.</p>
        ) : (
          <ul className="flex flex-col divide-y divide-border">
            {data.open.map(m => (
              <li key={m.id} className="py-2 flex flex-col gap-0.5 sm:flex-row sm:items-center sm:justify-between text-sm">
                <MatchLabel m={m} />
                <span className="text-xs text-text-muted">
                  Empieza <span className="capitalize">{formatMatchDate(m.match_date)}</span> · cierra{' '}
                  <strong className="text-text-primary">{formatTimeLeft(m.locks_at, now)}</strong> · {m.votes}/{m.participants} votos
                </span>
              </li>
            ))}
          </ul>
        )}
      </Block>

      <Block title="Sin resultado" tone={data.needs_result.length ? 'warning' : 'muted'} count={data.needs_result.length}>
        {data.needs_result.length === 0 ? (
          <p className="text-sm text-text-muted">Todas las series empezadas tienen resultado.</p>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {data.needs_result.map(m => (
              <li key={m.id} className="rounded-lg bg-warning/10 px-3 py-2 text-sm flex flex-col sm:flex-row sm:justify-between gap-0.5">
                <MatchLabel m={m} />
                <span className="text-xs text-warning font-semibold">
                  Empezó <span className="capitalize">{formatMatchDate(m.match_date)}</span>: introduce el resultado
                </span>
              </li>
            ))}
          </ul>
        )}
      </Block>

      <Block title="Jornadas abiertas" tone="muted" count={data.open_days.length}>
        {data.open_days.length === 0 ? (
          <p className="text-sm text-text-muted">No hay jornadas empezadas sin cerrar.</p>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {data.open_days.map(d => (
              <li key={`${d.edition_id}-${d.day}`} className="text-sm">
                <span className="font-semibold text-text-primary">{d.day}</span>
                <span className="text-text-muted"> · {d.edition} · {d.finished}/{d.series} terminadas</span>
                {d.blocking.length > 0 && (
                  <p className="text-xs text-warning">
                    Sigue abierta por {d.blocking.map(m => `${m.home} vs ${m.away}`).join(', ')}
                    {' '}(pendiente con la hora ya pasada: ¿aplazada? pon el resultado o cancélala).
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}
      </Block>

      <Block title="Ediciones activas" tone="muted" count={data.editions.length}>
        <ul className="flex flex-col gap-2">
          {data.editions.map(e => (
            <li key={e.id} className="text-sm">
              <p className="font-semibold text-text-primary">{e.name} <span className="text-xs font-normal text-text-muted">({e.timezone})</span></p>
              <ul className="mt-1 flex flex-wrap gap-1.5">
                {e.phases.map(p => (
                  <li
                    key={p.id}
                    className={`px-2 py-0.5 rounded-full text-xs border ${p.current ? 'border-accent text-accent font-semibold' : 'border-border text-text-muted'}`}
                    title={`Ruleset "${p.ruleset}"`}
                  >
                    {p.name} · {p.ruleset} · v{p.version}
                    {p.default_best_of !== null && ` · Bo${p.default_best_of}`}
                    {p.cutoff_minutes !== null && ` · corte ${p.cutoff_minutes} min`}
                    {p.current && ' · en curso'}
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      </Block>
    </section>
  )
}
