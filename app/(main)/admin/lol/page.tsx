import { redirect } from 'next/navigation'
import { createClient } from '@/utils/supabase/server'
import AdminLolToday from '@/components/lol/AdminLolToday'
import AdminLolMatchForm, { type TeamOption } from '@/components/lol/AdminLolMatchForm'
import AdminLolResults from '@/components/lol/AdminLolResults'
import AdminLolManualVote from '@/components/lol/AdminLolManualVote'
import type { OpsToday } from '@/components/lol/adminOpsTypes'
import { getActiveLolEditions, getEditionMatches, LOL_SPORT_SLUG, pickLolEdition } from '../../lol/data'

// Centro de operaciones LoL. El rol ADMIN se comprueba aquí (servidor) y otra
// vez dentro de cada función SQL admin_* que se llama con esta sesión.
export default async function AdminLolPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'ADMIN') redirect('/')

  const editions = await getActiveLolEditions(supabase)
  const [todayRes, teamsRes, sections, playersRes] = await Promise.all([
    supabase.rpc('admin_lol_ops_today'),
    supabase.from('teams').select('iso_code, name, sports!inner(slug)').eq('sports.slug', LOL_SPORT_SLUG).order('iso_code'),
    Promise.all(
      editions.map(async e => ({ edition: e, matches: await getEditionMatches(supabase, e.id, user.id) })),
    ),
    supabase.from('profiles').select('id, nickname').order('nickname'),
  ])
  if (todayRes.error) console.error('[admin lol] ops today', todayRes.error)
  if (teamsRes.error) console.error('[admin lol] teams', teamsRes.error)
  if (playersRes.error) console.error('[admin lol] players', playersRes.error)

  const today = (todayRes.data ?? null) as OpsToday | null
  const teams: TeamOption[] = ((teamsRes.data ?? []) as { iso_code: string; name: string }[])
    .map(t => ({ tag: t.iso_code, name: t.name }))
  const players = (playersRes.data ?? []) as { id: string; nickname: string }[]
  const defaultEditionId = editions.length ? pickLolEdition(editions, null).id : null

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-bold text-text-primary">Operaciones LoL</h1>
        <p className="text-sm text-text-muted">
          Todo cambio queda registrado. Guardar un resultado, cancelar o mover una serie recalcula los puntos con el motor
          de la base de datos.
        </p>
      </div>

      {today ? (
        <AdminLolToday data={today} />
      ) : (
        <p role="alert" className="rounded-lg bg-danger/10 px-4 py-3 text-sm text-text-primary">
          No se ha podido cargar el panel &quot;Hoy&quot;. ¿Están aplicadas las migraciones de operaciones admin?
        </p>
      )}

      {sections.length === 0 ? (
        <p className="text-sm text-text-muted">No hay ediciones de LoL activas.</p>
      ) : (
        <>
          {today && <AdminLolMatchForm editions={today.editions} defaultEditionId={defaultEditionId} teams={teams} />}
          {sections.map(({ edition, matches }) => (
            <AdminLolResults key={edition.id} title={edition.fullName} editionId={edition.id} matches={matches} />
          ))}
          <AdminLolManualVote
            players={players}
            sections={sections.map(({ edition, matches }) => ({ editionName: edition.fullName, matches }))}
          />
        </>
      )}
    </div>
  )
}
