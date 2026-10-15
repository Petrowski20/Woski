import { createClient } from '@/utils/supabase/server'
import RemindersView, { type MatchWithVoters } from '@/components/RemindersView'
import ScrollToTopButton from '@/components/ScrollToTopButton'

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>

/**
 * PostgREST caps a single response at 1000 rows: with 90+ matches × ~25 predicciones
 * cada uno, la tabla predictions supera ese límite y `.in('match_id', ...)` la trunca
 * en silencio, dejando fuera votos de los partidos más recientes. Paginamos con
 * `.range()` para traerla completa.
 */
async function fetchAllPredictions(supabase: SupabaseServerClient, matchIds: number[]) {
  const pageSize = 1000
  const all: { match_id: number; profile_id: string }[] = []
  let from = 0

  while (true) {
    const { data, error } = await supabase
      .from('predictions')
      .select('match_id, profile_id')
      .in('match_id', matchIds)
      .range(from, from + pageSize - 1)

    if (error) throw error
    if (!data || data.length === 0) break

    all.push(...data)
    if (data.length < pageSize) break
    from += pageSize
  }

  return all
}

// Fútbol (archivo) · Recordatorios. Antes era /admin/recordatorios. El rol
// ADMIN lo comprueba /admin/page.tsx.
export default async function FutbolRecordatoriosTab() {
  const supabase = await createClient()

  const now = Date.now()

  const [{ data: matches }, { data: profiles }] = await Promise.all([
    supabase
      .from('matches')
      .select(`
        id, match_date, stage, group_letter, status, home_goals, away_goals,
        home_team:teams!home_team_id (name, flag_emoji),
        away_team:teams!away_team_id (name, flag_emoji)
      `)
      .order('match_date', { ascending: true }),
    supabase
      .from('profiles')
      .select('id, nickname, avatar_url')
      .order('nickname', { ascending: true }),
  ])

  const matchIds = (matches ?? []).map((m) => m.id)

  const predictions = matchIds.length > 0
    ? await fetchAllPredictions(supabase, matchIds)
    : []

  type RawMatch = {
    id: number
    match_date: string
    stage: string
    group_letter: string | null
    status: string
    home_goals: number | null
    away_goals: number | null
    home_team: { name: string; flag_emoji: string } | null
    away_team: { name: string; flag_emoji: string } | null
  }

  const matchesWithVoters: MatchWithVoters[] = ((matches ?? []) as unknown as RawMatch[]).map((match) => {
    const voterIds = new Set(
      predictions
        .filter((p) => p.match_id === match.id)
        .map((p) => p.profile_id),
    )
    const isLocked =
      new Date(match.match_date).getTime() - now < 60 * 60 * 1000 ||
      match.status === 'FINISHED' ||
      match.status === 'CANCELLED'

    return {
      ...match,
      isLocked,
      hanVotado:      (profiles ?? []).filter((p) => voterIds.has(p.id)),
      faltanPorVotar: (profiles ?? []).filter((p) => !voterIds.has(p.id)),
    }
  })

  return (
    <>
      <ScrollToTopButton />
      <RemindersView matches={matchesWithVoters} />
    </>
  )
}
