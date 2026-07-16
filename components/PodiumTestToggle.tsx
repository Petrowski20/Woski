'use client'

import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { setPodiumTestModeAction } from '@/app/(main)/admin/actions'

interface Props {
  initialEnabled: boolean
}

export default function PodiumTestToggle({ initialEnabled }: Props) {
  const [enabled, setEnabled] = useState(initialEnabled)
  const [isPending, startTransition] = useTransition()

  function toggle() {
    const newValue = !enabled
    setEnabled(newValue)
    startTransition(async () => {
      const result = await setPodiumTestModeAction(newValue)
      if (result.error) {
        setEnabled(!newValue)
        toast.error(result.error)
      }
    })
  }

  return (
    <div className="mb-6 flex items-center justify-between gap-4 rounded-xl border border-[#FFD6D1] dark:border-slate-800 bg-white dark:bg-slate-900 px-4 py-3 shadow-sm">
      <div>
        <p className="text-sm font-semibold text-gray-800 dark:text-gray-100">
          🏆 Podio de campeón (modo prueba)
        </p>
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
          Fuerza a mostrar el podio en /clasificación aunque el partido 104 no
          haya terminado, para poder comprobarlo en producción.
        </p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={enabled}
        onClick={toggle}
        disabled={isPending}
        className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors disabled:opacity-50 ${
          enabled ? 'bg-blue-600' : 'bg-gray-300 dark:bg-slate-700'
        }`}
      >
        <span
          className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
            enabled ? 'translate-x-6' : 'translate-x-1'
          }`}
        />
      </button>
    </div>
  )
}
