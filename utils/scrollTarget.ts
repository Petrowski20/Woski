// Desplazamiento inicial de una lista de partidos o series hasta el primero
// que queda por jugar. Aquí solo la parte pura (qué elegir y cuándo no
// desplazar); el efecto en el navegador está en useInitialScroll.ts.

export interface ScrollCandidate {
  id: number
  /** Fecha ISO del partido (match_date). */
  date: string
  /** 'FINISHED' y 'CANCELLED' ya no cuentan; cualquier otro estado, sí. */
  status: string
}

const DONE = new Set(['FINISHED', 'CANCELLED'])

/**
 * Destino del desplazamiento inicial:
 * 1. el más temprano por fecha (empate: menor id, como (match_date, id) en
 *    la BD) que no esté terminado ni cancelado: uno en curso o empezado sin
 *    resultado también cuenta;
 * 2. si no queda ninguno, el último terminado (lo más reciente que mirar);
 * 3. si no hay terminados (lista vacía o todo cancelado), null: no se desplaza.
 */
export function pickScrollTarget(items: readonly ScrollCandidate[]): number | null {
  const sorted = [...items].sort((a, b) => Date.parse(a.date) - Date.parse(b.date) || a.id - b.id)
  const next = sorted.find(m => !DONE.has(m.status))
  if (next) return next.id
  const finished = sorted.filter(m => m.status === 'FINISHED')
  return finished.length > 0 ? finished[finished.length - 1].id : null
}

export interface InitialScrollEnv {
  /** location.hash */
  hash: string
  /** Primera página de la pestaña (carga completa) o navegación dentro de la app. */
  firstLoad: boolean
  /** performance.getEntriesByType('navigation')[0].type en una carga completa. */
  navigationType: string | null
  /** ms desde el último popstate (atrás/adelante dentro de la app); Infinity si no hubo. */
  msSincePopState: number
  /** window.scrollY al montar. */
  scrollY: number
}

/**
 * No se desplaza si la URL apunta a un ancla, si el navegador restaura una
 * posición (atrás/adelante, o una recarga que ya dejó la página bajada) o si
 * el usuario ya ha bajado antes de que la página estuviera lista.
 */
export function initialScrollBlocked(env: InitialScrollEnv): boolean {
  if (env.hash !== '' && env.hash !== '#') return true
  if (env.msSincePopState < 1500) return true
  if (env.firstLoad && (env.navigationType === 'back_forward' || env.scrollY > 0)) return true
  return false
}
