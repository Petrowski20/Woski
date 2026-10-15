'use server'

import { createClient } from '@/utils/supabase/server'
import { createAdminClient } from '@/utils/supabase/admin'
import { validateNewPassword, type PasswordError } from '@/utils/auth/password'

export type ChangePasswordError = PasswordError | 'igualActual' | 'debil' | 'sesion' | 'error' | 'flagError'

/**
 * Cambia la contraseña con la sesión del propio usuario y, si venía de
 * un reinicio del admin, quita app_metadata.must_change_password con la
 * clave de servicio (el usuario no puede tocar app_metadata).
 * Supabase Auth cierra el resto de sesiones del usuario al cambiarla.
 */
export async function changePasswordAction(
  password: string,
  confirm: string,
): Promise<{ success: true } | { error: ChangePasswordError }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'sesion' }

  const invalid = validateNewPassword(password, confirm, user.email)
  if (invalid) return { error: invalid }

  const { error } = await supabase.auth.updateUser({ password })
  if (error) {
    if (error.code === 'same_password') return { error: 'igualActual' }
    if (error.code === 'weak_password') return { error: 'debil' }
    if (error.code === 'reauthentication_needed' || error.status === 401) return { error: 'sesion' }
    return { error: 'error' }
  }

  if (user.app_metadata?.must_change_password === true) {
    const { error: flagError } = await createAdminClient().auth.admin.updateUserById(user.id, {
      app_metadata: { must_change_password: false },
    })
    if (flagError) return { error: 'flagError' }
  }

  return { success: true }
}
