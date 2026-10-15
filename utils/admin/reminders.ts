// Texto de recordatorio para pegar en WhatsApp (la app no envía nada).

export interface ReminderSeries {
  /** "G2 vs FNC" */
  title: string
  /** "mié, 15 oct, 14:30" (ya formateado en hora de Madrid). */
  when: string
  missing: string[]
}

/** Nick con o sin @; los espacios se quitan para que la mención no se corte. */
export function formatMention(nickname: string, mention: boolean): string {
  return mention ? `@${nickname.replace(/\s+/g, '')}` : nickname
}

export function reminderBlock(series: ReminderSeries, mention: boolean): string {
  return [
    `⚔️ Falta tu voto en ${series.title} (${series.when}):`,
    ...series.missing.map(n => formatMention(n, mention)),
  ].join('\n')
}

/** Varias series en un solo mensaje; las que no tienen a nadie pendiente se omiten. */
export function reminderMessage(series: ReminderSeries[], mention: boolean): string {
  return series
    .filter(s => s.missing.length > 0)
    .map(s => reminderBlock(s, mention))
    .join('\n\n')
}
