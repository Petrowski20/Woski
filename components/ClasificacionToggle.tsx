'use client'

import { useState } from 'react'

interface ClasificacionToggleProps {
  children: React.ReactNode
  specialLabel?: string
  normalLabel?: string
}

export default function ClasificacionToggle({
  children,
  specialLabel = '🏆 Especial',
  normalLabel = '📋 Normal',
}: ClasificacionToggleProps) {
  const [showSpecial, setShowSpecial] = useState(true)

  return (
    <div>
      <div className="inline-flex rounded-lg border border-[#FFD6D1] dark:border-slate-800 bg-white dark:bg-slate-900 p-1 mb-4 shadow-sm">
        <button
          type="button"
          onClick={() => setShowSpecial(true)}
          className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors ${
            showSpecial
              ? 'bg-blue-600 text-white shadow-sm'
              : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
          }`}
        >
          {specialLabel}
        </button>
        <button
          type="button"
          onClick={() => setShowSpecial(false)}
          className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors ${
            !showSpecial
              ? 'bg-blue-600 text-white shadow-sm'
              : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
          }`}
        >
          {normalLabel}
        </button>
      </div>

      {showSpecial && children}
    </div>
  )
}
