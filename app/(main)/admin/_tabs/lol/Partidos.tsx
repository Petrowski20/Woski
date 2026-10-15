import { createClient } from '@/utils/supabase/server'
import AdminLolToday from '@/components/lol/AdminLolToday'
import AdminLolMatchForm, { type TeamOption } from '@/components/lol/AdminLolMatchForm'
import AdminLolResults from '@/components/lol/AdminLolResults'
import AdminLolFilters from '@/components/lol/AdminLolFilters'
import type { OpsToday } from '@/components/lol/adminOpsTypes'
import type { LolMatchView } from '@/utils/lol/types'
import { getEditionMatches, getLolEditions, LOL_SPORT_SLUG, lolToday } from '../../../lol/data'
import { editionOptions, pickAdminEdition, requestTime } from './shared'

// LoL · Partidos (antes /admin/lol): panel "Hoy", crear serie y la lista de
// series de una edición con todas sus acciones (resultado, editar, cancelar,
// reabrir, partido de la jornada, recalcular). Cada acción vuelve a comprobar
// el rol en el servidor y en su función SQL admin_*.

const ESTADOS = [
  { value: '', label: 'Todos los estados' },
  { value: 'pendiente', label: 'Pendiente' },
  { value: 'sin-resultado', label: 'Empezada sin resultado' },
  { value: 'en-juego', label: 'En juego' },
  { value: 'finalizada', label: 'Finalizada' },
  { value: 'cancelada', label: 'Cancelada' },
] as const

function matchesEstado(m: LolMatchView, estado: string, now: number): boolean {
  switch (estado) {
    case 'pendiente': return m.status === 'PENDING'
    case 'en-juego': return m.status === 'IN_PROGRESS'
    case 'finalizada': return m.status === 'FINISHED'
    case 'cancelada': return m.status === 'CANCELLED'
    case 'sin-resultado':
      return (m.status === 'PENDING' || m.status === 'IN_PROGRESS') && new Date(m.date).getTime() <= now
    default: return true
  }
}

export default async function LolPartidosTab({
  userId,
  edicion,
  fase,
  estado,
}: {
  userId: string
  edicion: string | null
  fase: string | null
  estado: string | null
}) {
  const supabase = await createClient()
  const today = lolToday()
  const editions = await getLolEditions(supabase)
  const edition = pickAdminEdition(editions, edicion, today)

  const [todayRes, teamsRes, phasesRes, matches] = await Promise.all([
    supabase.rpc('admin_lol_ops_today'),
    supabase.from('teams').select('iso_code, name, sports!inner(slug)').eq('sports.slug', LOL_SPORT_SLUG).order('iso_code'),
    edition
      ? supabase.from('phases').select('id, name, order').eq('edition_id', edition.id).order('order')
      : Promise.resolve({ data: [], error: null }),
    edition ? getEditionMatches(supabase, edition.id, userId) : Promise.resolve([] as LolMatchView[]),
  ])
  if (todayRes.error) console.error('[admin lol] ops today', todayRes.error)
  if (teamsRes.error) console.error('[admin lol] teams', teamsRes.error)
  if (phasesRes.error) console.error('[admin lol] phases', phasesRes.error)

  const ops = (todayRes.data ?? null) as OpsToday | null
  const teams: TeamOption[] = ((teamsRes.data ?? []) as { iso_code: string; name: string }[])
    .map(t => ({ tag: t.iso_code, name: t.name }))
  const phases = (phasesRes.data ?? []) as { id: number; name: string }[]
  const faseValue = phases.some(p => String(p.id) === fase) ? fase! : ''
  const estadoValue = ESTADOS.some(e => e.value === estado) ? estado! : ''

  const now = requestTime()
  const filtered = matches.filter(m =>
    (!faseValue || String(m.phaseId) === faseValue) && matchesEstado(m, estadoValue, now),
  )
  // Crear series: solo en ediciones en curso (las que devuelve el panel Hoy).
  const createDefault = ops?.editions.some(e => e.id === edition?.id) ? edition!.id : (ops?.editions[0]?.id ?? null)

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="heading-display text-xl font-bold text-text-primary">Partidos</h1>
        <p className="text-sm text-text-muted">
          Todo cambio queda registrado. Guardar un resultado, cancelar o mover una serie recalcula los puntos con el motor
          de la base de datos.
        </p>
      </div>

      {ops ? (
        <AdminLolToday data={ops} />
      ) : (
        <p role="alert" className="rounded-lg bg-danger/10 px-4 py-3 text-sm text-text-primary">
          No se ha podido cargar el panel &quot;Hoy&quot;. ¿Están aplicadas las migraciones de operaciones admin?
        </p>
      )}

      {ops && ops.editions.length > 0 && (
        <AdminLolMatchForm editions={ops.editions} defaultEditionId={createDefault} teams={teams} />
      )}

      {!edition ? (
        <p className="text-sm text-text-muted">No hay ediciones de LoL.</p>
      ) : (
        <>
          <AdminLolFilters
            tab="partidos"
            fields={[
              { name: 'edicion', label: 'Edición', value: String(edition.id), options: editionOptions(editions, today), resets: ['fase'] },
              { name: 'fase', label: 'Fase', value: faseValue, options: [{ value: '', label: 'Todas las fases' }, ...phases.map(p => ({ value: String(p.id), label: p.name }))] },
              { name: 'estado', label: 'Estado', value: estadoValue, options: ESTADOS.map(e => ({ ...e })) },
            ]}
          />
          <AdminLolResults
            key={`${edition.id}-${faseValue}-${estadoValue}`}
            title={edition.fullName}
            editionId={edition.id}
            matches={filtered}
            total={matches.length}
          />
        </>
      )}
    </div>
  )
}
