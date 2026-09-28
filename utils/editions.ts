import type { SupabaseClient } from '@supabase/supabase-js'

export interface ActiveEdition {
  id: number
  /** "LEC 2026 Summer", "Mundial 2026"… */
  fullName: string
  sportName: string
}

/** Fecha de hoy (YYYY-MM-DD) en horario peninsular español. */
function todayMadrid(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid' }).format(new Date())
}

/**
 * Ediciones en curso de cualquier deporte. Mismo criterio que
 * getActiveLolEditions (start_date <= hoy <= end_date, hora de Madrid),
 * sin filtrar por deporte.
 */
export async function getActiveEditions(supabase: SupabaseClient): Promise<ActiveEdition[]> {
  const today = todayMadrid()
  const { data, error } = await supabase
    .from('editions')
    .select('id, name, start_date, competitions!inner(name, sports!inner(name))')
    .lte('start_date', today)
    .gte('end_date', today)
    .order('start_date', { ascending: true })
  if (error) {
    console.error('[editions] active', error)
    throw new Error('[editions] active')
  }

  type Row = { id: number; name: string; competitions: { name: string; sports: { name: string } } }
  return ((data ?? []) as unknown as Row[]).map(e => ({
    id: e.id,
    fullName: `${e.competitions.name} ${e.name}`,
    sportName: e.competitions.sports.name,
  }))
}
