'use server'

import { createHash } from 'node:crypto'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/utils/supabase/server'
import { checkTeamLogo, teamLogoObjectName, TEAM_LOGO_BUCKET, TEAM_LOGO_MAX_BYTES } from '@/utils/lol/teamLogo'
import type { TeamActionResult } from '@/components/lol/adminTeamsTypes'

// Equipos de LoL en /admin (pestaña Equipos): alta, datos y logo. Igual que actions.ts:
// 1. comprueba en el servidor que la sesión es ADMIN, y
// 2. escribe con la sesión del admin: Storage aplica las políticas de
//    team-logos (solo ADMIN) y las funciones admin_* vuelven a comprobar el
//    rol, validan y dejan registro en lol_admin_audit.
// El archivo se valida aquí por su firma real (no por extensión ni
// content-type) y se guarda con el hash de su contenido como nombre.

async function _requireAdmin(): Promise<TeamActionResult | null> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'AUTH' }
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'ADMIN') return { error: 'FORBIDDEN' }
  return null
}

function _revalidate() {
  revalidatePath('/')
  revalidatePath('/admin')
  revalidatePath('/perfil')
}

function _rpcError(context: string, error: { code?: string; message: string }): TeamActionResult {
  if (error.code === '23505') return { error: 'DUPLICATE_TAG', detail: error.message }
  if (error.code === '22023') return { error: 'INVALID', detail: error.message }
  if (error.code === '42501') return { error: 'FORBIDDEN' }
  console.error(`[admin equipos] ${context}`, error)
  return { error: 'SERVER' }
}

type Supabase = Awaited<ReturnType<typeof createClient>>

/** Borra del bucket el logo anterior si ningún equipo lo usa ya. Un fallo aquí no deshace el cambio. */
async function _dropPrevious(supabase: Supabase, rows: unknown, keep: string | null) {
  const row = (Array.isArray(rows) ? rows[0] : rows) as { previous_object: string | null; previous_in_use: boolean } | undefined
  if (!row?.previous_object || row.previous_in_use || row.previous_object === keep) return
  const { error } = await supabase.storage.from(TEAM_LOGO_BUCKET).remove([row.previous_object])
  if (error) console.error('[admin equipos] borrar logo anterior', row.previous_object, error)
}

export interface UpdateTeamInput {
  teamId: number
  name: string
  tag: string
  /** '#rrggbb' o '' para quitarlo. */
  color: string
}

/** Nombre, siglas y color. La BD valida y registra. */
export async function updateLolTeamAction(input: UpdateTeamInput): Promise<TeamActionResult> {
  const denied = await _requireAdmin()
  if (denied) return denied

  const supabase = await createClient()
  const { error } = await supabase.rpc('admin_update_lol_team', {
    p_team_id: input.teamId,
    p_name: input.name,
    p_tag: input.tag,
    p_color: input.color || null,
  })
  if (error) return _rpcError('admin_update_lol_team', error)
  _revalidate()
  return { success: true }
}

export interface CreateTeamInput {
  name: string
  tag: string
  region: string
  /** Código de 2 letras o '' sin país. */
  country: string
  /** '#rrggbb' o '' sin color. */
  color: string
}

/** Alta de un equipo de LoL. La BD valida, genera el slug y registra. El logo se sube después con uploadLolTeamLogoAction. */
export async function createLolTeamAction(input: CreateTeamInput): Promise<TeamActionResult & { teamId?: number }> {
  const denied = await _requireAdmin()
  if (denied) return denied

  const supabase = await createClient()
  const { data, error } = await supabase.rpc('admin_create_lol_team', {
    p_name: input.name,
    p_tag: input.tag,
    p_region: input.region,
    p_country: input.country || null,
    p_color: input.color || null,
  })
  if (error) return _rpcError('admin_create_lol_team', error)
  _revalidate()
  return { success: true, teamId: Number(data) }
}

