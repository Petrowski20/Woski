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
    .from('private_leagues')
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
    .from('profile_leagues')
    .insert({ profile_id: user.id, league_id: league.id })

  if (memberError) return { error: memberError.message }

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
    .from('private_leagues')
    .select('id, name')
    .eq('join_code', code.toUpperCase())
    .single()

  if (findError || !league) return { error: 'Código incorrecto o liga inexistente' }

  // Verificar si ya es miembro
  const { data: existing } = await supabase
    .from('profile_leagues')
    .select('league_id')
    .eq('profile_id', user.id)
    .eq('league_id', league.id)
    .maybeSingle()

  if (existing) return { error: `Ya eres miembro de "${league.name}"` }

  // Unirse
  const { error: joinError } = await supabase
    .from('profile_leagues')
    .insert({ profile_id: user.id, league_id: league.id })

  if (joinError) return { error: joinError.message }

  revalidatePath('/ligas')
  revalidatePath('/clasificacion')

  return { leagueName: league.name }
}

// ─── Abandonar liga ───────────────────────────────────────────
export async function leaveLeagueAction(
  leagueId: number
): Promise<{ error?: string }> {
  // Autenticación con cliente normal (respeta cookies de sesión)
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'No estás autenticado' }

  // Cliente admin para saltarse RLS (profile_leagues no tiene política DELETE)
  const supabaseAdmin = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  )

  const { error } = await supabaseAdmin
    .from('profile_leagues')
    .delete()
    .eq('profile_id', user.id)
    .eq('league_id', leagueId)

  if (error) {
    console.error('[leaveLeagueAction]', error)
    return { error: error.message }
  }

  revalidatePath('/ligas')
  revalidatePath('/clasificacion')

  return {}
}
