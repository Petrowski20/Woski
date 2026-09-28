'use client'

import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import {
  demoteMemberAction,
  joinPoolAction,
  leavePoolAction,
  openPoolForEditionAction,
  promoteMemberAction,
} from '@/app/(main)/clubes/actions'

const smallButton =
  'px-3 py-1 rounded-md text-xs font-semibold disabled:opacity-50 disabled:cursor-not-allowed transition-opacity'

/** Ascender a admin / devolver a miembro. Solo se muestra al owner. */
export function MemberRoleButton({
  clubId,
  profileId,
  role,
}: {
  clubId: number
  profileId: string
  role: 'admin' | 'member'
}) {
  const [pending, start] = useTransition()
  const promote = role === 'member'

  return (
    <button
      type="button"
      disabled={pending}
      className={`${smallButton} border border-border text-text-muted hover:text-text-primary`}
      onClick={() => start(async () => {
        const result = promote
          ? await promoteMemberAction(clubId, profileId)
          : await demoteMemberAction(clubId, profileId)
        if (result.error !== null) toast.error(result.error)
      })}
    >
      {promote ? 'Hacer admin' : 'Quitar admin'}
    </button>
  )
}

/** Unirse / salir de un pool del club. */
export function PoolMembershipButton({ poolId, joined }: { poolId: number; joined: boolean }) {
  const [pending, start] = useTransition()

  return (
    <button
      type="button"
      disabled={pending}
      className={joined
        ? `${smallButton} border border-border text-text-muted hover:text-danger`
        : `${smallButton} bg-accent text-on-accent hover:opacity-90`}
      onClick={() => start(async () => {
        const result = joined ? await leavePoolAction(poolId) : await joinPoolAction(poolId)
        if (result.error !== null) toast.error(result.error)
        else toast.success(joined ? 'Has salido del pool' : 'Te has unido al pool')
      })}
    >
      {joined ? 'Salir' : 'Unirme'}
    </button>
  )
}

/** Abrir un pool para una edición activa sin pool. Owner/admin. */
export function OpenPoolForm({
  clubId,
  editions,
}: {
  clubId: number
  editions: { id: number; fullName: string; sportName: string }[]
}) {
  const [chosenId, setChosenId] = useState<number | null>(null)
  const [pending, start] = useTransition()

  if (editions.length === 0) {
    return <p className="text-sm text-text-muted">No hay ediciones en curso sin pool en este club.</p>
  }

  // Tras abrir un pool su edición desaparece de la lista: vuelve a la primera.
  const editionId = editions.some(e => e.id === chosenId) ? chosenId! : editions[0].id

  return (
    <form
      className="flex flex-wrap items-center gap-2"
      onSubmit={e => {
        e.preventDefault()
        start(async () => {
          const result = await openPoolForEditionAction(clubId, editionId)
          if (result.error !== null) toast.error(result.error)
          else toast.success('Pool abierto')
        })
      }}
    >
      <select
        className="px-3 py-2 rounded-lg text-sm bg-bg-muted border border-border text-text-primary"
        value={editionId}
        onChange={e => setChosenId(Number(e.target.value))}
      >
        {editions.map(e => (
          <option key={e.id} value={e.id}>{e.fullName} · {e.sportName}</option>
        ))}
      </select>
      <button
        type="submit"
        disabled={pending}
        className="px-4 py-2 rounded-lg text-sm font-semibold bg-accent text-on-accent hover:opacity-90 transition-opacity disabled:opacity-50"
      >
        {pending ? 'Abriendo…' : 'Abrir pool'}
      </button>
    </form>
  )
}
