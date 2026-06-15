import { createClient } from '@/utils/supabase/server'
import { createClient as createSVClient } from '@supabase/supabase-js'
import { redirect } from 'next/navigation'
import AdminFunnyStats from '@/components/AdminFunnyStats'
import type { FunnyPlayerStats } from '@/app/(main)/admin/actions'

export default async function AdminStatsPage() {
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

  const [{ data: playersRaw, error }, { data: leaguesRaw }] = await Promise.all([
    supabaseAdmin.rpc('get_funny_prediction_stats', { p_league_id: null }),
    supabaseAdmin.from('private_leagues').select('id, name').order('name'),
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
