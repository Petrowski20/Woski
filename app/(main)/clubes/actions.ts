'use server'

import { createClient } from '@/utils/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { revalidatePath } from 'next/cache'
import type { SupabaseClient } from '@supabase/supabase-js'
import { generateJoinCode, normalizeJoinCode } from '@/utils/join-code'
import { getActiveEditions } from '@/utils/editions'
import type { ClubRole } from './types'

// Todas las acciones validan explícitamente (sesión, rol, existencia) antes
// de escribir y escriben con el cliente del usuario: las RLS de
// 20260928100002_club_pool_rls.sql son la segunda capa, no la única.

const NAME_MAX = 60
const SESSION_EXPIRED = 'Tu sesión ha caducado, vuelve a iniciar sesión.'
const GENERIC_ERROR = 'Algo ha fallado. Inténtalo de nuevo.'

type ActionResult<T = object> = ({ error: null } & T) | { error: string }

function isValidId(id: unknown): id is number {
  return Number.isInteger(id) && (id as number) > 0
}

function isUuid(id: unknown): id is string {
  return typeof id === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)
}

function _makeAdminClient() {
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  )
}

async function getSessionUser() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  return { supabase, user }
}

async function getRole(supabase: SupabaseClient, clubId: number, profileId: string): Promise<ClubRole | null> {
  const { data, error } = await supabase
    .from('club_members')
    .select('role')
    .eq('club_id', clubId)
    .eq('profile_id', profileId)
    .maybeSingle()
  if (error) console.error('[clubes] role', error)
  return (data?.role as ClubRole | undefined) ?? null
}

function revalidateClub(clubId: number) {
  revalidatePath('/clubes')
  revalidatePath(`/clubes/${clubId}`)
}

// ─── Crear club ───────────────────────────────────────────────

export async function createClubAction(
  name: string,
  logoUrl: string,
): Promise<ActionResult<{ clubId: number }>> {
  const { supabase, user } = await getSessionUser()
  if (!user) return { error: SESSION_EXPIRED }

  const cleanName = (name ?? '').trim()
  if (!cleanName) return { error: 'El nombre del club es obligatorio.' }
  if (cleanName.length > NAME_MAX) return { error: `El nombre no puede pasar de ${NAME_MAX} caracteres.` }

  let cleanLogo: string | null = (logoUrl ?? '').trim() || null
  if (cleanLogo) {
    try {
      const url = new URL(cleanLogo)
      if (url.protocol !== 'https:') throw new Error('protocol')
      cleanLogo = url.toString()
    } catch {
      return { error: 'El logo tiene que ser una URL https válida.' }
    }
  }

  // join_code es UNIQUE: si choca, se genera otro.
  let clubId: number | null = null
  for (let attempt = 0; attempt < 5 && clubId === null; attempt++) {
    const { data, error } = await supabase
      .from('clubs')
      .insert({ name: cleanName, logo_url: cleanLogo, join_code: generateJoinCode(), created_by: user.id })
      .select('id')
      .single()
    if (!error) clubId = data.id as number
    else if (error.code !== '23505') {
      console.error('[clubes] create: insert club', error)
      return { error: GENERIC_ERROR }
    }
  }
  if (clubId === null) return { error: 'No se ha podido generar un código único. Inténtalo de nuevo.' }

  const { error: ownerError } = await supabase
    .from('club_members')
    .insert({ club_id: clubId, profile_id: user.id, role: 'owner' })

  if (ownerError) {
    console.error('[clubes] create: insert owner', ownerError)
    // Rollback: no dejar un club sin owner. clubs no tiene política DELETE,
    // así que se borra con service role, acotado al club recién creado por
    // este usuario.
    const { error: rollbackError } = await _makeAdminClient()
      .from('clubs')
      .delete()
      .eq('id', clubId)
      .eq('created_by', user.id)
    if (rollbackError) console.error('[clubes] create: rollback', clubId, rollbackError)
    return { error: GENERIC_ERROR }
  }

  revalidatePath('/clubes')
  return { error: null, clubId }
}

