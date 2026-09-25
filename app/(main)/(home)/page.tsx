import { redirect } from 'next/navigation'
import { createClient } from '@/utils/supabase/server'
import ScrollToTopButton from '@/components/ScrollToTopButton'
import LolCalendar from '@/components/lol/LolCalendar'
import { HistoryLink } from '@/components/lol/EditionSelector'
import PredictionsProgressCard from '@/components/lol/PredictionsProgressCard'
import RankingTop5Card from '@/components/lol/RankingTop5Card'
import { getActiveLolEditions, getEditionMatches, getRankingSidebar } from '../lol/data'

export const metadata = {
  title: 'LoL · Woski',
}

export default async function LolPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  const { edicion } = await searchParams
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const editions = await getActiveLolEditions(supabase)

  if (editions.length === 0) {
    return (
      <div className="w-full flex flex-col gap-6">
        <div className="flex justify-end">
          <HistoryLink />
        </div>
        <div className="flex flex-col items-center gap-3 py-20 text-center">
          <span className="text-5xl" aria-hidden>🗓️</span>
          <h1 className="text-lg font-bold text-text-primary">No hay ninguna competición en curso ahora mismo</h1>
          <p className="text-sm text-text-muted max-w-sm">
            Cuando arranque la próxima competición de League of Legends aparecerá aquí su calendario para que puedas votar.
          </p>
        </div>
      </div>
    )
  }

  // Edición pedida en la URL si sigue activa; si no, la primera activa.
  const selected = editions.find(e => String(e.id) === edicion) ?? editions[0]

  const [matches, ranking] = await Promise.all([
    getEditionMatches(supabase, selected.id, user.id),
    getRankingSidebar(supabase, selected.id, user.id),
  ])

  const countable = matches.filter(m => m.status !== 'CANCELLED')
  const predicted = countable.filter(m => m.myPrediction).length

  return (
    <div className="w-full">
      <ScrollToTopButton />
      <LolCalendar
        key={selected.id}
        editions={editions}
        selectedEditionId={selected.id}
        matches={matches}
        sidebar={
          <>
            <PredictionsProgressCard predicted={predicted} total={countable.length} />
            <RankingTop5Card title={ranking.title} top5={ranking.top5} me={ranking.me} userId={user.id} />
          </>
        }
      />
    </div>
  )
}
