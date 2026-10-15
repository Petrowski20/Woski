'use server'

import { createClient } from '@/utils/supabase/server'
import { createAdminClient } from '@/utils/supabase/admin'
import { generateTempPassword } from '@/utils/auth/tempPassword'
import { revalidatePath } from 'next/cache'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export type ResetPasswordResult = { password: string } | { error: string }

/**
 * Reinicia la contraseña de un usuario a una temporal aleatoria y le
 * obliga a cambiarla al entrar (app_metadata.must_change_password).
 *
 * La contraseña solo viaja en la respuesta al admin: no se guarda, no
 * se registra y no va a lol_admin_audit. Al cambiar la contraseña con
 * la API de administración, Supabase Auth cierra todas las sesiones
 * del usuario (revoca sus refresh tokens).
 */
export async function resetUserPasswordAction(targetId: string): Promise<ResetPasswordResult> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'No autenticado' }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()
  if (profile?.role !== 'ADMIN') return { error: 'Acceso denegado' }

  if (!UUID.test(targetId)) return { error: 'Usuario no válido' }
  if (targetId === user.id) {
    return { error: 'No puedes reiniciar tu propia contraseña desde el panel. Cámbiala en tu perfil.' }
  }

  // Registro y límite de intentos (también rechaza reiniciarse a sí mismo).
  const { data: auditId, error: auditError } = await supabase.rpc('admin_user_action_begin', {
    p_target: targetId,
    p_action: 'user_password_reset',
  })
  if (auditError) return { error: auditError.message }

  const password = generateTempPassword()
  const { error } = await createAdminClient().auth.admin.updateUserById(targetId, {
    password,
    // app_metadata: el usuario no puede tocarlo con su sesión. Se fusiona
    // con lo que ya hay (provider, etc.).
    app_metadata: { must_change_password: true },
  })

  await supabase.rpc('admin_user_action_end', {
    p_audit_id: auditId,
    p_ok: !error,
    p_error: error?.message ?? null,
  })

  if (error) return { error: `No se pudo reiniciar: ${error.message}` }

  revalidatePath('/admin/usuarios')
  return { password }
}
