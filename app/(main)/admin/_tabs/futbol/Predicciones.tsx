import { createClient as createSVClient } from '@supabase/supabase-js'
import AdminPredictionsEditor from '@/components/AdminPredictionsEditor'
import ScrollToTopButton from '@/components/ScrollToTopButton'

// Fútbol (archivo) · Predicciones. Antes era /admin/predicciones. El rol
// ADMIN lo comprueba /admin/page.tsx.
export default async function FutbolPrediccionesTab({ selectedPlayerId }: { selectedPlayerId: string | null }) {
  const supabaseAdmin = createSVClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  )

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
    <>
      <ScrollToTopButton />
      <AdminPredictionsEditor
        key={selectedPlayerId ?? 'none'}
        profiles={(profiles ?? []) as { id: string; nickname: string }[]}
        matches={(matches ?? []) as any[]}
        predictions={predictions}
        selectedPlayerId={selectedPlayerId ?? null}
        lockCutoff={lockCutoff}
      />
    </>
  )
}