// ─── Unirse a club ────────────────────────────────────────────

export async function joinClubAction(
  code: string,
): Promise<ActionResult<{ clubId: number; clubName: string; alreadyMember: boolean }>> {
  const { supabase, user } = await getSessionUser()
  if (!user) return { error: SESSION_EXPIRED }

  const normalized = normalizeJoinCode(code ?? '')
  if (!normalized) return { error: 'Ese código no tiene el formato correcto.' }

  // join_club() comprueba el código e inserta al usuario como member
  // (nunca otro rol, nunca a otro usuario).
  const { data, error } = await supabase.rpc('join_club', { p_code: normalized })
  if (error) {
    console.error('[clubes] join', error)
    return { error: GENERIC_ERROR }
  }

  const row = (data as { club_id: number; club_name: string; already_member: boolean }[] | null)?.[0]
  if (!row) return { error: 'Código incorrecto o club inexistente.' }

  revalidateClub(row.club_id)
  return { error: null, clubId: row.club_id, clubName: row.club_name, alreadyMember: row.already_member }
}

// ─── Roles (solo owner) ───────────────────────────────────────

async function changeRole(
  clubId: number,
  targetProfileId: string,
  from: 'member' | 'admin',
  to: 'member' | 'admin',
): Promise<ActionResult> {
  if (!isValidId(clubId) || !isUuid(targetProfileId)) return { error: 'Petición no válida.' }

  const { supabase, user } = await getSessionUser()
  if (!user) return { error: SESSION_EXPIRED }

  const myRole = await getRole(supabase, clubId, user.id)
  if (myRole !== 'owner') return { error: 'Solo el owner del club puede cambiar roles.' }
  if (targetProfileId === user.id) {
    return { error: 'No puedes cambiar tu propio rol: el club se quedaría sin owner.' }
  }

  const targetRole = await getRole(supabase, clubId, targetProfileId)
  if (!targetRole) return { error: 'Ese usuario no es miembro del club.' }
  if (targetRole !== from) {
    return { error: to === 'admin' ? 'Ese miembro ya es admin.' : 'Ese miembro no es admin.' }
  }

  const { data, error } = await supabase
    .from('club_members')
    .update({ role: to })
    .eq('club_id', clubId)
    .eq('profile_id', targetProfileId)
    .eq('role', from)
    .select('profile_id')
  if (error || !data?.length) {
    if (error) console.error('[clubes] change role', error)
    return { error: GENERIC_ERROR }
  }

  revalidateClub(clubId)
  return { error: null }
}

export async function promoteMemberAction(clubId: number, targetProfileId: string): Promise<ActionResult> {
  return changeRole(clubId, targetProfileId, 'member', 'admin')
}

export async function demoteMemberAction(clubId: number, targetProfileId: string): Promise<ActionResult> {
  return changeRole(clubId, targetProfileId, 'admin', 'member')
}

// ─── Abrir pool para una edición (owner/admin) ────────────────

