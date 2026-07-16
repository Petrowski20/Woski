import { createClient } from '@/utils/supabase/server'
import { redirect } from 'next/navigation'
import AdminMatchManager from '@/components/AdminMatchManager'
import type { AdminMatch, TeamOption } from '@/components/AdminMatchManager'
import ScrollToTopButton from '@/components/ScrollToTopButton'
import PodiumTestToggle from '@/components/PodiumTestToggle'

export default async function AdminPage() {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (profile?.role !== 'ADMIN') redirect('/')

  const [{ data: matches, error }, { data: teams }, { data: settings }] = await Promise.all([
    supabase
      .from('matches')
      .select(`
        id, match_date, stage, group_letter, status, home_goals, away_goals,
        home_team_id, away_team_id, advancing_team_id,
        home_team:teams!home_team_id (name, flag_emoji, iso_code),
        away_team:teams!away_team_id (name, flag_emoji, iso_code)
      `)
      .order('match_date', { ascending: true }),
    supabase
      .from('teams')
      .select('id, name, flag_emoji')
      .order('name'),
    supabase
      .from('app_settings')
      .select('podium_test_enabled')
      .eq('id', 1)
      .maybeSingle(),
  ])

  if (error) {
    return (
      <div className="p-8 text-center text-red-600 dark:text-red-400">
        <p>Error cargando partidos: {error.message}</p>
      </div>
    )
  }

  return (
    <div className="w-full">
      <ScrollToTopButton />
      <PodiumTestToggle initialEnabled={settings?.podium_test_enabled ?? false} />
      <AdminMatchManager
        initialMatches={(matches ?? []) as unknown as AdminMatch[]}
        teams={(teams ?? []) as TeamOption[]}
      />
    </div>
  )
}
