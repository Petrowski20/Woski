import type { LolAwardKey } from './types'

// Textos de los premios de LoL. Qué cuenta y quién gana lo decide la BD
// (get_lol_awards); aquí solo se presenta, en el orden de las tarjetas.

export interface AwardDef {
  key: LolAwardKey
  emoji: string
  title: string
  description: string
  /** Valor del ganador tal como se muestra ("6 seguidas", "+4 puestos"…). */
  format: (value: number, detail: string | null) => string
  group: 'good' | 'fun'
}

const dayFmt = new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'short', timeZone: 'UTC' })
const onDay = (day: string | null) => (day ? ` · ${dayFmt.format(new Date(`${day}T12:00:00Z`))}` : '')
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

export const AWARDS: AwardDef[] = [
  { key: 'streak', group: 'good', emoji: '🔥', title: 'Racha legendaria',
    description: 'Más series seguidas acertando el ganador (dentro de una fase)',
    format: v => plural(v, 'seguida', 'seguidas') },
  { key: 'hits', group: 'good', emoji: '🔮', title: 'El Oráculo',
    description: 'Más ganadores acertados',
    format: v => plural(v, 'acierto', 'aciertos') },
  { key: 'accuracy', group: 'good', emoji: '🎯', title: 'Puntería',
    description: 'Mejor % de ganadores acertados sobre sus votos',
    format: v => `${v.toLocaleString('es-ES')} %` },
  { key: 'exact', group: 'good', emoji: '🧮', title: 'Francotirador',
    description: 'Más marcadores exactos en Bo3 y Bo5',
    format: v => plural(v, 'exacto', 'exactos') },
  { key: 'perfect', group: 'good', emoji: '⭐', title: 'Rey de los plenos',
    description: 'Más jornadas acertando todas las series',
    format: v => plural(v, 'pleno', 'plenos') },
  { key: 'contrarian', group: 'good', emoji: '🦄', title: 'Contracorriente',
    description: 'Más aciertos yendo con menos del 25 % de la gente (o solo)',
    format: v => plural(v, 'acierto', 'aciertos') },
  { key: 'golden_day', group: 'good', emoji: '💎', title: 'Jornada de oro',
    description: 'Más puntos de series en una sola jornada',
    format: (v, d) => `${v} pts${onDay(d)}` },
  { key: 'leader', group: 'good', emoji: '👑', title: 'El Inamovible',
    description: 'Más jornadas acabando líder',
    format: v => plural(v, 'jornada', 'jornadas') },
  { key: 'rocket', group: 'good', emoji: '📈', title: 'El Cohete',
    description: 'Mayor subida en la clasificación de una jornada a otra',
    format: (v, d) => `+${plural(v, 'puesto', 'puestos')}${onDay(d)}` },

  { key: 'jinx', group: 'fun', emoji: '💀', title: 'El Gafe',
    description: 'Más series seguidas fallando (no votar también cuenta)',
    format: v => plural(v, 'fallo seguido', 'fallos seguidos') },
  { key: 'negative', group: 'fun', emoji: '🥶', title: 'Pleno negativo',
    description: 'Más jornadas sin acertar ninguna serie',
    format: v => plural(v, 'jornada', 'jornadas') },
  { key: 'sleeper', group: 'fun', emoji: '😴', title: 'El Dormilón',
    description: 'Más series sin votar desde su primer voto',
    format: v => plural(v, 'sin votar', 'sin votar') },
  { key: 'sheep', group: 'fun', emoji: '🐑', title: 'El Borrego',
    description: 'Más votos con la mayoría (más del 50 % votó lo mismo)',
    format: v => plural(v, 'voto', 'votos') },
  { key: 'uyyy', group: 'fun', emoji: '😬', title: 'El Uyyy',
    description: 'Acertó el ganador y se quedó a un mapa del marcador',
    format: v => plural(v, 'vez', 'veces') },
  { key: 'rollercoaster', group: 'fun', emoji: '🎢', title: 'Montaña rusa',
    description: 'Mayor caída en la clasificación de una jornada a otra',
    format: (v, d) => `−${plural(v, 'puesto', 'puestos')}${onDay(d)}` },
  { key: 'fan', group: 'fun', emoji: '📣', title: 'El Hincha',
    description: 'Más veces votando como ganador al mismo equipo',
    format: (v, d) => `${plural(v, 'voto', 'votos')}${d ? ` a ${d}` : ''}` },
]
