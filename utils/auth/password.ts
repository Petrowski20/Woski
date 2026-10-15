export const MIN_PASSWORD_LENGTH = 8

export type PasswordError = 'min8' | 'noCoinciden' | 'igualCorreo'

/**
 * Reglas propias de la app para la contraseña nueva. Que sea distinta de
 * la actual lo comprueba Supabase Auth (error same_password).
 */
export function validateNewPassword(
  password: string,
  confirm: string,
  email: string | null | undefined,
): PasswordError | null {
  if (password.length < MIN_PASSWORD_LENGTH) return 'min8'
  if (password !== confirm) return 'noCoinciden'
  if (email && password.trim().toLowerCase() === email.trim().toLowerCase()) return 'igualCorreo'
  return null
}
