'use client'

import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { createLolMatchAction } from '@/app/(main)/admin/lol/actions'
import type { OpsEdition } from './adminOpsTypes'

export interface TeamOption {
  tag: string
  name: string
}

const fieldClass = 'text-sm bg-bg-muted border border-border rounded-md px-2 py-1.5 text-text-primary min-w-0 w-full'

/**
 * Alta de una serie. Todas las validaciones (siglas, equipos distintos,
 * formato, votación todavía abierta, duplicados, partido de la jornada) las
 * hace admin_create_lol_match; aquí solo se recogen los datos.
 */
export default function AdminLolMatchForm({
  editions,
  defaultEditionId,
  teams,
}: {
  editions: OpsEdition[]
  defaultEditionId: number | null
  teams: TeamOption[]
}) {
  const initialEdition = editions.find(e => e.id === defaultEditionId) ?? editions[0] ?? null
  const currentPhase = (e: OpsEdition | null) => e?.phases.find(p => p.current) ?? e?.phases[0] ?? null

  const [editionId, setEditionId] = useState<number | null>(initialEdition?.id ?? null)
  const [phaseId, setPhaseId] = useState<number | null>(currentPhase(initialEdition)?.id ?? null)
  const [homeTag, setHomeTag] = useState('')
  const [awayTag, setAwayTag] = useState('')
  const [localDateTime, setLocalDateTime] = useState('')
  const [bestOf, setBestOf] = useState<number>(currentPhase(initialEdition)?.default_best_of ?? 3)
  const [featured, setFeatured] = useState(false)
  const [isPending, startTransition] = useTransition()

  const edition = editions.find(e => e.id === editionId) ?? null

  if (editions.length === 0) return null

  const onEditionChange = (id: number) => {
    const e = editions.find(x => x.id === id) ?? null
    setEditionId(id)
    setPhaseId(currentPhase(e)?.id ?? null)
    setBestOf(currentPhase(e)?.default_best_of ?? 3)
  }

  const onPhaseChange = (id: number) => {
    setPhaseId(id)
    const p = edition?.phases.find(x => x.id === id)
    if (p?.default_best_of) setBestOf(p.default_best_of)
  }

  const submit = () => {
    if (!phaseId) return
    startTransition(async () => {
      try {
        const res = await createLolMatchAction({ phaseId, homeTag, awayTag, localDateTime, bestOf, featured })
        if ('error' in res) {
          toast.error(res.error)
          return
        }
        toast.success(`Serie ${homeTag} vs ${awayTag} creada`)
        res.warnings.forEach(w => toast.warning(w, { duration: 10_000 }))
        setHomeTag('')
        setAwayTag('')
        setFeatured(false)
      } catch {
        toast.error('No hemos podido conectar con el servidor. Inténtalo de nuevo.')
      }
    })
  }

  return (
    <section className="bg-bg-elevated border border-border rounded-xl p-4 flex flex-col gap-3">
      <div>
        <h2 className="font-bold text-text-primary">Añadir serie</h2>
        <p className="text-xs text-text-muted">Fecha y hora en horario de Madrid. La votación debe seguir abierta con esa hora.</p>
      </div>

      <datalist id="lol-team-tags">
        {teams.map(t => <option key={t.tag} value={t.tag}>{t.name}</option>)}
      </datalist>

      <div className="grid gap-2 grid-cols-2 sm:grid-cols-4">
        <label className="flex flex-col gap-1 text-xs text-text-muted col-span-2">
          Edición
          <select className={fieldClass} value={editionId ?? ''} onChange={e => onEditionChange(Number(e.target.value))} disabled={isPending}>
            {editions.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-text-muted col-span-2">
          Fase
          <select className={fieldClass} value={phaseId ?? ''} onChange={e => onPhaseChange(Number(e.target.value))} disabled={isPending}>
            {edition?.phases.map(p => (
              <option key={p.id} value={p.id}>{p.name} (v{p.version}{p.current ? ', en curso' : ''})</option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-text-muted">
          Equipo A (sigla)
          <input className={`${fieldClass} uppercase`} list="lol-team-tags" value={homeTag}
                 onChange={e => setHomeTag(e.target.value.toUpperCase())} placeholder="KC" maxLength={5} disabled={isPending} />
        </label>
        <label className="flex flex-col gap-1 text-xs text-text-muted">
          Equipo B (sigla)
          <input className={`${fieldClass} uppercase`} list="lol-team-tags" value={awayTag}
                 onChange={e => setAwayTag(e.target.value.toUpperCase())} placeholder="C9" maxLength={5} disabled={isPending} />
        </label>
        <label className="flex flex-col gap-1 text-xs text-text-muted col-span-2 sm:col-span-1">
          Inicio (Madrid)
          <input type="datetime-local" className={fieldClass} value={localDateTime}
                 onChange={e => setLocalDateTime(e.target.value)} disabled={isPending} />
        </label>
        <label className="flex flex-col gap-1 text-xs text-text-muted">
          Formato
          <select className={fieldClass} value={bestOf} onChange={e => setBestOf(Number(e.target.value))} disabled={isPending}>
            {[1, 3, 5].map(n => <option key={n} value={n}>Bo{n}</option>)}
          </select>
        </label>
        <label className="flex items-center gap-2 text-sm text-text-primary col-span-2 sm:col-span-4">
          <input type="checkbox" checked={featured} onChange={e => setFeatured(e.target.checked)} disabled={isPending} />
          ⭐ Partido de la jornada
        </label>
      </div>

      <button
        type="button"
        onClick={submit}
        disabled={isPending || !phaseId || !homeTag || !awayTag || !localDateTime}
        className="self-start px-4 py-1.5 rounded-md text-sm font-semibold bg-accent bg-accent-gradient text-on-accent shadow-glow-accent disabled:shadow-none disabled:opacity-50"
      >
        {isPending ? 'Creando…' : 'Crear serie'}
      </button>
    </section>
  )
}
