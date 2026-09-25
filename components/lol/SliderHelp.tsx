'use client'

import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import { HelpCircle, X } from 'lucide-react'

// Un único modal de ayuda del slider para toda la pantalla, con varios
// puntos de entrada (cabecera de la sección y cada tarjeta).
const HelpContext = createContext<(() => void) | null>(null)

export function SliderHelpProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false)
  const openHelp = useCallback(() => setOpen(true), [])

  return (
    <HelpContext.Provider value={openHelp}>
      {children}
      {open && <SliderHelpModal onClose={() => setOpen(false)} />}
    </HelpContext.Provider>
  )
}

export function SliderHelpButton({ size = 'md' }: { size?: 'md' | 'sm' }) {
  const openHelp = useContext(HelpContext)
  if (!openHelp) return null
  return (
    <button
      type="button"
      onClick={openHelp}
      aria-label="Cómo funciona la predicción"
      title="Cómo funciona la predicción"
      className="inline-flex items-center justify-center rounded-full text-text-muted hover:text-accent transition-colors"
    >
      <HelpCircle className={size === 'md' ? 'w-5 h-5' : 'w-3.5 h-3.5'} />
    </button>
  )
}

function SliderHelpModal({ onClose }: { onClose: () => void }) {
  const closeRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null
    closeRef.current?.focus()
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    const { overflow } = document.body.style
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = overflow
      previouslyFocused?.focus()
    }
  }, [onClose])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-overlay" onClick={onClose} aria-hidden />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="slider-help-title"
        className="relative w-full max-w-md max-h-[90vh] overflow-y-auto bg-bg-elevated text-text-primary rounded-2xl shadow-2xl border border-border"
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h2 id="slider-help-title" className="font-bold">¿Cómo funciona la predicción?</h2>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="w-8 h-8 rounded-lg flex items-center justify-center text-text-muted hover:bg-bg-muted transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 flex flex-col gap-4 text-sm">
          {/* TODO: sustituir por la ilustración definitiva */}
          {/* eslint-disable-next-line @next/next/no-img-element -- placeholder estático */}
          <img
            src="/lol/slider-help-placeholder.svg"
            alt="Ilustración del control deslizante de predicción (provisional)"
            className="w-full rounded-xl border border-border bg-bg-muted"
          />
          <ul className="flex flex-col gap-2 text-text-muted list-disc pl-5">
            <li>Arrastra el control hacia el equipo que crees que ganará la serie.</li>
            <li>Cuanto más lejos del centro, más claro es el resultado (por ejemplo 3-0 frente a 3-2).</li>
            <li>Pulsa <strong className="text-text-primary">Guardar predicción</strong>. Puedes cambiarla hasta 1h antes del inicio.</li>
            <li>Al guardar verás qué ha votado el resto de jugadores.</li>
          </ul>
        </div>
      </div>
    </div>
  )
}
