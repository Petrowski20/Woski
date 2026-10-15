'use server'

import { createHash } from 'node:crypto'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/utils/supabase/server'
import { teamLogoObjectName, TEAM_LOGO_BUCKET, TEAM_LOGO_MAX_BYTES } from '@/utils/lol/teamLogo'
import { processTeamLogo, type ProcessedTeamLogo } from '@/utils/lol/teamLogoProcess'
import type { TeamActionError, TeamActionResult, TeamLogoPreviewResult } from '@/components/lol/adminTeamsTypes'

// Equipos de LoL en /admin (pestaña Equipos). Igual que actions.ts:
// 1. comprueba en el servidor que la sesión es ADMIN, y
// 2. escribe con la sesión del admin: Storage aplica las políticas de
//    team-logos (solo ADMIN) y las funciones admin_* vuelven a comprobar el
//    rol, validan y dejan registro en lol_admin_audit.
// El archivo se valida aquí por su firma real (no por extensión ni
// content-type) y se procesa (utils/lol/teamLogoProcess): lo que se guarda
// es el PNG resultante, con el hash de ESE contenido como nombre.

async function _requireAdmin(): Promise<TeamActionError | null> {
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

/** Lee el archivo del FormData y lo procesa. Comprueba el tamaño antes de leerlo entero. */
async function _processUpload(file: FormDataEntryValue | null): Promise<Extract<ProcessedTeamLogo, { ok: true }> | TeamActionError> {
  if (!(file instanceof File)) return { error: 'INVALID' }
  if (file.size === 0) return { error: 'EMPTY' }
  if (file.size > TEAM_LOGO_MAX_BYTES) return { error: 'TOO_BIG' }
  try {
    const res = await processTeamLogo(new Uint8Array(await file.arrayBuffer()))
    if (!res.ok) return { error: res.code, width: res.width, height: res.height }
    return res
  } catch (e) {
    console.error('[admin equipos] procesar logo', e)
    return { error: 'SERVER' }
  }
}

/**
 * Vista previa (FormData: file): el mismo procesado que al guardar, sin
 * subir nada. Devuelve el PNG resultante como data URL. Solo ADMIN.
 */
export async function previewLolTeamLogoAction(formData: FormData): Promise<TeamLogoPreviewResult> {
  const denied = await _requireAdmin()
  if (denied) return denied

  const res = await _processUpload(formData.get('file'))
  if (!('ok' in res)) return res
  return {
    success: true,
    dataUrl: `data:image/png;base64,${Buffer.from(res.bytes).toString('base64')}`,
    bytes: res.bytes.length,
    source: res.source,
    trimmed: res.trimmed,
  }
}

/**
 * Sube un logo (FormData: teamId, file) y lo asigna al equipo. Comprueba
 * tamaño y firma PNG/WebP, lo procesa (recorte, escala a 256×256 con
 * margen, PNG sin metadatos) y guarda el resultado; el nombre es el sha256
 * del PNG procesado, así que el mismo logo nunca se duplica ni se sobrescribe.
 */
export async function uploadLolTeamLogoAction(formData: FormData): Promise<TeamActionResult & { logoUrl?: string }> {
  const denied = await _requireAdmin()
  if (denied) return denied

  const teamId = Number(formData.get('teamId'))
  if (!Number.isInteger(teamId) || teamId <= 0) return { error: 'INVALID' }
  const processed = await _processUpload(formData.get('file'))
  if (!('ok' in processed)) return processed
  const { bytes } = processed

  const name = teamLogoObjectName(createHash('sha256').update(bytes).digest('hex'), processed.format)
  const supabase = await createClient()
  const bucket = supabase.storage.from(TEAM_LOGO_BUCKET)

  const { error: upError } = await bucket.upload(name, bytes, {
    contentType: processed.contentType,
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
