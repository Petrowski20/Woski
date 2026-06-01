'use client'

import { useTransition } from 'react'
import { toast } from 'sonner'
import { leaveLeagueAction } from '@/app/(main)/ligas/actions'

interface Props {
  leagueId: number
  leagueName: string
}

export default function LeaveLeagueButton({ leagueId, leagueName }: Props) {
  const [isPending, startTransition] = useTransition()

  function handleClick() {
    if (!window.confirm(`¿Seguro que quieres abandonar la liga "${leagueName}"?`)) return

    startTransition(async () => {
      const result = await leaveLeagueAction(leagueId)
      if (result.error) {
        toast.error(result.error)
      } else {
        toast.success(`Has abandonado la liga "${leagueName}"`)
      }
    })
  }

  return (
    <button
      onClick={handleClick}
      disabled={isPending}
      className="text-xs font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 px-2 py-1 rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
    >
      {isPending ? 'Saliendo…' : '🚪 Abandonar'}
    </button>
  )
}
