'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { Loader2 } from 'lucide-react'
import { setLolPoolAction } from '@/app/(main)/lol/actions'
import type { PoolOption } from '@/utils/lol/types'

interface Props {
  editionId: number
  pools: PoolOption[]
  /** null = Global */
  activePoolId: number | null
}

// Mismo patrón que LeagueSelector (fútbol): la elección se guarda en el
// perfil y la página se revalida. Los pools son siempre de la edición activa.
export default function PoolSelector({ editionId, pools, activePoolId }: Props) {
  const [pendingId, setPendingId] = useState<number | null | undefined>(undefined)
  const pending = pendingId !== undefined

  const select = async (poolId: number | null) => {
    if (pending || poolId === activePoolId) return
    setPendingId(poolId)
    const res = await setLolPoolAction(editionId, poolId)
    setPendingId(undefined)
    if (res.error) toast.error(res.error)
  }

  const options: { id: number | null; label: string }[] = [
    { id: null, label: 'Global' },
    ...pools.map(p => ({ id: p.id, label: p.name })),
  ]

  return (
    <div className="flex flex-wrap items-center gap-2 mb-6">
      <div role="group" aria-label="Clasificación" className="flex flex-wrap gap-2">
        {options.map(o => {
          const active = pending ? o.id === pendingId : o.id === activePoolId
          const loading = pending && o.id === pendingId
          return (
            <button
              key={o.id ?? 'global'}
              type="button"
              onClick={() => select(o.id)}
              disabled={pending}
              aria-pressed={active}
              aria-busy={loading || undefined}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-colors disabled:cursor-wait ${
                active
                  ? 'bg-accent text-on-accent shadow-sm'
                  : 'bg-bg-muted text-text-muted hover:text-text-primary disabled:opacity-60'
              }`}
            >
              {loading && <Loader2 className="w-3 h-3 animate-spin" />}
              {o.id === null ? '🌍' : '🏆'} {o.label}
            </button>
          )
        })}
      </div>
      {pending && <span className="text-xs text-text-muted animate-pulse">Guardando…</span>}
    </div>
  )
}