export async function openPoolForEditionAction(
  clubId: number,
  editionId: number,
): Promise<ActionResult<{ poolId: number }>> {
  if (!isValidId(clubId) || !isValidId(editionId)) return { error: 'Petición no válida.' }

  const { supabase, user } = await getSessionUser()
  if (!user) return { error: SESSION_EXPIRED }

  const myRole = await getRole(supabase, clubId, user.id)
  if (myRole !== 'owner' && myRole !== 'admin') {
    return { error: 'Solo el owner o un admin del club pueden abrir pools.' }
  }

  let edition
  try {
    edition = (await getActiveEditions(supabase)).find(e => e.id === editionId)
  } catch {
    return { error: GENERIC_ERROR }
  }
  if (!edition) return { error: 'Esa edición no está en curso.' }

  const [{ data: club }, { data: existing }] = await Promise.all([
    supabase.from('clubs').select('name').eq('id', clubId).maybeSingle(),
    supabase.from('pools').select('id').eq('club_id', clubId).eq('edition_id', editionId).maybeSingle(),
  ])
  if (!club) return { error: 'Club no encontrado.' }
  if (existing) return { error: 'El club ya tiene un pool para esa edición.' }

  // pools.name es UNIQUE en toda la tabla (herencia de /ligas). Si el nombre
  // natural ya existe, se desambigua con el id del club.
  const baseName = `${club.name} · ${edition.fullName}`
  let poolId: number | null = null
  for (const name of [baseName, `${baseName} (#${clubId})`]) {
    const { data, error } = await supabase
      .from('pools')
      .insert({ name, club_id: clubId, edition_id: editionId, created_by: user.id })
      .select('id')
      .single()
    if (!error) { poolId = data.id as number; break }
    if (error.code === '23505' && error.message.includes('pools_club_edition_key')) {
      return { error: 'El club ya tiene un pool para esa edición.' }
    }
    if (error.code !== '23505') {
      console.error('[clubes] open pool', error)
      return { error: GENERIC_ERROR }
    }
  }
  if (poolId === null) return { error: 'Ya existe un pool con ese nombre.' }

  // Quien abre el pool entra a jugarlo (como al crear una liga); puede salir.
  const { error: joinError } = await supabase
    .from('pool_members')
    .insert({ pool_id: poolId, profile_id: user.id })
  if (joinError) console.error('[clubes] open pool: auto-join', joinError)

  revalidateClub(clubId)
  revalidatePath('/')
  revalidatePath('/lol/clasificacion')
  return { error: null, poolId }
}

// ─── Unirse / salir de un pool ────────────────────────────────

async function getClubPool(supabase: SupabaseClient, poolId: number) {
  const { data, error } = await supabase
    .from('pools')
    .select('id, club_id')
    .eq('id', poolId)
    .maybeSingle()
  if (error) console.error('[clubes] load pool', error)
  return data as { id: number; club_id: number | null } | null
}

export async function joinPoolAction(poolId: number): Promise<ActionResult> {
  if (!isValidId(poolId)) return { error: 'Petición no válida.' }

  const { supabase, user } = await getSessionUser()
  if (!user) return { error: SESSION_EXPIRED }

  const pool = await getClubPool(supabase, poolId)
  if (!pool?.club_id) return { error: 'Pool no encontrado.' }

  if (!(await getRole(supabase, pool.club_id, user.id))) {
    return { error: 'Solo los miembros del club pueden unirse a sus pools.' }
  }

  const { error } = await supabase
    .from('pool_members')
    .insert({ pool_id: poolId, profile_id: user.id })
  if (error && error.code !== '23505') {
    console.error('[clubes] join pool', error)
    return { error: GENERIC_ERROR }
  }

  revalidateClub(pool.club_id)
  revalidatePath('/')
  revalidatePath('/lol/clasificacion')
  return { error: null }
}

export async function leavePoolAction(poolId: number): Promise<ActionResult> {
  if (!isValidId(poolId)) return { error: 'Petición no válida.' }

  const { supabase, user } = await getSessionUser()
  if (!user) return { error: SESSION_EXPIRED }

  const pool = await getClubPool(supabase, poolId)
  if (!pool?.club_id) return { error: 'Pool no encontrado.' }

  // Solo sales del pool; sigues en el club.
  const { data, error } = await supabase
    .from('pool_members')
    .delete()
    .eq('pool_id', poolId)
    .eq('profile_id', user.id)
    .select('pool_id')
  if (error) {
    console.error('[clubes] leave pool', error)
    return { error: GENERIC_ERROR }
  }
  if (!data?.length) return { error: 'No estabas en ese pool.' }

  revalidateClub(pool.club_id)
  revalidatePath('/')
  revalidatePath('/lol/clasificacion')
  return { error: null }
}