/** Alta en lote: todos o ninguno (admin_create_lol_teams). */
export async function createLolTeamsAction(rows: { name: string; tag: string }[], region: string): Promise<TeamActionResult & { created?: number }> {
  const denied = await _requireAdmin()
  if (denied) return denied
  if (!Array.isArray(rows) || rows.length === 0 || rows.length > 100) return { error: 'INVALID' }

  const supabase = await createClient()
  const { data, error } = await supabase.rpc('admin_create_lol_teams', {
    p_teams: rows.map(r => ({ name: String(r.name), tag: String(r.tag), region })),
  })
  if (error) return _rpcError('admin_create_lol_teams', error)
  _revalidate()
  return { success: true, created: Array.isArray(data) ? data.length : rows.length }
}

export interface SetSeedInput {
  editionId: number
  teamId: number
  /** Sigla de la liga ("LCK") o '' para quitar el seed. */
  league: string
  seed: number | null
}

/** Seed del equipo en una edición ("LCK #1"). La BD valida y registra. */
export async function setLolTeamSeedAction(input: SetSeedInput): Promise<TeamActionResult> {
  const denied = await _requireAdmin()
  if (denied) return denied

  const supabase = await createClient()
  const { error } = await supabase.rpc('admin_set_lol_team_seed', {
    p_edition_id: input.editionId,
    p_team_id: input.teamId,
    p_league: input.league || null,
    p_seed: input.league ? input.seed : null,
  })
  if (error) return _rpcError('admin_set_lol_team_seed', error)
  _revalidate()
  return { success: true }
}

/**
 * Sube un logo (FormData: teamId, file) y lo asigna al equipo. Comprueba
 * tamaño, firma PNG/WebP y dimensiones; el nombre es el sha256 del
 * contenido, así que el mismo archivo nunca se duplica ni se sobrescribe.
 */
export async function uploadLolTeamLogoAction(formData: FormData): Promise<TeamActionResult & { logoUrl?: string }> {
  const denied = await _requireAdmin()
  if (denied) return denied

  const teamId = Number(formData.get('teamId'))
  const file = formData.get('file')
  if (!Number.isInteger(teamId) || teamId <= 0 || !(file instanceof File)) return { error: 'INVALID' }
  if (file.size === 0) return { error: 'EMPTY' }
  if (file.size > TEAM_LOGO_MAX_BYTES) return { error: 'TOO_BIG' }

  const bytes = new Uint8Array(await file.arrayBuffer())
  const check = checkTeamLogo(bytes)
  if (!check.ok) return { error: check.code, width: check.width, height: check.height }

  const name = teamLogoObjectName(createHash('sha256').update(bytes).digest('hex'), check.format)
  const supabase = await createClient()
  const bucket = supabase.storage.from(TEAM_LOGO_BUCKET)

  const { error: upError } = await bucket.upload(name, bytes, {
    contentType: check.contentType,
    cacheControl: '31536000',
    upsert: false,
  })
  // Ya existe: es el mismo contenido (mismo hash), se reutiliza.
  const duplicate = upError && /exists|duplicate/i.test(upError.message)
  if (upError && !duplicate) {
    console.error('[admin equipos] subir logo', upError)
    return { error: 'UPLOAD' }
  }

  const logoUrl = bucket.getPublicUrl(name).data.publicUrl
  const { data, error } = await supabase.rpc('admin_set_lol_team_logo', { p_team_id: teamId, p_logo_url: logoUrl })
  if (error) {
    // Recién subido y sin usar: no dejarlo huérfano.
    if (!duplicate) await bucket.remove([name])
    return _rpcError('admin_set_lol_team_logo', error)
  }
  await _dropPrevious(supabase, data, name)
  _revalidate()
  return { success: true, logoUrl }
}

/** Quita el logo del equipo (vuelve a las siglas) y borra el archivo si nadie más lo usa. */
export async function removeLolTeamLogoAction(teamId: number): Promise<TeamActionResult> {
  const denied = await _requireAdmin()
  if (denied) return denied

  const supabase = await createClient()
  const { data, error } = await supabase.rpc('admin_set_lol_team_logo', { p_team_id: teamId, p_logo_url: null })
  if (error) return _rpcError('admin_set_lol_team_logo', error)
  await _dropPrevious(supabase, data, null)
  _revalidate()
  return { success: true }
}
