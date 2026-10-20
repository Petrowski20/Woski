'use client'

import { useEffect, useRef } from 'react'
import { initialScrollBlocked } from './scrollTarget'

// Al montar una lista, la lleva una sola vez hasta el elemento con id
// `elementId` (en cliente). El margen bajo las barras fijas lo pone el propio
// elemento con scroll-margin-top (clase scroll-mt-*); scrollIntoView también
// desplaza los contenedores con scroll propio que lo envuelvan.

let lastPopState = -Infinity
if (typeof window !== 'undefined') {
  window.addEventListener('popstate', () => { lastPopState = performance.now() })
}

// Gestos que indican que el usuario ya se está moviendo por la página.
const USER_SCROLL_EVENTS = ['wheel', 'touchstart', 'keydown', 'pointerdown'] as const

export function useInitialScroll(elementId: string | null) {
  const done = useRef(false)

  useEffect(() => {
    if (done.current || !elementId) return

    let userMoved = false
    const onUser = () => { userMoved = true }
    for (const ev of USER_SCROLL_EVENTS) window.addEventListener(ev, onUser, { passive: true, capture: true })
    const stop = () => {
      for (const ev of USER_SCROLL_EVENTS) window.removeEventListener(ev, onUser, { capture: true })
    }

    // Dos frames: el layout de la lista ya está pintado y el desplazamiento
    // de la propia navegación (Next) ya se ha aplicado.
    let raf2 = 0
    const raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => {
        stop()
        done.current = true
        const nav = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined
        // Carga completa de esta misma URL (no una navegación dentro de la app).
        const firstLoad = !!nav && nav.name.split('#')[0] === window.location.href.split('#')[0]
        const blocked = userMoved || initialScrollBlocked({
          hash: window.location.hash,
          firstLoad,
          navigationType: nav?.type ?? null,
          msSincePopState: performance.now() - lastPopState,
          scrollY: window.scrollY,
        })
        if (blocked) return
        const el = document.getElementById(elementId)
        if (!el) return
        const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
        el.scrollIntoView({ block: 'start', behavior: reduce ? 'auto' : 'smooth' })
      })
    })

    // En desarrollo (StrictMode) el efecto se monta dos veces: la limpieza
    // cancela el primero y `done` sigue en false para el segundo.
    return () => {
      cancelAnimationFrame(raf1)
      cancelAnimationFrame(raf2)
      stop()
    }
  }, [elementId])
}
