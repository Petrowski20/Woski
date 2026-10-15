'use server'

import { createClient } from '@/utils/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { revalidatePath } from 'next/cache'

// Crear y unirse a ligas sin club ya no existe: están congeladas
// (20261016100002). Quien ya es miembro las sigue viendo y puede salir.

// ─── Miembros de una liga ─────────────────────────────────────
export async function getLeagueMembersAction(leagueId: number): Promise<{
  members?: Array<{ profileId: string; nickname: string; avatarUrl: string | null; joinedAt: string }>
  error?: string
}> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'No estás autenticado' }

  const { data, error } = await supabase
    .from('pool_members')
    .select('profile_id, joined_at, profiles(nickname, avatar_url)')
    .eq('pool_id', leagueId)
    .order('joined_at', { ascending: true })

  if (error) return { error: error.message }

  const members = (data ?? []).map((row: any) => ({
    profileId: row.profile_id as string,
    nickname: row.profiles?.nickname ?? 'Usuario',
    avatarUrl: row.profiles?.avatar_url ?? null,
    joinedAt: row.joined_at as string,
  }))

  return { members }
}

// ─── Expulsar miembro ─────────────────────────────────────────
export async function kickMemberAction(
  leagueId: number,
  targetProfileId: string
): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'No estás autenticado' }

  const { data: league } = await supabase
    .from('pools')
    .select('created_by')
    .eq('id', leagueId)
    .single()

  if (!league || league.created_by !== user.id)
    return { error: 'Solo el creador puede expulsar miembros' }
  if (targetProfileId === user.id)
    return { error: 'No puedes expulsarte a ti mismo' }

  const supabaseAdmin = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  )

  const { error } = await supabaseAdmin
    .from('pool_members')
    .delete()
    .eq('profile_id', targetProfileId)
    .eq('pool_id', leagueId)

  if (error) return { error: error.message }

  revalidatePath('/ligas')
  revalidatePath('/clasificacion')
  return {}
}

// ─── Abandonar liga ───────────────────────────────────────────
export async function leaveLeagueAction(
  leagueId: number
): Promise<{ error?: string }> {
  // Autenticación con cliente normal (respeta cookies de sesión)
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'No estás autenticado' }

  // Cliente admin para saltarse RLS (pool_members no tiene política DELETE)
  const supabaseAdmin = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  )

  const { error } = await supabaseAdmin
    .from('pool_members')
    .delete()
    .eq('profile_id', user.id)
    .eq('pool_id', leagueId)

  if (error) {
    console.error('[leaveLeagueAction]', error)
    return { error: error.message }
  }

  revalidatePath('/ligas')
  revalidatePath('/clasificacion')

  return {}
}
