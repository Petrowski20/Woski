import { redirect } from 'next/navigation'
import { createClient } from '@/utils/supabase/server'
import AdminLolResults from '@/components/lol/AdminLolResults'
import AdminLolManualVote from '@/components/lol/AdminLolManualVote'
import { getActiveLolEditions, getEditionMatches } from '../../lol/data'

export default async function AdminLolPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'ADMIN') redirect('/')

  const editions = await getActiveLolEditions(supabase)
  const [sections, playersRes] = await Promise.all([
    Promise.all(
      editions.map(async e => ({ edition: e, matches: await getEditionMatches(supabase, e.id, user.id) })),
    ),
    supabase.from('profiles').select('id, nickname').order('nickname'),
  ])
  if (playersRes.error) console.error('[admin lol] players', playersRes.error)
  const players = (playersRes.data ?? []) as { id: string; nickname: string }[]

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-bold text-text-primary">Resultados LoL</h1>
        <p className="text-sm text-text-muted">
          Guardar un resultado marca el partido como finalizado y la base de datos puntúa las predicciones
          (y recalcula las rachas de las series posteriores de la fase).
        </p>
      </div>
      {sections.length === 0 ? (
        <p className="text-sm text-text-muted">No hay ediciones de LoL activas.</p>
      ) : (
        <>
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
