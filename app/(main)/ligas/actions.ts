'use server'

import { createClient } from '@/utils/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { revalidatePath } from 'next/cache'

// Caracteres sin ambigüedad visual (sin 0/O, 1/I, 8/B)
const CODE_CHARS = 'ACDEFGHJKLMNPQRTUVWXYZ2345679'

function generateCode(length = 6): string {
  return Array.from(
    { length },
    () => CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]
  ).join('')
}

// ─── Crear liga ───────────────────────────────────────────────
export async function createLeagueAction(
  name: string,
  description: string
): Promise<{ join_code?: string; error?: string }> {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'No estás autenticado' }

  const join_code = generateCode()

  // Insertar la liga
  const { data: league, error: leagueError } = await supabase
    .from('pools')
    .insert({
      name,
      description: description || null,
      created_by: user.id,
      join_code,
    })
    .select('id')
    .single()

  if (leagueError) {
    if (leagueError.code === '23505') return { error: 'Código duplicado, inténtalo de nuevo' }
    return { error: leagueError.message }
  }

  // Inscribir automáticamente al creador
  const { error: memberError } = await supabase
    .from('pool_members')
    .insert({ profile_id: user.id, pool_id: league.id })

  if (memberError) {
    // Rollback: evitar liga huérfana sin miembros
    await supabase.from('pools').delete().eq('id', league.id)
    return { error: memberError.message }
  }

  revalidatePath('/ligas')
  revalidatePath('/clasificacion')

  return { join_code }
}

// ─── Unirse a liga ────────────────────────────────────────────
export async function joinLeagueAction(
  code: string
): Promise<{ leagueName?: string; error?: string }> {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'No estás autenticado' }

  // Buscar la liga por código
  const { data: league, error: findError } = await supabase
    .from('pools')
    .select('id, name')
    .eq('join_code', code.toUpperCase())
    .single()

  if (findError || !league) return { error: 'Código incorrecto o liga inexistente' }

  // Verificar si ya es miembro
  const { data: existing } = await supabase
    .from('pool_members')
    .select('pool_id')
    .eq('profile_id', user.id)
    .eq('pool_id', league.id)
    .maybeSingle()

  if (existing) return { error: `Ya eres miembro de "${league.name}"` }

  // Unirse
  const { error: joinError } = await supabase
    .from('pool_members')
    .insert({ profile_id: user.id, pool_id: league.id })

  if (joinError) {
    if (joinError.code === '23505') return { error: `Ya eres miembro de "${league.name}"` }
    return { error: joinError.message }
  }

  revalidatePath('/ligas')
  revalidatePath('/clasificacion')

  return { leagueName: league.name }
}

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
