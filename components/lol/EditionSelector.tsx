'use client'

import { useTransition, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { History, Loader2 } from 'lucide-react'
import type { LolEditionOption } from '@/utils/lol/types'

interface Props {
  editions: LolEditionOption[]
  selectedId: number | null
  /** Ruta a la que se navega con ?edicion=ID (calendario por defecto). */
  basePath?: string
}

export function HistoryLink() {
  return (
    <Link
      href="/lol/historial"
      className="shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold text-text-muted border border-border hover:text-text-primary hover:bg-bg-muted transition-colors"
    >
      <History className="w-3.5 h-3.5" />
      Historial
    </Link>
  )
}

// Píldoras excluyentes, una por edición activa. Cambiar de edición navega a
// ?edicion=ID (la página es Server Component); mientras carga se marca la
// píldora destino.
export default function EditionSelector({ editions, selectedId, basePath = '/' }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [targetId, setTargetId] = useState<number | null>(null)

  const select = (id: number) => {
    if (id === selectedId) return
    setTargetId(id)
    startTransition(() => {
      router.push(`${basePath}?edicion=${id}`, { scroll: false })
    })
  }

  return (
    <div className="flex items-center justify-between gap-3">
      <div role="group" aria-label="Competición" className="flex flex-wrap gap-2">
        {editions.map((e) => {
          const active = isPending ? e.id === targetId : e.id === selectedId
          const loading = isPending && e.id === targetId
          return (
            <button
              key={e.id}
              type="button"
              onClick={() => select(e.id)}
              aria-pressed={active}
              aria-busy={loading || undefined}
              title={e.fullName}
              className={`inline-flex items-center gap-1.5 px-4 py-1.5 rounded-full text-sm font-bold uppercase tracking-wide transition-colors ${
                active
                  ? 'bg-accent text-on-accent shadow-sm'
                  : 'bg-bg-muted text-text-muted hover:text-text-primary'
              }`}
            >
              {loading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              {e.label}
            </button>
          )
        })}
      </div>
      <HistoryLink />
    </div>
  )
}
