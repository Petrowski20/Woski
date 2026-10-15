import { createClient } from '@/utils/supabase/server'
import AdminLolReminders, { type ReminderRow } from '@/components/lol/AdminLolReminders'
import type { OpsToday } from '@/components/lol/adminOpsTypes'

// LoL · Recordatorios: por cada serie con la votación abierta (las próximas
// de las ediciones en curso, admin_lol_ops_today), quién falta por votar
// según admin_lol_match_participation (participantes de la edición, sin
// ocultos). Aquí no se envía nada: solo se copia texto.
export default async function LolRecordatoriosTab() {
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('admin_lol_ops_today')
  if (error || !data) {
    if (error) console.error('[admin lol] ops today', error)
    return (
      <p role="alert" className="rounded-lg bg-danger/10 px-4 py-3 text-sm text-text-primary">
        No se han podido cargar las series abiertas.
      </p>
    )
  }
  const ops = data as OpsToday

  const rows: ReminderRow[] = await Promise.all(
    ops.open.map(async m => {
      const { data: part, error: partError } = await supabase.rpc('admin_lol_match_participation', { p_match_id: m.id })
      if (partError) console.error('[admin lol] participation', m.id, partError)
      const list = (part ?? []) as { nickname: string; has_voted: boolean }[]
      return {
        id: m.id,
        edition: m.edition,
        phase: m.phase,
        home: m.home,
        away: m.away,
        bestOf: m.best_of,
        featured: m.featured,
        date: m.match_date,
        locksAt: m.locks_at,
        participants: list.length,
        missing: list.filter(r => !r.has_voted).map(r => r.nickname),
        failed: Boolean(partError),
      }
    }),
  )

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="heading-display text-xl font-bold text-text-primary">Recordatorios</h1>
        <p className="text-sm text-text-muted">
          Quién falta por votar en cada serie con la votación abierta. &quot;Copiar lista&quot; deja el texto listo para pegarlo en
          WhatsApp; la app no envía nada. No aparecen los usuarios ocultos.
        </p>
      </div>
      <AdminLolReminders rows={rows} />
    </div>
  )
}
