import { createClient } from '@/utils/supabase/server'
import { createClient as createSVClient } from '@supabase/supabase-js'
import { redirect } from 'next/navigation'
import AdminPredictionsEditor from '@/components/AdminPredictionsEditor'

export default async function AdminPredictionesPage({
  searchParams,
}: {
  searchParams: Promise<{ player?: string }>
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: myProfile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (myProfile?.role !== 'ADMIN') redirect('/')

  const supabaseAdmin = createSVClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  )

  const { player: selectedPlayerId } = await searchParams

  // Partidos bloqueados = ya finalizados O a menos de 1 hora del inicio
  const lockCutoff = new Date(Date.now() + 60 * 60 * 1000).toISOString()

  const [{ data: profiles }, { data: matches }] = await Promise.all([
    supabaseAdmin.from('profiles').select('id, nickname').order('nickname'),
    supabaseAdmin
      .from('matches')
      .select(`
        id, match_date, stage, group_letter, status, home_goals, away_goals, advancing_team_id,
        home_team_id, away_team_id,
        home_team:teams!home_team_id(name, flag_emoji, iso_code),
        away_team:teams!away_team_id(name, flag_emoji, iso_code)
      `)
      .or(`status.neq.PENDING,match_date.lte.${lockCutoff}`)
      .order('match_date', { ascending: true }),
  ])

  let predictions: any[] = []
  if (selectedPlayerId) {
    const { data } = await supabaseAdmin
      .from('predictions')
      .select('match_id, pred_home_goals, pred_away_goals, pred_advancing_team_id, points_earned')
      .eq('profile_id', selectedPlayerId)
      .in('match_id', (matches ?? []).map((m: any) => m.id))
    predictions = data ?? []
  }

  return (
    <AdminPredictionsEditor
      profiles={(profiles ?? []) as { id: string; nickname: string }[]}
      matches={(matches ?? []) as any[]}
      predictions={predictions}
      selectedPlayerId={selectedPlayerId ?? null}
    />
  )
}
