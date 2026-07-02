import { createClient } from '@/utils/supabase/server'
import { createClient as createSVClient } from '@supabase/supabase-js'
import { redirect } from 'next/navigation'
import AdminJugadoresManager from '@/components/AdminJugadoresManager'
import type { PlayerRankingRow } from '@/components/AdminJugadoresManager'

export default async function AdminJugadoresPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: myProfile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()
  if (myProfile?.role !== 'ADMIN') redirect('/')

  const supabaseAdmin = createSVClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  )

  const { data, error } = await supabaseAdmin.rpc('get_admin_player_ranking')

  if (error) {
    return (
      <div className="p-8 text-center text-red-600 dark:text-red-400">
        <p className="font-semibold">Error cargando jugadores</p>
        <p className="text-sm mt-1">{error.message}</p>
      </div>
    )
  }

  return (
    <AdminJugadoresManager players={(data ?? []) as PlayerRankingRow[]} />
  )
}
