'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { adminHref, type AdminTab } from '@/utils/admin/tabs'

export interface FilterField {
  /** Parámetro de la URL (?edicion=, ?fase=…). */
  name: string
  label: string
  value: string
  options: { value: string; label: string; group?: string }[]
  /** Parámetros que se vacían al cambiar este (p. ej. la fase al cambiar de edición). */
  resets?: string[]
}

const fieldClass = 'text-sm bg-bg-muted border border-border rounded-md px-2 py-1.5 text-text-primary min-w-0 w-full'

// Filtros de las pestañas de LoL en /admin. El estado vive en la URL; la
// página (servidor) vuelve a cargar con los nuevos parámetros.
export default function AdminLolFilters({ tab, fields }: { tab: AdminTab; fields: FilterField[] }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  const change = (field: FilterField, value: string) => {
    const params: Record<string, string> = {}
    for (const f of fields) {
      if (f.name === field.name) params[f.name] = value
      else if (!field.resets?.includes(f.name)) params[f.name] = f.value
    }
    startTransition(() => router.push(adminHref('lol', tab, params), { scroll: false }))
  }

  return (
    <div
      className="grid grid-cols-1 min-[420px]:grid-cols-2 lg:grid-cols-4 gap-2 bg-bg-elevated border border-border rounded-card shadow-card p-3"
      aria-busy={isPending}
    >
      {fields.map(f => {
        const groups = [...new Set(f.options.map(o => o.group ?? ''))]
        return (
          <label key={f.name} className="flex flex-col gap-1 text-xs text-text-muted min-w-0">
            {f.label}
            <select className={fieldClass} value={f.value} onChange={e => change(f, e.target.value)} disabled={isPending}>
              {groups.map(g =>
                g ? (
                  <optgroup key={g} label={g}>
                    {f.options.filter(o => o.group === g).map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </optgroup>
                ) : (
                  f.options.filter(o => !o.group).map(o => <option key={o.value} value={o.value}>{o.label}</option>)
                ),
              )}
            </select>
          </label>
        )
      })}
      {isPending && <p className="text-xs text-text-muted self-end pb-2">Cargando…</p>}
    </div>
  )
}
