import { createClient as createSVClient } from '@supabase/supabase-js'
import AdminFunnyStats from '@/components/AdminFunnyStats'
import type { FunnyPlayerStats } from '@/app/(main)/admin/actions'

// Fútbol (archivo) · Premios. Antes era /admin/stats. El rol ADMIN lo
// comprueba /admin/page.tsx.
export default async function FutbolPremiosTab() {
  const supabaseAdmin = createSVClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  )

  const [{ data: playersRaw, error }, { data: leaguesRaw }] = await Promise.all([
    supabaseAdmin.rpc('get_funny_prediction_stats', { p_league_id: null }),
    supabaseAdmin.from('pools').select('id, name').order('name'),
  ])

  if (error) {
    return (
      <div className="p-8 text-center text-red-600 dark:text-red-400">
        <p className="font-semibold">Error cargando estadísticas</p>
        <p className="text-sm mt-1">{error.message}</p>
      </div>
    )
  }

  return (
    <AdminFunnyStats
      initialPlayers={(playersRaw ?? []) as FunnyPlayerStats[]}
      leagues={(leaguesRaw ?? []) as { id: number; name: string }[]}
    />
  )
}
